import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectListingEvidence, localListingTurn, sdkListingTurns } from '../src/session/listing-evidence.ts';
import { localListingChanges, listingFileIdentity, listingLineDelta } from '../src/session/listing-edits.ts';
import { readSdkEvents } from '../src/session/sdk-events.ts';
import type { SessionOccurrence, SdkEventSource } from '../src/session/sources.ts';

const id = '11111111-1111-4111-8111-111111111111';
test('Local model evidence distinguishes selection, Auto and recorded answering rounds', () => {
  const turn = localListingTurn({
    modelId: 'auto', timestamp: 1700000000000,
    result: { metadata: { resolvedModel: 'ignored-fallback', toolCallRounds: [{ modelId: 'first' }, { modelId: 'second' }, { modelId: 'first' }] } },
  }, 'request', 'Question');
  assert.deepEqual(turn.models, ['first', 'second']);
  assert.equal(turn.auto, true);
  assert.equal(turn.selectedModel, 'auto');
  assert.deepEqual(localListingTurn({ modelId: 'selected-only' }, 'r', 'q').models, []);
  assert.deepEqual(localListingTurn({ modelId: 'auto', result: { metadata: { resolvedModel: 'resolved' } } }, 'r', 'q').models, ['resolved']);
  assert.equal(localListingTurn({ copilotCredits: 43.5, reasoningEffort: 'high' }, 'r', 'q').credits, 43.5);
  assert.equal(localListingTurn({ copilotCredits: -1 }, 'r', 'q').credits, null);
  assert.equal(localListingTurn({ copilotCredits: '43.5' }, 'r', 'q').credits, null);
  const usage = localListingTurn({ promptTokens: 1200, completionTokens: 0 }, 'r', 'q');
  assert.equal(usage.promptTokens, 1200);
  assert.equal(usage.completionTokens, 0);
  for (const value of [-1, 1.5, Infinity, NaN, '1200', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(localListingTurn({ promptTokens: value, completionTokens: value }, 'r', 'q').promptTokens, null);
    assert.equal(localListingTurn({ promptTokens: value, completionTokens: value }, 'r', 'q').completionTokens, null);
  }
});
test('file identities avoid double-counting Windows tool paths and serialized URI markers', () => {
  assert.equal(listingFileIdentity('C:\\Project\\A.ts'), listingFileIdentity('/c:/project/a.ts'));
  assert.equal(listingFileIdentity('C:\\Project\\A.ts'), listingFileIdentity('file:///c:/project/a.ts'));
  assert.notEqual(listingFileIdentity('/project/A.ts'), listingFileIdentity('/project/a.ts'));
  const changes = localListingChanges({
    result: { metadata: { toolCallRounds: [{ toolCalls: [{ name: 'create_file', arguments: { filePath: 'C:\\Project\\a.ts', content: 'one\n' } }] }] } },
    response: [{ kind: 'textEditGroup', uri: { path: '/c:/Project/a.ts' }, edits: [[{ text: 'one\n' }]] }],
  });
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.added, 1);
});
test('Local edits deduplicate tool identities and retain uncovered estimated markers', () => {
  const call = { id: 'call', name: 'apply_patch', arguments: '*** Begin Patch\n*** Update File: a.ts\n-old\n+new\n*** End Patch' };
  const changes = localListingChanges({
    result: { metadata: { toolCallRounds: [{ toolCalls: [call] }, { toolCalls: [call] }] } },
    response: [{ kind: 'textEditGroup', uri: { path: 'a.ts' }, edits: [] }, { kind: 'textEditGroup', uri: { path: 'b.ts' }, edits: [[{
      text: 'one\ntwo\n', range: { startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1 },
    }]] }],
  });
  assert.equal(changes.length, 2);
  assert.deepEqual(changes.map((file) => [file.file, file.added, file.removed, file.estimated]), [['a.ts', 1, 1, false], ['b.ts', 2, 0, true]]);
  assert.deepEqual(listingLineDelta('a\r\nb\r\n', 'a\nc\n'), { added: 1, removed: 1, estimated: false });
  assert.equal(listingLineDelta('a\n'.repeat(2001), 'b\n'.repeat(2001)).estimated, true);
});

