import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { renderSdkExport } from '../src/session/sdk-export.ts';
import { buildSdkSession } from '../src/session/sdk-session.ts';
import { attachRunningTotals, attachUsage, copilotHomeOf, loggedTotal, readUsageLedger, usageFromEvents } from '../src/session/sdk-usage.ts';
import type { UsageCall } from '../src/session/sdk-usage.ts';
import type { SdkEvent } from '../src/session/sdk-events.ts';
import type { SdkEventSource } from '../src/session/sources.ts';
import { fmtAiCredits } from '../src/text.ts';

let line = 0;
const event = (type: string, data: Record<string, unknown>, timestamp: string, agentId?: string): SdkEvent =>
  ({ type, data, raw: { type, data }, recordedLine: '', line: ++line, timestamp, id: `u${line}`, ...(agentId ? { agentId } : {}) });

const call = (at: string, nanoAiu: number, extra: Partial<UsageCall> = {}): UsageCall => ({
  at: Date.parse(at), agentId: null, model: 'gpt-test', inputTokens: 1000, cacheReadTokens: 400, cacheWriteTokens: 100,
  outputTokens: 50, reasoningTokens: 10, nanoAiu, durationMs: 900, ...extra,
});

const T = (second: number) => `2026-10-14T10:00:${String(second).padStart(2, '0')}.000Z`;

// Two prompts, one delegated agent started in the first turn.
const conversation = (): SdkEvent[] => [
  event('session.start', { copilotVersion: '1.0.0' }, T(0)),
  event('user.message', { content: 'First question' }, T(1)),
  event('assistant.message', { model: 'gpt-test', content: 'Delegating.', toolRequests: [{ toolCallId: 'task1', name: 'task', arguments: { prompt: 'Dig', description: 'Dig in' } }] }, T(2)),
  event('subagent.started', { toolCallId: 'task1', agentName: 'dig', agentDisplayName: 'Digger', agentDescription: 'Dig in', model: 'gpt-test' }, T(3), 'agent-1'),
  event('user.message', { content: 'Dig' }, T(3), 'agent-1'),
  event('assistant.message', { model: 'gpt-test', content: 'Found it.' }, T(4), 'agent-1'),
  event('tool.execution_complete', { toolCallId: 'task1', success: true, result: { content: 'Found it.' } }, T(5)),
  event('assistant.message', { model: 'gpt-test', content: 'Answer one.' }, T(6)),
  event('user.message', { content: 'Second question' }, T(20)),
  event('assistant.message', { model: 'gpt-test', content: 'Answer two.' }, T(22)),
  event('session.shutdown', { totalNanoAiu: 9_000_000_000 }, T(30)),
];

const source = (): SdkEventSource => ({
  kind: 'sdk-events', provider: 'agent-host', sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', path: 'C:\\home\\.copilot\\session-state\\aaaaaaaa\\events.jsonl',
  schemaVersion: 1, producer: 'test', scope: { kind: 'main' }, chatIdentity: 'agent-host-copilotcli:/11111111-2222-4333-8444-555555555555',
  provenance: { userDataRoot: 'C:\\Code', workspaceStoragePath: 'C:\\Code\\w' }, identityEvidence: [], identityWarnings: [], scopeWarnings: [], sha256: 'x',
});

const build = (events: SdkEvent[]) => buildSdkSession(events, events.filter((item) => item.agentId === undefined), { title: 'T', assetsDirectory: 'a' });

test('credits are the recorded nano-AIU over a billion, with enough digits for a cheap call', () => {
  assert.equal(fmtAiCredits(1_000_000_000), '1.00');
  assert.equal(fmtAiCredits(15_458_500), '0.0155');
  assert.equal(fmtAiCredits(12_345_678_901_234), '12,345.68');
  assert.equal(fmtAiCredits(0), '0.0000');
});

