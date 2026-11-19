// Model usage for Agent Host and Copilot CLI chats.
//
// Select one per-call stream, never add overlapping streams:
//   1. the CLI's own database, `<copilot home>/session-store.db`, table `assistant_usage_events`;
//   2. durable `session.usage_record` receipts;
//   3. legacy `model.model_call_success` events.
// Shutdown/checkpoint totals are separate cumulative summaries, not additional calls.
// Credits are never estimated from token counts: only a recorded nano-AIU figure is shown, as
// credits = nano-AIU / 1e9 (1 AIU = 1 AI credit = $0.01; checked against the recorded per-token rates).

import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { LoggedUsageTotal, ParsedSession, SessionUsage, Turn, TurnUsageTotals, UsageCall, UsageFigures, UsageSelection } from '../types.ts';
import { childScopes, isRecord } from './sdk-events.ts';
import type { SdkEvent } from './sdk-events.ts';
import { parseUsageRecords } from './sdk-usage-record.ts';
import { sumKnown, USAGE_METRICS } from './usage-figures.ts';
export type { UsageCall } from '../types.ts';

export const NANO_PER_CREDIT = 1_000_000_000;

export function emptyFigures (): UsageFigures {
  return { calls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, nanoAiu: 0, durationMs: 0 };
}

export function addCall (figures: UsageFigures, call: UsageCall): UsageFigures {
  figures.calls += 1;
  for (const key of USAGE_METRICS)
    figures[key] = sumKnown(figures[key], count(call[key]));
  return figures;
}

const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

function validateLedgerCall (call: UsageCall): UsageCall {
  const issues: string[] = [];
  const normalized = { ...call };
  for (const key of USAGE_METRICS) {
    if (call[key] !== null && count(call[key]) === null) {
      issues.push(`ledger.${key}: expected a finite nonnegative number`);
      normalized[key] = null;
    }
  }
  if (call.at !== null && !Number.isFinite(call.at)) {
    normalized.at = null;
    issues.push('ledger timestamp: invalid');
  }
  issues.length && (normalized.provenance = { ...call.provenance, source: 'session-store', issues: [...(call.provenance?.issues ?? []), ...issues] });
  return normalized;
}

/** The copilot home an events.jsonl lives under: `<home>/session-state/<backing id>/events.jsonl`. */
export function copilotHomeOf (eventsPath: string): string {
  return path.resolve(path.dirname(eventsPath), '..', '..');
}

function parseStamp (value: unknown): number | null {
  if (typeof value !== 'string')
    return null;
  // SQLite's datetime('now') omits the zone; the CLI writes ISO strings, but both mean UTC.
  const iso = /[zZ]|[+-]\d\d:?\d\d$/u.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  const stamp = Date.parse(iso);
  return Number.isFinite(stamp) ? stamp : null;
}

/** Usage rows the CLI stored for one backing session. A missing or unreadable store is not an error here. */
export function readUsageLedger (copilotHome: string, backingId: string): { calls: UsageCall[]; problem: string | null } {
  const file = path.join(copilotHome, 'session-store.db');
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(file, { readOnly: true });
    const rows = database.prepare(
      `SELECT created_at, agent_id, model, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
              reasoning_tokens, total_nano_aiu, duration_ms
         FROM assistant_usage_events WHERE session_id = ? ORDER BY id`,
    ).all(backingId);
    const calls: UsageCall[] = [];
    for (const row of rows) {
      const at = parseStamp(row.created_at);
      const call: UsageCall = {
        at, agentId: typeof row.agent_id === 'string' && row.agent_id ? row.agent_id : null, model: typeof row.model === 'string' ? row.model : null,
        inputTokens: count(row.input_tokens), cacheReadTokens: count(row.cache_read_tokens), cacheWriteTokens: count(row.cache_write_tokens),
        outputTokens: count(row.output_tokens), reasoningTokens: count(row.reasoning_tokens),
        nanoAiu: count(row.total_nano_aiu), durationMs: count(row.duration_ms),
      };
      const invalid = [
        ['input_tokens', row.input_tokens], ['cache_read_tokens', row.cache_read_tokens], ['cache_write_tokens', row.cache_write_tokens],
        ['output_tokens', row.output_tokens], ['reasoning_tokens', row.reasoning_tokens], ['total_nano_aiu', row.total_nano_aiu], ['duration_ms', row.duration_ms],
      ].filter(([_field, value]) => value !== null && count(value) === null);
      invalid.length && (call.provenance = { source: 'session-store', issues: invalid.map(([field]) => `ledger.${field}: expected a finite nonnegative number`) });
      calls.push(call);
    }
    const invalidRows = calls.filter((call) => call.provenance?.issues?.length).length;
    return { calls, problem: invalidRows ? `${invalidRows} usage ledger row(s) have invalid counters; those counters are unknown.` : null };
  } catch (error) {
    return { calls: [], problem: error instanceof Error ? error.message : String(error) };
  } finally {
    database?.close();
  }
}

