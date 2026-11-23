import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { redactText } from '../redaction.ts';
import { splitSdkSchemaDrift } from '../session/sdk-schema.ts';
import type { VerificationJson } from './json-report.ts';
import { exporterCommit, exporterVersion } from '../version.ts';
import type { ExportFailure } from './export-failure.ts';
import type { ExportSummary } from '../export-summary.ts';

export interface VerificationExplanationInput {
  report?: VerificationJson | null;
  failure?: ExportFailure | null;
  generatedAt: string;
  archivePath: string | null;
  assetsPath?: string | null;
  failureLog?: string | null;
  sourceWarnings?: readonly string[];
  sourceHash?: string | null;
  summary?: ExportSummary | null;
  companionCount?: number;
  capturePath?: string | null;
  olderFailedArchive?: string | null;
}

function count (value: Record<string, number>) {
  return Object.values(value).reduce((sum, item) => sum + item, 0);
}

function failureTotal (report: VerificationJson) {
  return Object.values(report.layerD.unaccounted)
    .reduce((sum, item) => sum + item.partial + item.absent, 0);
}

function warningTotal (report: VerificationJson, sourceWarnings: readonly string[]) {
  return count(report.census.unhandled)
    + count(report.census.unrecognizedToolData)
    + count(report.census.questionWarnings)
    + sourceWarnings.length
    + (report.parser.skipped ? 1 : 0);
}

function hasWarnings (report: VerificationJson, sourceWarnings: readonly string[]) {
  return warningTotal(report, sourceWarnings) > 0
    || report.fenceRepairs.early > 0
    || report.fenceRepairs.turnEnd > 0
    || report.fenceRepairs.htmlEscaped > 0;
}

function number (value: number) {
  return value.toLocaleString('en-US');
}

