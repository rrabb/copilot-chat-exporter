import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSdkExport } from '../src/session/sdk-export.ts';
import { buildSdkSession } from '../src/session/sdk-session.ts';
import { fusionNote } from '../src/session/sdk-fusion.ts';
import { usageFromEvents } from '../src/session/sdk-usage.ts';
import { buildSdkLossAccount, sdkLossPieces } from '../src/verify/sdk-loss-account.ts';
import { buildSdkVerifyJson } from '../src/verify/json-report.ts';
import { buildParserCheck, loadMarkdownParser } from '../src/verify/parser-check.ts';
import type { SdkEvent } from '../src/session/sdk-events.ts';
import { eventsInScope } from '../src/session/sdk-events.ts';
import type { SdkEventSource, VerifiedChildScope } from '../src/session/sources.ts';
import { MARK } from '../src/text.ts';
import { buildDocument } from '../src/markdown.ts';
import { normalizeForLoss } from '../src/verify/loss-account.ts';
import { redactText } from '../src/redaction.ts';
import { planToolText } from '../src/export-policy.ts';

let line = 0;

const event = (type: string, data: Record<string, unknown>, second: number, agentId?: string): SdkEvent => ({
  type,
  data,
  raw: { type, data },
  recordedLine: '',
  line: ++line,
  timestamp: `2026-10-14T10:00:${String(second).padStart(2, '0')}.000Z`,
  id: `f${line}`,
  ...(agentId ? { agentId } : {}),
});

const prompt = (content: string, second: number, agentId?: string): SdkEvent =>
  event('user.message', { content, messageId: `m${line}` }, second, agentId);

const assistant = (content: string, second: number, extra: Record<string, unknown> = {}, agentId?: string): SdkEvent =>
  event('assistant.message', { model: 'gpt-5.3-codex', content, ...extra }, second, agentId);

const source = (): SdkEventSource => ({
  kind: 'sdk-events',
  provider: 'agent-host',
  sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  path: 'C:\\home\\.copilot\\session-state\\aaaaaaaa\\events.jsonl',
  schemaVersion: 1,
  producer: 'test',
  scope: { kind: 'main' },
  chatIdentity: 'agent-host-copilotcli:/11111111-2222-4333-8444-555555555555',
  provenance: { userDataRoot: 'C:\\Code', workspaceStoragePath: 'C:\\Code\\workspace' },
  identityEvidence: [],
  identityWarnings: [],
  scopeWarnings: [],
  sha256: 'x',
});

const exportSdk = (events: SdkEvent[]) => renderSdkExport(events, source(), {
  title: 'Fusion synthetic',
  assetsDirectory: 'chat_assets',
  outputPath: 'out.md',
  generatedAt: '2026-10-20T12:00:00Z',
});

const count = (text: string, needle: string): number => text.split(needle).length - 1;

test('routing notes keep rule IDs independently with exact labels, including empty strings', () => {
  const cases: { fields: Record<string, unknown>; details: string[] }[] = [
    { fields: { ruleId: 'routing-rule', selectedRuleId: 'selected-rule' }, details: ['Rule ID: routing-rule', 'Selected rule ID: selected-rule'] },
    { fields: { ruleId: 'same-rule', selectedRuleId: 'same-rule' }, details: ['Rule ID: same-rule', 'Selected rule ID: same-rule'] },
    { fields: { ruleId: 'routing-only' }, details: ['Rule ID: routing-only'] },
    { fields: { selectedRuleId: 'selected-only' }, details: ['Selected rule ID: selected-only'] },
    { fields: {}, details: [] },
    { fields: { ruleId: '', selectedRuleId: '' }, details: ['Rule ID: ', 'Selected rule ID: '] },
    { fields: { ruleId: '', selectedRuleId: 'selected-rule' }, details: ['Rule ID: ', 'Selected rule ID: selected-rule'] },
    { fields: { ruleId: 'routing-rule', selectedRuleId: '' }, details: ['Rule ID: routing-rule', 'Selected rule ID: '] },
  ];
  for (const [index, item] of cases.entries()) {
    const data = { fusionId: `routing-${index}`, syntheticModel: 'future-model', pattern: 'single', ...item.fields };
    const expected = [`Fusion ID: routing-${index}`, ...item.details].join('\n\n');
    const parsed = fusionNote('session.fusion_resolved', data);
    assert.deepEqual(parsed.issues, [], `case ${index}`);
    assert.equal(parsed.note.text, expected, `case ${index}`);
    const out = exportSdk([prompt('Inspect routing', 1), event('session.fusion_resolved', data, 2)]);
    const notes = out.session.turns[0]!.body.filter(node => node.type === 'note');
    assert.equal(notes.length, 1, `case ${index}`);
    assert.equal(notes[0]?.text, expected, `case ${index}`);
    assert.equal(count(out.markdown, 'Selected rule ID:'), Object.hasOwn(item.fields, 'selectedRuleId') ? 1 : 0);
    assert.deepEqual(out.session.census.unhandled, []);
  }
});

test('malformed routing IDs diagnose their own field and keep the valid sibling in the same note', () => {
  for (const invalid of [null, 0, false, {}, []]) {
    for (const field of ['ruleId', 'selectedRuleId']) {
      const selectedInvalid = field === 'selectedRuleId';
      const data = {
        fusionId: 'routing-invalid', syntheticModel: 'future-model', pattern: 'single',
        ruleId: 'valid-routing', selectedRuleId: 'valid-selection', [field]: invalid,
      };
      const expected = `Fusion ID: routing-invalid\n\n${selectedInvalid ? 'Rule ID: valid-routing' : 'Selected rule ID: valid-selection'}`;
      const parsed = fusionNote('session.fusion_resolved', data);
      assert.deepEqual(parsed.issues, [`Expected ${field} string.`]);
      assert.equal(parsed.note.text, expected);
      const out = exportSdk([prompt('Keep valid routing evidence', 1), event('session.fusion_resolved', data, 2)]);
      const notes = out.session.turns[0]!.body.filter(node => node.type === 'note').filter(node => node.title.startsWith('🧪 Fusion resolved'));
      assert.equal(notes.length, 1);
      assert.equal(notes[0]?.text, expected);
      assert.deepEqual(out.session.census.unhandled, [['session.fusion_resolved:unsupported', 1]]);
    }
  }
});

test('single fusion phase keeps same-record projection once and keeps equal assistant text as a separate record', () => {
  const phaseText = 'Shared phase output.';
  const out = exportSdk([
    prompt('Do the task', 1),
    event('session.fusion_resolved', {
      fusionId: 'fusion-single',
      pattern: 'single',
      syntheticModel: 'hydrafusion',
      policyVersion: 'hydrafusion_v4_2026-11-10',
    }, 2),
    event('assistant.fusion_phase_completed', {
      fusionId: 'fusion-single',
      phaseId: 'phase-primary',
      phaseKind: 'primary',
      role: 'solver',
      model: 'claude-sonnet-5',
      reasoningEffort: 'medium',
      status: 'succeeded',
      content: phaseText,
      projectionMessage: { content: phaseText },
    }, 3),
    assistant(phaseText, 4),
  ]);
  assert.match(out.markdown, /Fusion resolved: hydrafusion \| pattern single/u);
  assert.match(out.markdown, /Fusion phase: primary/u);
  assert.match(out.markdown, /Model: claude-sonnet-5/u);
  assert.match(out.markdown, /Reasoning effort: medium/u);
  assert.equal(count(out.markdown, phaseText), 2, 'one phase record and one assistant message');
});

