// The parsed model: the shapes this project owns.
//
// VS Code's chat journal is a private, undocumented format that changes without notice. What
// limits the damage is that the journal's `kind` field is only read in one function
// (`classifyNode`); everything after that works on the `type` field of the shapes below. This
// file writes those shapes down so each half of the pipeline has something to be tested against.
//
// Terms used here are defined in the README's Concepts section. The two that get confused:
// a `Turn` is an input idea (one prompt and its reply); a "section" is an output idea
// (a `##` region of the produced Markdown) and deliberately has no type here.
//
// Nothing in this file emits runtime code, so it can be edited without re-saving the recorded
// exports the checks compare against.

/** Opaque journal request. Only `verify/` reads these - its cross-check must see raw data. */
export type RawRequest = Record<string, unknown>;

/** One session found on disk: where its journal is, and which storage folder it belongs to. */
export interface SessionLocation {
  sessionId: string;
  sessionPath: string;
  /** The `workspaceStorage/<hash>` directory the optional stores sit under. */
  hashRoot: string;
  mtimeMs?: number;
  /** Best available display title, used by `--list`. */
  title?: string;
  /** Current GUI title read from `chat.ChatSessionStore.index`, if available. */
  indexedTitle?: string;
}

/**
 * A `toolSpecificData` payload, verbatim from the journal. VS Code owns this shape.
 *
 * It reaches the renderer as-is, because the renderer's job for it is to pretty-print it as
 * JSON. Three payload kinds are understood by name - `terminal`, `subagent`, `todoList` - and
 * anything else falls through to that generic dump, which is why an unrecognised payload
 * degrades rather than disappears.
 */
export interface ToolPayload {
  kind?: string;
  [field: string]: unknown;
}

export interface PromptTokenDetail {
  category: string;
  label: string;
  percentageOfPrompt: number;
}

