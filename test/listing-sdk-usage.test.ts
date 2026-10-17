import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDetailedSessionListingHtml } from '../src/session/detailed-listing.ts';
import { attachSdkListingUsage } from '../src/session/listing-sdk-usage.ts';
import type { LogUsage } from '../src/session/listing-sdk-usage.ts';
import type { ListingTurnEvidence } from '../src/session/listing-evidence-types.ts';
import type { SdkEvent } from '../src/session/sdk-events.ts';
import type { SdkEventSource } from '../src/session/sources.ts';
import type { UsageCall } from '../src/session/sdk-usage.ts';
import { detailedEvidence, detailedOccurrence } from './detailed-listing-fixture.ts';

let line = 0;
const event = (type: string, data: Record<string, unknown>, at: string, agentId?: string): SdkEvent =>
  ({ type, data, raw: { type, data }, recordedLine: '', line: ++line, timestamp: at, id: `l${line}`, ...(agentId ? { agentId } : {}) });

const T = (second: number) => `2026-10-14T10:00:${String(second).padStart(2, '0')}.000Z`;
const ms = (second: number) => Date.parse(T(second));

const source = (scope: SdkEventSource['scope'] = { kind: 'main' }): SdkEventSource => ({
  kind: 'sdk-events', provider: 'agent-host', sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', path: 'C:\\home\\.copilot\\session-state\\aaaaaaaa\\events.jsonl',
  schemaVersion: 1, producer: 'test', scope, chatIdentity: 'agent-host-copilotcli:/11111111-2222-4333-8444-555555555555',
  provenance: { userDataRoot: 'C:\\Code', workspaceStoragePath: 'C:\\Code\\w' }, identityEvidence: [], identityWarnings: [], scopeWarnings: [], sha256: 'x',
});

const call = (second: number, nanoAiu: number, extra: Partial<UsageCall> = {}): UsageCall => ({
  at: ms(second), agentId: null, model: 'gpt-test', inputTokens: 1000, cacheReadTokens: 400, cacheWriteTokens: 100,
  outputTokens: 50, reasoningTokens: 10, nanoAiu, durationMs: 900, ...extra,
});

const turn = (id: string, second: number): ListingTurnEvidence => ({
  id, prompt: `Question ${id}`, timestamp: ms(second), role: 'human', selectedModel: null, models: ['gpt-test'], auto: false, effort: null,
  responsePresent: true, canceled: false, error: false, files: [],
});

const events = (): SdkEvent[] => [
  event('user.message', { content: 'Q1' }, T(1)),
  event('assistant.message', { model: 'gpt-test', content: 'A1' }, T(2)),
  event('subagent.started', { toolCallId: 'task1', agentName: 'dig' }, T(3), 'agent-1'),
  event('assistant.message', { model: 'gpt-test', content: 'child' }, T(4), 'agent-1'),
  event('session.usage_checkpoint', { totalNanoAiu: 4_000_000_000 }, T(10)),
  event('user.message', { content: 'Q2' }, T(20)),
  event('assistant.message', { model: 'gpt-test', content: 'A2' }, T(22)),
  event('user.message', { content: 'Q3' }, T(40)),
  event('assistant.message', { model: 'gpt-test', content: 'A3' }, T(41)),
  event('session.usage_checkpoint', { totalNanoAiu: 10_000_000_000 }, T(42)),
];

const evidenceWith = () => detailedEvidence({ turns: [turn('1', 1), turn('2', 20), turn('3', 40)] });
const noRows: LogUsage = { calls: [], source: 'none' };

test('running totals give agent turns credits, with a range where one checkpoint covers several turns', () => {
  const evidence = evidenceWith();
  attachSdkListingUsage(evidence, events(), events(), source(), noRows);
  const [one, two, three] = evidence.turns;
  assert.equal(one!.credits, 4);
  assert.equal(one!.usage!.basis, 'running-total');
  assert.equal(one!.usage!.span, null);
  assert.equal(two!.credits, undefined, 'a turn with no checkpoint of its own shows nothing');
  assert.equal(three!.credits, 6);
  assert.deepEqual(three!.usage!.span, { from: 2, to: 3 });
  assert.equal(evidence.usage!.scope, 'main');
  assert.equal(evidence.usage!.source, 'none');
  assert.equal(evidence.usage!.loggedCredits, 10);
});