test('cascade fusion keeps differing projection text and complete handoff content', () => {
  const out = exportSdk([
    prompt('Review and repair', 1),
    event('session.fusion_resolved', { fusionId: 'fusion-cascade', syntheticModel: 'hydrafusion-max', pattern: 'cascade' }, 2),
    event('assistant.fusion_phase_completed', {
      fusionId: 'fusion-cascade',
      phaseId: 'phase-primary',
      phaseKind: 'primary',
      role: 'solver',
      model: 'gpt-5.3-codex',
      reasoningEffort: 'xhigh',
      status: 'succeeded',
      content: 'Primary answer body.',
      projectionMessage: { content: 'Projected primary answer.' },
    }, 3),
    event('assistant.fusion_phase_completed', {
      fusionId: 'fusion-cascade',
      phaseId: 'phase-judge',
      phaseKind: 'judge',
      role: 'judge',
      model: 'claude-sonnet-5',
      reasoningEffort: 'high',
      status: 'succeeded',
      content: 'Judge review body.',
      projectionMessage: { content: 'Judge review body.' },
    }, 4),
    event('session.fusion_handoff', {
      fusionId: 'fusion-cascade',
      sourcePhaseId: 'phase-primary',
      targetPhaseId: 'phase-judge',
      targetModel: 'claude-sonnet-5',
      message: { role: 'assistant', content: 'Please review this answer carefully.' },
    }, 5),
    event('assistant.fusion_phase_completed', {
      fusionId: 'fusion-cascade',
      phaseId: 'phase-repair',
      phaseKind: 'repair',
      role: 'solver',
      model: 'gpt-5.3-codex',
      reasoningEffort: 'xhigh',
      status: 'succeeded',
      content: 'Repair body.',
      projectionMessage: { content: 'Repair body.' },
    }, 6),
  ]);
  assert.match(out.markdown, /Fusion resolved: hydrafusion-max \| pattern cascade/u);
  assert.match(out.markdown, /Projected primary answer\./u);
  assert.match(out.markdown, /Please review this answer carefully\./u);
  assert.match(out.markdown, /Fusion phase: repair/u);
});

test('all six fusion families and supported usage receipts are handled', () => {
  const all = [
    prompt('Do work', 1),
    event('session.fusion_resolved', { fusionId: 'f', syntheticModel: 'hydrafusion', pattern: 'single' }, 2),
    event('assistant.fusion_phase_completed', { fusionId: 'f', phaseId: 'p', phaseKind: 'primary', role: 'solver', reasoningEffort: 'medium', content: 'Phase content' }, 3),
    event('session.fusion_commit_started', { fusionId: 'f', commitId: 'c1', sourcePhaseId: 'p', toolCallId: null }, 4),
    event('session.fusion_change_checkpoint', { codeChanges: { filesModified: ['src\\x.ts'], linesAdded: 2, linesRemoved: 1 } }, 5),
    event('session.fusion_completed', { fusionId: 'f', outcome: 'succeeded', finalSourcePhaseId: 'p', totalNanoAiu: 777_000_000, inputTokens: 100, outputTokens: 10 }, 6),
    event('session.fusion_handoff', { fusionId: 'f', sourcePhaseId: 'p', targetPhaseId: 'q', message: { role: 'assistant', content: 'handoff text' } }, 7),
    event('session.usage_record', {
      usage: {
        accounting: { usageId: 'acc-1', sourceSessionId: 'src-1', sequence: 1 },
        model: 'gpt-5.3-codex',
        inputTokens: 5,
        outputTokens: 3,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        duration: 10,
        copilotUsage: { totalNanoAiu: 11 },
      },
    }, 8),
  ];
  const built = buildSdkSession(all, all, { title: 'Fusion session', assetsDirectory: 'assets' });
  const unhandled = new Set(built.session.census.unhandled.map(([type]) => type));
  assert.equal(unhandled.has('session.fusion_resolved'), false);
  assert.equal(unhandled.has('assistant.fusion_phase_completed'), false);
  assert.equal(unhandled.has('session.fusion_commit_started'), false);
  assert.equal(unhandled.has('session.fusion_change_checkpoint'), false);
  assert.equal(unhandled.has('session.fusion_completed'), false);
  assert.equal(unhandled.has('session.fusion_handoff'), false);
  assert.equal(unhandled.has('session.usage_record'), false);
  assert.equal(unhandled.has('session.usage_record:unsupported'), false);
});

test('unambiguous child mapping without a parent tool node renders in a separate child section and keeps order', () => {
  const out = exportSdk([
    prompt('Main prompt', 1),
    assistant('Main answer', 2),
    event('subagent.started', { toolCallId: 'orphan-call', agentName: 'child' }, 3, 'agent-orphan'),
    prompt('Child prompt one', 4, 'agent-orphan'),
    assistant('Child answer one', 5, {}, 'agent-orphan'),
    event('tool.execution_start', { toolCallId: 'child-tool', toolName: 'view', arguments: { path: 'child.ts' } }, 6, 'agent-orphan'),
    event('tool.execution_complete', { toolCallId: 'child-tool', success: true, result: { content: 'child file content' } }, 7, 'agent-orphan'),
  ]);
  assert.match(out.markdown, /Recorded child conversations - parent call missing/u);
  assert.match(out.markdown, /Child prompt one/u);
  assert.match(out.markdown, /Child answer one/u);
  const inventedTaskNode = out.session.turns.flatMap((turn) => turn.toolNodes)
    .find((node) => node.toolCallId === 'orphan-call' || node.toolId === 'task');
  assert.equal(inventedTaskNode, undefined, 'no invented parent ToolNode/task invocation');
  assert.ok(out.markdown.indexOf('Child prompt one') < out.markdown.indexOf('Child answer one'));
});

test('loss pieces include fusion phase and handoff text', () => {
  const events = [
    prompt('Main', 1),
    event('assistant.fusion_phase_completed', { fusionId: 'f', phaseId: 'p', phaseKind: 'primary', role: 'solver', reasoningEffort: 'medium', content: 'Phase body text.' }, 2),
    event('session.fusion_handoff', { fusionId: 'f', sourcePhaseId: 'p', targetPhaseId: 'q', message: { role: 'assistant', content: 'Handoff body text.' } }, 3),
  ];
  const pieces = sdkLossPieces(events);
  assert.ok(pieces.some((item) => item.category === 'fusion-phase' && item.text.includes('Phase body text.')));
  assert.ok(pieces.some((item) => item.category === 'fusion-handoff' && item.text.includes('Handoff body text.')));
});

test('loss pieces include differing projection text and keep same-record equality once', () => {
  const events = [
    prompt('Main', 1),
    event('assistant.fusion_phase_completed', {
      fusionId: 'f',
      phaseId: 'p',
      phaseKind: 'primary',
      role: 'solver',
      reasoningEffort: 'medium',
      content: 'Phase body text.',
      projectionMessage: { content: 'Projected text.' },
    }, 2),
    event('assistant.fusion_phase_completed', {
      fusionId: 'f',
      phaseId: 'q',
      phaseKind: 'primary',
      role: 'solver',
      reasoningEffort: 'medium',
      content: 'Equal text phase.',
      projectionMessage: { content: 'Equal text phase.' },
    }, 3),
  ];
  const pieces = sdkLossPieces(events);
  assert.equal(pieces.filter((item) => item.category === 'fusion-phase').length, 2);
  assert.equal(pieces.filter((item) => item.category === 'fusion-phase-projection').length, 1);
  const markdown = 'Main\nPhase body text.\nProjected text.\nEqual text phase.';
  assert.equal(buildSdkLossAccount(events, markdown).failed, false);
  const withoutProjection = buildSdkLossAccount(events, markdown.replace('Projected text.\n', ''));
  assert.equal(withoutProjection.failed, true);
  assert.ok(withoutProjection.unaccounted.some((item) => item.category === 'fusion-phase-projection'));
});

test('independent loss detection fails when fusion phase text is removed', () => {
  const events = [
    prompt('Main', 1),
    event('assistant.fusion_phase_completed', { fusionId: 'f', phaseId: 'p', phaseKind: 'judge', role: 'judge', reasoningEffort: 'high', content: 'Judge phase body.' }, 2),
    event('session.fusion_handoff', { fusionId: 'f', sourcePhaseId: 'p', targetPhaseId: 'q', message: { role: 'assistant', content: 'Handoff body.' } }, 3),
  ];
  const markdown = 'Main\nJudge phase body.\nHandoff body.';
  const full = buildSdkLossAccount(events, markdown);
  assert.equal(full.failed, false);
  const missingPhase = buildSdkLossAccount(events, markdown.replace('Judge phase body.\n', ''));
  assert.equal(missingPhase.failed, true);
  assert.ok(missingPhase.unaccounted.some((item) => item.category === 'fusion-phase'));
  const missingHandoff = buildSdkLossAccount(events, markdown.replace('Handoff body.', ''));
  assert.equal(missingHandoff.failed, true);
  assert.ok(missingHandoff.unaccounted.some((item) => item.category === 'fusion-handoff'));
});

