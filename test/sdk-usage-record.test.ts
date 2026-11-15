import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSdkSession } from '../src/session/sdk-session.ts';
import { parseUsageRecords } from '../src/session/sdk-usage-record.ts';
import { addCall, attributeCalls, emptyFigures, selectUsage } from '../src/session/sdk-usage.ts';
import { renderSdkExport } from '../src/session/sdk-export.ts';
import { attachSdkListingUsage } from '../src/session/listing-sdk-usage.ts';
import type { SdkEvent } from '../src/session/sdk-events.ts';
import { eventsInScope } from '../src/session/sdk-events.ts';
import type { SdkEventSource } from '../src/session/sources.ts';
import { detailedEvidence } from './detailed-listing-fixture.ts';

let line = 0;
const event = (type: string, data: Record<string, unknown>, second = 2, agentId?: string): SdkEvent => ({
  type, data, raw: { type, data }, recordedLine: '', line: ++line, id: `usage-${line}`,
  timestamp: `2026-10-14T10:00:${String(second).padStart(2, '0')}Z`, ...(agentId ? { agentId } : {}),
});
const usage = (extra: Record<string, unknown> = {}) => ({
  accounting: { usageId: 'call-one', sourceSessionId: 'source-one', sequence: 1 },
  model: 'future-model', inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 3,
  reasoningTokens: 2, duration: 150, copilotUsage: { totalNanoAiu: 10_000_000 }, ...extra,
});
const receipt = (extra: Record<string, unknown> = {}, second = 2, agentId?: string) =>
  event('session.usage_record', { usage: usage(extra) }, second, agentId);
const prompt = () => event('user.message', { content: 'Synthetic question' }, 1);
const source = (scope: SdkEventSource['scope'] = { kind: 'main' }): SdkEventSource => ({
  kind: 'sdk-events', provider: 'agent-host', sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  path: 'C:\\synthetic\\session-state\\synthetic\\events.jsonl', schemaVersion: 1, producer: 'test', scope,
  chatIdentity: 'synthetic', provenance: { userDataRoot: 'C:\\synthetic', workspaceStoragePath: 'C:\\synthetic\\workspace' },
  identityEvidence: [], identityWarnings: [], scopeWarnings: [], sha256: 'synthetic',
});
const exportOptions = { title: 'Synthetic usage', assetsDirectory: 'assets', outputPath: 'out.md', generatedAt: '2026-10-14T12:00:00Z' };

test('websocket receipt telemetry keeps all six exact keys, zero, future strings and both booleans', () => {
  const cases = [
    {
      websocketFallbackErrorKind: 'future-error', websocketFallbackReason: 'future-reason',
      websocketFallbackAfterMs: 0, websocketFallbackStatusCode: 0,
      websocketFallbackReconnectAttempted: false, websocketFallbackStartedThisCall: true,
    },
    {
      websocketFallbackErrorKind: '', websocketFallbackReason: '',
      websocketFallbackAfterMs: 12.5, websocketFallbackStatusCode: 700.25,
      websocketFallbackReconnectAttempted: true, websocketFallbackStartedThisCall: false,
    },
  ];
  for (const fields of cases) {
    const record = receipt(fields);
    const parsed = parseUsageRecords([record]);
    assert.equal(parsed.diagnostics.size, 0);
    assert.equal(parsed.calls.length, 1);
    assert.deepEqual(parsed.calls[0]?.provenance?.telemetry?.toSorted((a, b) => a.field.localeCompare(b.field)),
      Object.entries(fields).map(([field, value]) => ({ field, value })).sort((a, b) => a.field.localeCompare(b.field)));
    assert.equal(parsed.calls[0]?.nanoAiu, 10_000_000);
    assert.equal(parsed.calls[0]?.inputTokens, 100);
    const all = [prompt(), record];
    assert.deepEqual(buildSdkSession(all, all, { title: 'Websocket metadata', assetsDirectory: 'assets' }).session.census.unhandled, []);
  }
});

