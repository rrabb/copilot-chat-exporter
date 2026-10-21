// Command path for Agent Host and Copilot CLI chats. The Local path stays in cli.ts.

import { DEFAULT_EXPORT_POLICY } from './export-policy.ts';
import { writeArchive } from './archive-writer.ts';
import { createHostContext, resolveOutputPath, setWorkspaceRoot, workspacePath } from './host.ts';
import { formatExportSummary } from './export-summary.ts';
import { inventorySessions } from './session/inventory.ts';
import { readSdkScope, readUsageForSource, renderSdkExport, selectSdkSession } from './session/sdk-export.ts';
import type { SdkExport } from './session/sdk-export.ts';
import { buildSdkLossAccount } from './verify/sdk-loss-account.ts';
import { printLossAccount } from './verify/loss-report.ts';
import { buildSdkVerifyJson } from './verify/json-report.ts';
import { buildParserCheck, formatParserCheck, loadMarkdownParser } from './verify/parser-check.ts';
import { errorLabel } from './text.ts';
import { readLinkedArchiveCompanions, verifySdkImages } from './verify/images.ts';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { existingUserDataSnapshot, keepFailedExportCopy, readExportCopy, saveExportCopy, verifySourceCopy } from './session/source-snapshot.ts';
import { snapshotSdkSelection } from './session/sdk-capture.ts';
import type { SdkCapture } from './session/sdk-capture.ts';
import { discardCapture, finishCapture, keepCaptureDuringFailure, leaseCapture, sourceCacheRoot } from './session/source-cache.ts';
import { exportFailureFromReport, failureDetails, failureWarning, verificationException, writeFailureLog } from './verify/export-failure.ts';
import type { ExportFailure } from './verify/export-failure.ts';

export interface SdkCommandOptions {
  root: string;
  selector: string;
  outputArgument: string | undefined;
  outDir: string | null;
  overwrite: boolean;
  verify: boolean;
  strict: boolean;
  json?: boolean;
  keepSource?: boolean;
}

/** Returns an exit code, or null when the selector is not an Agent Host or Copilot CLI chat. */
export async function runSdkCommand (options: SdkCommandOptions): Promise<number | null> {
  try {
    return await runSdkCommandFromCopy(options);
  } catch (error) {
    console.error(errorLabel(error));
    return 1;
  }
}

async function runSdkCommandFromCopy (options: SdkCommandOptions): Promise<number | null> {
  const receipt = options.verify && options.outputArgument
    ? await readExportCopy(path.resolve(options.outputArgument), options.selector) : null;
  if (receipt && !receipt.sdk && !receipt.root)
    return null;
  if (receipt?.sdk) {
    const release = await leaseCapture(receipt.sdk.directory);
    try {
      return await runSdkSnapshotCommand(options, receipt.sdk);
    } finally {
      await release();
    }
  }
  const root = receipt?.root ?? options.root;
  const existing = await existingUserDataSnapshot(root);
  const inventory = await inventorySessions(root, { copilotHome: existing?.copilotHome, identityOnly: true });
  const selection = selectSdkSession(inventory.occurrences, options.selector);
  if (selection === null)
    return null;
  if (Array.isArray(selection)) {
    console.error(`"${options.selector}" matches ${selection.length} Agent Host or Copilot CLI chats. Use an exact chat key from this list:`);
    for (const item of selection)
      console.error(`  ${item.occurrence.sessionId}  (backing ${item.source.sessionId})  ${item.occurrence.title || '(untitled)'}`);
    return 1;
  }
  const capture = await snapshotSdkSelection(selection);
  let kept = false;
  try {
    return await runSdkSnapshotCommand(options, capture, () => { kept = true; });
  } finally {
    if (!kept)
      await discardCapture(capture.directory);
  }
}

