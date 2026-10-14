import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { inventorySessions } from '../src/session/inventory.ts';

const ONE = '11111111-1111-4111-8111-111111111111';
const TWO = '22222222-2222-4222-8222-222222222222';
const THREE = '33333333-3333-4333-8333-333333333333';

async function fixture (context: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-inventory-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'User', 'workspaceStorage', 'hash');
  await fs.mkdir(path.join(workspace, 'chatSessions'), { recursive: true });
  return { root, workspace };
}

function index (workspace: string, entries: Record<string, unknown>) {
  const database = new DatabaseSync(path.join(workspace, 'state.vscdb'));
  try {
    database.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)');
    database.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run(
      'chat.ChatSessionStore.index', JSON.stringify({ version: 1, entries }),
    );
  } finally {
    database.close();
  }
}

async function journal (workspace: string, id = ONE, requests: unknown[] = []) {
  const file = path.join(workspace, 'chatSessions', `${id}.jsonl`);
  await fs.writeFile(file, JSON.stringify({
    kind: 0, v: { version: 3, sessionId: id, customTitle: 'Journal title', requests },
  }));
  return file;
}

test('inventory unions journals, index-only and all provider/unknown entries', async (context) => {
  const { root, workspace } = await fixture(context);
  await journal(workspace);
  await journal(workspace, TWO);
  index(workspace, {
    [ONE]: { title: 'GUI rename', lastMessageDate: 1700000000000 },
    [THREE]: { title: 'Index only' },
    'agent-host-copilotcli:/chat': { title: 'Agent host' },
    'copilotcli:/chat': { title: 'CLI' },
    'future-provider:/chat': { title: 'External' },
    'unknown-key': { title: 'Unknown' },
  });
  const result = await inventorySessions(root, { copilotHome: path.join(root, 'copilot') });
  assert.equal(result.occurrences.length, 7);
  assert.equal(result.diagnostics.length, 2, 'unresolved provider backings are diagnosed');
  const rows = new Map(result.occurrences.map((row) => [row.sessionId, row]));
  const renamed = rows.get(ONE)!;
  assert.equal(renamed.title, 'GUI rename');
  assert.equal(renamed.titleSource, 'index');
  assert.equal(renamed.activitySource, 'index');
  assert.equal(renamed.activityTimestamp, 1700000000000);
  assert.equal(renamed.backing.status, 'verified');
  assert.equal(rows.get(TWO)?.title, 'Journal title');
  assert.equal(rows.get(THREE)?.backing.status, 'unresolved');
  assert.equal(rows.get(THREE)?.visibility.status, 'included', 'index-only is not confirmed empty');
  assert.equal(rows.get('agent-host-copilotcli:/chat')?.provider, 'agent-host');
  assert.equal(rows.get('copilotcli:/chat')?.provider, 'copilot-cli');
  assert.equal(rows.get('future-provider:/chat')?.backing.status, 'unsupported');
  assert.equal(rows.get('unknown-key')?.provider, 'unknown');
});

test('corrupt optional databases do not hide journals or their diagnostics', async (context) => {
  const { root, workspace } = await fixture(context);
  await journal(workspace);
  await fs.writeFile(path.join(workspace, 'state.vscdb'), 'invalid database');
  const result = await inventorySessions(root);
  assert.equal(result.occurrences.length, 1);
  assert.equal(result.occurrences[0].backing.status, 'verified');
  assert.ok(result.diagnostics.some((item) => item.path.endsWith('state.vscdb')));
  assert.ok(result.occurrences[0].diagnostics.length);
});

test('workspace metadata retains folder and multi-root identities without guessing names', async (context) => {
  const { root, workspace } = await fixture(context);
  await journal(workspace);
  index(workspace, {});
  const metadataPath = path.join(workspace, 'workspace.json');
  await fs.writeFile(metadataPath, JSON.stringify({ folder: 'file:///C:/Projects/My%20Project' }));
  const folder = await inventorySessions(root);
  assert.deepEqual(folder.occurrences[0].provenance.workspaceIdentity,
    { kind: 'folder', uri: 'file:///C:/Projects/My%20Project' });
  await fs.writeFile(metadataPath, JSON.stringify({ workspace: 'file:///C:/Projects/team.code-workspace' }));
  const multi = await inventorySessions(root);
  assert.deepEqual(multi.occurrences[0].provenance.workspaceIdentity,
    { kind: 'workspace', uri: 'file:///C:/Projects/team.code-workspace' });
  await fs.writeFile(metadataPath, JSON.stringify({ folder: 'file:///bad%XX' }));
  const invalid = await inventorySessions(root);
  assert.equal(invalid.occurrences[0].provenance.workspaceIdentity, undefined);
  assert.equal(invalid.occurrences[0].backing.status, 'verified');
  assert.ok(invalid.diagnostics.some((item) => item.path === metadataPath && item.category === 'invalid-data'));
});

