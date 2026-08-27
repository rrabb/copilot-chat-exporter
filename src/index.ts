// The package's public entry point, and the only place that knows how to go from "a session id"
// to "a finished document".
//
// `cli.ts` is one consumer of this; another program importing the package is the other. Nothing
// here prints or exits - that stays in `cli.ts` - so every step below is callable from a test.

import { promises as fs } from 'node:fs';
import { createHostContext, setWorkspaceRoot } from './host.ts';
import { buildDocument } from './markdown.ts';
import { resolveSession } from './session/locate.ts';
import { VALIDATED_AGAINST } from './session/classify.ts';
import {
  lineCountsFor, loadMemoryFiles, loadModelNames, loadResources, readVersions,
} from './session/enrich.ts';
import { parseChatSession } from './session/journal.ts';

export type * from './types.ts';
export { installAgentFiles } from './install.ts';
export { createHostContext, getWorkspaceRoot, resolveOutputPath, workspacePath } from './host.ts';
export { listSessions, resolveSession } from './session/locate.ts';
export { parseChatSession } from './session/journal.ts';
export { buildDocument } from './markdown.ts';
export { buildJournalCrossCheck, buildRenderReport, buildVerificationReport } from './verify/layers.ts';
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
} = {}) {
  const { source, workspaceRoot = null, outDir = null } = options;
  const location = await resolveSession(source);
  const host = await createHostContext({ hashRoot: location.hashRoot, workspaceRoot, outDir });
  setWorkspaceRoot(host.workspaceRoot);

  const raw = await fs.readFile(location.sessionPath, 'utf8');
  const session = parseChatSession(location.sessionPath, raw);
  // Manual GUI renames can update only the workspace index. Preserve the journal customTitle
  // for provenance while letting the indexed title control current display output.
  location.indexedTitle && (session.title = location.indexedTitle);

  const resources = await loadResources(location.hashRoot, location.sessionId);
  const versions = await readVersions(location.hashRoot, location.sessionId);
  await loadModelNames(location.hashRoot, location.sessionId);
  const memory = await loadMemoryFiles(location.hashRoot, location.sessionId);
  const lineCounts = await lineCountsFor([
    ...new Set(session.turns.flatMap((turn) => turn.filesTouched.map((entry) => entry.file))),
  ]);

  return { location, host, raw, session, resources, versions, memory, lineCounts };
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
    normalization: session.normalization,
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
} = {}) {
  const { outputPath = '', gitStatus = '', generatedAt = new Date().toISOString() } = options;
  return buildDocument(loaded.session, { ...loaded, outputPath, gitStatus, generatedAt });
}
