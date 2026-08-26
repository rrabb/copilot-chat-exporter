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

import path from 'node:path';
import type { FileTouch, ParsedSession, TodoItem, ToolNode, Turn, TurnNode, TurnScalars } from './types.ts';
import type { MemoryFile, Resource } from './session/enrich.ts';
import type { SessionLocation } from './types.ts';
import { workspacePath } from './host.ts';
import { VALIDATED_AGAINST } from './session/classify.ts';
import { modelName } from './session/enrich.ts';
import {
  COLLATOR, COMMAND_CODE, FILE_LINK_COLOR, MARK, MUTED, MUTED_CODE, NESTED_INDENT, PROMPT_BADGE,
  PROMPT_BOX, assistantBlock, backToContents, blockquote, clip, clipText, esc, extractUri,
  fenceFor, fmtCredits, headerTimestamp, humanDuration, indentBlock, isoTimestamp, mutedSummary,
  neutralizeStructuralHtml, redact, sectionAnchor, stripMarkdown, thousands, userMessageAnchor,
  userMessageHref,
} from './text.ts';

const MAX_EMBEDDED_RESOURCE_BYTES = 96 * 1024;
const MAX_TERMINAL_OUTPUT_BYTES = 24 * 1024;
const MAX_COPY_SOURCE_BYTES = 32 * 1024;
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
  let fenceLen = 0;
  let html = false;
  let comment = false;
  let heading = false;
  let link = false;
  for (const line of String(content).split('\n')) {
    const match = /^\s*(`{3,})\s*(\S*)\s*$/.exec(line);
    if (match) {
      if (fenceLen === 0)
        fenceLen = match[1].length;
      else if (match[1].length >= fenceLen && !match[2])
        fenceLen = 0;
      continue;
    }
    if (fenceLen > 0)
      continue;
    // Any tag-like token renders live: <Select> becomes a real dropdown, <img> loads, etc.
    /<\/?[A-Za-z][\w:.-]*(\s[^<>]*)?\/?>/.test(line) && (html = true);
    line.includes('<!--') && (comment = true);
    /^\s{0,3}#{1,6}\s/.test(line) && (heading = true);
    /^\s*<a\s|<a\s+id=/i.test(line) && (link = true);
  }
  const risks = [];
  html && risks.push('raw HTML/XML');
  comment && risks.push('HTML comments');
  heading && risks.push('headings would pollute the outline');
  link && risks.push('anchors');
  fenceLen > 0 && risks.push('unclosed code fence');
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
  const content = redact(resource.content);
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
      return `\u0000${placeholders.length - 1}\u0000`;
    },
  );
  return esc(withPlaceholders).replace(/\u0000(\d+)\u0000/g, (match, index) => placeholders[Number(index)]);
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
function trimCommandEcho (output: string, command: string) {
  const lines = output.split('\n');
  const first = (lines[0] ?? '').trim();
  if (first && command && first.length < command.length && command.includes(first))
    lines.shift();
  return lines.join('\n').replace(/^\n+/, '');
}

function renderToolNode (node: ToolNode, byCall: Map<string, Resource[]>) {
  const resources = node.toolCallId ? (byCall.get(node.toolCallId) ?? []) : [];
  // A completed call needs no marker; only the exceptions earn one.
  const icon = node.isComplete ? '' : '⏳ ';
  const summaryHtml = node.command
    ? `<code style="${COMMAND_CODE}">${esc(commandOneLiner(node.command))}</code>`
    : toolSummaryHtml(node);
  const head = `${MARK.toolBadgePrefix}${icon}<code style="${MUTED_CODE}">${esc(toolFriendly(node.toolId))}</code>: ${summaryHtml}`;
  const hasDetails = node.toolSpecificData && node.toolSpecificData.kind !== 'terminal' && node.toolSpecificData.kind !== 'todoList';
  const hasBody = node.command || node.promptText || resources.length || hasDetails || node.output || node.resultText;
  // Nothing to expand: render a plain line rather than an empty collapsible.
  if (!hasBody)
    return [`- ${mutedSummary(head)}`];
  const body = [];
  if (node.command) {
    const fence = fenceFor(node.command, 'powershell');
    body.push('**Command:**', '', fence.open, redact(node.command), fence.close, '');
  }
  if (node.promptText) {
    const clipped = clipText(redact(node.promptText), MAX_TERMINAL_OUTPUT_BYTES);
    const fence = fenceFor(clipped.text, 'text');
    body.push(
      `<details><summary>${mutedSummary(`📝 Subagent prompt${clipped.clipped ? ' - clipped' : ''}`)}</summary>`,
      '',
      ...indentBlock([fence.open, clipped.text, fence.close], NESTED_INDENT),
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
    const clipped = clipText(redact(outputText), MAX_TERMINAL_OUTPUT_BYTES);
    const fence = fenceFor(clipped.text, 'text');
    const badge = node.exitCode ? ' ⚠️' : '';
    body.push(
      `<details><summary>${mutedSummary(`📟 Terminal output (${status})${clipped.clipped ? ' - clipped' : ''}${badge}`)}</summary>`,
      '',
      ...indentBlock([fence.open, clipped.text, fence.close], NESTED_INDENT),
      '',
      '</details>',
      '',
    );
  }
  if (node.resultText) {
    const clipped = clipText(redact(node.resultText), MAX_TERMINAL_OUTPUT_BYTES);
    const fence = fenceFor(clipped.text, 'text');
    body.push(
      `<details><summary>${mutedSummary(`📦 Tool result (${thousands(node.resultText.split('\n').length)} lines)${clipped.clipped ? ' - clipped' : ''}`)}</summary>`,
      '',
      ...indentBlock([fence.open, clipped.text, fence.close], NESTED_INDENT),
      '',
      '</details>',
      '',
    );
  }
  if (resources.length)
    body.push(`**Persisted output:** ${resources.map((resource) => `${resource.relative} (${thousands(resource.bytes)} bytes)`).join('; ')}.`, '');
  else if (!node.output && !node.resultText)
    body.push('**Output:** not persisted as a separate resource (returned inline).', '');
  for (const resource of resources)
    body.push(`<details><summary>${mutedSummary(`📦 Output body - ${esc(resource.relative)}`)}</summary>`, '', ...indentBlock([`- Resource path: \`${workspacePath(resource.filePath)}\``, '', ...resourceBody(resource)], NESTED_INDENT), '', '</details>', '');
  if (hasDetails) {
    const payload = node.toolSpecificData!;
    // The subagent's prompt/result already render above (as text, not escaped JSON), so
    // drop them here rather than showing the same content twice - once readable, once not.
    const detailsSource = payload.kind === 'subagent'
      ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'prompt' && key !== 'result'))
      : payload;
    const json = redact(JSON.stringify(detailsSource, null, 2));
    const fence = fenceFor(json, 'json');
    body.push(`<details><summary>${mutedSummary('⚙️ Tool details')}</summary>`, '', ...indentBlock([fence.open, json, fence.close], NESTED_INDENT), '', '</details>', '');
  }
  return [`<details><summary>${mutedSummary(head)}</summary>`, '', ...indentBlock(body), '', '</details>'];
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