test('calls are attributed to turns by time and to delegated agents by agent id', () => {
  const events = conversation();
  const { session } = build(events);
  const calls = [
    call(T(2), 1_000_000_000),
    call(T(4), 500_000_000, { agentId: 'agent-1' }),
    call(T(6), 2_000_000_000),
    call(T(22), 3_000_000_000),
    call(T(50), 700_000_000),
    call(T(4), 300_000_000, { agentId: 'ghost' }),
  ];
  attachUsage(session, calls, 'session-store', events, events.filter((item) => item.agentId === undefined));
  const [first, second] = session.turns;
  assert.equal(first!.scalar.usage!.own.calls, 2);
  assert.equal(first!.scalar.usage!.own.nanoAiu, 3_000_000_000);
  assert.equal(first!.scalar.usage!.agents.nanoAiu, 500_000_000);
  assert.equal(second!.scalar.usage!.own.nanoAiu, 3_000_000_000);
  assert.equal(second!.scalar.usage!.agents.calls, 0);
  const sub = first!.toolNodes.find((node) => node.subagent)!.subagent!;
  assert.equal(sub.usage!.calls, 1);
  const usage = session.usage!;
  assert.equal(usage.source, 'session-store');
  assert.equal(usage.recorded.calls, 4);
  assert.equal(usage.recorded.nanoAiu, 6_500_000_000);
  assert.equal(usage.unattributed.calls, 2, 'a call after the conversation and a call of an unknown agent');
  assert.equal(usage.unattributed.nanoAiu, 1_000_000_000);
  assert.equal(usage.replies, 4);
  assert.equal(usage.logged!.nanoAiu, 9_000_000_000);
  assert.equal(usage.logged!.event, 'session.shutdown');
  assert.equal(usage.logged!.shutdowns, 1);
  assert.deepEqual(usage.byModel.map(([model, figures]) => [model, figures.calls]), [['gpt-test', 4]]);
});

test('nothing recorded leaves usage unset, and a logged total alone is reported as such', () => {
  const events = conversation().filter((item) => item.type !== 'session.shutdown');
  const bare = build(events);
  attachUsage(bare.session, [], 'event-log', events, events);
  assert.equal(bare.session.usage, undefined);
  const withTotal = build(conversation());
  attachUsage(withTotal.session, [], 'event-log', conversation(), conversation());
  assert.equal(withTotal.session.usage!.source, 'none');
  assert.equal(withTotal.session.usage!.logged!.nanoAiu, 9_000_000_000);
  assert.equal(withTotal.session.turns[0]!.scalar.usage, undefined);
});

test('the last cumulative total wins and shutdown totals are never added', () => {
  const events = [
    event('session.shutdown', { totalNanoAiu: 4_000_000_000 }, T(1)),
    event('session.usage_checkpoint', { totalNanoAiu: 6_000_000_000 }, T(2)),
    event('session.shutdown', { totalNanoAiu: 9_000_000_000 }, T(3)),
  ];
  assert.deepEqual(loggedTotal(events), { nanoAiu: 9_000_000_000, event: 'session.shutdown', at: T(3), shutdowns: 2 });
  assert.equal(loggedTotal([event('user.message', {}, T(1))]), null);
});

test('usage events in the log become calls with cache and reasoning tokens', () => {
  const calls = usageFromEvents([
    event('model.model_call_success', {
      modelCall: { model: 'gpt-6-luna' }, modelCallDurationMs: 1182,
      responseChunk: {
        usage: { prompt_tokens: 5059, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 4241, cache_write_tokens: 815 }, completion_tokens_details: { reasoning_tokens: 3 } },
        copilot_usage: { total_nano_aiu: 15_458_500 },
      },
    }, T(4), 'agent-9'),
    event('model.model_call_success', { modelCall: { model: 'x' }, responseChunk: { usage: {} } }, T(5)),
  ]);
  assert.equal(calls.length, 1, 'a call without a recorded nano-AIU figure is not invented');
  assert.deepEqual(calls[0], {
    at: Date.parse(T(4)), agentId: 'agent-9', model: 'gpt-6-luna', inputTokens: 5059, cacheReadTokens: 4241, cacheWriteTokens: 815,
    outputTokens: 20, reasoningTokens: 3, nanoAiu: 15_458_500, durationMs: 1182,
  });
});

test('the CLI usage store is read for one backing session without being changed', async (context) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-ledger-'));
  context.after(() => fs.rm(home, { recursive: true, force: true }));
  assert.deepEqual(readUsageLedger(home, 'any').calls, [], 'a missing store is not an error');
  assert.ok(readUsageLedger(home, 'any').problem);
  const file = path.join(home, 'session-store.db');
  const database = new DatabaseSync(file);
  database.exec(`CREATE TABLE assistant_usage_events (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, created_at TEXT, agent_id TEXT, model TEXT,
    input_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, output_tokens INTEGER, reasoning_tokens INTEGER, total_nano_aiu INTEGER, duration_ms INTEGER)`);
  const insert = database.prepare('INSERT INTO assistant_usage_events (session_id, created_at, agent_id, model, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens, total_nano_aiu, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insert.run('mine', '2026-10-14T10:00:02.000Z', null, 'gpt-test', 1000, 400, 100, 50, 10, 1_000_000_000, 900);
  insert.run('mine', '2026-10-14 10:00:04', 'agent-1', 'gpt-test', 10, 0, 0, 5, 0, 500_000_000, 100);
  insert.run('mine', '2026-10-14T10:00:05.000Z', null, 'gpt-test', 10, 0, 0, 5, 0, null, 100);
  insert.run('other', '2026-10-14T10:00:02.000Z', null, 'gpt-test', 1, 0, 0, 1, 0, 1, 1);
  database.close();
  const before = await fs.readFile(file);
  const { calls, problem } = readUsageLedger(home, 'mine');
  assert.equal(problem, null);
  assert.equal(calls.length, 2, 'a row with no recorded nano-AIU is skipped, not counted as zero');
  assert.equal(calls[1]!.agentId, 'agent-1');
  assert.equal(calls[1]!.at, Date.parse('2026-10-14T10:00:04.000Z'), 'a zone-less time is read as UTC');
  assert.deepEqual(await fs.readFile(file), before);
  assert.equal(copilotHomeOf(path.join(home, 'session-state', 'abc', 'events.jsonl')), home);
});