/** Usage carried by older logs. Receipts and these legacy events are separate accounting streams. */
function legacyUsage (events: readonly SdkEvent[]): UsageCall[] {
  const calls: UsageCall[] = [];
  for (const event of events) {
    if (event.type !== 'model.model_call_success' || !isRecord(event.data.responseChunk))
      continue;
    const chunk = event.data.responseChunk;
    const billing = isRecord(chunk.copilot_usage) ? chunk.copilot_usage : null;
    const at = Date.parse(event.timestamp ?? '');
    if (!billing || count(billing.total_nano_aiu) === null || !Number.isFinite(at))
      continue;
    const usage = isRecord(chunk.usage) ? chunk.usage : {};
    const input = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};
    const output = isRecord(usage.completion_tokens_details) ? usage.completion_tokens_details : {};
    const call = isRecord(event.data.modelCall) ? event.data.modelCall : {};
    calls.push({
      at, agentId: event.agentId ?? null, model: typeof call.model === 'string' ? call.model : typeof chunk.model === 'string' ? chunk.model : null,
      inputTokens: count(usage.prompt_tokens), cacheReadTokens: count(input.cached_tokens),
      cacheWriteTokens: count(input.cache_write_tokens ?? input.cache_creation_tokens),
      outputTokens: count(usage.completion_tokens), reasoningTokens: count(output.reasoning_tokens),
      nanoAiu: count(billing.total_nano_aiu), durationMs: count(event.data.modelCallDurationMs),
    });
  }
  return calls;
}

export interface SelectedUsage {
  calls: UsageCall[];
  source: SessionUsage['source'];
  selection: UsageSelection;
}

/** Ledger first even when partial. Report alternatives without merging their financial values. */
export function selectUsage (events: readonly SdkEvent[], ledger: readonly UsageCall[] = []): SelectedUsage {
  const receipts = parseUsageRecords(events);
  const legacy = legacyUsage(events);
  const calls = ledger.length ? ledger.map(validateLedgerCall) : receipts.calls.length ? receipts.calls : legacy;
  return {
    calls, source: ledger.length ? 'session-store' : receipts.calls.length ? 'usage-record' : legacy.length ? 'event-log' : 'none',
    selection: {
      available: { ledger: ledger.length, receipts: receipts.calls.length, legacy: legacy.length },
      receiptRecords: receipts.records, duplicateReceipts: receipts.duplicates,
      conflictingReceipts: receipts.conflicts, unsupportedReceipts: receipts.diagnostics.size,
    },
  };
}

/** Persisted receipts win over legacy successes when no database ledger was supplied. */
export function usageFromEvents (events: readonly SdkEvent[]): UsageCall[] {
  return selectUsage(events).calls;
}

/** The last cumulative total the log recorded. Shutdown and checkpoint totals are running totals: never add them. */
export function loggedTotal (events: readonly SdkEvent[]): LoggedUsageTotal | null {
  let result: LoggedUsageTotal | null = null;
  let shutdowns = 0;
  for (const event of events) {
    event.type === 'session.shutdown' && (shutdowns += 1);
    const total = count(event.data.totalNanoAiu);
    if ((event.type === 'session.shutdown' || event.type === 'session.usage_checkpoint') && total !== null)
      result = { nanoAiu: total, event: event.type, at: event.timestamp ?? null, shutdowns: 0 };
  }
  return result && { ...result, shutdowns };
}

