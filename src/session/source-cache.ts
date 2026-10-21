import { promises as fs, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { defaultSourceCacheRoot, legacySourceCacheRoots } from './cache-paths.ts';

const OWNER_FILE = '.cce-capture.json';
const temporaryCaptures = new Map<string, string>();
const leases = new Set<string>();
process.once('exit', () => {
  for (const lease of leases)
    rmSync(lease, { force: true });
  for (const [directory, registration] of temporaryCaptures) {
    rmSync(directory, { recursive: true, force: true });
    rmSync(registration, { force: true });
  }
});
interface CaptureOwner {
  version: 1;
  id: string;
  directory: string;
  createdAt: string;
  kind: 'local' | 'sdk' | 'corpus';
  activePid: number | null;
  kept: boolean;
  receipts: string[];
}

/** One configurable location for private captures, registrations and receipts. */
export function sourceCacheRoot (): string {
  const configured = process.env.CCE_CACHE_DIR;
  if (configured !== undefined && !configured.trim())
    throw new Error('CCE_CACHE_DIR requires a nonempty directory path.');
  const defaultRoot = defaultSourceCacheRoot();
  if (process.env.NODE_TEST_CONTEXT && (!configured || path.resolve(configured) === path.resolve(defaultRoot)))
    throw new Error('Tests must set an isolated CCE_CACHE_DIR before allocating captures or receipts.');
  const directory = path.resolve(configured ?? defaultRoot);
  safeDestination(directory);
  return directory;
}

function safeDestination (directory: string): void {
  const home = path.resolve(process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot'));
  if (/(?:^|[\\/])(?:workspaceStorage|globalStorage|agentSessionData|session-state|\.copilot)(?:[\\/]|$)/iu.test(directory)
    || directory === home || inside(home, directory))
    throw new Error('Private capture destinations must be outside native session stores.');
}

export async function createSourceCacheDirectory (prefix: string): Promise<string> {
  const root = sourceCacheRoot();
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, prefix));
  await registerCapture(directory, prefix.includes('local') ? 'local' : 'sdk');
  return directory;
}

const registrationFile = (directory: string) => path.join(sourceCacheRoot(), 'registrations',
  `${createHash('sha256').update(path.resolve(directory)).digest('hex')}.json`);

function inside (root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function noLinks (directory: string): Promise<void> {
  let current = path.resolve(directory);
  for (;;) {
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink())
      throw new Error('Cache operations refuse symbolic links and junctions.');
    const parent = path.dirname(current);
    if (parent === current)
      break;
    current = parent;
  }
}

export async function registerCapture (directory: string, kind: CaptureOwner['kind']): Promise<void> {
  directory = path.resolve(directory);
  safeDestination(directory);
  await noLinks(directory);
  const owner: CaptureOwner = { version: 1, id: randomUUID(), directory, kind,
    createdAt: new Date().toISOString(), activePid: process.pid, kept: false, receipts: [] };
  await fs.writeFile(path.join(directory, OWNER_FILE), `${JSON.stringify(owner)}\n`, { flag: 'wx' });
  const registration = registrationFile(directory);
  await fs.mkdir(path.dirname(registration), { recursive: true });
  await fs.writeFile(registration, `${JSON.stringify({ directory, id: owner.id })}\n`, { flag: 'wx' });
  temporaryCaptures.set(directory, registration);
}

async function captureOwner (directory: string): Promise<CaptureOwner> {
  directory = path.resolve(directory);
  await noLinks(directory);
  const marker = path.join(directory, OWNER_FILE);
  await noLinks(marker);
  const owner: CaptureOwner = JSON.parse(await fs.readFile(marker, 'utf8'));
  const registration = registrationFile(directory);
  await noLinks(registration);
  const registered: { directory: string; id: string } = JSON.parse(await fs.readFile(registration, 'utf8'));
  if (owner.version !== 1 || owner.directory !== directory || registered.directory !== directory
    || owner.id !== registered.id || !Array.isArray(owner.receipts)
    || !['local', 'sdk', 'corpus'].includes(owner.kind) || !Number.isFinite(Date.parse(owner.createdAt))
    || (owner.kind !== 'corpus' && !inside(sourceCacheRoot(), directory)))
    throw new Error('Capture ownership does not match its cache registration.');
  return owner;
}

export async function finishCapture (directory: string, kept: boolean, receipt?: string): Promise<void> {
  const owner = await captureOwner(directory);
  owner.activePid = null;
  owner.kept = kept;
  if (receipt && !owner.receipts.includes(receipt))
    owner.receipts.push(receipt);
  await fs.writeFile(path.join(directory, OWNER_FILE), `${JSON.stringify(owner)}\n`);
  kept && temporaryCaptures.delete(path.resolve(directory));
}

export async function keepCaptureDuringFailure (directory: string): Promise<void> {
  const owner = await captureOwner(directory);
  owner.kept = true;
  owner.activePid = process.pid;
  await fs.writeFile(path.join(directory, OWNER_FILE), `${JSON.stringify(owner)}\n`);
  temporaryCaptures.delete(path.resolve(directory));
}

async function leased (directory: string): Promise<boolean> {
  for (const name of await fs.readdir(directory)) {
    const match = /^\.cce-lease-(\d+)-/u.exec(name);
    if (match && running(Number(match[1])))
      return true;
  }
  return false;
}

export async function leaseCapture (directory: string): Promise<() => Promise<void>> {
  await captureOwner(directory);
  const lease = path.join(directory, `.cce-lease-${process.pid}-${randomUUID()}`);
  const deleting = path.join(directory, '.cce-deleting');
  const release = async () => {
    await fs.rm(lease, { force: true });
    leases.delete(lease);
  };
  await fs.writeFile(lease, '', { flag: 'wx' });
  leases.add(lease);
  try {
    try {
      await fs.stat(deleting);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return release;
      throw error;
    }
    throw new Error('Source capture cleanup is in progress. Retry after re-exporting.');
  } catch (error) {
    await release();
    throw error;
  }
}

