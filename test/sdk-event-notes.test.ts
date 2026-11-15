import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSdkExport } from '../src/session/sdk-export.ts';
import { buildSdkSession } from '../src/session/sdk-session.ts';
import type { SdkEvent } from '../src/session/sdk-events.ts';
import { eventsInScope } from '../src/session/sdk-events.ts';
import type { SdkEventSource, VerifiedChildScope } from '../src/session/sources.ts';
import { buildSdkLossAccount, sdkLossPieces } from '../src/verify/sdk-loss-account.ts';
import { redactText } from '../src/redaction.ts';
import type { NoteNode } from '../src/types.ts';
import { parseUsageRecords } from '../src/session/sdk-usage-record.ts';

let line = 0;
const event = (type: string, data: Record<string, unknown>, agentId?: string): SdkEvent => ({
  type, data, raw: { type, data }, recordedLine: '', line: ++line, id: `note-${line}`,
  timestamp: '2026-10-28T10:00:00.000Z', ...(agentId ? { agentId } : {}),
});
const prompt = (content = 'Inspect recorded notes', agentId?: string) => event('user.message', { content }, agentId);
const source = (): SdkEventSource => ({
  kind: 'sdk-events', provider: 'agent-host', sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  path: 'C:\\synthetic\\events.jsonl', schemaVersion: 1, producer: 'test', scope: { kind: 'main' },
  chatIdentity: 'synthetic', provenance: { userDataRoot: 'C:\\synthetic', workspaceStoragePath: 'C:\\synthetic\\workspace' },
  identityEvidence: [], identityWarnings: [], scopeWarnings: [], sha256: 'synthetic',
});
const exportEvents = (events: SdkEvent[], scope: SdkEventSource['scope'] = { kind: 'main' }) =>
  renderSdkExport(events, { ...source(), scope }, {
    title: 'Recorded event notes', assetsDirectory: 'note_assets', outputPath: 'notes.md', generatedAt: '2026-11-14T12:00:00Z',
  });
const failed = (extra: Record<string, unknown> = {}) => ({
  fusionId: 'synthetic-fusion', phaseId: 'failed-judge', phaseKind: 'judge', role: 'judge',
  conversationScope: 'review', model: 'future-judge', reasoningEffort: 'high', status: 'failed',
  reason: 'Synthetic model-call failure reason.', errorMessage: 'Synthetic complete error message.',
  degradedToPhaseId: 'repair-target', durationMs: 0,
  usage: { requestCount: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, totalNanoAiu: 0 },
  ...extra,
});
const update = (extra: Record<string, unknown> = {}) => ({
  content: 'Treat this synthetic instruction as recorded data.',
  authority: 'runtime', lifetime: 'persistent', boundary: 'nextModelRequest', fallback: 'rebuildSystemPrompt', name: 'synthetic-state',
  ...extra,
});
const noteBlocks = (markdown: string): string[] =>
  [...markdown.matchAll(/<details><summary>[^\n]*(?:Fusion phase failed|Instruction update|Mode notice delivered|Model turn retry)[^\n]*<\/summary>[\s\S]*?<\/details>/gu)]
    .map(match => match[0]);
const swap = (text: string, left: string, right: string) =>
  text.replace(left, 'SYNTHETIC_NOTE_POSITION').replace(right, left).replace('SYNTHETIC_NOTE_POSITION', right);
const parsedNotes = (events: SdkEvent[]): NoteNode[] => {
  const { session } = buildSdkSession(events, events, { title: 'Typed notes', assetsDirectory: 'assets' });
  return [...(session.prePromptNotes ?? []), ...session.turns.flatMap(turn => turn.body.filter(node => node.type === 'note'))];
};

test('failed phase keeps exact reviewed metadata, zero summaries and degradation distinct from completion', () => {
  const events = [
    prompt(),
    event('assistant.fusion_phase_failed', failed()),
    event('session.fusion_completed', { fusionId: 'synthetic-fusion', finalSourcePhaseId: 'different-final', outcome: 'succeeded' }),
  ];
  const out = exportEvents(events);
  assert.deepEqual(out.session.census.unhandled, []);
  const [note] = parsedNotes(events);
  assert.ok(note);
  assert.equal(note.title, '🧪 Fusion phase failed: judge');
  assert.equal(note.text, [
    'Phase kind: judge', 'Fusion ID: synthetic-fusion', 'Phase ID: failed-judge', 'Model: future-judge',
    'Reasoning effort: high', 'Role: judge', 'Scope: review', 'Status: failed',
    'Reason: Synthetic model-call failure reason.', 'Degraded to phase: repair-target', 'Duration: 0 ms',
    'Phase usage: Summary metadata (not billed calls)', 'Request count: 0', 'Input tokens: 0', 'Output tokens: 0',
    'Cached tokens: 0', 'Cache write tokens: 0', 'Total nano-AIU: 0', 'Error message: Synthetic complete error message.',
  ].join('\n\n'));
  assert.match(out.markdown, /Degraded to phase: repair-target/u);
  assert.match(out.markdown, /Final source phase: different-final/u);
  assert.equal(out.session.usage?.recorded.calls ?? 0, 0);
});

test('failed phase usage remains summary metadata alongside a real billed receipt', () => {
  const events = [
    event('instruction.update', update()), prompt(), event('assistant.fusion_phase_failed', failed({
      usage: { requestCount: 9, inputTokens: 900, outputTokens: 90, cachedTokens: 0, cacheWriteTokens: 0, totalNanoAiu: 900_000_000 },
    })),
    event('session.usage_record', { usage: {
      accounting: { usageId: 'actual-call', sourceSessionId: 'invented-source', sequence: 1 },
      model: 'future-judge', inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0,
      duration: 1, copilotUsage: { totalNanoAiu: 1_000_000 },
    } }),
  ];
  const out = exportEvents(events);
  assert.match(out.markdown, /Phase usage: Summary metadata \(not billed calls\)/u);
  assert.equal(out.session.usage?.recorded.calls, 1);
  assert.equal(out.session.usage?.recorded.nanoAiu, 1_000_000);
  assert.equal(out.session.usage?.recorded.inputTokens, 10);
  assert.equal(out.session.usage?.source, 'usage-record');
  assert.equal(out.session.turns.length, 1);
  assert.equal(out.session.turns[0]?.number, 1);
  assert.equal(out.session.turns[0]?.prompt, 'Inspect recorded notes');
  assert.equal(out.session.turns[0]?.ts, Date.parse('2026-10-28T10:00:00.000Z'));
  const withoutPrelude = exportEvents(events.slice(1));
  assert.deepEqual(out.session.turns[0]?.scalar.usage, withoutPrelude.session.turns[0]?.scalar.usage);
});