/** A conversation turn as the attribution sees it: when its prompt was sent and its 1-based number. */
export interface TurnStart { ts: number; number: number }

/** Per-call usage matched to turns and delegated agents. Indexes follow the `starts` passed in. */
export interface CallAttribution {
  turns: Array<{ own: UsageFigures; agents: UsageFigures; ownCalls: UsageCall[]; agentCalls: UsageCall[] } | undefined>;
  byAgent: Map<string, UsageFigures>;
  recorded: UsageFigures;
  unattributed: UsageFigures;
  byModel: Array<[string, UsageFigures]>;
}

function ownerIndex (starts: readonly TurnStart[], at: number): number {
  let owner = -1;
  for (let index = 0; index < starts.length; index += 1)
    starts[index]!.ts <= at && (owner = index);
  return owner;
}

function verifiedDelegations (all: readonly SdkEvent[]) {
  const owners = new Map<string, Map<string | null, number | null>>();
  const recordOwner = (id: unknown, event: SdkEvent) => {
    if (typeof id !== 'string' || !id)
      return;
    const scope = event.agentId ?? null;
    const known = owners.get(id) ?? new Map<string | null, number | null>();
    !known.has(scope) && known.set(scope, parseStamp(event.timestamp));
    owners.set(id, known);
  };
  for (const event of all) {
    if (event.type === 'assistant.message')
      for (const request of Array.isArray(event.data.toolRequests) ? event.data.toolRequests : [])
        isRecord(request) && recordOwner(request.toolCallId, event);
    else if (event.type === 'tool.execution_start' || event.type === 'tool.execution_complete')
      recordOwner(event.data.toolCallId, event);
  }
  const delegations = new Map<string, { owner: string | null; at: number | null; toolCallId: string }>();
  for (const scope of childScopes(all).scopes) {
    const parents = owners.get(scope.parentToolCallId);
    if (parents?.size === 1) {
      const [owner, at] = [...parents][0]!;
      delegations.set(scope.agentId, { owner, at, toolCallId: scope.parentToolCallId });
    }
  }
  return delegations;
}

/** A selected child's records plus descendants linked by actual parent calls. Main means the whole log. */
export function usageScopeEvents (all: readonly SdkEvent[], rootAgentId: string | null): readonly SdkEvent[] {
  if (rootAgentId === null)
    return all;
  const agents = new Set([rootAgentId]);
  const delegations = verifiedDelegations(all);
  let previousSize = -1;
  while (previousSize !== agents.size) {
    previousSize = agents.size;
    for (const [agentId, parent] of delegations)
      parent.owner !== null && agents.has(parent.owner) && agents.add(agentId);
  }
  return all.filter((event) => event.agentId !== undefined && agents.has(event.agentId));
}

/** Keep the whole-log source decision when filtering a child. A partial ledger must not trigger a child-only fallback. */
export function usageForScope (
  all: readonly SdkEvent[],
  selected: { calls: readonly UsageCall[]; source: SessionUsage['source']; selection?: UsageSelection },
  rootAgentId: string | null,
): { calls: UsageCall[]; source: SessionUsage['source']; selection?: UsageSelection } {
  if (rootAgentId === null)
    return { ...selected, calls: [...selected.calls] };
  const relevant = usageScopeEvents(all, rootAgentId);
  const agents = new Set(relevant.map((event) => event.agentId));
  const calls = selected.calls.filter((call) => call.agentId !== null && agents.has(call.agentId));
  const selection = selected.selection
    ? { ...selectUsage(relevant, selected.source === 'session-store' ? calls : []).selection, selectedForWholeLog: true }
    : undefined;
  return { calls, source: selected.source, ...(selection ? { selection } : {}) };
}