test('repeated fusion text is checked with multiplicity across distinct records', () => {
  const events = [
    prompt('Main', 1),
    event('assistant.fusion_phase_completed', { fusionId: 'f', phaseId: 'p1', phaseKind: 'primary', role: 'solver', reasoningEffort: 'high', content: 'Repeated fusion body.' }, 2),
    event('assistant.fusion_phase_completed', { fusionId: 'f', phaseId: 'p2', phaseKind: 'judge', role: 'judge', reasoningEffort: 'high', content: 'Repeated fusion body.' }, 3),
    event('session.fusion_handoff', { fusionId: 'f', sourcePhaseId: 'p1', targetPhaseId: 'p2', message: { role: 'assistant', content: 'Repeated handoff text.' } }, 4),
    event('session.fusion_handoff', { fusionId: 'f', sourcePhaseId: 'p2', targetPhaseId: 'p3', message: { role: 'assistant', content: 'Repeated handoff text.' } }, 5),
  ];
  const missingOne = buildSdkLossAccount(events, 'Main\nRepeated fusion body.\nRepeated handoff text.');
  assert.equal(missingOne.failed, true);
  assert.ok(missingOne.multiplicity.missing >= 2);
});

test('independent loss detection fails when delegated child text is removed', () => {
  const events = [
    prompt('Main prompt', 1),
    assistant('Delegating to child.', 2, { toolRequests: [{ toolCallId: 'task-1', name: 'task', arguments: { prompt: 'Child prompt one' } }] }),
    event('subagent.started', { toolCallId: 'task-1', agentName: 'child' }, 3, 'agent-child'),
    prompt('Child prompt one', 4, 'agent-child'),
    assistant('Child answer one', 5, {}, 'agent-child'),
  ];
  const markdown = 'Main prompt\nDelegating to child.\nChild prompt one\nChild answer one';
  const full = buildSdkLossAccount(events, markdown);
  assert.equal(full.failed, false);
  const missingChild = buildSdkLossAccount(events, markdown.replace('Child answer one', ''));
  assert.equal(missingChild.failed, true);
  assert.ok(missingChild.unaccounted.some((item) => item.category === 'assistant-text'));
});

test('usage records become per-call usage with token and nano-AIU fields', () => {
  const calls = usageFromEvents([
    event('session.usage_record', {
      usage: {
        accounting: { usageId: 'acc-1', sourceSessionId: 'source-a', sequence: 1 },
        model: 'gpt-5.3-codex',
        reasoningEffort: null,
        inputTokens: 101,
        cacheReadTokens: 11,
        cacheWriteTokens: 0,
        outputTokens: 7,
        reasoningTokens: 3,
        duration: 220,
        copilotUsage: { totalNanoAiu: 123_000_000 },
      },
    }, 2),
    event('session.usage_record', {
      usage: {
        accounting: { usageId: 'acc-2', sourceSessionId: 'source-a', sequence: 2 },
        model: 'claude-sonnet-5',
        inputTokens: 55,
        cacheReadTokens: 5,
        cacheWriteTokens: 2,
        outputTokens: 4,
        reasoningTokens: 1,
        duration: 130,
        copilotUsage: { totalNanoAiu: 222_000_000 },
      },
    }, 3, 'agent-child'),
    event('session.usage_record', {
      usage: {
        accounting: { usageId: 'acc-2', sourceSessionId: 'source-a', sequence: 2 },
        model: 'claude-sonnet-5',
        inputTokens: 55,
        cacheReadTokens: 5,
        cacheWriteTokens: 2,
        outputTokens: 4,
        reasoningTokens: 1,
        duration: 130,
        copilotUsage: { totalNanoAiu: 222_000_000 },
      },
    }, 4, 'agent-child'),
  ]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    at: Date.parse('2026-10-14T10:00:02.000Z'),
    agentId: null,
    model: 'gpt-5.3-codex',
    inputTokens: 101,
    cacheReadTokens: 11,
    cacheWriteTokens: 0,
    outputTokens: 7,
    reasoningTokens: 3,
    nanoAiu: 123_000_000,
    durationMs: 220,
    provenance: {
      source: 'usage-record',
      durationEvidence: 'sdk-milliseconds-inferred-wrapper',
      accounting: { usageId: 'acc-1', sourceSessionId: 'source-a', sequence: 1 },
      reasoningEffort: null,
    },
  });
});

test('usage summaries remain cumulative and are not added to per-call usage', () => {
  const out = exportSdk([
    prompt('Question one', 1),
    assistant('Answer one', 2),
    event('session.usage_record', {
      usage: {
        accounting: { usageId: 'acc-1', sourceSessionId: 'source-main', sequence: 1 },
        model: 'gpt-5.3-codex',
        inputTokens: 10,
        outputTokens: 2,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        duration: 50,
        copilotUsage: { totalNanoAiu: 30_000_000 },
      },
    }, 3),
    event('session.fusion_completed', { fusionId: 'f', totalNanoAiu: 2_000_000_000, inputTokens: 900, outputTokens: 100 }, 4),
    event('session.usage_checkpoint', { totalNanoAiu: 9_000_000_000 }, 5),
    event('session.shutdown', { totalNanoAiu: 11_000_000_000 }, 6),
  ]);
  assert.equal(out.session.usage?.recorded.calls, 1);
  assert.equal(out.session.usage?.recorded.nanoAiu, 30_000_000);
  assert.equal(out.session.usage?.logged?.nanoAiu, 11_000_000_000);
});

test('multiple orphan children and orphan-only logs render in source record order', () => {
  const out = exportSdk([
    event('subagent.started', { toolCallId: 'orphan-two', agentName: 'Second' }, 3, 'agent-two'),
    prompt('Second child prompt', 4, 'agent-two'),
    assistant('Second child answer', 5, {}, 'agent-two'),
    event('subagent.started', { toolCallId: 'orphan-one', agentName: 'First' }, 1, 'agent-one'),
    prompt('First child prompt', 2, 'agent-one'),
    assistant('First child answer', 3, {}, 'agent-one'),
  ]);
  assert.match(out.markdown, /Recorded child conversations - parent call missing/u);
  assert.ok(out.markdown.indexOf('Child 1: Second') < out.markdown.indexOf('Child 2: First'));
  assert.ok(out.markdown.includes('First child answer'));
  assert.ok(out.markdown.includes('Second child answer'));
});

test('nested child with a missing parent call is rendered as its own orphan conversation', () => {
  const out = exportSdk([
    event('subagent.started', { toolCallId: 'outer-orphan', agentName: 'Outer' }, 1, 'agent-outer'),
    prompt('Outer prompt', 2, 'agent-outer'),
    assistant('Outer answer', 3, {
      toolRequests: [{ toolCallId: 'inner-missing', name: 'task', arguments: { prompt: 'Inner prompt' } }],
    }, 'agent-outer'),
    event('subagent.started', { toolCallId: 'inner-missing', agentName: 'Inner' }, 4, 'agent-inner'),
    prompt('Inner prompt', 5, 'agent-inner'),
    assistant('Inner answer', 6, {}, 'agent-inner'),
  ]);
  assert.match(out.markdown, /Recorded child conversations - parent call missing/u);
  assert.match(out.markdown, /Outer prompt/u);
  assert.match(out.markdown, /Inner prompt/u);
  assert.match(out.markdown, /Inner answer/u);
  const invented = out.session.turns.flatMap((turn) => turn.toolNodes).find((node) => node.toolCallId === 'inner-missing');
  assert.equal(invented, undefined);
});

