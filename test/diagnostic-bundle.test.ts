import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sanitizeDiagnosticArguments, shouldWriteDiagnosticBundle, writeDiagnosticBundle } from '../src/verify/diagnostic-bundle.ts';
import { buildSdkVerifyJson } from '../src/verify/json-report.ts';
import type { Census } from '../src/types.ts';
import type { LossAccount } from '../src/verify/loss-account.ts';
import type { SchemaDiagnosticRecord } from '../src/verify/diagnostic-evidence.ts';

const census = (unhandled: Array<[string, number]> = []): Census => ({
  seen: new Map([['user.message', 1]]),
  dropped: new Map(),
  toolData: new Map(),
  unhandled,
  unrecognizedToolData: [],
  questionWarnings: [],
});

const loss = (): LossAccount => ({
  checked: 1,
  totals: { prompt: { present: 1, partial: 0, absent: 0 } },
  unaccounted: [],
  order: { checked: 1, outOfOrder: 0 },
  multiplicity: { checked: 0, missing: 0 },
  failed: false,
});

function report (unhandled: Array<[string, number]> = []) {
  return buildSdkVerifyJson({
    strict: false,
    census: census(unhandled),
    leftOut: new Map(),
    loss: loss(),
    parser: {
      skipped: null,
      checks: [{ name: 'headings', ok: true, detail: 'ok' }],
      failed: false,
      counts: { turnAnchors: 1, requestHeadings: 1, assistantHeadings: 1, sectionHeadings: 1, unknownBlocks: 0, linkedUnknownBlocks: 0 },
      ms: 1,
    },
    fenceRepairs: { early: [], turnEnd: 0, html: [] },
  });
}

test('clean verification does not request a diagnostic bundle', () => {
  assert.equal(shouldWriteDiagnosticBundle({ report: report() }), false);
  assert.equal(shouldWriteDiagnosticBundle({ report: report([['future.event', 1]]) }), true);
  assert.equal(shouldWriteDiagnosticBundle({ report: report(), sourceWarnings: ['source warning'] }), true);
  assert.deepEqual(sanitizeDiagnosticArguments([
    '--verify', 'private-session', '--user-data-root', 'C:\\private', '--tool-group-order', 'completion',
  ]), ['--verify', '<argument-1>', '--user-data-root', '[REDACTED]', '--tool-group-order', 'completion']);
});

test('writer keeps a collision-safe task and manifest with redacted schema and exact fidelity evidence', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-diagnostics-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const archivePath = path.join(root, 'chat.verify-failed.md');
  await fs.writeFile(archivePath, '# Chat\n');
  const schemaRecords: SchemaDiagnosticRecord[] = [{
    provider: 'sdk',
    type: 'future.event',
    line: 12,
    locator: 'line 12',
    issues: ['data.newField: unknown field'],
    value: {
      type: 'future.event',
      id: 'private-event-id',
      data: { newField: 'private-schema-value', toolCallId: 'private-tool-id' },
    },
  }];
  const verification = report([['future.event', 1]]);
  const first = await writeDiagnosticBundle({
    generatedAt: '2026-11-23T18:00:00.000Z',
    provider: 'sdk',
    sessionId: 'private-session-id',
    command: ['--verify', 'private-session-id', archivePath, '--token=secret-token'],
    report: verification,
    archivePath,
    sourceHash: 'source-hash',
    capturePath: path.join(root, 'capture'),
    sourceWarnings: [],
    schemaRecords,
    lossItems: [{
      request: 2,
      category: 'tool-output',
      status: 'absent',
      chars: 31,
      sample: 'Exact failed output',
      evidence: {
        recordedText: 'Exact failed output with password=fake-secret',
        comparedText: 'Exact failed output with password=[REDACTED]',
        matchedText: null,
        textHash: 'text-hash',
      },
    }],
    sequenceEvidence: {
      order: [{
        request: 3,
        category: 'assistant-text',
        recordedText: 'Second recorded message.',
        comparedText: 'Second recorded message.',
        textHash: 'sequence-hash',
      }],
      multiplicity: [],
    },
  });
  const second = await writeDiagnosticBundle({
    generatedAt: '2026-11-23T18:00:00.000Z',
    provider: 'sdk',
    sessionId: 'private-session-id',
    command: ['--verify', 'private-session-id', archivePath],
    report: verification,
    archivePath,
    sourceHash: 'source-hash',
    schemaRecords,
  });
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first!.manifestPath, second!.manifestPath);
  assert.notEqual(first!.taskPath, second!.taskPath);
  const manifest = JSON.parse(await fs.readFile(first!.manifestPath, 'utf8'));
  const task = await fs.readFile(first!.taskPath, 'utf8');
  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, /private-schema-value|private-event-id|private-tool-id/u);
  assert.doesNotMatch(serialized, /secret-token/u);
  assert.match(serialized, /Exact failed output/u);
  assert.equal(manifest.redaction.commonPatternsFound, 1, JSON.stringify(manifest.redaction));
  assert.match(task, /\[!CAUTION\]/u);
  assert.match(task, /Do not upload/u);
  assert.match(task, /future\.event/u);
  assert.match(task, /tool-output/u);
  assert.match(task, /Out-of-order failures: 1/u);
  assert.match(task, /src\/session\/sdk-session\.ts/u);
  assert.match(task, /Frozen source capture:/u);
});

