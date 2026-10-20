// Three independent ways of asking "did the parse and the export keep everything?".
//
//   Layer A  buildJournalCrossCheck  - walks the raw journal text and re-derives tool-call
//            identity WITHOUT the parser, so a bug in the shared parsing helpers cannot hide
//            behind an identical derivation.
//   Layer B  buildVerificationReport - re-summarises each request and compares it to the parsed
//            turn. This one deliberately mirrors the parser's merge rule rather than calling it.
//   Layer C  buildRenderReport       - reads the finished Markdown back and checks it reflects
//            the turns: anchors, headings, tool badges, balanced collapsibles, and a JSON
//            round-trip of every unreviewed-response block.
//
// The duplication in Layers A and B is on purpose. A check that reuses the code it is checking
// agrees with it by construction. If you unify them to remove the repetition, you still have
// three reports but only one opinion.
//
// Everything here returns data. Printing lives in cli.ts.

import type { ParsedSession, ToolNode, Turn, TurnNode } from '../types.ts';
import { classifyNode, thinkingText } from '../session/classify.ts';
import { flattenItems, messageText, requestValues } from '../session/journal.ts';
import { MARK, clip, fenceCloses, fenceOpener, reEscape, redact, sectionAnchor } from '../text.ts';

// The comparable shape of one turn. Layer A derives it twice - once by replaying the journal,
// once from the parsed turns - and every mismatch it reports is a field of this.
interface TurnSummary {
  requestId: string;
  prompt: string;
  responseTexts: string[];
  thoughtCount: number;
  thoughtSeq: string[];
  toolCallCount: number;
  toolIdSeq: string[];
  terminalCommands: number;
  terminalOutputLines: number;
  terminalOutputBytes: number;
}

function firstTextMatch (left: string[], right: string[]) {
  if (!left.length && !right.length)
    return true;
  if (!left.length || !right.length)
    return false;
  return left[0] === right[0];
}

function summarizeRequestForVerify (request: any): TurnSummary {
  const prompt = messageText(request?.message).trim();
  const thoughts: string[] = [];
  const collapsePrefixes = (texts: string[]) => texts.filter((text, i) => !texts.some((other, j) => j !== i && other.length > text.length && other.startsWith(text)));
  const collectThinking = (node: any) => {
    if (!node || typeof node !== 'object')
      return;
    if (node.kind === 'thinking') {
      const text = thinkingText(node.value).trim();
      if (text && !thoughts.includes(text))
        thoughts.push(text);
    }
    for (const key of Object.keys(node))
      collectThinking(node[key]);
  };

  const mergeToolNode = (target: any, next: any) => {
    next.pastTense && (target.pastTense = next.pastTense);
    next.title && (target.title = next.title);
    next.invocation && (target.invocation = next.invocation);
    next.command && (target.command = next.command);
    next.promptText && (target.promptText = next.promptText);
    next.inputText && (target.inputText = next.inputText);
    next.inputLanguage && (target.inputLanguage = next.inputLanguage);
    next.resultDetails != null && (target.resultDetails = next.resultDetails);
    next.output && (target.output = next.output);
    next.resultText && (target.resultText = next.resultText);
    next.fileUri && !target.fileUri && (target.fileUri = next.fileUri);
    next.toolSpecificData && (target.toolSpecificData = next.toolSpecificData);
    Array.isArray(next.todos) && next.todos.length && (target.todos = next.todos);
    next.exitCode != null && (target.exitCode = next.exitCode);
    next.duration != null && (target.duration = next.duration);
    target.isComplete = target.isComplete || next.isComplete;
  };

  const nodes = [];
  const toolNodesById = new Map();
  for (const item of requestValues(request?.response))
    for (const leaf of flattenItems(item)) {
      collectThinking(leaf);
      const node = classifyNode(leaf);
      if (!node)
        continue;
      if (node.type === 'tool' && node.toolCallId) {
        const existing = toolNodesById.get(node.toolCallId);
        // Mirrors the real parser's merge rule (see parseChatSession): only fold into an
        // existing entry while it is still incomplete, since the same toolCallId can be
        // reused for a genuinely new invocation once the prior one already completed.
        if (existing && !existing.isComplete) {
          mergeToolNode(existing, node);
          continue;
        }
        toolNodesById.set(node.toolCallId, node);
      }
      nodes.push(node);
    }

  const toolNodes = nodes.filter((node) => node.type === 'tool');
  const responseTexts = nodes
    .filter((node) => node.type === 'text')
    .map((node) => node.text.trim())
    .filter(Boolean);
  let terminalOutputLines = 0;
  let terminalOutputBytes = 0;
  let terminalCommands = 0;
  for (const tool of toolNodes) {
    if (tool.command)
      terminalCommands += 1;
    if (!tool.output)
      continue;
    terminalOutputLines += tool.output.split('\n').length;
    terminalOutputBytes += Buffer.byteLength(tool.output, 'utf8');
  }
  return {
    requestId: request?.requestId || '',
    prompt,
    responseTexts,
    thoughtCount: collapsePrefixes(thoughts).length,
    thoughtSeq: collapsePrefixes(thoughts),
    toolCallCount: toolNodes.length,
    toolIdSeq: toolNodes.map((node: any) => node.toolCallId).filter(Boolean),
    terminalCommands,
    terminalOutputLines,
    terminalOutputBytes,
  };
}

