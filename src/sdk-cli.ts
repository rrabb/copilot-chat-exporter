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
import { errorLabel } from './text.ts';

export interface SdkCommandOptions {
  root: string;
  selector: string;
  outputArgument: string | undefined;
  outDir: string | null;
  overwrite: boolean;
  verify: boolean;
  strict: boolean;
}

/** Returns an exit code, or null when the selector is not an Agent Host or Copilot CLI chat. */
export async function runSdkCommand (options: SdkCommandOptions): Promise<number | null> {
  const inventory = await inventorySessions(options.root);
  const selection = selectSdkSession(inventory.occurrences, options.selector);
  if (selection === null)
    return null;
  if (Array.isArray(selection)) {
    console.error(`"${options.selector}" matches ${selection.length} Agent Host or Copilot CLI chats. Use an exact chat key from this list:`);
    for (const item of selection)
      console.error(`  ${item.occurrence.sessionId}  (backing ${item.source.sessionId})  ${item.occurrence.title || '(untitled)'}`);
    return 1;
  }
  const { occurrence, source } = selection;
  const title = occurrence.title || '(untitled)';
  try {
    const events = await readSdkScope(source);
    const ledger = readUsageForSource(source);
    if (options.verify) {
      const preview = renderSdkExport(events, source, { title, assetsDirectory: 'assets', outputPath: '', generatedAt: new Date().toISOString(), ledger });
      return verifyReport(preview, options.strict);
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
      plan: (assetsDirectory) => {
        last = renderSdkExport(events, source, { title, assetsDirectory, outputPath, generatedAt, ledger });
        return { markdown: last.markdown, companions: last.companions, diagnostics: [], policy: { ...DEFAULT_EXPORT_POLICY } };
      },
    });
    const result = last as SdkExport | null;
    if (!result)
      throw new Error('The export plan was not produced.');
    for (const line of formatExportSummary({
      sessionId: occurrence.sessionId, session: result.session, resourceCount: written.companionPaths.length,
      outputPath: workspacePath(outputPath), outputSize: written.markdownBytes,
    }))
      console.log(line);
    written.assetsPath && console.log(`Companion files: ${written.companionPaths.length} in ${workspacePath(written.assetsPath)} (system prompts, skill files, images)`);
    const left = [...result.leftOut].map(([name, count]) => `${name} ${count.toLocaleString('en-US')}`).join('; ');
    left && console.log(`Left out (counted, not exported): ${left}.`);
    const drift = result.session.census.unhandled;
    drift.length && console.log(`Schema drift: ${drift.length} unhandled SDK event type(s) - ${drift.map(([kind, count]) => `${kind}=${count}`).join(', ')}.`);
    const account = buildSdkLossAccount(result.events, result.markdown, companionText(result));
    printLossAccount(account, 'the exported Markdown and its companion files');
    return options.strict && (account.failed || drift.length) ? 2 : 0;
  } catch (error) {
    console.error(errorLabel(error));
    return 1;
  }
}

function companionText (result: SdkExport): string {
  return result.companions.filter((item) => item.mediaType.startsWith('text/')).map((item) => Buffer.from(item.bytes).toString('utf8')).join('\n');
}

function verifyReport (preview: SdkExport, strict: boolean): number {
  const account = buildSdkLossAccount(preview.events, preview.markdown, companionText(preview));
  const drift = preview.session.census.unhandled;
  console.log('SDK event census');
  console.log(`- Scoped events: ${[...preview.session.census.seen.values()].reduce((sum, count) => sum + count, 0).toLocaleString('en-US')}`);
  drift.length
    ? console.log(`- UNHANDLED event types: ${drift.map(([kind, count]) => `${kind}=${count}`).join(', ')}`)
    : console.log('- Unhandled event types: none');
  console.log(`- Left out on purpose: ${[...preview.leftOut].map(([name, count]) => `${name} ${count}`).join('; ') || 'nothing'}`);
  printLossAccount(account, 'the Markdown this build would write');
  return strict && (account.failed || drift.length > 0) ? 2 : 0;
}
