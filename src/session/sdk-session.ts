// Agent Host and Copilot CLI conversations (SDK `events.jsonl`) as the same parsed model the
// Markdown renderer already uses for Local chats.
//
// What is kept and what is deliberately left out was decided with the user (see the work log):
//   kept     prompts and attachments, injected context (collapsed), assistant text, readable reasoning,
//            one-line tool intent, tool calls with inputs/outputs/errors/diffs, compaction summaries, model and
//            mode changes, plan changes, resume markers, aborts and errors, sub-agent/shell notifications,
//            system prompts and skill files (as linked companion files), images (companion files)
//   left out permission prompts, hook records, request/response snapshots, external-tool duplicates,
//            cache/usage-checkpoint plumbing. They are counted and reported, never silent.
// An event type that is in neither list is reported as schema drift, like an unhandled Local kind.
//
// Sub-agent conversations are separate scopes inside the same file; this module builds one scope.

import { createHash } from 'node:crypto';
import type { CompanionArtifact } from '../export-policy.ts';
import { collectRecordedImages, saveImageCompanion } from '../images.ts';
import type { Census, NoteNode, ParsedSession, ToolNode, Turn, TurnNode, TurnScalars } from '../types.ts';
import { childScopes, isRecord } from './sdk-events.ts';
import type { SdkEvent } from './sdk-events.ts';
import { fusionNote } from './sdk-fusion.ts';
import { eventNote, modelTelemetryNote } from './sdk-event-notes.ts';
import { parseUsageRecords } from './sdk-usage-record.ts';
import { isQuestionLikeTool, parseAskUser, parseGuessedQuestion, questionCensus, questionWarningDetails } from './questions.ts';
import type { SdkEventSource } from './sources.ts';

/** Event types left out of the export on purpose, with the group name shown in the omission line. */
export const SDK_LEFT_OUT: ReadonlyMap<string, string> = new Map([
  ['permission.requested', 'permission prompts'], ['permission.completed', 'permission prompts'],
  ['session.permissions_changed', 'permission prompts'],
  ['hook.start', 'hook records'], ['hook.end', 'hook records'],
  ['model.messages_snapshot', 'model request/response copies'], ['model.message', 'model request/response copies'],
  ['model.response', 'model request/response copies'], ['model.model_call_success', 'model request/response copies'],
  ['model.model_call_failure', 'model request/response copies'], ['model.captured_assignment_context', 'model request/response copies'],
  ['external_tool.requested', 'external-tool duplicates'], ['external_tool.completed', 'external-tool duplicates'],
  ['session.usage_checkpoint', 'usage and cache checkpoints (running totals; the last one is shown in the Cost section)'],
]);

/** Event types that only mark boundaries. They give turn timing and carry no content of their own. */
export const SDK_MARKERS: ReadonlySet<string> = new Set([
  'assistant.turn_start', 'assistant.turn_end', 'model.turn_started', 'model.turn_ended', 'model.model_call_started',
  'model.turn_failed', 'session.compaction_start', 'subagent.deselected', 'subagent.selected', 'subagent.configured',
  'subagent.started', 'subagent.completed',
]);

const HANDLED = new Set([
  'session.start', 'session.resume', 'session.shutdown', 'session.model_change', 'session.mode_changed', 'session.auto_mode_resolved',
  'session.compaction_complete', 'session.plan_changed', 'session.task_complete', 'session.error', 'session.info',
  'session.context_changed', 'session.workspace_file_changed', 'session.truncation', 'abort',
  'session.fusion_resolved', 'assistant.fusion_phase_completed', 'assistant.fusion_phase_failed', 'session.fusion_commit_started',
  'session.fusion_change_checkpoint', 'session.fusion_completed', 'session.fusion_handoff', 'session.usage_record',
  'user.message', 'assistant.message', 'tool.execution_start', 'tool.execution_complete',
  'system.message', 'system.notification', 'skill.invoked', 'skill.invoked_ref', 'skill.context_delivered_ref',
  'session.binary_asset', 'model.telemetry',
  'instruction.update', 'instruction.update_delivery', 'session.mode_notice_delivered', 'model.turn_retry',
]);

export interface SdkSessionOptions {
  title: string;
  /** Folder the Markdown will sit beside; companion links are built from it. */
  assetsDirectory: string;
  /** Required for an empty child selection, whose identity cannot be inferred from its events. */
  scope?: SdkEventSource['scope'];
}

export interface SdkSessionResult {
  session: ParsedSession;
  companions: CompanionArtifact[];
  /** Left-out groups and how many records each held. */
  leftOut: Map<string, number>;
  orphanChildren: OrphanChildConversation[];
  unresolvedChildScopes: number;
  copilotVersion: string;
  producer: string | null;
  /** Selected conversation and its verified descendants. A main selection covers the whole log. */
  events: readonly SdkEvent[];
}