test('instruction and notice notes keep every reviewed field, empty strings, false and absence', () => {
  const events = [
    event('instruction.update', update()),
    event('session.mode_notice_delivered', { mode: 'future-mode', instructionUpdatePersisted: false }),
    prompt(),
    event('instruction.update', update({ content: '', authority: '', lifetime: '', boundary: '', fallback: '', name: '' })),
    event('session.mode_notice_delivered', { mode: '', instructionUpdatePersisted: true }),
    event('instruction.update', {}),
    event('session.mode_notice_delivered', {}),
  ];
  const notes = parsedNotes(events);
  assert.deepEqual(notes.map(note => [note.title, note.text]), [
    ['Instruction update', [
      'Authority: runtime', 'Lifetime: persistent', 'Boundary: nextModelRequest', 'Fallback: rebuildSystemPrompt',
      'Name: synthetic-state', 'Content:\nTreat this synthetic instruction as recorded data.',
    ].join('\n\n')],
    ['Mode notice delivered', 'Mode: future-mode\n\nInstruction update persisted: false'],
    ['Instruction update', ['Authority: ', 'Lifetime: ', 'Boundary: ', 'Fallback: ', 'Name: ', 'Content:\n'].join('\n\n')],
    ['Mode notice delivered', 'Mode: \n\nInstruction update persisted: true'],
    ['Instruction update', undefined],
    ['Mode notice delivered', undefined],
  ]);
  assert.deepEqual(exportEvents(events).session.census.unhandled, []);
});

test('minimal and empty failure fields remain distinct without invented usage or errors', () => {
  const events = [
    prompt(), event('assistant.fusion_phase_failed', { phaseKind: 'judge' }),
    event('assistant.fusion_phase_failed', { phaseKind: '', reason: '', errorMessage: '', degradedToPhaseId: '' }),
  ];
  const notes = parsedNotes(events);
  assert.equal(notes[0]?.text, 'Phase kind: judge');
  assert.equal(notes[1]?.text, 'Phase kind: \n\nReason: \n\nDegraded to phase: \n\nError message: ');
  assert.deepEqual(exportEvents(events).session.census.unhandled, []);
});

test('malformed known note fields diagnose while valid siblings remain in the exact note', () => {
  const cases: { type: string; data: Record<string, unknown>; path: string; kept: string }[] = [];
  for (const invalid of [null, 0, false, {}, []]) {
    for (const key of ['content', 'authority', 'lifetime', 'boundary', 'fallback', 'name'])
      cases.push({ type: 'instruction.update', data: update({ [key]: invalid }), path: key, kept: key === 'content' ? 'Authority: runtime' : 'Treat this synthetic instruction as recorded data.' });
    for (const key of ['phaseKind', 'fusionId', 'phaseId', 'model', 'reasoningEffort', 'role', 'conversationScope', 'status', 'reason', 'errorMessage', 'degradedToPhaseId'])
      cases.push({ type: 'assistant.fusion_phase_failed', data: failed({ [key]: invalid }), path: key, kept: key === 'errorMessage' ? 'Model: future-judge' : 'Synthetic complete error message.' });
    cases.push({ type: 'session.mode_notice_delivered', data: { mode: invalid, instructionUpdatePersisted: false }, path: 'mode', kept: 'Instruction update persisted: false' });
  }
  for (const invalid of [null, 'false', 0, 1, {}, []])
    cases.push({ type: 'session.mode_notice_delivered', data: { mode: 'future-mode', instructionUpdatePersisted: invalid }, path: 'instructionUpdatePersisted', kept: 'Mode: future-mode' });
  for (const invalid of [null, -1, NaN, Infinity, '0', false]) {
    cases.push({ type: 'assistant.fusion_phase_failed', data: failed({ durationMs: invalid }), path: 'durationMs', kept: 'Synthetic complete error message.' });
    for (const key of ['requestCount', 'inputTokens', 'outputTokens', 'cachedTokens', 'cacheWriteTokens', 'totalNanoAiu'])
      cases.push({ type: 'assistant.fusion_phase_failed', data: failed({ usage: { [key]: invalid, ...(key === 'requestCount' ? { inputTokens: 2 } : { requestCount: 2 }) } }), path: `usage.${key}`, kept: key === 'requestCount' ? 'Input tokens: 2' : 'Request count: 2' });
  }
  cases.push({ type: 'assistant.fusion_phase_failed', data: failed({ usage: null }), path: 'usage', kept: 'Synthetic complete error message.' });
  for (const item of cases) {
    const events = [prompt(), event(item.type, item.data)];
    const out = exportEvents(events);
    assert.deepEqual(out.session.census.unhandled, [[`${item.type}:unsupported`, 1]], `${item.type} ${item.path}`);
    const notes = parsedNotes(events);
    assert.ok(notes[0]?.text?.includes(item.kept), `${item.type} ${item.path} keeps sibling`);
    assert.ok(notes[1]?.text?.includes(`Expected ${item.path} `), `${item.type} ${item.path} identifies diagnostic`);
  }
});

test('unknown and nested note fields remain diagnostic without losing content', () => {
  for (const [type, data, path, kept] of [
    ['instruction.update', update({ futureField: { nested: true } }), 'futureField', 'Treat this synthetic instruction as recorded data.'],
    ['session.mode_notice_delivered', { mode: 'future-mode', futureField: { nested: true } }, 'futureField', 'Mode: future-mode'],
    ['assistant.fusion_phase_failed', failed({ futureField: { nested: true } }), 'futureField', 'Synthetic complete error message.'],
    ['assistant.fusion_phase_failed', failed({ usage: { inputTokens: 3, futureCounter: 4 } }), 'usage.futureCounter', 'Input tokens: 3'],
  ] satisfies [string, Record<string, unknown>, string, string][]) {
    const events = [prompt(), event(type, data)];
    const out = exportEvents(events);
    assert.deepEqual(out.session.census.unhandled, [[`${type}:unsupported`, 1]]);
    const notes = parsedNotes(events);
    assert.ok(notes[0]?.text?.includes(kept));
    assert.equal(notes[1]?.text, `Unrecognized field ${path}.`);
  }
});