function reportTime (value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    return value;
  const pad = (item: number) => String(item).padStart(2, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  const offset = `${sign}${hours}${minutes ? `:${pad(minutes)}` : ''}`;
  return `${String(date.getFullYear()).slice(-2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())} ${offset}`;
}

function link (file: string, from: string | null) {
  const target = from ? path.relative(path.dirname(from), file) : path.basename(file);
  return target.replaceAll('\\', '/').split('/').map(encodeURIComponent).join('/');
}

function verdict (report: VerificationJson, sourceWarnings: readonly string[]) {
  if (report.exitCode)
    return ['> [!CAUTION]', '> **Verification failed.** The archive still exists, but don’t treat it as a clean verified copy.'];
  if (hasWarnings(report, sourceWarnings))
    return ['> [!WARNING]', '> **Verification passed with warnings.** The main checks passed. Some records still need review.'];
  return ['> [!TIP]', '> **Verification passed.** The checks found every eligible recorded text piece they tested.'];
}

function diagnosis (report: VerificationJson, sourceWarnings: readonly string[]) {
  const partial = countPartial(report);
  const absent = countAbsent(report);
  const repeated = report.layerD.multiplicity.missing;
  if (report.exitCode) {
    const losses = [
      absent ? `${number(absent)} recorded ${absent === 1 ? 'piece was' : 'pieces were'} absent` : '',
      partial ? `${number(partial)} ${partial === 1 ? 'piece was' : 'pieces were'} only partly found` : '',
      repeated ? `${number(repeated)} repeated ${repeated === 1 ? 'occurrence was' : 'occurrences were'} missing` : '',
    ].filter(Boolean);
    return losses.length
      ? `Verification found that ${losses.join(', ')}.`
      : 'Verification stopped because one or more required checks failed.';
  }
  return hasWarnings(report, sourceWarnings)
    ? 'All required content checks passed, but the run found records or warnings that still need review.'
    : 'All checks passed. The exporter found every eligible recorded text piece it tested.';
}

function countPartial (report: VerificationJson) {
  return Object.values(report.layerD.unaccounted).reduce((sum, item) => sum + item.partial, 0);
}

function countAbsent (report: VerificationJson) {
  return Object.values(report.layerD.unaccounted).reduce((sum, item) => sum + item.absent, 0);
}

function checkStatus (ok: boolean, detail: string) {
  return `${ok ? '✅' : '❌'} ${detail}`;
}

function checkRows (report: VerificationJson) {
  const partial = countPartial(report);
  const absent = countAbsent(report);
  const image = report.images;
  const parserFailures = report.parser.checks.filter((item) => !item.ok).length;
  return [
    ['Recorded text', checkStatus(!report.layerD.failed, `${number(report.layerD.checked)} pieces checked. ${number(partial)} partial. ${number(absent)} absent.`)],
    ['Order', checkStatus(report.layerD.order.outOfOrder === 0, `${number(report.layerD.order.checked)} ordered pieces checked. ${number(report.layerD.order.outOfOrder)} out of order.`)],
    ['Repeated text', checkStatus(report.layerD.multiplicity.missing === 0, `${number(report.layerD.multiplicity.checked)} repeated-text groups checked. ${number(report.layerD.multiplicity.missing)} missing occurrences.`)],
    ['Images', image
      ? checkStatus(!image.failed, `${number(image.unique)} unique. ${number(image.found)} found. ${number(image.missing)} missing. ${number(image.unresolved)} unresolved.`)
      : 'ℹ️ This report had no image check.'],
    ['Markdown structure', report.parser.skipped
      ? `⚠️ Skipped: ${report.parser.skipped}.`
      : checkStatus(parserFailures === 0, `${report.parser.checks.length} checks run. ${parserFailures} failed.`)],
  ];
}

function failureCategories (report: VerificationJson) {
  return Object.entries(report.layerD.totals)
    .filter(([, totals]) => totals.partial || totals.absent)
    .sort(([left, leftTotals], [right, rightTotals]) =>
      (rightTotals.partial + rightTotals.absent) - (leftTotals.partial + leftTotals.absent)
      || left.localeCompare(right));
}

const CONTENT_CATEGORY_MEANINGS: Record<string, string> = {
  'assistant-text': 'assistant messages',
  'compaction-summary': 'summaries Copilot wrote when it compressed older chat context',
  'fusion-phase': 'Fusion phase messages',
  'instruction-update': 'instruction changes recorded during the chat',
  prompt: 'user prompts',
  reasoning: 'readable reasoning text',
  'skill-file': 'skill files loaded for the chat',
  'system-prompt': 'system instructions saved as companion files',
  'tool-detail': 'detailed tool results',
  'tool-error': 'tool error messages',
  'tool-input': 'arguments sent to tools',
  'tool-intent': 'the short action labels shown above tool calls',
  'tool-output': 'text returned by tools',
};

function categoryName (category: string) {
  return CONTENT_CATEGORY_MEANINGS[category] ?? category.replaceAll('-', ' ');
}

function visibleChecks (report: VerificationJson) {
  const lines: string[] = [];
  if (!report.layerD.failed)
    lines.push(`- **Conversation text:** ${number(report.layerD.checked)} recorded pieces kept.`);
  lines.push(`- **Order:** ${number(report.layerD.order.checked)} eligible pieces checked. ${number(report.layerD.order.outOfOrder)} out of order.`);
  if (!report.layerD.multiplicity.missing)
    lines.push(`- **Repeated text:** all ${number(report.layerD.multiplicity.checked)} repeated-text groups kept.`);
  if (report.images) {
    const imageEffect = report.images.missing || report.images.unresolved
      ? 'Verification failed because one or more recorded image companions could not be matched.'
      : 'Image bytes matched their linked companion files.';
    lines.push(`- **Images:** ${number(report.images.found)} of ${number(report.images.unique)} found. ${number(report.images.missing)} missing. ${number(report.images.unresolved)} unresolved. ${imageEffect}`);
  }
  if (report.parser.skipped)
    lines.push(`- **Markdown structure:** skipped because ${report.parser.skipped}.`);
  else {
    const failures = report.parser.checks.filter((check) => !check.ok).length;
    lines.push(`- **Markdown structure:** ${report.parser.checks.length} checks run. ${number(failures)} failed.${failures ? ' The saved file is not laid out as the exporter expected.' : ' Links, headings and code blocks stayed valid.'}`);
  }
  lines.push(
    `- **Markdown repairs:** ${number(report.fenceRepairs.early)} early fence closes. ${number(report.fenceRepairs.turnEnd)} turn-end fence closes. ${number(report.fenceRepairs.htmlEscaped)} HTML escapes.${report.fenceRepairs.early ? ' An early close is a strict verification failure.' : ' No strict-repair failure occurred.'}`,
  );
  return lines;
}

function affectedLocationLines (locations: readonly string[] | undefined) {
  if (!locations?.length)
    return [];
  const groups = new Map<string, number>();
  for (const location of locations)
    groups.set(location, (groups.get(location) ?? 0) + 1);
  const entries = [...groups];
  const lines = entries.slice(0, 5).map(([location, total]) =>
    `- ${location}${total > 1 ? ` (${number(total)} occurrences)` : ''}`);
  const shown = entries.slice(0, 5).reduce((sum, [, total]) => sum + total, 0);
  if (locations.length > shown)
    lines.push(`- ${number(locations.length - shown)} more affected locations weren't shown.`);
  return lines;
}

function localCheckRows (report: VerificationJson) {
  if (!('layerB' in report))
    return [];
  const layerBProblems = report.layerB.missingTurns + report.layerB.extraTurns
    + Object.values(report.layerB.mismatchesByKind).reduce((sum, value) => sum + value, 0);
  const layerCProblems = report.layerC.checks.filter((item) => !item.ok).length;
  return [
    ['Journal and parsed turns', checkStatus(layerBProblems === 0, `${number(report.layerB.rawRequests)} source requests. ${number(report.layerB.parsedTurns)} parsed turns. ${number(layerBProblems)} mismatch(es).`)],
    ['Tool identity', checkStatus(!report.failureReasons.includes('layer-a-tool-ids'), `${number(report.layerA.rawToolIds)} raw IDs. ${number(report.layerA.parsedToolIds)} parsed IDs. ${number(report.layerA.dropped)} dropped. ${number(report.layerA.invented)} invented.`)],
    ['Rendered structure', report.layerC.skipped
      ? `ℹ️ Skipped: ${report.layerC.skipped === 'no-output-path' ? 'no saved archive was supplied' : 'the saved archive could not be read'}.`
      : checkStatus(layerCProblems === 0, `${report.layerC.checks.length} checks run. ${layerCProblems} failed.`)],
  ] as const;
}

function localDetails (report: VerificationJson) {
  if (!('layerB' in report))
    return [];
  const lines = [
    '## Local journal checks',
    '',
    'These checks compare the replayed VS Code journal with the parsed turns and saved Markdown.',
    '',
    '| Check | Result |',
    '| --- | ---: |',
    `| Raw source requests | ${number(report.layerB.rawRequests)} |`,
    `| Parsed turns | ${number(report.layerB.parsedTurns)} |`,
    `| Missing turns | ${number(report.layerB.missingTurns)} |`,
    `| Extra turns | ${number(report.layerB.extraTurns)} |`,
    `| Cross-turn tool identities | ${number(report.layerB.crossTurnDuplicateToolIds)} |`,
  ];
  for (const [kind, total] of Object.entries(report.layerB.mismatchesByKind))
    lines.push(`| Request mismatch: ${kind} | ${number(total)} |`);
  lines.push(
    `| Raw journal tool IDs | ${number(report.layerA.rawToolIds)} |`,
    `| Parsed tool IDs | ${number(report.layerA.parsedToolIds)} |`,
    `| Tool IDs dropped by the parser | ${number(report.layerA.dropped)} |`,
    `| Tool IDs invented by the parser | ${number(report.layerA.invented)} |`,
    '',
  );
  if (report.layerC.skipped) {
    lines.push(`The saved-file structure check was skipped. ${report.layerC.skipped === 'no-output-path'
      ? 'No archive path was supplied.'
      : 'The requested archive could not be read.'}`, '');
  } else {
    lines.push('### Saved Markdown structure', '', '| Check | Result |', '| --- | --- |');
    for (const check of report.layerC.checks)
      lines.push(`| ${check.name} | ${check.ok ? '✅ Pass' : '❌ Fail'} |`);
    lines.push('');
  }
  return lines;
}

const LEFT_OUT_EXPLANATIONS = [
  ['permission prompts', 'Approval and permission records are internal chat controls. The visible result is kept elsewhere in the conversation.'],
  ['hook records', 'Hook start and end records describe automation inside the chat runtime.'],
  ['model request/response copies', 'These copies repeat prompts or responses that the conversation already records.'],
  ['usage and cache checkpoints', 'These are running totals. Adding every checkpoint would count the same usage more than once. The last total goes in the cost report.'],
  ['external-tool duplicates', 'The exporter already keeps the normal tool call and result.'],
] as const;

function omissionReason (name: string) {
  return LEFT_OUT_EXPLANATIONS.find(([key]) => name.includes(key))?.[1]
    ?? 'The project marks this record type as internal or duplicate for export.';
}

function sourceWarningLines (warnings: readonly string[]) {
  return warnings.map((warning) => `- ${redactText(warning).text}`);
}

function failureReasonLines (report: VerificationJson, failure: ExportFailure | null = null) {
  const explanations: Record<string, string> = {
    'layer-a-tool-ids': 'Raw journal tool IDs differ from the parsed tool IDs.',
    'layer-b-mismatch': 'One or more parsed turns differ from their source requests.',
    'turn-count': 'The source request count differs from the parsed turn count.',
    'layer-c': 'The saved Markdown structure differs from the parsed turns.',
    'layer-d': 'Recorded text is partial, absent, out of order or missing a repeated occurrence.',
    'image-loss': 'A required recorded image is missing or could not be verified.',
    'parser-check': 'The Markdown parser check failed or was unavailable in strict mode.',
    'unreadable-output': 'The saved archive could not be read.',
    'unhandled-kind': 'Strict verification found a record type this build has not reviewed.',
    'unrecognized-tool-data': 'Strict verification found a tool-data format this build has not reviewed.',
    'question-not-read': 'Strict verification found a question format that was not fully read.',
    'early-fence-close': 'The exporter had to close a code fence before the turn ended.',
    'verification-error': 'The verifier threw an exception or could not finish.',
  };
  return report.failureReasons.map((reason) => {
    const total = failure?.counts?.[reason];
    return `- \`${reason}\`${total === undefined ? '' : ` (${number(total)})`}: ${explanations[reason] ?? 'This check failed.'}`;
  });
}

function categoryRows (report: VerificationJson) {
  const lines = [
    '## Recorded text by category',
    '',
    'This section mirrors the Layer D category counts in the terminal.',
    '',
    '| Content category | Present | Partial | Absent |',
    '| --- | ---: | ---: | ---: |',
  ];
  for (const [category, totals] of Object.entries(report.layerD.totals)
    .sort(([left], [right]) => left.localeCompare(right)))
    lines.push(`| ${category} | ${number(totals.present)} | ${number(totals.partial)} | ${number(totals.absent)} |`);
  lines.push('');
  return lines;
}

function parserRows (report: VerificationJson) {
  const lines = ['## Markdown structure', ''];
  if (report.parser.skipped) {
    lines.push(`The Markdown parser check was skipped: ${report.parser.skipped}.`, '');
    return lines;
  }
  lines.push('The parser checks whether the saved Markdown has real headings, links and code-block boundaries.', '', '| Check | Result |', '| --- | --- |');
  for (const check of report.parser.checks)
    lines.push(`| ${check.name} | ${checkStatus(check.ok, check.detail)} |`);
  lines.push('', `The parser completed in ${number(report.parser.ms)} ms.`, '');
  return lines;
}

function imageRows (report: VerificationJson) {
  const images = report.images;
  const lines = ['## Image check', ''];
  if (!images) {
    lines.push('No image check ran for this report.', '');
    return lines;
  }
  lines.push(
    '| Result | Count |',
    '| --- | ---: |',
    `| Unique recorded image byte sets | ${number(images.unique)} |`,
    `| Found as linked companion bytes | ${number(images.found)} |`,
    `| Missing | ${number(images.missing)} |`,
    `| Unresolved source data | ${number(images.unresolved)} |`,
    `| Reference only | ${number(images.referenceOnly)} |`,
  );
  'excludedNotSubmitted' in images && lines.push(`| Excluded drafts | ${number(images.excludedNotSubmitted)} |`);
  lines.push('', 'This check compares image bytes. It does not inspect private or sensitive image content.', '');
  return lines;
}

function sourceCensusRows (report: VerificationJson) {
  const drift = report.path === 'sdk'
    ? splitSdkSchemaDrift(Object.entries(report.census.unhandled))
    : null;
  const scoped = count(report.census.seen);
  const lines = [
    '## Source census',
    '',
    `The exporter walked ${number(scoped)} ${report.path === 'sdk' ? 'stored SDK events' : 'Local response records'} in the selected conversation.`,
    '',
    '| Result | Count | Meaning |',
    '| --- | ---: | --- |',
  ];
  if (drift) {
    lines.push(
      `| Unhandled event types | ${number(drift.unhandledEvents.length)} | These event types don't have a reviewed handler |`,
      `| Unsupported payload variants | ${number(drift.unsupportedPayloads.length)} | The event is known, but one or more fields changed |`,
    );
  } else {
    lines.push(`| Unhandled record types | ${number(report.census.unhandled ? Object.keys(report.census.unhandled).length : 0)} | These Local record types don't have a reviewed handler |`);
  }
  lines.push(
    `| Unrecognized tool-data formats | ${number(Object.keys(report.census.unrecognizedToolData).length)} | The tool still renders, but its data format wasn't reviewed |`,
    `| Questions not fully read | ${number(count(report.census.questionWarnings))} | A question format changed or had to be guessed |`,
  );
  if (!drift) {
    lines.push(
      `| Records without renderable output | ${number(count(report.census.dropped))} | Includes reviewed empty streaming records and records intentionally left out |`,
      `| Recorded tool-data families | ${number(Object.keys(report.census.toolData).length)} | Tool payload types counted by the Local parser |`,
    );
  }
  lines.push('');
  return lines;
}

function summarySection (input: VerificationExplanationInput, reportPath: string | null) {
  const summary = input.summary;
  if (!summary)
    return [];
  const lines = [
    '## Export summary',
    '',
    `- Session: ${summary.sessionId}`,
    `- Title: ${summary.title}`,
  ];
  summary.customTitle && lines.push(`- Custom title: ${summary.customTitle}`);
  summary.defaultTitle && lines.push(`- Default title: ${summary.defaultTitle}`);
  lines.push(
    `- First prompt: ${summary.firstPrompt}`,
    `- Last prompt: ${summary.lastPrompt}`,
    `- Session time: ${summary.startedAt} to ${summary.endedAt}`,
    `- Turns: ${number(summary.turns)}`,
    `- Tool calls: ${number(summary.toolCalls)}`,
    `- Readable reasoning items: ${number(summary.reasoningThoughts)}`,
    `- Resources: ${number(summary.resources)}`,
    `- Archive: [${path.basename(summary.outputPath)}](./${link(summary.outputPath, reportPath)}) (${number(summary.outputBytes)} bytes)`,
  );
  input.companionCount !== undefined && input.assetsPath && lines.push(
    `- Companion files: ${number(input.companionCount)} in [${path.basename(input.assetsPath)}](./${link(input.assetsPath, reportPath)})`,
  );
  if (input.olderFailedArchive)
    lines.push(`- Older failed archive kept: [${path.basename(input.olderFailedArchive)}](./${link(input.olderFailedArchive, reportPath)})`);
  lines.push('');
  return lines;
}

function driftLines (report: VerificationJson) {
  const entries = Object.entries(report.census.unhandled);
  if (report.path === 'local') {
    return entries.map(([name, total]) =>
      `- \`${name}\` appeared ${number(total)} ${total === 1 ? 'time' : 'times'}. This Local record type isn't reviewed yet. The exporter may keep its JSON as a warning block.`);
  }
  const drift = splitSdkSchemaDrift(entries);
  return [
    ...drift.unhandledEvents.map(([name, total]) =>
      `- \`${name}\` appeared ${number(total)} ${total === 1 ? 'time' : 'times'}. This SDK event type isn't reviewed yet.`),
    ...drift.unsupportedPayloads.map(([name, total]) =>
      `- \`${name}\` appeared ${number(total)} ${total === 1 ? 'time' : 'times'}. The event type is known, but one or more fields changed. This isn't a failed tool call.`),
  ];
}

function warningSection (input: VerificationExplanationInput, report: VerificationJson) {
  const warnings = input.sourceWarnings ?? [];
  const lines = ['## Warnings and limits', ''];
  if (warnings.length) {
    lines.push('### Export warnings', '', ...sourceWarningLines(warnings), '');
  }
  if (count(report.census.unhandled)) {
    lines.push('### New or changed records', '',
      'Copilot recorded a type of data this exporter doesn’t fully understand yet.',
      '', ...driftLines(report), '');
  }
  if (count(report.census.unrecognizedToolData)) {
    lines.push('### Tool data not yet reviewed', '');
    for (const [name, total] of Object.entries(report.census.unrecognizedToolData))
      lines.push(`- \`${name}\`: ${number(total)} ${total === 1 ? 'record' : 'records'}. The tool still renders, using a generic data block.`);
    lines.push('');
  }
  if (count(report.census.questionWarnings)) {
    lines.push('### Questions not fully read', '');
    for (const detail of report.census.questionWarningDetails) {
      const keys = detail.argumentKeys.length ? ` Arguments seen: ${detail.argumentKeys.map((key) => `\`${key}\``).join(', ')}.` : '';
      lines.push(`- Turn ${detail.turn}, ${detail.title}: ${detail.summary}.${keys}`);
    }
    lines.push('');
  }
  lines.push(
    '### Markdown repairs',
    '',
    `- Code fences closed early: ${number(report.fenceRepairs.early)}.`,
    `- Code fences closed at the end of a turn: ${number(report.fenceRepairs.turnEnd)}.`,
    `- Unsafe HTML openings escaped: ${number(report.fenceRepairs.htmlEscaped)}.`,
    '',
  );
  if (!hasWarnings(report, warnings)) {
    lines.push('No schema, question, parser, or export warnings were reported.', '');
  }
  lines.push(
    '- **What this doesn’t prove:** verification checks the recognized content categories. It doesn’t prove every private source field is understood.',
    '- A text match elsewhere in the file isn’t proof that every placement is ideal.',
    '- Image hash checks prove byte preservation for linked images. They don’t inspect what an image shows.',
    '',
  );
  return lines;
}

function simpleWarnings (report: VerificationJson, sourceWarnings: readonly string[]) {
  const lines: string[] = [];
  if (sourceWarnings.length) {
    lines.push(`- **Export warning:** ${sourceWarnings.length === 1 ? 'one source record needs review' : `${number(sourceWarnings.length)} source warnings need review`}.`);
    lines.push('  - This warning does not make a successful tool call fail.');
    lines.push("  - Part of the stored metadata didn't match the exporter's reviewed format.");
  }
  const drift = 'leftOut' in report ? splitSdkSchemaDrift(Object.entries(report.census.unhandled)) : null;
  if (drift) {
    const unhandledRecords = drift.unhandledEvents.reduce((sum, [, value]) => sum + value, 0);
    const unsupportedRecords = drift.unsupportedPayloads.reduce((sum, [, value]) => sum + value, 0);
    if (drift.unhandledEvents.length) {
      lines.push(`- **New record types:** ${number(drift.unhandledEvents.length)} event ${drift.unhandledEvents.length === 1 ? 'type' : 'types'} across ${number(unhandledRecords)} ${unhandledRecords === 1 ? 'record is' : 'records are'} not reviewed yet.`);
      lines.push('  - The exporter counted them, so they are not silently dropped. Their meaning or display may be incomplete.');
    }
    if (drift.unsupportedPayloads.length) {
      lines.push(`- **Changed fields:** ${number(drift.unsupportedPayloads.length)} known event ${drift.unsupportedPayloads.length === 1 ? 'type' : 'types'} changed across ${number(unsupportedRecords)} ${unsupportedRecords === 1 ? 'record' : 'records'}.`);
      lines.push("  - The known event can still be useful. The new or invalid field wasn't fully understood.");
    }
  } else if (Object.keys(report.census.unhandled).length) {
    lines.push(`- ${number(Object.keys(report.census.unhandled).length)} Local record type(s) aren't reviewed yet.`);
  }
  count(report.census.questionWarnings) && lines.push(
    `- **Questions:** ${number(count(report.census.questionWarnings))} ${count(report.census.questionWarnings) === 1 ? 'record was' : 'records were'} not fully read.`,
  );
  count(report.census.questionWarnings) && lines.push('  - The archived question or answer needs manual review.');
  return lines;
}

