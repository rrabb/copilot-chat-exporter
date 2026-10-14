import assert from 'node:assert/strict';
import test from 'node:test';
import { compactTokenCount, listingUsage } from '../src/session/listing-usage.ts';
import { formatDetailedSessionListingHtml } from '../src/session/detailed-listing.ts';
import { compactCss } from './detailed-listing-fixture.ts';
import { detailedEvidence, detailedOccurrence } from './detailed-listing-fixture.ts';

test('usage totals preserve independent coverage, zero counters and unknown or invalid values', () => {
  const turn = detailedEvidence().turns[0]!;
  const usage = listingUsage([
    { ...turn, credits: 43.5, promptTokens: 1200, completionTokens: 0 },
    { ...turn, credits: 0, promptTokens: null, completionTokens: 300 },
    { ...turn, credits: Infinity, promptTokens: -1, completionTokens: 1.5 },
  ]);
  assert.deepEqual(usage.credits, { total: 43.5, recorded: 2, turns: 3 });
  assert.deepEqual(usage.promptTokens, { total: 1200, recorded: 1, turns: 3 });
  assert.deepEqual(usage.completionTokens, { total: 300, recorded: 2, turns: 3 });
  assert.equal(listingUsage([]).credits.total, null);
  assert.equal(listingUsage([turn]).promptTokens.total, null);
  assert.equal(listingUsage([{ ...turn, promptTokens: Number.MAX_SAFE_INTEGER }, { ...turn, promptTokens: 1 }]).promptTokens.total, null);
});

test('usage appears in the header, details and each turn without summing workspace references', () => {
  const row = detailedOccurrence('one');
  const reference = { ...row, occurrenceId: 'duplicate', provenance: { ...row.provenance, workspaceStoragePath: 'C:\\other' } };
  const evidence = detailedEvidence({ models: ['claude-opus-5.5', 'claude-sonnet-5.5', 'gpt-6.1-sol'] });
  evidence.turns = [
    { ...evidence.turns[0]!, credits: 43.5, promptTokens: 1200, completionTokens: 0 },
    { ...evidence.turns[0]!, id: 'two', credits: null, promptTokens: null, completionTokens: 300, canceled: true },
  ];
  const html = formatDetailedSessionListingHtml([row, reference], new Map([['one', evidence], ['duplicate', evidence]]));
  const header = html.match(/<summary class="session-summary">([\s\S]*?)<\/summary>/u)![1];
  assert.ok(header.includes('💳 ~44c'));
  assert.ok(header.includes('⬆️~1.2k ⬇️300'));
  assert.ok(!header.includes('🔢'));
  assert.ok(!header.includes('💳 ~87c'));
  assert.equal((header.match(/class="tag tone-model"/gu) ?? []).length, 1);
  assert.ok(header.includes('Opus 5.5 · Sonnet 5.5 · GPT-6.1-sol'));
  assert.ok(header.includes('aria-label="Created">🌅'));
  assert.ok(header.includes('aria-label="Updated">🔄'));
  assert.ok(!header.includes('>created '));
  assert.ok(!header.includes('>updated '));
  assert.ok(html.includes('1/2 counted turns have a valid recorded counter'));
  assert.ok(html.includes('<code>request.promptTokens</code>'));
  const first = html.match(/id="session-1-turn-1">([\s\S]*?)<\/li>/u)![1];
  assert.ok(first.includes('💳 44c'));
  assert.ok(first.includes('⬆️1.2k ⬇️0'));
  assert.ok(html.includes('🚫 Canceled'));
  assert.ok(html.includes('<span class="glyph">↳</span> Has children'));
  assert.ok(html.includes('<span class="glyph">⑂?</span> Tentative hints'));
  assert.ok(html.includes('📝 Editing history'));
  assert.ok(html.includes('∅ No response evidence'));
  assert.ok(compactCss(html).includes('font:700 0.9375rem "Arial Narrow"'));
});

