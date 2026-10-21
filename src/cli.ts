import { promises as fs } from 'node:fs';
import { keepFailedExportCopy, readExportCopy, saveExportCopy } from './session/source-snapshot.ts';
import { cleanSourceCache, discardCapture, finishCapture, keepCaptureDuringFailure, leaseCapture, legacySourceCacheSizes, listFailureLogs, listSourceCache, sourceCacheRoot, sourceCacheSize } from './session/source-cache.ts';
import { exportFailureFromReport, failureDetails, writeFailureLog } from './verify/export-failure.ts';
import type { ExportFailure } from './verify/export-failure.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import type { Census } from './types.ts';
import { parseArgs } from './args.ts';
import { installAgentFiles } from './install.ts';
import { loadSession, renderSession } from './index.ts';
import type { FenceRepairs } from './index.ts';
import { formatExportSummary } from './export-summary.ts';
import { getWorkspaceRoot, resolveOutputPath, workspacePath } from './host.ts';
import { looksLikeSessionArgument } from './session/locate.ts';
import { resolveUserDataRoot } from './session/roots.ts';
import { inventorySessions } from './session/inventory.ts';
import { formatSessionListing, formatSessionListingHtml } from './session/listing.ts';
import { collectListingEvidence } from './session/listing-evidence.ts';
import { formatDetailedSessionListingHtml } from './session/detailed-listing.ts';
import { compressDetailedListingHtml } from './session/compressed-listing.ts';
import { defaultListingHtmlPath, writeListingHtml } from './session/listing-report.ts';
import { writeArchive } from './archive-writer.ts';
import type { CompanionArtifact } from './export-policy.ts';
import {
  GENERIC_TOOL_PAYLOAD_KINDS, HANDLED_RESPONSE_KINDS, HANDLED_TOOL_PAYLOAD_KINDS,
  IGNORED_RESPONSE_KINDS, KNOWN_UNSEEN_KINDS, VALIDATED_AGAINST,
} from './session/classify.ts';
import { buildJournalCrossCheck, buildRenderReport, buildVerificationReport } from './verify/layers.ts';
import { buildLossAccount } from './verify/loss-account.ts';
import { buildLocalVerifyJson } from './verify/json-report.ts';
import { readLinkedArchiveCompanions, readLinkedImageCompanions, verifyLocalImages } from './verify/images.ts';
import { buildParserCheck, formatParserCheck, loadMarkdownParser } from './verify/parser-check.ts';
import { printLossAccount } from './verify/loss-report.ts';
import { runSdkCommand } from './sdk-cli.ts';
import {
  GOLDEN_DIGEST_PATH,
  GOLDEN_EXPECTED_RENDER_PATH,
  GOLDEN_FIXTURE_PATH,
  GOLDEN_SCRATCH_OUTPUT,
  GOLDEN_SYNTHETIC_NOTES,
  SNAPSHOT_DIR,
  buildDigest,
  diffDigest,
  normalizeRender,
  snapshotPath,
} from './verify/golden.ts';
import { clip, errorLabel, thousands } from './text.ts';

// Command line front end. Turns a VS Code Copilot chat session into one human-readable Markdown
// archive, or checks an existing one. Full contract, layout, and visual-design rules live in
// docs/SPEC.md - read that first for *why*.
//
// This file is the only one under src/ that prints or exits. Everything it calls returns a value;
// the functions below turn those values into console output. `index.ts` holds the pipeline, so a
// program that wants the same result without the printing imports that instead.
//
// Default is discovery. Exports require an explicit source or --current.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(__dirname, '..');

async function siblingCompanionText (output: string, markdown: string): Promise<string> {
  const companions = await readLinkedArchiveCompanions(markdown, output);
  return companions.filter((item) => item.mediaType.startsWith('text/'))
    .map((item) => Buffer.from(item.bytes).toString('utf8')).join('\n');
}

