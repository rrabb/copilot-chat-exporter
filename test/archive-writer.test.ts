import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeArchive } from '../src/archive-writer.ts';
import type { PlannedArchive } from '../src/export-policy.ts';

const generatedAt = '2026-10-08T20:00:01Z';

async function fixture (context: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-writer-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, outputPath: path.join(root, 'archive.md') };
}

function plan (folder: string, withCompanions = true): PlannedArchive {
  return {
    markdown: withCompanions ? `[Full output](./${folder}/output.txt)\n` : 'Complete inline text\n',
    companions: withCompanions ? [{
      id: 'one', kind: 'tool-result', mediaType: 'text/plain',
      relativePath: `${folder}/output.txt`, bytes: Buffer.from('Original\r\nUnicode: \u{1f600}\r\n'),
      location: { sourceId: 'synthetic', field: 'tool.result' },
    }] : [],
    diagnostics: [], policy: { highFidelity: false, redact: true },
  };
}

test('writer saves exact companion bytes and relative links before reporting success', async (context) => {
  const { root, outputPath } = await fixture(context);
  const result = await writeArchive({ outputPath, generatedAt, plan });
  assert.equal(path.basename(result.assetsPath!), 'archive_assets_261008_200001');
  assert.equal(await fs.readFile(outputPath, 'utf8'), result.archive.markdown);
  assert.deepEqual(await fs.readFile(result.companionPaths[0]), result.archive.companions[0].bytes);
  assert.equal(result.markdownBytes, Buffer.byteLength(result.archive.markdown));
  assert.equal((await fs.readdir(root)).length, 2);
});

test('inline-only archive creates no assets or staging residue', async (context) => {
  const { root, outputPath } = await fixture(context);
  const result = await writeArchive({ outputPath, generatedAt, plan: (folder) => plan(folder, false) });
  assert.equal(result.assetsPath, null);
  assert.deepEqual(await fs.readdir(root), ['archive.md']);
});

test('verification failure publishes warning and companions without replacing earlier success or failure files', async (context) => {
  const { root, outputPath } = await fixture(context);
  await fs.writeFile(outputPath, 'Earlier success');
  const oldFailed = path.join(root, 'archive.verify-failed.md');
  await fs.writeFile(oldFailed, 'Earlier failure');
  let kept = false;
  const result = await writeArchive({
    outputPath, generatedAt, overwrite: true, plan,
    verification: {
      capture: path.join(root, 'private-copy'), sessionId: 'synthetic', sourceHash: 'a'.repeat(64),
      keep: async () => { kept = true; },
      check: async () => ({
        failureReasons: ['layer-d'], categories: { prompt: { present: 0, partial: 1, absent: 2 } },
        details: { failureReasons: ['layer-d'] },
      }),
    },
  });
  assert.equal(kept, true);
  assert.equal(await fs.readFile(outputPath, 'utf8'), 'Earlier success');
  assert.equal(await fs.readFile(oldFailed, 'utf8'), 'Earlier failure');
  assert.equal(path.basename(result.outputPath), 'archive.verify-failed-1.md');
  const markdown = await fs.readFile(result.outputPath, 'utf8');
  assert.match(markdown, /^>.*Verification failed/u);
  assert.match(markdown, /prompt: 1 partial, 2 absent/u);
  assert.match(markdown, new RegExp(path.basename(result.assetsPath!)));
  assert.deepEqual(await fs.readFile(result.companionPaths[0]!), result.archive.companions[0]!.bytes);
  assert.equal(result.markdownBytes, Buffer.byteLength(markdown));
  assert.match(await fs.readFile(result.failureLog!, 'utf8'), /"sourceHash"/u);
});

test('existing destinations refuse by default; overwrite keeps prior companion folder', async (context) => {
  const { outputPath } = await fixture(context);
  const first = await writeArchive({ outputPath, generatedAt, plan });
  await assert.rejects(writeArchive({ outputPath, generatedAt, plan }), /already exists/);
  const second = await writeArchive({ outputPath, generatedAt, plan, overwrite: true });
  assert.notEqual(second.assetsPath, first.assetsPath);
  assert.equal(path.basename(second.assetsPath!), 'archive_assets_261008_200001_1');
  assert.match(await fs.readFile(outputPath, 'utf8'), /200001_1/);
  assert.deepEqual(await fs.readFile(first.companionPaths[0]), first.archive.companions[0].bytes);
});

