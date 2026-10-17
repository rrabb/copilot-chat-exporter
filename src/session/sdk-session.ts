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
import type { Census, NoteNode, ParsedSession, ToolNode, Turn, TurnNode, TurnScalars } from '../types.ts';
import { isRecord } from './sdk-events.ts';
import type { SdkEvent } from './sdk-events.ts';

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
  'user.message', 'assistant.message', 'tool.execution_start', 'tool.execution_complete',
  'system.message', 'system.notification', 'skill.invoked', 'skill.invoked_ref', 'skill.context_delivered_ref',
  'session.binary_asset',
]);

export interface SdkSessionOptions {
  title: string;
  /** Folder the Markdown will sit beside; companion links are built from it. */
  assetsDirectory: string;
}

export interface SdkSessionResult {
  session: ParsedSession;
  companions: CompanionArtifact[];
  /** Left-out groups and how many records each held. */
  leftOut: Map<string, number>;
  copilotVersion: string;
  producer: string | null;
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
  if (!isRecord(args)) {
    args !== undefined && args !== null && (node.inputText = argumentsText(args).trim());
    return;
  }
  const command = typeof args.command === 'string' && ['powershell', 'bash', 'shell', 'run_in_terminal'].includes(name) ? args.command : '';
  if (command) {
    node.command = command;
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

/** Delegated agents by the tool call that started them, from `subagent.started` and `subagent.completed`. */
function subagentMeta (events: readonly SdkEvent[]): Map<string, SubagentMeta> {
  const result = new Map<string, SubagentMeta>();
  for (const event of events) {
    if (event.type !== 'subagent.started' && event.type !== 'subagent.completed')
      continue;
    const id = text(event.data.toolCallId);
    if (!id)
      continue;
    const entry = result.get(id) ?? {
      agentId: '', name: '', displayName: '', description: '', agentType: '', model: '',
      durationMs: null, totalToolCalls: null, totalTokens: null, cancelled: false,
    };
    const data = event.data;
    event.agentId && (entry.agentId = event.agentId);
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
function processScope (ctx: Shared, events: readonly SdkEvent[], implicit: { prompt: string; ts: number | null } | null, depth: number): Turn[] {
  const { seen, dropped, unhandled, leftOut, options, companions } = ctx;
  const turns: Turn[] = [];
  let current: Turn | null = null;
  let pendingNotes: NoteNode[] = [];
  let lastSystemHash = '';
  const startedAt = new Map<string, number>();
  const nodesById = new Map<string, ToolNode>();
  const turnEnds = new Map<Turn, number>();
  const kinds = new Map<Turn, { thinking: number; summary: number }>();

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
  const note = (node: NoteNode) => (current ? current.body.push(node) : pendingNotes.push(node));
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
        current.body.push(...pendingNotes);
        pendingNotes = [];
        turns.push(current);
        break;
      }
      case 'assistant.message': {
        if (!current)
          break;
        const reasoning = text(data.reasoningText).trim();
        const blocks = isRecord(data.reasoningBlocks) && Array.isArray(data.reasoningBlocks.blocks) ? data.reasoningBlocks.blocks.filter(isRecord) : [];
        const summaryText = blocks.flatMap((block) => Array.isArray(block.summary) ? block.summary.filter(isRecord).map((item) => text(item.text)) : []).join('\n\n').trim();
        const thinkingText = blocks.map((block) => text(block.thinking)).join('\n\n').trim();
        const readable = reasoning || thinkingText || summaryText;
        if (readable) {
          const node: TurnNode = { type: 'think', text: readable };
          current.body.push(node);
          current.reasoning.push(readable);
          const count = kinds.get(current) ?? { thinking: 0, summary: 0 };
          thinkingText ? (count.thinking += 1) : (count.summary += 1);
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
        for (const request of Array.isArray(data.toolRequests) ? data.toolRequests.filter(isRecord) : []) {
          const id = text(request.toolCallId);
          const name = text(request.name) || text(request.toolName) || 'tool';
          if (!id)
            continue;
          const node = nodesById.get(id) ?? toolNode(id, name);
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
          node.resultText = node.resultText ? `${node.resultText}\n\n[tool error] ${message}` : `[tool error] ${message}`;
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
        if (!mime.startsWith('image/') || !encoded) {
          note({ type: 'note', title: `📎 Attachment not exported: ${text(data.type) || 'binary'} ${mime} (${(typeof data.byteLength === 'number' ? data.byteLength : 0).toLocaleString('en-US')} bytes)` });
          break;
        }
        const extension = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]?.replace(/[^a-z0-9]/giu, '') || 'img';
        const file = `image-${safeName(text(data.assetId) || digest(encoded))}.${extension}`;
        const href = companion(file, mime, Buffer.from(encoded, 'base64'), 'image', event);
        note({ type: 'note', title: `🖼️ Image${text(data.description) ? `: ${text(data.description)}` : ''}`, image: { href, alt: text(data.description) || file } });
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
  if (!turns.length && pendingNotes.length)
    turns.push({ requestId: 'session-notes', ts: null, prompt: '(no user prompt recorded)', reasoning: [], prose: [], body: pendingNotes, toolNodes: [], todos: [], filesTouched: [], scalar: { agentTurn: true }, number: 1 });

  // A call that started a delegated agent carries that agent's whole conversation.
  for (const node of nodesById.values()) {
    const info = ctx.meta.get(node.toolCallId);
    if (!info?.agentId || ctx.attached.has(info.agentId) || depth >= MAX_NESTING)
      continue;
    ctx.attached.add(info.agentId);
    const scopeEvents = ctx.all.filter((event) => event.agentId === info.agentId);
    const task = node.promptText || (isRecord(node.toolSpecificData) ? text(node.toolSpecificData.description) : '');
    const begun = scopeEvents.find((event) => millis(event.timestamp) !== null);
    node.subagent = {
      ...info, turns: processScope(ctx, scopeEvents, { prompt: task, ts: begun ? millis(begun.timestamp) : null }, depth + 1),
    };
  }
  return turns;
}

/** The main conversation of one verified scope, with every delegated agent's conversation nested at its call. */
export function buildSdkSession (all: readonly SdkEvent[], scoped: readonly SdkEvent[], options: SdkSessionOptions): SdkSessionResult {
  const ctx: Shared = {
    options, all, meta: subagentMeta(all), attached: new Set(), seen: new Map(), dropped: new Map(), unhandled: new Map(),
    leftOut: new Map(), companions: [], systemFiles: new Map(), copilotVersion: 'unknown', producer: null, creationDate: null, workingDirectory: '',
  };
  const turns = processScope(ctx, scoped, null, 0);
  // Events attributed to an agent that no call in this conversation started cannot be placed; say so.
  const unplaced = all.filter((event) => event.agentId !== undefined && !ctx.attached.has(event.agentId)
    && !SDK_LEFT_OUT.has(event.type) && !SDK_MARKERS.has(event.type)).length;
  unplaced && ctx.leftOut.set('sub-agent events whose delegation is not in this conversation', unplaced);
  const census: Census = {
    seen: ctx.seen, dropped: ctx.dropped, toolData: new Map(), unrecognizedToolData: [],
    unhandled: [...ctx.unhandled].sort((left, right) => right[1] - left[1]),
  };
  const session: ParsedSession = {
    title: options.title, customTitle: '', defaultTitle: options.title, creationDate: ctx.creationDate, responderUsername: 'GitHub Copilot',
    initialLocation: 'agent', workingDirectory: ctx.workingDirectory, turns, rawRequests: [], census, editedFiles: [], errors: [],
  };
  return { session, companions: ctx.companions, leftOut: ctx.leftOut, copilotVersion: ctx.copilotVersion, producer: ctx.producer };
}
