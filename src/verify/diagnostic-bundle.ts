import { createHash, randomBytes, randomUUID, createHmac } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitCheckout } from '../host.ts';
import type { ExportFailure, FailureVersions } from './export-failure.ts';
import {
  buildDiagnosticEvidenceModel,
  collectContentDiagnosticEvidence,
  collectSchemaDiagnosticEvidence,
  exactDiagnosticRecords,
} from './diagnostic-evidence.ts';
import type {
  DiagnosticFinding,
  DiagnosticFindingInput,
  SchemaDiagnosticRecord,
} from './diagnostic-evidence.ts';
import { companionLinkStatus } from './images.ts';
import type { CompanionLinkStatus, ImageLocator } from './images.ts';
import type { LossItem } from './loss-account.ts';
import type { LossSequenceEvidence } from './loss-account.ts';
import type { VerificationJson } from './json-report.ts';
import type { ExportOutputHashCheck } from '../session/source-snapshot.ts';
import { SdkEventLineError } from '../session/sdk-events.ts';
import { redactText } from '../redaction.ts';
import { MARK, scanFences } from '../text.ts';
import { exporterCommit, exporterVersion } from '../version.ts';

const INLINE_EVIDENCE_LIMIT = 256 * 1024;
const MAX_LISTED_COMPANIONS = 100;
const MAX_IMAGE_LOCATORS = 20;
const MAX_PARSER_EXCERPTS = 3;
const EXCERPT_RADIUS = 3;
const EXCERPT_LINE_CHARS = 240;

/** Maps verifier failure reasons to the finding categories that drive hints and deduplication. */
const REASON_CATEGORY: Readonly<Record<string, string>> = {
  'companion-loss': 'layer-d',
  'early-fence-close': 'representation',
  'image-loss': 'images',
  'layer-a-tool-ids': 'structure',
  'layer-b-mismatch': 'structure',
  'layer-c': 'structure',
  'layer-d': 'layer-d',
  'parser-check': 'parser',
  'question-not-read': 'question',
  'turn-count': 'structure',
  'unhandled-kind': 'schema-drift',
  'unreadable-output': 'exporter',
  'unrecognized-tool-data': 'schema-drift',
  'verification-error': 'verifier',
};

const REASON_STAGE: Readonly<Record<string, string>> = {
  'early-fence-close': 'render',
  'question-not-read': 'parse',
  'unhandled-kind': 'parse',
  'unrecognized-tool-data': 'normalize',
};

/** The marker text each parser check expects to parse as structure. */
const PARSER_MARKERS: Readonly<Record<string, string>> = {
  'assistant headings parse as headings': MARK.assistantHeading,
  'request headings outside code': MARK.requestHeadingPrefix,
  'section headings parse as headings': '<a id="',
  'turn anchors outside code': `<a id="${MARK.userMessageAnchorId}`,
  'unknown blocks hold exactly one json code block': 'Unreviewed response kind:',
};

export type DiagnosticExceptionStage = 'export' | 'load' | 'verify';

const SAFE_PATH_OPTIONS = new Set(['--tool-group-order']);
const PRIVATE_VALUE_OPTIONS = /(?:auth|cache-dir|copilot-home|key|out-dir|password|root|secret|token|workspace-root)/iu;

interface DiagnosticEvidenceArtifact {
  file: string;
  bytes: number;
  sha256: string;
  kind: 'schema-and-content';
}

interface DiagnosticTaskModel {
  findings: DiagnosticFinding[];
  schema: { groups: Array<{ type: string; count: number; issues: string[] }> };
  content: { groups: Array<{ category: string; status: string; count: number }> };
  sequence: { order: number; multiplicity: number };
}

interface RawRecordIndex {
  file: string;
  bytes: number;
  sha256: string;
  records: number;
  clippedStrings: number;
  index: Array<{ jsonlLine: number; signature: string; type: string; line: number; locator: string }>;
}

interface DiagnosticTaskManifest {
  generatedAt: string;
  provider: string;
  model: DiagnosticTaskModel;
  verification: VerificationJson | null;
  redaction: { commonPatternsFound: number };
  command: string[];
  source: { hash?: string; capturePath?: string };
  archive: { path: string | null; failureLog?: string | null; outputHash?: ExportOutputHashCheck };
  runtime: { copilotVersion: string; vscodeVersion: string; exporterVersion: string; exporterCommit: string; sourceCheckout?: { commit: string; dirtyFiles: number | null } };
  exception: { name: string; message: string; stage: string; frames: string[]; partialReport: boolean; sourceLine?: number; excerpt?: string } | null;
  parserEvidence: ParserEvidence[];
  images: ReturnType<typeof imageEvidence>;
  companions: ReturnType<typeof companionEvidence>;
  replay: { command: string; notes: string[] };
  rawRecords: RawRecordIndex | null;
  /** Where exact evidence sits, as a JSON path inside the named file. */
  exactEvidence: { file: string; content: Array<{ category: string; status: string; path: string; chars: number }> };
}

