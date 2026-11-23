import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildLocalVerifyJson, buildSdkVerifyJson } from '../src/verify/json-report.ts';
import { renderVerificationExplanation, writeVerificationExplanation } from '../src/verify/explanation.ts';
import type { Census } from '../src/types.ts';
import type { LossAccount } from '../src/verify/loss-account.ts';
import type { ParserCheckResult } from '../src/verify/parser-check.ts';

const census = (unhandled: Array<[string, number]> = []): Census => ({
  seen: new Map([['user.message', 2]]),
  dropped: new Map(),
  toolData: new Map(),
  unhandled,
  unrecognizedToolData: [],
  questionWarnings: [],
});

const loss = (failed = false): LossAccount => ({
  checked: 12,
  totals: { prompt: { present: failed ? 2 : 3, partial: failed ? 1 : 0, absent: 0 } },
  unaccounted: failed ? [{ request: 1, category: 'prompt', status: 'partial', chars: 40, sample: 'A source prompt' }] : [],
  order: { checked: 3, outOfOrder: 0 },
  multiplicity: { checked: 1, missing: 0 },
  failed,
});

const parser = (): ParserCheckResult => ({
  skipped: null,
  checks: [{ name: 'turn headings', ok: true, detail: 'headings=3, turns=3' }],
  failed: false,
  counts: { turnAnchors: 3, requestHeadings: 3, assistantHeadings: 3, sectionHeadings: 4, unknownBlocks: 0, linkedUnknownBlocks: 0 },
  ms: 4,
});

function report (failed = false, unsupported = false) {
  return buildSdkVerifyJson({
    strict: false,
    census: census(unsupported ? [['future.event', 1], ['session.usage_record:unsupported', 1]] : []),
    leftOut: new Map([['hook records', 6590], ['usage and cache checkpoints', 62]]),
    loss: loss(failed),
    parser: parser(),
    fenceRepairs: { early: [], turnEnd: 0, html: [] },
  });
}

test('plain-English verification explains a clean result and intentional omissions', () => {
  const text = renderVerificationExplanation({
    report: report(),
    generatedAt: '261119-1750',
    archivePath: '/tmp/chat.md',
    assetsPath: '/tmp/chat_assets_261119_1750',
  });
  assert.match(text, /\*\*Verification passed\.\*\*/u);
  assert.match(text, /6,590/u);
  assert.match(text, /Hook start and end records describe automation/u);
  assert.match(text, /12 pieces checked/u);
  assert.match(text, /Layer D|recognized/u);
  assert.match(text, /Intentionally left out/u);
  assert.match(text, /## Source census/u);
  assert.match(text, /## Recorded text by category/u);
  assert.match(text, /## Image check/u);
  assert.match(text, /## Markdown structure/u);
  assert.doesNotMatch(text, /content failure above/u);
});

test('failed and unsupported records use direct explanations without calling a changed event a tool failure', () => {
  const text = renderVerificationExplanation({
    report: report(true, true),
    generatedAt: '261119-1750',
    archivePath: '/tmp/chat.verify-failed.md',
    failureLog: '/tmp/failed-session.log',
  });
  assert.match(text, /\*\*Verification failed\.\*\*/u);
  assert.match(text, /future\.event/u);
  assert.match(text, /isn't reviewed yet/u);
  assert.match(text, /isn't a failed tool call/u);
  assert.match(text, /failed-session\.log/u);
  assert.equal((text.match(/\]\(\.\/failed-session\.log\)/gu) ?? []).length, 2);
  assert.match(text, /## Source census/u);
  assert.match(text, /## Recorded text by category/u);
  assert.match(text, /## Failed checks/u);
  assert.match(text, /`layer-d`/u);
  assert.match(text, /content failure above/u);
});

test('export summaries and Local-only checks explain the full terminal report', () => {
  const local = buildLocalVerifyJson({
    strict: true,
    report: {
      rawRequestCount: 2, parsedTurnCount: 2, missingTurns: 0, extraTurns: 0,
      crossTurnDuplicates: [], mismatches: [],
    },
    census: census(),
    crossCheck: { rawToolIds: 3, parsedToolIds: 3, rawThinking: 2, dropped: [], invented: [], failed: false },
    render: { checks: [{ name: 'turn anchors == turns', ok: true }], failed: false },
    renderSkipReason: null,
    fenceRepairs: { early: [], turnEnd: 1, html: [{ turn: 1, kind: 'pre' }] },
    loss: loss(),
    lossTarget: 'file',
    parser: parser(),
  });
  const text = renderVerificationExplanation({
    report: local,
    generatedAt: '2026-11-20T05:00:00.000Z',
    archivePath: '/tmp/local.md',
    failure: null,
    capturePath: '/private/frozen-source',
    companionCount: 4,
    assetsPath: '/tmp/local_assets',
    summary: {
      sessionId: 'local-session',
      title: 'Project status',
      customTitle: null,
      defaultTitle: null,
      firstPrompt: 'What is the status?',
      lastPrompt: 'What is next?',
      startedAt: '261119 1000',
      endedAt: '261119 1015',
      turns: 2,
      toolCalls: 3,
      reasoningThoughts: 2,
      resources: 4,
      outputPath: '/tmp/local.md',
      outputBytes: 12345,
      verificationFailed: false,
    },
  });
  assert.match(text, /## Export summary/u);
  assert.match(text, /Journal and parsed turns/u);
  assert.match(text, /Tool identity/u);
  assert.match(text, /Rendered structure/u);
  assert.match(text, /## Local journal checks/u);
  assert.match(text, /Tool IDs dropped by the parser/u);
  assert.match(text, /turn anchors == turns/u);
  assert.match(text, /Code fences closed at the end of a turn/u);
  assert.match(text, /Unsafe HTML openings escaped/u);
  assert.match(text, /local_assets/u);
  assert.match(text, /frozen-source/u);
  assert.match(text, /12,345 bytes/u);
});

test('report warnings are separated from Markdown parser warnings', () => {
  const text = renderVerificationExplanation({
    report: report(),
    generatedAt: '261119-1750',
    archivePath: null,
    sourceWarnings: ['session.usage_record has 1 unsupported receipt (usage.extra: unknown field).'],
  });
  assert.match(text, /No saved archive was checked/u);
  assert.match(text, /### Export warnings/u);
  assert.match(text, /session\.usage_record/u);
});

test('a verification exception still gets a plain-English failure report', () => {
  const text = renderVerificationExplanation({
    generatedAt: '2026-11-19T22:35:00.000Z',
    archivePath: '/tmp/chat.verify-failed.md',
    failure: {
      failureReasons: ['verification-error'],
      categories: {},
      details: { message: 'Synthetic verifier exception' },
    },
  });
  assert.match(text, /Verification could not finish/u);
  assert.match(text, /verification-error/u);
  assert.match(text, /failure log/u);
});

test('sidecar writes beside the archive without replacing an older report', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-verification-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const archive = path.join(root, 'chat.md');
  await fs.writeFile(archive, '# Chat\n');
  const input = { report: report(), generatedAt: '261119-1750', archivePath: archive };
  const first = await writeVerificationExplanation(input);
  const second = await writeVerificationExplanation(input);
  assert.equal(path.basename(first!), 'chat.verification.md');
  assert.equal(path.basename(second!), 'chat.verification-1.md');
  assert.match(await fs.readFile(first!, 'utf8'), /Verification passed/u);
  assert.match(await fs.readFile(second!, 'utf8'), /Verification passed/u);
});
