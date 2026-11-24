// Layer D for Agent Host and Copilot CLI exports: is every recorded piece of conversation content in
// the Markdown (or in a companion file it links to)? Like the Local version it does not call the
// builder or the renderer; it re-reads the raw scoped events with its own small taxonomy.

import { scoreLossPieces } from './loss-account.ts';
import type { LossAccount, LossPiece } from './loss-account.ts';
import type { LossEvidenceOptions } from './loss-account.ts';
import { childScopes, isRecord } from '../session/sdk-events.ts';
import type { SdkEvent } from '../session/sdk-events.ts';
import type { CompanionArtifact } from '../export-policy.ts';
import { scanFences } from '../text.ts';
import { markdownInlineCodeAt, markdownLinks } from './markdown-links.ts';
import type { ToolGroupOrder } from '../types.ts';

const LINES = new Set(['tool-input', 'tool-output', 'tool-detail']);

const str = (value: unknown): string => typeof value === 'string' ? value : '';
const record = (value: unknown): Record<string, unknown> | null => isRecord(value) ? value : null;

function strings (value: unknown, depth = 0): string[] {
  if (typeof value === 'string')
    return [value];
  if (depth > 4)
    return [];
  if (Array.isArray(value))
    return value.flatMap((item) => strings(item, depth + 1));
  const object = record(value);
  return object ? Object.values(object).flatMap((item) => strings(item, depth + 1)) : [];
}

/** The pieces of recorded content in SDK events, with independent order groups for each agent scope. */
export function sdkLossPieces (events: readonly SdkEvent[], toolGroupOrder: ToolGroupOrder = 'request'): LossPiece[] {
  const pieces: LossPiece[] = [];
  const companionPieces: LossPiece[] = [];
  const companionKeys = new Set<string>();
  const toolStartsWithArguments = new Set<string>();
  const completionOrder = new Map<string, number>();
  const turns = new Map<string, number>();
  const childScopeResult = childScopes(events);
  // The archive warns when it omits ambiguous child text, so Layer D checks only verified scopes.
  const unresolvedToolCallIds = new Set(childScopeResult.problems.flatMap((problem) => problem.toolCallId ? [problem.toolCallId] : []));
  const unresolvedAgentIds = new Set<string>();
  for (const event of events) {
    if (event.type !== 'subagent.started')
      continue;
    const toolCallId = str(event.data.toolCallId);
    if ((!toolCallId || unresolvedToolCallIds.has(toolCallId)) && event.agentId)
      unresolvedAgentIds.add(event.agentId);
  }
  const isUnresolvedChild = (event: SdkEvent) => (event.agentId !== undefined && unresolvedAgentIds.has(event.agentId))
    || unresolvedToolCallIds.has(str(event.data.parentToolCallId));
  const scopeOf = (event: SdkEvent) => event.agentId ? `agent:${event.agentId}` : 'main';
  const callKey = (event: SdkEvent, id: string) => `${scopeOf(event)}\0${id}`;
  const add = (category: string, text: string, event: SdkEvent, inSequence = false) => {
    if (!text.trim())
      return;
    const scope = scopeOf(event);
    pieces.push({
      request: Math.max(turns.get(scope) ?? 0, 1), category, text,
      ...(inSequence ? { orderGroup: scope, checkMultiplicity: true } : {}),
    });
  };
  const addCompanion = (category: string, text: string, event: SdkEvent) => {
    const key = `${category}\0${text}`;
    if (!text.trim() || companionKeys.has(key))
      return;
    companionKeys.add(key);
    companionPieces.push({ request: Math.max(turns.get(scopeOf(event)) ?? 0, 1), category, text });
  };
  for (const event of events) {
    if (isUnresolvedChild(event))
      continue;
    if (event.type !== 'tool.execution_start')
      continue;
    const id = str(event.data.toolCallId);
    const args = record(event.data.arguments);
    id && args && strings(args).join('\n').trim() && toolStartsWithArguments.add(callKey(event, id));
  }
  for (const [index, event] of events.entries())
    if (event.type === 'tool.execution_complete') {
      const key = callKey(event, str(event.data.toolCallId));
      !completionOrder.has(key) && completionOrder.set(key, index);
    }
  for (const event of events) {
    if (isUnresolvedChild(event))
      continue;
    const data = event.data;
    switch (event.type) {
      case 'user.message':
        turns.set(scopeOf(event), (turns.get(scopeOf(event)) ?? 0) + 1);
        add('prompt', str(data.content), event, true);
        break;
      case 'assistant.message': {
        const reasoning = record(data.reasoningBlocks);
        const blocks = Array.isArray(reasoning?.blocks) ? reasoning.blocks.filter(isRecord) : [];
        const thinking = blocks.map((block) => str(block.thinking).trim()).filter(Boolean);
        const summaries = blocks.flatMap((block) => Array.isArray(block.summary)
          ? block.summary.filter(isRecord).map((item) => str(item.text).trim()).filter(Boolean) : []);
        const structured = thinking.length ? thinking : summaries;
        const direct = str(data.reasoningText).trim();
        const normalized = (value: string) => value.replace(/\s+/gu, ' ').trim();
        const pieces = structured.length && normalized(structured.join('\n\n')) === normalized(direct)
          ? structured : direct ? [direct] : structured;
        for (const text of pieces)
          add('reasoning', text, event, true);
        add('assistant-text', str(data.content), event, true);
        const requests = Array.isArray(data.toolRequests) ? data.toolRequests.filter(isRecord) : [];
        if (toolGroupOrder === 'completion') {
          requests.sort((left, right) =>
            (completionOrder.get(callKey(event, str(left.toolCallId))) ?? Number.MAX_SAFE_INTEGER)
            - (completionOrder.get(callKey(event, str(right.toolCallId))) ?? Number.MAX_SAFE_INTEGER));
        }
        for (const request of requests) {
          add('tool-intent', str(request?.intentionSummary), event, true);
          const args = record(request?.arguments);
          !toolStartsWithArguments.has(callKey(event, str(request?.toolCallId))) && args && add('tool-input', strings(args).join('\n'), event);
        }
        break;
      }
      case 'tool.execution_start': {
        const args = record(data.arguments);
        args && add('tool-input', strings(args).join('\n'), event);
        break;
      }
      case 'tool.execution_complete': {
        const result = record(data.result);
        add('tool-output', str(result?.content), event);
        const detailed = str(result?.detailedContent);
        detailed.trim() !== str(result?.content).trim() && add('tool-detail', detailed, event);
        add('tool-error', str(record(data.error)?.message) || str(data.error), event);
        break;
      }
      case 'session.compaction_complete':
        add('compaction-summary', str(data.summaryContent), event);
        break;
      case 'session.task_complete':
        add('task-summary', str(data.summary), event);
        break;
      case 'session.error':
        add('session-error', str(data.message), event);
        break;
      case 'assistant.fusion_phase_failed':
        add('fusion-phase-failure-reason', str(data.reason), event, true);
        add('fusion-phase-error', str(data.errorMessage), event, true);
        break;
      case 'instruction.update':
        add('instruction-update', str(data.content), event, true);
        break;
      case 'instruction.update_delivery':
        for (const value of new Set(strings(data)))
          add('instruction-update-delivery', value, event);
        break;
      case 'model.telemetry':
        for (const value of new Set(strings(data)))
          add('model-telemetry', value, event);
        break;
      case 'session.usage_record': {
        const usage = record(data.usage);
        for (const value of [
          str(usage?.instructionUpdateDeliveryId),
          str(usage?.instructionUpdateLatestEventId),
        ].filter(Boolean))
          add('usage-provenance', value, event);
        break;
      }
      case 'model.turn_retry':
        add('model-turn-retry-reason', str(data.reason), event, true);
        break;
      case 'assistant.fusion_phase_completed': {
        const content = str(data.content);
        add('fusion-phase', content, event, true);
        const projection = record(data.projectionMessage);
        const projectionText = str(projection?.content);
        projectionText && projectionText !== content && add('fusion-phase-projection', projectionText, event, true);
        break;
      }
      case 'session.fusion_handoff': {
        const message = record(data.message);
        add('fusion-handoff', str(message?.content), event, true);
        break;
      }
      case 'system.message':
        addCompanion('system-prompt', typeof data.content === 'string' ? data.content : '', event);
        break;
      case 'skill.invoked':
        addCompanion('skill-file', str(data.content), event);
        break;
      default:
        break;
    }
  }
  return [...pieces, ...companionPieces];
}

