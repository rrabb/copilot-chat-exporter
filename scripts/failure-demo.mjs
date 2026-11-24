import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRunFolder, localTimestamp, prepareChatSandbox, REPO_ROOT, runCli } from './lib/cli-sandbox.mjs';

const root = REPO_ROOT;
const fixtureRoot = path.join(root, 'test', 'fixtures', 'failure-fixture');
const outputRoot = path.join(root, 'temp-tool-output');
const injector = path.join(root, 'test', 'fixtures', 'inject-verify-failure.mjs');
const localFile = path.join(fixtureRoot, '11111111-1111-4111-8111-111111111111.jsonl');
const sdkFile = path.join(fixtureRoot, 'events.jsonl');
const localQuestion = 'Question';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const paragraph = JSON.parse(await fs.readFile(localFile, 'utf8')).v.requests[0].response[1].value;
const cases = [
  { name: 'sdk-missing-prompt', provider: 'sdk', mode: 'missing-text', text: 'Question' },
  { name: 'local-missing-text', provider: 'local', mode: 'missing-text', text: localQuestion },
  { name: 'local-missing-image', provider: 'local', mode: 'missing-image', text: localQuestion },
  { name: 'local-partial-text', provider: 'local', mode: 'partial-text', text: paragraph },
  { name: 'saved-file-read-error', provider: 'local', mode: 'read-error', text: localQuestion },
];

const runRoot = await createRunFolder(outputRoot, 'failure-demo');
const sdkEvents = await fs.readFile(sdkFile, 'utf8');

for (const failureCase of cases) {
  const directory = path.join(runRoot, failureCase.name);
  await fs.mkdir(directory);
  const source = await prepareChatSandbox(directory, failureCase.provider === 'sdk'
    ? { provider: 'sdk', id: 'failure-fixture', title: 'Synthetic SDK failure', events: sdkEvents }
    : { provider: 'local', title: 'Synthetic Local failure', localFile });
  const sourceBytes = await fs.readFile(source.sourcePath);
  const sourceHash = digest(sourceBytes);
  const output = path.join(directory, 'example.md');
  const earlierMarkdown = 'Earlier successful archive, retained by the demo.\n';
  await fs.writeFile(output, earlierMarkdown);

  const counter = path.join(directory, 'injection-count.json');
  const env = {
    ...source.env,
    CCE_FAILURE_DIRECTORY: directory,
    CCE_FAILURE_STAGE_PREFIX: '.chat-export-',
    CCE_FAILURE_MODE: failureCase.mode,
    CCE_FAILURE_COUNTER: counter,
    CCE_FAILURE_TEXT: failureCase.text,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${pathToFileURL(injector).href}`].filter(Boolean).join(' '),
  };
  const selectorArgs = [source.selector, output, '--overwrite', '--user-data-root', source.userDataRoot];
  const result = runCli(selectorArgs, env);
  const injection = JSON.parse(await fs.readFile(counter, 'utf8'));
  assert.ok(injection.injections > 0, `${failureCase.name}: no verification fault was injected`);
  assert.notEqual(result.status, 0, `${failureCase.name}: expected verification failure\n${result.stdout}\n${result.stderr}`);
  assert.equal(digest(await fs.readFile(source.sourcePath)), sourceHash, `${failureCase.name}: source fixture changed`);
  assert.equal(await fs.readFile(output, 'utf8'), earlierMarkdown, `${failureCase.name}: earlier Markdown was overwritten`);

  const failedOutput = path.join(directory, 'example.verify-failed.md');
  const markdown = await fs.readFile(failedOutput, 'utf8');
  const failureLog = (await fs.readdir(directory)).find((name) => /^failed-.+-\d{6}_\d{6}(?:-\d+)?\.log$/u.test(name));
  assert.ok(failureLog, `${failureCase.name}: failure log is missing`);
  const logText = await fs.readFile(path.join(directory, failureLog), 'utf8');
  const cleanup = runCli(['--clean'], { ...env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? '' });
  assert.equal(cleanup.status, 0, `${failureCase.name}: cleanup preview failed\n${cleanup.stderr}`);
  assert.match(cleanup.stdout, /Nothing deleted/u);
  const header = markdown.split(/\r?\n/u).slice(0, 15).join('\n');
  const consoleText = [
    '--- stdout ---',
    result.stdout,
    '--- stderr ---',
    result.stderr,
  ].join('\n');
  const summary = {
    case: failureCase.name,
    provider: failureCase.provider,
    injectionMode: failureCase.mode,
    injectionCount: injection.injections,
    exitCode: result.status,
    sourceSha256: sourceHash,
    sourceUnchanged: digest(await fs.readFile(source.sourcePath)) === sourceHash,
    earlierMarkdownUnchanged: await fs.readFile(output, 'utf8') === earlierMarkdown,
    failedMarkdown: path.basename(failedOutput),
    failureLog,
    cleanupPreviewExitCode: cleanup.status,
    generatedAt: localTimestamp(new Date()),
  };

  await fs.writeFile(path.join(directory, 'header.txt'), `${header}\n`);
  await fs.writeFile(path.join(directory, 'console.txt'), consoleText);
  await fs.writeFile(path.join(directory, 'failure.log'), logText);
  await fs.writeFile(path.join(directory, 'cleanup-preview.txt'), cleanup.stdout + cleanup.stderr);
  await fs.writeFile(path.join(directory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(`Failure demo artifacts: ${runRoot}`);
