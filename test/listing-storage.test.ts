import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { collectListingStorage } from '../src/session/listing-storage.ts';
import { renderDetailedSource, referenceBasis, storageBytes } from '../src/session/detailed-source.ts';
import { groupOccurrences } from '../src/session/listing-model.ts';
import { detailedEvidence, detailedOccurrence } from './detailed-listing-fixture.ts';
import type { ListingEvidence } from '../src/session/listing-evidence-types.ts';
import type { SessionOccurrence, SdkEventSource } from '../src/session/sources.ts';

async function fixture (context: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-storage-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const row = detailedOccurrence('one', { provenance: { userDataRoot: root, workspaceStoragePath: root },
    backing: { status: 'unresolved', reason: 'Fixture has no conversation backing' } });
  return { root, row };
}

test('SQLite measurements keep physical pages separate from UTF-8 stored values and report the index', async (context) => {
  const { root, row } = await fixture(context);
  const file = path.join(root, 'state.vscdb');
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)');
  db.prepare('INSERT INTO ItemTable VALUES (?,?)').run('unicode', '🎨 café');
  db.prepare('INSERT INTO ItemTable VALUES (?,?)').run('chat.ChatSessionStore.index', '{"entries":{}}');
  db.prepare('INSERT INTO ItemTable VALUES (?,?)').run('blob', Buffer.from([1, 2, 3]));
  db.prepare('INSERT INTO ItemTable VALUES (?,?)').run('temporary', Buffer.alloc(100000));
  db.exec("DELETE FROM ItemTable WHERE key='temporary'");
  db.close();
  const before = await fs.readFile(file);
  const data = detailedEvidence();
  await collectListingStorage([row], new Map([[row.occurrenceId, data]]));
  const item = data.storage!.find((item) => item.path === file)!;
  assert.equal(item.state, 'present');
  assert.equal(item.bytes, before.length);
  assert.equal(item.database!.keys, 3);
  assert.equal(item.database!.logicalBytes, Buffer.byteLength('🎨 café') + 14 + 3);
  assert.equal(item.parts.find((part) => part.name === 'Stored value: unicode')!.bytes, Buffer.byteLength('🎨 café'));
  assert.equal(item.parts[0]!.bytes + item.parts[1]!.bytes, before.length);
  assert.ok(item.database!.freeBytes > 0, 'free pages are measured rather than inferred from the logical/physical gap');
  assert.ok(item.parts.some((part) => part.name.includes('chat.ChatSessionStore.index')));
  assert.deepEqual(await fs.readFile(file), before, 'read-only analysis never changes the database');
  const html = renderDetailedSource(groupOccurrences([row])[0]!, new Map([[row.occurrenceId, data]]), 'session-1');
  assert.ok(html.includes('separate logical measure') && html.includes('not additional physical bytes'));
  assert.ok(html.includes('Potential impact if removed'));
  assert.ok(!html.includes('safe to delete'));
});

test('JSONL composition measures recorded bytes including CRLF, Unicode, blanks and invalid records', async (context) => {
  const { root, row } = await fixture(context);
  const file = path.join(root, 'events.jsonl');
  const raw = '{"type":"user.message","text":"🎨"}\r\n\nnot-json\n{"kind":2}';
  await fs.writeFile(file, raw);
  const source: SdkEventSource = { kind: 'sdk-events', provider: 'agent-host', sessionId: 'backing', path: file,
    scope: { kind: 'main' }, schemaVersion: 1, producer: null, chatIdentity: 'chat',
    provenance: row.provenance, sha256: 'fixture', identityEvidence: [], identityWarnings: [], scopeWarnings: [] };
  row.backing = { status: 'verified', source };
  const data = detailedEvidence();
  await collectListingStorage([row], new Map([[row.occurrenceId, data]]));
  const item = data.storage!.find((item) => item.path === file)!;
  assert.equal(item.bytes, Buffer.byteLength(raw));
  assert.equal(item.parts.reduce((sum, part) => sum + part.bytes, 0), Buffer.byteLength(raw));
  assert.equal(item.parts.find((part) => part.name === 'Invalid JSON record')?.count, 1);
  assert.ok(data.diagnostics.some((item) => item.description.includes('invalid JSON')));
  assert.ok(item.parts.some((part) => part.name === 'Journal push / truncate mutation'));
});