test('large fidelity evidence moves into a collision-safe evidence folder', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-diagnostics-large-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const archivePath = path.join(root, 'large.md');
  await fs.writeFile(archivePath, '# Chat\n');
  const recordedText = 'private exact output '.repeat(20_000);
  const result = await writeDiagnosticBundle({
    generatedAt: '2026-11-23T18:00:00.000Z',
    provider: 'sdk',
    sessionId: 'private-session-id',
    command: ['--verify', 'private-session-id', archivePath],
    report: report(),
    failure: { failureReasons: ['layer-d'], categories: {}, details: {} },
    archivePath,
    lossItems: [{
      request: 1,
      category: 'tool-output',
      status: 'absent',
      chars: recordedText.length,
      sample: recordedText.slice(0, 60),
      evidence: {
        recordedText,
        comparedText: recordedText,
        matchedText: null,
        textHash: 'large-text-hash',
      },
    }],
  });
  assert.ok(result?.evidenceDirectory);
  const manifest = JSON.parse(await fs.readFile(result!.manifestPath, 'utf8'));
  assert.equal(manifest.samples, undefined);
  assert.equal(manifest.evidence.kind, 'schema-and-content');
  assert.ok(manifest.evidence.bytes > 256 * 1024);
  const evidenceFile = path.join(path.dirname(result!.manifestPath), manifest.evidence.file);
  const evidenceBytes = await fs.readFile(evidenceFile);
  const evidence = evidenceBytes.toString('utf8');
  assert.equal(manifest.evidence.bytes, evidenceBytes.length);
  assert.equal(manifest.evidence.sha256, createHash('sha256').update(evidenceBytes).digest('hex'));
  assert.match(evidence, /private exact output/u);
});

test('exporter exceptions write a best-effort bundle without a verification report', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-diagnostics-exception-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await writeDiagnosticBundle({
    generatedAt: '2026-11-23T18:00:00.000Z',
    provider: 'local',
    sessionId: 'private-session-id',
    command: ['private-session-id', 'private-output.md'],
    report: null,
    exception: new Error('Synthetic writer failure'),
    diagnosticsDirectory: root,
  });
  assert.ok(result);
  const manifest = JSON.parse(await fs.readFile(result!.manifestPath, 'utf8'));
  assert.equal(manifest.verification, null);
  assert.equal(manifest.exception.message, 'Synthetic writer failure');
  assert.equal(manifest.model.findings[0].stage, 'export');
  assert.equal(manifest.model.findings[0].category, 'exporter');
});

