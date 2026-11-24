// Runs the real CLI on synthetic chats with injected faults and records what each diagnostic
// bundle contains. It writes only under temp-tool-output and never reads real session data.
// Each scenario states the expected exit code and bundle. A known gap expects today's behavior,
// so fixing the gap makes the demo report a mismatch until its expectation is updated.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRunFolder, localTimestamp, prepareChatSandbox, REPO_ROOT, runCli } from './lib/cli-sandbox.mjs';

const ID = 'diagnostics-demo';
const LOCAL_FIXTURE = path.join(REPO_ROOT, 'test', 'fixtures', 'failure-fixture', '11111111-1111-4111-8111-111111111111.jsonl');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DELETED_PARAGRAPH = 'The renderer closes every fence it opens, so a missing heading usually means the parser swallowed it.';
const FINAL_PARAGRAPH = 'Add a regression test that renders a fenced block directly before the next heading and checks both survive.';

const at = (second) => `2026-11-24T12:00:${String(second).padStart(2, '0')}.000Z`;
const baseEvents = () => [
  { id: 'e1', type: 'session.start', timestamp: at(0), data: { sessionId: ID, version: 1, producer: 'diagnostics-demo', copilotVersion: '9.9.9' } },
  { id: 'e2', parentId: 'e1', type: 'system.message', timestamp: at(1), data: { role: 'system', content: 'You are a synthetic demo assistant.' } },
  { id: 'e3', parentId: 'e2', type: 'user.message', timestamp: at(2), data: { content: 'Why does the export drop the last heading?' } },
  { id: 'e4', parentId: 'e3', type: 'assistant.message', timestamp: at(3), data: {
    model: 'demo-model', content: `Let me look at the parser first.\n\n${DELETED_PARAGRAPH}`,
    toolRequests: [{ toolCallId: 't1', name: 'view', arguments: { path: 'src/parser.ts' } }] } },
  { id: 'e5', parentId: 'e4', type: 'tool.execution_start', timestamp: at(4), data: { toolCallId: 't1', toolName: 'view', arguments: { path: 'src/parser.ts' } } },
  { id: 'e6', parentId: 'e5', type: 'tool.execution_complete', timestamp: at(5), data: { toolCallId: 't1', success: true, result: { content: 'export function parse () {}' } } },
  { id: 'e7', parentId: 'e6', type: 'assistant.message', timestamp: at(6), data: { model: 'demo-model', content: FINAL_PARAGRAPH } },
];

/** Adds one recorded image asset to the tool result, plus an optional reference to an asset that was never recorded. */
function withImages (events, { lost }) {
  const tool = events.find((event) => event.type === 'tool.execution_complete');
  tool.data.result.binaryResultsForLlm = [{ type: 'image', assetId: 'asset-ok', mimeType: 'image/png' }];
  lost && tool.data.result.binaryResultsForLlm.push({ type: 'image', assetId: 'asset-lost', mimeType: 'image/png' });
  events.splice(events.indexOf(tool), 0, { id: 'asset', parentId: tool.parentId, type: 'session.binary_asset', timestamp: tool.timestamp,
    data: { assetId: 'asset-ok', type: 'image', mimeType: 'image/png', data: PNG } });
  return events;
}

/** Adds a detailed tool result long enough (over 300 lines and 15 KiB) to spill into a text companion. */
function withDetailedResult (events) {
  const tool = events.find((event) => event.type === 'tool.execution_complete');
  tool.data.result.detailedContent = Array.from({ length: 400 }, (_, index) => `line ${index + 1}: export const value${index} = 'synthetic detailed result';`).join('\n');
  return events;
}

const runRoot = await createRunFolder(path.join(REPO_ROOT, 'temp-tool-output'), 'diagnostics-demo');
const summary = [];

async function sandbox (name, options) {
  const directory = path.join(runRoot, name);
  await fs.mkdir(directory, { recursive: true });
  const source = await prepareChatSandbox(directory, { title: `Diagnostics demo ${name}`, ...options });
  return { directory, archive: path.join(directory, 'archive.md'), ...source };
}

function cli (source, args) {
  return runCli([...args, '--user-data-root', source.userDataRoot], source.env);
}

/** Exports a clean archive with a kept source copy, so a later saved-file `--verify` can run. */
function exportClean (source) {
  const run = cli(source, [source.selector, source.archive, '--keep-source']);
  if (run.status !== 0)
    throw new Error(`Clean export failed in ${source.directory}:\n${run.stdout}\n${run.stderr}`);
}

