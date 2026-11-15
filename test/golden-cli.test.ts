import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { readLinkedArchiveCompanions } from '../src/verify/images.ts';
import { createGoldenScratchRun } from '../src/verify/golden.ts';

const PKG = fileURLToPath(new URL('..', import.meta.url));

async function fixture (context: TestContext) {
  const root = path.join(PKG, 'temp-tool-output');
  await fs.mkdir(root, { recursive: true });
  const home = await fs.mkdtemp(path.join(root, 'golden-cli-test-'));
  context.after(() => fs.rm(home, { recursive: true, force: true }));
  await fs.cp(path.join(PKG, 'src'), path.join(home, 'src'), { recursive: true });
  await fs.copyFile(path.join(PKG, 'package.json'), path.join(home, 'package.json'));
  const golden = path.join(home, 'test', 'fixtures', 'golden');
  await fs.cp(path.join(PKG, 'test', 'fixtures', 'golden'), golden, { recursive: true });
  // The copied package is deeper than the original. Move its absolute fixture-file links, not its content expectations.
  const expectedFile = path.join(golden, 'golden-session.expected.md');
  const expected = await fs.readFile(expectedFile, 'utf8');
  await fs.writeFile(expectedFile, expected.replace(/(\[`c:\/fixture\/[^`]+`\]\()([^)]+)(\))/gu, (_match, before: string, href: string, after: string) =>
    `${before}${path.relative(path.join(home, 'test', 'baseline'), path.resolve(PKG, 'test', 'baseline', href)).replaceAll('\\', '/')}${after}`));
  const baseline = path.join(home, 'test', 'baseline');
  await fs.mkdir(path.join(baseline, 'golden.render_assets_old'), { recursive: true });
  await fs.writeFile(path.join(baseline, 'golden.render_assets_old', 'keep.txt'), 'old companion');
  await fs.writeFile(path.join(baseline, 'live-session.render.md'), 'live baseline');
  const scratch = path.join(home, 'temp-tool-output');
  await fs.mkdir(path.join(scratch, 'old-report'), { recursive: true });
  await fs.writeFile(path.join(scratch, 'old-report', 'keep.txt'), 'old report');
  const cache = path.join(home, 'cache');
  await fs.mkdir(cache);
  async function invoke (...args: string[]) {
    return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [...args], {
        cwd: home, env: { ...process.env, CCE_CACHE_DIR: cache },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
      child.once('error', reject);
      child.once('exit', (code) => resolve({ code, stdout, stderr }));
    });
  }
  async function checkOlderFiles () {
    assert.deepEqual((await fs.readdir(baseline)).sort(), ['golden.render_assets_old', 'live-session.render.md']);
    assert.equal(await fs.readFile(path.join(baseline, 'golden.render_assets_old', 'keep.txt'), 'utf8'), 'old companion');
    assert.equal(await fs.readFile(path.join(baseline, 'live-session.render.md'), 'utf8'), 'live baseline');
    assert.equal(await fs.readFile(path.join(scratch, 'old-report', 'keep.txt'), 'utf8'), 'old report');
  }
  return { home, golden, scratch, invoke, checkOlderFiles };
}

function keptRun (stdout: string, stderr: string) {
  const match = `${stdout}\n${stderr}`.match(/Golden scratch run kept at: (.+)/u);
  assert.ok(match, stdout + stderr);
  assert.ok(path.isAbsolute(match[1]!));
  return match[1]!.trim();
}

test('successful Local golden checks and updates remove their own scratch runs without baseline drift', async (context) => {
  const { home, golden, scratch, invoke, checkOlderFiles } = await fixture(context);
  const expected = await fs.readFile(path.join(golden, 'golden-session.expected.md'));
  const digest = await fs.readFile(path.join(golden, 'golden-session.digest.json'));
  for (const action of ['check', 'check', 'update', 'check']) {
    const result = await invoke(path.join(home, 'src', 'cli.ts'), '--golden', action);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /Golden scratch run kept/u);
    assert.deepEqual(await fs.readdir(scratch), ['old-report']);
    await checkOlderFiles();
  }
  assert.deepEqual(await fs.readFile(path.join(golden, 'golden-session.expected.md')), expected);
  assert.deepEqual(await fs.readFile(path.join(golden, 'golden-session.digest.json')), digest);
});

test('concurrent failed Local golden checks keep separate readable archives and companions', async (context) => {
  const { home, golden, scratch, invoke, checkOlderFiles } = await fixture(context);
  await fs.appendFile(path.join(golden, 'golden-session.expected.md'), '\nintentional test mismatch\n');
  const results = await Promise.all([1, 2].map(() => invoke(path.join(home, 'src', 'cli.ts'), '--golden', 'check')));
  const runs = results.map((result) => {
    assert.equal(result.code, 2, result.stdout + result.stderr);
    return keptRun(result.stdout, result.stderr);
  });
  assert.notEqual(runs[0], runs[1]);
  for (const run of runs) {
    assert.equal(path.dirname(run), scratch);
    assert.match(path.basename(run), /^\d{6}-\d{6}-local-golden-.+/u);
    const output = path.join(run, 'golden.render.md');
    const markdown = await fs.readFile(output, 'utf8');
    const companions = await readLinkedArchiveCompanions(markdown, output);
    assert.ok(companions.length > 0);
    for (const companion of companions)
      assert.ok(companion.relativePath.includes(createHash('sha256').update(companion.bytes).digest('hex')));
  }
  const success = await invoke(path.join(home, 'src', 'cli.ts'), '--golden', 'update');
  assert.equal(success.code, 0, success.stdout + success.stderr);
  assert.deepEqual((await fs.readdir(scratch)).sort(), ['old-report', ...runs.map((run) => path.basename(run))].sort());
  await checkOlderFiles();
});

test('Local golden update errors and earlier verification failures keep their scratch runs', async (context) => {
  const { home, golden, invoke, checkOlderFiles } = await fixture(context);
  const preload = path.join(home, 'fail-golden.mjs');
  await fs.writeFile(preload, `
import { promises as fs } from 'node:fs';
const write = fs.writeFile.bind(fs);
fs.writeFile = async (file, ...args) => {
  if (String(file).endsWith('golden-session.digest.json'))
    throw new Error('synthetic golden update failure');
  return write(file, ...args);
};
`);
  const failed = await invoke('--import', pathToFileURL(preload).href, path.join(home, 'src', 'cli.ts'), '--golden', 'update');
  assert.equal(failed.code, 1, failed.stdout + failed.stderr);
  assert.match(failed.stderr, /synthetic golden update failure/u);
  const failedRun = keptRun(failed.stdout, failed.stderr);
  await fs.access(path.join(failedRun, 'golden.render.md'));
  const journal = path.join(golden, '00000000-0000-4000-8000-000000000000.jsonl');
  await fs.appendFile(journal, '\n' + JSON.stringify({
    kind: 2, k: ['requests', 0, 'response'], v: [{ kind: 'syntheticUnknownKind', value: 'unknown fixture payload' }],
  }) + '\n');
  const strict = await invoke(path.join(home, 'src', 'cli.ts'), '--golden', 'update', '--strict');
  assert.equal(strict.code, 2, strict.stdout + strict.stderr);
  await fs.access(path.join(keptRun(strict.stdout, strict.stderr), 'golden.render.md'));
  await fs.access(path.join(failedRun, 'golden.render.md'));
  await checkOlderFiles();
});

test('ordinary Local exports keep their archive and companions and never allocate a golden run', async (context) => {
  const { home, golden, scratch, invoke, checkOlderFiles } = await fixture(context);
  const output = path.join(scratch, 'ordinary.md');
  const result = await invoke(path.join(home, 'src', 'cli.ts'),
    path.join(golden, '00000000-0000-4000-8000-000000000000.jsonl'), output);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const markdown = await fs.readFile(output, 'utf8');
  assert.ok((await readLinkedArchiveCompanions(markdown, output)).length > 0);
  assert.equal((await fs.readdir(scratch)).filter((name) => name.includes('local-golden')).length, 0);
  await checkOlderFiles();
});

test('Local golden cleanup refuses unowned files and paths outside its run before deleting anything', async (context) => {
  const run = await createGoldenScratchRun();
  const unexpected = path.join(run.directory, 'keep.txt');
  context.after(async () => {
    await fs.unlink(unexpected);
    await run.cleanup([run.outputPath]);
  });
  await fs.writeFile(run.outputPath, 'archive');
  await fs.writeFile(unexpected, 'unowned');
  await assert.rejects(run.cleanup([run.outputPath]), /unowned entry/u);
  await assert.rejects(run.cleanup([run.outputPath, path.join(PKG, 'README.md')]), /outside its archive bundle/u);
  assert.equal(await fs.readFile(run.outputPath, 'utf8'), 'archive');
  assert.equal(await fs.readFile(unexpected, 'utf8'), 'unowned');
});

test('Local golden cleanup refuses an assets symlink without following it', async (context) => {
  const { scratch } = await fixture(context);
  const outside = path.join(scratch, 'outside-assets');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'keep.txt'), 'outside companion');
  const run = await createGoldenScratchRun();
  const assets = path.join(run.directory, 'golden.render_assets_261115_001318');
  context.after(async () => {
    await fs.unlink(assets);
    await run.cleanup([run.outputPath]);
  });
  await fs.writeFile(run.outputPath, 'archive');
  await fs.symlink(outside, assets, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(run.cleanup([run.outputPath, path.join(assets, 'keep.txt')]), /assets directory changed/u);
  assert.equal(await fs.readFile(run.outputPath, 'utf8'), 'archive');
  assert.equal(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8'), 'outside companion');
});