export interface OrphanChildConversation {
  agentId: string;
  parentToolCallId: string;
  title: string;
  startedAt: number | null;
  turns: Turn[];
  prePromptNotes?: NoteNode[];
}

const text = (value: unknown): string => typeof value === 'string' ? value : '';
const millis = (stamp: string | undefined): number | null => {
  const value = stamp === undefined ? NaN : Date.parse(stamp);
  return Number.isFinite(value) ? value : null;
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 8);
const safeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 40) || 'item';

function jsonText (value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    return String(value);
  }
}

function withRecordedPayload (note: NoteNode, event: SdkEvent): NoteNode {
  const payload = jsonText(event.raw);
  return {
    ...note,
    text: [note.text, `Full recorded SDK payload:\n${payload}`].filter(Boolean).join('\n\n'),
    overflowRule: 'either',
  };
}

function toolNode (id: string, name: string): ToolNode {
  return {
    type: 'tool', toolId: name, toolCallId: id, invocation: '', pastTense: '', title: '', isComplete: false,
    toolSpecificData: null, command: '', promptText: '', inputText: '', inputLanguage: '', resultDetails: null,
    todos: null, output: '', exitCode: null, duration: null, resultText: '', fileUri: '', patchFiles: [],
  };
}

/** Arguments as readable `key: value` lines: strings appear as recorded, never as escaped JSON. */
export function argumentsText (value: unknown, indent = ''): string {
  if (typeof value === 'string')
    return value.includes('\n') ? `\n${value.split('\n').map((line) => `${indent}${line}`).join('\n')}` : ` ${value}`;
  if (Array.isArray(value))
    return value.map((item) => `\n${indent}- ${argumentsText(item, `${indent}  `).trimStart()}`).join('');
  if (isRecord(value))
    return Object.entries(value).map(([key, item]) => `\n${indent}${key}:${argumentsText(item, `${indent}  `)}`).join('');
  return ` ${String(value)}`;
}

function applyArguments (node: ToolNode, args: unknown, name: string): void {
  node.inputData = args;
  name === 'ask_user' && (node.question = parseAskUser(args, { isComplete: false, content: '', detailed: '' }));
  isQuestionLikeTool(name) && (node.question = parseGuessedQuestion(name, args, { isComplete: false, content: '', detailed: '' }));
  if (!isRecord(args)) {
    args !== undefined && args !== null && (node.inputText = argumentsText(args).trim());
    return;
  }
  const command = typeof args.command === 'string' && ['powershell', 'bash', 'shell', 'run_in_terminal'].includes(name) ? args.command : '';
  if (command) {
    node.command = command;
    const remaining = Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'command'));
    node.inputText = argumentsText(remaining).trim();
    node.inputLanguage = 'text';
    return;
  }
  if (name === 'task' && typeof args.prompt === 'string') {
    node.promptText = args.prompt;
    node.toolSpecificData = {
      kind: 'subagent', agent: args.agent_type, name: args.name, description: args.description, mode: args.mode,
    };
    node.invocation ||= text(args.description) || text(args.name);
    return;
  }
  Object.keys(args).length && (node.inputText = argumentsText(args).trim());
  node.inputLanguage = 'text';
}

interface SubagentMeta {
  agentId: string;
  name: string;
  displayName: string;
  description: string;
  agentType: string;
  model: string;
  durationMs: number | null;
  totalToolCalls: number | null;
  totalTokens: number | null;
  cancelled: boolean;
}

/** State shared by the main conversation and every delegated agent's conversation. */
interface Shared {
  options: SdkSessionOptions;
  all: readonly SdkEvent[];
  usageDiagnostics: Map<SdkEvent, string[]>;
  usageDiagnosticExamples: Set<string>;
  processedEvents: Set<SdkEvent>;
  meta: ReadonlyMap<string, SubagentMeta>;
  attached: Set<string>;
  seen: Map<string, number>;
  dropped: Map<string, number>;
  unhandled: Map<string, number>;
  leftOut: Map<string, number>;
  companions: CompanionArtifact[];
  systemFiles: Map<string, { version: number; name: string }>;
  copilotVersion: string;
  producer: string | null;
  creationDate: number | null;
  workingDirectory: string;
}

const MAX_NESTING = 8;
const firstString = (...values: unknown[]): string => values.map((value) => text(value)).find(Boolean) ?? '';

