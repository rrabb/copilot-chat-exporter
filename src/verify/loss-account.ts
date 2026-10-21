// Layer D: did the exported text keep the content the journal recorded?
//
// Layers A-C compare the parse with itself, so a loss that the classifier and the renderer share
// is invisible to them (see the note at the top of layers.ts). This layer does not call the
// classifier, the merge rules or the renderer. It reads the RAW recorded requests, picks out
// every piece of recorded content by its own small taxonomy, and asks one question of the
// finished Markdown: is that text in there?
//
// A piece of content is
//   present - its whole (normalized, redacted) text appears in the Markdown
//   partial - only its start or end appears (clipped or summarized)
//   absent  - neither appears, so it is lost unless a companion or omission note carries it
//
// Source-safe message sequences are checked in order and for exact repeated occurrences.
// Other text still gets presence accounting; overlapping or aggregated source records are not
// treated as separate emitted messages.
// Images have a separate independent byte/hash check in images.ts. This text check cannot
// verify opaque data. Treat "absent" as proof of loss and "present" as necessary, not sufficient.

import { redactText } from '../redaction.ts';
import { stripAnsi } from '../text.ts';

export type LossStatus = 'present' | 'partial' | 'absent';

export interface LossItem {
  /** 1-based position among the recorded requests, not the surviving turn number. */
  request: number;
  category: string;
  status: LossStatus;
  chars: number;
  /** First characters of the normalized text, for locating it. */
  sample: string;
  /** Multi-line categories only: recorded lines found in the Markdown out of those recorded. */
  lines?: { found: number; total: number };
}

export interface LossCategoryTotals { present: number; partial: number; absent: number }

export interface LossOrder { checked: number; outOfOrder: number }

export interface LossMultiplicity { checked: number; missing: number }

export interface LossAccount {
  /** Content pieces checked. Pieces too short, or with no letters or digits (an empty code fence), are not counted. */
  checked: number;
  totals: Record<string, LossCategoryTotals>;
  /** Every partial or absent piece, in recorded order. */
  unaccounted: LossItem[];
  order: LossOrder;
  multiplicity: LossMultiplicity;
  /** True when text is absent, out of order, or a repeated piece is missing. Partial pieces are not failures here. */
  failed: boolean;
}

const MINIMUM_CHARS = 4;
const EDGE_CHARS = 120;
const LONG_TEXT = 400;

// Recorded text that is many lines of output rather than prose: checked line by line.
const LINE_CATEGORIES = new Set(['tool-input', 'tool-output', 'terminal-output', 'tool-error', 'subagent-result']);

// Recorded response kinds that are presentation, bookkeeping or handled as file references.
const NON_CONTENT_KINDS = new Set([
  'undoStop', 'codeblockUri', 'progressMessage', 'progressTaskSerialized', 'mcpServersStarting',
  'textEditGroup', 'workspaceEdit',
]);

// The recorded label of an inline reference, read independently of the classifier: the `name`
// VS Code shows first, or a symbol's own name. Unlabelled references (a bare URI or Location,
// shown by basename) are file references and are not checked as text.
function inlineReferenceText (leaf: Record<string, any>): string {
  if (typeof leaf.name === 'string' && leaf.name.trim())
    return leaf.name.trim();
  const ref = leaf.inlineReference;
  return isRecord(ref) && isRecord(ref.location) && typeof ref.name === 'string' ? ref.name.trim() : '';
}

