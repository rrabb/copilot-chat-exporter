import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { finishCapture, registerCapture } from '../src/session/source-cache.ts';

const CLI = process.env.CCE_TEST_CLI ?? fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const UUID = '11111111-1111-4111-8111-111111111111';

test('detailed listing writes only a detailed report while retaining compact console output', async (context) => {
  const { invoke } = await fixture(context);
  const result = invoke('--detailed');
  assert.equal(result.status, 0, result.stderr);
  const reportPath = result.stdout.match(/HTML report: (.+)/u)![1]!.trim();
  assert.match(reportPath, /copilot-chat-sessions-detailed-listing-/u);
  const report = await fs.readFile(reportPath, 'utf8');
  assert.match(report, /Detailed VS Code chat session listing/u);
  assert.match(report, /Ordered prompts \/ delegated tasks/u);
  assert.match(report, /journal.customTitle/u);
  assert.match(result.stdout, /ID \/ PREFIX/u);
  assert.doesNotMatch(result.stdout, /Model-switch timeline/u);
});

test('detailed plus no-html warns without failing the console listing or creating reports', async (context) => {
  const { invoke } = await fixture(context);
  const result = invoke('--detailed', '--no-html');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Invalid flag combination/u);
  assert.doesNotMatch(result.stdout, /HTML report:/u);
});

