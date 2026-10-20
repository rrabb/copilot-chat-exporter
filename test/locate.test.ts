import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { loadSession } from '../src/index.ts';
import { currentSessionFromEnv, listSessions, looksLikeSessionArgument, resolveSession } from '../src/session/locate.ts';
import { workspaceStorageRoots } from '../src/host.ts';
import { defaultSessionTitle, messageText } from '../src/session/journal.ts';

const UUID = '1e6f4d3f-34bd-4f42-a5bd-d6a48ed6447d';
const RENAMED_UUID = '43d9c15d-46b7-4d49-9fd6-f84cd1b265bc';

test('messageText preserves the legacy string message form', () => {
  assert.equal(messageText('an older saved prompt'), 'an older saved prompt');
});

test('defaultSessionTitle matches VS Code first-line and 200-character behavior', () => {
  assert.equal(defaultSessionTitle('First line\nSecond line'), 'First line');
  assert.equal(defaultSessionTitle('x'.repeat(250)), 'x'.repeat(200));
  assert.equal(defaultSessionTitle(''), '');
});

test('looksLikeSessionArgument separates a session from an output path', () => {
  // Neither recorded check reaches this branch: both pass a .jsonl path, so the `||`
  // short-circuits before the id test is ever evaluated. It broke once, unnoticed.
  assert.equal(looksLikeSessionArgument(UUID), true);
  assert.equal(looksLikeSessionArgument(UUID.toUpperCase()), true);
  assert.equal(looksLikeSessionArgument(UUID.slice(0, 8)), true);
  assert.equal(looksLikeSessionArgument(UUID.slice(0, 7)), false);
  assert.equal(looksLikeSessionArgument(`some/dir/${UUID}.jsonl`), true);
  assert.equal(looksLikeSessionArgument(`agent-host-copilotcli:/${UUID}#${UUID}`), true);
  assert.equal(looksLikeSessionArgument(`copilotcli:/${UUID}`), true);

  assert.equal(looksLikeSessionArgument('C:/chat-exports/out.md'), false);
  assert.equal(looksLikeSessionArgument('agent-host-copilotcli:/not a key'), false);
  assert.equal(looksLikeSessionArgument('agent-host-copilotcli:/12345678#subagent/call-1'), true);
  assert.equal(looksLikeSessionArgument('docs/chat-exports/out.md'), false);
  assert.equal(looksLikeSessionArgument('out.md'), false);
  assert.equal(looksLikeSessionArgument('not-a-uuid'), false);
  assert.equal(looksLikeSessionArgument(undefined), false);
  assert.equal(looksLikeSessionArgument(''), false);
});

test('currentSessionFromEnv reads the session VS Code is running', (t) => {
  const original = process.env.VSCODE_TARGET_SESSION_LOG;
  t.after(() => {
    if (original === undefined)
      delete process.env.VSCODE_TARGET_SESSION_LOG;
    else
      process.env.VSCODE_TARGET_SESSION_LOG = original;
  });

  delete process.env.VSCODE_TARGET_SESSION_LOG;
  assert.equal(currentSessionFromEnv(), null);

  // The variable points at a log three levels below the storage hash folder.
  const hashRoot = path.join(path.sep, 'storage', 'hash');
  process.env.VSCODE_TARGET_SESSION_LOG = path.join(hashRoot, 'GitHub.copilot-chat', 'debug-logs', UUID);
  assert.deepEqual(currentSessionFromEnv(), { sessionId: UUID, hashRoot });

  process.env.VSCODE_TARGET_SESSION_LOG = path.join(hashRoot, 'a', 'b', 'not-a-uuid');
  assert.equal(currentSessionFromEnv(), null);
});

