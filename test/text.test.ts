import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assistantBlock, blockquote, clip, closeUnbalancedFences, esc, escapeUnclosedHtml, extractUri, fenceFor, fenceOpener,
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

test('closeUnbalancedFences repeats the opener container prefix: list indentation, blockquote markers, or both', () => {
  assert.equal(closeUnbalancedFences('- item\n  ```\n  code'), '- item\n  ```\n  code\n  ```', 'list continuation indent');
  assert.equal(closeUnbalancedFences('- ```js\n  code'), '- ```js\n  code\n  ```', 'bullet replaced by its width');
  assert.equal(closeUnbalancedFences('1. ```\n   code'), '1. ```\n   code\n   ```', 'ordered marker replaced by its width');
  assert.equal(closeUnbalancedFences('> ```\n> code'), '> ```\n> code\n> ```', 'blockquote marker kept');
  assert.equal(closeUnbalancedFences('> - ```\n>   code'), '> - ```\n>   code\n>   ```', 'list nested in a blockquote');
  assert.equal(closeUnbalancedFences('> > ~~~\n> > code'), '> > ~~~\n> > code\n> > ~~~', 'nested blockquotes');
  assert.equal(closeUnbalancedFences('  ```\ncode'), '  ```\ncode\n  ```', 'top-level indented fence keeps its indent');
});

test('only spaces and tabs indent a fence, as in CommonMark; a BOM or other Unicode space does not', () => {
  for (const prefix of ['\uFEFF', '\u00A0', '\u2003', '\u3000']) {
    const text = `${prefix}~~~\ncode`;
    assert.equal(closeUnbalancedFences(text), text, `U+${prefix.codePointAt(0)!.toString(16).toUpperCase()} before ~~~ is not a fence`);
    assert.equal(fenceOpener(`${prefix}\`\`\``), '');
  }
  assert.equal(closeUnbalancedFences('\t```\ncode'), '\t```\ncode\n\t```', 'a tab-indented opener gets the same tab, never a 1-space fence');
  assert.equal(closeUnbalancedFences('```\ncode\n```\uFEFF'), '```\ncode\n```\uFEFF\n```', 'a trailing BOM stops a line closing the fence');
});

test('a fence inside a container ends with the container, so no repair is appended', () => {
  const quoted = '> ```\n> code\nafter';
  assert.equal(closeUnbalancedFences(quoted), quoted, 'a line without > ends the blockquote and its fence');
  const listed = '- item\n  ```\n  code\nafter';
  assert.equal(closeUnbalancedFences(listed), listed, 'a less-indented line ends the list item and its fence');
  const nested = '> - ```\n>   code\n> after';
  assert.equal(closeUnbalancedFences(nested), nested, 'a less-indented quoted line ends the nested list item');
  assert.equal(closeUnbalancedFences('> ```\n> code\n```'), '> ```\n> code\n```\n```', 'the unquoted fence after the blockquote is the one left open');
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

test('escapeUnclosedHtml escapes an unclosed comment opener outside code and counts it', () => {
  const result = escapeUnclosedHtml('Before\n<!-- never closed\nAfter');
  assert.equal(result.text, 'Before\n&lt;!-- never closed\nAfter');
  assert.deepEqual(result.escaped, ['comment']);
});

test('unclosed pre tags are escaped outside code without changing closed tags', () => {
  assert.deepEqual(escapeUnclosedHtml('<pre>\nnever closed'), { text: '&lt;pre>\nnever closed', escaped: ['pre'] });
  for (const text of ['<pre>closed</pre>', '```html\n<pre>\n```', '`<pre>`'])
    assert.deepEqual(escapeUnclosedHtml(text), { text, escaped: [] });
});

test('escapeUnclosedHtml leaves a closed comment, even across lines, alone', () => {
  const text = 'a <!-- hidden\nstill hidden --> b';
  assert.deepEqual(escapeUnclosedHtml(text), { text, escaped: [] });
});

test('escapeUnclosedHtml escapes unclosed raw-text tags but not closed ones or lookalikes', () => {
  const result = escapeUnclosedHtml('<script>\n<STYLE type="x">\n<textarea\n<scripts> <stylesheet>');
  assert.equal(result.text, '&lt;script>\n&lt;STYLE type="x">\n&lt;textarea\n<scripts> <stylesheet>');
  assert.deepEqual(result.escaped, ['script', 'style', 'textarea']);
  const closed = '<script>x()</script> <style>a{}</STYLE>';
  assert.deepEqual(escapeUnclosedHtml(closed), { text: closed, escaped: [] });
});

test('escapeUnclosedHtml leaves openers inside fences and inline code spans alone', () => {
  const text = ['Use `<!--` or ``<script>`` here.', '```html', '<!-- open', '<textarea>', '```', '~~~', '<style>', '~~~'].join('\n');
  assert.deepEqual(escapeUnclosedHtml(text), { text, escaped: [] });
});

test('escapeUnclosedHtml treats a closer before the opener as no closer', () => {
  const result = escapeUnclosedHtml('--> then <!-- open');
  assert.equal(result.text, '--> then &lt;!-- open');
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