/** Metadata for children whose tool-call/agent mapping has been verified. */
function subagentMeta (events: readonly SdkEvent[], verifiedAgentIds: ReadonlyMap<string, string>): Map<string, SubagentMeta> {
  const result = new Map<string, SubagentMeta>();
  for (const event of events) {
    if (event.type !== 'subagent.started' && event.type !== 'subagent.completed')
      continue;
    const id = text(event.data.toolCallId);
    const agentId = verifiedAgentIds.get(id);
    if (!id || !agentId)
      continue;
    const entry = result.get(id) ?? {
      agentId, name: '', displayName: '', description: '', agentType: '', model: '',
      durationMs: null, totalToolCalls: null, totalTokens: null, cancelled: false,
    };
    const data = event.data;
    entry.name = text(data.agentName) || entry.name;
    entry.displayName = text(data.agentDisplayName) || entry.displayName;
    entry.description = text(data.agentDescription) || entry.description;
    entry.agentType = text(data.agentType) || entry.agentType;
    entry.model = text(data.model) || entry.model;
    typeof data.durationMs === 'number' && (entry.durationMs = data.durationMs);
    typeof data.totalToolCalls === 'number' && (entry.totalToolCalls = data.totalToolCalls);
    typeof data.totalTokens === 'number' && (entry.totalTokens = data.totalTokens);
    data.cancelled === true && (entry.cancelled = true);
    result.set(id, entry);
  }
  return result;
}

