// Turning parsed turns into Markdown.
//
// Reads the parsed model and nothing from VS Code's journal shapes, so a format change upstream
// does not reach here. The visual rules - what is a bordered box, what is a collapsible, what is
// muted - are in docs/SPEC.md; this file implements them.
//
// Ordered smallest to largest: one tool call, then one turn, then `buildDocument` at the bottom
// assembling the whole page. Kept in one file because someone changing how a turn looks almost
// always needs the section that contains it in view.
//
// The rule that matters most: a turn's body is walked in RECORDED ORDER, so prose, reasoning,
// tool calls and edit markers interleave exactly as they streamed. Never bucket by type - the
// export would stop matching what the chat window showed.

import { createHash } from 'node:crypto';
import path from 'node:path';
import { planToolText } from './export-policy.ts';
import type { CompanionArtifact, CompanionKind } from './export-policy.ts';
import { collectRecordedImages, saveImageCompanion } from './images.ts';
import type { RecordedImage } from './images.ts';
import { sourceCopyNotice } from './session/source-snapshot.ts';
import type { SourceCopy } from './session/source-snapshot.ts';
import type { AutoModelResolution, FileTouch, NoteNode, ParsedSession, SessionLocation, SessionUsage, TodoItem, ToolNode, TextNode, Turn, TurnNode, TurnScalars, UnknownResponseNode, UsageFigures } from './types.ts';
import type { MemoryFile, Resource } from './session/enrich.ts';
import { getWorkspaceRoot, workspacePath } from './host.ts';
import { VALIDATED_AGAINST } from './session/classify.ts';
import { modelName } from './session/enrich.ts';
import {
  COLLATOR, COMMAND_CODE, FILE_LINK_COLOR, MARK, MUTED, MUTED_CODE, NESTED_INDENT, PROMPT_BADGE,
  PROMPT_BOX, assistantBlock, backToContents, blockquote, clip, closeUnbalancedFences, hasUnclosedInlineCode, openFenceCloser, openFenceTicks, scanFences,
  esc, extractUri, fenceFor, fmtAiCredits, fmtCredits, headerTimestamp, humanDuration, indentBlock, isoTimestamp,
  escapeUnclosedHtml, mutedSummary, neutralizeStructuralHtml, redact, sectionAnchor, stripMarkdown, thousands,
  userMessageAnchor, userMessageHref,
} from './text.ts';

const MAX_EMBEDDED_RESOURCE_BYTES = 96 * 1024;
const MAX_COPY_SOURCE_BYTES = 32 * 1024;
let imageReplacements: Array<{ encoded: string; label: string }> = [];

function imageResourceText (content: unknown): string {
  let value = String(content ?? '');
  for (const image of imageReplacements)
    value = value.replaceAll(image.encoded, image.label);
  return value;
}

function renderImages (images: RecordedImage[] = []): string[] {
  const seen = new Set<string>();
  return images.flatMap((image) => {
    const identity = image.bytes ? createHash('sha256').update(image.bytes).digest('hex') : image.recordedLocation ?? image.alt;
    if (seen.has(identity))
      return [];
    seen.add(identity);
    if (!overflow)
      return ['> Image unresolved: companion destination was not supplied.', ''];
    const saved = saveImageCompanion(image, overflow);
    if (!saved.href)
      return ['> Image unresolved: the record has neither decodable bytes nor a location.', ''];
    const href = saved.href.replaceAll('%', '%25').replaceAll(' ', '%20').replaceAll('(', '%28').replaceAll(')', '%29').replaceAll('<', '%3C').replaceAll('>', '%3E');
    const alt = esc(image.alt).replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]');
    return [
      image.bytes ? `![${alt}](${href})` : `[${alt}](${href})`,
      saved.sha256 ? `${saved.size.toLocaleString('en-US')} bytes; SHA-256 \`${saved.sha256.slice(0, 12)}\`.` : 'Image reference only; bytes were not recorded.',
      ...(saved.representationChange ? [`> Representation change: ${saved.representationChange}`] : []), '',
    ];
  });
}
// A summary wraps to the next line rather than truncating, so the cap only exists to stop a
// pathological one-liner (a multi-KB generated command) from burying the rows around it.
const MAX_SUMMARY_CHARS = 1000;

// --- embedded artifacts ---

// Clipboard access needs JavaScript, which every Markdown renderer strips. A fenced
// block is the copyable unit instead: GitHub and the VS Code preview both put a hover
// copy button on code fences, so pair rendered content with its raw source.
export function copySource (content: unknown, lang = 'markdown', label = 'Copy source') {
  const text = redact(content).trim();
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_COPY_SOURCE_BYTES)
    return [];
  const fence = fenceFor(text, lang);
  return [`<details><summary>${mutedSummary(`📋 ${esc(label)}`)}</summary>`, '', fence.open, text, fence.close, '', '</details>', ''];
}

// Wraps rendered Markdown in a bordered box (border shows in VS Code preview;
// GitHub strips the inline style but still renders the Markdown).
function borderedMarkdown (content: unknown, { copyable = true, lang = 'markdown' } = {}) {
  const text = redact(content).trim();
  return [
    '<div style="border:1px solid #d0d7de;border-radius:6px;padding:2px 16px;margin:8px 0">',
    '',
    neutralizeStructuralHtml(text),
    '',
    '</div>',
    '',
    ...(copyable ? copySource(text, lang) : []),
  ];
}

// Live-rendering embedded Markdown is only safe for plain prose. Anything in this list
// changes how the surrounding document renders, so such content is shown as source.
function markdownRisks (content: string) {
  let html = false;
  let comment = false;
  let heading = false;
  let link = false;
  const lines = String(content).split('\n');
  const { inside, open } = scanFences(lines);
  lines.forEach((line, index) => {
    if (inside[index])
      return;
    // Any tag-like token renders live: <Select> becomes a real dropdown, <img> loads, etc.
    /<\/?[A-Za-z][\w:.-]*(\s[^<>]*)?\/?>/.test(line) && (html = true);
    // A raw-text opener needs no '>' to start an HTML block that runs to the end of the page.
    /<(script|style|textarea|pre)(?=[\s/>]|$)/i.test(line) && (html = true);
    line.includes('<!--') && (comment = true);
    /^\s{0,3}#{1,6}\s/.test(line) && (heading = true);
    /^\s*<a\s|<a\s+id=/i.test(line) && (link = true);
  });
  const risks = [];
  html && risks.push('raw HTML/XML');
  comment && risks.push('HTML comments');
  heading && risks.push('headings would pollute the outline');
  link && risks.push('anchors');
  open && risks.push('unclosed code fence');
  return risks;
}

// Renders an embedded Markdown artifact: pretty bordered box when it is safe, plain
// fenced source when live rendering would corrupt the page.
export function markdownBody (content: unknown, sourcePath = '') {
  const text = redact(content).trim();
  if (!text)
    return ['_Empty file._', ''];
  const risks = markdownRisks(text);
  const lineCount = text.split('\n').length;
  const stats = `${thousands(lineCount)} lines · ${thousands(Buffer.byteLength(text, 'utf8'))} bytes`;
  const lines: string[] = [];
  sourcePath && lines.push(`- Source: \`${sourcePath}\``, '');
  if (!risks.length) {
    lines.push(`<sub>${stats} · ✅ rendered</sub>`, '', ...borderedMarkdown(text));
    return lines;
  }
  const fence = fenceFor(text, 'markdown');
  lines.push(
    `<sub>${stats} · ⚠️ shown as source (${esc(risks.join('; '))})</sub>`,
    '',
    fence.open,
    text,
    fence.close,
    '',
  );
  return lines;
}

function resourceBody (resource: Resource) {
  if (resource.content == null)
    return [`> Non-text resource (${thousands(resource.bytes)} bytes): \`${workspacePath(resource.filePath)}\``];
  const content = redact(imageResourceText(resource.content));
  const withinLimit = Buffer.byteLength(content, 'utf8') <= MAX_EMBEDDED_RESOURCE_BYTES;
  if (withinLimit && /\.md$/i.test(resource.filePath ?? ''))
    return markdownBody(content);
  const fence = fenceFor(content, 'text');
  if (withinLimit)
    return [fence.open, content, fence.close];
  const head = content.slice(0, 48 * 1024);
  const tail = content.slice(-48 * 1024);
  const clipFence = fenceFor(head + tail, 'text');
  return [
    `> ${thousands(resource.bytes)} bytes; showing first and last 48 KiB. Full resource: \`${workspacePath(resource.filePath)}\`.`,
    '',
    clipFence.open,
    head,
    '\n... [middle omitted] ...\n',
    tail,
    clipFence.close,
  ];
}

// --- long tool text ---

/** Where text over the line threshold is saved in full. The caller writes the companions next to the Markdown. */
export interface TextOverflow {
  assetsDirectory: string;
  companions: CompanionArtifact[];
}

// buildDocument is synchronous, so one active sink per call is safe and avoids threading a
// parameter through every renderer below it.
let overflow: TextOverflow | null = null;

/**
 * Structure the renderer had to repair in model text. `early` entries split a fence mid-run and
 * fail strict mode; `html` entries name an unclosed `<!--` ('comment') or raw-text tag the
 * exporter escaped so it cannot hide the rest of the export.
 */
export interface FenceRepairs {
  early: Array<{ turn: number; kind: string }>;
  turnEnd: number;
  html: Array<{ turn: number; kind: string }>;
}

let fenceRepairs: FenceRepairs | null = null;

const HTML_ESCAPE_NOTE = '> _Representation change: the exporter escaped an unclosed HTML comment or block tag (script, style, textarea, pre) in chat text so it cannot hide the rest of the export._';

// Model and prompt text render live, and a renderer passes an HTML block's raw source to the
// page: an unclosed <!-- or <script> there swallows the rest of the export in the browser, even
// when the Markdown container around it ends.
function escapeModelHtml (markdown: string, turnNumber: number, notes: string[]) {
  const { text, escaped } = escapeUnclosedHtml(markdown);
  if (escaped.length) {
    fenceRepairs?.html.push(...escaped.map((kind) => ({ turn: turnNumber, kind })));
    notes.includes(HTML_ESCAPE_NOTE) || notes.push(HTML_ESCAPE_NOTE, '');
  }
  return text;
}

