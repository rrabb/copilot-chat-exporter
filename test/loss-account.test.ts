import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseChatSession } from '../src/session/journal.ts';
import { buildLossAccount, normalizeForLoss } from '../src/verify/loss-account.ts';

const request = (response: unknown[], extra: Record<string, unknown> = {}) => ({
  requestId: 'r', message: { text: 'Please explain the build failure' }, response, ...extra,
});
const summary = (account: ReturnType<typeof buildLossAccount>) => Object.fromEntries(
  Object.entries(account.totals).map(([category, row]) => [category, `${row.present}/${row.partial}/${row.absent}`]));

test('recorded text that appears in the Markdown, however it is wrapped, is present', () => {
  const markdown = [
    '> Please explain the build failure',
    '',
    '<div>  The compiler   reported a type\\_mismatch &amp; stopped.',
    '```',
    'a clipped long line stays',
    '```',
  ].join('\n');
  const account = buildLossAccount([request([{ value: 'The compiler reported a type_mismatch & stopped.' }])], markdown);
  assert.deepEqual(summary(account), { prompt: '1/0/0', 'assistant-text': '1/0/0' });
  assert.equal(account.failed, false);
});

test('content the export never rendered is absent, and the item says where it was', () => {
  const account = buildLossAccount([
    request([{ value: 'Done.' }]),
    request([
      { kind: 'toolInvocationSerialized', toolId: 'run', resultError: 'The tool failed with exit code 7' },
      { kind: 'warning', content: { value: 'Copilot failed to get ready' } },
    ], { result: { errorDetails: { message: 'Sorry, your request failed. Please try again.' } } }),
  ], 'Please explain the build failure Done.');
  assert.equal(account.failed, true);
  assert.deepEqual(account.unaccounted.map((item) => [item.request, item.category, item.status]), [
    [2, 'request-error', 'absent'], [2, 'tool-error', 'absent'], [2, 'other:warning', 'absent'],
  ]);
});

test('Layer D detects recorded text rendered out of order', () => {
  const account = buildLossAccount([
    request([{ value: 'First recorded response.' }, { value: 'Second recorded response.' }]),
  ], 'Please explain the build failure\nSecond recorded response.\nFirst recorded response.');
  assert.equal(account.order.outOfOrder, 1);
  assert.equal(account.failed, true);
});

test('a short markdownVuln fragment inside a code line is checked through its whole merged line', () => {
  const raw = [request([
    { value: '```js\nfunction run()' },
    { kind: 'markdownVuln', content: { value: ' {\n' }, vulnerabilities: [{ title: 'Unsafe call', description: 'Avoid eval here.' }] },
    { value: '  return 1;\n}\n```' },
  ])];
  const intact = 'Please explain the build failure\n```js\nfunction run() {\n  return 1;\n}\n```\nUnsafe call: Avoid eval here.';
  const account = buildLossAccount(raw, intact);
  assert.deepEqual(summary(account), {
    prompt: '1/0/0', 'assistant-text': '2/0/0', 'assistant-text-joined': '1/0/0', vulnerability: '2/0/0',
  });
  assert.equal(account.failed, false);
  const broken = buildLossAccount(raw, intact.replace('function run() {', 'function run()'));
  assert.deepEqual(broken.unaccounted.map((item) => [item.category, item.status]), [['assistant-text-joined', 'absent']]);
  assert.equal(broken.failed, true);
});

test('every labelled inline reference is checked, so an empty rendered reference is absent', () => {
  const uri = { scheme: 'file', path: '/proj/src/deep/widget.ts' };
  const raw = [request([
    { value: 'See ' },
    { kind: 'inlineReference', inlineReference: { uri, range: { startLineNumber: 3 } }, name: 'src/deep/widget.ts#L3' },
    { value: ' and ' },
    { kind: 'inlineReference', inlineReference: { name: 'runExport', location: { uri } } },
    { value: ' for details.' },
  ])];
  const intact = 'Please explain the build failure\nSee `src/deep/widget.ts#L3` and `runExport` for details.';
  const account = buildLossAccount(raw, intact);
  assert.equal(summary(account)['inline-reference'], '2/0/0');
  assert.equal(account.failed, false);
  const dropped = buildLossAccount(raw, intact.replace('`src/deep/widget.ts#L3`', ''));
  assert.deepEqual(dropped.unaccounted.map((item) => [item.category, item.status]), [['inline-reference', 'absent']]);
  assert.equal(dropped.failed, true);
});

test('Layer D detects repeated recorded text rendered only once', () => {
  const account = buildLossAccount([
    request([{ value: 'Repeated response fragment.' }, { value: 'Repeated response fragment.' }]),
  ], 'Please explain the build failure\nRepeated response fragment.');
  assert.deepEqual(account.multiplicity, { checked: 1, missing: 1 });
  assert.equal(account.failed, true);
});

test('a separator-free join is not treated as content loss', () => {
  const account = buildLossAccount([
    request([{ value: '## Build report' }, { value: 'First result.' }]),
  ], 'Please explain the build failure\n## Build reportFirst result.');
  assert.equal(account.order.outOfOrder, 0);
  assert.deepEqual(account.multiplicity, { checked: 0, missing: 0 });
  assert.equal(account.failed, false);
});