async function editArchive (archive, edit) {
  const lines = (await fs.readFile(archive, 'utf8')).split('\n');
  const note = edit(lines);
  await fs.writeFile(archive, lines.join('\n'));
  return note;
}

async function record (name, source, run, expected, injected) {
  const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
  const files = [...output.matchAll(/Diagnostic (?:task|manifest|raw records): (.+)/gu)].map((match) => path.resolve(REPO_ROOT, match[1].trim()));
  const manifestPath = files.find((file) => file.endsWith('.json'));
  const manifest = manifestPath ? JSON.parse(await fs.readFile(manifestPath, 'utf8')) : null;
  const actual = {
    exit: run.status,
    bundle: Boolean(manifestPath),
    verdict: manifest?.verdict ?? null,
    categories: [...new Set((manifest?.model?.findings ?? []).map((finding) => finding.category))],
    exceptionStage: manifest?.exception?.stage ?? null,
    parserEvidence: manifest?.parserEvidence?.length ?? 0,
    imageLocators: manifest?.images?.locators?.length ?? 0,
    companionsMissing: manifest?.companions?.missing?.length ?? 0,
    rawRecords: manifest?.rawRecords?.records ?? 0,
  };
  const mismatches = Object.entries(expected.match).filter(([key, value]) =>
    Array.isArray(value) ? !value.every((item) => actual[key].includes(item)) : actual[key] !== value).map(([key]) => key);
  const row = { scenario: name, purpose: expected.purpose, knownGap: expected.knownGap ?? null, injected, actual, mismatches,
    files: files.map((file) => path.relative(runRoot, file)) };
  summary.push(row);
  await fs.writeFile(path.join(source.directory, 'console.txt'), output);
  console.log(`${mismatches.length ? 'MISMATCH' : 'ok      '} ${name}: exit ${actual.exit}, bundle ${actual.bundle ? 'yes' : 'no'}${expected.knownGap ? ` (known gap ${expected.knownGap})` : ''}${mismatches.length ? ` [${mismatches.join(', ')}]` : ''}`);
}

{
  const source = await sandbox('01-clean', { provider: 'sdk', id: ID, events: baseEvents() });
  await record('01-clean', source, cli(source, [source.selector, source.archive]),
    { purpose: 'A clean export writes no bundle.', match: { exit: 0, bundle: false } }, 'none');
}

{
  const events = baseEvents();
  events.splice(-1, 0, { id: 'future', parentId: 'e6', type: 'future.reasoning_digest', timestamp: at(5),
    data: { digestVersion: 3, summary: 'A future summary of the turn.', steps: [{ kind: 'plan', text: 'Plan step' }] } });
  const source = await sandbox('02-schema-warning', { provider: 'sdk', id: ID, events });
  const injected = 'Unknown event type future.reasoning_digest before the last event.';
  await record('02-schema-warning', source, cli(source, [source.selector, source.archive]),
    { purpose: 'An unknown event type warns and keeps the exact raw record.', match: { exit: 0, bundle: true, categories: ['schema-drift'], rawRecords: 1 } }, injected);
  await record('03-schema-strict', source, cli(source, ['--verify', '--strict', source.selector, source.archive]),
    { purpose: 'Strict verify of the same archive fails with the same evidence.', match: { exit: 2, bundle: true, categories: ['schema-drift'], rawRecords: 1 } }, injected);
}

{
  const source = await sandbox('04-content-loss', { provider: 'sdk', id: ID, events: baseEvents() });
  exportClean(source);
  const injected = await editArchive(source.archive, (lines) => {
    const index = lines.findIndex((line) => line.includes(DELETED_PARAGRAPH));
    lines.splice(index, 1);
    return `Deleted archive line ${index + 1}: ${DELETED_PARAGRAPH}`;
  });
  await record('04-content-loss', source, cli(source, ['--verify', source.selector, source.archive]),
    { purpose: 'A paragraph deleted from the saved archive fails Layer D with exact evidence.', match: { exit: 2, bundle: true, categories: ['layer-d'] } }, injected);
}

{
  const source = await sandbox('05-parser', { provider: 'sdk', id: ID, events: baseEvents() });
  exportClean(source);
  const injected = await editArchive(source.archive, (lines) => {
    const index = lines.findIndex((line) => line.includes(FINAL_PARAGRAPH));
    lines.splice(index, 0, '````text');
    return `Inserted an unclosed \`\`\`\`text fence before archive line ${index + 1}.`;
  });
  await record('05-parser', source, cli(source, ['--verify', source.selector, source.archive]),
    { purpose: 'An unclosed fence swallows later text. The bundle names the fence opener.', match: { exit: 2, bundle: true, categories: ['parser'], parserEvidence: 1 } }, injected);
}

