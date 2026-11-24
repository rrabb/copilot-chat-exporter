import assert from 'node:assert/strict';
import test from 'node:test';
import type { SdkEvent } from '../src/session/sdk-events.ts';
import {
  buildDiagnosticEvidenceModel,
  collectContentDiagnosticEvidence,
  collectSchemaDiagnosticEvidence,
  redactDiagnosticValue,
  sdkSchemaDiagnosticRecords,
} from '../src/verify/diagnostic-evidence.ts';
import { buildLossAccount } from '../src/verify/loss-account.ts';
import { scoreLossPieces } from '../src/verify/loss-account.ts';
import type { DiagnosticRedactedValue, SchemaDiagnosticRecord } from '../src/verify/diagnostic-evidence.ts';

const fingerprintKey = 'synthetic-diagnostic-key';

function event (line: number, type: string, data: Record<string, unknown>): SdkEvent {
  return {
    line, type, data, raw: { type, id: `private-event-${line}`, data }, id: `private-event-${line}`,
    recordedLine: JSON.stringify({ type, data }),
  };
}

function sdkRecord (line: number, value: unknown, kind = 'future.event'): SchemaDiagnosticRecord {
  return {
    provider: 'sdk', type: kind, line, issues: ['unsupported field data.private.payload'], value,
  };
}

function valuesForKey (value: DiagnosticRedactedValue, key: string): DiagnosticRedactedValue[] {
  if (value.type === 'array')
    return value.items.flatMap((item) => valuesForKey(item.value, key));
  if (value.type !== 'object')
    return [];
  return value.entries.flatMap((entry) => [
    ...(entry.key === key ? [entry.value] : []),
    ...valuesForKey(entry.value, key),
  ]);
}

test('structural redaction keeps field names and safe discriminators without private values', () => {
  const result = redactDiagnosticValue({
    type: 'future.event',
    id: 'private-event-id',
    data: {
      success: false,
      toolName: 'view',
      error: { code: 'UNSUPPORTED', message: 'private error body' },
      name: 'private-display-name',
      path: 'C:\\private\\file.ts',
      token: 'secret-value',
      count: 42,
      list: ['private-one', 'private-two', 'private-three', 'private-four'],
      answers: { 'user@example.com': 'private answer' },
    },
  }, { fingerprintKey });
  const text = JSON.stringify(result);
  assert.match(text, /future\.event/u);
  assert.match(text, /"key":"data"/u);
  assert.match(text, /"key":"success"/u);
  assert.match(text, /"key":"code"/u);
  assert.match(text, /"key":"token"/u);
  assert.match(text, /UNSUPPORTED/u);
  assert.match(text, /"key":"name"/u);
  assert.doesNotMatch(text, /private-event-id|private error body|private-display-name|private answer|user@example\.com|C:\\\\private|secret-value/u);
  assert.doesNotMatch(text, /private-one|private-two|private-three|private-four/u);
  assert.match(text, /"value":false/u);
  assert.match(text, /"class":"identifier"/u);
  assert.match(text, /"class":"path"/u);
  assert.match(text, /"class":"credential"/u);
  assert.match(text, /"type":"number"/u);
  assert.match(text, /"length":4/u);
  assert.match(text, /"omitted":1/u);
  assert.doesNotMatch(text, /"value":42/u);
});

test('schema signatures ignore private values but separate field types and safe discriminators', () => {
  const records = [
    sdkRecord(1, { type: 'future.event', data: { mode: 'private-a', payload: 'secret-a' } }),
    sdkRecord(2, { type: 'future.event', data: { mode: 'private-b', payload: 'secret-b' } }),
    sdkRecord(3, { type: 'future.event', data: { mode: 'private-c', payload: 7 } }),
    sdkRecord(4, { type: 'future.event', data: { mode: 'safe-mode', payload: 'secret-d', success: false } }),
    sdkRecord(5, { type: 'future.event', data: { mode: 'safe-mode', payload: 'secret-e', success: true } }),
  ];
  const report = collectSchemaDiagnosticEvidence(records, {
    fingerprintKey, maxSamplesPerSignature: 3,
    safePaths: ['type', 'data.success'],
  });
  assert.equal(report.groups.length, 4);
  const first = report.groups.find((group) => group.lines.includes(1));
  const second = report.groups.find((group) => group.lines.includes(2));
  assert.equal(first?.signature, second?.signature);
  const successFalse = report.groups.find((group) => group.lines.includes(4));
  const successTrue = report.groups.find((group) => group.lines.includes(5));
  assert.notEqual(successFalse?.signature, successTrue?.signature);
});