test('compressed detailed listing writes an offline shell and gzip payload', async (context) => {
  const { invoke } = await fixture(context);
  const result = invoke('--detailed', '--compressed');
  assert.equal(result.status, 0, result.stderr);
  const reportPath = result.stdout.match(/HTML report: (.+)/u)![1]!.trim();
  const report = await fs.readFile(reportPath, 'utf8');
  assert.match(report, /id="conversation-index"/u);
  assert.match(report, /id="report-payload"/u);
  assert.match(report, /new DecompressionStream\(["']gzip["']\)/u);
  assert.doesNotMatch(report, /<iframe/u);
  assert.match(result.stdout, /ID \/ PREFIX/u);
});

for (const codec of ['gzip', 'brotli']) {
  test(`explicit ${codec} compression writes a standalone detailed report`, async (context) => {
    const { invoke } = await fixture(context);
    const result = invoke('--detailed', '--compression', codec);
    assert.equal(result.status, 0, result.stderr);
    const report = await fs.readFile(result.stdout.match(/HTML report: (.+)/u)![1]!.trim(), 'utf8');
    assert.match(report, /id="report-payload"/u);
    assert.equal(report.includes('id="report-decoder"'), codec === 'brotli');
    assert.equal(report.includes("'wasm-unsafe-eval'"), codec === 'brotli');
    if (codec === 'brotli')
      assert.match(result.stderr, /Brotli output \([\d,]+ bytes\) is larger than gzip would be \([\d,]+ bytes\); consider --compression gzip/u);
    else
      assert.doesNotMatch(result.stderr, /Brotli output/u);
  });
}

test('an Agent Host chat is exported by prefix, with companions, left-out counts and an independent content check', async (context) => {
  const { home, root, workspace, env, invoke } = await fixture(context);
  const chat = 'aaaaaaaa-1111-4111-8111-111111111111';
  const database = new DatabaseSync(path.join(workspace, 'state.vscdb'));
  try {
    const row = database.prepare('SELECT value FROM ItemTable WHERE key = ?').get('chat.ChatSessionStore.index') as { value: string };
    const index = JSON.parse(String(row.value));
    index.entries[`agent-host-copilotcli:/${chat}`] = { title: 'Agent title', lastMessageDate: 1700000000000 };
    database.prepare('UPDATE ItemTable SET value = ? WHERE key = ?').run(JSON.stringify(index), 'chat.ChatSessionStore.index');
  } finally {
    database.close();
  }
  const metadata = new DatabaseSync(await (async () => {
    const file = path.join(root, 'agentSessionData', chat, 'session.db');
    await fs.mkdir(path.dirname(file), { recursive: true });
    return file;
  })());
  try {
    metadata.exec('CREATE TABLE session_metadata (key TEXT PRIMARY KEY, value TEXT)');
  } finally {
    metadata.close();
  }
  const events = [
    { id: 'start', type: 'session.start', data: { sessionId: chat, version: 1, producer: 'synthetic-test', copilotVersion: '9.9.9' } },
    { id: 'sys', type: 'system.message', data: { role: 'system', content: 'You are a test assistant.' } },
    { id: 'u1', type: 'user.message', timestamp: '2026-10-14T10:00:00.000Z', data: { content: 'Why is the build red?', messageId: 'm1' } },
    { id: 'a1', type: 'assistant.message', timestamp: '2026-10-14T10:00:02.000Z', data: { model: 'claude-test', reasoningText: 'The compiler error points at the parser.', content: 'It is the parser.', toolRequests: [{ toolCallId: 't1', name: 'view', arguments: { path: 'p.ts' }, intentionSummary: 'Open the parser' }] } },
    { id: 't1s', type: 'tool.execution_start', data: { toolCallId: 't1', toolName: 'view', arguments: { path: 'p.ts' } } },
    { id: 't1c', type: 'tool.execution_complete', data: { toolCallId: 't1', success: true, result: { content: 'parser source line' } } },
    { id: 'perm', type: 'permission.requested', data: {} },
  ];
  const file = path.join(home, 'copilot', 'session-state', chat, 'events.jsonl');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, events.map((event) => JSON.stringify(event)).join('\n'));
  const output = path.join(home, 'agent-export.md');
  const result = invoke('aaaaaaaa', output, '--user-data-root', root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Exported session agent-host-copilotcli:\/aaaaaaaa/u);
  assert.match(result.stdout, /Left out \(counted, not exported\): permission prompts 1/u);
  assert.match(result.stdout, /Every checked piece of recorded content appears in the export\./u);
  const markdown = await fs.readFile(output, 'utf8');
  assert.equal((await fs.readdir(env.CCE_CACHE_DIR)).filter((name) => name.startsWith('cce-')).length, 0);
  assert.match(markdown, /The compiler error points at the parser\./u);
  assert.match(markdown, /\*\*Intent:\*\* Open the parser/u);
  assert.match(markdown, /Copilot SDK event log/u);
  const assets = (await fs.readdir(home)).find((name) => name.startsWith('agent-export_assets_'));
  assert.ok(assets, 'the system prompt is saved as a companion folder entry');
  assert.deepEqual((await fs.readdir(path.join(home, assets))).map((name) => name.replace(/-[0-9a-f]{8}\.md$/u, '.md')), ['system-prompt-1.md']);
  assert.match(markdown, new RegExp(`${assets}/system-prompt-1-[0-9a-f]{8}\\.md`, 'u'));
  const verify = invoke('--verify', '--strict', 'aaaaaaaa', '--user-data-root', root);
  assert.equal(verify.status, 0, verify.stdout + verify.stderr);
  assert.match(verify.stdout, /Unhandled event types: none/u);
  await fs.appendFile(file, '\n{"id":"active","type":"assistant.message","data":{"content":');
  const activeOutput = path.join(home, 'active-sdk.md');
  const active = invoke('aaaaaaaa', activeOutput, '--strict', '--keep-source', '--user-data-root', root);
  assert.equal(active.status, 0, active.stdout + active.stderr);
  assert.match(await fs.readFile(activeOutput, 'utf8'), /skipped one incomplete trailing record/u);
  await fs.appendFile(file, '"New SDK content after the export"}}\n');
  const frozen = invoke('--verify', '--strict', '--json', 'aaaaaaaa', activeOutput, '--user-data-root', root);
  assert.equal(frozen.status, 0, frozen.stdout + frozen.stderr);
  assert.deepEqual(JSON.parse(frozen.stdout).failureReasons, []);
  await fs.appendFile(file, '{"invalid":\n{"still":"invalid preceding record"}\n');
  const broken = invoke('aaaaaaaa', path.join(home, 'bad-sdk.md'), '--user-data-root', root);
  assert.notEqual(broken.status, 0);
  const repeated = invoke('--verify', '--strict', '--json', 'aaaaaaaa', activeOutput, '--user-data-root', root);
  assert.equal(repeated.status, 0, 'SDK verification keeps the saved snapshot after further live writes');
  const savedMarkdown = await fs.readFile(activeOutput, 'utf8');
  await fs.writeFile(activeOutput, savedMarkdown.replace('The compiler error points at the parser.', 'Removed recorded reasoning.'));
  const edited = invoke('--verify', '--strict', '--json', 'aaaaaaaa', activeOutput, '--user-data-root', root);
  assert.equal(edited.status, 2, 'SDK verification checks the saved Markdown, not a new rendering');
  assert.ok(JSON.parse(edited.stdout).failureReasons.includes('layer-d'));
  await fs.writeFile(activeOutput, savedMarkdown);
  const activeAssets = (await fs.readdir(home)).find((name) => name.startsWith('active-sdk_assets_'))!;
  const promptPath = path.join(home, activeAssets, (await fs.readdir(path.join(home, activeAssets)))[0]!);
  const promptBytes = await fs.readFile(promptPath);
  await fs.unlink(promptPath);
  const missingCompanion = invoke('--verify', '--strict', '--json', 'aaaaaaaa', activeOutput, '--user-data-root', root);
  assert.equal(missingCompanion.status, 2, 'missing SDK text companions are loss, not replaced with generated companions');
  await fs.writeFile(promptPath, promptBytes);
  await fs.rm(root, { recursive: true });
  await fs.rm(env.COPILOT_HOME, { recursive: true });
  const withoutNative = invoke('--verify', '--strict', '--json', 'aaaaaaaa', activeOutput, '--user-data-root', root);
  assert.equal(withoutNative.status, 0, 'kept SDK file verification never requires native index/event/usage stores');
});

test('an unknown agent event type is schema drift that --verify --strict reports', async (context) => {
  const { home, root, workspace, invoke } = await fixture(context);
  const chat = 'bbbbbbbb-1111-4111-8111-111111111111';
  const database = new DatabaseSync(path.join(workspace, 'state.vscdb'));
  try {
    const row = database.prepare('SELECT value FROM ItemTable WHERE key = ?').get('chat.ChatSessionStore.index') as { value: string };
    const index = JSON.parse(String(row.value));
    index.entries[`agent-host-copilotcli:/${chat}`] = { title: 'Drift' };
    database.prepare('UPDATE ItemTable SET value = ? WHERE key = ?').run(JSON.stringify(index), 'chat.ChatSessionStore.index');
  } finally {
    database.close();
  }
  const metadata = path.join(root, 'agentSessionData', chat, 'session.db');
  await fs.mkdir(path.dirname(metadata), { recursive: true });
  const db = new DatabaseSync(metadata);
  try {
    db.exec('CREATE TABLE session_metadata (key TEXT PRIMARY KEY, value TEXT)');
  } finally {
    db.close();
  }
  const file = path.join(home, 'copilot', 'session-state', chat, 'events.jsonl');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, [
    { id: 'start', type: 'session.start', data: { sessionId: chat, version: 1 } },
    { id: 'u', type: 'user.message', data: { content: 'Hello there' } },
    { id: 'x', type: 'brand.new.kind', data: {} },
  ].map((event) => JSON.stringify(event)).join('\n'));
  const result = invoke('--verify', '--strict', 'bbbbbbbb', '--user-data-root', root);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stdout, /UNHANDLED event types: brand\.new\.kind=1/u);
  const json = invoke('--verify', '--strict', '--json', 'bbbbbbbb', '--user-data-root', root);
  assert.equal(json.status, 2, json.stdout + json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.path, 'sdk');
  assert.deepEqual(report.failureReasons, ['unhandled-kind']);
  assert.deepEqual(report.census.unhandled, { 'brand.new.kind': 1 });
});

