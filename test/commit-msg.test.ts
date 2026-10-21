import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('commit-msg removes Copilot trailers but keeps human trailers and body text in a temporary repository', async (context) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-hook-test-'));
  context.after(() => fs.rm(folder, { recursive: true, force: true }));
  const config = path.join(folder, 'empty.gitconfig');
  await fs.writeFile(config, '');
  function git (...args: string[]) {
    const result = spawnSync('git', args, { cwd: folder, encoding: 'utf8', env: {
      ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config,
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
    } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  }
  git('init', '--quiet');
  await fs.mkdir(path.join(folder, '.githooks'));
  const hook = path.join(folder, '.githooks', 'commit-msg');
  await fs.copyFile(path.join(ROOT, '.githooks', 'commit-msg'), hook);
  await fs.chmod(hook, 0o755);
  git('config', 'core.hooksPath', '.githooks');
  const message = path.join(folder, 'message.txt');
  const body = 'Example body:\nCo-authored-by: Copilot <copilot@example.invalid>\nThis is prose, not a trailer.';
  await fs.writeFile(message, `Synthetic commit\n\n${body}\n\nCo-authored-by: Copilot <copilot@example.invalid>\nCo-authored-by: Human <human@example.invalid>\nco-authored-by: GitHub Copilot <copilot@users.noreply.github.com>\n`);
  git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '--quiet', '--file', message);
  const committed = git('log', '-1', '--format=%B');
  assert.ok(committed.includes(body), 'a matching body line is not a trailer');
  assert.match(committed, /Co-authored-by: Human <human@example\.invalid>/u);
  assert.equal(committed.match(/Co-authored-by: Copilot/gu)?.length, 1, 'only the body example remains');
  assert.doesNotMatch(committed, /GitHub Copilot/u);
  await fs.writeFile(message, 'No trailers\r\n\r\nOrdinary message.\r\n');
  const result = spawnSync('git', ['hook', 'run', 'commit-msg', '--', message], { cwd: folder, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await fs.readFile(message, 'utf8'), 'No trailers\r\n\r\nOrdinary message.\r\n');
  await fs.writeFile(message, 'CRLF trailers\r\n\r\nCo-authored-by: Copilot <copilot@example.invalid>\r\nSigned-off-by: Human <human@example.invalid>\r\n');
  const crlf = spawnSync('git', ['hook', 'run', 'commit-msg', '--', message], { cwd: folder, encoding: 'utf8' });
  assert.equal(crlf.status, 0, crlf.stderr);
  assert.equal(await fs.readFile(message, 'utf8'), 'CRLF trailers\r\n\r\nSigned-off-by: Human <human@example.invalid>\r\n');
});
