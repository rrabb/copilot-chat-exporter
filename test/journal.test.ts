import assert from 'node:assert/strict';
import test from 'node:test';
import { GENERIC_RESPONSE_KINDS } from '../src/session/classify.ts';
import { parseChatSession } from '../src/session/journal.ts';

const request = (requestId: string, prompt: string, response: unknown[] = []) => ({
  requestId,
  timestamp: 1,
  message: { text: prompt, parts: [] },
  response,
});

const journal = (...records: unknown[]) => records.map((record) => JSON.stringify(record)).join('\n');

test('kind 2 with i replaces superseded requests before later indexed updates', () => {
  const raw = journal(
    { kind: 0, v: { version: 3, requests: [request('r1', 'first')] } },
    { kind: 2, k: ['requests'], v: [request('stale', 'superseded')] },
    { kind: 2, k: ['requests'], i: 1, v: [request('r2', 'second', [{ value: 'opening' }])] },
    { kind: 2, k: ['requests', 1, 'response'], v: [{ value: ' complete' }] },
  );

  const session = parseChatSession('session.jsonl', raw);

  assert.deepEqual(session.turns.map((turn) => turn.prompt), ['first', 'second']);
  assert.deepEqual(session.turns[1].body.map((node) => node.type === 'text' ? node.text : ''), ['opening', ' complete']);
  assert.equal(session.rawRequests.length, 2);
  assert.equal(session.rawRequests[1].requestId, 'r2');
});

test('kind 2 with i can truncate an existing response without appending values', () => {
  const raw = journal(
    { kind: 0, v: { version: 3, requests: [request('r1', 'question', [{ value: 'keep' }, { value: 'remove' }])] } },
    { kind: 2, k: ['requests', 0, 'response'], i: 1 },
  );

  const session = parseChatSession('session.jsonl', raw);

  assert.deepEqual(session.turns[0].body.map((node) => node.type === 'text' ? node.text : ''), ['keep']);
});

test('kind 3 deletes a request property', () => {
  const existing = { ...request('r1', 'question'), responseId: 'obsolete-response' };
  const raw = journal(
    { kind: 0, v: { version: 3, requests: [existing] } },
    { kind: 3, k: ['requests', 0, 'responseId'] },
  );

  const session = parseChatSession('session.jsonl', raw);

  assert.equal(session.turns[0].scalar.responseId, undefined);
  assert.equal('responseId' in session.rawRequests[0], false);
});

test('request-level error text reaches its parsed turn', () => {
  const raw = journal({
    kind: 0,
    v: { version: 3, requests: [{
      ...request('r1', 'question'),
      result: { errorDetails: { message: 'The service could not complete this request.' } },
    }] },
  });

  const session = parseChatSession('session.jsonl', raw);

  assert.equal(session.turns[0].requestError, 'The service could not complete this request.');
});

test('autoModeResolution is request metadata: it reaches the scalars, not the body, and is not drift', () => {
  const resolution = { kind: 'autoModeResolution', resolved: { id: 'gpt-x', name: 'GPT X' } };
  const raw = journal({ kind: 0, v: { version: 3, requests: [request('r1', 'question', [{ value: 'answer' }, resolution])] } });

  const session = parseChatSession('session.jsonl', raw);

  assert.deepEqual(session.turns[0].body.map((node) => node.type), ['text']);
  assert.deepEqual(session.turns[0].scalar.autoModelResolutions,
    [{ modelId: 'gpt-x', modelName: 'GPT X', confidence: null, predictedLabel: '' }]);
  assert.deepEqual(session.census.unhandled, []);
});

test('unknown response JSON stays in order and remains unreviewed, not dropped', () => {
  const unknown = { kind: 'futureResponse', nested: { text: 'raw text' } };
  const raw = journal({
    kind: 0,
    v: {
      version: 3,
      requests: [request('r1', 'question', [
        { value: 'before' },
        unknown,
        { value: 'after' },
      ])],
    },
  });

  const session = parseChatSession('session.jsonl', raw);

  assert.deepEqual(session.turns[0].body.map((node) => node.type), ['text', 'unknownResponse', 'text']);
  assert.equal(session.turns[0].body[1].type === 'unknownResponse' ? session.turns[0].body[1].payload : '', JSON.stringify(unknown, null, 2));
  assert.deepEqual(session.census.unhandled, [['futureResponse', 1]]);
  assert.equal(session.census.dropped.has('futureResponse'), false);
});

test('a malformed markdownVuln stays unreviewed for strict mode even though the kind is handled', () => {
  const raw = journal({
    kind: 0,
    v: { version: 3, requests: [request('r1', 'question', [
      { kind: 'markdownVuln', content: { value: 'ok' }, vulnerabilities: [{ title: 'x', description: 'y' }] },
      { kind: 'markdownVuln', content: { value: 'bad' }, vulnerabilities: 'not an array' },
    ])] },
  });

  const session = parseChatSession('session.jsonl', raw);

  assert.deepEqual(session.turns[0].body.map((node) => node.type), ['text', 'unknownResponse']);
  assert.deepEqual(session.census.unhandled, [['markdownVuln', 1]]);
});

test('a reviewed generic response keeps its payload without blocking strict census', () => {
  const kind = 'reviewedGenericResponse';
  const raw = journal({
    kind: 0,
    v: { version: 3, requests: [request('r1', 'question', [{ kind, detail: 'kept' }])] },
  });
  GENERIC_RESPONSE_KINDS.add(kind);
  try {
    const session = parseChatSession('session.jsonl', raw);

    assert.equal(session.turns[0].body[0].type, 'unknownResponse');
    assert.deepEqual(session.census.unhandled, []);
  } finally {
    GENERIC_RESPONSE_KINDS.delete(kind);
  }
});

test('compact confirmation remains on its recorded request', () => {
  const raw = journal(
    { kind: 0, v: { version: 3, requests: [request('r1', 'question'), request('r2', '/compact')] } },
    { kind: 2, k: ['requests', 0, 'response'], v: [{ value: 'answer' }] },
    { kind: 2, k: ['requests', 1, 'response'], v: [{ value: 'Compacted conversation.' }] },
  );

  const session = parseChatSession('session.jsonl', raw);

  assert.deepEqual(session.turns[0].body.map((node) => node.type === 'text' ? node.text : ''), ['answer']);
  assert.deepEqual(session.turns[1].body.map((node) => node.type === 'text' ? node.text : ''), ['Compacted conversation.']);
});