function summarizeTurnForVerify (turn: Turn): TurnSummary {
  const responseTexts = turn.body
    .filter((node: TurnNode) => node.type === 'text')
    .map((node: any) => node.text.trim())
    .filter(Boolean);
  let terminalOutputLines = 0;
  let terminalOutputBytes = 0;
  let terminalCommands = 0;
  for (const tool of turn.toolNodes) {
    if (tool.command)
      terminalCommands += 1;
    if (!tool.output)
      continue;
    terminalOutputLines += tool.output.split('\n').length;
    terminalOutputBytes += Buffer.byteLength(tool.output, 'utf8');
  }
  return {
    requestId: turn.requestId,
    prompt: turn.prompt.trim(),
    responseTexts,
    thoughtCount: turn.reasoning.length,
    thoughtSeq: turn.reasoning,
    toolCallCount: turn.toolNodes.length,
    toolIdSeq: turn.toolNodes.map((node) => node.toolCallId).filter(Boolean),
    terminalCommands,
    terminalOutputLines,
    terminalOutputBytes,
  };
}

export function buildVerificationReport (session: ParsedSession, rawRequests: any[]) {
  const requests = rawRequests.filter((request: any) => messageText(request?.message).trim());
  const rawSummaries = requests.map((request: any) => summarizeRequestForVerify(request));
  const rawById = new Map<string, TurnSummary>(rawSummaries.map((summary: TurnSummary) => [summary.requestId || '', summary]));
  const turnSummaries = session.turns.map((turn: Turn) => summarizeTurnForVerify(turn));
  const mismatches: Array<{ requestId: string; kind: string; detail: string }> = [];
  let missingTurns = 0;
  let extraTurns = 0;
  let promptMismatches = 0;
  let responseMismatches = 0;
  let thoughtMismatches = 0;
  let toolMismatches = 0;
  let terminalMismatches = 0;
  let orderMismatches = 0;
  let thoughtOrderMismatches = 0;

  for (const turn of turnSummaries) {
    const raw = rawById.get(turn.requestId);
    if (!raw) {
      extraTurns += 1;
      mismatches.push({
        requestId: turn.requestId,
        kind: 'extra-turn',
        detail: 'turn exists in parsed export but requestId was not found in replayed journal requests',
      });
      continue;
    }
    const localDiffs = [];
    if (raw.prompt !== turn.prompt) {
      promptMismatches += 1;
      localDiffs.push(`prompt differs (raw='${clip(raw.prompt, 90)}' parsed='${clip(turn.prompt, 90)}')`);
    }
    if (!firstTextMatch(raw.responseTexts, turn.responseTexts)) {
      responseMismatches += 1;
      localDiffs.push(`first response text differs (raw='${clip(raw.responseTexts[0] || '', 90)}' parsed='${clip(turn.responseTexts[0] || '', 90)}')`);
    }
    if (raw.thoughtCount !== turn.thoughtCount) {
      thoughtMismatches += 1;
      localDiffs.push(`thought count differs (raw=${raw.thoughtCount}, parsed=${turn.thoughtCount})`);
    }
    if (raw.toolCallCount !== turn.toolCallCount) {
      toolMismatches += 1;
      localDiffs.push(`tool call count differs (raw=${raw.toolCallCount}, parsed=${turn.toolCallCount})`);
    } else if (JSON.stringify(raw.toolIdSeq) !== JSON.stringify(turn.toolIdSeq)) {
      // Counts match but the sequence doesn't - tools were reordered/bucketed rather than
      // kept interleaved in recorded stream order (spec 8.4 anti-criterion).
      orderMismatches += 1;
      localDiffs.push(`tool call order differs (raw=[${raw.toolIdSeq.join(',')}] parsed=[${turn.toolIdSeq.join(',')}])`);
    }
    if (raw.thoughtCount === turn.thoughtCount && JSON.stringify(raw.thoughtSeq) !== JSON.stringify(turn.thoughtSeq)) {
      thoughtOrderMismatches += 1;
      localDiffs.push('thought order differs (same count, different sequence)');
    }
    if (
      raw.terminalCommands !== turn.terminalCommands
      || raw.terminalOutputLines !== turn.terminalOutputLines
    ) {
      terminalMismatches += 1;
      localDiffs.push(`terminal activity differs (raw commands=${raw.terminalCommands}, lines=${raw.terminalOutputLines}; parsed commands=${turn.terminalCommands}, lines=${turn.terminalOutputLines})`);
    }
    if (localDiffs.length) {
      mismatches.push({
        requestId: turn.requestId,
        kind: 'turn-diff',
        detail: localDiffs.join(' | '),
      });
    }
  }

  for (const raw of rawById.values()) {
    if (!turnSummaries.some((turn: TurnSummary) => turn.requestId === raw.requestId)) {
      missingTurns += 1;
      mismatches.push({
        requestId: raw.requestId,
        kind: 'missing-turn',
        detail: `request in journal did not produce a parsed turn (prompt='${clip(raw.prompt, 90)}')`,
      });
    }
  }

  const compactTurns = requests.filter((request) => messageText(request?.message).trim() === '/compact');
  const compactChecks = compactTurns.map((request) => {
    const requestId = request.requestId || '';
    const raw = rawById.get(requestId);
    const parsed = turnSummaries.find((turn: TurnSummary) => turn.requestId === requestId);
    const hasCompactResponseRaw = raw?.responseTexts.some((text: string) => text === 'Compacted conversation.') ?? false;
    const hasCompactResponseParsed = parsed?.responseTexts.some((text: string) => text === 'Compacted conversation.') ?? false;
    return { requestId, hasCompactResponseRaw, hasCompactResponseParsed };
  });

  // A toolCallId placed under more than one parsed turn is expected, not a defect: VS Code
  // can reuse the same toolCallId when the identical command/tool+args is invoked again in a
  // later turn, and dedup is intentionally scoped per-turn so each turn still renders its own
  // occurrence. Reported for visibility, not auto-failed (confirmed via investigation, spec
  // 9.1 item 4 - the real defect this uncovered was WITHIN-turn reuse, fixed via the
  // isComplete-gated merge in classifyNode's caller above).
  const toolTurnsById = new Map<string, Array<{ turn: number; toolId: string; isComplete: boolean; summary: string }>>();
  for (const turn of session.turns)
    for (const node of turn.toolNodes) {
      if (!node.toolCallId)
        continue;
      const list = toolTurnsById.get(node.toolCallId) ?? [];
      list.push({ turn: turn.number, toolId: node.toolId, isComplete: node.isComplete, summary: clip(node.pastTense || node.invocation || '', 70) });
      toolTurnsById.set(node.toolCallId, list);
    }
  const crossTurnDuplicates = [...toolTurnsById.entries()]
    .filter(([, occurrences]) => new Set(occurrences.map((entry) => entry.turn)).size > 1)
    .map(([toolCallId, occurrences]) => ({ toolCallId, occurrences }));
  return {
    rawRequestCount: requests.length,
    parsedTurnCount: session.turns.length,
    promptMismatches,
    responseMismatches,
    thoughtMismatches,
    toolMismatches,
    terminalMismatches,
    orderMismatches,
    thoughtOrderMismatches,
    missingTurns,
    extraTurns,
    compactChecks,
    crossTurnDuplicates,
    mismatches,
  };
}

