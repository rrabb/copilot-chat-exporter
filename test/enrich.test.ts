import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  loadMemoryFiles, loadModelNames, loadResources, modelName, readVersions,
} from '../src/session/enrich.ts';

const SESSION = '1e6f4d3f-34bd-4f42-a5bd-d6a48ed6447d';

async function tempDir () {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'cce-enrich-'));
}

// The stores all hang off a workspace-storage hash folder in a fixed layout.
async function copilotDir (hashRoot: string, ...parts: string[]) {
  const dir = path.join(hashRoot, 'GitHub.copilot-chat', ...parts);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

test('every store is optional and yields empty rather than throwing', async () => {
  const missing = path.join(await tempDir(), 'nothing-here');
  assert.deepEqual(await readVersions(missing, SESSION), { copilotVersion: 'unknown', vscodeVersion: 'unknown' });
  assert.deepEqual((await loadResources(missing, SESSION)).resources, []);
  assert.deepEqual(await loadMemoryFiles(missing, SESSION), { session: [], repo: [], user: [] });
  assert.equal((await loadModelNames(missing, SESSION)).size, 0);
});

test('readVersions reads the header VS Code wrote into the transcript', async () => {
  const hashRoot = await tempDir();
  const dir = await copilotDir(hashRoot, 'transcripts');
  const header = { type: 'session.start', data: { copilotVersion: '0.62.0', vscodeVersion: '1.134.0' } };
  await fs.writeFile(path.join(dir, `${SESSION}.jsonl`), `${JSON.stringify(header)}\n{"type":"user.message"}\n`);

  assert.deepEqual(await readVersions(hashRoot, SESSION), {
    copilotVersion: '0.62.0',
    vscodeVersion: '1.134.0',
  });
});

test('readVersions ignores a transcript that does not start with a header', async () => {
  const hashRoot = await tempDir();
  const dir = await copilotDir(hashRoot, 'transcripts');
  await fs.writeFile(path.join(dir, `${SESSION}.jsonl`), '{"type":"user.message"}\n');
  assert.deepEqual(await readVersions(hashRoot, SESSION), { copilotVersion: 'unknown', vscodeVersion: 'unknown' });
});

test('loadResources groups output files by the tool call that produced them', async () => {
  const hashRoot = await tempDir();
  const root = await copilotDir(hashRoot, 'chat-session-resources', SESSION);
  await fs.mkdir(path.join(root, 'call_abc__vscode-1'), { recursive: true });
  await fs.mkdir(path.join(root, 'toolu_xyz__vscode-2'), { recursive: true });
  await fs.writeFile(path.join(root, 'call_abc__vscode-1', 'body'), 'first');
  await fs.writeFile(path.join(root, 'toolu_xyz__vscode-2', 'body'), 'second');

  const loaded = await loadResources(hashRoot, SESSION);
  assert.equal(loaded.resources.length, 2);
  // Both id styles appear in real sessions.
  assert.equal(loaded.byCall.get('call_abc')?.length, 1);
  assert.equal(loaded.byCall.get('toolu_xyz')?.length, 1);
  assert.equal(loaded.byCall.get('call_abc')?.[0]?.content, 'first');
  assert.equal(loaded.byCall.get('call_abc')?.[0]?.bytes, 5);
  assert.equal(loaded.byCall.get('call_abc')?.[0]?.relative, 'call_abc__vscode-1/body');
});

test('loadMemoryFiles separates the three scopes and sorts within each', async () => {
  const hashRoot = await tempDir();
  const base = await copilotDir(hashRoot, 'memory-tool', 'memories');
  await fs.mkdir(path.join(base, 'repo'), { recursive: true });
  // Session memory is filed under the base64 of the session id.
  const sessionDir = path.join(base, Buffer.from(SESSION).toString('base64'));
  await fs.mkdir(sessionDir, { recursive: true });

  await fs.writeFile(path.join(base, 'preferences.md'), 'user scope');
  await fs.writeFile(path.join(base, 'ignored.txt'), 'not markdown');
  await fs.writeFile(path.join(base, 'repo', 'conventions.md'), 'repo scope');
  await fs.writeFile(path.join(sessionDir, 'b.md'), 'second');
  await fs.writeFile(path.join(sessionDir, 'a.md'), 'first');

  const memory = await loadMemoryFiles(hashRoot, SESSION);
  assert.deepEqual(memory.session.map((file) => file.name), ['a.md', 'b.md']);
  assert.deepEqual(memory.repo.map((file) => file.name), ['conventions.md']);
  assert.deepEqual(memory.user.map((file) => file.name), ['preferences.md'], 'only .md files');
  assert.equal(memory.session[0].content, 'first');
});

test('modelName prefers the catalog and degrades to a readable guess', async () => {
  const hashRoot = await tempDir();
  const dir = await copilotDir(hashRoot, 'debug-logs', SESSION);
  await fs.writeFile(
    path.join(dir, 'models.json'),
    JSON.stringify([{ id: 'claude-x', name: 'Claude X' }, { id: 'no-name' }]),
  );
  await loadModelNames(hashRoot, SESSION);

  assert.equal(modelName('claude-x'), 'Claude X');
  assert.equal(modelName('copilot/claude-x'), 'Claude X', 'the copilot/ prefix is stripped');
  assert.equal(modelName('auto'), 'Auto');
  // Not in the catalog: turn the id into something a reader can recognise.
  assert.equal(modelName('gpt-5-mini'), 'Gpt 5 Mini');
  assert.equal(modelName(''), 'unknown');
});
