import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createProviderSourceResolver } from '../src/session/provider-sources.ts';
import { chatDataKey, defaultChat, parseAgentHostIdentity } from '../src/session/provider-identity.ts';
import { eventsInScope, readSdkEvents } from '../src/session/sdk-events.ts';
import { inventorySessions } from '../src/session/inventory.ts';

async function fixture (context: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-provider-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'copilot');
  const provenance = { userDataRoot: root, workspaceStoragePath: path.join(root, 'User', 'workspaceStorage', 'hash') };
  const resolver = createProviderSourceResolver({ copilotHome: home });
  async function events (id: string, extra: unknown[] = []) {
    const file = path.join(home, 'session-state', id, 'events.jsonl');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, [JSON.stringify({
      id: 'start', type: 'session.start', data: { sessionId: id, version: 1, producer: 'synthetic-test' },
    }), ...extra.map((event) => JSON.stringify(event))].join('\n'));
    return file;
  }
  async function metadata (directory: string, key?: string, value?: unknown) {
    const file = path.join(root, 'agentSessionData', directory, 'session.db');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    try {
      db.exec('CREATE TABLE session_metadata (key TEXT PRIMARY KEY, value TEXT)');
      key && db.prepare('INSERT INTO session_metadata VALUES (?, ?)').run(key, JSON.stringify(value));
    } finally {
      db.close();
    }
    return file;
  }
  async function catalog (entries: { chat: string; id: string }[]) {
    const file = path.join(root, 'User', 'globalStorage', 'agent-host.db');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    try {
      db.exec('CREATE TABLE session_chats (session_uri TEXT, chat_uri TEXT, provider_data TEXT)');
      for (const entry of entries)
        db.prepare('INSERT INTO session_chats VALUES (?, ?, ?)').run('copilotcli:/owner', entry.chat, JSON.stringify({ sdkSessionId: entry.id }));
    } finally {
      db.close();
    }
  }
  return { root, home, provenance, resolver, events, metadata, catalog };
}

test('Agent Host exact persisted mapping may differ from provider ID', async (context) => {
  const { resolver, provenance, metadata, events } = await fixture(context);
  const chat = defaultChat('copilotcli:/owner');
  await metadata(chatDataKey(chat), 'agentHost.chatProviderData', { sdkSessionId: 'backing-one' });
  await events('backing-one');
  const result = await resolver.resolve('agent-host-copilotcli:/owner', provenance);
  assert.equal(result.source.sessionId, 'backing-one');
  assert.equal(result.source.chatIdentity, chat);
  assert.deepEqual(result.source.identityWarnings, []);
  assert.match(result.source.identityEvidence[0], /agentHost.chatProviderData/);
});

test('user-approved default fallback requires database and header; warning survives resolution', async (context) => {
  const { resolver, provenance, metadata, events } = await fixture(context);
  await metadata('owner');
  await events('owner');
  const source = (await resolver.resolve('agent-host-copilotcli:/owner', provenance)).source;
  assert.equal(source.sessionId, 'owner');
  assert.equal(source.identityWarnings.length, 1);
  assert.match(source.identityWarnings[0], /fallback/);
  await events('missing-db');
  await assert.rejects(resolver.resolve('agent-host-copilotcli:/missing-db', provenance), /fallback refused/);
});

test('central exact peer backing overrides stale compatibility mirrors, not title proximity', async (context) => {
  const { resolver, provenance, metadata, events, catalog } = await fixture(context);
  const encoded = Buffer.from('copilotcli:/owner').toString('base64url');
  const peer = `ahp-chat://peer-one/${encoded}`;
  await catalog([{ chat: peer, id: 'peer-backing' }]);
  await metadata(chatDataKey(peer), 'agentHost.chatProviderData', { sdkSessionId: 'stale' });
  await events('peer-backing');
  const source = (await resolver.resolve('agent-host-copilotcli:/owner#peer-one', provenance)).source;
  assert.equal(source.sessionId, 'peer-backing');
  assert.match(source.identityEvidence[0], /session_chats/);
});

