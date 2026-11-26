// Command path for Agent Host and Copilot CLI chats. The Local path stays in cli.ts.

import { DEFAULT_EXPORT_POLICY } from './export-policy.ts';
import { writeArchive } from './archive-writer.ts';
import { createHostContext, resolveOutputPath, setWorkspaceRoot, workspacePath } from './host.ts';
import { buildExportSummary, formatExportSummary } from './export-summary.ts';
import { inventorySessions } from './session/inventory.ts';
import { questionWarningLines } from './session/questions.ts';
import { inspectSdkSelection, readSdkScope, readUsageForSource, renderSdkExport } from './session/sdk-export.ts';
import type { SdkExport, SdkSelection, SdkSelectionCheck } from './session/sdk-export.ts';
import { buildSdkLossAccount } from './verify/sdk-loss-account.ts';
import { printLossAccount } from './verify/loss-report.ts';
import { buildSdkVerifyJson } from './verify/json-report.ts';
import { buildParserCheck, formatParserCheck, loadMarkdownParser } from './verify/parser-check.ts';
import { errorLabel } from './text.ts';
import { companionLinkStatus, readLinkedArchiveCompanions, sdkImageLocators, verifySdkImages } from './verify/images.ts';
import type { CompanionLinkStatus } from './verify/images.ts';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { checkExportOutputHash, existingUserDataSnapshot, keepFailedExportCopy, readExportCopy, saveExportCopy, verifySourceCopy } from './session/source-snapshot.ts';
import type { ExportOutputHashCheck } from './session/source-snapshot.ts';
import { snapshotSdkSelection } from './session/sdk-capture.ts';
import type { SdkCapture } from './session/sdk-capture.ts';
import { discardCapture, finishCapture, keepCaptureDuringFailure, leaseCapture, sourceCacheRoot } from './session/source-cache.ts';
import { exportFailureFromReport, failureDetails, verificationException, writeFailureLog } from './verify/export-failure.ts';
import type { ExportFailure } from './verify/export-failure.ts';
import type { ToolGroupOrder } from './types.ts';
import { splitSdkSchemaDrift } from './session/sdk-schema.ts';
import { renderVerificationExplanation, writeVerificationExplanation } from './verify/explanation.ts';
import type { SdkVerificationJson } from './verify/json-report.ts';
import type { VerificationExplanationInput } from './verify/explanation.ts';
import { shouldWriteDiagnosticBundle, writeDiagnosticBundle } from './verify/diagnostic-bundle.ts';
import type { DiagnosticBundleInput } from './verify/diagnostic-bundle.ts';
import { questionDiagnosticSchemaRecords, sdkDiagnosticSchemaRecords } from './verify/diagnostic-source.ts';
import type { SchemaDiagnosticRecord } from './verify/diagnostic-evidence.ts';
import { SessionSelectionError } from './session/locate.ts';
import { UserDataRootError } from './session/roots.ts';
import type { SessionOccurrence } from './session/sources.ts';

export interface SdkCommandOptions {
  root: string;
  selector: string;
  outputArgument: string | undefined;
  outDir: string | null;
  overwrite: boolean;
  verify: boolean;
  explain?: boolean;
  strict: boolean;
  json?: boolean;
  keepSource?: boolean;
  keepSourceOnProblem?: boolean;
  toolGroupOrder?: ToolGroupOrder;
  outputHash?: ExportOutputHashCheck;
}

async function writeExplanationForCli (input: VerificationExplanationInput, quiet = false): Promise<boolean> {
  try {
    const reportPath = await writeVerificationExplanation(input);
    reportPath && !quiet && console.log(`Verification report: ${workspacePath(reportPath)}`);
    return true;
  } catch (error) {
    console.error(`Verification report could not be written: ${errorLabel(error)}`);
    return false;
  }
}

type DiagnosticWriteStatus = 'failed' | 'not-needed' | 'written';