function running (pid: number | null): boolean {
  if (pid === null)
    return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH')
      return false;
    throw error;
  }
}

async function treeSize (directory: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error('Cache capture contains a link; cleanup refused.');
    if (entry.isDirectory()) {
      const size = await treeSize(file);
      bytes += size.bytes;
      files += size.files;
    } else if (entry.isFile()) {
      bytes += (await fs.stat(file)).size;
      files++;
    } else {
      throw new Error('Cache capture contains an unsupported filesystem entry.');
    }
  }
  return { bytes, files };
}

/** Exact registered directory only. Never removes borrowed snapshots or native input paths. */
export async function discardCapture (directory: string): Promise<number> {
  const owner = await captureOwner(directory);
  const deleting = path.join(directory, '.cce-deleting');
  await fs.writeFile(deleting, '', { flag: 'wx' });
  try {
    if ((owner.activePid !== process.pid && running(owner.activePid)) || await leased(directory))
      throw new Error('The source capture is in use; cleanup refused.');
    const { bytes } = await treeSize(directory);
    for (const receipt of owner.receipts) {
      if (!inside(path.join(sourceCacheRoot(), 'receipts'), receipt))
        throw new Error('Capture receipt lies outside the configured receipt store.');
      await noLinks(receipt);
    }
    for (const receipt of owner.receipts)
      await fs.rm(receipt);
    await fs.rm(directory, { recursive: true });
    await fs.rm(registrationFile(directory));
    temporaryCaptures.delete(path.resolve(directory));
    return bytes;
  } finally {
    await fs.rm(deleting, { force: true });
  }
}

export interface CacheEntry {
  ownerId: string;
  directory: string;
  kind: CaptureOwner['kind'];
  createdAt: string;
  bytes: number;
  files: number;
  receipts: string[];
  active: boolean;
  kept: boolean;
  outputs: string[];
}

export async function listSourceCache (): Promise<CacheEntry[]> {
  const folder = path.join(sourceCacheRoot(), 'registrations');
  let entries;
  try {
    entries = await fs.readdir(folder);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return [];
    throw error;
  }
  await noLinks(folder);
  const results: CacheEntry[] = [];
  for (const entry of entries) {
    const registration = path.join(folder, entry);
    await noLinks(registration);
    const registered: { directory: string } = JSON.parse(await fs.readFile(registration, 'utf8'));
    const owner = await captureOwner(registered.directory);
    const size = await treeSize(owner.directory);
    const outputs: string[] = [];
    for (const receipt of owner.receipts) {
      if (!inside(path.join(sourceCacheRoot(), 'receipts'), receipt))
        throw new Error('Capture receipt lies outside the configured receipt store.');
      await noLinks(receipt);
      const value: { output?: string } = JSON.parse(await fs.readFile(receipt, 'utf8'));
      value.output && outputs.push(value.output);
    }
    results.push({ ownerId: owner.id, directory: owner.directory, kind: owner.kind, createdAt: owner.createdAt, ...size,
      receipts: owner.receipts, outputs, active: running(owner.activePid) || await leased(owner.directory), kept: owner.kept });
  }

  return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function sourceCacheSize () {
  const root = sourceCacheRoot();
  const entries = await listSourceCache();
  const size = await fs.stat(root).then(() => treeSize(root), (error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return { bytes: 0, files: 0 };
    throw error;
  });
  const external = entries.filter((entry) => !inside(root, entry.directory)).reduce((sum, entry) => sum + entry.bytes, 0);
  return { ...size, externalSnapshotBytes: external, totalBytes: size.bytes + external };
}

export async function legacySourceCacheSizes () {
  const roots = [...legacySourceCacheRoots()];
  for (const entry of await fs.readdir(os.tmpdir(), { withFileTypes: true }))
    if (entry.isDirectory() && /^cce-(?:local-source-|sources-|export-snapshots$)/u.test(entry.name))
      roots.push(path.join(os.tmpdir(), entry.name));
  const results = [];
  for (const directory of roots) {
    try {
      await noLinks(directory);
      results.push({ directory, ...await treeSize(directory) });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
        throw error;
    }
  }
  return results;
}

export async function cleanSourceCache (options: {
  olderThanDays?: number; dryRun?: boolean; yes?: boolean; includeCorpus?: boolean;
  targets?: CacheEntry[];
} = {}) {
  const days = options.olderThanDays ?? 0;
  if (!Number.isFinite(days) || days < 0)
    throw new Error('--older-than requires a nonnegative number of days.');
  const cutoff = Date.now() - days * 86_400_000;
  const entries = await listSourceCache();
  const selected = entries.filter((entry) => entry.kept && !entry.active && Date.parse(entry.createdAt) <= cutoff
    && (entry.kind !== 'corpus' || options.includeCorpus)
    && (!options.targets || options.targets.some((target) => target.directory === entry.directory && target.ownerId === entry.ownerId)));
  let freedBytes = 0;
  if (options.yes && !options.dryRun)
    for (const entry of selected) {
      const owner = await captureOwner(entry.directory);
      if (owner.id !== entry.ownerId || !owner.kept || running(owner.activePid) || await leased(entry.directory))
        throw new Error('The source capture changed or is in use; cleanup refused.');
      freedBytes += await discardCapture(entry.directory);
    }
  return { entries, selected, freedBytes, dryRun: options.dryRun === true || !options.yes };
}