function printVerificationReport (report: ReturnType<typeof buildVerificationReport>) {
  console.log('Verifier summary');
  console.log(`- Requests (journal): ${report.rawRequestCount}`);
  console.log(`- Turns (parsed): ${report.parsedTurnCount}`);
  console.log(`- Prompt mismatches: ${report.promptMismatches}`);
  console.log(`- Response mismatches: ${report.responseMismatches}`);
  console.log(`- Thought mismatches: ${report.thoughtMismatches}`);
  console.log(`- Tool-call mismatches: ${report.toolMismatches}`);
  console.log(`- Terminal-output mismatches: ${report.terminalMismatches}`);
  console.log(`- Tool-call order mismatches: ${report.orderMismatches}`);
  console.log(`- Thought order mismatches: ${report.thoughtOrderMismatches}`);
  console.log(`- Missing turns: ${report.missingTurns}`);
  console.log(`- Extra turns: ${report.extraTurns}`);
  if (report.crossTurnDuplicates.length) {
    console.log(`- Cross-turn toolCallId duplicates (same id under >1 turn): ${report.crossTurnDuplicates.length}`);
    for (const dup of report.crossTurnDuplicates.slice(0, 10)) {
      console.log(`  - ${dup.toolCallId}:`);
      for (const occ of dup.occurrences)
        console.log(`      turn ${occ.turn} - ${occ.toolId} (${occ.isComplete ? 'complete' : 'incomplete'}): ${occ.summary}`);
    }
  } else {
    console.log('- Cross-turn toolCallId duplicates: none');
  }
  if (report.compactChecks.length) {
    console.log('- Compact checks:');
    for (const check of report.compactChecks) {
      console.log(`  - ${check.requestId}: raw compact response=${check.hasCompactResponseRaw ? 'yes' : 'no'}, parsed compact response=${check.hasCompactResponseParsed ? 'yes' : 'no'}`);
    }
  }
  if (report.mismatches.length) {
    console.log('- Detailed mismatches:');
    for (const mismatch of report.mismatches)
      console.log(`  - [${mismatch.kind}] ${mismatch.requestId || 'n/a'} - ${mismatch.detail}`);
  } else {
    console.log('- Detailed mismatches: none');
  }
}

// Schema-drift report. Unlike the other layers this one does not compare the export to itself:
// it asks whether the journal contained anything this build has no handler for.
function printCensusReport (census: Census) {
  const total = [...census.seen.values()].reduce((sum, count) => sum + count, 0);
  console.log('Schema census (response items vs handled kinds)');
  console.log(`- Response items walked: ${thousands(total)} across ${census.seen.size} distinct kind(s)`);
  console.log(`- Validated against: ${VALIDATED_AGAINST}`);
  const rendered = [...census.seen.entries()]
    .filter(([kind]) => HANDLED_RESPONSE_KINDS.has(kind) || kind === '(implicit text)')
    .sort((left, right) => right[1] - left[1]);
  console.log(`- Handled kinds: ${rendered.map(([kind, count]) => `${kind}=${count}`).join(', ') || 'none'}`);
  const empty = [...census.dropped.entries()].filter(([kind]) => HANDLED_RESPONSE_KINDS.has(kind) || kind === '(no kind or value)');
  console.log(`- Handled but empty (streamed partials): ${empty.map(([kind, count]) => `${kind}=${count}`).join(', ') || 'none'}`);
  const ignored = [...census.dropped.entries()].filter(([kind]) => IGNORED_RESPONSE_KINDS.has(kind));
  console.log(`- Dropped by design: ${ignored.map(([kind, count]) => `${kind}=${count}`).join(', ') || 'none'}`);
  console.log(`- Known but never observed here (not suppressed - reported as unhandled if they appear): ${[...KNOWN_UNSEEN_KINDS].join(', ')}`);
  const payloadKinds = (predicate: (kind: string) => boolean) => [...census.toolData.entries()]
    .filter(([kind]) => predicate(kind))
    .sort((left, right) => right[1] - left[1])
    .map(([kind, count]) => `${kind}=${count}`)
    .join(', ') || 'none';
  console.log(`- toolSpecificData lifted into fields: ${payloadKinds((kind) => HANDLED_TOOL_PAYLOAD_KINDS.has(kind))}`);
  console.log(`- toolSpecificData rendered generically (reviewed): ${payloadKinds((kind) => GENERIC_TOOL_PAYLOAD_KINDS.has(kind))}`);
  if (census.unrecognizedToolData.length) {
    console.log(`- UNRECOGNIZED toolSpecificData kinds: ${census.unrecognizedToolData.length}`);
    for (const [kind, count] of census.unrecognizedToolData)
      console.log(`    ${kind}: ${thousands(count)} occurrence(s)`);
    console.log('    Content still renders, as a generic JSON dump. Lift it in classifyNode, or add the kind to GENERIC_TOOL_PAYLOAD_KINDS once that dump is confirmed acceptable.');
  } else {
    console.log('- Unrecognized toolSpecificData kinds: none');
  }
  if (census.unhandled.length) {
    console.log(`- UNREVIEWED response kinds (strict verification fails until reviewed): ${census.unhandled.length}`);
    for (const [kind, count] of census.unhandled)
      console.log(`    ${kind}: ${thousands(count)} occurrence(s)`);
    console.log('    Unknown response records are retained as raw JSON when their kind is available. Review the payload, then add a semantic branch, approve generic output in GENERIC_RESPONSE_KINDS, or add a deliberate ignore rule.');
  } else {
    console.log('- Unhandled kinds: none');
  }
}

