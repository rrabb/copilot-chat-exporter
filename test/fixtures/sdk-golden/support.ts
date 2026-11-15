import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSdkExport } from '../../../src/session/sdk-export.ts';
import type { SdkExport } from '../../../src/session/sdk-export.ts';
import { buildSdkLossAccount } from '../../../src/verify/sdk-loss-account.ts';
import { redactText } from '../../../src/redaction.ts';
import { BYTE_ONLY_TEXT, coreEvents, DELEGATED_PROMPT, edgeEvents, edgeLedger, exceptionEvents, LINE_ONLY_TEXT, REPEATED_TEXT, SPILLED_TEXT } from './inputs.ts';

export const CASES = ['core', 'exception', 'edges', 'selected-child', 'ledger'] as const;
export type GoldenCase = typeof CASES[number];
export const DIRECTORY = fileURLToPath(new URL('.', import.meta.url));

/** Fix the rendering timezone, not output text. Source imports already use deterministic "source (not built)" provenance. */
export function renderCase (name: GoldenCase): SdkExport {
  const events = name === 'core' ? coreEvents() : name === 'exception' ? exceptionEvents() : edgeEvents();
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    return renderSdkExport(events, {
      kind: 'sdk-events', provider: 'agent-host', sessionId: '11111111-2222-4333-8444-555555555555',
      path: 'invented-events.jsonl', schemaVersion: 1, producer: 'synthetic',
      scope: name === 'selected-child'
        ? { kind: 'subagent', agentId: 'detached-golden-child', parentToolCallId: 'absent-parent-call', evidenceRecordIds: [] }
        : { kind: 'main' },
      chatIdentity: 'invented-golden', provenance: { userDataRoot: 'invented', workspaceStoragePath: 'invented' },
      identityEvidence: [], identityWarnings: [], scopeWarnings: [], sha256: 'invented',
    }, { title: `SDK synthetic ${name}`, assetsDirectory: 'archive_assets_fixture', outputPath: 'archive.md',
      generatedAt: '2026-11-14T12:00:00.000Z', ...(name === 'ledger' ? { ledger: edgeLedger() } : {}) });
  } finally {
    if (previous === undefined)
      delete process.env.TZ;
    else
      process.env.TZ = previous;
  }
}

function notes (out: SdkExport) {
  return [...(out.session.prePromptNotes ?? []), ...out.session.turns.flatMap(turn => turn.body.filter(node => node.type === 'note'))];
}

const CATALOG_GROUPS = [
  [
    'Identity and provider:', 'Catalog model ID: golden-catalog-model', 'Catalog model name: Invented catalog',
    'Catalog object: invented-object', 'Catalog vendor: invented-vendor', 'Catalog model version: invented-catalog-version',
    'Catalog provider ID: invented-provider', 'Catalog provider ordering: 7', 'Provider:',
    'ID: invented-provider-id', 'Kind: invented-provider-kind', 'Label: Invented provider label',
  ],
  [
    'Availability and endpoints:', 'Chat default: false', 'Chat fallback: true',
    'Model picker category: invented-category', 'Model picker enabled: true', 'Model picker price category: invented-price-category',
    'Preview: false', 'Supported endpoints:', '- invented-endpoint-one', '- invented-endpoint-two',
  ],
  [
    'Capabilities:', 'Family: invented-family', 'Object: invented-capability', 'Tokenizer: invented-tokenizer', 'Type: invented-type',
    'Limits:', 'Max context window tokens: 64000', 'Max output tokens: 3000', 'Max prompt tokens: 60000',
    'Vision:', 'Max prompt image size: 2000', 'Max prompt images: 3', 'Supported media types:', '- image/invented', '- image/future',
    'Supports:', 'Parallel tool calls: true', 'Streaming: true', 'Structured outputs: false', 'Tool calls: true', 'Vision: false',
    'Reasoning effort:', '- invented-effort', '- future-effort', 'Adaptive thinking: invented-adaptive',
  ],
  [
    'Configured billing (not charges):', 'Auto discount: 0.25', 'Restricted to:', '- invented-plan', '- future-plan',
    'Token prices (configuration, currency not inferred):', 'Batch size: 10000', 'Default:',
    'Cache read price: 2', 'Cache write price: 3', 'Input price: 900000000', 'Max prompt tokens: 16000', 'Output price: 5',
    'Long context:', 'Cache read price: 6', 'Cache write price: 7', 'Input price: 8', 'Max prompt tokens: 32000', 'Output price: 9',
  ],
];

