import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { snapshotSdkSelection } from '../src/session/sdk-capture.ts';
import { readSdkScope, readUsageForSource, renderSdkExport } from '../src/session/sdk-export.ts';
import type { SdkSelection } from '../src/session/sdk-export.ts';
import { parseAgentHostIdentity } from '../src/session/provider-identity.ts';
import { listSourceCache } from '../src/session/source-cache.ts';

test('selected SDK capture keeps only trimmed events, identity rows and selected usage including child agents', async () => {
  const root = process.env.CCE_CACHE_DIR!;
  const home = path.join(root, 'native-fixture');
  const events = path.join(home, 'session-state', 'synthetic', 'events.jsonl');
  await fs.mkdir(path.dirname(events), { recursive: true });
  await fs.writeFile(events, '{"type":"session.start","data":{"sessionId":"synthetic","version":1}}\n{"type":');
  const db = new DatabaseSync(path.join(home, 'session-store.db'));
  db.exec(`CREATE TABLE assistant_usage_events (id INTEGER PRIMARY KEY, session_id TEXT, created_at TEXT, agent_id TEXT,
    model TEXT, input_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, output_tokens INTEGER,
    reasoning_tokens INTEGER, total_nano_aiu INTEGER, duration_ms INTEGER);
    INSERT INTO assistant_usage_events VALUES
    (1,'synthetic','2026-10-20T10:00:00Z',NULL,'model',1,2,3,4,5,6,7),
    (2,'other','2026-10-20T10:00:00Z',NULL,'other',1,2,3,4,5,6,7),
    (3,'synthetic','2026-10-20T10:00:01Z','child','model',8,2,3,4,5,6,7);
    CREATE TABLE unrelated (secret TEXT); INSERT INTO unrelated VALUES ('not copied');`);
  db.close();
  const provenance = { userDataRoot: root, workspaceStoragePath: root };
  const source: SdkSelection['source'] = {
    kind: 'sdk-events', provider: 'copilot-cli', sessionId: 'synthetic', path: events,
    schemaVersion: 1, producer: null, scope: { kind: 'main' }, chatIdentity: 'copilotcli:/synthetic',
    provenance, identityEvidence: [], identityWarnings: [], scopeWarnings: [], sha256: '',
  };
  const occurrence: SdkSelection['occurrence'] = {
    occurrenceId: 'synthetic', provider: 'copilot-cli', sessionId: 'copilotcli:/synthetic',
    title: 'Selected title', titleSource: 'index', activityTimestamp: null, activitySource: 'unknown',
    provenance, backing: { status: 'verified', source }, visibility: { status: 'included' }, diagnostics: [],
  };
  const capture = await snapshotSdkSelection({ source, occurrence });
  assert.equal(capture.copy.skippedTrailingRecord, true);
  await assert.rejects(fs.stat(`${capture.copy.destination}.recorded`), { code: 'ENOENT' });
  assert.equal(capture.selection.source.sha256, capture.copy.sha256);
  const calls = readUsageForSource(capture.selection.source);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.agentId, 'child');
  const capturedDb = new DatabaseSync(path.join(capture.directory, 'copilot', 'session-store.db'), { readOnly: true });
  try {
    assert.equal(capturedDb.prepare('SELECT count(*) AS n FROM assistant_usage_events').get()?.n, 2);
    assert.equal(capturedDb.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='unrelated'").get()?.n, 0);
  } finally {
    capturedDb.close();
  }
  assert.equal(capture.files.length, 2);
  assert.equal(capture.selection.occurrence.title, 'Selected title');
  const recordedEvents = await readSdkScope(capture.selection.source);
  const renderOptions = { title: 'Selected title', assetsDirectory: 'assets', outputPath: 'export.md',
    generatedAt: '2026-10-20T12:00:00Z', ledger: calls, sourceCopy: capture.copy };
  const defaultExport = renderSdkExport(recordedEvents, capture.selection.source, renderOptions);
  capture.copy.kept = true;
  const keptExport = renderSdkExport(recordedEvents, capture.selection.source, renderOptions);
  assert.equal(keptExport.markdown.replace('> A private source copy was kept in the configured exporter cache for later file verification.\n\n', ''),
    defaultExport.markdown, 'the kept-source notice is the only Markdown difference for the same rendering context');
  assert.deepEqual(keptExport.companions, defaultExport.companions);
  capture.copy.kept = false;
  await fs.appendFile(events, '"user.message","data":{"content":"after"}}\n');
  assert.equal(await fs.readFile(capture.copy.destination, 'utf8'),
    '{"type":"session.start","data":{"sessionId":"synthetic","version":1}}\n');
  const withoutUsageTable = new DatabaseSync(path.join(home, 'session-store.db'));
  withoutUsageTable.exec('DROP TABLE assistant_usage_events');
  withoutUsageTable.close();
  const fallback = await snapshotSdkSelection({ source, occurrence });
  assert.equal(readUsageForSource(fallback.selection.source).length, 0);
  assert.match(fallback.copy.notices?.join('\n') ?? '', /usage table is absent.*recorded event usage/iu);
});

