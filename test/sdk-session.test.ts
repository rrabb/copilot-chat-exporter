import assert from 'node:assert/strict';
import test from 'node:test';
import { argumentsText, buildSdkSession } from '../src/session/sdk-session.ts';
import { renderSdkExport, selectSdkSession } from '../src/session/sdk-export.ts';
import { buildSdkLossAccount } from '../src/verify/sdk-loss-account.ts';
import { detailedOccurrence } from './detailed-listing-fixture.ts';
import type { SdkEvent } from '../src/session/sdk-events.ts';
import type { SdkEventSource, SessionOccurrence } from '../src/session/sources.ts';

let line = 0;
const event = (type: string, data: Record<string, unknown>, timestamp = '2026-10-14T10:00:00.000Z'): SdkEvent =>
  ({ type, data, raw: { type, data }, recordedLine: '', line: ++line, timestamp, id: `e${line}` });

const prompt = (content: string, extra: Record<string, unknown> = {}) => event('user.message', { content, messageId: `m${line}`, ...extra });
const assistant = (data: Record<string, unknown>) => event('assistant.message', { model: 'claude-test', ...data }, '2026-10-14T10:00:05.000Z');

const build = (events: SdkEvent[]) => buildSdkSession(events, events, { title: 'Agent chat', assetsDirectory: 'chat_assets' });

test('pending SDK shell calls keep shell IDs and other arguments alongside the command', () => {
  const args = { command: 'synthetic-command', shellId: 'synthetic-terminal-id', description: 'Run a synthetic terminal check', mode: 'async' };
  const events = [prompt('Run the terminal check'), event('tool.execution_start', {
    toolCallId: 'pending-shell', toolName: 'powershell', arguments: args,
  })];
  const preview = renderSdkExport(events, source(), {
    title: 'Pending shell', assetsDirectory: 'assets', outputPath: '', generatedAt: '2026-10-21T00:00:00Z',
  });
  assert.match(preview.markdown, /synthetic-terminal-id/u);
  assert.match(preview.markdown, /Run a synthetic terminal check/u);
  assert.match(preview.markdown, /mode: async/u);
  const account = buildSdkLossAccount(events, preview.markdown);
  assert.equal(account.failed, false);
  assert.deepEqual(account.totals['tool-input'], { present: 1, partial: 0, absent: 0 });
});

test('SDK exports report early and turn-end fence repairs from the shared renderer', () => {
  const repair = (events: SdkEvent[]) => renderSdkExport(events, source(), {
    title: 'Repairs', assetsDirectory: 'assets', outputPath: '', generatedAt: '2026-10-20T00:00:00Z',
  }).fenceRepairs;
  assert.equal(repair([prompt('Question'), assistant({ content: '~~~text\nunfinished' })]).turnEnd, 1);
  const early = repair([
    prompt('Question'), assistant({ content: '~~~text\nunfinished', toolRequests: [{ toolCallId: 'call', name: 'view', arguments: { path: 'test.ts' } }] }),
  ]);
  assert.equal(early.early.length, 1);
  assert.equal(early.early[0].kind, 'tool');
});

test('readable reasoning, text and tool intent become turn content in recorded order', () => {
  const { session } = build([
    event('session.start', { copilotVersion: '1.2.3', startTime: '2026-10-14T09:59:00.000Z', context: { cwd: 'C:\\work' } }),
    prompt('Why does the build fail?'),
    assistant({
      reasoningText: 'I should read the config first.', content: 'Let me look.',
      toolRequests: [{ toolCallId: 't1', name: 'view', arguments: { path: 'C:\\work\\a.json' }, intentionSummary: 'Read the build config' }],
    }),
    event('tool.execution_start', { toolCallId: 't1', toolName: 'view', arguments: { path: 'C:\\work\\a.json' } }),
    event('tool.execution_complete', { toolCallId: 't1', success: true, result: { content: '{ "ok": true }' } }),
    assistant({ content: 'The config is fine.' }),
  ]);
  const [turn] = session.turns;
  assert.equal(session.turns.length, 1);
  assert.deepEqual(turn!.body.map((node) => node.type), ['think', 'text', 'tool', 'text']);
  assert.deepEqual(turn!.reasoning, ['I should read the config first.']);
  const tool = turn!.toolNodes[0]!;
  assert.equal(tool.intent, 'Read the build config');
  assert.equal(tool.inputText, 'path: C:\\work\\a.json', 'arguments are readable lines, not escaped JSON');
  assert.equal(tool.resultText, '{ "ok": true }');
  assert.equal(tool.isComplete, true);
  assert.equal(turn!.scalar.modelId, 'claude-test');
  assert.equal(session.workingDirectory, 'C:\\work');
});

