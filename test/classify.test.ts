import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GENERIC_RESPONSE_KINDS, GENERIC_TOOL_PAYLOAD_KINDS, HANDLED_RESPONSE_KINDS, HANDLED_TOOL_PAYLOAD_KINDS,
  IGNORED_RESPONSE_KINDS, KNOWN_UNSEEN_KINDS, classifyNode, fileOperation, outputCheckFailure, standardMarkdownValue, thinkingText,
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
  autoModeResolution: { kind: 'autoModeResolution', resolved: { id: 'gpt-x', name: 'GPT X' } },
  warning: { kind: 'warning', content: { value: 'Copilot failed to get ready' } },
  confirmation: { kind: 'confirmation', title: 'Continue?', message: { value: 'The task is still running.' } },
  questionCarousel: {
    kind: 'questionCarousel',
    questions: [{ title: 'Delivery scope', message: 'Which option?', options: [{ label: 'Local only', value: 'local' }] }],
  },
  markdownVuln: {
    kind: 'markdownVuln',
    content: { value: ' {\n', supportThemeIcons: false, supportHtml: false, uris: {} },
    vulnerabilities: [{ title: 'path-injection', description: 'Unvalidated input in path value creation' }],
  },
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

test('warnings, confirmations, and question carousels become readable notes', () => {
  assert.deepEqual(classifyNode(SAMPLES.warning), {
    type: 'note', title: 'Warning', text: 'Copilot failed to get ready',
  });
  assert.deepEqual(classifyNode(SAMPLES.confirmation), {
    type: 'note', title: 'Confirmation: Continue?', text: 'The task is still running.',
  });
  assert.deepEqual(classifyNode(SAMPLES.questionCarousel), {
    type: 'note', title: 'Copilot questions', text: 'Delivery scope\nWhich option?\n- Local only (local)',
  });
});

