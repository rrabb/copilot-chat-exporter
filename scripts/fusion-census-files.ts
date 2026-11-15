import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { censusSource, LIMITATIONS, object, WINDOW_END, WINDOW_START } from './fusion-census.ts';
import type { Diagnostic, EventInventory, FieldInventory, SourceCensus } from './fusion-census.ts';

type Read = (file: string) => Promise<Buffer>;
interface ReadOptions {
  attempts?: number;
  read?: Read;
}

interface Fingerprint {
  device: string;
  inode: string;
  bytes: number;
  modifiedNs: string;
  changedNs: string;
}

export interface StableCapture {
  bytes: Buffer;
  sha256: string;
  stable: boolean;
  attempts: number;
  fingerprint: Fingerprint;
}

interface RootDiscovery {
  root: string;
  status: 'complete' | 'empty' | 'missing' | 'unreadable' | 'partial';
  files: number;
  excludedDirectories: number;
  diagnostics: Diagnostic[];
}

interface SourceReport {
  label: string;
  /** Describes source reading and stability, not whether bytes were kept on disk. */
  state: 'captured' | 'unstable' | 'unreadable' | 'hash-mismatch';
  sha256: string | null;
  bytes: number | null;
  analysis: SourceCensus | null;
  diagnostics: Diagnostic[];
}

interface ManifestSource {
  sourcePath: string;
  frozenFile: string | null;
  capture: { attempts: number; fingerprint: Fingerprint } | null;
  report: SourceReport;
}

interface SourceLines {
  source: string;
  lines: number[];
}

interface CombinedField extends Omit<FieldInventory, 'lines' | 'values'> {
  sources: SourceLines[];
  values: { value: string | number | boolean; occurrences: number; sources: SourceLines[] }[];
}

interface CombinedInventory extends Omit<EventInventory, 'lines' | 'fields'> {
  sources: SourceLines[];
  fields: CombinedField[];
}

export interface CensusReport {
  format: 1;
  window: { start: string; end: string; endpoints: 'inclusive' };
  /** Inventory coverage, independent of whether event bytes were kept for replay. */
  status: 'complete' | 'partial';
  inventoryStatus: 'complete' | 'partial';
  retention: { mode: 'freeze-selected' | 'inventory-only'; replayable: boolean };
  discovery: RootDiscovery[];
  sources: SourceReport[];
  /** Physical source counts, including exact-byte copies. Never a deduplicated history or usage total. */
  inventory: CombinedInventory[];
  candidateInventory: CombinedInventory[];
  duplicates: { sha256: string; labels: string[] }[];
  summary: {
    physicalSources: number;
    qualifiedSources: number;
    contextCandidates: number;
    unknownCandidates: number;
    uniqueQualifiedHashes: number;
    unreadableSources: number;
    unstableSources: number;
    unverifiedFrozenSources: number;
    sourcesWithIncompleteRecordCounts: number;
    sourcesWithIncompleteWindowCounts: number;
    incompleteRoots: number;
  };
  limitations: readonly string[];
}

export interface CaptureOptions {
  sourceRoots: string[];
  outputDirectory: string;
  inventoryOnly?: boolean;
  read?: Read;
}

export interface ReplayOptions {
  frozenDirectory: string;
  outputDirectory: string;
}

export interface InventoryReportFile {
  file: 'report.private.json.gz';
  compression: 'gzip';
  bytes: number;
  sha256: string;
  uncompressedBytes: number;
  uncompressedSha256: string;
}

export interface InventoryManifestMetadata {
  inventoryStatus: CensusReport['inventoryStatus'];
  window: CensusReport['window'];
  sources: {
    label: string;
    sourcePath: string;
    sha256: string | null;
    bytes: number | null;
    capture: ManifestSource['capture'];
  }[];
  provenance: Record<string, unknown>;
}

export interface InventorySaveOptions {
  report: CensusReport;
  manifestMetadata: InventoryManifestMetadata;
  outputDirectory: string;
  inputDirectory?: string;
}

class PathProblem extends Error {
  code: string;
  constructor (code: string) {
    super(code);
    this.code = code;
  }
}

function errorCode (error: unknown): string {
  if (object(error) && typeof error.code === 'string')
    return error.code;
  throw error;
}

