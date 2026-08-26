// Reading the journal file into turns.
//
// The journal is a log of changes, not a document: the first line is a full snapshot, and every
// line after it either sets a value at a path or appends to one. Replaying those in order
// rebuilds the final request objects, which then become the turns in `../types.ts`.
//
// Two rules here are easy to get wrong and expensive to lose:
//   - `response[]` holds nested arrays and numeric-keyed objects like `{"0": ...}`. Skipping
//     that flattening makes most tool calls vanish - an early version reported 72 for a session
//     that had over 400.
//   - the journal re-emits a tool call each time its status changes, so later copies are merged
//     into the first, which is the order the chat displayed.

import type { ParsedSession, TurnNode } from '../types.ts';
import { COLLATOR, parseJson } from '../text.ts';
import { workspacePath } from '../host.ts';
import {
  GENERIC_TOOL_PAYLOAD_KINDS, HANDLED_RESPONSE_KINDS, HANDLED_TOOL_PAYLOAD_KINDS,
  IGNORED_RESPONSE_KINDS, classifyNode, fileOperation, thinkingText,
} from './classify.ts';

// Per-request metadata copied straight through. Some are collected but not yet rendered.
const SCALAR_FIELDS = [
  'modelId', 'modelState', 'responseId', 'timestamp', 'responseTimestamp',
  'promptTokens', 'completionTokens', 'copilotCredits', 'elapsedMs', 'timeSpentWaiting',
  'promptTokenDetails', 'followups', 'result', 'contentReferences', 'codeCitations',
  'agent', 'modeInfo', 'variableData', 'isCanceled',
];

export function messageText (message: any) {
  if (typeof message === 'string')
    return message;
  if (!message || typeof message !== 'object')
    return '';
  if (typeof message.text === 'string')
    return message.text;
  if (Array.isArray(message.parts))
    return message.parts.map((part: any) => (part && part.text) || '').join('');
  return '';
}

// A splice arrives as an object with numeric string keys rather than an array.
function spliceValues (value: any) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length && keys.every((key) => /^\d+$/.test(key)))
      return keys.map(Number).sort((a, b) => a - b).map((key) => value[String(key)]);
  }
  return [value];
}

export function requestValues (value: any) {
  return Array.isArray(value) ? value : spliceValues(value);
}

export function* flattenItems (item: any): Generator<any> {
  if (item == null)
    return;
  if (Array.isArray(item)) {
    for (const child of item)
      yield* flattenItems(child);
    return;
  }
  if (typeof item === 'object') {
    const keys = Object.keys(item);
    if (keys.length && keys.every((key) => /^\d+$/.test(key))) {
      for (const key of keys.map(Number).sort((a, b) => a - b))
        yield* flattenItems(item[String(key)]);
      return;
    }
    yield item;
  }
}

