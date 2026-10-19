// The package's public entry point, and the only place that knows how to go from "a session id"
// to "a finished document".
//
// `cli.ts` is one consumer of this; another program importing the package is the other. Nothing
// here prints or exits - that stays in `cli.ts` - so every step below is callable from a test.

import { promises as fs } from 'node:fs';
import { createHostContext, setWorkspaceRoot } from './host.ts';
import { buildDocument } from './markdown.ts';
import type { TextOverflow } from './markdown.ts';
import { resolveSession } from './session/locate.ts';
import { VALIDATED_AGAINST } from './session/classify.ts';
import {
  loadMemoryFiles, loadModelNames, loadResources, readVersions,
} from './session/enrich.ts';
import { attachTranscriptPatches, loadTranscriptPatches } from './session/edits.ts';
import { parseChatSession } from './session/journal.ts';
import { validateLocalJournalRecords } from './session/journal-validation.ts';

export type * from './types.ts';
export type * from './export-policy.ts';
export { writeArchive } from './archive-writer.ts';
export type { ArchiveWriteOptions, WrittenArchive } from './archive-writer.ts';
export { redactContent } from './redaction.ts';
export type * from './session/sources.ts';
export { DEFAULT_EXPORT_POLICY, planMetadataText, planToolText, recordedLineCount } from './export-policy.ts';
export { discoverUserDataRoots, resolveUserDataRoot, UserDataRootError } from './session/roots.ts';
export type { RootSelectionOptions } from './session/roots.ts';
export { inventorySessions } from './session/inventory.ts';
export type { SessionInventory } from './session/inventory.ts';
export { formatSessionListing } from './session/listing.ts';
export { collectListingEvidence } from './session/listing-evidence.ts';
export { formatDetailedSessionListingHtml } from './session/detailed-listing.ts';
export { compressDetailedListingHtml } from './session/compressed-listing.ts';
export type { ListingEvidence, ListingTurnEvidence, ListingFileChange, ListingTitleEvidence, ListingDateEvidence } from './session/listing-evidence-types.ts';
export type { SessionListingOptions } from './session/listing.ts';
export { createProviderSourceResolver } from './session/provider-sources.ts';
export type { ProviderResolverOptions, ResolvedProviderSource } from './session/provider-sources.ts';
export { readSdkEvents, eventsInScope } from './session/sdk-events.ts';
export type { SdkEvent, SdkEventLog } from './session/sdk-events.ts';
export { installAgentFiles } from './install.ts';
export { createHostContext, getWorkspaceRoot, resolveOutputPath, workspacePath } from './host.ts';
export { listSessions, resolveSession } from './session/locate.ts';
export type { SessionSelectionOptions } from './session/locate.ts';
export { parseChatSession } from './session/journal.ts';
export { buildDocument } from './markdown.ts';
export type { TextOverflow } from './markdown.ts';
export { buildJournalCrossCheck, buildRenderReport, buildVerificationReport } from './verify/layers.ts';
export { buildLossAccount } from './verify/loss-account.ts';
export { VALIDATED_AGAINST } from './session/classify.ts';

/**
 * Resolve, read, and parse a session, plus the optional stores that sit beside the journal.
 * Sets the module-level workspace root as a side effect, because path shortening is used
 * throughout rendering and threading it through every call site buys nothing.
 */
export async function loadSession (options: {
  source?: string;
  workspaceRoot?: string | null;
  outDir?: string | null;
  userDataRoot?: string;
  current?: boolean;
} = {}) {
  const { source, workspaceRoot = null, outDir = null } = options;
  const location = await resolveSession(source, { userDataRoot: options.userDataRoot, current: options.current });
  const host = await createHostContext({ hashRoot: location.hashRoot, workspaceRoot, outDir });
  setWorkspaceRoot(host.workspaceRoot);

  const raw = await fs.readFile(location.sessionPath, 'utf8');
  validateLocalJournalRecords(raw, location.sessionId);
  const session = parseChatSession(location.sessionPath, raw);
  attachTranscriptPatches(session, await loadTranscriptPatches(location.hashRoot, location.sessionId));
  // Manual GUI renames can update only the workspace index. Preserve the journal customTitle
  // for provenance while letting the indexed title control current display output.
  location.indexedTitle && (session.title = location.indexedTitle);

  const resources = await loadResources(location.hashRoot, location.sessionId);
  const versions = await readVersions(location.hashRoot, location.sessionId);
  await loadModelNames(location.hashRoot, location.sessionId);
  const memory = await loadMemoryFiles(location.hashRoot, location.sessionId);

  return { location, host, raw, session, resources, versions, memory };
}

/** Everything a renderer needs, derived from its own producer so it cannot drift from it. */
export type LoadedSession = Awaited<ReturnType<typeof loadSession>>;

// Maps stringify to `{}`, so the census has to be converted rather than passed through.
const countsToObject = (map: Map<string, number>) => Object.fromEntries(map ?? []);

/**
 * The parsed model as data, for a caller that wants to process a conversation rather than read
 * one. Deliberately close to `JSON.stringify(session)`: if this ever needs real logic, the model
 * has leaked something that should have been resolved during parsing.
 *
 * Nothing in this package calls it. It is untruncated, so it is far larger than the Markdown
 * export - tens of MB for a long session, because every tool output is embedded whole.
 *
 * `rawRequests` is excluded - that is the input, not the model.
 */
export function sessionToJson (loaded: LoadedSession) {
  const { location, session, resources, versions } = loaded;
  return {
    schema: 1,
    validatedAgainst: VALIDATED_AGAINST,
    session: {
      id: location.sessionId,
      path: location.sessionPath,
      title: session.title,
      customTitle: session.customTitle,
      defaultTitle: session.defaultTitle,
      creationDate: session.creationDate,
      responderUsername: session.responderUsername,
      initialLocation: session.initialLocation,
      hasPendingEdits: session.hasPendingEdits,
      inputState: session.inputState,
      repoData: session.repoData,
      pendingRequests: session.pendingRequests,
      workingDirectory: session.workingDirectory,
      copilotVersion: versions.copilotVersion,
      vscodeVersion: versions.vscodeVersion,
    },
    turns: session.turns,
    editedFiles: session.editedFiles,
    resources: resources.resources,
    census: {
      seen: countsToObject(session.census.seen),
      dropped: countsToObject(session.census.dropped),
      toolData: countsToObject(session.census.toolData),
      unhandled: session.census.unhandled,
      unrecognizedToolData: session.census.unrecognizedToolData,
    },
    errors: session.errors,
  };
}

/**
 * Render a loaded session as the Markdown archive. `outputPath`, `gitStatus`, and `generatedAt`
 * are supplied by the caller so the same parse always produces the same bytes.
 */
export function renderSession (loaded: LoadedSession, options: {
  outputPath?: string;
  gitStatus?: string;
  generatedAt?: string;
  /** Collects the full text of tool output over 300 lines and 15 KiB; omit to keep everything inline. */
  overflow?: TextOverflow;
} = {}) {
  const { outputPath = '', gitStatus = '', generatedAt = new Date().toISOString(), overflow } = options;
  return buildDocument(loaded.session, { ...loaded, outputPath, gitStatus, generatedAt, ...(overflow ? { overflow } : {}) });
}
