import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLocalJournalRecords } from '../src/session/journal-validation.ts';

const ID = '11111111-1111-4111-8111-111111111111';
const snapshot = JSON.stringify({ kind: 0, v: { version: 3, sessionId: ID, requests: [] } });
const rawWith = (operation: unknown) => `${snapshot}\n${JSON.stringify(operation)}\n`;

test('all verified operation kinds and numeric splice positions remain accepted', () => {
  for (const operation of [
    { kind: 1, k: ['customTitle'], v: 'Rename' },
    { kind: 2, k: ['requests'], i: 0, v: [] },
    { kind: 2, k: ['requests'], v: { 0: { message: { text: 'Question' } } } },
    { kind: 3, k: ['requests', 0, 'response'] },
  ])
    assert.doesNotThrow(() => validateLocalJournalRecords(rawWith(operation), ID));
});

test('invalid instructions and identity mutations surface instead of silently replaying', () => {
  for (const operation of [
    { kind: 999, k: ['requests'], v: [] },
    { kind: 1, k: [], v: {} },
    { kind: 1, k: ['requests', -1], v: {} },
    { kind: 1, k: ['requests', '__proto__'], v: {} },
    { kind: 2, k: ['requests'], i: -1 },
    { kind: 2, k: ['requests'], i: 1.5 },
    { kind: 1, k: ['version'], v: 999 },
    { kind: 1, k: ['sessionId'], v: 'different' },
    { kind: 3, k: ['requests'] },
    { kind: 1, k: ['requests'], v: null },
  ])
    assert.throws(() => validateLocalJournalRecords(rawWith(operation), ID));
  assert.throws(() => validateLocalJournalRecords('{"kind":1,"k":["customTitle"]}', ID), /precedes/);
  assert.throws(() => validateLocalJournalRecords(`${snapshot}\nnot-json`, ID), /line 2/);
  assert.throws(() => validateLocalJournalRecords('', ID), /no version 3/);
});