export interface DiagnosticBundleInput {
  generatedAt: string;
  provider: 'local' | 'sdk';
  sessionId: string;
  command: readonly string[];
  report: VerificationJson | null;
  failure?: ExportFailure | null;
  exception?: unknown;
  /** Where the exception stopped the run. A `verify` stage points at verifier code, not exporter code. */
  exceptionStage?: DiagnosticExceptionStage;
  imageLocators?: readonly ImageLocator[];
  archivePath?: string | null;
  outputHash?: ExportOutputHashCheck;
  diagnosticsDirectory?: string | null;
  assetsPath?: string | null;
  failureLog?: string | null;
  sourceHash?: string;
  capturePath?: string;
  sourceWarnings?: readonly string[];
  versions?: FailureVersions;
  schemaRecords?: readonly SchemaDiagnosticRecord[];
  lossItems?: readonly LossItem[];
  sequenceEvidence?: LossSequenceEvidence;
  verificationDetails?: unknown;
  findings?: readonly DiagnosticFindingInput[];
}

export interface DiagnosticBundlePaths {
  taskPath: string;
  manifestPath: string;
  evidenceDirectory: string | null;
  rawRecordsPath: string | null;
  commonPatternsFound: number;
}

export interface DiagnosticTriggerInput {
  report: VerificationJson | null;
  sourceWarnings?: readonly string[];
  failure?: ExportFailure | null;
  exception?: unknown;
}

function count (values: Readonly<Record<string, number>> | undefined): number {
  return Object.values(values ?? {}).reduce((total, value) => total + value, 0);
}

function providerOf (report: VerificationJson): 'local' | 'sdk' {
  return report.path === 'sdk' ? 'sdk' : 'local';
}

function warningFindings (report: VerificationJson, sourceWarnings: readonly string[]): DiagnosticFindingInput[] {
  const findings: DiagnosticFindingInput[] = [];
  const provider = providerOf(report);
  for (const [type, total] of Object.entries(report.census.unhandled))
    findings.push({
      provider,
      severity: report.strict ? 'failure' : 'warning',
      stage: 'parse',
      category: 'schema-drift',
      check: 'unhandled-record',
      message: `${type} appeared ${total} time${total === 1 ? '' : 's'}.`,
    });
  for (const [type, total] of Object.entries(report.census.unrecognizedToolData))
    findings.push({
      provider,
      severity: report.strict ? 'failure' : 'warning',
      stage: 'normalize',
      category: 'schema-drift',
      check: 'tool-data',
      message: `${type} appeared ${total} time${total === 1 ? '' : 's'} in an unreviewed tool payload.`,
    });
  for (const [type, total] of Object.entries(report.census.questionWarnings))
    findings.push({
      provider,
      severity: report.strict ? 'failure' : 'warning',
      stage: 'parse',
      category: 'question',
      check: 'question-not-read',
      message: `${type} appeared ${total} time${total === 1 ? '' : 's'}.`,
    });
  for (const warning of sourceWarnings)
    findings.push({
      provider,
      severity: 'warning',
      stage: 'parse',
      category: 'source',
      check: 'source-warning',
      message: warning,
    });
  if (report.parser.skipped)
    findings.push({
      provider,
      severity: report.strict ? 'failure' : 'warning',
      stage: 'verify',
      category: 'parser',
      check: 'parser-unavailable',
      message: report.parser.skipped,
    });
  if (report.fenceRepairs.early || report.fenceRepairs.turnEnd || report.fenceRepairs.htmlEscaped)
    findings.push({
      provider,
      severity: report.fenceRepairs.early && report.strict ? 'failure' : 'warning',
      stage: 'render',
      category: 'representation',
      check: 'markdown-repair',
      message: `${report.fenceRepairs.early} early fence close(s), ${report.fenceRepairs.turnEnd} turn-end close(s), ${report.fenceRepairs.htmlEscaped} HTML escape(s). Early kinds: ${Object.entries(report.fenceRepairs.earlyByKind).map(([kind, count]) => `${kind}=${count}`).join(', ') || 'none'}.`,
    });
  if (report.images && (report.images.unresolved || report.images.referenceOnly))
    findings.push({
      provider,
      severity: 'warning',
      stage: 'verify',
      category: 'images',
      check: 'image-reference',
      message: `${report.images.unresolved} unresolved image(s) and ${report.images.referenceOnly} reference-only image(s).`,
    });
  return findings;
}

function failureFindings (report: VerificationJson | null): DiagnosticFindingInput[] {
  if (!report)
    return [];
  return report.failureReasons.map((reason) => reasonFinding(providerOf(report), reason, `Verification failed with ${reason}.`));
}

function reasonFinding (provider: DiagnosticFindingInput['provider'], reason: string, message: string): DiagnosticFindingInput {
  return {
    provider,
    severity: 'failure',
    stage: REASON_STAGE[reason] ?? 'verify',
    category: REASON_CATEGORY[reason] ?? reason,
    check: reason,
    message,
  };
}

/** Drops a generic reason finding when a more specific failure already names the same category. */
function withoutCoveredReasons (generic: readonly DiagnosticFindingInput[], specific: readonly DiagnosticFindingInput[]): DiagnosticFindingInput[] {
  const covered = new Set(specific.filter((finding) => finding.severity === 'failure').map((finding) => finding.category));
  return generic.filter((finding) => !covered.has(finding.category));
}