export function sha256 (bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Check every path component, including an ancestor junction supplied as the root. */
async function noLinks (file: string, allowMissing = false) {
  const absolute = path.resolve(file);
  const root = path.parse(absolute).root;
  const parts = absolute.slice(root.length).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink())
        throw new PathProblem('symlink');
    } catch (error) {
      if (allowMissing && errorCode(error) === 'ENOENT')
        return;
      throw error;
    }
  }
}

async function fingerprint (file: string): Promise<Fingerprint> {
  await noLinks(file);
  const stat = await fs.lstat(file, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new PathProblem('not-regular-file');
  if (stat.size > BigInt(Number.MAX_SAFE_INTEGER))
    throw new PathProblem('file-too-large');
  return {
    device: String(stat.dev), inode: String(stat.ino), bytes: Number(stat.size),
    modifiedNs: String(stat.mtimeNs), changedNs: String(stat.ctimeNs),
  };
}

export async function stableRead (file: string, options: ReadOptions = {}): Promise<StableCapture> {
  const attempts = options.attempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5)
    throw new Error('Capture attempts must be an integer from 1 to 5.');
  const read = options.read ?? (fileName => fs.readFile(fileName));
  let last: StableCapture | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const before = await fingerprint(file);
    const first = await read(file);
    const middle = await fingerprint(file);
    const second = await read(file);
    const after = await fingerprint(file);
    const hash = sha256(second);
    const stable = JSON.stringify(before) === JSON.stringify(middle) && JSON.stringify(middle) === JSON.stringify(after)
      && first.length === after.bytes && second.length === after.bytes && sha256(first) === hash;
    last = { bytes: second, sha256: hash, stable, attempts: attempt, fingerprint: after };
    if (stable)
      return last;
  }
  if (!last)
    throw new Error('No capture attempt was made.');
  return last;
}

async function discover (root: string): Promise<{ discovery: RootDiscovery; files: string[] }> {
  const discovery: RootDiscovery = { root, status: 'complete', files: 0, excludedDirectories: 0, diagnostics: [] };
  const files: string[] = [];
  try {
    await noLinks(root);
    const stat = await fs.lstat(root);
    if (!stat.isDirectory())
      throw new PathProblem('not-directory');
    const entries = await fs.readdir(root, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        discovery.diagnostics.push({ code: 'symlink', detail: entry.name });
        discovery.status = 'partial';
        continue;
      }
      if (!entry.isDirectory())
        continue;
      const file = path.join(root, entry.name, 'events.jsonl');
      try {
        await noLinks(file);
        const stat = await fs.lstat(file);
        if (!stat.isFile())
          throw new PathProblem('not-regular-file');
        files.push(file);
      } catch (error) {
        const code = errorCode(error);
        if (code === 'ENOENT') {
          discovery.excludedDirectories++;
          continue;
        }
        discovery.status = 'partial';
        discovery.diagnostics.push({ code, detail: file });
      }
    }
    discovery.files = files.length;
    if (!files.length && discovery.status === 'complete')
      discovery.status = 'empty';
  } catch (error) {
    const code = errorCode(error);
    discovery.status = code === 'ENOENT' ? 'missing' : 'unreadable';
    discovery.diagnostics.push({ code, detail: root });
  }
  return { discovery, files };
}