async function writeDiagnosticsForCli (input: DiagnosticBundleInput, quiet = false): Promise<DiagnosticWriteStatus> {
  if (!shouldWriteDiagnosticBundle(input))
    return 'not-needed';
  try {
    const result = await writeDiagnosticBundle(input);
    if (!result)
      return 'not-needed';
    const print = quiet ? console.error : console.log;
    print(`Diagnostic task: ${workspacePath(result.taskPath)}`);
    print(`Diagnostic manifest: ${workspacePath(result.manifestPath)}`);
    result.evidenceDirectory && print(`Diagnostic evidence: ${workspacePath(result.evidenceDirectory)}`);
    print(`Diagnostic privacy scan: ${result.commonPatternsFound} common pattern(s) found. Review before sharing; a zero is not a clean bill of health.`);
    return 'written';
  } catch (error) {
    console.error(`Diagnostic bundle could not be written: ${errorLabel(error)}`);
    return 'failed';
  }
}

/** Deletes a frozen source after a problem run and tells the user how to keep it next time. */
export async function removeFrozenSource (directory: string): Promise<void> {
  try {
    const bytes = await discardCapture(directory);
    console.error(`Frozen source removed (${(bytes / 1_048_576).toFixed(1)} MiB). This run can't be replayed from its exact source later. Rerun with --keep-source-on-problem to keep it.`);
  } catch (error) {
    console.error(`Frozen source could not be removed: ${errorLabel(error)}. Run --cache --clean to remove it.`);
  }
}

function localJournalPath (occurrence: SessionOccurrence): string {
  if (occurrence.localJournalPath)
    return occurrence.localJournalPath;
  const directory = occurrence.provenance.store === 'empty-window' ? 'emptyWindowChatSessions' : 'chatSessions';
  return path.join(occurrence.provenance.workspaceStoragePath, directory, `${occurrence.sessionId}.jsonl`);
}

function alternativeLines (check: SdkSelectionCheck): string[] {
  const localPaths = [...new Set(check.local.map(localJournalPath))];
  const sdkSelections = check.sdk === null ? [] : Array.isArray(check.sdk) ? check.sdk : [check.sdk];
  const sdkKeys = [...new Set(sdkSelections.map((selection: SdkSelection) => selection.occurrence.sessionId))];
  return [
    ...localPaths.map((candidate) => `  Local journal: ${candidate}`),
    ...sdkKeys.map((candidate) => `  SDK chat key: ${candidate}`),
  ];
}

function selectionError (selector: string, reason: string, check: SdkSelectionCheck): SessionSelectionError {
  const alternatives = alternativeLines(check);
  const advice = alternatives.length
    ? `Use one precise source:\n${alternatives.join('\n')}`
    : 'Run --list to inspect available sources. Use an exact Local .jsonl path or a verified qualified SDK key.';
  return new SessionSelectionError(`${selector}: ${reason}\n${advice}`);
}

/** Returns an exit code, or null when the selector is not an Agent Host or Copilot CLI chat. */
export async function runSdkCommand (options: SdkCommandOptions): Promise<number | null> {
  try {
    return await runSdkCommandFromCopy(options);
  } catch (error) {
    console.error(errorLabel(error));
    if (!(error instanceof SessionSelectionError || error instanceof UserDataRootError)) {
      await writeDiagnosticsForCli({
        generatedAt: new Date().toISOString(),
        provider: 'sdk',
        sessionId: options.selector,
        command: process.argv.slice(2),
        report: null,
        exception: error,
        exceptionStage: 'load',
        archivePath: options.outputArgument ? path.resolve(options.outputArgument) : null,
        diagnosticsDirectory: path.join(sourceCacheRoot(), 'diagnostics'),
      }, options.json === true);
    }
    return 1;
  }
}

