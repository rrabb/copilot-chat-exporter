import assert from 'node:assert/strict';
import test from 'node:test';
import { detailedSearchAttribute, detailedTitleAttribute } from '../src/session/detailed-search.ts';
import { formatDetailedSessionListingHtml } from '../src/session/detailed-listing.ts';
import { detailedEvidence, detailedOccurrence } from './detailed-listing-fixture.ts';

test('titles omit content redundancy but keep explanations, exact IDs and safe escaping', () => {
  assert.equal(detailedTitleAttribute('C:\\project\\file.ts', 'C:\\project\\file.ts'), '');
  assert.equal(detailedTitleAttribute('one \n two', ' one two '), '');
  assert.equal(detailedTitleAttribute('Question', 'question'), ' title="question"');
  assert.equal(detailedTitleAttribute('?', 'Size not measured'), ' title="Size not measured"');
  assert.equal(detailedTitleAttribute('Opus 4', 'claude-opus-4'), ' title="claude-opus-4"');
  assert.equal(detailedTitleAttribute('file.ts', 'C:\\project\\file.ts'), ' title="C:\\project\\file.ts"');
  assert.equal(detailedTitleAttribute('label', '<script>"&'), ' title="&lt;script&gt;&quot;&amp;"');
});

test('supplemental search omits displayed content, deduplicates and safely escapes absent identifiers', () => {
  assert.equal(detailedSearchAttribute(['answer-model', 'HIGH', 'auto'], 'answer-model High Auto'), '');
  assert.equal(detailedSearchAttribute(['raw-id', 'raw-id', '', '<script>'], 'Friendly model'),
    ' data-search="raw-id &lt;script&gt;"');
});

test('title and supplemental search helpers never reintroduce recognized credentials', () => {
  const text = 'api_key=synthetic-test-credential';
  assert.equal(detailedTitleAttribute('label', text), ' title="api_key=[REDACTED]"');
  assert.equal(detailedSearchAttribute([text], 'label'), ' data-search="api_key=[redacted]"');
  assert.equal(detailedSearchAttribute([text], 'api_key=[REDACTED]'), '');
});

test('aggregate files remain searchable when no per-turn file evidence is rendered', () => {
  const row = detailedOccurrence('one');
  const data = detailedEvidence({ state: 'changed' });
  data.files = [{ ...data.turns[0]!.files[0]!, file: 'C:\\aggregate-only-file.ts' }];
  data.turns[0]!.files = data.files;
  const html = formatDetailedSessionListingHtml([row], new Map([['one', data]]), {}, '2026-10-14T12:00:00Z');
  assert.ok(html.includes('data-search="c:\\aggregate-only-file.ts"'));
  assert.ok(!html.includes('class="turn-card"'));
});

test('renderer marks occurrence-specific evidence and does not serialize full search corpora', () => {
  const row = detailedOccurrence('one');
  const duplicate = {
    ...row, occurrenceId: 'two', title: 'Alias for second reference',
    provenance: { ...row.provenance, workspaceStoragePath: 'C:\\different-workspace' },
  };
  const evidence = detailedEvidence();
  evidence.turns[0]!.prompt = Array.from({ length: 110 }, (_, i) => `prompt-word-${i}`).join(' ');
  evidence.turns[0]!.selectedModel = 'vendor/claude-opus-4';
  evidence.turns[0]!.auto = false;
  evidence.turns[0]!.models = ['claude-opus-4'];
  evidence.models = ['claude-opus-4'];
  const html = formatDetailedSessionListingHtml([row, duplicate], new Map([
    ['one', evidence],
    ['two', detailedEvidence({ diagnostics: [{ path: 'C:\\different-workspace\\broken.db', description: 'Unique unreadable diagnostic' }] })],
  ]), {}, '2026-10-14T12:00:00Z');
  assert.match(html, /data-conversation="session-1" data-reference="1"/u);
  assert.match(html, /data-conversation="session-1" data-reference="2"/u);
  assert.match(html, /data-search-refs="2">[^<]*Unique unreadable diagnostic/u);
  assert.match(html, /<td data-search-refs="2"><span class="source-value">Alias for second reference/u);
  const supplements = [...html.matchAll(/\bdata-search="([^"]*)"/gu)].map((match) => match[1]!);
  assert.deepEqual(supplements, ['claude-opus-4 vendor/claude-opus-4']);
  assert.ok(!supplements.some((value) => value.includes('prompt-word-')));
  assert.ok(html.includes('<pre>prompt-word-0'), 'full prompt remains in the static DOM');
  assert.ok(html.includes('aria-label="Copy the full value"'));
  assert.ok(!html.includes('title="Copy the full value"'), 'accessible name makes duplicate tooltip unnecessary');
  assert.ok(html.includes('title="Unknown: '), 'unknown explanation is retained');
});
