import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalVerifyJson, buildSdkVerifyJson } from '../src/verify/json-report.ts';
import type { LossAccount } from '../src/verify/loss-account.ts';
import type { Census } from '../src/types.ts';
import type { ParserCheckResult } from '../src/verify/parser-check.ts';
import { verifyLocalImages } from '../src/verify/images.ts';

const SECRET = 'PROMPT-SECRET-TEXT';
const TOOL_ID = 'toolu_SECRET_ID';

function census (unhandled: Array<[string, number]> = []): Census {
  return { seen: new Map([['markdownContent', 3]]), dropped: new Map(), toolData: new Map(), unhandled, unrecognizedToolData: [] };
}

function loss (failed = false): LossAccount {
  return {
    checked: 5,
    totals: { prompt: { present: 2, partial: 0, absent: 1 }, 'assistant-text': { present: 1, partial: 1, absent: 0 } },
    unaccounted: [
      { request: 1, category: 'prompt', status: 'absent', chars: 30, sample: SECRET },
      { request: 2, category: 'assistant-text', status: 'partial', chars: 50, sample: SECRET, lines: { found: 1, total: 2 } },
    ],
    order: { checked: 4, outOfOrder: 0 },
    multiplicity: { checked: 1, missing: 0 },
    failed,
  };
}

function parser (failed = false): ParserCheckResult {
  return {
    skipped: null,
    checks: [{ name: 'turn anchors outside code', ok: !failed, detail: 'anchors=1, turns=2' }],
    failed,
    counts: { turnAnchors: 1, requestHeadings: 2, assistantHeadings: 2, sectionHeadings: 0, unknownBlocks: 0, linkedUnknownBlocks: 0 },
    ms: 3,
  };
}

function local (strict: boolean, overrides: { loss?: LossAccount; census?: Census; early?: number; parserFailed?: boolean } = {}) {
  return buildLocalVerifyJson({
    strict,
    report: {
      rawRequestCount: 2, parsedTurnCount: 2, missingTurns: 0, extraTurns: 0,
      crossTurnDuplicates: [{ toolCallId: TOOL_ID }],
      mismatches: [{ kind: 'prompt', detail: SECRET } as { kind: string }],
    },
    census: overrides.census ?? census(),
    crossCheck: { rawToolIds: 3, parsedToolIds: 2, rawThinking: 1, dropped: [TOOL_ID], invented: [], failed: true },
    render: { checks: [{ name: 'fences balanced', ok: true, detail: SECRET } as { name: string; ok: boolean }], failed: false },
    renderSkipReason: null,
    fenceRepairs: { early: Array.from({ length: overrides.early ?? 0 }, (_, index) => ({ turn: index + 1, kind: 'markdownVuln' })), turnEnd: 1, html: [{ turn: 1, kind: 'comment' }] },
    loss: overrides.loss ?? loss(),
    lossTarget: 'file',
    parser: parser(overrides.parserFailed),
  });
}

test('local verify JSON carries counts and reasons but no recorded text or tool IDs', () => {
  const json = local(true, { loss: loss(true), census: census([['newKind', 2]]), early: 1 });
  const text = JSON.stringify(json);
  assert.ok(!text.includes(SECRET), 'prompt or sample text leaked');
  assert.ok(!text.includes(TOOL_ID), 'tool-call ID leaked');
  assert.equal(json.exitCode, 2);
  assert.deepEqual(json.failureReasons, ['layer-b-mismatch', 'layer-a-tool-ids', 'unhandled-kind', 'layer-d', 'early-fence-close']);
  assert.deepEqual(json.layerB.mismatchesByKind, { prompt: 1 });
  assert.equal(json.layerA.dropped, 1);
  assert.deepEqual(json.layerD.unaccounted, { prompt: { partial: 0, absent: 1 }, 'assistant-text': { partial: 1, absent: 0 } });
  assert.deepEqual(json.fenceRepairs.earlyByKind, { markdownVuln: 1 });
  assert.equal(json.fenceRepairs.htmlEscaped, 1);
  assert.deepEqual(json.fenceRepairs.htmlEscapedByKind, { comment: 1 });
  assert.deepEqual(json.census.unhandled, { newKind: 2 });
  assert.deepEqual(JSON.parse(text), json);
});

