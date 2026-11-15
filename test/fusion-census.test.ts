import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { censusSource, WINDOW_END, WINDOW_START } from '../scripts/fusion-census.ts';
import { captureCensus, replayCensus, stableRead } from '../scripts/fusion-census-files.ts';
import { main } from '../scripts/fusion-census-cli.ts';

const inside = '2026-11-01T12:00:00.000Z';
const before = '2026-10-24T04:43:55.091Z';
const after = '2026-11-14T04:43:55.093Z';
const event = (type: string, timestamp: unknown = inside, data: unknown = {}, extra = {}) =>
  ({ type, timestamp, data, ...extra });
const bytes = (...records: unknown[]) => Buffer.from(records.map(record => JSON.stringify(record)).join('\n') + '\n');
const fusion = (timestamp: unknown = inside) => event('session.fusion_future', timestamp, { fusionId: 'invented-workflow' });
const privateRoot = path.resolve('temp-tool-output', '261114-0030-fusion-census');
const execute = promisify(execFile);

async function workspace () {
  await fs.mkdir(privateRoot, { recursive: true });
  return fs.mkdtemp(path.join(privateRoot, 'synthetic-'));
}

async function source (root: string, name: string, content: Buffer) {
  const directory = path.join(root, name);
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, 'events.jsonl');
  await fs.writeFile(file, content, { flag: 'wx' });
  return file;
}

test('Fusion evidence uses inclusive fixed endpoints and separates earlier and later records', () => {
  const result = censusSource(bytes(
    event('session.start', '2020-01-01T00:00:00.000Z', { model: 'plain-model' }),
    fusion(before), fusion(WINDOW_START), fusion(WINDOW_END), fusion(after),
  ));
  assert.equal(result.selection, 'qualified');
  assert.deepEqual(result.counts, { inWindow: 2, beforeWindow: 2, afterWindow: 1, unknownTime: 0, malformed: 0 });
  assert.deepEqual(result.evidence.map(item => item.line), [2, 3, 4, 5]);
  assert.deepEqual(result.inventory.filter(item => item.period === 'inWindow').map(item => item.type), ['session.fusion_future']);
});

test('timestamp classification keeps timezone offsets and sub-millisecond boundary differences', () => {
  const result = censusSource(bytes(
    fusion('2026-10-24T00:43:55.092-04:00'),
    fusion('2026-11-13T23:43:55.092-05:00'),
    fusion('2026-10-24T04:43:55.091999999Z'),
    fusion('2026-11-14T04:43:55.092000001Z'),
    fusion('2026-11-01T12:00:00'),
    fusion('2026-10-32T00:00:00Z'),
    fusion('2026-02-30T00:00:00Z'),
  ));
  assert.deepEqual(result.counts, { inWindow: 2, beforeWindow: 1, afterWindow: 1, unknownTime: 3, malformed: 0 });
});

test('context-only, unknown-time and future-only evidence never becomes definite in-window Fusion', () => {
  assert.equal(censusSource(bytes(fusion(before), event('user.message'))).selection, 'context-candidate');
  assert.equal(censusSource(bytes(fusion(null), event('user.message'))).selection, 'unknown-candidate');
  assert.equal(censusSource(bytes(fusion(after), event('user.message'))).selection, 'context-candidate');
  assert.equal(censusSource(bytes(fusion(before), event('user.message', null))).selection, 'unknown-candidate');
  assert.equal(censusSource(bytes(fusion(before))).selection, 'not-selected');
  const unknown = censusSource(bytes(fusion(undefined)));
  // The helper's default timestamp is intentional. A truly missing timestamp is tested separately.
  assert.equal(unknown.selection, 'qualified');
  const missing = censusSource(bytes({ type: 'assistant.fusion_unknown', data: {} }));
  assert.equal(missing.selection, 'unknown-candidate');
  assert.equal(missing.counts.unknownTime, 1);
  assert.equal(missing.status, 'partial');
});

test('structured metadata and recorded synthetic selections qualify, not prose or plain-model switches', () => {
  for (const data of [{ fusion: {} }, { syntheticModel: 'hydrafusion' }, { syntheticModelId: 'hydrafusion-max' }])
    assert.equal(censusSource(bytes(event('session.start', inside, data))).selection, 'qualified');
  assert.equal(censusSource(bytes(event('session.start', inside, { model: 'hydrafusion' }))).selection, 'qualified');
  for (const type of ['session.start', 'session.resume'])
    assert.equal(censusSource(bytes(event(type, inside, { selectedModel: 'hydrafusion-max' }))).selection, 'qualified');
  for (const record of [
    event('user.message', inside, { content: 'Please discuss Fusion and hydrafusion-max.' }),
    event('session.model_change', inside, { newModel: 'plain-model' }),
    event('session.model_change', inside, { newModel: 'plain-model', previousModel: 'hydrafusion' }),
    event('session.model_change', inside, { newModel: 'Discuss hydrafusion-max in this quoted text.' }),
    event('session.model_change', inside, { selectedModel: 'hydrafusion-max' }),
    event('assistant.message', inside, { content: 'session.fusion_resolved' }),
    event('assistant.message', inside, { fusion: null }),
  ])
    assert.equal(censusSource(bytes(record)).selection, 'not-selected');
});

