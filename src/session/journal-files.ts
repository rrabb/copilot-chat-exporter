import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { InventoryDiagnostic } from './sources.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ListedJournalFile {
  sessionId: string;
  path: string;
  mtimeMs: number;
}

function missingPath (error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function describeError (error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Enumerates UUID-named journal files with readable stats. A failed file check hides that one UUID. */
export async function listJournalFiles (directory: string): Promise<{
  files: ListedJournalFile[];
  diagnostics: InventoryDiagnostic[];
}> {
  const files: ListedJournalFile[] = [];
  const diagnostics: InventoryDiagnostic[] = [];
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (!missingPath(error)) {
      diagnostics.push({
        path: directory,
        category: 'unreadable',
        description: describeError(error),
        affectsCandidateDiscovery: true,
      });
    }
    return { files, diagnostics };
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl'))
      continue;
    const sessionId = entry.name.slice(0, -6);
    if (!UUID.test(sessionId))
      continue;
    const filePath = path.join(directory, entry.name);
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile())
        files.push({ sessionId, path: filePath, mtimeMs: stat.mtimeMs });
    } catch (error) {
      diagnostics.push({
        path: filePath,
        category: 'unreadable',
        description: describeError(error),
        affectsCandidateDiscovery: true,
        hidesSessionId: sessionId,
      });
    }
  }
  return { files, diagnostics };
}