test('--list uses later journal titles and GUI-only indexed renames', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-locate-'));
  const envName = process.platform === 'win32' ? 'APPDATA' : 'XDG_CONFIG_HOME';
  const originalRoot = process.env[envName];
  process.env[envName] = tempRoot;
  t.after(async () => {
    if (originalRoot === undefined)
      delete process.env[envName];
    else
      process.env[envName] = originalRoot;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const chatSessionsDir = path.join(workspaceStorageRoots()[0], 'workspace-hash', 'chatSessions');
  await fs.mkdir(chatSessionsDir, { recursive: true });
  const sessionPath = path.join(chatSessionsDir, `${UUID}.jsonl`);
  const records = [
    { kind: 0, v: { version: 3, sessionId: UUID, requests: [] } },
    { kind: 1, k: ['customTitle'], v: 'First generated title' },
    { kind: 1, k: ['requests', 0, 'response'], v: [{ customTitle: 'not a session title' }] },
    { kind: 1, k: ['customTitle'], v: 'User renamed title' },
  ];
  await fs.writeFile(sessionPath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
  await fs.writeFile(
    path.join(chatSessionsDir, `${RENAMED_UUID}.jsonl`),
    `${JSON.stringify({ kind: 0, v: { version: 3, sessionId: RENAMED_UUID, customTitle: 'Old journal title', requests: [] } })}\n`,
    'utf8',
  );

  const database = new DatabaseSync(path.join(path.dirname(chatSessionsDir), 'state.vscdb'));
  database.exec('CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)');
  database.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run(
    'chat.ChatSessionStore.index',
    JSON.stringify({
      version: 1,
      entries: {
        [RENAMED_UUID]: { sessionId: RENAMED_UUID, title: 'GUI renamed title' },
      },
    }),
  );
  database.close();

  const sessions = await listSessions({ withTitles: true });
  const titles = new Map(sessions.map((session) => [session.sessionId, session.title]));

  assert.equal(sessions.length, 2);
  assert.equal(titles.get(UUID), 'User renamed title');
  assert.equal(titles.get(RENAMED_UUID), 'GUI renamed title');

  const resolved = await resolveSession(RENAMED_UUID);
  assert.equal(resolved.title, 'GUI renamed title');
  assert.equal(resolved.indexedTitle, 'GUI renamed title');

  const loaded = await loadSession({ source: RENAMED_UUID, workspaceRoot: tempRoot });
  assert.equal(loaded.session.title, 'GUI renamed title');
  assert.equal(loaded.session.customTitle, 'Old journal title');
  assert.equal(loaded.session.defaultTitle, '');

  const prefixResolved = await resolveSession(UUID.slice(0, 8));
  assert.equal(prefixResolved.sessionId, UUID);
});

test('--list falls back to journal titles when the state database is missing or invalid', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-locate-fallback-'));
  const envName = process.platform === 'win32' ? 'APPDATA' : 'XDG_CONFIG_HOME';
  const originalRoot = process.env[envName];
  process.env[envName] = tempRoot;
  t.after(async () => {
    if (originalRoot === undefined)
      delete process.env[envName];
    else
      process.env[envName] = originalRoot;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const storageRoot = workspaceStorageRoots()[0];
  const cases = [
    { hash: 'missing-database', sessionId: UUID, title: 'Original title without database' },
    { hash: 'invalid-database', sessionId: RENAMED_UUID, title: 'Original title with invalid database' },
  ];
  for (const fallback of cases) {
    const hashRoot = path.join(storageRoot, fallback.hash);
    const chatSessionsDir = path.join(hashRoot, 'chatSessions');
    await fs.mkdir(chatSessionsDir, { recursive: true });
    await fs.writeFile(
      path.join(chatSessionsDir, `${fallback.sessionId}.jsonl`),
      `${JSON.stringify({ kind: 0, v: { version: 3, sessionId: fallback.sessionId, customTitle: fallback.title, requests: [] } })}\n`,
      'utf8',
    );
    if (fallback.hash === 'invalid-database')
      await fs.writeFile(path.join(hashRoot, 'state.vscdb'), 'not a SQLite database', 'utf8');
  }

  const sessions = await listSessions({ withTitles: true });
  const titles = new Map(sessions.map((session) => [session.sessionId, session.title]));

  assert.equal(titles.get(UUID), 'Original title without database');
  assert.equal(titles.get(RENAMED_UUID), 'Original title with invalid database');
});

test('library requires explicit source or explicit current intent', async () => {
  await assert.rejects(resolveSession(), /Choose an explicit session/);
  await assert.rejects(loadSession(), /Choose an explicit session/);
});

test('explicit paths validate format and identity without scanning global roots', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-source-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, `${UUID}.jsonl`);
  await fs.writeFile(file, JSON.stringify({ type: 'session.start', data: { sessionId: UUID } }));
  await assert.rejects(resolveSession(file), /Not a verified version 3 Local chat journal/);
  await fs.writeFile(file, JSON.stringify({ kind: 0, v: { version: 3, sessionId: RENAMED_UUID, requests: [] } }));
  await assert.rejects(resolveSession(file), /identity does not match/);
  await fs.writeFile(file, JSON.stringify({ kind: 0, v: { version: 3, sessionId: UUID, requests: [] } }));
  assert.equal((await resolveSession(file)).sessionPath, file);
  await assert.rejects(resolveSession(file, { current: true }), /not both/);
});

test('duplicate IDs require a path and explicit current selects the evidenced workspace only', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-duplicate-'));
  const original = process.env.VSCODE_TARGET_SESSION_LOG;
  context.after(async () => {
    if (original === undefined)
      delete process.env.VSCODE_TARGET_SESSION_LOG;
    else
      process.env.VSCODE_TARGET_SESSION_LOG = original;
    await fs.rm(root, { recursive: true, force: true });
  });
  const storage = path.join(root, 'User', 'workspaceStorage');
  const journalPaths: string[] = [];
  for (const workspace of ['one', 'two']) {
    const directory = path.join(storage, workspace, 'chatSessions');
    await fs.mkdir(directory, { recursive: true });
    const sessionPath = path.join(directory, `${UUID}.jsonl`);
    journalPaths.push(sessionPath);
    await fs.writeFile(sessionPath, JSON.stringify({
      kind: 0, v: { version: 3, sessionId: UUID, requests: [] },
    }));
  }
  const emptyWindowDir = path.join(root, 'User', 'globalStorage', 'emptyWindowChatSessions');
  await fs.mkdir(emptyWindowDir, { recursive: true });
  const emptyWindowPath = path.join(emptyWindowDir, `${UUID}.jsonl`);
  journalPaths.push(emptyWindowPath);
  await fs.writeFile(emptyWindowPath, JSON.stringify({
    kind: 0, v: { version: 3, sessionId: UUID, requests: [] },
  }));
  const requiresPath = (source: string) => assert.rejects(resolveSession(source, { userDataRoot: root }), (error: Error) => {
    assert.match(error.message, /multiple journal files/);
    for (const sessionPath of journalPaths)
      assert.ok(error.message.includes(sessionPath), `lists ${sessionPath}`);
    return true;
  });
  await requiresPath(UUID);
  await requiresPath(UUID.slice(0, 8));
  process.env.VSCODE_TARGET_SESSION_LOG = path.join(storage, 'two', 'GitHub.copilot-chat', 'debug-logs', UUID);
  const current = await resolveSession(undefined, { current: true, userDataRoot: root });
  assert.equal(current.hashRoot, path.join(storage, 'two'));
  const other = path.join(root, 'other-root');
  await fs.mkdir(other);
  await assert.rejects(resolveSession(undefined, { current: true, userDataRoot: other }), /conflicts/);
});