export function parseChatSession (sessionPath: string, raw: string): ParsedSession {
  // Replay the chatSessions journal (set/append deltas) to reconstruct final
  // request objects before deriving turn-level render nodes.
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const errors = [];
  // Only these four fields are read; the journal record carries more.
  let header: {
    customTitle?: string;
    creationDate?: number;
    responderUsername?: string;
    initialLocation?: string;
    hasPendingEdits?: boolean;
    pendingRequests?: unknown[];
    workingDirectory?: string;
    [field: string]: unknown;
  } = {};
  let state: any = null;

  const ensurePathContainer = (container: any, key: string | number, nextKey: string | number) => {
    if (container[key] != null)
      return container[key];
    container[key] = typeof nextKey === 'number' ? [] : {};
    return container[key];
  };

  const setAtPath = (root: any, pathParts: Array<string | number>, value: any) => {
    if (!root || !pathParts.length)
      return;
    let target = root;
    for (let i = 0; i < pathParts.length - 1; i += 1) {
      const key = pathParts[i];
      const nextKey = pathParts[i + 1];
      if (typeof key === 'number') {
        if (!Array.isArray(target))
          return;
        target = ensurePathContainer(target, key, nextKey);
      } else {
        target = ensurePathContainer(target, key, nextKey);
      }
    }
    const last = pathParts[pathParts.length - 1];
    if (typeof last === 'number') {
      if (!Array.isArray(target))
        return;
      target[last] = value;
      return;
    }
    target[last] = value;
  };

  const appendAtPath = (root: any, pathParts: Array<string | number>, value: any) => {
    if (!root || !pathParts.length)
      return;
    let target = root;
    for (let i = 0; i < pathParts.length - 1; i += 1) {
      const key = pathParts[i];
      const nextKey = pathParts[i + 1];
      if (typeof key === 'number') {
        if (!Array.isArray(target))
          return;
        target = ensurePathContainer(target, key, nextKey);
      } else {
        target = ensurePathContainer(target, key, nextKey);
      }
    }
    const last = pathParts[pathParts.length - 1];
    const values = requestValues(value);
    if (typeof last === 'number') {
      if (!Array.isArray(target))
        return;
      const existing = Array.isArray(target[last]) ? target[last] : [];
      existing.push(...values);
      target[last] = existing;
      return;
    }
    const existing = Array.isArray(target[last]) ? target[last] : [];
    existing.push(...values);
    target[last] = existing;
  };
  const isStandaloneCompactResponse = (value: any) => {
    // Control-turn confirmation can arrive as a standalone text append.
    // Keep this one on the /compact request instead of remapping forward.
    const parts = requestValues(value)
      .filter((item: any) => item && typeof item === 'object' && typeof item.value === 'string')
      .map((item: any) => item.value.trim());
    return parts.length === 1 && parts[0] === 'Compacted conversation.';
  };
  const remapCompactIndex = (k: any, value: any) => {
    if (!Array.isArray(k) || k[0] !== 'requests' || typeof k[1] !== 'number' || k.length < 3 || !Array.isArray(state?.requests))
      return k;
    const idx = k[1];
    const current = state.requests[idx];
    if (!current || messageText(current.message).trim() !== '/compact')
      return k;
    const next = state.requests[idx + 1];
    if (!next)
      return k;
    const field = k[2];
    // Some compaction updates target the /compact index but semantically belong
    // to the next real request. Remap those updates to stabilize turn ordering.
    const keepOnCompact = field === 'response' && isStandaloneCompactResponse(value);
    if (keepOnCompact)
      return k;
    const mapped = [...k];
    mapped[1] = idx + 1;
    return mapped;
  };

  for (const [lineIndex, line] of lines.entries()) {
    const record = parseJson(line);
    if (!record) {
      errors.push(`chatSessions line ${lineIndex + 1} is not valid JSON.`);
      continue;
    }
    if (record.kind === 0 && record.v) {
      header = record.v;
      state = record.v;
      continue;
    }
    if (!state || !Array.isArray(record.k))
      continue;
    const mappedKey = remapCompactIndex(record.k, record.v);
    if (record.kind === 1)
      setAtPath(state, mappedKey, record.v);
    else if (record.kind === 2) {
      if (
        mappedKey.length === 3
        && mappedKey[0] === 'requests'
        && mappedKey[2] === 'response'
        && isStandaloneCompactResponse(record.v)
        && Array.isArray(state.requests)
        && state.requests.length
      ) {
        appendAtPath(state, mappedKey, record.v);
      } else {
        appendAtPath(state, mappedKey, record.v);
      }
    }
  }

  const requests = Array.isArray(state?.requests) ? state.requests : [];
  const collapsePrefixes = (texts: string[]) => texts.filter((text, i) => !texts.some((other, j) => j !== i && other.length > text.length && other.startsWith(text)));
  const mergeToolNode = (target: any, next: any) => {
    next.pastTense && (target.pastTense = next.pastTense);
    next.title && (target.title = next.title);
    next.invocation && (target.invocation = next.invocation);
    next.command && (target.command = next.command);
    next.promptText && (target.promptText = next.promptText);
    next.output && (target.output = next.output);
    next.resultText && (target.resultText = next.resultText);
    next.fileUri && !target.fileUri && (target.fileUri = next.fileUri);
    next.toolSpecificData && (target.toolSpecificData = next.toolSpecificData);
    Array.isArray(next.todos) && next.todos.length && (target.todos = next.todos);
    next.exitCode != null && (target.exitCode = next.exitCode);
    next.duration != null && (target.duration = next.duration);
    target.isComplete = target.isComplete || next.isComplete;
  };
  const collectThinking = (node: any, sink: string[]) => {
    if (!node || typeof node !== 'object')
      return;
    if (node.kind === 'thinking') {
      const text = thinkingText(node.value).trim();
      if (text && !sink.includes(text))
        sink.push(text);
    }
    for (const key of Object.keys(node))
      collectThinking(node[key], sink);
  };

  const editedFiles = new Set<string>();
  const census = {
    seen: new Map<string, number>(),
    dropped: new Map<string, number>(),
    toolData: new Map<string, number>(),
  };
  const tally = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  let compactReattached = 0;
  let syntheticRequestId = 0;
  const turns = requests
    .map((request: any) => {
      const requestId = request?.requestId || `synthetic_request_${++syntheticRequestId}`;
      const promptText = messageText(request?.message).trim();
      if (!promptText)
        return null;

      const nodes = [];
      const toolNodesById = new Map();
      for (const item of Array.isArray(request?.response) ? request.response : [])
        for (const leaf of flattenItems(item)) {
          const produced = classifyNode(leaf);
          // A single workspaceEdit can carry several file operations, so classifyNode may
          // return a list.
          const classified = Array.isArray(produced) ? produced : (produced ? [produced] : []);
          const kind = typeof leaf.kind === 'string' ? leaf.kind : (classified.length ? '(implicit text)' : '(no kind or value)');
          tally(census.seen, kind);
          if (typeof leaf.toolSpecificData?.kind === 'string')
            tally(census.toolData, leaf.toolSpecificData.kind);
          if (!classified.length) {
            tally(census.dropped, kind);
            continue;
          }
          for (const node of classified) {
            if (node.type === 'tool' && node.toolCallId) {
              const existing = toolNodesById.get(node.toolCallId);
              // Only fold this node into an already-tracked one while that one is still
              // incomplete (a genuine progress update). VS Code can reuse the same toolCallId
              // for a brand new invocation of an identical command run again later in the same
              // turn, so once the tracked entry is complete, a further same-id node is a fresh
              // call, not a duplicate status update - merging it in would silently hide the
              // second real invocation.
              if (existing && !existing.isComplete) {
                mergeToolNode(existing, node);
                continue;
              }
              toolNodesById.set(node.toolCallId, node);
            }
            nodes.push(node);
          }
        }

      const scalar: Record<string, unknown> = {};
      for (const field of SCALAR_FIELDS)
        if (request?.[field] != null)
          scalar[field] = request[field];

      const thoughts: string[] = [];
      collectThinking(request, thoughts);
      const reasoning = collapsePrefixes(thoughts);

    const prose = nodes.filter((node) => node.type === 'text' || node.type === 'ref');
    const toolNodes = nodes.filter((node) => node.type === 'tool');
    const todosNode = [...toolNodes].reverse().find((node) => Array.isArray(node.todos) && node.todos.length);
    const todos = todosNode ? todosNode.todos : [];
    const seenFiles = new Map();
    for (const node of nodes) {
      let file = '';
      let op = '';
      if (node.type === 'edit' && node.uri) {
        file = workspacePath(node.uri.replace(/^\//, ''));
        op = node.op || 'modified';
      } else if (node.type === 'tool' && node.fileUri) {
        op = fileOperation(node.toolId);
        file = op ? workspacePath(node.fileUri) : '';
      }
      if (!file || !op)
        continue;
      editedFiles.add(file);
      (seenFiles.get(file) === 'created' || op === 'created') ? seenFiles.set(file, 'created') : seenFiles.set(file, seenFiles.get(file) || op);
    }
    const filesTouched = [...seenFiles.entries()].map(([file, op]) => ({ file, op }));
    // Reasoning stays in the body at its recorded position so the export matches the
    // chat, where thoughts appear between tool calls rather than hoisted to the top.
    const keptThoughts = new Set(reasoning);
    const emittedThoughts = new Set();
    const body = nodes.filter((node) => {
      if (node.type !== 'think')
        return true;
      if (!keptThoughts.has(node.text) || emittedThoughts.has(node.text))
        return false;
      emittedThoughts.add(node.text);
      return true;
    });
      return { requestId, ts: request?.timestamp ?? null, prompt: promptText, reasoning, prose, body, toolNodes, todos, filesTouched, scalar };
    })
    .filter(Boolean)
    .map((turn: any, order: number) => ({ ...turn, number: order + 1 }));

  for (let i = 1; i < turns.length; i += 1) {
    const compactTurn = turns[i];
    // Guard for drift where a standalone compact confirmation landed on the
    // previous turn even after replay; move only the canonical text marker.
    if (compactTurn.prompt.trim() !== '/compact')
      continue;
    const hasCompactResponse = compactTurn.body.some((node: TurnNode) => node.type === 'text' && node.text.trim() === 'Compacted conversation.');
    if (hasCompactResponse)
      continue;
    const hasAnyAssistantBody = compactTurn.body.some((node: TurnNode) => node.type === 'text' || node.type === 'ref' || node.type === 'tool');
    if (hasAnyAssistantBody)
      continue;
    const previous = turns[i - 1];
    const sourceIndex = [...previous.body].reverse().findIndex((node: TurnNode) => node.type === 'text' && node.text.trim() === 'Compacted conversation.');
    if (sourceIndex < 0)
      continue;
    const absoluteIndex = previous.body.length - 1 - sourceIndex;
    const [moved] = previous.body.splice(absoluteIndex, 1);
    previous.prose = previous.body.filter((node: TurnNode) => node.type === 'text' || node.type === 'ref');
    compactTurn.body.unshift(moved);
    compactTurn.prose = compactTurn.body.filter((node: TurnNode) => node.type === 'text' || node.type === 'ref');
    compactReattached += 1;
  }

  return {
    customTitle: header.customTitle || '',
    creationDate: header.creationDate ?? null,
    responderUsername: header.responderUsername || '',
    initialLocation: header.initialLocation || '',
    hasPendingEdits: header.hasPendingEdits,
    inputState: header.inputState,
    repoData: header.repoData,
    pendingRequests: header.pendingRequests,
    workingDirectory: header.workingDirectory,
    turns,
    rawRequests: requests,
    census: {
      seen: census.seen,
      dropped: census.dropped,
      toolData: census.toolData,
      // A dropped kind that is neither dispatched on nor deliberately ignored is content this
      // build does not know about.
      unhandled: [...census.dropped.entries()]
        .filter(([kind]) => !HANDLED_RESPONSE_KINDS.has(kind) && !IGNORED_RESPONSE_KINDS.has(kind) && kind !== '(no kind or value)')
        .sort((left, right) => right[1] - left[1]),
      // Weaker signal than `unhandled` - the content still reaches the page, just generically.
      // Reported because an unnoticed rename of `terminal` would strip every command block,
      // exit code and duration from the export while every other check stayed green.
      unrecognizedToolData: [...census.toolData.entries()]
        .filter(([kind]) => !HANDLED_TOOL_PAYLOAD_KINDS.has(kind) && !GENERIC_TOOL_PAYLOAD_KINDS.has(kind))
        .sort((left, right) => right[1] - left[1]),
    },
    normalization: {
      compactReattached,
    },
    editedFiles: [...editedFiles].sort((left, right) => COLLATOR.compare(left, right)),
    errors,
  };
}
