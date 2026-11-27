import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionOccurrence, SessionInventory } from '../src/index.ts';
import type { ChatInfo } from '../src/session/chat-info.ts';
import { formatChatInfo, selectChatInfoOccurrence, stripChatInfoMarkdown, wrapChatInfoText } from '../src/session/chat-info.ts';
import { listingResponsePreview } from '../src/session/listing-evidence.ts';

function occurrence (
  sessionId: string,
  provider: SessionOccurrence['provider'] = 'local',
  journalPath = `C:\\Code\\User\\workspaceStorage\\one\\chatSessions\\${sessionId}.jsonl`,
): SessionOccurrence {
  const provenance = {
    userDataRoot: 'C:\\Code',
    workspaceStoragePath: 'C:\\Code\\User\\workspaceStorage\\one',
  };
  const backing = provider === 'local'
    ? {
      status: 'verified' as const,
      source: {
        kind: 'local-journal' as const,
        sessionId,
        path: journalPath,
        schemaVersion: 3,
        sha256: 'local-sha',
        provenance,
      },
    }
    : {
      status: 'verified' as const,
      source: {
        kind: 'sdk-events' as const,
        provider: provider as 'agent-host' | 'copilot-cli',
        sessionId,
        path: 'C:\\Users\\test\\.copilot\\session-state\\one\\events.jsonl',
        schemaVersion: 1,
        producer: 'test',
        scope: { kind: 'main' as const },
        chatIdentity: `${provider}:/${sessionId}`,
        provenance,
        identityEvidence: [],
        identityWarnings: [],
        scopeWarnings: [],
        sha256: 'sdk-sha',
      },
    };
  return {
    occurrenceId: `${provider}-${sessionId}`,
    provider,
    sessionId: provider === 'local' ? sessionId : `${provider}:/${sessionId}`,
    title: 'Example chat',
    titleSource: 'index',
    activityTimestamp: Date.UTC(2026, 10, 26, 16, 40),
    activitySource: 'index',
    createdTimestamp: Date.UTC(2026, 10, 26, 15, 20),
    promptCount: 2,
    provenance,
    localJournalPath: provider === 'local' ? journalPath : undefined,
    backing,
    visibility: { status: 'included' },
    diagnostics: [],
  };
}

test('chat info refuses a cross-provider selector instead of guessing', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  const local = occurrence(id);
  const sdk = occurrence(id, 'agent-host');
  const inventory: SessionInventory = {
    userDataRoot: 'C:\\Code',
    occurrences: [local, sdk],
    diagnostics: [],
  };
  assert.throws(
    () => selectChatInfoOccurrence(inventory, '11111111'),
    /matches both|both a Local|ambiguous/iu,
  );
});