// The fence VS Code writes before an inline edit preview; it is dropped when the run is flushed.
const LEAD_EDIT_FENCE = /^\s*`{3,}[^\n]*\n?/;

function saveOverflow (text: string, kind: CompanionKind, label: string, extension: string, toolCallId?: string) {
  const sink = overflow!;
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 8);
  const name = `${label}-${hash}.${extension}`;
  const relativePath = `${sink.assetsDirectory}/${name}`;
  sink.companions.some((item) => item.relativePath === relativePath) || sink.companions.push({
    id: name, kind, relativePath, mediaType: 'text/plain; charset=utf-8', bytes: new TextEncoder().encode(text),
    location: { sourceId: 'export', field: label, ...(toolCallId ? { toolCallId } : {}) },
  });
  return { name, href: relativePath.replaceAll(' ', '%20') };
}

// An unreviewed payload's preview is the first 10 lines, cut to this many bytes so one huge line cannot fill the Markdown.
const PREVIEW_MAX_BYTES = 2048;

/** The longest prefix within `maxBytes` UTF-8 bytes that ends on a code point boundary. */
function utf8Prefix (text: string, maxBytes: number) {
  let bytes = 0;
  let end = 0;
  for (const char of text) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > maxBytes)
      break;
    bytes += size;
    end += char.length;
  }
  return text.slice(0, end);
}

/** Applies the line policy to one text: the text to show, plus the note that links the full companion when there is one. */
function limitText (text: string, options: { kind: CompanionKind; label: string; extension?: string; toolCallId?: string; rule?: 'both' | 'either' }) {
  const plan = planToolText(text, options.rule);
  if (plan.companionText === null || overflow === null)
    return { shown: text, linked: false, note: '', summary: '' };
  const saved = saveOverflow(plan.companionText, options.kind, options.label, options.extension ?? 'txt', options.toolCallId);
  const totalBytes = thousands(Buffer.byteLength(text, 'utf8'));
  const lines = `${thousands(plan.lineCount)} line${plan.lineCount === 1 ? '' : 's'}`;
  const link = `Full text: [${saved.name}](${saved.href}).`;
  if (options.rule !== 'either' || Buffer.byteLength(plan.preview, 'utf8') <= PREVIEW_MAX_BYTES)
    return { shown: plan.preview, linked: true, summary: 'first 10 lines', note: `Showing the first 10 of ${lines} (${totalBytes} bytes). ${link}` };
  const shown = utf8Prefix(plan.preview, PREVIEW_MAX_BYTES);
  return {
    shown,
    linked: true,
    summary: 'preview',
    note: `Showing the first ${thousands(Buffer.byteLength(shown, 'utf8'))} of ${totalBytes} bytes (${lines}). ${link}`,
  };
}

/**
 * A collapsed block for tool text under the approved policy: text up to 300 lines or 15 KiB stays in the
 * Markdown, longer text shows the first 10 lines and links a companion with the full text. Unreviewed payloads
 * (`rule: 'either'`) move at 300 lines OR 15 KiB, and their preview is capped at 2 KiB.
 * With no companion folder (library callers) the full text stays inline; it is never clipped.
 */
function toolTextBlock (summary: string, text: string, language: string, options: { kind: CompanionKind; label: string; extension?: string; toolCallId?: string; tail?: string; rule?: 'both' | 'either' }) {
  const limited = limitText(text, options);
  const fence = fenceFor(limited.shown, language);
  return [
    `<details><summary>${mutedSummary(`${summary}${limited.linked ? ` - ${limited.summary}, full text linked` : ''}${options.tail ?? ''}`)}</summary>`,
    '',
    ...indentBlock([fence.open, limited.shown, fence.close, ...(limited.note ? ['', limited.note] : [])], NESTED_INDENT),
    '',
    '</details>',
    '',
  ];
}

// --- tool calls ---

export function toolFriendly (toolId: string | undefined) {
  return String(toolId ?? 'tool').replace(/^copilot_/, '').replace(/^mcp_/, '');
}

// A `[label](file:///...)` link becomes a real relative link when the target is inside the
// workspace (clickable in both the VS Code preview and GitHub), or a colored-but-inert span
// when it is not (e.g. an AppData internal path). A `` `backtick span` `` is usually the
// regex/glob a search tool ran, so it gets the same styling as a terminal command.
//
// The link target intentionally drops any `#1-1`-style fragment from the source URI (see the
// `.replace(/[?#].*$/, '')` below) rather than turning it into a `#L<start>-L<end>` anchor: that
// fragment is VS Code's own internal anchor, not a reliable line range - it has been observed to
// read `#1-1` on a link whose accompanying text says "lines 1 to 420". Building a link from it
// would show a confidently wrong range, which is worse than no range at all.
//
// Note: a session used to build/debug THIS exporter can end up searching a prior export of
// itself (e.g. grepping for `<code>` tags to verify earlier fixes). When that happens, the raw
// regex/summary text legitimately contains literal HTML-looking substrings as search-target
// data, not markup - `esc()` still escapes it correctly, it just reads oddly. That is a faithful
// render of what happened, not a tokenizer bug; do not "fix" it by hiding the literal text.
function renderToolText (raw: unknown) {
  const placeholders: string[] = [];
  const withPlaceholders = String(raw).replace(
    /\[([^\]]*)\]\(file:\/\/\/([^)]*)\)|`([^`]+)`/g,
    (match, linkLabel, encodedPath, code) => {
      let replacement;
      if (code !== undefined) {
        replacement = `<code style="${COMMAND_CODE}">${esc(code)}</code>`;
      } else {
        const absPath = extractUri(`file:///${encodedPath}`).replace(/[?#].*$/, '');
        const display = linkLabel || (absPath ? path.basename(absPath) : '');
        if (!absPath || !display)
          replacement = esc(display);
        else {
          const relative = workspacePath(absPath);
          replacement = path.isAbsolute(relative)
            ? `<span style="color:${FILE_LINK_COLOR}">${esc(display)}</span>`
            : `[${esc(display)}](${relative.replace(/ /g, '%20')})`;
        }
      }
      placeholders.push(replacement);
      return `\uE000${placeholders.length - 1}\uE000`;
    },
  );
  return esc(withPlaceholders).replace(/\uE000(\d+)\uE000/g, (match, index) => placeholders[Number(index)]);
}

// MAX_SUMMARY_CHARS is a pathological-length safety net only, so it is measured against the
// plain text - clipping the markup-laden version risks cutting mid-tag.
function toolSummaryHtml (node: ToolNode) {
  const raw = node.pastTense || node.invocation || node.title || '';
  if (!raw)
    return esc(toolFriendly(node.toolId));
  const plain = stripMarkdown(raw);
  return plain.length > MAX_SUMMARY_CHARS ? esc(clip(plain, MAX_SUMMARY_CHARS)) : renderToolText(raw);
}

// A terminal command's full text is always shown in the Command fence below, so the header
// only needs the first line - repeating the whole (possibly multi-line) command there too
// just pushes the rest of the turn further down the page.
function commandOneLiner (command: string, limit = 100) {
  const firstLine = command.split(/\r?\n/)[0].trim();
  const clipped = clip(firstLine, limit);
  const hasMore = command.includes('\n') || firstLine.length > limit;
  return hasMore && !clipped.endsWith('…') ? `${clipped}…` : clipped;
}

// Capture often starts mid-way through the shell's echo of the command being run,
// leaving a fragment like "ind -- DataSourceManager" above the real output.
function isCommandEcho (input: string, command: string) {
  const normalize = (value: string) => value.replace(/\r\n?/gu, '\n').trim();
  return normalize(input) === normalize(command);
}

function trimCommandEcho (output: string, command: string) {
  const lines = output.split('\n');
  const first = (lines[0] ?? '').trim();
  if (first && command && first.length < command.length && command.includes(first))
    lines.shift();
  return lines.join('\n').replace(/^\n+/, '');
}

// Input and text output have dedicated readable blocks. Keep every other persisted field as a
// generic fallback so new result shapes degrade to JSON instead of disappearing.
function unrenderedResultDetails (node: ToolNode): unknown | null {
  const details = node.resultDetails;
  if (details == null)
    return null;
  if (Array.isArray(details))
    return details.length ? details : null;
  if (typeof details !== 'object')
    return details;

  const remainder = { ...(details as Record<string, unknown>) };
  if (node.inputText) {
    delete remainder.input;
    delete remainder.inputLanguage;
  }
  if (Array.isArray(remainder.output)) {
    const unrenderedOutput = remainder.output.filter((part) => {
      if (!part || typeof part !== 'object')
        return true;
      const outputPart = part as Record<string, unknown>;
      return !(overflow && node.images?.length && collectRecordedImages(outputPart).length)
        && (outputPart.isText !== true || typeof outputPart.value !== 'string');
    });
    if (unrenderedOutput.length)
      remainder.output = unrenderedOutput;
    else
      delete remainder.output;
  }
  if (remainder.isError === false)
    delete remainder.isError;
  return Object.keys(remainder).length ? remainder : null;
}

