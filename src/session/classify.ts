// The one place that reads VS Code's `kind` field.
//
// **If VS Code changes what a chat session looks like, you edit this file.** Everything after it
// works on the `type` field of the shapes in `../types.ts`, so a rename here does not spread.
// The procedure - diagnosing, deciding which list a new name belongs in, re-saving the recorded
// exports - is in `docs/UPGRADING.md`.
//
// These lists are not interchangeable:
//   handled  - dispatched on, produces an export node
//   ignored  - deliberately dropped, and OBSERVED in a real journal
//   unseen   - known to exist but never observed here, so still reported if it appears
//   generic  - reviewed and approved to retain only as raw JSON
//
// Never move a name into the ignored list without seeing it in a real journal first. That list
// silences the census, and fourteen unobserved names once sat there disarming the very alarm
// built to catch them.

import { extractUri, stripAnsi } from '../text.ts';

// A handled kind can still yield nothing for a given item (an empty streamed `thinking` partial,
// say); that is not drift.
export const HANDLED_RESPONSE_KINDS = new Set([
  'thinking',
  'toolInvocationSerialized',
  'textEditGroup',
  'workspaceEdit',
  'inlineReference',
  'markdownContent',
  'autoModeResolution',
  'warning',
  'confirmation',
  'questionCarousel',
  'markdownVuln',
]);

// Produce no export node ON PURPOSE: presentation, bookkeeping, or content already captured
// elsewhere. The journal is an undocumented private format, so a renamed or added kind would be
// dropped in silence - and the raw-journal cross-check keys on the same names, so it would agree
// too. The census is the only check that would notice.
export const IGNORED_RESPONSE_KINDS = new Set([
  'undoStop',
  'codeblockUri',
  'progressMessage',
  'progressTaskSerialized',
  'mcpServersStarting',
]);

// Documented in VS Code's response-content union but never seen in any journal parsed here.
// If one appears it is reported as unhandled, and only then does it earn a branch below or a
// place in the ignored list.
export const KNOWN_UNSEEN_KINDS = new Set([
  'info',
  'command',
  'notebookEditGroup',
  'extensions',
  'pullRequest',
  'multiDiffData',
  'treeData',
  'systemNotification',
  'planReview',
  'hook',
  'externalEdit',
  'elicitationSerialized',
  'clearToPreviousToolInvocation',
  'disabledClaudeHooks',
]);

// Add a response kind here only after reviewing its payload and approving generic JSON output.
// It still renders as raw JSON, but no longer blocks strict verification.
export const GENERIC_RESPONSE_KINDS = new Set<string>();

// `toolSpecificData` payload kinds lifted into dedicated fields below. A rename here is the quiet
// failure: the content still renders, but as a generic JSON dump instead of a command block, todo
// list or subagent report - and no other check would notice.
export const HANDLED_TOOL_PAYLOAD_KINDS = new Set([
  'terminal',
  'subagent',
  'todoList',
]);

// Observed payloads with no dedicated handling. They fall through to the generic details dump,
// which is acceptable; listing them records that the fall-through was reviewed, so that a kind
// nobody has seen before still gets reported.
export const GENERIC_TOOL_PAYLOAD_KINDS = new Set([
  'input',
  'extensions',
  'pullRequest',
  'simpleToolInvocation',
  'search',
  'resources',
  'modifiedFilesConfirmation',
  'agentFeedbackReviewConfirmation',
  'sessionCreated',
  'generatedImage',
  'automationConfigured',
]);

// Recorded so a reader knows which VS Code the parse was validated against. A census detects a
// NEW or renamed kind; it cannot detect an existing kind quietly changing meaning.
export const VALIDATED_AGAINST = 'VS Code 1.134 / Copilot Chat 0.62 and VS Code 1.141.2 (commit 16507d91) / Copilot Chat 0.69.0 (journal schema kinds 0/1/2/3)';

