import assert from 'node:assert/strict';
import test from 'node:test';
import { redactContent } from '../src/redaction.ts';
import { redact } from '../src/text.ts';
import { planToolText } from '../src/export-policy.ts';

const location = { sourceId: 'synthetic', recordId: 'record-one', field: 'tool.result' };
const policy = { highFidelity: false, redact: true };

test('redaction records safe category/count/location without including matched values', () => {
  const result = redactContent('authorization: bearer synthetic-secret\npassword = "fake-value"\napi_key: fake-key', policy, location);
  assert.equal(result.text, 'authorization: bearer [REDACTED]\npassword = "[REDACTED]"\napi_key: [REDACTED]');
  assert.deepEqual(result.diagnostics.map((item) => [item.kind, item.count]), [
    ['bearer-credential', 1], ['credential-assignment', 2],
  ]);
  assert.ok(result.diagnostics.every((item) => item.location === location));
  assert.doesNotMatch(JSON.stringify(result.diagnostics), /synthetic-secret|fake-value|fake-key/);
  assert.equal(redact('password=fake'), 'password=[REDACTED]');
});

test('disabled redaction preserves exact text and records no replacements', () => {
  const text = 'password=fake\r\nUnicode \u{1f600}\r\n';
  const result = redactContent(text, { ...policy, redact: false }, location);
  assert.equal(result.text, text);
  assert.deepEqual(result.diagnostics, []);
});

test('count accounting does not count an already-redacted placeholder again', () => {
  const once = redactContent('password=fake\nAuthorization: Bearer fake', policy, location);
  const twice = redactContent(once.text, policy, location);
  assert.equal(twice.text, once.text);
  assert.deepEqual(twice.diagnostics, []);
});

test('preview and complete companion are derived from the same redacted text', () => {
  const text = Array.from({ length: 101 }, (_, index) => `Line ${index}: password=fake-${index}`).join('\r\n');
  const result = redactContent(text, policy, location);
  const presentation = planToolText(result.text);
  assert.equal(result.diagnostics[0].count, 101);
  assert.doesNotMatch(presentation.preview, /fake-/);
  assert.doesNotMatch(presentation.companionText!, /fake-/);
  assert.equal(presentation.companionText, result.text);
  assert.equal(presentation.preview.split('\r\n').length, 10);
});