async function runSdkCommandFromCopy (options: SdkCommandOptions): Promise<number | null> {
  const receipt = options.verify && options.outputArgument
    ? await readExportCopy(path.resolve(options.outputArgument), options.selector) : null;
  const outputHash = receipt && options.outputArgument
    ? await checkExportOutputHash(options.outputArgument, receipt)
    : undefined;
  const resolvedOptions = {
    ...options,
    toolGroupOrder: receipt?.toolGroupOrder ?? options.toolGroupOrder ?? 'request',
    outputHash,
  };
  if (receipt && !receipt.sdk && !receipt.root)
    return null;
  if (receipt?.sdk) {
    const release = await leaseCapture(receipt.sdk.directory);
    try {
      return await runSdkSnapshotCommand(resolvedOptions, receipt.sdk);
    } finally {
      await release();
    }
  }
  const root = receipt?.root ?? options.root;
  const existing = await existingUserDataSnapshot(root);
  const inventory = await inventorySessions(root, { copilotHome: existing?.copilotHome, identityOnly: true });
  const checked = inspectSdkSelection(inventory.occurrences, inventory.diagnostics, options.selector);
  const { sdk: selection } = checked;
  if (checked.qualified) {
    if (checked.unresolvedSdk.length)
      throw selectionError(options.selector, 'the qualified SDK key has a recorded mapping that could not be verified', checked);
    if (selection === null)
      throw selectionError(options.selector, 'no verified SDK chat has this qualified key', checked);
  } else {
    if (Array.isArray(selection) || (selection && checked.local.length)) {
      throw selectionError(
        options.selector,
        'the selector matches more than one Local or SDK chat',
        checked,
      );
    }
    if (checked.unresolvedSdk.length) {
      throw selectionError(
        options.selector,
        'an SDK mapping matching this selector could not be verified',
        checked,
      );
    }
    if (checked.blockingDiagnostics.length) {
      const failedPaths = checked.blockingDiagnostics.map((diagnostic) => `  ${diagnostic.path}: ${diagnostic.description}`);
      throw selectionError(
        options.selector,
        `candidate discovery is incomplete:\n${failedPaths.join('\n')}`,
        checked,
      );
    }
    if (selection === null)
      return null;
  }
  if (Array.isArray(selection))
    throw selectionError(options.selector, 'the qualified SDK key resolves to multiple verified chats', checked);
  const capture = await snapshotSdkSelection(selection);
  let kept = false;
  let problem = false;
  try {
    return await runSdkSnapshotCommand(resolvedOptions, capture, () => { kept = true; }, () => { problem = true; });
  } finally {
    if (!kept)
      problem ? await removeFrozenSource(capture.directory) : await discardCapture(capture.directory);
  }
}

