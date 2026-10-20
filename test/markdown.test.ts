import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { setWorkspaceRoot } from '../src/host.ts';
import { buildDocument, copySource, markdownBody, renderTurnBody, toolFriendly, turnCost, turnInfo } from '../src/markdown.ts';
import type { FenceRepairs } from '../src/markdown.ts';
import { fenceFor, openFenceTicks } from '../src/text.ts';
import type { CompanionArtifact } from '../src/export-policy.ts';
import type { EditOperation, Turn, TurnNode } from '../src/types.ts';
import { testSession, testTool, testTurn } from './helpers.ts';

const ROOT = path.join(path.sep, 'proj');
setWorkspaceRoot(ROOT);

const render = (body: TurnNode[], over: Partial<Turn> = {}) => renderTurnBody(
  testTurn({ body, ...over }),
  new Map(),
).join('\n');

const documentContext = (over: Partial<Parameters<typeof buildDocument>[1]> = {}): Parameters<typeof buildDocument>[1] => ({
  location: {
    sessionId: 'a0a0a0a0-1111-4111-8111-111111111111',
    sessionPath: path.join(ROOT, 'session.jsonl'),
    hashRoot: ROOT,
  },
  resources: { resources: [], byCall: new Map(), resourceRoot: ROOT },
  versions: { copilotVersion: 'unknown', vscodeVersion: 'unknown' },
  memory: { session: [], repo: [], user: [] },
  outputPath: path.join(ROOT, 'export.md'),
  gitStatus: '',
  generatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

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

test('unknown response JSON is collapsed, redacted, and kept in its recorded position', () => {
  const output = render([
    { type: 'text', text: 'before unknown response' },
    {
      type: 'unknownResponse',
      kind: 'futureResponse',
      payload: JSON.stringify({ kind: 'futureResponse', password: 'synthetic-secret' }, null, 2),
    },
    { type: 'text', text: 'after unknown response' },
  ]);

  assert.ok(output.indexOf('before unknown response') < output.indexOf('futureResponse'));
  assert.ok(output.indexOf('futureResponse') < output.indexOf('after unknown response'));
  assert.match(output, /<details><summary>.*Unreviewed response kind/);
  assert.match(output, /\[REDACTED\]/);
  assert.doesNotMatch(output, /synthetic-secret/);
});

test('markdownVuln text joins the code fence it was streamed into, and its warning follows the run', () => {
  // Request 5 of a real journal: VS Code merges the vuln text into the surrounding Markdown, so
  // the brace belongs to the code line and the 4-backtick fence never breaks.
  const output = render([
    { type: 'text', text: 'Here is the fix:\n\n````javascript\nif (stats.isSymbolicLink())' },
    {
      type: 'text',
      text: ' {\n',
      vulnerabilities: [{ title: 'path-injection', description: 'Unvalidated input in path value creation' }],
      omittedDisplayMetadata: ['supportThemeIcons', 'supportHtml', 'uris'],
    },
    { type: 'text', text: '    console.log("link");\n}\n````\n\nDone.' },
  ]);

  const fenceLines = output.split('\n').filter((line) => /^\s*`{3,}/.test(line));
  assert.deepEqual(fenceLines.map((line) => line.trim()), ['````javascript', '````'], 'one continuous fence');
  assert.match(output, /if \(stats\.isSymbolicLink\(\)\) \{\n {4}console\.log/);
  const warningAt = output.indexOf('Code-safety warning');
  assert.ok(warningAt > output.indexOf('Done.'), 'the warning comes after the text run');
  assert.match(output, /recorded by the chat source, not validated by the exporter/);
  assert.match(output, /\*\*path-injection\*\* - Unvalidated input in path value creation/);
  assert.match(output, /supportThemeIcons, supportHtml, uris/);
});

test('an unknown kind inside an open fence never splits it; its JSON follows the run and round-trips', () => {
  const payload = JSON.stringify({ kind: 'futureKind', content: { value: 'const b = 2;\n' } }, null, 2);
  const output = render([
    { type: 'text', text: '```js\nconst a = 1;\n' },
    { type: 'unknownResponse', kind: 'futureKind', payload },
    { type: 'text', text: 'const c = 3;\n```\n\nAfter the code.' },
  ]);

  assert.match(output, /const a = 1;\nconst c = 3;\n```/, 'one continuous fence');
  assert.doesNotMatch(output, /^const b = 2;$/m, 'unreviewed content.value is not inlined');
  assert.ok(output.indexOf('Unreviewed response kind') > output.indexOf('After the code.'), 'JSON follows the run');
  const json = output.match(/```json\n([\s\S]*?)\n\s*```/);
  assert.ok(json, 'the JSON block is present');
  const dedented = json![1].split('\n').map((line) => line.replace(/^ {4}/, '')).join('\n');
  assert.deepEqual(JSON.parse(dedented), JSON.parse(payload));
});

test('a tilde fence holds markdownVuln warnings and unknown JSON until it closes', () => {
  const payload = JSON.stringify({ kind: 'futureKind', n: 1 }, null, 2);
  const output = render([
    { type: 'text', text: '~~~js\nconst a = 1;\n' },
    {
      type: 'text',
      text: 'const b = 2;\n',
      vulnerabilities: [{ title: 'synthetic', description: 'synthetic warning' }],
    },
    { type: 'unknownResponse', kind: 'futureKind', payload },
    { type: 'text', text: 'const c = 3;\n~~~\n\nAfter the code.' },
  ]);

  assert.match(output, /~~~js\nconst a = 1;\nconst b = 2;\nconst c = 3;\n~~~/, 'one continuous tilde fence');
  const after = output.indexOf('After the code.');
  assert.ok(output.indexOf('Code-safety warning') > after, 'the warning follows the run');
  assert.ok(output.indexOf('Unreviewed response kind') > after, 'the JSON follows the run');
  assert.doesNotMatch(output, /Representation change/);
});

test('an unterminated tilde fence is closed with tildes at the end of the turn', () => {
  const output = render([{ type: 'text', text: '~~~js\nconst a = 1;' }]);
  assert.match(output, /const a = 1;\n~~~/);
  assert.match(output, /closed an unterminated code fence at the end of this turn/);
});

test('notes still flush the run in recorded order', () => {
  const output = render([
    { type: 'text', text: 'before\n' },
    { type: 'note', title: 'A recorded note' },
    { type: 'text', text: 'after' },
  ]);

  assert.ok(output.indexOf('before') < output.indexOf('A recorded note'));
  assert.ok(output.indexOf('A recorded note') < output.indexOf('after'));
  assert.doesNotMatch(output, /Representation change/);
});

test('a node that interrupts an open fence is recorded as an early close and noted after the run', () => {
  const output = render([
    { type: 'text', text: '```js\nconst a = 1;\n' },
    { type: 'note', title: 'A recorded note' },
    { type: 'text', text: 'const b = 2;\n```' },
  ]);

  assert.match(output, /closed a code fence early because a note record interrupted it/);
  assert.ok(output.indexOf('const a = 1;') < output.indexOf('closed a code fence early'));
  assert.ok(output.indexOf('closed a code fence early') < output.indexOf('A recorded note'));
});

