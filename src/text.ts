// Turning values into presentable strings, and the colours and indents used to do it.
//
// Nothing here knows about the journal, a session, or the document's structure. That is
// deliberate - several of these are needed on both sides of the pipeline (`extractUri` while
// parsing and while rendering, `COLLATOR` for both a parsed file list and a rendered table), so
// they sit below both rather than inside either.
//
// Colours and indents are named once here. Change the constant, never a literal at a call site.

import path from 'node:path';
import { redactText } from './redaction.ts';

// --- palette ---

export const PROMPT_BADGE = 'background:#1f6feb;color:#fff;padding:2px 8px;border-radius:4px;font-weight:600';
export const MUTED = 'float:right;color:#8b949e;font-weight:400';
export const PROMPT_BOX = 'color:#1fbfeb;background:black;font-family:Tahoma;font-size:1.25rem;line-height:2rem;padding:6px 14px;border-radius:4px;';
// No text color here: a fixed color would fight the reader's preview theme. Prominence
// comes from the accent bar and size, with the contrast against muted meta summaries.
export const ASSISTANT_BOX = 'border-left:3px solid #1f6feb;padding-left:14px;margin:10px 0;font-size:1.06em;line-height:1.6';
export const MUTED_SUMMARY = 'color:#7d8590;font-weight:400';
// The preview sets its own color on `code`, which beats an inherited one, so the badge
// has to be muted on the element itself or it stays brighter than the prose beside it.
export const MUTED_CODE = 'color:#d0b682;background:transparent'; // #d0b682 golden brown code, #7d8590 light blue
// Distinguishes a terminal command from a plain description: monospace plus a cool tint, so
// the eye can tell "this text literally ran" without reading it. Reused for backtick spans in
// non-terminal tool summaries too (e.g. a search tool's regex/glob), since those are also the
// machine-facing part of the summary - see renderToolText.
export const COMMAND_CODE = 'color:#928363;background:transparent;font-size:0.8rem;'; // #79c0ff
// A filename that cannot be turned into a real link (outside the workspace, e.g. an AppData
// path) is still worth calling out visually, just not as a clickable one. Used only by
// renderToolText's file-link branch - keep in sync with that function if this changes.
export const FILE_LINK_COLOR = '#c8937c';
// Two indent levels only: deeper nesting would squeeze wide code and terminal output.
export const BODY_INDENT = '2em';
export const NESTED_INDENT = '1em';

// Single source of truth for the structural strings Layer C (buildRenderReport) keys on, so the
// renderer and the verifier cannot drift when a heading or badge is reworded.
export const MARK = {
  assistantHeading: '#### 💬 Assistant Response',
  requestHeadingPrefix: '<h3>🔷 Request ',
  toolBadgePrefix: '🛠️ ',
  userMessageAnchorId: 'user-message-',
  sectionUserQuestions: 'user-questions-and-requests',
  sectionCostTiming: 'cost-and-timing-summary',
};

export const userMessageAnchor = (n: number) => `<a id="${MARK.userMessageAnchorId}${n}"></a>`;
export const userMessageHref = (n: number) => `#${MARK.userMessageAnchorId}${n}`;
export const sectionAnchor = (id: string) => `<a id="${id}"></a>`;

