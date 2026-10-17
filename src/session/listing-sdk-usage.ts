// Credits and tokens of one Agent Host or Copilot CLI conversation, for the detailed listing.
//
// The attribution is the same code the Markdown export uses (`sdk-usage.ts`), on the listing's
// own turn list. Credits are AI credits: recorded nano-AIU / 1,000,000,000.

import type { UsageFigures } from '../types.ts';
import type { ListingEvidence, ListingTurnEvidence } from './listing-evidence-types.ts';
import type { SdkEvent } from './sdk-events.ts';
import type { SdkEventSource } from './sources.ts';
import {
  NANO_PER_CREDIT, addCall, attributeCalls, copilotHomeOf, emptyFigures, loggedTotal, perCallComplete, readUsageLedger,
  totalsPerTurn, usageFromEvents,
} from './sdk-usage.ts';
import type { TurnStart, UsageCall } from './sdk-usage.ts';

/** Per-call usage of one log: the CLI store first, else the log's own usage events. Read once per log. */
export interface LogUsage { calls: UsageCall[]; source: 'session-store' | 'event-log' | 'none' }

export function readLogUsage (all: readonly SdkEvent[], source: SdkEventSource): LogUsage {
  const stored = readUsageLedger(copilotHomeOf(source.path), source.sessionId).calls;
  if (stored.length)
    return { calls: stored, source: 'session-store' };
  const fromLog = usageFromEvents(all);
  return fromLog.length ? { calls: fromLog, source: 'event-log' } : { calls: [], source: 'none' };
}

const credits = (nano: number) => nano / NANO_PER_CREDIT;

/** A turn's own calls plus those of the agents it delegated to. */
function combined (left: UsageFigures, right: UsageFigures): UsageFigures {
  return {
    calls: left.calls + right.calls, inputTokens: left.inputTokens + right.inputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens, cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    outputTokens: left.outputTokens + right.outputTokens, reasoningTokens: left.reasoningTokens + right.reasoningTokens,
    nanoAiu: left.nanoAiu + right.nanoAiu, durationMs: left.durationMs + right.durationMs,
  };
}

/** Sets chat-level usage and, for a main conversation, credits and tokens on each turn. Never throws for missing data. */
export function attachSdkListingUsage (
  evidence: ListingEvidence,
  all: readonly SdkEvent[],
  scoped: readonly SdkEvent[],
  source: SdkEventSource,
  usage: LogUsage,
): void {
  const logged = loggedTotal(all);
  if (!usage.calls.length && !logged)
    return;
  const replies = all.filter((event) => event.type === 'assistant.message').length;
  const base = {
    source: usage.source, replies, loggedCredits: logged ? credits(logged.nanoAiu) : null, loggedEvent: logged?.event ?? null,
    shutdowns: logged?.shutdowns ?? 0, beforeFirstTurnCredits: 0, unmatchedCredits: 0, byModel: [],
  };
  if (source.scope.kind === 'subagent') {
    const agentId = source.scope.agentId;
    const own = usage.calls.filter((call) => call.agentId === agentId);
    const figures = own.reduce((sum, call) => addCall(sum, call), emptyFigures());
    evidence.usage = {
      ...base, scope: 'subagent', perCallRows: usage.calls.length, complete: perCallComplete(usage.calls.length, replies),
      ...(own.length ? { agent: { calls: figures.calls, credits: credits(figures.nanoAiu), inputTokens: figures.inputTokens, cacheReadTokens: figures.cacheReadTokens, cacheWriteTokens: figures.cacheWriteTokens, outputTokens: figures.outputTokens } } : {}),
    };
    return;
  }
  const indexes: number[] = [];
  const starts: TurnStart[] = [];
  evidence.turns.forEach((turn, index) => {
    if (turn.timestamp !== null) {
      indexes.push(index);
      starts.push({ ts: turn.timestamp, number: index + 1 });
    }
  });
  const stamps = scoped.map((event) => Date.parse(event.timestamp ?? '')).filter(Number.isFinite);
  const attribution = attributeCalls(all, starts, usage.calls, stamps.length ? Math.max(...stamps) + 5000 : -Infinity);
  const totals = totalsPerTurn(all, starts);
  const complete = perCallComplete(attribution.recorded.calls + attribution.unattributed.calls, replies);
  indexes.forEach((turnIndex, slot) => {
    const turn: ListingTurnEvidence = evidence.turns[turnIndex]!;
    const figures = attribution.turns[slot];
    const running = totals.turns[slot];
    const perCall = figures ? combined(figures.own, figures.agents) : null;
    if (figures && perCall) {
      turn.promptTokens = perCall.inputTokens;
      turn.completionTokens = perCall.outputTokens;
    }
    if (figures && perCall && (complete || !running)) {
      turn.credits = credits(perCall.nanoAiu);
      turn.usage = { basis: complete ? 'per-call' : 'per-call-partial', span: null, calls: perCall.calls, cacheReadTokens: perCall.cacheReadTokens, cacheWriteTokens: perCall.cacheWriteTokens, perCallCredits: null };
    } else if (running) {
      turn.credits = credits(running.nanoAiu);
      turn.usage = {
        basis: 'running-total', span: running.fromTurn < running.toTurn ? { from: running.fromTurn, to: running.toTurn } : null,
        calls: perCall?.calls ?? 0, cacheReadTokens: perCall?.cacheReadTokens ?? 0, cacheWriteTokens: perCall?.cacheWriteTokens ?? 0,
        perCallCredits: perCall ? credits(perCall.nanoAiu) : null,
      };
    }
  });
  evidence.usage = {
    ...base, scope: 'main', perCallRows: attribution.recorded.calls + attribution.unattributed.calls, complete,
    beforeFirstTurnCredits: credits(totals.before), unmatchedCredits: credits(attribution.unattributed.nanoAiu),
    byModel: attribution.byModel.map(([model, figures]) => ({
      model, calls: figures.calls, credits: credits(figures.nanoAiu), inputTokens: figures.inputTokens,
      cacheReadTokens: figures.cacheReadTokens, cacheWriteTokens: figures.cacheWriteTokens, outputTokens: figures.outputTokens,
    })),
  };
}