test('related directories have measured composition and repeated workspace artifacts reuse cached results', async (context) => {
  const { root, row } = await fixture(context);
  const directory = path.join(root, 'related');
  await fs.mkdir(path.join(directory, 'nested'), { recursive: true });
  await fs.writeFile(path.join(directory, 'nested', 'a'), 'abc');
  await fs.writeFile(path.join(directory, 'b'), '12345');
  const a = detailedEvidence({ artifactLocations: [{ kind: 'related', path: directory, form: 'directory', state: 'present', bytes: 8, files: 2 }] });
  const b = detailedEvidence();
  const other = { ...row, occurrenceId: 'two' };
  await collectListingStorage([row, other], new Map([[row.occurrenceId, a], [other.occurrenceId, b]]));
  const item = a.storage!.find((item) => item.path === directory)!;
  assert.equal(item.bytes, 8);
  assert.equal(item.files, 2);
  assert.deepEqual(item.parts.map((part) => [part.name, part.bytes]), [['b', 5], ['nested', 3]]);
  assert.equal(a.storage![0], b.storage![0], 'same workspace.json inspection reused by both occurrences');
  assert.equal(a.storage![0]!.state, 'missing');
  assert.deepEqual(a.storage![0]!.sharedBy, { occurrences: 2, conversations: 2 }, 'unresolved occurrences are not merged based on shared paths');
});

test('unreadable database composition retains physical length but explicitly reports failure', async (context) => {
  const { root, row } = await fixture(context);
  await fs.writeFile(path.join(root, 'state.vscdb'), 'not a sqlite file');
  const data = detailedEvidence();
  await collectListingStorage([row], new Map([[row.occurrenceId, data]]));
  const item = data.storage!.find((item) => item.kind === 'state.vscdb')!;
  assert.equal(item.state, 'unreadable');
  assert.equal(item.bytes, 17);
  assert.equal(item.parts.length, 0);
  assert.ok(data.diagnostics.some((item) => item.path.endsWith('state.vscdb')));
});

test('composition is suppressed if a file changes during analysis', async (context) => {
  const { root, row } = await fixture(context);
  const file = path.join(root, 'changed.jsonl');
  await fs.writeFile(file, '{"type":"one"}\n');
  const originalStat = fs.stat;
  context.mock.method(fs, 'stat', async (candidate: string) => {
    candidate === file && await fs.appendFile(file, '{"type":"two"}\n');
    return originalStat(candidate);
  });
  const data = detailedEvidence({ artifacts: [{ path: file, bytes: 15 }] });
  await collectListingStorage([row], new Map([[row.occurrenceId, data]]));
  const item = data.storage!.find((item) => item.path === file)!;
  assert.equal(item.state, 'changed');
  assert.deepEqual(item.parts, []);
  assert.ok(data.diagnostics.some((item) => item.description.includes('changed during storage')));
});

test('directory links are not followed or counted as owned session storage', async (context) => {
  const { root, row } = await fixture(context);
  const target = path.join(root, 'target');
  const link = path.join(root, 'link');
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'content'), 'private');
  await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  const data = detailedEvidence({ artifactLocations: [{ kind: 'related', path: link, state: 'present', form: 'directory', bytes: null, files: null }] });
  await collectListingStorage([row], new Map([[row.occurrenceId, data]]));
  const item = data.storage!.find((item) => item.path === link)!;
  assert.equal(item.state, 'unreadable');
  assert.equal(item.bytes, null);
  assert.ok(data.diagnostics.some((item) => item.description.includes('link not followed')));
});