export function thinkingText (value: unknown) {
  if (typeof value === 'string')
    return value;
  if (Array.isArray(value))
    return value.map((part) => (part && (part.value || part.text)) || '').join('');
  return '';
}

function messageValue (message: unknown) {
  if (typeof message === 'string')
    return message;
  return (message && (message as any).value) || (message && (message as any).text) || '';
}

function questionCarouselText (questions: unknown) {
  if (!Array.isArray(questions))
    return '';
  return questions.flatMap((question: any) => {
    if (!question || typeof question !== 'object')
      return [];
    const lines = [messageValue(question.title), messageValue(question.message)].filter(Boolean);
    for (const option of Array.isArray(question.options) ? question.options : []) {
      const label = messageValue(option?.label);
      const value = messageValue(option?.value);
      if (label || value)
        lines.push(`- ${label || value}${label && value && label !== value ? ` (${value})` : ''}`);
    }
    return lines;
  }).join('\n');
}

function confirmationText (buttons: unknown) {
  if (!Array.isArray(buttons))
    return '';
  return buttons.map((button: any) => messageValue(button?.label) || messageValue(button?.title) || messageValue(button?.value))
    .filter(Boolean).map((label: string) => `- ${label}`).join('\n');
}

// Tool names are VS Code's vocabulary too, so the mapping lives beside the kind lists.
export function fileOperation (toolId: string) {
  if (/createFile/i.test(toolId ?? ''))
    return 'created';
  if (/applyPatch|replaceString|multiReplace|insert_edit|editFile/i.test(toolId ?? ''))
    return 'modified';
  return '';
}

// One response item in, one node out - or an array, or null. Returning null is normal: an empty
// streamed partial classifies to nothing. Assistant prose arrives with NO `kind` at all and is
// matched by shape in the final branch.
//
// `item` is `any` on purpose: it is one record of an undocumented format owned by someone else.
// Declaring a shape here would be a guess that the compiler then enforces as if it were known.
export function classifyNode (item: any) {
  const produced = classifyRecord(item);
  // A handled kind whose source text the classifier did not carry into its output falls back
  // to the JSON block, which the census counts as unreviewed (a strict failure).
  return outputCheckFailure(item, produced) ? unknownResponse(item) : produced;
}