test('literal Fusion selections on model changes qualify and keep exact selection provenance and values', () => {
  const result = censusSource(bytes(
    event('session.model_change', inside, { newModel: 'hydrafusion' }),
    event('session.model_change', inside, { newModel: 'hydrafusion-max' }),
  ));
  assert.equal(result.selection, 'qualified');
  assert.deepEqual(result.evidence, [
    { line: 1, period: 'inWindow', kind: 'recorded-synthetic-selection', path: '$["data"]["newModel"]' },
    { line: 2, period: 'inWindow', kind: 'recorded-synthetic-selection', path: '$["data"]["newModel"]' },
  ]);
  const field = result.inventory.find(item => item.type === 'session.model_change')!.fields
    .find(item => item.path === '$["data"]["newModel"]')!;
  assert.deepEqual(field.values, [
    { value: 'hydrafusion', occurrences: 1, lines: [1] },
    { value: 'hydrafusion-max', occurrences: 1, lines: [2] },
  ]);
  assert.equal(censusSource(bytes(event('session.model_change', inside, { syntheticModel: 'hydrafusion' }))).selection, 'qualified');
});

test('raw inventory covers unknown families, array members, escaped keys, missing, null, zero and empty containers', () => {
  const result = censusSource(bytes(
    fusion(),
    event('future.family', inside, { rows: [{ value: null }, { value: 0 }, {}], empty: [], config: {}, 'a.b': true }),
    event('future.family', inside, { rows: ['text', []], empty: null }),
    event('future.family', inside, {}),
  ));
  const group = result.inventory.find(item => item.type === 'future.family' && item.period === 'inWindow')!;
  assert.equal(group.events, 3);
  const rows = group.fields.find(item => item.path === '$["data"]["rows"][]["value"]')!;
  assert.equal(rows.eventsPresent, 1);
  // This counts missing events, not the empty object among the first event's array members.
  assert.equal(rows.missingEvents, 2);
  assert.equal(rows.occurrences, 2);
  assert.deepEqual(rows.types, { null: 1, number: 1 });
  assert.equal(rows.zeroOccurrences, 1);
  const empty = group.fields.find(item => item.path === '$["data"]["empty"]')!;
  assert.deepEqual(empty.types, { array: 1, null: 1 });
  assert.equal(empty.emptyArrayOccurrences, 1);
  assert.equal(empty.missingEvents, 1);
  assert.ok(group.fields.some(item => item.path === '$["data"]["a.b"]'));
  assert.ok(group.fields.some(item => item.path === '$["data"]["rows"][]' && item.types.array === 1));
  assert.equal(group.fields.find(item => item.path === '$["data"]["config"]')!.emptyObjectOccurrences, 1);
});

test('conversationScope and scopeKind keep root and review values with exact record and field provenance', () => {
  const result = censusSource(bytes(
    event('assistant.fusion_phase_started', inside, { conversationScope: 'root', scopeKind: 'root' }),
    event('assistant.fusion_phase_started', inside, { conversationScope: 'review', scopeKind: 'review' }),
  ));
  const group = result.inventory.find(item => item.type === 'assistant.fusion_phase_started')!;
  for (const key of ['conversationScope', 'scopeKind']) {
    const field = group.fields.find(item => item.path === `$["data"][${JSON.stringify(key)}]`)!;
    assert.deepEqual(field.values, [
      { value: 'root', occurrences: 1, lines: [1] },
      { value: 'review', occurrences: 1, lines: [2] },
    ]);
  }
  assert.deepEqual(result.semantics.scopes, [
    { line: 1, period: 'inWindow', path: '$["data"]["conversationScope"]', value: 'root' },
    { line: 1, period: 'inWindow', path: '$["data"]["scopeKind"]', value: 'root' },
    { line: 2, period: 'inWindow', path: '$["data"]["conversationScope"]', value: 'review' },
    { line: 2, period: 'inWindow', path: '$["data"]["scopeKind"]', value: 'review' },
  ]);
});

test('identity groups include all records when no projection is recorded', () => {
  const result = censusSource(bytes(
    fusion(),
    event('future.family', inside, { phaseId: 'invented-phase' }, { agentId: 'invented-review' }),
  ));
  assert.deepEqual(result.semantics.projections, []);
  assert.deepEqual(result.semantics.identityGroups.find(item => item.key === 'phaseId'), {
    key: 'phaseId', value: 'invented-phase', lines: [2], eventTypes: ['future.family'], envelopeAgentIds: ['invented-review'],
  });
  assert.deepEqual(result.semantics.identityGroups.find(item => item.key === 'fusionId')!.lines, [1]);
});

