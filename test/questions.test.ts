import assert from 'node:assert/strict';
import test from 'node:test';
import { isQuestionLikeTool, parseAskUser, parseCarousel, parseElicitation, parseGuessedQuestion, questionCensus, questionWarningDetails, questionWarningLines } from '../src/session/questions.ts';
import { buildSdkSession } from '../src/session/sdk-session.ts';
import { parseChatSession } from '../src/session/journal.ts';
import type { SdkEvent } from '../src/session/sdk-events.ts';
import type { ToolNode } from '../src/types.ts';
import { buildDocument, renderTurnBody } from '../src/markdown.ts';
import { classifyNode } from '../src/session/classify.ts';
import { testSession, testTool, testTurn } from './helpers.ts';

const done = (content: string, detailed = '', extra: { success?: boolean; error?: string } = {}) =>
  ({ isComplete: true, content, detailed, ...extra });

const schemaArgs = {
  message: 'Pick a **plan**.',
  requestedSchema: {
    properties: {
      plan: { type: 'string', title: 'Which plan?', oneOf: [{ const: 'fast', title: 'Fast path' }, { const: 'safe', title: 'Safe path' }], default: 'safe' },
      areas: { type: 'array', title: 'Areas', items: { anyOf: [{ const: 'a, b', title: 'A and B' }, { const: 'c', title: 'C' }] } },
      notes: { type: 'string', title: 'Notes' },
      approve: { type: 'boolean', title: 'Approve?' },
    },
  },
};

test('schema ask_user answers match options by value or title, and keep commas inside options', () => {
  const question = parseAskUser(schemaArgs, done(
    'User responded: plan=fast, areas=a, b, c',
    'User responded:\nWhich plan?: Fast path\nareas: a, b, c, my own area\nNotes: first line\nsecond line',
  ));
  const [plan, areas, notes, approve] = question.fields;
  assert.equal(question.outcome, 'answered');
  assert.equal(question.message, 'Pick a **plan**.');
  assert.deepEqual(plan.answer, { selected: ['fast'] });
  assert.equal(plan.options.find((option) => option.value === 'safe')?.isDefault, true);
  assert.equal(areas.kind, 'multi');
  assert.deepEqual(areas.answer, { selected: ['a, b', 'c'], freeform: 'my own area' });
  assert.deepEqual(notes.answer, { selected: [], freeform: 'first line\nsecond line' });
  assert.equal(approve.answer, undefined, 'a field left out of the answer stays unanswered');
  assert.equal(question.parseWarning, undefined);
});

test('schema ask_user falls back to key=value content when the detailed text is missing', () => {
  const question = parseAskUser(schemaArgs, done('User responded: plan=typed text, approve=true'));
  assert.deepEqual(question.fields[0].answer, { selected: [], freeform: 'typed text' });
  assert.deepEqual(question.fields[3].answer, { selected: ['true'] });
});

test('choice-style ask_user separates picked choices from typed answers', () => {
  const args = { question: 'Continue?', choices: ['Yes', 'No'] };
  assert.deepEqual(parseAskUser(args, done('User selected: No')).fields[0].answer, { selected: ['No'] });
  assert.deepEqual(parseAskUser(args, done('User responded: later')).fields[0].answer, { selected: [], freeform: 'later' });
  const odd = parseAskUser(args, done('User selected: Maybe'));
  assert.equal(odd.outcome, 'unknown');
  assert.ok(odd.parseWarning);
});

