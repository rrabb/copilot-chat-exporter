import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
// @ts-expect-error The corpus runner is a plain .mjs script without declarations.
import { countBase64LikeStrings, runCorpus, scanBase64, selectCorpusSources, sourceChanged, totalize } from '../scripts/verify-corpus.mjs';

const LOCAL = '11111111-1111-4111-8111-111111111111';
const AGENT = 'cccccccc-1111-4111-8111-111111111111';

test('base64 trigger counts string values at 64 KiB, not keys or shorter runs', () => {
  const value = 'Ab09+/'.repeat(10923);
  assert.equal(countBase64LikeStrings({ a: value, b: `data:image/png;base64,${value}`, c: ['A'.repeat(65535)] }), 2);
  assert.equal(countBase64LikeStrings({ a: 'A'.repeat(65536) }), 1);
  assert.equal(countBase64LikeStrings({ [value]: 'short', a: 'not base64 '.repeat(7000) }), 0);
  assert.equal(countBase64LikeStrings({ a: `${value} ${value}` }), 1, 'count strings, not runs');
});

test('base64 scanning accepts carriage returns inside a JSON record without splitting it', async (context) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-base64-test-'));
  context.after(() => fs.rm(home, { recursive: true, force: true }));
  const file = path.join(home, 'records.jsonl');
  await fs.writeFile(file, `{"value":\r"${'A'.repeat(65536)}"\r}\n`);
  assert.deepEqual(await scanBase64(file), { count: 1, thresholdBytes: 65536, invalidLines: 0 });
});

async function corpusFixture (context: test.TestContext) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-corpus-test-'));
  context.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, 'Code');
  const workspace = path.join(root, 'User', 'workspaceStorage', 'hash');
  const journal = path.join(workspace, 'chatSessions', `${LOCAL}.jsonl`);
  await fs.mkdir(path.dirname(journal), { recursive: true });
  await fs.writeFile(journal, JSON.stringify({ kind: 0, v: {
    version: 3, sessionId: LOCAL, customTitle: 'Synthetic corpus chat', requests: [{
      requestId: 'one', timestamp: 1700000000000, message: { text: 'Question' }, response: [{ value: 'Answer' }],
    }],
  } }));
  const database = new DatabaseSync(path.join(workspace, 'state.vscdb'));
  try {
    database.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)');
    database.prepare('INSERT INTO ItemTable VALUES (?, ?)').run('chat.ChatSessionStore.index', JSON.stringify({
      version: 1, entries: { [LOCAL]: { title: 'Local' }, [`agent-host-copilotcli:/${AGENT}`]: { title: 'Agent' } },
    }));
  } finally {
    database.close();
  }
  const metadataFile = path.join(root, 'agentSessionData', AGENT, 'session.db');
  await fs.mkdir(path.dirname(metadataFile), { recursive: true });
  const metadata = new DatabaseSync(metadataFile);
  try {
    metadata.exec('CREATE TABLE session_metadata (key TEXT PRIMARY KEY, value TEXT)');
  } finally {
    metadata.close();
  }
  const copilotHome = path.join(home, 'copilot');
  const events = path.join(copilotHome, 'session-state', AGENT, 'events.jsonl');
  await fs.mkdir(path.dirname(events), { recursive: true });
  await fs.writeFile(events, [
    { id: 'start', type: 'session.start', data: { sessionId: AGENT, version: 1, producer: 'synthetic-test' } },
    { id: 'u1', type: 'user.message', data: { content: 'Hello', messageId: 'm1' } },
    { id: 'a1', type: 'assistant.message', data: { content: 'Hi there' } },
    { id: 'x1', type: 'synthetic.future_event', data: {} },
  ].map((event) => JSON.stringify(event)).join('\n'));
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: home, XDG_CONFIG_HOME: home, COPILOT_HOME: copilotHome };
  return { home, root, journal, env };
}