export function shouldWriteDiagnosticBundle (input: DiagnosticTriggerInput): boolean {
  if (input.exception !== undefined || input.failure || input.report?.exitCode)
    return true;
  const report = input.report;
  if (!report)
    return false;
  return count(report.census.unhandled)
    + count(report.census.unrecognizedToolData)
    + count(report.census.questionWarnings)
    + count(report.census.representationCounts)
    + (input.sourceWarnings?.length ?? 0)
    + (report.parser.skipped ? 1 : 0)
    + report.fenceRepairs.early
    + report.fenceRepairs.turnEnd
    + report.fenceRepairs.htmlEscaped
    + (report.images?.unresolved ?? 0)
    + (report.images?.referenceOnly ?? 0)
    > 0;
}

export function sanitizeDiagnosticArguments (args: readonly string[]): string[] {
  const output: string[] = [];
  let redactNext = false;
  let preserveNext = false;
  let positional = 0;
  for (const arg of args) {
    if (redactNext) {
      output.push('[REDACTED]');
      redactNext = false;
      continue;
    }
    if (preserveNext) {
      output.push(arg);
      preserveNext = false;
      continue;
    }
    if (arg.startsWith('--')) {
      const equals = arg.indexOf('=');
      if (equals > 0) {
        const name = arg.slice(0, equals);
        output.push(PRIVATE_VALUE_OPTIONS.test(name) ? `${name}=[REDACTED]` : arg);
        continue;
      }
      output.push(arg);
      redactNext = PRIVATE_VALUE_OPTIONS.test(arg);
      preserveNext = SAFE_PATH_OPTIONS.has(arg);
      continue;
    }
    if (arg.startsWith('-')) {
      output.push(arg);
      continue;
    }
    positional += 1;
    output.push(`<argument-${positional}>`);
  }
  return output;
}

function exceptionData (error: unknown): { name: string; message: string; stack?: string; sourceLine?: number; excerpt?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...(error instanceof SdkEventLineError ? { sourceLine: error.sourceLine, excerpt: error.excerpt } : {}),
    };
  }
  return { name: typeof error, message: String(error) };
}

/** Project source frames from a stack, as `src/file.ts:line`, innermost first. */
export function projectFrames (stack: string | undefined, limit = 5): string[] {
  const frames: string[] = [];
  for (const match of (stack ?? '').matchAll(/[\\/](src[\\/][\w./\\-]+\.ts):(\d+)/gu)) {
    const frame = `${match[1]!.replaceAll('\\', '/')}:${match[2]}`;
    !frames.includes(frame) && frames.push(frame);
    if (frames.length === limit)
      break;
  }
  return frames;
}

interface ParserEvidence {
  check: string;
  detail: string;
  expectedMarker: string | null;
  markerLines: number;
  markerLinesInsideCode: number;
  excerpts: Array<{ markerLine: number; fenceOpenedAt: number | null; fenceOpener: string | null; startLine: number; lines: string[] }>;
}

function clipLine (line: string): string {
  return line.length > EXCERPT_LINE_CHARS ? `${line.slice(0, EXCERPT_LINE_CHARS)} [${line.length} chars]` : line;
}

/** Finds where each failed parser check's marker sits inside code, the usual cause of a swallowed heading. */
function parserEvidence (report: VerificationJson | null, markdown: string | null): ParserEvidence[] {
  const failed = (report?.parser.checks ?? []).filter((check) => !check.ok);
  if (!failed.length)
    return [];
  const lines = markdown?.split(/\r?\n/u) ?? [];
  const inside = markdown === null ? [] : scanFences(lines).inside;
  return failed.map((check) => {
    const detail = String((check as { detail?: unknown }).detail ?? '');
    const marker = PARSER_MARKERS[check.name] ?? null;
    const hits = marker ? lines.flatMap((line, index) => line.includes(marker) ? [index] : []) : [];
    const insideHits = hits.filter((index) => inside[index]);
    const detailLines = [...detail.matchAll(/line (\d+)/gu)].map((match) => Number(match[1]) - 1);
    const picks = (insideHits.length ? insideHits : detailLines).slice(0, MAX_PARSER_EXCERPTS);
    return {
      check: check.name,
      detail,
      expectedMarker: marker,
      markerLines: hits.length,
      markerLinesInsideCode: insideHits.length,
      excerpts: picks.filter((index) => index >= 0 && index < lines.length).map((index) => {
        let opener = index;
        while (opener > 0 && inside[opener - 1])
          opener -= 1;
        const start = Math.max(0, index - EXCERPT_RADIUS);
        return {
          markerLine: index + 1,
          fenceOpenedAt: inside[index] ? opener + 1 : null,
          fenceOpener: inside[index] ? clipLine(lines[opener]!) : null,
          startLine: start + 1,
          lines: lines.slice(start, index + EXCERPT_RADIUS + 1).map(clipLine),
        };
      }),
    };
  });
}

function imageEvidence (report: VerificationJson | null, locators: readonly ImageLocator[] | undefined) {
  if (!report?.images || !locators?.length)
    return null;
  const missing = new Set(report.images.missingHashes);
  const selected = locators.filter((item) => item.hash === null || missing.has(item.hash));
  return {
    missingHashes: [...missing].sort(),
    locators: selected.slice(0, MAX_IMAGE_LOCATORS),
    omitted: Math.max(0, selected.length - MAX_IMAGE_LOCATORS),
  };
}

