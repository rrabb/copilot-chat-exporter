import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { createSourceCacheDirectory, sourceCacheRoot, discardCapture, finishCapture, registerCapture } from './source-cache.ts';
import type { SdkCapture } from './sdk-capture.ts';
import { readChatIndex } from './inventory.ts';

export interface SourceStamp { size: number; mtimeMs: number }
export interface SourceCopy {
  source: string;
  destination: string;
  copiedAt: string;
  before: SourceStamp;
  after: SourceStamp;
  size: number;
  sha256: string;
  method: 'bytes' | 'sqlite-backup' | 'sqlite-rows';
  changedDuringCopy: boolean;
  skippedTrailingRecord: boolean;
  capturedSize?: number;
  capturedSha256?: string;
  contextRoot?: string;
  contextCopies?: SourceCopy[];
  indexedTitle?: string;
  indexedMetadata?: { destination: string; sha256: string };
  notices?: string[];
  kept?: boolean;
  captureDirectory?: string;
}

export async function sourceStamp (file: string): Promise<SourceStamp> {
  const value = await fs.stat(file);
  return { size: value.size, mtimeMs: value.mtimeMs };
}

export function stampChanged (before: SourceStamp, after: SourceStamp): boolean {
  return before.size !== after.size || before.mtimeMs !== after.mtimeMs;
}

function incompleteJson (error: unknown, record: string): boolean {
  if (!(error instanceof SyntaxError))
    return false;
  return /unexpected end|unterminated string|end of json/iu.test(error.message)
    || (/bad unicode escape/iu.test(error.message) && /\\u[\da-f]{0,3}$/iu.test(record))
    || (/unterminated fractional number/iu.test(error.message) && /\d\.$/u.test(record))
    || (/exponent part is missing a number/iu.test(error.message) && /\d[eE][+-]?$/u.test(record))
    || (/no number after minus sign/iu.test(error.message) && /-$/u.test(record));
}

/** Fixed-length read: appends cannot make the copy chase a running session indefinitely. */
export async function snapshotFile (source: string, destination: string, rejectInvalidRecords = true): Promise<SourceCopy> {
  source = path.resolve(source);
  destination = path.resolve(destination);
  const before = await sourceStamp(source);
  const copiedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(destination), { recursive: true });
  if (await exists(destination))
    throw new Error('Snapshot destination already exists; existing captured data will not be overwritten.');
  const sqlite = /\.(?:db|vscdb)$/iu.test(source);
  if (sqlite) {
    const database = new DatabaseSync(source, { readOnly: true });
    try {
      await backup(database, destination);
    } finally {
      database.close();
    }
  } else {
    const input = await fs.open(source, 'r');
    try {
      const output = await fs.open(destination, 'wx');
      try {
        const buffer = Buffer.alloc(1024 * 1024);
        let offset = 0;
        while (offset < before.size) {
          const { bytesRead } = await input.read(buffer, 0, Math.min(buffer.length, before.size - offset), offset);
          if (!bytesRead)
            break;
          let written = 0;
          while (written < bytesRead) {
            const result = await output.write(buffer, written, bytesRead - written, offset + written);
            if (!result.bytesWritten)
              throw new Error('Snapshot write made no progress.');
            written += result.bytesWritten;
          }
          offset += bytesRead;
        }
      } finally {
        await output.close();
      }
    } finally {
      await input.close();
    }
  }
  const after = await sourceStamp(source);
  let bytes = await fs.readFile(destination);
  let skippedTrailingRecord = false;
  let captured: Pick<SourceCopy, 'capturedSize' | 'capturedSha256'> = {};
  if (source.endsWith('.jsonl')) {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const text = decoder.decode(bytes, { stream: true });
    let trailingEncodingError: TypeError | undefined;
    try {
      decoder.decode();
    } catch (error) {
      if (!(error instanceof TypeError))
        throw error;
      trailingEncodingError = error;
    }
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index++) {
      if (!lines[index]!.trim())
        continue;
      try {
        JSON.parse(lines[index]!);
      } catch (error) {
        const incomplete = incompleteJson(error, lines[index]!)
          && (!trailingEncodingError || (error instanceof SyntaxError && /unterminated string/iu.test(error.message)));
        if (index !== lines.length - 1 || !incomplete) {
          if (rejectInvalidRecords)
            throw new Error(`Snapshot record ${index + 1} is not valid JSON.`, { cause: error });
          continue;
        }
        captured = { capturedSize: bytes.length, capturedSha256: createHash('sha256').update(bytes).digest('hex') };
        bytes = Buffer.from(lines.slice(0, -1).join('\n') + (index ? '\n' : ''));
        await fs.writeFile(destination, bytes);
        skippedTrailingRecord = true;
      }
    }
    if (trailingEncodingError && !skippedTrailingRecord)
      throw trailingEncodingError;
  }
  return { source, destination, copiedAt, before, after, size: bytes.length, ...captured,
    sha256: createHash('sha256').update(bytes).digest('hex'), method: sqlite ? 'sqlite-backup' : 'bytes',
    changedDuringCopy: stampChanged(before, after), skippedTrailingRecord };
}