function printJournalCrossCheck (report: ReturnType<typeof buildJournalCrossCheck>) {
  console.log('Raw-journal cross-check (independent tool-call re-derivation)');
  console.log(`- Distinct tool calls (journal walk): ${report.rawToolIds}`);
  console.log(`- Distinct tool calls (parsed turns): ${report.parsedToolIds}`);
  console.log(`- Thinking nodes in journal (incl. streamed partials): ${report.rawThinking}`);
  if (report.dropped.length)
    console.log(`- DROPPED by parser (in journal, absent from turns): ${report.dropped.length} e.g. ${report.dropped.slice(0, 3).join(', ')}`);
  if (report.invented.length)
    console.log(`- INVENTED by parser (in turns, absent from journal): ${report.invented.length} e.g. ${report.invented.slice(0, 3).join(', ')}`);
  if (!report.failed)
    console.log('- Tool-call identity: exact match');
}

function printRenderReport (report: ReturnType<typeof buildRenderReport>, target: string) {
  console.log(`Layer C - rendered file vs parsed turns (${target})`);
  for (const check of report.checks)
    console.log(`  - [${check.ok ? 'PASS' : 'FAIL'}] ${check.name} (${check.detail})`);
}

function printFenceRepairs (repairs: FenceRepairs) {
  repairs.html.length && console.log(`HTML escaped by the exporter: ${repairs.html.length} unclosed comment or raw-text tag(s) in chat text. Each is noted in the export as a representation change.`);
  if (!repairs.early.length && !repairs.turnEnd)
    return;
  const byKind = new Map<string, number>();
  for (const { kind } of repairs.early)
    byKind.set(kind, (byKind.get(kind) || 0) + 1);
  const kinds = [...byKind].map(([kind, count]) => `${kind}=${count}`).join(', ');
  console.log(`Code fences closed by the exporter: ${repairs.early.length} before the end of a turn${kinds ? ` (${kinds})` : ''}, ${repairs.turnEnd} at the end of a turn. Each is noted in the export as a representation change; early closes fail --strict.`);
}

function printDigestDiff (diffs: ReturnType<typeof diffDigest>) {
  for (const diff of diffs)
    console.log(`  - [${diff.path}] expected=${JSON.stringify(diff.expected)} actual=${JSON.stringify(diff.actual)}`);
}

// --- main ---
const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(1);
}
const {
  list: listMode, current: currentMode, verify: verifyMode, strict: strictMode, json: jsonMode,
  showIgnored: showIgnoredMode, last25: last25Mode, fullIds: fullIdsMode, noHtml: noHtmlMode, detailed: detailedMode,
  compression: compressionMode,
  golden: goldenAction, snapshot: snapshotAction,
  installSkill: installSkillTarget,
  workspaceRoot: workspaceRootArg, outDir: outDirArg, positionals: positionalArgs, htmlOutput: htmlOutputArg,
  userDataRoot: userDataRootArg,
  overwrite: overwriteMode,
  keepSource, cache: cacheMode, clean: cleanMode, dryRun, olderThanDays, yes, includeCorpus,
} = parsed.options;