// A delegated agent: labelled as such, with its task and the summary it returned in view and its
// whole conversation (which may itself delegate) one click further.
function renderSubagent (node: ToolNode, byCall: Map<string, Resource[]>) {
  const sub = node.subagent!;
  const title = sub.description || sub.displayName || sub.name || 'sub-agent';
  const toolCalls = sub.turns.reduce((sum, turn) => sum + turn.toolNodes.length, 0);
  const facts = [
    sub.agentType ? `type ${sub.agentType}` : '',
    sub.model ? modelName(sub.model) : '',
    `${thousands(sub.totalToolCalls ?? toolCalls)} tool call${(sub.totalToolCalls ?? toolCalls) === 1 ? '' : 's'}`,
    sub.durationMs != null ? humanDuration(sub.durationMs) : '',
    sub.totalTokens != null ? `${thousands(sub.totalTokens)} tokens` : '',
    sub.usage ? `${fmtAiCredits(sub.usage.nanoAiu)} credits in ${thousands(sub.usage.calls)} call${sub.usage.calls === 1 ? '' : 's'}` : '',
    sub.cancelled ? 'cancelled' : '',
    node.isComplete ? '' : 'not completed',
  ].filter(Boolean).join(' · ');
  const head = `${MARK.toolBadgePrefix}<code style="${MUTED_CODE}">🤖 SUB-AGENT</code>: ${esc(clip(title, 120))} (${esc(facts)})`;
  const body: string[] = [];
  const block = (label: string, value: string) => {
    const fence = fenceFor(value, 'text');
    body.push(`**${label}:**`, '', fence.open, redact(value), fence.close, '');
  };
  node.intent && body.push(`**Intent:** ${esc(node.intent)}`, '');
  const task = sub.turns[0]?.prompt || node.promptText;
  task && block('Delegated task', task);
  const returned = node.resultText || node.output;
  returned && block('Summary returned to the main chat', returned);
  node.detailText && block('Detailed result', node.detailText);
  const conversation = sub.turns.flatMap((turn, index) => [
    ...(index > 0 ? ['**Follow-up prompt:**', '', ...(() => { const fence = fenceFor(turn.prompt, 'text'); return [fence.open, redact(turn.prompt), fence.close]; })(), ''] : []),
    ...renderTurnBody(turn, byCall, '', { heading: false }),
    '',
  ]);
  body.push(
    `<details><summary>${mutedSummary(`📜 Full sub-agent conversation (${sub.turns.length} message${sub.turns.length === 1 ? '' : 's'}, ${thousands(toolCalls)} tool call${toolCalls === 1 ? '' : 's'})`)}</summary>`,
    '', ...indentBlock(conversation, NESTED_INDENT), '', '</details>', '',
  );
  return [
    `<details><summary>${mutedSummary(head)}</summary>`,
    '<div aria-hidden="true" style="height:0.35rem"></div>',
    '',
    ...indentBlock(body),
    '',
    '</details>',
  ];
}

function renderToolNode (node: ToolNode, byCall: Map<string, Resource[]>, continuation = false) {
  if (node.subagent)
    return renderSubagent(node, byCall);
  const resources = node.toolCallId && !continuation ? (byCall.get(node.toolCallId) ?? []) : [];
  const rawInput = node.toolSpecificData?.kind === 'input' ? node.toolSpecificData.rawInput : null;
  const inputText = node.command && isCommandEcho(node.inputText, node.command) ? '' : node.inputText;
  // A completed call needs no marker; only the exceptions earn one.
  const icon = node.isComplete ? '' : '⏳ ';
  const summaryHtml = node.command
    ? `<code style="${COMMAND_CODE}">${esc(commandOneLiner(node.command))}</code>`
    : toolSummaryHtml(node);
  const head = `${MARK.toolBadgePrefix}${icon}<code style="${MUTED_CODE}">${esc(toolFriendly(node.toolId))}</code>: ${summaryHtml}`;
  const hasDetails = node.toolSpecificData && node.toolSpecificData.kind !== 'terminal' && node.toolSpecificData.kind !== 'todoList';
  const resultDetails = unrenderedResultDetails(node);
  const hasBody = continuation || node.images?.length || node.intent || node.command || node.promptText || inputText || rawInput || resources.length || hasDetails || node.output || node.resultText || node.resultError || node.detailText || resultDetails != null;
  // Nothing to expand: render a plain line rather than an empty collapsible.
  if (!hasBody)
    return [`- ${mutedSummary(node.noRecordedContent
      ? `${MARK.toolBadgePrefix}${icon}<code style="${MUTED_CODE}">${esc(toolFriendly(node.toolId))}</code>: No message, input or output was recorded.`
      : head)}`];
  const body = [];
  if (continuation && !node.output)
    body.push(`**Terminal status:** ${node.isComplete ? 'completed' : 'in progress'}${node.exitCode != null ? `; exit ${node.exitCode}` : ''}${node.duration != null ? `; ${humanDuration(node.duration)}` : ''}.`, '');
  node.intent && body.push(`**Intent:** ${esc(node.intent)}`, '');
  if (node.command) {
    const fence = fenceFor(node.command, 'powershell');
    body.push('**Command:**', '', fence.open, redact(node.command), fence.close, '');
  }
  if (node.promptText) {
    // A delegated task prompt is the agent's instructions, not tool output, so it is kept whole.
    const prompt = redact(node.promptText);
    const fence = fenceFor(prompt, 'text');
    body.push(
      `<details><summary>${mutedSummary('📝 Subagent prompt')}</summary>`,
      '',
      ...indentBlock([fence.open, prompt, fence.close], NESTED_INDENT),
      '',
      '</details>',
      '',
    );
  }
  if (inputText)
    body.push(...toolTextBlock('⌨️ Tool input', redact(inputText), node.inputLanguage || 'text', { kind: 'tool-input', label: 'tool-input', toolCallId: node.toolCallId }));
  else if (rawInput != null) {
    const json = redact(JSON.stringify(rawInput, null, 2));
    const fence = fenceFor(json, 'json');
    body.push(
      `<details><summary>${mutedSummary('⌨️ Tool input')}</summary>`,
      '',
      ...indentBlock([fence.open, json, fence.close], NESTED_INDENT),
      '',
      '</details>',
      '',
    );
  }
  if (node.output) {
    const outputText = trimCommandEcho(node.output, node.command);
    const status = [
      node.exitCode != null ? `exit ${node.exitCode}` : null,
      node.duration != null ? humanDuration(node.duration) : null,
      `${thousands(outputText.split('\n').length)} lines`,
    ].filter(Boolean).join(' · ');
    const badge = node.exitCode ? ' ⚠️' : '';
    body.push(...toolTextBlock(`📟 Terminal output (${status})`, redact(outputText), 'text', { kind: 'tool-result', label: 'terminal-output', toolCallId: node.toolCallId, tail: badge }));
  }
  if (node.resultText)
    body.push(...toolTextBlock(`📦 Tool result (${thousands(node.resultText.split('\n').length)} lines)`, redact(node.resultText), 'text', { kind: 'tool-result', label: 'tool-result', toolCallId: node.toolCallId }));
  body.push(...renderImages(node.images));
  if (node.resultError)
    body.push(...toolTextBlock('⚠️ Tool error', redact(node.resultError), 'text', { kind: 'tool-result', label: 'tool-error', toolCallId: node.toolCallId }));
  if (node.detailText) {
    const detail = redact(node.detailText);
    body.push(...toolTextBlock(`🧾 Detailed result (${thousands(node.detailText.split('\n').length)} lines)`, detail, /^(?:diff --git|@@|---|\*\*\* Begin Patch)/mu.test(detail) ? 'diff' : 'text', { kind: 'tool-result', label: 'detailed-result', extension: 'txt', toolCallId: node.toolCallId }));
  }
  if (resultDetails != null)
    body.push(...toolTextBlock('📦 Tool result details', redact(JSON.stringify(resultDetails, null, 2)), 'json', { kind: 'tool-result', label: 'tool-result-details', extension: 'json', toolCallId: node.toolCallId }));
  if (resources.length)
    body.push(`**Persisted output:** ${resources.map((resource) => `${resource.relative} (${thousands(resource.bytes)} bytes)`).join('; ')}.`, '');
  else if (!continuation && !node.output && !node.resultText && !node.detailText)
    body.push('**Output:** not persisted as a separate resource (returned inline).', '');
  for (const resource of resources)
    body.push(`<details><summary>${mutedSummary(`📦 Output body - ${esc(resource.relative)}`)}</summary>`, '', ...indentBlock([`- Resource path: \`${workspacePath(resource.filePath)}\``, '', ...resourceBody(resource)], NESTED_INDENT), '', '</details>', '');
  if (hasDetails && node.toolSpecificData) {
    const payload = node.toolSpecificData;
    // The subagent's prompt/result already render above (as text, not escaped JSON), so
    // drop them here rather than showing the same content twice - once readable, once not.
    const omittedKeys = payload.kind === 'subagent'
      ? new Set(['prompt', 'result'])
      : payload.kind === 'input' ? new Set(['kind', 'rawInput']) : new Set<string>();
    const detailsSource = Object.fromEntries(Object.entries(payload).filter(([key]) => !omittedKeys.has(key)));
    const json = redact(JSON.stringify(detailsSource, null, 2));
    const fence = fenceFor(json, 'json');
    Object.keys(detailsSource).length && body.push(`<details><summary>${mutedSummary('⚙️ Tool details')}</summary>`, '', ...indentBlock([fence.open, json, fence.close], NESTED_INDENT), '', '</details>', '');
  }
  return [
    `<details><summary>${mutedSummary(head)}</summary>`,
    '<div aria-hidden="true" style="height:0.35rem"></div>',
    '',
    ...indentBlock(body),
    '',
    '</details>',
  ];
}

// A recorded event that is not prose, reasoning or a tool call. One line when it has no body.
function renderNote (node: NoteNode) {
  const link = node.link ? ` - [${esc(node.link.label)}](${node.link.href.replaceAll(' ', '%20')})` : '';
  const image = [...(node.image ? [`![${esc(node.image.alt)}](${node.image.href.replaceAll(' ', '%20')})`, ''] : []), ...renderImages(node.images)];
  if (!node.text)
    return [`> ${esc(node.title)}${link}`, '', ...image];
  const text = closeUnbalancedFences(neutralizeStructuralHtml(redact(node.text)));
  const fence = fenceFor(text, 'text');
  return [
    `<details><summary>${mutedSummary(`${esc(node.title)}${link}`)}</summary>`,
    '',
    ...indentBlock([fence.open, text, fence.close], NESTED_INDENT),
    '',
    '</details>',
    '',
    ...image,
  ];
}