function layerDExplanation (report: VerificationJson) {
  const partial = countPartial(report);
  const absent = countAbsent(report);
  const repeated = report.layerD.multiplicity.missing;
  return [
    '## How to read the content check',
    '',
    'The terminal calls this check **Layer D**.',
    'It independently compares text from the original chat with the saved Markdown and linked text files.',
    '',
    '| Result | Plain meaning | Effect |',
    '| --- | --- | --- |',
    '| Present | The complete cleaned source text was found | This item passed |',
    '| Partial | Only part of the source text was found | Verification fails. The item may be clipped or changed |',
    '| Absent | The text was not found in the archive or linked files | Verification fails. The recorded text may be missing |',
    '| Order error | Eligible conversation text moved to a different source position | Verification fails because the replay order changed |',
    '| Missing repeat | The text exists, but a source occurrence is missing | Verification fails because the export has fewer copies |',
    '',
    `This run checked ${number(report.layerD.checked)} recorded text pieces. It found ${number(partial)} partial and ${number(absent)} absent.`,
    `It also checked ${number(report.layerD.multiplicity.checked)} repeated-text groups. It found ${number(repeated)} missing occurrences.`,
    '',
  ];
}

export function verificationExplanationPath (archivePath: string) {
  const extension = path.extname(archivePath);
  return `${archivePath.slice(0, archivePath.length - extension.length)}.verification.md`;
}

