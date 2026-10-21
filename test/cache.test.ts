import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readExportCopy, saveExportCopy } from '../src/session/source-snapshot.ts';
import { cleanSourceCache, createSourceCacheDirectory, finishCapture, leaseCapture, listSourceCache, registerCapture } from '../src/session/source-cache.ts';

test('re-export replaces its capture; cleanup removes kept captures and receipts together', async () => {
  const root = process.env.CCE_CACHE_DIR!;
  const output = path.join(root, 'lifecycle.md');
  await fs.writeFile(output, 'saved archive');
  const first = await createSourceCacheDirectory('cce-local-source-');
  await saveExportCopy(output, { selector: 'lifecycle', status: 'kept', captureDirectory: first });
  const second = await createSourceCacheDirectory('cce-local-source-');
  await saveExportCopy(output, { selector: 'lifecycle', status: 'kept', captureDirectory: second });
  await assert.rejects(fs.stat(first), { code: 'ENOENT' });
  const before = await listSourceCache();
  const selected = before.find((entry) => entry.directory === second)!;
  assert.equal(selected.receipts.length, 1);
  assert.equal(selected.active, false);
  const preview = await cleanSourceCache({ dryRun: true, includeCorpus: true });
  assert.ok(preview.selected.some((entry) => entry.directory === second));
  assert.equal(preview.freedBytes, 0);
  assert.ok(await fs.stat(second));
  assert.equal((await cleanSourceCache({ olderThanDays: 1 })).selected.length, 0);
  assert.equal((await cleanSourceCache()).freedBytes, 0, 'cleanup lists unless approved');
  const cleaned = await cleanSourceCache({ yes: true });
  assert.ok(cleaned.freedBytes > 0);
  await assert.rejects(fs.stat(second), { code: 'ENOENT' });
  await assert.rejects(fs.stat(selected.receipts[0]!), { code: 'ENOENT' });
  assert.equal(await fs.readFile(output, 'utf8'), 'saved archive');
  const third = await createSourceCacheDirectory('cce-local-source-');
  await saveExportCopy(output, { selector: 'lifecycle', status: 'kept', captureDirectory: third });
  await saveExportCopy(output, { selector: 'lifecycle', status: 'not-kept' });
  await assert.rejects(fs.stat(third), { code: 'ENOENT' });
  await assert.rejects(readExportCopy(output, 'lifecycle'), /source copy was not kept/u);
});

test('cleanup covers registered corpus snapshots, skips active captures and ignores arbitrary directories', async () => {
  const root = process.env.CCE_CACHE_DIR!;
  const corpus = path.join(root, 'retained-corpus');
  const native = path.join(root, 'native-store');
  await fs.mkdir(corpus);
  await fs.mkdir(native);
  await fs.writeFile(path.join(native, 'events.jsonl'), 'untouched');
  await registerCapture(corpus, 'corpus');
  await finishCapture(corpus, true);
  const active = await createSourceCacheDirectory('cce-sources-');
  const preview = await cleanSourceCache({ dryRun: true, includeCorpus: true });
  assert.ok(preview.selected.some((entry) => entry.directory === corpus));
  assert.ok(!preview.selected.some((entry) => entry.directory === active));
  assert.ok(!(await cleanSourceCache({ yes: true })).selected.some((entry) => entry.directory === corpus));
  assert.ok(await fs.stat(corpus));
  await cleanSourceCache({ yes: true, includeCorpus: true });
  await assert.rejects(fs.stat(corpus), { code: 'ENOENT' });
  assert.ok(await fs.stat(active));
  assert.equal(await fs.readFile(path.join(native, 'events.jsonl'), 'utf8'), 'untouched');
});

test('cleanup refuses linked content rather than following or deleting it', async () => {
  const root = process.env.CCE_CACHE_DIR!;
  const target = path.join(root, 'link-target');
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'private.txt'), 'never delete');
  const capture = await createSourceCacheDirectory('cce-sources-');
  await finishCapture(capture, true);
  const link = path.join(capture, 'junction');
  await fs.symlink(target, link, 'junction');
  await assert.rejects(cleanSourceCache({ yes: true }), /link/u);
  assert.equal(await fs.readFile(path.join(target, 'private.txt'), 'utf8'), 'never delete');
  await fs.unlink(link);
  await cleanSourceCache({ yes: true });
});

test('multiple saved-file readers each protect their kept capture from cleanup', async () => {
  const capture = await createSourceCacheDirectory('cce-sources-');
  await finishCapture(capture, true);
  const first = await leaseCapture(capture);
  const second = await leaseCapture(capture);
  assert.equal((await listSourceCache()).find((entry) => entry.directory === capture)?.active, true);
  assert.ok(!(await cleanSourceCache()).selected.some((entry) => entry.directory === capture));
  await first();
  assert.equal((await listSourceCache()).find((entry) => entry.directory === capture)?.active, true);
  await second();
  assert.ok((await cleanSourceCache({ yes: true })).selected.some((entry) => entry.directory === capture));
});

test('cleanup rechecks readers acquired after its preview', async () => {
  const capture = await createSourceCacheDirectory('cce-sources-');
  await finishCapture(capture, true);
  const preview = await cleanSourceCache();
  const release = await leaseCapture(capture);
  const attempt = await cleanSourceCache({ yes: true, targets: preview.selected });
  assert.ok(!attempt.selected.some((entry) => entry.directory === capture));
  assert.ok(await fs.stat(capture));
  await release();
  await cleanSourceCache({ yes: true, targets: preview.selected });
  await assert.rejects(fs.stat(capture), { code: 'ENOENT' });
});

test('capture allocation rejects native store destinations even when configured', async () => {
  const root = process.env.CCE_CACHE_DIR!;
  process.env.CCE_CACHE_DIR = path.join(root, 'User', 'workspaceStorage', 'native');
  try {
    await assert.rejects(createSourceCacheDirectory('cce-sources-'), /outside native session stores/u);
  } finally {
    process.env.CCE_CACHE_DIR = root;
  }
  await assert.rejects(fs.stat(path.join(root, 'User')), { code: 'ENOENT' });
});
