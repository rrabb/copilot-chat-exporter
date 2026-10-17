import type { StorageArtifact } from './listing-storage.ts';

export interface ListingTitleEvidence { source: string; value: string }
export interface ListingDateEvidence { source: string; timestamp: number; recordedValue: string }
export interface ListingFileChange {
  file: string;
  operation: string;
  added: number | null;
  removed: number | null;
  estimated: boolean;
  source: string;
}
/** Where an agent turn's credits come from. Credits are AI credits: recorded nano-AIU / 1,000,000,000. */
export interface ListingTurnUsage {
  basis: 'per-call' | 'per-call-partial' | 'running-total';
  /** Running totals only: the turn numbers one checkpoint difference covers, when it covers several. */
  span: { from: number; to: number } | null;
  /** Per-call rows matched to this turn. */
  calls: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Basis running-total only: credits of the per-call rows this turn also has, which are incomplete. */
  perCallCredits: number | null;
}

export interface ListingUsageModel {
  model: string;
  calls: number;
  credits: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

/** Chat-level usage of an agent conversation, for the detailed listing. */
export interface ListingSessionUsage {
  scope: 'main' | 'subagent';
  source: 'session-store' | 'event-log' | 'none';
  perCallRows: number;
  /** Assistant replies in the whole log, to judge how much of the work the per-call rows cover. */
  replies: number;
  complete: boolean;
  /** Last running total of the whole log, in credits. */
  loggedCredits: number | null;
  loggedEvent: string | null;
  shutdowns: number;
  beforeFirstTurnCredits: number;
  unmatchedCredits: number;
  byModel: ListingUsageModel[];
  /** Subagent scope only: this agent's own recorded calls. */
  agent?: { calls: number; credits: number; inputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; outputTokens: number };
}

export interface ListingTurnEvidence {
  id: string;
  prompt: string;
  role: 'human' | 'delegated' | 'follow-up';
  timestamp: number | null;
  selectedModel: string | null;
  models: string[];
  auto: boolean;
  effort: string | null;
  /** Recorded incremental Copilot credits, not a token-derived estimate. */
  credits?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  /** Agent chats: how the credits above were obtained. Absent for Local chats. */
  usage?: ListingTurnUsage;
  responsePresent: boolean | null;
  canceled: boolean;
  error: boolean;
  files: ListingFileChange[];
}
export interface ListingArtifact { path: string; bytes: number }
export interface ListingArtifactLocation {
  kind: string;
  path: string;
  form: 'file' | 'directory';
  state: 'present' | 'missing' | 'unreadable';
  bytes: number | null;
  files: number | null;
}
export interface ListingEvidence {
  storage?: StorageArtifact[];
  /** Agent chats only. */
  usage?: ListingSessionUsage;
  state: 'read' | 'unavailable' | 'changed';
  titles: ListingTitleEvidence[];
  dates: ListingDateEvidence[];
  turns: ListingTurnEvidence[];
  models: string[];
  bytes: number | null;
  byteScope: string;
  files: ListingFileChange[];
  editTurns: number | null;
  errors: number | null;
  canceled: number | null;
  responsePresent: boolean | null;
  injectedPrompts: number | null;
  history: { state: 'recorded' | 'empty' | 'missing' | 'unreadable' | 'not-applicable'; turns: number | null; path: string | null };
  artifacts: ListingArtifact[];
  artifactLocations: ListingArtifactLocation[];
  auditedBytes: number | null;
  artifactState: 'read' | 'missing' | 'unreadable' | 'not-applicable';
  context: { field: string; value: string; source: string }[];
  fork: { parentSessionId: string; source: string } | null;
  flags: string[];
  diagnostics: { path: string; description: string }[];
}