function classifyRecord (item: any) {
  if (!item || typeof item !== 'object')
    return null;
  if (item.kind === 'thinking') {
    const text = thinkingText(item.value).trim();
    return text ? { type: 'think', text } : null;
  }
  if (item.kind === 'markdownContent') {
    const text = typeof item.content === 'string' ? item.content : item.content?.value;
    return typeof text === 'string' && text ? { type: 'text', text } : null;
  }
  if (item.kind === 'markdownVuln') {
    // VS Code merges `content.value` into the surrounding Markdown (annotations.ts at 16507d91),
    // so the text can be a fragment of a code line. Anything off this form stays unreviewed JSON.
    const text = standardMarkdownValue(item.content);
    const vulnerabilities = vulnerabilityList(item.vulnerabilities);
    if (text === null || !vulnerabilities)
      return unknownResponse(item);
    return {
      type: 'text',
      text,
      vulnerabilities,
      omittedDisplayMetadata: DISPLAY_METADATA_KEYS.filter((key) => key in item.content),
    };
  }
  if (item.kind === 'toolInvocationSerialized') {
    const invocation = messageValue(item.invocationMessage);
    const pastTense = messageValue(item.pastTenseMessage);
    const tsd = item.toolSpecificData ?? null;
    const state = tsd?.terminalCommandState ?? null;
    const rawResultText = Array.isArray(item.resultDetails?.output)
      ? item.resultDetails.output.filter((part: any) => part?.isText && typeof part.value === 'string').map((part: any) => part.value).join('\n').trim()
      : '';
    const resultError = typeof item.resultError === 'string'
      ? item.resultError
      : typeof item.resultError?.message === 'string' ? item.resultError.message : '';
    // A subagent's report is a plain string field on toolSpecificData, not in
    // resultDetails.output, so route it into the same Tool result slot other tools use.
    const resultText = rawResultText || (tsd?.kind === 'subagent' && typeof tsd.result === 'string' ? tsd.result.trim() : '');
    return {
      type: 'tool',
      toolId: item.toolId,
      toolCallId: item.toolCallId,
      ...(isNoContentToolRecord(item) ? { noRecordedContent: true as const } : {}),
      invocation,
      pastTense,
      title: item.generatedTitle || '',
      isComplete: item.isComplete !== false,
      isConfirmed: item.isConfirmed,
      toolSpecificData: tsd,
      command: tsd?.kind === 'terminal' ? (tsd.commandLine?.original || tsd.commandLine?.forDisplay || '') : '',
      promptText: tsd?.kind === 'subagent' && typeof tsd.prompt === 'string' ? tsd.prompt.trim() : '',
      inputText: typeof item.resultDetails?.input === 'string' ? item.resultDetails.input.trim() : '',
      inputLanguage: typeof item.resultDetails?.inputLanguage === 'string' ? item.resultDetails.inputLanguage : '',
      resultDetails: item.resultDetails ?? null,
      todos: tsd?.kind === 'todoList' ? (tsd.todoList || []) : null,
      output: stripAnsi(tsd?.terminalCommandOutput?.text ?? '').trim(),
      exitCode: state?.exitCode ?? null,
      duration: state?.duration ?? null,
      resultText,
      ...(resultError ? { resultError } : {}),
      fileUri: extractUri(invocation) || extractUri(pastTense),
      patchFiles: [],
    };
  }
  if (item.kind === 'warning') {
    const text = messageValue(item.content);
    return { type: 'note', title: 'Warning', ...(text ? { text } : {}) };
  }
  if (item.kind === 'confirmation') {
    const title = messageValue(item.title);
    const message = messageValue(item.message);
    const buttons = confirmationText(item.buttons);
    const text = [message, buttons].filter(Boolean).join('\n');
    return { type: 'note', title: title ? `Confirmation: ${title}` : 'Confirmation', ...(text ? { text } : {}) };
  }
  if (item.kind === 'questionCarousel') {
    const text = questionCarouselText(item.questions);
    return text ? { type: 'note', title: 'Copilot questions', text } : null;
  }
  if (item.kind === 'textEditGroup') {
    const uri = item.uri && (item.uri.path || item.uri.fsPath || item.uri);
    return { type: 'edit', uri: typeof uri === 'string' ? uri : '', op: 'modified', inline: true };
  }
  if (item.kind === 'workspaceEdit') {
    // One edit item can describe several file operations, so this branch returns a list.
    // oldResource alone is a delete, newResource alone a create, both a rename.
    const resource = (value: any) => (typeof value?.path === 'string' && value.path) || (typeof value?.fsPath === 'string' && value.fsPath) || '';
    const entries = (Array.isArray(item.edits) ? item.edits : []).map((edit: any) => {
      const from = resource(edit?.oldResource);
      const to = resource(edit?.newResource);
      if (from && to)
        return { type: 'edit', uri: to, op: 'renamed' };
      if (to)
        return { type: 'edit', uri: to, op: 'created' };
      return from ? { type: 'edit', uri: from, op: 'deleted' } : null;
    }).filter(Boolean);
    return entries.length ? entries : null;
  }
  if (item.kind === 'inlineReference') {
    const label = inlineReferenceLabel(item);
    return label ? { type: 'ref', text: label } : unknownResponse(item);
  }
  if (item.kind === 'autoModeResolution') {
    // Which model Auto picked for this request. Observed in two shapes: the newer
    // `resolved: { id, name }` object and older flattened `resolvedModel*` fields with a
    // router confidence and label. It is request metadata, not response content.
    const modelId = nonEmptyString(item.resolved?.id) || nonEmptyString(item.resolvedModel);
    const modelName = nonEmptyString(item.resolved?.name) || nonEmptyString(item.resolvedModelName);
    if (!modelId && !modelName)
      return null;
    return {
      type: 'autoModel',
      modelId,
      modelName,
      confidence: typeof item.confidence === 'number' && Number.isFinite(item.confidence) ? item.confidence : null,
      predictedLabel: nonEmptyString(item.predictedLabel),
    };
  }
  if (item.kind == null && typeof item.value === 'string')
    return { type: 'text', text: item.value };
  if (typeof item.kind === 'string'
    && !HANDLED_RESPONSE_KINDS.has(item.kind) && !IGNORED_RESPONSE_KINDS.has(item.kind))
    return unknownResponse(item);
  return null;
}

