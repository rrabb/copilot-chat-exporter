import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import test from 'node:test';
import { formatDetailedSessionListingHtml } from '../src/session/detailed-listing.ts';
import { listingRelationships } from '../src/session/listing-relationships.ts';
import { groupOccurrences } from '../src/session/listing-model.ts';
import { detailedEvidence, detailedOccurrence } from './detailed-listing-fixture.ts';
import { detailedBytes, detailedTitle, detailedTitles, detailedWorkspace, detailedChatType, detailedMetrics } from '../src/session/detailed-listing-presentation.ts';

test('detailed report contains requested identification sections with static executable code and hash CSP', () => {
  const row = detailedOccurrence('one', { title: '</script><script>alert(1)</script>' });
  const prompt = Array.from({ length: 71 }, (_, index) => `word${index + 1}`).join(' ');
  const evidence = detailedEvidence();
  evidence.turns[0]!.prompt = `${prompt} <img src=x onerror=alert(2)>`;
  const html = formatDetailedSessionListingHtml([row], new Map([['one', evidence]]), {}, '2026-10-08T19:00:00Z');
  for (const id of ['conversation-index', 'models-used', 'storage-guide', 'ids-sizes', 'how-to', 'audit-legend', 'ignored-sessions', 'comparison'])
    assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('Titles at each storage level'));
  assert.ok(html.includes('Dates and provenance'));
  assert.ok(html.includes('Model-switch timeline'));
  assert.ok(html.includes('Workspace occurrences'));
  assert.ok(html.includes('Full prompt'));
  assert.ok(html.includes('. . . . .'));
  assert.ok(html.includes('Effort: high'));
  assert.ok(html.includes('Recorded automatic model selection'));
  assert.ok(html.includes('answer-model'));
  assert.ok(!html.includes('<img src=x onerror'));
  assert.ok(!html.includes('<script>alert'));
  const script = html.match(/<script>([\s\S]*?)<\/script>/u)![1];
  assert.equal((html.match(/<script>/gu) ?? []).length, 1);
  assert.ok(!script.includes('word1'));
  const hash = createHash('sha256').update(script).digest('base64');
  assert.ok(html.includes(`script-src 'sha256-${hash}'`));
  new Script(script);
  assert.throws(() => formatDetailedSessionListingHtml([], new Map(), {}, 'invalid'), /valid timestamp/);
});
test('ignored groups retain full evidence, anchors are unique and multi-workspace Local selectors require exact paths', () => {
  const a = detailedOccurrence('11111111-1111-4111-8111-111111111111');
  const duplicate = { ...a, occurrenceId: 'duplicate', provenance: { ...a.provenance, workspaceStoragePath: 'C:\\other' } };
  const ignored = detailedOccurrence('ignored', { visibility: { status: 'hidden', reason: 'new-chat-unknown' }, promptCount: null, createdTimestamp: null });
  const rows = [a, duplicate, ignored];
  const evidence = new Map(rows.map((row) => [row.occurrenceId, detailedEvidence()]));
  evidence.set('ignored', detailedEvidence({ state: 'unavailable', turns: [], models: [] }));
  const html = formatDetailedSessionListingHtml(rows, evidence, { showIgnored: true, last25: true }, '2026-10-08T19:00:00Z');
  const ids = [...html.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(html.includes('Local export: exact path required'));
  assert.ok(html.includes('Ignored: new-chat-unknown'));
  assert.ok(!html.includes('session-2-ignored'), 'ignored cards are not rendered twice with --show-ignored');
  assert.equal((html.match(/class="session-card /gu) ?? []).length, 2);
  assert.ok(!html.includes('unexpected visibility'), '--show-ignored is not an unexpected visibility condition');
  assert.ok(html.includes('data-prompts=""'));
  assert.ok(html.includes('data-models="[&quot;answer-model&quot;]"'));
  assert.ok(html.includes('All ignored groups and their reasons'));
});
test('cards collapse natively with type-colored headers, early title provenance, compact dates and unduplicated full prompts', () => {
  const row = detailedOccurrence('one', { provenance: {
    userDataRoot: 'C:\\Code', workspaceStoragePath: 'C:\\Code\\hash',
    workspaceIdentity: { kind: 'folder', uri: 'file:///C:/project/my-app' },
  } });
  const evidence = detailedEvidence({
    bytes: 10397753,
    titles: [{ source: 'journal.customTitle', value: 'Recorded title' }, { source: 'index.title', value: 'Recorded title' }, { source: 'derived.firstPrompt', value: 'First question' }],
    dates: [
      { source: 'journal.creationDate', timestamp: 1700000000000, recordedValue: '1700000000000' },
      { source: 'request.1.timestamp', timestamp: 1700000000000, recordedValue: '1700000000000' },
      { source: 'prompt.1.timestamp', timestamp: 1700000000000, recordedValue: '1700000000000' },
    ],
  });
  evidence.turns[0]!.credits = 43.5;
  evidence.turns[0]!.files = [{ file: 'a.ts', operation: 'modified', added: 12, removed: 3, estimated: false, source: 'tool' }];
  const html = formatDetailedSessionListingHtml([row], new Map([['one', evidence]]), {}, '2026-10-08T19:00:00Z');
  assert.match(html, /<details class="session-card chat-local"[^>]*>\s*<summary class="session-summary">/u);
  assert.equal((html.match(/data-pin="session-1"/gu) ?? []).length, 1);
  assert.ok(html.indexOf('title-provenance') < html.indexOf('🗨️ Ordered prompts'));
  assert.ok(html.includes('journal.customTitle · index.title'));
  assert.ok(html.includes('derived.firstPrompt'));
  assert.ok(html.includes('title="file:///C:/project/my-app">📁 my-app'));
  assert.ok(html.includes('title="human"'));
  assert.ok(html.includes('44c'));
  assert.ok(html.includes('class="added">+12'));
  assert.ok(html.includes('class="removed">-3'));
  assert.ok(!html.includes('<details class="full-prompt">'), 'short complete prompt is not repeated in a disclosure');
  assert.ok(html.includes('<strong>9.9 MB</strong> <span class="exact-bytes">10,397,753 bytes</span>'));
  assert.match(html, /<details><summary>Prompt \/ request timestamps \(2\)<\/summary>/u);
  assert.ok(html.indexOf('id="conversation-index"') < html.indexOf('id="grouped-view"'));
});
test('child display title uses real alternate references or recorded description and falls back to parent title without mutating identity', () => {
  const parent = detailedOccurrence('parent', { title: 'Parent title', provenance: {
    userDataRoot: 'C:\\Code', workspaceStoragePath: 'C:\\Code\\parent',
    workspaceIdentity: { kind: 'folder', uri: 'file:///C:/parent/project' },
  } });
  const child = detailedOccurrence('host:/id#subagent/call', { title: 'Subagent 11111111-1111-4111-8111-111111111111', titleSource: 'fallback', parentOccurrenceId: 'parent', provider: 'agent-host' });
  const group = groupOccurrences([child])[0]!;
  const original = JSON.stringify(group);
  assert.equal(detailedTitle(group, [], 'Parent title'), 'Subagent (Parent title)');
  assert.equal(detailedTitle(group, [{ source: 'delegation.arguments.description', value: 'Resolve hosted session transcripts' }]), 'Resolve hosted session transcripts');
  const indexed = { ...child, occurrenceId: 'indexed', title: 'Indexed child title', titleSource: 'index' as const };
  group.occurrences.push(indexed);
  assert.equal(detailedTitle(group, []), 'Indexed child title');
  group.occurrences.pop();
  assert.equal(JSON.stringify(group), original);
  const titles = detailedTitles(group, new Map([[child.occurrenceId, detailedEvidence({ titles: [
    { source: 'delegation.arguments.description', value: 'Resolve hosted session transcripts' },
  ] })]]));
  const workspace = detailedWorkspace(group, groupOccurrences([parent])[0]);
  assert.equal(workspace.name, 'project');
  assert.equal(workspace.inherited, true);
  const html = formatDetailedSessionListingHtml([parent, child], new Map([[child.occurrenceId, detailedEvidence({ titles })]]), {}, '2026-10-08T19:00:00Z');
  assert.ok(html.includes('class="session-title">Resolve hosted session transcripts'));
  assert.ok(html.includes('delegation.arguments.description'));
  assert.ok(html.includes('chat-child'));
});
test('presentation preserves unknown sizes and gives each provider its own semantic type', () => {
  assert.equal(detailedBytes(null), 'unknown');
  assert.equal(detailedBytes(0), '0 bytes (0.0 MB)');
  assert.equal(detailedChatType(detailedOccurrence('x', { provider: 'external' })).key, 'external');
  assert.equal(detailedChatType(detailedOccurrence('x', { provider: 'unknown' })).key, 'other');
  assert.equal(detailedChatType(detailedOccurrence('x', { provider: 'copilot-cli' })).label, 'Copilot CLI');
  const group = groupOccurrences([detailedOccurrence('x', { provenance: {
    userDataRoot: 'C:\\Code', workspaceStoragePath: 'C:\\Code\\x', workspaceIdentity: { kind: 'folder', uri: 'file:///broken/%zz' },
  } })])[0]!;
  assert.match(detailedWorkspace(group).uri, /invalid URI encoding/u);
});
test('nested missing child titles use the displayed parent title and cyclic input cannot recurse indefinitely', () => {
  const ancestor = detailedOccurrence('ancestor', { title: 'Ancestor task' });
  const child = detailedOccurrence('host:/id#subagent/one', { title: '', titleSource: 'fallback', parentOccurrenceId: 'ancestor' });
  const grandchild = detailedOccurrence('host:/id#subagent/two', { title: '', titleSource: 'fallback', parentOccurrenceId: child.occurrenceId });
  const html = formatDetailedSessionListingHtml([ancestor, child, grandchild], new Map(), {}, '2026-10-08T19:00:00Z');
  assert.ok(html.includes('class="session-title">Subagent (Subagent (Ancestor task))'));
  ancestor.parentOccurrenceId = grandchild.occurrenceId;
  assert.doesNotThrow(() => formatDetailedSessionListingHtml([ancestor, child, grandchild], new Map(), {}, '2026-10-08T19:00:00Z'));
});
test('newest-25 detailed mode keeps all TOC targets while showing exactly 25 collapsed main cards', () => {
  const rows = Array.from({ length: 30 }, (_, index) => detailedOccurrence(`row-${index}`, { activityTimestamp: 1700000000000 + index }));
  const html = formatDetailedSessionListingHtml(rows, new Map(rows.map((row) => [row.occurrenceId, detailedEvidence()])), { last25: true }, '2026-10-08T19:00:00Z');
  const cards = [...html.matchAll(/<details class="session-card [^>]+>/gu)].map(([tag]) => tag);
  assert.equal(cards.length, 30);
  assert.equal(cards.filter((tag) => !tag.includes(' hidden')).length, 25);
  assert.ok(cards.every((tag) => !/\bopen\b/u.test(tag)));
  assert.ok(html.includes('Session TOC / grouped conversation index (30)'));
  assert.ok(html.includes('data-limited="true"'));
});
test('rich SDK headers, filters, index and initial ordering use every recorded child follow-up and last scoped event', () => {
  const base = detailedOccurrence('base');
  const row = { ...base, sessionId: 'host:/id#subagent/call', title: 'Subagent child', titleSource: 'fallback' as const, backing: { status: 'verified' as const, source: {
    kind: 'sdk-events' as const, provider: 'agent-host' as const, sessionId: 'backing',
    path: 'C:\\events.jsonl', schemaVersion: 1, sha256: 'sha', producer: null,
    scope: { kind: 'subagent' as const, agentId: 'child', parentToolCallId: 'call', evidenceRecordIds: ['e'] },
    chatIdentity: 'chat', provenance: base.provenance, identityEvidence: [], identityWarnings: [], scopeWarnings: [],
  } } };
  const data = detailedEvidence();
  data.turns = [data.turns[0]!, { ...data.turns[0]!, role: 'follow-up', id: 'second', prompt: 'Later task' }];
  data.dates = [
    { source: 'events.line:3.timestamp', timestamp: 1700000000000, recordedValue: 'first' },
    { source: 'events.line:25.timestamp', timestamp: 1800000000000, recordedValue: 'last' },
    { source: 'filesystem.mtime', timestamp: 1900000000000, recordedValue: 'filesystem' },
  ];
  const group = groupOccurrences([row])[0]!;
  assert.deepEqual(detailedMetrics(group, data), { turns: 2, created: 1700000000000, updated: 1800000000000 });
  const other = detailedOccurrence('other', { activityTimestamp: 1750000000000 });
  const html = formatDetailedSessionListingHtml([other, row], new Map([['base', data], ['other', detailedEvidence()]]), {}, '2026-10-08T19:00:00Z');
  assert.match(html, /data-title="Subagent \(parent title unavailable\)"[^>]+data-prompts="2"[^>]+data-updated="1800000000000"/u);
  assert.ok(html.includes('2 turns</strong>'));
  assert.ok(html.includes('agentID: <code>child</code>'));
  assert.ok(html.indexOf('id="session-1" data-main="true"') < html.indexOf('id="session-2" data-main="true"'));
  assert.equal(group.promptCount, 1, 'rich presentation never mutates compact inventory policy');
  assert.equal(detailedMetrics(group, detailedEvidence({ state: 'changed' })).turns, 1);
  assert.equal(detailedMetrics(group, { ...data, flags: ['incomplete-prompt-evidence'] }).turns, null);
});
test('relationship hints never alter grouping and tied fork candidates do not invent direction', () => {
  const fork = detailedOccurrence('fork', { title: 'Forked: task' });
  const a = detailedOccurrence('a');
  const b = detailedOccurrence('b');
  const first = detailedEvidence();
  const longer = detailedEvidence({ turns: [...first.turns, { ...first.turns[0]!, id: 'two', prompt: 'Second' }] });
  const groups = groupOccurrences([fork, a, b]);
  const evidence = new Map([['fork', first], ['a', longer], ['b', longer]]);
  const before = JSON.stringify(groups);
  assert.equal(listingRelationships(groups, evidence).filter((edge) => edge.kind === 'likely-fork').length, 0);
  evidence.delete('b');
  assert.equal(listingRelationships(groups, evidence).filter((edge) => edge.kind === 'likely-fork').length, 1);
  const html = formatDetailedSessionListingHtml([fork, a, b], evidence, {}, '2026-10-08T19:00:00Z');
  assert.ok(html.includes('<span class="glyph">⑂?</span> Likely fork'));
  assert.ok(html.includes('class="tag tone-hint" title="Unproven content-based hint; not identity evidence"'));
  assert.ok(!html.includes('tone-likely'));
  assert.equal(JSON.stringify(groups), before);
});
test('verified parent relationships retain missing target and do not use inferred copies for identity', () => {
  const parent = detailedOccurrence('parent');
  const child = detailedOccurrence('child', { parentOccurrenceId: 'parent' });
  const orphan = detailedOccurrence('orphan', { parentOccurrenceId: 'missing' });
  const groups = groupOccurrences([parent, child, orphan]);
  const evidence = new Map([['parent', detailedEvidence()], ['child', detailedEvidence()], ['orphan', detailedEvidence()]]);
  const edges = listingRelationships(groups, evidence);
  assert.equal(edges.filter((edge) => edge.kind === 'parent').length, 2);
  assert.ok(edges.some((edge) => edge.kind === 'parent' && edge.to === null));
  const html = formatDetailedSessionListingHtml([parent, child, orphan], evidence, {}, '2026-10-08T19:00:00Z');
  assert.ok(html.includes('Recorded parent breadcrumbs'));
  assert.ok(html.includes('outside this inventory or non-unique target'));
});