test('exact child scope maps toolCallId to agentId and excludes other/main payloads', async (context) => {
  const { resolver, provenance, metadata, events } = await fixture(context);
  await metadata('owner', 'defaultChatProviderData', { sdkSessionId: 'backing' });
  const file = await events('backing', [
    { id: 'main', type: 'assistant.message', data: { content: 'Main' } },
    {
      id: 'binding', type: 'subagent.started', timestamp: '2026-10-01T12:00:00.000Z',
      agentId: 'agent-one', data: { toolCallId: 'call-one' },
    },
    { id: 'main-prompt', type: 'user.message', data: { content: 'Main request' } },
    { id: 'child-prompt-one', type: 'user.message', agentId: 'agent-one', data: { content: 'Child context one' } },
    { id: 'child-prompt-two', type: 'user.message', agentId: 'agent-one', data: { content: 'Child context two' } },
    { id: 'child-injected', type: 'user.message', agentId: 'agent-one', data: { source: 'system', content: 'Injected' } },
    { id: 'child', type: 'assistant.message', agentId: 'agent-one', data: { content: 'Child', futureField: [1, 2] }, futureEnvelope: 'retain me' },
    { id: 'other', type: 'assistant.message', agentId: 'other-agent', data: { content: 'Other' } },
    { id: 'delegated', type: 'tool.execution_start', data: { parentToolCallId: 'call-one' } },
  ]);
  const result = await resolver.resolve('agent-host-copilotcli:/owner#subagent/call-one', provenance);
  assert.deepEqual(result.source.scope, {
    kind: 'subagent', agentId: 'agent-one', parentToolCallId: 'call-one', evidenceRecordIds: ['binding'],
  });
  assert.equal(result.promptCount, 3);
  assert.equal(result.createdTimestamp, Date.parse('2026-10-01T12:00:00.000Z'));
  assert.equal((await resolver.resolve('agent-host-copilotcli:/owner', provenance)).promptCount, 1);
  const read = await readSdkEvents(file, 'backing');
  assert.deepEqual(eventsInScope(read.events, result.source.scope).map((event) => event.id), [
    'binding', 'child-prompt-one', 'child-prompt-two', 'child-injected', 'child',
  ]);
  assert.deepEqual(eventsInScope(read.events, { kind: 'main' }).map((event) => event.id), [
    'start', 'main', 'main-prompt',
  ]);
  const child = read.events.find((event) => event.id === 'child');
  assert.equal(child?.raw.futureEnvelope, 'retain me');
  assert.deepEqual(child?.data.futureField, [1, 2]);
});

test('child may originate in a persisted peer; duplicate origins remain unresolved', async (context) => {
  const { resolver, provenance, metadata, events, catalog } = await fixture(context);
  const peer = `ahp-chat://peer/${Buffer.from('copilotcli:/owner').toString('base64url')}`;
  await metadata('owner', 'defaultChatProviderData', { sdkSessionId: 'main' });
  await events('main');
  await events('peer', [{ id: 'bind', type: 'subagent.started', agentId: 'child', data: { toolCallId: 'call' } }]);
  await catalog([{ chat: peer, id: 'peer' }]);
  assert.equal((await resolver.resolve('agent-host-copilotcli:/owner#subagent/call', provenance)).source.sessionId, 'peer');
  await events('main', [{ id: 'dup', type: 'subagent.started', agentId: 'child', data: { toolCallId: 'call' } }]);
  const fresh = createProviderSourceResolver({ copilotHome: path.join(provenance.userDataRoot, 'copilot') });
  await assert.rejects(fresh.resolve('agent-host-copilotcli:/owner#subagent/call', provenance), /2 matches/);
});

test('unreadable peer prevents a uniqueness claim', async (context) => {
  const { resolver, provenance, metadata, events, catalog } = await fixture(context);
  const peer = `ahp-chat://peer/${Buffer.from('copilotcli:/owner').toString('base64url')}`;
  await metadata('owner', 'defaultChatProviderData', { sdkSessionId: 'main' });
  await events('main', [{ type: 'subagent.started', agentId: 'child', data: { toolCallId: 'call' } }]);
  await catalog([{ chat: peer, id: 'missing' }]);
  await assert.rejects(resolver.resolve('agent-host-copilotcli:/owner#subagent/call', provenance), /unavailable candidates/);
});

