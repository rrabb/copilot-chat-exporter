import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SessionOccurrence } from './sources.ts';
import type { ListingEvidence } from './listing-evidence-types.ts';
import { groupOccurrences } from './listing-model.ts';

export interface StoragePart { name: string; bytes: number; count?: number }
export interface StorageArtifact {
  path: string;
  kind: string;
  state: 'present' | 'missing' | 'unreadable' | 'changed';
  bytes: number | null;
  files: number | null;
  modified: number | null;
  parts: StoragePart[];
  measurement: string;
  diagnostic?: string;
  sharedBy?: { occurrences: number; conversations: number };
  database?: { logicalBytes: number; freeBytes: number; allocatedBytes: number; keys: number };
}

const describe = (error: unknown) => error instanceof Error ? error.message : String(error);
const missing = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT';
async function fileStamp (file: string): Promise<string | null> {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile())
      throw new Error(`Storage sidecar is not a regular file: ${file}`);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch (error) {
    if (missing(error))
      return null;
    throw error;
  }
}
const number = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Storage measurement is not a non-negative safe integer.');
  return value;
};

function databaseComposition (file: string, artifact: StorageArtifact): void {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 1000');
    db.exec('BEGIN');
    const pageSize = number(db.prepare('PRAGMA page_size').get()?.page_size);
    const pages = number(db.prepare('PRAGMA page_count').get()?.page_count);
    const free = number(db.prepare('PRAGMA freelist_count').get()?.freelist_count);
    artifact.parts = [
      { name: 'Free SQLite pages', bytes: free * pageSize },
      { name: 'Allocated SQLite pages (includes data, indexes and overhead)', bytes: (pages - free) * pageSize },
    ];
    const itemTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'").get();
    if (itemTable) {
      const total = db.prepare('SELECT COUNT(*) AS keys, COALESCE(SUM(length(CAST(value AS BLOB))),0) AS bytes FROM ItemTable').get();
      const values = db.prepare('SELECT key, length(CAST(value AS BLOB)) AS bytes FROM ItemTable ORDER BY bytes DESC LIMIT 8').all();
      artifact.database = { logicalBytes: number(total?.bytes), keys: number(total?.keys), freeBytes: free * pageSize, allocatedBytes: (pages - free) * pageSize };
      artifact.parts.push(...values.map((row) => ({ name: `Stored value: ${String(row.key)}`, bytes: number(row.bytes) })));
      const index = db.prepare('SELECT length(CAST(value AS BLOB)) AS bytes FROM ItemTable WHERE key=?').get('chat.ChatSessionStore.index');
      if (index && !values.some((row) => row.key === 'chat.ChatSessionStore.index'))
        artifact.parts.push({ name: 'Stored value: chat.ChatSessionStore.index', bytes: number(index.bytes) });
    }
    artifact.measurement = 'SQLite page counts describe the database, including WAL-visible pages. Stored-value UTF-8/blob bytes are a separate logical measure, not additive to page bytes. The physical file can differ while VS Code is running.';
  } finally {
    db.close();
  }
}

async function jsonlComposition (file: string, artifact: StorageArtifact): Promise<void> {
  const parts = new Map<string, StoragePart>();
  let fragments: Buffer[] = [];
  const record = (line: Buffer, separator: number) => {
    let name = 'Blank lines';
    if (line.length) {
      try {
        const value: unknown = JSON.parse(line.toString('utf8'));
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const row = value as Record<string, unknown>;
          name = typeof row.type === 'string' ? row.type : typeof row.kind === 'string' ? row.kind
            : row.kind === 0 ? 'Journal snapshot' : row.kind === 1 ? 'Journal set mutation'
              : row.kind === 2 ? 'Journal push / truncate mutation'
                : row.kind === 3 ? 'Journal delete mutation' : 'Unclassified record';
        } else {
          name = 'Unclassified record';
        }
      } catch {
        name = 'Invalid JSON record';
      }
    }
    const part = parts.get(name) ?? { name, bytes: 0, count: 0 };
    part.bytes += line.length + separator;
    part.count = (part.count ?? 0) + 1;
    parts.set(name, part);
  };
  for await (const chunk of createReadStream(file)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let offset = 0;
    let end: number;
    while ((end = bytes.indexOf(10, offset)) !== -1) {
      fragments.push(bytes.subarray(offset, end));
      record(fragments.length === 1 ? fragments[0]! : Buffer.concat(fragments), 1);
      fragments = [];
      offset = end + 1;
    }
    offset < bytes.length && fragments.push(bytes.subarray(offset));
  }
  fragments.length && record(Buffer.concat(fragments), 0);
  artifact.parts = [...parts.values()].sort((a, b) => b.bytes - a.bytes);
  const invalid = parts.get('Invalid JSON record');
  invalid && (artifact.diagnostic = `${invalid.count} invalid JSON records found during composition analysis; conversation parsing is a separate check.`);
  artifact.measurement = 'Whole-file bytes grouped by recorded type/kind, including line separators. Categories are storage record types, not inferred prompt/response ownership.';
}

