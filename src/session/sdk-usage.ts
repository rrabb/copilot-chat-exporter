// Model usage for Agent Host and Copilot CLI chats.
//
// The event log has no per-call usage: GitHub documents `assistant.usage` as ephemeral and not
// replayed. Three recorded sources exist, used in this order of detail:
//   1. the CLI's own database, `<copilot home>/session-store.db`, table `assistant_usage_events`;
//   2. `model.model_call_success` events in the log, for the logs that carry them;
//   3. the last cumulative `totalNanoAiu` on a `session.shutdown` / `session.usage_checkpoint` event.
// Credits are never estimated from token counts: only a recorded nano-AIU figure is shown, as
// credits = nano-AIU / 1e9 (1 AIU = 1 AI credit = $0.01; checked against the recorded per-token rates).

import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { LoggedUsageTotal, ParsedSession, SessionUsage, Turn, TurnUsageTotals, UsageFigures } from '../types.ts';
import type { SdkEvent } from './sdk-events.ts';

export const NANO_PER_CREDIT = 1_000_000_000;

/** One model call with recorded usage. */
export interface UsageCall {
  at: number;
  agentId: string | null;
  model: string;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  nanoAiu: number;
  durationMs: number;
}

export function emptyFigures (): UsageFigures {
  return { calls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0, nanoAiu: 0, durationMs: 0 };
}

export function addCall (figures: UsageFigures, call: UsageCall): UsageFigures {
  figures.calls += 1;
  figures.inputTokens += call.inputTokens;
  figures.cacheReadTokens += call.cacheReadTokens;
  figures.cacheWriteTokens += call.cacheWriteTokens;
  figures.outputTokens += call.outputTokens;
  figures.reasoningTokens += call.reasoningTokens;
  figures.nanoAiu += call.nanoAiu;
  figures.durationMs += call.durationMs;
  return figures;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0;

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
    ).all(backingId) as Array<Record<string, unknown>>;
    const calls: UsageCall[] = [];
    for (const row of rows) {
      const at = parseStamp(row.created_at);
      if (at === null || typeof row.total_nano_aiu !== 'number')
        continue;
      calls.push({
        at, agentId: typeof row.agent_id === 'string' && row.agent_id ? row.agent_id : null, model: String(row.model ?? 'unknown'),
        inputTokens: count(row.input_tokens), cacheReadTokens: count(row.cache_read_tokens), cacheWriteTokens: count(row.cache_write_tokens),
        outputTokens: count(row.output_tokens), reasoningTokens: count(row.reasoning_tokens),
        nanoAiu: row.total_nano_aiu, durationMs: count(row.duration_ms),
      });
    }
    return { calls, problem: null };
  } catch (error) {
    return { calls: [], problem: error instanceof Error ? error.message : String(error) };
  } finally {
    database?.close();
  }
}

/** Usage carried by `model.model_call_success` events (only some logs have them). */
export function usageFromEvents (events: readonly SdkEvent[]): UsageCall[] {
  const calls: UsageCall[] = [];
  for (const event of events) {
    if (event.type !== 'model.model_call_success' || !isRecord(event.data.responseChunk))
      continue;
    const chunk = event.data.responseChunk;
    const billing = isRecord(chunk.copilot_usage) ? chunk.copilot_usage : null;
    const at = Date.parse(event.timestamp ?? '');
    if (!billing || typeof billing.total_nano_aiu !== 'number' || !Number.isFinite(at))
      continue;
    const usage = isRecord(chunk.usage) ? chunk.usage : {};
    const input = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};
    const output = isRecord(usage.completion_tokens_details) ? usage.completion_tokens_details : {};
    const call = isRecord(event.data.modelCall) ? event.data.modelCall : {};
    calls.push({
      at, agentId: event.agentId ?? null, model: String(call.model ?? chunk.model ?? 'unknown'),
      inputTokens: count(usage.prompt_tokens), cacheReadTokens: count(input.cached_tokens),
      cacheWriteTokens: count(input.cache_write_tokens ?? input.cache_creation_tokens),
      outputTokens: count(usage.completion_tokens), reasoningTokens: count(output.reasoning_tokens),
      nanoAiu: billing.total_nano_aiu, durationMs: count(event.data.modelCallDurationMs),
    });
  }
  return calls;
}