/** Match child calls through verified delegation chains. Missing parent calls never establish main-turn ownership. */
export function attributeCalls (all: readonly SdkEvent[], starts: readonly TurnStart[], calls: readonly UsageCall[], windowEnd: number, rootAgentId: string | null = null): CallAttribution {
  const delegations = verifiedDelegations(all);
  const delegatedTurn = (agentId: string, visited = new Set<string>()): number => {
    if (visited.has(agentId))
      return -1;
    visited.add(agentId);
    const parent = delegations.get(agentId);
    if (!parent)
      return -1;
    if (parent.owner === rootAgentId)
      return parent.at === null || parent.at > windowEnd ? -1 : ownerIndex(starts, parent.at);
    return parent.owner === null ? -1 : delegatedTurn(parent.owner, visited);
  };
  const windowStart = starts[0]?.ts ?? Infinity;
  const turns: CallAttribution['turns'] = starts.map(() => undefined);
  const byAgent = new Map<string, UsageFigures>();
  const recorded = emptyFigures();
  const unattributed = emptyFigures();
  const byModel = new Map<string, UsageFigures>();
  for (const call of calls) {
    call.agentId && addCall(byAgent.get(call.agentId) ?? byAgent.set(call.agentId, emptyFigures()).get(call.agentId)!, call);
    let target: { index: number; kind: 'own' | 'agents' } | null = null;
    if (call.provenance?.conflicted) {
      // A repeated identity with conflicting scope or counters cannot establish turn ownership.
    } else if (call.agentId !== rootAgentId && call.agentId) {
      const index = delegatedTurn(call.agentId);
      const recordedParent = call.provenance?.parentToolCallId;
      const parentMatches = !recordedParent || delegations.get(call.agentId)?.toolCallId === recordedParent;
      index >= 0 && parentMatches && (target = { index, kind: 'agents' });
    } else if (call.agentId === rootAgentId && call.at !== null && call.at >= windowStart && call.at <= windowEnd) {
      target = { index: ownerIndex(starts, call.at), kind: 'own' };
    }
    if (!target) {
      addCall(unattributed, call);
      continue;
    }
    const slot = turns[target.index] ??= { own: emptyFigures(), agents: emptyFigures(), ownCalls: [], agentCalls: [] };
    addCall(slot[target.kind], call);
    (target.kind === 'own' ? slot.ownCalls : slot.agentCalls).push(call);
    addCall(recorded, call);
    const model = call.model ?? '(model not recorded)';
    addCall(byModel.get(model) ?? byModel.set(model, emptyFigures()).get(model)!, call);
  }
  return { turns, byAgent, recorded, unattributed, byModel: [...byModel].sort((left, right) => (right[1].nanoAiu ?? -1) - (left[1].nanoAiu ?? -1)) };
}

/** Per-call rows must cover about nine tenths of the assistant replies before they stand in for a turn's cost. */
export function perCallComplete (rows: number, replies: number): boolean {
  return replies > 0 && rows >= replies * 0.9;
}

export function usageComplete (calls: readonly UsageCall[], replies: number, selection?: UsageSelection): boolean {
  const alternatives = selection ? Math.max(...Object.values(selection.available)) : 0;
  return alternatives <= calls.length && perCallComplete(calls.length, replies)
    && calls.every((call) => call.nanoAiu !== null && !call.provenance?.issues?.length);
}
export interface TotalsAttribution {
  turns: Array<TurnUsageTotals | undefined>;
  /** Credits written to the running total before the first prompt. */
  before: number;
  /** False when the log wrote no running totals at all. */
  any: boolean;
}

/**
 * Credits per turn from the running totals the log wrote at `session.usage_checkpoint` and
 * `session.shutdown`. Totals are cumulative, so a turn gets the difference from the previous
 * total; never the total itself. A checkpoint that covers several turns lands on the last of
 * them with the range. Verified against the CLI store where it has every call: exact for chats
 * with one checkpoint per turn, off by the usual shutdown timing otherwise.
 */