test('the corpus runner verifies every Local journal and SDK chat and writes one count-only report', async (context) => {
  const { home, root, journal, env } = await corpusFixture(context);
  const out = path.join(home, 'reports', 'corpus.json');
  const report = await runCorpus({ userDataRoot: root, out, env, concurrency: 2 });
  const written = JSON.parse(await fs.readFile(out, 'utf8'));
  assert.deepEqual(written.totals, report.totals);
  assert.equal(report.totals.sources, 2);
  assert.deepEqual(report.totals.byKind, { local: 1, 'sdk:agent-host': 1 });
  const local = report.sources.find((item: { kind: string }) => item.kind === 'local');
  assert.equal(local.selector, path.resolve(journal), 'Local journals are verified by exact path');
  assert.equal(local.exitCode, 0);
  assert.deepEqual(local.failureReasons, []);
  assert.equal(local.layerCSkipped, null, 'Layer C ran against the exported file');
  assert.ok(local.checked > 0);
  assert.equal(local.parserFailed, false, 'the parser check ran and passed');
  assert.equal(local.parserSkipped, null);
  assert.deepEqual(local.parserFailedChecks, []);
  assert.equal(typeof local.parserMs, 'number');
  const sdk = report.sources.find((item: { kind: string }) => item.kind.startsWith('sdk:'));
  assert.equal(sdk.selector, `agent-host-copilotcli:/${AGENT}`, 'SDK chats are verified by exact chat key');
  assert.equal(sdk.exitCode, 2);
  assert.deepEqual(sdk.failureReasons, ['unhandled-kind']);
  assert.deepEqual(report.totals.failureReasons, { 'unhandled-kind': 1 });
  assert.deepEqual(report.totals.byExitCode, { 0: 1, 2: 1 });
  assert.equal(report.version, 4);
  assert.deepEqual(local.base64Like, { count: 0, thresholdBytes: 65536, invalidLines: 0 });
  assert.deepEqual(report.totals.changedDuringRun, []);
  assert.equal(local.changedDuringRun, false);
  assert.equal(typeof local.source.before.size, 'number');
  assert.equal(typeof sdk.source.after.mtimeMs, 'number', 'SDK sources are stat-ed by events-log path');
  assert.equal(report.totals.parser.failed, 0);
  assert.equal(report.totals.parser.skipped, 0);
  assert.equal(report.totals.checked, local.checked + sdk.checked);
  const categorySum = Object.values(report.totals.categories as Record<string, { present: number; partial: number; absent: number }>)
    .reduce((sum, item) => sum + item.present + item.partial + item.absent, 0);
  assert.equal(categorySum, report.totals.checked, 'category rows add up to the checked total');
  const text = await fs.readFile(out, 'utf8');
  assert.doesNotMatch(text, /Question|Answer|Hello|Hi there/u, 'the report holds no chat content');
});

test('SDK chats sharing one events log become one job selected by an exact chat key', () => {
  const sdk = (sessionId: string, chatIdentity: string) => ({
    sessionId,
    backing: { status: 'verified', source: { kind: 'sdk-events', provider: 'agent-host', sessionId: AGENT, path: path.resolve('/x/events.jsonl'), chatIdentity, scope: { kind: 'main' } } },
  });
  const selected = selectCorpusSources([
    sdk(`agent-host-copilotcli:/${AGENT}#b`, 'chat-b'),
    sdk(`agent-host-copilotcli:/${AGENT}`, 'chat-a'),
    sdk(`agent-host-copilotcli:/${AGENT}#c`, 'chat-c'),
    { sessionId: LOCAL, backing: { status: 'verified', source: { kind: 'local-journal', sessionId: LOCAL, path: path.resolve('/x/a.jsonl') } } },
    { sessionId: LOCAL, backing: { status: 'verified', source: { kind: 'local-journal', sessionId: LOCAL, path: path.resolve('/x/a.jsonl') } } },
  ]);
  assert.deepEqual(selected.local, [path.resolve('/x/a.jsonl')]);
  assert.deepEqual(selected.sdk, [{ selector: `agent-host-copilotcli:/${AGENT}`, provider: 'agent-host', sharedKeys: 3, path: path.resolve('/x/events.jsonl') }]);
});

test('sources whose size or mtime changed during the run are listed and excluded from totals', () => {
  const item = (label: string, changedDuringRun: boolean, exitCode: number) => ({
    label, kind: 'local', exitCode, changedDuringRun, failureReasons: exitCode ? ['layer-a-tool-ids'] : [],
    checked: 10, categories: { assistantText: { present: 10, partial: 0, absent: 0 } }, parserFailed: false, parserSkipped: null, parserMs: 5,
  });
  const totals = totalize([item('L001', false, 0), item('L002', true, 2)]);
  assert.equal(totals.sources, 1);
  assert.deepEqual(totals.changedDuringRun, ['L002']);
  assert.deepEqual(totals.byExitCode, { 0: 1 });
  assert.deepEqual(totals.failureReasons, {});
  assert.equal(totals.checked, 10);
  assert.equal(sourceChanged({ size: 1, mtimeMs: 1 }, { size: 1, mtimeMs: 1 }), false);
  assert.equal(sourceChanged({ size: 1, mtimeMs: 1 }, { size: 2, mtimeMs: 1 }), true);
  assert.equal(sourceChanged({ size: 1, mtimeMs: 1 }, { size: 1, mtimeMs: 2 }), true);
  assert.equal(sourceChanged(null, { size: 1, mtimeMs: 1 }), true, 'a source that could not be read counts as changed');
});