test('reasoning recorded only as an encrypted token is counted, not invented', () => {
  const { session } = build([
    prompt('Question'),
    assistant({ reasoningOpaque: 'AAAA', encryptedContent: 'BBBB', content: 'Answer' }),
    assistant({ reasoningText: 'Visible thinking', reasoningBlocks: { blocks: [{ type: 'thinking', thinking: 'Visible thinking' }] } }),
    assistant({ reasoningBlocks: { blocks: [{ type: 'reasoning', summary: [{ type: 'summary_text', text: 'A model-written summary' }] }] } }),
  ]);
  const turn = session.turns[0]!;
  assert.equal(turn.scalar.opaqueReasoningBlocks, 1);
  assert.deepEqual(turn.reasoning, ['Visible thinking', 'A model-written summary']);
  assert.deepEqual(turn.scalar.reasoningKinds, { thinking: 1, summary: 1 });
});

test('tool failures, shell exit codes and detailed diffs are kept', () => {
  const { session } = build([
    prompt('Run it'),
    assistant({ toolRequests: [
      { toolCallId: 's1', name: 'powershell', arguments: { command: 'npm test' }, intentionSummary: 'Run the tests' },
      { toolCallId: 'e1', name: 'edit', arguments: { path: 'a.ts', new_str: 'line one\nline two' } },
    ] }),
    event('tool.execution_start', { toolCallId: 's1', toolName: 'powershell', arguments: { command: 'npm test' } }, '2026-10-14T10:00:06.000Z'),
    event('tool.execution_complete', { toolCallId: 's1', success: false, shellExecution: { exitCode: 7 }, result: { content: '1 failing' }, error: { message: 'Command failed', code: 'EXIT' } }, '2026-10-14T10:00:08.500Z'),
    event('tool.execution_complete', { toolCallId: 'e1', success: true, result: { content: 'Edited', detailedContent: '@@ -1 +1 @@\n-a\n+b' } }),
  ]);
  const [shell, edit] = session.turns[0]!.toolNodes;
  assert.equal(shell!.command, 'npm test');
  assert.equal(shell!.output, '1 failing');
  assert.equal(shell!.exitCode, 7);
  assert.equal(shell!.duration, 2500);
  assert.match(shell!.resultText, /\[tool error\] Command failed \(code EXIT\)/u);
  assert.equal(edit!.inputText, 'path: a.ts\nnew_str:\n  line one\n  line two', 'multi-line values stay readable');
  assert.equal(edit!.detailText, '@@ -1 +1 @@\n-a\n+b');
});

test('permissions, hooks and snapshots are counted and left out; unknown event types are drift', () => {
  const { session, leftOut } = build([
    prompt('Hi'),
    event('permission.requested', {}), event('permission.completed', {}), event('hook.start', {}), event('hook.end', {}),
    event('model.messages_snapshot', {}), event('external_tool.requested', {}),
    event('assistant.turn_start', {}), event('assistant.turn_end', {}, '2026-10-14T10:00:30.000Z'),
    event('brand.new.event', {}),
  ]);
  assert.deepEqual([...leftOut].sort(), [
    ['external-tool duplicates', 1], ['hook records', 2], ['model request/response copies', 1], ['permission prompts', 2],
  ]);
  assert.deepEqual(session.census.unhandled, [['brand.new.event', 1]]);
  assert.equal(session.turns[0]!.scalar.elapsedMs, 30000, 'turn markers supply the response time');
});