test('absent websocket telemetry creates no entry, including an absent status code', () => {
  const fields: Record<string, unknown> = {
    websocketFallbackErrorKind: 'future-error', websocketFallbackReason: 'future-reason',
    websocketFallbackAfterMs: 42, websocketFallbackStatusCode: 401,
    websocketFallbackReconnectAttempted: false, websocketFallbackStartedThisCall: true,
  };
  for (const omitted of Object.keys(fields)) {
    const remaining = Object.fromEntries(Object.entries(fields).filter(([field]) => field !== omitted));
    const parsed = parseUsageRecords([receipt(remaining)]);
    assert.equal(parsed.diagnostics.size, 0);
    assert.deepEqual(parsed.calls[0]?.provenance?.telemetry?.toSorted((a, b) => a.field.localeCompare(b.field)),
      Object.entries(remaining).map(([field, value]) => ({ field, value })).sort((a, b) => a.field.localeCompare(b.field)));
  }
  const absent = parseUsageRecords([receipt()]);
  assert.equal(absent.diagnostics.size, 0);
  assert.equal(absent.calls[0]?.provenance?.telemetry, undefined);
});

test('malformed websocket fields diagnose without erasing valid telemetry or financial amounts', () => {
  const groups = [
    { fields: ['websocketFallbackErrorKind', 'websocketFallbackReason'], invalid: [null, false, 0, {}, []], expected: 'a string' },
    { fields: ['websocketFallbackAfterMs', 'websocketFallbackStatusCode'], invalid: [null, '0', true, -1, NaN, Infinity, -Infinity, {}, []], expected: 'a finite nonnegative number' },
    { fields: ['websocketFallbackReconnectAttempted', 'websocketFallbackStartedThisCall'], invalid: [null, 'false', 0, 1, {}, []], expected: 'a boolean' },
  ];
  const valid: Record<string, unknown> = {
    websocketFallbackErrorKind: 'future-error', websocketFallbackReason: 'future-reason',
    websocketFallbackAfterMs: 0, websocketFallbackStatusCode: 401,
    websocketFallbackReconnectAttempted: false, websocketFallbackStartedThisCall: true,
  };
  for (const group of groups) {
    for (const field of group.fields) {
      for (const invalid of group.invalid) {
        const record = receipt({ ...valid, [field]: invalid });
        const parsed = parseUsageRecords([record]);
        assert.deepEqual(parsed.diagnostics.get(record), [`usage.${field}: expected ${group.expected}`]);
        assert.equal(parsed.calls.length, 1);
        assert.equal(parsed.conflicts, 0);
        assert.equal(parsed.calls[0]?.nanoAiu, 10_000_000);
        assert.equal(parsed.calls[0]?.inputTokens, 100);
        const expected = Object.entries(valid).filter(([key]) => key !== field).map(([field, value]) => ({ field, value }));
        assert.deepEqual(parsed.calls[0]?.provenance?.telemetry?.toSorted((a, b) => a.field.localeCompare(b.field)),
          expected.sort((a, b) => a.field.localeCompare(b.field)));
        const all = [prompt(), record];
        assert.deepEqual(buildSdkSession(all, all, { title: 'Malformed websocket metadata', assetsDirectory: 'assets' }).session.census.unhandled,
          [['session.usage_record:unsupported', 1]]);
      }
    }
  }
});

test('future websocket fields stay diagnostic while the six known fields and money remain available', () => {
  const record = receipt({
    websocketFallbackErrorKind: 'future-error', websocketFallbackReason: 'future-reason',
    websocketFallbackAfterMs: 0, websocketFallbackStatusCode: 401,
    websocketFallbackReconnectAttempted: false, websocketFallbackStartedThisCall: true,
    websocketFallbackFutureMetric: 1,
  });
  const parsed = parseUsageRecords([record]);
  assert.deepEqual(parsed.diagnostics.get(record), ['usage.websocketFallbackFutureMetric: unknown field']);
  assert.equal(parsed.calls[0]?.provenance?.telemetry?.length, 6);
  assert.equal(parsed.calls[0]?.nanoAiu, 10_000_000);
});