test('raw-field loss expectations include reason before error and every equal instruction occurrence', () => {
  const events = [
    event('instruction.update', update({ content: 'Repeated instruction body.' })),
    event('session.mode_notice_delivered', { mode: 'interactive', instructionUpdatePersisted: true }),
    event('assistant.fusion_phase_failed', failed({ reason: 'First failure reason.', errorMessage: 'First failure error.' })),
    event('instruction.update', update({ content: 'Repeated instruction body.' })),
    prompt('A later prompt'),
  ];
  assert.deepEqual(sdkLossPieces(events).map(piece => [piece.category, piece.text]), [
    ['instruction-update', 'Repeated instruction body.'], ['fusion-phase-failure-reason', 'First failure reason.'],
    ['fusion-phase-error', 'First failure error.'], ['instruction-update', 'Repeated instruction body.'], ['prompt', 'A later prompt'],
  ]);
  assert.ok(sdkLossPieces(events).every(piece => piece.orderGroup === 'main' && piece.checkMultiplicity));
  const out = exportEvents(events);
  assert.equal(buildSdkLossAccount(events, out.markdown, out.companions).failed, false);
  const blocks = noteBlocks(out.markdown);
  assert.equal(blocks.length, 4);
  assert.equal(buildSdkLossAccount(events, out.markdown.replace(blocks[0]!, ''), out.companions).multiplicity.missing, 1);
  assert.equal(buildSdkLossAccount(events, out.markdown.replace('First failure error.', 'Corrupted error.'), out.companions).failed, true);
  assert.equal(buildSdkLossAccount(events, out.markdown.replace('First failure reason.', ''), out.companions).failed, true);
  assert.equal(buildSdkLossAccount(events, swap(out.markdown, blocks[0]!, blocks[2]!), out.companions).order.outOfOrder > 0, true);
});

test('all repeated notes remain separate without a prompt or adjacency deduplication', () => {
  const events = [0, 1].flatMap(() => [
    event('instruction.update', update()),
    event('session.mode_notice_delivered', { mode: 'interactive', instructionUpdatePersisted: false }),
    event('assistant.fusion_phase_failed', failed()),
  ]);
  const out = exportEvents(events);
  assert.equal(noteBlocks(out.markdown).length, 6);
  assert.equal(buildSdkLossAccount(events, out.markdown, out.companions).failed, false);
  const [first] = noteBlocks(out.markdown);
  assert.ok(first);
  assert.equal(buildSdkLossAccount(events, out.markdown.replace(first, ''), out.companions).failed, true);
});

test('envelope scope keeps root, delegated and selected-child notes separate from nested IDs', () => {
  const selected: VerifiedChildScope = { kind: 'subagent', agentId: 'selected-agent', parentToolCallId: 'selected-call', evidenceRecordIds: [] };
  const events = [
    prompt('Root question'),
    event('instruction.update', update({ content: 'Root instruction only.' })),
    event('assistant.message', { content: 'Delegating.', toolRequests: [{ toolCallId: 'selected-call', name: 'task' }] }),
    event('subagent.started', { toolCallId: 'selected-call', agentName: 'Selected' }, 'selected-agent'),
    prompt('Child question', 'selected-agent'),
    event('instruction.update', update({ content: 'Child instruction only.' }), 'selected-agent'),
    event('assistant.fusion_phase_failed', failed({ fusionId: 'root-looking-id', phaseId: 'root-looking-phase', errorMessage: 'Child error only.' }), 'selected-agent'),
    event('session.mode_notice_delivered', { mode: 'child-mode', instructionUpdatePersisted: false }, 'selected-agent'),
    event('assistant.fusion_phase_failed', failed({ fusionId: 'root-looking-id', phaseId: 'root-looking-phase', errorMessage: 'Root error only.' })),
  ];
  const built = buildSdkSession(events, eventsInScope(events, { kind: 'main' }), { title: 'Root scope', assetsDirectory: 'assets' });
  const rootNotes = built.session.turns[0]!.body.filter(node => node.type === 'note');
  assert.ok(rootNotes.some(note => note.text?.includes('Root error only.')));
  assert.ok(rootNotes.every(note => !note.text?.includes('Child error only.')));
  const childNotes = built.session.turns[0]!.toolNodes[0]!.subagent!.turns[0]!.body.filter(node => node.type === 'note');
  assert.ok(childNotes.some(note => note.text?.includes('Child instruction only.')));
  assert.ok(childNotes.some(note => note.text?.includes('Child error only.')));
  assert.ok(childNotes.every(note => !note.text?.includes('Root error only.')));
  const out = exportEvents(events, selected);
  assert.match(out.markdown, /Child instruction only\.|Child error only\./u);
  assert.doesNotMatch(out.markdown, /Root instruction only\.|Root error only\./u);
  assert.equal(buildSdkLossAccount(eventsInScope(events, selected), out.markdown, out.companions).failed, false);
});

const longText = (label: string) => Array.from({ length: 340 }, (_unused, index) =>
  `${label} line ${index + 1}: ${'complete synthetic evidence '.repeat(3)}authorization: bearer synthetic-note-secret`).join('\n');

test('a prelude never invents requests, renumbers real questions or hides the first timestamp', () => {
  for (const count of [1, 2]) {
    const real = Array.from({ length: count }, (_unused, index) => {
      const record = prompt(`Recorded question ${index + 1}.`);
      record.timestamp = `2026-10-28T10:00:0${index + 1}.000Z`;
      const receipt = event('session.usage_record', { usage: {
        accounting: { usageId: `owned-call-${index}`, sourceSessionId: 'invented-source', sequence: index },
        model: 'future-model', inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0,
        duration: 1, copilotUsage: { totalNanoAiu: 1_000_000 },
      } });
      receipt.timestamp = `2026-10-28T10:00:0${index + 1}.500Z`;
      return [record, receipt];
    }).flat();
    const prefix = [
      event('instruction.update', update({ content: 'Recorded prefix instruction.' })),
      event('session.mode_notice_delivered', { mode: 'interactive', instructionUpdatePersisted: false }),
      event('assistant.fusion_phase_failed', failed()),
    ];
    const out = exportEvents([...prefix, ...real]);
    const plain = exportEvents(real);
    assert.deepEqual(out.session.turns.map(turn => ({ number: turn.number, prompt: turn.prompt, ts: turn.ts, scalar: turn.scalar })),
      plain.session.turns.map(turn => ({ number: turn.number, prompt: turn.prompt, ts: turn.ts, scalar: turn.scalar })));
    assert.equal(out.session.usage?.recorded.calls, count);
    assert.deepEqual(out.session.usage, plain.session.usage);
    assert.match(out.markdown, new RegExp(`\\*\\*User requests:\\*\\* ${count}\\b`, 'u'));
    assert.match(out.markdown, /\*\*Session started:\*\* 2026-10-28 10:00:01Z/u);
    assert.match(out.markdown, /Q1: Recorded question 1\./u);
    assert.doesNotMatch(out.markdown, /Q0:|Q3:|session events without a preceding user prompt|no user prompt recorded/u);
    assert.ok(out.markdown.indexOf('Recorded prefix instruction.') < out.markdown.indexOf('> **USER QUESTION / REQUEST**'));
    assert.equal(buildSdkLossAccount([...prefix, ...real], out.markdown, out.companions).failed, false);
  }
});

