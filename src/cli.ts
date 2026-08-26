import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Census } from './types.ts';
import { parseArgs } from './args.ts';
import { installAgentFiles } from './install.ts';
import { loadSession, renderSession } from './index.ts';
import { getWorkspaceRoot, resolveOutputPath, workspacePath } from './host.ts';
import { listSessions, looksLikeSessionArgument } from './session/locate.ts';
import {
  GENERIC_TOOL_PAYLOAD_KINDS, HANDLED_RESPONSE_KINDS, HANDLED_TOOL_PAYLOAD_KINDS,
  IGNORED_RESPONSE_KINDS, KNOWN_UNSEEN_KINDS, VALIDATED_AGAINST,
} from './session/classify.ts';
import { buildJournalCrossCheck, buildRenderReport, buildVerificationReport } from './verify/layers.ts';
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
// Modes: export (default), `--list`, `--verify [--strict]`, and `--golden check|update`.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(__dirname, '..');

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
  console.log(`- Compact-response reattachments: ${report.compactReattached}`);
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
    console.log(`- UNHANDLED kinds (content dropped in silence): ${census.unhandled.length}`);
    for (const [kind, count] of census.unhandled)
      console.log(`    ${kind}: ${thousands(count)} occurrence(s)`);
    console.log('    Add a classifyNode branch, or add the kind to IGNORED_RESPONSE_KINDS if it carries no content.');
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
  list: listMode, verify: verifyMode, strict: strictMode,
  golden: goldenAction, snapshot: snapshotAction,
  installSkill: installSkillTarget,
  workspaceRoot: workspaceRootArg, outDir: outDirArg, positionals: positionalArgs,
} = parsed.options;

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

if (listMode) {
  const sessions = await listSessions({ withTitles: true });
  console.log(`Found ${sessions.length} chat session(s):\n`);
  for (const session of sessions) {
    const date = new Date(session.mtimeMs).toISOString().slice(0, 16).replace('T', ' ');
    console.log(`${session.sessionId}  ${date}  ${session.title || '(untitled)'}`);
  }
  console.log('\nExport one with: npm run ai:export:chat -- <sessionId> [outputPath]');
  console.log('Verify one with: npm run ai:export:chat -- --verify <sessionId>');
  process.exit(0);
}

const goldenMode = goldenAction != null;

const firstArgument = goldenMode ? GOLDEN_FIXTURE_PATH : positionalArgs[0];
const firstIsSource = looksLikeSessionArgument(firstArgument);
const sourceArgument = firstIsSource ? firstArgument : undefined;
const outputArgument = goldenMode ? GOLDEN_SCRATCH_OUTPUT : (firstIsSource ? positionalArgs[1] : firstArgument);
// The golden fixture's "workspace" is the package itself, so its committed render stays
// byte-identical no matter where the package lives or which directory it is run from.
const loaded = await loadSession({
  source: sourceArgument,
  workspaceRoot: workspaceRootArg ?? (goldenMode ? PKG : null),
  outDir: outDirArg,
});
const { location, raw, session } = loaded;

if (verifyMode) {
  const report = buildVerificationReport(session, session.rawRequests || []);
  printVerificationReport(report);
  printCensusReport(session.census);
  const crossCheck = buildJournalCrossCheck(session, raw);
  printJournalCrossCheck(crossCheck);
  let renderFailed = false;
  if (outputArgument) {
    const renderPath = path.resolve(getWorkspaceRoot(), outputArgument);
    try {
      const markdown = await fs.readFile(renderPath, 'utf8');
      const renderReport = buildRenderReport(session, markdown);
      printRenderReport(renderReport, workspacePath(renderPath));
      renderFailed = renderReport.failed;
    } catch (error) {
      console.log(`Layer C - skipped: could not read output file ${outputArgument} (${errorLabel(error)}). Run the export first, then verify against it.`);
    }
  } else {
    console.log('Layer C - skipped: no output file given. Pass one to enable render checks: --verify <sessionId> <outputFile>');
  }
  const failed = report.mismatches.length > 0 || report.rawRequestCount !== report.parsedTurnCount || crossCheck.failed || renderFailed
    || (strictMode && (session.census.unhandled.length > 0 || session.census.unrecognizedToolData.length > 0));
  process.exit(failed ? 2 : 0);
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

const outputPath = resolveOutputPath(outputArgument, session, location, loaded.host.outDir);
const rendered = renderSession(loaded, {
  outputPath,
  gitStatus: loaded.host.gitStatus(),
  generatedAt: new Date().toISOString(),
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, rendered, 'utf8');
const output = await fs.stat(outputPath);
const toolCallCount = session.turns.reduce((sum, turn) => sum + turn.toolNodes.length, 0);
const thoughtCount = session.turns.reduce((sum, turn) => sum + turn.reasoning.length, 0);
console.log(`Exported session ${location.sessionId} (${session.customTitle || 'untitled'}).`);
console.log(`Turns: ${session.turns.length}; tool calls: ${toolCallCount}; reasoning thoughts: ${thoughtCount}; resources: ${loaded.resources.resources.length}.`);
console.log(`Output: ${workspacePath(outputPath)} (${thousands(output.size)} bytes)`);
if (session.census.unhandled.length) {
  console.log(`Schema drift: ${session.census.unhandled.length} unhandled node kind(s) - ${session.census.unhandled.map(([kind, count]) => `${kind}=${count}`).join(', ')}. Run --verify for the full census.`);
  if (strictMode)
    process.exitCode = 2;
}

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
