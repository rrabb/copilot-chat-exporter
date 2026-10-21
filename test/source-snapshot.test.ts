import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { snapshotFile, snapshotUserData, sourceCopyNotice } from '../src/session/source-snapshot.ts';
import { loadSession } from '../src/index.ts';
import { runSdkCommand } from '../src/sdk-cli.ts';

test('SDK dispatch removes its temporary snapshot when the selector is not an SDK chat', async (context) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-sdk-dispatch-'));
  const previousHome = process.env.COPILOT_HOME;
  process.env.COPILOT_HOME = path.join(folder, 'copilot');
  context.after(async () => {
    if (previousHome === undefined)
      delete process.env.COPILOT_HOME;
    else
      process.env.COPILOT_HOME = previousHome;
    await fs.rm(folder, { recursive: true, force: true });
  });
  const created: string[] = [];
  const mkdtemp = fs.mkdtemp;
  context.mock.method(fs, 'mkdtemp', async (prefix: string) => {
    const result = await mkdtemp(prefix);
    String(prefix).includes('cce-sources-') && created.push(result);
    return result;
  });
  const result = await runSdkCommand({ root: path.join(folder, 'Code'), selector: 'synthetic-missing-chat',
    outputArgument: undefined, outDir: null, overwrite: false, verify: true, strict: true });
  assert.equal(result, null);
  assert.equal(created.length, 1);
  for (const directory of created) {
    context.after(() => fs.rm(directory, { recursive: true, force: true }));
    await assert.rejects(fs.stat(directory), { code: 'ENOENT' });
  }
});

test('Local snapshot replay keeps supplementary memory from the original export', async (context) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-local-context-'));
  context.after(() => fs.rm(folder, { recursive: true, force: true }));
  const source = path.join(folder, 'workspace', 'chatSessions', 'aaaaaaaa-1111-4111-8111-111111111111.jsonl');
  const memory = path.join(folder, 'workspace', 'GitHub.copilot-chat', 'memory-tool', 'memories', 'repo', 'note.md');
  await fs.mkdir(path.dirname(source), { recursive: true });
  await fs.mkdir(path.dirname(memory), { recursive: true });
  await fs.writeFile(source, JSON.stringify({ kind: 0, v: { version: 3, requests: [] } }));
  await fs.writeFile(memory, 'Memory recorded before the export.');
  const database = new DatabaseSync(path.join(folder, 'workspace', 'state.vscdb'));
  try {
    database.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)');
    database.prepare('INSERT INTO ItemTable VALUES (?, ?)').run('chat.ChatSessionStore.index',
      JSON.stringify({ entries: { 'aaaaaaaa-1111-4111-8111-111111111111': { title: 'Frozen indexed title' } } }));
  } finally {
    database.close();
  }
  const original = await loadSession({ source });
  assert.equal(original.session.title, 'Frozen indexed title');
  await fs.writeFile(memory, 'Different live memory after the export.');
  const replay = await loadSession({ source, snapshotCopy: original.copiedSource });
  assert.equal(replay.memory.repo[0]?.content, 'Memory recorded before the export.');
  assert.equal(replay.memory.repo[0]?.path, memory);
  assert.equal(replay.session.title, 'Frozen indexed title');
});

test('source copies keep fixed bytes and hashes after the original grows', async (context) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-snapshot-'));
  context.after(() => fs.rm(folder, { recursive: true, force: true }));
  const source = path.join(folder, 'live.jsonl');
  const copy = path.join(folder, 'copy.jsonl');
  await fs.writeFile(source, '{"first":1}\n');
  const snapshot = await snapshotFile(source, copy);
  await fs.appendFile(source, '{"second":2}\n');
  assert.equal(await fs.readFile(copy, 'utf8'), '{"first":1}\n');
  assert.equal(snapshot.size, 12);
  assert.match(snapshot.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(snapshot.changedDuringCopy, false);
  const notice = sourceCopyNotice({ ...snapshot, changedDuringCopy: true });
  assert.match(notice.join('\n'), /Source changed during copy at \d{4}-\d{2}-\d{2}T.*[+-]\d{2}:\d{2}/u);
});