async function fixture (context: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-evidence-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const journal = path.join(root, 'chatSessions', `${id}.jsonl`);
  await fs.mkdir(path.dirname(journal), { recursive: true });
  return { root, journal };
}
function occurrence (root: string, file: string, raw: string): SessionOccurrence {
  const provenance = { userDataRoot: root, workspaceStoragePath: root };
  return {
    occurrenceId: 'occurrence', provider: 'local', sessionId: id, title: 'Index title', titleSource: 'index',
    activityTimestamp: null, activitySource: 'unknown', createdTimestamp: null, promptCount: 1,
    provenance, visibility: { status: 'included' }, diagnostics: [],
    backing: { status: 'verified', source: {
      kind: 'local-journal', sessionId: id, path: file, schemaVersion: 3,
      sha256: createHash('sha256').update(raw).digest('hex'), provenance,
    } },
  };
}
test('enrichment retains replayed titles/dates, exact editing-history IDs and artifact metadata', async (context) => {
  const { root, journal } = await fixture(context);
  const raw = [
    JSON.stringify({ kind: 0, v: { customTitle: 'Old title', creationDate: 1700000000000, requests: [
      { requestId: 'one', timestamp: 1700000001000, message: { text: 'api_key=private' }, modelId: 'auto', response: [{ value: 'Answer' }],
        result: { metadata: { resolvedModel: 'answer-model' } } },
    ] } }),
    JSON.stringify({ kind: 1, k: ['customTitle'], v: 'Final title' }),
  ].join('\n');
  await fs.writeFile(journal, raw);
  const history = path.join(root, 'chatEditingSessions', id, 'state.json');
  await fs.mkdir(path.dirname(history), { recursive: true });
  await fs.writeFile(history, JSON.stringify({ timeline: { operations: [{ requestId: 'one' }, { requestId: 'one' }, { requestId: 'unrelated' }] } }));
  const resource = path.join(root, 'GitHub.copilot-chat', 'chat-session-resources', id, 'call_x', 'content.txt');
  await fs.mkdir(path.dirname(resource), { recursive: true });
  await fs.writeFile(resource, 'abc');
  const evidence = (await collectListingEvidence([occurrence(root, journal, raw)])).get('occurrence')!;
  assert.equal(evidence.state, 'read');
  assert.ok(evidence.titles.some((title) => title.source === 'journal.customTitle' && title.value === 'Final title'));
  assert.ok(evidence.dates.some((date) => date.source === 'journal.creationDate' && date.timestamp === 1700000000000));
  assert.ok(evidence.dates.some((date) => date.source === 'filesystem.mtime'));
  assert.equal(evidence.history.turns, 1);
  assert.equal(evidence.history.state, 'recorded');
  assert.equal(evidence.artifacts[0]?.bytes, 3);
  assert.equal(evidence.artifactLocations.filter((item) => item.state === 'present').length, 3);
  assert.equal(evidence.artifactLocations.length, 5);
  assert.ok(evidence.auditedBytes! > evidence.bytes!);
  assert.equal(evidence.bytes, Buffer.byteLength(raw));
  assert.equal(evidence.turns[0]?.prompt, 'api_key=[REDACTED]');
  assert.deepEqual(evidence.models, ['answer-model']);
});