test('--verify prints the independent content check and --strict fails only when content is missing', async (context) => {
  const { invoke } = await fixture(context);
  const clean = invoke('--verify', UUID);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.match(clean.stdout, /Layer D - recorded content vs the Markdown this build would write/u);
  assert.match(clean.stdout, /Every checked piece of recorded content appears in the export\./u);
  assert.equal(invoke('--verify', '--strict', UUID).status, 0);
});

test('--verify --json writes one JSON document with counts and the same exit code', async (context) => {
  const { invoke } = await fixture(context);
  const result = invoke('--verify', '--strict', '--json', UUID);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 1, 'JSON mode prints nothing but the document');
  const report = JSON.parse(lines[0]!);
  assert.equal(report.version, 3);
  assert.equal(report.path, 'local');
  assert.equal(report.parser.failed, false);
  assert.equal(report.parser.skipped, null, 'the dev parser is installed, so the check runs');
  assert.equal(report.exitCode, 0);
  assert.deepEqual(report.failureReasons, []);
  assert.equal(report.layerB.rawRequests, 1);
  assert.equal(report.layerC.skipped, 'no-output-path');
  assert.equal(report.layerD.target, 'in-memory');
  assert.ok(report.layerD.checked > 0);
  assert.doesNotMatch(result.stdout, /Question|Answer/u, 'recorded text stays out of the JSON');
  const unreadable = invoke('--verify', '--json', UUID, 'missing.md');
  assert.equal(unreadable.status, 1);
  assert.match(unreadable.stderr, /saved export snapshot is unavailable/u);
});