test('notes alone export zero requests with unknown financial evidence and no question heading', () => {
  const events = [
    event('instruction.update', update()),
    event('session.mode_notice_delivered', { mode: 'interactive', instructionUpdatePersisted: false }),
    event('assistant.fusion_phase_failed', failed()),
  ];
  const out = exportEvents(events);
  assert.equal(out.session.turns.length, 0);
  assert.equal(out.session.usage, undefined);
  assert.match(out.markdown, /\*\*User requests:\*\* 0/u);
  assert.doesNotMatch(out.markdown, /Q\d+:|USER QUESTION \/ REQUEST|🔷 Request #|no user prompt recorded|session events without a preceding user prompt/u);
  assert.match(out.markdown, /Tokens and credits are not recorded/u);
  assert.equal(noteBlocks(out.markdown).length, 3);
  assert.equal(buildSdkLossAccount(events, out.markdown, out.companions).failed, false);
});

test('notes-only selected and detached children keep scope evidence without fabricated child requests', () => {
  const selected: VerifiedChildScope = { kind: 'subagent', agentId: 'only-notes', parentToolCallId: 'missing-call', evidenceRecordIds: [] };
  const bytes = Buffer.from('Invented detached prefix image bytes');
  const child = [
    event('subagent.started', { toolCallId: 'missing-call', agentName: 'Notes child' }, 'only-notes'),
    event('session.binary_asset', { assetId: 'child-prefix-image', type: 'image', mimeType: 'image/png', byteLength: bytes.length, data: bytes.toString('base64'), description: 'Child prefix image' }, 'only-notes'),
    event('instruction.update', update({ content: 'Child prefix content.' }), 'only-notes'),
    event('assistant.fusion_phase_failed', failed({ errorMessage: 'Child prefix error.' }), 'only-notes'),
  ];
  const events = [prompt('Root question'), event('instruction.update', update({ content: 'Root content.' })), ...child];
  const out = exportEvents(events, selected);
  assert.equal(out.session.turns.length, 0);
  assert.match(out.markdown, /Child prefix content\.|Child prefix error\./u);
  assert.doesNotMatch(out.markdown, /Root content\.|Root question|Child request #|Q\d+:/u);
  assert.match(out.markdown, /Images bypass text redaction/u);
  assert.ok(!out.markdown.includes(bytes.toString('base64')));
  assert.equal(buildSdkLossAccount(eventsInScope(events, selected), out.markdown, out.companions).failed, false);
  const root = exportEvents(events);
  assert.equal(root.session.turns.length, 1);
  assert.equal(root.session.detachedSubagents?.[0]?.turns.length, 0);
  assert.match(root.markdown, /Child prefix content\.|Child prefix error\./u);
  assert.doesNotMatch(root.markdown, /Child request #/u);
  assert.match(root.markdown, /Images bypass text redaction/u);
});

test('recorded delegated task input survives child notes before its first recorded follow-up', () => {
  const events = [
    prompt('Root delegation'),
    event('assistant.message', { content: 'Delegating the task.', toolRequests: [
      { toolCallId: 'task-with-input', name: 'task', arguments: { prompt: 'Recorded delegated task input.' } },
    ] }),
    event('subagent.started', { toolCallId: 'task-with-input', agentName: 'Worker' }, 'worker'),
    event('instruction.update', update({ content: 'Child instruction before follow-up.' }), 'worker'),
    prompt('Recorded child follow-up.', 'worker'),
    event('session.mode_notice_delivered', { mode: 'interactive', instructionUpdatePersisted: false }, 'worker'),
  ];
  const out = exportEvents(events);
  const child = out.session.turns[0]?.toolNodes[0]?.subagent;
  assert.ok(child);
  assert.deepEqual(child.turns.map(turn => turn.prompt), ['Recorded delegated task input.', 'Recorded child follow-up.']);
  assert.match(out.markdown, /Recorded delegated task input\./u);
  assert.doesNotMatch(out.markdown, /no user prompt recorded|session events without a preceding user prompt/u);
  assert.equal(buildSdkLossAccount(events, out.markdown, out.companions).failed, false);
});

test('older pending notes and images retain full rendering and privacy warnings in a new prelude', () => {
  const bytes = Buffer.from('Invented image bytes for prefix testing');
  const events = [
    event('session.info', { message: 'Older prefix information.' }),
    event('session.binary_asset', { assetId: 'prefix-image', type: 'image', mimeType: 'image/png', byteLength: bytes.length, data: bytes.toString('base64'), description: 'Prefix image' }),
    event('instruction.update', update({ content: 'New prefix instruction.' })),
    prompt('Image-aware real question'),
  ];
  const out = exportEvents(events);
  assert.equal(out.session.turns.length, 1);
  assert.match(out.markdown, /Older prefix information\.|New prefix instruction\./u);
  assert.match(out.markdown, /Images bypass text redaction/u);
  assert.ok(out.markdown.indexOf('Older prefix information.') < out.markdown.indexOf('New prefix instruction.'));
  assert.ok(out.markdown.indexOf('New prefix instruction.') < out.markdown.indexOf('> **USER QUESTION / REQUEST**'));
  assert.ok(out.companions.some(item => item.kind === 'image'));
  assert.ok(!out.markdown.includes(bytes.toString('base64')));
});

test('pre-prompt and notes-only companions stay complete, redacted and independently checked', () => {
  for (const hasPrompt of [false, true]) {
    const instruction = longText('PREFIX_INSTRUCTION');
    const error = longText('PREFIX_ERROR');
    const prefix = [
      event('instruction.update', update({ content: instruction })),
      event('assistant.fusion_phase_failed', failed({ errorMessage: error })),
    ];
    const events = hasPrompt ? [...prefix, prompt('Question after complete prefix')] : prefix;
    const out = exportEvents(events);
    assert.equal(out.session.turns.length, hasPrompt ? 1 : 0);
    const bodies = out.companions.map(item => Buffer.from(item.bytes).toString('utf8')).join('\n');
    assert.ok(bodies.includes(redactText(instruction).text));
    assert.ok(bodies.includes(redactText(error).text));
    assert.doesNotMatch(out.markdown + bodies, /synthetic-note-secret/u);
    const check = (markdown: string, companions = out.companions) => buildSdkLossAccount(events, markdown, companions);
    assert.equal(check(out.markdown).failed, false);
    const blocks = noteBlocks(out.markdown);
    assert.equal(blocks.length, 2);
    assert.equal(check(out.markdown.replace(blocks[0]!, '')).failed, true);
    assert.equal(check(swap(out.markdown, blocks[0]!, blocks[1]!)).failed, true);
    for (const artifact of out.companions) {
      assert.equal(check(out.markdown, out.companions.filter(item => item !== artifact)).failed, true);
      const body = Buffer.from(artifact.bytes).toString('utf8');
      const corrupt = out.companions.map(item => item === artifact ? { ...item, bytes: Buffer.from(body.replace('line 170', 'line CORRUPTED')) } : item);
      assert.equal(check(out.markdown, corrupt).failed, true);
      const link = [...out.markdown.matchAll(/\[[^\]\n]+\]\(([^)]+)\)/gu)].find(match => decodeURIComponent(match[1]!) === artifact.relativePath)?.[0];
      assert.ok(link);
      assert.equal(check(out.markdown.replace(link, '[Link removed]')).failed, true);
    }
  }
});

test('long instructions, failure reasons and errors remain redacted in live linked companions', () => {
  const instruction = longText('INSTRUCTION');
  const reason = longText('FAILURE_REASON');
  const error = longText('FAILURE_ERROR');
  const events = [
    prompt(), event('instruction.update', update({ content: instruction })),
    event('assistant.fusion_phase_failed', failed({ reason, errorMessage: error })),
  ];
  const out = exportEvents(events);
  const links = new Set([...out.markdown.matchAll(/\]\(([^)]+)\)/gu)].map(match => decodeURIComponent(match[1]!)));
  const linked = out.companions.filter(item => links.has(item.relativePath));
  const bodies = linked.map(item => Buffer.from(item.bytes).toString('utf8')).join('\n');
  for (const body of [instruction, reason, error]) {
    assert.ok(body.split('\n').length > 300 && Buffer.byteLength(body) > 15 * 1024);
    assert.ok(bodies.includes(redactText(body).text), 'full redacted text, not just its preview');
  }
  assert.doesNotMatch(out.markdown + bodies, /synthetic-note-secret/u);
  assert.match(out.markdown, /Showing the first 10 of/u);
  assert.equal(buildSdkLossAccount(events, out.markdown, out.companions).failed, false);
  const artifact = linked.find(item => Buffer.from(item.bytes).toString('utf8').includes('INSTRUCTION line 170'));
  assert.ok(artifact);
  const check = (markdown: string, companions = out.companions) => buildSdkLossAccount(events, markdown, companions);
  assert.equal(check(out.markdown, out.companions.filter(item => item !== artifact)).failed, true);
  const corrupt = out.companions.map(item => item === artifact ? {
    ...item, bytes: Buffer.from(Buffer.from(item.bytes).toString('utf8').replace('INSTRUCTION line 170', 'CORRUPTED line 170')),
  } : item);
  assert.equal(check(out.markdown, corrupt).failed, true);
  const link = [...out.markdown.matchAll(/\[[^\]\n]+\]\(([^)]+)\)/gu)].find(match => decodeURIComponent(match[1]!) === artifact.relativePath)?.[0];
  assert.ok(link);
  assert.equal(check(out.markdown.replace(link, '[Missing full instruction link]')).failed, true);
  assert.equal(check(out.markdown.replace(link, `\`${link}\``)).failed, true);
  const blocks = noteBlocks(out.markdown);
  assert.equal(blocks.length, 2);
  assert.equal(check(swap(out.markdown, blocks[0]!, blocks[1]!)).order.outOfOrder > 0, true);
});

