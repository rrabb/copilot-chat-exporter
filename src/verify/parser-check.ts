// Independent structural check: parse the export with a CommonMark/GFM parser and confirm the
// structure the exporter writes is still structure (never swallowed by a code block or an HTML
// block opened by model text). markdown-it is a dev/verify-only dependency loaded on demand, so
// the runtime bundle never needs it; a missing parser fails strict verification.
import { MARK } from '../text.ts';

interface ParsedToken {
  type: string;
  tag: string;
  map: [number, number] | null;
  content: string;
  info: string;
  children: ParsedToken[] | null;
}

export interface MarkdownParser {
  parse (src: string, env: object): ParsedToken[];
}

export interface ParserCheckResult {
  skipped: string | null;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  failed: boolean;
  counts: { turnAnchors: number; requestHeadings: number; assistantHeadings: number; sectionHeadings: number; unknownBlocks: number; linkedUnknownBlocks: number };
  ms: number;
}

type Importer = () => Promise<{ default: new (options: object) => MarkdownParser }>;

export async function loadMarkdownParser (importer: Importer = () => import('markdown-it')): Promise<MarkdownParser | null> {
  try {
    const module = await importer();
    return new module.default({ html: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('markdown-it'))
      return null;
    throw error;
  }
}

const UNKNOWN_SUMMARY = 'Unreviewed response kind:';
const ASSISTANT_TEXT = MARK.assistantHeading.replace(/^#+\s*/, '');
const ANCHOR_RE = /^<a id="([^"]+)"><\/a>$/;
const TOC_LINK_RE = /\]\(#([a-z0-9-]+)\)/g;

export function buildParserCheck (markdown: string, parser: MarkdownParser | null, expected: { turns: number; strict?: boolean }): ParserCheckResult {
  const counts = { turnAnchors: 0, requestHeadings: 0, assistantHeadings: 0, sectionHeadings: 0, unknownBlocks: 0, linkedUnknownBlocks: 0 };
  if (!parser)
    return { skipped: 'markdown-it unavailable', checks: expected.strict ? [{ name: 'parser available', ok: false, detail: 'Install the pinned dev dependencies to run strict verification.' }] : [], failed: expected.strict === true, counts, ms: 0 };
  const started = performance.now();
  const tokens = parser.parse(markdown, {});
  const checks: ParserCheckResult['checks'] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  // An anchor counts only as a paragraph whose whole inline content is the anchor tag: inside a
  // fence, code block, or HTML block it is text, not a link target.
  const anchors: Array<{ id: string; index: number }> = [];
  tokens.forEach((token, index) => {
    if (token.type !== 'inline' || tokens[index - 1]?.type !== 'paragraph_open')
      return;
    const match = ANCHOR_RE.exec(token.content.trim());
    match && anchors.push({ id: match[1], index });
  });
  const headingAfter = (index: number) => {
    // paragraph_open, inline, paragraph_close, then the next block.
    const open = tokens[index + 2];
    return open?.type === 'heading_open' ? { tag: open.tag, text: tokens[index + 3]?.content ?? '' } : null;
  };

  const turnNums = anchors.filter((anchor) => anchor.id.startsWith(MARK.userMessageAnchorId)).map((anchor) => Number(anchor.id.slice(MARK.userMessageAnchorId.length)));
  counts.turnAnchors = turnNums.length;
  const turnsOk = turnNums.length === expected.turns && turnNums.every((num, i) => num === i + 1);
  add('turn anchors outside code', turnsOk, `anchors=${turnNums.length}, turns=${expected.turns}`);

  counts.requestHeadings = tokens.filter((token) => token.type === 'html_block' && token.content.startsWith(MARK.requestHeadingPrefix)).length;
  add('request headings outside code', counts.requestHeadings === expected.turns, `headings=${counts.requestHeadings}, turns=${expected.turns}`);

  counts.assistantHeadings = tokens.filter((token, index) => token.type === 'heading_open' && token.tag === 'h4' && tokens[index + 1]?.content === ASSISTANT_TEXT).length;
  add('assistant headings parse as headings', counts.assistantHeadings === expected.turns, `headings=${counts.assistantHeadings}, turns=${expected.turns}`);

  // The Contents list sits before any model text, so its links name every section the exporter wrote.
  const contents = anchors.find((anchor) => anchor.id === 'contents');
  const tocIds: string[] = [];
  if (contents) {
    for (let i = contents.index + 1; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.type === 'paragraph_open' && ANCHOR_RE.test(tokens[i + 1]?.content.trim() ?? ''))
        break;
      token.type === 'inline' && tocIds.push(...[...token.content.matchAll(TOC_LINK_RE)].map((match) => match[1]));
    }
  }
  const sectionProblems: string[] = [];
  const top = anchors.find((anchor) => anchor.id === 'top');
  top && headingAfter(top.index)?.tag === 'h1' || sectionProblems.push('top');
  contents && headingAfter(contents.index)?.tag === 'h2' || sectionProblems.push('contents');
  for (const id of tocIds) {
    const anchor = anchors.find((entry) => entry.id === id);
    anchor && headingAfter(anchor.index)?.tag === 'h2' ? (counts.sectionHeadings += 1) : sectionProblems.push(id);
  }
  add('section headings parse as headings', tocIds.length > 0 && sectionProblems.length === 0, sectionProblems.length ? `missing=${sectionProblems.join(',')}` : `sections=${counts.sectionHeadings}`);

  // Each unreviewed block must hold its JSON as exactly one fenced block, or JSON.parse on the
  // rendered text would not see the payload the exporter wrote.
  const unknownProblems: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type !== 'html_block' || !token.content.startsWith('<details><summary>') || !token.content.includes(UNKNOWN_SUMMARY))
      continue;
    if (token.content.includes('full text linked')) {
      counts.linkedUnknownBlocks += 1;
      continue;
    }
    counts.unknownBlocks += 1;
    let depth = 1;
    let fences = 0;
    let json = 0;
    let j = i + 1;
    for (; j < tokens.length && depth > 0; j += 1) {
      const inner = tokens[j];
      if (inner.type === 'html_block') {
        depth += (inner.content.match(/<details\b/g) || []).length - (inner.content.match(/<\/details>/g) || []).length;
      } else if (inner.type === 'fence' || inner.type === 'code_block') {
        fences += 1;
        inner.type === 'fence' && inner.info.trim() === 'json' && (json += 1);
      }
    }
    (fences !== 1 || json !== 1) && unknownProblems.push(`#${counts.unknownBlocks} line ${(token.map?.[0] ?? 0) + 1}: code blocks=${fences}, json=${json}`);
    i = j - 1;
  }
  add('unknown blocks hold exactly one json code block', unknownProblems.length === 0, unknownProblems.length ? unknownProblems.slice(0, 5).join('; ') : `blocks=${counts.unknownBlocks}, linked=${counts.linkedUnknownBlocks}`);

  return { skipped: null, checks, failed: checks.some((check) => !check.ok), counts, ms: Math.round(performance.now() - started) };
}

export function formatParserCheck (result: ParserCheckResult, target: string): string[] {
  if (result.skipped)
    return [`Parser check - ${result.failed ? 'FAIL' : 'skipped'}: ${result.skipped}. Install dev dependencies (npm install) to enable it.`];
  return [
    `Parser check (markdown-it, ${target}, ${result.ms} ms)`,
    ...result.checks.map((check) => `- ${check.ok ? 'OK  ' : 'FAIL'} ${check.name}: ${check.detail}`),
  ];
}

/** Names, pass/fail, counts and timing only; `detail` can name line numbers and section ids, both exporter-owned. */
export function parserCheckJson (result: ParserCheckResult) {
  return {
    skipped: result.skipped,
    checks: result.checks.map(({ name, ok, detail }) => ({ name, ok, detail })),
    failed: result.failed,
    counts: result.counts,
    ms: result.ms,
  };
}
