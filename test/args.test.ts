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

test('no arguments is valid: it means listing, never implicit export', () => {
  const options = ok([]);
  assert.deepEqual(options, {
    list: true,
    showIgnored: false,
    last25: false,
    fullIds: false,
    noHtml: false,
    detailed: false,
    htmlOutput: null,
    current: false,
    overwrite: false,
    verify: false,
    strict: false,
    golden: null,
    snapshot: null,
    installSkill: null,
    workspaceRoot: null,
    outDir: null,
    userDataRoot: null,
    positionals: [],
  });

  test('detailed implicitly lists, is listing-only and permits the nonfatal no-html combination', () => {
    assert.equal(ok(['--detailed']).list, true);
    assert.equal(ok(['--list', '--detailed']).detailed, true);
    assert.equal(ok(['--detailed', '--no-html']).noHtml, true);
    assert.match(err(['--detailed', 'session']), /only when listing/);
    assert.match(err(['--current', '--detailed']), /only when listing/);
    assert.match(err(['--verify', '--detailed']), /only when listing/);
  });
});

test('root selection and current-session intent are explicit', () => {
  assert.equal(ok(['--user-data-root', 'C:\\Code']).list, true);
  assert.equal(ok(['--current', '--user-data-root', 'C:\\Code', 'out.md']).current, true);
  assert.equal(ok(['--current']).list, false);
  assert.equal(ok(['--current', '--overwrite']).overwrite, true);
  assert.match(err(['--user-data-root', '--list']), /Usage/);
  assert.match(err(['--user-data-root', 'one', '--user-data-root', 'two']), /more than once/);
  assert.match(err(['--list', '--current']), /cannot be combined/);
  assert.match(err(['--list', 'session']), /does not accept/);
  assert.match(err(['--verify', '--golden', 'check']), /Choose one action/);
});

test('listing filters require a listing action and are parsed independently', () => {
  const options = ok(['--show-ignored', '--last25', '--full-ids', '--html-output', 'report.html']);
  assert.equal(options.list, true);
  assert.equal(options.showIgnored, true);
  assert.equal(options.last25, true);
  assert.equal(options.fullIds, true);
  assert.equal(options.htmlOutput, 'report.html');
  assert.equal(ok(['--list', '--last25']).last25, true);
  assert.equal(ok(['--list', '--no-html']).noHtml, true);
  assert.match(err(['--verify', '--last25']), /available only when listing/);
  assert.match(err(['session-id', '--full-ids']), /available only when listing/);
  assert.match(err(['--list', '--no-html', '--html-output', 'report.html']), /cannot be combined/);
  assert.match(err(['session-id', '--html-output', 'report.html']), /only when listing/);
});

// --- flags that take a value --------------------------------------------------------------------

test('a value flag with nothing after it reports its own usage', () => {
  assert.equal(err(['--out-dir']), 'Usage: --out-dir <path>');
  assert.equal(err(['--html-output']), 'Usage: --html-output <path>');
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
