// The one place that reads VS Code's `kind` field.
//
// **If VS Code changes what a chat session looks like, you edit this file.** Everything after it
// works on the `type` field of the shapes in `../types.ts`, so a rename here does not spread.
// The procedure - diagnosing, deciding which list a new name belongs in, re-saving the recorded
// exports - is in `docs/UPGRADING.md`.
//
// The three lists below are not interchangeable:
//   handled  - dispatched on, produces an export node
//   ignored  - deliberately dropped, and OBSERVED in a real journal
//   unseen   - known to exist but never observed here, so still reported if it appears
//
// Never move a name into the ignored list without seeing it in a real journal first. That list
// silences the census, and fourteen unobserved names once sat there disarming the very alarm
// built to catch them.

import path from 'node:path';
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
  'confirmation',
  'questionCarousel',
  'mcpServersStarting',
]);

// Documented in VS Code's response-content union but never seen in any journal parsed here.
// If one appears it is reported as unhandled, and only then does it earn a branch below or a
// place in the ignored list.
export const KNOWN_UNSEEN_KINDS = new Set([
  'prepareToolInvocation',
  'toolInvocation',
  'warning',
  'command',
  'commandButton',
  'markdownVuln',
  'notebookEdit',
  'extensions',
  'pullRequest',
  'multiDiffData',
  'treeData',
  'elicitation',
  'elicitationSerialized',
]);

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
]);

// Recorded so a reader knows which VS Code the parse was validated against. A census detects a
// NEW or renamed kind; it cannot detect an existing kind quietly changing meaning.
export const VALIDATED_AGAINST = 'VS Code 1.134 / Copilot Chat 0.62 (journal schema kind 0/1/2)';

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
  return (message && (message as any).value) || '';
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
  if (item.kind === 'toolInvocationSerialized') {
    const invocation = messageValue(item.invocationMessage);
    const pastTense = messageValue(item.pastTenseMessage);
    const tsd = item.toolSpecificData ?? null;
    const state = tsd?.terminalCommandState ?? null;
    const rawResultText = Array.isArray(item.resultDetails?.output)
      ? item.resultDetails.output.filter((part: any) => part?.isText && typeof part.value === 'string').map((part: any) => part.value).join('\n').trim()
      : '';
    // A subagent's report is a plain string field on toolSpecificData, not in
    // resultDetails.output, so route it into the same Tool result slot other tools use.
    const resultText = rawResultText || (tsd?.kind === 'subagent' && typeof tsd.result === 'string' ? tsd.result.trim() : '');
    return {
      type: 'tool',
      toolId: item.toolId,
      toolCallId: item.toolCallId,
      invocation,
      pastTense,
      title: item.generatedTitle || '',
      isComplete: item.isComplete !== false,
      isConfirmed: item.isConfirmed,
      toolSpecificData: tsd,
      command: tsd?.kind === 'terminal' ? (tsd.commandLine?.original || tsd.commandLine?.forDisplay || '') : '',
      promptText: tsd?.kind === 'subagent' && typeof tsd.prompt === 'string' ? tsd.prompt.trim() : '',
      todos: tsd?.kind === 'todoList' ? (tsd.todoList || []) : null,
      output: stripAnsi(tsd?.terminalCommandOutput?.text ?? '').trim(),
      exitCode: state?.exitCode ?? null,
      duration: state?.duration ?? null,
      resultText,
      fileUri: extractUri(invocation) || extractUri(pastTense),
    };
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
    const ref = item.inlineReference || item.reference || item.name;
    const value = typeof ref === 'string' ? ref : (ref?.path || ref?.fsPath || ref?.name || '');
    return { type: 'ref', text: value ? path.basename(String(value)) : '' };
  }
  if (item.kind == null && typeof item.value === 'string')
    return { type: 'text', text: item.value };
  return null;
}
