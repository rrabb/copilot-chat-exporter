// Shared sandbox helpers for scripts that run the real CLI on copied or synthetic chats.
// Every path the CLI might read or write (home, VS Code user data, Copilot home, cache) points
// inside the sandbox folder, so a demo never touches real session data.
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CLI = path.join(REPO_ROOT, 'src', 'cli.ts');

const pad = (number) => String(number).padStart(2, '0');

export function folderTimestamp (date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function localTimestamp (date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  const minutes = pad(Math.abs(offset) % 60);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${hours}:${minutes}`;
}

/** Creates `<parent>/<prefix>-<timestamp>[-n]` without overwriting an earlier run. */
export async function createRunFolder (parent, prefix) {
  await fs.mkdir(parent, { recursive: true });
  const stamp = folderTimestamp(new Date());
  for (let suffix = 0; ; suffix += 1) {
    const candidate = path.join(parent, `${prefix}-${stamp}${suffix ? `-${suffix}` : ''}`);
    try {
      await fs.mkdir(candidate);
      return candidate;
    } catch (error) {
      if (error?.code !== 'EEXIST')
        throw error;
    }
  }
}

/** Writes a workspace `state.vscdb` whose chat index lists the given selector keys and titles. */
export async function writeChatIndex (workspace, entries) {
  await fs.mkdir(workspace, { recursive: true });
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(path.join(workspace, 'state.vscdb'));
  try {
    database.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)');
    database.prepare('INSERT INTO ItemTable VALUES (?, ?)').run('chat.ChatSessionStore.index', JSON.stringify({ version: 1, entries }));
  } finally {
    database.close();
  }
}

/**
 * Lays out a sandbox for one chat and returns what the CLI needs to export it.
 * SDK chats use the `copilotcli:/<id>` index key, which needs only `session-state/<id>/events.jsonl`.
 * An `agent-host-copilotcli:/<id>` key would also need `agentSessionData/<id>/session.db`.
 * `events` may be a ready JSONL string or an array of event objects and raw lines.
 */
export async function prepareChatSandbox (directory, { provider, id, title, events, localFile }) {
  const userDataRoot = path.join(directory, 'source', 'Code');
  const workspace = path.join(userDataRoot, 'User', 'workspaceStorage', 'synthetic');
  const copilotHome = path.join(directory, 'source', 'copilot');
  let sourcePath;
  let selector;
  if (provider === 'sdk') {
    sourcePath = path.join(copilotHome, 'session-state', id, 'events.jsonl');
    selector = `copilotcli:/${id}`;
    const text = typeof events === 'string'
      ? events
      : `${events.map((event) => typeof event === 'string' ? event : JSON.stringify(event)).join('\n')}\n`;
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, text);
  } else {
    sourcePath = path.join(workspace, 'chatSessions', path.basename(localFile));
    selector = sourcePath;
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.copyFile(localFile, sourcePath);
  }
  await writeChatIndex(workspace, { [provider === 'sdk' ? selector : path.resolve(sourcePath)]: { title } });
  const home = path.join(directory, 'home');
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, 'AppData'),
    XDG_CONFIG_HOME: path.join(home, '.config'),
    COPILOT_HOME: copilotHome,
    CCE_CACHE_DIR: path.join(directory, 'cache'),
  };
  return { userDataRoot, copilotHome, sourcePath, selector, env };
}

/** Runs `node src/cli.ts` with the given arguments and environment. */
export function runCli (args, env, timeout = 60_000) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: REPO_ROOT, env, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
}