// Layer A: re-derive tool-call identity straight from the journal with a generic
// object walk keyed on `kind`, deliberately NOT reusing flattenItems/classifyNode, so a
// silent-drop bug in those shared primitives cannot hide behind an identical derivation.
// A plain walk never descends into string values, so tool ids embedded in quoted prior
// exports or subagent result blobs are excluded for free.
export function buildJournalCrossCheck (session: ParsedSession, rawText: string) {
  const rawToolIds = new Set<string>();
  let rawThinking = 0;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object')
      return;
    if (node.kind === 'toolInvocationSerialized' && typeof node.toolCallId === 'string')
      rawToolIds.add(node.toolCallId);
    if (node.kind === 'thinking')
      rawThinking += 1;
    for (const key of Object.keys(node))
      walk(node[key]);
  };
  for (const line of rawText.split(/\r?\n/)) {
    if (!line)
      continue;
    try {
      walk(JSON.parse(line));
    } catch {
      // Non-JSON lines are already reported by the parser; skip here.
    }
  }
  const parsedToolIds = new Set<string>(session.turns.flatMap((turn: Turn) => turn.toolNodes.map((node: ToolNode) => node.toolCallId).filter(Boolean)));
  const dropped = [...rawToolIds].filter((id) => !parsedToolIds.has(id));
  const invented = [...parsedToolIds].filter((id) => !rawToolIds.has(id));
  return {
    rawToolIds: rawToolIds.size,
    parsedToolIds: parsedToolIds.size,
    rawThinking,
    dropped,
    invented,
    failed: dropped.length > 0 || invented.length > 0,
  };
}