export function totalsPerTurn (all: readonly SdkEvent[], starts: readonly TurnStart[]): TotalsAttribution {
  const turns: TotalsAttribution['turns'] = starts.map(() => undefined);
  let previous = 0;
  let lastOwner = -1;
  let before = 0;
  let any = false;
  for (const event of all) {
    const total = count(event.data.totalNanoAiu);
    if ((event.type !== 'session.usage_checkpoint' && event.type !== 'session.shutdown') || total === null)
      continue;
    any = true;
    const delta = Math.max(0, total - previous);
    previous = Math.max(previous, total);
    if (!delta || !starts.length)
      continue;
    const at = Date.parse(event.timestamp ?? '');
    const owner = Number.isFinite(at) ? ownerIndex(starts, at) : -1;
    if (owner < 0) {
      before += delta;
      continue;
    }
    const from = starts[Math.min(lastOwner + 1, owner)]!.number;
    const existing = turns[owner];
    turns[owner] = {
      nanoAiu: (existing?.nanoAiu ?? 0) + delta,
      fromTurn: Math.min(existing?.fromTurn ?? from, from),
      toTurn: starts[owner]!.number,
    };
    lastOwner = owner;
  }
  return { turns, before, any };
}

function startsOf (turns: readonly Turn[]): { starts: TurnStart[]; turns: Turn[] } {
  const timed = turns.filter((turn) => turn.ts !== null);
  return { starts: timed.map((turn) => ({ ts: turn.ts!, number: turn.number })), turns: timed };
}

/**
 * Attach recorded usage to the turns and delegated agents of one exported conversation.
 * Leaves `session.usage` unset when nothing was recorded, so renderers can say "not recorded".
 */
export function attachUsage (
  session: ParsedSession,
  calls: readonly UsageCall[],
  source: SessionUsage['source'],
  all: readonly SdkEvent[],
  scoped: readonly SdkEvent[],
  selection?: UsageSelection,
  rootAgentId: string | null = null,
): void {
  const logged = rootAgentId === null ? loggedTotal(all) : null;
  if (!calls.length && !logged && !selection?.selectedForWholeLog && !selection?.receiptRecords)
    return;
  const { starts, turns } = startsOf(session.turns);
  const stamps = scoped.map((event) => Date.parse(event.timestamp ?? '')).filter(Number.isFinite);
  const windowEnd = stamps.length ? Math.max(...stamps) + 5000 : -Infinity;
  const attribution = attributeCalls(all, starts, calls, windowEnd, rootAgentId);
  const replies = all.filter((event) => event.type === 'assistant.message').length;
  const complete = usageComplete(calls, replies, selection);
  attribution.turns.forEach((slot, index) => slot && (turns[index]!.scalar.usage = {
    own: slot.own,
    agents: slot.agents,
    calls: { own: slot.ownCalls, agents: slot.agentCalls },
    complete,
  }));
  const walk = (list: readonly Turn[]) => {
    for (const turn of list)
      for (const node of turn.toolNodes)
        if (node.subagent) {
          const figures = attribution.byAgent.get(node.subagent.agentId);
          figures && (node.subagent.usage = figures);
          walk(node.subagent.turns);
        }
  };
  walk(session.turns);
  for (const child of session.detachedSubagents ?? []) {
    const figures = attribution.byAgent.get(child.agentId);
    figures && (child.usage = figures);
    walk(child.turns);
  }
  session.usage = {
    source: calls.length || selection ? source : 'none', replies, recorded: attribution.recorded, unattributed: attribution.unattributed,
    byModel: attribution.byModel, logged, beforeFirstTurnNanoAiu: 0, turnsWithTotals: 0, complete,
    calls: [...calls], ...(selection ? { selection } : {}),
  };
}

/** Credits per turn from running totals, for every log that wrote any (see `totalsPerTurn`). */
export function attachRunningTotals (session: ParsedSession, all: readonly SdkEvent[]): void {
  const { starts, turns } = startsOf(session.turns);
  const result = totalsPerTurn(all, starts);
  result.turns.forEach((slot, index) => slot && (turns[index]!.scalar.usageTotals = slot));
  if (!result.any || !session.usage)
    return;
  session.usage.beforeFirstTurnNanoAiu = result.before;
  session.usage.turnsWithTotals = result.turns.filter(Boolean).length;
}