test('system prompts, skills and images become linked companion files; unchanged prompts are not repeated', () => {
  const png = Buffer.from('not really a png');
  const { session, companions } = build([
    event('system.message', { role: 'system', content: 'You are an assistant. Rule one.' }),
    event('system.message', { role: 'system', content: 'You are an assistant. Rule one.' }),
    prompt('Use the skill', { transformedContent: '<current_datetime>now</current_datetime>Use the skill' }),
    event('skill.invoked', { name: 'My Skill', trigger: 'prompt', content: '# Skill body' }),
    event('session.binary_asset', { assetId: 'abc123', type: 'image', mimeType: 'image/png', byteLength: png.length, data: png.toString('base64'), description: 'screenshot' }),
    event('session.binary_asset', { assetId: 'zip1', type: 'file', mimeType: 'application/zip', byteLength: 10, data: 'AAAA' }),
    event('system.message', { role: 'system', content: 'You are an assistant. Rule two.' }),
  ]);
  assert.deepEqual(companions.map((item) => item.relativePath).sort(), [
    'chat_assets/image-abc123.png', expect(/^chat_assets\/skill-my-skill-[0-9a-f]{8}\.md$/u, companions),
    expect(/^chat_assets\/system-prompt-1-[0-9a-f]{8}\.md$/u, companions), expect(/^chat_assets\/system-prompt-2-[0-9a-f]{8}\.md$/u, companions),
  ].sort());
  assert.equal(companions.find((item) => item.kind === 'image')!.mediaType, 'image/png');
  const titles = session.turns[0]!.body.filter((node) => node.type === 'note').map((node) => node.type === 'note' ? node.title : '');
  assert.equal(titles.filter((title) => title.startsWith('🧭 System prompt version')).length, 2);
  assert.ok(titles.some((title) => title.startsWith('🧩 Skill used: My Skill (prompt)')));
  assert.ok(titles.some((title) => title.startsWith('📎 Attachment not exported: file application/zip')));
  assert.equal(session.turns[0]!.scalar.injectedContext, '<current_datetime>now</current_datetime>Use the skill');
});

function expect (pattern: RegExp, companions: ReadonlyArray<{ relativePath: string }>) {
  const found = companions.find((item) => pattern.test(item.relativePath));
  assert.ok(found, String(pattern));
  return found.relativePath;
}

test('compaction, model changes and Auto resolution appear as notes', () => {
  const { session } = build([
    prompt('Go'),
    event('session.model_change', { previousModel: 'a', newModel: 'b', reasoningEffort: 'high' }),
    event('session.auto_mode_resolved', { chosenModel: 'gpt-x', routingMethod: 'classifier' }),
    event('session.compaction_complete', { success: true, preCompactionTokens: 1000, postCompactionTokens: 100, checkpointNumber: 2, summaryContent: 'We did things.' }),
  ]);
  assert.deepEqual(session.turns[0]!.body.map((node) => node.type === 'note' ? node.title : ''), [
    '🔀 Model changed: a → b (effort high)', '✨ Auto chose gpt-x (classifier)', '📚 Context compacted (checkpoint 2): 1,000 → 100 tokens',
  ]);
  assert.deepEqual(session.census.unhandled, []);
});

test('arguments render as readable lines for nested values too', () => {
  assert.equal(argumentsText({ query: 'site:x "quoted"', paths: ['C:\\a', 'C:\\b'], nested: { n: 1 } }).trim(),
    'query: site:x "quoted"\npaths:\n  - C:\\a\n  - C:\\b\nnested:\n  n: 1');
});