test('unreadable/unsupported journals remain included unresolved rows', async (context) => {
  const { root, workspace } = await fixture(context);
  await fs.writeFile(path.join(workspace, 'chatSessions', `${ONE}.jsonl`), 'not JSON');
  await fs.writeFile(path.join(workspace, 'chatSessions', `${TWO}.jsonl`), JSON.stringify({
    kind: 0, v: { version: 999, requests: [] },
  }));
  const result = await inventorySessions(root);
  assert.equal(result.occurrences.length, 2);
  for (const row of result.occurrences) {
    assert.equal(row.backing.status, 'unresolved');
    assert.equal(row.visibility.status, 'included');
    assert.ok(row.diagnostics.length);
  }
});

test('duplicate IDs retain separate workspace occurrences and exact provenance', async (context) => {
  const { root, workspace } = await fixture(context);
  const second = path.join(path.dirname(workspace), 'second');
  await fs.mkdir(path.join(second, 'chatSessions'), { recursive: true });
  await journal(workspace);
  await journal(second);
  const result = await inventorySessions(root);
  assert.equal(result.occurrences.length, 2);
  assert.equal(new Set(result.occurrences.map((row) => row.occurrenceId)).size, 2);
  assert.equal(new Set(result.occurrences.map((row) => row.provenance.workspaceStoragePath)).size, 2);
});

test('recorded activity replaces filesystem time when no indexed date exists', async (context) => {
  const { root, workspace } = await fixture(context);
  await journal(workspace, ONE, [{
    requestId: 'request-one', message: { text: 'Question' }, timestamp: 1700000000000,
    responseTimestamp: 1700000001000, response: [{ value: 'Answer' }],
  }]);
  const row = (await inventorySessions(root)).occurrences[0];
  assert.equal(row.activityTimestamp, 1700000001000);
  assert.equal(row.activitySource, 'journal');
  assert.equal(row.visibility.status, 'included');
});

test('chats from windows with no folder open come from global storage, with no invented project', async (context) => {
  const { root, workspace } = await fixture(context);
  await journal(workspace, ONE);
  const globalStorage = path.join(root, 'User', 'globalStorage');
  await fs.mkdir(path.join(globalStorage, 'emptyWindowChatSessions'), { recursive: true });
  await fs.writeFile(path.join(globalStorage, 'emptyWindowChatSessions', `${TWO}.jsonl`), JSON.stringify({
    kind: 0, v: { version: 3, sessionId: TWO, customTitle: 'No folder open', requests: [] },
  }));
  index(globalStorage, {
    [TWO]: { title: 'Empty window title', lastMessageDate: 1700000000000 },
    'agent-host-copilotcli:/untitled-1': { title: 'Agent from empty window' },
  });
  const result = await inventorySessions(root, { copilotHome: path.join(root, 'copilot') });
  const rows = new Map(result.occurrences.map((row) => [row.sessionId, row]));
  assert.equal(result.occurrences.length, 3);
  assert.equal(rows.get(ONE)?.provenance.store, undefined, 'workspace chats are not tagged');
  for (const id of [TWO, 'agent-host-copilotcli:/untitled-1']) {
    const row = rows.get(id)!;
    assert.equal(row.provenance.store, 'empty-window');
    assert.equal(row.provenance.workspaceStoragePath, globalStorage);
    assert.equal(row.provenance.workspaceIdentity, undefined);
  }
  assert.equal(rows.get(TWO)?.title, 'Empty window title');
  assert.equal(rows.get(TWO)?.backing.status, 'verified');
  assert.equal(rows.get(TWO)?.provenance.indexKey, TWO);
  assert.equal(rows.get('agent-host-copilotcli:/untitled-1')?.provider, 'agent-host');
});

