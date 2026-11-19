import assert from 'node:assert/strict';
import test from 'node:test';
import { inventorySdkSchema } from '../scripts/sdk-schema-inventory.ts';

const bytes = (events: unknown[]) => new TextEncoder().encode(events.map((event) => JSON.stringify(event)).join('\n'));

test('SDK schema inventory keeps paths, types, counts and lines without values or bodies', () => {
  const report = inventorySdkSchema(bytes([
    { type: 'invented.event', data: { nested: { value: 'private-body' }, list: [1, 2], optional: true }, id: 'event-1' },
    { type: 'invented.event', data: { nested: { value: 'other-private-body' }, list: [] }, id: 'event-2' },
    { type: 'other.event', data: { ignored: 'private-other-body' } },
  ]), new Set(['invented.event']));

  assert.equal(report.valuesIncluded, false);
  assert.equal(report.bodyIncluded, false);
  assert.equal(report.eventTypes.length, 1);
  assert.deepEqual(report.eventTypes[0], {
    type: 'invented.event',
    events: 2,
    lines: [1, 2],
    fields: [
      { path: 'data', present: 2, missing: 0, occurrences: 2, types: { object: 2 } },
      { path: 'data.list', present: 2, missing: 0, occurrences: 2, types: { array: 2 } },
      { path: 'data.list[]', present: 1, missing: 1, occurrences: 2, types: { number: 2 } },
      { path: 'data.nested', present: 2, missing: 0, occurrences: 2, types: { object: 2 } },
      { path: 'data.nested.value', present: 2, missing: 0, occurrences: 2, types: { string: 2 } },
      { path: 'data.optional', present: 1, missing: 1, occurrences: 1, types: { boolean: 1 } },
    ],
  });
  assert.doesNotMatch(JSON.stringify(report), /private-body|private-other-body|event-1|event-2/u);
});

test('SDK schema inventory rejects malformed JSON and non-object payloads', () => {
  assert.throws(() => inventorySdkSchema(new TextEncoder().encode('not json')), /line 1 is not valid JSON/u);
  assert.throws(() => inventorySdkSchema(bytes([[]])), /line 1 is not an object/u);
  assert.throws(() => inventorySdkSchema(bytes([{ type: 4, data: {} }])), /line 1 has no string type/u);
  assert.throws(() => inventorySdkSchema(bytes([{ type: 'bad.event', data: 'payload' }])), /line 1 has no object data payload/u);
});
