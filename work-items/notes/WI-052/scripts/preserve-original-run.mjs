import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const original = resolve('temp-tool-output', '261113-121310-lod-research');
const target = resolve('work-items', 'notes', 'WI-052');
const load = (name) => JSON.parse(readFileSync(join(original, name), 'utf8').replace(/^\uFEFF/, ''));
const census = load(join('corpus', 'census.json'));
const aliases = new Map(census.sources.map((source) => [source.id, source.label]));
const fragments = new Map(census.sources.map((source) => [source.id.slice(0, 8), source.label]));
const privateTokens = new Map();
const transformations = {};
const changed = (kind) => transformations[kind] = (transformations[kind] ?? 0) + 1;
const token = (text, kind) => {
  const key = `${kind}:${text}`;
  if (!privateTokens.has(key))
    privateTokens.set(key, `${kind}-${String(privateTokens.size + 1).padStart(4, '0')}`);
  return privateTokens.get(key);
};
const scrub = (value) => {
  let text = value;
  text = text.replace(/\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/gi, (id) => {
    changed('session-or-other-uuid');
    return aliases.get(id) ?? token(id, 'private-id');
  });
  text = text.replace(/\b[a-f0-9]{8}\b/gi, (id) => {
    if (!fragments.has(id))
      return id;
    changed('session-prefix');
    return fragments.get(id);
  });
  text = text.replace(/\b[a-z]:(?:\\+|\/+)Users(?:\\+|\/+)[^\\/\s"'`<>]+/gi, () => {
    changed('home-path');
    return '<user-home>';
  });
  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, () => {
    changed('email');
    return '<email>';
  });
  text = text.replace(/\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g, () => {
    changed('credential-pattern');
    return '<credential>';
  });
  return text;
};
const schema = (value) => {
  const cleaned = scrub(value);
  const words = cleaned.split(' = ')[0].replace(/\(JSON string\)|non-JSON string|: (?:string|object|array|number|boolean|null|undefined)/g, '');
  if (/[\r\n]|[A-Za-z][A-Za-z'-]*\s+[A-Za-z]/.test(words) || /\.(?:answers|answerData)\./.test(cleaned)) {
    changed('dynamic-schema-key');
    const type = cleaned.match(/: (string|object|array|number|boolean|null|undefined)$/)?.[0] ?? '';
    return `${token(value, 'dynamic-field')}${type}`;
  }
  return cleaned;
};
const sanitize = (value, trail = [], field = '') => {
  if (typeof value === 'string') {
    if (field === 'answerDataKeys' || /^(?:firstPrompt|lastPrompt|recordedLine|transcript)$/i.test(field)) {
      changed('private-text');
      return token(value, 'private-text');
    }
    if (/inventories/.test(trail.join('.')) && field === 'location')
      return schema(value);
    if (field === 'fieldPath')
      return schema(value);
    return scrub(value);
  }
  if (Array.isArray(value)) {
    if (field === 'answerDataKeys')
      return value.map((item) => typeof item === 'string' ? token(item, 'private-field') : sanitize(item, trail, field));
    if (trail.includes('catalogues') && field === 'rows') {
      const pathRows = ['payloadVariants', 'stateValues', 'fieldPathTypes'].some((name) => trail.includes(name));
      return value.map((row) => Array.isArray(row)
        ? row.map((item, index) => typeof item === 'string' ? pathRows && index === 1 ? schema(item) : scrub(item) : sanitize(item, trail, field))
        : sanitize(row, trail, field));
    }
    return value.map((item) => sanitize(item, trail, field));
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      const inventoryKey = trail[0] === 'inventories' && trail.length === 2;
      const next = inventoryKey ? schema(key) : scrub(key);
      assert.ok(!Object.hasOwn(result, next), `Sanitization key collision at ${trail.join('.')}; refusing to lose counts`);
      result[next] = sanitize(item, [...trail, key], key);
    }
    return result;
  }
  return value;
};
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const save = (name, value) => {
  const destination = join(target, name);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', 'utf8');
};
const records = [];
for (const name of [
  'ideas.json', 'repository-inventory.json', 'synthesis.json', 'validation.json',
  'online/findings.json', 'corpus/census.json', 'corpus/findings.json',
  'corpus/report-summary.json', 'corpus/export-results.json', 'corpus/discovery.json', 'corpus/survey-plan.json'
]) {
  const input = join(original, name);
  const data = load(name);
  const output = sanitize(data);
  if (name.startsWith('corpus/')) {
    const inventoryAccounting = Object.fromEntries(Object.entries(data.inventories ?? {}).map(([bucket, entries]) => {
      const bySource = {};
      let occurrences = 0;
      for (const entry of Object.values(entries)) {
        assert.equal(typeof entry.occurrences, 'number');
        occurrences += entry.occurrences;
        for (const [label, count] of Object.entries(entry.sources))
          bySource[label] = (bySource[label] ?? 0) + count;
      }
      return [bucket, { entries: Object.keys(entries).length, occurrences, bySource }];
    }));
    records.push({
      file: name,
      sourceSha256: hash(input),
      inventoryBuckets: Object.keys(data.inventories ?? {}).length,
      inventoryEntries: Object.values(data.inventories ?? {}).reduce((sum, bucket) => sum + Object.keys(bucket).length, 0),
      inventoryAccounting
    });
  } else {
    records.push({ file: name, sourceSha256: hash(input) });
  }
  save(name, output);
}
for (const name of ['online/report.md', 'online/vscodeTypes-export-list.txt'])
  save(name, scrub(readFileSync(join(original, name), 'utf8')));