async function runSdkSnapshotCommand (options: SdkCommandOptions, capture: SdkCapture, keepSnapshot?: () => void): Promise<number> {
  const { occurrence, source } = capture.selection;
  const sourceCopy = capture.copy;
  for (const file of capture.files)
    await verifySourceCopy(file);
  sourceCopy.kept = options.keepSource === true || !keepSnapshot;
  const displaySource = { ...source, path: sourceCopy.source };
  const title = occurrence.title || '(untitled)';
  let writtenOutput: string | undefined;
  const keepVerificationFailure = async (failure: ExportFailure) => {
    keepSnapshot?.();
    await finishCapture(capture.directory, true);
    const diagnostics = path.join(sourceCacheRoot(), 'failures');
    await fs.mkdir(diagnostics, { recursive: true });
    const log = await writeFailureLog(path.join(diagnostics, 'verification.md'), source.sessionId,
      failure, capture.directory, new Date().toISOString(), sourceCopy.sha256);
    console.error(failureWarning(failure, capture.directory));
    console.error(failureDetails(failure));
    console.error(`Failure log: ${log}`);
  };
  const keepFailure = async (outputPath: string, failure: string) => {
    keepSnapshot?.();
    console.error(`Export verification failed; private source copy kept at: ${capture.directory}`);
    await keepFailedExportCopy(outputPath, {
      selector: options.selector, sdk: capture, captureDirectory: capture.directory, copy: sourceCopy,
    }, failure);
  };
  try {
    const events = await readSdkScope(source);
    const ledger = readUsageForSource(source);
    if (options.verify) {
      const preview = renderSdkExport(events, displaySource, { title, assetsDirectory: 'assets', outputPath: '', generatedAt: new Date().toISOString(), ledger, sourceCopy });
      if (options.outputArgument) {
        const outputPath = path.resolve(options.outputArgument);
        preview.markdown = await fs.readFile(outputPath, 'utf8');
        preview.companions = await readLinkedArchiveCompanions(preview.markdown, outputPath);
      }
      let failure: ExportFailure | null = null;
      const exitCode = await verifyReport(preview, options.strict, options.json === true, Boolean(options.outputArgument),
        (report) => { failure = exportFailureFromReport(report); });
      failure && await keepVerificationFailure(failure);
      return exitCode;
    }
    const host = await createHostContext({ hashRoot: '', workspaceRoot: null, outDir: options.outDir });
    setWorkspaceRoot(host.workspaceRoot);
    const firstPrompt = events.find((event) => event.type === 'user.message' && event.agentId === undefined);
    const stamp = Date.parse(firstPrompt?.timestamp ?? '');
    const naming = {
      title, customTitle: '', creationDate: Number.isFinite(stamp) ? stamp : null,
      turns: [{ ts: Number.isFinite(stamp) ? stamp : null, prompt: String(firstPrompt?.data.content ?? '') }],
    };
    const nativeId = occurrence.sessionId.replace(/^.*?:\//u, '').split('#')[0]!.split('/')[0]!;
    const outputPath = resolveOutputPath(options.outputArgument, naming, { sessionId: nativeId, sessionPath: source.path, hashRoot: '' }, host.outDir);
    let last: SdkExport | null = null;
    const generatedAt = new Date().toISOString();
    const written = await writeArchive({
      outputPath, generatedAt, overwrite: options.overwrite,
      verification: {
        capture: capture.directory, sessionId: source.sessionId, sourceHash: sourceCopy.sha256,
        keep: async () => {
          keepSnapshot?.();
          await keepCaptureDuringFailure(capture.directory);
          console.error(`Export verification failed; private source copy kept at: ${capture.directory}`);
        },
        check: async (stagePath) => {
          if (!last)
            throw new Error('The export plan was not produced.');
          last.markdown = await fs.readFile(stagePath, 'utf8');
          last.companions = await readLinkedArchiveCompanions(last.markdown, outputPath);
          let failure: ExportFailure | null = null;
          await verifyReport(last, options.strict, false, true, (report) => {
            failure = exportFailureFromReport(report);
          });
          return failure;
        },
      },
      plan: (assetsDirectory) => {
        last = renderSdkExport(events, displaySource, { title, assetsDirectory, outputPath, generatedAt, ledger, sourceCopy });
        return { markdown: last.markdown, companions: last.companions, diagnostics: [], policy: { ...DEFAULT_EXPORT_POLICY } };
      },
    });
    writtenOutput = written.outputPath;
    const result = last as SdkExport | null;
    if (!result)
      throw new Error('The export plan was not produced.');
    const exitCode = written.verificationFailure ? 2 : 0;
    if (written.verificationFailure) {
      console.error(failureWarning(written.verificationFailure, capture.directory));
      console.error(failureDetails(written.verificationFailure));
      console.error(`Failure log: ${written.failureLog}`);
      await keepFailure(written.outputPath, JSON.stringify(written.verificationFailure));
    }
    else {
      await saveExportCopy(outputPath, options.keepSource
        ? { selector: options.selector, status: 'kept', sdk: capture, captureDirectory: capture.directory, copy: sourceCopy }
        : { selector: options.selector, status: 'not-kept' });
      options.keepSource && keepSnapshot?.();
    }
    for (const line of formatExportSummary({
      sessionId: occurrence.sessionId, session: result.session, resourceCount: written.companionPaths.length,
      outputPath: workspacePath(written.outputPath), outputSize: written.markdownBytes,
    }))
      console.log(line);
    written.assetsPath && console.log(`Companion files: ${written.companionPaths.length} in ${workspacePath(written.assetsPath)} (system prompts, skill files, images)`);
    written.olderFailedArchive && console.log(`An older .verify-failed.md archive exists: ${written.olderFailedArchive}. It was not deleted.`);
    const left = [...result.leftOut].map(([name, count]) => `${name} ${count.toLocaleString('en-US')}`).join('; ');
    left && console.log(`Left out (counted, not exported): ${left}.`);
    const drift = result.session.census.unhandled;
    drift.length && console.log(`Schema drift: ${drift.length} unhandled SDK event type(s) - ${drift.map(([kind, count]) => `${kind}=${count}`).join(', ')}.`);
    return exitCode;
  } catch (error) {
    console.error(errorLabel(error));
    options.verify && await keepVerificationFailure(verificationException(error));
    writtenOutput && await keepFailure(writtenOutput, errorLabel(error));
    return 1;
  }
}

function companionText (result: SdkExport): string {
  return result.companions.filter((item) => item.mediaType.startsWith('text/')).map((item) => Buffer.from(item.bytes).toString('utf8')).join('\n');
}

async function verifyReport (preview: SdkExport, strict: boolean, json: boolean, savedArchive: boolean,
  onReport?: (report: ReturnType<typeof buildSdkVerifyJson>) => void): Promise<number> {
  const account = buildSdkLossAccount(preview.events, preview.markdown, companionText(preview));
  const parser = buildParserCheck(preview.markdown, await loadMarkdownParser(), { turns: preview.session.turns.length, strict });
  const images = verifySdkImages(preview.events, preview.markdown, preview.companions);
  const drift = preview.session.census.unhandled;
  const report = buildSdkVerifyJson({ strict, census: preview.session.census, leftOut: preview.leftOut, loss: account, parser, fenceRepairs: preview.fenceRepairs, images });
  onReport?.(report);
  if (json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return report.exitCode;
  }
  console.log('SDK event census');
  console.log(`- Scoped events: ${[...preview.session.census.seen.values()].reduce((sum, count) => sum + count, 0).toLocaleString('en-US')}`);
  drift.length
    ? console.log(`- UNHANDLED event types: ${drift.map(([kind, count]) => `${kind}=${count}`).join(', ')}`)
    : console.log('- Unhandled event types: none');
  console.log(`- Left out on purpose: ${[...preview.leftOut].map(([name, count]) => `${name} ${count}`).join('; ') || 'nothing'}`);
  printLossAccount(account, savedArchive ? 'the given file and its linked companions' : 'the Markdown this build would write');
  console.log(`Images: ${images.unique} unique, ${images.found} found, ${images.missing} missing; ${images.unresolved} unresolved, ${images.referenceOnly} reference-only.`);
  console.log(formatParserCheck(parser, savedArchive ? 'the given file' : 'in-memory build').join('\n'));
  const { early, turnEnd, html } = preview.fenceRepairs;
  console.log(`Code fences closed by the exporter: ${early.length} before the end of a turn, ${turnEnd} at the end of a turn; HTML escapes: ${html.length}. Only early closes fail --strict.`);
  return report.exitCode;
}