/** Literal semantic expectations are independent of production labels, field tables and financial helpers. */
export function assertSemantics (name: GoldenCase, out: SdkExport): void {
  const ownNotes = notes(out);
  assert.equal(buildSdkLossAccount(out.events, out.markdown, out.companions).failed, false, name);
  assert.doesNotMatch(out.markdown, /Q0:|session events without a preceding user prompt/u);
  if (name === 'core') {
    assert.equal(out.session.turns.length, 5);
    assert.deepEqual(out.session.census.unhandled, []);
    assert.equal(out.session.usage, undefined);
    const phases = ownNotes.filter(note => note.title.includes('Fusion phase:'));
    assert.equal(phases.length, 11);
    assert.deepEqual(phases.map(note => note.text?.split('\n\n').find(line => line.startsWith('Model:'))), [
      'Model: invented-primary-model', 'Model: invented-review-model',
      'Model: invented-primary-model', 'Model: invented-review-model', 'Model: invented-primary-model',
      'Model: invented-primary-model', 'Model: invented-primary-model', 'Model: invented-review-model',
      'Model: invented-primary-model', 'Model: invented-review-model', 'Model: invented-repair-model',
    ]);
    assert.equal(phases.filter(note => note.title.endsWith('critic')).length, 2);
    assert.equal(ownNotes.filter(note => note.title.includes('Fusion handoff')).length, 2);
    const finals = ownNotes.filter(note => note.title.includes('Fusion completed')).map(note =>
      note.text?.split('\n\n').find(line => line.startsWith('Final source phase:')));
    assert.deepEqual(finals, [
      'Final source phase: core-draft:draft', 'Final source phase: core-revision:revision',
      'Final source phase: core-single:primary', 'Final source phase: core-accept:primary', 'Final source phase: core-reject:repair',
    ]);
    assert.ok(phases[7]?.text?.includes('Verdict: accept'));
    assert.ok(phases[9]?.text?.includes('Verdict: reject'));
    assert.equal(new Set(ownNotes.filter(note => note.title.includes('Fusion resolved')).map(note =>
      note.text?.split('\n\n').find(line => line.startsWith('Policy version:')))).size, 1);
    const resolutions = ownNotes.filter(note => note.title.includes('Fusion resolved'));
    assert.deepEqual(resolutions.map(note => note.text?.split('\n\n').find(line => line.startsWith('Rule ID:'))), [
      'Rule ID: core-draft:rule', 'Rule ID: core-revision:rule', 'Rule ID: core-single:rule',
      'Rule ID: core-accept:rule', 'Rule ID: core-reject:rule',
    ]);
    assert.deepEqual(resolutions.map(note => note.text?.includes('Judge model:')), [false, false, false, true, true]);
    assert.deepEqual(resolutions.map(note => note.text?.split('\n\n').find(line => line.startsWith('Secondary model:'))), [
      'Secondary model: invented-review-model', 'Secondary model: invented-review-model', 'Secondary model: null',
      'Secondary model: invented-review-model', 'Secondary model: invented-review-model',
    ]);
  } else if (name === 'exception') {
    assert.equal(out.session.turns.length, 1);
    assert.equal(out.session.turns[0]?.number, 1);
    assert.equal(out.session.prePromptNotes?.length, 4);
    assert.equal(out.session.usage, undefined);
    assert.deepEqual(out.session.census.unhandled, []);
    const retries = ownNotes.filter(note => note.title === 'Model turn retry');
    assert.equal(retries.length, 2);
    const expectedRetry = [
      'Kind: invented-retry', 'Requested model: invented-requested-model', 'Reason: Repeated synthetic retry reason.',
      'Local model-loop turn index: 0', 'Recorded timestamp (ms): 4242',
      `Model catalog:\n${CATALOG_GROUPS.map(group => group.join('\n')).join('\n\n')}`,
    ].join('\n\n');
    assert.deepEqual(retries.map(note => note.text), [expectedRetry, expectedRetry]);
    assert.match(out.markdown, /Copilot version:\*\* `invented-exception-build`/u);
    assert.doesNotMatch(out.markdown, /Copilot version:\*\* `invented-catalog-version`/u);
    const failure = ownNotes.find(note => note.title.includes('Fusion phase failed'));
    assert.ok(failure && typeof failure.text === 'string');
    assert.ok(failure.text.includes('Degraded to phase: exception-cascade:repair'));
    assert.ok(failure.text.includes('Phase usage: Summary metadata (not billed calls)'));
    const handoff = ownNotes.find(note => note.title.includes('Fusion handoff'));
    assert.ok(handoff && typeof handoff.text === 'string');
    assert.ok(handoff.text.includes('From phase: exception-cascade:judge'));
    assert.ok(handoff.text.includes('To phase: exception-cascade:repair'));
    const complete = ownNotes.find(note => note.title.includes('Fusion completed'));
    assert.ok(complete && typeof complete.text === 'string');
    assert.ok(complete.text.includes('Outcome: degraded'));
    assert.ok(complete.text.includes('Degraded reason: judge_call_failed'));
    assert.ok(complete.text.includes('Final source phase: exception-cascade:repair'));
  } else if (name === 'selected-child') {
    assert.equal(out.session.turns.length, 1);
    assert.equal(out.session.prePromptNotes?.length, 1);
    assert.equal(out.session.usage?.source, 'usage-record');
    assert.equal(out.session.usage?.recorded.nanoAiu, 99000000);
    assert.equal(out.session.usage?.recorded.calls, 1);
    assert.doesNotMatch(out.markdown, /Recorded root prefix only|Linked child response only|invented-routing-rule/u);
    assert.equal(out.companions.length, 0);
  } else {
    assert.equal(out.session.turns.length, 1);
    assert.equal(out.session.prePromptNotes?.length, 1);
    assert.equal(out.session.detachedSubagents?.length, 1);
    const child = out.session.turns[0]?.toolNodes[0]?.subagent;
    assert.ok(child);
    assert.deepEqual(child.turns.map(turn => turn.prompt), [DELEGATED_PROMPT, 'Recorded invented child follow-up.']);
    assert.match(out.markdown, /Recorded child conversations - parent call missing/u);
    assert.equal(out.session.usage?.selection?.duplicateReceipts, 1);
    assert.equal(out.session.usage?.selection?.conflictingReceipts, 1);
    assert.deepEqual(out.session.usage?.selection?.available, { ledger: name === 'ledger' ? 2 : 0, receipts: 6, legacy: 1 });
    if (name === 'ledger') {
      assert.equal(out.session.usage?.source, 'session-store');
      assert.equal(out.session.usage?.recorded.calls, 1);
      assert.equal(out.session.usage?.recorded.nanoAiu, 200000000);
      assert.equal(out.session.usage?.unattributed.nanoAiu, 300000000);
    } else {
      assert.equal(out.session.usage?.source, 'usage-record');
      assert.equal(out.session.usage?.recorded.calls, 3);
      assert.equal(out.session.usage?.recorded.nanoAiu, 209000000);
      assert.equal(out.session.usage?.recorded.inputTokens, null);
      assert.equal(out.session.usage?.unattributed.calls, 3);
      assert.equal(out.session.usage?.unattributed.nanoAiu, null);
    }
    const white = ownNotes.find(note => note.text?.includes('Phase ID: edge-white:primary'));
    assert.ok(white && typeof white.text === 'string');
    assert.ok(white.text.includes('Phase output: \nWhitespace golden evidence.'));
    assert.ok(white.text.includes('Projection: \n Whitespace golden evidence.'));
    assert.equal(out.companions.length, 1);
    const bodies = out.companions.map(item => Buffer.from(item.bytes).toString('utf8')).join('\n');
    assert.ok(bodies.includes(redactText(SPILLED_TEXT).text));
    assert.doesNotMatch(out.markdown + bodies, /synthetic-golden-secret/u);
    assert.ok(!bodies.includes(LINE_ONLY_TEXT) && !bodies.includes(BYTE_ONLY_TEXT));
    assert.equal(LINE_ONLY_TEXT.split('\n').length, 302);
    assert.ok(Buffer.byteLength(LINE_ONLY_TEXT) < 15 * 1024);
    assert.equal(BYTE_ONLY_TEXT.split('\n').length, 1);
    assert.ok(Buffer.byteLength(BYTE_ONLY_TEXT) > 15 * 1024);
    assert.ok(SPILLED_TEXT.split('\n').length > 300 && Buffer.byteLength(SPILLED_TEXT) > 15 * 1024);
    for (const [phaseId, body, manyLines, manyBytes] of [
      ['edge-lines:primary', LINE_ONLY_TEXT, true, false],
      ['edge-bytes:primary', BYTE_ONLY_TEXT, false, true],
      ['edge-spill:primary', SPILLED_TEXT, true, true],
    ] as const) {
      const note = ownNotes.find(item => item.text?.includes(`Phase ID: ${phaseId}`));
      assert.ok(note && typeof note.text === 'string', `threshold note ${phaseId}`);
      assert.equal(note.text.split('\n').length > 300, manyLines, `complete note line predicate ${phaseId}`);
      assert.equal(Buffer.byteLength(note.text) > 15 * 1024, manyBytes, `complete note byte predicate ${phaseId}`);
      const renderedText = redactText(note.text).text;
      assert.equal(renderedText.split('\n').length > 300, manyLines, `redacted note line predicate ${phaseId}`);
      assert.equal(Buffer.byteLength(renderedText) > 15 * 1024, manyBytes, `redacted note byte predicate ${phaseId}`);
      if (!(manyLines && manyBytes))
        assert.ok(out.markdown.includes(body), `full threshold body remains inline ${phaseId}`);
    }
    const rootRepeat = ownNotes.filter(note => note.text?.includes(REPEATED_TEXT));
    assert.equal(rootRepeat.length, 2);
    assert.ok(rootRepeat.every(note => !note.text?.includes('\n\nProjection:')));
  }
}

