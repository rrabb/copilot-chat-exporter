// Command-line parsing, kept separate from `cli.ts` for one reason: everything in `cli.ts` runs
// at import time, so it cannot be imported by a test without running the whole tool. This is the
// only file that answers "what did the user ask for", and it is pure, so a test can ask it.
//
// It returns a result rather than printing or exiting, per the rule that only `cli.ts` does that.

export interface CliOptions {
  list: boolean;
  showIgnored: boolean;
  last25: boolean;
  fullIds: boolean;
  noHtml: boolean;
  detailed: boolean;
  compressed: boolean;
  compression: 'gzip' | 'brotli' | null;
  htmlOutput: string | null;
  current: boolean;
  overwrite: boolean;
  verify: boolean;
  strict: boolean;
  golden: 'check' | 'update' | null;
  snapshot: 'check' | 'update' | null;
  installSkill: string | null;
  workspaceRoot: string | null;
  outDir: string | null;
  userDataRoot: string | null;
  /** Everything that was not a flag: a session id or path, then an output path. */
  positionals: string[];
}

export type ParsedArgs =
  | { ok: true; options: CliOptions }
  | { ok: false; error: string };

const BOOLEAN_FLAGS = new Set([
  '--list', '--current', '--overwrite', '--verify', '--audit', '--strict',
  '--show-ignored', '--last25', '--full-ids', '--no-html', '--detailed', '--compressed',
]);

// Value is the usage line shown when the flag is wrong, so the message lives next to the flag.
const VALUE_FLAGS: Record<string, string> = {
  '--workspace-root': '--workspace-root <path>',
  '--out-dir': '--out-dir <path>',
  '--user-data-root': '--user-data-root <path>',
  '--html-output': '--html-output <path>',
  '--compression': '--compression gzip|brotli',
  '--golden': '--golden check|update',
  '--snapshot': '--snapshot check|update [sessionId]',
  '--install-skill': '--install-skill <targetRoot>',
};

const ACTION_FLAGS = ['--golden', '--snapshot'] as const;
const ACTIONS = new Set(['check', 'update']);

export function parseArgs (argv: string[]): ParsedArgs {
  const booleans = new Set<string>();
  const values = new Map<string, string>();
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (BOOLEAN_FLAGS.has(arg)) {
      booleans.add(arg);
      continue;
    }
    if (Object.hasOwn(VALUE_FLAGS, arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--'))
        return { ok: false, error: `Usage: ${VALUE_FLAGS[arg]}` };
      if (values.has(arg))
        return { ok: false, error: `Option '${arg}' was supplied more than once.` };
      values.set(arg, value);
      i += 1;
      continue;
    }
    // Anything unrecognised used to fall through to the positional list, where the second
    // positional is the output path. So `--verfiy <id>` quietly ran a full export, wrote it to a
    // file named `--verfiy`, and exited 0. A typo has to be an error, not a filename.
    if (arg.startsWith('--'))
      return { ok: false, error: `Unknown option '${arg}'. Run --list to see usage.` };
    positionals.push(arg);
  }

  for (const flag of ACTION_FLAGS) {
    const action = values.get(flag);
    if (action != null && !ACTIONS.has(action))
      return { ok: false, error: `Usage: ${VALUE_FLAGS[flag]}` };
  }

  const modes = [
    booleans.has('--list'), values.has('--golden'), values.has('--snapshot'), values.has('--install-skill'),
    booleans.has('--verify') || booleans.has('--audit'),
  ].filter(Boolean).length;
  const listRequested = booleans.has('--list')
    || (modes === 0 && positionals.length === 0 && !booleans.has('--current'));
  if ((booleans.has('--show-ignored') || booleans.has('--last25') || booleans.has('--full-ids')
    || booleans.has('--no-html') || booleans.has('--detailed') || booleans.has('--compressed') || values.has('--compression') || values.has('--html-output')) && !listRequested)
    return { ok: false, error: 'Listing options are available only when listing sessions.' };
  const compression = values.get('--compression');
  if (compression !== undefined && compression !== 'gzip' && compression !== 'brotli')
    return { ok: false, error: 'Usage: --compression gzip|brotli' };
  if (booleans.has('--compressed') && compression === 'brotli')
    return { ok: false, error: '--compressed selects gzip and conflicts with --compression brotli.' };
  if ((booleans.has('--compressed') || compression) && !booleans.has('--detailed'))
    return { ok: false, error: '--compressed / --compression requires --detailed.' };
  if ((booleans.has('--compressed') || compression) && booleans.has('--no-html'))
    return { ok: false, error: '--compressed / --compression cannot be combined with --no-html.' };
  if (booleans.has('--no-html') && values.has('--html-output'))
    return { ok: false, error: '--no-html cannot be combined with --html-output.' };
  if (modes > 1)
    return { ok: false, error: 'Choose one action: --list, --verify, --snapshot, --golden or --install-skill.' };
  if (booleans.has('--current') && (booleans.has('--list') || values.has('--golden') || values.has('--install-skill')))
    return { ok: false, error: '--current cannot be combined with --list, --golden or --install-skill.' };
  if (booleans.has('--list') && positionals.length)
    return { ok: false, error: '--list does not accept a session or output positional argument.' };
  if (positionals.length > (booleans.has('--current') ? 1 : 2))
    return { ok: false, error: 'Too many positional arguments.' };

  return {
    ok: true,
    options: {
      list: listRequested,
      showIgnored: booleans.has('--show-ignored'),
      last25: booleans.has('--last25'),
      fullIds: booleans.has('--full-ids'),
      noHtml: booleans.has('--no-html'),
      detailed: booleans.has('--detailed'),
      compressed: booleans.has('--compressed'),
      compression: compression ?? (booleans.has('--compressed') ? 'gzip' : null),
      htmlOutput: values.get('--html-output') ?? null,
      current: booleans.has('--current'),
      overwrite: booleans.has('--overwrite'),
      verify: booleans.has('--verify') || booleans.has('--audit'),
      strict: booleans.has('--strict'),
      golden: (values.get('--golden') ?? null) as CliOptions['golden'],
      snapshot: (values.get('--snapshot') ?? null) as CliOptions['snapshot'],
      installSkill: values.get('--install-skill') ?? null,
      workspaceRoot: values.get('--workspace-root') ?? null,
      outDir: values.get('--out-dir') ?? null,
      userDataRoot: values.get('--user-data-root') ?? null,
      positionals,
    },
  };
}