test('schema groups keep every line and bounded first, middle and last samples', () => {
  const records = Array.from({ length: 6 }, (_, index) => sdkRecord(index + 1, {
    type: 'future.event',
    data: { payload: `private-${index}` },
  }));
  const report = collectSchemaDiagnosticEvidence(records, { fingerprintKey, maxSamplesPerSignature: 3 });
  assert.equal(report.groups.length, 1);
  const group = report.groups[0]!;
  assert.deepEqual(group.lines, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(group.samples.map((sample) => sample.line), [1, 3, 6]);
  assert.equal(group.count, 6);
  assert.equal(group.omitted, 3);
  assert.ok(group.fields.some((field) => field.path === 'data.payload' && field.types.includes('string')));
  assert.doesNotMatch(JSON.stringify(report), /private-/u);
});

test('SDK schema records include redacted request, start and completion evidence for one tool identity', () => {
  const events = [
    event(1, 'user.message', { content: 'private prompt' }),
    event(2, 'assistant.message', {
      content: 'private answer',
      toolRequests: [{
        toolCallId: 'private-tool-id', name: 'powershell',
        arguments: { command: 'private-command', path: 'C:\\private\\source.ts' },
      }],
    }),
    event(3, 'tool.execution_start', {
      toolCallId: 'private-tool-id', toolName: 'powershell',
      arguments: { command: 'private-command' },
    }),
    event(4, 'tool.execution_complete', {
      toolCallId: 'private-tool-id', success: false,
      shellExecution: { exitCode: 7, privateField: 'new-value' },
      result: { content: 'private result' },
      error: { code: 'EXIT', message: 'private error' },
    }),
  ];
  const records = sdkSchemaDiagnosticRecords(events, [{
    event: events[3]!,
    issues: ['shellExecution.privateField: unknown field'],
  }]);
  const report = collectSchemaDiagnosticEvidence(records, { fingerprintKey, maxSamplesPerSignature: 1 });
  const sample = report.groups[0]!.samples[0]!;
  assert.equal(sample.line, 4);
  assert.deepEqual(sample.linkedRecords.map((link) => link.role), ['tool-request', 'tool-start']);
  const samples = [sample.value, ...sample.linkedRecords.map((link) => link.value)];
  const identifiers = samples.flatMap((value) => valuesForKey(value, 'toolCallId'))
    .filter((value): value is Extract<DiagnosticRedactedValue, { type: 'string' }> =>
      value.type === 'string' && value.class === 'identifier');
  assert.ok(identifiers.length >= 3);
  assert.equal(new Set(identifiers.map((value) => value.fingerprint)).size, 1);
  const text = JSON.stringify(report);
  assert.match(text, /powershell/u);
  assert.match(text, /EXIT/u);
  assert.doesNotMatch(text, /private-tool-id|private prompt|private answer|private-command|private result|private error|C:\\\\private/u);
});

test('content diagnostics capture exact failed fidelity text only when requested', () => {
  const raw = [{
    requestId: 'request-one',
    message: { text: 'Private prompt text.' },
    response: [{ value: 'Exact failed source text that is not in the archive.' }],
  }];
  const ordinary = buildLossAccount(raw, 'Unrelated output.');
  assert.ok(ordinary.unaccounted.every((item) => item.evidence === undefined));
  const captured = buildLossAccount(raw, 'Unrelated output.', { captureFailedText: true });
  const report = collectContentDiagnosticEvidence(captured.unaccounted);
  assert.equal(report.records, 2);
  assert.equal(report.groups.length, 2);
  const response = report.groups.find((group) => group.category === 'assistant-text');
  assert.equal(response?.sample.evidence.recordedText, 'Exact failed source text that is not in the archive.');
  assert.equal(response?.sample.evidence.comparedText, 'Exact failed source text that is not in the archive.');
  assert.equal(response?.sample.evidence.matchedText, null);
  assert.match(response?.sample.evidence.textHash ?? '', /^[\da-f]{64}$/u);
});

test('content diagnostics keep the exact rendered fragment for partial matches', () => {
  const source = Array.from({ length: 30 }, (_, index) => `source line ${index}`).join('\n');
  const raw = [{
    requestId: 'partial',
    message: { text: 'Private prompt text.' },
    response: [{ kind: 'toolInvocationSerialized', toolId: 'terminal',
      toolSpecificData: { kind: 'terminal', terminalCommandOutput: { text: source } } }],
  }];
  const captured = buildLossAccount(raw, `Private prompt text.\nsource line 0\nsource line 1`, { captureFailedText: true });
  const terminal = captured.unaccounted.find((item) => item.category === 'terminal-output');
  assert.equal(terminal?.status, 'partial');
  assert.equal(terminal?.evidence?.recordedText, source);
  assert.equal(terminal?.evidence?.matchedText, 'source line 0\nsource line 1');
  assert.ok(terminal?.evidence?.comparedText.includes('source line 29'));
});

test('diagnostic findings group repeated locators under one stable signature', () => {
  const schema = collectSchemaDiagnosticEvidence([], { fingerprintKey });
  const content = collectContentDiagnosticEvidence([]);
  const common = {
    provider: 'sdk' as const,
    severity: 'warning' as const,
    stage: 'normalize',
    category: 'schema',
    check: 'unsupported-payload',
    message: 'Known event type has an unsupported field.',
    schemaSignatures: ['schema-one'],
  };
  const model = buildDiagnosticEvidenceModel([
    { ...common, locators: ['line 12'] },
    { ...common, locators: ['line 18'] },
    { ...common, stage: 'verify', locators: ['line 18'] },
  ], schema, content);
  assert.equal(model.version, 1);
  assert.equal(model.findings.length, 2);
  const repeated = model.findings.find((finding) => finding.stage === 'normalize');
  assert.equal(repeated?.count, 2);
  assert.deepEqual(repeated?.locators, ['line 12', 'line 18']);
  assert.match(repeated?.signature ?? '', /^[\da-f]{64}$/u);
});

test('diagnostic Layer D evidence identifies order and repeated-occurrence failures', () => {
  const account = scoreLossPieces([
    { request: 1, category: 'assistant-text', text: 'First source message.', orderGroup: 'main' },
    { request: 2, category: 'assistant-text', text: 'Second source message.', orderGroup: 'main' },
    { request: 3, category: 'assistant-text', text: 'Repeated source message.', checkMultiplicity: true },
    { request: 4, category: 'assistant-text', text: 'Repeated source message.', checkMultiplicity: true },
  ], 'Second source message. First source message. Repeated source message.', undefined, {
    captureFailedText: true,
  });
  assert.equal(account.sequenceEvidence?.order.length, 1);
  assert.equal(account.sequenceEvidence?.order[0]?.request, 2);
  assert.equal(account.sequenceEvidence?.multiplicity.length, 1);
  assert.equal(account.sequenceEvidence?.multiplicity[0]?.expected, 2);
  assert.equal(account.sequenceEvidence?.multiplicity[0]?.found, 1);
  const ordinary = scoreLossPieces([
    { request: 1, category: 'assistant-text', text: 'First source message.', orderGroup: 'main' },
    { request: 2, category: 'assistant-text', text: 'Second source message.', orderGroup: 'main' },
  ], 'Second source message. First source message.');
  assert.equal(ordinary.sequenceEvidence, undefined);
});
