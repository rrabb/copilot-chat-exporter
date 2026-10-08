import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const CLI = process.env.CCE_TEST_CLI ?? fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const UUID = '11111111-1111-4111-8111-111111111111';

async function fixture (context: test.TestContext, multipleRoots = false) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-cli-'));
  context.after(() => fs.rm(home, { recursive: true, force: true }));
  const parent = process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support') : home;
  const root = path.join(parent, 'Code');
  const workspace = path.join(root, 'User', 'workspaceStorage', 'hash');
  const sessionPath = path.join(workspace, 'chatSessions', `${UUID}.jsonl`);
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  const raw = JSON.stringify({ kind: 0, v: {
    version: 3, sessionId: UUID, customTitle: 'Synthetic safe listing', requests: [{
      requestId: 'one', timestamp: 1700000000000, message: { text: 'Question' }, response: [{ value: 'Answer' }],
    }],
  } });
  await fs.writeFile(sessionPath, raw);
  const database = new DatabaseSync(path.join(workspace, 'state.vscdb'));
  try {
    database.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)');
    database.prepare('INSERT INTO ItemTable VALUES (?, ?)').run('chat.ChatSessionStore.index', JSON.stringify({
      version: 1, entries: {
        [UUID]: { title: 'GUI title' },
        '22222222-2222-4222-8222-222222222222': { title: 'No journal' },
        'agent-host-copilotcli:/synthetic': { title: 'Provider row' },
      },
    }));
  } finally {
    database.close();
  }
  multipleRoots && await fs.mkdir(path.join(parent, 'Code - Insiders'), { recursive: true });
  const env = {
    ...process.env, HOME: home, USERPROFILE: home, APPDATA: parent, XDG_CONFIG_HOME: parent,
    COPILOT_HOME: path.join(home, 'copilot'),
    VSCODE_TARGET_SESSION_LOG: path.join(workspace, 'GitHub.copilot-chat', 'debug-logs', UUID),
  };
  function invoke (...args: string[]) {
    return spawnSync(process.execPath, [CLI, ...args], { cwd: home, env, encoding: 'utf8', timeout: 30_000 });
  }
  return { home, root, workspace, sessionPath, raw, env, invoke };
}

test('no-argument CLI lists even when a current-session environment exists', async (context) => {
  const { home, root, sessionPath, raw, invoke } = await fixture(context);
  const result = invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Showing 3 of 3 eligible conversations/);
  assert.match(result.stdout, /PROMPTS/);
  assert.match(result.stdout, /CREATED/);
  assert.match(result.stdout, /GUI title/);
  assert.match(result.stdout, /No journal/);
  assert.match(result.stdout, /Provider row/);
  assert.match(result.stdout, /agent\s+\|.*unresolved/);
  assert.match(result.stdout, /HTML report:/);
  assert.doesNotMatch(result.stdout, /Exported session|Output:/);
  assert.equal(await fs.readFile(sessionPath, 'utf8'), raw);
  const homeEntries = await fs.readdir(home);
  const reportName = homeEntries.find((entry) => /^copilot-chat-sessions-listing-\d{6}_\d{6}\.html$/u.test(entry));
  assert.ok(reportName, 'default listing writes a timestamped HTML report');
  const report = await fs.readFile(path.join(home, reportName), 'utf8');
  assert.match(report, /How VS Code stores chats/);
  assert.match(report, /<details class="guide" id="storage-guide">/);
  assert.match(report, /GUI title/);
  assert.match(report, /ID \/ selector/);
  assert.equal(homeEntries.length, 2);
  const fullIds = invoke('--list', '--full-ids', '--no-html', '--user-data-root', root);
  assert.equal(fullIds.status, 0, fullIds.stderr);
  assert.ok(fullIds.stdout.includes(UUID));
  const output = path.join(home, 'prefix-export.md');
  const shortId = invoke(UUID.slice(0, 8), output, '--user-data-root', root);
  assert.equal(shortId.status, 0, shortId.stderr);
  assert.match(shortId.stdout, /Exported session/);
  assert.ok((await fs.stat(output)).isFile());
});