// Fence-aware line filter: drops fenced code blocks so counts of rendered markers are not
// inflated by prior exports embedded inside tool-result/terminal fences (this export is
// often self-referential). Uses the renderer's fence rules (backtick or tilde; close only on
// the same character, at least as long as the opener), because fenceFor emits 4+ backtick
// wrappers around content that itself contains ``` lines.
function stripFencedRegions (text: string) {
  const out = [];
  let marker = '';
  for (const line of text.split('\n')) {
    if (!marker) {
      marker = fenceOpener(line);
      marker || out.push(line);
    } else if (fenceCloses(line, marker)) {
      marker = '';
    }
  }
  return out.join('\n');
}

// The exporter's own structural scaffolding (anchors, headers, tool badges, TOC, details)
// always sits at column 0 and never inside a blockquote. User prompts and pasted content
// are blockquoted (`> ...`), so quoted markers - even `</details>` a user copied from a
// prior verification run - live only on `>` lines. Dropping fenced regions AND blockquote
// lines leaves just the scaffolding, which quoted content cannot forge.
function scaffoldText (markdown: string) {
  return stripFencedRegions(markdown)
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n');
}

const UNKNOWN_SUMMARY = 'Unreviewed response kind:';

// Reads back the JSON block under each scaffold-level "Unreviewed response kind" summary, in
// file order. A block whose summary says "full text linked" is a preview of a companion file,
// so its JSON is incomplete by design and only counted.
function unknownBlocks (markdown: string) {
  const blocks: Array<{ linked: boolean; json: string | null }> = [];
  let marker = '';
  let pending: { linked: boolean } | null = null;
  let capture: string[] | null = null;
  for (const line of markdown.split('\n')) {
    if (marker) {
      if (fenceCloses(line, marker)) {
        marker = '';
        if (capture && pending) {
          blocks.push({ linked: pending.linked, json: capture.join('\n') });
          pending = null;
        }
        capture = null;
      } else {
        capture?.push(line);
      }
      continue;
    }
    marker = fenceOpener(line);
    if (marker) {
      capture = pending ? [] : null;
      continue;
    }
    if (/^\s*>/.test(line))
      continue;
    if (line.startsWith('<details><summary>') && line.includes(UNKNOWN_SUMMARY)) {
      pending && blocks.push({ linked: pending.linked, json: null });
      pending = { linked: line.includes('full text linked') };
    } else if (pending && line.startsWith('</details>')) {
      blocks.push({ linked: pending.linked, json: null });
      pending = null;
    }
  }
  pending && blocks.push({ linked: pending.linked, json: null });
  return blocks;
}