test('failed overwrite preserves old Markdown and cleans only attempt-owned artifacts', async (context) => {
  const { root, outputPath } = await fixture(context);
  await fs.mkdir(outputPath);
  await fs.writeFile(path.join(outputPath, 'previous.txt'), 'Keep this');
  await assert.rejects(writeArchive({ outputPath, generatedAt, plan, overwrite: true }));
  assert.equal(await fs.readFile(path.join(outputPath, 'previous.txt'), 'utf8'), 'Keep this');
  assert.deepEqual(await fs.readdir(root), ['archive.md']);
});

test('concurrent publication refuses rather than replacing a destination created after preflight', async (context) => {
  const { outputPath, root } = await fixture(context);
  const attempts = await Promise.allSettled([
    writeArchive({ outputPath, generatedAt, plan }),
    writeArchive({ outputPath, generatedAt, plan }),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  const winner = attempts.find((attempt) => attempt.status === 'fulfilled');
  assert.ok(winner?.status === 'fulfilled');
  assert.equal(await fs.readFile(outputPath, 'utf8'), winner.value.archive.markdown);
  assert.equal((await fs.readdir(root)).length, 2, 'losing attempt cleans its own companion directory');
});

test('unsafe, reserved and duplicate companion paths fail without writing outside assets', async (context) => {
  const { root, outputPath } = await fixture(context);
  for (const invalid of ['../escape.txt', 'folder/../escape', 'C:/escape', 'folder\\escape', 'folder/NUL.txt']) {
    await assert.rejects(writeArchive({
      outputPath, generatedAt, plan: (folder) => {
        const archive = plan(folder);
        archive.companions[0].relativePath = invalid.replace('folder', folder);
        return archive;
      },
    }), /portable file/);
  }
  await assert.rejects(writeArchive({
    outputPath, generatedAt, plan: (folder) => {
      const archive = plan(folder);
      archive.companions.push({ ...archive.companions[0], id: 'two', relativePath: `${folder}/OUTPUT.txt` });
      return archive;
    },
  }), /Duplicate/);
  assert.deepEqual(await fs.readdir(root), []);
});

test('invalid timestamps and planner errors do not publish output', async (context) => {
  const { root, outputPath } = await fixture(context);
  await assert.rejects(writeArchive({ outputPath, generatedAt: 'invalid', plan }), /valid timestamp/);
  await assert.rejects(writeArchive({ outputPath, generatedAt, plan: () => { throw new Error('Planning failed'); } }), /Planning failed/);
  assert.deepEqual(await fs.readdir(root), []);
});

test('replacement failure leaves actual previous Markdown bytes unchanged', async (context) => {
  const { root, outputPath } = await fixture(context);
  const previous = Buffer.from('Previous archive\r\nKeep exact bytes \u{1f600}\r\n');
  await fs.writeFile(outputPath, previous);
  context.mock.method(fs, 'rename', async () => { throw new Error('Injected replacement failure'); });
  await assert.rejects(writeArchive({ outputPath, generatedAt, plan, overwrite: true }), /Injected replacement failure/);
  assert.deepEqual(await fs.readFile(outputPath), previous);
  assert.deepEqual(await fs.readdir(root), ['archive.md']);
});

test('image companion bytes pass through unchanged without resizing or text redaction', async (context) => {
  const { outputPath } = await fixture(context);
  const image = Buffer.alloc(2_000_000, 0xff);
  Buffer.from('password=synthetic-image-content').copy(image);
  const result = await writeArchive({
    outputPath, generatedAt, plan: (folder) => {
      const archive = plan(folder);
      archive.companions[0] = {
        ...archive.companions[0], kind: 'image', mediaType: 'image/png', bytes: image,
        relativePath: `${folder}/original.png`,
      };
      archive.markdown = `![Recorded original](./${folder}/original.png)`;
      return archive;
    },
  });
  assert.deepEqual(await fs.readFile(result.companionPaths[0]), image);
});