test('ambiguous mappings still stay omitted and warned', () => {
  const out = exportSdk([
    prompt('Main question', 1),
    assistant('Main answer', 2, { toolRequests: [{ toolCallId: 'delegation', name: 'task' }] }),
    event('tool.execution_start', { toolCallId: 'delegation', toolName: 'task' }, 3),
    event('subagent.started', { toolCallId: 'delegation', agentName: 'First child' }, 4, 'first-child'),
    event('subagent.started', { toolCallId: 'delegation', agentName: 'Second child' }, 5, 'second-child'),
    prompt('Ambiguous child prompt', 6, 'second-child'),
  ]);
  assert.match(out.markdown, /child conversation was omitted because its sub-agent mapping was ambiguous or incomplete/u);
  assert.doesNotMatch(out.markdown, /Ambiguous child prompt/u);
});

test('invalid fusion payloads become warnings and unknown future variants stay in census', () => {
  const built = buildSdkSession([
    prompt('Main', 1),
    event('session.fusion_change_checkpoint', { fusionId: 'f', codeChanges: 'bad' }, 2),
    event('session.fusion.unknown_future', { anything: true }, 3),
  ], [
    prompt('Main', 1),
    event('session.fusion_change_checkpoint', { fusionId: 'f', codeChanges: 'bad' }, 2),
    event('session.fusion.unknown_future', { anything: true }, 3),
  ], { title: 'Invalid fusion', assetsDirectory: 'assets' });
  const noteText = built.session.turns.flatMap((turn) => turn.body)
    .filter((node) => node.type === 'note')
    .map((node) => node.title)
    .join('\n');
  assert.match(noteText, /unsupported payload/u);
  assert.ok(built.session.census.unhandled.some(([type]) => type === 'session.fusion.unknown_future'));
});

test('long fusion text uses the existing overflow companion path', () => {
  const longText = Array.from({ length: 400 }, (_unused, index) => `${'fusion text '.repeat(8)}line ${index + 1} with enough text for overflow`).join('\n');
  const out = exportSdk([
    prompt('Long fusion', 1),
    event('assistant.fusion_phase_completed', {
      fusionId: 'f',
      phaseId: 'long',
      phaseKind: 'primary',
      role: 'solver',
      reasoningEffort: 'high',
      content: longText,
    }, 2),
  ]);
  const metadata = out.companions.filter((item) => item.kind === 'metadata');
  assert.ok(metadata.length >= 1);
  assert.match(out.markdown, /Showing the first 10 of \d+ lines/u);
  assert.ok(metadata.some((item) => Buffer.from(item.bytes).toString('utf8').includes('line 400')));
});

test('detached children section reuses full renderer behavior with redaction, errors, nested agents and companions', () => {
  const longError = Array.from({ length: 400 }, (_unused, index) => `line ${index + 1} authorization: bearer synthetic-secret`).join('\n');
  const png = Buffer.from('detached child image');
  const out = exportSdk([
    event('subagent.started', { toolCallId: 'detached-root', agentName: 'Detached root' }, 1, 'agent-detached'),
    prompt('Use authorization: bearer synthetic-secret', 2, 'agent-detached'),
    assistant('Running nested work.', 3, {
      toolRequests: [
        { toolCallId: 'term-1', name: 'run_in_terminal', arguments: { command: 'node run.js' } },
        { toolCallId: 'child-task', name: 'task', arguments: { prompt: 'Nested prompt', description: 'Nested child' } },
      ],
    }, 'agent-detached'),
    event('tool.execution_start', { toolCallId: 'term-1', toolName: 'run_in_terminal', arguments: { command: 'node run.js' } }, 4, 'agent-detached'),
    event('tool.execution_complete', {
      toolCallId: 'term-1',
      success: false,
      result: { content: longError },
      error: { message: 'terminal failure' },
    }, 5, 'agent-detached'),
    event('subagent.started', { toolCallId: 'child-task', agentName: 'Nested child' }, 6, 'agent-nested'),
    prompt('Nested prompt', 7, 'agent-nested'),
    assistant('Nested answer.', 8, {}, 'agent-nested'),
    event('session.binary_asset', {
      assetId: 'img-detached',
      type: 'image',
      mimeType: 'image/png',
      byteLength: png.length,
      data: png.toString('base64'),
      description: 'detached screenshot',
    }, 9, 'agent-detached'),
  ]);
  assert.match(out.markdown, /Recorded child conversations - parent call missing/u);
  assert.match(out.markdown, /Nested answer\./u);
  assert.match(out.markdown, /\[tool error\] terminal failure/u);
  assert.match(out.markdown, /Showing the first 10 of 400 lines/u);
  assert.match(out.markdown, /\[REDACTED\]/u);
  assert.ok(!out.markdown.includes('synthetic-secret'));
  assert.ok(out.companions.some((item) => item.kind === 'tool-result'));
  assert.ok(out.companions.some((item) => item.kind === 'image'));
});

test('fusion and assistant stream order is checked in one order group', () => {
  const events = [
    prompt('Main', 1),
    assistant('Assistant first.', 2),
    event('assistant.fusion_phase_completed', { fusionId: 'f-1', phaseId: 'p-1', phaseKind: 'primary', role: 'solver', reasoningEffort: 'high', content: 'Fusion next.' }, 3),
    event('session.fusion_handoff', { fusionId: 'f-1', sourcePhaseId: 'p-1', targetPhaseId: 'p-2', message: { role: 'assistant', content: 'Handoff third.' } }, 4),
    assistant('Assistant fourth.', 5),
  ];
  const markdown = 'Main\nAssistant first.\nFusion next.\nHandoff third.\nAssistant fourth.';
  assert.equal(buildSdkLossAccount(events, markdown).failed, false);
  const reordered = buildSdkLossAccount(events, 'Main\nAssistant first.\nHandoff third.\nFusion next.\nAssistant fourth.');
  assert.equal(reordered.failed, true);
  assert.equal(reordered.order.outOfOrder, 1);
});

test('notes-only main logs keep Fusion content without inventing a user request', () => {
  const out = exportSdk([
    event('assistant.fusion_phase_completed', {
      fusionId: 'f-note',
      phaseId: 'p-note',
      phaseKind: 'primary',
      role: 'solver',
      reasoningEffort: 'high',
      content: 'Fusion content without a user prompt.',
    }, 1),
  ]);
  assert.equal(out.session.turns.length, 0);
  assert.match(out.markdown, /\*\*User requests:\*\* 0/u);
  assert.doesNotMatch(out.markdown, /Q\d+:|USER QUESTION \/ REQUEST|no user prompt recorded/u);
  assert.match(out.markdown, /Fusion content without a user prompt\./u);
});

test('recorded fusion resolution metadata keeps object phase plans and top-level model roles', () => {
  const out = exportSdk([
    prompt('Resolve the route', 1),
    event('session.fusion_resolved', {
      fusionId: 'fusion-route',
      turnId: 'turn-route',
      syntheticModel: 'future-fusion-model',
      policy: 'balanced',
      routeSource: 'rule',
      contractVersion: 1,
      pattern: 'future-pattern',
      hint: 'review',
      phasePlan: [
        { kind: 'primary', role: 'solver', scope: 'root', conditional: false },
        { kind: 'judge', role: 'reviewer', scope: 'review', conditional: true },
      ],
      primaryModel: 'solver-model',
      secondaryModel: null,
      fallbackModel: 'fallback-model',
      followUpModel: 'follow-up-model',
      judgeModel: 'judge-model',
      repairModel: 'repair-model',
      planVersion: 'plan-v1',
      policyVersion: 'policy-v1',
      ruleId: 'rule-1',
      scores: { reasoning: 0.9, codeGen: 0.8, debugging: -0.7, toolUse: 0 },
      routingLatencyMs: 0,
    }, 2),
  ]);
  assert.deepEqual(out.session.census.unhandled, []);
  for (const expected of [
    'Fusion ID: fusion-route', 'Turn ID: turn-route', 'Policy: balanced', 'Policy version: policy-v1',
    'Primary model: solver-model', 'Secondary model: null', 'Fallback model: fallback-model',
    'Follow-up model: follow-up-model', 'Judge model: judge-model', 'Repair model: repair-model',
    'Plan version: plan-v1', 'Rule ID: rule-1', 'Routing latency: 0 ms',
    'kind: primary', 'role: solver', 'scope: root', 'conditional: false',
    'kind: judge', 'conditional: true', 'reasoning: 0.9', 'debugging: -0.7', 'toolUse: 0',
  ])
    assert.ok(out.markdown.includes(expected), `Missing ${expected}`);
  assert.match(out.markdown, /Fusion resolved: future-fusion-model \| pattern future-pattern/u);
});