function isWithin (parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function prepareOutput (directory: string, inputs: string[]) {
  const output = path.resolve(directory);
  const privateRoot = path.resolve('temp-tool-output', '261114-0030-fusion-census');
  if (!isWithin(privateRoot, output))
    throw new Error('Output must be under temp-tool-output\\261114-0030-fusion-census.');
  for (const input of inputs) {
    if (isWithin(input, output) || isWithin(output, input))
      throw new Error('Input and output directories must not contain each other.');
  }
  await noLinks(output, true);
  await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  await noLinks(path.dirname(output));
  await fs.mkdir(output, { mode: 0o700 });
  await fs.mkdir(path.join(output, 'frozen'), { mode: 0o700 });
  return output;
}

function combineInventory (sources: SourceReport[]): CombinedInventory[] {
  const groups = new Map<string, { event: CombinedInventory; fields: Map<string, CombinedField> }>();
  for (const source of sources) {
    for (const inventory of source.analysis?.inventory ?? []) {
      const key = JSON.stringify([inventory.period, inventory.type]);
      let group = groups.get(key);
      if (!group) {
        group = {
          event: { period: inventory.period, type: inventory.type, events: 0, sources: [], fields: [] },
          fields: new Map(),
        };
        groups.set(key, group);
      }
      group.event.events += inventory.events;
      group.event.sources.push({ source: source.label, lines: inventory.lines });
      for (const field of inventory.fields) {
        let combined = group.fields.get(field.path);
        if (!combined) {
          combined = {
            path: field.path, eventsPresent: 0, missingEvents: 0, occurrences: 0, types: {},
            zeroOccurrences: 0, emptyStringOccurrences: 0, emptyArrayOccurrences: 0, emptyObjectOccurrences: 0,
            sources: [], values: [], omittedValueOccurrences: 0,
          };
          group.fields.set(field.path, combined);
        }
        combined.eventsPresent += field.eventsPresent;
        combined.occurrences += field.occurrences;
        combined.zeroOccurrences += field.zeroOccurrences;
        combined.emptyStringOccurrences += field.emptyStringOccurrences;
        combined.emptyArrayOccurrences += field.emptyArrayOccurrences;
        combined.emptyObjectOccurrences += field.emptyObjectOccurrences;
        combined.omittedValueOccurrences += field.omittedValueOccurrences;
        combined.sources.push({ source: source.label, lines: field.lines });
        for (const [type, count] of Object.entries(field.types))
          combined.types[type] = (combined.types[type] ?? 0) + count;
        for (const observed of field.values) {
          const existing = combined.values.find(item => item.value === observed.value);
          if (existing) {
            existing.occurrences += observed.occurrences;
            existing.sources.push({ source: source.label, lines: observed.lines });
          } else if (combined.values.length < 100) {
            combined.values.push({
              value: observed.value, occurrences: observed.occurrences,
              sources: [{ source: source.label, lines: observed.lines }],
            });
          } else {
            combined.omittedValueOccurrences += observed.occurrences;
          }
        }
      }
    }
  }
  return [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, group]) => ({
    ...group.event,
    fields: [...group.fields.values()].map(field => ({
      ...field,
      missingEvents: group.event.events - field.eventsPresent,
      types: Object.fromEntries(Object.entries(field.types).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
    })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  }));
}

function makeReport (
  discovery: RootDiscovery[],
  sources: SourceReport[],
  retentionMode: CensusReport['retention']['mode'] = 'freeze-selected',
): CensusReport {
  const hashes = new Map<string, string[]>();
  const qualifiedHashes = new Set<string>();
  for (const source of sources) {
    if (source.sha256 && (source.state === 'captured' || source.state === 'unstable')) {
      const labels = hashes.get(source.sha256) ?? [];
      labels.push(source.label);
      hashes.set(source.sha256, labels);
      source.analysis?.selection === 'qualified' && qualifiedHashes.add(source.sha256);
    }
  }
  const count = (selection: SourceCensus['selection']) => sources.filter(item => item.analysis?.selection === selection).length;
  const partial = discovery.some(item => item.status !== 'complete' && item.status !== 'empty')
    || sources.some(item => item.state !== 'captured' || item.analysis?.status === 'partial');
  const inventoryStatus = partial ? 'partial' : 'complete';
  return {
    format: 1,
    window: { start: WINDOW_START, end: WINDOW_END, endpoints: 'inclusive' },
    status: inventoryStatus,
    inventoryStatus,
    retention: {
      mode: retentionMode,
      replayable: retentionMode === 'freeze-selected' && !sources.some(source => source.state === 'hash-mismatch'),
    },
    discovery, sources,
    inventory: combineInventory(sources.filter(source => source.analysis?.selection === 'qualified')),
    candidateInventory: combineInventory(sources.filter(source => source.analysis
      && source.analysis.selection !== 'qualified' && source.analysis.selection !== 'not-selected')),
    duplicates: [...hashes].filter(([, labels]) => labels.length > 1).map(([hash, labels]) => ({ sha256: hash, labels })),
    summary: {
      physicalSources: sources.length,
      qualifiedSources: count('qualified'),
      contextCandidates: count('context-candidate'),
      unknownCandidates: count('unknown-candidate'),
      uniqueQualifiedHashes: qualifiedHashes.size,
      unreadableSources: sources.filter(item => item.state === 'unreadable').length,
      unstableSources: sources.filter(item => item.state === 'unstable').length,
      unverifiedFrozenSources: sources.filter(item => item.state === 'hash-mismatch').length,
      sourcesWithIncompleteRecordCounts: sources.filter(item => item.analysis === null
        || item.analysis.counts.malformed > 0 || item.analysis.diagnostics.some(problem => problem.code === 'utf8')).length,
      sourcesWithIncompleteWindowCounts: sources.filter(item => item.analysis === null
        || item.analysis.counts.malformed > 0 || item.analysis.counts.unknownTime > 0).length,
      incompleteRoots: discovery.filter(item => item.status !== 'complete' && item.status !== 'empty').length,
    },
    limitations: LIMITATIONS,
  };
}

async function writeJson (file: string, value: unknown) {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}

// Escape bounded pieces without splitting a surrogate pair across UTF-8 stream chunks.
function* stringTokens (value: string): Generator<string> {
  yield '"';
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + 65_536, value.length);
    if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff
      && value.charCodeAt(end) >= 0xdc00 && value.charCodeAt(end) <= 0xdfff)
      end--;
    yield JSON.stringify(value.slice(start, end)).slice(1, -1);
    start = end;
  }
  yield '"';
}

