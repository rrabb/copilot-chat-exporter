import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { setWorkspaceRoot } from '../src/host.ts';
import { copySource, markdownBody, renderTurnBody, toolFriendly, turnCost, turnInfo } from '../src/markdown.ts';
import type { EditOperation, Turn, TurnNode } from '../src/types.ts';
import { testTool, testTurn } from './helpers.ts';

const ROOT = path.join(path.sep, 'proj');
setWorkspaceRoot(ROOT);

const render = (body: TurnNode[], over: Partial<Turn> = {}) => renderTurnBody(
  testTurn({ body, ...over }),
  new Map(),
  new Map(),
).join('\n');

test('toolFriendly drops the prefixes nobody reads', () => {
  assert.equal(toolFriendly('copilot_readFile'), 'readFile');
  assert.equal(toolFriendly('mcp_context7_query'), 'context7_query');
  assert.equal(toolFriendly(undefined), 'tool');
});

test('a turn body renders in recorded order, never bucketed by type', () => {
  // The single most important rule in this file: the export has to match what the chat window
  // showed, where a tool call appears between the sentences that surround it.
  const output = render([
    { type: 'text', text: 'before the tool' },
    testTool({ toolId: 'read_file', toolCallId: 'c1', invocation: 'Read a file' }),
    { type: 'text', text: 'after the tool' },
  ]);
  const beforeAt = output.indexOf('before the tool');
  const toolAt = output.indexOf('read_file');
  const afterAt = output.indexOf('after the tool');
  assert.ok(beforeAt < toolAt, 'prose before the call comes first');
  assert.ok(toolAt < afterAt, 'prose after the call comes last');
});

test('reasoning is collapsed and kept where it happened', () => {
  const output = render([
    { type: 'think', text: 'first thought' },
    { type: 'think', text: 'second thought' },
    { type: 'text', text: 'the answer' },
  ]);
  assert.match(output, /Agent reasoning \(2 thoughts\)/);
  assert.ok(output.indexOf('first thought') < output.indexOf('the answer'));
  // One thought must not say "thoughts".
  assert.match(render([{ type: 'think', text: 'only one' }]), /\(1 thought\)/);
});

test('an edit marker names the operation', () => {
  const edit = (op: EditOperation) => render([{ type: 'edit', uri: '/proj/src/a.ts', op }]);
  assert.match(edit('created'), /📄 Created/);
  assert.match(edit('deleted'), /📄 Deleted/);
  assert.match(edit('renamed'), /📄 Renamed/);
  assert.match(edit('modified'), /📄 Edited/);
  assert.match(edit('modified'), /src\/a\.ts/, 'shown relative to the workspace');
});

test('a turn with no assistant text says so rather than rendering blank', () => {
  assert.match(render([testTool({ toolId: 'x', toolCallId: 'c' })]),
    /_No assistant text was recorded for this turn\._/);
});

test('a tool call with nothing to expand is a plain line, not an empty collapsible', () => {
  const bare = render([testTool({ toolId: 'read_file', toolCallId: 'c1', invocation: 'Read a file' })]);
  assert.ok(!bare.includes('<details><summary><sub><span style="color:#7d8590;font-weight:400">🛠️'),
    'no collapsible for a call with no body');
  assert.match(bare, /- <sub>.*🛠️/);

  const withOutput = render([testTool({
    toolId: 'run_in_terminal', toolCallId: 'c2',
    command: 'ls', output: 'a\nb', exitCode: 0, duration: 10,
  })]);
  assert.match(withOutput, /<details>/);
  assert.match(withOutput, /📟 Terminal output/);
  assert.match(withOutput, /exit 0/);
});

test('an unfinished tool call is marked', () => {
  assert.match(render([testTool({ toolId: 'x', toolCallId: 'c', isComplete: false })]), /⏳/);
});

test('a failing command earns a warning badge', () => {
  const output = render([testTool({
    toolId: 'run_in_terminal', toolCallId: 'c',
    command: 'boom', output: 'error', exitCode: 1,
  })]);
  assert.match(output, /exit 1/);
  assert.match(output, /⚠️/);
});