test('identity groups include new identities first recorded after the final projection', () => {
  const result = censusSource(bytes(
    fusion(),
    event('assistant.fusion_phase_completed', inside, { phaseId: 'earlier-phase', content: 'Invented', projectionMessage: { content: 'Invented' } }),
    event('future.family', inside, { phaseId: 'later-phase' }),
  ));
  assert.deepEqual(result.semantics.identityGroups.find(item => item.value === 'later-phase'), {
    key: 'phaseId', value: 'later-phase', lines: [3], eventTypes: ['future.family'], envelopeAgentIds: [],
  });
});

test('malformed lines and invalid event/time records are counted while valid siblings remain inventoried', () => {
  const raw = Buffer.concat([bytes(fusion()), Buffer.from('{bad json}\n\n'), bytes(
    event('future.family', 'not-a-time', { unknown: true }),
    { type: 'future.family', data: { missing: true } }, ['not', 'an', 'event'],
  )]);
  const result = censusSource(raw);
  assert.equal(result.status, 'partial');
  assert.equal(result.counts.malformed, 2);
  assert.equal(result.counts.unknownTime, 3);
  assert.equal(result.diagnostics.filter(item => item.code === 'json' || item.code === 'blank-line').length, 2);
  assert.ok(result.diagnostics.some(item => item.code === 'event-type'));
  assert.ok(result.inventory.some(item => item.type === 'future.family' && item.period === 'unknownTime'));
  assert.equal(result.counts.inWindow, 1);
});

test('invalid UTF-8 keeps valid siblings and original line numbers rather than inventing zero records', () => {
  const result = censusSource(Buffer.concat([bytes(fusion()), Buffer.from([0xff, 10]), bytes(event('future.family'))]));
  assert.equal(result.counts.malformed, 1);
  assert.equal(result.counts.inWindow, 2);
  assert.ok(result.diagnostics.some(item => item.code === 'utf8' && item.line === 2));
  assert.deepEqual(result.inventory.find(item => item.type === 'future.family')!.lines, [3]);
});

test('bounded values and semantic observations keep exact text differences, IDs, scope, order and versions private', () => {
  const result = censusSource(bytes(
    event('session.start', before, { producer: 'invented-producer', version: '1.2.3', content: 'never-enumerate-this' }, { id: 'start-id' }),
    event('session.fusion_resolved', inside, { fusionId: 'workflow-a', pattern: 'cascade' }, { id: 'route-id', parentId: 'start-id' }),
    event('assistant.fusion_phase_completed', inside, {
      fusionId: 'workflow-a', phaseId: 'phase-a', phaseKind: 'draft', scope: 'review',
      content: 'Hello', projectionMessage: { content: 'Hello' },
    }, { id: 'phase-id', agentId: 'review-a', parentId: 'route-id' }),
    event('assistant.fusion_phase_completed', inside, { content: 'Hello\n world', projectionMessage: { content: 'Hello world' } }),
    event('assistant.fusion_phase_completed', inside, { content: 'Hello', projectionMessage: { content: 'Different' } }),
  ));
  assert.deepEqual(result.semantics.projections.map(item => item.equality), ['exact', 'whitespace-only', 'different']);
  assert.ok(result.semantics.identities.some(item => item.value === 'workflow-a' && item.line === 2));
  assert.ok(result.semantics.identityGroups.some(item => item.key === 'fusionId'
    && item.lines.includes(2) && item.lines.includes(3) && item.envelopeAgentIds.includes('review-a')));
  assert.ok(result.semantics.scopes.some(item => item.line === 3 && item.value === 'review'));
  assert.ok(result.semantics.parentLinks.some(item => item.line === 3 && item.matchingLines.includes(2)));
  assert.equal(result.semantics.sequence[2].line, 3);
  assert.ok(result.semantics.transitions.some(item => item.fromLine === 2 && item.toLine === 3));
  assert.ok(result.semantics.versions.some(item => item.value === '1.2.3' && item.line === 1));
  const serializedFields = JSON.stringify(result.inventory);
  assert.ok(!serializedFields.includes('never-enumerate-this'));
  assert.ok(serializedFields.includes('cascade'));
  const many = censusSource(bytes(fusion(), ...Array.from({ length: 110 }, (_, index) =>
    event('future.family', inside, { status: `state-${index}`, content: `private-${index}` }))));
  const values = many.inventory.find(item => item.type === 'future.family')!.fields.find(item => item.path === '$["data"]["status"]')!;
  assert.equal(values.values.length, 100);
  assert.equal(values.omittedValueOccurrences, 10);
});

