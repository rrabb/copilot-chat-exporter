import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assistantBlock, blockquote, clip, closeUnbalancedFences, esc, extractUri, fenceFor,
  fmtCredits, headerTimestamp, humanDuration, indentBlock, isoTimestamp, mutedSummary,
  neutralizeStructuralHtml, parseJson, reEscape, redact, stripAnsi, stripMarkdown, thousands,
} from '../src/text.ts';

test('fenceFor outruns any backtick run inside the content', () => {
  assert.equal(fenceFor('plain').open, '```');
  assert.equal(fenceFor('plain', 'json').open, '```json');
  // Content holding a 3-run needs a 4-fence, or the block closes early.
  assert.equal(fenceFor('before\n```\nafter').open, '````');
  assert.equal(fenceFor('a ````` b').close, '``````');
  const fence = fenceFor('x', 'text');
  assert.equal(fence.close, '```');
});

test('clip truncates on characters and collapses whitespace', () => {
  assert.equal(clip('a\n\n  b'), 'a b');
  assert.equal(clip('abcdefghij', 5), 'abcd…');
  assert.equal(clip(null), '');
});

test('humanDuration switches units and refuses nonsense', () => {
  assert.equal(humanDuration(1500), '1.5s');
  assert.equal(humanDuration(64_000), '1m 4s');
  assert.equal(humanDuration(3_700_000), '1h 2m');
  assert.equal(humanDuration(0), 'not recorded');
  assert.equal(humanDuration(-5), 'not recorded');
  assert.equal(humanDuration(Number.NaN), 'not recorded');
});

test('number formatting is pinned and total', () => {
  // Pinned to en-US so an export reads identically on a machine with another OS locale.
  assert.equal(thousands(1234567), '1,234,567');
  assert.equal(thousands(Number.NaN), '0');
  assert.equal(fmtCredits(1.5), '1.50');
  assert.equal(fmtCredits('2'), '2.00');
  assert.equal(fmtCredits('nope'), '0.00');
});

test('timestamps degrade instead of throwing', () => {
  assert.equal(isoTimestamp(0), 'unavailable');
  assert.equal(isoTimestamp(1_700_000_000_000), '2023-11-14 22:13:20Z');
  assert.equal(headerTimestamp(1_700_000_000_000), '23-11-14 22:13');
  assert.equal(headerTimestamp('not a date'), '');
});