const canonicalJson = (text: string) => JSON.stringify(JSON.parse(text));

// Layer C round-trip: every unknown response must appear once, in order, and its inline JSON
// must parse to the same value as the redacted payload. Catches fence breakage, truncation
// and anything that edits the block between render and write.
function checkUnknownRoundTrip (session: ParsedSession, markdown: string) {
  const nodes = session.turns.flatMap((turn: Turn) => turn.body.filter((node: TurnNode) => node.type === 'unknownResponse'));
  const blocks = unknownBlocks(markdown);
  if (!nodes.length && !blocks.length)
    return { ok: true, detail: 'no unknown responses' };
  const problems: string[] = [];
  let checked = 0;
  let linked = 0;
  blocks.length !== nodes.length && problems.push(`blocks=${blocks.length}, nodes=${nodes.length}`);
  for (let i = 0; i < Math.min(blocks.length, nodes.length); i += 1) {
    const block = blocks[i];
    const node = nodes[i] as Extract<TurnNode, { type: 'unknownResponse' }>;
    if (block.linked) {
      linked += 1;
      continue;
    }
    if (block.json == null) {
      problems.push(`#${i + 1} ${node.kind}: no JSON block`);
      continue;
    }
    try {
      const expected = canonicalJson(redact(node.payload));
      canonicalJson(block.json) === expected ? (checked += 1) : problems.push(`#${i + 1} ${node.kind}: value differs`);
    } catch {
      problems.push(`#${i + 1} ${node.kind}: JSON does not parse`);
    }
  }
  const summary = `${checked} round-tripped, ${linked} linked`;
  return problems.length ? { ok: false, detail: `${summary}; ${problems.slice(0, 4).join('; ')}` } : { ok: true, detail: summary };
}

function sliceTurnSections (text: string) {
  const sections = new Map<number, string>();
  const anchorRe = new RegExp(reEscape(`<a id="${MARK.userMessageAnchorId}`) + '(\\d+)' + reEscape('"></a>'), 'g');
  const positions = [...text.matchAll(anchorRe)].map((match) => ({ num: Number(match[1]), index: match.index }));
  for (let i = 0; i < positions.length; i += 1) {
    const end = i + 1 < positions.length ? positions[i + 1].index : text.length;
    sections.set(positions[i].num, text.slice(positions[i].index, end));
  }
  return sections;
}