test('the export shows credits per turn, per delegated agent and per model, with source, coverage and the logged total', () => {
  const events = conversation();
  const ledger = [call(T(2), 1_000_000_000), call(T(4), 500_000_000, { agentId: 'agent-1' }), call(T(6), 2_000_000_000), call(T(22), 3_000_000_000)];
  const out = renderSdkExport(events, source(), { title: 'Agent chat', assetsDirectory: 'a', outputPath: 'x.md', generatedAt: '2026-10-14T12:00:00Z', ledger });
  const md = out.markdown;
  assert.match(md, /\| Model \| Calls \| Input tokens \| Cache read \| Cache write \| Output tokens \| AI credits \|/u);
  assert.match(md, /\| \*\*Recorded total\*\* \| 4 \| 4,000 \| 1,600 \| 400 \| 200 \| 6\.50 \|/u);
  assert.match(md, /💳 3\.50 credits \(3\.00 main \+ 0\.5000 in 1 sub-agent call\)/u);
  assert.match(md, /💳 3\.00 credits/u);
  assert.match(md, /0\.5000 credits in 1 call/u, 'the delegated agent shows its own credits');
  assert.match(md, /Per-call source: the Copilot CLI session store/u);
  assert.match(md, /4 usage rows for 4 assistant replies in this log \(100% of them\)/u);
  assert.match(md, /Last logged total for the whole event log: 9\.00 credits \(about \$0\.09 at \$0\.01 per credit\), from `session\.shutdown`/u);
  assert.match(md, /rows add up to 72% of it/u);
  assert.match(md, /never estimated from token counts/u);
  assert.ok(!/not recorded for this chat/u.test(md));
  assert.match(md, /\| AI credits \| 3\.50 \(main 3\.00, delegated agents 0\.5000\) \|/u);
});

test('a chat with only a logged total says per-call usage is not recorded, and one with nothing says not recorded', () => {
  const only = renderSdkExport(conversation(), source(), { title: 'Agent chat', assetsDirectory: 'a', outputPath: 'x.md', generatedAt: '2026-10-14T12:00:00Z' });
  assert.match(only.markdown, /Per-call usage is not recorded for this chat/u);
  assert.match(only.markdown, /💳 9\.00 credits \(last logged total; no per-call usage recorded\)/u);
  assert.match(only.markdown, /no per-call usage recorded for this turn/u);
  const none = renderSdkExport(conversation().filter((item) => item.type !== 'session.shutdown'), source(), { title: 'Agent chat', assetsDirectory: 'a', outputPath: 'x.md', generatedAt: '2026-10-14T12:00:00Z' });
  assert.match(none.markdown, /tokens and credits not recorded for this chat/u);
  assert.ok(!/0\.00 credits|AI credits/u.test(none.markdown));
});

test('usage events in the log are used when the CLI store has no rows', () => {
  const events = conversation();
  events.splice(3, 0, event('model.model_call_success', {
    modelCall: { model: 'gpt-test' }, modelCallDurationMs: 10,
    responseChunk: { usage: { prompt_tokens: 100, completion_tokens: 5 }, copilot_usage: { total_nano_aiu: 250_000_000 } },
  }, T(2)));
  const out = renderSdkExport(events, source(), { title: 'Agent chat', assetsDirectory: 'a', outputPath: 'x.md', generatedAt: '2026-10-14T12:00:00Z' });
  assert.match(out.markdown, /Per-call source: `model\.model_call_success` events in the event log/u);
  assert.match(out.markdown, /💳 0\.2500 credits/u);
});

