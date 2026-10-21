import os from 'node:os';
import path from 'node:path';

export function defaultSourceCacheRoot (platform = process.platform, env = process.env, home = os.homedir()): string {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const base = platform === 'win32' ? env.LOCALAPPDATA || paths.join(home, 'AppData', 'Local')
    : platform === 'darwin' ? paths.join(home, 'Library', 'Caches')
      : env.XDG_CACHE_HOME || paths.join(home, '.cache');
  return paths.join(base, 'copilot-chat-exporter', 'cache');
}

export function legacySourceCacheRoots (): string[] {
  return [path.join(os.tmpdir(), 'copilot-chat-exporter-cache')];
}