/** Expand supplied text at live archive links, once per reference, without reading files or following links in the bodies. */
function withLinkedCompanions (markdown: string, companions: readonly CompanionArtifact[]): string {
  const bodies = new Map(companions.filter((item) => item.mediaType.startsWith('text/'))
    .map((item) => [item.relativePath, new TextDecoder().decode(item.bytes)]));
  const lines = markdown.split(/\r?\n/u);
  const document = lines.join('\n');
  const { inside } = scanFences(lines);
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const lineAt = (position: number) => {
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (starts[middle]! <= position)
        low = middle + 1;
      else
        high = middle;
    }
    return low - 1;
  };
  let output = '';
  let cursor = 0;
  for (const match of markdownLinks(document)) {
    output += document.slice(cursor, match.index);
    const link = document.slice(match.index, match.index + match.length);
    const index = match.index;
    const escapes = /\\+$/u.exec(document.slice(0, index))?.[0].length ?? 0;
    const line = lineAt(index);
    if (match.image || escapes % 2 !== 0 || inside[line] || markdownInlineCodeAt(document, index)) {
      output += link;
      cursor = index + match.length;
      continue;
    }
    let target: string;
    try {
      target = decodeURIComponent(match.target);
    } catch (error) {
      if (!(error instanceof URIError))
        throw error;
      output += link;
      cursor = index + match.length;
      continue;
    }
    const parts = target.split('/');
    if (parts.length !== 2 || parts.some((part) => !part || part === '.' || part === '..' || /[:\\?#\u0000-\u001f]/u.test(part))) {
      output += link;
      cursor = index + match.length;
      continue;
    }
    const body = bodies.get(target);
    output += body === undefined ? link : `${link}\n${body}\n`;
    cursor = index + match.length;
  }
  return output + document.slice(cursor);
}

/** Artifact objects keep link positions and repeated references. Legacy concatenated text supports presence checks but cannot prove link order. */
export function buildSdkLossAccount (
  events: readonly SdkEvent[],
  markdown: string,
  companions: string | readonly CompanionArtifact[] = [],
  toolGroupOrder: ToolGroupOrder = 'request',
  options: LossEvidenceOptions = {},
): LossAccount {
  const evidence = typeof companions === 'string' ? `${markdown}\n${companions}` : withLinkedCompanions(markdown, companions);
  return scoreLossPieces(sdkLossPieces(events, toolGroupOrder), evidence, LINES, options);
}