const source = (path = 'C:\\sdk\\events.jsonl', chat = 'agent-host-copilotcli:/11111111-2222-4333-8444-555555555555'): SdkEventSource => ({
  kind: 'sdk-events', provider: 'agent-host', sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', path, schemaVersion: 1, producer: 'test',
  scope: { kind: 'main' }, chatIdentity: chat, provenance: { userDataRoot: 'C:\\Code', workspaceStoragePath: 'C:\\Code\\w' },
  identityEvidence: [], identityWarnings: [], scopeWarnings: [], sha256: 'x',
});
const sdkRow = (id: string, key: string, backing: SdkEventSource): SessionOccurrence =>
  detailedOccurrence(id, { provider: 'agent-host', sessionId: key, backing: { status: 'verified', source: backing } });

test('an agent chat is selected by key, chat UUID prefix or backing ID; ambiguity lists the candidates', () => {
  const one = sdkRow('one', 'agent-host-copilotcli:/11111111-2222-4333-8444-555555555555', source());
  const duplicate = sdkRow('two', 'agent-host-copilotcli:/11111111-2222-4333-8444-555555555555', source());
  const other = sdkRow('three', 'agent-host-copilotcli:/99999999-2222-4333-8444-555555555555', source('C:\\sdk\\other.jsonl', 'agent-host-copilotcli:/99999999-2222-4333-8444-555555555555'));
  const rows = [one, duplicate, other];
  const picked = selectSdkSession(rows, '11111111');
  assert.ok(picked && !Array.isArray(picked) && picked.source.path === 'C:\\sdk\\events.jsonl', 'workspace references to one backing are one chat');
  assert.ok(!Array.isArray(selectSdkSession(rows, 'agent-host-copilotcli:/99999999-2222-4333-8444-555555555555')));
  assert.equal(selectSdkSession(rows, '77777777'), null);
  assert.equal(selectSdkSession(rows, '1111'), null, 'prefixes shorter than 8 characters never match');
  assert.ok(Array.isArray(selectSdkSession(rows, 'aaaaaaaa')), 'the same backing ID under two different backing files is ambiguous');
});

test('a delegated agent is nested at its call, labelled, and its conversation is complete', () => {
  const events: SdkEvent[] = [
    prompt('Research it'),
    assistant({ toolRequests: [{ toolCallId: 'task1', name: 'task', arguments: { agent_type: 'research', name: 'r1', description: 'Research the parser', prompt: 'Find the parser bug' } }] }),
    event('tool.execution_start', { toolCallId: 'task1', toolName: 'task', arguments: { agent_type: 'research', description: 'Research the parser', prompt: 'Find the parser bug' } }),
    { ...event('subagent.started', { toolCallId: 'task1', agentName: 'r1', agentDisplayName: 'Researcher', agentDescription: 'Research the parser', model: 'claude-test', agentType: 'research' }), agentId: 'agent-1' },
    { ...event('user.message', { content: 'Find the parser bug' }), agentId: 'agent-1' },
    { ...assistant({ reasoningText: 'Child reasoning about the parser', content: 'Looking.', toolRequests: [{ toolCallId: 'c1', name: 'view', arguments: { path: 'p.ts' } }, { toolCallId: 'task2', name: 'task', arguments: { prompt: 'Deeper', description: 'Deeper dive' } }] }), agentId: 'agent-1' },
    { ...event('tool.execution_start', { toolCallId: 'c1', toolName: 'view', arguments: { path: 'p.ts' } }), agentId: 'agent-1' },
    { ...event('tool.execution_complete', { toolCallId: 'c1', success: true, result: { content: 'child file text' } }), agentId: 'agent-1' },
    { ...event('subagent.started', { toolCallId: 'task2', agentName: 'r2', agentDisplayName: 'Deeper', agentDescription: 'Deeper dive' }), agentId: 'agent-2' },
    { ...assistant({ content: 'Grandchild finding.' }), agentId: 'agent-2' },
    { ...event('tool.execution_complete', { toolCallId: 'task2', success: true, result: { content: 'deeper summary' } }), agentId: 'agent-1' },
    { ...event('subagent.completed', { toolCallId: 'task1', agentName: 'r1', model: 'claude-test', totalToolCalls: 2, totalTokens: 1234, durationMs: 5000 }), agentId: 'agent-1' },
    event('tool.execution_complete', { toolCallId: 'task1', success: true, result: { content: 'The bug is in the lexer.' } }),
    assistant({ content: 'Done.' }),
  ];
  const out = renderSdkExport(events, source(), { title: 'Agent chat', assetsDirectory: 'chat_assets', outputPath: 'x.md', generatedAt: '2026-10-14T12:00:00Z' });
  const [task] = out.session.turns[0]!.toolNodes;
  assert.equal(out.session.turns.length, 1, 'the delegated agent does not become a main turn');
  assert.equal(task!.subagent!.agentId, 'agent-1');
  assert.equal(task!.subagent!.turns.length, 1, 'its own first message replaces the placeholder');
  assert.equal(task!.subagent!.turns[0]!.prompt, 'Find the parser bug');
  const nested = task!.subagent!.turns[0]!.toolNodes.find((node) => node.toolCallId === 'task2');
  assert.equal(nested!.subagent!.turns[0]!.prose.length, 1, 'a delegated agent can delegate');
  assert.match(out.markdown, /🤖 SUB-AGENT<\/code>: Research the parser \(type research · Claude Test · 2 tool calls · 5\.0s · 1,234 tokens\)/u);
  assert.match(out.markdown, /\*\*Delegated task:\*\*[\s\S]*Find the parser bug/u);
  assert.match(out.markdown, /\*\*Summary returned to the main chat:\*\*[\s\S]*The bug is in the lexer\./u);
  assert.match(out.markdown, /📜 Full sub-agent conversation[\s\S]*Child reasoning about the parser[\s\S]*Grandchild finding\./u);
  assert.match(out.markdown, /\*\*Sub-agents:\*\* 2 /u);
  const account = buildSdkLossAccount(events, out.markdown);
  assert.deepEqual(account.unaccounted, []);
  assert.deepEqual(out.session.census.unhandled, []);
});

