import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { assertNoCacheWrites, cacheInventory } from '../scripts/test.mjs';
import { snapshotLocalInputs, saveExportCopy } from '../src/session/source-snapshot.ts';
import { defaultSourceCacheRoot } from '../src/session/cache-paths.ts';

test('all implicit captures and receipts use the isolated cache root', async (context) => {
  const root = process.env.CCE_CACHE_DIR!;
  const source = path.join(root, 'fixture', 'chatSessions', '11111111-1111-4111-8111-111111111111.jsonl');
  await fs.mkdir(path.dirname(source), { recursive: true });
  await fs.writeFile(source, '{"kind":0,"v":{"requests":[]}}\n');
  const mkdtemp = fs.mkdtemp;
  context.mock.method(fs, 'mkdtemp', async (prefix: string) => {
    assert.ok(prefix.startsWith(`${root}${path.sep}`), 'capture allocation must stay inside the test cache');
    return mkdtemp(prefix);
  });
  const copy = await snapshotLocalInputs(source);
  assert.ok(copy.destination.startsWith(`${root}${path.sep}`));
  const output = path.join(root, 'export.md');
  await fs.writeFile(output, 'export');
  await saveExportCopy(output, { selector: 'synthetic', copy });
  assert.ok((await fs.readdir(root)).includes('receipts'));
});

test('the full-run guard rejects added files, empty directories and receipt changes', async () => {
  const root = path.join(process.env.CCE_CACHE_DIR!, 'guard');
  const before = await cacheInventory(root);
  await fs.mkdir(root);
  assert.throws(() => assertNoCacheWrites(before, { [root]: 'directory' }), /real exporter cache/u);
  await fs.writeFile(path.join(root, 'receipt.json'), 'first');
  const first = await cacheInventory(root);
  await fs.writeFile(path.join(root, 'receipt.json'), 'changed');
  const changed = await cacheInventory(root);
  assert.throws(() => assertNoCacheWrites(first, changed), /real exporter cache/u);
  assert.doesNotThrow(() => assertNoCacheWrites(changed, changed));
});

for (const legacy of [false, true]) {
  test(`the test runner fails when a child writes to a simulated ${legacy ? 'legacy' : 'persistent'} real cache`, async () => {
    const root = path.join(process.env.CCE_CACHE_DIR!, `runner-guard-${legacy}`);
    await fs.mkdir(root);
    const preload = path.join(root, 'fake-home.mjs');
    await fs.writeFile(preload, `import os from 'node:os'; os.tmpdir = () => ${JSON.stringify(root)}; os.homedir = () => ${JSON.stringify(root)};\n`);
    const env = { ...process.env, LOCALAPPDATA: root, XDG_CACHE_HOME: root };
    const simulatedCache = legacy ? path.join(root, 'copilot-chat-exporter-cache')
      : defaultSourceCacheRoot(process.platform, env, root);
    const offender = path.join(root, 'offender.mjs');
    await fs.writeFile(offender, `
import fs from 'node:fs/promises';
await fs.mkdir(${JSON.stringify(simulatedCache)}, { recursive: true });
await fs.writeFile(${JSON.stringify(path.join(simulatedCache, 'unexpected-receipt.json'))}, 'synthetic');
`);
    const result = spawnSync(process.execPath, [
      '--import', pathToFileURL(preload).href, fileURLToPath(new URL('../scripts/test.mjs', import.meta.url)),
      '--command', offender,
    ], { encoding: 'utf8', env, timeout: 30_000 });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /Test run changed the real exporter cache or receipt store/u);
  });
}

test('platform cache paths are persistent and follow the platform environment', () => {
  assert.equal(defaultSourceCacheRoot('win32', { LOCALAPPDATA: 'C:\\Private' }, 'C:\\Home'), 'C:\\Private\\copilot-chat-exporter\\cache');
  assert.equal(defaultSourceCacheRoot('darwin', {}, '/home/test'), '/home/test/Library/Caches/copilot-chat-exporter/cache');
  assert.equal(defaultSourceCacheRoot('linux', { XDG_CACHE_HOME: '/private-cache' }, '/home/test'), '/private-cache/copilot-chat-exporter/cache');
  assert.equal(defaultSourceCacheRoot('linux', {}, '/home/test'), '/home/test/.cache/copilot-chat-exporter/cache');
});