function companionEvidence (statuses: readonly CompanionLinkStatus[]) {
  return statuses.map((status) => ({
    assetsFolder: status.assetsFolder,
    linked: status.linked,
    present: status.present.length,
    missing: status.missing,
    unlinked: status.unlinked.slice(0, MAX_LISTED_COMPANIONS),
    unlinkedOmitted: Math.max(0, status.unlinked.length - MAX_LISTED_COMPANIONS),
    files: status.present.slice(0, MAX_LISTED_COMPANIONS),
    filesOmitted: Math.max(0, status.present.length - MAX_LISTED_COMPANIONS),
  }));
}

/** Only a source run lacks a build commit, so only then ask Git which checkout produced the bundle. */
function sourceCheckout (): { commit: string; dirtyFiles: number | null } | undefined {
  if (!exporterCommit.startsWith('source'))
    return undefined;
  return gitCheckout(fileURLToPath(new URL('../..', import.meta.url)));
}

function replayCommand (input: DiagnosticBundleInput, command: readonly string[], archiveExists: boolean): { command: string; notes: string[] } {
  const strict = input.command.includes('--strict') ? ' --strict' : '';
  if (input.archivePath && archiveExists)
    return {
      command: `node src/cli.ts --verify${strict} <session-id> "${path.resolve(input.archivePath)}"`,
      notes: [
        'Run from the exporter checkout. Replace <session-id> with the full session ID or its 8-character prefix.',
        'The verifier reuses the source copy kept beside the archive when one exists.',
      ],
    };
  return {
    command: `node src/cli.ts ${command.join(' ')}`,
    notes: ['Run from the exporter checkout. Replace each <argument-N> with the original value.'],
  };
}

function sourceFingerprint (key: Buffer, value: string): string {
  return createHmac('sha256', key).update(`session\0${value}`).digest('hex').slice(0, 16);
}

function stamp (generatedAt: string): string {
  const value = new Date(generatedAt);
  if (!Number.isFinite(value.getTime()))
    throw new Error('Diagnostic generatedAt must be a valid timestamp.');
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString();
  return local.slice(0, 19).replace(/[-:]/gu, '').replace('T', '-').slice(2);
}

function diagnosticPaths (input: DiagnosticBundleInput): { directory: string; stem: string } {
  if (input.archivePath) {
    const archive = path.resolve(input.archivePath);
    const extension = path.extname(archive);
    return {
      directory: path.dirname(archive),
      stem: `${path.basename(archive, extension)}.diagnostics-${stamp(input.generatedAt)}`,
    };
  }
  if (!input.diagnosticsDirectory)
    throw new Error('Diagnostic output without an archive requires a diagnosticsDirectory.');
  const safeId = createHash('sha256').update(input.sessionId).digest('hex').slice(0, 16);
  return {
    directory: path.resolve(input.diagnosticsDirectory),
    stem: `diagnostics-${safeId}-${stamp(input.generatedAt)}`,
  };
}

function number (value: number): string {
  return value.toLocaleString('en-US');
}

function archiveHashSummary (hash: ExportOutputHashCheck | undefined): string[] {
  if (!hash)
    return [];
  if (hash.state === 'differs-from-export')
    return ['- Archive bytes differ from the completed export. Restore or re-export from the frozen source before changing renderer code. A byte difference does not prove who or what changed the file.'];
  if (hash.state === 'matches-export')
    return ['- Archive bytes match the completed export. The saved file has not changed byte-for-byte since export. Investigate exporter or verifier behavior.'];
  return ['- No completed-export hash is available. Do not infer that the archive is unchanged.'];
}