test('unrecognized, failed and cancelled answers keep the recorded text and payloads', () => {
  const changed = parseAskUser(schemaArgs, { ...done('The user answered: fast'), raw: { result: { content: 'The user answered: fast' } } });
  assert.equal(changed.outcome, 'unknown');
  assert.ok(changed.parseWarning);
  assert.equal(changed.answerText, 'The user answered: fast');
  assert.deepEqual(changed.raw, { question: schemaArgs, answer: { result: { content: 'The user answered: fast' } } });
  assert.equal(parseAskUser(schemaArgs, done('User cancelled', '', { success: false })).outcome, 'cancelled');
  const declined = parseAskUser(schemaArgs, done('The user declined to answer.'));
  assert.deepEqual([declined.outcome, Boolean(declined.parseWarning)], ['declined', true]);
  assert.equal(parseAskUser(schemaArgs, done('User responded: plan=declined')).outcome, 'answered', 'a known answer format wins over wording');
  assert.equal(parseAskUser(schemaArgs, done('', '', { success: false, error: 'timed out' })).answerText, 'timed out');
  assert.equal(parseAskUser(schemaArgs, { isComplete: false, content: '', detailed: '' }).outcome, 'unanswered');
});

test('carousel answers cover every recorded value format', () => {
  const option = (value: string) => ({ id: value, label: value, value });
  const questions = ['single', 'multi', 'typed', 'both', 'secret', 'skipped'].map((id) => ({
    id: `call:${id}`, type: id === 'multi' || id === 'both' ? 'multiSelect' : 'singleSelect', title: id, message: `Pick ${id}`,
    options: [option('x'), option('y')], allowFreeformInput: true, defaultValue: 'y',
  }));
  const question = parseCarousel({
    kind: 'questionCarousel', resolveId: 'call', questions, isUsed: true, data: {
      'call:single': { selectedValue: 'x' }, 'call:multi': { selectedValues: ['x', 'y'] }, 'call:typed': { freeformValue: 'mine' },
      'call:both': { selectedValues: ['y'], freeformValue: 'extra' }, 'call:secret': '••••••••',
    },
  });
  assert.equal(question.source, 'vscode_askQuestions');
  assert.equal(question.outcome, 'answered');
  assert.deepEqual(question.fields.map((field) => field.answer), [
    { selected: ['x'] }, { selected: ['x', 'y'] }, { selected: [], freeform: 'mine' },
    { selected: ['y'], freeform: 'extra' }, { selected: [], freeform: '••••••••', masked: true }, undefined,
  ]);
  assert.equal(question.fields[0].options[1].isDefault, true);
  assert.equal(parseCarousel({ resolveId: 'call', questions, data: {} }).outcome, 'unanswered');
  const future = parseCarousel({ resolveId: 'call', questions, data: { 'call:single': { pickedValue: 'x' } } });
  assert.equal(future.outcome, 'unknown');
  assert.ok(future.parseWarning);
  assert.equal(parseCarousel({ questions, message: 'Server form', source: 'Weather' }).source, 'mcp-form');
});

test('MCP confirmations record only accepted or rejected', () => {
  const accepted = parseElicitation({ kind: 'elicitationSerialized', title: 'Open link?', message: 'Go to the docs', subtitle: 'Docs (MCP Server)', state: 'accepted' });
  assert.deepEqual([accepted.outcome, accepted.server, accepted.title], ['accepted', 'Docs', 'Open link?']);
  assert.equal(parseElicitation({ state: 'rejected' }).outcome, 'rejected');
  assert.ok(parseElicitation({ state: 'later' }).parseWarning);
});

let line = 0;
const event = (type: string, data: Record<string, unknown>): SdkEvent =>
  ({ type, data, raw: { type, data }, recordedLine: '', line: ++line, timestamp: '2026-10-14T10:00:00.000Z', id: `e${line}` });

test('agent chats attach the parsed question to the ask_user tool node', () => {
  const args = { question: 'Ship it?', choices: ['Ship', 'Wait'] };
  const events = [
    event('user.message', { content: 'Go', messageId: 'm1' }),
    event('assistant.message', { model: 'test', toolRequests: [{ toolCallId: 'q1', name: 'ask_user', arguments: args }, { toolCallId: 'q2', name: 'ask_user', arguments: args }] }),
    event('tool.execution_complete', { toolCallId: 'q1', success: true, result: { content: 'User selected: Ship' } }),
  ];
  const { session } = buildSdkSession(events, events, { title: 'Agent chat', assetsDirectory: 'assets' });
  const [answered, pending] = session.turns[0].toolNodes;
  assert.deepEqual(answered.question?.fields[0].answer, { selected: ['Ship'] });
  assert.equal(pending.question?.outcome, 'unanswered');
});