const catalog = () => ({
  id: 'catalog-model', name: 'Invented catalog model', object: 'catalog-object', vendor: 'invented-vendor',
  version: 'catalog-version', modelProviderId: 'catalog-provider', modelProviderOrdering: 0,
  provider: { id: 'provider-id', kind: 'provider-kind', label: 'Provider label' },
  is_chat_default: false, is_chat_fallback: true, model_picker_category: 'category', model_picker_enabled: false,
  model_picker_price_category: 'price-category', preview: false, supported_endpoints: ['endpoint-one', 'endpoint-two'],
  capabilities: {
    family: 'family', object: 'capability-object', tokenizer: 'tokenizer', type: 'chat',
    limits: { max_context_window_tokens: 128000, max_output_tokens: 4096, max_prompt_tokens: 120000,
      vision: { max_prompt_image_size: 1024, max_prompt_images: 2, supported_media_types: ['image/test', 'image/future'] } },
    supports: { parallel_tool_calls: false, reasoning_effort: ['low', 'future-effort'], streaming: true,
      structured_outputs: false, tool_calls: true, vision: false, adaptive_thinking: 'future-adaptive' },
  },
  billing: { auto_discount: 0, restricted_to: ['plan-one', 'future-plan'],
    token_prices: { batch_size: 1000,
      default: { cache_read_price: 0.1, cache_write_price: 0.2, input_price: 0.3, max_prompt_tokens: 32000, output_price: 0.4 },
      long_context: { cache_read_price: 1.1, cache_write_price: 1.2, input_price: 1.3, max_prompt_tokens: 128000, output_price: 1.4 } } },
});
const retry = (extra: Record<string, unknown> = {}) => ({
  kind: 'turn_retry', model: 'requested-model', reason: 'Synthetic retry reason.', turn: 0, timestampMs: 123,
  modelInfo: catalog(), ...extra,
});

