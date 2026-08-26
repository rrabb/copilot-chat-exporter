import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs } from '../src/args.ts';

const ok = (argv: string[]) => {
  const parsed = parseArgs(argv);
  if (!parsed.ok)
    throw new Error(`expected success, got: ${parsed.error}`);
  return parsed.options;
};
const err = (argv: string[]) => {
  const parsed = parseArgs(argv);
  if (parsed.ok)
    throw new Error('expected a usage error');
  return parsed.error;
};

// --- the bug this file exists for ------------------------------------------------------------

test('an unknown option is refused, not treated as an output path', () => {
  // The defect: anything unrecognised fell through to the positional list, where the second
  // positional is the output path. `--verfiy <id>` ran a full export, wrote it to a file named
  // `--verfiy`, and exited 0 - so a typo looked like success.
  assert.match(err(['--verfiy', 'abc']), /Unknown option '--verfiy'/);
  assert.match(err(['session-id', '--unknown-flag']), /Unknown option '--unknown-flag'/);
});

test('a near-miss of a real flag is refused rather than silently ignored', () => {
  for (const typo of ['--verify-strict', '--stict', '--outdir', '--golden-check'])
    assert.match(err([typo]), /Unknown option/);
});

// --- positionals ------------------------------------------------------------------------------

test('positionals keep their order and exclude every flag and flag value', () => {
  const options = ok(['--verify', 'the-session', '--out-dir', '/tmp/out', 'the-output.md', '--strict']);
  assert.deepEqual(options.positionals, ['the-session', 'the-output.md']);
  assert.equal(options.outDir, '/tmp/out');
  assert.equal(options.verify, true);
  assert.equal(options.strict, true);
});

test('a flag value is never mistaken for a positional', () => {
  // The old index-based exclusion is what made this fragile; the value is consumed in place now.
  const options = ok(['--workspace-root', 'check', 'my-session']);
  assert.equal(options.workspaceRoot, 'check');
  assert.deepEqual(options.positionals, ['my-session']);
});

test('a path that is not a flag stays a positional', () => {
  assert.deepEqual(ok(['docs/chat-exports/out.md']).positionals, ['docs/chat-exports/out.md']);
});

// --- booleans ---------------------------------------------------------------------------------

test('--audit is an alias for --verify', () => {
  assert.equal(ok(['--audit']).verify, true);
  assert.equal(ok(['--verify']).verify, true);
  assert.equal(ok([]).verify, false);
});

test('no arguments is valid: it means the current session', () => {
  const options = ok([]);
  assert.deepEqual(options, {
    list: false,
    verify: false,
    strict: false,
    golden: null,
    snapshot: null,
    installSkill: null,
    workspaceRoot: null,
    outDir: null,
    positionals: [],
  });
});

// --- flags that take a value --------------------------------------------------------------------

test('a value flag with nothing after it reports its own usage', () => {
  assert.equal(err(['--out-dir']), 'Usage: --out-dir <path>');
  assert.equal(err(['--workspace-root']), 'Usage: --workspace-root <path>');
  assert.equal(err(['--install-skill']), 'Usage: --install-skill <targetRoot>');
  assert.equal(err(['session', '--golden']), 'Usage: --golden check|update');
});

test('--install-skill consumes its target root', () => {
  const options = ok(['--install-skill', '/tmp/project']);
  assert.equal(options.installSkill, '/tmp/project');
  assert.deepEqual(options.positionals, []);
});

test('--golden and --snapshot accept only check or update', () => {
  assert.equal(ok(['--golden', 'check']).golden, 'check');
  assert.equal(ok(['--golden', 'update']).golden, 'update');
  assert.equal(ok(['--snapshot', 'update', 'the-session']).snapshot, 'update');
  assert.equal(err(['--golden', 'bogus']), 'Usage: --golden check|update');
  assert.equal(err(['--snapshot', 'sillyvalue']), 'Usage: --snapshot check|update [sessionId]');
});

test('--snapshot keeps its session id as a positional', () => {
  const options = ok(['--snapshot', 'check', 'the-session']);
  assert.equal(options.snapshot, 'check');
  assert.deepEqual(options.positionals, ['the-session']);
});

test('--golden no longer leaves its action in the positionals', () => {
  // It used a separate parsing path from every other value flag, which only went unnoticed
  // because golden mode ignores positionals entirely.
  assert.deepEqual(ok(['--golden', 'check']).positionals, []);
});

test('--list is a mode, and junk beside it is still refused', () => {
  assert.equal(ok(['--list']).list, true);
  assert.match(err(['--list', '--bogus']), /Unknown option/);
});
