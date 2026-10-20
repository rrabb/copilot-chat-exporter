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
  /** The storage directory whose optional stores belong to this session. */
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
  /**
   * Code-safety warnings a `markdownVuln` record attached to this text. Recorded by the chat source
   * and shown after the text run; the exporter does not validate them.
   */
  vulnerabilities?: { title: string; description: string }[];
  /** Display-only fields of the source record that the export does not show. */
  omittedDisplayMetadata?: string[];
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
  /** Textual tool failure, when the journal records one. */
  resultError?: string;
  /** Richer result some tools record beside the model-facing text (for example a diff), shown in its own block. */
  detailText?: string;
  /** The model's one-line statement of why it made this call (agent chats). */
  intent?: string;
  /** Agent chats: the delegated sub-agent's own conversation, when this call started one. */
  subagent?: SubagentInfo;
  /** Recovered from the invocation message, not from a structured field. */
  fileUri: string;
  /** Optional edit details recovered from the sibling transcript by tool-call identity. */
  patchFiles: PatchFileChange[];
}

export type TurnNode = TextNode | ThinkNode | RefNode | EditNode | ToolNode | NoteNode | UnknownResponseNode;

/** Recorded model usage, summed. Credits are nano-AIU / 1,000,000,000 (1 AIU = 1 AI credit = $0.01). */
export interface UsageFigures {
  calls: number;
  /** Total prompt tokens, including cached ones. */
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  nanoAiu: number;
  durationMs: number;
}

/** What one turn cost: its own model calls, and the calls of the agents it delegated to. */
export interface TurnUsage {
  own: UsageFigures;
  agents: UsageFigures;
  /** The chat's per-call rows cover about all of its assistant replies, so they can stand in for the turn's cost. */
  complete: boolean;
}

/**
 * Credits a turn added to the running total, from the difference between consecutive checkpoints.
 * A checkpoint can cover several turns (not every turn writes one); the credits are then
 * shown on the turn that holds the checkpoint, with the range it covers, never split.
 */
export interface TurnUsageTotals {
  nanoAiu: number;
  /** Turn numbers (1-based) the credits cover: this turn, or the range since the previous checkpoint. */
  fromTurn: number;
  toTurn: number;
}

/** The last cumulative total a log recorded for the whole event log. */
export interface LoggedUsageTotal {
  nanoAiu: number;
  event: string;
  at: string | null;
  /** `session.shutdown` events seen: the log was resumed that many times. */
  shutdowns: number;
}

export interface SessionUsage {
  /** Where the per-call figures came from; 'none' when only the logged total exists. */
  source: 'session-store' | 'event-log' | 'none';
  /** Assistant replies in the log, for judging how much of the work the per-call figures cover. */
  replies: number;
  recorded: UsageFigures;
  /** Calls that fit no turn and no delegated agent of this conversation. */
  unattributed: UsageFigures;
  byModel: Array<[string, UsageFigures]>;
  logged: LoggedUsageTotal | null;
  /** Credits written to the running total before the first prompt of this conversation. */
  beforeFirstTurnNanoAiu: number;
  /** Turns that hold a running-total difference. */
  turnsWithTotals: number;
  /** Per-call rows cover about all of the log's assistant replies. */
  complete: boolean;
}

/** A delegated agent: what it was asked, how it ran, and everything it did. May nest. */
export interface SubagentInfo {
  agentId: string;
  name: string;
  displayName: string;
  description: string;
  agentType: string;
  model: string;
  durationMs: number | null;
  totalToolCalls: number | null;
  totalTokens: number | null;
  cancelled: boolean;
  /** Recorded model usage of this agent alone; unset when none was recorded. */
  usage?: UsageFigures;
  /** Its own conversation. The first turn's prompt is the delegated task. */
  turns: Turn[];
}

/**
 * A recorded event that is neither prose, reasoning nor a tool call: a compaction summary, a model
 * change, a resumed session, a used skill, a system-prompt change, an image. Rendered collapsed when
 * it has a body and as one line otherwise.
 */
export interface NoteNode {
  type: 'note';
  title: string;
  /** Full text shown in a collapsed block under the title. */
  text?: string;
  /** A saved companion file the note points to. `href` is relative to the Markdown file. */
  link?: { label: string; href: string };
  image?: { href: string; alt: string };
}

/** A response kind with no reviewed renderer, kept as redacted raw JSON for inspection. */
export interface UnknownResponseNode {
  type: 'unknownResponse';
  kind: string;
  payload: string;
}

/** The model Auto resolved to for one request. Kept on the turn scalars, never in the body. */
export interface AutoModelResolution {
  modelId: string;
  modelName: string;
  /** Router confidence, recorded only by older builds. */
  confidence: number | null;
  predictedLabel: string;
}

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
  /** From `autoModeResolution` response items, in recorded order. */
  autoModelResolutions?: AutoModelResolution[];
  /** Agent chats: assistant messages whose reasoning was recorded only as an encrypted token. */
  opaqueReasoningBlocks?: number;
  /** Agent chats: how many of this turn's reasoning blocks were readable thinking versus a model-written summary. */
  reasoningKinds?: { thinking: number; summary: number };
  /** Agent chats: files and selections the user attached to the message. */
  attachments?: Array<{ type: string; name: string; mimeType?: string }>;
  /** Agent chats: usage is not recorded for this turn, so renderers must show it as unknown rather than zero. */
  agentTurn?: boolean;
  /** Agent chats: recorded model usage attributed to this turn; unset when none was recorded. */
  usage?: TurnUsage;
  /** Agent chats: credits this turn added to the log's running total, from the checkpoint differences. */
  usageTotals?: TurnUsageTotals;
  /** Agent chats: output tokens summed from `outputTokens` on this turn's assistant messages (only some logs record it). */
  messageOutputTokens?: number;
  /** Agent chats: the text actually sent to the model when it differs from what the user typed. */
  injectedContext?: string;
  [field: string]: unknown;
}

/** One user prompt and everything the assistant did in reply. */
export interface Turn {
  /** Journal id, or a synthetic one when the journal omitted it. */
  requestId: string;
  ts: number | null;
  prompt: string;
  /** Request-level failure text, when the journal records one. */
  requestError?: string;
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
 * classified to nothing. `unhandled` also includes unknown kinds kept as raw JSON until review.
 */
export interface Census {
  seen: Map<string, number>;
  dropped: Map<string, number>;
  /** `toolSpecificData.kind` counts, for spotting a renamed tool payload. */
  toolData: Map<string, number>;
  /** Kind and count, descending. Non-empty means a response kind still needs review. */
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
  /** Agent chats: recorded model usage; unset when none was recorded. */
  usage?: SessionUsage;
  census: Census;
  editedFiles: string[];
  /** Non-fatal parse problems, surfaced in the export rather than thrown. */
  errors: string[];
}