async function exists (file: string): Promise<boolean> {
  try {
    await fs.stat(file);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return false;
    throw error;
  }
}

async function snapshotTree (source: string, destination: string, files: SourceCopy[],
  accept: (relative: string) => boolean = () => true, relative = '') {
  if (!await exists(source))
    return;
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    const key = path.join(relative, entry.name);
    if (entry.isDirectory())
      await snapshotTree(from, to, files, accept, key);
    else if (entry.isFile() && accept(key) && !/-(?:wal|shm|journal)$/u.test(entry.name))
      files.push(await snapshotFile(from, to, false));
  }
}

/** Keep the journal and the supplementary inputs that enrich a Local export. */
export async function snapshotLocalInputs (source: string, indexedTitle?: string): Promise<SourceCopy> {
  source = path.resolve(source);
  const directory = await createSourceCacheDirectory('cce-local-source-');
  try {
    return await captureLocalInputs(source, indexedTitle, path.join(directory, 'workspace'));
  } catch (error) {
    await discardCapture(directory);
    throw error;
  }
}

async function captureLocalInputs (source: string, indexedTitle: string | undefined, contextRoot: string): Promise<SourceCopy> {
  const copy = await snapshotFile(source, path.join(contextRoot, 'chatSessions', path.basename(source)));
  const originalRoot = path.dirname(path.dirname(source));
  const sessionId = path.basename(source, '.jsonl');
  const contextCopies: SourceCopy[] = [];
  const selectedIndex = readChatIndex(originalRoot).entries.get(sessionId) ?? (indexedTitle ? { title: indexedTitle } : undefined);
  let indexedMetadata;
  if (selectedIndex) {
    const file = path.join(contextRoot, 'selected-index.json');
    await fs.mkdir(contextRoot, { recursive: true });
    const text = `${JSON.stringify({ sessionId, entry: selectedIndex })}\n`;
    await fs.writeFile(file, text);
    indexedMetadata = { destination: file, sha256: createHash('sha256').update(text).digest('hex') };
  }
  for (const relative of ['workspace.json',
    path.join('GitHub.copilot-chat', 'transcripts', `${sessionId}.jsonl`),
    path.join('GitHub.copilot-chat', 'debug-logs', sessionId, 'models.json')]) {
    const file = path.join(originalRoot, relative);
    if (await exists(file))
      contextCopies.push(await snapshotFile(file, path.join(contextRoot, relative), false));
  }
  const resources = path.join('GitHub.copilot-chat', 'chat-session-resources', sessionId);
  await snapshotTree(path.join(originalRoot, resources), path.join(contextRoot, resources), contextCopies);
  const memories = path.join('GitHub.copilot-chat', 'memory-tool', 'memories');
  for (const group of ['', 'repo', Buffer.from(sessionId).toString('base64')]) {
    const relative = path.join(memories, group);
    await snapshotTree(path.join(originalRoot, relative), path.join(contextRoot, relative), contextCopies,
      (file) => !file.includes(path.sep) && file.endsWith('.md'));
  }
  return { ...copy, contextRoot, contextCopies, indexedMetadata, captureDirectory: path.dirname(contextRoot),
    ...(typeof selectedIndex?.title === 'string' ? { indexedTitle: selectedIndex.title } : {}) };
}