test('a running Local chat exports complete records and verifies the original copy after live growth', async (context) => {
  const { home, sessionPath, invoke } = await fixture(context);
  await fs.appendFile(sessionPath, '\n{"kind":1,"k":["requests",0,"response"],"v":');
  const output = path.join(home, 'active-local.md');
  const exported = invoke(sessionPath, output, '--strict', '--keep-source');
  assert.equal(exported.status, 0, exported.stdout + exported.stderr);
  assert.match(await fs.readFile(output, 'utf8'), /skipped one incomplete trailing record/u);
  await fs.appendFile(sessionPath, '[{"value":"New live content that is not in the copy"}]}\n');
  const checked = invoke('--verify', '--strict', '--json', sessionPath, output);
  assert.equal(checked.status, 0, checked.stderr + checked.stdout);
  assert.equal(JSON.parse(checked.stdout).layerD.failed, false);
  await fs.writeFile(sessionPath, '{"broken":\n{"valid":true}\n');
  assert.equal(invoke(sessionPath, path.join(home, 'broken.md')).status, 1);
  const again = invoke('--verify', '--strict', '--json', sessionPath, output);
  assert.equal(again.status, 0, 'verification must not reread even a now-invalid original source');
});

test('--json is refused without --verify', async (context) => {
  const { invoke } = await fixture(context);
  const result = invoke('--json', UUID);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--json is available only with --verify/u);
});

test('default export verifies before discarding its source and later file verification explains --keep-source', async (context) => {
  const { home, sessionPath, raw, env, invoke } = await fixture(context);
  const output = path.join(home, 'default.md');
  const exported = invoke(sessionPath, output);
  assert.equal(exported.status, 0, exported.stderr + exported.stdout);
  assert.match(exported.stdout, /Every checked piece of recorded content/u);
  assert.doesNotMatch(await fs.readFile(output, 'utf8'), /private source copy was kept/u);
  assert.equal((await fs.readdir(env.CCE_CACHE_DIR)).filter((name) => name.startsWith('cce-')).length, 0);
  const checked = invoke('--verify', sessionPath, output);
  assert.equal(checked.status, 1);
  assert.match(checked.stderr, /source copy was not kept.*--keep-source/u);
  const kept = invoke(sessionPath, output, '--overwrite', '--keep-source');
  assert.equal(kept.status, 0, kept.stderr + kept.stdout);
  assert.match(await fs.readFile(output, 'utf8'), /private source copy was kept/u);
  const directories = (await fs.readdir(env.CCE_CACHE_DIR)).filter((name) => name.startsWith('cce-'));
  assert.equal(directories.length, 1);
  const listing = invoke('--cache');
  assert.equal(listing.status, 0, listing.stderr);
  assert.match(listing.stdout, /Total: 1 captures/u);
  const preview = invoke('--clean', '--dry-run');
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Would remove 1 captures/u);
  assert.equal(invoke('--verify', '--strict', sessionPath, output).status, 0);
  const listed = invoke('--clean');
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /--yes/u);
  assert.equal((await fs.readdir(env.CCE_CACHE_DIR)).filter((name) => name.startsWith('cce-')).length, 1);
  const cleaned = invoke('--clean', '--yes');
  assert.equal(cleaned.status, 0, cleaned.stderr);
  assert.equal((await fs.readdir(path.join(env.CCE_CACHE_DIR, 'receipts'))).length, 0);
  assert.equal(await fs.readFile(sessionPath, 'utf8'), raw);
});

