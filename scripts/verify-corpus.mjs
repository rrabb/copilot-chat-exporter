// Reproducible corpus verification: exports every verified Local journal by exact path,
// verifies it and every main-scope SDK source with --verify --strict --json, and writes one
// JSON report. The report holds counts, exit codes and failure reasons only, never chat content.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existingUserDataSnapshot, snapshotUserData } from '../src/session/source-snapshot.ts';
import { discardCapture, finishCapture } from '../src/session/source-cache.ts';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CLI = path.join(ROOT, 'src', 'cli.ts');
// Version 2 added per-source parser fields and totals.parser.
// Version 3 added per-source size/mtime before and after, and excludes sources that changed
// during the run from totals (listed in totals.changedDuringRun instead).
// Version 5 adds independent image hashes and measured Local export sizes.
// Version 6 adds source snapshots and keeps results when live originals change.
// Version 7 adds stable IDs derived from the original source path beside run-local labels.
export const CORPUS_REPORT_VERSION = 7;
export const BASE64_TRIGGER_BYTES = 64 * 1024;

export function sourcePathId (source) {
  const canonical = path.resolve(source).replace(/\\/gu, '/');
  return createHash('sha256').update(process.platform === 'win32' ? canonical.toLowerCase() : canonical).digest('hex').slice(0, 12);
}

/** Counts string values with a base64-alphabet run of at least 64 KiB; this is a heuristic, not decoding. */
export function countBase64LikeStrings (value) {
  const pending = [value];
  let count = 0;
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'string') {
      for (const match of item.matchAll(/[A-Za-z0-9+/=]+/g)) {
        if (match[0].length >= BASE64_TRIGGER_BYTES) {
          count++;
          break;
        }
      }
    } else if (item && typeof item === 'object') {
      for (const child of Object.values(item))
        pending.push(child);
    }
  }
  return count;
}

export async function scanBase64 (file) {
  let count = 0;
  let invalidLines = 0;
  const input = createReadStream(file, { encoding: 'utf8' });
  const scanLine = (line) => {
    if (!line.trim())
      return;
    let value;
    try {
      value = JSON.parse(line);
    } catch (error) {
      if (!(error instanceof SyntaxError))
        throw error;
      invalidLines++;
      return;
    }
    count += countBase64LikeStrings(value);
  };
  let pending = '';
  try {
    for await (const chunk of input) {
      pending += chunk;
      let start = 0;
      let end;
      while ((end = pending.indexOf('\n', start)) >= 0) {
        scanLine(pending.slice(start, end));
        start = end + 1;
      }
      pending = pending.slice(start);
    }
    scanLine(pending);
  } finally {
    input.destroy();
  }
  return { count, thresholdBytes: BASE64_TRIGGER_BYTES, invalidLines };
}