/** Build one conversation scope. A delegated agent is built the same way, with its task as the opening prompt. */
function processScope (ctx: Shared, events: readonly SdkEvent[], implicit: { prompt: string; ts: number | null } | null, depth: number): { turns: Turn[]; prePromptNotes?: NoteNode[] } {
  const { seen, dropped, unhandled, leftOut, options, companions } = ctx;
  const turns: Turn[] = [];
  let current: Turn | null = null;
  const prePromptNotes: NoteNode[] = [];
  let lastSystemHash = '';
  const startedAt = new Map<string, number>();
  const nodesById = new Map<string, ToolNode>();
  const turnEnds = new Map<Turn, number>();
  const kinds = new Map<Turn, { thinking: number; summary: number }>();
  let nextModelCallDurationMs: number | null = null;
  let completionOrder = 0;

  const companion = (name: string, mediaType: string, bytes: Uint8Array, kind: CompanionArtifact['kind'], event: SdkEvent): string => {
    const relativePath = `${options.assetsDirectory}/${name}`;
    if (!companions.some((item) => item.relativePath === relativePath)) {
      companions.push({
        id: `sdk-${name}`, kind, relativePath, mediaType, bytes,
        location: { sourceId: 'sdk-events', recordId: event.id ?? `line:${event.line}`, field: name },
      });
    }
    return relativePath;
  };
  const unsupported = (event: SdkEvent, reason: string, payloadShown = false) => {
    const key = `${event.type}:unsupported`;
    unhandled.set(key, (unhandled.get(key) ?? 0) + 1);
    note({ type: 'note', title: `⚠️ ${event.type} has an unsupported payload.`, text: reason });
    !payloadShown && note(withRecordedPayload({ type: 'note', title: `📄 Recorded payload: ${event.type}` }, event));
  };
  const note = (node: NoteNode) => (current ? current.body.push(node) : prePromptNotes.push(node));
  if (implicit) {
    current = {
      requestId: 'delegated-task', ts: implicit.ts, prompt: implicit.prompt, reasoning: [], prose: [], body: [],
      toolNodes: [], todos: [], filesTouched: [], scalar: { timestamp: implicit.ts ?? undefined, agentTurn: true }, number: 1,
    };
    turns.push(current);
  }

  for (const event of events) {
    const type = event.type;
    const data = event.data;
    ctx.processedEvents.add(event);
    seen.set(type, (seen.get(type) ?? 0) + 1);
    const group = SDK_LEFT_OUT.get(type);
    if (group) {
      leftOut.set(group, (leftOut.get(group) ?? 0) + 1);
      dropped.set(type, (dropped.get(type) ?? 0) + 1);
      continue;
    }
    if (SDK_MARKERS.has(type)) {
      const when = millis(event.timestamp);
      if (current && when !== null && (type === 'assistant.turn_end' || type === 'model.turn_ended'))
        turnEnds.set(current, Math.max(turnEnds.get(current) ?? 0, when));
      continue;
    }
    if (!HANDLED.has(type)) {
      unhandled.set(type, (unhandled.get(type) ?? 0) + 1);
      note(withRecordedPayload({ type: 'note', title: `⚠️ Unreviewed SDK event: ${type}` }, event));
      continue;
    }
    switch (type) {
      case 'session.start': {
        ctx.copilotVersion = text(data.copilotVersion) || ctx.copilotVersion;
        ctx.producer = text(data.producer) || null;
        const started = typeof data.startTime === 'number' ? data.startTime : millis(text(data.startTime) || event.timestamp);
        ctx.creationDate = started;
        ctx.workingDirectory = isRecord(data.context) ? text(data.context.cwd) : '';
        break;
      }
      case 'user.message': {
        // A delegated agent's own first message is its task; it replaces the placeholder made from the call.
        if (turns.length === 1 && turns[0]!.requestId === 'delegated-task' && !turns[0]!.body.length)
          turns.pop();
        const stamp = millis(event.timestamp);
        const typed = text(data.content);
        const sent = text(data.transformedContent);
        const scalar: TurnScalars = { timestamp: stamp ?? undefined, agentTurn: true };
        text(data.agentMode) && (scalar.modeInfo = { modeId: text(data.agentMode) });
        isRecord(data.responsesReasoning) && text(data.responsesReasoning.model) && (scalar.modelId = text(data.responsesReasoning.model));
        sent && sent.trim() !== typed.trim() && (scalar.injectedContext = sent);
        const attachments = (Array.isArray(data.attachments) ? data.attachments : []).filter(isRecord).map((item) => ({
          type: text(item.type) || 'attachment',
          name: text(item.displayName) || text(item.path) || text(item.filePath) || 'attachment',
          ...(text(item.mimeType) ? { mimeType: text(item.mimeType) } : {}),
        }));
        attachments.length && (scalar.attachments = attachments);
        current = {
          requestId: text(data.messageId) || event.id || `line:${event.line}`, ts: stamp, prompt: typed,
          reasoning: [], prose: [], body: [], toolNodes: [], todos: [], filesTouched: [], scalar, number: turns.length + 1,
        };
        turns.push(current);
        break;
      }
      case 'assistant.message': {
        if (!current)
          break;
        const reasoning = text(data.reasoningText).trim();
        const blocks = isRecord(data.reasoningBlocks) && Array.isArray(data.reasoningBlocks.blocks) ? data.reasoningBlocks.blocks.filter(isRecord) : [];
        const summaryTexts = blocks.flatMap((block) => Array.isArray(block.summary)
          ? block.summary.filter(isRecord).map((item) => text(item.text).trim()).filter(Boolean) : []);
        const thinkingTexts = blocks.map((block) => text(block.thinking).trim()).filter(Boolean);
        const structuredTexts = thinkingTexts.length ? thinkingTexts : summaryTexts;
        const normalized = (value: string) => value.replace(/\s+/gu, ' ').trim();
        const structuredMatch = structuredTexts.length > 0
          && normalized(structuredTexts.join('\n\n')) === normalized(reasoning);
        const readable = structuredMatch ? structuredTexts : reasoning ? [reasoning] : structuredTexts;
        if (readable.length) {
          const node: TurnNode = {
            type: 'think', text: readable[0]!,
            ...(/^\*\*[^*\n]+\*\*(?:\n|$)/u.exec(readable[0]!) ? { summaryTitle: /^\*\*([^*\n]+)\*\*/u.exec(readable[0]!)![1]! } : {}),
            ...(nextModelCallDurationMs !== null ? { modelCallDurationMs: nextModelCallDurationMs } : {}),
          };
          current.body.push(node);
          current.reasoning.push(readable[0]!);
          for (const item of readable.slice(1)) {
            const thought: TurnNode = {
              type: 'think', text: item,
              ...(/^\*\*[^*\n]+\*\*(?:\n|$)/u.exec(item) ? { summaryTitle: /^\*\*([^*\n]+)\*\*/u.exec(item)![1]! } : {}),
              ...(nextModelCallDurationMs !== null ? { modelCallDurationMs: nextModelCallDurationMs } : {}),
            };
            current.body.push(thought);
            current.reasoning.push(item);
          }
          const count = kinds.get(current) ?? { thinking: 0, summary: 0 };
          thinkingTexts.length ? (count.thinking += readable.length) : (count.summary += readable.length);
          kinds.set(current, count);
        } else if (text(data.reasoningOpaque) || text(data.encryptedContent) || blocks.length) {
          current.scalar.opaqueReasoningBlocks = (current.scalar.opaqueReasoningBlocks ?? 0) + 1;
        }
        const content = text(data.content);
        if (content.trim()) {
          const node: TurnNode = { type: 'text', text: content };
          current.body.push(node);
          current.prose.push(node);
        }
        text(data.model) && (current.scalar.modelId = text(data.model));
        typeof data.outputTokens === 'number' && (current.scalar.messageOutputTokens = (current.scalar.messageOutputTokens ?? 0) + data.outputTokens);
        const batchId = event.id || text(data.messageId) || `line:${event.line}`;
        for (const request of Array.isArray(data.toolRequests) ? data.toolRequests.filter(isRecord) : []) {
          const id = text(request.toolCallId);
          const name = text(request.name) || text(request.toolName) || 'tool';
          if (!id)
            continue;
          const node = nodesById.get(id) ?? toolNode(id, name);
          node.toolBatchId ??= batchId;
          node.invocation = text(request.intentionSummary) || text(request.toolTitle) || node.invocation;
          text(request.intentionSummary) && (node.intent = text(request.intentionSummary));
          node.title = text(request.toolTitle) || node.title;
          applyArguments(node, request.arguments, name);
          if (!nodesById.has(id)) {
            nodesById.set(id, node);
            current.body.push(node);
            current.toolNodes.push(node);
          }
        }
        const when = millis(event.timestamp);
        when !== null && (turnEnds.set(current, Math.max(turnEnds.get(current) ?? 0, when)));
        nextModelCallDurationMs = null;
        break;
      }
      case 'tool.execution_start': {
        const id = text(data.toolCallId);
        if (!id)
          break;
        const name = text(data.toolName) || 'tool';
        let node = nodesById.get(id);
        if (!node) {
          node = toolNode(id, name);
          node.invocation = text(data.toolTitle);
          node.title = text(data.toolTitle);
          applyArguments(node, data.arguments, name);
          nodesById.set(id, node);
          current?.body.push(node);
          current?.toolNodes.push(node);
        }
        const when = millis(event.timestamp);
        when !== null && startedAt.set(id, when);
        break;
      }
      case 'tool.execution_complete': {
        const id = text(data.toolCallId);
        const node = nodesById.get(id);
        if (!node)
          break;
        const result = isRecord(data.result) ? data.result : {};
        completionOrder += 1;
        node.completionOrder ??= completionOrder;
        const content = text(result.content);
        const detailed = text(result.detailedContent);
        node.isComplete = true;
        const when = millis(event.timestamp);
        const began = startedAt.get(id);
        when !== null && began !== undefined && (node.duration = Math.max(0, when - began));
        isRecord(data.shellExecution) && typeof data.shellExecution.exitCode === 'number' && (node.exitCode = data.shellExecution.exitCode);
        const failure = isRecord(data.error) ? text(data.error.message) : text(data.error);
        if (node.command)
          node.output = content;
        else
          node.resultText = content;
        detailed && detailed.trim() !== content.trim() && (node.detailText = detailed);
        if (data.success === false || failure) {
          const message = `${failure || 'The tool reported failure.'}${isRecord(data.error) && text(data.error.code) ? ` (code ${text(data.error.code)})` : ''}`;
          node.failed = true;
          node.resultText = node.resultText ? `${node.resultText}\n\n[tool error] ${message}` : `[tool error] ${message}`;
        }
        if (node.question) {
          const completed = {
            isComplete: true, content, detailed, raw: { success: data.success, result: data.result, error: data.error },
            ...(typeof data.success === 'boolean' ? { success: data.success } : {}), ...(failure ? { error: failure } : {}),
          };
          node.question = node.question.source === 'guessed'
            ? parseGuessedQuestion(node.toolId, node.question.raw.question, completed)
            : parseAskUser(node.question.raw.question, completed);
        }
        break;
      }
      case 'session.model_change':
        note({ type: 'note', title: `🔀 Model changed: ${text(data.previousModel) || '?'} → ${text(data.newModel) || '?'}${text(data.reasoningEffort) ? ` (effort ${text(data.reasoningEffort)})` : ''}` });
        break;
      case 'session.auto_mode_resolved':
        note({ type: 'note', title: `✨ Auto chose ${text(data.chosenModel) || 'a model'}${text(data.routingMethod) ? ` (${text(data.routingMethod)})` : ''}${data.fallback === true ? ' - fallback' : ''}` });
        break;
      case 'session.mode_changed':
        note({ type: 'note', title: `🧭 Mode changed: ${text(data.previousMode) || '?'} → ${text(data.newMode) || '?'}` });
        break;
      case 'session.resume':
        note({ type: 'note', title: `▶️ Session resumed${text(data.resumeTime) ? ` at ${text(data.resumeTime)}` : ''}` });
        break;
      case 'session.plan_changed':
        note({ type: 'note', title: `🗺️ Plan ${text(data.operation) || 'changed'}` });
        break;
      case 'session.fusion_resolved':
      case 'assistant.fusion_phase_completed':
      case 'assistant.fusion_phase_failed':
      case 'session.fusion_commit_started':
      case 'session.fusion_change_checkpoint':
      case 'session.fusion_completed':
      case 'session.fusion_handoff': {
        const normalized = fusionNote(type, data);
        note(normalized.note);
        normalized.issues.length && unsupported(event, normalized.issues.join('\n'));
        break;
      }
      case 'instruction.update':
      case 'instruction.update_delivery':
      case 'session.mode_notice_delivered':
      case 'model.turn_retry': {
        const normalized = eventNote(type, data);
        const recorded = type === 'instruction.update_delivery' ? withRecordedPayload(normalized.note, event) : normalized.note;
        note(recorded);
        normalized.issues.length && unsupported(event, normalized.issues.join('\n'), type === 'instruction.update_delivery');
        break;
      }
      case 'model.telemetry': {
        const normalized = modelTelemetryNote(data);
        note(withRecordedPayload(normalized.note, event));
        normalized.issues.length && unsupported(event, normalized.issues.join('\n'), true);
        break;
      }
      case 'session.usage_record': {
        if (isRecord(data.usage) && typeof data.usage.duration === 'number' && Number.isFinite(data.usage.duration) && data.usage.duration >= 0)
          nextModelCallDurationMs = data.usage.duration;
        const issues = ctx.usageDiagnostics.get(event);
        if (issues?.length) {
          const signature = issues.join('; ');
          if (!ctx.usageDiagnosticExamples.has(signature)) {
            ctx.usageDiagnosticExamples.add(signature);
            note(withRecordedPayload({
              type: 'note',
              title: '⚠️ Unsupported session.usage_record example',
              text: issues.join('\n'),
            }, event));
          }
        }
        break;
      }
      case 'session.task_complete':
        note({ type: 'note', title: `✅ Task complete${data.success === false ? ' (reported unsuccessful)' : ''}`, ...(text(data.summary) ? { text: text(data.summary) } : {}) });
        break;
      case 'session.compaction_complete': {
        const before = typeof data.preCompactionTokens === 'number' ? data.preCompactionTokens : null;
        const after = typeof data.postCompactionTokens === 'number' ? data.postCompactionTokens : null;
        note({
          type: 'note',
          title: `📚 Context compacted${typeof data.checkpointNumber === 'number' ? ` (checkpoint ${data.checkpointNumber})` : ''}${before !== null && after !== null ? `: ${before.toLocaleString('en-US')} → ${after.toLocaleString('en-US')} tokens` : ''}${data.success === false ? ' - failed' : ''}`,
          ...(text(data.summaryContent) ? { text: text(data.summaryContent) } : {}),
        });
        break;
      }
      case 'session.error':
        note({ type: 'note', title: `🚨 Session error${text(data.errorType) ? ` (${text(data.errorType)})` : ''}`, ...(text(data.message) ? { text: text(data.message) } : {}) });
        break;
      case 'abort':
        note({ type: 'note', title: `🚫 Aborted${text(data.reason) ? `: ${text(data.reason)}` : ''}` });
        break;
      case 'session.info':
        note({ type: 'note', title: `ℹ️ ${text(data.infoType) || 'info'}${text(data.message) ? `: ${text(data.message)}` : ''}` });
        break;
      case 'session.context_changed':
      case 'session.workspace_file_changed':
      case 'session.truncation':
      case 'session.shutdown':
        note({ type: 'note', title: `ℹ️ ${type.replace('session.', '').replaceAll('_', ' ')}`, text: jsonText(data) });
        break;
      case 'system.notification': {
        const detail = isRecord(data.content) ? data.content : {};
        const label = text(detail.displayName) || text(detail.description) || text(detail.type);
        note({ type: 'note', title: `🔔 ${text(detail.type) || 'notification'}${label ? `: ${label}` : ''}${typeof detail.exitCode === 'number' ? ` (exit ${detail.exitCode})` : ''}` });
        break;
      }
      case 'system.message': {
        const body = typeof data.content === 'string' ? data.content : jsonText(data.content);
        const hash = digest(body);
        if (hash === lastSystemHash)
          break;
        lastSystemHash = hash;
        let version = ctx.systemFiles.get(hash);
        if (!version) {
          const next = ctx.systemFiles.size + 1;
          version = { version: next, name: `system-prompt-${next}-${hash}.md` };
          ctx.systemFiles.set(hash, version);
        }
        const href = companion(version.name, 'text/markdown', new TextEncoder().encode(body), 'metadata', event);
        note({ type: 'note', title: `🧭 System prompt version ${version.version} in effect (${Math.round(body.length / 1024).toLocaleString('en-US')} KB)`, link: { label: version.name, href } });
        break;
      }
      case 'skill.invoked':
      case 'skill.invoked_ref':
      case 'skill.context_delivered_ref': {
        const name = text(data.name) || 'skill';
        const body = text(data.content);
        let link: NoteNode['link'];
        if (body) {
          const file = `skill-${safeName(name)}-${digest(body)}.md`;
          link = { label: file, href: companion(file, 'text/markdown', new TextEncoder().encode(body), 'metadata', event) };
        }
        note({ type: 'note', title: `🧩 Skill used: ${name}${text(data.trigger) ? ` (${text(data.trigger)})` : ''}`, ...(link ? { link } : {}) });
        break;
      }
      case 'session.binary_asset': {
        const mime = text(data.mimeType);
        const encoded = text(data.data);
        if ((!mime.startsWith('image/') && data.type !== 'image') || !encoded) {
          note({ type: 'note', title: `📎 Attachment not exported: ${text(data.type) || 'binary'} ${mime} (${(typeof data.byteLength === 'number' ? data.byteLength : 0).toLocaleString('en-US')} bytes)` });
          break;
        }
        const image = collectRecordedImages(data, { sourceId: 'sdk-events', recordId: event.id, field: 'session.binary_asset' })[0];
        if (!image?.bytes) {
          note({ type: 'note', title: 'Image unresolved: recorded bytes could not be decoded.' });
          break;
        }
        const saved = saveImageCompanion(image, { assetsDirectory: options.assetsDirectory, companions }, `image-${safeName(text(data.assetId) || digest(encoded))}`);
        const href = saved.href!;
        const label = `${saved.size.toLocaleString('en-US')} bytes; SHA-256 ${saved.sha256!.slice(0, 12)}`;
        note({ type: 'note', title: `🖼️ Image${text(data.description) ? `: ${text(data.description)}` : ''} (${label})${saved.representationChange ? ` - Representation change: ${saved.representationChange}` : ''}`, image: { href, alt: text(data.description) || 'Recorded image' } });
        break;
      }
      default:
        break;
    }
  }

  for (const [turn, count] of kinds)
    turn.scalar.reasoningKinds = count;
  for (const turn of turns) {
    const end = turnEnds.get(turn);
    if (end !== undefined && turn.ts !== null) {
      turn.scalar.responseTimestamp = end;
      turn.scalar.elapsedMs = Math.max(0, end - turn.ts);
    }
  }
  // Notes recorded before any prompt (resume, system prompt) are kept in front of the first turn.

  // A call that started a delegated agent carries that agent's whole conversation.
  const renderedTools = new Set(turns.flatMap((turn) => turn.toolNodes));
  for (const node of nodesById.values()) {
    const info = ctx.meta.get(node.toolCallId);
    if (!renderedTools.has(node) || !info?.agentId || ctx.attached.has(info.agentId) || depth >= MAX_NESTING)
      continue;
    ctx.attached.add(info.agentId);
    const scopeEvents = ctx.all.filter((event) => event.agentId === info.agentId);
    const task = node.promptText || (isRecord(node.toolSpecificData) ? text(node.toolSpecificData.description) : '');
    const begun = scopeEvents.find((event) => millis(event.timestamp) !== null);
    node.subagent = {
      ...info, ...processScope(ctx, scopeEvents, { prompt: task, ts: begun ? millis(begun.timestamp) : null }, depth + 1),
    };
  }
  return { turns, ...(prePromptNotes.length ? { prePromptNotes } : {}) };
}