test('verifier exceptions name the verify stage and the project frames that threw', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-diagnostics-verifier-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const error = new TypeError('Cannot read properties of undefined');
  error.stack = [
    'TypeError: Cannot read properties of undefined',
    '    at buildLossAccount (file:///C:/repo/src/verify/loss-account.ts:412:9)',
    '    at main (file:///C:/repo/src/cli.ts:540:3)',
    '    at node:internal/process/task_queues:95:5',
  ].join('\n');
  const result = await writeDiagnosticBundle({
    generatedAt: '2026-11-23T18:00:00.000Z',
    provider: 'local',
    sessionId: 'private-session-id',
    command: ['--verify', 'private-session-id'],
    report: null,
    exception: error,
    exceptionStage: 'verify',
    diagnosticsDirectory: root,
  });
  const manifest = JSON.parse(await fs.readFile(result!.manifestPath, 'utf8'));
  const task = await fs.readFile(result!.taskPath, 'utf8');
  assert.deepEqual(manifest.exception.frames, ['src/verify/loss-account.ts:412', 'src/cli.ts:540']);
  assert.equal(manifest.model.findings[0].category, 'verifier');
  assert.match(task, /Stage: verify\. The verifier threw/u);
  assert.match(task, /`src\/verify\/loss-account\.ts:412`/u);
  assert.doesNotMatch(task, /src\/verify\/diagnostic-bundle\.ts/u);
});