function renderTask (manifest: DiagnosticTaskManifest, result: DiagnosticBundlePaths): string {
  const model = manifest.model;
  const verification = manifest.verification;
  const redaction = manifest.redaction;
  const failedChecks = (verification?.parser.checks ?? []).filter((check) => !check.ok);
  const lines = [
    '# AI diagnostic task',
    '',
    `Generated: ${String(manifest.generatedAt)}`,
    '',
    '> [!CAUTION]',
    '> This bundle may contain private exact fidelity evidence. Review it locally. Do not upload it automatically.',
    ...(manifest.rawRecords ? ['> The raw records file holds recorded values as written, with only long strings clipped.'] : []),
    '',
    '## Goal',
    '',
    'Diagnose the named exporter or verification problem and propose the smallest source fix.',
    'Do not change tests only to make the current result pass.',
    '',
    '## Observed result',
    '',
    verification
      ? `- Verification exit code: ${verification.exitCode}.`
      : '- The exporter or verifier stopped before a complete verification result existed.',
    ...(verification?.failureReasons.length ? [`- Failure reasons: ${verification.failureReasons.map((reason) => `\`${reason}\``).join(', ')}.`] : []),
    ...archiveHashSummary(manifest.archive.outputHash),
    `- Findings: ${number(model.findings.length)} distinct signature(s).`,
    `- Schema groups: ${number(model.schema.groups.length)}.`,
    `- Content groups: ${number(model.content.groups.length)}.`,
    `- Out-of-order failures: ${number(model.sequence.order)}.`,
    `- Missing-repeat failures: ${number(model.sequence.multiplicity)}.`,
    `- Common sensitive patterns found: ${number(redaction.commonPatternsFound)}. A zero does not prove the bundle is safe.`,
    '',
    '## Findings',
    '',
    ...(model.findings.length
      ? model.findings.map((finding) =>
        `- \`${finding.stage}/${finding.category}/${finding.check}\` (${finding.severity}, ${finding.count}): ${finding.message}${finding.locators.length ? ` Locations: ${finding.locators.map((locator) => `\`${locator}\``).join(', ')}.` : ''}`)
      : ['- No structured warning or failure detail was available. Start with the exception section.']),
    ...renderException(manifest.exception),
    ...(failedChecks.length ? ['', '## Failed parser checks', '', ...renderParser(manifest.parserEvidence)] : []),
    ...renderImages(manifest.images),
    ...renderCompanions(manifest.companions),
    '',
    '## Selected evidence',
    '',
    ...(model.schema.groups.length
      ? model.schema.groups.map((group) =>
        `- Schema \`${group.type}\`: ${number(group.count)} record(s). ${group.issues.join(' ')}`)
      : ['- No selected schema samples.']),
    ...(manifest.exactEvidence.content.length
      ? manifest.exactEvidence.content.map((item) =>
        `- Content \`${item.category}\` (${item.status}, ${number(item.chars)} chars): exact text at \`${item.path}\` in \`${manifest.exactEvidence.file}\`.`)
      : ['- No selected content failures.']),
    ...(manifest.rawRecords
      ? [`- Raw records: ${number(manifest.rawRecords.records)} exact record(s) in \`${manifest.rawRecords.file}\`, one JSON object per line. The manifest \`rawRecords.index\` maps each line to its schema signature and source locator.`]
      : []),
    '',
    '## Evidence policy',
    '',
    '- Schema samples in the manifest keep field names, value types and safe discriminators. Private values and raw IDs stay fingerprinted.',
    '- Raw records keep up to 3 exact records per schema signature. Strings over 2,500 characters keep the first 2,000 and last 500, plus the length and SHA-256.',
    '- Content evidence stays exact only when the failed verifier invariant depends on that text.',
    `- Machine manifest: \`${result.manifestPath}\`.`,
    ...(result.evidenceDirectory ? [`- Large evidence: \`${result.evidenceDirectory}\`.`] : []),
    ...(result.rawRecordsPath ? [`- Raw records: \`${result.rawRecordsPath}\`.`] : []),
    ...(manifest.source.capturePath ? [`- Frozen source capture: \`${manifest.source.capturePath}\`.`] : []),
    ...(manifest.archive.path ? [`- Archive: \`${manifest.archive.path}\`.`] : []),
    ...(manifest.archive.outputHash
      ? [`- Archive bytes: ${manifest.archive.outputHash.state}. Expected export hash: \`${manifest.archive.outputHash.expectedSha256 ?? 'not recorded'}\`. Current hash: \`${manifest.archive.outputHash.actualSha256}\`.`]
      : []),
    ...(manifest.archive.failureLog ? [`- Failure log: \`${manifest.archive.failureLog}\`.`] : []),
    '',
    '## Reproduction facts',
    '',
    `- Provider: ${manifest.provider}.`,
    `- Command: \`${JSON.stringify(manifest.command)}\`.`,
    `- Replay: \`${manifest.replay.command}\``,
    ...manifest.replay.notes.map((note) => `  - ${note}`),
    `- Source hash: \`${manifest.source.hash ?? 'not recorded'}\`.`,
    `- Exporter: ${manifest.runtime.exporterVersion} (${manifest.runtime.exporterCommit}).`,
    ...(manifest.runtime.sourceCheckout
      ? [`- Source checkout: \`${manifest.runtime.sourceCheckout.commit}\`, ${manifest.runtime.sourceCheckout.dirtyFiles ?? 'unknown'} uncommitted file(s).`]
      : []),
    `- Copilot: ${manifest.runtime.copilotVersion}. VS Code: ${manifest.runtime.vscodeVersion}.`,
    '',
    '## Start investigating',
    '',
    ...investigationPaths(model.findings, manifest.exception?.frames ?? []).map((file) => `- \`${file}\``),
    '',
    '## Acceptance checks',
    '',
    '- Reproduce the exact failed invariant with a focused synthetic fixture.',
    '- Keep source order, repeated occurrences and recorded text correct.',
    '- Do not weaken verification to match the current output.',
    '- State any schema field that remains unsupported.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function renderException (exception: DiagnosticTaskManifest['exception']): string[] {
  if (!exception)
    return [];
  return [
    '',
    '## Exception',
    '',
    `- Stage: ${exception.stage}. ${exception.stage === 'verify' ? 'The verifier threw, so suspect verifier code before exporter code.' : 'The exporter threw before verification finished.'}`,
    `- Error: \`${exception.name}\`: ${exception.message}`,
    ...(exception.sourceLine !== undefined ? [`- Source line: ${exception.sourceLine}. Redacted excerpt: \`${exception.excerpt ?? 'unavailable'}\`.`] : []),
    `- Partial verification report: ${exception.partialReport ? 'yes, see `verification` in the manifest' : 'no'}.`,
    ...(exception.frames.length
      ? ['- Project frames, innermost first:', ...exception.frames.map((frame) => `  - \`${frame}\``)]
      : ['- No project source frame was found in the stack. The full stack is in the manifest `exception.stack`.']),
  ];
}