test('recorded fusion commit kind and completion IDs and cache counters are kept', () => {
  const out = exportSdk([
    prompt('Finish the work', 1),
    event('session.fusion_commit_started', {
      fusionId: 'fusion-complete', commitId: 'commit-1', sourcePhaseId: 'phase-final',
      sourceModel: 'solver-model', kind: 'primary', toolCallId: null,
    }, 2),
    event('session.fusion_completed', {
      fusionId: 'fusion-complete', commitId: 'commit-1', turnId: 'turn-final',
      syntheticModel: 'fusion-model', pattern: 'cascade', outcome: 'succeeded',
      finalSourcePhaseId: 'phase-final', finalSourceModel: 'solver-model', followUpModel: 'next-model',
      degradedReason: null, phaseCount: 3, requestCount: 4, inputTokens: 123, outputTokens: 45,
      cachedTokens: 67, cacheWriteTokens: 8, totalNanoAiu: 900, durationMs: 10,
    }, 3),
  ]);
  assert.deepEqual(out.session.census.unhandled, []);
  for (const expected of [
    'Fusion commit started', 'Kind: primary', 'Fusion ID: fusion-complete', 'Commit ID: commit-1',
    'Tool call ID: null', 'Turn ID: turn-final', 'Synthetic model: fusion-model', 'Pattern: cascade',
    'Cached tokens: 67', 'Cache write tokens: 8', 'Request count: 4', 'Phase count: 3',
    'Input tokens: 123', 'Output tokens: 45', 'Total nano-AIU: 900', 'Duration: 10 ms',
  ])
    assert.ok(out.markdown.includes(expected), `Missing ${expected}`);
  assert.doesNotMatch(out.markdown, /Git commit/u);
});

test('fusion phase metadata validates usage and keeps projection role and handoff identity', () => {
  const out = exportSdk([
    prompt('Review', 1),
    event('assistant.fusion_phase_completed', {
      fusionId: 'fusion-review', phaseId: 'review', phaseKind: 'judge', role: 'reviewer',
      conversationScope: 'root', model: 'review-model', status: 'succeeded', content: 'Review text.',
      verdict: null, durationMs: 0, projectionMessage: { role: 'assistant', content: 'Review text.' },
      projectionMode: 'replace', reasoningEffort: 'high',
      usage: { requestCount: 1, inputTokens: 2, outputTokens: 3, cachedTokens: 4, cacheWriteTokens: 5, totalNanoAiu: 6 },
    }, 2),
    event('session.fusion_handoff', {
      fusionId: 'fusion-review', sourcePhaseId: 'review', targetPhaseId: 'repair', targetModel: 'repair-model',
      message: { role: 'assistant', content: 'Handoff body.' },
    }, 3),
  ]);
  assert.deepEqual(out.session.census.unhandled, []);
  assert.equal(count(out.markdown, 'Review text.'), 1);
  for (const expected of [
    'Projection role: assistant', 'Verdict: null', 'Request count: 1', 'Cached tokens: 4',
    'Cache write tokens: 5', 'Total nano-AIU: 6', 'Fusion ID: fusion-review', 'Handoff body.',
  ])
    assert.ok(out.markdown.includes(expected), `Missing ${expected}`);
});

test('malformed present fusion fields warn without erasing valid content', () => {
  const malformed: Record<string, unknown>[] = [
    { content: 3 }, { projectionMessage: 'bad' }, { projectionMessage: { content: [] } },
    { projectionMessage: { role: 4, content: 'Projection evidence.' } }, { role: false },
    { phaseKind: 4 }, { durationMs: -1 }, { durationMs: Infinity }, { verdict: 0 },
    { usage: { cachedTokens: -1 } }, { usage: { cacheWriteTokens: NaN } }, { usage: [] },
    { usage: { inputTokens: '2' } }, { projectionMode: null }, { reasoningEffort: [] },
    { projectionMessage: { content: 'Projection evidence.', futureField: true } },
    { usage: { futureCounter: 2 } },
  ];
  for (const fields of malformed) {
    const out = exportSdk([
      prompt('Keep evidence', 1),
      event('assistant.fusion_phase_completed', {
        fusionId: 'f', phaseId: 'p', phaseKind: 'primary', content: 'Phase evidence.',
        projectionMessage: { role: 'assistant', content: 'Projection evidence.' }, ...fields,
      }, 2),
    ]);
    assert.deepEqual(out.session.census.unhandled, [['assistant.fusion_phase_completed:unsupported', 1]], JSON.stringify(fields));
    assert.match(out.markdown, /unsupported payload/u);
    if (typeof fields.content !== 'number')
      assert.match(out.markdown, /Phase evidence\./u);
    if (!Object.hasOwn(fields, 'projectionMessage'))
      assert.match(out.markdown, /Projection evidence\./u);
  }
});

test('unknown fusion versions and fields fail strict schema checks and keep available evidence', async () => {
  for (const fields of [{ contractVersion: 2 }, { futureField: 'unknown' }, { modelRoles: { solver: 'model' } }]) {
    const events = [
      prompt('Keep known metadata', 1),
      event('session.fusion_resolved', { syntheticModel: 'future-model', pattern: 'future-pattern', ...fields }, 2),
    ];
    const out = exportSdk(events);
    assert.deepEqual(out.session.census.unhandled, [['session.fusion_resolved:unsupported', 1]]);
    assert.match(out.markdown, /Fusion resolved: future-model \| pattern future-pattern/u);
    assert.match(out.markdown, /unsupported payload/u);
    const report = buildSdkVerifyJson({
      strict: true, census: out.session.census, leftOut: out.leftOut,
      loss: buildSdkLossAccount(events, out.markdown), fenceRepairs: out.fenceRepairs,
      parser: buildParserCheck(out.markdown, await loadMarkdownParser(), { turns: out.session.turns.length, strict: true }),
    });
    assert.equal(report.exitCode, 2);
    assert.ok(report.failureReasons.includes('unhandled-kind'));
  }
});

test('fusion nested metadata validates types and unknown fields across all families', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['session.fusion_resolved', { syntheticModel: 'model', pattern: 'single', phasePlan: ['primary'] }],
    ['session.fusion_resolved', { syntheticModel: 'model', pattern: 'single', phasePlan: [{ kind: 'primary', conditional: 'no' }] }],
    ['session.fusion_resolved', { syntheticModel: 'model', pattern: 'single', phasePlan: [{ futureField: true }] }],
    ['session.fusion_resolved', { syntheticModel: 'model', pattern: 'single', scores: { reasoning: Infinity } }],
    ['session.fusion_resolved', { syntheticModel: 'model', pattern: 'single', scores: { futureScore: 1 } }],
    ['session.fusion_resolved', { syntheticModel: 'model', pattern: 'single', routingLatencyMs: -1 }],
    ['session.fusion_resolved', { syntheticModel: 'model', pattern: 'single', primaryModel: 3 }],
    ['session.fusion_resolved', { syntheticModel: 'model', pattern: 'single', planVersion: 1 }],
    ['session.fusion_commit_started', { fusionId: 'f', kind: false }],
    ['session.fusion_commit_started', { fusionId: 'f', toolCallId: 5 }],
    ['session.fusion_commit_started', { fusionId: 'f', commitKind: 'fictional-alias' }],
    ['session.fusion_change_checkpoint', { codeChanges: { filesModified: ['valid.ts', 3] } }],
    ['session.fusion_change_checkpoint', { codeChanges: { linesAdded: -1 } }],
    ['session.fusion_change_checkpoint', { codeChanges: { futureField: 1 } }],
    ['session.fusion_completed', { fusionId: 'f', cachedTokens: -1 }],
    ['session.fusion_completed', { fusionId: 'f', cacheWriteTokens: Infinity }],
    ['session.fusion_completed', { fusionId: 'f', totalNanoAiu: '3' }],
    ['session.fusion_completed', { fusionId: 'f', degradedReason: false }],
    ['session.fusion_handoff', { fusionId: 'f', message: { content: 3 } }],
    ['session.fusion_handoff', { fusionId: 'f', message: { role: 3, content: 'Keep handoff.' } }],
    ['session.fusion_handoff', { fusionId: 'f', message: { content: 'Keep handoff.', extra: true } }],
    ['session.fusion_handoff', { fusionId: 'f', sourcePhaseId: 3, message: { content: 'Keep handoff.' } }],
  ];
  for (const [type, data] of cases) {
    const out = exportSdk([prompt('Validate metadata', 1), event(type, data, 2)]);
    assert.deepEqual(out.session.census.unhandled, [[`${type}:unsupported`, 1]], `${type} ${JSON.stringify(data)}`);
    assert.match(out.markdown, /unsupported payload/u);
    if (typeof data.message === 'object' && data.message && 'content' in data.message && data.message.content === 'Keep handoff.')
      assert.match(out.markdown, /Keep handoff\./u);
  }
});