test('short UUID prefixes must uniquely identify a Local journal', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-prefix-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const ids = [
    'abcdef12-0000-4000-8000-000000000001',
    'abcdef12-1000-4000-8000-000000000002',
    'fedcba98-0000-4000-8000-000000000003',
  ];
  for (const [index, id] of ids.entries()) {
    const directory = path.join(root, 'User', 'workspaceStorage', `workspace-${index}`, 'chatSessions');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `${id}.jsonl`), JSON.stringify({
      kind: 0, v: { version: 3, sessionId: id, requests: [] },
    }));
  }

  await assert.rejects(resolveSession('abcdef12', { userDataRoot: root }), /ambiguous.*longer unique prefix/s);
  const longer = await resolveSession('abcdef120', { userDataRoot: root });
  assert.equal(longer.sessionId, ids[0]);
  const unique = await resolveSession('fedcba98', { userDataRoot: root });
  assert.equal(unique.sessionId, ids[2]);
});

test('UUID and prefix lookup include empty-window Local journals', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-empty-window-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sessionId = '7c11e329-5b29-41bf-940b-8f7f5d7ac624';
  const directory = path.join(root, 'User', 'globalStorage', 'emptyWindowChatSessions');
  await fs.mkdir(directory, { recursive: true });
  const sessionPath = path.join(directory, `${sessionId}.jsonl`);
  await fs.writeFile(sessionPath, JSON.stringify({
    kind: 0,
    v: { version: 3, sessionId, requests: [] },
  }));

  const listed = await listSessions({ userDataRoot: root });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].sessionPath, sessionPath);

  const byId = await resolveSession(sessionId, { userDataRoot: root });
  const byPrefix = await resolveSession(sessionId.slice(0, 8), { userDataRoot: root });
  const byPath = await resolveSession(sessionPath, { userDataRoot: root });
  assert.equal(byId.sessionPath, sessionPath);
  assert.equal(byPrefix.sessionPath, sessionPath);
  assert.equal(byPath.sessionPath, sessionPath);
  assert.equal(byPath.hashRoot, path.join(root, 'User', 'globalStorage'));
});

test('a missing Local ID explains how to find and select its journal', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-no-match-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(resolveSession(UUID, { userDataRoot: root }), (error: Error) => {
    assert.match(error.message, /--list/);
    assert.match(error.message, /--user-data-root/);
    assert.match(error.message, /exact .*\.jsonl path/);
    return true;
  });
});
