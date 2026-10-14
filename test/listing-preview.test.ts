import assert from 'node:assert/strict';
import test from 'node:test';
import { formatListingTurnDate, formatLocalListingDate, previewListingPrompt, sdkListingPromptOverview, listingModelLabel } from '../src/session/listing-preview.ts';

test('turn preview leaves exactly 70 words complete and clips at 71', () => {
  const words = Array.from({ length: 71 }, (_, index) => `word${index + 1}`);
  const seventy = previewListingPrompt(words.slice(0, 70).join(' '));
  assert.deepEqual(seventy, { text: words.slice(0, 70).join(' '), wordCount: 70, clipped: false });
  const seventyOne = previewListingPrompt(words.join(' '));
  assert.deepEqual(seventyOne, {
    text: `${words.slice(0, 50).join(' ')} . . . . . ${words.slice(-20).join(' ')}`,
    wordCount: 71,
    clipped: true,
  });
  assert.doesNotMatch(seventyOne.text, /\bword51\b/u);
  assert.match(seventyOne.text, /\bword52\b/u);
});

test('preview preserves first 50 and last 20 words for long Unicode text', () => {
  const words = Array.from({ length: 105 }, (_, index) => `質問${index + 1}`);
  const result = previewListingPrompt(words.join('\r\n\t'));
  assert.equal(result.wordCount, 105);
  assert.equal(result.clipped, true);
  assert.equal(result.text, `${words.slice(0, 50).join(' ')} . . . . . ${words.slice(-20).join(' ')}`);
});

test('preview normalizes whitespace without treating punctuation or slash commands as empty', () => {
  assert.deepEqual(previewListingPrompt(' \r\n\t '), { text: '', wordCount: 0, clipped: false });
  assert.deepEqual(previewListingPrompt('\t/fix\r\n  Δοκιμή\u00a0🙂  '), { text: '/fix Δοκιμή 🙂', wordCount: 3, clipped: false });
});

test('report dates use local clock and the exact compact date convention', () => {
  const timestamp = new Date(2026, 9, 8, 9, 4, 59).getTime();
  assert.equal(formatLocalListingDate(timestamp), '261008_09:04');
  assert.equal(formatListingTurnDate(timestamp, new Date(2026, 0, 1).getTime()), '1008_09:04');
});

test('turn dates retain year across years and when creation evidence is unknown', () => {
  const timestamp = new Date(2027, 0, 1, 0, 2).getTime();
  assert.equal(formatListingTurnDate(timestamp, new Date(2026, 11, 31, 23, 58).getTime()), '270101_00:02');
  assert.equal(formatListingTurnDate(timestamp, null), '270101_00:02');
  assert.equal(formatListingTurnDate(timestamp, NaN), '270101_00:02');
});

test('unknown and invalid dates are unknown, but epoch zero is a valid recorded date', () => {
  for (const invalid of [null, undefined, NaN, Infinity, -Infinity, 1e30]) {
    assert.equal(formatLocalListingDate(invalid), 'unknown');
    assert.equal(formatListingTurnDate(invalid, 0), 'unknown');
  }
  assert.notEqual(formatLocalListingDate(0), 'unknown');
});

test('SDK overview is explicitly derived, handles known wrappers and does not drop all-wrapper prompts', () => {
  const full = '<current_datetime>2026-10-08</current_datetime>\n<system_reminder>Native context</system_reminder>\n<user_query>Actual question</user_query>';
  assert.equal(sdkListingPromptOverview(full), 'Actual question');
  assert.equal(sdkListingPromptOverview('<userRequest>Wrapped</userRequest>\nOutside question'), 'Outside question');
  assert.equal(sdkListingPromptOverview('<unrecognized>Keep this</unrecognized>'), '<unrecognized>Keep this</unrecognized>');
  assert.equal(sdkListingPromptOverview('<context>Only context</context>'), '<context>Only context</context>');
});

test('friendly model labels preserve raw identity in callers rather than merging aliases', () => {
  assert.equal(listingModelLabel('copilot/claude-opus-4.8'), 'Opus 4.8');
  assert.equal(listingModelLabel('claude-opus-4-8'), 'Opus 4.8');
  assert.equal(listingModelLabel('gpt-5.5-2026-04-23'), 'GPT-5.5');
  assert.equal(listingModelLabel('future/custom-model'), 'custom-model');
  assert.equal(listingModelLabel('auto'), 'Auto');
});