function renderFilesTouched (filesTouched: FileTouch[], lineCounts: Map<string, number>) {
  if (!filesTouched.length)
    return [];
  const icons: Record<string, string> = { created: '🆕', deleted: '🗑️', renamed: '🔀' };
  const icon = (op: string) => icons[op] || '✏️';
  return [
    `**📄 Files ${filesTouched.length === 1 ? 'touched' : 'touched'} (${filesTouched.length}):**`,
    '',
    ...filesTouched.map((entry) => {
      const count = lineCounts.get(entry.file);
      const size = count != null ? ` (${thousands(count)} lines)` : '';
      return `- ${icon(entry.op)} ${entry.op} \`${redact(entry.file)}\`${size}`;
    }),
    '',
    ...copySource(filesTouched.map((entry) => entry.file).join('\n'), 'text', 'Copy these paths'),
  ];
}

// --- one turn ---

// Walks `turn.body` in recorded order and interleaves prose runs, reasoning, tool calls, and
// edit markers exactly as they streamed - never bucketed by type. `flush()`/`flushThoughts()`
// close out the current run before a different node type starts.
export function renderTurnBody (turn: Turn, byCall: Map<string, Resource[]>, lineCounts: Map<string, number>) {
  const lines = [MARK.assistantHeading, ''];
  let run: string[] = [];
  let thoughts: string[] = [];
  // VS Code frames inline edit (textEditGroup) previews with bare ``` fences in
  // the response stream; strip a fence that hugs an edit marker so it does not
  // render as an empty code box around the "Edited <file>" note.
  let stripLeadFence = false;
  const flush = ({ trailingEdit=false,  } = {}) => {
    if (!run.length) {
      return;
    }
    let markdown = redact(run.join(''));
    if (stripLeadFence)
      markdown = markdown.replace(/^\s*`{3,}[^\n]*\n?/, '');
    if (trailingEdit)
      markdown = markdown.replace(/\n?`{3,}[ \t]*\s*$/, '');
    stripLeadFence = false;
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
    if (markdown) {
      lines.push(...assistantBlock(markdown));
    }
    run = [];
  };

  const flushThoughts = () => {
    const tl = thoughts.length;
    if (!tl)
      return;
    lines.push(
      `<details class="agent-reasoning"><summary>${mutedSummary(`🧠 Agent reasoning (${tl} thought${tl !== 1 ? 's' : ''})`)}</summary>`,
      '',
      '<div style="color:grey;margin-left:2em;margin-top:8px;">',
      '',
      // Joined with <br>, not blank lines: each thought still starts on its own line, but
      // without the full paragraph gap between them piling up for a multi-thought turn.
      thoughts.map((thought) => `💡 ${neutralizeStructuralHtml(redact(thought))}`).join('<br>\n'),
      '',
      '</div>',
      '',
      '</details>',
      '',
    );
    thoughts = [];
  };

  for (const node of turn.body) {
    if (node.type === 'think') {
      flush();
      thoughts.push(node.text);
    } else if (node.type === 'text') {
      flushThoughts();
      run.push(node.text);
    } else if (node.type === 'ref' && node.text) {
      flushThoughts();
      run.push(`\`${node.text}\``);
    } else if (node.type === 'tool') {
      flush();
      flushThoughts();
      stripLeadFence = false;
      lines.push(...renderToolNode(node, byCall), '');
    } else if (node.type === 'edit' && node.uri) {
      flush({ trailingEdit: node.inline });
      flushThoughts();
      const verbs: Record<string, string> = { created: 'Created', deleted: 'Deleted', renamed: 'Renamed' };
      const verb = verbs[node.op] || 'Edited';
      lines.push(`> 📄 ${verb} \`${esc(workspacePath(node.uri.replace(/^\//, '')))}\``, '');
      // Only an inline edit preview is wrapped in stray fences by the response stream.
      stripLeadFence = Boolean(node.inline);
    }
  }
  flush();
  flushThoughts();
  if (!turn.body.some((node: TurnNode) => node.type === 'text' || node.type === 'ref'))
    lines.push('_No assistant text was recorded for this turn._', '');
  lines.push(...renderFilesTouched(turn.filesTouched, lineCounts));
  lines.push(...renderTodos(turn.todos));
  turn.todos.length && lines.push('');
  return lines;
}