function renderParser (evidence: readonly ParserEvidence[]): string[] {
  const lines: string[] = [];
  for (const item of evidence) {
    lines.push(`- \`${item.check}\`: ${item.detail}`);
    item.expectedMarker && lines.push(`  - Expected marker \`${item.expectedMarker}\` appears on ${item.markerLines} archive line(s), ${item.markerLinesInsideCode} of them inside a code block.`);
    for (const excerpt of item.excerpts) {
      excerpt.fenceOpenedAt && lines.push(`  - Archive line ${excerpt.markerLine} sits inside a code block opened at line ${excerpt.fenceOpenedAt}: \`${excerpt.fenceOpener}\``);
      lines.push(`  - Excerpt from archive line ${excerpt.startLine}:`, '', '    ```text', ...excerpt.lines.map((line) => `    ${line}`), '    ```', '');
    }
  }
  return lines;
}

function renderImages (images: DiagnosticTaskManifest['images']): string[] {
  if (!images || (!images.missingHashes.length && !images.locators.length))
    return [];
  return [
    '',
    '## Missing or unresolved images',
    '',
    `- Missing image hashes: ${images.missingHashes.length ? images.missingHashes.map((hash) => `\`${hash.slice(0, 16)}\``).join(', ') : 'none'}.`,
    ...images.locators.map((item) =>
      `- ${item.hash ? `\`${item.hash.slice(0, 16)}\`` : 'unresolved'} at \`${item.locator}\`${item.mimeType ? `, ${item.mimeType}` : ''}${item.assetId ? `, asset \`${item.assetId}\`` : ''}${item.bytes ? `, ${number(item.bytes)} bytes` : ''}.`),
    ...(images.omitted ? [`- ${images.omitted} more locator(s) are listed only by count.`] : []),
  ];
}

function renderCompanions (companions: DiagnosticTaskManifest['companions']): string[] {
  if (!companions.length)
    return [];
  return [
    '',
    '## Companion links',
    '',
    ...companions.flatMap((folder) => [
      `- \`${folder.assetsFolder}\`: ${folder.linked} live link(s), ${folder.present} file(s) present, ${folder.missing.length} missing, ${folder.unlinked.length + folder.unlinkedOmitted} unlinked.`,
      ...folder.missing.map((target) => `  - Missing link target: \`${target}\``),
      ...folder.unlinked.map((file) => `  - File with no live link: \`${file}\``),
    ]),
  ];
}

function investigationPaths (findings: readonly DiagnosticFinding[], frames: readonly string[]): string[] {
  const paths = new Set<string>(frames.map((frame) => frame.replace(/:\d+$/u, '')));
  for (const finding of findings) {
    if (finding.category === 'schema-evidence' || finding.category === 'schema-drift' || finding.category === 'question') {
      paths.add('src/session/classify.ts');
      paths.add('src/session/sdk-session.ts');
      paths.add('src/session/sdk-event-notes.ts');
      paths.add('src/session/sdk-event-fields.ts');
      paths.add('src/session/questions.ts');
    } else if (finding.category === 'layer-d') {
      paths.add('src/verify/loss-account.ts');
      paths.add('src/verify/sdk-loss-account.ts');
      paths.add('src/markdown.ts');
    } else if (finding.category === 'parser') {
      paths.add('src/verify/parser-check.ts');
      paths.add('src/markdown.ts');
      paths.add('src/text.ts');
    } else if (finding.category === 'representation') {
      paths.add('src/markdown.ts');
      paths.add('src/verify/layers.ts');
    } else if (finding.category === 'images') {
      paths.add('src/verify/images.ts');
      paths.add('src/markdown.ts');
    } else if (finding.category === 'structure') {
      paths.add('src/verify/layers.ts');
      paths.add('src/session/journal.ts');
    } else if (finding.category === 'verifier') {
      paths.add('src/verify/layers.ts');
      paths.add('src/verify/loss-account.ts');
    } else if (finding.category === 'exporter') {
      paths.add('src/cli.ts');
      paths.add('src/sdk-cli.ts');
      paths.add('src/archive-writer.ts');
    }
  }
  return [...paths].sort();
}

async function readArchive (archivePath: string | null | undefined): Promise<{ sha256: string; markdown: string } | null> {
  if (!archivePath)
    return null;
  try {
    const bytes = await fs.readFile(archivePath);
    return { sha256: createHash('sha256').update(bytes).digest('hex'), markdown: bytes.toString('utf8') };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null;
    throw error;
  }
}