/** Exports a clean archive, then deletes the first linked companion whose name starts with `prefix`. */
async function deleteCompanion (source, prefix) {
  exportClean(source);
  const assets = (await fs.readdir(source.directory)).find((entry) => entry.startsWith('archive_assets_'));
  const victim = assets && (await fs.readdir(path.join(source.directory, assets))).sort().find((name) => name.startsWith(prefix));
  if (!victim)
    throw new Error(`No ${prefix}* companion was written in ${source.directory}.`);
  await fs.rm(path.join(source.directory, assets, victim));
  return `Deleted companion ${assets}/${victim}.`;
}

{
  const source = await sandbox('06-text-companion-loss', { provider: 'sdk', id: ID, events: withDetailedResult(baseEvents()) });
  const injected = await deleteCompanion(source, 'detailed-result-');
  await record('06-text-companion-loss', source, cli(source, ['--verify', source.selector, source.archive]),
    { purpose: 'A deleted text companion fails Layer D. A real-chat deletion passed in an earlier demo (G24, cause unknown).', match: { exit: 2, bundle: true, categories: ['layer-d'] } }, injected);
}

{
  const source = await sandbox('07-image-loss', { provider: 'sdk', id: ID, events: withImages(baseEvents(), { lost: true }) });
  await record('07-image-loss', source, cli(source, [source.selector, source.archive]),
    { purpose: 'A tool result references an image asset that was never recorded. The bundle gives its line and JSON path.', match: { exit: 0, bundle: true, categories: ['images'], imageLocators: 1 } },
    'Tool result references asset-ok (recorded) and asset-lost (never recorded).');
}

{
  const lines = baseEvents().map((event) => JSON.stringify(event));
  lines[3] = lines[3].slice(0, Math.floor(lines[3].length / 2));
  const source = await sandbox('08-load-exception', { provider: 'sdk', id: ID, events: lines });
  await record('08-load-exception', source, cli(source, [source.selector, source.archive]),
    { purpose: 'A truncated source line makes the loader throw. The bundle records stage load.', match: { exit: 1, bundle: true, exceptionStage: 'load' } },
    'Truncated event line 4 to half its length.');
}

{
  const source = await sandbox('09-not-found', { provider: 'sdk', id: ID, events: baseEvents() });
  await record('09-not-found', source, cli(source, ['ffffffff', source.archive]),
    { purpose: 'A selector typo is a user error and does not write a bundle.', match: { exit: 1, bundle: false } }, 'Selector ffffffff matches no chat.');
}

{
  const source = await sandbox('10-local-content-loss', { provider: 'local', localFile: LOCAL_FIXTURE });
  exportClean(source);
  const paragraph = JSON.parse(await fs.readFile(LOCAL_FIXTURE, 'utf8')).v.requests[0].response[1].value.trim();
  const injected = await editArchive(source.archive, (lines) => {
    const index = lines.findIndex((line) => line.includes(paragraph.slice(0, 40)));
    lines.splice(index, 1);
    return `Deleted Local archive line ${index + 1}.`;
  });
  await record('10-local-content-loss', source, cli(source, ['--verify', source.selector, source.archive]),
    { purpose: 'The Local path writes a bundle for the same kind of content loss.', match: { exit: 2, bundle: true, categories: ['layer-d'] } }, injected);
}

{
  const source = await sandbox('11-image-companion-loss', { provider: 'sdk', id: ID, events: withImages(baseEvents(), { lost: false }) });
  const injected = await deleteCompanion(source, 'image-');
  await record('11-image-companion-loss', source, cli(source, ['--verify', source.selector, source.archive]),
    { purpose: 'A deleted image companion fails the image hash check, unlike a text companion.', match: { exit: 2, bundle: true, categories: ['images'] } }, injected);
}

await fs.writeFile(path.join(runRoot, 'scenario-summary.json'), `${JSON.stringify({ generatedAt: localTimestamp(new Date()), scenarios: summary }, null, 2)}\n`);
const failed = summary.filter((row) => row.mismatches.length);
console.log(`Diagnostics demo artifacts: ${runRoot}`);
if (failed.length) {
  console.error(`${failed.length} scenario(s) differ from their expectation: ${failed.map((row) => row.scenario).join(', ')}`);
  process.exitCode = 1;
}