// Layer C: read the rendered .md back and confirm the artifact reflects the parsed turns.
// Every check runs against scaffold-only text (no fences, no blockquotes) and anchors to
// line-start generated markup, so a self-referential transcript that quotes these markers
// in prose cannot skew the counts.
export function buildRenderReport (session: ParsedSession, markdown: string) {
  const text = scaffoldText(markdown);
  const turnCount = session.turns.length;
  const toolTotal = session.turns.reduce((sum: number, turn: Turn) => sum + turn.toolNodes.length, 0);
  const countLines = (regex: RegExp) => text.split('\n').filter((line) => regex.test(line)).length;
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  const anchorRe = new RegExp('^' + reEscape(`<a id="${MARK.userMessageAnchorId}`) + '(\\d+)' + reEscape('"></a>') + '$', 'gm');
  const anchorNums = [...text.matchAll(anchorRe)].map((match) => Number(match[1]));
  add('turn anchors == turns', anchorNums.length === turnCount, `anchors=${anchorNums.length}, turns=${turnCount}`);
  const seqOk = anchorNums.length === turnCount && anchorNums.every((num, i) => num === i + 1);
  add('turn anchors sequential 1..N', seqOk, seqOk ? 'ok' : `got [${anchorNums.slice(0, 6).join(',')}...]`);
  const dupes = [...new Set(anchorNums.filter((num, i) => anchorNums.indexOf(num) !== i))];
  add('no duplicate turn anchors', dupes.length === 0, dupes.length ? `dupes=${dupes.join(',')}` : 'ok');

  // TOC lives only in the User Questions section; scope the count so transcript prose that
  // links to a #user-message anchor cannot inflate it.
  const tocSlice = text.slice(
    text.indexOf(sectionAnchor(MARK.sectionUserQuestions)),
    text.indexOf(sectionAnchor(MARK.sectionCostTiming)),
  );
  const tocRe = new RegExp(reEscape(`](#${MARK.userMessageAnchorId}`) + '\\d+' + reEscape(')'), 'g');
  const tocCount = (tocSlice.match(tocRe) || []).length;
  add('TOC entries == turns', tocCount === turnCount, `toc=${tocCount}, turns=${turnCount}`);

  const headerCount = countLines(new RegExp('^' + reEscape(MARK.requestHeadingPrefix) + '\\d+'));
  add('request headers == turns', headerCount === turnCount, `headers=${headerCount}, turns=${turnCount}`);
  const assistantCount = countLines(new RegExp('^' + reEscape(MARK.assistantHeading) + '$'));
  add('assistant sections == turns', assistantCount === turnCount, `sections=${assistantCount}, turns=${turnCount}`);
  // Real tool badges only ever start a line as a plain `- <sub>` item or a `<details><summary>`;
  // prose that quotes the badge markup appears mid-paragraph and is excluded.
  const badgeCount = countLines(new RegExp('^(?:- <sub>|<details><summary><sub>).*' + reEscape(MARK.toolBadgePrefix) + '(?:⏳ )?<code'));
  add('tool badges == tool nodes', badgeCount === toolTotal, `badges=${badgeCount}, nodes=${toolTotal}`);

  let depth = 0;
  let minDepth = 0;
  for (const match of text.matchAll(/<\/?details\b/g)) {
    depth += match[0][1] === '/' ? -1 : 1;
    minDepth = Math.min(minDepth, depth);
  }
  add('<details> balanced (scaffold-only)', depth === 0 && minDepth >= 0, `endDepth=${depth}, minDepth=${minDepth}`);

  const sections = sliceTurnSections(text);
  const compactTurns = session.turns.filter((turn: Turn) => turn.prompt.trim() === '/compact');
  const compactDetail = [];
  let compactOk = true;
  for (const turn of compactTurns) {
    const expected = turn.body.some((node: any) => node.type === 'text' && node.text.trim() === 'Compacted conversation.');
    const present = (sections.get(turn.number) || '').includes('Compacted conversation.');
    const ok = !expected || present;
    compactOk = compactOk && ok;
    compactDetail.push(`Q${turn.number}:${expected ? (present ? 'ok' : 'MISSING') : 'no recorded confirmation'}`);
  }
  add('compact confirmation under its /compact turn', compactOk, compactTurns.length ? compactDetail.join(' ') : 'no /compact turns');

  const unknown = checkUnknownRoundTrip(session, markdown);
  add('unknown-response JSON round-trips', unknown.ok, unknown.detail);

  return {
    checks,
    failed: checks.some((check) => !check.ok),
    counts: { anchors: anchorNums.length, toc: tocCount, headers: headerCount, assistant: assistantCount, badges: badgeCount, detailsBalanced: depth === 0 && minDepth >= 0 },
  };
}