test('listing supports --no-html and explicit HTML destinations with safe overwrite', async (context) => {
  const { home, root, invoke } = await fixture(context);
  const disabled = invoke('--list', '--no-html', '--user-data-root', root);
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.doesNotMatch(disabled.stdout, /HTML report:/);
  assert.deepEqual(await fs.readdir(home), [path.basename(root)]);

  const reportPath = path.join(home, 'chosen-report.html');
  const first = invoke('--list', '--html-output', reportPath, '--user-data-root', root);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(first.stdout.includes(`HTML report: ${reportPath}`));
  const original = await fs.readFile(reportPath, 'utf8');
  const refused = invoke('--list', '--html-output', reportPath, '--user-data-root', root);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /already exists.*--overwrite/);
  assert.equal(await fs.readFile(reportPath, 'utf8'), original);
  await fs.writeFile(reportPath, '<p>previous report</p>');
  const replaced = invoke('--list', '--html-output', reportPath, '--overwrite', '--user-data-root', root);
  assert.equal(replaced.status, 0, replaced.stderr);
  assert.match(await fs.readFile(reportPath, 'utf8'), /<!doctype html>/i);
});

test('non-interactive ambiguity never chooses the first or newest root', async (context) => {
  const { root, invoke } = await fixture(context, true);
  const ambiguous = invoke('--list');
  assert.equal(ambiguous.status, 1);
  assert.match(ambiguous.stderr, /More than one VS Code user-data root/);
  assert.match(ambiguous.stderr, /Code - Insiders/);
  assert.match(ambiguous.stderr, /--user-data-root/);
  const explicit = invoke('--user-data-root', root);
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.match(explicit.stdout, /Showing 3 of 3 eligible conversations/);
});

test('output-only CLI refuses instead of exporting the current/newest session', async (context) => {
  const { home, invoke } = await fixture(context);
  const result = invoke('unwanted.md');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires an explicit session/);
  await assert.rejects(fs.stat(path.join(home, 'unwanted.md')), /ENOENT/);
});

test('ambiguous short IDs fail without creating an export', async (context) => {
  const { home, root, invoke } = await fixture(context);
  const otherId = '11111111-2222-4222-8222-222222222222';
  const otherJournal = path.join(root, 'User', 'workspaceStorage', 'other', 'chatSessions', `${otherId}.jsonl`);
  await fs.mkdir(path.dirname(otherJournal), { recursive: true });
  await fs.writeFile(otherJournal, JSON.stringify({
    kind: 0, v: { version: 3, sessionId: otherId, requests: [] },
  }));

  const output = path.join(home, 'ambiguous-prefix.md');
  const result = invoke(UUID.slice(0, 8), output, '--user-data-root', root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /prefix .* is ambiguous.*Matching Local IDs/s);
  await assert.rejects(fs.stat(output), /ENOENT/);
});

test('--current fails explicitly without identity and never falls back', async (context) => {
  const { root, env, invoke } = await fixture(context);
  env.VSCODE_TARGET_SESSION_LOG = '';
  const result = invoke('--current', '--user-data-root', root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No current session could be identified/);
  assert.doesNotMatch(result.stdout, /Exported session/);
});