async function inspect (file: string): Promise<StorageArtifact> {
  const artifact: StorageArtifact = { path: file, kind: path.basename(file), state: 'missing', bytes: null, files: null, modified: null, parts: [], measurement: '' };
  try {
    const before = await fs.lstat(file);
    if (before.isSymbolicLink())
      throw new Error('Storage link not followed; size is unknown.');
    artifact.state = 'present';
    artifact.modified = before.mtimeMs;
    if (before.isDirectory()) {
      const stamps = new Map<string, { size: number; modified: number; directory: boolean }>();
      stamps.set(file, { size: before.size, modified: before.mtimeMs, directory: true });
      const length = async (child: string): Promise<number> => {
        const stat = await fs.lstat(child);
        if (!stat.isFile())
          throw new Error(`Artifact is not a regular file: ${child}`);
        stamps.set(child, { size: stat.size, modified: stat.mtimeMs, directory: false });
        return stat.size;
      };
      const walk = async (folder: string): Promise<{ bytes: number; files: number }> => {
        const stat = await fs.lstat(folder);
        if (!stat.isDirectory() || stat.isSymbolicLink())
          throw new Error(`Artifact is not a regular directory: ${folder}`);
        stamps.set(folder, { size: stat.size, modified: stat.mtimeMs, directory: true });
        let bytes = 0;
        let files = 0;
        for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
          const child = path.join(folder, entry.name);
          if (entry.isSymbolicLink())
            throw new Error(`Storage link not followed: ${child}`);
          if (entry.isDirectory()) {
            const result = await walk(child);
            bytes += result.bytes;
            files += result.files;
          } else if (entry.isFile()) {
            bytes += await length(child);
            files++;
          }
        }
        return { bytes, files };
      };
      for (const entry of await fs.readdir(file, { withFileTypes: true })) {
        const child = path.join(file, entry.name);
        if (entry.isSymbolicLink())
          throw new Error(`Storage link not followed: ${child}`);
        const size = entry.isDirectory() ? await walk(child) : { bytes: await length(child), files: 1 };
        artifact.parts.push({ name: entry.name, bytes: size.bytes, count: size.files });
      }
      artifact.bytes = artifact.parts.reduce((sum, part) => sum + part.bytes, 0);
      artifact.files = artifact.parts.reduce((sum, part) => sum + (part.count ?? 0), 0);
      artifact.parts.sort((a, b) => b.bytes - a.bytes);
      artifact.measurement = 'Sum of regular file lengths, grouped by immediate child; not allocated disk space. Live folder contents can change during enumeration.';
      for (const [child, stamp] of stamps) {
        const after = await fs.lstat(child);
        if (after.size !== stamp.size || after.mtimeMs !== stamp.modified
          || (stamp.directory ? !after.isDirectory() : !after.isFile()) || after.isSymbolicLink()) {
          artifact.state = 'changed';
          artifact.parts = [];
          artifact.diagnostic = 'Directory content changed during analysis; composition omitted. This is not an atomic filesystem snapshot.';
          break;
        }
      }
    } else {
      if (!before.isFile())
        throw new Error('Storage artifact is not a regular file or directory.');
      artifact.bytes = before.size;
      artifact.files = 1;
      artifact.measurement = 'Physical file length at collection time.';
      const isDatabase = /\.(?:db|vscdb)$/iu.test(file);
      const walBefore = isDatabase ? await fileStamp(`${file}-wal`) : null;
      /\.jsonl$/iu.test(file) && await jsonlComposition(file, artifact);
      isDatabase && databaseComposition(file, artifact);
      const after = await fs.stat(file);
      const walAfter = isDatabase ? await fileStamp(`${file}-wal`) : null;
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || walBefore !== walAfter) {
        artifact.state = 'changed';
        artifact.parts = [];
        delete artifact.database;
        artifact.diagnostic = 'File or SQLite WAL changed during storage analysis; composition omitted. Refresh for a stable measurement.';
      }
    }
  } catch (error) {
    artifact.state = missing(error) ? 'missing' : 'unreadable';
    artifact.diagnostic = describe(error);
    artifact.parts = [];
    delete artifact.database;
  }
  return artifact;
}