if (cacheMode) {
  try {
    let result = cleanMode ? await cleanSourceCache({ dryRun: true, olderThanDays: olderThanDays ?? undefined, includeCorpus }) : null;
    const entries = result?.entries ?? await listSourceCache();
    console.log(`Private source cache: ${sourceCacheRoot()}`);
    console.log('Created (UTC) | Age (days) | Kind | Bytes | Files | Status | Capture');
    for (const entry of entries) {
      console.log(`${entry.createdAt} | ${Math.max(0, (Date.now() - Date.parse(entry.createdAt)) / 86_400_000).toFixed(2)} | ${entry.kind} | ${entry.bytes} | ${entry.files} | ${entry.active ? 'in use' : entry.kept ? 'kept' : 'temporary'} | ${entry.directory}`);
      result && console.log(`  ${result.selected.some((target) => target.directory === entry.directory) ? 'Eligible' : 'Skipped'}`);
      for (const output of entry.outputs)
        console.log(`  Export: ${output}`);
    }
    console.log(`Total: ${entries.length} captures, ${entries.reduce((sum, entry) => sum + entry.bytes, 0)} bytes.`);
    for (const log of result?.failureLogs ?? await listFailureLogs()) {
      console.log(`Failure log | ${log.modifiedAt} | ${Math.max(0, (Date.now() - Date.parse(log.modifiedAt)) / 86_400_000).toFixed(2)} days | ${log.bytes} bytes | ${log.file}`);
      result && console.log(`  ${result.selectedFailureLogs.some((target) => target.file === log.file) ? 'Eligible' : 'Skipped'}`);
    }
    for (const legacy of await legacySourceCacheSizes())
      console.log(`Legacy cache (report only): ${legacy.directory} | ${legacy.bytes} bytes | ${legacy.files} files`);
    if (result && !dryRun && (result.selected.length || result.selectedFailureLogs.length)) {
      let approved = yes;
      if (!approved && process.stdin.isTTY && process.stdout.isTTY) {
        const prompt = createInterface({ input: process.stdin, output: process.stdout });
        try {
          approved = /^(?:y|yes)$/iu.test((await prompt.question('Delete the eligible captures, their receipts and cached failure logs? [y/N] ')).trim());
        } finally {
          prompt.close();
        }
      }
      if (approved)
        result = await cleanSourceCache({ yes: true, includeCorpus, olderThanDays: olderThanDays ?? undefined, targets: result.selected, failureLogTargets: result.selectedFailureLogs });
      else
        console.log('Nothing deleted. Noninteractive deletion requires --yes; interactive confirmation defaults to No.');
    }
    if (!result || result.dryRun) {
      const size = await sourceCacheSize();
      console.log(`Cache directory: ${size.bytes} bytes including receipts and registrations; external corpus snapshots: ${size.externalSnapshotBytes} bytes.`);
    }
    if (result)
      console.log(`${result.dryRun ? 'Would remove' : 'Removed'} ${result.selected.length} captures and their receipts; ${result.selectedFailureLogs.length} cached failure logs; ${result.dryRun
        ? result.selected.reduce((sum, entry) => sum + entry.bytes, 0) + result.selectedFailureLogs.reduce((sum, log) => sum + log.bytes, 0) : result.freedBytes} bytes ${result.dryRun ? 'eligible' : 'freed'}.`);
    process.exit(0);
  } catch (error) {
    console.error(errorLabel(error));
    process.exit(1);
  }
}

if (installSkillTarget) {
  try {
    const installed = await installAgentFiles(installSkillTarget);
    for (const file of installed)
      console.log(`${file.replaced ? 'Replaced' : 'Created'}: ${file.destination}`);
    process.exit(0);
  } catch (error) {
    console.error(errorLabel(error));
    process.exit(1);
  }
}

async function chooseRoot (roots: readonly string[]) {
  console.log('Select a VS Code user-data root:');
  roots.forEach((root, index) => console.log(`  ${index + 1}. ${root}`));
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await terminal.question('Root number (blank cancels): ')).trim();
    if (!answer)
      return null;
    if (!/^[1-9]\d*$/u.test(answer) || Number(answer) > roots.length)
      throw new Error('Invalid root selection. Retry or pass --user-data-root <path>.');
    return roots[Number(answer) - 1];
  } finally {
    terminal.close();
  }
}

const goldenMode = goldenAction != null;