test('retry notes retain every reviewed catalog leaf with explicit labels, not inferred identity or charges', () => {
  const events = [
    event('session.start', { producer: 'test', copilotVersion: 'producer-build' }),
    prompt(), event('model.turn_retry', retry()),
  ];
  const out = exportEvents(events);
  assert.deepEqual(out.session.census.unhandled, []);
  const [note] = parsedNotes(events);
  assert.ok(note);
  assert.equal(note.title, 'Model turn retry');
  const metadata = [
    'Kind: turn_retry', 'Requested model: requested-model', 'Reason: Synthetic retry reason.',
    'Local model-loop turn index: 0', 'Recorded timestamp (ms): 123',
  ];
  const groups = [
    [
      'Identity and provider:', 'Catalog model ID: catalog-model',
      'Catalog model name: Invented catalog model', 'Catalog object: catalog-object',
      'Catalog vendor: invented-vendor', 'Catalog model version: catalog-version',
      'Catalog provider ID: catalog-provider', 'Catalog provider ordering: 0',
      'Provider:', 'ID: provider-id', 'Kind: provider-kind', 'Label: Provider label',
    ],
    [
      'Availability and endpoints:', 'Chat default: false', 'Chat fallback: true',
      'Model picker category: category', 'Model picker enabled: false',
      'Model picker price category: price-category', 'Preview: false',
      'Supported endpoints:', '- endpoint-one', '- endpoint-two',
    ],
    [
      'Capabilities:', 'Family: family', 'Object: capability-object', 'Tokenizer: tokenizer', 'Type: chat',
      'Limits:', 'Max context window tokens: 128000', 'Max output tokens: 4096', 'Max prompt tokens: 120000',
      'Vision:', 'Max prompt image size: 1024', 'Max prompt images: 2', 'Supported media types:', '- image/test', '- image/future',
      'Supports:', 'Parallel tool calls: false', 'Streaming: true',
      'Structured outputs: false', 'Tool calls: true', 'Vision: false',
      'Reasoning effort:', '- low', '- future-effort', 'Adaptive thinking: future-adaptive',
    ],
    [
      'Configured billing (not charges):', 'Auto discount: 0', 'Restricted to:', '- plan-one', '- future-plan',
      'Token prices (configuration, currency not inferred):', 'Batch size: 1000',
      'Default:', 'Cache read price: 0.1', 'Cache write price: 0.2', 'Input price: 0.3', 'Max prompt tokens: 32000', 'Output price: 0.4',
      'Long context:', 'Cache read price: 1.1', 'Cache write price: 1.2', 'Input price: 1.3', 'Max prompt tokens: 128000', 'Output price: 1.4',
    ],
  ];
  assert.equal(note.text, [...metadata, `Model catalog:\n${groups.map(group => group.join('\n')).join('\n\n')}`].join('\n\n'));
  const expected = [...metadata, 'Model catalog:', ...groups.flat()];
  for (const line of expected) {
    assert.ok(note.text?.split('\n').includes(line), `exact metadata line: ${line}`);
    assert.ok(out.markdown.includes(line), `readable metadata line: ${line}`);
  }
  assert.match(out.markdown, /Copilot version:\*\* `producer-build`/u);
  assert.doesNotMatch(out.markdown, /Copilot version:\*\* `catalog-version`|Q0:/u);
  assert.equal(out.session.usage, undefined);
});

test('every retry stays ordered and distinct before or without prompts, with independent reason checks', () => {
  for (const hasPrompt of [false, true]) {
    const events = [
      event('model.turn_retry', retry({ reason: 'Repeated retry evidence.' })),
      event('model.turn_retry', retry({ reason: 'Different retry evidence.' })),
      event('model.turn_retry', retry({ reason: 'Repeated retry evidence.' })),
      ...(hasPrompt ? [prompt('Actual question after retries')] : []),
    ];
    const out = exportEvents(events);
    assert.equal(out.session.turns.length, hasPrompt ? 1 : 0);
    const blocks = [...out.markdown.matchAll(/<details><summary>[^\n]*Model turn retry[^\n]*<\/summary>[\s\S]*?<\/details>/gu)].map(match => match[0]);
    assert.equal(blocks.length, 3);
    const pieces = sdkLossPieces(events).filter(piece => piece.category === 'model-turn-retry-reason');
    assert.deepEqual(pieces.map(piece => piece.text), ['Repeated retry evidence.', 'Different retry evidence.', 'Repeated retry evidence.']);
    assert.ok(pieces.every(piece => piece.orderGroup === 'main' && piece.checkMultiplicity));
    const check = (markdown: string) => buildSdkLossAccount(events, markdown, out.companions);
    assert.equal(check(out.markdown).failed, false);
    assert.equal(check(out.markdown.replace(blocks[0]!, '')).failed, true);
    assert.equal(check(out.markdown.replace('Different retry evidence.', 'Corrupt retry evidence.')).failed, true);
    assert.equal(check(swap(out.markdown, blocks[0]!, blocks[1]!)).order.outOfOrder > 0, true);
    assert.doesNotMatch(out.markdown, /Q0:/u);
  }
});

test('retry optional fields, empty containers, zero and false differ from absent metadata', () => {
  const events = [
    prompt(), event('model.turn_retry', {}),
    event('model.turn_retry', { kind: '', model: '', reason: '', turn: 0, timestampMs: 0, modelInfo: {} }),
    event('model.turn_retry', { modelInfo: { name: '', provider: {}, supported_endpoints: [],
      is_chat_default: false, capabilities: {}, billing: { auto_discount: 0, restricted_to: [] } } }),
  ];
  const notes = parsedNotes(events);
  assert.equal(notes[0]?.text, undefined);
  assert.ok(notes[1]?.text?.includes('Kind: \n'));
  assert.ok(notes[1]?.text?.includes('Local model-loop turn index: 0'));
  assert.ok(notes[1]?.text?.includes('Recorded timestamp (ms): 0'));
  assert.ok(notes[1]?.text?.includes('Model catalog:\n(empty object)'));
  for (const line of ['Catalog model name: ', 'Provider:\n(empty object)', 'Supported endpoints: []', 'Chat default: false', 'Capabilities:\n(empty object)', 'Auto discount: 0', 'Restricted to: []'])
    assert.ok(notes[2]?.text?.includes(line), line);
  assert.deepEqual(exportEvents(events).session.census.unhandled, []);
});

