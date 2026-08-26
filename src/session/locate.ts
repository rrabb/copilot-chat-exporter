// Finding the journal file for a session: listing what exists, and resolving what the user asked
// for into one path.
//
// `chatSessions/<id>.jsonl` is the definitive store. The sibling `transcripts/<id>.jsonl` is a
// different format entirely, so a filename that is not a session UUID is rejected rather than
// parsed into an empty export.

import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import type { SessionLocation } from '../types.ts';
import { workspaceStorageRoots } from '../host.ts';
import { parseJson } from '../text.ts';

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAT_INDEX_KEY = 'chat.ChatSessionStore.index';

// A journal's first record is a full state snapshot, so it can be megabytes on a long session,
// but the rest of the file is always larger. Reading to the first newline avoids materializing
// a 24 MB file as a JS string just to read one header field. Also used to read the version
// header out of a transcript.
export async function readFirstLine (filePath: string) {
  const handle = await fs.open(filePath, 'r');
  try {
    const chunk = Buffer.alloc(64 * 1024);
    const parts = [];
    let offset = 0;
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset);
      if (!bytesRead)
        break;
      const newline = chunk.subarray(0, bytesRead).indexOf(0x0a);
      // Slice before decoding: splitting UTF-8 across chunk boundaries would corrupt the text.
      parts.push(Buffer.from(chunk.subarray(0, newline >= 0 ? newline : bytesRead)));
      if (newline >= 0)
        break;
      offset += bytesRead;
    }
    return Buffer.concat(parts).toString('utf8');
  } finally {
    await handle.close();
  }
}

// Distinguishes "the first argument names a session" from "the first argument is an output
// path", so the id pattern stays in one place.
export function looksLikeSessionArgument (value?: string) {
  return Boolean(value?.endsWith('.jsonl') || SESSION_ID_PATTERN.test(value ?? ''));
}

export function currentSessionFromEnv () {
  const target = process.env.VSCODE_TARGET_SESSION_LOG;
  if (!target)
    return null;
  const sessionId = path.basename(target);
  if (!SESSION_ID_PATTERN.test(sessionId))
    return null;
  return { sessionId, hashRoot: path.dirname(path.dirname(path.dirname(target))) };
}

export async function readSessionTitle (sessionPath: string) {
  let title = '';
  let lineNumber = 0;
  const lines = createInterface({
    input: createReadStream(sessionPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    lineNumber += 1;
    if (lineNumber > 1 && !line.includes('"customTitle"'))
      continue;
    const record = parseJson(line);
    if (record?.kind === 0) {
      title = typeof record.v?.customTitle === 'string' ? record.v.customTitle : '';
      continue;
    }
    if (
      record?.kind === 1
      && Array.isArray(record.k)
      && record.k.length === 1
      && record.k[0] === 'customTitle'
    )
      title = typeof record.v === 'string' ? record.v : '';
  }

  return title;
}

function readIndexedTitles (hashRoot: string) {
  const titles = new Map<string, string>();
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(path.join(hashRoot, 'state.vscdb'), { readOnly: true });
    const row = database.prepare('SELECT value FROM ItemTable WHERE key = ?').get(CHAT_INDEX_KEY) as { value?: unknown } | undefined;
    const entries = parseJson(typeof row?.value === 'string' ? row.value : '')?.entries;
    if (!entries || typeof entries !== 'object')
      return titles;
    for (const [sessionId, entry] of Object.entries(entries)) {
      const title = (entry as { title?: unknown })?.title;
      if (SESSION_ID_PATTERN.test(sessionId) && typeof title === 'string' && title)
        titles.set(sessionId, title);
    }
  } catch {
    // The index is optional and can be absent, locked, or from an older VS Code version.
  } finally {
    try {
      database?.close();
    } catch {
      // Closing optional title metadata must not prevent journal fallback.
    }
  }
  return titles;
}

// The workspace index holds the current GUI title, including manual renames that VS Code does not
// write back to the journal. When the index has no entry, `--list` replays journal title changes.
export async function listSessions ({ withTitles = false } = {}) {
  const sessions = [];
  for (const storageRoot of workspaceStorageRoots()) {
    let hashes = [];
    try {
      hashes = await fs.readdir(storageRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const hash of hashes) {
      if (!hash.isDirectory())
        continue;
      const hashRoot = path.join(storageRoot, hash.name);
      const indexedTitles = readIndexedTitles(hashRoot);
      const chatSessionsDir = path.join(hashRoot, 'chatSessions');
      let files = [];
      try {
        files = await fs.readdir(chatSessionsDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const file of files) {
        const sessionId = path.basename(file.name, '.jsonl');
        if (!file.isFile() || !SESSION_ID_PATTERN.test(sessionId))
          continue;
        const sessionPath = path.join(chatSessionsDir, file.name);
        const stat = await fs.stat(sessionPath);
        let title = indexedTitles.get(sessionId) ?? '';
        if (withTitles && !title) {
          try {
            title = await readSessionTitle(sessionPath);
          } catch {
            // Title is best-effort.
          }
        }
        sessions.push({ sessionId, hashRoot, sessionPath, mtimeMs: stat.mtimeMs, title });
      }
    }
  }
  return sessions.sort((left, right) => right.mtimeMs - left.mtimeMs);
}

export async function resolveSession (sourceArgument?: string): Promise<SessionLocation> {
  const sessions = await listSessions();
  if (sourceArgument?.endsWith('.jsonl')) {
    const sessionPath = path.resolve(sourceArgument);
    const sessionId = path.basename(sessionPath, '.jsonl');
    if (!SESSION_ID_PATTERN.test(sessionId))
      throw new Error(`Transcript filename must be a session UUID: ${sourceArgument}`);
    return sessions.find((session) => session.sessionPath === sessionPath) ?? { sessionId, sessionPath, hashRoot: path.dirname(path.dirname(sessionPath)) };
  }
  if (sourceArgument) {
    const match = sessions.find((session) => session.sessionId === sourceArgument);
    if (match)
      return match;
    throw new Error(`No chat session found for ${sourceArgument}.`);
  }
  const current = currentSessionFromEnv();
  if (current) {
    const match = sessions.find((session) => session.sessionId === current.sessionId);
    if (match)
      return match;
    const sessionPath = path.join(current.hashRoot, 'chatSessions', `${current.sessionId}.jsonl`);
    return { sessionId: current.sessionId, sessionPath, hashRoot: current.hashRoot };
  }
  if (sessions[0])
    return sessions[0];
  throw new Error('No VS Code chat session was found. Pass a session UUID or .jsonl path, or use --list.');
}
