import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const folder = new URL('../work-items/notes/WI-052/catalogue/', import.meta.url);
const workbench = readFileSync(new URL('workbench.js', folder), 'utf8').split('\nwireToolbar();')[0]!;
const server = readFileSync(new URL('serve.mjs', folder), 'utf8')
  .replace(/^import .*;\r?$/gm, '').split('const server = http.createServer')[0]!;
const engine = readFileSync(new URL('template-engine.mjs', folder), 'utf8').replace(/^export /gm, '');
const contextSource = readFileSync(new URL('context.mjs', folder), 'utf8').replace(/^export /gm, '');
const suggestions = readFileSync(new URL('suggestions.mjs', folder), 'utf8').replace(/^export /gm, '');
const builder = readFileSync(new URL('build-catalogue.mjs', folder), 'utf8');
const facts = builder.slice(builder.indexOf('const seenUnits ='), builder.indexOf('function familyOf'));
const schema = 'wi052-lod-format-choices/1';
const choices = () => ({ schema, catalogueId: 'test-catalogue', saved: null, concepts: {}, rows: {} });
const common = readFileSync(new URL('common.mjs', folder), 'utf8')
  .split('export function sha256')[1]!.split('export function requirePrivateOutput')[0]!;
const scanner = readFileSync(new URL('scan-sessions.mjs', folder), 'utf8')
  .replace(/^import .*;\r?$/gm, '').split('const wantedSources =')[0]!;

function evidenceContext(extra: Record<string, unknown> = {}) {
  const context = vm.createContext({ createHash, Buffer, structuredClone, ...extra });
  vm.runInContext(('function sha256' + common).replace(/^export /gm, ''), context);
  return context;
}