test('malformed retry catalog values diagnose exact paths and keep reason and valid siblings', () => {
  const base = catalog();
  const cases: { payload: Record<string, unknown>; path: string; kept?: string }[] = [
    ...['kind', 'model', 'reason'].map(key => ({ payload: retry({ [key]: false }), path: key, kept: key === 'reason' ? 'Catalog model ID: catalog-model' : 'Synthetic retry reason.' })),
    ...['turn', 'timestampMs'].flatMap(key => [null, '0', NaN, Infinity, false].map(value => ({ payload: retry({ [key]: value }), path: key }))),
    ...[null, [], 'wrong'].map(value => ({ payload: retry({ modelInfo: value }), path: 'modelInfo' })),
    ...['id', 'name', 'object', 'vendor', 'version', 'modelProviderId'].map(key => ({ payload: retry({ modelInfo: { ...base, [key]: null } }), path: `modelInfo.${key}` })),
    ...['is_chat_default', 'is_chat_fallback', 'model_picker_enabled', 'preview'].map(key => ({ payload: retry({ modelInfo: { ...base, [key]: 'false' } }), path: `modelInfo.${key}` })),
    ...['model_picker_category', 'model_picker_price_category'].map(key => ({ payload: retry({ modelInfo: { ...base, [key]: null } }), path: `modelInfo.${key}` })),
    { payload: retry({ modelInfo: { ...base, modelProviderOrdering: '0' } }), path: 'modelInfo.modelProviderOrdering' },
    { payload: retry({ modelInfo: { ...base, provider: [] } }), path: 'modelInfo.provider' },
    { payload: retry({ modelInfo: { ...base, provider: { ...base.provider, label: 4 } } }), path: 'modelInfo.provider.label' },
    { payload: retry({ modelInfo: { ...base, supported_endpoints: 'wrong' } }), path: 'modelInfo.supported_endpoints' },
    { payload: retry({ modelInfo: { ...base, supported_endpoints: ['kept-endpoint', 3, 'future-endpoint'] } }), path: 'modelInfo.supported_endpoints[1]', kept: '- kept-endpoint' },
    { payload: retry({ modelInfo: { ...base, capabilities: null } }), path: 'modelInfo.capabilities' },
    { payload: retry({ modelInfo: { ...base, capabilities: { ...base.capabilities, family: [] } } }), path: 'modelInfo.capabilities.family' },
    { payload: retry({ modelInfo: { ...base, capabilities: { ...base.capabilities, supports: [] } } }), path: 'modelInfo.capabilities.supports' },
    { payload: retry({ modelInfo: { ...base, capabilities: { ...base.capabilities, supports: { ...base.capabilities.supports, streaming: 'true' } } } }), path: 'modelInfo.capabilities.supports.streaming' },
    { payload: retry({ modelInfo: { ...base, capabilities: { ...base.capabilities, supports: { ...base.capabilities.supports, adaptive_thinking: true } } } }), path: 'modelInfo.capabilities.supports.adaptive_thinking' },
    { payload: retry({ modelInfo: { ...base, capabilities: { ...base.capabilities, supports: { ...base.capabilities.supports, reasoning_effort: ['kept-effort', false] } } } }), path: 'modelInfo.capabilities.supports.reasoning_effort[1]', kept: '- kept-effort' },
    { payload: retry({ modelInfo: { ...base, capabilities: { ...base.capabilities, limits: { ...base.capabilities.limits, max_output_tokens: null } } } }), path: 'modelInfo.capabilities.limits.max_output_tokens' },
    { payload: retry({ modelInfo: { ...base, capabilities: { ...base.capabilities, limits: false } } }), path: 'modelInfo.capabilities.limits' },
    { payload: retry({ modelInfo: { ...base, capabilities: { ...base.capabilities, limits: { ...base.capabilities.limits, vision: [] } } } }), path: 'modelInfo.capabilities.limits.vision' },
    { payload: retry({ modelInfo: { ...base, capabilities: { ...base.capabilities, limits: { ...base.capabilities.limits, vision: { ...base.capabilities.limits.vision, supported_media_types: ['kept-media', false] } } } } }), path: 'modelInfo.capabilities.limits.vision.supported_media_types[1]', kept: '- kept-media' },
    { payload: retry({ modelInfo: { ...base, billing: [] } }), path: 'modelInfo.billing' },
    { payload: retry({ modelInfo: { ...base, billing: { ...base.billing, restricted_to: ['kept-plan', {}] } } }), path: 'modelInfo.billing.restricted_to[1]', kept: '- kept-plan' },
    { payload: retry({ modelInfo: { ...base, billing: { ...base.billing, token_prices: [] } } }), path: 'modelInfo.billing.token_prices' },
    { payload: retry({ modelInfo: { ...base, billing: { ...base.billing, token_prices: { ...base.billing.token_prices, default: null } } } }), path: 'modelInfo.billing.token_prices.default' },
    { payload: retry({ modelInfo: { ...base, billing: { ...base.billing, token_prices: { ...base.billing.token_prices, long_context: 'wrong' } } } }), path: 'modelInfo.billing.token_prices.long_context' },
    { payload: retry({ modelInfo: { ...base, billing: { ...base.billing, token_prices: { ...base.billing.token_prices, default: { ...base.billing.token_prices.default, input_price: 'wrong' } } } } }), path: 'modelInfo.billing.token_prices.default.input_price' },
  ];
  for (const item of cases) {
    const events = [prompt(), event('model.turn_retry', item.payload)];
    const out = exportEvents(events);
    assert.deepEqual(out.session.census.unhandled, [['model.turn_retry:unsupported', 1]], item.path);
    const notes = parsedNotes(events);
    assert.ok(notes[0]?.text?.includes(item.kept ?? 'Synthetic retry reason.'), item.path);
    assert.ok(notes[1]?.text?.includes(`Expected ${item.path} `), item.path);
  }
});

test('future catalog keys are diagnostic while future strings and valid list members remain readable', () => {
  const base = catalog();
  for (const [payload, path] of [
    [retry({ futureField: true }), 'futureField'],
    [retry({ modelInfo: { ...base, futureField: true } }), 'modelInfo.futureField'],
    [retry({ modelInfo: { ...base, capabilities: { ...base.capabilities, futureField: {} } } }), 'modelInfo.capabilities.futureField'],
    [retry({ modelInfo: { ...base, billing: { ...base.billing, token_prices: { ...base.billing.token_prices, default: { ...base.billing.token_prices.default, futureRate: 5 } } } } }), 'modelInfo.billing.token_prices.default.futureRate'],
  ] satisfies [Record<string, unknown>, string][]) {
    const events = [prompt(), event('model.turn_retry', payload)];
    const notes = parsedNotes(events);
    assert.ok(notes[0]?.text?.includes('Adaptive thinking: future-adaptive'));
    assert.equal(notes[1]?.text, `Unrecognized field ${path}.`);
  }
});