export function turnCost (scalar: TurnScalars) {
  const total = (scalar.promptTokens ?? 0) + (scalar.completionTokens ?? 0);
  const parts = [
    `⏱️ ${humanDuration(scalar.elapsedMs)}`,
    `🔢 ${thousands(scalar.promptTokens ?? 0)} prompt + ${thousands(scalar.completionTokens ?? 0)} completion (=${thousands(total)})`,
    scalar.copilotCredits != null ? `💳 ${fmtCredits(scalar.copilotCredits)} credits` : null,
    `🤖 ${esc(modelName(scalar.modelId))}`,
  ].filter(Boolean);
  return `<sub>${parts.join(' · ')}</sub>`;
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
    ['Mode', esc(scalar.modeInfo?.modeId || scalar.modeInfo?.kind || 'unknown')],
    ['Agent', esc(agent || 'unknown')],
    ['Response ID', esc(scalar.responseId || 'n/a')],
    ['Prompt tokens', thousands(scalar.promptTokens ?? 0)],
    ['Completion tokens', thousands(scalar.completionTokens ?? 0)],
    promptBreakdown
      ? ['Prompt details', promptBreakdown]
      : ['Cache read / write', legacyCache ? `${thousands(legacyCache.cacheReadTokens ?? 0)} / ${thousands(legacyCache.cacheWriteTokens ?? 0)}` : '0 / 0'],
    ['Credits', scalar.copilotCredits != null ? fmtCredits(scalar.copilotCredits) : 'n/a'],
    ['Elapsed', humanDuration(scalar.elapsedMs)],
    ['Sources (refs)', String(refs)],
    ['Code citations', String(citations)],
    ['Followups', String(followups)],
    ['Requested', isoTimestamp(scalar.timestamp ?? turn.ts)],
    ['Responded', isoTimestamp(scalar.responseTimestamp)],
    ['Canceled', scalar.isCanceled ? 'yes' : 'no'],
  ];
  return [`<details><summary>${mutedSummary('ℹ️ Turn info')}</summary>`, '', ...indentBlock(['| Field | Value |', '|---|---|', ...rows.map(([key, value]) => `| ${key} | ${value} |`)]), '', '</details>'];
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
  location: SessionLocation;
  resources: { resources: Resource[]; byCall: Map<string, Resource[]>; resourceRoot: string };
  versions: { copilotVersion: string; vscodeVersion: string };
  memory: { session: MemoryFile[]; repo: MemoryFile[]; user: MemoryFile[] };
  lineCounts: Map<string, number>;
  outputPath: string;
  gitStatus: string;
  generatedAt: string;
}