function* jsonTokens (value: unknown, depth = 0): Generator<string> {
  if (typeof value === 'string') {
    yield* stringTokens(value);
  } else if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    yield JSON.stringify(value);
  } else if (Array.isArray(value)) {
    yield '[';
    for (let index = 0; index < value.length; index++) {
      yield (index ? ',\n' : '\n') + '  '.repeat(depth + 1);
      yield* jsonTokens(value[index] === undefined ? null : value[index], depth + 1);
    }
    if (value.length)
      yield '\n' + '  '.repeat(depth);
    yield ']';
  } else if (object(value)) {
    yield '{';
    let first = true;
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined)
        continue;
      yield (first ? '\n' : ',\n') + '  '.repeat(depth + 1);
      first = false;
      yield* stringTokens(key);
      yield ': ';
      yield* jsonTokens(item, depth + 1);
    }
    if (!first)
      yield '\n' + '  '.repeat(depth);
    yield '}';
  } else {
    throw new Error('Inventory contains a value not supported by JSON.');
  }
}

function* jsonChunks (value: unknown): Generator<string> {
  let pieces: string[] = [];
  let length = 0;
  for (const token of jsonTokens(value)) {
    pieces.push(token);
    length += token.length;
    if (length >= 65_536) {
      yield pieces.join('');
      pieces = [];
      length = 0;
    }
  }
  pieces.push('\n');
  yield pieces.join('');
}

async function writeChunkedJson (file: string, value: unknown) {
  await pipeline(
    Readable.from(jsonChunks(value), { objectMode: false }),
    createWriteStream(file, { flags: 'wx', mode: 0o600 }),
  );
}

