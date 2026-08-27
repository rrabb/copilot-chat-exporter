// Everything the exporter needs to know about the machine and the project it is describing:
// where VS Code keeps its data, which folder the session belonged to, where output goes, and
// what git says.
//
// The workspace root is a property of the SESSION, not of where this tool is installed, so it
// is taken from the session's own storage folder wherever possible. That is what lets you
// export a session belonging to a different project than the one you are standing in.

import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ParsedSession, SessionLocation } from './types.ts';
import { clip } from './text.ts';

export interface HostContext {
  workspaceRoot: string;
  outDir: string;
  gitStatus: () => string;
}

interface SessionNamingInput {
  title?: string;
  customTitle: string;
  creationDate: number | null;
  turns: Array<{ ts?: number | null; prompt?: string }>;
}

// --- where VS Code keeps chat storage ---

// The location differs by platform and by build channel. Every candidate is probed; missing
// ones are skipped by the caller, so listing extra channels costs one failed readdir each.
const CHANNELS = ['Code', 'Code - Insiders', 'Code - Exploration', 'VSCodium'];

function userDataRoots (): string[] {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return CHANNELS.map((channel) => path.join(appData, channel));
  }
  if (process.platform === 'darwin')
    return CHANNELS.map((channel) => path.join(home, 'Library', 'Application Support', channel));
  const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return CHANNELS.map((channel) => path.join(configHome, channel));
}

export function workspaceStorageRoots (): string[] {
  return userDataRoots().map((root) => path.join(root, 'User', 'workspaceStorage'));
}

// --- git ---

// The only place this tool starts another process; `test/host.test.ts` enforces that. Failure is
// never fatal: the snapshot is context in the exported document, not data the export depends on.
export function gitStatus (cwd: string): string {
  try {
    return execFileSync('git', ['status', '--short'], { cwd, encoding: 'utf8', windowsHide: true }).trimEnd();
  } catch (error) {
    return `Unable to read Git status: ${(error as Error)?.message}`;
  }
}

// --- which folder the session belonged to ---

async function readJsonFile (filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function isDirectory (filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

function decodeFileUri (value: unknown): string {
  const match = /^file:\/\/\/(.*)$/.exec(String(value ?? ''));
  if (!match)
    return '';
  try {
    return path.normalize(decodeURIComponent(match[1]));
  } catch {
    return '';
  }
}

// VS Code records which folder a workspace-storage hash belongs to, which is authoritative for
// this session even when a different workspace is currently open.
async function workspaceRootFromStorage (hashRoot: string): Promise<string> {
  const meta = await readJsonFile(path.join(hashRoot, 'workspace.json'));
  const folder = decodeFileUri(meta?.folder);
  if (folder)
    return folder;
  // A multi-root window records the .code-workspace file instead of a folder.
  const workspaceFile = decodeFileUri(meta?.workspace);
  return workspaceFile ? path.dirname(workspaceFile) : '';
}

async function nearestProjectRoot (start: string): Promise<string> {
  let directory = path.resolve(start);
  for (;;) {
    for (const marker of ['.git', 'package.json']) {
      try {
        await fs.access(path.join(directory, marker));
        return directory;
      } catch {
        // Keep walking up.
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory)
      return path.resolve(start);
    directory = parent;
  }
}

export async function resolveWorkspaceRoot (hashRoot: string, override?: string | null): Promise<string> {
  if (override)
    return path.resolve(override);
  return (hashRoot && await workspaceRootFromStorage(hashRoot)) || await nearestProjectRoot(process.cwd());
}

// --- turning absolute paths into readable ones ---

// Held here rather than passed to every renderer: the root is unknown until the session is
// resolved, and threading it through each call would be noise. Set once, at startup.
let currentWorkspaceRoot = process.cwd();

export function setWorkspaceRoot (root: string): void {
  currentWorkspaceRoot = root;
}

export function getWorkspaceRoot (): string {
  return currentWorkspaceRoot;
}

export function workspacePath (value: string): string {
  // Resolve against the workspace root, not the current directory: untitled documents arrive as
  // bare relative names and belong to the session's workspace, wherever the tool was invoked.
  const absolute = path.resolve(currentWorkspaceRoot, value);
  const relative = path.relative(currentWorkspaceRoot, absolute);
  return !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative.replaceAll('\\', '/')
    : absolute.replaceAll('\\', '/');
}

// --- where output goes ---

// Falling back to the workspace root itself would scatter exports through a consumer's project,
// so the last resort is a dedicated folder instead.
export async function resolveOutputDir (workspaceRoot: string, override?: string | null): Promise<string> {
  if (override)
    return path.resolve(override);
  const configured = (await readJsonFile(path.join(workspaceRoot, 'package.json')))?.chatExport?.outDir
    ?? (await readJsonFile(path.join(workspaceRoot, '.chatexportrc.json')))?.outDir;
  if (configured)
    return path.resolve(workspaceRoot, configured);
  const conventional = path.join(workspaceRoot, 'docs', 'chat-exports');
  return await isDirectory(conventional) ? conventional : path.join(workspaceRoot, '.copilot-chat-history');
}

export function slugify (value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
}

// Dates the conversation, not the export, so re-exporting a session keeps the same name.
export function sessionDateStamp (session: SessionNamingInput, location: SessionLocation) {
  const date = new Date(session.turns[0]?.ts ?? session.creationDate ?? location.mtimeMs ?? NaN);
  if (Number.isNaN(date.getTime()))
    return '000000';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

// The generated name identifies the session, so a repeat export refreshes that archive in place
// rather than accumulating _2, _3 copies of the same conversation.
export function resolveOutputPath (outputArgument: string | null | undefined, session: SessionNamingInput, location: SessionLocation, outDir: string) {
  if (outputArgument)
    return path.resolve(outputArgument);
  const slug = slugify(session.title || session.customTitle) || slugify(clip(session.turns[0]?.prompt, 40)) || 'copilot-chat';
  const name = `${sessionDateStamp(session, location)}_${slug}_${location.sessionId.slice(0, 8)}.md`;
  return path.join(outDir, name);
}

export async function createHostContext (options: {
  hashRoot?: string;
  workspaceRoot?: string | null;
  outDir?: string | null;
}): Promise<HostContext> {
  const workspaceRoot = await resolveWorkspaceRoot(options.hashRoot ?? '', options.workspaceRoot);
  return {
    workspaceRoot,
    outDir: await resolveOutputDir(workspaceRoot, options.outDir),
    gitStatus: () => gitStatus(workspaceRoot),
  };
}