export interface LegacyPromptTokenDetails {
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** An entry of `manage_todo_list`'s list, verbatim from the journal. */
export interface TodoItem {
  id?: string;
  title?: string;
  status?: 'not-started' | 'in-progress' | 'completed' | string;
}

export type EditOperation = 'created' | 'modified' | 'deleted' | 'renamed';

export interface PatchFileChange {
  file: string;
  previousFile?: string;
  op: EditOperation;
  additions: number;
  deletions: number;
  diff: string;
}

export interface ToolPatch {
  toolCallId: string;
  files: PatchFileChange[];
  succeeded: boolean | null;
}

/** Assistant prose. Arrives with no `kind` at all and is matched by shape. */
export interface TextNode {
  type: 'text';
  text: string;
}

/** One reasoning thought, kept at its recorded position rather than hoisted. */
export interface ThinkNode {
  type: 'think';
  text: string;
}

/** An inline file reference, reduced to a basename. */
export interface RefNode {
  type: 'ref';
  text: string;
}

export interface EditNode {
  type: 'edit';
  uri: string;
  op: EditOperation;
  /** Set only for `textEditGroup`, which renders inline rather than as its own block. */
  inline?: boolean;
}

export interface ToolNode {
  type: 'tool';
  toolId: string;
  /** Journal identity. Used to merge progress updates and to attach persisted resources. */
  toolCallId: string;
  invocation: string;
  pastTense: string;
  title: string;
  isComplete: boolean;
  isConfirmed?: boolean | Record<string, unknown>;
  toolSpecificData: ToolPayload | null;
  /** Terminal calls only. */
  command: string;
  /** Subagent calls only. */
  promptText: string;
  /** Submitted source or text stored by some tools in `resultDetails.input`. */
  inputText: string;
  /** Language hint paired with `resultDetails.input`, when recorded. */
  inputLanguage: string;
  /** Complete persisted `resultDetails`, retained so unknown result shapes cannot disappear. */
  resultDetails: unknown | null;
  /** Present only on `manage_todo_list` calls; `null` elsewhere. */
  todos: TodoItem[] | null;
  /** Terminal output, ANSI already stripped. */
  output: string;
  exitCode: number | null;
  duration: number | null;
  /** Model-facing result text, from `resultDetails.output` or a subagent's report. */
  resultText: string;
  /** Recovered from the invocation message, not from a structured field. */
  fileUri: string;
  /** Optional edit details recovered from the sibling transcript by tool-call identity. */
  patchFiles: PatchFileChange[];
}

export type TurnNode = TextNode | ThinkNode | RefNode | EditNode | ToolNode;

/** A file this turn changed, with the strongest operation seen for it. */
export interface FileTouch {
  file: string;
  op: EditOperation;
  additions?: number;
  deletions?: number;
  /** One entry per submitted file block, in recorded call order. */
  diffs?: string[];
}

/**
 * Per-request metadata copied straight off the journal request, one field per entry in
 * `SCALAR_FIELDS`. Every field below reaches the turn-info table; the index signature is what
 * lets a field be collected before anything renders it.
 */
export interface TurnScalars {
  modelId?: string;
  modelState?: unknown;
  responseId?: string;
  timestamp?: number;
  responseTimestamp?: number;
  promptTokens?: number;
  completionTokens?: number;
  copilotCredits?: number | string;
  elapsedMs?: number;
  timeSpentWaiting?: number;
  promptTokenDetails?: PromptTokenDetail[] | LegacyPromptTokenDetails;
  followups?: unknown[];
  result?: unknown;
  contentReferences?: unknown[];
  codeCitations?: unknown[];
  agent?: { id?: string; extensionId?: { value?: string } };
  modeInfo?: { modeId?: string; kind?: string };
  variableData?: unknown;
  isCanceled?: boolean;
  [field: string]: unknown;
}

/** One user prompt and everything the assistant did in reply. */
export interface Turn {
  /** Journal id, or a synthetic one when the journal omitted it. */
  requestId: string;
  ts: number | null;
  prompt: string;
  /** Deduplicated thoughts, shorter prefixes of a longer thought removed. */
  reasoning: string[];
  /** The `text` and `ref` subset of `body`, in order. */
  prose: TurnNode[];
  /** Every node in recorded order - prose, reasoning, tools and edits interleaved as they streamed. */
  body: TurnNode[];
  toolNodes: ToolNode[];
  /** The last non-empty todo list seen this turn. */
  todos: TodoItem[];
  filesTouched: FileTouch[];
  scalar: TurnScalars;
  /** 1-based position among turns that survived parsing. */
  number: number;
}

/**
 * Schema-drift tally. `seen` counts every response item by kind; `dropped` counts those that
 * classified to nothing. A kind is only *unhandled* when it is absent from the dispatch table -
 * a handled kind can legitimately produce nothing, as empty streamed `thinking` partials do.
 */
export interface Census {
  seen: Map<string, number>;
  dropped: Map<string, number>;
  /** `toolSpecificData.kind` counts, for spotting a renamed tool payload. */
  toolData: Map<string, number>;
  /** Kind and count, descending. Non-empty means content was dropped in silence. */
  unhandled: Array<[string, number]>;
  /** Payload kinds neither lifted into fields nor reviewed as generic. Content still renders. */
  unrecognizedToolData: Array<[string, number]>;
}

export interface ParsedSession {
  /** Effective display title: indexed GUI title, journal custom title, then default title. */
  title: string;
  /** Root `customTitle` replayed from the session journal. */
  customTitle: string;
  /** VS Code-compatible title derived from the first prompt. */
  defaultTitle: string;
  creationDate: number | null;
  responderUsername: string;
  initialLocation: string;
  hasPendingEdits?: boolean;
  inputState?: unknown;
  repoData?: unknown;
  pendingRequests?: unknown[];
  workingDirectory?: string;
  turns: Turn[];
  rawRequests: RawRequest[];
  census: Census;
  editedFiles: string[];
  /** Non-fatal parse problems, surfaced in the export rather than thrown. */
  errors: string[];
}