const firstArgument = goldenMode ? GOLDEN_FIXTURE_PATH : positionalArgs[0];
const firstIsSource = looksLikeSessionArgument(firstArgument);
const sourceArgument = firstIsSource && !currentMode ? firstArgument : undefined;
const outputArgument = goldenMode ? GOLDEN_SCRATCH_OUTPUT : (firstIsSource ? positionalArgs[1] : firstArgument);
if (!listMode && !goldenMode && ((!currentMode && !firstIsSource) || (currentMode && firstIsSource))) {
  console.error('Export/verify/snapshot requires an explicit session UUID, unique short UUID prefix, or .jsonl path, or --current [outputPath].');
  process.exit(1);
}
let selectedRoot: string | undefined;
let fileVerificationReceipt: Awaited<ReturnType<typeof readExportCopy>> | null = null;
try {
  if (verifyMode && outputArgument)
    fileVerificationReceipt = await readExportCopy(path.resolve(outputArgument), sourceArgument ?? '--current');
  if (!fileVerificationReceipt && (listMode || currentMode || userDataRootArg !== null || (firstIsSource && !firstArgument?.endsWith('.jsonl')))) {
    selectedRoot = await resolveUserDataRoot({
      userDataRoot: userDataRootArg ?? undefined,
      choose: process.stdin.isTTY && process.stdout.isTTY ? chooseRoot : undefined,
    });
  }
  if (listMode) {
    if (selectedRoot === undefined)
      throw new Error('Listing requires a resolved user-data root.');
    const inventory = await inventorySessions(selectedRoot);
    const listingOptions = {
      showIgnored: showIgnoredMode,
      last25: last25Mode,
      fullIds: fullIdsMode,
      terminalWidth: process.stdout.columns,
      diagnostics: inventory.diagnostics,
    };
    const generatedAt = new Date();
    let htmlPath: string | null = null;
    if (!noHtmlMode) {
      const destination = htmlOutputArg === null
        ? defaultListingHtmlPath(process.cwd(), generatedAt, detailedMode)
        : path.resolve(htmlOutputArg);
      const html = detailedMode
        ? formatDetailedSessionListingHtml(inventory.occurrences, await collectListingEvidence(inventory.occurrences), listingOptions, generatedAt.toISOString())
        : formatSessionListingHtml(inventory.occurrences, listingOptions, generatedAt.toISOString());
      const output = compressionMode ? compressDetailedListingHtml(html, compressionMode) : html;
      htmlPath = await writeListingHtml(destination, output, overwriteMode);
      if (compressionMode === 'brotli') {
        const brotliBytes = Buffer.byteLength(output);
        const gzipBytes = Buffer.byteLength(compressDetailedListingHtml(html, 'gzip'));
        brotliBytes > gzipBytes && console.warn(`Brotli output (${brotliBytes.toLocaleString('en-US')} bytes) is larger than gzip would be (${gzipBytes.toLocaleString('en-US')} bytes); consider --compression gzip.`);
      }
    }
    console.log(`VS Code user-data root: ${inventory.userDataRoot}\n`);
    console.log(formatSessionListing(inventory.occurrences, listingOptions));
    detailedMode && noHtmlMode && console.warn('Invalid flag combination: --detailed requests an HTML report but --no-html suppresses it. Only the compact console listing was produced.');
    htmlPath && console.log(`HTML report: ${htmlPath}`);
    process.exit(0);
  }
} catch (error) {
  console.error(errorLabel(error));
  process.exit(1);
}
// The golden fixture's "workspace" is the package itself, so its committed render stays
// byte-identical no matter where the package lives or which directory it is run from.
if (!goldenMode && !currentMode && !snapshotAction && sourceArgument !== undefined && !sourceArgument.endsWith('.jsonl')
  && (selectedRoot !== undefined || fileVerificationReceipt?.sdk)) {
  // Agent Host and Copilot CLI chats are not Local journals; the inventory decides which path applies.
  const sdkExit = await runSdkCommand({
    root: selectedRoot ?? '', selector: sourceArgument, outputArgument, outDir: outDirArg ?? null,
    overwrite: overwriteMode, verify: verifyMode, strict: strictMode, json: jsonMode,
    keepSource,
  });
  sdkExit !== null && process.exit(sdkExit);
}
let loaded: Awaited<ReturnType<typeof loadSession>>;
let releaseSavedCopy: (() => Promise<void>) | undefined;
try {
  const savedCopy = fileVerificationReceipt;
  if (savedCopy?.captureDirectory)
    releaseSavedCopy = await leaseCapture(savedCopy.captureDirectory);
  loaded = await loadSession({
    source: sourceArgument,
    current: currentMode,
    userDataRoot: selectedRoot,
    workspaceRoot: workspaceRootArg ?? (goldenMode ? PKG : null),
    outDir: outDirArg,
    snapshotCopy: savedCopy?.copy,
  });
  loaded.copiedSource.kept = !verifyMode && !goldenMode && !snapshotAction && keepSource;
} catch (error) {
  console.error(errorLabel(error));
  process.exit(1);
}
const { location, raw, session } = loaded;

