import assert from 'node:assert/strict';
import test from 'node:test';
import { attachTranscriptPatches, parseTranscriptPatches, parseV4aPatch } from '../src/session/edits.ts';
import { testSession, testTool, testTurn } from './helpers.ts';

const patch = `*** Begin Patch
*** Update File: src/a.ts
@@ function run
 const before = true;
-oldCall();
+newCall();
+finish();
*** Add File: src/new.ts
+export const ready = true;
*** Update File: src/old.ts
*** Move to: src/moved.ts
-oldName();
+newName();
*** Delete File: src/gone.ts
*** End Patch`;

test('parseV4aPatch recovers file operations, counts, and diff text', () => {
  const changes = parseV4aPatch(patch);

  assert.deepEqual(changes.map(({ file, previousFile, op, additions, deletions }) => ({ file, previousFile, op, additions, deletions })), [
    { file: 'src/a.ts', previousFile: undefined, op: 'modified', additions: 2, deletions: 1 },
    { file: 'src/new.ts', previousFile: undefined, op: 'created', additions: 1, deletions: 0 },
    { file: 'src/moved.ts', previousFile: 'src/old.ts', op: 'renamed', additions: 1, deletions: 1 },
    { file: 'src/gone.ts', previousFile: undefined, op: 'deleted', additions: 0, deletions: 0 },
  ]);
  assert.match(changes[0].diff, /^--- a\/src\/a\.ts\n\+\+\+ b\/src\/a\.ts/m);
  assert.match(changes[0].diff, /@@ function run @@/);
  assert.match(changes[1].diff, /^--- \/dev\/null\n\+\+\+ b\/src\/new\.ts/m);
  assert.match(changes[2].diff, /^--- a\/src\/old\.ts\n\+\+\+ b\/src\/moved\.ts/m);
  assert.match(changes[3].diff, /^--- a\/src\/gone\.ts\n\+\+\+ \/dev\/null/m);
});

test('parseTranscriptPatches deduplicates lifecycle copies and prefers execution arguments', () => {
  const records = [
    {
      type: 'assistant.message',
      data: { toolRequests: [{ toolCallId: 'call_1', name: 'apply_patch', arguments: JSON.stringify({ input: patch }) }] },
    },
    {
      type: 'tool.execution_start',
      data: { toolCallId: 'call_1', toolName: 'apply_patch', arguments: { input: patch } },
    },
  ].map((record) => JSON.stringify(record)).join('\n');

  const patches = parseTranscriptPatches(records);

  assert.equal(patches.size, 1);
  assert.equal(patches.get('call_1')?.files.length, 4);
  assert.equal(patches.get('call_1')?.files[0].additions, 2);
});

test('parseTranscriptPatches ignores malformed and unrelated records', () => {
  const records = [
    'not json',
    JSON.stringify({ type: 'tool.execution_start', data: { toolCallId: 'call_1', toolName: 'read_file', arguments: { input: patch } } }),
    JSON.stringify({ type: 'tool.execution_start', data: { toolCallId: 'call_2', toolName: 'apply_patch', arguments: { input: 'not a patch' } } }),
  ].join('\n');

  assert.equal(parseTranscriptPatches(records).size, 0);
  assert.deepEqual(parseV4aPatch('not a patch'), []);
});

test('parseTranscriptPatches excludes explicitly failed patch calls', () => {
  const records = [
    { type: 'tool.execution_start', data: { toolCallId: 'call_failed', toolName: 'apply_patch', arguments: { input: patch } } },
    { type: 'tool.execution_complete', data: { toolCallId: 'call_failed', success: false } },
  ].map((record) => JSON.stringify(record)).join('\n');

  assert.equal(parseTranscriptPatches(records).size, 0);
});

test('attachTranscriptPatches aggregates repeated file edits under their journal turn', () => {
  const tool = testTool({ toolCallId: 'call_1', toolId: 'copilot_applyPatch' });
  const session = testSession({
    editedFiles: ['src/a.ts'],
    turns: [testTurn({ toolNodes: [tool], body: [tool], filesTouched: [{ file: 'src/a.ts', op: 'modified' }] })],
  });
  const parsed = parseTranscriptPatches(JSON.stringify({
    type: 'tool.execution_start',
    data: { toolCallId: 'call_1', toolName: 'apply_patch', arguments: { input: patch } },
  }));

  attachTranscriptPatches(session, parsed);

  assert.equal(tool.patchFiles.length, 4);
  assert.deepEqual(session.turns[0].filesTouched[0], {
    file: 'src/a.ts',
    op: 'modified',
    additions: 2,
    deletions: 1,
    diffs: [tool.patchFiles[0].diff],
  });
  assert.ok(session.editedFiles.includes('src/new.ts'));
  assert.ok(session.editedFiles.includes('src/moved.ts'));
  assert.ok(session.editedFiles.includes('src/gone.ts'));
});

test('attachTranscriptPatches attaches duplicate journal lifecycle nodes only once', () => {
  const first = testTool({ toolCallId: 'call_1', toolId: 'copilot_applyPatch' });
  const duplicate = testTool({ toolCallId: 'call_1', toolId: 'copilot_applyPatch' });
  const session = testSession({
    turns: [
      testTurn({ toolNodes: [first], body: [first] }),
      testTurn({ toolNodes: [duplicate], body: [duplicate] }),
    ],
  });
  const parsed = parseTranscriptPatches(JSON.stringify({
    type: 'tool.execution_start',
    data: { toolCallId: 'call_1', toolName: 'apply_patch', arguments: { input: patch } },
  }));

  attachTranscriptPatches(session, parsed);

  assert.equal(first.patchFiles.length, 4);
  assert.equal(duplicate.patchFiles.length, 0);
  assert.equal(session.turns[0].filesTouched.length, 4);
  assert.equal(session.turns[1].filesTouched.length, 0);
});