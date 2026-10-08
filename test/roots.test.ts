import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverUserDataRoots, resolveUserDataRoot, UserDataRootError } from '../src/session/roots.ts';

async function fixture (context: test.TestContext) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-roots-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const code = path.join(directory, 'Code');
  const insiders = path.join(directory, 'Code - Insiders');
  await fs.mkdir(code);
  await fs.mkdir(insiders);
  return { directory, code, insiders };
}

test('root discovery keeps all existing candidates once and skips missing ones', async (context) => {
  const { directory, code, insiders } = await fixture(context);
  const file = path.join(directory, 'not-a-directory');
  await fs.writeFile(file, '');
  assert.deepEqual(
    await discoverUserDataRoots([code, path.join(directory, 'absent'), insiders, code, file]),
    [code, insiders],
  );
});

test('an explicit valid root wins without discovery or choosing', async (context) => {
  const { code } = await fixture(context);
  assert.equal(await resolveUserDataRoot({
    userDataRoot: code,
    candidates: ['invalid\0candidate'],
    choose: async () => { throw new Error('Must not prompt for explicit roots.'); },
  }), code);
});

test('an invalid explicit root never falls back to a discovered root', async (context) => {
  const { directory, code } = await fixture(context);
  await assert.rejects(resolveUserDataRoot({
    userDataRoot: path.join(directory, 'missing'), candidates: [code],
  }), UserDataRootError);
  await assert.rejects(resolveUserDataRoot({ userDataRoot: '   ' }), /nonempty/);
  const file = path.join(directory, 'file');
  await fs.writeFile(file, '');
  await assert.rejects(resolveUserDataRoot({ userDataRoot: file }), /not a directory/);
});

test('zero roots errors and one root selects without prompting', async (context) => {
  const { code } = await fixture(context);
  await assert.rejects(resolveUserDataRoot({ candidates: [] }), /No VS Code user-data root/);
  assert.equal(await resolveUserDataRoot({
    candidates: [code],
    choose: async () => { throw new Error('Must not prompt for a single root.'); },
  }), code);
});

test('multiple roots without a chooser report candidates and remediation', async (context) => {
  const { code, insiders } = await fixture(context);
  await assert.rejects(resolveUserDataRoot({ candidates: [code, insiders] }), (error: unknown) => {
    assert.ok(error instanceof UserDataRootError);
    assert.deepEqual(error.roots, [code, insiders]);
    assert.ok(error.message.includes(code));
    assert.ok(error.message.includes(insiders));
    assert.ok(error.message.includes('--user-data-root'));
    return true;
  });
});

test('multiple roots accept only an exact candidate or explicit cancellation', async (context) => {
  const { code, insiders } = await fixture(context);
  assert.equal(await resolveUserDataRoot({
    candidates: [code, insiders], choose: async (roots) => {
      assert.ok(Object.isFrozen(roots));
      return roots[1];
    },
  }), insiders);
  await assert.rejects(resolveUserDataRoot({
    candidates: [code, insiders], choose: async () => null,
  }), /cancelled/);
  await assert.rejects(resolveUserDataRoot({
    candidates: [code, insiders], choose: async () => code + '-not-a-candidate',
  }), /did not match/);
});

test('non-missing discovery failures surface rather than skipping a root', async () => {
  await assert.rejects(discoverUserDataRoots(['invalid\0candidate']), (error: unknown) => {
    assert.ok(error instanceof UserDataRootError);
    assert.ok(error.cause instanceof Error);
    return true;
  });
});