test('configuration values include policy, outcome, turn kinds and selected model without treating prose as an enum', () => {
  const result = censusSource(bytes(event('session.start', inside, { selectedModel: 'hydrafusion' }), event('future.family', inside, {
    policy: 'max', outcome: 'succeeded', turnKind: 'follow_up', primaryModel: 'invented-model',
    reason: 'router_unavailable', planVersion: 2, content: 'Short private text',
  })));
  const fields = result.inventory.find(item => item.type === 'future.family')!.fields;
  for (const [key, expected] of Object.entries({
    policy: 'max', outcome: 'succeeded', turnKind: 'follow_up', primaryModel: 'invented-model',
    reason: 'router_unavailable', planVersion: 2,
  })) {
    const field = fields.find(item => item.path === `$["data"][${JSON.stringify(key)}]`)!;
    assert.equal(field.values[0]?.value, expected, key);
  }
  assert.deepEqual(fields.find(item => item.path === '$["data"]["content"]')!.values, []);
});

test('projection comparisons distinguish exact bytes from differences consisting only of whitespace', () => {
  const result = censusSource(bytes(fusion(), ...[
    ['ab', 'ab'], ['ab', 'a b'], ['\t ab \r\n', 'ab'], ['ab', 'ac'],
  ].map(([content, projection]) => event('assistant.fusion_phase_completed', inside, {
    content, projectionMessage: { content: projection },
  }))));
  assert.deepEqual(result.semantics.projections.map(item => item.equality), ['exact', 'whitespace-only', 'whitespace-only', 'different']);
});

