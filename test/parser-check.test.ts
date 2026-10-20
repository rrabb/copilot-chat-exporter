import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildParserCheck, loadMarkdownParser } from '../src/verify/parser-check.ts';
import { MARK } from '../src/text.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = fs.readFileSync(path.join(HERE, 'fixtures', 'golden', 'golden-session.expected.md'), 'utf8');
const parser = await loadMarkdownParser();

const failedNames = (result: ReturnType<typeof buildParserCheck>) => result.checks.filter((check) => !check.ok).map((check) => check.name);

// Mirrors toolTextBlock's layout for an unknown response: details, blank, div, blank, fence, blank, /div.
function unknownBlock (body: string[], summary = 'Unreviewed response kind: madeUpKind') {
  return [
    `<details><summary><sub>⚠️ ${summary}</sub></summary>`,
    '',
    '<div style="margin-left:1em">',
    '',
    ...body,
    '',
    '</div>',
    '',
    '</details>',
    '',
    '',
  ].join('\n');
}

// Inserts text just before the first request heading's anchor, i.e. inside turn 1's area.
function insertBeforeTurn (markdown: string, turn: number, text: string) {
  const anchor = `<a id="${MARK.userMessageAnchorId}${turn}"></a>`;
  const index = markdown.indexOf(anchor);
  assert.ok(index > 0);
  return markdown.slice(0, index) + text + markdown.slice(index);
}

test('loads markdown-it from the dev dependency', () => {
  assert.ok(parser);
});

test('golden export passes every parser check', () => {
  const result = buildParserCheck(GOLDEN, parser, { turns: 10 });
  assert.equal(result.skipped, null);
  assert.deepEqual(failedNames(result), []);
  assert.equal(result.failed, false);
  assert.equal(result.counts.assistantHeadings, 10);
  assert.equal(result.counts.requestHeadings, 10);
  assert.equal(result.counts.turnAnchors, 10);
});

test('an unclosed fence before a turn swallows later exporter structure', () => {
  // Six backticks: no later fence in the golden export is long enough to close it.
  const broken = insertBeforeTurn(GOLDEN, 3, '``````text\nunclosed\n\n');
  const result = buildParserCheck(broken, parser, { turns: 10 });
  assert.equal(result.failed, true);
  const names = failedNames(result);
  assert.ok(names.includes('turn anchors outside code'));
  assert.ok(names.includes('request headings outside code'));
  assert.ok(names.includes('assistant headings parse as headings'));
  assert.ok(names.includes('section headings parse as headings'));
});

test('a short unclosed fence that pairs with a later fence still loses a turn', () => {
  const broken = insertBeforeTurn(GOLDEN, 3, '```text\nunclosed\n\n');
  const result = buildParserCheck(broken, parser, { turns: 10 });
  assert.ok(failedNames(result).includes('turn anchors outside code'));
  assert.equal(result.counts.turnAnchors, 9);
});

test('an unclosed HTML comment hides exporter headings', () => {
  const broken = insertBeforeTurn(GOLDEN, 9, '<!-- never closed\n\n');
  const result = buildParserCheck(broken, parser, { turns: 10 });
  assert.equal(result.failed, true);
  assert.ok(failedNames(result).includes('assistant headings parse as headings'));
});

test('a heading line inside a closed fence is not counted as exporter structure', () => {
  const quoted = insertBeforeTurn(GOLDEN, 2, `\`\`\`markdown\n${MARK.assistantHeading}\n## Contents\n\`\`\`\n\n`);
  const result = buildParserCheck(quoted, parser, { turns: 10 });
  assert.deepEqual(failedNames(result), []);
  assert.equal(result.counts.assistantHeadings, 10);
});

test('an unknown block with one json fence passes', () => {
  const ok = insertBeforeTurn(GOLDEN, 2, unknownBlock(['```json', '{"a":1}', '```']));
  const result = buildParserCheck(ok, parser, { turns: 10 });
  assert.deepEqual(failedNames(result), []);
  assert.equal(result.counts.unknownBlocks, 1);
});

test('an unknown block whose JSON splits into two code blocks fails', () => {
  const split = insertBeforeTurn(GOLDEN, 2, unknownBlock(['```json', '{"a":', '```', 'loose', '```json', '1}', '```']));
  const result = buildParserCheck(split, parser, { turns: 10 });
  assert.ok(failedNames(result).includes('unknown blocks hold exactly one json code block'));
});

test('an unknown block with no fence fails', () => {
  const missing = insertBeforeTurn(GOLDEN, 2, unknownBlock(['{"a":1}']));
  const result = buildParserCheck(missing, parser, { turns: 10 });
  assert.ok(failedNames(result).includes('unknown blocks hold exactly one json code block'));
});

test('an unknown block quoted inside a fence is ignored', () => {
  const quoted = insertBeforeTurn(GOLDEN, 2, `\`\`\`\`markdown\n${unknownBlock(['{"a":1}'])}\`\`\`\`\n\n`);
  const result = buildParserCheck(quoted, parser, { turns: 10 });
  assert.deepEqual(failedNames(result), []);
  assert.equal(result.counts.unknownBlocks, 0);
});

test('a turn count that does not match the anchors fails', () => {
  const result = buildParserCheck(GOLDEN, parser, { turns: 11 });
  assert.ok(failedNames(result).includes('turn anchors outside code'));
});

test('skips with a reason when the parser cannot load', async () => {
  const missing = await loadMarkdownParser(() => Promise.reject(Object.assign(new Error("Cannot find package 'markdown-it'"), { code: 'ERR_MODULE_NOT_FOUND' })));
  assert.equal(missing, null);
  const result = buildParserCheck(GOLDEN, missing, { turns: 10 });
  assert.equal(result.skipped, 'markdown-it unavailable');
  assert.equal(result.failed, false);
  assert.deepEqual(result.checks, []);
});

test('an unavailable parser fails strict verification', () => {
  const result = buildParserCheck(GOLDEN, null, { turns: 10, strict: true });
  assert.equal(result.failed, true);
  assert.equal(result.skipped, 'markdown-it unavailable');
  assert.ok(failedNames(result).includes('parser available'));
});

test('parser initialization errors are not mistaken for a missing dependency', async () => {
  await assert.rejects(loadMarkdownParser(() => Promise.reject(new Error('broken parser'))), /broken parser/);
});
