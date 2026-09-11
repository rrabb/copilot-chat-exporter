import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GENERIC_TOOL_PAYLOAD_KINDS, HANDLED_RESPONSE_KINDS, HANDLED_TOOL_PAYLOAD_KINDS,
  IGNORED_RESPONSE_KINDS, KNOWN_UNSEEN_KINDS, classifyNode, fileOperation, thinkingText,
} from '../src/session/classify.ts';

// One minimal item per handled kind. The coverage test at the bottom fails if a kind is added to
// the dispatch table without an example here.
const SAMPLES = {
  thinking: { kind: 'thinking', value: 'a thought' },
  toolInvocationSerialized: { kind: 'toolInvocationSerialized', toolId: 'read_file', toolCallId: 'call_1' },
  textEditGroup: { kind: 'textEditGroup', uri: { path: '/proj/src/a.ts' } },
  workspaceEdit: { kind: 'workspaceEdit', edits: [{ oldResource: { path: '/proj/gone.ts' } }] },
  inlineReference: { kind: 'inlineReference', inlineReference: { path: '/proj/src/b.ts' } },
  markdownContent: { kind: 'markdownContent', content: { value: 'named markdown' } },
};

test('thinking becomes a think node, and empty partials become nothing', () => {
  assert.deepEqual(classifyNode(SAMPLES.thinking), { type: 'think', text: 'a thought' });
  // Streamed partials arrive empty. Producing nothing is normal, not drift.
  assert.equal(classifyNode({ kind: 'thinking', value: '   ' }), null);
  // The value can also be an array of parts.
  assert.equal(thinkingText([{ value: 'a' }, { text: 'b' }]), 'ab');
});

test('a terminal tool call lifts command, output, exit code and duration', () => {
  const node = classifyNode({
    kind: 'toolInvocationSerialized',
    toolId: 'run_in_terminal',
    toolCallId: 'call_2',
    invocationMessage: { value: 'Running `ls`' },
    isComplete: true,
    toolSpecificData: {
      kind: 'terminal',
      commandLine: { original: 'ls -la' },
      terminalCommandOutput: { text: '\u001b[32mok\u001b[0m\n' },
      terminalCommandState: { exitCode: 0, duration: 120 },
    },
  });
  assert.equal(node.type, 'tool');
  assert.equal(node.command, 'ls -la');
  assert.equal(node.output, 'ok', 'colour codes are stripped');
  assert.equal(node.exitCode, 0);
  assert.equal(node.duration, 120);
  assert.equal(node.todos, null);
});

test('a subagent tool call carries its prompt and its report', () => {
  const node = classifyNode({
    kind: 'toolInvocationSerialized',
    toolId: 'runSubagent',
    toolCallId: 'call_3',
    toolSpecificData: { kind: 'subagent', prompt: '  find X  ', result: '  found X  ' },
  });
  assert.equal(node.promptText, 'find X');
  // The report is a plain field rather than a structured output entry, and still reaches the
  // same slot every other tool's result uses.
  assert.equal(node.resultText, 'found X');
});

test('a Playwright tool call carries its submitted code and language', () => {
  const resultDetails = {
    input: '  return await page.title();  ',
    inputLanguage: 'javascript',
    output: [{ isText: true, value: '"Example"' }],
  };
  const node = classifyNode({
    kind: 'toolInvocationSerialized',
    toolId: 'run_playwright_code',
    toolCallId: 'call_playwright',
    resultDetails,
  });
  assert.equal(node.inputText, 'return await page.title();');
  assert.equal(node.inputLanguage, 'javascript');
  assert.equal(node.resultText, '"Example"');
  assert.deepEqual(node.resultDetails, resultDetails, 'the complete result envelope remains available');
});

test('an unknown tool id retains every official result-details family', () => {
  const samples = [
    [
      { $mid: 1, path: '/proj/a.ts' },
      { uri: { $mid: 1, path: '/proj/b.ts' }, range: { startLineNumber: 2, endLineNumber: 3 } },
    ],
    {
      input: '{"future":true}',
      inputLanguage: 'json',
      output: [
        { type: 'embed', isText: true, value: 'done' },
        { type: 'embed', mimeType: 'image/png', value: 'iVBORw0KGgo=' },
        { type: 'ref', uri: { $mid: 1, path: '/proj/result.bin' } },
      ],
      isError: true,
      futureMetadata: { version: 2 },
    },
    { output: { type: 'data', mimeType: 'application/octet-stream', base64Data: 'AAEC' } },
  ];

  for (const [index, resultDetails] of samples.entries()) {
    const node = classifyNode({
      kind: 'toolInvocationSerialized',
      toolId: `extension_future_tool_${index}`,
      toolCallId: `future_${index}`,
      resultDetails,
    });
    assert.equal(node.type, 'tool');
    assert.deepEqual(node.resultDetails, resultDetails);
  }
});

test('a todo tool call carries its list', () => {
  const node = classifyNode({
    kind: 'toolInvocationSerialized',
    toolId: 'manage_todo_list',
    toolCallId: 'call_4',
    toolSpecificData: { kind: 'todoList', todoList: [{ id: '1', title: 'do it', status: 'completed' }] },
  });
  assert.equal(node.todos.length, 1);
  assert.equal(node.todos[0].title, 'do it');
});