/** Only paths read by inventory/export are copied. Symlinks and unrelated extension stores aren't followed. */
export async function snapshotUserData (root: string, home = process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot'),
  directory?: string) {
  root = path.resolve(root);
  home = path.resolve(home);
  const folder = directory ? path.resolve(directory) : await createSourceCacheDirectory('cce-sources-');
  if (directory) {
    await fs.mkdir(path.dirname(folder), { recursive: true });
    await fs.mkdir(folder);
    await registerCapture(folder, 'corpus');
  }
  const userDataRoot = path.join(folder, 'Code');
  const copilotHome = path.join(folder, 'copilot');
  const files: SourceCopy[] = [];
  async function copy (source: string, destination: string) {
    if (await exists(source))
      files.push(await snapshotFile(source, destination, false));
  }
  const tree = (source: string, destination: string, accept?: (relative: string) => boolean) =>
    snapshotTree(source, destination, files, accept);
  const workspaces = path.join(root, 'User', 'workspaceStorage');
  if (await exists(workspaces)) {
    for (const entry of await fs.readdir(workspaces, { withFileTypes: true })) {
      if (!entry.isDirectory())
        continue;
      const from = path.join(workspaces, entry.name);
      const to = path.join(userDataRoot, 'User', 'workspaceStorage', entry.name);
      await copy(path.join(from, 'state.vscdb'), path.join(to, 'state.vscdb'));
      await copy(path.join(from, 'workspace.json'), path.join(to, 'workspace.json'));
      await tree(path.join(from, 'chatSessions'), path.join(to, 'chatSessions'), (file) => !file.includes(path.sep) && file.endsWith('.jsonl'));
      for (const name of ['chat-session-resources', 'transcripts', 'memory-tool', 'debug-logs'])
        await tree(path.join(from, 'GitHub.copilot-chat', name), path.join(to, 'GitHub.copilot-chat', name),
          (file) => name !== 'debug-logs' || path.basename(file) === 'models.json');
    }
  }
  for (const name of ['state.vscdb', 'agent-host.db'])
    await copy(path.join(root, 'User', 'globalStorage', name), path.join(userDataRoot, 'User', 'globalStorage', name));
  await tree(path.join(root, 'User', 'globalStorage', 'emptyWindowChatSessions'),
    path.join(userDataRoot, 'User', 'globalStorage', 'emptyWindowChatSessions'), (file) => !file.includes(path.sep) && file.endsWith('.jsonl'));
  await tree(path.join(root, 'agentSessionData'), path.join(userDataRoot, 'agentSessionData'), (file) => path.basename(file) === 'session.db');
  await tree(path.join(home, 'session-state'), path.join(copilotHome, 'session-state'),
    (file) => ['events.jsonl', 'workspace.yaml'].includes(path.basename(file)) && file.split(path.sep).length === 2);
  await copy(path.join(home, 'session-store.db'), path.join(copilotHome, 'session-store.db'));
  await fs.mkdir(path.join(userDataRoot, 'User'), { recursive: true });
  await fs.mkdir(copilotHome, { recursive: true });
  const result = { directory: folder, userDataRoot, copilotHome, files };
  await fs.writeFile(path.join(folder, 'source-snapshot.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export type UserDataSnapshot = Awaited<ReturnType<typeof snapshotUserData>>;

export async function existingUserDataSnapshot (root: string): Promise<UserDataSnapshot | null> {
  const file = path.join(path.dirname(root), 'source-snapshot.json');
  if (!await exists(file))
    return null;
  const saved: UserDataSnapshot = JSON.parse(await fs.readFile(file, 'utf8'));
  if (path.resolve(saved.userDataRoot) !== path.resolve(root))
    throw new Error('Snapshot manifest does not match the selected user-data root.');
  return saved;
}

export async function sourceCopyForPath (file: string): Promise<SourceCopy | undefined> {
  let folder = path.dirname(file);
  while (path.dirname(folder) !== folder) {
    const manifest = path.join(folder, 'source-snapshot.json');
    if (await exists(manifest)) {
      const saved: UserDataSnapshot = JSON.parse(await fs.readFile(manifest, 'utf8'));
      const copy = saved.files.find((item) => path.resolve(item.destination) === path.resolve(file));
      return copy ? { ...copy, contextRoot: path.dirname(path.dirname(copy.destination)) } : undefined;
    }
    folder = path.dirname(folder);
  }
  return undefined;
}

export async function verifySourceCopy (copy: SourceCopy): Promise<Buffer> {
  const bytes = await fs.readFile(copy.destination);
  if (createHash('sha256').update(bytes).digest('hex') !== copy.sha256)
    throw new Error('The saved source snapshot changed. Re-export rather than substituting live data.');
  return bytes;
}

export async function readSourceCopy (copy: SourceCopy): Promise<string> {
  if (copy.indexedMetadata) {
    const bytes = await fs.readFile(copy.indexedMetadata.destination);
    if (createHash('sha256').update(bytes).digest('hex') !== copy.indexedMetadata.sha256)
      throw new Error('The saved selected index metadata changed. Re-export before verifying this file.');
  }
  for (const related of copy.contextCopies ?? [])
    await verifySourceCopy(related);
  return new TextDecoder('utf-8', { fatal: true }).decode(await verifySourceCopy(copy));
}

export function sourceCopyNotice (copy: SourceCopy | undefined): string[] {
  if (!copy)
    return [];
  const date = new Date(copy.copiedAt);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000).toISOString().slice(0, -1);
  const zone = `${offset > 0 ? '-' : '+'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
  return [
    ...(copy.notices ?? []).map((notice) => `> Snapshot notice: ${notice}`),
    ...(copy.kept ? ['> A private source copy was kept in the configured exporter cache for later file verification.'] : []),
    ...(copy.changedDuringCopy ? [`> Source changed during copy at ${local}${zone}. This archive uses the captured copy.`] : []),
    ...(copy.skippedTrailingRecord ? ['> Snapshot notice: skipped one incomplete trailing record. All preceding records were parsed normally.'] : []),
  ];
}

interface ExportCopyReceipt {
  selector: string;
  outputSha256: string | null;
  verificationFailure?: string;
  output?: string;
  status?: 'kept' | 'not-kept';
  captureDirectory?: string;
  sdk?: SdkCapture;
  root?: string;
  source?: string;
  copy?: SourceCopy;
}

const receiptFile = (output: string) => path.join(sourceCacheRoot(), 'receipts',
  `${createHash('sha256').update(path.resolve(output)).digest('hex')}.json`);

/** Private machine-local receipt. Native payloads never become Markdown companions. */
export async function saveExportCopy (output: string, receipt: Omit<ExportCopyReceipt, 'outputSha256'>) {
  const file = receiptFile(output);
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (await exists(file)) {
    const previous: ExportCopyReceipt = JSON.parse(await fs.readFile(file, 'utf8'));
    if (previous.captureDirectory && previous.captureDirectory !== receipt.captureDirectory)
      await discardCapture(previous.captureDirectory);
  }
  const outputSha256 = receipt.verificationFailure ? null : createHash('sha256').update(await fs.readFile(output)).digest('hex');
  await fs.writeFile(file, `${JSON.stringify({ ...receipt, output: path.resolve(output), outputSha256 }, null, 2)}\n`);
  if (receipt.captureDirectory)
    await finishCapture(receipt.captureDirectory, true, file);
}

export async function keepFailedExportCopy (output: string, receipt: Omit<ExportCopyReceipt, 'outputSha256' | 'status'>,
  failure: string): Promise<void> {
  if (!receipt.captureDirectory)
    throw new Error('A failed export requires its captured source directory.');
  // Keep the evidence even if writing its receipt also fails.
  await finishCapture(receipt.captureDirectory, true);
  await saveExportCopy(output, { ...receipt, status: 'kept', verificationFailure: failure });
}

export async function readExportCopy (output: string, selector: string): Promise<ExportCopyReceipt> {
  const file = receiptFile(output);
  if (!await exists(file))
    throw new Error('The saved export snapshot is unavailable. Re-export the chat before verifying this file; live sources will not be substituted.');
  const receipt: ExportCopyReceipt = JSON.parse(await fs.readFile(file, 'utf8'));
  if (receipt.selector !== selector)
    throw new Error('The saved export snapshot belongs to a different source selector.');
  if (receipt.status === 'not-kept')
    throw new Error('The source copy was not kept. Re-export with --keep-source before verifying this saved file; live sources will not be substituted.');
  if (receipt.captureDirectory && !await exists(receipt.captureDirectory))
    throw new Error('The kept source copy is unavailable. Re-export with --keep-source before verifying this saved file.');
  return receipt;
}