// Fields that carry a handled kind's content. A record whose content fields hold text while the
// classifier produced nothing from them has changed form, not merely streamed an empty partial.
const CONTENT_FIELDS: Record<string, string[]> = {
  thinking: ['value'],
  markdownContent: ['content'],
  warning: ['content'],
  confirmation: ['title', 'message', 'buttons'],
  questionCarousel: ['questions'],
  textEditGroup: ['uri'],
  workspaceEdit: ['edits'],
  autoModeResolution: ['resolved', 'resolvedModel', 'resolvedModelName'],
};

function holdsText (value: unknown, depth = 0): boolean {
  if (typeof value === 'string')
    return value.trim() !== '';
  if (!value || typeof value !== 'object' || depth > 8)
    return false;
  return Object.values(value).some((entry) => holdsText(entry, depth + 1));
}

function producedText (kind: string, nodes: any[]) {
  if (kind === 'warning')
    return nodes.some((node) => nonEmptyString(node.text));
  if (kind === 'confirmation')
    return nodes.some((node) => nonEmptyString(node.text) || node.title !== 'Confirmation');
  if (kind === 'textEditGroup')
    return nodes.some((node) => nonEmptyString(node.uri));
  return nodes.length > 0;
}

const EMPTY_TOOL_METADATA = new Set([
  'kind', 'toolId', 'toolCallId', 'invocationMessage', 'isComplete', 'isConfirmed',
  'source', 'presentation', 'icon', 'subAgentInvocationId', 'isAttachedToThinking',
]);

/** Only the metadata fields reviewed at VS Code 16507d91 can establish missing content. */
export function isNoContentToolRecord (item: Record<string, unknown>): boolean {
  if (item.kind !== 'toolInvocationSerialized' || (item.invocationMessage !== undefined && item.invocationMessage !== '')
    || !nonEmptyString(item.toolId) || !nonEmptyString(item.toolCallId)
    || Object.keys(item).some((key) => !EMPTY_TOOL_METADATA.has(key)))
    return false;
  const metadata = (value: unknown, keys: string[]) => value == null || (typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([key, entry]) => keys.includes(key) && typeof entry === 'string'));
  return metadata(item.source, ['type', 'label']) && metadata(item.icon, ['id'])
    && (item.isConfirmed == null || typeof item.isConfirmed === 'boolean'
      || (typeof item.isConfirmed === 'object' && !Array.isArray(item.isConfirmed)
        && Object.keys(item.isConfirmed).length === 1 && 'type' in item.isConfirmed
        && typeof item.isConfirmed.type === 'number' && Number.isFinite(item.isConfirmed.type)))
    && ['isComplete', 'isAttachedToThinking'].every((key) => item[key] === undefined || typeof item[key] === 'boolean')
    && ['presentation', 'subAgentInvocationId'].every((key) => item[key] === undefined || typeof item[key] === 'string');
}

/**
 * Why a record of a handled kind did not yield usable output, or null when it did. Checks that
 * the classifier produced non-empty output from the record, not merely that fields exist.
 * markdownVuln and inlineReference check their own form and fall back to JSON in classifyNode.
 */