// Warnings a markdownVuln record attached to its text. Written after the text run, never inside it.
function renderVulnerabilities (node: TextNode) {
  const warnings = (node.vulnerabilities ?? []).map((entry) =>
    `> ⚠️ Code-safety warning recorded by the chat source, not validated by the exporter: **${esc(entry.title)}** - ${esc(entry.description)}`);
  const omitted = node.omittedDisplayMetadata?.length
    ? ['>', `> <sub>Omitted display metadata: ${node.omittedDisplayMetadata.map(esc).join(', ')}</sub>`]
    : [];
  return [...warnings.flatMap((line, index) => index ? ['>', line] : [line]), ...omitted, ''];
}

function renderUnknownResponse (node: UnknownResponseNode) {
  return toolTextBlock(
    `⚠️ Unreviewed response kind: ${esc(node.kind)}`,
    redact(node.payload),
    'json',
    { kind: 'metadata', label: 'unreviewed-response', extension: 'json', rule: 'either' },
  );
}

function renderTodos (todos: TodoItem[]) {
  if (!todos.length)
    return [];
  const mark = (status: string | undefined) => status === 'completed' ? '[x]' : (status === 'in-progress' ? '[~]' : '[ ]');
  const note = (status: string | undefined) => status === 'in-progress' ? ' 🔄' : '';
  return [
    `<details><summary>${mutedSummary(`🗒️ Todo list at this turn (${todos.length})`)}</summary>`,
    '',
    ...indentBlock(todos.map((todo) => `- ${mark(todo.status)} ${esc(todo.title || todo.id)}${note(todo.status)}`)),
    '',
    '</details>',
  ];
}

function fileLink (file: string, outputPath: string) {
  const target = path.resolve(getWorkspaceRoot(), file);
  const rawHref = outputPath
    ? path.relative(path.dirname(path.resolve(outputPath)), target)
    : workspacePath(target);
  if (!rawHref || path.isAbsolute(rawHref))
    return `\`${redact(file)}\``;
  const relative = rawHref.replaceAll('\\', '/');
  const href = encodeURI(relative.startsWith('.') ? relative : `./${relative}`).replaceAll('(', '%28').replaceAll(')', '%29');
  return `[\`${redact(file).replaceAll('[', '\\[').replaceAll(']', '\\]')}\`](${href})`;
}