test('Local chats pair the answered carousel with its vscode_askQuestions call', () => {
  const questions = [{ id: 'ask1:0', type: 'singleSelect', title: 'Scope', message: 'Which?', options: [{ id: 'a', label: 'A', value: 'A' }], allowFreeformInput: false }];
  const session = parseChatSession('session.jsonl', JSON.stringify({ kind: 0, v: { requests: [{
    message: { text: 'Plan it' },
    response: [
      { kind: 'toolInvocationSerialized', toolId: 'vscode_askQuestions', toolCallId: 'ask1', invocationMessage: 'Asking a question', isComplete: true },
      { kind: 'questionCarousel', resolveId: 'ask1', questions, isUsed: false },
      { kind: 'questionCarousel', resolveId: 'ask1', questions, isUsed: true, data: { 'ask1:0': { selectedValue: 'A' } } },
    ],
  }] } }));
  const tool = session.turns[0].toolNodes.find((node: ToolNode) => node.toolId === 'vscode_askQuestions');
  assert.equal(tool?.question?.outcome, 'answered');
  assert.deepEqual(tool?.question?.fields[0].answer, { selected: ['A'] });
  assert.equal(session.turns[0].body.filter((node) => node.type === 'note').length, 0, 'the paired carousel notes are dropped');
});

const renderTool = (tool: ToolNode) => renderTurnBody(testTurn({ body: [tool] }), new Map()).join('\n');