export function sha256 (bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function generationHash (files: ReadonlyMap<string, Buffer>): string {
  return sha256([...files].sort(([left], [right]) => left.localeCompare(right, 'en')).map(([key, bytes]) =>
    `${key}\0${sha256(bytes)}\n`).join(''));
}

export function filesFor (outputs: ReadonlyMap<GoldenCase, SdkExport>): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const [name, out] of outputs) {
    files.set(`${name}/archive.md`, Buffer.from(out.markdown));
    for (const item of out.companions) {
      const relative = item.relativePath.replaceAll('\\', '/');
      assert.ok(!relative.startsWith('/') && !relative.split('/').includes('..'));
      const key = `${name}/${relative}`;
      assert.ok(!files.has(key), `duplicate companion destination ${key}`);
      files.set(key, Buffer.from(item.bytes));
    }
  }
  return files;
}

export function readFiles (directory: string, prefix = ''): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const key = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) {
      for (const [nested, bytes] of readFiles(path.join(directory, item.name), key))
        files.set(nested, bytes);
    } else {
      assert.ok(item.isFile(), `fixture must not contain a symlink or special file: ${key}`);
      files.set(key, fs.readFileSync(path.join(directory, item.name)));
    }
  }
  return files;
}

export function assertFilesEqual (actual: ReadonlyMap<string, Buffer>, expected: ReadonlyMap<string, Buffer>): void {
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort(), 'exact archive/companion file set');
  for (const [key, bytes] of actual)
    assert.deepEqual(bytes, expected.get(key), `exact bytes: ${key}`);
}