test('parser failures map to parser hints, store the report once and show the swallowed marker', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-diagnostics-parser-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const archivePath = path.join(root, 'chat.verify-failed.md');
  await fs.writeFile(archivePath, ['# Chat', '', '````text', 'model text', '', '#### 💬 Assistant Response', '', 'answer'].join('\n'));
  const verification = buildSdkVerifyJson({
    strict: false,
    census: census(),
    leftOut: new Map(),
    loss: loss(),
    parser: {
      skipped: null,
      checks: [{ name: 'assistant headings parse as headings', ok: false, detail: 'headings=0, turns=1' }],
      failed: true,
      counts: { turnAnchors: 1, requestHeadings: 1, assistantHeadings: 0, sectionHeadings: 1, unknownBlocks: 0, linkedUnknownBlocks: 0 },
      ms: 1,
    },
    fenceRepairs: { early: [], turnEnd: 0, html: [] },
  });
  const result = await writeDiagnosticBundle({
    generatedAt: '2026-11-23T18:00:00.000Z',
    provider: 'sdk',
    sessionId: 'private-session-id',
    command: ['--verify', 'private-session-id', archivePath],
    report: verification,
    failure: { failureReasons: ['parser-check'], categories: {}, details: verification },
    archivePath,
  });
  const manifest = JSON.parse(await fs.readFile(result!.manifestPath, 'utf8'));
  const task = await fs.readFile(result!.taskPath, 'utf8');
  const finding = manifest.model.findings.find((item: { check: string }) => item.check === 'parser-check');
  assert.equal(finding.category, 'parser');
  assert.equal(finding.stage, 'verify');
  assert.equal(manifest.failure.details, undefined);
  assert.equal(manifest.parserEvidence[0].markerLinesInsideCode, 1);
  assert.equal(manifest.parserEvidence[0].excerpts[0].fenceOpenedAt, 3);
  assert.match(task, /code block opened at line 3: `````text`/u);
  assert.match(task, /src\/verify\/parser-check\.ts/u);
  assert.match(task, /Replay: `node src\/cli\.ts --verify <session-id> /u);
});

test('a specific strict failure replaces the generic reason finding for the same category', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-diagnostics-dedupe-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const strict = buildSdkVerifyJson({
    strict: true,
    census: census([['future.event', 2]]),
    leftOut: new Map(),
    loss: loss(),
    parser: report().parser,
    fenceRepairs: { early: [], turnEnd: 0, html: [] },
  });
  const result = await writeDiagnosticBundle({
    generatedAt: '2026-11-23T18:00:00.000Z',
    provider: 'sdk',
    sessionId: 'private-session-id',
    command: ['--verify', 'private-session-id'],
    report: strict,
    diagnosticsDirectory: root,
  });
  const manifest = JSON.parse(await fs.readFile(result!.manifestPath, 'utf8'));
  const checks = manifest.model.findings.map((item: { category: string; check: string }) => `${item.category}/${item.check}`);
  assert.ok(strict.failureReasons.includes('unhandled-kind'));
  assert.deepEqual(checks, ['schema-drift/unhandled-record']);
});

test('raw records keep exact recorded values in a separate file and clip only long strings', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-diagnostics-raw-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const long = `${'a'.repeat(2000)}${'m'.repeat(1000)}${'z'.repeat(500)}`;
  const result = await writeDiagnosticBundle({
    generatedAt: '2026-11-23T18:00:00.000Z',
    provider: 'sdk',
    sessionId: 'private-session-id',
    command: ['--verify', 'private-session-id'],
    report: report([['future.event', 1]]),
    diagnosticsDirectory: root,
    schemaRecords: [{
      provider: 'sdk',
      type: 'future.event',
      line: 7,
      locator: 'line 7',
      issues: ['unreviewed SDK event type'],
      value: { type: 'future.event', data: { secretish: 'private-schema-value', body: long, nested: [{ deep: true }] } },
    }],
  });
  assert.ok(result?.rawRecordsPath);
  const manifest = JSON.parse(await fs.readFile(result!.manifestPath, 'utf8'));
  const lines = (await fs.readFile(result!.rawRecordsPath!, 'utf8')).trim().split('\n');
  const record = JSON.parse(lines[0]!);
  assert.equal(lines.length, 1);
  assert.equal(record.value.data.secretish, 'private-schema-value');
  assert.deepEqual(record.value.data.nested, [{ deep: true }]);
  assert.equal(record.clippedStrings, 1);
  assert.match(record.value.data.body, /^a{2000}\n\[cce clipped: 3500 chars, sha256 [\da-f]{64}\]\nz{500}$/u);
  assert.doesNotMatch(JSON.stringify(manifest), /private-schema-value/u);
  assert.deepEqual(manifest.rawRecords.index[0], {
    jsonlLine: 1, signature: record.signature, type: 'future.event', line: 7, locator: 'line 7',
  });
  assert.equal(manifest.model.schema.groups[0].signature, record.signature);
});

test('image and companion evidence point at the missing record and the broken link', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-diagnostics-images-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const archivePath = path.join(root, 'chat.md');
  const assets = path.join(root, 'chat_assets_1');
  await fs.mkdir(assets);
  await fs.writeFile(path.join(assets, 'kept.png'), 'kept');
  await fs.writeFile(path.join(assets, 'orphan.txt'), 'orphan');
  await fs.writeFile(archivePath, '# Chat\n\n![a](chat_assets_1/kept.png)\n\n![b](chat_assets_1/gone.png)\n');
  const verification = buildSdkVerifyJson({
    strict: false,
    census: census(),
    leftOut: new Map(),
    loss: loss(),
    parser: report().parser,
    fenceRepairs: { early: [], turnEnd: 0, html: [] },
    images: {
      unique: 2, found: 1, missing: 1, referenceOnly: 0, unresolved: 0, excludedNotSubmitted: 0,
      hashes: ['h-kept', 'h-gone'], foundHashes: ['h-kept'], missingHashes: ['h-gone'], failed: true,
    },
  });
  const result = await writeDiagnosticBundle({
    generatedAt: '2026-11-23T18:00:00.000Z',
    provider: 'sdk',
    sessionId: 'private-session-id',
    command: ['--verify', 'private-session-id', archivePath],
    report: verification,
    archivePath,
    imageLocators: [
      { hash: 'h-kept', line: 4, locator: 'line 4 user.message data.attachments[0]', mimeType: 'image/png' },
      { hash: 'h-gone', line: 9, locator: 'line 9 tool.execution_complete data.result.contents[1]', mimeType: 'image/png', assetId: 'asset-9' },
    ],
  });
  const manifest = JSON.parse(await fs.readFile(result!.manifestPath, 'utf8'));
  const task = await fs.readFile(result!.taskPath, 'utf8');
  assert.deepEqual(manifest.images.locators.map((item: { line: number }) => item.line), [9]);
  assert.deepEqual(manifest.companions[0].missing, ['chat_assets_1/gone.png']);
  assert.deepEqual(manifest.companions[0].unlinked, ['orphan.txt']);
  assert.equal(manifest.model.findings.find((item: { check: string }) => item.check === 'image-loss').category, 'images');
  assert.match(task, /line 9 tool\.execution_complete data\.result\.contents\[1\]`, image\/png, asset `asset-9`/u);
  assert.match(task, /Missing link target: `chat_assets_1\/gone\.png`/u);
  assert.match(task, /src\/verify\/images\.ts/u);
});