test('identity links describe delayed, missing, duplicate and self parents without inventing ownership', () => {
  const result = censusSource(bytes(
    fusion(),
    event('future.family', inside, {}, { parentId: 'late-id' }),
    event('future.family', inside, {}, { id: 'late-id' }),
    event('future.family', inside, {}, { id: 'duplicate-id' }),
    event('future.family', inside, {}, { id: 'duplicate-id' }),
    event('future.family', inside, {}, { parentId: 'duplicate-id' }),
    event('future.family', inside, {}, { parentId: 'missing-id' }),
    event('future.family', inside, {}, { id: 'self-id', parentId: 'self-id' }),
  ));
  assert.deepEqual(result.semantics.parentLinks.map(item => item.status), ['later', 'ambiguous', 'unresolved', 'self']);
  assert.deepEqual(result.semantics.parentLinks[1].matchingLines, [4, 5]);
  assert.deepEqual(result.semantics.sequence.map(item => item.line), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('capture freezes exact bytes, counts physical duplicates and replays without native sources', async () => {
  const root = await workspace();
  const input = path.join(root, 'input');
  const original = bytes(event('session.start', before, { version: 'old-producer' }), fusion(), event('new.family'));
  const a = await source(input, 'invented-a', original);
  await source(input, 'invented-b', original);
  await source(input, 'invented-c', bytes(event('user.message', inside, { content: 'Fusion is prose.' })));
  await source(input, 'invented-d', bytes(fusion(before), event('user.message')));
  const output = path.join(root, 'capture');
  const captured = await captureCensus({ sourceRoots: [input], outputDirectory: output });
  assert.equal(captured.summary.physicalSources, 4);
  assert.equal(captured.summary.qualifiedSources, 2);
  assert.equal(captured.summary.contextCandidates, 1);
  assert.equal(captured.summary.uniqueQualifiedHashes, 1);
  assert.equal(captured.duplicates.length, 1);
  assert.equal(captured.inventory.find(item => item.type === 'new.family' && item.period === 'inWindow')!.events, 2);
  assert.equal(captured.candidateInventory.find(item => item.type === 'user.message' && item.period === 'inWindow')!.events, 1);
  assert.deepEqual(await fs.readFile(a), original);
  const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.private.json'), 'utf8'));
  const entry = manifest.sources.find((item: { frozenFile?: string }) => item.frozenFile);
  assert.deepEqual(await fs.readFile(path.join(output, entry.frozenFile)), original);
  assert.equal(entry.sha256, createHash('sha256').update(original).digest('hex'));
  // Replay must not reread the source tree, even when it no longer has the captured bytes.
  await fs.writeFile(a, bytes(event('changed.synthetic')));
  const replayed = await replayCensus({ frozenDirectory: output, outputDirectory: path.join(root, 'replay') });
  assert.deepEqual(replayed, captured);
  const summary = await fs.readFile(path.join(output, 'summary.json'), 'utf8');
  for (const secret of [root, 'invented-a', 'workflow-a', 'new.family'])
    assert.ok(!summary.includes(secret));
  await assert.rejects(captureCensus({ sourceRoots: [input], outputDirectory: output }), /exist/i);
});

test('missing roots, empty roots, malformed sources and read failures produce distinct partial reports', async () => {
  const root = await workspace();
  const empty = path.join(root, 'empty');
  await fs.mkdir(empty);
  const missing = await captureCensus({ sourceRoots: [path.join(root, 'absent')], outputDirectory: path.join(root, 'missing-report') });
  assert.equal(missing.status, 'partial');
  assert.equal(missing.discovery[0].status, 'missing');
  const result = await captureCensus({ sourceRoots: [empty], outputDirectory: path.join(root, 'empty-report') });
  assert.equal(result.discovery[0].status, 'empty');
  assert.equal(result.status, 'complete');
  await source(empty, 'broken', Buffer.concat([bytes(fusion()), Buffer.from('broken\n')]));
  const partial = await captureCensus({ sourceRoots: [empty], outputDirectory: path.join(root, 'partial-report') });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.sources[0].analysis!.counts.malformed, 1);
  const failed = await captureCensus({
    sourceRoots: [empty], outputDirectory: path.join(root, 'read-report'),
    read: async () => { throw Object.assign(new Error('invented read denial'), { code: 'EACCES' }); },
  });
  assert.equal(failed.status, 'partial');
  assert.equal(failed.sources[0].state, 'unreadable');
});

test('stable reads retry mutations, bound unstable captures and detect same-size edits', async () => {
  const root = await workspace();
  const file = await source(root, 'changing', bytes(fusion()));
  let reads = 0;
  const capture = await stableRead(file, {
    attempts: 2,
    read: async fileName => {
      const current = await fs.readFile(fileName);
      reads++;
      await fs.writeFile(fileName, Buffer.from(current.toString().replace(
        reads % 2 ? 'invented-workflow' : 'different-workflw',
        reads % 2 ? 'different-workflw' : 'invented-workflow',
      )));
      return current;
    },
  });
  assert.equal(capture.stable, false);
  assert.equal(capture.attempts, 2);
  assert.equal(reads, 4);
  let once = false;
  const recovered = await stableRead(file, {
    read: async fileName => {
      const current = await fs.readFile(fileName);
      if (!once) {
        once = true;
        await fs.appendFile(fileName, '\n');
      }
      return current;
    },
  });
  assert.equal(recovered.stable, true);
  assert.equal(recovered.attempts, 2);
});

test('unstable sources stay partial and their frozen replay never upgrades the original stability claim', async () => {
  const root = await workspace();
  const input = path.join(root, 'input');
  await source(input, 'changing', bytes(fusion()));
  let readCount = 0;
  const output = path.join(root, 'capture');
  const captured = await captureCensus({
    sourceRoots: [input], outputDirectory: output,
    read: async fileName => {
      const current = await fs.readFile(fileName);
      readCount++;
      await fs.writeFile(fileName, bytes(event('session.fusion_future', inside, { fusionId: `invented-${readCount}` })));
      return current;
    },
  });
  assert.equal(captured.status, 'partial');
  assert.equal(captured.sources[0].state, 'unstable');
  assert.equal(captured.summary.unstableSources, 1);
  assert.deepEqual(await replayCensus({ frozenDirectory: output, outputDirectory: path.join(root, 'replay') }), captured);
});

test('discovery ignores backups and Local journals and skips linked roots and descendants', async () => {
  const root = await workspace();
  const input = path.join(root, 'input');
  await source(input, 'normal', bytes(fusion()));
  await source(path.join(input, 'backup'), 'not-native', bytes(fusion()));
  await fs.writeFile(path.join(input, 'local.jsonl'), bytes(fusion()));
  const external = path.join(root, 'outside');
  await source(external, 'hidden', bytes(fusion()));
  await fs.symlink(external, path.join(input, 'linked'), 'junction');
  const result = await captureCensus({ sourceRoots: [input], outputDirectory: path.join(root, 'report') });
  assert.equal(result.summary.physicalSources, 1);
  assert.ok(result.discovery[0].diagnostics.some(item => item.code === 'symlink'));
  assert.equal(result.status, 'partial');
  const linkedRoot = await captureCensus({ sourceRoots: [path.join(input, 'linked')], outputDirectory: path.join(root, 'linked-report') });
  assert.equal(linkedRoot.status, 'partial');
  assert.equal(linkedRoot.summary.physicalSources, 0);
});

test('frozen hash mismatch is reported and never replayed as verified evidence', async () => {
  const root = await workspace();
  const input = path.join(root, 'input');
  await source(input, 'invented', bytes(fusion()));
  const output = path.join(root, 'capture');
  await captureCensus({ sourceRoots: [input], outputDirectory: output });
  const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.private.json'), 'utf8'));
  await fs.appendFile(path.join(output, manifest.sources[0].frozenFile), 'tampered');
  const result = await replayCensus({ frozenDirectory: output, outputDirectory: path.join(root, 'replay') });
  assert.equal(result.status, 'partial');
  assert.equal(result.sources[0].state, 'hash-mismatch');
  assert.equal(result.summary.qualifiedSources, 0);
});

test('capture reports are deterministic and aggregate presence across source denominators', async () => {
  const root = await workspace();
  const input = path.join(root, 'input');
  await source(input, 'one', bytes(fusion(), event('new.family', inside, { value: null, status: 'pending' })));
  await source(input, 'two', bytes(fusion(), event('new.family', inside, { value: 0, status: 'ready' }), event('new.family')));
  const first = await captureCensus({ sourceRoots: [input], outputDirectory: path.join(root, 'first') });
  const second = await captureCensus({ sourceRoots: [input], outputDirectory: path.join(root, 'second') });
  assert.deepEqual(first, second);
  const group = first.inventory.find(item => item.type === 'new.family')!;
  assert.equal(group.events, 3);
  const value = group.fields.find(item => item.path === '$["data"]["value"]')!;
  assert.equal(value.eventsPresent, 2);
  assert.equal(value.missingEvents, 1);
  assert.equal(value.zeroOccurrences, 1);
  assert.deepEqual(value.types, { null: 1, number: 1 });
  assert.deepEqual(value.sources.map(item => item.source), ['S000001', 'S000002']);
});

test('freezing keeps CRLF, JSON whitespace and Unicode bytes rather than reserializing records', async () => {
  const root = await workspace();
  const input = path.join(root, 'input');
  const original = Buffer.from(`  ${JSON.stringify(fusion())} \r\n${JSON.stringify(event('future.family', inside, { content: 'Invented \u2603' }))}\r\n`);
  const native = await source(input, 'invented', original);
  const output = path.join(root, 'capture');
  await captureCensus({ sourceRoots: [input], outputDirectory: output });
  assert.deepEqual(await fs.readFile(native), original);
  assert.deepEqual(await fs.readFile(path.join(output, 'frozen', 'S000001.events.jsonl')), original);
});

test('CLI validates explicit inputs and outputs, runs synthetic capture and replays its frozen input', async () => {
  await assert.rejects(main([]), /output-dir/u);
  await assert.rejects(main(['--output-dir', 'not-used']), /source-root/u);
  await assert.rejects(main(['--output-dir', 'not-used', '--frozen-input', 'one', '--source-root', 'two']), /either/u);
  const root = await workspace();
  const input = path.join(root, 'input');
  await source(input, 'invented-cli', bytes(fusion()));
  const output = path.join(root, 'capture');
  const command = path.join('scripts', 'fusion-census-cli.ts');
  const capture = await execute(process.execPath, [command, '--source-root', input, '--output-dir', output]);
  assert.equal(JSON.parse(capture.stdout).qualifiedSources, 1);
  const replay = await execute(process.execPath, [
    command, '--frozen-input', output, '--output-dir', path.join(root, 'replay'),
  ]);
  assert.deepEqual(JSON.parse(replay.stdout), JSON.parse(capture.stdout));
  const help = await execute(process.execPath, [command, '--help']);
  assert.ok(help.stdout.includes(WINDOW_START));
  assert.ok(help.stdout.includes('PRIVATE'));
});

test('frozen manifests accept either platform separator but reject paths outside their frozen directory', async () => {
  const root = await workspace();
  const input = path.join(root, 'input');
  await source(input, 'invented', bytes(fusion()));
  const output = path.join(root, 'capture');
  const captured = await captureCensus({ sourceRoots: [input], outputDirectory: output });
  const manifestFile = path.join(output, 'manifest.private.json');
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  manifest.sources[0].frozenFile = path.sep === '\\' ? 'frozen/S000001.events.jsonl' : 'frozen\\S000001.events.jsonl';
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  assert.deepEqual(await replayCensus({ frozenDirectory: output, outputDirectory: path.join(root, 'portable-replay') }), captured);
  manifest.sources[0].frozenFile = path.join('..', 'outside.jsonl');
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(replayCensus({ frozenDirectory: output, outputDirectory: path.join(root, 'rejected-replay') }), /filename/u);
});

test('inventory-only keeps the same inventory and hashes without copying source event bytes', async () => {
  const root = await workspace();
  const input = path.join(root, 'input');
  const original = bytes(fusion(), event('user.message', inside, { content: 'PRIVATE-CONTENT-BODY' }));
  const native = await source(input, 'qualified', original);
  await source(input, 'duplicate', original);
  await source(input, 'context', bytes(fusion(before), event('user.message', inside, { content: 'PRIVATE-CONTEXT-BODY' })));
  await source(input, 'ordinary', bytes(event('user.message', inside, { content: 'PRIVATE-ORDINARY-BODY' })));
  const full = await captureCensus({ sourceRoots: [input], outputDirectory: path.join(root, 'full') });
  const output = path.join(root, 'inventory');
  const inventory = await captureCensus({ sourceRoots: [input], outputDirectory: output, inventoryOnly: true });
  assert.deepEqual(inventory.sources, full.sources);
  assert.deepEqual(inventory.inventory, full.inventory);
  assert.deepEqual(inventory.candidateInventory, full.candidateInventory);
  assert.deepEqual(inventory.summary, full.summary);
  assert.deepEqual(inventory.duplicates, full.duplicates);
  assert.equal(inventory.inventoryStatus, 'complete');
  assert.deepEqual(inventory.retention, { mode: 'inventory-only', replayable: false });
  assert.deepEqual(full.retention, { mode: 'freeze-selected', replayable: true });
  assert.deepEqual(await fs.readFile(native), original);
  assert.deepEqual(await fs.readdir(path.join(output, 'frozen')), []);
  for (const name of ['report.private.json.gz', 'manifest.private.json', 'summary.json']) {
    const stored = await fs.readFile(path.join(output, name));
    const raw = name.endsWith('.gz') ? gunzipSync(stored).toString('utf8') : stored.toString('utf8');
    const saved = JSON.parse(raw);
    assert.equal(saved.inventoryStatus, 'complete', name);
    assert.deepEqual(saved.retention, inventory.retention, name);
    for (const text of ['PRIVATE-CONTENT-BODY', 'PRIVATE-CONTEXT-BODY', 'PRIVATE-ORDINARY-BODY'])
      assert.ok(!raw.includes(text), `${name} must not retain prose`);
  }
  const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.private.json'), 'utf8'));
  assert.equal(manifest.sources.length, 4);
  for (const entry of manifest.sources) {
    assert.equal(entry.frozenFile, null);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/u);
  }
  assert.equal(manifest.sources.find((entry: { sourcePath: string }) => entry.sourcePath === native).sha256,
    createHash('sha256').update(original).digest('hex'));
});

test('inventory-only malformed diagnostics do not copy source prose into private reports', async () => {
  const root = await workspace();
  const input = path.join(root, 'input');
  await source(input, 'malformed', Buffer.concat([bytes(fusion()), Buffer.from('PRIVATE-BROKEN-PROSE\n')]));
  const output = path.join(root, 'inventory');
  const result = await captureCensus({ sourceRoots: [input], outputDirectory: output, inventoryOnly: true });
  assert.equal(result.inventoryStatus, 'partial');
  assert.equal(result.retention.replayable, false);
  assert.equal(result.sources[0].analysis!.counts.malformed, 1);
  assert.deepEqual(await fs.readdir(path.join(output, 'frozen')), []);
  const report = gunzipSync(await fs.readFile(path.join(output, 'report.private.json.gz'))).toString('utf8');
  assert.ok(!report.includes('PRIVATE-BROKEN-PROSE'));
  assert.ok(!(await fs.readFile(path.join(output, 'manifest.private.json'), 'utf8')).includes('PRIVATE-BROKEN-PROSE'));
});

test('frozen replay rejects inventory-only manifests and CLI rejects the mixed capture/replay options', async () => {
  const root = await workspace();
  const input = path.join(root, 'input');
  await source(input, 'invented', bytes(fusion()));
  const output = path.join(root, 'inventory');
  const command = path.join('scripts', 'fusion-census-cli.ts');
  const captured = await execute(process.execPath, [command, '--inventory-only', '--source-root', input, '--output-dir', output]);
  const summary = JSON.parse(captured.stdout);
  assert.equal(summary.inventoryStatus, 'complete');
  assert.deepEqual(summary.retention, { mode: 'inventory-only', replayable: false });
  const replay = path.join(root, 'rejected-replay');
  await assert.rejects(replayCensus({ frozenDirectory: output, outputDirectory: replay }), /inventory-only.*not-replayable/u);
  await assert.rejects(fs.stat(replay), { code: 'ENOENT' });
  await assert.rejects(main([
    '--inventory-only', '--frozen-input', output, '--output-dir', path.join(root, 'mixed'),
  ]), /inventory-only.*capture-only/u);
  await assert.rejects(execute(process.execPath, [
    command, '--frozen-input', output, '--output-dir', path.join(root, 'cli-rejected-replay'),
  ]), /inventory-only-not-replayable/u);
});

test('compressed inventory roundtrips every observation and slim manifests contain summaries rather than analyses', async () => {
  const root = await workspace();
  const input = path.join(root, 'input');
  const longId = `${'x'.repeat(65_535)}\ud83d\ude00"\\\n\ud800`;
  await source(input, 'invented', bytes(fusion(), ...Array.from({ length: 160 }, (_, index) =>
    event('future.family', inside, { phaseId: index === 0 ? longId : `phase-${index}`, nested: { value: index, empty: [] } }))));
  const output = path.join(root, 'inventory');
  const report = await captureCensus({ sourceRoots: [input], outputDirectory: output, inventoryOnly: true });
  const compressed = await fs.readFile(path.join(output, 'report.private.json.gz'));
  const decoded = gunzipSync(compressed);
  assert.deepEqual(JSON.parse(decoded.toString('utf8')), report);
  assert.equal(decoded.toString('utf8'), JSON.stringify(report, null, 2) + '\n');
  await assert.rejects(fs.stat(path.join(output, 'report.private.json')), { code: 'ENOENT' });
  assert.deepEqual(await fs.readdir(path.join(output, 'frozen')), []);
  const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.private.json'), 'utf8'));
  assert.equal(manifest.report.file, 'report.private.json.gz');
  assert.equal(manifest.report.compression, 'gzip');
  assert.equal(manifest.report.bytes, compressed.length);
  assert.equal(manifest.report.uncompressedBytes, decoded.length);
  assert.equal(manifest.report.sha256, createHash('sha256').update(compressed).digest('hex'));
  assert.equal(manifest.report.uncompressedSha256, createHash('sha256').update(decoded).digest('hex'));
  assert.ok(!Object.hasOwn(manifest.sources[0], 'report'));
  assert.ok(!Object.hasOwn(manifest.sources[0], 'analysis'));
  assert.deepEqual(manifest.sources[0].counts, report.sources[0].analysis!.counts);
  assert.equal(manifest.sources[0].selection, report.sources[0].analysis!.selection);
  assert.deepEqual(manifest.sources[0].analysisDiagnostics, report.sources[0].analysis!.diagnostics);
  assert.ok((await fs.stat(path.join(output, 'manifest.private.json'))).size < decoded.length / 4);
});

test('saving an existing inventory needs no native files and keeps the original artifacts unchanged', async () => {
  const { inventoryManifestMetadata, saveInventoryOnlyReport, validateInventoryReport } = await import('../scripts/fusion-census-files.ts');
  const root = await workspace();
  const input = path.join(root, 'input');
  await source(input, 'invented', bytes(fusion(), event('future.family')));
  const fullOutput = path.join(root, 'full');
  const full = await captureCensus({ sourceRoots: [input], outputDirectory: fullOutput });
  const report = { ...full, retention: { mode: 'inventory-only' as const, replayable: false } };
  const legacy = JSON.parse(await fs.readFile(path.join(fullOutput, 'manifest.private.json'), 'utf8'));
  legacy.retention = report.retention;
  legacy.sources[0].frozenFile = null;
  legacy.sources[0].sourcePath = path.join(root, 'unavailable-native-source', 'events.jsonl');
  const original = path.join(root, 'legacy-inventory');
  await fs.mkdir(original);
  const reportBytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
  legacy.provenance.reportSha256 = createHash('sha256').update(reportBytes).digest('hex');
  const manifestBytes = Buffer.from(JSON.stringify(legacy, null, 2) + '\n');
  await fs.writeFile(path.join(original, 'report.private.json'), reportBytes, { flag: 'wx' });
  await fs.writeFile(path.join(original, 'manifest.private.json'), manifestBytes, { flag: 'wx' });
  const metadata = inventoryManifestMetadata(legacy);
  assert.ok(!Object.hasOwn(metadata.sources[0], 'report'));
  const output = path.join(root, 'compressed');
  const descriptor = await saveInventoryOnlyReport({ report, manifestMetadata: metadata, inputDirectory: original, outputDirectory: output });
  assert.equal(descriptor.uncompressedSha256, legacy.provenance.reportSha256);
  await validateInventoryReport(output, descriptor);
  assert.deepEqual(JSON.parse(gunzipSync(await fs.readFile(path.join(output, descriptor.file))).toString('utf8')), report);
  assert.deepEqual(await fs.readFile(path.join(original, 'report.private.json')), reportBytes);
  assert.deepEqual(await fs.readFile(path.join(original, 'manifest.private.json')), manifestBytes);
  const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.private.json'), 'utf8'));
  assert.equal(manifest.sources[0].sourcePath, legacy.sources[0].sourcePath);
  assert.deepEqual(manifest.sources[0].capture, legacy.sources[0].capture);
  assert.deepEqual(manifest.provenance.capture, legacy.provenance);
  await assert.rejects(saveInventoryOnlyReport({ report, manifestMetadata: metadata, inputDirectory: original, outputDirectory: output }), /exist/iu);
  await fs.appendFile(path.join(output, descriptor.file), 'changed');
  await assert.rejects(validateInventoryReport(output, descriptor));
});
