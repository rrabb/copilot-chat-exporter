import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { setWorkspaceRoot } from '../src/host.ts';
import { renderSession, sessionToJson, type LoadedSession } from '../src/index.ts';
import type { ParsedSession } from '../src/types.ts';
import { testSession, testTool, testTurn } from './helpers.ts';

const ROOT = path.join(path.sep, 'proj');
setWorkspaceRoot(ROOT);

const loadedFixture = (over: Partial<ParsedSession> = {}): LoadedSession => ({
  location: {
    sessionId: 'abcdef01-0000-4000-8000-000000000000',
    sessionPath: path.join(ROOT, 'chatSessions', 'abcdef01.jsonl'),
    hashRoot: ROOT,
  },
  host: { workspaceRoot: ROOT, outDir: ROOT, gitStatus: () => '' },
  raw: '',
  versions: { copilotVersion: '0.62.0', vscodeVersion: '1.134.0' },
  resources: { resources: [], byCall: new Map(), resourceRoot: path.join(ROOT, 'resources') },
  memory: { session: [], repo: [], user: [] },
  lineCounts: new Map(),
  session: testSession({
    title: 'A session',
    customTitle: 'A session',
    defaultTitle: 'do the thing',
    creationDate: 1700000000000,
    editedFiles: ['src/cli.ts'],
    census: {
      seen: new Map([['thinking', 3], ['toolInvocationSerialized', 2]]),
      dropped: new Map([['thinking', 1]]),
      toolData: new Map([['terminal', 2]]),
      unhandled: [],
      unrecognizedToolData: [],
    },
    rawRequests: [{ requestId: 'r1', response: [{ value: 'the whole raw journal' }] }],
    turns: [testTurn({
      number: 1,
      ts: 1700000001000,
      reasoning: ['thought one'],
      body: [{ type: 'text', text: 'done' }],
      toolNodes: [testTool({ toolCallId: 'c1', invocation: 'Read a file' })],
      scalar: { modelId: 'gpt-5', promptTokens: 10, completionTokens: 20, copilotCredits: 0.5, elapsedMs: 1000 },
    })],
    ...over,
  }),
});

const renderOptions = { outputPath: path.join(ROOT, 'out.md'), gitStatus: ' M src/cli.ts', generatedAt: '2026-08-24T07:04:00.000Z' };

// --- the parsed model as data ------------------------------------------------------------------

test('census Maps survive serialisation as objects', () => {
  // The one place JSON output needs real work: a Map stringifies to `{}`, so the whole schema
  // census would silently vanish from the file.
  const json = JSON.parse(JSON.stringify(sessionToJson(loadedFixture())));
  assert.deepEqual(json.census.seen, { thinking: 3, toolInvocationSerialized: 2 });
  assert.deepEqual(json.census.dropped, { thinking: 1 });
  assert.deepEqual(json.census.toolData, { terminal: 2 });
});

test('JSON output carries the parsed turns and leaves out the raw journal', () => {
  const json = sessionToJson(loadedFixture());
  assert.equal(json.turns.length, 1);
  assert.equal(json.turns[0].toolNodes[0].toolCallId, 'c1');
  assert.deepEqual(json.turns[0].reasoning, ['thought one']);
  assert.equal('rawRequests' in json, false);
  assert.deepEqual(json.editedFiles, ['src/cli.ts']);
  assert.equal(json.session.id, 'abcdef01-0000-4000-8000-000000000000');
  assert.equal(json.session.vscodeVersion, '1.134.0');
});

test('JSON output preserves session-level fields that VS Code can serialize', () => {
  const loaded = loadedFixture({
    hasPendingEdits: true,
    inputState: { inputText: 'draft' },
    repoData: { syncStatus: 'unpushed' },
    pendingRequests: [{ id: 'pending-1' }],
    workingDirectory: 'c:/repo',
  });
  const json = sessionToJson(loaded);
  assert.equal(json.session.hasPendingEdits, true);
  assert.deepEqual(json.session.inputState, { inputText: 'draft' });
  assert.deepEqual(json.session.repoData, { syncStatus: 'unpushed' });
  assert.deepEqual(json.session.pendingRequests, [{ id: 'pending-1' }]);
  assert.equal(json.session.workingDirectory, 'c:/repo');
});

// --- the document ------------------------------------------------------------------------------

test('renderSession produces the fixed section order', () => {
  const markdown = renderSession(loadedFixture(), renderOptions);
  const sections = [
    '## Session Metadata', '## Contents', '## User Questions and Requests', '## Cost and Timing Summary',
    '## Executive Summary', '## Important Outputs', '## Files Modified', '## Tool Usage',
    '## Conversation Transcript', '## Memory and Plan Artifacts', '## Export Provenance',
  ];
  let cursor = -1;
  for (const heading of sections) {
    const at = markdown.indexOf(`\n${heading}\n`);
    assert.ok(at > cursor, `${heading} is missing or out of order`);
    cursor = at;
  }
  assert.ok(markdown.endsWith('\n'));
});

test('the same parse renders the same bytes twice', () => {
  // Only true because the clock, the output path and the git snapshot are passed in rather than
  // read here. If any of them creeps back into the renderer, both recorded checks start failing
  // for reasons that have nothing to do with the change under review.
  assert.equal(renderSession(loadedFixture(), renderOptions), renderSession(loadedFixture(), renderOptions));
});

// --- what the document says about itself --------------------------------------------------------

test('an unhandled kind raises a warning in the export itself, not only on the console', () => {
  const clean = renderSession(loadedFixture(), renderOptions);
  assert.equal(clean.includes('[!WARNING]'), false);

  const drifted = loadedFixture();
  drifted.session.census.unhandled = [['newKindV2', 12]];
  const markdown = renderSession(drifted, renderOptions);
  assert.match(markdown, /> \[!WARNING\]/);
  assert.match(markdown, /`newKindV2` \(12\)/);
});

test('parse warnings reach the provenance section', () => {
  const loaded = loadedFixture();
  loaded.session.errors = ['line 4: unparseable'];
  assert.match(renderSession(loaded, renderOptions), /- Parse warning: line 4: unparseable/);
});
