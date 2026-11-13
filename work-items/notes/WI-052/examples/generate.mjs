import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const output = process.argv[2] ? resolve(process.argv[2]) : scriptDirectory;
const root = resolve(scriptDirectory, '../../../..');
mkdirSync(output, { recursive: true });
const scratch = join(root, 'temp-tool-output', '261113-1345-wi052-expanded');
mkdirSync(scratch, { recursive: true });
const input = join(output, 'local-input');
mkdirSync(input, { recursive: true });
const fixture = '00000000-0000-4000-8000-000000000000.jsonl';
copyFileSync(join(root, 'test', 'fixtures', 'golden', fixture), join(input, fixture));
const local = spawnSync(process.execPath, [
  join(root, 'src', 'cli.ts'), join(input, fixture), join(output, 'local-detailed.md'),
  '--user-data-root', input, '--keep-source'
], { cwd: root, encoding: 'utf8', env: { ...process.env, CCE_CACHE_DIR: join(scratch, 'synthetic-cache') } });
writeFileSync(join(scratch, 'synthetic-local.log'), (local.stdout ?? '') + (local.stderr ?? ''));
assert.equal(local.status, 0, 'Synthetic Local export failed; see scratch log');

const { renderSdkExport } = await import(pathToFileURL(join(root, 'src', 'session', 'sdk-export.ts')).href);
const { buildSdkLossAccount } = await import(pathToFileURL(join(root, 'src', 'verify', 'sdk-loss-account.ts')).href);
let sequence = 0;
const events = [];
const event = (type, data, agentId) => {
  const index = ++sequence;
  const raw = { id: `example-event-${index}`, timestamp: new Date(Date.UTC(2026, 10, 13, 17, 0, index)).toISOString(), type, data, ...(agentId ? { agentId } : {}) };
  events.push({ ...raw, raw, recordedLine: JSON.stringify(raw), line: index });
};
const assistant = (data, agentId) => event('assistant.message', { model: 'synthetic-model', ...data }, agentId);
const call = (id, name, args, result, agentId) => {
  event('tool.execution_start', { toolCallId: id, toolName: name, arguments: args }, agentId);
  event('tool.execution_complete', { toolCallId: id, success: true, result: { content: result } }, agentId);
};
event('session.start', { copilotVersion: 'synthetic', startTime: '2026-11-13T17:00:00Z', context: { cwd: 'C:\\example\\lod' } });
event('user.message', { content: 'Synthetic example: inspect the demo configuration, ask which output to use, then delegate a check.' });
assistant({
  reasoningText: 'Check the recorded configuration before proposing a change.',
  content: 'I will inspect the demo configuration.',
  toolRequests: [{ toolCallId: 'read-config', name: 'view', arguments: { path: 'demo.json', lines: [1, 3] }, intentionSummary: 'Read demo configuration' }]
});
call('read-config', 'view', { path: 'demo.json', lines: [1, 3] }, '{ "format": "markdown", "enabled": true }');
assistant({ content: 'Choose the presentation.' });
call('choose-output', 'ask_user', { title: 'Output format', choices: ['Markdown', 'Text'] }, '{"selected":["Markdown"],"freeText":"","skipped":false}');
call('lookup', 'example-mcp-search', { query: 'demo settings', limit: 2 }, 'Two synthetic matches: demo.json and guide.md.');
event('tool.execution_start', { toolCallId: 'failed-check', toolName: 'powershell', arguments: { command: 'synthetic-check', description: 'Run a synthetic failing check' } });
event('tool.execution_complete', { toolCallId: 'failed-check', success: false, shellExecution: { exitCode: 7 }, result: { content: 'Synthetic check failed: fixture value is missing.' }, error: { message: 'Synthetic command failed', code: 'DEMO_EXIT' } });
assistant({ toolRequests: [{ toolCallId: 'delegate', name: 'task', arguments: { description: 'Check demo format', prompt: 'Check whether the synthetic demo uses Markdown.' } }] });
event('tool.execution_start', { toolCallId: 'delegate', toolName: 'task', arguments: { description: 'Check demo format', prompt: 'Check whether the synthetic demo uses Markdown.' } });
event('subagent.started', { toolCallId: 'delegate', agentName: 'example-reviewer', agentDisplayName: 'Synthetic reviewer', agentDescription: 'Check demo format' }, 'example-child');
event('user.message', { content: 'Check whether the synthetic demo uses Markdown.' }, 'example-child');
assistant({ content: 'The synthetic configuration selects Markdown.' }, 'example-child');
event('subagent.completed', { toolCallId: 'delegate', agentName: 'example-reviewer', totalToolCalls: 0 }, 'example-child');
event('tool.execution_complete', { toolCallId: 'delegate', success: true, result: { content: 'Synthetic reviewer confirmed Markdown.' } });
event('session.compaction_complete', { success: true, checkpointNumber: 1, preCompactionTokens: 200, postCompactionTokens: 80, summaryContent: 'Synthetic summary: Markdown was selected; one check failed.' });
event('permission.requested', { kind: 'read' });
event('hook.start', { hookType: 'PostToolUse' });
assistant({ content: 'Markdown was selected. The synthetic reviewer confirmed it. The failing check remains unresolved.' });
event('user.message', { content: 'Show the proposed synthetic edit.' });
event('tool.execution_start', { toolCallId: 'edit-demo', toolName: 'edit', arguments: { path: 'demo.json', new_str: '{ "format": "markdown", "enabled": true }' } });
event('tool.execution_complete', { toolCallId: 'edit-demo', success: true, result: { content: 'Synthetic file updated.', detailedContent: '@@ -1 +1 @@\n-{"enabled":false}\n+{"enabled":true}' } });
assistant({ reasoningOpaque: 'synthetic-opaque-token-not-real', content: 'The synthetic edit enables the demo. No real file or user data was changed.' });
const rawText = events.map((item) => item.recordedLine).join('\n') + '\n';
writeFileSync(join(output, 'sdk-events.jsonl'), rawText);
const source = {
  kind: 'sdk-events', provider: 'agent-host', sessionId: '11111111-1111-4111-8111-111111111111',
  path: 'sdk-events.jsonl', schemaVersion: 1, producer: 'synthetic-example', scope: { kind: 'main' },
  chatIdentity: 'agent-host-copilotcli:/11111111-1111-4111-8111-111111111111',
  provenance: { userDataRoot: 'C:\\example\\Code', workspaceStoragePath: 'C:\\example\\Code\\workspace' },
  identityEvidence: [], identityWarnings: [], scopeWarnings: [],
  sha256: createHash('sha256').update(rawText).digest('hex')
};
const rendered = renderSdkExport(events, source, {
  title: 'Synthetic SDK LOD review example', assetsDirectory: 'sdk-assets',
  outputPath: 'sdk-detailed.md', generatedAt: '2026-11-13T17:00:00Z'
});
assert.equal(rendered.companions.length, 0, 'This synthetic SDK fixture should not need binary/context companions');
assert.equal(rendered.session.census.unhandled.length, 0);
const account = buildSdkLossAccount(events, rendered.markdown);
assert.equal(account.failed, false, 'Synthetic SDK independent text check failed');
writeFileSync(join(output, 'sdk-detailed.md'), rendered.markdown);
writeFileSync(join(output, 'sample-checks.json'), JSON.stringify({
  purpose: 'Portable, invented examples only. These are not redacted versions of real research conversations.',
  local: { fixture: 'Committed synthetic golden fixture', cliExit: local.status },
  sdk: { events: events.length, unhandledKinds: rendered.session.census.unhandled, independentTextCheckFailed: account.failed, categories: account.totals }
}, null, 2) + '\n');
console.log('Generated portable synthetic Local and SDK default-detail examples. Real chats were not read.');
