// Layer D for Agent Host and Copilot CLI exports: is every recorded piece of conversation content in
// the Markdown (or in a companion file it links to)? Like the Local version it does not call the
// builder or the renderer; it re-reads the raw scoped events with its own small taxonomy.

import { scoreLossPieces } from './loss-account.ts';
import type { LossAccount, LossPiece } from './loss-account.ts';
import type { SdkEvent } from '../session/sdk-events.ts';

const LINES = new Set(['tool-input', 'tool-output', 'tool-detail']);

const str = (value: unknown): string => typeof value === 'string' ? value : '';
const record = (value: unknown): Record<string, any> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;

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
export function sdkLossPieces (events: readonly SdkEvent[]): LossPiece[] {
  const pieces: LossPiece[] = [];
  const companionPieces: LossPiece[] = [];
  const companionKeys = new Set<string>();
  const toolStartsWithArguments = new Set<string>();
  const turns = new Map<string, number>();
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
    if (event.type !== 'tool.execution_start')
      continue;
    const id = str(event.data.toolCallId);
    const args = record(event.data.arguments);
    id && args && strings(args).join('\n').trim() && toolStartsWithArguments.add(callKey(event, id));
  }
  for (const event of events) {
    const data = event.data;
    switch (event.type) {
      case 'user.message':
        turns.set(scopeOf(event), (turns.get(scopeOf(event)) ?? 0) + 1);
        add('prompt', str(data.content), event, true);
        break;
      case 'assistant.message': {
        const blocks = Array.isArray(record(data.reasoningBlocks)?.blocks) ? record(data.reasoningBlocks)!.blocks : [];
        const fallback = blocks.flatMap((block: any) => [str(block?.thinking), ...(Array.isArray(block?.summary) ? block.summary.map((item: any) => str(item?.text)) : [])]).join('\n\n');
        add('reasoning', str(data.reasoningText) || fallback, event, true);
        add('assistant-text', str(data.content), event, true);
        for (const request of Array.isArray(data.toolRequests) ? data.toolRequests : []) {
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

/** `companionText` is the text of saved companion files; content saved there counts as exported. */
export function buildSdkLossAccount (events: readonly SdkEvent[], markdown: string, companionText = ''): LossAccount {
  return scoreLossPieces(sdkLossPieces(events), `${markdown}\n${companionText}`, LINES);
}