test('chat info formats a compact default view and keeps unknown values unknown', () => {
  const info: ChatInfo = {
    schemaVersion: 0,
    unstable: true,
    title: 'Example chat',
    titleSources: [{ source: 'index.title', value: 'Example chat' }],
    type: 'Local',
    status: 'verified',
    exportSupport: 'yes',
    selector: '11111111',
    fullKey: '11111111-2222-4333-8444-555555555555',
    backingId: '11111111-2222-4333-8444-555555555555',
    sourceKind: 'Local journal',
    sourcePath: 'C:\\Code\\User\\workspaceStorage\\one\\chatSessions\\11111111-2222-4333-8444-555555555555.jsonl',
    identityEvidence: [],
    indexKeys: [],
    occurrenceIds: ['local-11111111-2222-4333-8444-555555555555'],
    projects: [{ name: 'one', uri: 'file:///C:/one', kind: 'folder' }],
    cwd: 'C:\\one',
    branch: '?',
    created: Date.UTC(2026, 10, 26, 15, 20),
    updated: Date.UTC(2026, 10, 26, 16, 40),
    promptCount: 2,
    replyCount: 2,
    canceledTurns: 0,
    errorTurns: 0,
    subagentCount: 0,
    models: ['GPT-5'],
    modelChain: 'GPT-5',
    usage: {
      kind: 'local-copilot-credits',
      unit: 'request.copilotCredits (unverified unit)',
      credits: 3,
      creditsRecorded: 2,
      creditsTurns: 2,
      promptTokens: 100,
      promptTokensRecorded: 2,
      completionTokens: 50,
      completionTokensRecorded: 2,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      cacheShare: null,
      byModel: [],
      perCallRows: null,
      replies: null,
      complete: true,
    },
    editCount: 1,
    files: [{ path: 'C:\\Code\\changed.ts', operation: 'edit', added: 4, removed: 1, turns: [1], estimated: false }],
    addedLines: 4,
    removedLines: 1,
    firstPrompt: 'Add chat info.',
    lastPrompt: 'Keep it compact.',
    topTurns: [{ number: 1, prompt: 'Add chat info.', credits: 2 }],
    turns: [],
    subagents: [],
    relationships: [],
    artifacts: [{ kind: 'journal', path: 'C:\\Code\\chat.jsonl', state: 'present', bytes: 1024, files: 1 }],
    storageGroups: [{ kind: 'chat', label: 'This chat', bytes: 1024, partial: false, lockFiles: 0, artifacts: [{ kind: 'journal', path: 'C:\\Code\\chat.jsonl', state: 'present', bytes: 1024, files: 1 }] }],
    scopedPayloadBytes: 1024,
    scopedPayloadLabel: "this chat's journal records",
    totalBytes: 1024,
    dates: [],
    warnings: [],
    diagnostics: [],
    exportCommand: 'copilot-chat-export 11111111',
  };
  const text = formatChatInfo(info, { terminalWidth: 100, now: Date.UTC(2026, 10, 26, 21, 40), referenceYear: 2026 });
  assert.match(text, /━━ Example chat/u);
  assert.match(text, /verified · Local/u);
  assert.match(text, /Select\s+11111111/u);
  assert.match(text, /Credits/u);
  assert.match(text, /3.*unverified/u);
  assert.match(text, /This chat 1.0 KB/u);
  assert.doesNotMatch(text, /Credits\s+0/u);
  assert.doesNotMatch(text, /\$0.00/u);
  const aligned = formatChatInfo({ ...info,
    usage: { ...info.usage, kind: 'ai-credits', byModel: [
      { model: 'Longer model', calls: 95, credits: 80.6, inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, cacheShare: 0 },
      { model: 'Short', calls: 2, credits: 3.35, inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, cacheShare: 0 },
    ] },
    topTurns: [{ number: 4, prompt: 'First', credits: 176 }, { number: 6, prompt: 'Second', credits: 80.6 }],
  }, { terminalWidth: 100, now: Date.UTC(2026, 10, 26, 21, 40), referenceYear: 2026 });
  assert.match(aligned, /By model  Longer model  95 calls +80.6/u);
  assert.match(aligned, /          Short +2 calls +3.35/u);
  assert.match(aligned, /#4 +176 · First/u);
  assert.match(aligned, /#6 +80.6 · Second/u);
});


test('chat info selects an exact verified sub-agent key', () => {
  const childId = '11111111-2222-4333-8444-555555555555';
  const parent = occurrence(childId, 'agent-host');
  const child = occurrence(childId, 'agent-host');
  child.sessionId += '#subagent/call_one';
  child.occurrenceId = 'child-occurrence';
  child.parentOccurrenceId = parent.occurrenceId;
  if (child.backing.status !== 'verified' || child.backing.source.kind !== 'sdk-events')
    assert.fail('expected SDK backing');
  child.backing = { ...child.backing, source: { ...child.backing.source, scope: {
    kind: 'subagent', agentId: 'child-agent', parentToolCallId: 'call_one', evidenceRecordIds: ['binding'],
  } } };
  assert.equal(selectChatInfoOccurrence({ userDataRoot: 'C:\\Code', occurrences: [parent, child], diagnostics: [] }, child.sessionId), child);
});

test('chat info strips Markdown and wraps with hanging indentation', () => {
  const response = '## Title\n\n**Bold** [work-log.md](file:///x)\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nAfter table.';
  const preview = listingResponsePreview(response);
  assert.ok(preview?.includes('\n| A | B |\n'));
  assert.equal(stripChatInfoMarkdown(preview!),
    'Title Bold work-log.md [table: 2 rows] After table.');
  assert.equal(stripChatInfoMarkdown('| A |\n|---|'), '[table: 1 row]');
  const wrapped = wrapChatInfoText('one two three four', 12, '👤 ', '   ');
  assert.deepEqual(wrapped, ['👤 one two', '   three', '   four']);
});
