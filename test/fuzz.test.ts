import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { setWorkspaceRoot } from '../src/host.ts';
import { buildDocument } from '../src/markdown.ts';
import type { FenceRepairs } from '../src/markdown.ts';
import { redact } from '../src/text.ts';
import type { TurnNode } from '../src/types.ts';
import { buildParserCheck, loadMarkdownParser } from '../src/verify/parser-check.ts';
import { testSession, testTool, testTurn } from './helpers.ts';

// Seeded fuzzing with the CommonMark parser as the oracle: hostile payloads in every place the
// exporter writes model or tool content must never close a fence early, hide an exporter
// heading inside code, or break the round trip of an unreviewed JSON block.

const ROOT = path.join(path.sep, 'proj');
setWorkspaceRoot(ROOT);
const parser = await loadMarkdownParser();
const SEED = 0x5eed2026;

function mulberry32 (seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;
const pick = <T>(random: Random, items: readonly T[]) => items[Math.floor(random() * items.length)];
const int = (random: Random, min: number, max: number) => min + Math.floor(random() * (max - min + 1));

// Each generator returns hostile Markdown. The names appear in failure messages; content never does.
const GENERATORS: Record<string, (random: Random) => string> = {
  backtickRun: (random) => '`'.repeat(int(random, 1, 12)),
  backtickFenceOpen: (random) => `${'`'.repeat(int(random, 3, 8))}${pick(random, ['', 'js', 'json', 'md'])}\n`,
  tildeFenceOpen: (random) => `${'~'.repeat(int(random, 3, 8))}${pick(random, ['', 'py', 'json'])}\n`,
  closedFence: (random) => {
    const fence = pick(random, ['```', '~~~', '````']);
    return `${fence}\nconst a = 1;\n${fence}\n`;
  },
  detailsClose: () => '</details>\n',
  detailsOpen: () => '<details><summary>x</summary>\n',
  divOpen: () => '<div>\n',
  tableOpen: () => '<table><tr><td>\n',
  blockquoteFence: (random) => `> ${pick(random, ['```', '~~~'])}\n> quoted code\n`,
  listItemFence: (random) => `- item\n  ${pick(random, ['```', '~~~'])}\n  listed code\n`,
  orderedListFence: () => '1. step\n   ```\n   code\n',
  nestedListInQuoteFence: (random) => `> - item\n>   ${pick(random, ['```', '~~~'])}\n>   nested code\n`,
  quoteInListFence: () => '- item\n  > ```\n  > quoted listed code\n',
  controlChars: () => '\u0001\u0002\u0007\u0008\u000b\u000c\u001b[31m\u007f',
  bom: () => '\ufeff',
  nul: () => 'a\u0000b',
  bidi: () => '\u202eevil\u202c \u2066iso\u2069 \u200f',
  loneSurrogates: () => 'x\ud800y\udfffz',
  heading: () => '\n#### Assistant\n',
  plain: () => 'plain words\n',
};

// Unclosed HTML comments and raw-text tags would hide every later heading if passed through; the
// renderer escapes them in chat text outside code (item 9) and fences them elsewhere.
const COMMENT_GENERATORS: Record<string, (random: Random) => string> = {
  commentOpen: () => '<!-- ',
  rawTextOpen: (random) => `<${pick(random, ['script', 'style', 'textarea', 'SCRIPT'])}>\n`,
};

function payload (random: Random, allowComments: boolean) {
  const pool = allowComments ? { ...GENERATORS, ...COMMENT_GENERATORS } : GENERATORS;
  const names = Object.keys(pool);
  const parts: string[] = [];
  const used: string[] = [];
  for (let index = int(random, 1, 4); index > 0; index--) {
    const name = pick(random, names);
    used.push(name);
    parts.push(pool[name](random));
  }
  return { text: parts.join(''), used };
}

const PLACEMENTS = ['text', 'vuln', 'unknown', 'tool'] as const;
type Placement = typeof PLACEMENTS[number];

function nodeFor (placement: Placement, text: string, index: number): TurnNode {
  if (placement === 'text')
    return { type: 'text', text };
  if (placement === 'vuln')
    return { type: 'text', text, vulnerabilities: [{ title: `t${index}`, description: text }] };
  if (placement === 'unknown')
    return { type: 'unknownResponse', kind: 'fuzzKind', payload: JSON.stringify({ kind: 'fuzzKind', content: { value: text } }) };
  return testTool({ toolCallId: `c${index}`, output: text, resultText: text, isComplete: true });
}

function documentContext (fenceRepairs: FenceRepairs): Parameters<typeof buildDocument>[1] {
  return {
    location: { sessionId: 'a0a0a0a0-1111-4111-8111-111111111111', sessionPath: path.join(ROOT, 'session.jsonl'), hashRoot: ROOT },
    resources: { resources: [], byCall: new Map(), resourceRoot: ROOT },
    versions: { copilotVersion: 'unknown', vscodeVersion: 'unknown' },
    memory: { session: [], repo: [], user: [] },
    outputPath: path.join(ROOT, 'export.md'),
    gitStatus: '',
    generatedAt: '2026-01-01T00:00:00.000Z',
    fenceRepairs,
  };
}

/** The JSON fence content of every unreviewed block, in document order. */
function unknownJsonBlocks (markdown: string) {
  const tokens = parser!.parse(markdown, {});
  const blocks: string[] = [];
  let inUnknown = false;
  for (const token of tokens) {
    if (token.type === 'html_block' && token.content.includes('Unreviewed response kind:'))
      inUnknown = true;
    else if (inUnknown && token.type === 'fence' && token.info.trim() === 'json') {
      blocks.push(token.content);
      inUnknown = false;
    }
  }
  return blocks;
}

interface FuzzCase { name: string; body: TurnNode[]; unknownPayloads: string[] }

/** Renders one case and checks it against the parser oracle; returns failure reasons, never content. */
function checkCase (fuzzCase: FuzzCase) {
  const fenceRepairs: FenceRepairs = { early: [], turnEnd: 0, html: [] };
  const markdown = buildDocument(testSession({ turns: [testTurn({ body: fuzzCase.body })] }), documentContext(fenceRepairs));
  const problems: string[] = [];
  const result = buildParserCheck(markdown, parser!, { turns: 1 });
  for (const check of result.checks.filter((item) => !item.ok))
    problems.push(`parser: ${check.name}`);
  const added = fenceRepairs.early.filter((item) => item.kind !== 'tool');
  added.length && problems.push(`early close by ${added.map((item) => item.kind).join(',')}`);
  const blocks = unknownJsonBlocks(markdown);
  if (blocks.length !== fuzzCase.unknownPayloads.length)
    problems.push(`unknown blocks ${blocks.length}/${fuzzCase.unknownPayloads.length}`);
  else {
    blocks.forEach((block, index) => {
      try {
        assert.deepEqual(JSON.parse(block), JSON.parse(redact(fuzzCase.unknownPayloads[index])));
      } catch {
        problems.push(`unknown block ${index} does not round-trip`);
      }
    });
  }
  return { problems, early: fenceRepairs.early };
}

function generateCases (count: number) {
  const random = mulberry32(SEED);
  const cases: FuzzCase[] = [];
  for (let index = 0; index < count; index++) {
    const placement = pick(random, PLACEMENTS);
    const generated = payload(random, true);
    const node = nodeFor(placement, generated.text, index);
    const insideFence = random() < 0.5;
    const fence = pick(random, ['```', '~~~', '````']);
    const body: TurnNode[] = insideFence
      ? [{ type: 'text', text: `before\n${fence}js\nconst a = {` }, node, { type: 'text', text: `};\n${fence}\nafter\n` }]
      : [{ type: 'text', text: 'before\n' }, node, { type: 'text', text: 'after\n' }];
    cases.push({
      name: `#${index} ${placement}${insideFence ? ' in fence' : ''} [${generated.used.join('+')}]`,
      body,
      unknownPayloads: node.type === 'unknownResponse' ? [node.payload] : [],
    });
  }
  return cases;
}

test('fuzz: hostile payloads never break exporter structure', { skip: !parser && 'markdown-it is not installed' }, () => {
  const failures = generateCases(300)
    .map((fuzzCase) => ({ name: fuzzCase.name, problems: checkCase(fuzzCase).problems }))
    .filter((item) => item.problems.length);
  assert.deepEqual(failures, []);
});

const containerCases: Array<[string, string]> = [
  ['a bullet list item', '- item\n  ```\n  code\n'],
  ['an ordered list item followed by prose', '1. step\n   ```\n   code\nafter\n'],
  ['a list item nested in a blockquote', '> - item\n>   ```\n>   code\n'],
  ['a tilde fence in a list item nested in a blockquote', '> - item\n>   ~~~\n>   code\n'],
  ['a blockquote nested in a list item', '- item\n  > ```\n  > code\n'],
];
for (const [label, text] of containerCases) {
  test(`regression: an unclosed fence inside ${label} keeps exporter headings outside code`, { skip: !parser && 'markdown-it is not installed' }, () => {
    const result = checkCase({ name: label, body: [{ type: 'text', text }], unknownPayloads: [] });
    assert.deepEqual(result.problems, []);
  });
}

test('regression: an unclosed fence inside a blockquote ends with the blockquote', { skip: !parser && 'markdown-it is not installed' }, () => {
  const result = checkCase({ name: 'blockquote', body: [{ type: 'text', text: '> ```\n> code\n' }], unknownPayloads: [] });
  assert.deepEqual(result.problems, []);
});

for (const [label, text, opener] of [
  ['an unclosed HTML comment at line start', 'Before\n<!-- never closed\n', '<!-- never'],
  ['an unclosed HTML comment mid-line', 'Before <!-- never closed\n', '<!-- never'],
  ['an unclosed script tag', 'Before\n<script>\nlet x;\n', '<script>'],
  ['an unclosed comment after a closed one', 'A <!-- ok --> then\n<!-- open\n', '<!-- open'],
] as Array<[string, string, string]>) {
  test(`regression: assistant text with ${label} keeps exporter headings visible`, { skip: !parser && 'markdown-it is not installed' }, () => {
    const result = checkCase({ name: label, body: [{ type: 'text', text }, { type: 'text', text: 'more\n' }], unknownPayloads: [] });
    assert.deepEqual(result.problems, []);
    const fenceRepairs: FenceRepairs = { early: [], turnEnd: 0, html: [] };
    const markdown = buildDocument(testSession({ turns: [testTurn({ body: [{ type: 'text', text }] })] }), documentContext(fenceRepairs));
    assert.ok(!markdown.includes(opener), 'the raw opener reached the export');
    assert.equal(fenceRepairs.html.length, 1);
  });
}

test('fuzz: a tool record inside an open fence is recorded as an early close, never silent', { skip: !parser && 'markdown-it is not installed' }, () => {
  const result = checkCase({
    name: 'tool in fence',
    body: [{ type: 'text', text: '```js\nconst a = {' }, testTool({ output: '```\n# not a heading', isComplete: true }), { type: 'text', text: '};\n```\n' }],
    unknownPayloads: [],
  });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.early.map((item) => item.kind), ['tool']);
});

test('fuzz: a multi-megabyte single-line unknown payload inside a fence round-trips', { skip: !parser && 'markdown-it is not installed' }, () => {
  const line = 'A'.repeat(2 * 1024 * 1024) + '```' + '~'.repeat(5);
  const payloadJson = JSON.stringify({ kind: 'fuzzKind', content: { value: line } });
  const result = checkCase({
    name: 'multi-MB unknown',
    body: [{ type: 'text', text: '~~~js\nconst a = {' }, { type: 'unknownResponse', kind: 'fuzzKind', payload: payloadJson }, { type: 'text', text: '};\n~~~\n' }],
    unknownPayloads: [payloadJson],
  });
  assert.deepEqual(result.problems, []);
});

test('fuzz: a multi-megabyte single line of model text keeps the headings outside code', { skip: !parser && 'markdown-it is not installed' }, () => {
  const result = checkCase({
    name: 'multi-MB text',
    body: [{ type: 'text', text: '```\n' + 'B'.repeat(2 * 1024 * 1024) }],
    unknownPayloads: [],
  });
  assert.deepEqual(result.problems, []);
});