test('cleanup lists first, excludes corpus by default and requires approval before deletion', async (context) => {
  const { home, env, invoke } = await fixture(context);
  const corpus = path.join(home, 'retained-corpus');
  await fs.mkdir(corpus);
  await fs.writeFile(path.join(corpus, 'source-snapshot.json'), '{}');
  const previous = process.env.CCE_CACHE_DIR;
  process.env.CCE_CACHE_DIR = env.CCE_CACHE_DIR;
  try {
    await registerCapture(corpus, 'corpus');
    await finishCapture(corpus, true);
  } finally {
    process.env.CCE_CACHE_DIR = previous;
  }
  const skipped = invoke('--clean', '--yes');
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.match(skipped.stdout, /Skipped/u);
  assert.ok(await fs.stat(corpus));
  const preview = invoke('--clean', '--include-corpus');
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Age \(days\)/u);
  assert.match(preview.stdout, /Nothing deleted.*--yes/u);
  assert.ok(await fs.stat(corpus));
  const dry = invoke('--clean', '--include-corpus', '--yes', '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(await fs.stat(corpus));
  const preload = path.join(home, 'terminal.mjs');
  await fs.writeFile(preload, "Object.defineProperty(process.stdin,'isTTY',{value:true});Object.defineProperty(process.stdout,'isTTY',{value:true});");
  for (const answer of ['\n', 'n\n', 'yes\n']) {
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, CLI, '--clean', '--include-corpus'], {
      cwd: home, env, input: answer, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(result.stdout.indexOf(corpus) < result.stdout.indexOf('Delete the eligible'));
    if (answer !== 'yes\n')
      assert.ok(await fs.stat(corpus));
    else
      await assert.rejects(fs.stat(corpus), { code: 'ENOENT' });
  }
});

test('cache reporting includes legacy temp captures without deleting them', async (context) => {
  const { home, env, invoke } = await fixture(context);
  const legacy = path.join(home, 'copilot-chat-exporter-cache');
  await fs.mkdir(legacy);
  await fs.writeFile(path.join(legacy, 'old-receipt.json'), '{}');
  const preload = path.join(home, 'legacy-temp.mjs');
  await fs.writeFile(preload, `import os from 'node:os';os.tmpdir=()=>${JSON.stringify(home)};`);
  env.NODE_OPTIONS = `--import=${pathToFileURL(preload).href}`;
  const report = invoke('--cache');
  assert.equal(report.status, 0, report.stderr);
  assert.ok(report.stdout.includes(`Legacy cache (report only): ${legacy}`));
  assert.ok(await fs.stat(legacy));
});

for (const sdk of [false, true]) {
  for (const failure of ['missing-content', 'read-error']) {
    for (const keepSource of [false, true]) {
    test(`failed ${sdk ? 'SDK' : 'Local'} ${keepSource ? 'kept' : 'default'} export keeps its capture after ${failure}`, async (context) => {
      const { home, root, sessionPath, env, invoke } = await fixture(context);
      let selector = sessionPath;
      if (sdk) {
        selector = 'copilotcli:/failure-fixture';
        const database = new DatabaseSync(path.join(root, 'User', 'workspaceStorage', 'hash', 'state.vscdb'));
        try {
          database.prepare('UPDATE ItemTable SET value = ? WHERE key = ?').run(JSON.stringify({
            version: 1, entries: { [selector]: { title: 'Failure fixture' } },
          }), 'chat.ChatSessionStore.index');
        } finally {
          database.close();
        }
        const events = path.join(env.COPILOT_HOME, 'session-state', 'failure-fixture', 'events.jsonl');
        await fs.mkdir(path.dirname(events), { recursive: true });
        await fs.writeFile(events, [
          { type: 'session.start', data: { sessionId: 'failure-fixture', version: 1 } },
          { type: 'system.message', data: { role: 'system', content: 'Companion system instructions' } },
          { type: 'user.message', data: { content: 'Question' } },
          { type: 'assistant.message', data: { content: 'Answer' } },
        ].map((event) => JSON.stringify(event)).join('\n'));
      }
      const output = path.join(home, 'failed.md');
      const preload = path.join(home, 'verification-failure.mjs');
      await fs.writeFile(preload, `
import { promises as fs } from 'node:fs';
const original = fs.readFile;
fs.readFile = async function (file, ...args) {
  if (String(file).startsWith(${JSON.stringify(path.join(home, '.chat-export-'))}) && args[0] === 'utf8') {
    ${failure === 'read-error' ? "throw new Error('Synthetic saved-file read failure');" : ''}
    const bytes = await original.call(this, file, ...args);
    return typeof bytes === 'string' ? bytes.replaceAll('Question', 'Removed!') : bytes;
  }
  return original.call(this, file, ...args);
};
`);
      const previousNodeOptions = env.NODE_OPTIONS;
      env.NODE_OPTIONS = `${previousNodeOptions} --import=${pathToFileURL(preload).href}`;
      await fs.writeFile(output, 'Existing successful archive');
      const result = invoke(selector, output, '--overwrite', ...(keepSource ? ['--keep-source'] : []), '--user-data-root', root);
      assert.notEqual(result.status, 0, result.stdout + result.stderr);
      const captures = (await fs.readdir(env.CCE_CACHE_DIR)).filter((name) => name.startsWith('cce-'));
      assert.equal(captures.length, 1, result.stdout + result.stderr);
      const capture = path.join(env.CCE_CACHE_DIR, captures[0]!);
      assert.ok(result.stderr.includes(capture), 'failure diagnostic includes the kept capture path');
      assert.match(result.stderr, /verification failed.*source copy.*kept/iu);
      assert.equal(await fs.readFile(output, 'utf8'), 'Existing successful archive');
      const failed = path.join(home, 'failed.verify-failed.md');
      const failedMarkdown = await fs.readFile(failed, 'utf8');
      assert.match(failedMarkdown, /^>.*Verification failed/iu);
      assert.ok(failedMarkdown.includes(capture));
      const logs = (await fs.readdir(home)).filter((name) => /^failed-.+-\d{6}_\d{6}(?:-\d+)?\.log$/u.test(name));
      assert.equal(logs.length, 1);
      assert.match(await fs.readFile(path.join(home, logs[0]!), 'utf8'), /failureReasons|verification-error/u);
      assert.equal(JSON.parse(await fs.readFile(path.join(capture, '.cce-capture.json'), 'utf8')).kept, true);
      env.NODE_OPTIONS = previousNodeOptions;
      const verify = invoke('--verify', '--strict', selector, failed, '--user-data-root', root);
      assert.equal(verify.status, 0, verify.stdout + verify.stderr);
      const success = invoke(selector, output, '--overwrite', '--user-data-root', root);
      assert.equal(success.status, 0, success.stdout + success.stderr);
      assert.match(success.stdout, /older.*verify-failed/iu);
      assert.equal(await fs.readFile(failed, 'utf8'), failedMarkdown);
    });
    }
  }
}

