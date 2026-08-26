import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeRender } from '../src/verify/golden.ts';

// Regression check for the TypeScript refactor: replay ONE frozen real session through the
// exporter and compare the normalized Markdown to a saved copy. The made-up golden
// digest (`--golden check`) proves structural identity on a tiny hand-built journal; this
// harness proves byte identity of the full export on a 73-turn, 1302-tool-call session.
//
// The fixture is a verbatim copy of a VS Code workspace-storage session laid out in the same
// shape, so the exporter derives its hashRoot from the fixture instead of AppData. Both the
// fixture and the baseline are gitignored (~33 MB). Recreate the fixture with:
//
//   $sid = '1e6f4d3f-34bd-4f42-a5bd-d6a48ed6447d'
//   $hr  = "$env:APPDATA\Code\User\workspaceStorage\<workspace-hash>"
//   $dst = 'tools/copilot-chat-exporter/test/fixtures/live-session'
//   Copy-Item "$hr\chatSessions\$sid.jsonl" "$dst\chatSessions\"
//   Copy-Item "$hr\GitHub.copilot-chat\transcripts\$sid.jsonl" "$dst\GitHub.copilot-chat\transcripts\"
//   Copy-Item "$hr\GitHub.copilot-chat\debug-logs\$sid" "$dst\GitHub.copilot-chat\debug-logs\" -Recurse
//   Copy-Item "$hr\GitHub.copilot-chat\chat-session-resources\$sid" "$dst\GitHub.copilot-chat\chat-session-resources\" -Recurse
//   Copy-Item "$hr\GitHub.copilot-chat\memory-tool\memories" "$dst\GitHub.copilot-chat\memory-tool\" -Recurse
//
// then `npm run baseline:update -w copilot-chat-exporter` to record the expected render.

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_ID = '1e6f4d3f-34bd-4f42-a5bd-d6a48ed6447d';
const FIXTURE = path.join(PKG, 'test', 'fixtures', 'live-session');
const JOURNAL = path.join(FIXTURE, 'chatSessions', `${SESSION_ID}.jsonl`);
const BASELINE = path.join(PKG, 'test', 'baseline', 'live-session.expected.md');
const RENDER = path.join(PKG, 'test', 'baseline', 'live-session.render.md');
const ACTUAL = path.join(PKG, 'test', 'baseline', 'live-session.actual.md');
const DEFAULT_EXPORTER = path.join(PKG, 'src', 'cli.ts');

const normalize = normalizeRender;

function diffReport (expected: string, actual: string) {
  const left = expected.split('\n');
  const right = actual.split('\n');
  const diffs = [];
  for (let i = 0; i < Math.max(left.length, right.length) && diffs.length < 20; i += 1)
    if (left[i] !== right[i])
      diffs.push({ line: i + 1, expected: left[i], actual: right[i] });
  return { lineCounts: [left.length, right.length], diffs };
}

const args = process.argv.slice(2);
const update = args.includes('--update');
const exporterIndex = args.indexOf('--exporter');
const exporter = exporterIndex >= 0 ? path.resolve(args[exporterIndex + 1]) : DEFAULT_EXPORTER;

try {
  await fs.access(JOURNAL);
} catch {
  console.error(`Fixture missing: ${JOURNAL}`);
  console.error('Recreate it with the capture command at the top of this file.');
  process.exit(1);
}

await fs.mkdir(path.dirname(BASELINE), { recursive: true });
execFileSync(process.execPath, [exporter, JOURNAL, RENDER], { stdio: 'inherit', windowsHide: true });
const rendered = normalize(await fs.readFile(RENDER, 'utf8'));

if (update) {
  await fs.writeFile(BASELINE, rendered, 'utf8');
  console.log(`Baseline recorded: ${path.relative(PKG, BASELINE).replaceAll('\\', '/')} (${rendered.split('\n').length.toLocaleString()} lines)`);
  process.exit(0);
}

let expected;
try {
  expected = normalize(await fs.readFile(BASELINE, 'utf8'));
} catch {
  console.error('No baseline recorded yet. Run with --update first.');
  process.exit(1);
}

if (expected === rendered) {
  console.log(`Baseline check: exact match (${rendered.split('\n').length.toLocaleString()} normalized lines).`);
  await fs.rm(ACTUAL, { force: true });
  process.exit(0);
}

await fs.writeFile(ACTUAL, rendered, 'utf8');
const report = diffReport(expected, rendered);
console.error(`Baseline check: FAILED. Expected ${report.lineCounts[0].toLocaleString()} lines, got ${report.lineCounts[1].toLocaleString()}.`);
for (const diff of report.diffs) {
  console.error(`  line ${diff.line}:`);
  console.error(`    expected: ${String(diff.expected ?? '<missing>').slice(0, 160)}`);
  console.error(`    actual:   ${String(diff.actual ?? '<missing>').slice(0, 160)}`);
}
console.error(`Full actual render kept at ${path.relative(PKG, ACTUAL).replaceAll('\\', '/')} for a real diff.`);
process.exit(2);