test('SDK order follows each rendered agent scope rather than interleaved event chronology', () => {
  const events: SdkEvent[] = [
    prompt('Main prompt'),
    assistant({
      content: 'Parent starts delegated work.',
      toolRequests: [{ toolCallId: 'task-order', name: 'task', intentionSummary: 'Delegate the research' }],
    }),
    assistant({ content: 'Parent final answer.' }),
    { ...prompt('Child task'), agentId: 'agent-order' },
    { ...assistant({ content: 'Child result.' }), agentId: 'agent-order' },
  ];
  const markdown = [
    'Main prompt',
    'Parent starts delegated work.',
    'Delegate the research',
    'Child task',
    'Child result.',
    'Parent final answer.',
  ].join('\n');
  const account = buildSdkLossAccount(events, markdown);
  assert.equal(account.order.outOfOrder, 0);
  assert.equal(account.failed, false);
});

test('SDK multiplicity detects a missing repeated complete assistant message', () => {
  const repeated = 'The same final sentence.';
  const events = [prompt('Question'), assistant({ content: repeated }), assistant({ content: repeated })];
  const account = buildSdkLossAccount(events, `Question\n${repeated}`);
  assert.deepEqual(account.multiplicity, { checked: 1, missing: 1 });
  assert.equal(account.failed, true);
});

test('SDK tool-argument deduplication is scoped to the agent that owns the call', () => {
  const events: SdkEvent[] = [
    prompt('Main prompt'),
    assistant({
      toolRequests: [{ toolCallId: 'shared-call', name: 'view', arguments: { path: 'main.ts' }, intentionSummary: 'Read the main file' }],
    }),
    { ...assistant({
      content: 'Child response.',
      toolRequests: [{ toolCallId: 'shared-call', name: 'view', arguments: { path: 'child.ts' }, intentionSummary: 'Read the child file' }],
    }), agentId: 'agent-shared' },
    { ...event('tool.execution_start', { toolCallId: 'shared-call', toolName: 'view', arguments: { path: 'child.ts' } }), agentId: 'agent-shared' },
  ];
  const account = buildSdkLossAccount(events, [
    'Main prompt',
    'Read the main file',
    'main.ts',
    'Child response.',
    'Read the child file',
    'child.ts',
  ].join('\n'));
  assert.deepEqual(account.unaccounted, []);
});