test('SDK header, malformed tails, strict UTF-8 and ambiguous bindings fail explicitly', async (context) => {
  const { resolver, provenance, events } = await fixture(context);
  const file = await events('one');
  await fs.writeFile(file, JSON.stringify({ type: 'session.start', data: { sessionId: 'wrong', version: 1 } }));
  await assert.rejects(resolver.resolve('copilotcli:/one', provenance), /identity\/version/);
  const tail = await events('two');
  await fs.appendFile(tail, '\n{"unfinished":');
  await assert.rejects(resolver.resolve('copilotcli:/two', provenance), /not valid JSON/);
  const utf = await events('three');
  await fs.appendFile(utf, Buffer.from([0xff]));
  await assert.rejects(resolver.resolve('copilotcli:/three', provenance), /encoded data/);
  await events('four', [
    { type: 'subagent.started', agentId: 'a', data: { toolCallId: 'call' } },
    { type: 'subagent.started', agentId: 'b', data: { toolCallId: 'call' } },
  ]);
  const main = await resolver.resolve('copilotcli:/four', provenance);
  assert.equal(main.source.scope.kind, 'main');
  assert.equal(main.children.length, 0);
  assert.match(main.source.scopeWarnings[0], /ambiguous/);
  assert.equal(main.childProblems[0].toolCallId, 'call');
});

test('provider keys reject traversal, remote, placeholder and conflicting chat identity', async (context) => {
  const { resolver, provenance } = await fixture(context);
  for (const key of ['copilotcli:/../escape', 'copilotcli:/untitled-one'])
    await assert.rejects(resolver.resolve(key, provenance));
  for (const key of ['agent-host-copilotcli://remote/id', 'agent-host-copilotcli:/%2e%2e',
    'agent-host-copilotcli:/owner?unknown=x'])
    assert.throws(() => parseAgentHostIdentity(key));
});

test('inventory verifies CLI sources while preserving unresolved diagnostics and native storage', async (context) => {
  const { root, home, provenance, events } = await fixture(context);
  await fs.mkdir(provenance.workspaceStoragePath, { recursive: true });
  const database = new DatabaseSync(path.join(provenance.workspaceStoragePath, 'state.vscdb'));
  try {
    database.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)');
    database.prepare('INSERT INTO ItemTable VALUES (?, ?)').run('chat.ChatSessionStore.index', JSON.stringify({
      version: 1, entries: { 'copilotcli:/one': { title: 'One' }, 'copilotcli:/missing': {} },
    }));
  } finally {
    database.close();
  }
  const file = await events('one');
  const original = await fs.readFile(file);
  const result = await inventorySessions(root, { copilotHome: home });
  const rows = new Map(result.occurrences.map((row) => [row.sessionId, row]));
  assert.equal(rows.get('copilotcli:/one')?.backing.status, 'verified');
  assert.equal(rows.get('copilotcli:/missing')?.backing.status, 'unresolved');
  assert.ok(result.diagnostics.length);
  assert.deepEqual(await fs.readFile(file), original);
});

test('inventory expands exact child scopes once and links immediate nested parents', async (context) => {
  const { root, home, provenance, events } = await fixture(context);
  await fs.mkdir(provenance.workspaceStoragePath, { recursive: true });
  const db = new DatabaseSync(path.join(provenance.workspaceStoragePath, 'state.vscdb'));
  try {
    db.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)');
    db.prepare('INSERT INTO ItemTable VALUES (?, ?)').run('chat.ChatSessionStore.index',
      JSON.stringify({ version: 1, entries: { 'copilotcli:/one': {} } }));
  } finally {
    db.close();
  }
  await events('one', [
    { id: 'call-root', type: 'tool.execution_start', data: { toolCallId: 'first' } },
    { id: 'bind-first', type: 'subagent.started', agentId: 'first-agent', data: { toolCallId: 'first' } },
    { id: 'call-nested', type: 'tool.execution_start', agentId: 'first-agent', data: { toolCallId: 'second' } },
    { id: 'bind-second', type: 'subagent.started', agentId: 'second-agent', data: { toolCallId: 'second' } },
    { id: 'answer', type: 'assistant.message', agentId: 'second-agent', timestamp: '2026-10-08T15:00:00Z', data: { content: 'Nested answer' } },
  ]);
  const result = await inventorySessions(root, { copilotHome: home });
  assert.equal(result.occurrences.length, 3);
  const main = result.occurrences.find((row) => row.sessionId === 'copilotcli:/one')!;
  const first = result.occurrences.find((row) => row.sessionId.endsWith('/first'))!;
  const second = result.occurrences.find((row) => row.sessionId.endsWith('/second'))!;
  assert.equal(first.parentOccurrenceId, main.occurrenceId);
  assert.equal(second.parentOccurrenceId, first.occurrenceId);
  assert.equal(second.activityTimestamp, Date.parse('2026-10-08T15:00:00Z'));
  assert.deepEqual(result.diagnostics, []);
});

