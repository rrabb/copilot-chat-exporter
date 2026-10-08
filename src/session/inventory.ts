import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseChatSession } from './journal.ts';
import { validateLocalJournalRecords } from './journal-validation.ts';
import { resolveUserDataRoot } from './roots.ts';
import { resolveProviderOccurrences } from './provider-sources.ts';
import type { ProviderResolverOptions } from './provider-sources.ts';
import { occurrenceId } from './occurrence.ts';
import type {
  InventoryDiagnostic, SessionOccurrence, SessionProvider,
} from './sources.ts';

const INDEX_KEY = 'chat.ChatSessionStore.index';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord (value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function describeError (error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function missingPath (error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function validTimestamp (value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    && !Number.isNaN(new Date(value).getTime()) ? value : null;
}

function providerOf (key: string): SessionProvider {
  if (UUID.test(key))
    return 'local';
  if (key.startsWith('agent-host-copilotcli:/'))
    return 'agent-host';
  if (key.startsWith('copilotcli:/'))
    return 'copilot-cli';
  return key.includes(':/') ? 'external' : 'unknown';
}

interface ChatIndex {
  entries: Map<string, Record<string, unknown>>;
  diagnostics: InventoryDiagnostic[];
}

/** Reads metadata without creating or modifying the native database. */
export function readChatIndex (workspaceStoragePath: string): ChatIndex {
  const databasePath = path.join(workspaceStoragePath, 'state.vscdb');
  const entries = new Map<string, Record<string, unknown>>();
  const diagnostics: InventoryDiagnostic[] = [];
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    const row = database.prepare('SELECT value FROM ItemTable WHERE key = ?').get(INDEX_KEY);
    if (row !== undefined) {
      const value = row.value;
      const text = typeof value === 'string' ? value
        : value instanceof Uint8Array ? new TextDecoder('utf-8', { fatal: true }).decode(value)
          : null;
      if (text === null)
        throw new Error('Chat index value is neither text nor a UTF-8 blob.');
      const index: unknown = JSON.parse(text);
      if (!isRecord(index) || index.version !== 1 || !isRecord(index.entries))
        throw new Error('Chat index does not use the verified version 1 entries map.');
      for (const [key, entry] of Object.entries(index.entries)) {
        if (!isRecord(entry)) {
          diagnostics.push({
            path: databasePath, category: 'invalid-data',
            description: `Index entry ${key} is not an object; retained as an unresolved occurrence.`,
          });
        }
        entries.set(key, isRecord(entry) ? entry : {});
      }
    }
  } catch (error) {
    diagnostics.push({ path: databasePath, category: 'unreadable', description: describeError(error) });
  } finally {
    try {
      database?.close();
    } catch (error) {
      diagnostics.push({ path: databasePath, category: 'unreadable', description: `Closing index: ${describeError(error)}` });
    }
  }
  return { entries, diagnostics };
}

export interface SessionInventory {
  userDataRoot: string;
  occurrences: SessionOccurrence[];
  diagnostics: InventoryDiagnostic[];
}

/** Index-only and unknown/provider rows remain visible even without a readable backing. */
export async function inventorySessions (userDataRoot: string, options: ProviderResolverOptions = {}): Promise<SessionInventory> {
  const root = await resolveUserDataRoot({ userDataRoot });
  const storageRoot = path.join(root, 'User', 'workspaceStorage');
  const occurrences: SessionOccurrence[] = [];
  const diagnostics: InventoryDiagnostic[] = [];
  let workspaces;
  try {
    workspaces = await fs.readdir(storageRoot, { withFileTypes: true });
  } catch (error) {
    diagnostics.push({
      path: storageRoot, category: missingPath(error) ? 'source-unavailable' : 'unreadable',
      description: describeError(error),
    });
    return { userDataRoot: root, occurrences, diagnostics };
  }
  for (const workspace of workspaces.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const workspaceStoragePath = path.join(storageRoot, workspace.name);
    const workspaceMetadataPath = path.join(workspaceStoragePath, 'workspace.json');
    let workspaceIdentity: SessionOccurrence['provenance']['workspaceIdentity'];
    const workspaceDiagnostics: InventoryDiagnostic[] = [];
    try {
      const metadata: unknown = JSON.parse(await fs.readFile(workspaceMetadataPath, 'utf8'));
      if (!isRecord(metadata))
        throw new Error('Workspace metadata is not an object.');
      const kind = typeof metadata.folder === 'string' ? 'folder' : 'workspace';
      const uri = kind === 'folder' ? metadata.folder : metadata.workspace;
      if (typeof uri !== 'string' || !uri)
        throw new Error('Workspace metadata has no supported folder/workspace URI.');
      decodeURIComponent(new URL(uri).pathname);
      workspaceIdentity = { kind, uri };
    } catch (error) {
      if (!missingPath(error))
        workspaceDiagnostics.push({ path: workspaceMetadataPath, category: 'invalid-data', description: describeError(error) });
    }
    diagnostics.push(...workspaceDiagnostics);
    const index = readChatIndex(workspaceStoragePath);
    diagnostics.push(...index.diagnostics);
    const journals = new Map<string, string>();
    const journalDirectory = path.join(workspaceStoragePath, 'chatSessions');
    try {
      for (const entry of await fs.readdir(journalDirectory, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.jsonl') && UUID.test(entry.name.slice(0, -6)))
          journals.set(entry.name.slice(0, -6), path.join(journalDirectory, entry.name));
      }
    } catch (error) {
      if (!missingPath(error))
        diagnostics.push({ path: journalDirectory, category: 'unreadable', description: describeError(error) });
    }
    const keys = [...new Set([...index.entries.keys(), ...journals.keys()])].sort();
    for (const key of keys) {
      const metadata = index.entries.get(key);
      const provenance = {
        userDataRoot: root, workspaceStoragePath,
        ...(workspaceIdentity === undefined ? {} : { workspaceIdentity }),
        ...(metadata === undefined ? {} : { indexKey: key }),
      };
      const provider = providerOf(key);
      const title = typeof metadata?.title === 'string' ? metadata.title : '';
      const indexedDate = validTimestamp(metadata?.lastMessageDate);
      const row: SessionOccurrence = {
        occurrenceId: occurrenceId(provenance, key), provider, sessionId: key,
        title, titleSource: title ? 'index' : 'fallback',
        activityTimestamp: indexedDate, activitySource: indexedDate === null ? 'unknown' : 'index',
        createdTimestamp: null, promptCount: null,
        provenance, visibility: { status: 'included' },
        backing: {
          status: provider === 'external' || provider === 'unknown' ? 'unsupported' : 'unresolved',
          reason: provider === 'local' ? 'Local index entry has no journal.'
            : 'Provider backing has not been verified; index metadata alone is not exportable content.',
        },
        diagnostics: [...index.diagnostics, ...workspaceDiagnostics],
      };
      const journalPath = journals.get(key);
      if (journalPath !== undefined) {
        try {
          const before = await fs.stat(journalPath);
          const rawBytes = await fs.readFile(journalPath);
          const raw = rawBytes.toString('utf8');
          const after = await fs.stat(journalPath);
          if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
            throw new Error('Journal changed while being read; retry inventory before exporting.');
          validateLocalJournalRecords(raw, key);
          const parsed = parseChatSession(journalPath, raw);
          if (parsed.errors.length)
            throw new Error(parsed.errors.join(' '));
          row.backing = {
            status: 'verified',
            source: {
              kind: 'local-journal', sessionId: key, path: journalPath, schemaVersion: 3,
              sha256: createHash('sha256').update(rawBytes).digest('hex'), provenance,
            },
          };
          row.createdTimestamp = validTimestamp(parsed.creationDate);
          row.promptCount = parsed.turns.length;
          if (!title) {
            row.title = parsed.title;
            row.titleSource = parsed.title ? 'journal' : 'fallback';
          }
          const timestamps = parsed.turns.flatMap((turn) =>
            [validTimestamp(turn.ts), validTimestamp(turn.scalar.responseTimestamp)].filter((value) => value !== null));
          const recordedDate = timestamps.length ? Math.max(...timestamps) : validTimestamp(parsed.creationDate);
          if (indexedDate === null) {
            row.activityTimestamp = recordedDate ?? before.mtimeMs;
            row.activitySource = recordedDate === null ? 'filesystem' : 'journal';
          }
          if (parsed.rawRequests.length === 0 && !(parsed.pendingRequests?.length)
            && parsed.hasPendingEdits !== true && metadata?.hasPendingEdits !== true)
            row.visibility = { status: 'hidden', reason: 'confirmed-empty' };
        } catch (error) {
          const diagnostic: InventoryDiagnostic = {
            path: journalPath, category: 'unreadable', description: describeError(error),
          };
          row.backing = { status: 'unresolved', reason: diagnostic.description };
          row.diagnostics.push(diagnostic);
          diagnostics.push(diagnostic);
        }
      }
      if (/^\/fix(?:\s|$)/iu.test(row.title))
        row.visibility = { status: 'hidden', reason: 'fix' };
      occurrences.push(row);
    }
  }
  await resolveProviderOccurrences(occurrences, options);
  for (const row of occurrences) {
    if (row.visibility.status === 'included'
      && row.title.trim().toLowerCase() === 'new chat'
      && row.createdTimestamp === null && row.promptCount === null)
      row.visibility = { status: 'hidden', reason: 'new-chat-unknown' };
  }
  for (const row of occurrences)
    for (const diagnostic of row.diagnostics)
      !diagnostics.includes(diagnostic) && diagnostics.push(diagnostic);
  occurrences.sort((a, b) => (b.activityTimestamp ?? -Infinity) - (a.activityTimestamp ?? -Infinity)
    || a.occurrenceId.localeCompare(b.occurrenceId));
  return { userDataRoot: root, occurrences, diagnostics };
}