test('esc escapes the three characters that break inline HTML', () => {
  assert.equal(esc('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
  assert.equal(esc('  spaced\n\ttext  '), 'spaced text');
});

test('redact masks credentials it recognises', () => {
  // Values here are fabricated. This is the only proof the redaction path works at all:
  // it has never fired on a real recorded session.
  assert.equal(
    redact('Authorization: Bearer abc123def456'),
    'Authorization: Bearer [REDACTED]',
  );
  assert.ok(redact('api_key="s3cr3t"').includes('[REDACTED]'));
  assert.ok(redact('client_secret: hunter2').includes('[REDACTED]'));
  assert.ok(redact('refresh-token = zzz').includes('[REDACTED]'));
  assert.equal(redact('nothing sensitive here'), 'nothing sensitive here');
});

test('neutralizeStructuralHtml escapes markup only outside fences', () => {
  const output = neutralizeStructuralHtml(['```', '<details>', '```', '<details>'].join('\n'));
  const lines = output.split('\n');
  assert.equal(lines[1], '<details>', 'inside a fence it is already inert');
  assert.equal(lines[3], '&lt;details>', 'outside a fence it would swallow the document');
  assert.equal(neutralizeStructuralHtml('</div>'), '&lt;/div>');
  assert.equal(neutralizeStructuralHtml('<detailed>'), '<detailed>', 'word boundary, not a prefix');
});

test('closeUnbalancedFences appends a matching close only when one is missing', () => {
  // Balanced content is returned untouched.
  const balanced = ['prose', '```js', 'code', '```', 'more'].join('\n');
  assert.equal(closeUnbalancedFences(balanced), balanced);
  // An odd fence left open in a model's raw reasoning gets a matching close appended,
  // so it cannot swallow the </div>/</details> that follow it.
  assert.equal(closeUnbalancedFences('open\n```js\ncode'), 'open\n```js\ncode\n```');
  // The appended close matches the opener's length so a 4-backtick block still closes.
  assert.equal(closeUnbalancedFences('````\ninner ``` run'), '````\ninner ``` run\n````');
  assert.equal(closeUnbalancedFences('no fences here'), 'no fences here');
});

test('tilde fences are tracked like backtick fences, and the two never close each other', () => {
  assert.equal(closeUnbalancedFences('open\n~~~js\ncode'), 'open\n~~~js\ncode\n~~~');
  assert.equal(closeUnbalancedFences('~~~~\ninner ~~~ run'), '~~~~\ninner ~~~ run\n~~~~');
  assert.equal(closeUnbalancedFences('~~~\ncode\n```'), '~~~\ncode\n```\n~~~', 'backticks do not close a tilde fence');
  assert.equal(closeUnbalancedFences('```\ncode\n~~~'), '```\ncode\n~~~\n```', 'tildes do not close a backtick fence');
  const balanced = ['~~~', 'code', '~~~~', 'after'].join('\n');
  assert.equal(closeUnbalancedFences(balanced), balanced, 'a longer closing run closes the fence');
});

test('neutralizeStructuralHtml leaves markup inside a tilde fence alone', () => {
  const lines = neutralizeStructuralHtml(['~~~html', '<details>', '```', '</details>', '~~~', '<details>'].join('\n')).split('\n');
  assert.equal(lines[1], '<details>');
  assert.equal(lines[3], '</details>', 'a backtick line does not end a tilde fence');
  assert.equal(lines[5], '&lt;details>');
});

test('extractUri decodes a file URI or yields nothing', () => {
  assert.equal(extractUri('see file:///c%3A/tmp/a.md for more'), 'c:/tmp/a.md');
  assert.equal(extractUri('no uri here'), '');
  assert.equal(extractUri(null), '');
});

test('stripMarkdown prefers link text and falls back to a basename', () => {
  assert.equal(stripMarkdown('[label](file:///c%3A/tmp/a.md)'), 'label');
  assert.equal(stripMarkdown('[](file:///c%3A/tmp/a.md)'), 'a.md');
  assert.equal(stripMarkdown('`code` and  spaces'), 'code and spaces');
});

test('stripAnsi removes VT sequences and normalises newlines', () => {
  assert.equal(stripAnsi('\u001b[31mred\u001b[0m'), 'red');
  assert.equal(stripAnsi('\u001b]0;title\u0007text'), 'text');
  assert.equal(stripAnsi('a\r\nb\rc'), 'a\nb\nc');
});

test('parseJson passes objects through and swallows bad input', () => {
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
  const object = { already: true };
  assert.equal(parseJson(object), object);
  assert.equal(parseJson('{not json'), null);
  assert.equal(parseJson(undefined, 'fallback'), 'fallback');
});

test('indentBlock wraps with the blank lines CommonMark requires', () => {
  assert.deepEqual(indentBlock([]), [], 'nothing to indent stays nothing');
  const block = indentBlock(['body'], '1em');
  assert.deepEqual(block, ['<div style="margin-left:1em">', '', 'body', '', '</div>']);
});

test('summary and prose wrappers keep their structural shape', () => {
  assert.equal(mutedSummary('x'), '<sub><span style="color:#7d8590;font-weight:400">x</span></sub>');
  const block = assistantBlock('answer');
  assert.ok(block[0].startsWith('<div style="border-left:3px solid'));
  assert.equal(block[2], 'answer');
  assert.equal(block[4], '</div>');
});

test('blockquote prefixes every line and names an empty message', () => {
  assert.equal(blockquote('a\nb'), '> a\n> b');
  assert.equal(blockquote('   '), '> _Empty message_');
});

test('reEscape neutralises regex metacharacters', () => {
  assert.equal(reEscape('a.b*c'), 'a\\.b\\*c');
  assert.ok(new RegExp(reEscape('(x)')).test('(x)'));
});
