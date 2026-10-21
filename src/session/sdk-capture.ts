import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SdkSelection } from './sdk-export.ts';
import { readChatIndex } from './inventory.ts';
import { readSdkEvents, childScopes } from './sdk-events.ts';
import { copilotHomeOf } from './sdk-usage.ts';
import { createSourceCacheDirectory, discardCapture } from './source-cache.ts';
import { snapshotFile, sourceStamp } from './source-snapshot.ts';
import type { SourceCopy } from './source-snapshot.ts';
import { createProviderSourceResolver } from './provider-sources.ts';

const USAGE_COLUMNS = ['id', 'session_id', 'created_at', 'agent_id', 'model', 'input_tokens', 'cache_read_tokens',
  'cache_write_tokens', 'output_tokens', 'reasoning_tokens', 'total_nano_aiu', 'duration_ms'];

/** A read transaction selects all agents of one backing, not the unrelated ledger or other tables. */
async function snapshotUsage (source: string, destination: string, sessionId: string): Promise<SourceCopy | undefined> {
  let before;
  try {
    before = await sourceStamp(source);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return undefined;
    throw error;
  }
  const copiedAt = new Date().toISOString();
  const input = new DatabaseSync(source, { readOnly: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const output = new DatabaseSync(destination);
  let missingTable = false;
  try {
    input.exec('BEGIN');
    missingTable = input.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assistant_usage_events'").get() === undefined;
    const query = missingTable ? undefined
      : input.prepare(`SELECT ${USAGE_COLUMNS.join(', ')} FROM assistant_usage_events WHERE session_id = ? ORDER BY id`);
    query?.setReadBigInts(true);
    const rows = query?.all(sessionId) ?? [];
    output.exec(`CREATE TABLE assistant_usage_events (${USAGE_COLUMNS.map((name) =>
      `${name} ${['session_id', 'created_at', 'agent_id', 'model'].includes(name) ? 'TEXT' : 'INTEGER'}`).join(', ')})`);
    output.exec('BEGIN');
    const insert = output.prepare(`INSERT INTO assistant_usage_events VALUES (${USAGE_COLUMNS.map(() => '?').join(', ')})`);
    for (const row of rows)
      insert.run(...USAGE_COLUMNS.map((key) => row[key]!));
    output.exec('COMMIT');
    input.exec('COMMIT');
  } finally {
    input.close();
    output.close();
  }
  const after = await sourceStamp(source);
  const bytes = await fs.readFile(destination);
  return { source, destination, before, after, copiedAt, size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), method: 'sqlite-rows',
    ...(missingTable ? { notices: ['The SDK usage table is absent; using recorded event usage.'] } : {}),
    changedDuringCopy: before.size !== after.size || before.mtimeMs !== after.mtimeMs, skippedTrailingRecord: false };
}

async function selectedMetadata (selection: SdkSelection) {
  const rows: Array<{ evidence: string; key: string; value: string | null }> = [];
  for (const evidence of selection.source.identityEvidence) {
    const metadata = evidence.indexOf(':session_metadata.');
    const catalog = evidence.indexOf(':session_chats.provider_data:');
    if (metadata < 0 && catalog < 0)
      continue;
    const file = evidence.slice(0, metadata >= 0 ? metadata : catalog);
    const database = new DatabaseSync(file, { readOnly: true });
    try {
      const key = metadata >= 0 ? evidence.slice(metadata + ':session_metadata.'.length)
        : evidence.slice(catalog + ':session_chats.provider_data:'.length);
      const values = metadata >= 0
        ? database.prepare('SELECT value FROM session_metadata WHERE key = ?').all(key)
        : database.prepare('SELECT provider_data AS value FROM session_chats WHERE chat_uri = ?').all(key);
      if (values.length !== 1 || (values[0]!.value !== null && typeof values[0]!.value !== 'string'))
        throw new Error('Selected provider identity changed during capture. Retry with a fresh selector.');
      const value = values[0]!.value;
      if (typeof value === 'string') {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed !== 'object' || parsed === null || !('sdkSessionId' in parsed)
          || parsed.sdkSessionId !== selection.source.sessionId)
          throw new Error('Selected provider mapping changed during capture. Retry with a fresh selector.');
      }
      rows.push({ evidence, key, value: typeof value === 'string' ? value : null });
    } finally {
      database.close();
    }
  }
  return rows;
}

export interface SdkCapture {
  directory: string;
  selection: SdkSelection;
  copy: SourceCopy;
  files: SourceCopy[];
}

/** Metadata discovery precedes this capture. Validate event identity only on the fixed copy. */
export async function snapshotSdkSelection (selection: SdkSelection): Promise<SdkCapture> {
  if (selection.source.scope.kind !== 'main')
    throw new Error('Single-chat capture requires an exact main-chat identity.');
  const directory = await createSourceCacheDirectory('cce-sources-');
  try {
    const destination = path.join(directory, 'copilot', 'session-state', selection.source.sessionId, 'events.jsonl');
    const copy = await snapshotFile(selection.source.path, destination);
    copy.captureDirectory = directory;
    const log = await readSdkEvents(destination, selection.source.sessionId);
    const resolved = await createProviderSourceResolver({
      copilotHome: copilotHomeOf(selection.source.path), identityOnly: true,
    }).resolve(selection.occurrence.sessionId, selection.source.provenance);
    if (resolved.source.sessionId !== selection.source.sessionId || resolved.source.chatIdentity !== selection.source.chatIdentity)
      throw new Error('Selected provider mapping changed during capture. Retry with a fresh selector.');
    const metadata = await selectedMetadata({ ...selection, source: resolved.source });
    const usage = await snapshotUsage(path.join(copilotHomeOf(selection.source.path), 'session-store.db'),
      path.join(directory, 'copilot', 'session-store.db'), selection.source.sessionId);
    copy.notices = usage?.notices;
    const source = { ...resolved.source, path: destination, sha256: log.sha256, producer: log.producer,
      scopeWarnings: childScopes(log.events).problems.map((problem) =>
        `${problem.reason} Affected child remains unresolved; main scope is independently verified.`) };
    const capturedSelection = { occurrence: { ...selection.occurrence, backing: { status: 'verified' as const, source } }, source };
    const result = { directory, selection: capturedSelection, copy, files: [copy, ...(usage ? [usage] : [])] };
    const index = readChatIndex(selection.occurrence.provenance.workspaceStoragePath).entries.get(selection.occurrence.sessionId);
    await fs.writeFile(path.join(directory, 'source-snapshot.json'), `${JSON.stringify({
      ...result, selectedIndex: index, identityRows: metadata, usage: usage ? 'selected rows' : 'source database absent',
    }, null, 2)}\n`);
    return result;
  } catch (error) {
    await discardCapture(directory);
    throw error;
  }
}