test('a global store with only journals, or only an index, is still inventoried', async (context) => {
  const { root } = await fixture(context);
  const globalStorage = path.join(root, 'User', 'globalStorage');
  await fs.mkdir(path.join(globalStorage, 'emptyWindowChatSessions'), { recursive: true });
  await fs.writeFile(path.join(globalStorage, 'emptyWindowChatSessions', `${ONE}.jsonl`), JSON.stringify({
    kind: 0, v: { version: 3, sessionId: ONE, requests: [] },
  }));
  const journalOnly = await inventorySessions(root);
  assert.deepEqual(journalOnly.occurrences.map((row) => row.sessionId), [ONE]);
  assert.equal(journalOnly.occurrences[0].backing.status, 'verified');
  assert.ok(!journalOnly.diagnostics.some((item) => item.path.includes('globalStorage')), 'a missing global database is not noise');
  await fs.rm(path.join(globalStorage, 'emptyWindowChatSessions'), { recursive: true });
  index(globalStorage, { [TWO]: { title: 'Index only' } });
  const indexOnly = await inventorySessions(root);
  assert.deepEqual(indexOnly.occurrences.map((row) => row.sessionId), [TWO]);
  assert.equal(indexOnly.occurrences[0].backing.status, 'unresolved');
});

test('the legacy no-workspace folder is an ordinary workspace store; transferred chats are not inventoried', async (context) => {
  const { root } = await fixture(context);
  const legacy = path.join(root, 'User', 'workspaceStorage', 'no-workspace');
  await fs.mkdir(path.join(legacy, 'chatSessions'), { recursive: true });
  await journal(legacy, ONE);
  const transferred = path.join(root, 'User', 'globalStorage', 'transferredChatSessions');
  await fs.mkdir(transferred, { recursive: true });
  await fs.writeFile(path.join(transferred, `${TWO}.jsonl`), JSON.stringify({ kind: 0, v: { version: 3, sessionId: TWO, requests: [] } }));
  const result = await inventorySessions(root);
  assert.deepEqual(result.occurrences.map((row) => row.sessionId), [ONE]);
  assert.equal(result.occurrences[0].provenance.store, undefined);
  assert.equal(path.basename(result.occurrences[0].provenance.workspaceStoragePath), 'no-workspace');
});

test('inventory does not create absent native directories or databases', async (context) => {
  const { root, workspace } = await fixture(context);
  await inventorySessions(root);
  await assert.rejects(fs.stat(path.join(workspace, 'state.vscdb')), /ENOENT/);
  const emptyRoot = path.join(root, 'empty-root');
  await fs.mkdir(emptyRoot);
  const result = await inventorySessions(emptyRoot);
  assert.deepEqual(result.occurrences, []);
  assert.equal(result.diagnostics[0].category, 'source-unavailable');
  await assert.rejects(fs.stat(path.join(emptyRoot, 'User')), /ENOENT/);
});

test('pending edits in the index prevent an empty-journal classification', async (context) => {
  const { root, workspace } = await fixture(context);
  await journal(workspace);
  index(workspace, { [ONE]: { hasPendingEdits: true } });
  const result = await inventorySessions(root);
  assert.equal(result.occurrences[0].visibility.status, 'included');
});

test('New Chat with unknown creation and prompt count is hidden unless ignored rows are requested', async (context) => {
  const { root, workspace } = await fixture(context);
  index(workspace, {
    '44444444-4444-4444-8444-444444444444': { title: 'New Chat' },
  });

  const result = await inventorySessions(root);
  assert.equal(result.occurrences.length, 1);
  assert.equal(result.occurrences[0].createdTimestamp, null);
  assert.equal(result.occurrences[0].promptCount, null);
  assert.deepEqual(result.occurrences[0].visibility, { status: 'hidden', reason: 'new-chat-unknown' });
});

test('unrecognized operations and incomplete snapshots are not confirmed empty', async (context) => {
  const { root, workspace } = await fixture(context);
  const file = await journal(workspace);
  await fs.appendFile(file, '\n{"kind":999,"k":["requests"],"v":[]}');
  await fs.writeFile(path.join(workspace, 'chatSessions', `${TWO}.jsonl`), JSON.stringify({
    kind: 0, v: { version: 3, sessionId: TWO },
  }));
  const result = await inventorySessions(root);
  for (const row of result.occurrences) {
    assert.equal(row.backing.status, 'unresolved');
    assert.equal(row.visibility.status, 'included');
  }
});