test('the fence repair sink counts early closes by kind and turn-end closes', () => {
  const fenceRepairs: FenceRepairs = { early: [], turnEnd: 0, html: [] };
  buildDocument(testSession({
    turns: [
      testTurn({ prompt: 'q1', body: [
        { type: 'text', text: '```js\nconst a = 1;\n' },
        testTool({ toolId: 'read_file', toolCallId: 'c1', invocation: 'Read a file' }),
        { type: 'text', text: 'const b = 2;\n```' },
      ] }),
      testTurn({ prompt: 'q2', body: [{ type: 'text', text: '```\nunterminated\n' }] }),
    ],
  }), documentContext({ fenceRepairs }));

  assert.deepEqual(fenceRepairs.early.map((item) => item.kind), ['tool']);
  // Turn 1 cascades: once the tool splits the fence, the continuation's closing ``` opens a new
  // fence that is only closed at turn end. Turn 2 is a plain unterminated fence.
  assert.equal(fenceRepairs.turnEnd, 2);
});

test('the stray fence that hugs an inline edit preview is not counted as an open fence', () => {
  // VS Code frames an inline edit preview with bare fences: one closes the run before the edit,
  // one opens the run after it. Both are dropped, so nothing is left open at turn end.
  const fenceRepairs: FenceRepairs = { early: [], turnEnd: 0, html: [] };
  const output = buildDocument(testSession({
    turns: [testTurn({ prompt: 'q', body: [
      { type: 'text', text: 'Updating the file.\n```\n' },
      { type: 'edit', uri: '/proj/src/a.ts', op: 'modified', inline: true },
      { type: 'text', text: '```\nThe file is updated.' },
    ] })],
  }), documentContext({ fenceRepairs }));

  assert.deepEqual(fenceRepairs, { early: [], turnEnd: 0, html: [] });
  assert.doesNotMatch(output, /Representation change/);
  assert.match(output, /The file is updated\./);
});