async function statSource (file) {
  try {
    const stat = await fs.stat(file);
    return { size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

export function sourceChanged (before, after) {
  return !before || !after || before.size !== after.size || before.mtimeMs !== after.mtimeMs;
}

function run (args, env) {
  return new Promise((resolve) => {
    execFile(process.execPath, args, { env, maxBuffer: 256 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function parseReport (stdout) {
  const line = stdout.trim().split(/\r?\n/u).at(-1);
  try {
    return line ? JSON.parse(line) : null;
  } catch {
    return null;
  }
}

function addCategories (target, categories) {
  for (const [name, counts] of Object.entries(categories ?? {})) {
    const sum = target[name] ??= { present: 0, partial: 0, absent: 0 };
    sum.present += counts.present;
    sum.partial += counts.partial;
    sum.absent += counts.absent;
  }
}

/**
 * Selects verified sources: Local journals deduped by path, SDK main scopes deduped by events log.
 * Several chat keys (peer chat identities) can share one events log, so the backing session ID is
 * ambiguous as a selector; the first chat key in sort order is used as an exact selector instead.
 */
export function selectCorpusSources (occurrences) {
  const local = new Set();
  const sdk = new Map();
  for (const occurrence of occurrences) {
    if (occurrence.backing.status !== 'verified')
      continue;
    const source = occurrence.backing.source;
    if (source.kind === 'local-journal')
      local.add(path.resolve(source.path));
    else if (source.kind === 'sdk-events' && source.scope.kind === 'main') {
      const key = path.resolve(source.path);
      const entry = sdk.get(key) ?? { keys: new Set(), provider: source.provider };
      entry.keys.add(occurrence.sessionId);
      sdk.set(key, entry);
    }
  }
  return {
    local: [...local].sort(),
    sdk: [...sdk.entries()]
      .map(([sourcePath, { keys, provider }]) => ({ selector: [...keys].sort()[0], provider, sharedKeys: keys.size, path: sourcePath }))
      .sort((a, b) => a.selector.localeCompare(b.selector)),
  };
}

export async function collectSources (userDataRoot, copilotHome) {
  const { inventorySessions } = await import(pathToFileURL(path.join(ROOT, 'src', 'session', 'inventory.ts')).href);
  const inventory = await inventorySessions(userDataRoot, copilotHome ? { copilotHome } : {});
  return { userDataRoot: inventory.userDataRoot, ...selectCorpusSources(inventory.occurrences) };
}

function summarize (kind, selector, label, result, report, durationMs) {
  return {
    label, kind, selector, exitCode: result.exitCode, durationMs,
    failureReasons: report?.failureReasons ?? [result.stage === 'export' ? 'export-error' : 'cli-error'],
    // The first stderr line names the CLI error class; it is not chat content.
    error: report ? null : (result.stderr.trim().split(/\r?\n/u)[0] ?? '').slice(0, 300),
    checked: report?.layerD?.checked ?? 0,
    categories: report?.layerD?.totals ?? {},
    layerDOrder: report?.layerD?.order ?? null,
    layerDMultiplicity: report?.layerD?.multiplicity ?? null,
    layerB: report?.layerB ? { rawRequests: report.layerB.rawRequests, parsedTurns: report.layerB.parsedTurns } : null,
    layerA: report?.layerA ? { rawToolIds: report.layerA.rawToolIds, parsedToolIds: report.layerA.parsedToolIds } : null,
    layerCFailed: report?.layerC?.failed ?? null,
    layerCSkipped: report?.layerC?.skipped ?? null,
    fenceRepairs: report?.fenceRepairs ?? null,
    parserFailed: report?.parser?.failed ?? null,
    parserSkipped: report?.parser?.skipped ?? null,
    parserFailedChecks: (report?.parser?.checks ?? []).filter((check) => !check.ok).map((check) => check.name),
    parserMs: report?.parser?.ms ?? null,
    unhandledKinds: report?.census?.unhandled ?? {},
    representationCounts: report?.census?.representationCounts ?? {},
    images: report?.images ?? null,
  };
}

export async function runCorpus ({ userDataRoot, out, cli = DEFAULT_CLI, env = process.env, concurrency = 4, live = false, snapshotDirectory, onProgress = () => {} }) {
  const started = Date.now();
  const existing = live ? null : await existingUserDataSnapshot(userDataRoot);
  const frozen = live ? null : existing ?? await snapshotUserData(userDataRoot, env.COPILOT_HOME, snapshotDirectory);
  const sources = await collectSources(frozen?.userDataRoot ?? userDataRoot, frozen?.copilotHome ?? env.COPILOT_HOME);
  const copies = new Map(frozen?.files.map((file) => [file.destination, file]) ?? []);
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-corpus-'));
  const executionEnv = { ...env, ...(frozen ? { COPILOT_HOME: frozen.copilotHome } : {}),
    CCE_CACHE_DIR: path.join(scratch, 'cache') };
  const jobs = [
    ...sources.local.map((journal, index) => ({ kind: 'local', selector: journal, sourcePath: journal, label: `L${String(index + 1).padStart(3, '0')}` })),
    ...sources.sdk.map(({ selector, provider, path: sourcePath }, index) => ({ kind: `sdk:${provider}`, selector, sourcePath, label: `S${String(index + 1).padStart(3, '0')}` })),
  ];
  const results = new Array(jobs.length);
  let next = 0;
  async function worker () {
    while (next < jobs.length) {
      const index = next++;
      const job = jobs[index];
      const t0 = Date.now();
      const copy = copies.get(job.sourcePath);
      const before = copy?.before ?? await statSource(job.sourcePath);
      const base64Like = await scanBase64(job.sourcePath);
      let result;
      if (job.kind === 'local') {
        const markdown = path.join(scratch, job.label, 'export.md');
        await fs.mkdir(path.dirname(markdown), { recursive: true });
        const exported = await run([cli, job.selector, markdown, '--keep-source'], executionEnv);
        result = exported.exitCode === 0
          ? await run([cli, '--verify', '--strict', '--json', job.selector, markdown], executionEnv)
          : { ...exported, stage: 'export' };
        if (exported.exitCode === 0) {
          const markdownBytes = (await fs.stat(markdown)).size;
          let companionBytes = 0;
          for (const folder of await fs.readdir(path.dirname(markdown), { withFileTypes: true })) {
            if (!folder.isDirectory())
              continue;
            for (const file of await fs.readdir(path.join(path.dirname(markdown), folder.name)))
              companionBytes += (await fs.stat(path.join(path.dirname(markdown), folder.name, file))).size;
          }
          result.exportSizes = { markdownBytes, companionBytes, totalBytes: markdownBytes + companionBytes };
        }
        await fs.rm(path.dirname(markdown), { recursive: true, force: true });
      } else {
        result = await run([cli, '--verify', '--strict', '--json', job.selector, '--user-data-root', sources.userDataRoot], executionEnv);
      }
      const after = await statSource(copy?.source ?? job.sourcePath);
      results[index] = {
        ...summarize(job.kind, job.kind === 'local' && copy ? copy.source : job.selector, job.label, result, result.stage ? null : parseReport(result.stdout), Date.now() - t0),
        sourceId: sourcePathId(copy?.source ?? job.sourcePath),
        source: { before, after },
        snapshot: copy ?? null,
        base64Like,
        exportSizes: result.exportSizes ?? null,
        changedDuringRun: sourceChanged(before, after),
      };
      onProgress(results[index], index + 1, jobs.length);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, jobs.length)) }, worker));
    for (const result of results) {
      if (result.snapshot) {
        result.source.after = await statSource(result.snapshot.source);
        result.changedDuringRun = sourceChanged(result.source.before, result.source.after);
      }
    }
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
    if (frozen && !snapshotDirectory && !existing)
      await discardCapture(frozen.directory);
    if (frozen && snapshotDirectory && !existing)
      await finishCapture(frozen.directory, true);
  }
  const report = {
    version: CORPUS_REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    cli: path.resolve(cli),
    userDataRoot: path.resolve(userDataRoot),
    mode: live ? 'live' : 'snapshot',
    snapshotFiles: frozen?.files ?? [],
    command: '--verify --strict --json',
    durationMs: Date.now() - started,
    totals: totalize(results),
    sources: results,
  };
  out ??= defaultCorpusPath(report.generatedAt);
  report.outputPath = path.resolve(out);
  if (out) {
    await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
    await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

export function defaultCorpusPath (generatedAt, offsetMinutes = new Date(generatedAt).getTimezoneOffset()) {
  const local = new Date(new Date(generatedAt).getTime() - offsetMinutes * 60_000).toISOString().slice(0, -1);
  const offset = `${offsetMinutes > 0 ? '-' : '+'}${String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0')}-${String(Math.abs(offsetMinutes) % 60).padStart(2, '0')}`;
  return path.join(ROOT, 'reports', 'corpus', `corpus-${local.replace(/[:.]/gu, '-')}${offset}.json`);
}

/** Frozen copies stay counted. In live mode, changed sources are listed but excluded. */
export function totalize (results) {
  const compared = results.filter((item) => item.snapshot || !item.changedDuringRun);
  const totals = {
    sources: compared.length,
    changedDuringRun: results.filter((item) => item.changedDuringRun).map((item) => item.label),
    changedSources: results.filter((item) => item.changedDuringRun).map(({ label, sourceId }) => ({ label, sourceId })),
    byKind: {}, byExitCode: {}, failureReasons: {}, checked: 0, categories: {},
    base64Like: { count: 0, thresholdBytes: BASE64_TRIGGER_BYTES, invalidLines: 0 },
    representationCounts: {},
    parser: { failed: 0, skipped: 0, totalMs: 0, maxMs: 0, maxMsLabel: null, maxMsSourceId: null },
    images: {},
    localExportSizes: { markdownBytes: 0, companionBytes: 0, totalBytes: 0, largest: null },
  };
  for (const item of compared) {
    if (item.images) {
      const kind = item.kind === 'local' ? 'Local' : 'SDK';
      const bucket = totals.images[kind] ??= { hashes: new Set(), foundHashes: new Set(), missingHashes: new Set(), unresolved: 0, referenceOnly: 0, excludedNotSubmitted: 0 };
      for (const key of ['hashes', 'foundHashes', 'missingHashes'])
        for (const hash of item.images[key] ?? [])
          bucket[key].add(hash);
      for (const key of ['unresolved', 'referenceOnly', 'excludedNotSubmitted'])
        bucket[key] += item.images[key] ?? 0;
    }
    if (item.kind === 'local' && item.exportSizes) {
      for (const key of ['markdownBytes', 'companionBytes', 'totalBytes'])
        totals.localExportSizes[key] += item.exportSizes[key];
      if (!totals.localExportSizes.largest || item.exportSizes.totalBytes > totals.localExportSizes.largest.totalBytes)
        totals.localExportSizes.largest = { label: item.label, sourceId: item.sourceId ?? null, ...item.exportSizes };
    }
    for (const [name, count] of Object.entries(item.representationCounts ?? {}))
      totals.representationCounts[name] = (totals.representationCounts[name] ?? 0) + count;
    totals.base64Like.count += item.base64Like?.count ?? 0;
    totals.base64Like.invalidLines += item.base64Like?.invalidLines ?? 0;
    totals.byKind[item.kind] = (totals.byKind[item.kind] ?? 0) + 1;
    totals.byExitCode[item.exitCode] = (totals.byExitCode[item.exitCode] ?? 0) + 1;
    for (const reason of item.failureReasons)
      totals.failureReasons[reason] = (totals.failureReasons[reason] ?? 0) + 1;
    totals.checked += item.checked;
    item.parserFailed && totals.parser.failed++;
    item.parserSkipped && totals.parser.skipped++;
    totals.parser.totalMs += item.parserMs ?? 0;
    if ((item.parserMs ?? 0) > totals.parser.maxMs) {
      totals.parser.maxMs = item.parserMs;
      totals.parser.maxMsLabel = item.label;
      totals.parser.maxMsSourceId = item.sourceId ?? null;
    }
    addCategories(totals.categories, item.categories);
  }
  totals.images = Object.fromEntries(Object.entries(totals.images).map(([kind, bucket]) => [kind, {
    unique: bucket.hashes.size, found: [...bucket.foundHashes].filter((hash) => !bucket.missingHashes.has(hash)).length, missing: bucket.missingHashes.size,
    unresolved: bucket.unresolved, referenceOnly: bucket.referenceOnly, excludedNotSubmitted: bucket.excludedNotSubmitted,
  }]));
  return totals;
}

function parseArgs (argv) {
  const options = { userDataRoot: undefined, out: undefined, concurrency: 4, live: false };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--user-data-root') options.userDataRoot = value, index++;
    else if (flag === '--out') options.out = value, index++;
    else if (flag === '--concurrency') options.concurrency = Number(value), index++;
    else if (flag === '--live') options.live = true;
    else if (flag === '--snapshot-dir') options.snapshotDirectory = value, index++;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!options.userDataRoot)
    throw new Error('Usage: node scripts/verify-corpus.mjs --user-data-root <root> [--out <report.json>] [--concurrency 4] [--live] [--snapshot-dir <folder>]');
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = await runCorpus({
      ...options,
      onProgress: (item, done, total) => console.error(`${done}/${total} ${item.label} [${item.sourceId}] ${item.kind} exit ${item.exitCode}${item.failureReasons.length ? ` ${item.failureReasons.join(',')}` : ''}`),
    });
    console.log(JSON.stringify({ out: report.outputPath, totals: report.totals }));
    process.exit(report.totals.sources === (report.totals.byExitCode[0] ?? 0) ? 0 : 2);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
