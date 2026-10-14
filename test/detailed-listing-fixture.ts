import type { SessionOccurrence } from '../src/session/sources.ts';
import type { ListingEvidence } from '../src/session/listing-evidence-types.ts';
import { detailedListingStyles } from '../src/session/detailed-listing-styles.ts';

/** Normalizes whitespace so assertions survive an editor/Prettier reformat of the stylesheet. */
export const compactCss = (css: string) => css.replace(/\s+/gu, ' ').replace(/\s*([{}:;,>])\s*/gu, '$1').replaceAll(';}', '}');
export const detailedStylesForTest = () => compactCss(detailedListingStyles);

export function detailedOccurrence (id: string, overrides: Partial<SessionOccurrence> = {}): SessionOccurrence {
  const provenance = { userDataRoot: 'C:\\Code', workspaceStoragePath: `C:\\Code\\User\\workspaceStorage\\${id}` };
  return {
    occurrenceId: id, provider: 'local', sessionId: id, title: `Chat ${id}`, titleSource: 'index',
    activityTimestamp: 1700000000000, activitySource: 'journal', createdTimestamp: 1699990000000, promptCount: 1,
    provenance, visibility: { status: 'included' }, diagnostics: [],
    backing: { status: 'verified', source: {
      kind: 'local-journal', sessionId: id, path: `${provenance.workspaceStoragePath}\\chatSessions\\${id}.jsonl`,
      schemaVersion: 3, sha256: id, provenance,
    } }, ...overrides,
  };
}
export function detailedEvidence (overrides: Partial<ListingEvidence> = {}): ListingEvidence {
  return {
    state: 'read', titles: [{ source: 'index.title', value: 'Indexed title' }],
    dates: [{ source: 'journal.creationDate', timestamp: 1700000000000, recordedValue: '1700000000000' }],
    turns: [{
      id: 'r', prompt: 'Question', timestamp: 1700000000000, role: 'human', selectedModel: 'auto',
      models: ['answer-model'], auto: true, effort: 'high', responsePresent: true,
      canceled: false, error: false, files: [],
    }],
    models: ['answer-model'], bytes: 500, byteScope: 'complete journal', files: [], editTurns: 0,
    errors: 0, canceled: 0, responsePresent: true, injectedPrompts: null,
    history: { state: 'missing', turns: null, path: 'C:\\history\\state.json' },
    artifacts: [], artifactLocations: [], auditedBytes: null, artifactState: 'missing', context: [], fork: null, flags: [], diagnostics: [],
    ...overrides,
  };
}