test('fenceFor makes a JSON fence longer than the longest backtick run in its content', () => {
  assert.deepEqual(fenceFor('{"a": 1}', 'json'), { open: '```json', close: '```' });
  assert.equal(fenceFor('{"a": "```"}').close, '````');
  assert.equal(fenceFor('{"a": "``````"}').close, '```````');
});

test('openFenceTicks tracks the opening fence until a closing run at least as long', () => {
  assert.equal(openFenceTicks('````md\n```js\nx\n```\n'), '````');
  assert.equal(openFenceTicks('````md\n```js\nx\n```\n````\n'), '');
  assert.equal(openFenceTicks('plain `inline` text'), '');
});

test('a fence still open at turn end is closed and recorded as a representation change', () => {
  const output = render([
    { type: 'text', text: '````\nunterminated code\n' },
    { type: 'unknownResponse', kind: 'futureKind', payload: '{}' },
  ]);

  const lines = output.split('\n');
  const codeAt = lines.findIndex((line) => line === 'unterminated code');
  assert.equal(lines.slice(codeAt + 1).find((line) => /^`{3,}/.test(line)), '````');
  assert.match(output, /Representation change: the exporter closed an unterminated code fence/);
  assert.ok(output.indexOf('Representation change') < output.indexOf('Unreviewed response kind'));
});

test('long unknown response JSON uses a complete companion and a short preview', () => {
  const payload = JSON.stringify({
    kind: 'futureResponse',
    lines: Array.from({ length: 301 }, (_, index) => `line ${index}: ${'x'.repeat(100)}`),
  }, null, 2);
  const companions: CompanionArtifact[] = [];
  const output = buildDocument(testSession({
    turns: [testTurn({
      prompt: 'question',
      body: [{ type: 'unknownResponse', kind: 'futureResponse', payload }],
    })],
  }), {
    location: {
      sessionId: 'a0a0a0a0-1111-4111-8111-111111111111',
      sessionPath: path.join(ROOT, 'session.jsonl'),
      hashRoot: ROOT,
    },
    resources: { resources: [], byCall: new Map(), resourceRoot: ROOT },
    versions: { copilotVersion: 'unknown', vscodeVersion: 'unknown' },
    memory: { session: [], repo: [], user: [] },
    outputPath: path.join(ROOT, 'export.md'),
    gitStatus: '',
    generatedAt: '2026-01-01T00:00:00.000Z',
    overflow: { assetsDirectory: 'export-assets', companions },
  });

  assert.match(output, /first 10 lines, full text linked/);
  assert.match(output, /Full text: \[unreviewed-response-/);
  assert.equal(companions.length, 1);
  assert.equal(companions[0].kind, 'metadata');
  assert.equal(companions[0].location.field, 'unreviewed-response');
  assert.equal(Buffer.from(companions[0].bytes).toString('utf8'), payload);
});

const renderUnknownWithCompanions = (payload: string) => {
  const companions: CompanionArtifact[] = [];
  const output = buildDocument(testSession({
    turns: [testTurn({ prompt: 'question', body: [{ type: 'unknownResponse', kind: 'futureResponse', payload }] })],
  }), documentContext({ overflow: { assetsDirectory: 'export-assets', companions } }));
  return { output, companions };
};

test('a 5 MB single-line unknown payload goes to a companion with a byte-capped preview', () => {
  const payload = JSON.stringify({ kind: 'futureResponse', blob: 'x'.repeat(5 * 1024 * 1024) });
  const { output, companions } = renderUnknownWithCompanions(payload);

  assert.equal(companions.length, 1);
  assert.equal(Buffer.from(companions[0].bytes).toString('utf8'), payload);
  assert.ok(output.length < 64 * 1024, `the Markdown stays small (${output.length} chars)`);
  assert.match(output, /preview, full text linked/);
  assert.match(output, /Showing the first 2,048 of 5,242,9\d\d bytes \(1 line\)\. Full text: \[unreviewed-response-/);
});

test('unknown payloads use a companion when they are over 300 lines OR over 15 KiB', () => {
  const manyShortLines = JSON.stringify({ kind: 'futureResponse', lines: Array.from({ length: 301 }, (_, index) => index) }, null, 2);
  const fewLongLines = JSON.stringify({ kind: 'futureResponse', lines: Array.from({ length: 40 }, () => 'y'.repeat(500)) }, null, 2);
  const small = JSON.stringify({ kind: 'futureResponse', value: 'small' }, null, 2);

  assert.ok(Buffer.byteLength(manyShortLines) < 15 * 1024);
  assert.equal(renderUnknownWithCompanions(manyShortLines).companions.length, 1, 'over 300 lines');
  assert.equal(renderUnknownWithCompanions(fewLongLines).companions.length, 1, 'over 15 KiB');
  assert.equal(renderUnknownWithCompanions(small).companions.length, 0, 'small payload stays inline');
});

test('the byte-capped preview never splits a surrogate pair', () => {
  const payload = `${'a'.repeat(2047)}😀${'b'.repeat(20 * 1024)}`;
  const { output } = renderUnknownWithCompanions(payload);
  assert.doesNotMatch(output, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/, 'no lone high surrogate');
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

test('request, response, and tool errors remain visible in their turn', () => {
  const output = render([
    { type: 'note', title: 'Warning', text: 'Copilot failed to get ready' },
    { type: 'note', title: 'Confirmation: Continue?', text: 'The task is still running.' },
    { type: 'note', title: 'Copilot questions', text: 'Delivery scope\nWhich option?\n- Local only (local)' },
    testTool({ resultError: 'Healed error: the command failed.' }),
  ], { requestError: 'The service could not complete this request.' });
  assert.match(output, /Warning/);
  assert.match(output, /Copilot failed to get ready/);
  assert.match(output, /Confirmation: Continue\?/);
  assert.match(output, /Which option\?/);
  assert.match(output, /Tool error/);
  assert.match(output, /Healed error: the command failed\./);
  assert.match(output, /Request error/);
  assert.match(output, /The service could not complete this request\./);
});

test('tool input renders before output and leaves vertical space around the tool', () => {
  const output = render([testTool({
    toolId: 'run_playwright_code',
    toolCallId: 'call_playwright',
    inputText: 'return await page.title();',
    inputLanguage: 'javascript',
    resultText: '"Example"',
  })]);
  assert.ok(output.indexOf('⌨️ Tool input') < output.indexOf('📦 Tool result'));
  assert.match(output, /```javascript\n\s*return await page\.title\(\);/);
  assert.match(output, /<summary>.*run_playwright_code.*<\/summary>\n<div aria-hidden="true" style="height:0\.35rem"><\/div>/);
});

test('structured MCP input renders before output without duplicating rawInput', () => {
  const output = render([testTool({
    toolId: 'mcp_context7_query-docs',
    toolCallId: 'call_mcp',
    toolSpecificData: { kind: 'input', rawInput: { libraryId: '/docs/example', query: 'How?' } },
    resultText: 'The answer',
  })]);
  assert.ok(output.indexOf('⌨️ Tool input') < output.indexOf('📦 Tool result'));
  assert.equal(output.match(/"query": "How\?"/g)?.length, 1);
  assert.ok(!output.includes('⚙️ Tool details'), 'an input-only payload has no duplicate details block');
});

test('terminal result input does not duplicate the command block', () => {
  const output = render([testTool({
    toolId: 'run_in_terminal',
    toolCallId: 'call_terminal_input',
    command: 'npm test',
    inputText: 'npm test',
    inputLanguage: 'powershell',
    output: 'ok',
  })]);
  assert.equal(output.match(/npm test/g)?.length, 2, 'once in the title and once in Command');
  assert.ok(!output.includes('⌨️ Tool input'));
});

test('terminal result input is rendered when it contains more than the command', () => {
  const input = '{"command":"npm test","timeout":5000}';
  const output = render([testTool({
    toolId: 'run_in_terminal',
    toolCallId: 'call_terminal_input_details',
    command: 'npm test',
    inputText: input,
    inputLanguage: 'json',
    output: 'ok',
  })]);
  assert.ok(output.includes('⌨️ Tool input'));
  assert.ok(output.includes(input));
});

test('an unseen tool renders structured, reference, and binary result output', () => {
  const output = render([testTool({
    toolId: 'extension_future_tool',
    toolCallId: 'call_future',
    inputText: '{"query":"future"}',
    inputLanguage: 'json',
    resultText: 'text result',
    resultDetails: {
      input: '{"query":"future"}',
      inputLanguage: 'json',
      output: [
        { type: 'embed', isText: true, value: 'text result' },
        { type: 'embed', mimeType: 'image/png', value: 'iVBORw0KGgo=' },
        { type: 'ref', uri: { $mid: 1, path: '/proj/result.bin' } },
      ],
      isError: true,
      futureMetadata: { version: 2 },
    },
  })]);
  assert.ok(output.indexOf('⌨️ Tool input') < output.indexOf('📦 Tool result'));
  assert.ok(output.indexOf('📦 Tool result') < output.indexOf('📦 Tool result details'));
  assert.equal(output.match(/text result/g)?.length, 1, 'dedicated text output is not duplicated');
  assert.match(output, /"mimeType": "image\/png"/);
  assert.match(output, /"path": "\/proj\/result\.bin"/);
  assert.match(output, /"isError": true/);
  assert.match(output, /"futureMetadata"/);
  assert.ok(!output.includes('"input": "{\\"query\\":\\"future\\"}"'), 'dedicated input is not duplicated');
});

test('URI arrays and serialized data output render for arbitrary tool ids', () => {
  const uriOutput = render([testTool({
    toolId: 'private_location_tool',
    toolCallId: 'call_locations',
    resultDetails: [{ $mid: 1, path: '/proj/a.ts' }],
  })]);
  assert.match(uriOutput, /📦 Tool result details/);
  assert.match(uriOutput, /"path": "\/proj\/a\.ts"/);

  const dataOutput = render([testTool({
    toolId: 'mcp_future_binary',
    toolCallId: 'call_data',
    resultDetails: { output: { type: 'data', mimeType: 'application\/octet-stream', base64Data: 'AAEC' } },
  })]);
  assert.match(dataOutput, /"mimeType": "application\/octet-stream"/);
  assert.match(dataOutput, /"base64Data": "AAEC"/);
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

test('files touched link to the source and show patch-operation counts', () => {
  const output = renderTurnBody(
    testTurn({ body: [{ type: 'text', text: 'x' }], filesTouched: [{ file: 'src/a.ts', op: 'created', additions: 42, deletions: 3 }] }),
    new Map(),
    '/proj/docs/export.md',
  ).join('\n');
  assert.match(output, /🆕 created \[`src\/a\.ts`\]\(\.\.\/src\/a\.ts\)/);
  assert.match(output, /\+42<\/span> <span[^>]*>-3<\/span>/);
  assert.doesNotMatch(output, /42 lines/);
});

test('files touched render redacted changes in collapsible tilde diff fences', () => {
  const output = renderTurnBody(
    testTurn({
      body: [{ type: 'text', text: 'x' }],
      filesTouched: [{
        file: 'src/a.ts',
        op: 'modified',
        additions: 1,
        deletions: 1,
        diffs: ['--- a/src/a.ts\n+++ b/src/a.ts\n@@ run @@\n-old();\n+new();'],
      }],
    }),
    new Map(),
    '/proj/docs/export.md',
  ).join('\n');
  assert.match(output, /<details><summary>.*View changes to/);
  assert.match(output, /~~~diff\n--- a\/src\/a\.ts\n\+\+\+ b\/src\/a\.ts/);
  assert.match(output, /-old\(\);\n\+new\(\);\n~~~/);
});

test('files touched label absent transcript evidence without using current file length', () => {
  const output = renderTurnBody(
    testTurn({ body: [{ type: 'text', text: 'x' }], filesTouched: [{ file: 'src/a.ts', op: 'modified' }] }),
    new Map(),
  ).join('\n');
  assert.match(output, /change details unavailable/);
  assert.doesNotMatch(output, /900 lines/);
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

test('turnInfo shows which model Auto resolved to, only when one was recorded', () => {
  const none = turnInfo(testTurn({ ts: 0, scalar: { modelId: 'auto' } })).join('\n');
  assert.doesNotMatch(none, /Auto resolved model/);
  const info = turnInfo(testTurn({ ts: 0, scalar: { modelId: 'auto', autoModelResolutions: [
    { modelId: 'gpt-x', modelName: 'GPT X', confidence: null, predictedLabel: '' },
    { modelId: 'old-id', modelName: 'old-id', confidence: 0.9, predictedLabel: 'needs_reasoning' },
  ] } })).join('\n');
  assert.match(info, /\| Auto resolved model \| GPT X \(gpt-x\)<br>old-id; label needs_reasoning, confidence 0\.9 \|/);
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