test('malformed edit arguments and missing deleted-file text remain partial/unknown', async (context) => {
  const { root, journal } = await fixture(context);
  const raw = JSON.stringify({ kind: 0, v: { requests: [{
    message: { text: 'Edit files' }, response: [], result: { metadata: { toolCallRounds: [{
      toolCalls: [
        { name: 'replace_string_in_file', arguments: '{"filePath":"a.ts"}' },
        { name: 'apply_patch', arguments: '*** Begin Patch\n*** Delete File: b.ts\n*** End Patch' },
      ],
    }] } },
  }] } });
  await fs.writeFile(journal, raw);
  const data = (await collectListingEvidence([occurrence(root, journal, raw)])).get('occurrence')!;
  assert.ok(data.flags.includes('incomplete-edit-evidence'));
  assert.equal(data.files[0]?.removed, null);
  assert.equal(data.editTurns, null);
});
test('changed backing is not enriched and does not change inventory verification', async (context) => {
  const { root, journal } = await fixture(context);
  const raw = '{"kind":0,"v":{"requests":[]}}';
  const row = occurrence(root, journal, raw);
  await fs.writeFile(journal, `${raw}\n`);
  const evidence = (await collectListingEvidence([row])).get('occurrence')!;
  assert.equal(evidence.state, 'changed');
  assert.equal(evidence.turns.length, 0);
  assert.equal(evidence.bytes, null);
  assert.equal(row.backing.status, 'verified');
  assert.match(evidence.diagnostics[0]!.description, /changed/);
});
test('editing history distinguishes missing, supported empty and unsupported/unreadable records', async (context) => {
  const { root, journal } = await fixture(context);
  const raw = JSON.stringify({ kind: 0, v: { requests: [] } });
  await fs.writeFile(journal, raw);
  const row = occurrence(root, journal, raw);
  const read = async () => (await collectListingEvidence([row])).get('occurrence')!;
  assert.equal((await read()).history.state, 'missing');
  const history = path.join(root, 'chatEditingSessions', id, 'state.json');
  await fs.mkdir(path.dirname(history), { recursive: true });
  await fs.writeFile(history, JSON.stringify({ timeline: { operations: [] } }));
  assert.deepEqual((await read()).history, { state: 'empty', turns: 0, path: history });
  await fs.writeFile(history, '{invalid');
  const invalid = await read();
  assert.equal(invalid.history.state, 'unreadable');
  assert.equal(invalid.history.turns, null);
  assert.ok(invalid.diagnostics.some((item) => item.path === history));
});
test('SDK optional metadata retains persisted fork, workspace context and date/title evidence', async (context) => {
  const { root } = await fixture(context);
  const file = path.join(root, 'events.jsonl');
  const raw = [
    { type: 'session.start', timestamp: '2026-10-08T19:00:00Z', data: { version: 1, sessionId: id } },
    { type: 'user.message', data: { content: 'Injected context', source: 'system' } },
    { type: 'assistant.message', data: { content: 'Recorded response', model: 'scope-answer-model' } },
  ].map((event) => JSON.stringify(event)).join('\n');
  await fs.writeFile(file, raw);
  const log = await readSdkEvents(file, id);
  const provenance = { userDataRoot: root, workspaceStoragePath: root };
  await fs.writeFile(path.join(root, 'workspace.yaml'), `id: ${id}\nname: Workspace title\ncreated_at: 2026-10-08T18:00:00Z\ncwd: 'C:\\Project'\nbranch: main\n`);
  await fs.writeFile(path.join(root, 'vscode.metadata.json'), JSON.stringify({ customTitle: 'Metadata title', kind: 'forked', parentSessionId: 'parent-id' }));
  const row = occurrence(root, file, raw);
  row.backing = { status: 'verified', source: {
    kind: 'sdk-events', provider: 'copilot-cli', sessionId: id, path: file, schemaVersion: 1,
    producer: null, scope: { kind: 'main' }, chatIdentity: 'chat', provenance,
    identityEvidence: [], identityWarnings: [], scopeWarnings: [], sha256: log.sha256,
  } };
  const evidence = (await collectListingEvidence([row])).get('occurrence')!;
  assert.equal(evidence.fork?.parentSessionId, 'parent-id');
  assert.ok(evidence.titles.some((item) => item.value === 'Metadata title'));
  assert.ok(evidence.titles.some((item) => item.value === 'Workspace title'));
  assert.ok(evidence.dates.some((item) => item.source === 'sdk.workspace.created_at'));
  assert.ok(evidence.context.some((item) => item.field === 'cwd' && item.value === 'C:\\Project'));
  assert.equal(evidence.turns.length, 0);
  assert.equal(evidence.injectedPrompts, 1);
  assert.deepEqual(evidence.models, ['scope-answer-model']);
  assert.equal(evidence.responsePresent, true);
});
test('SDK model intervals, child delegation and bytes exclude unrelated scopes', async (context) => {
  const { root } = await fixture(context);
  const file = path.join(root, 'events.jsonl');
  const values = [
    { type: 'session.start', data: { version: 1, sessionId: id, selectedModel: 'auto', reasoningEffort: 'high' } },
    { type: 'user.message', data: { content: 'Main first' } },
    { type: 'tool.execution_start', data: { toolCallId: 'delegate', toolName: 'task', arguments: { prompt: 'Child task', description: 'Resolve hosted session transcripts', name: 'identity-research' } } },
    { type: 'subagent.started', agentId: 'child', data: { toolCallId: 'delegate', agentDisplayName: 'identity-research' } },
    { type: 'user.message', agentId: 'child', data: { content: 'Child task', source: 'agent' } },
    { type: 'assistant.message', agentId: 'child', data: { content: 'Child response', model: 'child-model' } },
    { type: 'assistant.message', data: { content: 'Main response', model: 'main-model' } },
    { type: 'session.model_change', data: { newModel: 'second-selection', reasoningEffort: 'low' } },
    { type: 'user.message', data: { content: 'Main second' } },
    { type: 'assistant.message', data: { content: 'Second response', model: 'second-model' } },
    { type: 'user.message', agentId: 'child', data: { content: 'Later child question', source: 'user' } },
    { type: 'assistant.message', agentId: 'child', data: { content: 'Later child response', model: 'later-child-model' } },
  ].map((event, index) => ({ ...event, id: `e${index}`, timestamp: new Date(1700000000000 + index * 1000).toISOString() }));
  const raw = values.map((value) => JSON.stringify(value)).join('\n');
  await fs.writeFile(file, raw);
  const log = await readSdkEvents(file, id);
  const base: SdkEventSource = {
    kind: 'sdk-events', provider: 'copilot-cli', sessionId: id, path: file, schemaVersion: 1, producer: null,
    scope: { kind: 'main' }, chatIdentity: 'chat', provenance: { userDataRoot: root, workspaceStoragePath: root },
    identityEvidence: [], identityWarnings: [], scopeWarnings: [], sha256: log.sha256,
  };
  const main = sdkListingTurns(log.events, base);
  assert.deepEqual(main.map((turn) => [turn.prompt, turn.models, turn.selectedModel, turn.effort]), [
    ['Main first', ['main-model'], 'auto', 'high'], ['Main second', ['second-model'], 'second-selection', 'low'],
  ]);
  const child: SdkEventSource = { ...base, scope: { kind: 'subagent', agentId: 'child', parentToolCallId: 'delegate', evidenceRecordIds: ['e3'] } };
  assert.deepEqual(sdkListingTurns(log.events, child).map((turn) => [turn.prompt, turn.role, turn.models]), [
    ['Child task', 'delegated', ['child-model']], ['Later child question', 'follow-up', ['later-child-model']],
  ]);
  assert.deepEqual(sdkListingTurns(log.events.filter((event) => event.id !== 'e4'), child).map((turn) => [turn.prompt, turn.role, turn.models]), [
    ['Child task', 'delegated', ['child-model']], ['Later child question', 'follow-up', ['later-child-model']],
  ], 'missing scoped delegation message is recovered only from the unique recorded parent task');
  const failedStart = { ...log.events[2]!, data: { toolCallId: 'failed-edit', toolName: 'create_file', arguments: { filePath: 'bad.ts', content: 'bad' } } };
  const failedFinish = { ...log.events[9]!, type: 'tool.execution_complete', data: { toolCallId: 'failed-edit', success: false } };
  const asyncFailure = [...log.events.slice(0, 7), failedStart, ...log.events.slice(7), failedFinish];
  assert.ok(sdkListingTurns(asyncFailure, base).every((turn) => !turn.files.some((file) => file.file === 'bad.ts')),
    'failed completion after the next prompt must not become a successful file-change count');
  const row: SessionOccurrence = { ...occurrence(root, file, raw), provider: 'copilot-cli', backing: { status: 'verified', source: child } };
  row.parentOccurrenceId = 'parent-occurrence';
  const parent: SessionOccurrence = { ...row, occurrenceId: 'parent-occurrence', parentOccurrenceId: undefined, backing: { status: 'verified', source: base } };
  await fs.writeFile(path.join(root, 'workspace.yaml'), `id: ${id}\ncwd: 'C:\\Project'\n`);
  const evidence = (await collectListingEvidence([row, parent])).get('occurrence')!;
  assert.equal(evidence.bytes, log.events.filter((event) => event.agentId === 'child').reduce((sum, event) => sum + Buffer.byteLength(event.recordedLine), 0));
  assert.ok(evidence.context.some((item) => item.field === 'cwd' && item.value === 'C:\\Project' && item.source.startsWith('parent.')),
    'child cwd is inherited through its own recorded parent, even when the child is enriched first');
  assert.ok(!evidence.models.includes('main-model'));
  assert.ok(evidence.titles.some((title) => title.source === 'delegation.arguments.description' && title.value === 'Resolve hosted session transcripts'));
  assert.ok(evidence.titles.some((title) => title.source === 'subagent.started.agentDisplayName' && title.value === 'identity-research'));
  assert.equal(evidence.turns[0]?.credits, undefined, 'SDK credits are not guessed from tokens or parent usage');
});