export function renderVerificationExplanation (input: VerificationExplanationInput) {
  const { report } = input;
  if (!report) {
    const failure = input.failure;
    const reportPath = input.archivePath ? verificationExplanationPath(input.archivePath) : null;
    const lines = [
      '# Verification report',
      '',
      `Generated: ${reportTime(input.generatedAt)}`,
      '',
      '> [!CAUTION]',
      '> **Verification could not finish.** The archive still exists, but don’t rely on it as verified.',
      '',
      '## What happened',
      '',
      input.archivePath
        ? `The exporter could not finish checking [${path.basename(input.archivePath)}](./${link(input.archivePath, reportPath)}).`
        : 'The exporter could not finish the verification run. No saved archive was checked.',
    ];
    if (input.assetsPath)
      lines.push(`Linked companion files came from [${path.basename(input.assetsPath)}](./${link(input.assetsPath, reportPath)}).`);
    if (input.failureLog)
      lines.push(`**Failure log:** [${path.basename(input.failureLog)}](./${link(input.failureLog, reportPath)}).`);
    if (input.capturePath)
      lines.push(`The exact frozen source was kept at \`${input.capturePath}\`.`);
    lines.push('', '## Failed checks', '');
    for (const reason of failure?.failureReasons ?? ['verification-error'])
      lines.push(`- ${reason}`);
    lines.push(
      '',
      '## What to do next',
      '',
      '- Inspect the failure log before changing code.',
      '- Re-run with the same saved archive and frozen source when possible.',
      '- A crash report is evidence of the failed check, not proof that the archive is otherwise invalid.',
      '',
      '## Reproduction facts',
      '',
      `- Exporter: ${exporterVersion}`,
      `- Build: ${exporterCommit}`,
      ...(input.sourceHash ? [`- Source hash: \`${input.sourceHash}\``] : []),
      '',
    );
    return `${lines.join('\n').trim()}\n`;
  }
  const reportPath = input.archivePath ? verificationExplanationPath(input.archivePath) : null;
  const lines = [
    '# Verification report',
    '',
    `Generated: ${reportTime(input.generatedAt)}`,
    '',
    ...verdict(report, input.sourceWarnings ?? []),
    '',
    '## In one sentence',
    '',
    diagnosis(report, input.sourceWarnings ?? []),
    '',
  ];
  if (input.archivePath) {
    lines.push(`The exporter checked [${path.basename(input.archivePath)}](./${link(input.archivePath, reportPath)}).`);
  } else {
    lines.push('The exporter checked the Markdown it would write. No saved archive was checked.');
  }
  if (input.assetsPath)
    lines.push(`Linked companion files came from [${path.basename(input.assetsPath)}](./${link(input.assetsPath, reportPath)}).`);
  if (input.failureLog)
    lines.push(`**Failure log:** [${path.basename(input.failureLog)}](./${link(input.failureLog, reportPath)}).`);
  if (input.capturePath)
    lines.push(`The exact frozen source was kept at \`${input.capturePath}\`.`);
  lines.push('', ...summarySection(input, reportPath));
  lines.push('## What passed', '', ...visibleChecks(report), '');
  const failed = failureCategories(report);
  if (failed.length) {
    lines.push(
      '## What failed',
      '',
      '**About this check:** the terminal calls it Layer D. It independently compares text from the original chat with the saved archive and linked files.',
      'A **partial** result means only some text was found. An **absent** result means none of that source text was found.',
      `The terminal reports ${number(failureTotal(report))} partial-or-absent failures. It separately reports ${number(report.layerD.multiplicity.missing)} missing repeated occurrences.`,
      '',
      '| Content type | Partial | Absent |',
      '| --- | ---: | ---: |',
    );
    for (const [category, totals] of failed)
      lines.push(`| \`${category}\` - ${categoryName(category)} | ${number(totals.partial)} | ${number(totals.absent)} |`);
    lines.push('');
  }
  const warningLines = simpleWarnings(report, input.sourceWarnings ?? []);
  if (warningLines.length) {
    lines.push('## Warnings to review', '', ...warningLines, '');
    lines.push(report.exitCode
      ? 'These warnings need review, but they don’t explain the content failure above.'
      : 'These warnings need review, but they did not cause the verification checks to fail.');
    lines.push('');
  }
  lines.push(
    '## Your next step',
    '',
    report.exitCode
      ? '- Inspect the verification failures and the failed archive. The problem can be in the exporter, verifier, or recorded data.'
      : '- No content repair is required.',
  );
  if (input.archivePath)
    lines.push(`- Open [${path.basename(input.archivePath)}](./${link(input.archivePath, reportPath)}).`);
  if (input.failureLog)
    lines.push(`- Open the [failure log](./${link(input.failureLog, reportPath)}) for the private machine report. Review it before sharing.`);
  if (input.failure?.locations?.length)
    lines.push('', '### First affected locations', '', ...affectedLocationLines(input.failure.locations));
  lines.push('');

  lines.push('<details>', '<summary><strong>Full terminal details</strong></summary>', '');
  lines.push(...layerDExplanation(report));
  lines.push('## Checks at a glance', '', '| Check | Result |', '| --- | --- |');
  for (const [name, result] of checkRows(report))
    lines.push(`| ${name} | ${result} |`);
  for (const [name, result] of localCheckRows(report))
    lines.push(`| ${name} | ${result} |`);
  lines.push('');
  lines.push(...sourceCensusRows(report));
  lines.push(...localDetails(report));
  lines.push(...categoryRows(report));
  lines.push(...imageRows(report));
  lines.push(...parserRows(report));
  const leftOut = 'leftOut' in report ? report.leftOut : {};
  if (Object.keys(leftOut).length) {
    lines.push('## Intentionally left out', '', 'These records stayed in the original chat data. The exporter counted them but didn’t copy them into the review archive.', '', '| Record type | Count | Why |', '| --- | ---: | --- |');
    for (const [name, total] of Object.entries(leftOut)) {
      const label = name.startsWith('usage and cache checkpoints') ? 'usage and cache checkpoints' : name;
      lines.push(`| ${label} | ${number(total)} | ${omissionReason(name)} |`);
    }
    lines.push('', 'The counts describe stored records, not visible chat actions.', '');
  }
  lines.push(...warningSection(input, report));
  if (report.failureReasons.length) {
    lines.push('## Failed checks', '', ...failureReasonLines(report, input.failure), '');
  }
  lines.push(
    '',
    '## Reproduction facts',
    '',
    `- Chat source: ${report.path === 'sdk' ? 'Agent Host or Copilot CLI' : 'VS Code Local chat'}`,
    `- Checked: ${report.layerD.target === 'file' ? 'the saved archive and linked companion files' : 'a preview that was not saved'}`,
    `- Strict warnings: ${report.strict ? 'fail verification' : 'reported without failing unless another check fails'}`,
    `- Failed checks: ${report.failureReasons.length ? report.failureReasons.join(', ') : 'none'}`,
    `- Exporter: ${exporterVersion}`,
    `- Build: ${exporterCommit}`,
    ...(input.sourceHash ? [`- Source hash: \`${input.sourceHash}\``] : []),
    '',
    '</details>',
    '',
  );
  return `${lines.join('\n').trim()}\n`;
}

function code (error: unknown) {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

export async function writeVerificationExplanation (input: VerificationExplanationInput) {
  if (!input.archivePath)
    return null;
  const requested = verificationExplanationPath(input.archivePath);
  const extension = path.extname(requested);
  const stem = requested.slice(0, requested.length - extension.length);
  const content = renderVerificationExplanation(input);
  for (let suffix = 0; ; suffix += 1) {
    const target = suffix ? `${stem}-${suffix}${extension}` : requested;
    const temporary = path.join(path.dirname(target), `.verification-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
      try {
        await fs.link(temporary, target);
        return target;
      } catch (error) {
        if (code(error) !== 'EEXIST')
          throw error;
      }
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
}