if (verifyMode) {
  const report = buildVerificationReport(session, session.rawRequests || []);
  !jsonMode && printVerificationReport(report);
  !jsonMode && printCensusReport(session.census);
  const crossCheck = buildJournalCrossCheck(session, raw);
  !jsonMode && printJournalCrossCheck(crossCheck);
  let renderReport: ReturnType<typeof buildRenderReport> | null = null;
  let renderSkipReason: 'no-output-path' | 'unreadable-output' | null = null;
  let renderedMarkdown: string | null = null;
  if (outputArgument) {
    const renderPath = path.resolve(getWorkspaceRoot(), outputArgument);
    try {
      const markdown = await fs.readFile(renderPath, 'utf8');
      renderedMarkdown = markdown;
      renderReport = buildRenderReport(session, markdown);
      !jsonMode && printRenderReport(renderReport, workspacePath(renderPath));
    } catch (error) {
      renderSkipReason = 'unreadable-output';
      !jsonMode && console.log(`Layer C - skipped: could not read output file ${outputArgument} (${errorLabel(error)}). Run the export first, then verify against it.`);
    }
  } else {
    renderSkipReason = 'no-output-path';
    !jsonMode && console.log('Layer C - skipped: no output file given. Pass one to enable render checks: --verify <sessionId> <outputFile>');
  }
  const overflow = { assetsDirectory: 'assets', companions: [] as CompanionArtifact[] };
  const fenceRepairs: FenceRepairs = { early: [], turnEnd: 0, html: [] };
  const built = renderSession(loaded, { outputPath: '', gitStatus: '', generatedAt: new Date().toISOString(), overflow, fenceRepairs });
  !jsonMode && printFenceRepairs(fenceRepairs);
  const lossAccount = buildLossAccount(session.rawRequests || [], `${renderedMarkdown ?? built}\n${renderedMarkdown === null
    ? overflow.companions.map((item) => Buffer.from(item.bytes).toString('utf8')).join('\n')
    : await siblingCompanionText(path.resolve(getWorkspaceRoot(), outputArgument!), renderedMarkdown)}`);
  !jsonMode && printLossAccount(lossAccount, renderedMarkdown === null ? 'the Markdown this build would write' : 'the given file');
  const parserCheck = buildParserCheck(renderedMarkdown ?? built, await loadMarkdownParser(), { turns: session.turns.length, strict: strictMode });
  const imageAccount = verifyLocalImages(session.rawRequests ?? [], raw, renderedMarkdown ?? built,
    renderedMarkdown === null ? overflow.companions : await readLinkedImageCompanions(renderedMarkdown, path.resolve(getWorkspaceRoot(), outputArgument!)));
  !jsonMode && console.log(`Images: ${imageAccount.unique} unique, ${imageAccount.found} found, ${imageAccount.missing} missing; ${imageAccount.unresolved} unresolved, ${imageAccount.referenceOnly} reference-only, ${imageAccount.excludedNotSubmitted} excluded-not-submitted.`);
  !jsonMode && console.log(formatParserCheck(parserCheck, renderedMarkdown === null ? 'in-memory build' : 'the given file').join('\n'));
  const json = buildLocalVerifyJson({
    strict: strictMode, report, census: session.census, crossCheck, render: renderReport, renderSkipReason,
    fenceRepairs, loss: lossAccount, lossTarget: renderedMarkdown === null ? 'in-memory' : 'file', parser: parserCheck,
    images: imageAccount,
  });
  if (jsonMode)
    process.stdout.write(`${JSON.stringify(json)}\n`);
  process.exitCode = json.exitCode;
  const verificationFailure = exportFailureFromReport(json, lossAccount.unaccounted);
  if (verificationFailure && loaded.copiedSource.captureDirectory) {
    await finishCapture(loaded.copiedSource.captureDirectory, true);
    const diagnostics = path.join(sourceCacheRoot(), 'failures');
    await fs.mkdir(diagnostics, { recursive: true });
    const log = await writeFailureLog(path.join(diagnostics, 'verification.md'), location.sessionId,
      verificationFailure, loaded.copiedSource.captureDirectory, new Date().toISOString(), loaded.copiedSource.sha256, loaded.versions);
    console.error(`Export verification failed; private source copy kept at: ${loaded.copiedSource.captureDirectory}`);
    console.error(failureDetails(verificationFailure));
    console.error(`Failure log: ${log}`);
  }
  await releaseSavedCopy?.();
  if (!json.exitCode && !outputArgument && loaded.copiedSource.captureDirectory)
    await discardCapture(loaded.copiedSource.captureDirectory);
  process.exit();
}