test('persisted receipts keep accounting, phase, effort and parent-call provenance and pass census', () => {
  const record = receipt({
    reasoningEffort: null, parentToolCallId: 'parent-call',
    fusion: { fusionId: 'fusion-one', syntheticModel: 'future-fusion', phaseId: 'phase-one', phaseKind: 'primary', role: 'solver', conversationScope: 'root', sourceModel: 'future-model', policy: 'future-policy', pattern: 'future-pattern' },
  });
  const parsed = parseUsageRecords([record]);
  assert.equal(parsed.diagnostics.size, 0);
  assert.equal(parsed.calls.length, 1);
  assert.deepEqual(parsed.calls[0]?.provenance?.accounting, { usageId: 'call-one', sourceSessionId: 'source-one', sequence: 1 });
  assert.equal(parsed.calls[0]?.provenance?.fusion?.phaseId, 'phase-one');
  assert.equal(parsed.calls[0]?.provenance?.reasoningEffort, null);
  assert.equal(parsed.calls[0]?.provenance?.parentToolCallId, 'parent-call');
  assert.equal(parsed.calls[0]?.provenance?.durationEvidence, 'sdk-milliseconds-inferred-wrapper');
  const all = [prompt(), record];
  const built = buildSdkSession(all, all, { title: 'Synthetic usage', assetsDirectory: 'assets' });
  assert.deepEqual(built.session.census.unhandled, []);
});

test('receipt identities deduplicate across resumes, not equal amounts or different source sessions', () => {
  const records = [
    receipt(), event('session.resume', {}, 3), receipt({}, 4),
    receipt({ accounting: { usageId: 'call-two', sourceSessionId: 'source-one', sequence: 2 } }, 5),
    receipt({ accounting: { usageId: 'call-one', sourceSessionId: 'source-two', sequence: 1 } }, 6),
  ];
  const parsed = parseUsageRecords(records);
  assert.equal(parsed.calls.length, 3);
  assert.equal(parsed.duplicates, 1);
  assert.equal(parsed.diagnostics.size, 0);
  assert.deepEqual(parsed.calls.map((call) => call.at), [2, 5, 6].map((second) => Date.parse(`2026-10-14T10:00:0${second}Z`)));
});

test('conflicting financial amounts or sequence quarantine one identity as unknown, with a census diagnostic', () => {
  for (const extra of [
    { copilotUsage: { totalNanoAiu: 99 } },
    { accounting: { usageId: 'call-one', sourceSessionId: 'source-one', sequence: 2 } },
  ]) {
    const records = [receipt(), receipt(extra, 3)];
    const parsed = parseUsageRecords(records);
    assert.equal(parsed.calls.length, 1);
    assert.equal(parsed.calls[0]?.nanoAiu, null);
    assert.equal(parsed.calls[0]?.provenance?.conflicted, true);
    assert.equal(parsed.calls[0]?.provenance?.accounting?.sequence, extra.accounting ? null : 1);
    assert.ok(parsed.diagnostics.size > 0);
    const all = [prompt(), ...records];
    const built = buildSdkSession(all, all, { title: 'Synthetic conflict', assetsDirectory: 'assets' });
    assert.ok(built.session.census.unhandled.some(([kind]) => kind === 'session.usage_record:unsupported'));
  }
});

test('conflicting receipt scopes never select a child owner and warn in both affected scope builds', () => {
  const records = [receipt({}, 2, 'one'), receipt({}, 3, 'two')];
  const parsed = parseUsageRecords(records);
  assert.equal(parsed.calls.length, 1);
  assert.equal(parsed.calls[0]?.agentId, null);
  assert.equal(parsed.calls[0]?.nanoAiu, null);
  for (const agentId of ['one', 'two']) {
    const scope: SdkEventSource['scope'] = { kind: 'subagent', agentId, parentToolCallId: 'absent', evidenceRecordIds: ['synthetic'] };
    const scoped = records.filter((record) => record.agentId === agentId);
    const built = buildSdkSession(records, scoped, {
      title: 'Synthetic scope conflict', assetsDirectory: 'assets',
      scope,
    });
    assert.ok(built.session.census.unhandled.some(([kind]) => kind === 'session.usage_record:unsupported'));
  }
});