/** The last cumulative total the log recorded. Shutdown and checkpoint totals are running totals: never add them. */
export function loggedTotal (events: readonly SdkEvent[]): LoggedUsageTotal | null {
  let result: LoggedUsageTotal | null = null;
  let shutdowns = 0;
  for (const event of events) {
    event.type === 'session.shutdown' && (shutdowns += 1);
    if ((event.type === 'session.shutdown' || event.type === 'session.usage_checkpoint') && typeof event.data.totalNanoAiu === 'number')
      result = { nanoAiu: event.data.totalNanoAiu, event: event.type, at: event.timestamp ?? null, shutdowns: 0 };
  }
  return result && { ...result, shutdowns };
}

/** A conversation turn as the attribution sees it: when its prompt was sent and its 1-based number. */
export interface TurnStart { ts: number; number: number }

/** Per-call usage matched to turns and delegated agents. Indexes follow the `starts` passed in. */
export interface CallAttribution {
  turns: Array<{ own: UsageFigures; agents: UsageFigures } | undefined>;
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

/**
 * A call belongs to a turn by time (the last prompt at or before it). A call of a delegated agent
 * belongs to the turn that holds the agent's `subagent.started` event, and to that agent by id.
 * Calls that fit neither are unattributed, with their credits. `windowEnd` is the last moment of
 * the conversation, with a small allowance for a row written just after the last event.
 */
export function attributeCalls (all: readonly SdkEvent[], starts: readonly TurnStart[], calls: readonly UsageCall[], windowEnd: number): CallAttribution {
  const startedAt = new Map<string, number>();
  for (const event of all) {
    const at = Date.parse(event.timestamp ?? '');
    event.type === 'subagent.started' && event.agentId && Number.isFinite(at) && !startedAt.has(event.agentId) && startedAt.set(event.agentId, at);
  }
  const windowStart = starts[0]?.ts ?? Infinity;
  const turns: CallAttribution['turns'] = starts.map(() => undefined);
  const byAgent = new Map<string, UsageFigures>();
  const recorded = emptyFigures();
  const unattributed = emptyFigures();
  const byModel = new Map<string, UsageFigures>();
  for (const call of calls) {
    let target: { index: number; kind: 'own' | 'agents' } | null = null;
    if (call.agentId) {
      const began = startedAt.get(call.agentId);
      const index = began === undefined ? -1 : ownerIndex(starts, began);
      index >= 0 && (target = { index, kind: 'agents' });
      index >= 0 && addCall(byAgent.get(call.agentId) ?? byAgent.set(call.agentId, emptyFigures()).get(call.agentId)!, call);
    } else if (call.at >= windowStart && call.at <= windowEnd) {
      target = { index: ownerIndex(starts, call.at), kind: 'own' };
    }
    if (!target) {
      addCall(unattributed, call);
      continue;
    }
    const slot = turns[target.index] ??= { own: emptyFigures(), agents: emptyFigures() };
    addCall(slot[target.kind], call);
    addCall(recorded, call);
    addCall(byModel.get(call.model) ?? byModel.set(call.model, emptyFigures()).get(call.model)!, call);
  }
  return { turns, byAgent, recorded, unattributed, byModel: [...byModel].sort((left, right) => right[1].nanoAiu - left[1].nanoAiu) };
}

/** Per-call rows must cover about nine tenths of the assistant replies before they stand in for a turn's cost. */
export function perCallComplete (rows: number, replies: number): boolean {
  return replies > 0 && rows >= replies * 0.9;
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
    if ((event.type !== 'session.usage_checkpoint' && event.type !== 'session.shutdown') || typeof event.data.totalNanoAiu !== 'number')
      continue;
    any = true;
    const total = event.data.totalNanoAiu;
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
): void {
  const logged = loggedTotal(all);
  if (!calls.length && !logged)
    return;
  const { starts, turns } = startsOf(session.turns);
  const stamps = scoped.map((event) => Date.parse(event.timestamp ?? '')).filter(Number.isFinite);
  const windowEnd = stamps.length ? Math.max(...stamps) + 5000 : -Infinity;
  const attribution = attributeCalls(all, starts, calls, windowEnd);
  const replies = all.filter((event) => event.type === 'assistant.message').length;
  const complete = perCallComplete(attribution.recorded.calls + attribution.unattributed.calls, replies);
  attribution.turns.forEach((slot, index) => slot && (turns[index]!.scalar.usage = { ...slot, complete }));
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
  session.usage = {
    source: calls.length ? source : 'none', replies, recorded: attribution.recorded, unattributed: attribution.unattributed,
    byModel: attribution.byModel, logged, beforeFirstTurnNanoAiu: 0, turnsWithTotals: 0, complete,
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