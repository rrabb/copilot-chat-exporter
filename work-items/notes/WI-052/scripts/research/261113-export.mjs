import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const output = process.env.WI052_RESEARCH_OUTPUT;
if (!output || !path.isAbsolute(output) || !path.resolve(output).startsWith(path.resolve('temp-tool-output') + path.sep))
  throw new Error('Set WI052_RESEARCH_OUTPUT to an absolute, new folder under temp-tool-output. See the script README.');
const root = process.cwd();
const census = JSON.parse(fs.readFileSync(path.join(output, 'census.json'), 'utf8'));
const selected = [
  { label: 'S001', purpose: 'Flawed Local askQuestions stress case requested by the brief. Two final requests, not a long exemplary conversation.', stress: true },
  { label: 'S014', purpose: 'Long Local conversation with MCP, questions, reasoning, edits and recorded image variants.', stress: false },
  { label: 'S026', purpose: 'Long SDK stream with many prompts, MCP, questions, subagents, reasoning and tool results.', stress: false },
  { label: 'S017', purpose: 'Flawed SDK sparse/Fusion verification stress case requested by the brief.', stress: true },
  { label: 'S002', purpose: 'Largest surveyed Local journal, varied tools, MCP, question carousels, image variants and edits.', stress: false },
  { label: 'S019', purpose: 'Long SDK conversation across many prompts, questions, MCP, skills, delegation and tool/error outcomes.', stress: false },
];
const exportsFolder = path.join(output, 'exports');
const logsFolder = path.join(output, 'logs');
fs.mkdirSync(exportsFolder, { recursive: true });
fs.mkdirSync(logsFolder, { recursive: true });
const resultPath = path.join(output, 'export-results.json');
const results = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : [];
const wanted = process.argv.slice(2);
const env = { ...process.env, CCE_CACHE_DIR: path.join(output, 'cache') };
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function run(args, prefix) {
  const stdoutFile = path.join(logsFolder, `${prefix}.stdout.log`);
  const stderrFile = path.join(logsFolder, `${prefix}.stderr.log`);
  if (fs.existsSync(stdoutFile) || fs.existsSync(stderrFile))
    throw new Error(`Logs already exist for ${prefix}; refusing overwrite.`);
  const stdout = fs.openSync(stdoutFile, 'wx');
  const stderr = fs.openSync(stderrFile, 'wx');
  const started = Date.now();
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: ['ignore', stdout, stderr], timeout: 240_000, windowsHide: true });
  fs.closeSync(stdout);
  fs.closeSync(stderr);
  return {
    executable: process.execPath,
    args,
    cwd: root,
    environmentOverrides: { CCE_CACHE_DIR: env.CCE_CACHE_DIR },
    started: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    exitCode: result.status,
    signal: result.signal,
    spawnError: result.error ? { code: result.error.code, name: result.error.name } : null,
    stdout: path.relative(output, stdoutFile),
    stderr: path.relative(output, stderrFile),
  };
}

for (const item of selected) {
  if (wanted.length && !wanted.includes(item.label))
    continue;
  if (results.some(result => result.label === item.label))
    continue;
  const source = census.sources.find(source => source.label === item.label);
  const selector = source.family === 'local' ? source.path : source.id;
  const name = `261113-${source.family}-${source.id.slice(0, 8)}${item.stress ? '-stress' : ''}.md`;
  const target = path.join(exportsFolder, name);
  if (fs.existsSync(target))
    throw new Error(`Output already exists: ${name}`);
  const sourceBefore = fs.statSync(source.path);
  const entry = {
    ...item,
    id: source.id,
    family: source.family,
    intendedOutput: path.relative(output, target),
    sourceMatchesSurveyBeforeExport: hash(source.path) === source.frozenSha256,
    sourceBefore: { bytes: sourceBefore.size, mtime: sourceBefore.mtime.toISOString() },
    formatting: 'Current CLI export defaults. --keep-source changes capture retention, not rendering. No LOD or --detailed flag.',
  };
  entry.export = run(['src\\cli.ts', selector, target, '--user-data-root', source.family === 'local' ? source.root : census.discovery.roots.find(root => root.channel === 'stable').path, '--keep-source'], `${item.label}-export`);
  const actualNames = fs.readdirSync(exportsFolder).filter(file => file.startsWith(name.slice(0, -3)) && file.endsWith('.md'));
  entry.artifacts = actualNames.map(file => {
    const artifact = path.join(exportsFolder, file);
    return { path: path.relative(output, artifact), bytes: fs.statSync(artifact).size, sha256: hash(artifact), failedArchive: file.includes('.verify-failed') };
  });
  const artifact = entry.artifacts.find(artifact => !artifact.failedArchive) ?? entry.artifacts[0];
  if (artifact) {
    entry.savedFileVerify = run(['src\\cli.ts', '--verify', '--json', selector, path.join(output, artifact.path), '--user-data-root', source.family === 'local' ? source.root : census.discovery.roots.find(root => root.channel === 'stable').path], `${item.label}-verify`);
    try {
      entry.verificationReport = JSON.parse(fs.readFileSync(path.join(output, entry.savedFileVerify.stdout), 'utf8'));
    } catch {
      entry.verificationReport = null;
    }
  }
  const sourceAfter = fs.statSync(source.path);
  entry.sourceAfter = { bytes: sourceAfter.size, mtime: sourceAfter.mtime.toISOString() };
  entry.sourceChangedDuringExport = entry.sourceBefore.bytes !== entry.sourceAfter.bytes || entry.sourceBefore.mtime !== entry.sourceAfter.mtime;
  entry.sourceMatchesSurveyAfterExport = hash(source.path) === source.frozenSha256;
  results.push(entry);
  fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ label: item.label, id: source.id, exportExit: entry.export.exitCode, verifyExit: entry.savedFileVerify?.exitCode, milliseconds: entry.export.durationMs, artifacts: entry.artifacts.map(artifact => ({ path: artifact.path, bytes: artifact.bytes, failed: artifact.failedArchive })), verifyJson: entry.verificationReport !== null }));
}
