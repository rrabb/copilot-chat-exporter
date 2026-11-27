export type SessionProvider = 'local' | 'agent-host' | 'copilot-cli' | 'external' | 'unknown';

export interface SourceProvenance {
  userDataRoot: string;
  workspaceStoragePath: string;
  /** Set for chats VS Code saved in a window with no folder open (global storage, not a workspace folder). */
  store?: 'empty-window';
  workspaceIdentity?: { kind: 'folder' | 'workspace'; uri: string };
  indexKey?: string;
}

export interface LocalJournalSource {
  kind: 'local-journal';
  sessionId: string;
  path: string;
  schemaVersion: number;
  sha256: string;
  provenance: SourceProvenance;
}

export interface VerifiedChildScope {
  kind: 'subagent';
  agentId: string;
  parentToolCallId: string;
  /** Persisted records establishing the binding, not title/path similarity. */
  evidenceRecordIds: string[];
}

export interface SdkEventSource {
  kind: 'sdk-events';
  provider: 'agent-host' | 'copilot-cli';
  sessionId: string;
  path: string;
  schemaVersion: number;
  producer: string | null;
  scope: { kind: 'main' } | VerifiedChildScope;
  /** Stable chat identity, distinct from the SDK backing session and workspace occurrence. */
  chatIdentity: string;
  provenance: SourceProvenance;
  identityEvidence: string[];
  identityWarnings: string[];
  scopeWarnings: string[];
  /** Integrity of the read that established scope; a later loader must revalidate. */
  sha256: string;
}

export type VerifiedSessionSource = LocalJournalSource | SdkEventSource;

export interface InventoryDiagnostic {
  path: string;
  category: 'unreadable' | 'invalid-data' | 'unsupported' | 'ambiguous' | 'source-unavailable';
  description: string;
  /** A failure in this check can hide selectable chat identities. */
  affectsCandidateDiscovery?: boolean;
  /** Set when one unreadable journal file can hide only this session. */
  hidesSessionId?: string;
}

/**
 * True for a child-scope key: `#subagent/<id>` scopes, and VS Code's background sub-agent index
 * entries `<parent>?subagentChatResource%3D...`. A child exports inside its parent and never
 * competes with the parent for a selector.
 */
export function isChildScopeKey (sessionId: string): boolean {
  return sessionId.includes('#subagent/') || sessionId.includes('?subagentChatResource');
}

export function diagnosticAffectsSelector (diagnostic: InventoryDiagnostic, selector: string): boolean {
  if (!diagnostic.affectsCandidateDiscovery)
    return false;
  if (!diagnostic.hidesSessionId)
    return true;
  const wanted = selector.toLowerCase().replaceAll('-', '');
  const prefix = wanted.length >= 8 && /^[0-9a-f]+$/u.test(wanted);
  return prefix && diagnostic.hidesSessionId.replaceAll('-', '').toLowerCase().startsWith(wanted);
}

export interface SessionOccurrence {
  occurrenceId: string;
  provider: SessionProvider;
  sessionId: string;
  title: string;
  titleSource: 'index' | 'journal' | 'events' | 'fallback';
  activityTimestamp: number | null;
  activitySource: 'index' | 'journal' | 'events' | 'filesystem' | 'unknown';
  createdTimestamp?: number | null;
  promptCount?: number | null;
  provenance: SourceProvenance;
  /** A Local journal found by filename, even when the backing has not been parsed yet. */
  localJournalPath?: string;
  backing:
    | { status: 'verified'; source: VerifiedSessionSource }
    | { status: 'unresolved' | 'unsupported'; reason: string };
  visibility:
    | { status: 'included' }
    | { status: 'hidden'; reason: 'fix' | 'confirmed-empty' | 'superseded-placeholder' | 'ambiguous' | 'new-chat-unknown' };
  parentOccurrenceId?: string;
  diagnostics: InventoryDiagnostic[];
}