test('local verify JSON fails content loss without strict while schema drift remains strict-only', () => {
  const json = local(false, { loss: loss(true), census: census([['newKind', 2]]), early: 1 });
  assert.deepEqual(json.failureReasons, ['layer-b-mismatch', 'layer-a-tool-ids', 'layer-d']);
});

test('sdk verify JSON fails strict on drift or loss and leaks no samples', () => {
  const fenceRepairs = { early: [], turnEnd: 0, html: [] };
  const clean = buildSdkVerifyJson({ strict: true, census: census(), leftOut: new Map([['hooks', 2]]), loss: loss(), parser: parser(), fenceRepairs });
  assert.equal(clean.exitCode, 0);
  assert.deepEqual(clean.leftOut, { hooks: 2 });
  const failing = buildSdkVerifyJson({ strict: true, census: census([['x', 1]]), leftOut: new Map(), loss: loss(true), parser: parser(true), fenceRepairs });
  assert.deepEqual(failing.failureReasons, ['parser-check', 'unhandled-kind', 'layer-d']);
  assert.ok(!JSON.stringify(failing).includes(SECRET));
  const nonstrict = buildSdkVerifyJson({ strict: false, census: census(), leftOut: new Map(), loss: loss(true), parser: parser(), fenceRepairs });
  assert.equal(nonstrict.exitCode, 2);
  assert.deepEqual(nonstrict.failureReasons, ['layer-d']);
});

test('a failed parser check is a failure reason with or without --strict', () => {
  for (const strict of [true, false]) {
    const json = local(strict, { parserFailed: true });
    assert.ok(json.failureReasons.includes('parser-check'));
    assert.equal(json.exitCode, 2);
    assert.equal(json.parser.failed, true);
    assert.equal(json.parser.checks[0].ok, false);
  }
  assert.equal(local(true).parser.failed, false);
  assert.equal(local(true).version, 3);
});

test('SDK repairs fail strict only for early closes, not turn-end closes or HTML escapes', () => {
  const input = { census: census(), leftOut: new Map<string, number>(), loss: loss(), parser: parser() };
  const fenceRepairs = { early: [{ turn: 1, kind: 'tool' }], turnEnd: 2, html: [{ turn: 1, kind: 'pre' }] };
  assert.deepEqual(buildSdkVerifyJson({ ...input, strict: true, fenceRepairs }).failureReasons, ['early-fence-close']);
  assert.deepEqual(buildSdkVerifyJson({ ...input, strict: false, fenceRepairs }).failureReasons, []);
  const clean = buildSdkVerifyJson({ ...input, strict: true, fenceRepairs: { ...fenceRepairs, early: [] } });
  assert.equal(clean.exitCode, 0);
  assert.equal(clean.fenceRepairs.turnEnd, 2);
  assert.equal(clean.fenceRepairs.htmlEscaped, 1);
});

test('image loss fails Local and SDK verification JSON even without strict', () => {
  const images = verifyLocalImages([{ kind: 'image', mimeType: 'image/png', data: 'AQID' }], '', '', []);
  for (const strict of [false, true]) {
    const sdk = buildSdkVerifyJson({ strict, census: census(), leftOut: new Map(), loss: loss(), parser: parser(),
      fenceRepairs: { early: [], turnEnd: 0, html: [] }, images });
    assert.equal(sdk.exitCode, 2);
    assert.deepEqual(sdk.failureReasons, ['image-loss']);
    assert.equal(sdk.images?.missing, 1);
    const local = buildLocalVerifyJson({
      strict, report: { rawRequestCount: 1, parsedTurnCount: 1, missingTurns: 0, extraTurns: 0, crossTurnDuplicates: [], mismatches: [] },
      census: census(), crossCheck: { rawToolIds: 0, parsedToolIds: 0, rawThinking: 0, dropped: [], invented: [], failed: false },
      render: { checks: [], failed: false }, renderSkipReason: null, loss: loss(), lossTarget: 'file',
      parser: parser(), fenceRepairs: { early: [], turnEnd: 0, html: [] }, images,
    });
    assert.equal(local.exitCode, 2);
    assert.deepEqual(local.failureReasons, ['image-loss']);
    assert.deepEqual(JSON.parse(JSON.stringify(local)), local);
  }
});