test('missing and invalid receipt metrics stay unknown and poison only their aggregate metric', () => {
  const record = receipt({ inputTokens: undefined, outputTokens: -1, cacheReadTokens: Infinity, copilotUsage: {}, duration: NaN });
  const parsed = parseUsageRecords([record]);
  const call = parsed.calls[0]!;
  assert.equal(call.inputTokens, null);
  assert.equal(call.outputTokens, null);
  assert.equal(call.cacheReadTokens, null);
  assert.equal(call.nanoAiu, null);
  assert.equal(call.durationMs, null);
  assert.equal(call.cacheWriteTokens, 3);
  assert.ok(parsed.diagnostics.size > 0);
  assert.equal(emptyFigures().nanoAiu, 0);
  const sum = addCall(emptyFigures(), call);
  addCall(sum, parseUsageRecords([receipt({ accounting: { usageId: 'other', sourceSessionId: 'source-one', sequence: 2 } })]).calls[0]!);
  assert.equal(sum.nanoAiu, null);
  assert.equal(sum.outputTokens, null);
  assert.equal(sum.cacheWriteTokens, 6);
});

test('unavailable or partial billing never becomes free or complete usage', () => {
  for (const aiCreditsStatus of ['unavailable', 'partial', 'future-status']) {
    const parsed = parseUsageRecords([receipt({ aiCreditsStatus, copilotUsage: { totalNanoAiu: 0 } })]);
    assert.equal(parsed.calls[0]?.nanoAiu, null);
    assert.equal(parsed.calls[0]?.provenance?.reportedNanoAiu, 0);
    aiCreditsStatus === 'future-status' && assert.ok(parsed.diagnostics.size > 0);
  }
});

test('invalid ledger counters are unknown rather than negative or free amounts', () => {
  const call = parseUsageRecords([receipt()]).calls[0]!;
  const selected = selectUsage([receipt()], [{ ...call, nanoAiu: -1, inputTokens: Infinity, outputTokens: NaN }]);
  assert.equal(selected.source, 'session-store');
  assert.equal(selected.calls[0]?.nanoAiu, null);
  assert.equal(selected.calls[0]?.inputTokens, null);
  assert.equal(selected.calls[0]?.outputTokens, null);
  assert.equal(selected.calls[0]?.provenance?.issues?.length, 3);
});

test('unknown and malformed known receipt fields produce unsupported census without a raw receipt note', () => {
  for (const extra of [
    { futureField: true }, { contractVersion: 2 }, { reasoningEffort: 4 }, { fusion: { phaseId: 7 } },
    { provider: { id: 'test', kind: 'test', label: false } }, { copilotUsage: { totalNanoAiu: 10, tokenDetails: [{ tokenCount: -1 }] } },
    { thinkingDroppedReasons: ['valid', 4] }, { toolCounts: { view: -1 } },
  ]) {
    const all = [prompt(), receipt(extra)];
    const built = buildSdkSession(all, all, { title: 'Synthetic malformed usage', assetsDirectory: 'assets' });
    assert.ok(built.session.census.unhandled.some(([kind]) => kind === 'session.usage_record:unsupported'));
  }
  const malformed = event('session.usage_record', { usage: 'wrong' });
  assert.ok(parseUsageRecords([malformed]).diagnostics.size > 0);
});

test('source selection keeps even a partial ledger first, receipts second, legacy last, without combining', () => {
  const legacy = event('model.model_call_success', {
    modelCall: { model: 'legacy' }, modelCallDurationMs: 1,
    responseChunk: { usage: { prompt_tokens: 1, completion_tokens: 1 }, copilot_usage: { total_nano_aiu: 999 } },
  });
  const records = [receipt(), receipt({ accounting: { usageId: 'two', sourceSessionId: 'source-one', sequence: 2 } }), legacy];
  const ledger = [{ ...parseUsageRecords([receipt()]).calls[0]!, nanoAiu: 123 }];
  const stored = selectUsage(records, ledger);
  assert.equal(stored.source, 'session-store');
  assert.equal(stored.calls.length, 1);
  assert.equal(stored.calls[0]?.nanoAiu, 123);
  assert.deepEqual(stored.selection.available, { ledger: 1, receipts: 2, legacy: 1 });
  const persisted = selectUsage(records, []);
  assert.equal(persisted.source, 'usage-record');
  assert.equal(persisted.calls.length, 2);
  assert.equal(selectUsage([legacy], []).source, 'event-log');
});

