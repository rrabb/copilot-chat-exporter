import assert from 'node:assert/strict';
import test from 'node:test';
import type { Census } from '../src/types.ts';
import type { SdkEvent } from '../src/session/sdk-events.ts';
import { buildSdkSession } from '../src/session/sdk-session.ts';
import {
  localDiagnosticSchemaRecords,
  questionDiagnosticSchemaRecords,
  sdkDiagnosticSchemaRecords,
} from '../src/verify/diagnostic-source.ts';

function census (unhandled: Array<[string, number]> = [], unrecognizedToolData: Array<[string, number]> = []): Census {
  return {
    seen: new Map(),
    dropped: new Map(),
    toolData: new Map(),
    unhandled,
    unrecognizedToolData,
    questionWarnings: [],
  };
}

function event (line: number, type: string, data: Record<string, unknown>): SdkEvent {
  return {
    line, type, data, raw: { type, data }, recordedLine: JSON.stringify({ type, data }), id: `event-${line}`,
  };
}

test('Local diagnostics select unhandled records and tool payload kinds with request locators', () => {
  const records = localDiagnosticSchemaRecords([
    {
      message: { text: 'question' },
      response: [
        { kind: 'future.response', payload: 'private-payload' },
        { kind: 'toolInvocationSerialized', toolId: 'future-tool',
          toolSpecificData: { kind: 'future.tool-data', nested: 'private-nested' } },
      ],
    },
  ], census([['future.response', 1]], [['future.tool-data', 1]]));
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.type), ['future.response', 'tool-data:future.tool-data']);
  assert.deepEqual(records.map((record) => record.locator), [
    'request 1 response 1',
    'request 1 response 2',
  ]);
});

test('SDK diagnostics recompute unsupported payload reasons and keep unknown event records', () => {
  const events = [
    event(1, 'future.event', { secret: 'private-future' }),
    event(2, 'instruction.update', {
      authority: 'user',
      lifetime: 'session',
      boundary: 'workspace',
      fallback: 'none',
      name: 'private instruction',
      content: 'private content',
      postInitial: 'not-a-boolean',
      surprise: true,
    }),
  ];
  const records = sdkDiagnosticSchemaRecords(events,
    census([['future.event', 1], ['instruction.update:unsupported', 1]]));
  assert.equal(records.length, 2);
  assert.equal(records[0]!.type, 'future.event');
  assert.deepEqual(records[0]!.issues, ['unreviewed SDK event type']);
  assert.equal(records[1]!.type, 'instruction.update');
  assert.ok(records[1]!.issues.some((issue) => issue.includes('postInitial')));
  assert.ok(records[1]!.issues.some((issue) => issue.includes('surprise')));
  assert.deepEqual(records.map((record) => record.locator), ['line 1', 'line 2']);
});

test('question diagnostics keep guessed tool structure for offline fixture work', () => {
  const events = [
    event(1, 'user.message', { content: 'Private user prompt', messageId: 'm1' }),
    event(2, 'assistant.message', {
      content: 'Private assistant text',
      toolRequests: [{
        toolCallId: 'private-question-id',
        name: 'mcp_ask_question',
        arguments: { title: 'Private title', message: 'Private question', options: ['One', 'Two'] },
      }],
    }),
  ];
  const { session } = buildSdkSession(events, events, { title: 'Question', assetsDirectory: 'assets' });
  const records = questionDiagnosticSchemaRecords(session, 'sdk');
  assert.equal(records.length, 1);
  assert.equal(records[0]!.type, 'question:guessed:mcp_ask_question');
  assert.equal(records[0]!.locator, 'turn 1 question');
  assert.match(records[0]!.issues[0]!, /guessed/u);
});
