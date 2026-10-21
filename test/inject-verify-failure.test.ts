import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const preload = fileURLToPath(new URL('./fixtures/inject-verify-failure.mjs', import.meta.url));

test('fault injection refuses a run where no targeted staged read happened', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-injection-test-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const counter = path.join(directory, 'injections.json');
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, '--input-type=module', '-e', ''], {
    encoding: 'utf8', env: {
      ...process.env, CCE_FAILURE_DIRECTORY: directory, CCE_FAILURE_STAGE_PREFIX: '.chat-export-',
      CCE_FAILURE_MODE: 'missing-text', CCE_FAILURE_COUNTER: counter,
    },
  });
  assert.equal(result.status, 86);
  assert.match(result.stderr, /No verification fault was injected/u);
  assert.equal(JSON.parse(await fs.readFile(counter, 'utf8')).injections, 0);
});

test('fault injection targets only its configured stage directory and counts replacements without changing bytes', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-injection-test-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const staged = path.join(directory, 'chosen-stage-prefix-synthetic.tmp');
  const other = path.join(directory, 'unrelated.md');
  await fs.writeFile(staged, 'Question');
  await fs.writeFile(other, 'Question');
  const counter = path.join(directory, 'injections.json');
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, '--input-type=module', '-e', `
    import assert from 'node:assert/strict'; import { promises as fs } from 'node:fs';
    assert.equal(await fs.readFile(${JSON.stringify(other)}, 'utf8'), 'Question');
    assert.equal(await fs.readFile(${JSON.stringify(staged)}, 'utf8'), 'Removed!');
  `], {
    encoding: 'utf8', env: {
      ...process.env, CCE_FAILURE_DIRECTORY: directory, CCE_FAILURE_STAGE_PREFIX: 'chosen-stage-prefix-',
      CCE_FAILURE_MODE: 'missing-text', CCE_FAILURE_COUNTER: counter,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(await fs.readFile(counter, 'utf8')).injections, 1);
  assert.equal(await fs.readFile(staged, 'utf8'), 'Question');
});