test('overlapping streamed fragments are not treated as out of order', () => {
  const account = buildLossAccount([
    request([{ kind: 'thinking', value: 'The response is complete.' }, { kind: 'thinking', value: 'The response' }]),
  ], 'Please explain the build failure\nThe response is complete.');
  assert.equal(account.order.outOfOrder, 0);
  assert.equal(account.failed, false);
});

test('Local order follows prompts and prose, not tool fields or the request-error tail', () => {
  const account = buildLossAccount([
    request([{ value: 'First response.' }]),
    request([
      { kind: 'toolInvocationSerialized', toolCallId: 'tool-1', resultDetails: { input: 'Argument one' } },
      { value: 'Second response.' },
    ], { result: { errorDetails: { message: 'Request error after the response.' } } }),
  ], [
    'Please explain the build failure',
    'First response.',
    'Please explain the build failure',
    'Argument one',
    'Second response.',
    'Request error after the response.',
  ].join('\n'));
  assert.equal(account.order.outOfOrder, 0);
  assert.equal(account.failed, false);
});

test('Local reasoning snapshots do not count as distinct repeated output', () => {
  const thought = 'The final reasoning appears once.';
  const account = buildLossAccount([
    request([{ kind: 'thinking', value: thought }, { kind: 'thinking', value: thought }]),
  ], `Please explain the build failure\n${thought}`);
  assert.deepEqual(account.multiplicity, { checked: 0, missing: 0 });
  assert.equal(account.failed, false);
});

test('question-carousel text is independently accounted', () => {
  const question = {
    kind: 'questionCarousel',
    questions: [{
      title: 'Delivery scope',
      message: 'Which option?',
      options: [{ label: 'Local only', value: 'local' }],
    }],
  };
  const markdown = 'Please explain the build failure Delivery scope Which option? Local only local';
  const account = buildLossAccount([request([question])], markdown);
  assert.equal(account.totals['other:questionCarousel']?.absent, 0);
  assert.equal(account.totals['other:questionCarousel']?.present, 4);
});

test('clipped long text is partial, not present and not lost', () => {
  const long = Array.from({ length: 80 }, (_, index) => `sentence number ${index} of the long answer`).join('. ');
  const account = buildLossAccount([request([{ value: long }])], `Please explain the build failure ${long.slice(0, 300)} ... [middle omitted]`);
  assert.equal(account.totals['assistant-text']!.partial, 1);
  assert.equal(account.failed, false, 'partial content is reported but is not a failure by itself');
});

test('multi-line output reports how many recorded lines are missing', () => {
  const output = ['PS C:\\work> npm test', 'first result line', 'second result line', 'third result line'].join('\r\n');
  const request1 = request([{ kind: 'toolInvocationSerialized', toolSpecificData: { kind: 'terminal', terminalCommandOutput: { text: output } } }]);
  const partial = buildLossAccount([request1], 'Please explain the build failure first result line second result line');
  assert.deepEqual(partial.unaccounted.map((item) => [item.category, item.status, item.lines]), [['terminal-output', 'partial', { found: 2, total: 4 }]]);
  const none = buildLossAccount([request1], 'Please explain the build failure');
  assert.equal(none.unaccounted[0]!.status, 'absent');
  const all = buildLossAccount([request1], `Please explain the build failure ${output}`);
  assert.deepEqual(all.unaccounted, []);
});

test('serialized JSON tool input is compared as rendered, ANSI is ignored, and empty fences are not content', () => {
  const input = JSON.stringify({ code: 'const message = "quoted";' });
  const account = buildLossAccount([request([
    { kind: 'toolInvocationSerialized', resultDetails: { input },
      toolSpecificData: { kind: 'terminal', terminalCommandOutput: { text: '\u001b[32mgreen output line\u001b[0m' } } },
    { value: '```\n```' },
  ])], `Please explain the build failure ${input} green output line`);
  assert.equal(account.totals['tool-input']?.present, 1);
  assert.equal(account.failed, false);
  assert.equal(account.totals['assistant-text'], undefined, 'a fence with no letters or digits is not counted');
});

test('redaction is not counted as loss: the recorded secret is compared as the export would redact it', () => {
  const account = buildLossAccount([request([{ value: 'Use password = hunter2secret to connect' }])], 'Please explain the build failure Use password = [REDACTED] to connect');
  assert.equal(account.failed, false);
  assert.deepEqual(summary(account), { prompt: '1/0/0', 'assistant-text': '1/0/0' });
});

test('normalization undoes only Markdown wrapping', () => {
  assert.equal(normalizeForLoss('> a &lt;b&gt;\n   \\*c\\*  d'), 'a <b> *c* d');
});

test('the committed golden session keeps its confirmation and question-carousel text', () => {
  const raw = readFileSync('test/fixtures/golden/00000000-0000-4000-8000-000000000000.jsonl', 'utf8');
  const session = parseChatSession('golden.jsonl', raw);
  const account = buildLossAccount(session.rawRequests, readFileSync('test/fixtures/golden/golden-session.expected.md', 'utf8'));
  assert.deepEqual(account.unaccounted, []);
  assert.ok(account.checked >= 42);
});