const withTotals = (): SdkEvent[] => [
  event('session.start', { copilotVersion: '1.0.0' }, T(0)),
  event('session.usage_checkpoint', { totalNanoAiu: 500_000_000 }, T(0)),
  event('user.message', { content: 'First question' }, T(1)),
  event('assistant.message', { model: 'gpt-test', content: 'Answer one.', outputTokens: 120 }, T(5)),
  event('session.usage_checkpoint', { totalNanoAiu: 2_500_000_000 }, T(10)),
  event('user.message', { content: 'Second question' }, T(20)),
  event('assistant.message', { model: 'gpt-test', content: 'Answer two.', outputTokens: 30 }, T(22)),
  event('user.message', { content: 'Third question' }, T(40)),
  event('assistant.message', { model: 'gpt-test', content: 'Answer three.', outputTokens: 50 }, T(41)),
  event('session.usage_checkpoint', { totalNanoAiu: 5_500_000_000 }, T(42)),
  event('session.shutdown', { totalNanoAiu: 5_500_000_000 }, T(43)),
];

test('running totals give each turn its difference, and a checkpoint that covers several turns is shown as a range', () => {
  const events = withTotals();
  const { session } = build(events);
  attachUsage(session, [], 'event-log', events, events);
  attachRunningTotals(session, events);
  const [one, two, three] = session.turns.map((turn) => turn.scalar.usageTotals);
  assert.deepEqual(one, { nanoAiu: 2_000_000_000, fromTurn: 1, toTurn: 1 });
  assert.equal(two, undefined, 'a turn with no checkpoint gets nothing of its own');
  assert.deepEqual(three, { nanoAiu: 3_000_000_000, fromTurn: 2, toTurn: 3 });
  assert.equal(session.usage!.beforeFirstTurnNanoAiu, 500_000_000);
  assert.equal(session.usage!.turnsWithTotals, 2);
  assert.deepEqual(session.turns.map((turn) => turn.scalar.messageOutputTokens), [120, 30, 50]);
});

test('a shutdown that equals the last checkpoint adds nothing, and a total that goes down is never negative', () => {
  const events = [
    event('user.message', { content: 'Q' }, T(1)),
    event('session.usage_checkpoint', { totalNanoAiu: 4_000_000_000 }, T(5)),
    event('session.shutdown', { totalNanoAiu: 4_000_000_000 }, T(6)),
    event('session.usage_checkpoint', { totalNanoAiu: 1_000_000_000 }, T(7)),
  ];
  const { session } = build(events);
  attachUsage(session, [], 'event-log', events, events);
  attachRunningTotals(session, events);
  assert.equal(session.turns[0]!.scalar.usageTotals!.nanoAiu, 4_000_000_000);
});

test('the export shows credits from running totals per turn, the most expensive turns, and message output tokens', () => {
  const out = renderSdkExport(withTotals(), source(), { title: 'Agent chat', assetsDirectory: 'a', outputPath: 'x.md', generatedAt: '2026-10-14T12:00:00Z' });
  const md = out.markdown;
  assert.match(md, /Per-call usage is not recorded for this chat/u);
  assert.match(md, /Most expensive: \[Q3\]\(#user-message-3\) 3\.00 \(60%\) · \[Q1\]\(#user-message-1\) 2\.00 \(40%\)/u);
  assert.match(md, /\| 3 \| Third question \| 3\.00 \| covers turns 2-3 \|/u);
  assert.match(md, /💳 2\.00 credits \(from running totals\)/u);
  assert.match(md, /💳 3\.00 credits \(from running totals; covers turns 2-3, which the log did not separate\)/u);
  assert.match(md, /🔢 120 output tokens \(from message records; input not recorded\)/u);
  assert.match(md, /0\.5000 credits were added to the running total before the first prompt/u);
  assert.ok(!/0\.00 credits/u.test(md));
});

test('partial per-call rows never stand in for a turn that has a running total', () => {
  const events = withTotals();
  const out = renderSdkExport(events, source(), { title: 'Agent chat', assetsDirectory: 'a', outputPath: 'x.md', generatedAt: '2026-10-14T12:00:00Z', ledger: [call(T(5), 500_000_000)] });
  const md = out.markdown;
  assert.match(md, /💳 2\.00 credits \(from running totals\)/u);
  assert.ok(!/💳 0\.5000 credits<\/sub>/u.test(md), 'the partial row is not shown as the turn cost');
  assert.match(md, /\| AI credits \(from running totals\) \| 2\.00 \|/u);
  const bare = renderSdkExport(events.filter((item) => item.type !== 'session.usage_checkpoint' && item.type !== 'session.shutdown'), source(), { title: 'Agent chat', assetsDirectory: 'a', outputPath: 'x.md', generatedAt: '2026-10-14T12:00:00Z', ledger: [call(T(5), 500_000_000)] });
  assert.match(bare.markdown, /💳 at least 0\.5000 credits \(per-call rows are partial for this chat\)/u);
});
