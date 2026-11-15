import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { renderSdkExport } from '../src/session/sdk-export.ts';
import type { SdkEventSource } from '../src/session/sources.ts';
import { buildSdkLossAccount } from '../src/verify/sdk-loss-account.ts';
import { readLinkedArchiveCompanions } from '../src/verify/images.ts';
import { edgeEvents, REPEATED_TEXT } from './fixtures/sdk-golden/inputs.ts';
import { assertFilesEqual, assertSemantics, CASES, DIRECTORY, filesFor, readExpected, readExpectedGeneration, renderAll, renderCase, sha256 } from './fixtures/sdk-golden/support.ts';

for (const name of CASES) {
  test(`SDK golden ${name} checks semantics, complete Markdown and exact companion bytes`, async () => {
    const out = renderCase(name);
    assertSemantics(name, out);
    const actual = filesFor(new Map([[name, out]]));
    const generation = readExpectedGeneration();
    const stored = new Map([...generation.files].filter(([key]) => key.startsWith(`${name}/`)));
    assertFilesEqual(actual, stored);
    const markdown = stored.get(`${name}/archive.md`);
    assert.ok(markdown);
    const outputPath = path.join(generation.directory, name, 'archive.md');
    assert.deepEqual(fs.readFileSync(outputPath), markdown);
    const companions = await readLinkedArchiveCompanions(markdown.toString('utf8'), outputPath);
    assert.equal(companions.length, name === 'edges' || name === 'ledger' ? 1 : 0, 'actual disk companion count');
    const diskFiles = new Map(companions.map(item => [`${name}/${item.relativePath}`, Buffer.from(item.bytes)]));
    const expectedCompanions = new Map([...stored].filter(([key]) => key !== `${name}/archive.md`));
    assertFilesEqual(diskFiles, expectedCompanions);
    assert.equal(buildSdkLossAccount(out.events, markdown.toString('utf8'), companions).failed, false,
      'actual stored Markdown and linked companion evidence');
    if (companions.length) {
      assert.equal(buildSdkLossAccount(out.events, markdown.toString('utf8'), []).failed, true, 'missing disk-read evidence');
      const corrupted = companions.map(item => ({ ...item, bytes: Buffer.from(Buffer.from(item.bytes).toString('utf8')
        .replace('Spilled golden line 171', 'Corrupt golden line 171')) }));
      assert.equal(buildSdkLossAccount(out.events, markdown.toString('utf8'), corrupted).failed, true, 'corrupt disk-read evidence');
    }
  });
}

const noteBlocks = (markdown: string) => [...markdown.matchAll(/<details><summary>[^\n]*Fusion phase:[^\n]*<\/summary>[\s\S]*?<\/details>/gu)]
  .map(match => match[0]);
const swap = (text: string, left: string, right: string) =>
  text.replace(left, 'GOLDEN_NOTE_SWAP').replace(right, left).replace('GOLDEN_NOTE_SWAP', right);

test('independent raw-field checks reject lost repeated evidence, corruption and stream reordering', () => {
  const out = renderCase('core');
  const blocks = noteBlocks(out.markdown);
  assert.equal(blocks.length, 11);
  const check = (markdown: string) => buildSdkLossAccount(out.events, markdown, out.companions);
  assert.equal(check(out.markdown.replace(blocks[0]!, '')).failed, true);
  assert.equal(check(out.markdown.replace('Complete invented core-draft draft output.', 'Corrupted invented output.')).failed, true);
  assert.equal(check(swap(out.markdown, blocks[0]!, blocks[1]!)).order.outOfOrder > 0, true);
  const edges = renderCase('edges');
  const repeated = noteBlocks(edges.markdown).filter(block => block.includes(REPEATED_TEXT));
  assert.equal(repeated.length, 2);
  assert.equal(buildSdkLossAccount(edges.events, edges.markdown.replace(repeated[0]!, ''), edges.companions).failed, true);
});