async function fixture (context: test.TestContext, multipleRoots = false) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-cli-'));
  context.after(() => fs.rm(home, { recursive: true, force: true }));
  const parent = process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support') : home;
  const root = path.join(parent, 'Code');
  const workspace = path.join(root, 'User', 'workspaceStorage', 'hash');
  const sessionPath = path.join(workspace, 'chatSessions', `${UUID}.jsonl`);
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  const raw = JSON.stringify({ kind: 0, v: {
    version: 3, sessionId: UUID, customTitle: 'Synthetic safe listing', requests: [{
      requestId: 'one', timestamp: 1700000000000, message: { text: 'Question' }, response: [{ value: 'Answer' }],
    }],
  } });
  await fs.writeFile(sessionPath, raw);
  const database = new DatabaseSync(path.join(workspace, 'state.vscdb'));
  try {
    database.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)');
    database.prepare('INSERT INTO ItemTable VALUES (?, ?)').run('chat.ChatSessionStore.index', JSON.stringify({
      version: 1, entries: {
        [UUID]: { title: 'GUI title' },
        '22222222-2222-4222-8222-222222222222': { title: 'No journal' },
        'agent-host-copilotcli:/synthetic': { title: 'Provider row' },
      },
    }));
  } finally {
    database.close();
  }
  multipleRoots && await fs.mkdir(path.join(parent, 'Code - Insiders'), { recursive: true });
  const env = {
    ...process.env, HOME: home, USERPROFILE: home, APPDATA: parent, XDG_CONFIG_HOME: parent,
    NODE_OPTIONS: process.env.NODE_OPTIONS ?? '',
    COPILOT_HOME: path.join(home, 'copilot'),
    CCE_CACHE_DIR: await fs.mkdtemp(path.join(process.env.CCE_CACHE_DIR!, 'cli-')),
    VSCODE_TARGET_SESSION_LOG: path.join(workspace, 'GitHub.copilot-chat', 'debug-logs', UUID),
  };
  context.after(() => fs.rm(env.CCE_CACHE_DIR, { recursive: true, force: true }));
  function invoke (...args: string[]) {
    return spawnSync(process.execPath, [CLI, ...args], { cwd: home, env, encoding: 'utf8', timeout: 30_000 });
  }
  return { home, root, workspace, sessionPath, raw, env, invoke };
}

