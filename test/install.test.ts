import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { installAgentFiles } from '../src/install.ts';

async function temporaryDirectory (name: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
}

test('installs the skill and prompt under an explicit target root', async () => {
  const target = await temporaryDirectory('cce-install-target');
  const source = await temporaryDirectory('cce-install-source');
  await fs.mkdir(path.join(source, 'skill'));
  await fs.writeFile(path.join(source, 'skill', 'SKILL.md'), 'skill contents');
  await fs.writeFile(path.join(source, 'skill', 'export-chat.prompt.md'), 'prompt contents');

  const installed = await installAgentFiles(target, source);

  assert.deepEqual(installed.map(({ replaced }) => replaced), [false, false]);
  assert.equal(
    await fs.readFile(path.join(target, '.github', 'skills', 'export-chat', 'SKILL.md'), 'utf8'),
    'skill contents',
  );
  assert.equal(
    await fs.readFile(path.join(target, '.github', 'prompts', 'export-chat.prompt.md'), 'utf8'),
    'prompt contents',
  );
});

test('reports replacements and refuses a missing target root', async () => {
  const target = await temporaryDirectory('cce-replace-target');
  const source = await temporaryDirectory('cce-replace-source');
  await fs.mkdir(path.join(source, 'skill'));
  await fs.writeFile(path.join(source, 'skill', 'SKILL.md'), 'first');
  await fs.writeFile(path.join(source, 'skill', 'export-chat.prompt.md'), 'first');
  await installAgentFiles(target, source);

  await fs.writeFile(path.join(source, 'skill', 'SKILL.md'), 'second');
  const installed = await installAgentFiles(target, source);

  assert.deepEqual(installed.map(({ replaced }) => replaced), [true, true]);
  assert.equal(
    await fs.readFile(path.join(target, '.github', 'skills', 'export-chat', 'SKILL.md'), 'utf8'),
    'second',
  );
  await assert.rejects(
    installAgentFiles(path.join(target, 'missing'), source),
    /Target root is not a directory/,
  );
});