test('missing, corrupt, unlinked and moved companions fail independent text verification', () => {
  const out = renderCase('edges');
  assert.equal(out.companions.length, 1);
  const item = out.companions[0]!;
  const check = (markdown: string, companions = out.companions) => buildSdkLossAccount(out.events, markdown, companions);
  assert.equal(check(out.markdown, []).failed, true);
  const corrupt = [{ ...item, bytes: Buffer.from(Buffer.from(item.bytes).toString('utf8').replace('Spilled golden line 171', 'Corrupt golden line 171')) }];
  assert.equal(check(out.markdown, corrupt).failed, true);
  const link = [...out.markdown.matchAll(/\[[^\]\n]+\]\(([^)]+)\)/gu)].find(match => decodeURIComponent(match[1]!) === item.relativePath)?.[0];
  assert.ok(link);
  assert.equal(check(out.markdown.replace(link, '[Unlinked companion]')).failed, true);
  assert.equal(check(out.markdown.replace(link, `\`${link}\``)).failed, true);
  const blocks = noteBlocks(out.markdown);
  const spilled = blocks.find(block => block.includes('Phase ID: edge-spill:primary'));
  const earlier = blocks.find(block => block.includes('Phase ID: edge-white:primary'));
  assert.ok(spilled && earlier);
  assert.equal(check(swap(out.markdown, earlier, spilled)).order.outOfOrder > 0, true);
});

test('full golden comparison rejects metadata corruption and missing or extra files', () => {
  const actual = filesFor(new Map([['exception', renderCase('exception')]]));
  const altered = new Map(actual);
  altered.set('exception/archive.md', Buffer.from(actual.get('exception/archive.md')!.toString('utf8')
    .replace('Catalog provider ordering: 7', 'Catalog provider ordering: 8')));
  assert.throws(() => assertFilesEqual(actual, altered), /exact bytes/u);
  const missing = new Map(actual);
  missing.delete('exception/archive.md');
  assert.throws(() => assertFilesEqual(actual, missing), /file set/u);
  const extra = new Map(actual);
  extra.set('exception/extra.md', Buffer.from('Unexpected fixture output.'));
  assert.throws(() => assertFilesEqual(actual, extra), /file set/u);
});

const manifest: unknown = JSON.parse(fs.readFileSync(path.join(DIRECTORY, 'active.json'), 'utf8'));
assert.ok(manifest && typeof manifest === 'object' && !Array.isArray(manifest));
const descriptors: { file: string; bytes: number; sha256: string }[] = [...readExpected()].map(([file, bytes]) =>
  ({ file, bytes: bytes.length, sha256: sha256(bytes) }));
const changedFirst = (changes: object) => [{ ...descriptors[0], ...changes }, ...descriptors.slice(1)];
const manifestMutations: { name: string; value: unknown }[] = [
  { name: 'wrong hash', value: changedFirst({ sha256: '0'.repeat(64) }) },
  { name: 'wrong byte size', value: changedFirst({ bytes: descriptors[0]!.bytes + 1 }) },
  { name: 'missing file', value: descriptors.slice(1) },
  { name: 'extra file', value: [...descriptors, { file: 'exception/extra.md', bytes: 0, sha256: '0'.repeat(64) }] },
  { name: 'duplicate file', value: [...descriptors, descriptors[0]] },
  { name: 'missing descriptor list', value: undefined },
  { name: 'null descriptor list', value: null },
  { name: 'object descriptor list', value: {} },
  { name: 'empty descriptor list', value: [] },
  { name: 'null descriptor', value: [null, ...descriptors.slice(1)] },
  { name: 'array descriptor', value: [[], ...descriptors.slice(1)] },
  { name: 'primitive descriptor', value: [false, ...descriptors.slice(1)] },
  { name: 'missing file property', value: [{ bytes: 0, sha256: '0'.repeat(64) }, ...descriptors.slice(1)] },
  { name: 'empty filename', value: changedFirst({ file: '' }) },
  { name: 'non-string filename', value: changedFirst({ file: 1 }) },
  { name: 'missing size property', value: [{ file: descriptors[0]!.file, sha256: descriptors[0]!.sha256 }, ...descriptors.slice(1)] },
  { name: 'non-number size', value: changedFirst({ bytes: String(descriptors[0]!.bytes) }) },
  { name: 'negative size', value: changedFirst({ bytes: -1 }) },
  { name: 'fractional size', value: changedFirst({ bytes: 1.5 }) },
  { name: 'unsafe integer size', value: changedFirst({ bytes: Number.MAX_SAFE_INTEGER + 1 }) },
  { name: 'missing hash property', value: [{ file: descriptors[0]!.file, bytes: descriptors[0]!.bytes }, ...descriptors.slice(1)] },
  { name: 'non-string hash', value: changedFirst({ sha256: 1 }) },
  { name: 'malformed hash', value: changedFirst({ sha256: 'not-a-hash' }) },
];