test('complete per-call rows give credits and tokens per turn, including delegated agents', () => {
  const evidence = evidenceWith();
  const rows: LogUsage = {
    source: 'session-store',
    calls: [call(2, 1_000_000_000), call(4, 500_000_000, { agentId: 'agent-1' }), call(22, 2_000_000_000), call(41, 3_000_000_000)],
  };
  attachSdkListingUsage(evidence, events(), events(), source(), rows);
  const [one, two, three] = evidence.turns;
  assert.equal(one!.credits, 1.5);
  assert.equal(one!.usage!.basis, 'per-call');
  assert.equal(one!.promptTokens, 2000);
  assert.equal(one!.completionTokens, 100);
  assert.equal(two!.credits, 2);
  assert.equal(three!.credits, 3);
  assert.equal(evidence.usage!.complete, true);
  assert.equal(evidence.usage!.perCallRows, 4);
  assert.equal(evidence.usage!.replies, 4);
  assert.deepEqual(evidence.usage!.byModel.map((item) => [item.model, item.calls, item.credits]), [['gpt-test', 4, 6.5]]);
});

test('partial per-call rows do not stand in for a turn that has a running total', () => {
  const evidence = evidenceWith();
  attachSdkListingUsage(evidence, events(), events(), source(), { source: 'session-store', calls: [call(2, 500_000_000)] });
  const [one, two, three] = evidence.turns;
  assert.equal(evidence.usage!.complete, false);
  assert.equal(one!.credits, 4, 'the running total wins');
  assert.equal(one!.usage!.perCallCredits, 0.5);
  assert.equal(one!.promptTokens, 1000, 'tokens exist only from the rows');
  assert.equal(two!.credits, undefined);
  assert.equal(three!.credits, 6);
});

test('partial rows are shown as a lower bound where no running total exists', () => {
  const evidence = evidenceWith();
  const noTotals = events().filter((item) => item.type !== 'session.usage_checkpoint');
  attachSdkListingUsage(evidence, noTotals, noTotals, source(), { source: 'event-log', calls: [call(2, 500_000_000)] });
  assert.equal(evidence.turns[0]!.credits, 0.5);
  assert.equal(evidence.turns[0]!.usage!.basis, 'per-call-partial');
});

test('a delegated agent scope shows only its own calls, and nothing is invented without data', () => {
  const evidence = detailedEvidence();
  const child = source({ kind: 'subagent', agentId: 'agent-1', parentToolCallId: 'task1' } as SdkEventSource['scope']);
  attachSdkListingUsage(evidence, events(), events(), child, { source: 'session-store', calls: [call(4, 500_000_000, { agentId: 'agent-1' }), call(2, 1_000_000_000)] });
  assert.equal(evidence.usage!.scope, 'subagent');
  assert.equal(evidence.usage!.agent!.credits, 0.5);
  assert.equal(evidence.usage!.agent!.calls, 1);
  const bare = detailedEvidence();
  const none = events().filter((item) => item.type !== 'session.usage_checkpoint');
  attachSdkListingUsage(bare, none, none, source(), noRows);
  assert.equal(bare.usage, undefined);
  assert.equal(bare.turns[0]!.credits, undefined);
});

test('the detailed listing shows agent credits with their basis, the span, and the logged total', () => {
  const evidence = evidenceWith();
  attachSdkListingUsage(evidence, events(), events(), source(), noRows);
  const html = formatDetailedSessionListingHtml([detailedOccurrence('agent', {
    provider: 'agent-host',
    backing: { status: 'verified', source: source() },
  })], new Map([['agent', evidence]]));
  assert.match(html, /💳 4c/u);
  assert.match(html, /💳 6c/u);
  assert.match(html, />from totals</u);
  assert.match(html, />turns 2-3</u);
  assert.match(html, /Last logged total \(whole log\)/u);
  assert.match(html, /10\.00 credits|10\.0 credits/u);
  assert.ok(!html.includes('Usage unavailable'));
  assert.ok(!html.includes('💳 0c'));
});