async function runSdkSnapshotCommand (options: SdkCommandOptions, capture: SdkCapture, keepSnapshot?: () => void,
  onProblem?: () => void): Promise<number> {
  const { occurrence, source } = capture.selection;
  const sourceCopy = capture.copy;
  for (const file of capture.files)
    await verifySourceCopy(file);
  sourceCopy.kept = options.keepSource === true || !keepSnapshot;
  // A saved-file check leases an already kept capture, so it is never removed here.
  const retain = !keepSnapshot || options.keepSource === true || options.keepSourceOnProblem === true;
  const keptPath = retain ? capture.directory : null;
  const keepOnProblem = async () => {
    if (!retain) {
      onProblem?.();
      return;
    }
    keepSnapshot?.();
    await finishCapture(capture.directory, true);
  };
  const displaySource = { ...source, path: sourceCopy.source };
  const title = occurrence.title || '(untitled)';
  const versions = {
    vscodeVersion: 'not recorded', copilotVersion: 'not recorded',
  };
  let writtenOutput: string | undefined;
  let diagnosticReport: SdkVerificationJson | null = null;
  let diagnosticLossItems: ReturnType<typeof buildSdkLossAccount>['unaccounted'] = [];
  let diagnosticSequenceEvidence: ReturnType<typeof buildSdkLossAccount>['sequenceEvidence'];
  let diagnosticSchemaRecords: SchemaDiagnosticRecord[] = [];
  let diagnosticsWritten = false;
  const keepVerificationFailure = async (failure: ExportFailure) => {
    await keepOnProblem();
    const diagnostics = path.join(sourceCacheRoot(), 'failures');
    await fs.mkdir(diagnostics, { recursive: true });
    const log = await writeFailureLog(path.join(diagnostics, 'verification.md'), source.sessionId,
      failure, keptPath, new Date().toISOString(), sourceCopy.sha256, versions);
    console.error(keptPath ? `Export verification failed; private source copy kept at: ${keptPath}` : 'Export verification failed.');
    console.error(failureDetails(failure));
    console.error(`Failure log: ${log}`);
    return log;
  };
  const keepFailure = async (outputPath: string, failure: string) => {
    if (!retain) {
      onProblem?.();
      console.error('Export verification failed.');
      await saveExportCopy(outputPath, { selector: options.selector, status: 'not-kept', verificationFailure: failure,
        toolGroupOrder: options.toolGroupOrder ?? 'request' });
      return;
    }
    keepSnapshot?.();
    console.error(`Export verification failed; private source copy kept at: ${capture.directory}`);
    await keepFailedExportCopy(outputPath, {
      selector: options.selector, sdk: capture, captureDirectory: capture.directory, copy: sourceCopy,
      toolGroupOrder: options.toolGroupOrder ?? 'request',
    }, failure);
  };
  try {
    const events = await readSdkScope(source);
    const recordedVersions = events.find((event) => event.type === 'session.start')?.data;
    versions.vscodeVersion = typeof recordedVersions?.vscodeVersion === 'string' ? recordedVersions.vscodeVersion : 'not recorded';
    versions.copilotVersion = typeof recordedVersions?.copilotVersion === 'string' ? recordedVersions.copilotVersion : 'not recorded';
    const ledger = readUsageForSource(source);
    if (options.verify) {
      const preview = renderSdkExport(events, displaySource, { title, assetsDirectory: 'assets', outputPath: '', generatedAt: new Date().toISOString(), ledger, sourceCopy, toolGroupOrder: options.toolGroupOrder ?? 'request' });
      let companionLinks: CompanionLinkStatus[] | undefined;
      if (options.outputArgument) {
        const outputPath = path.resolve(options.outputArgument);
        preview.markdown = await fs.readFile(outputPath, 'utf8');
        preview.companions = await readLinkedArchiveCompanions(preview.markdown, outputPath);
        companionLinks = await companionLinkStatus(preview.markdown, outputPath);
      }
      let failure: ExportFailure | null = null;
      let verification: SdkVerificationJson | null = null;
      const exitCode = await verifyReport(preview, options.strict, options.json === true, Boolean(options.outputArgument),
        (report, account) => {
          verification = report;
          diagnosticReport = report;
          diagnosticLossItems = account.unaccounted;
          diagnosticSequenceEvidence = account.sequenceEvidence;
          failure = exportFailureFromReport(report, account.unaccounted);
        }, companionLinks);
      const failureLog = failure ? await keepVerificationFailure(failure) : null;
      if (verification) {
        diagnosticSchemaRecords = [
          ...sdkDiagnosticSchemaRecords(events, preview.session.census),
          ...questionDiagnosticSchemaRecords(preview.session, 'sdk'),
        ];
        const explanation = {
          report: verification,
          failure,
          generatedAt: new Date().toISOString(),
          archivePath: options.outputArgument ? path.resolve(options.outputArgument) : null,
          failureLog,
          sourceWarnings: preview.session.errors,
          sourceHash: sourceCopy.sha256,
          summary: options.outputArgument
            ? buildExportSummary({
              sessionId: occurrence.sessionId,
              session: preview.session,
              resourceCount: preview.companions.length,
              outputPath: path.resolve(options.outputArgument),
              outputSize: Buffer.byteLength(preview.markdown, 'utf8'),
              verificationFailed: failure !== null,
            })
            : null,
          companionCount: preview.companions.length,
          assetsPath: options.outputArgument && preview.companions.length
            ? path.join(path.dirname(path.resolve(options.outputArgument)), preview.companions[0]!.relativePath.split('/')[0]!)
            : null,
          capturePath: failure ? keptPath : null,
        };
        if (options.outputArgument) {
          const written = await writeExplanationForCli(explanation, options.json === true);
          if (!written)
            return exitCode || 1;
        } else if (!options.json) {
          console.log('');
          console.log(renderVerificationExplanation(explanation));
        }
        const diagnosticStatus = await writeDiagnosticsForCli({
          generatedAt: new Date().toISOString(),
          provider: 'sdk',
          sessionId: source.sessionId,
          command: process.argv.slice(2),
          report: verification,
          failure,
          archivePath: options.outputArgument ? path.resolve(options.outputArgument) : null,
          diagnosticsDirectory: path.join(sourceCacheRoot(), 'diagnostics'),
          assetsPath: explanation.assetsPath,
          failureLog,
          sourceHash: sourceCopy.sha256,
          capturePath: keptPath,
          sourceWarnings: preview.session.errors,
          versions,
          schemaRecords: diagnosticSchemaRecords,
          lossItems: diagnosticLossItems,
          sequenceEvidence: diagnosticSequenceEvidence,
          imageLocators: sdkImageLocators(events),
          outputHash: options.outputHash,
        }, options.json === true);
        diagnosticsWritten = diagnosticStatus === 'written';
        diagnosticsWritten && await keepOnProblem();
        if (diagnosticStatus === 'failed' && exitCode === 0)
          return 1;
      }
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
    let exportVerification: SdkVerificationJson | null = null;
    const written = await writeArchive({
      outputPath, generatedAt, overwrite: options.overwrite,
      verification: {
        capture: keptPath, sessionId: source.sessionId, sourceHash: sourceCopy.sha256,
        versions,
        keep: async () => {
          if (!retain) {
            onProblem?.();
            return;
          }
          keepSnapshot?.();
          await keepCaptureDuringFailure(capture.directory);
        },
        check: async (stagePath) => {
          if (!last)
            throw new Error('The export plan was not produced.');
          last.markdown = await fs.readFile(stagePath, 'utf8');
          last.companions = await readLinkedArchiveCompanions(last.markdown, outputPath);
          let failure: ExportFailure | null = null;
          await verifyReport(last, options.strict, false, true, (report, account) => {
            exportVerification = report;
            diagnosticReport = report;
            diagnosticLossItems = account.unaccounted;
            diagnosticSequenceEvidence = account.sequenceEvidence;
            failure = exportFailureFromReport(report, account.unaccounted);
          });
          return failure;
        },
      },
      plan: (assetsDirectory, artifactPath) => {
        last = renderSdkExport(events, displaySource, { title, assetsDirectory, outputPath: artifactPath, generatedAt, ledger, sourceCopy, toolGroupOrder: options.toolGroupOrder ?? 'request' });
        return { markdown: last.markdown, companions: last.companions, diagnostics: [], policy: { ...DEFAULT_EXPORT_POLICY } };
      },
    });
    writtenOutput = written.outputPath;
    const result = last as SdkExport | null;
    if (!result)
      throw new Error('The export plan was not produced.');
    let exitCode = written.verificationFailure ? 2 : 0;
    diagnosticSchemaRecords = [
      ...sdkDiagnosticSchemaRecords(events, result.session.census),
      ...questionDiagnosticSchemaRecords(result.session, 'sdk'),
    ];
    const diagnosticStatus = await writeDiagnosticsForCli({
      generatedAt,
      provider: 'sdk',
      sessionId: source.sessionId,
      command: process.argv.slice(2),
      report: exportVerification,
      failure: written.verificationFailure,
      archivePath: written.outputPath,
      diagnosticsDirectory: path.join(sourceCacheRoot(), 'diagnostics'),
      assetsPath: written.assetsPath,
      failureLog: written.failureLog,
      sourceHash: sourceCopy.sha256,
      capturePath: keptPath,
      sourceWarnings: result.session.errors,
      versions,
      schemaRecords: diagnosticSchemaRecords,
      lossItems: diagnosticLossItems,
      sequenceEvidence: diagnosticSequenceEvidence,
      imageLocators: sdkImageLocators(events),
      outputHash: options.outputHash,
    }, options.json === true);
    diagnosticsWritten = diagnosticStatus === 'written';
    diagnosticsWritten && await keepOnProblem();
    if (diagnosticStatus === 'failed' && exitCode === 0)
      exitCode = 1;
    if (written.verificationFailure) {
      console.error(failureDetails(written.verificationFailure));
      console.error(written.failureLog ? `Failure log: ${written.failureLog}` : `Failure log could not be written: ${written.failureLogError}`);
      await keepFailure(written.outputPath, JSON.stringify(written.verificationFailure));
    }
    else {
      const keepCopy = options.keepSource === true || (diagnosticsWritten && retain);
      await saveExportCopy(outputPath, keepCopy
        ? { selector: options.selector, status: 'kept', sdk: capture, captureDirectory: capture.directory, copy: sourceCopy, toolGroupOrder: options.toolGroupOrder ?? 'request' }
        : { selector: options.selector, status: 'not-kept', toolGroupOrder: options.toolGroupOrder ?? 'request' });
      keepCopy && keepSnapshot?.();
    }
    let explanationFailed = false;
    if (options.explain && (exportVerification || written.verificationFailure)) {
      explanationFailed = !await writeExplanationForCli({
        report: exportVerification,
        failure: written.verificationFailure,
        generatedAt,
        archivePath: written.outputPath,
        assetsPath: written.assetsPath,
        failureLog: written.failureLog,
        sourceWarnings: result.session.errors,
        sourceHash: sourceCopy.sha256,
        summary: buildExportSummary({
          sessionId: occurrence.sessionId,
          session: result.session,
          resourceCount: written.companionPaths.length,
          outputPath: written.outputPath,
          outputSize: written.markdownBytes,
          verificationFailed: written.verificationFailure !== null,
        }),
        companionCount: written.companionPaths.length,
        capturePath: written.verificationFailure ? keptPath : null,
        olderFailedArchive: written.olderFailedArchive,
      });
    }
    for (const line of formatExportSummary({
      sessionId: occurrence.sessionId, session: result.session, resourceCount: written.companionPaths.length,
      outputPath: workspacePath(written.outputPath), outputSize: written.markdownBytes,
      verificationFailed: written.verificationFailure !== null,
    }))
      console.log(line);
    written.assetsPath && console.log(`Companion files: ${written.companionPaths.length} in ${workspacePath(written.assetsPath)} (system prompts, skill files, images)`);
    written.olderFailedArchive && console.log(`An older .verify-failed.md archive exists: ${written.olderFailedArchive}. It was not deleted.`);
    const left = [...result.leftOut].map(([name, count]) => `${name} ${count.toLocaleString('en-US')}`).join('; ');
    left && console.log(`Left out (counted, not exported): ${left}.`);
    const drift = result.session.census.unhandled;
    if (drift.length) {
      const parts = splitSdkSchemaDrift(drift);
      const labels = [
        parts.unhandledEvents.length
          ? `${parts.unhandledEvents.length} unhandled SDK event type(s) - ${parts.unhandledEvents.map(([kind, count]) => `${kind}=${count}`).join(', ')}`
          : '',
        parts.unsupportedPayloads.length
          ? `${parts.unsupportedPayloads.length} unsupported SDK payload variant(s) - ${parts.unsupportedPayloads.map(([kind, count]) => `${kind}=${count}`).join(', ')}`
          : '',
      ].filter(Boolean);
      console.log(`Schema drift: ${labels.join('; ')}.`);
    }
    const questionWarnings = result.session.census.questionWarnings ?? [];
    questionWarnings.length && console.log(`Questions not fully read: ${questionWarnings.map(([key, count]) => `${key}=${count}`).join(', ')}. Their boxes show a warning and the recorded data.`);
    for (const line of questionWarningLines(result.session.census.questionWarningDetails ?? [], 5))
      console.log(`  ${line}`);
    return explanationFailed && exitCode === 0 ? 1 : exitCode;
  } catch (error) {
    console.error(errorLabel(error));
    const exceptionFailure = options.verify ? verificationException(error) : null;
    const diagnosticStatus = await writeDiagnosticsForCli({
      generatedAt: new Date().toISOString(),
      provider: 'sdk',
      sessionId: source.sessionId,
      command: process.argv.slice(2),
      report: diagnosticReport,
      failure: exceptionFailure,
      exception: error,
      exceptionStage: options.verify ? 'verify' : 'export',
      archivePath: writtenOutput ? path.resolve(writtenOutput) : null,
      diagnosticsDirectory: path.join(sourceCacheRoot(), 'diagnostics'),
      failureLog: null,
      sourceHash: sourceCopy.sha256,
      capturePath: keptPath,
      versions,
      schemaRecords: diagnosticSchemaRecords,
      lossItems: diagnosticLossItems,
      sequenceEvidence: diagnosticSequenceEvidence,
      outputHash: options.outputHash,
    }, options.json === true);
    diagnosticStatus === 'written' && await keepOnProblem();
    if (exceptionFailure) {
      const failureLog = await keepVerificationFailure(exceptionFailure);
      const explanation = {
        report: null,
        failure: exceptionFailure,
        generatedAt: new Date().toISOString(),
        archivePath: options.outputArgument ? path.resolve(options.outputArgument) : null,
        failureLog,
        sourceWarnings: [],
        sourceHash: sourceCopy.sha256,
        capturePath: keptPath,
      };
      if (options.outputArgument) {
        await writeExplanationForCli(explanation, options.json === true);
      } else if (!options.json) {
        console.log('');
        console.log(renderVerificationExplanation(explanation));
      }
    }
    writtenOutput && await keepFailure(writtenOutput, errorLabel(error));
    return 1;
  }
}

async function verifyReport (preview: SdkExport, strict: boolean, json: boolean, savedArchive: boolean,
  onReport?: (report: ReturnType<typeof buildSdkVerifyJson>, account: ReturnType<typeof buildSdkLossAccount>) => void,
  companionLinks?: readonly CompanionLinkStatus[]): Promise<number> {
  const account = buildSdkLossAccount(preview.events, preview.markdown, preview.companions, preview.toolGroupOrder, { captureFailedText: true });
  const parser = buildParserCheck(preview.markdown, await loadMarkdownParser(), { turns: preview.session.turns.length, strict });
  const images = verifySdkImages(preview.events, preview.markdown, preview.companions);
  const drift = preview.session.census.unhandled;
  const report = buildSdkVerifyJson({ strict, census: preview.session.census, leftOut: preview.leftOut, loss: account, lossTarget: savedArchive ? 'file' : 'in-memory', parser, fenceRepairs: preview.fenceRepairs, images, companionLinks });
  onReport?.(report, account);
  if (json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return report.exitCode;
  }
  console.log('SDK event census');
  console.log(`- Scoped events: ${[...preview.session.census.seen.values()].reduce((sum, count) => sum + count, 0).toLocaleString('en-US')}`);
  const driftParts = splitSdkSchemaDrift(drift);
  console.log(driftParts.unhandledEvents.length
    ? `- UNHANDLED event types: ${driftParts.unhandledEvents.map(([kind, count]) => `${kind}=${count}`).join(', ')}`
    : '- Unhandled event types: none');
  console.log(driftParts.unsupportedPayloads.length
    ? `- Unsupported payload variants: ${driftParts.unsupportedPayloads.map(([kind, count]) => `${kind}=${count}`).join(', ')}`
    : '- Unsupported payload variants: none');
  const questionWarnings = preview.session.census.questionWarnings ?? [];
  console.log(`- Questions not fully read: ${questionWarnings.map(([key, count]) => `${key}=${count}`).join(', ') || 'none'}${questionWarnings.length ? ' (fails --strict; see docs/UPGRADING.md, "Questions to the user")' : ''}`);
  for (const line of questionWarningLines(preview.session.census.questionWarningDetails ?? []))
    console.log(`    ${line}`);
  console.log(`- Left out on purpose: ${[...preview.leftOut].map(([name, count]) => `${name} ${count}`).join('; ') || 'nothing'}`);
  printLossAccount(account, savedArchive ? 'the given file and its linked companions' : 'the Markdown this build would write');
  if (companionLinks) {
    const missing = companionLinks.flatMap((status) => status.missing);
    console.log(`Companion links: ${companionLinks.reduce((sum, status) => sum + status.linked, 0)} linked, ${missing.length} missing.`);
    for (const target of missing)
      console.log(`- Missing: ${target}`);
  }
  console.log(`Images: ${images.unique} unique, ${images.found} found, ${images.missing} missing; ${images.unresolved} unresolved, ${images.referenceOnly} reference-only.`);
  console.log(formatParserCheck(parser, savedArchive ? 'the given file' : 'in-memory build').join('\n'));
  const { early, turnEnd, html } = preview.fenceRepairs;
  console.log(`Code fences closed by the exporter: ${early.length} before the end of a turn, ${turnEnd} at the end of a turn; HTML escapes: ${html.length}. Only early closes fail --strict.`);
  return report.exitCode;
}