test('approved Agent Host default fallback is visible in console warnings', async (context) => {
  const { root, env, invoke } = await fixture(context);
  const directory = path.join(root, 'agentSessionData', 'synthetic');
  await fs.mkdir(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'session.db'));
  db.exec('CREATE TABLE session_metadata (key TEXT PRIMARY KEY, value TEXT)');
  db.close();
  const sdk = path.join(env.COPILOT_HOME, 'session-state', 'synthetic');
  await fs.mkdir(sdk, { recursive: true });
  await fs.writeFile(path.join(sdk, 'events.jsonl'), [
    {
      type: 'session.start', timestamp: '2026-10-01T12:00:00.000Z',
      data: { sessionId: 'synthetic', version: 1 },
    },
    {
      type: 'user.message', timestamp: '2026-10-01T12:01:00.000Z',
      data: { source: 'user', content: 'Synthetic prompt' },
    },
  ].map((event) => JSON.stringify(event)).join('\n'));
  const result = invoke('--list', '--no-html', '--user-data-root', root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /agent\s+\|.*verified/);
  assert.match(result.stdout, /2026-10-01\s+\|\s+2026-10-01\s+\|\s+1/);
  assert.match(result.stdout, /identity warning\(s\)/);
  assert.doesNotMatch(result.stdout, /existing local session database and matching SDK session.start/);
  assert.doesNotMatch(result.stderr, /Identity warning/);
});

test('ambiguous children show orange question icons without invalidating main identity', async (context) => {
  const { root, workspace, env, invoke } = await fixture(context);
  const db = new DatabaseSync(path.join(workspace, 'state.vscdb'));
  try {
    db.prepare('UPDATE ItemTable SET value = ? WHERE key = ?').run(JSON.stringify({
      version: 1, entries: { 'copilotcli:/ambiguous': { title: 'Main stays available' } },
    }), 'chat.ChatSessionStore.index');
  } finally {
    db.close();
  }
  const directory = path.join(env.COPILOT_HOME, 'session-state', 'ambiguous');
  await fs.mkdir(directory, { recursive: true });
  const agentSession = path.join(root, 'agentSessionData', 'ambiguous');
  await fs.mkdir(agentSession, { recursive: true });
  const agentDb = new DatabaseSync(path.join(agentSession, 'session.db'));
  agentDb.exec('CREATE TABLE session_metadata (key TEXT PRIMARY KEY, value TEXT)');
  agentDb.close();
  await fs.writeFile(path.join(directory, 'events.jsonl'), [
    { type: 'session.start', data: { sessionId: 'ambiguous', version: 1 } },
    { type: 'user.message', data: { source: 'user', content: 'Main prompt' } },
    { type: 'subagent.started', agentId: 'a', data: { toolCallId: 'call' } },
    { type: 'subagent.started', agentId: 'b', data: { toolCallId: 'call' } },
  ].map((event) => JSON.stringify(event)).join('\n'));
  const result = invoke('--list', '--no-html', '--user-data-root', root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Main stays available/);
  assert.doesNotMatch(result.stdout, /Ambiguous subagent/);
  assert.match(result.stdout, /1 ambiguous child scope\(s\) are hidden/);
  const all = invoke('--list', '--show-ignored', '--no-html', '--user-data-root', root);
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /🟠 ❓ ambiguous/);
  assert.match(all.stdout, /Ambiguous subagent/);
});

test('CLI preserves an existing explicit output unless overwrite is requested', async (context) => {
  const { home, root, sessionPath, invoke } = await fixture(context);
  const output = path.join(home, 'saved.md');
  await fs.writeFile(output, 'Previous archive');
  const refused = invoke(sessionPath, output, '--workspace-root', home, '--user-data-root', root);
  assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stderr, /already exists.*--overwrite/);
  assert.equal(await fs.readFile(output, 'utf8'), 'Previous archive');
  assert.doesNotMatch(refused.stdout, /Exported session|Output:/);
  const replaced = invoke(sessionPath, output, '--workspace-root', home, '--user-data-root', root, '--overwrite');
  assert.equal(replaced.status, 0, replaced.stderr);
  assert.match(replaced.stdout, /Exported session/);
  assert.notEqual(await fs.readFile(output, 'utf8'), 'Previous archive');
  assert.equal((await fs.readdir(home)).filter((name) => name.startsWith('.chat-export-')).length, 0);
});