save('original-report-manifest.json', sanitize(load('report-manifest.json')));
save(join('scripts', 'preserve-original-run.mjs'), readFileSync(process.argv[1], 'utf8'));

mkdirSync(join(target, 'scripts', 'research'), { recursive: true });
for (const name of readdirSync(join(original, 'corpus')).filter((name) => name.endsWith('.mjs'))) {
  let script = scrub(readFileSync(join(original, 'corpus', name), 'utf8'));
  const guarded = `const output = process.env.WI052_RESEARCH_OUTPUT;
if (!output || !path.isAbsolute(output) || !path.resolve(output).startsWith(path.resolve('temp-tool-output') + path.sep))
  throw new Error('Set WI052_RESEARCH_OUTPUT to an absolute, new folder under temp-tool-output. See the script README.');`;
  assert.match(script, /^const output = .*;$/m);
  script = script.replace(/^const output = .*;$/m, guarded);
  script = script.replace(/^const forced = .*;$/m, "const forced = (process.env.WI052_FORCED_PREFIXES ?? '').split(',').filter(Boolean);");
  script = script.replace(/^const excluded = .*;$/m, "const excluded = new Set((process.env.WI052_EXCLUDE_SESSIONS ?? '').split(',').filter(Boolean));");
  save(join('scripts', 'research', name), script);
}

let builder = readFileSync(join(original, 'build-report.mjs'), 'utf8');
assert.ok(builder.includes("const path = join(folder, entry.name);"));
builder = builder.replace("const path = join(folder, entry.name);", "if (entry.name === 'private-examples')\n    return [];\n  const path = join(folder, entry.name);");
builder = builder.replace('Research only - no implementation', 'Preserved sanitized research - no implementation');
builder = builder.replace('<main>', '<main><div class="notice"><strong>Preservation edition:</strong> source locators and dynamic/private field names are anonymized. Detailed inventories and counts are kept, but anonymized commands cannot identify the original chats. Use the synthetic examples for portable review. Real export bundles are available only in the ignored private archive on the originating machine. See <a href="PRESERVATION.md">preservation details</a> and <a href="examples/README.md">sample guide</a>.</div>');
builder = builder.replaceAll('node temp-tool-output\\\\261113-121310-lod-research\\\\build-report.mjs', 'node work-items\\\\notes\\\\WI-052\\\\build-report.mjs');
save('build-report.mjs', builder);
save('validate-report.mjs', readFileSync(join(original, 'validate-report.mjs'), 'utf8').replace('Research only - no implementation', 'Preserved sanitized research - no implementation'));

const privateRoot = join(target, 'private-examples');
execFileSync('git', ['check-ignore', '--quiet', join(privateRoot, 'exports', 'probe.md')]);
const exportRoot = join(original, 'corpus', 'exports');
const list = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
  assert.ok(!entry.isSymbolicLink(), 'Refusing a symbolic link while archiving');
  const path = join(folder, entry.name);
  return entry.isDirectory() ? list(path) : [path];
});
const privateFiles = list(exportRoot);
mkdirSync(privateRoot, { recursive: true });
for (const file of privateFiles) {
  const destination = join(privateRoot, 'exports', relative(exportRoot, file));
  if (existsSync(destination))
    assert.equal(hash(destination), hash(file), 'Existing private copy differs; refusing overwrite');
  else {
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(file, destination, { errorOnExist: true, force: false });
  }
  assert.equal(hash(destination), hash(file));
}
const privateManifest = privateFiles.map((file) => ({
  file: relative(exportRoot, file),
  bytes: statSync(file).size,
  sha256: hash(file)
}));
writeFileSync(join(privateRoot, 'manifest.json'), JSON.stringify({
  warning: 'Private real conversation data. Ignored by Git; arrange a separate private backup.',
  files: privateManifest,
  samples: load(join('corpus', 'report-summary.json')).sampleSelections
}, null, 2) + '\n');
save('preservation-manifest.json', {
  savedLocal: '261113',
  source: 'Original WI-052 research run. Sources unchanged; no fresh chat scan or online research.',
  records,
  transformations,
  policy: 'Private text keys become stable anonymous tokens. Inventory keys never overwrite one another. Bucket/entry counts are checked separately. Public commits and type names remain useful.',
  privateBundles: { samples: 6, files: privateFiles.length, bytes: privateFiles.reduce((sum, file) => sum + statSync(file).size, 0), gitIgnored: true, backupRequired: true }
});
console.log(`Preserved complete research data, public source notes and scripts. Copied and hash-checked ${privateFiles.length} private export/asset files; originals unchanged.`);
