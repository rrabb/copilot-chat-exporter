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
