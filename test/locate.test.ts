import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { currentSessionFromEnv, listSessions, looksLikeSessionArgument, resolveSession } from '../src/session/locate.ts';
import { workspaceStorageRoots } from '../src/host.ts';
import { messageText } from '../src/session/journal.ts';

const UUID = '1e6f4d3f-34bd-4f42-a5bd-d6a48ed6447d';
const RENAMED_UUID = '43d9c15d-46b7-4d49-9fd6-f84cd1b265bc';

test('messageText preserves the legacy string message form', () => {
  assert.equal(messageText('an older saved prompt'), 'an older saved prompt');
});

test('looksLikeSessionArgument separates a session from an output path', () => {
  // Neither recorded check reaches this branch: both pass a .jsonl path, so the `||`
  // short-circuits before the id test is ever evaluated. It broke once, unnoticed.
  assert.equal(looksLikeSessionArgument(UUID), true);
  assert.equal(looksLikeSessionArgument(UUID.toUpperCase()), true);
  assert.equal(looksLikeSessionArgument(`some/dir/${UUID}.jsonl`), true);

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