export function outputCheckFailure (item: any, produced: unknown) {
  const kind = item?.kind;
  if (typeof kind !== 'string' || !HANDLED_RESPONSE_KINDS.has(kind))
    return null;
  const nodes = (Array.isArray(produced) ? produced : produced ? [produced] : []) as any[];
  if (nodes.some((node) => node?.type === 'unknownResponse'))
    return null;
  if (kind === 'toolInvocationSerialized') {
    const node = nodes[0];
    if (!node || !nonEmptyString(node.toolId))
      return 'tool-without-id';
    const sourceHasMessage = holdsText(item.invocationMessage) || holdsText(item.pastTenseMessage);
    if (sourceHasMessage && !(node.invocation || node.pastTense))
      return 'tool-message-not-rendered';
    const content = ['invocation', 'pastTense', 'title', 'command', 'promptText', 'inputText', 'output', 'resultText', 'resultError', 'toolSpecificData', 'resultDetails'];
    if (content.some((key) => holdsText(node[key])))
      return null;
    return node.noRecordedContent === true && isNoContentToolRecord(item) ? null : 'tool-without-content';
  }
  if (kind === 'workspaceEdit' && Array.isArray(item.edits) && nodes.length < item.edits.length)
    return 'edit-not-rendered';
  const fields = CONTENT_FIELDS[kind];
  if (!fields)
    return null;
  const hasContent = fields.some((field) => holdsText(item[field]));
  return hasContent && !producedText(kind, nodes) ? 'content-not-rendered' : null;
}

const DISPLAY_METADATA_KEYS = ['supportThemeIcons', 'supportHtml', 'uris'];
const STANDARD_MARKDOWN_KEYS = new Set(['value', ...DISPLAY_METADATA_KEYS]);

/** `content.value` when `content` is VS Code's standard Markdown string object, otherwise null. */
export function standardMarkdownValue (content: unknown) {
  if (!content || typeof content !== 'object' || Array.isArray(content))
    return null;
  const record = content as Record<string, unknown>;
  if (typeof record.value !== 'string' || Object.keys(record).some((key) => !STANDARD_MARKDOWN_KEYS.has(key)))
    return null;
  return record.value;
}

export function vulnerabilityList (value: unknown) {
  if (!Array.isArray(value)
    || !value.every((entry) => typeof entry?.title === 'string' && typeof entry?.description === 'string'))
    return null;
  return value.map((entry) => ({ title: entry.title as string, description: entry.description as string }));
}

/**
 * The label VS Code shows for an inline reference (annotations.ts in 1.141.2): the recorded
 * `name` first, otherwise a symbol's name or the basename of the URI, Location or path. A root
 * URI has no basename, so the exporter falls back to the path, then the external URI (VS Code
 * would show an empty label there).
 */
export function inlineReferenceLabel (item: any) {
  const name = nonEmptyString(item?.name);
  if (name)
    return name;
  const ref = item?.inlineReference || item?.reference;
  if (typeof ref === 'string')
    return baseName(ref);
  if (!ref || typeof ref !== 'object')
    return '';
  const symbol = ref.location ? nonEmptyString(ref.name) : '';
  if (symbol)
    return symbol;
  const uri = ref.location?.uri || ref.uri || ref;
  const location = nonEmptyString(uri?.path) || nonEmptyString(uri?.fsPath) || nonEmptyString(uri?.external);
  return baseName(location.replace(/^[a-z][\w+.-]*:\/\//i, '')) || location;
}

/** The last path segment, splitting on either slash so Windows paths work on any platform. */
function baseName (value: unknown) {
  return typeof value === 'string' ? value.split(/[\\/]/).filter(Boolean).pop()?.trim() || '' : '';
}

function unknownResponse (item: any) {
  return { type: 'unknownResponse' as const, kind: String(item.kind), payload: JSON.stringify(item, null, 2) };
}

function nonEmptyString (value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