test('a new exact catalog mapping during capture cannot silently replace the selected backing', async (context) => {
  const root = path.join(process.env.CCE_CACHE_DIR!, 'mapping-fixture');
  const key = 'agent-host-copilotcli:/aaaaaaaa-1111-4111-8111-111111111111';
  const identity = parseAgentHostIdentity(key);
  const file = path.join(root, 'copilot', 'session-state', 'synthetic', 'events.jsonl');
  const metadataFile = path.join(root, 'Code', 'agentSessionData', identity.id, 'session.db');
  const catalogFile = path.join(root, 'Code', 'User', 'globalStorage', 'agent-host.db');
  for (const item of [file, metadataFile, catalogFile])
    await fs.mkdir(path.dirname(item), { recursive: true });
  await fs.writeFile(file, '{"type":"session.start","data":{"sessionId":"synthetic","version":1}}\n');
  const metadata = new DatabaseSync(metadataFile);
  metadata.exec('CREATE TABLE session_metadata (key TEXT PRIMARY KEY, value TEXT)');
  metadata.prepare('INSERT INTO session_metadata VALUES (?,?)').run('defaultChatProviderData', '{"sdkSessionId":"synthetic"}');
  metadata.close();
  const provenance = { userDataRoot: path.join(root, 'Code'), workspaceStoragePath: root };
  const source: SdkSelection['source'] = {
    kind: 'sdk-events', provider: 'agent-host', sessionId: 'synthetic', path: file,
    schemaVersion: 1, producer: null, scope: { kind: 'main' }, chatIdentity: identity.chat,
    provenance, identityEvidence: [`${metadataFile}:session_metadata.defaultChatProviderData`],
    identityWarnings: [], scopeWarnings: [], sha256: '',
  };
  const occurrence: SdkSelection['occurrence'] = {
    occurrenceId: 'mapping', provider: 'agent-host', sessionId: key,
    title: 'Mapping', titleSource: 'index', activityTimestamp: null, activitySource: 'unknown',
    provenance, backing: { status: 'verified', source }, visibility: { status: 'included' }, diagnostics: [],
  };
  const before = (await listSourceCache()).map((entry) => entry.directory);
  const open = fs.open;
  context.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args);
    if (args[1] === 'wx' && path.basename(String(args[0])) === 'events.jsonl') {
      const catalog = new DatabaseSync(catalogFile);
      catalog.exec('CREATE TABLE session_chats (session_uri TEXT, chat_uri TEXT, provider_data TEXT)');
      catalog.prepare('INSERT INTO session_chats VALUES (?,?,?)').run(identity.session, identity.chat, '{"sdkSessionId":"remapped"}');
      catalog.close();
    }
    return handle;
  });
  await assert.rejects(snapshotSdkSelection({ source, occurrence }), /mapping changed during capture/u);
  assert.deepEqual((await listSourceCache()).map((entry) => entry.directory), before, 'failed captures and registrations are removed');
});
