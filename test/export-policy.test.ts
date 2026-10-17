import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPANION_MIN_BYTES, DEFAULT_EXPORT_POLICY, planMetadataText, planToolText, recordedLineCount,
} from '../src/export-policy.ts';

const textLines = (count: number, ending = '\n') =>
  Array.from({ length: count }, (_, index) => `Line ${index + 1}: \u{1f600}`).join(ending);

test('ordinary exports redact by default without extra high-fidelity metadata', () => {
  assert.deepEqual(DEFAULT_EXPORT_POLICY, { highFidelity: false, redact: true });
  assert.ok(Object.isFrozen(DEFAULT_EXPORT_POLICY));
});

test('recorded line counts handle empty, mixed endings and terminating newline', () => {
  assert.equal(recordedLineCount(''), 0);
  assert.equal(recordedLineCount('one'), 1);
  assert.equal(recordedLineCount('one\n'), 1);
  assert.equal(recordedLineCount('one\r\n'), 1);
  assert.equal(recordedLineCount('\n'), 1);
  assert.equal(recordedLineCount('one\r\ntwo\rthree\n'), 3);
  assert.equal(recordedLineCount('one\n\n'), 2);
});

// Lines wide enough that 301 of them pass 15 KiB.
const wideLines = (count: number, ending = '\n') =>
  Array.from({ length: count }, (_, index) => `Line ${index + 1}: ${'x'.repeat(60)} \u{1f600}`).join(ending);

test('tool presentation collapses at 11 lines and moves to a companion only past 300 lines and 15 KiB', () => {
  for (const count of [0, 1, 10, 11, 100, 101, 300]) {
    const text = wideLines(count);
    const plan = planToolText(text);
    assert.equal(plan.lineCount, count);
    assert.equal(plan.collapsed, count > 10);
    assert.equal(plan.companionText, null, `${count} lines stay in the Markdown`);
    assert.equal(plan.preview, text);
  }
  const long = wideLines(301);
  assert.ok(Buffer.byteLength(long, 'utf8') > COMPANION_MIN_BYTES);
  const plan = planToolText(long);
  assert.equal(plan.companionText, long);
  assert.equal(plan.preview, wideLines(10));
});

test('both conditions are needed: many short lines or few huge lines stay inline', () => {
  const shortLines = textLines(400);
  assert.ok(Buffer.byteLength(shortLines, 'utf8') < COMPANION_MIN_BYTES);
  assert.equal(planToolText(shortLines).companionText, null);
  const hugeLines = Array.from({ length: 50 }, () => 'y'.repeat(2000)).join('\n');
  assert.ok(Buffer.byteLength(hugeLines, 'utf8') > COMPANION_MIN_BYTES);
  assert.equal(planToolText(hugeLines).companionText, null);
  const edge = (bytes: number) => `${'z'.repeat(bytes - 600)}${'\nz'.repeat(300 - 1)}\nz`;
  assert.equal(planToolText(edge(COMPANION_MIN_BYTES)).companionText, null, 'exactly 15 KiB is not over the limit');
  assert.notEqual(planToolText(edge(COMPANION_MIN_BYTES + 1)).companionText, null);
});

test('preview retains original CRLF and full companion retains all Unicode bytes', () => {
  const text = `${wideLines(301, '\r\n')}\r\n`;
  const plan = planToolText(text);
  assert.equal(plan.lineCount, 301);
  assert.equal(plan.preview, wideLines(10, '\r\n'));
  assert.equal(plan.companionText, text);
  assert.deepEqual(Buffer.from(plan.companionText ?? ''), Buffer.from(text));
});

test('long single-line tool text is not silently byte-clipped', () => {
  const text = '\u{1f600}'.repeat(50_000);
  assert.deepEqual(planToolText(text), {
    lineCount: 1, collapsed: false, preview: text, companionText: null,
  });
});

test('extra metadata always collapses and uses the same companion threshold', () => {
  assert.equal(planMetadataText('{}').collapsed, true);
  assert.equal(planMetadataText(wideLines(300)).companionText, null);
  const plan = planMetadataText(wideLines(301));
  assert.equal(plan.preview, wideLines(10));
  assert.equal(plan.companionText, wideLines(301));
});