test('an incomplete tool call is marked, and a file path is recovered from the message', () => {
  const running = classifyNode({ kind: 'toolInvocationSerialized', toolCallId: 'call_5', isComplete: false });
  assert.equal(running.isComplete, false);

  const withFile = classifyNode({
    kind: 'toolInvocationSerialized',
    toolCallId: 'call_6',
    invocationMessage: { value: 'Edited [a.ts](file:///c%3A/proj/a.ts)' },
  });
  assert.equal(withFile.fileUri, 'c:/proj/a.ts');
});

test('textEditGroup renders inline rather than as its own block', () => {
  assert.deepEqual(classifyNode(SAMPLES.textEditGroup), {
    type: 'edit', uri: '/proj/src/a.ts', op: 'modified', inline: true,
  });
});

test('workspaceEdit returns an ARRAY, one node per file operation', () => {
  // Easy to miss: every other kind returns a single node or null. A single edit item can
  // describe several operations, and treating the result as one node silently drops the rest.
  const deleted = classifyNode({ kind: 'workspaceEdit', edits: [{ oldResource: { path: '/p/gone.ts' } }] });
  assert.deepEqual(deleted, [{ type: 'edit', uri: '/p/gone.ts', op: 'deleted' }]);

  const created = classifyNode({ kind: 'workspaceEdit', edits: [{ newResource: { path: '/p/new.ts' } }] });
  assert.deepEqual(created, [{ type: 'edit', uri: '/p/new.ts', op: 'created' }]);

  const renamed = classifyNode({
    kind: 'workspaceEdit',
    edits: [{ oldResource: { path: '/p/old.ts' }, newResource: { path: '/p/new.ts' } }],
  });
  assert.deepEqual(renamed, [{ type: 'edit', uri: '/p/new.ts', op: 'renamed' }]);

  const many = classifyNode({
    kind: 'workspaceEdit',
    edits: [{ newResource: { path: '/p/a.ts' } }, { oldResource: { path: '/p/b.ts' } }],
  });
  assert.equal(many.length, 2);

  assert.equal(classifyNode({ kind: 'workspaceEdit', edits: [] }), null);
});

test('inlineReference is reduced to a basename', () => {
  assert.deepEqual(classifyNode(SAMPLES.inlineReference), { type: 'ref', text: 'b.ts' });
  assert.deepEqual(classifyNode({ kind: 'inlineReference', reference: 'plain.ts' }), { type: 'ref', text: 'plain.ts' });
});

test('assistant prose has no kind at all and is matched by shape', () => {
  assert.deepEqual(classifyNode({ value: 'some prose' }), { type: 'text', text: 'some prose' });
  assert.equal(classifyNode({ value: 42 }), null, 'a non-string value is not prose');
});

test('named markdownContent is reduced to the same text node', () => {
  assert.deepEqual(classifyNode(SAMPLES.markdownContent), { type: 'text', text: 'named markdown' });
  assert.deepEqual(classifyNode({ kind: 'markdownContent', content: 'plain markdown' }), { type: 'text', text: 'plain markdown' });
  assert.equal(classifyNode({ kind: 'markdownContent', content: { value: '' } }), null);
});

test('an unknown kind yields nothing, which is what the census then reports', () => {
  assert.equal(classifyNode({ kind: 'somethingNew' }), null);
  assert.equal(classifyNode(null), null);
  assert.equal(classifyNode('a string'), null);
});

test('fileOperation maps tool names to what they did', () => {
  assert.equal(fileOperation('createFile'), 'created');
  assert.equal(fileOperation('copilot_applyPatch'), 'modified');
  assert.equal(fileOperation('replaceString'), 'modified');
  assert.equal(fileOperation('insert_edit_into_file'), 'modified');
  assert.equal(fileOperation('read_file'), '', 'reading is not a change');
  assert.equal(fileOperation(''), '');
});

test('every handled kind has an example above', () => {
  // The rule from the migration plan: a kind in the dispatch table with no example is a kind
  // nothing exercises.
  assert.deepEqual([...HANDLED_RESPONSE_KINDS].sort(), Object.keys(SAMPLES).sort());
  for (const [kind, sample] of Object.entries(SAMPLES))
    assert.notEqual(classifyNode(sample), null, `${kind} produced nothing`);
});

test('the kind lists do not overlap', () => {
  // A name in two lists means the census would describe it two ways.
  const lists = { HANDLED_RESPONSE_KINDS, IGNORED_RESPONSE_KINDS, KNOWN_UNSEEN_KINDS };
  for (const [nameA, listA] of Object.entries(lists))
    for (const [nameB, listB] of Object.entries(lists)) {
      if (nameA >= nameB)
        continue;
      const shared = [...listA].filter((kind) => listB.has(kind));
      assert.deepEqual(shared, [], `${nameA} and ${nameB} share ${shared.join(', ')}`);
    }

  const sharedPayload = [...HANDLED_TOOL_PAYLOAD_KINDS].filter((kind) => GENERIC_TOOL_PAYLOAD_KINDS.has(kind));
  assert.deepEqual(sharedPayload, []);
});