test('nonempty unsupported catalog containers never claim recorded emptiness', () => {
  const unknown = parsedNotes([event('model.turn_retry', retry({ modelInfo: { future: true } }))]);
  assert.match(unknown[0]?.text ?? '', /Model catalog:\n\(no valid supported fields\)/u);
  assert.doesNotMatch(unknown[0]?.text ?? '', /\(empty object\)/u);
  assert.equal(unknown[1]?.text, 'Unrecognized field modelInfo.future.');
  const malformed = parsedNotes([event('model.turn_retry', retry({ modelInfo: {
    provider: { label: false }, supported_endpoints: [null, false],
    capabilities: { supports: { streaming: 'false' } }, billing: {},
  } }))]);
  assert.match(malformed[0]?.text ?? '', /Provider:\n\(no valid supported fields\)/u);
  assert.match(malformed[0]?.text ?? '', /Supported endpoints: \(no valid string members\)/u);
  assert.match(malformed[0]?.text ?? '', /Supports:\n\(no valid supported fields\)/u);
  assert.match(malformed[0]?.text ?? '', /Configured billing \(not charges\):\n\(empty object\)/u);
  for (const issue of [
    'Expected modelInfo.provider.label string.',
    'Expected modelInfo.supported_endpoints[0] string.',
    'Expected modelInfo.supported_endpoints[1] string.',
    'Expected modelInfo.capabilities.supports.streaming boolean.',
  ])
    assert.ok(malformed[1]?.text?.includes(issue), issue);
});

test('catalog rates never add usage or replace receipt or ledger accounting', () => {
  const base = catalog();
  const priced = retry({ modelInfo: { ...base, billing: { ...base.billing, token_prices: {
    ...base.billing.token_prices, default: { ...base.billing.token_prices.default, input_price: 999_000_000_000 },
  } } } });
  const receipt = event('session.usage_record', { usage: {
    accounting: { usageId: 'real-receipt', sourceSessionId: 'invented-source', sequence: 1 },
    model: 'charged-model', inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0,
    duration: 1, copilotUsage: { totalNanoAiu: 2_000_000 },
  } });
  const firstPrompt = prompt('A charged question');
  const plain = exportEvents([firstPrompt, receipt]);
  const withRetry = exportEvents([firstPrompt, event('model.turn_retry', priced), receipt]);
  assert.deepEqual(withRetry.session.usage, plain.session.usage);
  assert.equal(withRetry.session.usage?.recorded.nanoAiu, 2_000_000);
  assert.equal(withRetry.session.usage?.recorded.calls, 1);
  const ledger = parseUsageRecords([receipt]).calls.map(call => ({ ...call, nanoAiu: 7_000_000 }));
  const options = { title: 'Ledger first', assetsDirectory: 'note_assets', outputPath: 'notes.md', generatedAt: '2026-11-14T12:00:00Z', ledger };
  const ledgerPlain = renderSdkExport([firstPrompt, receipt], source(), options);
  const ledgerRetry = renderSdkExport([firstPrompt, event('model.turn_retry', priced), receipt], source(), options);
  assert.deepEqual(ledgerRetry.session.usage, ledgerPlain.session.usage);
  assert.equal(ledgerRetry.session.usage?.source, 'session-store');
  assert.equal(ledgerRetry.session.usage?.recorded.nanoAiu, 7_000_000);
  assert.deepEqual(exportEvents([event('model.turn_retry', priced)]).session.turns, []);
});

test('retry envelope ownership and long reason/catalog text retain complete redacted evidence', () => {
  const selected: VerifiedChildScope = { kind: 'subagent', agentId: 'retry-child', parentToolCallId: 'missing-parent', evidenceRecordIds: [] };
  const reason = longText('RETRY_REASON');
  const name = longText('CATALOG_NAME');
  const events = [
    event('model.turn_retry', retry({ reason: 'Root retry only.' })),
    event('subagent.started', { toolCallId: 'missing-parent', agentName: 'Retry child' }, 'retry-child'),
    event('model.turn_retry', retry({ reason, modelInfo: { ...catalog(), id: 'root-looking-id', name } }), 'retry-child'),
    event('model.turn_retry', retry({ reason: 'Later child retry reason.', modelInfo: {} }), 'retry-child'),
  ];
  const out = exportEvents(events, selected);
  assert.equal(out.session.turns.length, 0);
  assert.doesNotMatch(out.markdown, /Root retry only\.|Q0:/u);
  const scoped = eventsInScope(events, selected);
  assert.ok(sdkLossPieces(scoped).every(piece => piece.orderGroup === 'agent:retry-child'));
  const bodies = out.companions.map(item => Buffer.from(item.bytes).toString('utf8')).join('\n');
  assert.ok(bodies.includes(redactText(reason).text));
  assert.ok(bodies.includes(redactText(name).text), 'complete catalog text, not its preview');
  assert.doesNotMatch(out.markdown + bodies, /synthetic-note-secret/u);
  assert.equal(buildSdkLossAccount(scoped, out.markdown, out.companions).failed, false);
  assert.equal(buildSdkLossAccount(scoped, out.markdown, []).failed, true);
  const corrupt = out.companions.map(item => ({ ...item, bytes: Buffer.from(Buffer.from(item.bytes).toString('utf8').replace('RETRY_REASON line 170', 'CORRUPTED line 170')) }));
  assert.equal(buildSdkLossAccount(scoped, out.markdown, corrupt).failed, true);
  const artifact = out.companions.find(item => Buffer.from(item.bytes).toString('utf8').includes('RETRY_REASON line 170'));
  assert.ok(artifact);
  const link = [...out.markdown.matchAll(/\[[^\]\n]+\]\(([^)]+)\)/gu)].find(match => decodeURIComponent(match[1]!) === artifact.relativePath)?.[0];
  assert.ok(link);
  assert.equal(buildSdkLossAccount(scoped, out.markdown.replace(link, '[Unlinked retry reason]'), out.companions).failed, true);
  assert.equal(buildSdkLossAccount(scoped, out.markdown.replace(link, `\`${link}\``), out.companions).failed, true);
  const blocks = noteBlocks(out.markdown);
  assert.equal(blocks.length, 2);
  assert.equal(buildSdkLossAccount(scoped, swap(out.markdown, blocks[0]!, blocks[1]!), out.companions).order.outOfOrder > 0, true);
});