test('absent optional fusion counters stay absent and recorded null projection is supported', () => {
  const out = exportSdk([
    prompt('Minimal metadata', 1),
    event('assistant.fusion_phase_completed', {
      phaseKind: 'primary', content: 'Available text.', projectionMessage: null,
    }, 2),
    event('session.fusion_completed', { fusionId: 'f' }, 3),
  ]);
  assert.deepEqual(out.session.census.unhandled, []);
  assert.match(out.markdown, /Available text\./u);
  assert.doesNotMatch(out.markdown, /Input tokens:|Output tokens:|Cached tokens:|Cache write tokens:|Total nano-AIU:|Request count:/u);
});

test('different complete fusion projection whitespace is not discarded', () => {
  const out = exportSdk([
    prompt('Keep exact text', 1),
    event('assistant.fusion_phase_completed', {
      phaseKind: 'primary', content: 'Same words.', projectionMessage: { role: 'assistant', content: ' Same words.\n' },
    }, 2),
  ]);
  assert.equal(count(out.markdown, 'Same words.'), 2);
});

test('selected child builds and exports exclude the selected child from recovery and exclude unrelated scopes', () => {
  const selected: VerifiedChildScope = { kind: 'subagent', agentId: 'selected', parentToolCallId: 'selected-call', evidenceRecordIds: [] };
  const events = [
    prompt('Unrelated main prompt', 1),
    assistant('Unrelated main answer.', 2),
    event('subagent.started', { toolCallId: 'sibling-call', agentName: 'Sibling' }, 3, 'sibling'),
    prompt('Unrelated sibling prompt', 4, 'sibling'),
    assistant('Unrelated sibling answer.', 5, {}, 'sibling'),
    event('subagent.started', { toolCallId: 'selected-call', agentName: 'Selected' }, 6, 'selected'),
    prompt('Selected child prompt', 7, 'selected'),
    assistant('Selected answer.', 8, {
      toolRequests: [{ toolCallId: 'nested-call', name: 'task', arguments: { prompt: 'Nested task' } }],
    }, 'selected'),
    event('subagent.started', { toolCallId: 'nested-call', agentName: 'Nested' }, 9, 'nested'),
    prompt('Nested task', 10, 'nested'),
    assistant('Nested answer.', 11, {}, 'nested'),
  ];
  const built = buildSdkSession(events, eventsInScope(events, selected), { title: 'Selected child', assetsDirectory: 'assets' });
  assert.deepEqual(built.session.turns.map((turn) => turn.prompt), ['Selected child prompt']);
  assert.equal(built.orphanChildren.length, 0);
  assert.equal(built.session.turns[0]?.toolNodes[0]?.subagent?.agentId, 'nested');
  assert.deepEqual([...built.leftOut], []);
  const out = renderSdkExport(events, { ...source(), scope: selected }, {
    title: 'Selected child', assetsDirectory: 'assets', outputPath: 'selected.md', generatedAt: '2026-10-20T12:00:00Z',
  });
  assert.deepEqual(out.session.turns.map((turn) => turn.prompt), ['Selected child prompt']);
  assert.equal(out.session.detachedSubagents, undefined);
  assert.equal(count(out.markdown, 'Selected answer.'), 1);
  assert.equal(count(out.markdown, 'Nested answer.'), 1);
  assert.doesNotMatch(out.markdown, /Unrelated main|Unrelated sibling/u);
  assert.ok(out.events.every((item) => item.agentId === 'selected' || item.agentId === 'nested'));
});

test('empty selected children use an explicit scope without recovering main or sibling conversations', () => {
  const selected: VerifiedChildScope = { kind: 'subagent', agentId: 'empty-selected', parentToolCallId: 'empty-call', evidenceRecordIds: [] };
  const events = [
    prompt('Unrelated main prompt', 1),
    event('subagent.started', { toolCallId: 'other-call', agentName: 'Other' }, 2, 'other'),
    prompt('Unrelated child prompt', 3, 'other'),
    assistant('Unrelated child answer.', 4, {}, 'other'),
  ];
  const built = buildSdkSession(events, [], { title: 'Empty selected', assetsDirectory: 'assets', scope: selected });
  assert.equal(built.session.turns.length, 0);
  assert.equal(built.orphanChildren.length, 0);
  assert.deepEqual([...built.leftOut], []);
  const out = renderSdkExport(events, { ...source(), scope: selected }, {
    title: 'Empty selected', assetsDirectory: 'assets', outputPath: 'empty.md', generatedAt: '2026-10-20T12:00:00Z',
  });
  assert.equal(out.session.turns.length, 0);
  assert.equal(out.session.detachedSubagents, undefined);
  assert.doesNotMatch(out.markdown, /Unrelated/u);
  assert.deepEqual(out.events, []);
});

test('normally attached descendants are not recovered before their outer orphan is processed', () => {
  const out = exportSdk([
    prompt('Main prompt', 1),
    event('subagent.started', { toolCallId: 'inner-call', agentName: 'Inner' }, 8, 'inner-agent'),
    prompt('Inner task', 9, 'inner-agent'),
    assistant('Inner unique answer.', 10, {}, 'inner-agent'),
    event('subagent.started', { toolCallId: 'outer-missing', agentName: 'Outer' }, 2, 'outer-agent'),
    prompt('Outer task', 3, 'outer-agent'),
    assistant('Outer answer.', 4, {
      toolRequests: [{ toolCallId: 'inner-call', name: 'task', arguments: { prompt: 'Inner task' } }],
    }, 'outer-agent'),
  ]);
  assert.deepEqual(out.session.detachedSubagents?.map((child) => child.agentId), ['outer-agent']);
  assert.equal(out.session.detachedSubagents?.[0]?.turns[0]?.toolNodes[0]?.subagent?.agentId, 'inner-agent');
  assert.equal(count(out.markdown, 'Inner unique answer.'), 1);
});

test('depth-limited descendants with recorded parent calls are not recovered as new root orphans', () => {
  const events = [
    prompt('Main root', 1),
    assistant('Root answer.', 2, { toolRequests: [{ toolCallId: 'depth-call-1', name: 'task' }] }),
  ];
  for (let depth = 1; depth <= 10; depth++) {
    events.push(
      event('subagent.started', { toolCallId: `depth-call-${depth}`, agentName: `Depth ${depth}` }, depth + 2, `depth-agent-${depth}`),
      prompt(`Depth ${depth} prompt`, depth + 3, `depth-agent-${depth}`),
      assistant(`Depth ${depth} answer.`, depth + 4, depth < 10
        ? { toolRequests: [{ toolCallId: `depth-call-${depth + 1}`, name: 'task' }] } : {}, `depth-agent-${depth}`),
    );
  }
  const out = exportSdk(events);
  assert.equal(out.session.detachedSubagents, undefined);
  assert.match(out.markdown, /Depth 8 answer\./u);
  assert.doesNotMatch(out.markdown, /Depth 9 answer\.|Depth 10 answer\./u);
  assert.equal(out.leftOut.get('sub-agent events without a verified delegation'), 4);
});