test('only an incomplete final JSONL record is omitted from a source snapshot', async (context) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-snapshot-tail-'));
  context.after(() => fs.rm(folder, { recursive: true, force: true }));
  const source = path.join(folder, 'events.jsonl');
  const copy = path.join(folder, 'copy.jsonl');
  await fs.writeFile(source, '{"complete":true}\n{"incomplete":');
  const frozen = await snapshotFile(source, copy);
  assert.equal(frozen.skippedTrailingRecord, true);
  assert.equal(await fs.readFile(copy, 'utf8'), '{"complete":true}\n');
  assert.equal(await fs.readFile(`${copy}.recorded`, 'utf8'), '{"complete":true}\n{"incomplete":');
  const prefixes = ['{"value":"\\u0', '{"value":1.', '{"value":1e+', '{"value":-',
    Buffer.concat([Buffer.from('{"value":"'), Buffer.from([0xf0, 0x9f])])];
  for (const [index, tail] of prefixes.entries()) {
    await fs.writeFile(source, Buffer.concat([Buffer.from('{"complete":true}\n'), Buffer.from(tail)]));
    const destination = path.join(folder, `prefix-${index}.jsonl`);
    assert.equal((await snapshotFile(source, destination)).skippedTrailingRecord, true);
    assert.equal(await fs.readFile(destination, 'utf8'), '{"complete":true}\n');
  }
  await fs.writeFile(source, '{"incomplete":\n{"complete":true}\n');
  await assert.rejects(snapshotFile(source, path.join(folder, 'bad.jsonl')), /not valid JSON/u);
  await fs.writeFile(source, '{"invalid":?');
  await assert.rejects(snapshotFile(source, path.join(folder, 'invalid.jsonl')), /not valid JSON/u);
  for (const [index, tail] of ['{"value":1e?', '{"value":1.x', '{"value":"\\uG', '{"value":-x'].entries()) {
    await fs.writeFile(source, tail);
    await assert.rejects(snapshotFile(source, path.join(folder, `invalid-${index}.jsonl`)), /not valid JSON/u);
  }
});

test('a source that shrinks during capture is reported rather than rejected for changing', async (context) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-snapshot-shrink-'));
  context.after(() => fs.rm(folder, { recursive: true, force: true }));
  const source = path.join(folder, 'source.bin');
  const destination = path.join(folder, 'copy.bin');
  await fs.writeFile(source, Buffer.alloc(64));
  const open = fs.open;
  context.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args);
    if (args[0] === destination)
      await fs.truncate(source, 0);
    return handle;
  });
  const copied = await snapshotFile(source, destination);
  assert.equal(copied.before.size, 64);
  assert.equal(copied.size, 0);
  assert.equal(copied.changedDuringCopy, true);
  assert.match(sourceCopyNotice(copied).join('\n'), /Source changed during copy/u);
});

test('inventory snapshots back up SQLite WAL content without copying database files', async (context) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-snapshot-db-'));
  context.after(() => fs.rm(folder, { recursive: true, force: true }));
  const root = path.join(folder, 'Code');
  const workspace = path.join(root, 'User', 'workspaceStorage', 'hash');
  await fs.mkdir(workspace, { recursive: true });
  const database = new DatabaseSync(path.join(workspace, 'state.vscdb'));
  try {
    database.exec("PRAGMA journal_mode=WAL; CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT); INSERT INTO ItemTable VALUES ('test', 'recorded')");
    const frozen = await snapshotUserData(root, path.join(folder, 'copilot'), path.join(folder, 'frozen'));
    const copy = new DatabaseSync(path.join(frozen.userDataRoot, 'User', 'workspaceStorage', 'hash', 'state.vscdb'), { readOnly: true });
    try {
      assert.equal(copy.prepare('SELECT value FROM ItemTable').get()?.value, 'recorded');
    } finally {
      copy.close();
    }
    assert.equal(frozen.files.find((file) => file.source.endsWith('state.vscdb'))?.method, 'sqlite-backup');
    assert.equal(frozen.files.some((file) => /-(?:wal|shm)$/u.test(file.destination)), false);
    await assert.rejects(snapshotUserData(root, path.join(folder, 'copilot'), path.join(folder, 'frozen')), /EEXIST/u);
    await assert.rejects(snapshotFile(path.join(workspace, 'state.vscdb'),
      path.join(frozen.userDataRoot, 'User', 'workspaceStorage', 'hash', 'state.vscdb')), /will not be overwritten/u);
  } finally {
    database.close();
  }
});