test('CLI workspace identity disagreement is never silently ignored', async (context) => {
  const { resolver, provenance, events } = await fixture(context);
  const file = await events('one');
  await fs.writeFile(path.join(path.dirname(file), 'workspace.yaml'), 'id: wrong\nname: Looks plausible\n');
  await assert.rejects(resolver.resolve('copilotcli:/one', provenance), /workspace.yaml identity/);
});

test('resolver detects a changed backing instead of reusing stale scope evidence', async (context) => {
  const { resolver, provenance, events } = await fixture(context);
  const file = await events('one');
  await resolver.resolve('copilotcli:/one', provenance);
  await fs.appendFile(file, '\n{"type":"session.resume","data":{}}');
  await assert.rejects(resolver.resolve('copilotcli:/one', provenance), /changed since cached/);
});

test('encoded subagent query resolves only the owning provider identity', () => {
  const encoded = Buffer.from('copilotcli:/owner').toString('base64url');
  const child = `ahp-chat://subagent/${encoded}/call-one`;
  const parsed = parseAgentHostIdentity(`agent-host-copilotcli:/owner?${encodeURIComponent(`subagentChatResource=${child}`)}`);
  assert.equal(parsed.toolCallId, 'call-one');
  assert.equal(parsed.chat, defaultChat('copilotcli:/owner'));
  assert.throws(() => parseAgentHostIdentity(`agent-host-copilotcli:/other?subagentChatResource=${encodeURIComponent(child)}`));
  assert.throws(() => parseAgentHostIdentity(`agent-host-copilotcli:/owner?subagentChatResource=${encodeURIComponent(child)}#subagent/different`));
});

test('corrupt persisted mapping never becomes a provider-ID fallback', async (context) => {
  const { resolver, provenance, metadata, events } = await fixture(context);
  await metadata('owner', 'defaultChatProviderData', { sdkSessionId: '../escape' });
  await events('owner');
  await assert.rejects(resolver.resolve('agent-host-copilotcli:/owner', provenance), /Unsupported persisted SDK/);
});

test('SDK reader rejects duplicate/unsupported headers and retains full unknown content', async (context) => {
  const { events } = await fixture(context);
  const file = await events('one', [{
    id: 'long', type: 'future.event', data: { content: 'x'.repeat(100_000) }, futureField: { value: 'untouched' },
  }]);
  const read = await readSdkEvents(file, 'one');
  assert.equal(read.events[1].data.content, 'x'.repeat(100_000));
  assert.deepEqual(read.events[1].raw.futureField, { value: 'untouched' });
  await fs.appendFile(file, '\n{"type":"session.start","data":{"sessionId":"one","version":1}}');
  await assert.rejects(readSdkEvents(file, 'one'), /identity\/version/);
  await fs.writeFile(file, '{"type":"session.start","data":{"sessionId":"one","version":999}}');
  await assert.rejects(readSdkEvents(file, 'one'), /identity\/version/);
});

test('original SDK JSON remains available without numeric precision or whitespace rewriting', async (context) => {
  const { events } = await fixture(context);
  const file = await events('one');
  const line = '{ "type": "future.event", "data": { "largeInteger": 9007199254740993, "scientific": 1e+20 } }';
  await fs.appendFile(file, `\n${line}\n`);
  const read = await readSdkEvents(file, 'one');
  assert.equal(read.events[1].recordedLine, line);
});