test('detached usage stays unmatched while actual nested parent calls establish turn ownership', () => {
  const all = [
    prompt(),
    event('assistant.message', { content: 'Delegating', toolRequests: [{ toolCallId: 'outer-call', name: 'task' }] }),
    event('subagent.started', { toolCallId: 'outer-call' }, 3, 'outer'),
    event('assistant.message', { content: 'Nested', toolRequests: [{ toolCallId: 'inner-call', name: 'task' }] }, 4, 'outer'),
    event('subagent.started', { toolCallId: 'inner-call' }, 5, 'inner'),
    event('subagent.started', { toolCallId: 'absent-call' }, 3, 'detached'),
  ];
  const calls = parseUsageRecords([
    receipt({ accounting: { usageId: 'nested', sourceSessionId: 'source-one', sequence: 1 } }, 6, 'inner'),
    receipt({ accounting: { usageId: 'detached', sourceSessionId: 'source-one', sequence: 2 } }, 6, 'detached'),
  ]).calls;
  const result = attributeCalls(all, [{ ts: Date.parse(all[0]!.timestamp!), number: 1 }], calls, Date.parse('2026-10-14T10:01:00Z'));
  assert.equal(result.recorded.calls, 1);
  assert.equal(result.turns[0]?.agents.calls, 1);
  assert.equal(result.unattributed.calls, 1);
  assert.equal(result.byAgent.get('detached')?.calls, 1);
  assert.equal(result.byAgent.get('inner')?.calls, 1);
});

test('malformed receipt identities never fabricate calls or hide the available legacy source', () => {
  const bad = receipt({ accounting: { usageId: 'call-one', sequence: 1 } });
  const legacy = event('model.model_call_success', {
    modelCall: { model: 'legacy' }, responseChunk: { copilot_usage: { total_nano_aiu: 7 } },
  });
  const selected = selectUsage([bad, legacy]);
  assert.equal(selected.calls.length, 1);
  assert.equal(selected.source, 'event-log');
  assert.equal(selected.selection.receiptRecords, 1);
  assert.equal(selected.selection.unsupportedReceipts, 1);
  assert.equal(selected.selection.available.receipts, 0);
});

test('unsupported receipt payloads in omitted child scopes still reach the census and diagnostics', () => {
  const all = [
    prompt(),
    event('subagent.started', { toolCallId: 'ambiguous-one' }, 2, 'ambiguous'),
    event('subagent.started', { toolCallId: 'ambiguous-two' }, 3, 'ambiguous'),
    receipt({ outputTokens: -1 }, 4, 'ambiguous'),
  ];
  const built = buildSdkSession(all, eventsInScope(all, { kind: 'main' }), { title: 'Synthetic omitted usage', assetsDirectory: 'assets' });
  assert.ok(built.session.census.unhandled.some(([kind]) => kind === 'session.usage_record:unsupported'));
  assert.ok(built.session.errors.some((message) => message.includes('usage.outputTokens')));
});

const scopedConversation = (): SdkEvent[] => [
  prompt(),
  event('assistant.message', { model: 'root-model', content: 'Root answer', toolRequests: [{ toolCallId: 'selected-call', name: 'task' }] }, 2),
  receipt({ accounting: { usageId: 'root', sourceSessionId: 'source-one', sequence: 1 } }, 2),
  event('subagent.started', { toolCallId: 'selected-call' }, 3, 'selected'),
  event('user.message', { content: 'Selected task' }, 3, 'selected'),
  event('assistant.message', { model: 'child-model', content: 'Selected answer', toolRequests: [{ toolCallId: 'nested-call', name: 'task' }] }, 4, 'selected'),
  receipt({ accounting: { usageId: 'selected', sourceSessionId: 'source-one', sequence: 2 }, parentToolCallId: 'selected-call' }, 4, 'selected'),
  event('subagent.started', { toolCallId: 'nested-call' }, 5, 'nested'),
  event('user.message', { content: 'Nested task' }, 5, 'nested'),
  event('assistant.message', { model: 'nested-model', content: 'Nested answer' }, 6, 'nested'),
  receipt({ accounting: { usageId: 'nested', sourceSessionId: 'source-one', sequence: 3 }, parentToolCallId: 'nested-call' }, 6, 'nested'),
  event('subagent.started', { toolCallId: 'missing-call' }, 3, 'detached'),
  event('user.message', { content: 'Detached task' }, 3, 'detached'),
  event('assistant.message', { model: 'child-model', content: 'Detached answer' }, 4, 'detached'),
  receipt({ accounting: { usageId: 'detached', sourceSessionId: 'source-one', sequence: 4 }, parentToolCallId: 'missing-call' }, 4, 'detached'),
  event('session.shutdown', { totalNanoAiu: 9_000_000_000 }, 9),
];

