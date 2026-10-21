// Machine-readable verify output for `--verify --json`, consumed by scripts/verify-corpus.mjs.
//
// Holds counts, kind names, check names and exit reasons only. Recorded text, prompts, samples
// and tool-call IDs stay out, so a corpus result file can be shared without exposing chat content.

import type { Census } from '../types.ts';
import type { FenceRepairs } from '../markdown.ts';
import type { LossAccount } from './loss-account.ts';
import { parserCheckJson } from './parser-check.ts';
import type { ParserCheckResult } from './parser-check.ts';
import type { ImageAccount } from './images.ts';

// Version 2 added the `parser` section and the `parser-check` failure reason.
// Version 3 adds independent image accounting and the `image-loss` failure reason.
export const VERIFY_JSON_VERSION = 3;

interface VerificationCounts {
  rawRequestCount: number;
  parsedTurnCount: number;
  missingTurns: number;
  extraTurns: number;
  crossTurnDuplicates: unknown[];
  mismatches: Array<{ kind: string }>;
}

interface CrossCheckCounts {
  rawToolIds: number;
  parsedToolIds: number;
  rawThinking: number;
  dropped: unknown[];
  invented: unknown[];
  failed: boolean;
}

interface RenderChecks {
  checks: Array<{ name: string; ok: boolean }>;
  failed: boolean;
}

function tally<T> (items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items)
    out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}

export function lossJson (account: LossAccount) {
  const unaccounted: Record<string, { partial: number; absent: number }> = {};
  for (const item of account.unaccounted) {
    const entry = unaccounted[item.category] ??= { partial: 0, absent: 0 };
    item.status === 'absent' ? (entry.absent += 1) : item.status === 'partial' && (entry.partial += 1);
  }
  return {
    checked: account.checked,
    totals: account.totals,
    unaccounted,
    order: account.order,
    multiplicity: account.multiplicity,
    failed: account.failed,
  };
}

const censusJson = (census: Census) => ({
  seen: Object.fromEntries(census.seen),
  unhandled: Object.fromEntries(census.unhandled),
  unrecognizedToolData: Object.fromEntries(census.unrecognizedToolData),
  representationCounts: census.representationCounts ?? {},
});

function fenceRepairsJson (repairs: FenceRepairs) {
  return { early: repairs.early.length, earlyByKind: tally(repairs.early, (item) => item.kind), turnEnd: repairs.turnEnd, htmlEscaped: repairs.html.length, htmlEscapedByKind: tally(repairs.html, (item) => item.kind) };
}

export function buildLocalVerifyJson (input: {
  strict: boolean;
  report: VerificationCounts;
  census: Census;
  crossCheck: CrossCheckCounts;
  render: RenderChecks | null;
  renderSkipReason: 'no-output-path' | 'unreadable-output' | null;
  fenceRepairs: FenceRepairs;
  loss: LossAccount;
  lossTarget: 'file' | 'in-memory';
  parser: ParserCheckResult;
  images?: ImageAccount;
}) {
  const { strict, report, census, crossCheck, render, fenceRepairs, loss } = input;
  // Same conditions as the text report's exit code, named so a corpus run can group failures.
  const reasons: string[] = [];
  report.mismatches.length && reasons.push('layer-b-mismatch');
  report.rawRequestCount !== report.parsedTurnCount && reasons.push('turn-count');
  crossCheck.failed && reasons.push('layer-a-tool-ids');
  render?.failed && reasons.push('layer-c');
  input.parser.failed && reasons.push('parser-check');
  input.images?.failed && reasons.push('image-loss');
  if (strict) {
    census.unhandled.length && reasons.push('unhandled-kind');
    census.unrecognizedToolData.length && reasons.push('unrecognized-tool-data');
    loss.failed && reasons.push('layer-d');
    fenceRepairs.early.length && reasons.push('early-fence-close');
  }
  return {
    version: VERIFY_JSON_VERSION,
    path: 'local',
    strict,
    exitCode: reasons.length ? 2 : 0,
    failureReasons: reasons,
    layerB: {
      rawRequests: report.rawRequestCount,
      parsedTurns: report.parsedTurnCount,
      missingTurns: report.missingTurns,
      extraTurns: report.extraTurns,
      crossTurnDuplicateToolIds: report.crossTurnDuplicates.length,
      mismatchesByKind: tally(report.mismatches, (item) => item.kind),
    },
    census: censusJson(census),
    layerA: {
      rawToolIds: crossCheck.rawToolIds,
      parsedToolIds: crossCheck.parsedToolIds,
      rawThinking: crossCheck.rawThinking,
      dropped: crossCheck.dropped.length,
      invented: crossCheck.invented.length,
    },
    layerC: render
      ? { skipped: null, checks: render.checks.map(({ name, ok }) => ({ name, ok })), failed: render.failed }
      : { skipped: input.renderSkipReason, checks: [], failed: false },
    fenceRepairs: fenceRepairsJson(fenceRepairs),
    layerD: { target: input.lossTarget, ...lossJson(loss) },
    ...(input.images ? { images: input.images } : {}),
    parser: parserCheckJson(input.parser),
  };
}

export function buildSdkVerifyJson (input: {
  strict: boolean;
  census: Census;
  leftOut: Map<string, number>;
  loss: LossAccount;
  parser: ParserCheckResult;
  fenceRepairs: FenceRepairs;
  images?: ImageAccount;
}) {
  const { strict, census, loss } = input;
  const reasons: string[] = [];
  input.parser.failed && reasons.push('parser-check');
  input.images?.failed && reasons.push('image-loss');
  if (strict) {
    census.unhandled.length && reasons.push('unhandled-kind');
    loss.failed && reasons.push('layer-d');
    input.fenceRepairs.early.length && reasons.push('early-fence-close');
  }
  return {
    version: VERIFY_JSON_VERSION,
    path: 'sdk',
    strict,
    exitCode: reasons.length ? 2 : 0,
    failureReasons: reasons,
    census: censusJson(census),
    leftOut: Object.fromEntries(input.leftOut),
    fenceRepairs: fenceRepairsJson(input.fenceRepairs),
    layerD: { target: 'in-memory' as const, ...lossJson(loss) },
    ...(input.images ? { images: input.images } : {}),
    parser: parserCheckJson(input.parser),
  };
}