test('no-argument CLI lists even when a current-session environment exists', async (context) => {
  const { home, root, sessionPath, raw, invoke } = await fixture(context);
  const result = invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Showing 3 of 3 eligible conversations/);
  assert.match(result.stdout, /PROMPTS/);
  assert.match(result.stdout, /CREATED/);
  assert.match(result.stdout, /GUI title/);
  assert.match(result.stdout, /No journal/);
  assert.match(result.stdout, /Provider row/);
  assert.match(result.stdout, /agent\s+\|.*unresolved/);
  assert.match(result.stdout, /HTML report:/);
  assert.doesNotMatch(result.stdout, /Exported session|Output:/);
  assert.equal(await fs.readFile(sessionPath, 'utf8'), raw);
  const homeEntries = await fs.readdir(home);
  const reportName = homeEntries.find((entry) => /^copilot-chat-sessions-listing-\d{6}_\d{6}\.html$/u.test(entry));
  assert.ok(reportName, 'default listing writes a timestamped HTML report');
  const report = await fs.readFile(path.join(home, reportName), 'utf8');
  assert.match(report, /How VS Code stores chats/);
  assert.match(report, /<details class="guide" id="storage-guide">/);
  assert.match(report, /GUI title/);
  assert.match(report, /ID \/ selector/);
  assert.equal(homeEntries.length, 2);
  const fullIds = invoke('--list', '--full-ids', '--no-html', '--user-data-root', root);
  assert.equal(fullIds.status, 0, fullIds.stderr);
  assert.ok(fullIds.stdout.includes(UUID));
  const output = path.join(home, 'prefix-export.md');
  const shortId = invoke(UUID.slice(0, 8), output, '--user-data-root', root);
  assert.equal(shortId.status, 0, shortId.stderr);
  assert.match(shortId.stdout, /Exported session/);
  assert.ok((await fs.stat(output)).isFile());
});

test('listing supports --no-html and explicit HTML destinations with safe overwrite', async (context) => {
  const { home, root, invoke } = await fixture(context);
  const disabled = invoke('--list', '--no-html', '--user-data-root', root);
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.doesNotMatch(disabled.stdout, /HTML report:/);
  assert.deepEqual(await fs.readdir(home), [path.basename(root)]);

  const reportPath = path.join(home, 'chosen-report.html');
  const first = invoke('--list', '--html-output', reportPath, '--user-data-root', root);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(first.stdout.includes(`HTML report: ${reportPath}`));
  const original = await fs.readFile(reportPath, 'utf8');
  const refused = invoke('--list', '--html-output', reportPath, '--user-data-root', root);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /already exists.*--overwrite/);
  assert.equal(await fs.readFile(reportPath, 'utf8'), original);
  await fs.writeFile(reportPath, '<p>previous report</p>');
  const replaced = invoke('--list', '--html-output', reportPath, '--overwrite', '--user-data-root', root);
  assert.equal(replaced.status, 0, replaced.stderr);
  assert.match(await fs.readFile(reportPath, 'utf8'), /<!doctype html>/i);
});

test('non-interactive ambiguity never chooses the first or newest root', async (context) => {
  const { root, invoke } = await fixture(context, true);
  const ambiguous = invoke('--list');
  assert.equal(ambiguous.status, 1);
  assert.match(ambiguous.stderr, /More than one VS Code user-data root/);
  assert.match(ambiguous.stderr, /Code - Insiders/);
  assert.match(ambiguous.stderr, /--user-data-root/);
  const explicit = invoke('--user-data-root', root);
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.match(explicit.stdout, /Showing 3 of 3 eligible conversations/);
});

test('output-only CLI refuses instead of exporting the current/newest session', async (context) => {
  const { home, invoke } = await fixture(context);
  const result = invoke('unwanted.md');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires an explicit session/);
  await assert.rejects(fs.stat(path.join(home, 'unwanted.md')), /ENOENT/);
});

test('ambiguous short IDs fail without creating an export', async (context) => {
  const { home, root, invoke } = await fixture(context);
  const otherId = '11111111-2222-4222-8222-222222222222';
  const otherJournal = path.join(root, 'User', 'workspaceStorage', 'other', 'chatSessions', `${otherId}.jsonl`);
  await fs.mkdir(path.dirname(otherJournal), { recursive: true });
  await fs.writeFile(otherJournal, JSON.stringify({
    kind: 0, v: { version: 3, sessionId: otherId, requests: [] },
  }));

  const output = path.join(home, 'ambiguous-prefix.md');
  const result = invoke(UUID.slice(0, 8), output, '--user-data-root', root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /prefix .* is ambiguous.*Matching Local IDs/s);
  await assert.rejects(fs.stat(output), /ENOENT/);
});

test('--current fails explicitly without identity and never falls back', async (context) => {
  const { root, env, invoke } = await fixture(context);
  env.VSCODE_TARGET_SESSION_LOG = '';
  const result = invoke('--current', '--user-data-root', root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No current session could be identified/);
  assert.doesNotMatch(result.stdout, /Exported session/);
});

