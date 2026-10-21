import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { redactContent, redactText } from '../redaction.ts';
import { DEFAULT_EXPORT_POLICY } from '../export-policy.ts';
import { exporterCommit, exporterVersion } from '../version.ts';
import type { LossItem } from './loss-account.ts';

export const FAILURE_LOG_WARNING = 'WARNING: This log may contain session content. Review before sharing.';

export interface FailureVersions {
  vscodeVersion: string;
  copilotVersion: string;
}

export interface ExportFailure {
  failureReasons: string[];
  categories: Record<string, { present: number; partial: number; absent: number }>;
  details: unknown;
  counts?: Record<string, number>;
  locations?: string[];
}

export function exportFailureFromReport (report: {
  exitCode: number;
  failureReasons: string[];
  layerD: { totals: ExportFailure['categories'] };
  images?: { missing: number; unresolved: number };
  parser: { checks: Array<{ ok: boolean }> };
}, missing: readonly Pick<LossItem, 'request' | 'category'>[] = []): ExportFailure | null {
  if (!report.exitCode)
    return null;
  const counts = Object.fromEntries(report.failureReasons.map((reason) => [reason,
    reason === 'image-loss' ? (report.images?.missing ?? 0) + (report.images?.unresolved ?? 0)
      : reason === 'parser-check' ? report.parser.checks.filter((check) => !check.ok).length
        : reason === 'layer-d' ? Math.max(1, Object.values(report.layerD.totals).reduce((sum, item) => sum + item.partial + item.absent, 0)) : 1]));
  return {
    failureReasons: report.failureReasons, categories: report.layerD.totals, counts, details: report,
    locations: missing.map((item) => `request ${item.request} ${item.category}`),
  };
}

export function failureDetails (failure: ExportFailure): string {
  return redactText([
    `Failed checks: ${failure.failureReasons.join(', ')}.`,
    ...Object.entries(failure.counts ?? {}).map(([name, count]) => `${name}: ${count} failed check(s) or item(s).`),
    ...Object.entries(failure.categories).filter(([, count]) => count.partial || count.absent)
      .map(([name, count]) => `${name}: ${count.partial} partial, ${count.absent} absent.`),
    ...locationSummary(failure),
  ].join('\n')).text;
}

function locationSummary (failure: ExportFailure): string[] {
  const locations = failure.locations ?? [];
  return locations.length ? [
    `Missing or partial: ${locations.slice(0, 5).join('; ')}${locations.length > 5 ? `; and ${locations.length - 5} more` : ''}.`,
  ] : [];
}

export function verificationException (error: unknown): ExportFailure {
  return {
    failureReasons: ['verification-error'], categories: {}, counts: { 'verification-error': 1 },
    details: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
  };
}

export function failedArchivePath (output: string, suffix = 0): string {
  const extension = path.extname(output);
  return `${output.slice(0, output.length - extension.length)}.verify-failed${suffix ? `-${suffix}` : ''}.md`;
}

export function failureWarning (failure: ExportFailure, capture: string): string {
  const categories = Object.entries(failure.categories)
    .filter(([, count]) => count.partial || count.absent)
    .map(([name, count]) => `${name}: ${count.partial} partial, ${count.absent} absent`);
  return [
    '> [!WARNING] Verification failed',
    `> Checks: ${failure.failureReasons.join(', ')}.`,
    ...Object.entries(failure.counts ?? {}).map(([name, count]) => `> ${name}: ${count} failed check(s) or item(s).`),
    ...categories.map((line) => `> ${line}`),
    ...locationSummary(failure).map((line) => `> ${line}`),
    `> Kept private source copy: \`${capture.replace(/`/gu, '&#96;').replace(/[\r\n]/gu, ' ')}\``,
    '',
    '',
  ].join('\n');
}

export async function writeFailureLog (output: string, sessionId: string, failure: ExportFailure, capture: string,
  generatedAt: string, sourceHash?: string, versions?: FailureVersions): Promise<string> {
  const date = new Date(generatedAt);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  const stamp = local.replace(/[-:]/gu, '').slice(2, 15).replace('T', '_');
  const id = sessionId.replace(/[^a-zA-Z0-9_-]/gu, '_').slice(-90) || 'unknown';
  const data = {
    status: 'verification-failed', generatedAt, localTime: local.slice(0, -1),
    utcOffsetMinutes: -date.getTimezoneOffset(), node: process.version, platform: process.platform,
    arguments: process.argv.slice(2), output, capture, sourceHash, ...failure,
    exporterVersion, exporterCommit, vscodeVersion: versions?.vscodeVersion ?? 'not recorded',
    copilotVersion: versions?.copilotVersion ?? 'not recorded',
  };
  const log = redactContent(JSON.stringify(data, null, 2), DEFAULT_EXPORT_POLICY, { sourceId: sessionId, field: 'verification-failure' }).text;
  const temporary = path.join(path.dirname(output), `.failure-log-${randomUUID()}.tmp`);
  await fs.writeFile(temporary, `${FAILURE_LOG_WARNING}\n${log}\n`, { flag: 'wx', mode: 0o600 });
  try {
    for (let suffix = 0; ; suffix++) {
      const file = path.join(path.dirname(output), `failed-${id}-${stamp}${suffix ? `-${suffix}` : ''}.log`);
      try {
        await fs.link(temporary, file);
        return file;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST'))
          throw error;
      }
    }
  } finally {
    await fs.unlink(temporary);
  }
}