export function readExpectedGeneration (): { directory: string; files: Map<string, Buffer> } {
  const file = path.join(DIRECTORY, 'active.json');
  assert.ok(fs.existsSync(file), 'SDK golden expectations have not been materialized for review; tests never write them.');
  const active: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(active && typeof active === 'object' && !Array.isArray(active), 'fixture manifest must be an object');
  assert.ok('generation' in active && typeof active.generation === 'string', 'fixture manifest generation must be a string');
  assert.ok('format' in active && active.format === 1, 'supported fixture manifest format');
  assert.match(active.generation, /^[a-f0-9]{64}$/u);
  assert.ok('files' in active && Array.isArray(active.files), 'fixture manifest files must be an array');
  const descriptors: readonly unknown[] = active.files;
  const listed = new Map<string, { bytes: number; sha256: string }>();
  for (const [index, descriptor] of descriptors.entries()) {
    assert.ok(descriptor && typeof descriptor === 'object' && !Array.isArray(descriptor),
      `manifest descriptor ${index} must be an object`);
    assert.ok('file' in descriptor && typeof descriptor.file === 'string' && descriptor.file.length > 0,
      `manifest descriptor ${index} must name a file`);
    assert.ok('bytes' in descriptor && typeof descriptor.bytes === 'number'
      && Number.isSafeInteger(descriptor.bytes) && descriptor.bytes >= 0,
      `manifest descriptor ${index} must have a non-negative safe integer byte size`);
    assert.ok('sha256' in descriptor && typeof descriptor.sha256 === 'string',
      `manifest descriptor ${index} must have a SHA-256 string`);
    assert.match(descriptor.sha256, /^[a-f0-9]{64}$/u, `manifest descriptor ${index} SHA-256 format`);
    assert.ok(!listed.has(descriptor.file), `duplicate manifest descriptor: ${descriptor.file}`);
    listed.set(descriptor.file, { bytes: descriptor.bytes, sha256: descriptor.sha256 });
  }
  const directory = path.join(DIRECTORY, 'expected', active.generation);
  assert.ok(fs.existsSync(directory), 'retained fixture generation must exist');
  const files = readFiles(directory);
  assert.equal(generationHash(files), active.generation, 'retained generation hash');
  assert.deepEqual([...listed.keys()].sort(), [...files.keys()].sort(), 'manifest archive/companion file set');
  for (const [key, descriptor] of listed) {
    const bytes = files.get(key);
    assert.ok(bytes, `manifest file must exist: ${key}`);
    assert.equal(bytes.length, descriptor.bytes, `manifest byte size: ${key}`);
    assert.equal(sha256(bytes), descriptor.sha256, `manifest SHA-256: ${key}`);
  }
  return { directory, files };
}

export function readExpected (): Map<string, Buffer> {
  return readExpectedGeneration().files;
}

export function renderAll (): Map<GoldenCase, SdkExport> {
  return new Map(CASES.map(name => {
    const out = renderCase(name);
    assertSemantics(name, out);
    return [name, out];
  }));
}