test('approved Agent Host default fallback is visible in console warnings', async (context) => {
  const { root, env, invoke } = await fixture(context);
  const directory = path.join(root, 'agentSessionData', 'synthetic');
  await fs.mkdir(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'session.db'));
  db.exec('CREATE TABLE session_metadata (key TEXT PRIMARY KEY, value TEXT)');
  db.close();
  const sdk = path.join(env.COPILOT_HOME, 'session-state', 'synthetic');
  await fs.mkdir(sdk, { recursive: true });
  await fs.writeFile(path.join(sdk, 'events.jsonl'), [
    {
      type: 'session.start', timestamp: '2026-10-01T12:00:00.000Z',
      data: { sessionId: 'synthetic', version: 1 },
    },
    {
      type: 'user.message', timestamp: '2026-10-01T12:01:00.000Z',
      data: { source: 'user', content: 'Synthetic prompt' },
    },
  ].map((event) => JSON.stringify(event)).join('\n'));
  const result = invoke('--list', '--no-html', '--user-data-root', root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /agent\s+\|.*verified/);
  assert.match(result.stdout, /2026-10-01\s+\|\s+2026-10-01\s+\|\s+1/);
  assert.match(result.stdout, /identity warning\(s\)/);
  assert.doesNotMatch(result.stdout, /existing local session database and matching SDK session.start/);
  assert.doesNotMatch(result.stderr, /Identity warning/);
});

test('ambiguous children show orange question icons without invalidating main identity', async (context) => {
  const { root, workspace, env, invoke } = await fixture(context);
  const db = new DatabaseSync(path.join(workspace, 'state.vscdb'));
  try {
    db.prepare('UPDATE ItemTable SET value = ? WHERE key = ?').run(JSON.stringify({
      version: 1, entries: { 'copilotcli:/ambiguous': { title: 'Main stays available' } },
    }), 'chat.ChatSessionStore.index');
  } finally {
    db.close();
  }
  const directory = path.join(env.COPILOT_HOME, 'session-state', 'ambiguous');
  await fs.mkdir(directory, { recursive: true });
  const agentSession = path.join(root, 'agentSessionData', 'ambiguous');
  await fs.mkdir(agentSession, { recursive: true });
  const agentDb = new DatabaseSync(path.join(agentSession, 'session.db'));
  agentDb.exec('CREATE TABLE session_metadata (key TEXT PRIMARY KEY, value TEXT)');
  agentDb.close();
  await fs.writeFile(path.join(directory, 'events.jsonl'), [
    { type: 'session.start', data: { sessionId: 'ambiguous', version: 1 } },
    { type: 'user.message', data: { source: 'user', content: 'Main prompt' } },
    { type: 'subagent.started', agentId: 'a', data: { toolCallId: 'call' } },
    { type: 'subagent.started', agentId: 'b', data: { toolCallId: 'call' } },
  ].map((event) => JSON.stringify(event)).join('\n'));
  const result = invoke('--list', '--no-html', '--user-data-root', root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Main stays available/);
  assert.doesNotMatch(result.stdout, /Ambiguous subagent/);
  assert.match(result.stdout, /1 ambiguous child scope\(s\) are hidden/);
  const all = invoke('--list', '--show-ignored', '--no-html', '--user-data-root', root);
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /🟠 ❓ ambiguous/);
  assert.match(all.stdout, /Ambiguous subagent/);
});

test('CLI preserves an existing explicit output unless overwrite is requested', async (context) => {
  const { home, root, sessionPath, invoke } = await fixture(context);
  const output = path.join(home, 'saved.md');
  await fs.writeFile(output, 'Previous archive');
  const refused = invoke(sessionPath, output, '--workspace-root', home, '--user-data-root', root);
  assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stderr, /already exists.*--overwrite/);
  assert.equal(await fs.readFile(output, 'utf8'), 'Previous archive');
  assert.doesNotMatch(refused.stdout, /Exported session|Output:/);
  const replaced = invoke(sessionPath, output, '--workspace-root', home, '--user-data-root', root, '--overwrite');
  assert.equal(replaced.status, 0, replaced.stderr);
  assert.match(replaced.stdout, /Exported session/);
  assert.notEqual(await fs.readFile(output, 'utf8'), 'Previous archive');
  assert.equal((await fs.readdir(home)).filter((name) => name.startsWith('.chat-export-')).length, 0);
});
