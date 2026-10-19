import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDetailedSessionListingHtml } from '../src/session/detailed-listing.ts';
import { attentionConditions, attentionFlags, renderAttentionPanel } from '../src/session/detailed-attention.ts';
import { groupOccurrences } from '../src/session/listing-model.ts';
import { detailedEvidence, detailedOccurrence } from './detailed-listing-fixture.ts';
import type { SessionOccurrence } from '../src/session/sources.ts';
import type { ListingRelationship } from '../src/session/listing-relationships.ts';

const render = (rows: SessionOccurrence[], options = {}) =>
  formatDetailedSessionListingHtml(rows, new Map(rows.map((row) => [row.occurrenceId, detailedEvidence()])), options, '2026-10-08T19:00:00Z');
const panel = (html: string) => html.match(/<section class="panel attention"[\s\S]*?<\/section>/u)?.[0] ?? '';

const unresolved = (id: string) => detailedOccurrence(id, { backing: { status: 'unresolved', reason: 'no journal' } });
const unsupported = (id: string) => detailedOccurrence(id, { backing: { status: 'unsupported', reason: 'future provider' } });
const ambiguous = (id: string) => detailedOccurrence(id, { diagnostics: [{ path: 'C:\\x', category: 'ambiguous', description: 'two candidates' }] });
const unreadable = (id: string) => detailedOccurrence(id, { diagnostics: [{ path: 'C:\\x', category: 'unreadable', description: 'locked' }] });
const journalOnly = (id: string) => detailedOccurrence(id);
const indexed = (id: string) => {
  const row = detailedOccurrence(id);
  return { ...row, provenance: { ...row.provenance, indexKey: id } };
};

test('a clean inventory shows one line instead of an empty disclosure', () => {
  const html = render([indexed('a'), indexed('b')]);
  assert.match(panel(html), /🛎️ Needs attention:<\/strong> none detected in the checks performed \(2 listed chats\)/u);
  assert.ok(!panel(html).includes('<details'));
});

test('each observed condition is counted once per chat, with a filter button and qualified wording', () => {
  const rows = [unresolved('u'), unsupported('s'), ambiguous('m'), unreadable('r'), journalOnly('j'), indexed('ok')];
  const html = render(rows);
  const text = panel(html);
  assert.match(text, /<summary>.*conditions among 6 listed chats/u);
  for (const flag of ['unresolved', 'unsupported', 'ambiguous', 'journal-only', 'unreadable'])
    assert.ok(text.includes(`data-attention="${flag}"`), flag);
  assert.ok(!text.includes('data-attention="dangling-link"'), 'conditions with no matching chat get no row');
  assert.match(text, /Informational only: a flag is not a deletion or cleanup recommendation/u);
  assert.ok(!/safe to delete/iu.test(text));
  // The same flags the panel counts are the ones a card carries, so a button filters to exactly those chats.
  const chips = new Map([...html.matchAll(/<details class="session-card[^>]*data-title="([^"]*)"[^>]*data-chips="([^"]*)"/gu)].map((match) => [match[1], match[2]!.split(' ')]));
  assert.ok(chips.get('Chat u')!.includes('unresolved'));
  assert.ok(chips.get('Chat s')!.includes('unsupported'));
  assert.ok(chips.get('Chat m')!.includes('ambiguous'));
  assert.ok(chips.get('Chat r')!.includes('unreadable'));
  assert.ok(chips.get('Chat j')!.includes('journal-only'));
  assert.ok(!chips.get('Chat ok')!.some((flag) => ['unresolved', 'unsupported', 'ambiguous', 'unreadable', 'journal-only'].includes(flag)));
});

test('hidden groups are pointed to, not counted, unless ignored rows are requested', () => {
  const hidden = detailedOccurrence('h', { visibility: { status: 'hidden', reason: 'fix' }, backing: { status: 'unresolved', reason: 'x' } });
  const rows = [unresolved('u'), hidden];
  const normal = panel(render(rows));
  assert.match(normal, /1 more chat is hidden by default rules; see <a href="#ignored-sessions">Ignored sessions<\/a>/u);
  assert.match(normal, /<strong>1<\/strong>/u, 'only the listed unresolved chat is counted');
  const shown = panel(render(rows, { showIgnored: true }));
  assert.ok(!shown.includes('hidden by default rules'));
  assert.match(shown, /<strong>2<\/strong>/u);
});

test('a parent or fork source outside the inventory is flagged, an unrelated edge is not', () => {
  const group = groupOccurrences([indexed('child')])[0]!;
  const edge = (kind: ListingRelationship['kind'], to: string | null): ListingRelationship =>
    ({ from: group.key, to, targetLabel: 't', kind, evidence: 'e' });
  assert.ok(attentionFlags(group, detailedEvidence(), [edge('parent', null)]).includes('dangling-link'));
  assert.ok(attentionFlags(group, detailedEvidence(), [edge('fork', null)]).includes('dangling-link'));
  assert.ok(!attentionFlags(group, detailedEvidence(), [edge('parent', 'x')]).includes('dangling-link'));
  assert.ok(!attentionFlags(group, detailedEvidence(), [edge('likely-copy', null)]).includes('dangling-link'));
  assert.ok(attentionFlags(group, detailedEvidence({ state: 'changed' }), []).includes('unreadable'));
});

test('every condition has an explanation and a distinct flag', () => {
  assert.equal(new Set(attentionConditions.map((item) => item.flag)).size, attentionConditions.length);
  for (const item of attentionConditions)
    assert.ok(item.meaning.length > 40 && item.label && item.icon, item.flag);
  const html = renderAttentionPanel(new Map([['audit', 3]]), 10, 0);
  assert.ok(html.includes('🔎 Audit notes') && html.includes('data-attention="audit"'));
});

test('the controller applies a condition filter and clears it with Reset filters', () => {
  const html = render([unresolved('u'), indexed('ok')]);
  const script = html.match(/<script>([\s\S]*?)<\/script>/u)![1];
  assert.match(script, /let attention = '';/u);
  assert.match(script, /if\(attention && !flags\.includes\(attention\)\) return false;/u);
  assert.match(script, /attention = '';\s*apply\(\);\s*\};/u, 'reset clears the condition filter');
  assert.match(script, /\[data-attention\]/u);
});