function isRecord (value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text (value: unknown): string {
  if (typeof value === 'string')
    return value;
  if (isRecord(value))
    return typeof value.value === 'string' ? value.value : typeof value.text === 'string' ? value.text : '';
  return '';
}

function* leaves (value: unknown): Generator<Record<string, any>> {
  if (Array.isArray(value)) {
    for (const child of value)
      yield* leaves(child);
    return;
  }
  if (!isRecord(value))
    return;
  const keys = Object.keys(value);
  if (keys.length && keys.every((key) => /^\d+$/u.test(key))) {
    for (const key of keys.map(Number).sort((a, b) => a - b))
      yield* leaves(value[String(key)]);
    return;
  }
  yield value;
}

function promptText (message: unknown): string {
  if (typeof message === 'string')
    return message;
  if (!isRecord(message))
    return '';
  if (typeof message.text === 'string')
    return message.text;
  return Array.isArray(message.parts) ? message.parts.map((part: unknown) => text(part)).join('') : '';
}

function reasoningText (value: unknown): string {
  if (typeof value === 'string')
    return value;
  return Array.isArray(value) ? value.map((part) => text(part)).join('') : '';
}

/** Strings under the usual content keys of a kind this layer has no taxonomy for. */
function genericStrings (value: unknown, depth = 0): string[] {
  if (typeof value === 'string')
    return [value];
  if (depth >= 3 || !isRecord(value))
    return [];
  return ['content', 'value', 'message', 'title', 'text', 'detail']
    .flatMap((key) => genericStrings(value[key], depth + 1));
}

function questionCarouselStrings (questions: unknown): string[] {
  if (!Array.isArray(questions))
    return [];
  return questions.flatMap((question) => {
    if (!isRecord(question))
      return [];
    const values = [text(question.title), text(question.message)];
    for (const option of Array.isArray(question.options) ? question.options : []) {
      if (!isRecord(option))
        continue;
      const label = text(option.label);
      const value = text(option.value);
      // The renderer shows one entry when label and value are equal, so count one piece.
      values.push(label, label === value ? '' : value);
    }
    return values.filter(Boolean);
  });
}

interface Piece {
  category: string;
  text: string;
  orderGroup?: string;
  checkMultiplicity?: boolean;
}

function pieces (request: unknown, terminalOutput?: (id: string, value: string) => string): Piece[] {
  if (!isRecord(request))
    return [];
  // Prompts and final prose are emitted in request/response order. Thinking snapshots, tool
  // progress and result fields are merged or rendered inside tool blocks, so only check presence.
  const result: Piece[] = [{
    category: 'prompt', text: promptText(request.message),
    orderGroup: 'local', checkMultiplicity: true,
  }];
  const errorMessage = request.result?.errorDetails?.message;
  typeof errorMessage === 'string' && result.push({ category: 'request-error', text: errorMessage });
  let fragments: string[] = [];
  const endStream = () => {
    for (const fragment of fragments)
      result.push({ category: 'assistant-text', text: fragment, orderGroup: 'local', checkMultiplicity: true });
    for (const line of joinedLines(fragments))
      result.push({ category: 'assistant-text-joined', text: line });
    fragments = [];
  };
  for (const leaf of leaves(request.response)) {
    const kind = typeof leaf.kind === 'string' ? leaf.kind : '';
    const streamText = assistantStreamText(kind, leaf);
    if (streamText !== null) {
      fragments.push(streamText);
      kind === 'markdownVuln' && result.push(...vulnerabilityPieces(leaf.vulnerabilities));
      continue;
    }
    endStream();
    if (NON_CONTENT_KINDS.has(kind))
      continue;
    if (kind === 'inlineReference') {
      const label = inlineReferenceText(leaf);
      label && result.push({ category: 'inline-reference', text: label });
    } else if (kind === 'thinking') {
      result.push({ category: 'reasoning', text: reasoningText(leaf.value) });
    } else if (kind === 'toolInvocationSerialized') {
      const details = leaf.resultDetails;
      const data = leaf.toolSpecificData;
      typeof details?.input === 'string' && result.push({ category: 'tool-input', text: details.input });
      typeof data?.commandLine?.original === 'string' && result.push({ category: 'tool-input', text: data.commandLine.original });
      typeof data?.prompt === 'string' && result.push({ category: 'subagent-prompt', text: data.prompt });
      for (const part of Array.isArray(details?.output) ? details.output : [])
        isRecord(part) && part.isText && typeof part.value === 'string' && result.push({ category: 'tool-output', text: part.value });
      if (typeof data?.terminalCommandOutput?.text === 'string') {
        const output = stripAnsi(data.terminalCommandOutput.text);
        result.push({ category: 'terminal-output', text: terminalOutput && leaf.toolId === 'run_in_terminal' && typeof leaf.toolCallId === 'string'
          ? terminalOutput(leaf.toolCallId, output.trim()) : output });
      }
      data?.kind === 'subagent' && typeof data.result === 'string' && result.push({ category: 'subagent-result', text: data.result });
      const failure = leaf.resultError;
      typeof failure === 'string' && result.push({ category: 'tool-error', text: failure });
      isRecord(failure) && result.push({ category: 'tool-error', text: text(failure.message) || text(failure) });
    } else if (kind === 'questionCarousel') {
      for (const value of questionCarouselStrings(leaf.questions))
        result.push({ category: `other:${kind}`, text: value });
    } else {
      for (const value of genericStrings(leaf))
        result.push({ category: `other:${kind}`, text: value });
    }
  }
  endStream();
  return result;
}

/**
 * Adjacent text leaves are one Markdown stream to VS Code and to the renderer. A fragment too short
 * to check alone (" {" inside a code line) is checked through the whole stream lines it touches.
 * Standalone short pieces, whose line holds nothing else, stay unchecked.
 */
function joinedLines (fragments: readonly string[]): string[] {
  const joined = fragments.join('');
  const lines = new Set<string>();
  let start = 0;
  for (const fragment of fragments) {
    const end = start + fragment.length;
    const short = fragment.trim() && !meaningful(normalizeForLoss(fragment));
    if (short) {
      const lineStart = joined.lastIndexOf('\n', start - 1) + 1;
      const newline = joined.indexOf('\n', Math.max(start, end - 1));
      const lineEnd = newline < 0 ? joined.length : newline;
      for (const line of joined.slice(lineStart, lineEnd).split('\n'))
        line.trim() !== fragment.trim() && meaningful(normalizeForLoss(line)) && lines.add(line);
    }
    start = end;
  }
  return [...lines];
}

/** Text a leaf adds to the assistant's Markdown stream, or null when the leaf is not stream text. */
function assistantStreamText (kind: string, leaf: Record<string, any>): string | null {
  if (kind === 'markdownContent')
    return text(leaf.content);
  if (kind === '')
    return typeof leaf.value === 'string' ? leaf.value : null;
  if (kind === 'markdownVuln' && isRecord(leaf.content) && typeof leaf.content.value === 'string' && vulnerabilityPieces(leaf.vulnerabilities).length)
    return leaf.content.value;
  return null;
}

function vulnerabilityPieces (value: unknown): Piece[] {
  const valid = Array.isArray(value) && value.length > 0
    && value.every((entry) => isRecord(entry) && typeof entry.title === 'string' && typeof entry.description === 'string');
  // Title and description are separate pieces: the export bolds the title between them.
  return valid
    ? value.flatMap((entry) => [{ category: 'vulnerability', text: entry.title }, { category: 'vulnerability', text: entry.description }])
    : [];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': '\'' };

/** Undo the Markdown wrapping the renderer adds (escapes, entities, quotes, indentation, wrapping). */
export function normalizeForLoss (value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|#39);/gu, (_all, name: string) => ENTITIES[name]!)
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>~&])/gu, '$1')
    .replace(/^(?:[ \t]*>)+[ \t]?/gmu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function statusOf (haystack: string, needle: string): LossStatus {
  if (haystack.includes(needle))
    return 'present';
  const head = needle.slice(0, EDGE_CHARS);
  const tail = needle.slice(-EDGE_CHARS);
  if (needle.length > EDGE_CHARS && (haystack.includes(head) || (needle.length >= LONG_TEXT && haystack.includes(tail))))
    return 'partial';
  return 'absent';
}

function meaningful (line: string): boolean {
  return line.length >= MINIMUM_CHARS && /[\p{L}\p{N}]/u.test(line);
}

/** Per-line coverage: a command echo trimmed or a middle clipped shows as missing lines, not as all-or-nothing. */
function lineStatus (haystack: string, lineSet: ReadonlySet<string>, raw: string): { status: LossStatus; found: number; total: number; text: string } {
  const lines = raw.split(/\r?\n/u).map((line) => normalizeForLoss(redactText(line).text)).filter(meaningful);
  // Most recorded lines appear as whole lines of the Markdown; only the rest need a scan of the whole text.
  const found = lines.filter((line) => lineSet.has(line) || haystack.includes(line)).length;
  const status = found === lines.length ? 'present' : found === 0 ? 'absent' : 'partial';
  return { status, found, total: lines.length, text: lines.join(' ') };
}

function countOccurrences (haystack: string, needle: string): number {
  let count = 0;
  let offset = 0;
  let found = haystack.indexOf(needle, offset);
  while (found >= 0) {
    count += 1;
    offset = found + needle.length;
    found = haystack.indexOf(needle, offset);
  }
  return count;
}

function overlapsMatchedRange (ranges: readonly { start: number; end: number }[], start: number, end: number): boolean {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (ranges[middle]!.end <= start)
      low = middle + 1;
    else
      high = middle;
  }
  return low < ranges.length && ranges[low]!.start < end;
}