function tildeFenceFor (content: string, lang = '') {
  const runs = content.match(/~+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const tildes = '~'.repeat(Math.max(3, longest + 1));
  return { open: `${tildes}${lang}`, close: tildes };
}

function changeCounts (entry: FileTouch) {
  if (entry.additions == null || entry.deletions == null)
    return '<span style="color:#7d8590">change details unavailable</span>';
  return `<span style="color:#1a7f37;font-weight:600">+${thousands(entry.additions)}</span> <span style="color:#cf222e;font-weight:600">-${thousands(entry.deletions)}</span>`;
}

function renderFileDiffs (entry: FileTouch) {
  if (!entry.diffs?.length)
    return [];
  const lines = [
    `<details><summary>${mutedSummary(`📑 View changes to <code>${esc(entry.file)}</code> (${changeCounts(entry)})`)}</summary>`,
    '',
  ];
  for (const [index, rawDiff] of entry.diffs.entries()) {
    const limited = limitText(redact(rawDiff), { kind: 'tool-result', label: 'file-patch', extension: 'diff' });
    const fence = tildeFenceFor(limited.shown, 'diff');
    entry.diffs.length > 1 && lines.push(`<sub>Patch ${index + 1} of ${entry.diffs.length}${limited.linked ? ' - first 10 lines, full text linked' : ''}</sub>`, '');
    entry.diffs.length === 1 && limited.linked && lines.push('<sub>Patch: first 10 lines, full text linked</sub>', '');
    lines.push(fence.open, limited.shown, fence.close, '');
    limited.note && lines.push(limited.note, '');
  }
  lines.push('</details>', '');
  return lines;
}

function aggregateFileTouches (touches: FileTouch[]) {
  const aggregate = new Map<string, FileTouch>();
  for (const touch of touches) {
    const current = aggregate.get(touch.file);
    if (!current) {
      aggregate.set(touch.file, { ...touch, diffs: touch.diffs ? [...touch.diffs] : undefined });
      continue;
    }
    current.op = current.op === 'created' || touch.op === 'created' ? 'created' : touch.op;
    if (touch.additions != null)
      current.additions = (current.additions ?? 0) + touch.additions;
    if (touch.deletions != null)
      current.deletions = (current.deletions ?? 0) + touch.deletions;
    touch.diffs?.length && (current.diffs = [...(current.diffs ?? []), ...touch.diffs]);
  }
  return [...aggregate.values()];
}

function renderFilesTouched (filesTouched: FileTouch[], outputPath: string, options: { heading?: string; includeDiffs?: boolean; copyLabel?: string } = {}) {
  if (!filesTouched.length)
    return [];
  const { heading = `**📄 Files touched (${filesTouched.length}):**`, includeDiffs = true, copyLabel = 'Copy these paths' } = options;
  const icons: Record<string, string> = { created: '🆕', deleted: '🗑️', renamed: '🔀' };
  const icon = (op: string) => icons[op] || '✏️';
  return [
    ...(heading ? [heading, ''] : []),
    ...filesTouched.map((entry) => `- ${icon(entry.op)} ${entry.op} ${fileLink(entry.file, outputPath)} - ${changeCounts(entry)}`),
    '',
    ...(includeDiffs ? filesTouched.flatMap(renderFileDiffs) : []),
    ...copySource(filesTouched.map((entry) => entry.file).join('\n'), 'text', copyLabel),
  ];
}

// --- one turn ---

// Walks `turn.body` in recorded order and interleaves prose runs, reasoning, tool calls, and
// edit markers exactly as they streamed - never bucketed by type. `flush()`/`flushThoughts()`
// close out the current run before a different node type starts.
interface PreviousTool { turn: number; node: ToolNode }

function containsRecordedValue (earlier: unknown, later: unknown): boolean {
  if (later == null || later === '')
    return true;
  if (typeof later !== 'object')
    return earlier === later;
  if (!earlier || typeof earlier !== 'object')
    return Object.keys(later).length === 0;
  return Object.entries(later).every(([key, value]) => containsRecordedValue(Reflect.get(earlier, key), value));
}

function recordedDifference (earlier: unknown, later: unknown): unknown {
  if (containsRecordedValue(earlier, later))
    return undefined;
  if (later === null || typeof later !== 'object' || Array.isArray(later))
    return later;
  return Object.fromEntries(Object.entries(later).flatMap(([key, value]) => {
    const added = recordedDifference(earlier && typeof earlier === 'object' ? Reflect.get(earlier, key) : undefined, value);
    return added === undefined ? [] : [[key, added]];
  }));
}

function terminalDelta (earlier: ToolNode, later: ToolNode): ToolNode {
  const delta = { ...later };
  for (const key of ['invocation', 'pastTense', 'title', 'command', 'promptText', 'inputText', 'inputLanguage',
    'output', 'resultText', 'resultError', 'detailText', 'intent', 'fileUri'] as const) {
    const before = earlier[key] ?? '';
    const after = later[key] ?? '';
    delta[key] = before === after ? '' : key === 'output' && after.startsWith(before) ? after.slice(before.length) : after;
  }
  delta.resultDetails = recordedDifference(earlier.resultDetails, later.resultDetails) ?? null;
  delta.exitCode = earlier.exitCode === later.exitCode ? null : later.exitCode;
  delta.duration = earlier.duration === later.duration ? null : later.duration;
  delta.images = later.images?.filter((image) => !earlier.images?.some((previous) => containsRecordedValue(previous, image)));
  return delta;
}

function continuationOf (node: ToolNode, turn: number, previous: Map<string, PreviousTool[]>): { turn: number; delta?: ToolNode } | null {
  if (!node.toolCallId)
    return null;
  const history = previous.get(node.toolCallId) ?? [];
  const fields: Array<keyof ToolNode> = [
    'toolId', 'invocation', 'pastTense', 'title', 'command', 'promptText', 'inputText', 'inputLanguage',
    'resultDetails', 'todos', 'output', 'exitCode', 'duration', 'resultText', 'resultError',
    'detailText', 'intent', 'subagent', 'fileUri', 'patchFiles', 'toolSpecificData', 'isComplete', 'images',
  ];
  const original = history.find((entry) => entry.turn < turn
    && fields.every((key) => containsRecordedValue(entry.node[key], node[key])));
  const terminal = node.toolId === 'run_in_terminal' && !node.subagent
    ? [...history].reverse().find((entry) => entry.turn < turn && entry.node.toolId === node.toolId && !entry.node.subagent)
    : undefined;
  history.push({ turn, node });
  previous.set(node.toolCallId, history);
  return original ? { turn: original.turn } : terminal ? { turn: terminal.turn, delta: terminalDelta(terminal.node, node) } : null;
}

export function renderTurnBody (turn: Turn, byCall: Map<string, Resource[]>, outputPath = '', options: { heading?: boolean; previousTools?: Map<string, PreviousTool[]> } = {}) {
  const lines = options.heading === false ? [] : [MARK.assistantHeading, ''];
  let run: string[] = [];
  let thoughts: string[] = [];
  // VS Code frames inline edit (textEditGroup) previews with bare ``` fences in
  // the response stream; strip a fence that hugs an edit marker so it does not
  // render as an empty code box around the "Edited <file>" note.
  let stripLeadFence = false;
  // Blocks the exporter adds (warnings, notes, unreviewed JSON) wait here while the prose run has
  // a code fence open, so they never split the fence; they are written right after the run.
  let held: string[] = [];
  // The run as it will be written: the stray fence before an inline edit preview is dropped at
  // flush, so fence state is read after that strip, never from the raw run.
  const pending = () => stripLeadFence ? run.join('').replace(LEAD_EDIT_FENCE, '') : run.join('');
  const fenceOpen = () => Boolean(openFenceTicks(pending()));
  const flush = ({ trailingEdit = false, interrupter = '' } = {}) => {
    flushRun({ trailingEdit, interrupter });
    lines.push(...held);
    held = [];
  };
  const flushRun = ({ trailingEdit = false, interrupter = '' } = {}) => {
    if (!run.length) {
      return;
    }
    let markdown = redact(run.join(''));
    if (stripLeadFence)
      markdown = markdown.replace(LEAD_EDIT_FENCE, '');
    if (trailingEdit)
      markdown = markdown.replace(/\n?`{3,}[ \t]*\s*$/, '');
    stripLeadFence = false;
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
    // A node that interrupts an open fence forces assistantBlock to close it here, splitting the
    // code. Record it so strict mode can fail; the turn-end close is handled before the last flush.
    if (interrupter && openFenceTicks(markdown)) {
      fenceRepairs?.early.push({ turn: turn.number, kind: interrupter });
      held.unshift(`> _Representation change: the exporter closed a code fence early because a ${interrupter} record interrupted it; the code continues in the next block._`, '');
    }
    if (markdown) {
      lines.push(...assistantBlock(escapeModelHtml(markdown, turn.number, held)));
    }
    run = [];
  };

  const flushThoughts = () => {
    const tl = thoughts.length;
    if (!tl)
      return;
    const notes: string[] = [];
    const rendered = thoughts.map((thought) => `💡 ${closeUnbalancedFences(neutralizeStructuralHtml(escapeModelHtml(redact(thought), turn.number, notes)))}`);
    lines.push(
      `<details class="agent-reasoning"><summary>${mutedSummary(`🧠 Agent reasoning (${tl} thought${tl !== 1 ? 's' : ''})`)}</summary>`,
      '',
      '<div style="color:grey;margin-left:2em;margin-top:8px;">',
      '',
      // Joined with <br>, not blank lines: each thought still starts on its own line, but
      // without the full paragraph gap between them piling up for a multi-thought turn. Each
      // thought is fence-closed first so a stray ``` in one cannot swallow the rest, and the
      // <br> sits on its own line so it never lands on an appended closing fence.
      rendered.join('\n<br>\n'),
      '',
      '</div>',
      '',
      '</details>',
      '',
      ...notes,
    );
    thoughts = [];
  };

  for (const node of turn.body) {
    if (node.type === 'think') {
      flush({ interrupter: 'think' });
      thoughts.push(node.text);
    } else if (node.type === 'text') {
      flushThoughts();
      run.push(node.text);
      node.vulnerabilities?.length && held.push(...renderVulnerabilities(node));
    } else if (node.type === 'ref' && node.text) {
      flushThoughts();
      // Like VS Code, merge the plain label into code (an open fence or inline code span) and
      // show it as a code span in prose.
      const inCode = fenceOpen() || hasUnclosedInlineCode(pending());
      run.push(inCode ? node.text : `\`${node.text}\``);
    } else if (node.type === 'tool') {
      flush({ interrupter: 'tool' });
      flushThoughts();
      stripLeadFence = false;
      const from = options.previousTools ? continuationOf(node, turn.number, options.previousTools) : null;
      lines.push(...(from === null ? renderToolNode(node, byCall) : [
        from.delta
          ? `> ${esc(toolFriendly(node.toolId))}: continued from turn ${from.turn}.`
          : `- ${mutedSummary(`${MARK.toolBadgePrefix}<code style="${MUTED_CODE}">${esc(toolFriendly(node.toolId))}</code>: continued from turn ${from.turn}.`)}`,
        ...(from.delta ? ['', ...renderToolNode(from.delta, byCall, true)] : []),
      ]), '');
    } else if (node.type === 'note') {
      if (node.images?.length && fenceOpen()) {
        held.push(...renderNote(node), '');
        continue;
      }
      flush({ interrupter: 'note' });
      flushThoughts();
      stripLeadFence = false;
      lines.push(...renderNote(node), '');
    } else if (node.type === 'unknownResponse') {
      // Never inline unreviewed content. While a fence is open the JSON waits for the run to end.
      if (fenceOpen()) {
        held.push(...renderUnknownResponse(node), '');
        continue;
      }
      flush();
      flushThoughts();
      stripLeadFence = false;
      lines.push(...renderUnknownResponse(node), '');
    } else if (node.type === 'edit' && node.uri) {
      flush({ trailingEdit: node.inline, interrupter: 'edit' });
      flushThoughts();
      const verbs: Record<string, string> = { created: 'Created', deleted: 'Deleted', renamed: 'Renamed' };
      const verb = verbs[node.op] || 'Edited';
      lines.push(`> 📄 ${verb} \`${esc(workspacePath(node.uri.replace(/^\//, '')))}\``, '');
      // Only an inline edit preview is wrapped in stray fences by the response stream.
      stripLeadFence = Boolean(node.inline);
    }
  }
  const unclosed = openFenceCloser(pending());
  if (unclosed) {
    run.push(`${run.join('').endsWith('\n') ? '' : '\n'}${unclosed}\n`);
    fenceRepairs && (fenceRepairs.turnEnd += 1);
    held.unshift('> _Representation change: the exporter closed an unterminated code fence at the end of this turn._', '');
  }
  flush();
  flushThoughts();
  if (!turn.body.some((node: TurnNode) => node.type === 'text' || node.type === 'ref'))
    lines.push('_No assistant text was recorded for this turn._', '');
  lines.push(...renderFilesTouched(turn.filesTouched, outputPath));
  lines.push(...renderTodos(turn.todos));
  turn.todos.length && lines.push('');
  turn.requestError && lines.push(...renderNote({ type: 'note', title: 'Request error', text: turn.requestError }));
  return lines;
}

function sumFigures (left: UsageFigures, right: UsageFigures): UsageFigures {
  return {
    calls: left.calls + right.calls, inputTokens: left.inputTokens + right.inputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens, cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    outputTokens: left.outputTokens + right.outputTokens, reasoningTokens: left.reasoningTokens + right.reasoningTokens,
    nanoAiu: left.nanoAiu + right.nanoAiu, durationMs: left.durationMs + right.durationMs,
  };
}

function usageTokens (figures: UsageFigures) {
  return `${thousands(figures.inputTokens)} in (${thousands(figures.cacheReadTokens)} cached read, ${thousands(figures.cacheWriteTokens)} cache write) + ${thousands(figures.outputTokens)} out`;
}

function totalsSpan (totals: NonNullable<TurnScalars['usageTotals']>) {
  return totals.fromTurn < totals.toTurn ? `; covers turns ${totals.fromTurn}-${totals.toTurn}, which the log did not separate` : '';
}

function usageCredits (scalar: TurnScalars) {
  const usage = scalar.usage;
  // Per-call rows stand in for the turn's cost only where they cover about every reply; otherwise the running total is the better figure.
  if (!usage || (!usage.complete && scalar.usageTotals))
    return scalar.usageTotals ? `💳 ${fmtAiCredits(scalar.usageTotals.nanoAiu)} credits (from running totals${totalsSpan(scalar.usageTotals)})` : null;
  const all = sumFigures(usage.own, usage.agents);
  if (!usage.complete)
    return `💳 at least ${fmtAiCredits(all.nanoAiu)} credits (per-call rows are partial for this chat)`;
  const split = usage.agents.calls
    ? ` (${fmtAiCredits(usage.own.nanoAiu)} main + ${fmtAiCredits(usage.agents.nanoAiu)} in ${thousands(usage.agents.calls)} sub-agent call${usage.agents.calls === 1 ? '' : 's'})`
    : '';
  return `💳 ${fmtAiCredits(all.nanoAiu)} credits${split}`;
}

export function turnCost (scalar: TurnScalars) {
  const total = (scalar.promptTokens ?? 0) + (scalar.completionTokens ?? 0);
  const recorded = scalar.usage ? sumFigures(scalar.usage.own, scalar.usage.agents) : null;
  const parts = [
    `⏱️ ${humanDuration(scalar.elapsedMs)}`,
    // Unknown is not zero: an agent turn without recorded usage shows no token or credit figures at all.
    scalar.agentTurn
      ? (recorded ? `🔢 ${scalar.usage?.complete ? '' : 'at least '}${usageTokens(recorded)}` : scalar.messageOutputTokens !== undefined ? `🔢 ${thousands(scalar.messageOutputTokens)} output tokens (from message records; input not recorded)` : null)
      : `🔢 ${thousands(scalar.promptTokens ?? 0)} prompt + ${thousands(scalar.completionTokens ?? 0)} completion (=${thousands(total)})`,
    scalar.copilotCredits != null ? `💳 ${fmtCredits(scalar.copilotCredits)} credits` : usageCredits(scalar),
    `🤖 ${esc(modelName(scalar.modelId))}`,
  ].filter(Boolean);
  return `<sub>${parts.join(' · ')}</sub>`;
}

function autoResolutionText (resolutions: readonly AutoModelResolution[]) {
  return resolutions.map((item) => {
    const label = item.modelName && item.modelId && item.modelName !== item.modelId ? `${item.modelName} (${item.modelId})` : item.modelName || item.modelId;
    const extra = [item.predictedLabel && `label ${item.predictedLabel}`, item.confidence != null && `confidence ${item.confidence}`].filter(Boolean);
    return esc(extra.length ? `${label}; ${extra.join(', ')}` : label);
  }).join('<br>');
}

export function turnInfo (turn: Turn) {
  const scalar = turn.scalar;
  const promptDetails = scalar.promptTokenDetails;
  const legacyCache = promptDetails && !Array.isArray(promptDetails) ? promptDetails : null;
  const promptBreakdown = Array.isArray(promptDetails)
    ? promptDetails.map((detail) => `${detail.category}: ${detail.label} ${detail.percentageOfPrompt}%`).join('; ')
    : '';
  const refs = Array.isArray(scalar.contentReferences) ? scalar.contentReferences.length : 0;
  const citations = Array.isArray(scalar.codeCitations) ? scalar.codeCitations.length : 0;
  const followups = Array.isArray(scalar.followups) ? scalar.followups.length : 0;
  const agent = scalar.agent && (scalar.agent.extensionId?.value || scalar.agent.id);
  const rows = [
    ['Model', esc(modelName(scalar.modelId))],
    ...(scalar.autoModelResolutions?.length ? [['Auto resolved model', autoResolutionText(scalar.autoModelResolutions)]] : []),
    ...(scalar.reasoningKinds || scalar.opaqueReasoningBlocks ? [['Reasoning recorded', reasoningRecordedText(scalar)]] : []),
    ...(scalar.attachments?.length ? [['Attachments', esc(scalar.attachments.map((item) => `${item.name} (${item.type})`).join('; '))]] : []),
    ['Mode', esc(scalar.modeInfo?.modeId || scalar.modeInfo?.kind || (scalar.agentTurn ? 'not recorded' : 'unknown'))],
    ...(scalar.agentTurn ? [] : [['Agent', esc(agent || 'unknown')], ['Response ID', esc(scalar.responseId || 'n/a')]]),
    ...(scalar.agentTurn
      ? (scalar.usage ? usageRows(scalar.usage) : [['Usage', 'no per-call usage recorded for this turn']])
      : []),
    ...(scalar.agentTurn && scalar.usageTotals
      ? [['AI credits (from running totals)', `${fmtAiCredits(scalar.usageTotals.nanoAiu)}${totalsSpan(scalar.usageTotals)}`]]
      : []),
    ...(scalar.agentTurn && !scalar.usage && scalar.messageOutputTokens !== undefined
      ? [['Output tokens (from message records)', thousands(scalar.messageOutputTokens)]]
      : []),
    ...(scalar.agentTurn
      ? []
      : [
        ['Prompt tokens', thousands(scalar.promptTokens ?? 0)],
        ['Completion tokens', thousands(scalar.completionTokens ?? 0)],
        promptBreakdown
          ? ['Prompt details', promptBreakdown]
          : ['Cache read / write', legacyCache ? `${thousands(legacyCache.cacheReadTokens ?? 0)} / ${thousands(legacyCache.cacheWriteTokens ?? 0)}` : '0 / 0'],
        ['Credits', scalar.copilotCredits != null ? fmtCredits(scalar.copilotCredits) : 'n/a'],
      ]),
    ['Elapsed', humanDuration(scalar.elapsedMs)],
    ...(scalar.agentTurn ? [] : [['Sources (refs)', String(refs)], ['Code citations', String(citations)], ['Followups', String(followups)]]),
    ['Requested', isoTimestamp(scalar.timestamp ?? turn.ts)],
    ['Responded', isoTimestamp(scalar.responseTimestamp)],
    ...(scalar.agentTurn ? [] : [['Canceled', scalar.isCanceled ? 'yes' : 'no']]),
  ];
  const injected = scalar.injectedContext
    ? (() => {
      const text = closeUnbalancedFences(neutralizeStructuralHtml(redact(scalar.injectedContext)));
      const fence = fenceFor(text, 'text');
      return ['', `<details><summary>${mutedSummary('📎 Injected context (what was sent to the model besides your text)')}</summary>`, '', ...indentBlock([fence.open, text, fence.close]), '', '</details>'];
    })()
    : [];
  return [`<details><summary>${mutedSummary('ℹ️ Turn info')}</summary>`, '', ...indentBlock(['| Field | Value |', '|---|---|', ...rows.map(([key, value]) => `| ${key} | ${value} |`)]), '', '</details>', ...injected];
}

function usageRows (usage: NonNullable<TurnScalars['usage']>): string[][] {
  const all = sumFigures(usage.own, usage.agents);
  return [
    ['Model calls with usage', `${thousands(usage.own.calls)} main${usage.agents.calls ? ` + ${thousands(usage.agents.calls)} in delegated agents` : ''}`],
    ['Tokens', usageTokens(all)],
    ...(all.reasoningTokens ? [['Reasoning tokens (inside output)', thousands(all.reasoningTokens)]] : []),
    ['AI credits', `${fmtAiCredits(all.nanoAiu)}${usage.agents.calls ? ` (main ${fmtAiCredits(usage.own.nanoAiu)}, delegated agents ${fmtAiCredits(usage.agents.nanoAiu)})` : ''}`],
  ];
}

function reasoningRecordedText (scalar: TurnScalars) {
  const parts = [
    scalar.reasoningKinds?.thinking ? `${scalar.reasoningKinds.thinking} readable thinking block(s)` : '',
    scalar.reasoningKinds?.summary ? `${scalar.reasoningKinds.summary} model-written summary block(s)` : '',
    scalar.opaqueReasoningBlocks ? `${scalar.opaqueReasoningBlocks} message(s) with reasoning recorded only as an encrypted token (not readable)` : '',
  ].filter(Boolean);
  return parts.join('; ');
}

// --- the whole document ---

// Section order and anchors are fixed by spec section 5; the Contents list and the anchors it
// points at must be edited together.
//
// Everything that varies by machine or by run - paths, git state, the clock - arrives in
// `context` rather than being read here, so the same parse always renders the same bytes. That
// is what lets the recorded checks compare two runs at all.
/** Everything the page needs that is not in the parsed model. */
export interface DocumentContext {
  sourceCopy?: SourceCopy;
  location: SessionLocation;
  resources: { resources: Resource[]; byCall: Map<string, Resource[]>; resourceRoot: string };
  versions: { copilotVersion: string; vscodeVersion: string };
  memory: { session: MemoryFile[]; repo: MemoryFile[]; user: MemoryFile[] };
  outputPath: string;
  gitStatus: string;
  generatedAt: string;
  /** Where over-long tool text is saved in full. Omit it to keep every text inline. */
  overflow?: TextOverflow;
  /** Collects the code fences the renderer closed itself. */
  fenceRepairs?: FenceRepairs;
  /** Where the conversation came from; changes only the descriptive wording. Default: the Local chat journal. */
  source?: 'journal' | 'sdk-events';
}

const USAGE_SOURCE_TEXT: Record<SessionUsage['source'], string> = {
  'session-store': 'the Copilot CLI session store (`session-store.db`, table `assistant_usage_events`)',
  'event-log': '`model.model_call_success` events in the event log',
  none: 'none',
};

function coverageText (usage: SessionUsage) {
  const rows = usage.recorded.calls + usage.unattributed.calls;
  const percent = usage.replies ? ` (${Math.min(100, Math.round((rows / usage.replies) * 100))}% of them)` : '';
  return `${thousands(rows)} usage row${rows === 1 ? '' : 's'} for ${thousands(usage.replies)} assistant repl${usage.replies === 1 ? 'y' : 'ies'} in this log${percent}`;
}

function loggedText (usage: SessionUsage) {
  const logged = usage.logged;
  if (!logged)
    return '';
  const rowsNano = usage.recorded.nanoAiu + usage.unattributed.nanoAiu;
  const share = usage.source !== 'none' && logged.nanoAiu > 0 ? ` The per-call rows add up to ${Math.round((rowsNano / logged.nanoAiu) * 100)}% of it.` : '';
  return `Last logged total for the whole event log: ${fmtAiCredits(logged.nanoAiu)} credits (about $${(logged.nanoAiu / 1e11).toFixed(2)} at $0.01 per credit), from \`${logged.event}\`${logged.at ? ` at ${isoTimestamp(logged.at)}` : ''}; it is a running total, and the log has ${thousands(logged.shutdowns)} shutdown record${logged.shutdowns === 1 ? '' : 's'}.${share}`;
}

/** One line for the metadata list and the executive summary. */
function usageHeadline (usage: SessionUsage) {
  if (usage.source === 'none')
    return `💳 ${fmtAiCredits(usage.logged?.nanoAiu ?? 0)} credits (last logged total; no per-call usage recorded)`;
  const logged = usage.logged ? `; last logged total ${fmtAiCredits(usage.logged.nanoAiu)}` : '';
  return `💳 ${fmtAiCredits(usage.recorded.nanoAiu)} credits recorded per call across ${thousands(usage.recorded.calls)} model call${usage.recorded.calls === 1 ? '' : 's'}${logged}`;
}

/** Credits per turn from the log's running totals: the most expensive turns up front, every turn in a collapsible table. */
function totalsByTurn (usage: SessionUsage, turns: readonly Turn[]): string[] {
  const rows = turns.filter((turn) => turn.scalar.usageTotals);
  if (!rows.length)
    return [];
  const label = (turn: Turn) => `[Q${turn.number}](${userMessageHref(turn.number)})`;
  const top = [...rows].sort((left, right) => right.scalar.usageTotals!.nanoAiu - left.scalar.usageTotals!.nanoAiu).slice(0, 5);
  const share = (nano: number) => {
    const sum = rows.reduce((total, turn) => total + turn.scalar.usageTotals!.nanoAiu, 0);
    return sum > 0 ? ` (${Math.round((nano / sum) * 100)}%)` : '';
  };
  const lines = [
    `**Credits by turn, from the log's running totals** (${thousands(rows.length)} of ${thousands(turns.length)} turns hold a total; the log writes one at the end of most turns, not all):`,
    '',
    `Most expensive: ${top.map((turn) => `${label(turn)} ${fmtAiCredits(turn.scalar.usageTotals!.nanoAiu)}${share(turn.scalar.usageTotals!.nanoAiu)}`).join(' · ')}`,
    '',
    `<details><summary>${mutedSummary('📈 Credits for every turn')}</summary>`,
    '',
    '| Turn | Request | AI credits | Note |',
    '|---:|---|---:|---|',
    ...rows.map((turn) => {
      const totals = turn.scalar.usageTotals!;
      const note = totals.fromTurn < totals.toTurn ? `covers turns ${totals.fromTurn}-${totals.toTurn}` : '';
      return `| ${turn.number} | ${esc(clip(turn.prompt, 70)).replaceAll('|', '\\|')} | ${fmtAiCredits(totals.nanoAiu)} | ${note} |`;
    }),
    '',
    '</details>',
    '',
    '> A running-total difference is everything the turn cost, including delegated agents, which cannot be separated here. It can differ from the per-call rows, which cover only the calls the CLI store or log recorded.',
    '',
    ...(usage.beforeFirstTurnNanoAiu ? [`> ${fmtAiCredits(usage.beforeFirstTurnNanoAiu)} credits were added to the running total before the first prompt of this conversation.`, ''] : []),
  ];
  return lines;
}
/** The agent version of the cost table plus the notes a reader needs to judge the figures. */
function agentCostSection (usage: SessionUsage, turns: readonly Turn[]): string[] {
  const row = (label: string, figures: UsageFigures) =>
    `| ${label} | ${thousands(figures.calls)} | ${thousands(figures.inputTokens)} | ${thousands(figures.cacheReadTokens)} | ${thousands(figures.cacheWriteTokens)} | ${thousands(figures.outputTokens)} | ${fmtAiCredits(figures.nanoAiu)} |`;
  const lines: string[] = [];
  if (usage.source === 'none') {
    lines.push('Per-call usage is not recorded for this chat, so no per-turn, per-agent or per-model figures can be shown.', '');
  } else {
    lines.push(
      '| Model | Calls | Input tokens | Cache read | Cache write | Output tokens | AI credits |',
      '|---|---:|---:|---:|---:|---:|---:|',
      ...usage.byModel.map(([model, figures]) => row(`\`${modelName(model)}\``, figures)),
      row('**Recorded total**', usage.recorded),
      ...(usage.unattributed.calls ? [row('Not matched to a turn or agent of this conversation', usage.unattributed)] : []),
      '',
    );
  }
  lines.push(
    '> **AI credits** are the recorded nano-AIU divided by 1,000,000,000 (1 credit = 1 AIU = $0.01). They are never estimated from token counts. Input tokens include cached ones, and each call re-sends its context, so input tokens are not additive across turns as a measure of text.',
    '',
    ...(usage.source === 'none' ? [] : [`> Per-call source: ${USAGE_SOURCE_TEXT[usage.source]}. It holds ${coverageText(usage)}. Turns and agents without a recorded call show no usage figures.`, '']),
    ...(usage.logged ? [`> ${loggedText(usage)}`, ''] : []),
    ...totalsByTurn(usage, turns),
  );
  return lines;
}

function subagentSummaryLine (toolNodes: ToolNode[]): string[] {
  let agents = 0;
  let calls = 0;
  const walk = (turns: Turn[]) => {
    for (const turn of turns)
      for (const node of turn.toolNodes) {
        calls += node.subagent ? 0 : 1;
        if (node.subagent) {
          agents += 1;
          walk(node.subagent.turns);
        }
      }
  };
  for (const node of toolNodes)
    if (node.subagent) {
      agents += 1;
      walk(node.subagent.turns);
    }
  return agents ? [`- **Sub-agents:** ${agents} (${thousands(calls)} tool calls inside them, shown nested at the call that started each)`] : [];
}

export function buildDocument (session: ParsedSession, context: DocumentContext) {
  overflow = context.overflow ?? null;
  fenceRepairs = context.fenceRepairs ?? null;
  const collect = (turns: Turn[]): RecordedImage[] => turns.flatMap((turn) => [
    ...(turn.promptImages ?? []),
    ...turn.body.flatMap((node) => node.type === 'tool'
      ? [...(node.images ?? []), ...(node.subagent ? collect(node.subagent.turns) : [])]
      : node.type === 'note' ? node.images ?? [] : []),
  ]);
  imageReplacements = [...new Map(collect(session.turns).filter((image) => image.bytes).map((image) => [
    Buffer.from(image.bytes!).toString('base64'),
    `[recorded image saved separately; SHA-256 ${createHash('sha256').update(image.bytes!).digest('hex').slice(0, 12)}]`,
  ])).entries()].map(([encoded, label]) => ({ encoded, label }));
  try {
    return buildDocumentBody(session, context);
  } finally {
    overflow = null;
    fenceRepairs = null;
    imageReplacements = [];
  }
}

function buildDocumentBody (session: ParsedSession, context: DocumentContext) {
  const { location, resources, versions, memory, outputPath, gitStatus, generatedAt } = context;
  const sdk = context.source === 'sdk-events';
  const usageHidden = sdk && session.turns.length > 0 && session.turns.every((turn) => turn.scalar.agentTurn) && !session.usage;
  const usage = sdk ? session.usage : undefined;
  const usageCell = (value: string | number) => usageHidden ? 'not recorded' : typeof value === 'number' ? thousands(value) : value;
  const turns = session.turns;
  const toolNodes = turns.flatMap((turn) => turn.toolNodes);
  const reasoningTurns = turns.filter((turn) => turn.reasoning.length).length;
  const totalThoughts = turns.reduce((sum, turn) => sum + turn.reasoning.length, 0);
  const totalCompletion = turns.reduce((sum, turn) => sum + (turn.scalar.completionTokens ?? 0), 0);
  const totalPrompt = turns.reduce((sum, turn) => sum + (turn.scalar.promptTokens ?? 0), 0);
  const totalCredits = turns.reduce((sum, turn) => sum + (Number(turn.scalar.copilotCredits) || 0), 0);
  const totalElapsed = turns.reduce((sum, turn) => sum + (turn.scalar.elapsedMs ?? 0), 0);
  const firstTs = turns[0]?.ts ?? session.creationDate;
  const lastTs = turns.reduce((max, turn) => Math.max(max, turn.scalar.responseTimestamp ?? turn.ts ?? 0), 0) || firstTs;
  const modelsUsed = [...new Set(turns.map((turn) => turn.scalar.modelId).filter(Boolean))];
  const sessionFiles = aggregateFileTouches(turns.flatMap((turn) => turn.filesTouched));

  const byModel = new Map();
  const previousTools = new Map<string, PreviousTool[]>();
  for (const turn of turns) {
    const key = turn.scalar.modelId || 'unknown';
    const entry = byModel.get(key) ?? { turns: 0, prompt: 0, completion: 0, credits: 0, elapsed: 0 };
    entry.turns += 1;
    entry.prompt += turn.scalar.promptTokens ?? 0;
    entry.completion += turn.scalar.completionTokens ?? 0;
    entry.credits += Number(turn.scalar.copilotCredits) || 0;
    entry.elapsed += turn.scalar.elapsedMs ?? 0;
    byModel.set(key, entry);
  }

  const toolCounts = new Map();
  for (const node of toolNodes) {
    const key = toolFriendly(node.toolId);
    const entry = toolCounts.get(key) ?? { count: 0, resources: 0 };
    entry.count += 1;
    entry.resources += node.toolCallId ? (resources.byCall.get(node.toolCallId)?.length ?? 0) : 0;
    toolCounts.set(key, entry);
  }

  const title = session.title || `session ${location.sessionId}`;
  const lines = [
    '<a id="top"></a>',
    '',
    `# Copilot Chat Export: ${redact(title)}`,
    '',
    ...sourceCopyNotice(context.sourceCopy).flatMap((notice) => [notice, '']),
    sdk
      ? '> Conversation archive sourced from the Copilot SDK event log (Agent Host / Copilot CLI): prompts, readable reasoning, assistant messages, tool calls with inputs, outputs and errors, code blocks and timing.'
      : '> Full visible conversation archive sourced from the native VS Code chat journal: prompts, agent reasoning, tool calls, code blocks, token cost, and timing.',
    ...(imageReplacements.length || context.overflow?.companions.some((item) => item.kind === 'image')
      ? ['', '> Images bypass text redaction and may contain private information. Review image companions before sharing.'] : []),
    '',
    '## Session Metadata',
    '',
    `- **Session ID:** \`${location.sessionId}\``,
    `- **Title:** ${redact(session.title || '(untitled)')}`,
    `- **Session started:** ${isoTimestamp(firstTs)}`,
    `- **Export covers through:** ${isoTimestamp(lastTs)}`,
    `- **Export generated:** ${isoTimestamp(generatedAt)}`,
    `- **Copilot version:** \`${versions.copilotVersion}\``,
    `- **VS Code version:** \`${versions.vscodeVersion}\``,
    `- **Responder:** ${redact(session.responderUsername || 'GitHub Copilot')}`,
    `- **User requests:** ${turns.length}`,
    `- **Assistant reasoning turns:** ${reasoningTurns} (${totalThoughts} recovered thought(s))`,
    `- **Tool calls:** ${toolNodes.length}`,
    ...subagentSummaryLine(toolNodes),
    `- **Persisted result resources:** ${resources.resources.length}`,
    `- **Models used:** ${modelsUsed.map((model) => `\`${modelName(model)}\``).join(', ') || 'unknown'}`,
    usage
      ? `- **Total cost:** ⏱️ ${humanDuration(totalElapsed)} · ${usageHeadline(usage)} · 🤖 ${modelsUsed.length} model(s)`
      : usageHidden
        ? `- **Total cost:** ⏱️ ${humanDuration(totalElapsed)} · tokens and credits not recorded for this chat · 🤖 ${modelsUsed.length} model(s)`
        : `- **Total cost:** ⏱️ ${humanDuration(totalElapsed)} · 🔢 ${thousands(totalCompletion)} completion tokens · 💳 ${fmtCredits(totalCredits)} credits · 🤖 ${modelsUsed.length} model(s)`,
    '',
    backToContents(),
    '',
    '<a id="contents"></a>',
    '',
    '## Contents',
    '',
    '1. [User Questions and Requests](#user-questions-and-requests)',
    '2. [Cost and Timing Summary](#cost-and-timing-summary)',
    '3. [Executive Summary](#executive-summary)',
    '4. [Important Outputs](#important-outputs)',
    '5. [Files Modified](#files-modified)',
    '6. [Tool Usage](#tool-usage)',
    '7. [Conversation Transcript](#conversation-transcript)',
    '8. [Memory and Plan Artifacts](#memory-and-plan-artifacts)',
    '9. [Export Provenance](#export-provenance)',
    '',
    sectionAnchor(MARK.sectionUserQuestions),
    '',
    '## User Questions and Requests',
    '',
    ...turns.map((turn) => `${turn.number}. 🔷 [Q${turn.number}: ${clip(turn.prompt, 130).replaceAll('[', '\\[').replaceAll(']', '\\]')}](${userMessageHref(turn.number)}) - ${isoTimestamp(turn.ts).slice(0, 10)}`),
    '',
    backToContents(),
    '',
    sectionAnchor(MARK.sectionCostTiming),
    '',
    '## Cost and Timing Summary',
    '',
    ...(usage
      ? [...agentCostSection(usage, turns), `Elapsed: ${humanDuration(totalElapsed)} across ${turns.length} turn${turns.length === 1 ? '' : 's'}.`, '']
      : [
        '| Model | Turns | Prompt tokens | Completion tokens | Credits | Elapsed |',
        '|---|---:|---:|---:|---:|---:|',
        ...[...byModel.entries()].map(([model, entry]) => `| \`${modelName(model)}\` | ${entry.turns} | ${usageCell(entry.prompt)} | ${usageCell(entry.completion)} | ${usageCell(fmtCredits(entry.credits))} | ${humanDuration(entry.elapsed)} |`),
        `| **Total** | ${turns.length} | ${usageCell(thousands(totalPrompt))} | ${usageCell(thousands(totalCompletion))} | ${usageCell(fmtCredits(totalCredits))} | ${humanDuration(totalElapsed)} |`,
        '',
        usageHidden
          ? '> Tokens and credits are not recorded for this chat (no per-call usage and no logged total were found), so they are shown as "not recorded", never as zero.'
          : '> Prompt-token counts are per-request context sizes (they include prior conversation and cached tokens), so they are not additive across turns; completion tokens and credits are the per-turn incremental cost.',
        '',
      ]),
    backToContents(),
    '',
    '<a id="executive-summary"></a>',
    '',
    '## Executive Summary',
    '',
    `This archive captures "${redact(title)}" - ${turns.length} user request(s) recorded from ${isoTimestamp(firstTs)} through ${isoTimestamp(lastTs)}.`,
    '',
    `The agent produced ${toolNodes.length} tool call(s) and ${totalThoughts} recovered reasoning note(s) across ${reasoningTurns} turn(s), using ${modelsUsed.length} model(s) (${modelsUsed.map((model) => `\`${modelName(model)}\``).join(', ') || 'unknown'}). ${usage ? `Usage: ${usageHeadline(usage)}; ${humanDuration(totalElapsed)} of processing.` : usageHidden ? `Tokens and credits are not recorded for this chat; ${humanDuration(totalElapsed)} of processing.` : `Total recorded output: ${thousands(totalCompletion)} completion tokens, ${fmtCredits(totalCredits)} credits, ${humanDuration(totalElapsed)} of processing.`}`,
    '',
    backToContents(),
    '',
    '<a id="important-outputs"></a>',
    '',
    '## Important Outputs',
    '',
    '### Recorded Resources',
    '',
    ...(resources.resources.length
      ? resources.resources.map((resource) => `- \`${resource.relative}\` (${thousands(resource.bytes)} bytes)${resource.toolCallId ? ` - tool call \`${resource.toolCallId}\`` : ''}`)
      : ['_No raw tool outputs were persisted by VS Code for this session._']),
    '',
    '### Recorded Output Limitation',
    '',
    '> [!NOTE]',
    '> The chat journal stores prompts, reasoning, tool invocations, assistant text, tokens, and timing. Large raw tool-output bodies live in the separate resources store and are embedded where present; some tool outputs were only returned inline and are not separately persisted.',
    '',
    backToContents(),
    '',
    '<a id="files-modified"></a>',
    '',
    '## Files Modified',
    '',
    '### Files Edited in This Session',
    '',
    ...(sessionFiles.length
      ? renderFilesTouched(sessionFiles, outputPath, { heading: '', includeDiffs: false, copyLabel: 'Copy all edited paths' })
      : ['_No file edits were recorded in the journal._', '']),
    ...(sessionFiles.some((file) => file.additions != null)
      ? ['> Addition and deletion totals count submitted patch operations. Repeated edits to the same line count each time; these totals are not the final Git diff.', '']
      : []),
    '### Chat Export Artifact',
    '',
    `- \`${workspacePath(outputPath)}\``,
    '',
    '### Current Worktree Snapshot',
    '',
    fenceFor(redact(gitStatus), 'text').open,
    redact(gitStatus),
    fenceFor(redact(gitStatus)).close,
    '',
    backToContents(),
    '',
    '<a id="tool-usage"></a>',
    '',
    '## Tool Usage',
    '',
    '| Tool | Calls | Persisted outputs |',
    '|---|---:|---:|',
    ...[...toolCounts.entries()].sort(([left], [right]) => COLLATOR.compare(left, right)).map(([tool, entry]) => `| \`${tool}\` | ${entry.count} | ${entry.resources} |`),
    '',
    backToContents(),
    '',
    '<a id="conversation-transcript"></a>',
    '',
    '## Conversation Transcript',
    '',
    '> [!TIP]',
    '> **Visual guide:** 🔷 user request · 💬 assistant answer · 🧠 reasoning · 💡 thought · 🛠️ tool call · 📟 terminal output · 📦 tool result · 📄 edited file · 📋 copy source · ℹ️ turn info · ⏱️ elapsed · 🔢 tokens · 💳 credits · 🤖 model · ⬆️ back-to-TOC. A tool call is unmarked when it completed cleanly: ⏳ marks one still running, ⚠️ a non-zero exit.',
    '',
    '> [!TIP]',
    '> **Reading order:** assistant answers carry a blue accent bar and full-size text; tool calls, reasoning, and stats are rendered small and grey. Skim the accented blocks for the narrative, expand the grey ones for the work behind it.',
    '',
    '> [!TIP]',
    '> **Copying:** every code fence has a hover copy button in the VS Code Markdown preview and on GitHub. Rendered Markdown boxes and file lists are paired with a 📋 collapsible holding the raw, copyable source.',
    '',
  ];

  for (const turn of turns) {
    const badge = esc(clip(turn.prompt, 90));
    const promptNotes: string[] = [];
    const prompt = blockquote(escapeModelHtml(String(turn.prompt ?? ''), turn.number, promptNotes));
    lines.push(
      '---',
      '',
      userMessageAnchor(turn.number),
      '',
      `${MARK.requestHeadingPrefix}${turn.number}&nbsp; <span style="${PROMPT_BADGE}">${badge}</span> <span style="${MUTED}">${headerTimestamp(turn.ts)}</span></h3>`,
      '',
      '> [!NOTE]',
      '> **USER QUESTION / REQUEST**',
      '',
      `<div style="${PROMPT_BOX}">`,
      '',
      prompt,
      '',
      ...renderImages(turn.promptImages),
      '</div>',
      '',
      ...promptNotes,
    );
    lines.push(...renderTurnBody(turn, resources.byCall, outputPath, { previousTools }), '');
    lines.push(...turnInfo(turn), '');
    lines.push(turnCost(turn.scalar), '');
    lines.push('<div align="right"><a href="#user-questions-and-requests">⬆️ Back to questions</a></div>', '');
  }

  lines.push(
    '<a id="memory-and-plan-artifacts"></a>',
    '',
    '## Memory and Plan Artifacts',
    '',
    '> On-disk memory notes and plans captured during this session (session, repository, and user scope).',
    '',
  );
  const memoryGroups: Array<[string, MemoryFile[]]> = [
    ['Session memory', memory.session],
    ['Repository memory', memory.repo],
    ['User memory', memory.user],
  ];
  let anyMemory = false;
  for (const [label, group] of memoryGroups) {
    for (const file of group) {
      anyMemory = true;
      const content = redact(file.content);
      lines.push(`<details><summary>🧠 ${label}: ${esc(file.name)}</summary>`, '', ...markdownBody(content, file.path ? workspacePath(file.path) : ''), '</details>', '');
    }
  }
  if (!anyMemory)
    lines.push('_No memory or plan files were found on disk for this session._', '');
  lines.push(backToContents(), '');

  lines.push(
    '<a id="export-provenance"></a>',
    '',
    '## Export Provenance',
    '',
    sdk
      ? `- Source event log (definitive): \`${location.sessionPath.replaceAll('\\', '/')}\``
      : `- Source journal (definitive): \`${workspacePath(location.sessionPath)}\``,
    ...(sdk ? [] : [`- Resource root: \`${workspacePath(resources.resourceRoot)}\``]),
    sdk
      ? '- Single source: conversation order, reasoning, tool calls and results come from the Copilot SDK `events.jsonl`. Permission prompts, hook records and model request copies were counted and left out; system prompts, skill files and images are saved as linked companion files.'
      : '- Single source: conversation order, reasoning, tool calls, and code blocks come from the native `chatSessions` journal. Optional transcript records enrich matching tool calls with submitted patch arguments; raw tool-output bodies come from `chat-session-resources`.',
    '- Redaction masks common authorization, token, API-key, password, and client-secret assignment forms.',
    '- Rendering: colored badges use inline HTML and render in the VS Code Markdown preview; GitHub strips inline styles and shows the text without color.',
    sdk
      ? '- Reasoning shown is the readable thinking text or model-written summary the SDK recorded. Reasoning stored only as an encrypted token is counted but cannot be read and is not reconstructed.'
      : '- Reasoning shown is the journal\'s recorded `thinking` text (the agent\'s own notes); no hidden model chain-of-thought is reconstructed.',
    ...(sdk ? [] : [`- Parse validated against: ${VALIDATED_AGAINST}.`]),
    ...session.errors.map((error) => `- Parse warning: ${redact(error)}`),
    ...(session.census.unhandled.length
      ? [
        '',
        '> [!WARNING]',
        `> This build has no handler for ${session.census.unhandled.length} journal node kind(s), so their content is missing from this export: ${session.census.unhandled.map(([kind, count]) => `\`${esc(kind)}\` (${thousands(count)})`).join(', ')}. The journal format is undocumented and changes with VS Code; re-run with \`--verify\` for the full schema census.`,
      ]
      : []),
    '',
    '<div align="right"><a href="#top">⬆️ Back to top</a></div>',
  );

  return `${lines.join('\n')}\n`;
}