export function buildDocument (session: ParsedSession, context: DocumentContext) {
  const { location, resources, versions, memory, lineCounts, outputPath, gitStatus, generatedAt } = context;
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

  const byModel = new Map();
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

  const title = session.customTitle || clip(turns[0]?.prompt, 70) || `session ${location.sessionId}`;
  const lines = [
    '<a id="top"></a>',
    '',
    `# Copilot Chat Export: ${redact(title)}`,
    '',
    '> Full visible conversation archive sourced from the native VS Code chat journal: prompts, agent reasoning, tool calls, code blocks, token cost, and timing.',
    '',
    '## Session Metadata',
    '',
    `- **Session ID:** \`${location.sessionId}\``,
    `- **Title:** ${redact(session.customTitle || '(untitled)')}`,
    `- **Session started:** ${isoTimestamp(firstTs)}`,
    `- **Export covers through:** ${isoTimestamp(lastTs)}`,
    `- **Export generated:** ${isoTimestamp(generatedAt)}`,
    `- **Copilot version:** \`${versions.copilotVersion}\``,
    `- **VS Code version:** \`${versions.vscodeVersion}\``,
    `- **Responder:** ${redact(session.responderUsername || 'GitHub Copilot')}`,
    `- **User requests:** ${turns.length}`,
    `- **Assistant reasoning turns:** ${reasoningTurns} (${totalThoughts} recovered thought(s))`,
    `- **Tool calls:** ${toolNodes.length}`,
    `- **Persisted result resources:** ${resources.resources.length}`,
    `- **Models used:** ${modelsUsed.map((model) => `\`${modelName(model)}\``).join(', ') || 'unknown'}`,
    `- **Total cost:** ⏱️ ${humanDuration(totalElapsed)} · 🔢 ${thousands(totalCompletion)} completion tokens · 💳 ${fmtCredits(totalCredits)} credits · 🤖 ${modelsUsed.length} model(s)`,
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
    '| Model | Turns | Prompt tokens | Completion tokens | Credits | Elapsed |',
    '|---|---:|---:|---:|---:|---:|',
    ...[...byModel.entries()].map(([model, entry]) => `| \`${modelName(model)}\` | ${entry.turns} | ${thousands(entry.prompt)} | ${thousands(entry.completion)} | ${fmtCredits(entry.credits)} | ${humanDuration(entry.elapsed)} |`),
    `| **Total** | ${turns.length} | ${thousands(totalPrompt)} | ${thousands(totalCompletion)} | ${fmtCredits(totalCredits)} | ${humanDuration(totalElapsed)} |`,
    '',
    '> Prompt-token counts are per-request context sizes (they include prior conversation and cached tokens), so they are not additive across turns; completion tokens and credits are the per-turn incremental cost.',
    '',
    backToContents(),
    '',
    '<a id="executive-summary"></a>',
    '',
    '## Executive Summary',
    '',
    `This archive captures "${redact(title)}" - ${turns.length} user request(s) recorded from ${isoTimestamp(firstTs)} through ${isoTimestamp(lastTs)}.`,
    '',
    `The agent produced ${toolNodes.length} tool call(s) and ${totalThoughts} recovered reasoning note(s) across ${reasoningTurns} turn(s), using ${modelsUsed.length} model(s) (${modelsUsed.map((model) => `\`${modelName(model)}\``).join(', ') || 'unknown'}). Total recorded output: ${thousands(totalCompletion)} completion tokens, ${fmtCredits(totalCredits)} credits, ${humanDuration(totalElapsed)} of processing.`,
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
    ...(session.editedFiles.length ? session.editedFiles.map((file) => `- \`${redact(file)}\``) : ['_No file edits were recorded in the journal._']),
    '',
    ...(session.editedFiles.length ? copySource(session.editedFiles.join('\n'), 'text', 'Copy all edited paths') : []),
    '### Chat Export Artifact',
    '',
    `- \`${workspacePath(outputPath)}\``,
    '',
    '### Current Worktree Snapshot',
    '',
    '```text',
    redact(gitStatus),
    '```',
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
      blockquote(turn.prompt),
      '',
      '</div>',
      '',
    );
    lines.push(...renderTurnBody(turn, resources.byCall, lineCounts), '');
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
    `- Source journal (definitive): \`${workspacePath(location.sessionPath)}\``,
    `- Resource root: \`${workspacePath(resources.resourceRoot)}\``,
    '- Single source: the conversation, reasoning, tool calls, and code blocks come from the native `chatSessions` journal; only raw tool-output bodies come from `chat-session-resources`.',
    '- Redaction masks common authorization, token, API-key, password, and client-secret assignment forms.',
    '- Rendering: colored badges use inline HTML and render in the VS Code Markdown preview; GitHub strips inline styles and shows the text without color.',
    '- Reasoning shown is the journal\'s recorded `thinking` text (the agent\'s own notes); no hidden model chain-of-thought is reconstructed.',
    `- Parse validated against: ${VALIDATED_AGAINST}.`,
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

