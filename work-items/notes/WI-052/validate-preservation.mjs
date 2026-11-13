import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
const manifest = read('preservation-manifest.json');
const files = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
  if (entry.name === 'private-examples')
    return [];
  const file = join(folder, entry.name);
  return entry.isDirectory() ? files(file) : [file];
});
const publicFiles = files(root);
let entries = 0;
for (const record of manifest.records) {
  const saved = read(record.file);
  if (!record.inventoryAccounting)
    continue;
  assert.equal(Object.keys(saved.inventories ?? {}).length, record.inventoryBuckets);
  for (const [bucket, expected] of Object.entries(record.inventoryAccounting)) {
    const values = Object.values(saved.inventories[bucket]);
    assert.equal(values.length, expected.entries, `Inventory entries changed in ${record.file}/${bucket}`);
    const bySource = {};
    let occurrences = 0;
    for (const entry of values) {
      occurrences += entry.occurrences;
      for (const [source, amount] of Object.entries(entry.sources))
        bySource[source] = (bySource[source] ?? 0) + amount;
    }
    assert.equal(occurrences, expected.occurrences, `Occurrence totals changed in ${record.file}/${bucket}`);
    assert.deepEqual(bySource, expected.bySource, `Source occurrence totals changed in ${record.file}/${bucket}`);
    entries += values.length;
  }
}
const online = read('online/findings.json');
assert.equal(online.sources.length, 24);
assert.equal(online.types.length, 56);
assert.equal(read('ideas.json').controls.length, 41);
assert.equal(read('corpus/report-summary.json').catalogues.fieldPathTypes.rows.length, 1998);
assert.equal(read('examples/sample-checks.json').local.cliExit, 0);
assert.equal(read('examples/sample-checks.json').sdk.independentTextCheckFailed, false);

for (const file of publicFiles) {
  if (!/\.(?:json|jsonl|md|mjs|txt|html)$/.test(file))
    continue;
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/gi))
    assert.match(match[0], /([a-f0-9])\1{11}$/i, `Non-synthetic UUID in ${relative(root, file)}`);
  assert.ok(!/\b[a-z]:[\\/]+Users[\\/]+/i.test(text), `Personal home path in ${relative(root, file)}`);
  assert.ok(!/\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/.test(text), `Credential pattern in ${relative(root, file)}`);
  if (file.endsWith('.mjs')) {
    const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, `Script syntax failure: ${file}\n${syntax.stderr}`);
  }
}
let links = 0;
for (const name of ['README.md', 'PRESERVATION.md', 'examples/README.md', 'scripts/README.md']) {
  const file = join(root, name);
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^https?:/.test(target))
      continue;
    assert.ok(existsSync(join(dirname(file), target)), `Missing guide link in ${name}: ${target}`);
    links++;
  }
}
const privateRoot = join(root, 'private-examples');
execFileSync('git', ['check-ignore', '--quiet', join(privateRoot, 'exports', 'probe.md')]);
const tracked = execFileSync('git', ['ls-files', '-z', '--', privateRoot], { encoding: 'utf8' });
assert.equal(tracked, '', 'Private examples must not be in the Git index');
let privateChecked = 0;
if (existsSync(join(privateRoot, 'manifest.json'))) {
  const archive = read('private-examples/manifest.json');
  assert.equal(archive.files.length, manifest.privateBundles.files);
  for (const entry of archive.files) {
    const bytes = readFileSync(join(privateRoot, 'exports', entry.file));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    privateChecked++;
  }
}
console.log(`Preservation checks pass: ${entries} inventory entries retain bucket/source occurrence totals; 1,998 selected field/type paths; 24 sources/56 types; 41 controls; ${links} guide links; public identity/credential checks and script syntax pass.`);
console.log(privateChecked ? `Private archive: ${privateChecked} files hash-checked and absent from the Git index.` : 'Private archive is not present on this checkout. Git does not restore it; a separate private backup is required.');