test('unavailable usage and models are explained only inside expanded cards', () => {
  const row = detailedOccurrence('one');
  const data = detailedEvidence({ models: [] });
  data.turns[0]!.models = [];
  const html = formatDetailedSessionListingHtml([row], new Map([['one', data]]));
  const header = html.match(/<summary class="session-summary">([\s\S]*?)<\/summary>/u)![1];
  const card = html.match(/<details class="session-card[^>]*>([\s\S]*?)<\/details>/u)![1];
  assert.ok(!header.includes('Usage unavailable'));
  assert.ok(!header.includes('model unknown'));
  assert.ok(!header.includes('tone-model'));
  assert.ok(!card.includes('class="usage-disclosure"'));
  assert.ok(card.includes('No recorded answering-model evidence'));
  assert.ok(!card.includes('Credits / 🔢 tokens'));
  assert.ok(!card.includes('🤖 model unknown'));
  assert.ok(html.includes('No supported recorded credit/token counters for these counted turns'));
  assert.ok(!html.includes('SDK model-call usage, child completion totals and cumulative checkpoints are not yet correlated'));
  assert.ok(!html.includes('💳 0c'));
  assert.ok(!html.includes('🧩'));
  // The unavailable chip and model note follow the titles in normal flow; neither is right-aligned.
  assert.match(card, /class="title-provenance"[\s\S]*?<div class="card-notes">[\s\S]*?Usage unavailable[\s\S]*?No recorded answering-model evidence/u);
  assert.ok(!html.includes('usage-unavailable'));
  assert.ok(!html.includes('model-unavailable'));
  assert.ok(!html.includes('text-align:right'));
});
test('compact token counts use an uncertainty prefix and nearest abbreviations', () => {
  const row = detailedOccurrence('one');
  const data = detailedEvidence();
  data.turns[0]!.credits = 12.01;
  data.turns[0]!.promptTokens = 15_413_458;
  data.turns[0]!.completionTokens = 730_211;
  data.turns.push({ ...data.turns[0]!, id: 'second', credits: null, promptTokens: null, completionTokens: null });
  const html = formatDetailedSessionListingHtml([row], new Map([['one', data]]));
  const header = html.match(/<summary class="session-summary">([\s\S]*?)<\/summary>/u)![1];
  assert.ok(header.includes('💳 ~13c'));
  assert.ok(header.includes('⬆️~15.4M ⬇️~730k'));
  assert.ok(html.includes('>~13</td>'));
  assert.ok(html.includes('>~15,413,458</td>'));
  assert.ok(html.includes('>~730,211</td>'));
});
test('abbreviated token counts round to nearest and never show a rounded value as the wrong unit', () => {
  for (const [value, expected] of [
    [0, '0'], [999, '999'], [1_000, '1k'], [1_249, '1.2k'], [1_250, '1.3k'], [9_949, '9.9k'], [9_950, '10k'],
    [730_211, '730k'], [999_499, '999k'], [999_500, '1M'], [15_413_458, '15.4M'], [15_460_000, '15.5M'],
  ] as const)
    assert.equal(compactTokenCount(value), expected, String(value));
});
test('conversation references, children and header counters use singular and plural labels correctly', () => {
  const row = detailedOccurrence('one');
  const data = detailedEvidence({ errors: 1, canceled: 1, flags: ['audit-a'] });
  const html = formatDetailedSessionListingHtml([row], new Map([['one', data]]));
  const header = html.match(/<summary class="session-summary">([\s\S]*?)<\/summary>/u)![1];
  assert.ok(header.includes('🚨 1 error<'));
  assert.ok(header.includes('🔎 1 audit note<'));
  assert.ok(html.includes('<strong>1 turn</strong></span>'));
  assert.ok(!html.includes('1 refs'));
  assert.ok(!html.includes('1 turns'));
});
test('workspace-reference chip is bold magenta while tentative fork hints keep the hint tone', () => {
  const a = detailedOccurrence('a');
  const reference = { ...a, occurrenceId: 'a2', provenance: { ...a.provenance, workspaceStoragePath: 'C:\\other' } };
  const html = formatDetailedSessionListingHtml([a, reference], new Map([['a', detailedEvidence()], ['a2', detailedEvidence()]]));
  assert.ok(html.includes('class="tag tone-refs" title="One verified conversation referenced from distinct workspace stores">2 w/s refs · 1 conv</span>'));
  assert.ok(compactCss(html).includes('.tone-refs{color:#b00079;border-color:#c2188f;font-weight:700}'));
  assert.ok(!html.includes('tone-likely'));
});
test('card actions sit in the title row as small Arial Narrow controls and stay flex when scripted', () => {
  const html = formatDetailedSessionListingHtml([detailedOccurrence('one')], new Map([['one', detailedEvidence()]]));
  assert.match(html, /<div class="titles-head"><h3>🏷️ Titles at each storage level<\/h3><div class="card-actions enhanced-only">/u);
  assert.equal((html.match(/data-pin="session-1"/gu) ?? []).length, 1);
  assert.ok(compactCss(html).includes('.card-actions button{font:0.6875rem "Arial Narrow"'));
  assert.ok(compactCss(html).includes('.card-actions a{font:0.6875rem "Arial Narrow"'));
  assert.ok(compactCss(html).includes('.js .card-actions.enhanced-only{display:flex}'));
});
test('summary charts use semantic colors and the same display labels as the cards', () => {
  const html = formatDetailedSessionListingHtml([detailedOccurrence('one')], new Map([['one', detailedEvidence()]]));
  assert.ok(html.includes('<span>Local</span><span class="bar" aria-label="100%"><i class="bar-local" style="width:100%"></i>'));
  assert.ok(html.includes('<span>verified</span><span class="bar" aria-label="100%"><i class="bar-verified" style="width:100%"></i>'));
  assert.ok(compactCss(html).includes('.chart-row .bar i.bar-verified{background:#139577}'));
});
test('selected-model chip appears only when it adds information beyond the answering model', () => {
  const same = detailedEvidence();
  same.turns[0] = { ...same.turns[0]!, auto: false, selectedModel: 'answer-model', models: ['answer-model'] };
  assert.ok(!formatDetailedSessionListingHtml([detailedOccurrence('one')], new Map([['one', same]])).includes('Selected: '));
  const different = detailedEvidence();
  different.turns[0] = { ...different.turns[0]!, auto: false, selectedModel: 'chosen-model', models: ['answer-model'] };
  assert.ok(formatDetailedSessionListingHtml([detailedOccurrence('one')], new Map([['one', different]])).includes('Selected: '));
});
test('Local-only audited bytes and artifact counts read correctly for SDK and singular cases', () => {
  const data = detailedEvidence({
    artifactLocations: [
      { kind: 'journal', path: 'C:\\j.jsonl', form: 'file', state: 'present', bytes: 10, files: 1 },
      { kind: 'transcript', path: 'C:\\t.jsonl', form: 'file', state: 'missing', bytes: null, files: null },
    ],
    auditedBytes: 10,
    storage: [
      { kind: 'journal', path: 'C:\\j.jsonl', state: 'present', bytes: 10, files: 1, modified: null, parts: [], measurement: 'File length.' },
      { kind: 'transcript', path: 'C:\\t.jsonl', state: 'missing', bytes: null, files: null, modified: null, parts: [], measurement: '' },
    ],
  });
  const local = formatDetailedSessionListingHtml([detailedOccurrence('one')], new Map([['one', data]]));
  assert.ok(local.includes('<strong>10 B</strong> <span class="exact-bytes">10 bytes</span>'));
  assert.ok(!local.includes('1 files'));
  assert.ok(!local.includes('unknown / unknown'));
  const sdk = formatDetailedSessionListingHtml([detailedOccurrence('two')], new Map([['two', detailedEvidence()]]));
  assert.ok(!sdk.includes('Checked Local journal / sibling total:'));
});
