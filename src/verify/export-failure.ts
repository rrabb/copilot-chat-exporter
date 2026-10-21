import path from 'node:path';
import { promises as fs } from 'node:fs';
import { redactContent, redactText } from '../redaction.ts';
import { DEFAULT_EXPORT_POLICY } from '../export-policy.ts';

export interface ExportFailure {
  failureReasons: string[];
  categories: Record<string, { present: number; partial: number; absent: number }>;
  details: unknown;
  counts?: Record<string, number>;
}

export function exportFailureFromReport (report: {
  exitCode: number;
  failureReasons: string[];
  layerD: { totals: ExportFailure['categories'] };
  images?: { missing: number; unresolved: number };
  parser: { checks: Array<{ ok: boolean }> };
}): ExportFailure | null {
  if (!report.exitCode)
    return null;
  const counts = Object.fromEntries(report.failureReasons.map((reason) => [reason,
    reason === 'image-loss' ? (report.images?.missing ?? 0) + (report.images?.unresolved ?? 0)
      : reason === 'parser-check' ? report.parser.checks.filter((check) => !check.ok).length : 1]));
  return { failureReasons: report.failureReasons, categories: report.layerD.totals, counts, details: report };
}

export function failureDetails (failure: ExportFailure): string {
  return redactText(JSON.stringify(failure.details, null, 2)).text;
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
    `> Kept private source copy: \`${capture.replace(/`/gu, '&#96;').replace(/[\r\n]/gu, ' ')}\``,
    '',
    '',
  ].join('\n');
}

export async function writeFailureLog (output: string, sessionId: string, failure: ExportFailure, capture: string,
  generatedAt: string, sourceHash?: string): Promise<string> {
  const date = new Date(generatedAt);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  const stamp = local.replace(/[-:]/gu, '').slice(2, 15).replace('T', '_');
  const id = sessionId.replace(/[^a-zA-Z0-9_-]/gu, '_').slice(-90) || 'unknown';
  const data = {
    status: 'verification-failed', generatedAt, localTime: local.slice(0, -1),
    utcOffsetMinutes: -date.getTimezoneOffset(), node: process.version, platform: process.platform,
    arguments: process.argv.slice(2), output, capture, sourceHash, ...failure,
  };
  const log = redactContent(JSON.stringify(data, null, 2), DEFAULT_EXPORT_POLICY, { sourceId: sessionId, field: 'verification-failure' }).text;
  for (let suffix = 0; ; suffix++) {
    const file = path.join(path.dirname(output), `failed-${id}-${stamp}${suffix ? `-${suffix}` : ''}.log`);
    try {
      await fs.writeFile(file, `${log}\n`, { flag: 'wx', mode: 0o600 });
      return file;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST'))
        throw error;
    }
  }
}