test('recorded parent calls without a renderable parent turn do not create detached children or hide omission counts', () => {
  for (const type of ['tool.execution_start', 'assistant.message']) {
    const out = exportSdk([
      event(type, type === 'assistant.message'
        ? { toolRequests: [{ toolCallId: 'unprocessed-call', name: 'task' }] }
        : { toolCallId: 'unprocessed-call', toolName: 'task' }, 1),
      event('subagent.started', { toolCallId: 'unprocessed-call', agentName: 'Unprocessed' }, 2, 'unprocessed'),
      prompt('Unprocessed child prompt', 3, 'unprocessed'),
      assistant('Unprocessed child answer.', 4, {}, 'unprocessed'),
      prompt('Later root question', 5),
      assistant('Later root answer.', 6),
    ]);
    assert.equal(out.session.detachedSubagents, undefined);
    assert.doesNotMatch(out.markdown, /Unprocessed child prompt|Unprocessed child answer/u);
    assert.equal(out.leftOut.get('sub-agent events without a verified delegation'), 2);
  }
});

test('detached headings pass structural checks without masking corrupted root request or assistant headings', async () => {
  const out = exportSdk([
    prompt('Root question one', 1),
    assistant('Root answer one.', 2),
    prompt('Root question two', 3),
    assistant('Root answer two.', 4),
    event('subagent.started', { toolCallId: 'detached-call', agentName: 'Detached' }, 5, 'detached'),
    prompt('Detached question', 6, 'detached'),
    assistant('Detached answer.', 7, {}, 'detached'),
  ]);
  const parser = await loadMarkdownParser();
  const check = (markdown: string) => buildParserCheck(markdown, parser, { turns: 2, strict: true });
  const valid = check(out.markdown);
  assert.equal(valid.failed, false, JSON.stringify(valid.checks));
  assert.equal(valid.counts.turnAnchors, 2);
  assert.equal(valid.counts.requestHeadings, 2);
  assert.equal(valid.counts.assistantHeadings, 2);
  assert.match(out.markdown, /\[Recorded child conversations - parent call missing\]\(#recorded-child-conversations-parent-call-missing\)/u);
  assert.match(out.markdown, /id="detached-child-1-message-1"/u);
  assert.equal(check(out.markdown.replace(MARK.requestHeadingPrefix, '<h3>Broken root request ')).failed, true);
  assert.equal(check(out.markdown.replace(MARK.assistantHeading, '#### Broken root response')).failed, true);
});

test('detached binary image notes and normally nested binary image notes produce a document privacy warning', () => {
  for (const nested of [false, true]) {
    const bytes = Buffer.from(`synthetic ${nested ? 'nested' : 'detached'} image bytes`);
    const imageAgent = nested ? 'image-nested' : 'image-outer';
    const events = [
      prompt('Root without images', 1),
      event('subagent.started', { toolCallId: 'outer-missing', agentName: 'Outer' }, 2, 'image-outer'),
      prompt('Outer task', 3, 'image-outer'),
      assistant('Outer answer.', 4, nested
        ? { toolRequests: [{ toolCallId: 'image-task', name: 'task', arguments: { prompt: 'Image task' } }] } : {}, 'image-outer'),
      ...(nested ? [
        event('subagent.started', { toolCallId: 'image-task', agentName: 'Nested' }, 5, imageAgent),
        prompt('Image task', 6, imageAgent),
      ] : []),
      event('session.binary_asset', {
        assetId: 'detached-img', type: 'image', mimeType: 'image/png',
        byteLength: bytes.length, data: bytes.toString('base64'), description: 'Synthetic image',
      }, 7, imageAgent),
    ];
    const out = exportSdk(events);
    assert.match(out.markdown, /Images bypass text redaction and may contain private information/u);
    assert.ok(!out.markdown.includes(bytes.toString('base64')));
    const images = out.companions.filter((item) => item.kind === 'image');
    assert.equal(images.length, 1);
    assert.deepEqual(Buffer.from(images[0]!.bytes), bytes);
  }
});

test('tool continuations do not merge main and detached conversations or different detached children', () => {
  const events = [
    prompt('Main prompt', 1),
    assistant('Main answer.', 2, { toolRequests: [{ toolCallId: 'shared-result', name: 'view' }] }),
    event('tool.execution_complete', { toolCallId: 'shared-result', success: true, result: { content: 'Shared tool body.' } }, 3),
    event('subagent.started', { toolCallId: 'first-missing', agentName: 'First' }, 4, 'first-detached'),
    prompt('First child prompt', 5, 'first-detached'),
    assistant('First child answer.', 6, { toolRequests: [{ toolCallId: 'shared-result', name: 'view' }] }, 'first-detached'),
    event('tool.execution_complete', { toolCallId: 'shared-result', success: true, result: { content: 'Shared tool body.' } }, 7, 'first-detached'),
    event('subagent.started', { toolCallId: 'second-missing', agentName: 'Second' }, 8, 'second-detached'),
    prompt('Second child first prompt', 9, 'second-detached'),
    assistant('Second child first answer.', 10, {}, 'second-detached'),
    prompt('Second child next prompt', 11, 'second-detached'),
    assistant('Second child next answer.', 12, { toolRequests: [{ toolCallId: 'shared-result', name: 'view' }] }, 'second-detached'),
    event('tool.execution_complete', { toolCallId: 'shared-result', success: true, result: { content: 'Shared tool body.' } }, 13, 'second-detached'),
  ];
  const out = exportSdk(events);
  assert.equal(count(out.markdown, 'Shared tool body.'), 3);
  assert.doesNotMatch(out.markdown, /continued from turn/u);
});

const longFusionBody = (label: string, secret: string): string => Array.from({ length: 340 }, (_unused, index) =>
  `${label} line ${index + 1}: ${'complete recorded evidence '.repeat(3)}authorization: bearer ${secret}`).join('\n');

const longFusionExample = () => {
  const phase = longFusionBody('PHASE', 'phase-body-secret');
  const projection = longFusionBody('PROJECTION', 'projection-body-secret');
  const handoff = longFusionBody('HANDOFF', 'handoff-body-secret');
  const events = [
    prompt('Keep the complete Fusion stream', 1),
    event('assistant.fusion_phase_completed', {
      fusionId: 'long-fusion', phaseId: 'primary', phaseKind: 'primary', content: phase,
      projectionMessage: { role: 'assistant', content: projection },
    }, 2),
    event('session.fusion_handoff', {
      fusionId: 'long-fusion', sourcePhaseId: 'primary', targetPhaseId: 'repair',
      message: { role: 'assistant', content: handoff },
    }, 3),
    assistant('Ordinary intervening answer.', 4),
    event('assistant.fusion_phase_completed', {
      fusionId: 'next-fusion', phaseId: 'repair', phaseKind: 'repair', content: 'Repair completes the review.',
    }, 5),
  ];
  return { phase, projection, handoff, events, out: exportSdk(events) };
};

const fusionNoteBlocks = (markdown: string): string[] =>
  [...markdown.matchAll(/<details><summary>[^\n]*Fusion (?:phase|handoff)[^\n]*<\/summary>[\s\S]*?<\/details>/gu)].map((match) => match[0]);

const swapText = (text: string, first: string, second: string): string =>
  text.replace(first, 'SYNTHETIC_SWAP_POSITION').replace(second, first).replace('SYNTHETIC_SWAP_POSITION', second);

test('Fusion verifier reads recorded content fields and deduplicates only exact same-record projection text', () => {
  const pieces = sdkLossPieces([
    event('assistant.fusion_phase_completed', { content: 'Phase evidence.', projectionMessage: { value: 'Fictional value.', text: 'Fictional text.' } }, 1),
    event('session.fusion_handoff', { message: { text: 'Fictional handoff.' }, content: 'Fictional top level.', messageContent: 'Fictional alias.' }, 2),
    event('session.fusion_handoff', { content: 'Fictional top level.', messageContent: 'Fictional alias.' }, 3),
    event('assistant.fusion_phase_completed', { content: 'Whitespace evidence.', projectionMessage: { content: ' Whitespace evidence.\n' } }, 4),
  ]);
  assert.deepEqual(pieces.map((piece) => [piece.category, piece.text]), [
    ['fusion-phase', 'Phase evidence.'],
    ['fusion-phase', 'Whitespace evidence.'],
    ['fusion-phase-projection', ' Whitespace evidence.\n'],
  ]);
});

test('dual long Fusion bodies and long handoff stay complete and redacted through live companions or inline fallback', async () => {
  const { phase, projection, handoff, events, out } = longFusionExample();
  const live = new Set([...out.markdown.matchAll(/\]\(([^)]+)\)/gu)].map((match) => decodeURIComponent(match[1]!)));
  const linked = out.companions.filter((item) => live.has(item.relativePath));
  const text = linked.map((item) => Buffer.from(item.bytes).toString('utf8')).join('\n');
  for (const body of [phase, projection, handoff]) {
    assert.ok(body.split('\n').length > 300);
    assert.ok(Buffer.byteLength(body) > 15 * 1024);
    assert.ok(text.includes(redactText(body).text), 'the complete redacted body is linked');
  }
  assert.doesNotMatch(`${out.markdown}\n${text}`, /phase-body-secret|projection-body-secret|handoff-body-secret/u);
  assert.match(text, /\[REDACTED\]/u);
  assert.match(out.markdown, /Showing the first 10 of/u);
  assert.equal(buildSdkLossAccount(events, out.markdown, out.companions).failed, false);
  assert.equal(buildParserCheck(out.markdown, await loadMarkdownParser(), { turns: 1, strict: true }).failed, false);
  const inline = buildDocument(out.session, {
    location: { sessionId: 'synthetic', sessionPath: 'synthetic.jsonl', hashRoot: '' },
    resources: { resources: [], byCall: new Map(), resourceRoot: '' },
    versions: { copilotVersion: 'test', vscodeVersion: 'test' }, memory: { session: [], repo: [], user: [] },
    outputPath: 'inline.md', gitStatus: '', generatedAt: '2026-10-20T12:00:00Z', source: 'sdk-events',
  });
  for (const body of [phase, projection, handoff])
    assert.ok(normalizeForLoss(inline).includes(normalizeForLoss(redactText(body).text)));
  assert.doesNotMatch(inline, /Showing the first 10 of|phase-body-secret|projection-body-secret|handoff-body-secret/u);
  assert.equal(buildSdkLossAccount(events, inline).failed, false);
  const exactly300 = Array.from({ length: 300 }, () => 'x'.repeat(80)).join('\n');
  const manyShortLines = Array.from({ length: 340 }, () => 'short').join('\n');
  assert.equal(planToolText(exactly300).companionText, null);
  assert.equal(planToolText(manyShortLines).companionText, null);
  assert.equal(planToolText('x'.repeat(20 * 1024)).companionText, null);
});