function code (error: unknown) {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

export async function writeDiagnosticBundle (input: DiagnosticBundleInput): Promise<DiagnosticBundlePaths | null> {
  if (!shouldWriteDiagnosticBundle(input))
    return null;
  const fingerprintKey = randomBytes(32);
  const schema = collectSchemaDiagnosticEvidence(input.schemaRecords ?? [], {
    fingerprintKey: fingerprintKey.toString('base64'),
    maxSamplesPerSignature: 3,
  });
  const content = collectContentDiagnosticEvidence(input.lossItems ?? []);
  const sequence = input.sequenceEvidence ?? { order: [], multiplicity: [] };
  const automaticEvidenceFindings: DiagnosticFindingInput[] = [
    ...schema.groups.map((group) => ({
      provider: group.provider,
      severity: 'warning' as const,
      stage: 'parse',
      category: 'schema-evidence',
      check: group.type,
      message: `${group.count} schema record${group.count === 1 ? '' : 's'} matched one field signature.`,
      locators: group.locators,
      schemaSignatures: [group.signature],
    })),
    ...content.groups.map((group) => ({
      provider: input.provider,
      severity: 'failure' as const,
      stage: 'verify',
      category: 'layer-d',
      check: group.category,
      message: `${group.count} ${group.status} content piece${group.count === 1 ? '' : 's'}.`,
      locators: group.locations.map((location) =>
        `${location.sourceLine === undefined ? '' : `event line ${location.sourceLine}, `}request ${location.request} ${group.category}`),
      contentSignatures: [group.signature],
    })),
    ...sequence.order.map((item) => ({
      provider: input.provider,
      severity: 'failure' as const,
      stage: 'verify',
      category: 'layer-d',
      check: 'source-order',
      message: `Out-of-order ${item.category} evidence was found.`,
      locators: [`${item.sourceLine === undefined ? '' : `event line ${item.sourceLine}, `}request ${item.request} ${item.category}`],
    })),
    ...sequence.multiplicity.map((item) => ({
      provider: input.provider,
      severity: 'failure' as const,
      stage: 'verify',
      category: 'layer-d',
      check: 'source-multiplicity',
      message: `${item.expected - item.found} repeated ${item.category} occurrence(s) were missing.`,
      locators: [`${item.sourceLine === undefined ? '' : `event line ${item.sourceLine}, `}request ${item.request} ${item.category}`],
    })),
  ];
  const warnings = input.report ? warningFindings(input.report, input.sourceWarnings ?? []) : [];
  const exception = input.exception === undefined ? null : exceptionData(input.exception);
  const exceptionStage = input.exceptionStage ?? 'export';
  const specific: DiagnosticFindingInput[] = [
    ...warnings,
    ...automaticEvidenceFindings,
    ...(input.findings ?? []),
    ...(exception ? [{
      provider: 'exporter',
      severity: 'failure',
      stage: exceptionStage,
      category: exceptionStage === 'verify' ? 'verifier' : 'exporter',
      check: 'exception',
      message: `${exception.name}: ${exception.message}`,
      locators: [
        ...(exception.sourceLine !== undefined ? [`event line ${exception.sourceLine}`] : []),
        ...projectFrames(exception.stack),
      ],
    } satisfies DiagnosticFindingInput] : []),
  ];
  const generic = input.report
    ? failureFindings(input.report)
    : (input.failure?.failureReasons ?? []).map((reason) =>
      reasonFinding(input.provider, reason, `The exporter kept a failed archive for ${reason}.`));
  const findings = [...withoutCoveredReasons(generic, specific), ...specific];
  const model = buildDiagnosticEvidenceModel(findings, schema, content);
  const modelSummary: DiagnosticTaskModel = {
    findings: model.findings,
    schema: { groups: model.schema.groups.map((group) => ({ ...group, samples: [] })) },
    content: { groups: model.content.groups.map((group) => ({ ...group, sample: undefined })) },
    sequence: { order: sequence.order.length, multiplicity: sequence.multiplicity.length },
  };
  const { directory, stem } = diagnosticPaths(input);
  await fs.mkdir(directory, { recursive: true });
  const evidenceText = JSON.stringify({ schema, content, sequence });
  const evidenceBytes = Buffer.from(evidenceText, 'utf8');
  const externalEvidence = evidenceBytes.length > INLINE_EVIDENCE_LIMIT;
  const exactRecords = exactDiagnosticRecords(input.schemaRecords ?? []);
  const rawText = exactRecords.map((record) => JSON.stringify(record)).join('\n');
  const rawBytes = Buffer.from(rawText ? `${rawText}\n` : '', 'utf8');
  const source = {
    provider: input.provider,
    sessionFingerprint: sourceFingerprint(fingerprintKey, input.sessionId),
    hash: input.sourceHash,
    capturePath: input.capturePath,
  };
  const archiveFile = await readArchive(input.archivePath);
  const archive = {
    path: input.archivePath ? path.resolve(input.archivePath) : null,
    sha256: archiveFile?.sha256,
    assetsPath: input.assetsPath,
    failureLog: input.failureLog,
    ...(input.outputHash ? { outputHash: input.outputHash } : {}),
  };
  const companions = archiveFile && input.archivePath
    ? companionEvidence(await companionLinkStatus(archiveFile.markdown, path.resolve(input.archivePath)))
    : [];
  const sanitizedCommand = sanitizeDiagnosticArguments(input.command);
  const checkout = sourceCheckout();
  const exactContentPaths = (root: string) => content.groups.map((group, index) => ({
    category: group.category,
    status: group.status,
    path: `${root}content.groups[${index}].sample.evidence.recordedText`,
    chars: group.sample.chars,
  }));
  for (let suffix = 0; ; suffix += 1) {
    const name = `${stem}${suffix ? `-${suffix}` : ''}`;
    const taskPath = path.join(directory, `${name}.md`);
    const manifestPath = path.join(directory, `${name}.json`);
    const evidenceDirectory = externalEvidence ? path.join(directory, `${name}_evidence`) : null;
    const rawRecordsPath = rawBytes.length ? path.join(directory, `${name}.raw-records.jsonl`) : null;
    let createdEvidence = false;
    let createdRaw = false;
    let createdTask = false;
    let createdManifest = false;
    try {
      let evidenceArtifact: DiagnosticEvidenceArtifact | null = null;
      if (evidenceDirectory) {
        await fs.mkdir(evidenceDirectory, { mode: 0o700 });
        createdEvidence = true;
        const evidencePath = path.join(evidenceDirectory, 'schema-and-content.json');
        await fs.writeFile(evidencePath, evidenceBytes, { flag: 'wx', mode: 0o600 });
        evidenceArtifact = {
          file: path.relative(directory, evidencePath),
          bytes: evidenceBytes.length,
          sha256: createHash('sha256').update(evidenceBytes).digest('hex'),
          kind: 'schema-and-content',
        };
      }
      if (rawRecordsPath) {
        await fs.writeFile(rawRecordsPath, rawBytes, { flag: 'wx', mode: 0o600 });
        createdRaw = true;
      }
      const rawRecords: RawRecordIndex | null = rawRecordsPath ? {
        file: path.basename(rawRecordsPath),
        bytes: rawBytes.length,
        sha256: createHash('sha256').update(rawBytes).digest('hex'),
        records: exactRecords.length,
        clippedStrings: exactRecords.reduce((total, record) => total + record.clippedStrings, 0),
        index: exactRecords.map((record, index) => ({
          jsonlLine: index + 1,
          signature: record.signature,
          type: record.type,
          line: record.line,
          locator: record.locator,
        })),
      } : null;
      // The report is stored once, in `verification`. The failure and exception keep only their own facts.
      const failure = input.failure
        ? { ...input.failure, details: input.report || exception ? undefined : input.failure.details }
        : null;
      const base = {
        schemaVersion: 2,
        bundleId: randomUUID(),
        generatedAt: input.generatedAt,
        provider: input.provider,
        source,
        runtime: {
          node: process.version,
          platform: process.platform,
          vscodeVersion: input.versions?.vscodeVersion ?? 'not recorded',
          copilotVersion: input.versions?.copilotVersion ?? 'not recorded',
          exporterVersion,
          exporterCommit,
          ...(checkout ? { sourceCheckout: checkout } : {}),
        },
        command: sanitizedCommand,
        replay: replayCommand(input, sanitizedCommand, archiveFile !== null),
        archive,
        verification: input.report,
        verificationDetails: input.verificationDetails,
        failure,
        exception: exception ? {
          ...exception,
          stage: exceptionStage,
          frames: projectFrames(exception.stack, 10),
          partialReport: input.report !== null,
        } : null,
        parserEvidence: parserEvidence(input.report, archiveFile?.markdown ?? null),
        images: imageEvidence(input.report, input.imageLocators),
        companions,
        samples: evidenceArtifact ? undefined : { schema, content, sequence },
        evidence: evidenceArtifact,
        exactEvidence: evidenceArtifact
          ? { file: evidenceArtifact.file, content: exactContentPaths('') }
          : { file: path.basename(manifestPath), content: exactContentPaths('samples.') },
        rawRecords,
        model: modelSummary,
        limits: {
          inlineEvidenceLimit: INLINE_EVIDENCE_LIMIT,
          schemaSamplesPerSignature: 3,
          contentSamplesPerSignature: 1,
          rawRecordsPerSignature: 3,
          rawStringHeadChars: 2000,
          rawStringTailChars: 500,
        },
      };
      const scannerInput = JSON.stringify({
        ...base,
        externalEvidenceText: externalEvidence ? evidenceText : undefined,
        rawRecordsText: rawText || undefined,
        redaction: undefined,
      });
      const scanner = redactText(scannerInput);
      const manifest = {
        ...base,
        redaction: {
          schemaMode: 'structural',
          fidelityMode: 'exact-when-required',
          rawRecordsMode: rawRecords ? 'exact-with-long-strings-clipped' : 'none',
          commonPatternsFound: [...scanner.counts.values()].reduce((total, item) => total + item, 0),
          patternCounts: Object.fromEntries(scanner.counts),
          cleanBillOfHealth: false,
        },
      };
      const result = {
        taskPath,
        manifestPath,
        evidenceDirectory: evidenceDirectory ?? null,
        rawRecordsPath,
        commonPatternsFound: manifest.redaction.commonPatternsFound,
      };
      const task = renderTask(manifest, result);
      await fs.writeFile(taskPath, task, { flag: 'wx', mode: 0o600 });
      createdTask = true;
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      createdManifest = true;
      return result;
    } catch (error) {
      createdManifest && await fs.rm(manifestPath, { force: true });
      createdTask && await fs.rm(taskPath, { force: true });
      createdRaw && rawRecordsPath && await fs.rm(rawRecordsPath, { force: true });
      createdEvidence && evidenceDirectory && await fs.rm(evidenceDirectory, { recursive: true });
      if (code(error) === 'EEXIST')
        continue;
      throw error;
    }
  }
}
