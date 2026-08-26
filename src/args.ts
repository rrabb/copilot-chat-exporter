// Command-line parsing, kept separate from `cli.ts` for one reason: everything in `cli.ts` runs
// at import time, so it cannot be imported by a test without running the whole tool. This is the
// only file that answers "what did the user ask for", and it is pure, so a test can ask it.
//
// It returns a result rather than printing or exiting, per the rule that only `cli.ts` does that.

export interface CliOptions {
  list: boolean;
  verify: boolean;
  strict: boolean;
  golden: 'check' | 'update' | null;
  snapshot: 'check' | 'update' | null;
  installSkill: string | null;
  workspaceRoot: string | null;
  outDir: string | null;
  /** Everything that was not a flag: a session id or path, then an output path. */
  positionals: string[];
}

export type ParsedArgs =
  | { ok: true; options: CliOptions }
  | { ok: false; error: string };

const BOOLEAN_FLAGS = new Set(['--list', '--verify', '--audit', '--strict']);

// Value is the usage line shown when the flag is wrong, so the message lives next to the flag.
const VALUE_FLAGS: Record<string, string> = {
  '--workspace-root': '--workspace-root <path>',
  '--out-dir': '--out-dir <path>',
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
      if (!value)
        return { ok: false, error: `Usage: ${VALUE_FLAGS[arg]}` };
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

  return {
    ok: true,
    options: {
      list: booleans.has('--list'),
      verify: booleans.has('--verify') || booleans.has('--audit'),
      strict: booleans.has('--strict'),
      golden: (values.get('--golden') ?? null) as CliOptions['golden'],
      snapshot: (values.get('--snapshot') ?? null) as CliOptions['snapshot'],
      installSkill: values.get('--install-skill') ?? null,
      workspaceRoot: values.get('--workspace-root') ?? null,
      outDir: values.get('--out-dir') ?? null,
      positionals,
    },
  };
}