test('source UI attributes different child IDs to the right references without inventing primary/copy', () => {
  const source = detailedOccurrence('child').backing;
  assert.equal(source.status, 'verified');
  const parent = detailedOccurrence('parent');
  const provenance = { ...parent.provenance, workspaceIdentity: { kind: 'folder' as const, uri: 'file:///c%3A/work/project' } };
  const backing: SessionOccurrence['backing'] = { status: 'verified', source: {
    kind: 'sdk-events', provider: 'agent-host', path: 'C:\\sdk\\events.jsonl', sessionId: 'backing',
    schemaVersion: 1, producer: 'sdk', scope: { kind: 'subagent', agentId: 'agent', parentToolCallId: 'tool', evidenceRecordIds: ['record'] },
    chatIdentity: 'parent-chat', provenance, sha256: 'hash',
    identityEvidence: ['C:\\Code\\User\\globalStorage\\agent-host.db:session_chats.provider_data:parent-chat'],
    identityWarnings: [], scopeWarnings: [],
  } };
  const a = detailedOccurrence('one', { sessionId: 'child-derived', parentOccurrenceId: 'parent-a', backing, provenance });
  const b = { ...a, occurrenceId: 'two', sessionId: 'child-encoded', parentOccurrenceId: 'parent-b',
    provenance: { ...provenance, workspaceStoragePath: 'C:\\other', indexKey: 'persisted-child' } };
  const data = new Map([
    ['one', detailedEvidence({ titles: [{ source: 'index.title', value: 'First reference title' }] })],
    ['two', detailedEvidence({ titles: [{ source: 'index.title', value: 'Second reference title' }] })],
  ]);
  const html = renderDetailedSource(groupOccurrences([a, b])[0]!, data, 'session-50');
  assert.equal(referenceBasis(a), 'Derived through parent');
  assert.equal(referenceBasis(b), 'Persisted index entry');
  assert.ok(html.includes('no own index entry') && html.includes('Shared parent backing · scoped child'));
  assert.match(html, /Full session ID<\/th><td data-search-refs="1">[^<]*<span[^>]*>child-derived<\/span><\/td><td><span[^>]*>W1<\/span><\/td>/u);
  assert.match(html, /child-encoded<\/span><\/td><td><span[^>]*>W2<\/span><\/td>/u);
  assert.match(html, /First reference title<\/span><\/td><td><span[^>]*>W1<\/span><\/td>/u);
  assert.match(html, /Second reference title<\/span><\/td><td><span[^>]*>W2<\/span><\/td>/u);
  assert.ok(!html.includes('primary') && !html.includes('session.db'), 'direct global evidence route is not a guessed session.db chain');
  assert.ok(!html.includes('all values are identical'));
});

test('the evidence table has one row per artifact and no constant Field column', async (context) => {
  const { root, row } = await fixture(context);
  const file = path.join(root, 'workspace.json');
  await fs.writeFile(file, '{}');
  const data = detailedEvidence({ artifactLocations: [{ kind: 'related', path: file, state: 'present', form: 'file', bytes: 2, files: null }] });
  await collectListingStorage([row], new Map([[row.occurrenceId, data]]));
  const html = renderDetailedSource(groupOccurrences([row])[0]!, new Map([[row.occurrenceId, data]]), 'session-1');
  const start = html.indexOf('class="unified-evidence"');
  const table = html.slice(start, html.indexOf('</table>', start));
  assert.match(table, /<thead><tr><th>Artifact<\/th><th>Value<\/th><th>Size \/ state<\/th><th>Tied to<\/th><th>Purpose<\/th><th>Potential impact if removed<\/th><\/tr><\/thead>/u);
  assert.ok(!table.includes('<th>Field</th>') && !table.includes('<td>Location</td>'));
});

test('an empty-window reference is labeled as such and does not look for workspace.json', async (context) => {
  const { root, row } = await fixture(context);
  const emptyWindow = { ...row, provenance: { ...row.provenance, store: 'empty-window' as const } };
  const data = detailedEvidence();
  await collectListingStorage([emptyWindow], new Map([[emptyWindow.occurrenceId, data]]));
  assert.ok(!data.storage!.some((item) => item.path.endsWith('workspace.json')));
  const html = renderDetailedSource(groupOccurrences([emptyWindow])[0]!, new Map([[emptyWindow.occurrenceId, data]]), 'session-1');
  assert.ok(html.includes('(empty window)'), root);
});

test('storage size presentation keeps exact bytes regular/narrow and the abbreviated size bold', () => {
  assert.equal(storageBytes(19606580), '<span class="storage-size"><strong>18.7 MB</strong> <span class="exact-bytes">19,606,580 bytes</span></span>');
  assert.ok(storageBytes(null).includes('title="Size not measured">?</span>'));
});