test('agent events whose delegation is not in the conversation are counted, not lost silently', () => {
  const events: SdkEvent[] = [prompt('Hi'), { ...assistant({ content: 'orphan work' }), agentId: 'ghost' }];
  const { leftOut } = buildSdkSession(events, events.filter((item) => item.agentId === undefined), { title: 'T', assetsDirectory: 'a' });
  assert.equal(leftOut.get('sub-agent events whose delegation is not in this conversation'), 1);
});

test('notes render links and images relative to the Markdown file', () => {
  const png = Buffer.from('png bytes');
  const events = [
    prompt('Look at this'),
    event('skill.invoked', { name: 'Review', content: '# Review skill', trigger: 'prompt' }),
    event('session.binary_asset', { assetId: 'img1', type: 'image', mimeType: 'image/png', byteLength: png.length, data: png.toString('base64'), description: 'a screenshot' }),
    event('session.compaction_complete', { success: true, summaryContent: 'Earlier work summary' }),
  ];
  const out = renderSdkExport(events, source(), { title: 'Agent chat', assetsDirectory: 'my chat_assets', outputPath: 'x.md', generatedAt: '2026-10-14T12:00:00Z' });
  assert.match(out.markdown, /!\[a screenshot\]\(my%20chat_assets\/image-img1\.png\)/u);
  assert.match(out.markdown, /\[skill-review-[0-9a-f]{8}\.md\]\(my%20chat_assets\/skill-review-[0-9a-f]{8}\.md\)/u);
  assert.match(out.markdown, /<summary>[\s\S]*?📚 Context compacted[\s\S]*?Earlier work summary/u);
});

