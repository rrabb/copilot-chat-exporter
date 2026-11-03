import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const guard = fileURLToPath(new URL('../scripts/require-pnpm.mjs', import.meta.url));

test('install guard accepts pnpm without downloading a helper', () => {
  const result = spawnSync(process.execPath, [guard], {
    env: { ...process.env, npm_config_user_agent: 'pnpm/12.16.1 npm/? node/v24.18.0 win32 x64' },
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

for (const userAgent of ['npm/11.0.0 node/v24.18.0', 'yarn/1.22.22', 'not-pnpm/12.16.1', '']) {
  test(`install guard rejects ${userAgent || 'missing package-manager identity'}`, () => {
    const env = { ...process.env };
    delete env.npm_config_user_agent;
    if (userAgent)
      env.npm_config_user_agent = userAgent;
    const result = spawnSync(process.execPath, [guard], { env, encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Use pnpm install/u);
    assert.equal(result.stdout, '');
  });
}
