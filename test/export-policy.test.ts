import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_EXPORT_POLICY, planMetadataText, planToolText, recordedLineCount,
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

test('tool presentation changes exactly at 11 and 101 recorded lines', () => {
  for (const count of [0, 1, 10, 11, 100, 101]) {
    const text = textLines(count);
    const plan = planToolText(text);
    assert.equal(plan.lineCount, count);
    assert.equal(plan.collapsed, count > 10);
    assert.equal(plan.companionText, count > 100 ? text : null);
    assert.equal(plan.preview, count > 100 ? textLines(10) : text);
  }
});

test('preview retains original CRLF and full companion retains all Unicode bytes', () => {
  const text = `${textLines(101, '\r\n')}\r\n`;
  const plan = planToolText(text);
  assert.equal(plan.lineCount, 101);
  assert.equal(plan.preview, textLines(10, '\r\n'));
  assert.equal(plan.companionText, text);
  assert.deepEqual(Buffer.from(plan.companionText ?? ''), Buffer.from(text));
  assert.equal(planToolText(`${textLines(100)}\n`).companionText, null);
});

test('long single-line tool text is not silently byte-clipped', () => {
  const text = '\u{1f600}'.repeat(50_000);
  assert.deepEqual(planToolText(text), {
    lineCount: 1, collapsed: false, preview: text, companionText: null,
  });
});

test('extra metadata always collapses and uses complete companions over 100 lines', () => {
  assert.equal(planMetadataText('{}').collapsed, true);
  assert.equal(planMetadataText(textLines(100)).companionText, null);
  const plan = planMetadataText(textLines(101));
  assert.equal(plan.preview, textLines(10));
  assert.equal(plan.companionText, textLines(101));
});