/** The selected conversation, with verified descendants nested at their recorded calls. */
export function buildSdkSession (all: readonly SdkEvent[], scoped: readonly SdkEvent[], options: SdkSessionOptions): SdkSessionResult {
  const childScopeResult = childScopes(all);
  const verifiedAgentIds = new Map(childScopeResult.scopes.map((scope) => [scope.parentToolCallId, scope.agentId]));
  const firstAgentId = scoped[0]?.agentId;
  const rootAgentId = options.scope
    ? options.scope.kind === 'subagent' ? options.scope.agentId : undefined
    : firstAgentId && scoped.every((event) => event.agentId === firstAgentId) ? firstAgentId : undefined;
  const callOwners = new Map<string, Set<string | undefined>>();
  const recordCall = (value: unknown, owner: string | undefined) => {
    const id = text(value);
    if (!id)
      return;
    const owners = callOwners.get(id) ?? new Set<string | undefined>();
    owners.add(owner);
    callOwners.set(id, owners);
  };
  // Inspect recorded calls even in scopes we haven't processed or won't render at the depth limit.
  for (const event of all) {
    if (event.type === 'assistant.message') {
      for (const request of Array.isArray(event.data.toolRequests) ? event.data.toolRequests.filter(isRecord) : [])
        recordCall(request.toolCallId, event.agentId);
    } else if (event.type === 'tool.execution_start' || event.type === 'tool.execution_complete')
      recordCall(event.data.toolCallId, event.agentId);
  }
  const relevantAgents = new Set(rootAgentId ? [rootAgentId] : []);
  if (rootAgentId) {
    let previousSize = -1;
    while (previousSize !== relevantAgents.size) {
      previousSize = relevantAgents.size;
      for (const scope of childScopeResult.scopes) {
        const owners = callOwners.get(scope.parentToolCallId);
        if (owners && [...owners].some((owner) => owner !== undefined && relevantAgents.has(owner)))
          relevantAgents.add(scope.agentId);
      }
    }
  }
  const relevantEvents = rootAgentId
    ? all.filter((event) => event.agentId !== undefined && relevantAgents.has(event.agentId)) : all;
  const relevantEventSet = new Set(relevantEvents);
  const ctx: Shared = {
    options, all: relevantEvents,
    usageDiagnostics: new Map([...parseUsageRecords(all).diagnostics].filter(([event]) => relevantEventSet.has(event))),
    usageDiagnosticExamples: new Set(),
    processedEvents: new Set(),
    meta: subagentMeta(relevantEvents, verifiedAgentIds), attached: new Set(rootAgentId ? [rootAgentId] : []),
    seen: new Map(), dropped: new Map(), unhandled: new Map(),
    leftOut: new Map(), companions: [], systemFiles: new Map(), copilotVersion: 'unknown', producer: null, creationDate: null, workingDirectory: '',
  };
  const conversation = processScope(ctx, scoped, null, 0);
  const turns = conversation.turns;
  const scopeStartOrder = new Map<string, number>();
  all.forEach((event, index) => event.agentId && !scopeStartOrder.has(event.agentId) && scopeStartOrder.set(event.agentId, index));
  // A missing parent call cannot establish that an unrelated child belongs to a selected child.
  const orphanCandidates = (rootAgentId ? [] : [...childScopeResult.scopes])
    .sort((left, right) => (scopeStartOrder.get(left.agentId) ?? Number.MAX_SAFE_INTEGER) - (scopeStartOrder.get(right.agentId) ?? Number.MAX_SAFE_INTEGER));
  const orphanChildren: OrphanChildConversation[] = [];
  for (const scope of orphanCandidates) {
    if (ctx.attached.has(scope.agentId) || callOwners.has(scope.parentToolCallId))
      continue;
    const scopeEvents = all.filter((event) => event.agentId === scope.agentId);
    const startedAt = scopeEvents.map((event) => millis(event.timestamp)).find((stamp): stamp is number => stamp !== null) ?? null;
    ctx.attached.add(scope.agentId);
    orphanChildren.push({
      agentId: scope.agentId,
      parentToolCallId: scope.parentToolCallId,
      title: ctx.meta.get(scope.parentToolCallId)?.displayName || ctx.meta.get(scope.parentToolCallId)?.name || `agent ${scope.agentId}`,
      startedAt,
      ...processScope(ctx, scopeEvents, null, 0),
    });
  }
  // Count children without a renderable parent call, including descendants beyond the nesting limit.
  const unplaced = relevantEvents.filter((event) => event.agentId !== undefined && !ctx.attached.has(event.agentId)
    && !SDK_LEFT_OUT.has(event.type) && !SDK_MARKERS.has(event.type)).length;
  unplaced && ctx.leftOut.set('sub-agent events without a verified delegation', unplaced);
  const errors: string[] = [];
  const usageErrors = new Map<string, { count: number; lines: number[] }>();
  for (const [event, issues] of ctx.usageDiagnostics) {
    const key = `${event.type}:unsupported`;
    ctx.unhandled.set(key, (ctx.unhandled.get(key) ?? 0) + 1);
    !ctx.processedEvents.has(event) && ctx.seen.set(event.type, (ctx.seen.get(event.type) ?? 0) + 1);
    const signature = issues.join('; ');
    const entry = usageErrors.get(signature) ?? { count: 0, lines: [] };
    entry.count += 1;
    entry.lines.length < 5 && entry.lines.push(event.line);
    usageErrors.set(signature, entry);
  }
  for (const [issues, entry] of usageErrors)
    errors.push(`session.usage_record has ${entry.count} unsupported receipt${entry.count === 1 ? '' : 's'} (${issues}). Example line${entry.lines.length === 1 ? '' : 's'}: ${entry.lines.join(', ')}.`);
  for (const event of relevantEvents) {
    if (event.type !== 'session.shutdown' && event.type !== 'session.usage_checkpoint')
      continue;
    const total = event.data.totalNanoAiu;
    if (total === undefined || (typeof total === 'number' && Number.isFinite(total) && total >= 0))
      continue;
    const key = `${event.type}:unsupported`;
    ctx.unhandled.set(key, (ctx.unhandled.get(key) ?? 0) + 1);
    errors.push(`${event.type} at line ${event.line}: totalNanoAiu must be a finite nonnegative number.`);
  }
  const census: Census = {
    seen: ctx.seen, dropped: ctx.dropped, toolData: new Map(), unrecognizedToolData: [],
    unhandled: [...ctx.unhandled].sort((left, right) => right[1] - left[1]),
    questionWarnings: questionCensus([...conversation.turns, ...orphanChildren.flatMap((child) => child.turns)]),
    questionWarningDetails: questionWarningDetails([...conversation.turns, ...orphanChildren.flatMap((child) => child.turns)]),
  };
  const session: ParsedSession = {
    title: options.title, customTitle: '', defaultTitle: options.title, creationDate: ctx.creationDate, responderUsername: 'GitHub Copilot',
    initialLocation: 'agent', workingDirectory: ctx.workingDirectory, ...conversation, rawRequests: [], census, editedFiles: [], errors,
    ...(orphanChildren.length ? { detachedSubagents: orphanChildren.map(({ startedAt: _startedAt, ...child }) => child) } : {}),
  };
  return {
    session, companions: ctx.companions, leftOut: ctx.leftOut,
    orphanChildren,
    unresolvedChildScopes: childScopeResult.problems.filter((problem) => !rootAgentId
      || (problem.toolCallId && [...(callOwners.get(problem.toolCallId) ?? [])].some((owner) => owner !== undefined && relevantAgents.has(owner)))).length,
    copilotVersion: ctx.copilotVersion, producer: ctx.producer,
    events: relevantEvents,
  };
}