export function buildLossAccount (rawRequests: readonly unknown[], markdown: string): LossAccount {
  const priorOutputs = new Map<string, string>();
  return scoreLossPieces(rawRequests.flatMap((request, index) => {
    const updates = new Map<string, string>();
    const recorded = pieces(request, (id, value) => {
      const previous = priorOutputs.get(id);
      updates.set(id, value);
      // Inspect raw IDs and output independently of the renderer. Never join different calls
      // or same-request snapshots just because their text happens to match.
      return previous && value !== previous && value.startsWith(previous) ? value.slice(previous.length) : value;
    });
    for (const [id, value] of updates)
      priorOutputs.set(id, value);
    return recorded.map((piece) => ({ ...piece, request: index + 1 }));
  }), markdown);
}

/** A recorded piece of content to look for, optionally eligible for source-safe sequence checks. */
export interface LossPiece {
  request: number;
  category: string;
  text: string;
  /** Pieces in one independently rendered sequence share a group. */
  orderGroup?: string;
  /** Only source-distinct emitted units contribute to exact-text multiplicity. */
  checkMultiplicity?: boolean;
}

/** Score pieces against the text the export wrote. Shared by the Local and SDK extractors. */
export function scoreLossPieces (all: readonly LossPiece[], markdown: string, lineCategories: ReadonlySet<string> = LINE_CATEGORIES): LossAccount {
  const haystack = normalizeForLoss(markdown);
  const lineSet = new Set(markdown.split(/\r?\n/u).map((line) => normalizeForLoss(line)));
  const totals: Record<string, LossCategoryTotals> = {};
  const unaccounted: LossItem[] = [];
  const orderedByGroup = new Map<string, string[]>();
  const multiplicityTexts: string[] = [];
  let checked = 0;
  for (const piece of all) {
    let status: LossStatus;
    let chars: number;
    let sample: string;
    let lines: LossItem['lines'];
    let orderedText: string;
    if (lineCategories.has(piece.category)) {
      const result = lineStatus(haystack, lineSet, piece.text);
      if (!result.total)
        continue;
      ({ status } = result);
      chars = result.text.length;
      sample = result.text.slice(0, 60);
      lines = { found: result.found, total: result.total };
      orderedText = result.text;
    } else {
      const needle = normalizeForLoss(redactText(piece.text).text);
      if (!meaningful(needle))
        continue;
      status = statusOf(haystack, needle);
      chars = needle.length;
      sample = needle.slice(0, 60);
      orderedText = needle;
    }
    checked += 1;
    const row = totals[piece.category] ??= { present: 0, partial: 0, absent: 0 };
    row[status] += 1;
    if (status === 'present' && haystack.includes(orderedText)) {
      if (piece.orderGroup) {
        const group = orderedByGroup.get(piece.orderGroup) ?? [];
        group.push(orderedText);
        orderedByGroup.set(piece.orderGroup, group);
      }
      piece.checkMultiplicity && multiplicityTexts.push(orderedText);
    }
    status !== 'present' && unaccounted.push({
      request: piece.request, category: piece.category, status, chars, sample, ...(lines ? { lines } : {}),
    });
  }

  const sourceCounts = new Map<string, number>();
  for (const text of multiplicityTexts)
    sourceCounts.set(text, (sourceCounts.get(text) ?? 0) + 1);
  const repeatedCounts = new Map<string, number>();
  let missingRepeats = 0;
  for (const [text, expected] of sourceCounts) {
    if (expected < 2)
      continue;
    const found = countOccurrences(haystack, text);
    repeatedCounts.set(text, found);
    missingRepeats += Math.max(0, expected - found);
  }

  const order: LossOrder = { checked: 0, outOfOrder: 0 };
  for (const orderedTexts of orderedByGroup.values()) {
    let cursor = 0;
    const matchedRanges: { start: number; end: number }[] = [];
    for (const text of orderedTexts) {
      const expected = sourceCounts.get(text);
      const foundCount = repeatedCounts.get(text);
      if (expected !== undefined && expected > 1 && foundCount !== undefined && foundCount < expected)
        continue;
      const position = haystack.indexOf(text, cursor);
      if (position >= 0) {
        order.checked += 1;
        cursor = position + text.length;
        matchedRanges.push({ start: position, end: cursor });
        continue;
      }
      const first = haystack.indexOf(text);
      if (first >= 0 && overlapsMatchedRange(matchedRanges, first, first + text.length))
        continue;
      order.checked += 1;
      order.outOfOrder += 1;
    }
  }

  const multiplicity: LossMultiplicity = {
    checked: repeatedCounts.size,
    missing: missingRepeats,
  };
  const failed = unaccounted.some((item) => item.status === 'absent') || order.outOfOrder > 0 || multiplicity.missing > 0;
  return { checked, totals, unaccounted, order, multiplicity, failed };
}