test('an answered question renders as an open box with its heading, options, chosen answer and a tool badge', () => {
  const question = parseAskUser({ message: '## Context\nPick one.', requestedSchema: { properties: { plan: { type: 'string', title: 'Plan', enum: ['Fast', 'Safe'], default: 'Safe' } } } },
    done('User responded: Fast', 'User responded:\nPlan: Fast'));
  const output = renderTool(testTool({ toolCallId: 'q1', toolId: 'ask_user', resultText: 'User responded: Fast', question }));
  assert.match(output, /^### ❓ Agent asked · Plan$/mu);
  assert.match(output, /^##### Context$/mu, 'agent headings move below the question heading');
  assert.match(output, /^- ✅ \*\*Fast\*\* ← chosen$/mu);
  assert.match(output, /^- Safe ⭐ \*\(default\)\*$/mu);
  assert.match(output, /\*\*✅ You answered:\*\* Fast/u);
  assert.match(output, /^<details><summary><sub>.*🛠️ <code[^>]*>ask_user<\/code>: 🧾 Recorded question and answer/mu, 'the collapsed record keeps the tool badge');
  assert.ok(output.indexOf('### ❓') < output.indexOf('<details>'), 'the question itself is never inside a collapsed block');
});

test('a declined or unparsed answer still renders the box, with the recorded data shown when parsing failed', () => {
  const declined = renderTool(testTool({ toolId: 'ask_user', question: parseAskUser({ question: 'Run it?', choices: ['Yes'] }, done('User declined to answer')) }));
  assert.match(declined, /### ❓ Agent asked/u);
  assert.match(declined, /🚫 \*\*Declined\.\*\*/u);
  const unknown = renderTool(testTool({ toolId: 'ask_user', question: parseAskUser({ question: 'Run it?', choices: ['Yes'] }, done('Something new: 42')) }));
  assert.match(unknown, /### ❓ Agent asked/u);
  assert.match(unknown, /couldn't fully read this question or answer/u);
  assert.match(unknown, /\*\*Recorded answer text:\*\*\n\n```text\nSomething new: 42\n```/u);
});

test('the decision index lists each top-level question with a link to its box', () => {
  const question = parseAskUser({ question: 'Ship it?', choices: ['Ship', 'Wait'] }, done('User selected: Ship'));
  const output = buildDocument(testSession({ turns: [testTurn({ number: 1, body: [testTool({ toolId: 'ask_user', question })] })] }), {
    location: { sessionId: 'a0a0a0a0-1111-4111-8111-111111111111', sessionPath: 'session.jsonl', hashRoot: '.' },
    resources: { resources: [], byCall: new Map(), resourceRoot: '.' },
    versions: { copilotVersion: 'unknown', vscodeVersion: 'unknown' },
    memory: { session: [], repo: [], user: [] },
    outputPath: 'export.md', gitStatus: '', generatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.match(output, /^\| 1 \| 1 \| \[Ship it\?\]\(#question-1\) \| Ship \|$/mu);
  assert.match(output, /^<a id="question-1"><\/a>$/mu);
  assert.doesNotMatch(output, /question-warning/u);
});

const renderIndexOnly = (question: ReturnType<typeof parseGuessedQuestion>) => buildDocument(testSession({ turns: [testTurn({ number: 1, body: [testTool({ question })] })] }), {
  location: { sessionId: 'a0a0a0a0-1111-4111-8111-111111111111', sessionPath: 'session.jsonl', hashRoot: '.' },
  resources: { resources: [], byCall: new Map(), resourceRoot: '.' },
  versions: { copilotVersion: 'unknown', vscodeVersion: 'unknown' },
  memory: { session: [], repo: [], user: [] },
  outputPath: 'export.md', gitStatus: '', generatedAt: '2026-01-01T00:00:00.000Z',
});

test('guessed questions get a top warning, an index marker and a bottom list linking to each box', () => {
  const guessed = parseGuessedQuestion('ask_followup_question', { question: 'Which DB?', options: ['A', 'B'] }, done('A'));
  const output = buildDocument(testSession({ turns: [testTurn({ number: 1, body: [testTool({ toolId: 'ask_followup_question', question: guessed })] })] }), {
    location: { sessionId: 'a0a0a0a0-1111-4111-8111-111111111111', sessionPath: 'session.jsonl', hashRoot: '.' },
    resources: { resources: [], byCall: new Map(), resourceRoot: '.' },
    versions: { copilotVersion: 'unknown', vscodeVersion: 'unknown' },
    memory: { session: [], repo: [], user: [] },
    outputPath: 'export.md', gitStatus: '', generatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.match(output, /^> \*\*1 question to the user was guessed or not fully read\.\*\* .*\[See the list\]\(#question-warnings\)\.$/mu);
  assert.match(output, /\| ℹ️ Guessed · A \|$/mu);
  const cancelled = parseGuessedQuestion('ask_followup_question', { question: 'Go?' }, done('User cancelled'));
  const cancelledOutput = renderIndexOnly(cancelled);
  assert.match(cancelledOutput, /\| ℹ️ Guessed · .*Cancel/mu);
  assert.match(output, /^<a id="question-warnings"><\/a>$/mu);
  assert.match(output, /^1\. \[Which DB\?\]\(#question-warning-1\) · turn 1 · unrecognized tool `ask_followup_question`/mu);
  assert.match(output, /^<a id="question-warning-1"><\/a>$/mu);
});

test('a Local MCP confirmation renders as a question box with the implied buttons and the chosen one', () => {
  const note = classifyNode({ kind: 'elicitationSerialized', title: 'Allow write?', message: 'Write **3** files.', subtitle: 'files (MCP Server)', state: 'accepted', isHidden: false });
  const output = renderTurnBody(testTurn({ body: [note as any] }), new Map()).join('\n');
  assert.match(output, /^### ❓ Agent asked · Allow write\?$/mu);
  assert.match(output, /Write \*\*3\*\* files\. \*\(from MCP server files\)\*/u);
  assert.match(output, /^- ✅ \*\*Accept\*\* ← chosen$/mu);
  assert.match(output, /^- Reject or no answer$/mu);
  assert.doesNotMatch(output, /couldn't fully read/u);
});

test('question-like tool names are detected by whole words, and known question tools are excluded', () => {
  for (const name of ['ask_followup_question', 'askClarifyingQuestion', 'mcp_forms_elicit', 'get_user_input', 'survey.run'])
    assert.ok(isQuestionLikeTool(name), name);
  for (const name of ['ask_user', 'vscode_askQuestions', 'run_task', 'mask_secrets', 'confirm_deploy', 'read_file'])
    assert.ok(!isQuestionLikeTool(name), name);
});

test('an unrecognized question tool renders as a guessed box with its options, the chosen one and the answer', () => {
  const question = parseGuessedQuestion('ask_followup_question', { question: 'Which **database**?', options: ['Postgres', { label: 'SQLite', recommended: true }] },
    done('User selected: SQLite'));
  assert.equal(question.outcome, 'answered');
  const output = renderTool(testTool({ toolId: 'ask_followup_question', resultText: 'User selected: SQLite', question }));
  assert.match(output, /^### ❓ Agent asked · Which \*\*database\*\*\?$/mu);
  assert.match(output, /Unrecognized question tool `ask_followup_question`/u);
  assert.match(output, /^- Postgres$/mu);
  assert.match(output, /^- ✅ \*\*SQLite\*\* ⭐ \*\(recommended\)\* ← chosen$/mu);
  assert.doesNotMatch(output, /Typed answer allowed/u);
  assert.match(output, /<code[^>]*>ask_followup_question<\/code>/u);
  assert.deepEqual(question.raw.answer, 'User selected: SQLite');
  assert.match(output, /\*\*✅ You answered:\*\* SQLite/u);
  assert.doesNotMatch(output, /couldn't fully read/u);
});

test('a guessed MCP question keeps its full tool name and claims typed answers only when the tool allows them', () => {
  const question = parseGuessedQuestion('mcp_survey_tool', { message: 'Pick', choices: ['A', 'B'], allowFreeformInput: true }, done('A'));
  const output = renderTool(testTool({ toolId: 'mcp_survey_tool', question }));
  assert.match(output, /<code[^>]*>mcp_survey_tool<\/code>/u);
  assert.match(output, /Typed answer allowed/u);
});

test('question warning details name the turn, title, what was read and the argument names', () => {
  const guessed = parseGuessedQuestion('ask_followup_question', { question: 'Which DB?', options: ['A', 'B'] }, done('A'));
  const turns = [testTurn({ body: [] }), testTurn({ body: [testTool({ question: guessed })] })];
  const details = questionWarningDetails(turns);
  assert.deepEqual(details, [{ key: 'guessed:ask_followup_question', turn: 2, title: 'Which DB?', summary: '1 field(s), 2 option(s), answered', argumentKeys: ['question', 'options'] }]);
  assert.deepEqual(questionWarningLines(details), ['guessed:ask_followup_question · turn 2 · "Which DB?" · 1 field(s), 2 option(s), answered. Arguments: question, options']);
});

test('a guessed question with several fields keeps the whole answer as text', () => {
  const question = parseGuessedQuestion('ask_questions', { questions: [{ header: 'Scope', options: ['A', 'B'] }, { header: 'Notes' }] }, done('Scope: A\nNotes: none'));
  assert.equal(question.fields.length, 2);
  const output = renderTool(testTool({ toolId: 'ask_questions', question }));
  assert.match(output, /^### ❓ Agent asked · 2 questions: Scope, Notes$/mu);
  assert.match(output, /\*\*✅ You answered:\*\*\n\nScope: A\nNotes: none/u);
});

test('the question census counts guessed tools and known formats that no longer parse', () => {
  const guessed = parseGuessedQuestion('ask_followup_question', { question: 'Go?' }, done('yes'));
  const broken = parseAskUser({ question: 'Run it?', choices: ['Yes'] }, done('Something new: 42'));
  const turns = [testTurn({ body: [testTool({ question: guessed }), testTool({ question: broken }), testTool({})] })];
  assert.deepEqual(questionCensus(turns), [['guessed:ask_followup_question', 1], ['ask_user:parse-warning', 1]]);
});