function digestTap (maximumBytes = Infinity) {
  const hash = createHash('sha256');
  let bytes = 0;
  return {
    stream: new Transform({
      transform (chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > maximumBytes) {
          callback(new Error('Inventory artifact exceeds its recorded byte count.'));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
    result: () => ({ bytes, sha256: hash.digest('hex') }),
  };
}

async function writeCompressedReport (output: string, report: CensusReport): Promise<InventoryReportFile> {
  const uncompressed = digestTap();
  const compressed = digestTap();
  const file = 'report.private.json.gz';
  await pipeline(
    Readable.from(jsonChunks(report), { objectMode: false }),
    uncompressed.stream, createGzip(), compressed.stream,
    createWriteStream(path.join(output, file), { flags: 'wx', mode: 0o600 }),
  );
  const original = uncompressed.result();
  return {
    file, compression: 'gzip', ...compressed.result(),
    uncompressedBytes: original.bytes, uncompressedSha256: original.sha256,
  };
}

/** Verify persisted gzip bytes and decompressed JSON bytes without loading either whole file. */
export async function validateInventoryReport (directory: string, report: InventoryReportFile): Promise<void> {
  if (report.file !== 'report.private.json.gz' || report.compression !== 'gzip'
    || !/^[a-f0-9]{64}$/u.test(report.sha256) || !/^[a-f0-9]{64}$/u.test(report.uncompressedSha256)
    || !Number.isSafeInteger(report.bytes) || report.bytes < 0
    || !Number.isSafeInteger(report.uncompressedBytes) || report.uncompressedBytes < 0)
    throw new Error('Invalid compressed inventory descriptor.');
  const file = path.join(directory, report.file);
  await noLinks(file);
  const compressed = digestTap(report.bytes);
  const uncompressed = digestTap(report.uncompressedBytes);
  await pipeline(
    createReadStream(file), compressed.stream, createGunzip(), uncompressed.stream,
    new Writable({ write (_chunk, _encoding, callback) { callback(); } }),
  );
  const stored = compressed.result();
  const decoded = uncompressed.result();
  if (stored.bytes !== report.bytes || stored.sha256 !== report.sha256
    || decoded.bytes !== report.uncompressedBytes || decoded.sha256 !== report.uncompressedSha256)
    throw new Error('Compressed inventory checksum or byte count differs.');
}

async function writeSummary (output: string, report: CensusReport) {
  await writeJson(path.join(output, 'summary.json'), {
    format: report.format, window: report.window, status: report.status, ...report.summary,
    inventoryStatus: report.inventoryStatus, retention: report.retention,
    coverage: 'Captured parsed JSON fields in supplied roots, with window and context separate. No complete semantic coverage is claimed.',
    publication: 'Aggregate counts only. Raw reports require privacy review.',
  });
}

function checkInventoryMetadata (report: CensusReport, metadata: InventoryManifestMetadata) {
  if (report.retention.mode !== 'inventory-only' || report.retention.replayable
    || report.inventoryStatus !== report.status || metadata.inventoryStatus !== report.inventoryStatus
    || metadata.window.start !== report.window.start || metadata.window.end !== report.window.end
    || metadata.window.endpoints !== report.window.endpoints)
    throw new Error('Inventory report and manifest metadata differ.');
  const sources = new Map(report.sources.map(source => [source.label, source]));
  const labels = new Set(metadata.sources.map(source => source.label));
  if (sources.size !== report.sources.length || labels.size !== metadata.sources.length || sources.size !== labels.size)
    throw new Error('Inventory source labels differ.');
  for (const source of metadata.sources) {
    const recorded = sources.get(source.label);
    if (!recorded || recorded.sha256 !== source.sha256 || recorded.bytes !== source.bytes)
      throw new Error('Inventory source hashes or byte counts differ.');
  }
}

async function writeInventoryOnly (
  output: string, report: CensusReport, metadata: InventoryManifestMetadata,
): Promise<InventoryReportFile> {
  checkInventoryMetadata(report, metadata);
  const reference = await writeCompressedReport(output, report);
  if (typeof metadata.provenance.reportSha256 === 'string'
    && metadata.provenance.reportSha256 !== reference.uncompressedSha256)
    throw new Error('Stored inventory differs from the original report hash.');
  await validateInventoryReport(output, reference);
  const sources = new Map(report.sources.map(source => [source.label, source]));
  await writeSummary(output, report);
  await writeChunkedJson(path.join(output, 'manifest.private.json'), {
    format: 1, window: report.window, discovery: report.discovery,
    inventoryStatus: report.inventoryStatus, retention: report.retention, report: reference,
    sources: metadata.sources.map(source => {
      const recorded = sources.get(source.label)!;
      return {
        ...source, frozenFile: null, state: recorded.state,
        selection: recorded.analysis?.selection ?? null,
        status: recorded.analysis?.status ?? null,
        counts: recorded.analysis?.counts ?? null,
        diagnostics: recorded.diagnostics, analysisDiagnostics: recorded.analysis?.diagnostics ?? [],
      };
    }),
    provenance: { capture: metadata.provenance, storage: { mode: 'gzip-inventory', node: process.version } },
  });
  return reference;
}

/** Save an already parsed inventory to a new folder. Never reads the recorded native source paths. */
export async function saveInventoryOnlyReport (options: InventorySaveOptions): Promise<InventoryReportFile> {
  checkInventoryMetadata(options.report, options.manifestMetadata);
  const inputs = options.report.discovery.map(root => path.resolve(root.root));
  options.inputDirectory && inputs.push(path.resolve(options.inputDirectory));
  const output = await prepareOutput(options.outputDirectory, inputs);
  return writeInventoryOnly(output, options.report, options.manifestMetadata);
}

/** Drop legacy per-source analyses before loading another large artifact into memory. */
export function inventoryManifestMetadata (manifest: unknown): InventoryManifestMetadata {
  const raw = requiredObject(manifest);
  const retention = requiredObject(raw.retention);
  const window = requiredObject(raw.window);
  if (raw.format !== 1 || retention.mode !== 'inventory-only' || retention.replayable !== false
    || window.start !== WINDOW_START || window.end !== WINDOW_END || window.endpoints !== 'inclusive'
    || (raw.inventoryStatus !== 'complete' && raw.inventoryStatus !== 'partial'))
    throw new Error('Expected fixed-window inventory-only manifest metadata.');
  return {
    inventoryStatus: raw.inventoryStatus,
    window: { start: WINDOW_START, end: WINDOW_END, endpoints: 'inclusive' },
    sources: requiredArray(raw.sources).map(entry => {
      const source = requiredObject(entry);
      const stored = source.report === undefined ? source : requiredObject(source.report);
      const hash = stored.sha256 === null ? null : requiredString(stored.sha256);
      const label = requiredString(stored.label);
      if (source.frozenFile !== null || !/^S\d{6}$/u.test(label) || (hash !== null && !/^[a-f0-9]{64}$/u.test(hash)))
        throw new Error('Invalid inventory source metadata.');
      if (source.report !== undefined && (source.sha256 !== hash || source.bytes !== stored.bytes))
        throw new Error('Legacy inventory source provenance disagrees with its report.');
      return {
        label, sourcePath: requiredString(source.sourcePath), sha256: hash,
        bytes: stored.bytes === null ? null : requiredNumber(stored.bytes), capture: parseCapture(source.capture),
      };
    }),
    provenance: requiredObject(raw.provenance),
  };
}

async function save (output: string, report: CensusReport, sources: ManifestSource[], mode: 'capture' | 'replay') {
  if (report.retention.mode === 'inventory-only') {
    await writeInventoryOnly(output, report, {
      inventoryStatus: report.inventoryStatus, window: report.window,
      sources: sources.map(source => ({
        label: source.report.label, sourcePath: source.sourcePath, capture: source.capture,
        sha256: source.report.sha256, bytes: source.report.bytes,
      })),
      provenance: { mode, node: process.version },
    });
    return;
  }
  await writeJson(path.join(output, 'report.private.json'), report);
  await writeSummary(output, report);
  await writeJson(path.join(output, 'manifest.private.json'), {
    format: 1, window: report.window, discovery: report.discovery,
    inventoryStatus: report.inventoryStatus, retention: report.retention,
    sources: sources.map(source => ({ ...source, sha256: source.report.sha256, bytes: source.report.bytes })),
    provenance: { mode, node: process.version, reportSha256: sha256(await fs.readFile(path.join(output, 'report.private.json'))) },
  });
}

export async function captureCensus (options: CaptureOptions): Promise<CensusReport> {
  if (!options.sourceRoots.length || options.sourceRoots.some(root => !root.trim()))
    throw new Error('Supply at least one nonempty source root.');
  const roots = [...new Set(options.sourceRoots.map(root => path.resolve(root)))].sort();
  const output = await prepareOutput(options.outputDirectory, roots);
  const discovery: RootDiscovery[] = [];
  const files = new Set<string>();
  for (const root of roots) {
    const result = await discover(root);
    discovery.push(result.discovery);
    result.files.forEach(file => files.add(file));
  }
  const sources: ManifestSource[] = [];
  for (const file of [...files].sort()) {
    const label = `S${String(sources.length + 1).padStart(6, '0')}`;
    let captured: StableCapture;
    try {
      captured = await stableRead(file, { read: options.read });
    } catch (error) {
      sources.push({
        sourcePath: file, frozenFile: null, capture: null,
        report: { label, state: 'unreadable', sha256: null, bytes: null, analysis: null, diagnostics: [{ code: errorCode(error) }] },
      });
      continue;
    }
    const analysis = censusSource(captured.bytes);
    const keep = !options.inventoryOnly && (analysis.selection !== 'not-selected' || !captured.stable);
    const frozenFile = keep ? path.join('frozen', `${label}.events.jsonl`) : null;
    if (frozenFile)
      await fs.writeFile(path.join(output, frozenFile), captured.bytes, { flag: 'wx', mode: 0o600 });
    sources.push({
      sourcePath: file, frozenFile,
      capture: { attempts: captured.attempts, fingerprint: captured.fingerprint },
      report: {
        label, state: captured.stable ? 'captured' : 'unstable', sha256: captured.sha256,
        bytes: captured.bytes.length, analysis,
        diagnostics: captured.stable ? [] : [{ code: 'unstable', detail: 'Source changed during every bounded capture attempt.' }],
      },
    });
  }
  const report = makeReport(discovery, sources.map(source => source.report), options.inventoryOnly ? 'inventory-only' : 'freeze-selected');
  await save(output, report, sources, 'capture');
  return report;
}

function requiredObject (value: unknown): Record<string, unknown> {
  if (!object(value))
    throw new Error('Invalid frozen manifest object.');
  return value;
}

function requiredString (value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Invalid frozen manifest string.');
  return value;
}

function requiredNumber (value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid frozen manifest count.');
  return value;
}

function requiredArray (value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new Error('Invalid frozen manifest array.');
  return value;
}

function parseDiagnostics (value: unknown): Diagnostic[] {
  return requiredArray(value).map(entry => {
    const raw = requiredObject(entry);
    return {
      code: requiredString(raw.code),
      ...(raw.line === undefined ? {} : { line: requiredNumber(raw.line) }),
      ...(raw.detail === undefined ? {} : { detail: requiredString(raw.detail) }),
    };
  });
}

function parsePeriod (value: unknown) {
  if (value !== 'inWindow' && value !== 'beforeWindow' && value !== 'afterWindow' && value !== 'unknownTime')
    throw new Error('Invalid frozen manifest period.');
  return value;
}

function parseDiscovery (value: unknown): RootDiscovery[] {
  return requiredArray(value).map(entry => {
    const raw = requiredObject(entry);
    const status = raw.status;
    if (status !== 'complete' && status !== 'empty' && status !== 'missing' && status !== 'unreadable' && status !== 'partial')
      throw new Error('Invalid discovery status.');
    return {
      root: requiredString(raw.root), status, files: requiredNumber(raw.files),
      excludedDirectories: requiredNumber(raw.excludedDirectories), diagnostics: parseDiagnostics(raw.diagnostics),
    };
  });
}

// Excluded-source audits are deliberately small. Selected analyses are always regenerated from hash-checked frozen bytes.
function parseExcludedAudit (value: unknown): SourceCensus {
  const raw = requiredObject(value);
  if (raw.selection !== 'not-selected' || (raw.status !== 'complete' && raw.status !== 'partial'))
    throw new Error('Only excluded audits may be replayed without frozen input.');
  const counts = requiredObject(raw.counts);
  if (requiredArray(raw.inventory).length)
    throw new Error('An excluded audit must not contain field inventory.');
  return {
    status: raw.status, selection: 'not-selected',
    counts: {
      inWindow: requiredNumber(counts.inWindow), beforeWindow: requiredNumber(counts.beforeWindow),
      afterWindow: requiredNumber(counts.afterWindow), unknownTime: requiredNumber(counts.unknownTime),
      malformed: requiredNumber(counts.malformed),
    },
    diagnostics: parseDiagnostics(raw.diagnostics),
    evidence: requiredArray(raw.evidence).map(entry => {
      const evidence = requiredObject(entry);
      return {
        line: requiredNumber(evidence.line), period: parsePeriod(evidence.period),
        kind: requiredString(evidence.kind), path: requiredString(evidence.path),
      };
    }),
    inventory: [], semantics: censusSource(new Uint8Array()).semantics,
  };
}

function parseCapture (value: unknown): ManifestSource['capture'] {
  if (value === null)
    return null;
  const raw = requiredObject(value);
  const stat = requiredObject(raw.fingerprint);
  return {
    attempts: requiredNumber(raw.attempts),
    fingerprint: {
      device: requiredString(stat.device), inode: requiredString(stat.inode), bytes: requiredNumber(stat.bytes),
      modifiedNs: requiredString(stat.modifiedNs), changedNs: requiredString(stat.changedNs),
    },
  };
}

export async function replayCensus (options: ReplayOptions): Promise<CensusReport> {
  const input = path.resolve(options.frozenDirectory);
  await noLinks(path.join(input, 'manifest.private.json'));
  const manifest: unknown = JSON.parse(await fs.readFile(path.join(input, 'manifest.private.json'), 'utf8'));
  const raw = requiredObject(manifest);
  if (raw.format !== 1 || JSON.stringify(raw.window) !== JSON.stringify({ start: WINDOW_START, end: WINDOW_END, endpoints: 'inclusive' }))
    throw new Error('Frozen manifest version or fixed window differs.');
  if (raw.retention !== undefined) {
    const retention = requiredObject(raw.retention);
    if (retention.mode === 'inventory-only')
      throw new PathProblem('inventory-only-not-replayable');
    if (retention.mode !== 'freeze-selected' || typeof retention.replayable !== 'boolean')
      throw new Error('Invalid frozen manifest retention metadata.');
    if (!retention.replayable)
      throw new PathProblem('manifest-not-replayable');
  }
  const output = await prepareOutput(options.outputDirectory, [input]);
  const sources: ManifestSource[] = [];
  const labels = new Set<string>();
  for (const entry of requiredArray(raw.sources)) {
    const source = requiredObject(entry);
    const stored = requiredObject(source.report);
    const label = requiredString(stored.label);
    if (!/^S\d{6}$/u.test(label) || labels.has(label))
      throw new Error('Invalid or repeated frozen source label.');
    labels.add(label);
    const state = stored.state;
    if (state !== 'captured' && state !== 'unstable' && state !== 'unreadable' && state !== 'hash-mismatch')
      throw new Error('Invalid frozen source state.');
    const hash = stored.sha256 === null ? null : requiredString(stored.sha256);
    if (hash !== null && !/^[a-f0-9]{64}$/u.test(hash))
      throw new Error('Invalid frozen source hash.');
    if (source.sha256 !== hash || source.bytes !== stored.bytes)
      throw new Error('Frozen source provenance disagrees with its report.');
    const report: SourceReport = {
      label, state, sha256: hash, bytes: stored.bytes === null ? null : requiredNumber(stored.bytes),
      analysis: null, diagnostics: parseDiagnostics(stored.diagnostics),
    };
    let frozenFile: string | null = null;
    if (source.frozenFile !== null) {
      // Reconstruct rather than trust a manifest path that could escape the private input folder.
      frozenFile = path.join('frozen', `${label}.events.jsonl`);
      const basename = `${label}.events.jsonl`;
      if (source.frozenFile !== path.win32.join('frozen', basename) && source.frozenFile !== path.posix.join('frozen', basename))
        throw new Error('Unexpected frozen filename.');
      let verified: StableCapture | undefined;
      try {
        const captured = await stableRead(path.join(input, frozenFile));
        if (!captured.stable || captured.sha256 !== hash || captured.bytes.length !== report.bytes)
          throw new PathProblem('hash-mismatch');
        report.analysis = censusSource(captured.bytes);
        verified = captured;
      } catch (error) {
        report.state = 'hash-mismatch';
        report.diagnostics.push({ code: errorCode(error), detail: 'Frozen input could not be verified. No counts attributed.' });
        frozenFile = null;
      }
      if (verified && frozenFile)
        await fs.writeFile(path.join(output, frozenFile), verified.bytes, { flag: 'wx', mode: 0o600 });
    } else if (stored.analysis !== null) {
      report.analysis = parseExcludedAudit(stored.analysis);
    } else if (state === 'captured' || state === 'unstable') {
      throw new Error('Captured source is missing its frozen input or excluded audit.');
    }
    sources.push({
      sourcePath: requiredString(source.sourcePath), frozenFile,
      capture: parseCapture(source.capture), report,
    });
  }
  const report = makeReport(parseDiscovery(raw.discovery), sources.map(source => source.report));
  await save(output, report, sources, 'replay');
  return report;
}
