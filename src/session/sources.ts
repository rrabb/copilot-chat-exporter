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
  backing:
    | { status: 'verified'; source: VerifiedSessionSource }
    | { status: 'unresolved' | 'unsupported'; reason: string };
  visibility:
    | { status: 'included' }
    | { status: 'hidden'; reason: 'fix' | 'confirmed-empty' | 'superseded-placeholder' | 'ambiguous' | 'new-chat-unknown' };
  parentOccurrenceId?: string;
  diagnostics: InventoryDiagnostic[];
}