function page () {
  const alerts: string[] = [];
  const drafts = new Map<string, string>();
  const elements = new Map<string, { textContent: string; className: string; disabled: boolean; hidden: boolean }>();
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const row = { id: 'tool:test', name: 'test', concept: 'tools', include: 'show', seen: { chatCount: 0 }, suggest: { short: 'Suggested', medium: 'Suggested', shortHash: '123', mediumHash: '456' } };
  const data = { index: { catalogueId: 'test-catalogue', rows: [row], concepts: [{ id: 'tools', include: 'show', short: 'Suggested', medium: 'Suggested' }] }, examples: {}, choices: choices() };
  const context = vm.createContext({
    TextEncoder, Blob, console,
    document: {
      getElementById: (id: string) => {
        if (id === 'catalogue-data')
          return { textContent: JSON.stringify(data) };
        if (!elements.has(id))
          elements.set(id, { textContent: '', className: '', disabled: false, hidden: false });
        return elements.get(id);
      },
      querySelectorAll: () => [],
    },
    window: { alert: (message: string) => alerts.push(message) },
    localStorage: {
      getItem: (key: string) => drafts.get(key) ?? null,
      setItem: (key: string, value: string) => drafts.set(key, value),
      removeItem: (key: string) => drafts.delete(key),
    },
    setTimeout: (callback: () => void) => {
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  vm.runInContext(engine + '\n' + workbench, context);
  vm.runInContext("state.server = true; state.savedSnapshot = snapshot(state.choices); state.choices.rows['tool:test'] = { short: 'Before save' };", context);
  return {
    context, alerts, drafts, elements,
    run: <T>(source: string): T => vm.runInContext(source, context),
    flush: () => {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach(callback => callback());
    },
  };
}

test('workbench save keeps edits and their draft when typing continues during the request', async () => {
  const fixture = page();
  let complete!: (response: { ok: boolean }) => void;
  const pending = new Promise<{ ok: boolean }>(resolve => {
    complete = resolve;
  });
  let submitted = '';
  fixture.context.fetch = (_url: string, options: { body: string }) => {
    submitted = options.body;
    return pending;
  };
  const saving = fixture.run<Promise<void>>('save()');
  fixture.run("state.choices.rows['tool:test'].short = 'After save started'; saveDraft();");
  complete({ ok: true });
  await saving;
  assert.equal(JSON.parse(submitted).rows['tool:test'].short, 'Before save');
  assert.equal(fixture.run('isDirty()'), true);
  assert.match([...fixture.drafts.values()].join(), /After save started/);
  assert.match(fixture.elements.get('status')!.textContent, /Unsaved/);
});

test('workbench allows only one save at a time and clears the draft after an unchanged successful save', async () => {
  const fixture = page();
  let complete!: (response: { ok: boolean }) => void;
  const pending = new Promise<{ ok: boolean }>(resolve => {
    complete = resolve;
  });
  let requests = 0;
  fixture.context.fetch = () => {
    requests += 1;
    return pending;
  };
  fixture.run('saveDraft()');
  fixture.flush();
  const saving = fixture.run<Promise<void>>('save()');
  assert.equal(fixture.elements.get('save')!.disabled, true);
  await fixture.run<Promise<void>>('save()');
  assert.equal(requests, 1);
  complete({ ok: true });
  await saving;
  assert.equal(fixture.run('isDirty()'), false);
  assert.equal(fixture.drafts.size, 0);
  assert.equal(fixture.elements.get('save')!.disabled, false);
});

test('failed workbench saves keep edits, saved timestamp and recovery draft', async () => {
  const fixture = page();
  fixture.context.fetch = async () => ({ ok: false, status: 500, text: async () => 'Disk error' });
  fixture.run('saveDraft()');
  fixture.flush();
  await fixture.run<Promise<void>>('save()');
  assert.equal(fixture.run('isDirty()'), true);
  assert.equal(fixture.run('state.choices.saved'), null);
  assert.equal(fixture.drafts.size, 1);
  assert.equal(fixture.elements.get('save')!.disabled, false);
  assert.match(fixture.elements.get('status')!.textContent, /Save failed.*Disk error/);
});

test('formats and notes longer than 4000 characters survive editing, serialization and draft restoration', () => {
  const fixture = page();
  fixture.run(`
    const longText = 'x'.repeat(4001);
    state.choices.rows['tool:test'] = { short: longText, medium: longText, note: longText };
    state.choices.concepts.tools = { short: longText, medium: longText };
    const restored = normaliseChoices(JSON.parse(serialise(state.choices)));
  `);
  for (const field of ['short', 'medium', 'note'])
    assert.equal(fixture.run(`restored.choices.rows['tool:test'].${field}.length`), 4001);
  for (const field of ['short', 'medium'])
    assert.equal(fixture.run(`restored.choices.concepts.tools.${field}.length`), 4001);
  fixture.run("setNote(rows[0], 'n'.repeat(4001)); saveDraft();");
  fixture.flush();
  assert.equal(fixture.run("state.choices.rows['tool:test'].note.length"), 4001);
  fixture.run("const draftRestored = normaliseChoices(JSON.parse(JSON.parse(localStorage.getItem(DRAFT_KEY)).snapshot));");
  assert.equal(fixture.run("draftRestored.choices.rows['tool:test'].short.length"), 4001);
});

test('oversized UTF-8 saves warn before requesting and keep edits downloadable', async () => {
  const fixture = page();
  let requests = 0;
  fixture.context.fetch = async () => {
    requests += 1;
    return { ok: true };
  };
  fixture.run("state.choices.rows['tool:test'].short = '\\u00e9'.repeat(3 * 1024 * 1024); saveDraft();");
  fixture.flush();
  await fixture.run<Promise<void>>('save()');
  assert.equal(requests, 0);
  assert.equal(fixture.alerts.length, 1);
  assert.match(fixture.alerts[0]!, /5 MiB.*Download copy/s);
  assert.equal(fixture.run('isDirty()'), true);
  assert.equal(fixture.drafts.size, 1);
  fixture.run('let downloaded; download = (name, text) => { downloaded = JSON.parse(text); }; downloadCopy();');
  assert.equal(fixture.run("downloaded.rows['tool:test'].short.length"), 3 * 1024 * 1024);
});

test('oversized imports warn without reading the file or replacing current edits', async () => {
  const fixture = page();
  await fixture.run<Promise<void>>("loadFromFile({ size: 5 * 1024 * 1024 + 1, text() { throw new Error('Must not read oversized input'); } })");
  assert.equal(fixture.alerts.length, 1);
  assert.equal(fixture.run("state.choices.rows['tool:test'].short"), 'Before save');
  assert.equal(fixture.run('isDirty()'), true);
});

test('a choices file at exactly 5 MiB can still be saved', async () => {
  const fixture = page();
  let bytes = 0;
  fixture.context.fetch = async (_url: string, options: { body: string }) => {
    bytes = Buffer.byteLength(options.body, 'utf8');
    return { ok: true };
  };
  fixture.run(`
    state.choices.rows['tool:test'].short = '';
    const overhead = new TextEncoder().encode(serialise({ ...state.choices, saved: '2026-11-16T12:00:00.000Z' })).byteLength;
    state.choices.rows['tool:test'].short = 'x'.repeat(5 * 1024 * 1024 - overhead);
  `);
  await fixture.run<Promise<void>>('save()');
  assert.equal(bytes, 5 * 1024 * 1024);
  assert.equal(fixture.alerts.length, 0);
  assert.equal(fixture.run('isDirty()'), false);
});

test('review filters distinguish examined rows from approval and overlap the Edited filter', () => {
  const fixture = page();
  fixture.run("setReview(rows[0], 'accepted'); updateStats();");
  assert.match(fixture.elements.get('stats')!.textContent, /1 accepted.*1 edited/);
  for (const [filter, expected] of [['accepted', true], ['edited', true], ['not-reviewed', false], ['not-accepted', false], ['reviewed', false]] as const) {
    fixture.run(`state.filters.review = '${filter}'`);
    assert.equal(fixture.run('matches(rows[0])'), expected, filter);
  }
  fixture.run("setReview(rows[0], 'reviewed'); updateStats();");
  for (const [filter, expected] of [['accepted', false], ['edited', true], ['not-reviewed', false], ['not-accepted', true], ['reviewed', true]] as const) {
    fixture.run(`state.filters.review = '${filter}'`);
    assert.equal(fixture.run('matches(rows[0])'), expected, filter);
  }
});

test('effective template and include changes reset review, while notes and unchanged text do not', () => {
  const fixture = page();
  fixture.run("setReview(rows[0], 'accepted'); setNote(rows[0], 'Needs an explanation'); setTemplate(rows[0], 'row', 'short', 'Before save');");
  assert.equal(fixture.run("reviewState(rows[0]).state"), 'accepted');
  fixture.run("setTemplate(rows[0], 'row', 'short', 'A different format');");
  assert.equal(fixture.run("reviewState(rows[0]).state"), 'not-reviewed');
  fixture.run("setReview(rows[0], 'reviewed'); toggleInclude(rows[0]);");
  assert.equal(fixture.run("reviewState(rows[0]).state"), 'not-reviewed');
  fixture.run("setReview(rows[0], 'accepted'); resetTemplate(rows[0], 'short');");
  assert.equal(fixture.run("reviewState(rows[0]).state"), 'not-reviewed');
});

test('group changes reset only rows whose effective templates or include setting change', () => {
  const fixture = page();
  fixture.run(`
    const inherited = { ...rows[0], id: 'tool:inherited', name: 'inherited' };
    rows.push(inherited);
    rowsById.set(inherited.id, inherited);
    rowsByConcept.get('tools').push(inherited);
    setReview(rows[0], 'accepted');
    setReview(inherited, 'reviewed');
    setTemplate(rows[0], 'group', 'short', 'New group format');
  `);
  assert.equal(fixture.run("reviewState(rows[0]).state"), 'accepted');
  assert.equal(fixture.run("reviewState(rows[1]).state"), 'not-reviewed');
  fixture.run(`
    state.choices.rows['tool:test'].include = 'hide';
    setReview(rows[0], 'accepted');
    setReview(rows[1], 'reviewed');
    toggleGroupInclude(conceptsById.get('tools'));
  `);
  assert.equal(fixture.run("reviewState(rows[0]).state"), 'accepted');
  assert.equal(fixture.run("reviewState(rows[1]).state"), 'not-reviewed');
});

test('saved review fingerprints detect changed suggestions and report unverifiable imported marks', () => {
  const fixture = page();
  fixture.run("setReview(rows[0], 'accepted'); const reviewedFile = serialise(state.choices);");
  assert.equal(fixture.run("normaliseChoices(JSON.parse(reviewedFile)).choices.rows['tool:test'].review"), 'accepted');
  fixture.run("rows[0].suggest.medium = 'Changed suggestion'; const outdated = normaliseChoices(JSON.parse(reviewedFile));");
  assert.equal(fixture.run("outdated.choices.rows['tool:test'].review"), undefined);
  assert.equal(fixture.run('outdated.report.resetReviews'), 1);
  fixture.run("const legacyFile = JSON.parse(reviewedFile); delete legacyFile.rows['tool:test'].reviewHash; const legacy = normaliseChoices(legacyFile);");
  assert.equal(fixture.run('legacy.report.resetReviews'), 1);
});

test('Seen counts include session fields and sort by scanned chats rather than requests plus starts', () => {
  const context = vm.createContext({});
  vm.runInContext(facts, context);
  assert.equal(vm.runInContext("seenOf({ observed: { counts: { localSessions: 117 }, sessions: { local: 117, sdk: 0 } } }).parts[0].value", context), 117);
  assert.equal(vm.runInContext("seenOf({ observed: { counts: { sdkRequests: 80, sdkStarts: 70 }, sessions: { local: 0, sdk: 3 } } }).chatCount", context), 3);
  assert.equal(vm.runInContext('seenOf({}).chatCount', context), null);
  const fixture = page();
  fixture.run(`
    const frequent = { ...rows[0], name: 'frequent', seen: { chatCount: 1, total: 1000 } };
    const widespread = { ...rows[0], name: 'widespread', seen: { chatCount: 10, total: 10 } };
    state.sort = { key: 'seen', direction: 'desc' };
  `);
  assert.ok(fixture.run<number>('compareRows(frequent, widespread)') > 0);
  fixture.run("rowsByConcept.set('rank-test', [frequent, widespread]);");
  assert.equal(fixture.run("conceptSeenRank('rank-test')"), 10);
});

test('scan diagnostics expose only aggregate counts and the warning remains separate from choice-load banners', () => {
  const context = vm.createContext({});
  vm.runInContext(facts, context);
  const summary = vm.runInContext("JSON.stringify(scanDiagnostics({ sources: [{ parseErrors: 3, replayErrors: 0, id: 'private-id' }, { parseErrors: 0, replayErrors: 0 }], problems: [] }))", context);
  const fixture = page();
  fixture.run(`INDEX.provenance = { scan: { diagnostics: ${summary} } }; showScanWarnings();`);
  assert.match(fixture.elements.get('scan-warning')!.textContent, /3.*1 source/);
  assert.doesNotMatch(fixture.elements.get('scan-warning')!.textContent, /private-id/);
  assert.equal(fixture.elements.get('scan-warning')!.hidden, false);
  fixture.run("INDEX.provenance.scan.diagnostics = { parseErrors: 0, parseErrorsSources: 0, replayErrors: 0, replayErrorsSources: 0, problems: 0 }; showScanWarnings();");
  assert.equal(fixture.elements.get('scan-warning')!.hidden, true);
  fixture.run('delete INDEX.provenance.scan.diagnostics; showScanWarnings();');
  assert.match(fixture.elements.get('scan-warning')!.textContent, /unavailable/);
  assert.equal(fixture.elements.get('scan-warning')!.hidden, false);
});

test('short shell suggestions show a nonzero exit even when the tool reports success without an error', () => {
  const context = vm.createContext({ TextEncoder });
  vm.runInContext(engine + '\n' + contextSource + '\n' + suggestions, context);
  vm.runInContext(`
    const shellRow = { key: 'tool:powershell', name: 'powershell' };
    const shellExample = { family: 'sdk', value: {
      start: { data: { toolName: 'powershell', arguments: { command: 'check' } } },
      complete: { data: { success: true, shellExecution: { exitCode: 1 } } }
    } };
    const shellContext = buildContext(shellRow, shellExample);
  `, context);
  assert.match(vm.runInContext("renderTemplate(concepts['shell-run'].short, shellContext).text", context), /exit 1/);
  assert.equal(vm.runInContext('shellContext.ok', context), true);
  vm.runInContext('shellContext.exitCode = 0', context);
  assert.doesNotMatch(vm.runInContext("renderTemplate(concepts['shell-run'].short, shellContext).text", context), /✗/);
});

test('helper server accepts long formats and keeps more than 20 distinct backups in the same second', async context => {
  const root = process.env.CCE_CACHE_DIR;
  assert.ok(root, 'Use pnpm test for isolated filesystem tests.');
  const directory = await mkdtemp(path.join(root, 'lod-choices-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const sandbox = vm.createContext({
    constants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync,
    path, console, process: { argv: [] }, catalogueFolder: directory, privateFolder: directory,
  });
  vm.runInContext(server, sandbox);
  vm.runInContext("const NativeDate = Date; Date = class extends NativeDate { constructor() { super('2026-11-16T12:00:00Z'); } };", sandbox);
  const data = { ...choices(), rows: { 'tool:test': { short: 'x'.repeat(4001), medium: 'm'.repeat(4001), note: 'n'.repeat(4001), review: 'reviewed', reviewHash: '12345678' } } };
  sandbox.input = data;
  vm.runInContext('writeChoices(validateChoices(input))', sandbox);
  const saved = JSON.parse(readFileSync(path.join(directory, 'lod-format-choices.json'), 'utf8'));
  assert.deepEqual(saved, data);
  for (const value of ['second', 'third'])
    vm.runInContext(`input.rows['tool:test'].short = '${value}'; writeChoices(validateChoices(input));`, sandbox);
  const backups = readdirSync(path.join(directory, 'choices-backups'));
  assert.equal(backups.length, 2);
  const values = backups.map(name => JSON.parse(readFileSync(path.join(directory, 'choices-backups', name), 'utf8')).rows['tool:test'].short);
  assert.deepEqual(values, ['x'.repeat(4001), 'second']);
  for (let index = 0; index < 30; index += 1) {
    writeFileSync(path.join(directory, 'lod-format-choices.json'), JSON.stringify({ version: index }));
    vm.runInContext('backUp()', sandbox);
  }
  const allBackups = readdirSync(path.join(directory, 'choices-backups'));
  assert.equal(allBackups.length, 32);
  for (const [index, name] of backups.entries()) {
    assert.ok(allBackups.includes(name));
    assert.equal(JSON.parse(readFileSync(path.join(directory, 'choices-backups', name), 'utf8')).rows['tool:test'].short, values[index]);
  }
});

test('complete evidence keeps long text, array tails and object fields while redacting and counting binary omissions', () => {
  const context = evidenceContext();
  vm.runInContext(`
    const raw = {
      text: 'Recorded line with spaces.\\n'.repeat(12000) + 'LAST RECORDED LINE',
      list: Array.from({ length: 80 }, (_, index) => ({ index })),
      fields: Object.fromEntries(Array.from({ length: 100 }, (_, index) => ['field' + index, index])),
      binary: 'A'.repeat(800),
      email: 'person@example.invalid',
      keyed: JSON.parse('{"__proto__":"keep", "one@example.invalid":1, "two@example.invalid":2}')
    };
    const prepared = prepareExample(raw);
    const complete = prepared.fullEvidence;
  `, context);
  assert.equal(vm.runInContext("complete.value.text.endsWith('LAST RECORDED LINE')", context), true);
  assert.ok(vm.runInContext('complete.value.text.length', context) > 200000);
  assert.equal(vm.runInContext('complete.value.list[79].index', context), 79);
  assert.equal(vm.runInContext('complete.value.fields.field99', context), 99);
  assert.equal(vm.runInContext("complete.value.keyed['__proto__']", context), 'keep');
  assert.equal(vm.runInContext('Object.keys(complete.value.keyed).length', context), 3);
  assert.equal(vm.runInContext('complete.value.email', context), '<email>');
  assert.equal(vm.runInContext('complete.omissions.length', context), 1);
  assert.equal(vm.runInContext('complete.omissions[0].chars', context), 800);
  assert.doesNotMatch(vm.runInContext('JSON.stringify(complete)', context), /person@example|AAAAA|clipped/);
});

test('recovery requires the original hash and applies whole-example privacy replacement before keeping full text', () => {
  const context = evidenceContext();
  vm.runInContext(`
    const original = { text: 'Recorded value. '.repeat(400) };
    const previous = prepareExample(original);
    delete previous.fullEvidence;
    const restored = recoverExample(previous, original, 'test');
    const changed = recoverExample(previous, { text: 'Changed value' }, 'test');
    const sensitive = { text: 'Safe preview. '.repeat(400) + 'https://portal.example.mil/private' };
    const replacement = recoverExample({ ...prepareExample(sensitive), value: { text: 'Old safe preview' } }, sensitive, 'test');
  `, context);
  assert.equal(vm.runInContext('restored.fullEvidence.value.text === original.text', context), true);
  assert.equal(vm.runInContext('changed', context), null);
  assert.equal(vm.runInContext('previous.fullEvidence', context), undefined);
  assert.equal(vm.runInContext('replacement.privacyReplacement', context), true);
  assert.doesNotMatch(vm.runInContext('JSON.stringify(replacement)', context), /portal|Safe preview|Old safe preview/);
});

test('Local and SDK scans keep Unicode separators inside JSON records and report genuinely invalid lines', async context => {
  const root = process.env.CCE_CACHE_DIR;
  assert.ok(root, 'Use pnpm test for isolated filesystem tests.');
  const directory = await mkdtemp(path.join(root, 'lod-records-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const text = 'Before\u2028middle\u2029after';
  for (const family of ['local', 'sdk']) {
    const file = path.join(directory, `${family}.jsonl`);
    const records = family === 'local'
      ? [{ kind: 0, v: { answer: 'Initial' } }, { kind: 1, k: ['answer'], v: text }]
      : [{ type: 'session.start', data: { text: 'Initial' } }, { type: 'session.start', data: { text } }];
    writeFileSync(file, JSON.stringify(records[0]) + '\r\n\nnot JSON\n' + JSON.stringify(records[1]));
    const runtime = evidenceContext({
      fs: { ...fs, createReadStream: (name: string, options: object) => fs.createReadStream(name, { ...options, highWaterMark: 7 }) },
      path, privateFolder: directory, requirePrivateOutput: (name: string) => name,
      process: { argv: ['node', 'scan'] }, file,
    });
    vm.runInContext(scanner, runtime);
    vm.runInContext("const source = { sid: 'test', day: null, file, lines: 0, parseErrors: 0, replayErrors: 0, replayMessages: new Set() };", runtime);
    await vm.runInContext(family === 'local' ? 'scanLocal(source)' : 'scanSdk(source)', runtime);
    assert.equal(vm.runInContext('source.lines', runtime), 3);
    assert.equal(vm.runInContext('source.parseErrors', runtime), 1);
    assert.equal(vm.runInContext('source.replayErrors', runtime), 0);
    if (family === 'local') {
      assert.equal(vm.runInContext("rows.get('local-session-field:answer').slots['local:typical'].value", runtime), text);
    } else {
      assert.equal(vm.runInContext("rows.get('sdk-event:session.start').counts.sdkEvents", runtime), 2);
      assert.ok(vm.runInContext("JSON.stringify(rows.get('sdk-event:session.start').slots).includes('Before\\u2028middle\\u2029after')", runtime));
    }
  }
});

test('selected Local and SDK evidence recovers from bounded source prefixes without changing scan counts', async context => {
  const root = process.env.CCE_CACHE_DIR;
  assert.ok(root, 'Use pnpm test for isolated filesystem tests.');
  const directory = await mkdtemp(path.join(root, 'lod-evidence-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const localFile = path.join(directory, 'local.jsonl');
  const sdkFile = path.join(directory, 'events.jsonl');
  const scanFile = path.join(directory, 'scan.json');
  const local = { answer: 'Historical answer. '.repeat(400) };
  const event = { type: 'session.start', data: { text: 'Historical event. '.repeat(400) } };
  const localPrefix = JSON.stringify({ kind: 0, v: local }) + '\n';
  const sdkPrefix = JSON.stringify(event) + '\n';
  writeFileSync(localFile, localPrefix + JSON.stringify({ kind: 1, k: ['answer'], v: 'Later change' }) + '\n');
  writeFileSync(sdkFile, sdkPrefix + JSON.stringify({ ...event, data: { text: 'Later event' } }) + '\n');
  const helpers = evidenceContext({ rawLocal: local.answer, rawSdk: event });
  const scan = vm.runInContext(`JSON.stringify({ schema: 'wi052-catalogue-scan/1', sources: [], rows: [
    { key: 'local-session-field:answer', counts: { localSessions: 7 }, examples: [{ ...prepareExample(rawLocal), fullEvidence: undefined, family: 'local', sid: 'local', slot: 'local:typical', locator: 'session.answer' }] },
    { key: 'sdk-event:session.start', counts: { sdkEvents: 9 }, examples: [{ ...prepareExample(rawSdk), fullEvidence: undefined, family: 'sdk', sid: 'sdk', slot: 'sdk:typical', locator: 'events.jsonl line 1' }] },
    { key: 'tool:missing', counts: { sdkStarts: 1 }, examples: [{ ...prepareExample(rawSdk), fullEvidence: undefined, family: 'sdk', sid: 'missing', slot: 'sdk:typical', locator: 'events.jsonl line 1' }] }
  ] })`, helpers);
  writeFileSync(scanFile, scan);
  const runtime = evidenceContext({
    fs, path, privateFolder: directory, requirePrivateOutput: (file: string) => file,
    process: { argv: ['node', 'scan', '--recover', '--out', scanFile] },
    localFile, sdkFile, localBytes: Buffer.byteLength(localPrefix), sdkBytes: Buffer.byteLength(sdkPrefix),
  });
  vm.runInContext(scanner, runtime);
  await vm.runInContext(`scanLocal({ sid: 'local', day: null, file: localFile, byteLimit: localBytes, lines: 0, parseErrors: 0, replayErrors: 0, replayMessages: new Set() })`, runtime);
  await vm.runInContext(`scanSdk({ sid: 'sdk', day: null, file: sdkFile, byteLimit: sdkBytes, lines: 0, parseErrors: 0 })`, runtime);
  assert.equal(vm.runInContext('recoveryScan.rows[0].examples[0].fullEvidence.value', runtime), local.answer);
  assert.equal(vm.runInContext('recoveryScan.rows[1].examples[0].fullEvidence.value.data.text', runtime), event.data.text);
  assert.equal(vm.runInContext('recoveryScan.rows[2].examples[0].fullEvidence.status', runtime), 'unavailable');
  assert.equal(vm.runInContext('recoveryScan.rows[0].counts.localSessions', runtime), 7);
  assert.equal(vm.runInContext('recoveryScan.rows[1].counts.sdkEvents', runtime), 9);
  assert.equal(vm.runInContext('recoveryScan.rows.length', runtime), 3);
});

test('evidence panels stay collapsed and render complete text beyond 200000 characters or label a saved preview', () => {
  const fixture = page();
  fixture.run(`
    el = (tag, props, ...children) => ({
      tag, ...props, children: children.flat(),
      append(...items) { this.children.push(...items); },
      addEventListener(event, callback) { this[event] = callback; }
    });
    kv = entries => ({ entries });
    EXAMPLES['tool:test'] = [{
      slot: 'sdk:ok', value: 'Short preview', clipped: [{ path: '', reason: 'long string' }],
      fullEvidence: { status: 'complete', value: 'Recorded text. '.repeat(18000) + 'TAIL', omissions: [] }
    }];
    const tree = evidenceSection(rows[0]);
    const details = tree.children.find(child => child.tag === 'details');
  `);
  assert.equal(fixture.run('details.open'), undefined);
  assert.equal(fixture.run("details.children.some(child => child.tag === 'pre')"), false);
  fixture.run('details.open = true; details.toggle();');
  assert.equal(fixture.run("details.children.find(child => child.tag === 'pre').text.endsWith('TAIL\\\"')"), true);
  assert.ok(fixture.run<number>("details.children.find(child => child.tag === 'pre').text.length") > 200000);
  fixture.run("delete EXAMPLES['tool:test'][0].fullEvidence;");
  assert.match(fixture.run("evidenceValue(EXAMPLES['tool:test'][0]).label"), /unavailable.*preview/i);
});