test('exports and listings agree on main attribution, detached own usage and selected descendants', () => {
  const all = scopedConversation();
  const scopes: SdkEventSource['scope'][] = [
    { kind: 'main' },
    { kind: 'subagent', agentId: 'selected', parentToolCallId: 'selected-call', evidenceRecordIds: ['synthetic'] },
    { kind: 'subagent', agentId: 'detached', parentToolCallId: 'missing-call', evidenceRecordIds: ['synthetic'] },
  ];
  for (const scope of scopes) {
    const selectedSource = source(scope);
    const selectedEvents = eventsInScope(all, scope);
    const out = renderSdkExport(all, selectedSource, exportOptions);
    const evidence = detailedEvidence({
      turns: [{
        id: 'one', prompt: 'Synthetic task', timestamp: Date.parse(scope.kind === 'main' ? '2026-10-14T10:00:01Z' : '2026-10-14T10:00:03Z'),
        role: scope.kind === 'main' ? 'human' : 'delegated', selectedModel: null, models: [], auto: false, effort: null,
        responsePresent: true, canceled: false, error: false, files: [],
      }],
    });
    attachSdkListingUsage(evidence, all, selectedEvents, selectedSource, selectUsage(all));
    const parsed = out.session.usage!;
    const listed = evidence.usage!;
    assert.equal(parsed.source, 'usage-record');
    assert.equal(listed.source, parsed.source);
    assert.equal(listed.perCallRows, parsed.calls!.length);
    assert.equal(listed.replies, parsed.replies);
    assert.equal(listed.complete, parsed.complete);
    assert.equal(listed.unmatchedCredits, parsed.unattributed.nanoAiu! / 1e9);
    assert.equal(evidence.turns[0]?.credits, (parsed.recorded.nanoAiu ?? 0) / 1e9);
    if (scope.kind === 'main') {
      assert.equal(parsed.recorded.calls, 3);
      assert.equal(parsed.unattributed.calls, 1);
      assert.equal(out.session.detachedSubagents?.[0]?.usage?.calls, 1);
      assert.match(out.markdown, /Recorded usage of this child alone: 0\.0100 credits in 1 call/u);
      assert.match(out.markdown, /\| Not matched to a turn in this conversation \|/u);
      assert.ok(!out.markdown.includes('Not matched to a turn or agent'));
    } else {
      assert.equal(parsed.logged, null);
      assert.equal(listed.loggedCredits, null);
      assert.equal(parsed.turnsWithTotals, 0);
      assert.equal(out.session.turns[0]?.scalar.usageTotals, undefined);
      const expectedAgents = scope.agentId === 'selected' ? ['selected', 'nested'] : ['detached'];
      assert.deepEqual(parsed.calls?.map((call) => call.agentId), expectedAgents);
      assert.equal(parsed.replies, expectedAgents.length);
      assert.ok(!out.markdown.includes('Root answer'));
      assert.ok(!out.markdown.includes('last logged total'));
      assert.equal(out.session.turns[0]?.scalar.reasoningEffort, undefined);
    }
  }
});