test('a textual tool result error reaches the parsed tool node', () => {
  const node = classifyNode({
    kind: 'toolInvocationSerialized',
    toolId: 'run_in_terminal',
    toolCallId: 'call_error',
    resultError: 'Healed error: the command failed.',
  });
  assert.equal(node.resultError, 'Healed error: the command failed.');
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
  const running = classifyNode({ kind: 'toolInvocationSerialized', toolId: 'run_in_terminal', toolCallId: 'call_5', isComplete: false });
  assert.equal(running.isComplete, false);

  const withFile = classifyNode({
    kind: 'toolInvocationSerialized',
    toolId: 'copilot_replaceString',
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

test('inlineReference labels follow VS Code: the recorded name first, else the basename or symbol name', () => {
  const uri = { $mid: 1, scheme: 'file', path: '/proj/src/deep/c.ts' };
  const range = { startLineNumber: 3, startColumn: 1, endLineNumber: 7, endColumn: 1 };
  const label = (item: Record<string, unknown>) => classifyNode({ kind: 'inlineReference', ...item });
  assert.deepEqual(label({ inlineReference: { uri, range }, name: 'src/deep/c.ts#L3-L7' }), { type: 'ref', text: 'src/deep/c.ts#L3-L7' });
  assert.deepEqual(label({ inlineReference: { uri, range } }), { type: 'ref', text: 'c.ts' });
  assert.deepEqual(label({ inlineReference: { name: 'runExport', kind: 12, location: { uri, range } } }), { type: 'ref', text: 'runExport' });
  assert.deepEqual(label({ inlineReference: uri }), { type: 'ref', text: 'c.ts' });
  assert.deepEqual(label({ inlineReference: uri, name: 'src/deep/c.ts' }), { type: 'ref', text: 'src/deep/c.ts' });
  assert.deepEqual(label({ inlineReference: { uri: { scheme: 'file', fsPath: 'C:\\proj\\d.ts' }, range } }), { type: 'ref', text: 'd.ts' });
});

test('an inlineReference to a root URI with no basename falls back to the path, then the external URI', () => {
  const label = (ref: Record<string, unknown>) => classifyNode({ kind: 'inlineReference', inlineReference: ref });
  assert.deepEqual(label({ $mid: 1, scheme: 'file', path: '/', fsPath: '\\', external: 'file:///', _sep: 1 }), { type: 'ref', text: '/' });
  assert.deepEqual(label({ scheme: 'file', external: 'file:///' }), { type: 'ref', text: 'file:///' });
  assert.deepEqual(label({ scheme: 'https', external: 'https://example.com/docs/page.md' }), { type: 'ref', text: 'page.md' });
  assert.deepEqual(label({ uri: { scheme: 'file', path: '/' } }), { type: 'ref', text: '/' });
});

test('an inlineReference with no label falls back to unreviewed JSON instead of rendering empty', () => {
  const node = classifyNode({ kind: 'inlineReference', inlineReference: { range: { startLineNumber: 1 } } });
  assert.equal(node?.type, 'unknownResponse');
  assert.equal((node as { kind: string }).kind, 'inlineReference');
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

test('an unknown kind keeps its complete raw JSON payload for later review', () => {
  const response = { kind: 'somethingNew', nested: { message: 'still available' } };
  assert.deepEqual(classifyNode(response), {
    type: 'unknownResponse',
    kind: 'somethingNew',
    payload: JSON.stringify(response, null, 2),
  });
  assert.equal(classifyNode({ kind: 'progressMessage', value: 'deliberately ignored' }), null);
  assert.equal(classifyNode(null), null);
  assert.equal(classifyNode('a string'), null);
});

test('an unknown kind never inlines content.value, even in the standard Markdown form', () => {
  const response = { kind: 'somethingNew', content: { value: 'visible text', supportHtml: false, uris: {} } };
  assert.deepEqual(classifyNode(response), {
    type: 'unknownResponse',
    kind: 'somethingNew',
    payload: JSON.stringify(response, null, 2),
  });
});

test('standardMarkdownValue accepts only value plus the display metadata keys', () => {
  assert.equal(standardMarkdownValue({ value: 'x', supportHtml: true, supportThemeIcons: false, uris: {} }), 'x');
  assert.equal(standardMarkdownValue({ value: '' }), '');
  for (const content of [{ value: 'x', extra: 1 }, { value: 42 }, 'plain string', [{ value: 'x' }], null])
    assert.equal(standardMarkdownValue(content), null, JSON.stringify(content));
});

test('markdownVuln merges its text into the run and keeps the recorded warnings', () => {
  assert.deepEqual(classifyNode(SAMPLES.markdownVuln), {
    type: 'text',
    text: ' {\n',
    vulnerabilities: [{ title: 'path-injection', description: 'Unvalidated input in path value creation' }],
    omittedDisplayMetadata: ['supportThemeIcons', 'supportHtml', 'uris'],
  });
});

test('a malformed markdownVuln falls back to the unreviewed JSON block', () => {
  const malformed = [
    { kind: 'markdownVuln', content: { value: 7 }, vulnerabilities: [] },
    { kind: 'markdownVuln', content: { value: 'x' } },
    { kind: 'markdownVuln', content: { value: 'x' }, vulnerabilities: [{ title: 'only a title' }] },
    { kind: 'markdownVuln', content: { value: 'x' }, vulnerabilities: 'not an array' },
  ];
  for (const item of malformed) {
    const node = classifyNode(item) as { type: string; kind?: string; payload?: string };
    assert.equal(node.type, 'unknownResponse', JSON.stringify(item));
    assert.equal(node.kind, 'markdownVuln');
    assert.equal(node.payload, JSON.stringify(item, null, 2));
    assert.equal('inlineText' in node, false, 'no unreviewed text is inlined');
  }
});

test('autoModeResolution keeps the model Auto picked, in both observed shapes', () => {
  assert.deepEqual(classifyNode({ kind: 'autoModeResolution', resolved: { id: 'gpt-x', name: 'GPT X' } }),
    { type: 'autoModel', modelId: 'gpt-x', modelName: 'GPT X', confidence: null, predictedLabel: '' });
  assert.deepEqual(classifyNode({
    kind: 'autoModeResolution', resolvedModel: 'old-id', resolvedModelName: 'Old Name', confidence: 0.9, predictedLabel: 'needs_reasoning',
  }), { type: 'autoModel', modelId: 'old-id', modelName: 'Old Name', confidence: 0.9, predictedLabel: 'needs_reasoning' });
  assert.equal(classifyNode({ kind: 'autoModeResolution', resolved: {} }), null, 'a record naming no model has nothing to keep');
  assert.equal(classifyNode({ kind: 'autoModeResolution', confidence: 'high' }), null);
});

test('fileOperation maps tool names to what they did', () => {
  assert.equal(fileOperation('createFile'), 'created');
  assert.equal(fileOperation('copilot_applyPatch'), 'modified');
  assert.equal(fileOperation('replaceString'), 'modified');
  assert.equal(fileOperation('insert_edit_into_file'), 'modified');
  assert.equal(fileOperation('read_file'), '', 'reading is not a change');
  assert.equal(fileOperation(''), '');
});

test('no-content tools pass only after a bounded absence check produces a missing-data marker', () => {
  const item = { kind: 'toolInvocationSerialized', toolId: 'tool_search', toolCallId: 'call_9', invocationMessage: '' };
  assert.equal(outputCheckFailure(item, { type: 'tool', toolId: 'tool_search', invocation: '' }), 'tool-without-content');
  assert.equal(classifyNode(item).noRecordedContent, true);
  assert.equal(classifyNode({ ...item, isConfirmed: { type: 1 }, source: { type: 'internal', label: 'Built in' } }).noRecordedContent, true);
  for (const extra of [{ futurePayload: 'not reviewed' }, { originMessage: 'recorded origin' }, { source: { type: 'internal', payload: 'new' } }])
    assert.equal(classifyNode({ ...item, ...extra }).type, 'unknownResponse');
  const input = classifyNode({ ...item, resultDetails: { input: 'actual input' } });
  assert.equal(input.inputText, 'actual input');
  assert.equal(input.noRecordedContent, undefined);
});

test('the output check fails a tool call without an ID, or whose message did not reach the node', () => {
  assert.equal(outputCheckFailure({ kind: 'toolInvocationSerialized', toolCallId: 'c' }, { type: 'tool', toolId: '' }), 'tool-without-id');
  const item = { kind: 'toolInvocationSerialized', toolId: 'read_file', invocationMessage: { value: 'Reading a.ts' } };
  assert.equal(outputCheckFailure(item, { type: 'tool', toolId: 'read_file' }), 'tool-message-not-rendered');
  assert.equal(classifyNode({ kind: 'toolInvocationSerialized', toolCallId: 'c' }).type, 'unknownResponse');
});

test('the output check passes an empty thinking partial and fails content the classifier dropped', () => {
  assert.equal(outputCheckFailure({ kind: 'thinking', value: '' }, null), null);
  assert.equal(outputCheckFailure({ kind: 'warning', content: { value: 'x' } }, null), 'content-not-rendered');
  assert.equal(outputCheckFailure({ kind: 'questionCarousel', questions: [{ title: 'Q' }] }, []), 'content-not-rendered');
  const edit = { kind: 'workspaceEdit', edits: [{ oldResource: { path: '/a' } }, { oldResource: { path: '/b' } }] };
  assert.equal(outputCheckFailure(edit, [{ type: 'edit' }]), 'edit-not-rendered');
});

test('a handled record whose form changed falls back to the unreviewed JSON block', () => {
  const node = classifyNode({ kind: 'warning', content: { message: 'renamed field' } });
  assert.equal(node.type, 'unknownResponse');
  assert.equal(node.kind, 'warning');
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
  const lists = { GENERIC_RESPONSE_KINDS, HANDLED_RESPONSE_KINDS, IGNORED_RESPONSE_KINDS, KNOWN_UNSEEN_KINDS };
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