export function reEscape (value: string) {  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A caught value is `unknown`, and every report site wants the same thing from it.
export function errorLabel (error: unknown) {
  return (error as NodeJS.ErrnoException)?.code || (error as Error)?.message || String(error);
}

// --- determinism ---

// Pinned rather than runtime-default: an export must read identically on every machine, and
// Node on Windows takes its ICU default locale from the OS, not from LANG/LC_ALL.
const NUMBER_FORMAT = new Intl.NumberFormat('en-US');
export const COLLATOR = new Intl.Collator('en-US');

// --- string safety ---

export function redact (value: unknown) {
  return redactText(String(value ?? '')).text;
}

export function esc (value: unknown) {
  return redact(value).replace(/\s+/g, ' ').trim().replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const STRUCTURAL_TAG = /<(\/?)(details|summary|div)\b/gi;

// Embedded chat text and memory files often quote <details>/<summary> markup. Rendered
// live it opens collapsibles that never close and swallows the rest of the document, so
// escape it outside fenced code (inside a fence it is already inert).
export function neutralizeStructuralHtml (value: unknown) {
  let marker = '';
  return String(value).split('\n').map((line) => {
    if (!marker) {
      marker = fenceOpener(line);
      return marker ? line : line.replace(STRUCTURAL_TAG, (all, slash, tag) => `&lt;${slash}${tag}`);
    }
    fenceCloses(line, marker) && (marker = '');
    return line;
  }).join('\n');
}

// CommonMark fences: a run of 3+ backticks or 3+ tildes opens; only a run of the same
// character, at least as long, with nothing after it, closes. A backtick opener's info
// string cannot contain a backtick (that line is inline code, not a fence). Indentation
// is accepted leniently, matching the exporter's historical behavior.
const FENCE_OPENER = /^\s*(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSER = /^\s*(`{3,}|~{3,})\s*$/;

/** The fence marker (for example '```' or '~~~~') when `line` opens a code fence, else ''. */
export function fenceOpener (line: string) {
  const match = FENCE_OPENER.exec(line);
  if (!match || (match[1][0] === '`' && match[2].includes('`')))
    return '';
  return match[1];
}

/** True when `line` closes a fence opened with `marker`. */
export function fenceCloses (line: string, marker: string) {
  const match = FENCE_CLOSER.exec(line);
  return Boolean(match && match[1][0] === marker[0] && match[1].length >= marker.length);
}

// A model's raw reasoning (and, rarely, a truncated response) can contain an ODD number of
// ``` or ~~~ fence lines. Embedded live inside a <div>, that dangling open fence swallows the closing
// </div>/</details> and every section after it, so the page stops rendering. Append a matching
// close so the fence cannot escape its block. Detection mirrors stripFencedRegions in
// verify/layers.ts, so the render self-check and the renderer agree on where fences end.
export function closeUnbalancedFences (value: unknown) {
  const text = String(value);
  const ticks = openFenceTicks(text);
  return ticks ? `${text}\n${ticks}` : text;
}

/** The marker (backticks or tildes) of a code fence still open at the end of `text`, or '' when every fence is closed. */
export function openFenceTicks (text: string) {
  let marker = '';
  for (const line of text.split('\n')) {
    if (!marker)
      marker = fenceOpener(line);
    else if (fenceCloses(line, marker))
      marker = '';
  }
  return marker;
}

// --- parsing and cleaning ---

// Returns `any`: the input is arbitrary JSON from an undocumented store, and pretending
// otherwise would only push the cast to every call site.
export function parseJson (value: unknown, fallback: any = null): any {
  if (value == null || typeof value === 'object')
    return value ?? fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

// Terminal capture keeps raw VT sequences (colors, cursor moves, OSC title writes).
export function stripAnsi (value: unknown) {
  return String(value ?? '')
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b[[\]][0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b[@-_]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

export function extractUri (text: unknown) {
  const match = /file:\/\/\/[^\s)]+/.exec(String(text ?? ''));
  if (!match)
    return '';
  try {
    return decodeURIComponent(match[0].replace(/^file:\/\/\//, ''));
  } catch {
    return match[0];
  }
}

// --- length ---

export function clip (value: unknown, limit = 110) {
  const text = redact(String(value ?? '')).replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

// --- numbers, dates, durations ---

export function thousands (value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? NUMBER_FORMAT.format(value) : '0';
}

export function fmtCredits (value: unknown) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '0.00';
}

/** AI credits from recorded nano-AIU (1 credit = 1,000,000,000 nano-AIU): two decimals from 1 up, four below, so a cheap call is not shown as 0.00. */
export function fmtAiCredits (nanoAiu: number) {
  const credits = nanoAiu / 1_000_000_000;
  return credits >= 1
    ? credits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : credits.toFixed(4);
}

export function isoTimestamp (value: string | number | null | undefined) {
  if (!value)
    return 'unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

export function headerTimestamp (value: string | number | null | undefined) {
  const date = new Date(value ?? NaN);
  if (Number.isNaN(date.getTime()))
    return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCFullYear() % 100)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function humanDuration (ms: number | null | undefined) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0)
    return 'not recorded';
  const seconds = ms / 1000;
  if (seconds < 60)
    return `${seconds.toFixed(1)}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

// --- markdown shaping ---

export function blockquote (value: unknown) {
  const content = neutralizeStructuralHtml(redact(value).trim()) || '_Empty message_';
  return content.split(/\r?\n/).map((line) => `> ${line}`).join('\n');
}

export function stripMarkdown (value: unknown) {
  return redact(value)
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, (match, text: string, url: string) => text || (extractUri(url) ? path.basename(extractUri(url).replace(/#.*$/, '')) : ''))
    .replace(/`+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Picks a fence longer than any backtick run inside the content, so embedded fences survive.
export function fenceFor (content: unknown, lang = '') {
  const runs: string[] = String(content).match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const ticks = '`'.repeat(Math.max(3, longest + 1));
  return { open: `${ticks}${lang}`, close: ticks };
}

export function backToContents () {
  return '<div align="right"><a href="#contents">⬆️ Back to Contents</a></div>';
}

// Indents a collapsible body so it reads as a child of its summary. The blank lines are
// required: without them CommonMark treats the run as a raw HTML block and stops parsing
// the Markdown inside, so fences and inline code would render literally.
export function indentBlock (body: string[], margin = BODY_INDENT) {
  if (!body.length)
    return body;
  return [`<div style="margin-left:${margin}">`, '', ...body, '', '</div>'];
}

// Tool calls, terminal output, and turn stats are chrome around the answer. GitHub strips
// the inline color but keeps <sub>, so the size drop survives in both renderers.
export function mutedSummary (html: string) {
  return `<sub><span style="${MUTED_SUMMARY}">${html}</span></sub>`;
}

// Assistant prose is the payload of a turn, so it gets the accent bar and the larger type.
export function assistantBlock (markdown: string) {
  return [`<div style="${ASSISTANT_BOX}">`, '', closeUnbalancedFences(neutralizeStructuralHtml(markdown)), '', '</div>', ''];
}