/** Collect each unique artifact once; renderers never access the filesystem. */
export async function collectListingStorage (occurrences: readonly SessionOccurrence[], evidence: Map<string, ListingEvidence>): Promise<void> {
  const cache = new Map<string, Promise<StorageArtifact>>();
  const groups = groupOccurrences(occurrences);
  const groupKey = new Map(groups.flatMap((group) => group.occurrences.map((row) => [row.occurrenceId, group.key] as const)));
  const owners = new Map<string, { occurrences: Set<string>; conversations: Set<string> }>();
  for (const row of occurrences) {
    const data = evidence.get(row.occurrenceId);
    if (!data)
      continue;
    const workspace = row.provenance.workspaceStoragePath;
    const paths = new Set([path.join(workspace, 'workspace.json'), path.join(workspace, 'state.vscdb')]);
    data.artifactLocations.forEach((item) => paths.add(item.path));
    data.artifacts.forEach((item) => paths.add(item.path));
    data.history.path && paths.add(data.history.path);
    if (row.backing.status === 'verified') {
      const source = row.backing.source;
      paths.add(source.path);
      if (source.kind === 'sdk-events') {
        for (const item of source.identityEvidence) {
          const match = item.match(/^(.+?\.(?:db|vscdb))(?::|$)/iu);
          match && paths.add(match[1]!);
        }
        // Only the recorded identity route is shown as evidence, not a guessed database chain.
        const folder = path.dirname(source.path);
        try {
          for (const entry of await fs.readdir(folder))
            paths.add(path.join(folder, entry));
        } catch (error) {
          data.diagnostics.push({ path: folder, description: `SDK artifact enumeration: ${describe(error)}` });
        }
      }
    }
    for (const file of [...paths].filter((file) => /\.(?:db|vscdb)$/iu.test(file))) {
      for (const suffix of ['-wal', '-shm', '.backup']) {
        const sidecar = `${file}${suffix}`;
        try {
          await fs.lstat(sidecar);
          paths.add(sidecar);
        } catch (error) {
          !missing(error) && data.diagnostics.push({ path: sidecar, description: `Database sidecar inspection: ${describe(error)}` });
        }
      }
    }
    data.storage = [];
    for (const file of paths) {
      let task = cache.get(file);
      if (!task) {
        task = inspect(file);
        cache.set(file, task);
      }
      const artifact = await task;
      const location = data.artifactLocations.find((item) => item.path === file);
      data.storage.push(location ? { ...artifact, kind: location.kind } : artifact);
      artifact.diagnostic && artifact.state !== 'missing' && data.diagnostics.push({ path: file, description: artifact.diagnostic });
      const owner = owners.get(file) ?? { occurrences: new Set<string>(), conversations: new Set<string>() };
      owner.occurrences.add(row.occurrenceId);
      owner.conversations.add(groupKey.get(row.occurrenceId)!);
      owners.set(file, owner);
    }
  }
  for (const data of evidence.values()) {
    for (const item of data.storage ?? []) {
      const owner = owners.get(item.path)!;
      item.sharedBy = { occurrences: owner.occurrences.size, conversations: owner.conversations.size };
    }
  }
}
