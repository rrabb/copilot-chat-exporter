// Credits and tokens of one Agent Host or Copilot CLI conversation, for the detailed listing.
//
// The attribution is the same code the Markdown export uses (`sdk-usage.ts`), on the listing's
// own turn list. Credits are AI credits: recorded nano-AIU / 1,000,000,000.

import type { SessionUsage, UsageSelection } from '../types.ts';
import type { ListingEvidence, ListingTurnEvidence } from './listing-evidence-types.ts';
import type { SdkEvent } from './sdk-events.ts';
import type { SdkEventSource } from './sources.ts';
import {
  NANO_PER_CREDIT, attributeCalls, copilotHomeOf, loggedTotal, readUsageLedger,
  selectUsage, totalsPerTurn, usageComplete, usageForScope, usageScopeEvents,
} from './sdk-usage.ts';
import type { TurnStart, UsageCall } from './sdk-usage.ts';
import { sumUsageFigures } from './usage-figures.ts';

/** Per-call usage of one log: the CLI store first, else the log's own usage events. Read once per log. */
export interface LogUsage { calls: UsageCall[]; source: SessionUsage['source']; selection?: UsageSelection }

export function readLogUsage (all: readonly SdkEvent[], source: SdkEventSource): LogUsage {
  const stored = readUsageLedger(copilotHomeOf(source.path), source.sessionId).calls;
  return selectUsage(all, stored);
}

const credits = (nano: number | null) => nano === null ? null : nano / NANO_PER_CREDIT;

/** Sets chat-level usage and, for a main conversation, credits and tokens on each turn. Never throws for missing data. */
export function attachSdkListingUsage (
  evidence: ListingEvidence,
  all: readonly SdkEvent[],
  scoped: readonly SdkEvent[],
  source: SdkEventSource,
  usage: LogUsage,
): void {
  const rootAgentId = source.scope.kind === 'subagent' ? source.scope.agentId : null;
  const relevant = usageScopeEvents(all, rootAgentId);
  const selected = usageForScope(all, usage, rootAgentId);
  const calls = selected.calls;
  const logged = rootAgentId === null ? loggedTotal(all) : null;
  if (!calls.length && !logged && !selected.selection?.selectedForWholeLog && !selected.selection?.receiptRecords)
    return;
  const replies = relevant.filter((event) => event.type === 'assistant.message').length;
  const base = {
    source: usage.source, replies, loggedCredits: logged ? credits(logged.nanoAiu) : null, loggedEvent: logged?.event ?? null,
    shutdowns: logged?.shutdowns ?? 0, beforeFirstTurnCredits: 0, unmatchedCredits: 0, byModel: [],
  };
  const indexes: number[] = [];
  const starts: TurnStart[] = [];
  evidence.turns.forEach((turn, index) => {
    if (turn.timestamp !== null) {
      indexes.push(index);
      starts.push({ ts: turn.timestamp, number: index + 1 });
    }
  });
  const stamps = scoped.map((event) => Date.parse(event.timestamp ?? '')).filter(Number.isFinite);
  const attribution = attributeCalls(relevant, starts, calls, stamps.length ? Math.max(...stamps) + 5000 : -Infinity, rootAgentId);
  const totals = totalsPerTurn(rootAgentId === null ? all : [], starts);
  const complete = usageComplete(calls, replies, selected.selection);
  indexes.forEach((turnIndex, slot) => {
    const turn: ListingTurnEvidence = evidence.turns[turnIndex]!;
    const figures = attribution.turns[slot];
    const running = totals.turns[slot];
    const perCall = figures ? sumUsageFigures(figures.own, figures.agents) : null;
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
        calls: perCall?.calls ?? 0, cacheReadTokens: perCall ? perCall.cacheReadTokens : null, cacheWriteTokens: perCall ? perCall.cacheWriteTokens : null,
        perCallCredits: perCall ? credits(perCall.nanoAiu) : null,
      };
    }
  });
  const ownAgent = rootAgentId === null ? undefined : attribution.byAgent.get(rootAgentId);
  evidence.usage = {
    ...base, scope: rootAgentId === null ? 'main' : 'subagent', perCallRows: calls.length, complete,
    beforeFirstTurnCredits: totals.before / NANO_PER_CREDIT, unmatchedCredits: credits(attribution.unattributed.nanoAiu),
    unmatchedCalls: attribution.unattributed.calls,
    ...(selected.selection ? { selection: selected.selection } : {}),
    ...(ownAgent ? { agent: { calls: ownAgent.calls, credits: credits(ownAgent.nanoAiu), inputTokens: ownAgent.inputTokens, cacheReadTokens: ownAgent.cacheReadTokens, cacheWriteTokens: ownAgent.cacheWriteTokens, outputTokens: ownAgent.outputTokens } } : {}),
    byModel: attribution.byModel.map(([model, figures]) => ({
      model, calls: figures.calls, credits: credits(figures.nanoAiu), inputTokens: figures.inputTokens,
      cacheReadTokens: figures.cacheReadTokens, cacheWriteTokens: figures.cacheWriteTokens, outputTokens: figures.outputTokens,
    })),
  };
}
