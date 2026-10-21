import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultSourceCacheRoot } from './cache-paths.ts';

/** One configurable location for private captures and receipts. */
export function sourceCacheRoot (): string {
  const configured = process.env.CCE_CACHE_DIR;
  if (configured !== undefined && !configured.trim())
    throw new Error('CCE_CACHE_DIR requires a nonempty directory path.');
  const defaultRoot = defaultSourceCacheRoot();
  if (process.env.NODE_TEST_CONTEXT && (!configured || path.resolve(configured) === path.resolve(defaultRoot)))
    throw new Error('Tests must set an isolated CCE_CACHE_DIR before allocating captures or receipts.');
  const directory = path.resolve(configured ?? defaultRoot);
  const home = path.resolve(process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot'));
  const relative = path.relative(home, directory);
  if (/(?:^|[\\/])(?:workspaceStorage|globalStorage|agentSessionData|session-state|\.copilot)(?:[\\/]|$)/iu.test(directory)
    || directory === home
    || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)))
    throw new Error('Private capture destinations must be outside native session stores.');
  return directory;
}

export async function createSourceCacheDirectory (prefix: string): Promise<string> {
  const root = sourceCacheRoot();
  await fs.mkdir(root, { recursive: true });
  return fs.mkdtemp(path.join(root, prefix));
}