test('a whole-log partial ledger prevents selected-child receipt fallback and explains the missing calls', () => {
  const all = scopedConversation();
  const ledger = [parseUsageRecords(all).calls[0]!];
  const child = source({ kind: 'subagent', agentId: 'selected', parentToolCallId: 'selected-call', evidenceRecordIds: ['synthetic'] });
  const out = renderSdkExport(all, child, { ...exportOptions, ledger });
  assert.equal(out.session.usage?.source, 'session-store');
  assert.equal(out.session.usage?.calls?.length, 0);
  assert.equal(out.session.usage?.logged, null);
  assert.deepEqual(out.session.usage?.selection?.available, { ledger: 0, receipts: 2, legacy: 0 });
  assert.match(out.markdown, /selected source contains no calls for this conversation/u);
  assert.ok(!out.markdown.includes('💳 0.0000 credits'));
  const evidence = detailedEvidence();
  attachSdkListingUsage(evidence, all, eventsInScope(all, child.scope), child, selectUsage(all, ledger));
  assert.equal(evidence.usage?.source, 'session-store');
  assert.equal(evidence.usage?.perCallRows, 0);
  assert.equal(evidence.usage?.loggedCredits, null);
  assert.deepEqual(evidence.usage?.selection, out.session.usage?.selection);
});

test('a ledger with fewer calls than an alternative never claims complete coverage from reply counts alone', () => {
  const all = [
    prompt(), event('assistant.message', { content: 'One reply', model: 'future-model' }),
    receipt(), receipt({ accounting: { usageId: 'second', sourceSessionId: 'source-one', sequence: 2 } }, 3),
    event('session.shutdown', { totalNanoAiu: 20_000_000 }, 4),
  ];
  const ledger = [parseUsageRecords(all).calls[0]!];
  const out = renderSdkExport(all, source(), { ...exportOptions, ledger });
  assert.equal(out.session.usage?.source, 'session-store');
  assert.equal(out.session.usage?.recorded.calls, 1);
  assert.equal(out.session.usage?.complete, false);
  assert.equal(out.session.turns[0]?.scalar.usage?.complete, false);
  assert.match(out.markdown, /0\.0200 credits \(from running totals/u);
  const evidence = detailedEvidence({ turns: [{
    id: 'one', prompt: 'Synthetic question', timestamp: Date.parse(all[0]!.timestamp!),
    role: 'human', selectedModel: null, models: [], auto: false, effort: null,
    responsePresent: true, canceled: false, error: false, files: [],
  }] });
  attachSdkListingUsage(evidence, all, all, source(), selectUsage(all, ledger));
  assert.equal(evidence.usage?.complete, false);
  assert.equal(evidence.turns[0]?.usage?.basis, 'running-total');
});

test('unknown billing and counters stay unknown in Markdown and listing totals without a fabricated ratio', () => {
  const all = [
    prompt(), event('assistant.message', { model: 'future-model', content: 'Synthetic answer' }, 2),
    receipt({ inputTokens: undefined, cacheReadTokens: undefined, copilotUsage: undefined }),
  ];
  const out = renderSdkExport(all, source(), exportOptions);
  assert.equal(out.session.usage?.recorded.nanoAiu, null);
  assert.match(out.markdown, /\| \*\*Recorded total\*\* \| 1 \| unknown \| unknown \| 3 \| 20 \| unknown \|/u);
  assert.match(out.markdown, /💳 unknown credits/u);
  assert.ok(!out.markdown.includes('0.0000 credits'));
  assert.ok(!out.markdown.includes('rows add up to'));
  const evidence = detailedEvidence();
  attachSdkListingUsage(evidence, all, all, source(), selectUsage(all));
  assert.equal(evidence.usage?.byModel[0]?.credits, null);
  assert.equal(evidence.usage?.byModel[0]?.inputTokens, null);
});

test('invalid cumulative totals are diagnosed and never replace the last supported running total', () => {
  const all = [
    prompt(), receipt(),
    event('session.usage_checkpoint', { totalNanoAiu: 10_000_000 }, 3),
    event('session.usage_checkpoint', { totalNanoAiu: -1 }, 4),
    event('session.shutdown', { totalNanoAiu: Infinity }, 5),
  ];
  const out = renderSdkExport(all, source(), exportOptions);
  assert.equal(out.session.usage?.recorded.calls, 1);
  assert.equal(out.session.usage?.logged?.nanoAiu, 10_000_000);
  assert.equal(out.session.turns[0]?.scalar.usageTotals?.nanoAiu, 10_000_000);
  assert.ok(out.session.census.unhandled.some(([kind]) => kind === 'session.usage_checkpoint:unsupported'));
  assert.ok(out.session.census.unhandled.some(([kind]) => kind === 'session.shutdown:unsupported'));
  assert.equal(out.session.errors.length, 2);
});
