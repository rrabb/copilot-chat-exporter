import { promises as fs } from 'node:fs';
import path from 'node:path';
import { userDataRoots } from '../host.ts';

function errorCode (error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

export class UserDataRootError extends Error {
  readonly roots: readonly string[];

  constructor (message: string, roots: readonly string[] = [], cause?: unknown) {
    super(message, { cause });
    this.name = 'UserDataRootError';
    this.roots = roots;
  }
}

/** Only missing candidates are skipped; permissions and other read failures remain explicit. */
export async function discoverUserDataRoots (candidates = userDataRoots()): Promise<string[]> {
  const roots: string[] = [];
  for (const candidate of candidates) {
    const root = path.resolve(candidate);
    try {
      if ((await fs.stat(root)).isDirectory() && !roots.includes(root))
        roots.push(root);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT')
        throw new UserDataRootError(`Unable to inspect VS Code user-data root: ${root}`, [root], error);
    }
  }
  return roots;
}

export interface RootSelectionOptions {
  userDataRoot?: string;
  /** Injected candidates for portable tests or hosts with a custom installation catalog. */
  candidates?: string[];
  /** The CLI may supply a terminal chooser; library calls never prompt on their own. */
  choose?: (roots: readonly string[]) => Promise<string | null>;
}

export async function resolveUserDataRoot (options: RootSelectionOptions = {}): Promise<string> {
  if (options.userDataRoot !== undefined) {
    if (!options.userDataRoot.trim())
      throw new UserDataRootError('--user-data-root requires a nonempty directory path.');
    const root = path.resolve(options.userDataRoot);
    try {
      if (!(await fs.stat(root)).isDirectory())
        throw new UserDataRootError(`VS Code user-data root is not a directory: ${root}`, [root]);
    } catch (error) {
      if (error instanceof UserDataRootError)
        throw error;
      throw new UserDataRootError(`Unable to read VS Code user-data root: ${root}`, [root], error);
    }
    return root;
  }

  const roots = await discoverUserDataRoots(options.candidates);
  if (roots.length === 0)
    throw new UserDataRootError('No VS Code user-data root was found. Pass --user-data-root <path>.');
  if (roots.length === 1)
    return roots[0];
  if (!options.choose)
    throw new UserDataRootError(
      `More than one VS Code user-data root was found:\n${roots.map((root) => `  ${root}`).join('\n')}\nPass --user-data-root <path> to choose one.`,
      roots,
    );
  const choice = await options.choose(Object.freeze([...roots]));
  if (choice === null)
    throw new UserDataRootError('VS Code user-data root selection was cancelled.', roots);
  if (!roots.includes(choice))
    throw new UserDataRootError('VS Code user-data root selection did not match a discovered candidate.', roots);
  return choice;
}