test('the export names what was left out, keeps reasoning, and passes the independent content check', () => {
  const events = [
    event('session.start', { copilotVersion: '1.2.3' }),
    prompt('Explain the failure'),
    assistant({ reasoningText: 'The stack trace points at the parser.', content: 'It is the parser.', toolRequests: [{ toolCallId: 't1', name: 'view', arguments: { path: 'p.ts' }, intentionSummary: 'Open the parser' }] }),
    event('tool.execution_start', { toolCallId: 't1', toolName: 'view', arguments: { path: 'p.ts' } }),
    event('tool.execution_complete', { toolCallId: 't1', success: true, result: { content: 'parser source line' } }),
    event('permission.requested', {}),
    assistant({ reasoningOpaque: 'AAAA' }),
  ];
  const out = renderSdkExport(events, source(), { title: 'Agent chat', assetsDirectory: 'chat_assets', outputPath: 'x.md', generatedAt: '2026-10-14T12:00:00Z' });
  assert.match(out.markdown, /Conversation archive sourced from the Copilot SDK event log/u);
  assert.match(out.markdown, /The stack trace points at the parser\./u);
  assert.match(out.markdown, /\*\*Intent:\*\* Open the parser/u);
  assert.match(out.markdown, /## Left out of this export[\s\S]*\| permission prompts \| 1 \|/u);
  assert.match(out.markdown, /encrypted token and therefore not readable: 1 assistant message/u);
  assert.ok(!/native VS Code chat journal/u.test(out.markdown), 'no Local-journal wording in an agent export');
  assert.ok(!/0 completion tokens|0\.00 credits|0 prompt \+/u.test(out.markdown), 'unknown usage is never shown as zero');
  assert.match(out.markdown, /tokens and credits not recorded for this chat/u);
  assert.match(out.markdown, /\| not recorded \| not recorded \| not recorded \|/u);
  const account = buildSdkLossAccount(events, out.markdown);
  assert.equal(account.failed, false);
  assert.deepEqual(account.unaccounted, []);
  const lossy = buildSdkLossAccount(events, out.markdown.replace('The stack trace points at the parser.', ''));
  assert.deepEqual(lossy.unaccounted.map((item) => [item.category, item.status]), [['reasoning', 'absent']]);
});

const numberedLines = (count: number) => Array.from({ length: count }, (_value, index) => `output line ${index + 1} with enough words to count`).join('\n');

function exportWithResult (content: string) {
  const events = [
    prompt('Run the build'),
    assistant({ toolRequests: [{ toolCallId: 't1', name: 'view', arguments: { path: 'p.ts' } }] }),
    event('tool.execution_start', { toolCallId: 't1', toolName: 'view', arguments: { path: 'p.ts' } }),
    event('tool.execution_complete', { toolCallId: 't1', success: false, error: { message: content, code: 'failed' } }),
  ];
  const out = renderSdkExport(events, source(), { title: 'Agent chat', assetsDirectory: 'chat_assets', outputPath: 'x.md', generatedAt: '2026-10-14T12:00:00Z' });
  return { events, out };
}

test('tool text over 300 lines and 15 KiB is previewed and saved whole in a linked companion, never clipped', () => {
  const text = numberedLines(400);
  const { events, out } = exportWithResult(text);
  const saved = out.companions.filter((item) => item.kind === 'tool-result');
  assert.equal(saved.length, 1);
  assert.match(saved[0]!.relativePath, /^chat_assets\/tool-result-[0-9a-f]{8}\.txt$/u);
  assert.equal(Buffer.from(saved[0]!.bytes).toString('utf8'), `[tool error] ${text} (code failed)`, 'the error text is saved whole');
  assert.match(out.markdown, /first 10 lines, full text linked/u);
  assert.match(out.markdown, /Showing the first 10 of 400 lines .*Full text: \[tool-result-[0-9a-f]{8}\.txt\]\(chat_assets\/tool-result-[0-9a-f]{8}\.txt\)/u);
  assert.ok(out.markdown.includes('output line 10 with'), 'the preview keeps the first 10 lines');
  assert.ok(!out.markdown.includes('output line 11 with'), 'the rest lives in the companion');
  assert.ok(!/middle omitted/u.test(out.markdown));
  const companionText = Buffer.from(saved[0]!.bytes).toString('utf8');
  assert.deepEqual(buildSdkLossAccount(events, out.markdown, companionText).unaccounted, []);
  assert.ok(buildSdkLossAccount(events, out.markdown).unaccounted.some((item) => item.category === 'tool-error'), 'without the companion the same content is flagged');
});

test('tool text of exactly 300 lines stays in the Markdown with no companion', () => {
  const { out } = exportWithResult(numberedLines(300));
  assert.equal(out.companions.filter((item) => item.kind === 'tool-result').length, 0);
  assert.ok(out.markdown.includes('output line 300 with'));
  assert.ok(!/full text linked/u.test(out.markdown));
});

test('identical long outputs share one companion', () => {
  const text = numberedLines(400);
  const events = [
    prompt('Twice'),
    assistant({ toolRequests: [{ toolCallId: 'a', name: 'view', arguments: {} }, { toolCallId: 'b', name: 'view', arguments: {} }] }),
    event('tool.execution_start', { toolCallId: 'a', toolName: 'view', arguments: {} }),
    event('tool.execution_complete', { toolCallId: 'a', success: true, result: { content: text } }),
    event('tool.execution_start', { toolCallId: 'b', toolName: 'view', arguments: {} }),
    event('tool.execution_complete', { toolCallId: 'b', success: true, result: { content: text } }),
  ];
  const out = renderSdkExport(events, source(), { title: 'Agent chat', assetsDirectory: 'chat_assets', outputPath: 'x.md', generatedAt: '2026-10-14T12:00:00Z' });
  assert.equal(out.companions.filter((item) => item.kind === 'tool-result').length, 1);
});
