import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('generated verification detects stale script assets and altered embedded WASM without rewriting them', { timeout: 30_000 }, async context => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const temporaryRoot = path.join(root, 'temp-tool-output');
  await mkdir(temporaryRoot, { recursive: true });
  const sandbox = await mkdtemp(path.join(temporaryRoot, 'generated-check-test-'));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  for (const folder of ['scripts', 'src/session', 'src/generated', 'docs'])
    await mkdir(path.join(sandbox, folder), { recursive: true });
  await writeFile(path.join(sandbox, 'package.json'), '{"type":"module"}');
  await symlink(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const file of ['scripts/generate-brotli.mjs', 'src/session/compressed-listing-loader.ts', 'src/session/detailed-listing-controller.ts', 'src/generated/brotli-decoder.ts', 'docs/BROTLI-NOTICES.txt'])
    await copyFile(path.join(root, file), path.join(sandbox, file));
  const script = path.join(sandbox, 'scripts', 'generate-brotli.mjs');
  execFileSync(process.execPath, [script, '--check'], { cwd: sandbox });
  const target = path.join(sandbox, 'src', 'generated', 'brotli-decoder.ts');
  const original = await readFile(target, 'utf8');
  for (const changed of [
    original.replace('export const gzipListingLoader = "', 'export const gzipListingLoader = " '),
    original.replace(/(export const brotliWasmBase64 = ")[A-Za-z0-9+/]/u, '$1!'),
  ]) {
    assert.notEqual(changed, original);
    await writeFile(target, changed);
    const result = spawnSync(process.execPath, [script, '--check'], { cwd: sandbox, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /stale or modified/u);
    assert.equal(await readFile(target, 'utf8'), changed, 'verification must not regenerate away a tampered asset');
  }
  const mutatedGenerator = (await readFile(script, 'utf8')).replace('79b29cb1790560f0a0f32b4a31d935e2782875e4a367fde23c81d986b327ec3f', '0'.repeat(64));
  await writeFile(script, mutatedGenerator);
  const mismatch = spawnSync(process.execPath, [script, '--check'], { cwd: sandbox, encoding: 'utf8' });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /pinned Brotli WASM asset changed/u);
});