test('todos render with their status marks', () => {
  const output = render([{ type: 'text', text: 'x' }], {
    todos: [
      { id: '1', title: 'done', status: 'completed' },
      { id: '2', title: 'doing', status: 'in-progress' },
      { id: '3', title: 'later', status: 'not-started' },
    ],
  });
  assert.match(output, /\[x\] done/);
  assert.match(output, /\[~\] doing/);
  assert.match(output, /\[ \] later/);
  assert.match(output, /🗒️ Todo list at this turn \(3\)/);
});

test('files touched show an icon per operation and a line count when known', () => {
  const output = renderTurnBody(
    testTurn({ body: [{ type: 'text', text: 'x' }], filesTouched: [{ file: 'src/a.ts', op: 'created' }] }),
    new Map(),
    new Map([['src/a.ts', 42]]),
  ).join('\n');
  assert.match(output, /🆕 created `src\/a\.ts` \(42 lines\)/);
});

test('markdownBody renders safe prose but shows risky content as source', () => {
  const safe = markdownBody('Just a sentence.').join('\n');
  assert.match(safe, /✅ rendered/);
  assert.match(safe, /border:1px solid/);

  // A heading would join the export's own outline; a tag would render live.
  assert.match(markdownBody('# A heading').join('\n'), /headings would pollute the outline/);
  assert.match(markdownBody('<img src="x">').join('\n'), /raw HTML\/XML/);
  assert.match(markdownBody('<!-- hidden -->').join('\n'), /HTML comments/);
  assert.match(markdownBody('```\nunclosed').join('\n'), /unclosed code fence/);
  assert.deepEqual(markdownBody('   '), ['_Empty file._', '']);
});

test('copySource pairs content with a copyable fence, and gives up when huge', () => {
  const block = copySource('hello', 'text', 'Copy this').join('\n');
  assert.match(block, /📋 Copy this/);
  assert.match(block, /```text/);
  assert.deepEqual(copySource(''), []);
  assert.deepEqual(copySource('x'.repeat(33 * 1024)), [], 'past the cap it is omitted entirely');
});

test('turnCost always shows two decimal places for credits', () => {
  const cost = turnCost({ promptTokens: 1000, completionTokens: 200, copilotCredits: 1.5, elapsedMs: 2000, modelId: 'auto' });
  assert.match(cost, /💳 1\.50 credits/);
  assert.match(cost, /1,000 prompt \+ 200 completion \(=1,200\)/);
  assert.match(cost, /🤖 Auto/);
  // Absent rather than zero when the journal did not record it.
  assert.ok(!turnCost({ elapsedMs: 1 }).includes('credits'));
});

test('turnInfo lists the per-turn fields as a table', () => {
  const info = turnInfo(testTurn({ ts: 0, scalar: { modelId: 'auto', promptTokens: 5, isCanceled: true } })).join('\n');
  assert.match(info, /ℹ️ Turn info/);
  assert.match(info, /\| Model \| Auto \|/);
  assert.match(info, /\| Canceled \| yes \|/);
  assert.match(info, /\| Credits \| n\/a \|/);
});

test('turnInfo renders the current prompt token breakdown', () => {
  const info = turnInfo(testTurn({ ts: 0, scalar: {
    promptTokenDetails: [
      { category: 'System', label: 'Tool Definitions', percentageOfPrompt: 12 },
      { category: 'User Context', label: 'Messages', percentageOfPrompt: 88 },
    ],
  } })).join('\n');
  assert.match(info, /\| Prompt details \| System: Tool Definitions 12%; User Context: Messages 88% \|/);
});

test('turnInfo keeps the older cache-token shape readable', () => {
  const info = turnInfo(testTurn({ ts: 0, scalar: { promptTokenDetails: { cacheReadTokens: 3, cacheWriteTokens: 4 } } })).join('\n');
  assert.match(info, /\| Cache read \/ write \| 3 \/ 4 \|/);
});