// Renders in memory rather than writing an export: the digest is the artifact, and nothing in it
// depends on where the file would have gone.
if (snapshotAction) {
  const preview = renderSession(loaded, { outputPath: '', gitStatus: '', generatedAt: new Date().toISOString() });
  const fresh = buildDigest(session, buildRenderReport(session, preview).counts);
  const target = snapshotPath(location.sessionId);
  const shape = `${fresh.turns} turn(s), ${fresh.toolCalls.total} tool call(s), ${fresh.thoughts} thought(s), ${Object.keys(fresh.census.seen).length} kind(s)`;

  if (snapshotAction === 'update') {
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(fresh, null, 2)}\n`, 'utf8');
    console.log(`Snapshot saved for ${location.sessionId}: ${workspacePath(target)}`);
    console.log(`Recorded: ${shape}.`);
    process.exit(0);
  }

  let saved;
  try {
    saved = JSON.parse(await fs.readFile(target, 'utf8'));
  } catch (error) {
    console.error(`Snapshot check: nothing saved for ${location.sessionId} (${errorLabel(error)}). Take one first: --snapshot update ${location.sessionId}`);
    process.exit(2);
  }
  const diffs = diffDigest(saved, fresh);
  if (diffs.length) {
    console.log(`Snapshot check: FAILED, ${diffs.length} field(s) drifted for ${location.sessionId}.`);
    printDigestDiff(diffs);
    console.log(`  If the change was intended, re-record with: --snapshot update ${location.sessionId}`);
    process.exit(2);
  }
  console.log(`Snapshot check: matches exactly for ${location.sessionId} (${shape}).`);
  process.exit(0);
}

let outputPath = resolveOutputPath(outputArgument, session, location, loaded.host.outDir);
let rendered = '';
const exportFenceRepairs: FenceRepairs = { early: [], turnEnd: 0, html: [] };

let outputSize: number;
let companionCount = 0;
let assetsPath: string | null = null;
let exportFailure: ExportFailure | null = null;
try {
  const written = await writeArchive({
    outputPath, generatedAt: new Date().toISOString(), overwrite: goldenMode || overwriteMode,
    ...(!goldenMode ? { verification: {
      capture: loaded.copiedSource.captureDirectory!, sessionId: location.sessionId, sourceHash: loaded.copiedSource.sha256,
      versions: loaded.versions,
      keep: async () => {
        await keepCaptureDuringFailure(loaded.copiedSource.captureDirectory!);
      },
      check: async (stagePath: string): Promise<ExportFailure | null> => {
        const savedMarkdown = await fs.readFile(stagePath, 'utf8');
        const savedText = `${savedMarkdown}\n${await siblingCompanionText(outputPath, savedMarkdown)}`;
        const account = buildLossAccount(session.rawRequests ?? [], savedText);
        const crossCheck = buildJournalCrossCheck(session, raw);
        const report = buildVerificationReport(session, session.rawRequests ?? []);
        const images = verifyLocalImages(session.rawRequests ?? [], raw, savedMarkdown,
          await readLinkedImageCompanions(savedMarkdown, outputPath));
        const parser = buildParserCheck(savedMarkdown, await loadMarkdownParser(), { turns: session.turns.length, strict: strictMode });
        printLossAccount(account, 'the staged file and its linked companions');
        console.log(formatParserCheck(parser, 'the staged file').join('\n'));
        console.log(`Images: ${images.unique} unique, ${images.found} found, ${images.missing} missing; ${images.unresolved} unresolved.`);
        const result = buildLocalVerifyJson({
          strict: strictMode, report, census: session.census, crossCheck,
          render: buildRenderReport(session, savedMarkdown), renderSkipReason: null,
          fenceRepairs: exportFenceRepairs, loss: account, lossTarget: 'file', parser, images,
        });
        return exportFailureFromReport(result, account.unaccounted);
      },
    } } : {}),
    plan: (assetsDirectory, artifactPath) => {
      const overflow = { assetsDirectory, companions: [] as CompanionArtifact[] };
      exportFenceRepairs.early = [];
      exportFenceRepairs.turnEnd = 0;
      exportFenceRepairs.html = [];
      rendered = renderSession(loaded, {
        outputPath: artifactPath,
        gitStatus: loaded.host.gitStatus(),
        generatedAt: new Date().toISOString(),
        overflow,
        fenceRepairs: exportFenceRepairs,
      });
      return {
        markdown: rendered, companions: overflow.companions, diagnostics: [],
        policy: { highFidelity: false, redact: true },
      };
    },
  });
  outputSize = written.markdownBytes;
  companionCount = written.companionPaths.length;
  assetsPath = written.assetsPath;
  outputPath = written.outputPath;
  exportFailure = written.verificationFailure;
  if (exportFailure) {
    console.error(failureDetails(exportFailure));
    console.error(`Failure log: ${written.failureLog}`);
    console.error(`Export verification failed; private source copy kept at: ${loaded.copiedSource.captureDirectory}`);
    process.exitCode = 2;
  }
  written.olderFailedArchive && console.log(`An older .verify-failed.md archive exists: ${written.olderFailedArchive}. It was not deleted.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
for (const line of formatExportSummary({
  sessionId: location.sessionId,
  session,
  resourceCount: loaded.resources.resources.length,
  outputPath: workspacePath(outputPath),
  outputSize,
  verificationFailed: exportFailure !== null,
}))
  console.log(line);
assetsPath && console.log(`Companion files: ${companionCount} in ${workspacePath(assetsPath)} (full text of tool output over 300 lines and 15 KiB)`);
if (session.census.unhandled.length) {
  console.log(`Schema drift: ${session.census.unhandled.length} unreviewed response kind(s) - ${session.census.unhandled.map(([kind, count]) => `${kind}=${count}`).join(', ')}. Unknown payloads are shown as collapsed JSON when available. Run --verify for the full census.`);
  if (strictMode)
    process.exitCode = 2;
}
printFenceRepairs(exportFenceRepairs);
if (strictMode && exportFenceRepairs.early.length)
  process.exitCode = 2;

// Driftless Layer C: check the just-rendered content against the same parse snapshot, so
// no tool calls can accrue between render and check (verifying a stale file on disk drifts
// by exactly the calls made since it was written).
const selfCheck = buildRenderReport(session, rendered);
const selfFailed = selfCheck.checks.filter((check) => !check.ok);
if (selfFailed.length) {
  console.log(`Layer C self-check: ${selfFailed.length} of ${selfCheck.checks.length} render checks FAILED.`);
  for (const check of selfFailed)
    console.log(`  - [FAIL] ${check.name} (${check.detail})`);
  process.exitCode = 2;
} else {
  console.log(`Layer C self-check: all ${selfCheck.checks.length} render checks pass.`);
}

if (!goldenMode) {
  if (exportFailure) {
    await keepFailedExportCopy(outputPath, {
      selector: sourceArgument ?? '--current', source: location.sessionPath,
      copy: loaded.copiedSource, captureDirectory: loaded.copiedSource.captureDirectory,
    }, JSON.stringify(exportFailure));
  } else {
    await saveExportCopy(outputPath, keepSource
      ? { selector: sourceArgument ?? '--current', status: 'kept', source: location.sessionPath,
        copy: loaded.copiedSource, captureDirectory: loaded.copiedSource.captureDirectory }
      : { selector: sourceArgument ?? '--current', status: 'not-kept' });
    if (!keepSource && loaded.copiedSource.captureDirectory)
      await discardCapture(loaded.copiedSource.captureDirectory);
  }
}

if (goldenMode) {
  const fresh = buildDigest(session, selfCheck.counts, GOLDEN_SYNTHETIC_NOTES);
  const freshRender = normalizeRender(rendered);
  if (goldenAction === 'update') {
    await fs.writeFile(GOLDEN_DIGEST_PATH, `${JSON.stringify(fresh, null, 2)}\n`, 'utf8');
    await fs.writeFile(GOLDEN_EXPECTED_RENDER_PATH, freshRender, 'utf8');
    console.log(`Golden digest updated: ${workspacePath(GOLDEN_DIGEST_PATH)}`);
    console.log(`Golden render updated: ${workspacePath(GOLDEN_EXPECTED_RENDER_PATH)}`);
    process.exitCode = 0;
  } else {
    let committed;
    try {
      committed = JSON.parse(await fs.readFile(GOLDEN_DIGEST_PATH, 'utf8'));
    } catch (error) {
      console.log(`Golden check: no committed digest found (${errorLabel(error)}). Run --golden update first.`);
      process.exitCode = 2;
      committed = null;
    }
    if (committed) {
      const diffs = diffDigest(committed, fresh);
      if (diffs.length) {
        console.log(`Golden check: FAILED, ${diffs.length} field(s) drifted from the committed baseline.`);
        printDigestDiff(diffs);
        process.exitCode = 2;
      } else {
        console.log('Golden check: digest matches the committed baseline exactly.');
      }
    }
    let expectedRender = null;
    try {
      expectedRender = normalizeRender(await fs.readFile(GOLDEN_EXPECTED_RENDER_PATH, 'utf8'));
    } catch (error) {
      console.log(`Golden check: no committed render found (${errorLabel(error)}). Run --golden update first.`);
      process.exitCode = 2;
    }
    if (expectedRender != null) {
      const expectedLines = expectedRender.split('\n');
      const freshLines = freshRender.split('\n');
      const drift = [];
      for (let i = 0; i < Math.max(expectedLines.length, freshLines.length) && drift.length < 10; i += 1)
        if (expectedLines[i] !== freshLines[i])
          drift.push({ line: i + 1, expected: expectedLines[i], actual: freshLines[i] });
      if (drift.length) {
        console.log(`Golden check: RENDER FAILED. Expected ${thousands(expectedLines.length)} lines, got ${thousands(freshLines.length)}.`);
        for (const entry of drift) {
          console.log(`  line ${entry.line}:`);
          console.log(`    expected: ${clip(entry.expected ?? '<missing>', 150)}`);
          console.log(`    actual:   ${clip(entry.actual ?? '<missing>', 150)}`);
        }
        console.log(`  Full render kept at ${workspacePath(GOLDEN_SCRATCH_OUTPUT)} for a real diff.`);
        process.exitCode = 2;
      } else {
        console.log(`Golden check: render matches the committed baseline exactly (${thousands(expectedLines.length)} normalized lines).`);
      }
    }
  }
}