test('linked Fusion companions keep stream order and detect corrupt, absent, unlinked or moved bodies', () => {
  const { events, out } = longFusionExample();
  const account = (markdown: string, companions = out.companions) => buildSdkLossAccount(events, markdown, companions);
  assert.equal(account(out.markdown).failed, false);
  const phaseCompanion = out.companions.find((item) => Buffer.from(item.bytes).toString('utf8').includes('PHASE line 170'))!;
  assert.ok(phaseCompanion);
  const missing = out.companions.filter((item) => item !== phaseCompanion);
  assert.equal(account(out.markdown, missing).failed, true);
  const corrupt = out.companions.map((item) => item === phaseCompanion ? {
    ...item, bytes: Buffer.from(Buffer.from(item.bytes).toString('utf8').replace('PHASE line 170', 'CORRUPTED line 170')),
  } : item);
  assert.equal(account(out.markdown, corrupt).failed, true);
  const link = out.markdown.match(/\[[^\]\n]+\]\(chat_assets\/[^)]+\)/u)![0];
  assert.equal(account(out.markdown.replace(link, '[full body link removed]')).failed, true);
  assert.equal(account(out.markdown.replace(link, `\n\`\`\`text\n${link}\n\`\`\`\n`)).failed, true);
  assert.equal(account(out.markdown.replace(link, `\`${link}\``)).failed, true);
  assert.equal(account(out.markdown.replace(link, `\`\n${link}\n\``)).failed, true);
  assert.equal(account(out.markdown.replace(link, `\\${link}`)).failed, true);
  const [phaseBlock, handoffBlock] = fusionNoteBlocks(out.markdown);
  assert.ok(phaseBlock && handoffBlock);
  for (const removed of [phaseBlock, handoffBlock])
    assert.equal(account(out.markdown.replace(removed, '')).failed, true);
  for (const swapped of [
    swapText(out.markdown, phaseBlock, handoffBlock),
    swapText(out.markdown, handoffBlock, 'Ordinary intervening answer.'),
  ]) {
    const result = account(swapped);
    assert.equal(result.failed, true);
    assert.ok(result.order.outOfOrder > 0);
  }
});

test('linked text evidence ignores native, remote and traversal targets and supports encoded archive paths', () => {
  const body = longFusionBody('SAFE', 'safe-synthetic-secret');
  const events = [event('assistant.fusion_phase_completed', { phaseKind: 'primary', content: body }, 1)];
  const artifact = {
    id: 'synthetic', kind: 'metadata' as const, relativePath: 'assets folder/full.txt',
    mediaType: 'text/plain', bytes: Buffer.from(redactText(body).text), location: { sourceId: 'export', field: 'text' },
  };
  assert.equal(buildSdkLossAccount(events, '[Full](assets%20folder/full.txt)', [artifact]).failed, false);
  for (const target of [
    'https://example.invalid/full.txt', 'file:///C:/native/full.txt', 'C:\\native\\full.txt',
    '/native/full.txt', '../full.txt', 'assets/../full.txt', 'assets/%2e%2e', 'assets/%ZZ',
  ])
    assert.equal(buildSdkLossAccount(events, `[Full](${target})`, [{ ...artifact, relativePath: target }]).failed, true, target);
});

test('shared content-hash companions satisfy distinct events only at their remaining live references', () => {
  const body = longFusionBody('REPEATED', 'repeated-synthetic-secret');
  const events = [
    prompt('Keep every repeated event', 1),
    event('assistant.fusion_phase_completed', { phaseKind: 'primary', content: body }, 2),
    event('assistant.fusion_phase_completed', { phaseKind: 'primary', content: body }, 3),
    assistant(body, 4),
  ];
  const out = exportSdk(events);
  assert.equal(out.companions.length, 1, 'identical note bodies share a content-hash companion');
  assert.equal(buildSdkLossAccount(events, out.markdown, out.companions).failed, false);
  const blocks = fusionNoteBlocks(out.markdown);
  assert.equal(blocks.length, 2);
  const lost = buildSdkLossAccount(events, out.markdown.replace(blocks[0]!, ''), out.companions);
  assert.equal(lost.failed, true);
  assert.equal(lost.multiplicity.missing, 1, 'the other phase and ordinary answer cannot replace a missing event');
  const distinct = [
    prompt('Distinct resolutions', 1),
    event('assistant.fusion_phase_completed', { fusionId: 'first', phaseKind: 'primary', content: 'Equal output across resolutions.' }, 2),
    event('assistant.fusion_phase_completed', { fusionId: 'second', phaseKind: 'primary', content: 'Equal output across resolutions.' }, 3),
    assistant('Equal output across resolutions.', 4),
  ];
  const rendered = exportSdk(distinct);
  assert.equal(buildSdkLossAccount(distinct, rendered.markdown, rendered.companions).failed, false);
  const [removed] = fusionNoteBlocks(rendered.markdown);
  assert.ok(removed);
  assert.equal(buildSdkLossAccount(distinct, rendered.markdown.replace(removed, ''), rendered.companions).multiplicity.missing, 1);
});

test('legacy concatenated SDK companion text remains accepted for presence checks', () => {
  const events = [event('system.message', { content: 'Legacy system prompt body.' }, 1)];
  assert.equal(buildSdkLossAccount(events, 'Archive with a legacy companion.', 'Legacy system prompt body.').failed, false);
});