for (const mutation of manifestMutations) {
  test(`SDK manifest rejects ${mutation.name} without changing retained fixtures`, () => {
    const script = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import path from 'node:path';
      import { DIRECTORY, readExpected } from ${JSON.stringify(pathToFileURL(path.join(DIRECTORY, 'support.ts')).href)};
      const original = fs.readFileSync;
      const file = path.join(DIRECTORY, 'active.json');
      fs.readFileSync = (...args) => args[0] === file && args[1] === 'utf8'
        ? process.argv[1] : Reflect.apply(original, fs, args);
      try {
        assert.throws(() => readExpected(), assert.AssertionError);
      } finally {
        fs.readFileSync = original;
      }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script,
      JSON.stringify({ ...manifest, files: mutation.value })], { encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  });
}

test('fixed timezone inputs give deterministic bytes without normalizing output or companion content', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const first = filesFor(renderAll());
    process.env.TZ = 'Pacific/Auckland';
    assertFilesEqual(filesFor(renderAll()), first);
  } finally {
    if (previous === undefined)
      delete process.env.TZ;
    else
      process.env.TZ = previous;
  }
});

test('notes-only known usage stays unmatched and visible, while legacy is a separate fallback stream', () => {
  const events = edgeEvents();
  const source: SdkEventSource = {
    kind: 'sdk-events', provider: 'agent-host', sessionId: '11111111-2222-4333-8444-555555555555',
    path: 'invented-events.jsonl', schemaVersion: 1, producer: 'synthetic', scope: { kind: 'main' },
    chatIdentity: 'invented-golden', provenance: { userDataRoot: 'invented', workspaceStoragePath: 'invented' },
    identityEvidence: [], identityWarnings: [], scopeWarnings: [], sha256: 'invented',
  };
  const options = { title: 'Invented usage fallback', assetsDirectory: 'assets', outputPath: 'archive.md', generatedAt: '2026-11-14T12:00:00Z' };
  const onlyNotes = renderSdkExport(events.slice(0, 3), source, options);
  assert.equal(onlyNotes.session.turns.length, 0);
  assert.equal(onlyNotes.session.usage?.recorded.calls, 0);
  assert.equal(onlyNotes.session.usage?.unattributed.calls, 1);
  assert.equal(onlyNotes.session.usage?.unattributed.nanoAiu, 22000000);
  assert.doesNotMatch(onlyNotes.markdown, /Q0:|Q1:/u);
  assert.match(onlyNotes.markdown, /0\.022/u);
  const legacy = renderSdkExport(events.filter(item => item.type !== 'session.usage_record'), source, options);
  assert.equal(legacy.session.usage?.source, 'event-log');
  assert.equal(legacy.session.usage?.recorded.calls, 1);
  assert.equal(legacy.session.usage?.recorded.nanoAiu, 111000000);
});

test('normal golden checks leave all retained expected bytes unchanged', () => {
  const before = readExpected();
  assertFilesEqual(filesFor(renderAll()), before);
  const after = readExpected();
  assertFilesEqual(after, before);
  assert.ok(fs.existsSync(path.join(DIRECTORY, 'active.json')));
  assert.ok([...after.values()].every(bytes => sha256(bytes).length === 64));
});
