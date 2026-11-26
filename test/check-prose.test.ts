import assert from 'node:assert/strict';
import { spawnSync as realSpawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  checkText,
  COPILOT_MODEL_CATALOG,
  collectReviewSources,
  exitCodeForFindings,
  findCopilotModel,
  formatUsageFooter,
  parseAiReview,
  parseArgs,
  parseDiffRanges,
  parseUsageReport,
  resolveCopilotModelId,
  reviewWithModel,
  selectCopilotModel,
} from '../scripts/check-prose.mjs';

const options = (values = {}) => ({
  all: false,
  fail: false,
  maxWords: 20,
  ai: false,
  model: 'claude-haiku-5.5',
  requestedModel: 'claude-haiku-5.5',
  modelSelection: null,
  reasoningEffort: null,
  stdin: false,
  paths: [],
  ...values,
});

test('catalog enumerates the documented models with unique IDs', () => {
  assert.equal(COPILOT_MODEL_CATALOG.length, 34);
  assert.equal(new Set(COPILOT_MODEL_CATALOG.map((model) => model.id)).size, COPILOT_MODEL_CATALOG.length);
  assert.equal(findCopilotModel('Claude Haiku 5.5')?.id, 'claude-haiku-5.5');
  assert.equal(findCopilotModel('claude-opus-4.8-fast-mode')?.releaseStatus, 'preview');
  assert.equal(findCopilotModel('custom-enterprise-model'), undefined);
  assert.equal(resolveCopilotModelId('Claude Haiku 5.5'), 'claude-haiku-5.5');
  assert.equal(resolveCopilotModelId('custom-enterprise-model'), 'custom-enterprise-model');
});

test('catalog keeps current token prices separate from legacy premium multipliers', () => {
  const codex = findCopilotModel('gpt-5.3-codex');
  assert.equal(codex?.pricingUsdPerMillionTokens.default.input, 1.75);
  assert.equal(codex?.legacyPremiumMultiplier, 6);

  const haiku = findCopilotModel('claude-haiku-5.5');
  assert.equal(haiku?.pricingUsdPerMillionTokens.default.output, 0.5);
  assert.equal(haiku?.pricingUsdPerMillionTokens.longContext?.startsAboveInputTokens, 100_000);
  assert.equal(haiku?.pricingUsdPerMillionTokens.longContext?.pricing.input, 0.5);
  assert.equal(haiku?.legacyPremiumMultiplier, null);

  const carbon = findCopilotModel('gemini-4-carbon');
  assert.equal(carbon?.pricingPromotion?.endsOn, '2026-12-01');
  assert.equal(carbon?.pricingPromotion?.next?.input, 4);
});

test('model argument accepts a catalog name and keeps a custom ID', () => {
  assert.equal(parseArgs(['--stdin', '--model', 'Claude Haiku 5.5']).model, 'claude-haiku-5.5');
  assert.equal(parseArgs(['--stdin', '--model', 'my-company/model']).model, 'my-company/model');
});

test('model lookup accepts case, spaces and short Haiku names', () => {
  const selectors = [
    'haiku-5.5',
    'haiku 5.5',
    'haiku',
    'claude haiku',
    'CLAUDE  HAIKU 5.5',
    'Claude-Haiku-5.5',
    'haiku5.5',
  ];
  for (const selector of selectors)
    assert.equal(resolveCopilotModelId(selector), 'claude-haiku-5.5');

  assert.equal(resolveCopilotModelId('Haiku 4.5'), 'claude-haiku-4.5');
  assert.equal(resolveCopilotModelId('haiku4.5'), 'claude-haiku-4.5');
  assert.equal(resolveCopilotModelId('KIMI K3'), 'kimi-k3');
  assert.equal(resolveCopilotModelId('MAI CODE 2'), 'mai-code-2');
});

test('model lookup selects the cheapest match for partial names', () => {
  const selection = selectCopilotModel('luna');
  assert.equal(selection.kind, 'cheapest');
  assert.equal(selection.model?.id, 'gpt-6-luna');
  assert.deepEqual(selection.matches.map((model) => model.id), ['gpt-6-luna', 'gpt-5.6-luna']);
  assert.equal(resolveCopilotModelId('codex'), 'gpt-5.3-codex');

  const options = parseArgs(['--stdin', '--ai', '--model', 'luna']);
  assert.equal(options.model, 'gpt-6-luna');
  assert.equal(options.requestedModel, 'luna');
  assert.equal(
    options.modelSelection?.message,
    '2 models matched "luna". Selected the cheapest model: gpt-6-luna.',
  );
});

function git(cwd: string, ...args: string[]) {
  const result = realSpawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('diff ranges merge changed hunks and recover a deletion line', () => {
  assert.deepEqual(parseDiffRanges([
    '@@ -1,2 +1,2 @@',
    ' old',
    '-removed',
    '+changed',
    '@@ -10,1 +10,0 @@',
  ].join('\n'), 12), [[1, 2], [10, 10]]);
});

test('deterministic findings use recommend severity', () => {
  const findings = checkText('A sentence; another sentence.\nA short line.', options());
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'recommend');
  assert.equal(findings[0].rule, 'semicolon');
});

test('plain avoid list is checked with technical exceptions', () => {
  const findings = checkText([
    'The old notes retain prior context.',
    'The proposed cadence needs review.',
    'Keep the swimlane as a diagram term.',
    'WI-040 has a Superseded status.',
  ].join('\n'), options());

  assert.deepEqual(findings.map((finding) => finding.rule), ['avoid-word', 'avoid-word']);
  assert.match(findings[0].message, /retain/u);
  assert.match(findings[1].message, /cadence/u);
  assert.match(findings[1].message, /name the action, result or owner/u);
  assert.deepEqual(findings.map((finding) => finding.line), [1, 2]);
});

test('word list catches inflections, restored words and exact technical phrases', () => {
  const lines = [
    'Leveraging the cache is crucial.',
    'This definitely codifies the rule.',
    'Notably, the demo is showcasing it.',
    'Prefix it with an underscore.',
    'Shrink the attack surface first.',
  ];
  const findings = checkText(lines.join('\n'), options());
  const byLine = (line: number) => findings.filter((finding) => finding.line === line).map((finding) => finding.rule);

  assert.deepEqual(byLine(1), ['avoid-word', 'avoid-word']);
  assert.deepEqual(byLine(2), ['avoid-word', 'avoid-word']);
  assert.deepEqual(byLine(3), ['avoid-word', 'avoid-word']);
  assert.deepEqual(byLine(4), []);
  assert.deepEqual(byLine(5), []);
});

test('policy word lists are skipped only in the policy files', () => {
  const text = '## Words\n\nWords like retain belong here.\n\n## Next\n';
  assert.equal(checkText(text, options(), undefined, 'notes.md').length, 1);
  assert.equal(checkText(text, options(), undefined, path.join('x', 'writing-style.instructions.md')).length, 0);
});

test('AI mode holds word-list hits aside and keeps other deterministic rules', (context) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cce-prose-ai-split-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'draft.md');
  writeFileSync(file, 'We retain the cache; it helps.\n');

  const [deterministic] = collectReviewSources(options({ all: true, paths: [file] }), { cwd: root });
  assert.deepEqual(deterministic.findings.map((finding) => finding.rule).sort(), ['avoid-word', 'semicolon']);

  const [ai] = collectReviewSources(options({ all: true, ai: true, paths: [file] }), { cwd: root });
  assert.deepEqual(ai.findings.map((finding) => finding.rule), ['semicolon']);
  assert.deepEqual(ai.wordFallback?.map((finding) => finding.rule), ['avoid-word']);
  assert.deepEqual(ai.passages[0].deterministic.map((finding) => finding.rule), ['semicolon']);
});

test('file scope uses changed lines only for dirty tracked files', (context) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cce-prose-scope-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init');
  const tracked = path.join(root, 'tracked.md');
  writeFileSync(tracked, 'First line.\nOriginal line.\nLast line.\n');
  git(root, 'add', 'tracked.md');
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'initial');

  const clean = collectReviewSources(options({ paths: [tracked] }), { cwd: root });
  assert.equal(clean[0].scope.name, 'clean');
  assert.deepEqual(clean[0].scope.ranges, [[1, 3]]);

  writeFileSync(tracked, 'First line.\nChanged line; second clause.\nLast line.\n');
  const dirty = collectReviewSources(options({ paths: [tracked] }), { cwd: root });
  assert.equal(dirty[0].scope.name, 'git-changed');
  assert.deepEqual(dirty[0].scope.ranges, [[2, 2]]);
  assert.deepEqual(dirty[0].findings.map((finding) => finding.line), [2]);
  assert.equal(dirty[0].passages[0].reviewText, 'Changed line; second clause.');
  assert.deepEqual(dirty[0].passages[0].reviewRanges, [[2, 2]]);

  const full = collectReviewSources(options({ all: true, paths: [tracked] }), { cwd: root });
  assert.equal(full[0].scope.name, 'all');
  assert.deepEqual(full[0].scope.ranges, [[1, 3]]);

  const untracked = path.join(root, 'new.md');
  writeFileSync(untracked, 'One line; another clause.\n');
  const added = collectReviewSources(options({ paths: [untracked] }), { cwd: root });
  assert.equal(added[0].scope.name, 'untracked');
  assert.deepEqual(added[0].scope.ranges, [[1, 1]]);
});

test('AI findings require structured severity and source identity', () => {
  const text = JSON.stringify({
    review: 'complete',
    findings: [{
      severity: 'blocker',
      source: 'S1P1',
      quote: 'ambiguous words',
      reason: 'The source meaning is unclear.',
      suggestion: 'Name the source behavior.',
    }],
  });
  assert.equal(parseAiReview(text, ['S1P1'])[0].severity, 'blocker');
  assert.throws(() => parseAiReview(text, ['S2P1']), /invalid finding/u);
  assert.throws(() => parseAiReview('FAIL', ['S1P1']), /JSON/u);
});

test('exit policy fails deterministic recommendations and AI blockers only', () => {
  assert.equal(exitCodeForFindings(options(), { deterministicRecommend: 0, blocker: 0 }), 0);
  assert.equal(exitCodeForFindings(options({ fail: true }), { deterministicRecommend: 1, blocker: 0 }), 1);
  assert.equal(exitCodeForFindings(options({ fail: true, ai: false }), { deterministicRecommend: 0, blocker: 1 }), 0);
  assert.equal(exitCodeForFindings(options({ fail: true, ai: true }), { deterministicRecommend: 0, blocker: 1 }), 1);
});

test('usage report reads the CLI billing and token fields', () => {
  const usage = parseUsageReport(JSON.stringify({
    totalNanoAiu: 90000000,
    totalPremiumRequestCost: 1,
    modelMetrics: {
      'claude-haiku-5.5': {
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 300,
        cacheWriteTokens: 40,
        reasoningTokens: 50,
      },
    },
    agentMetrics: {
      main: { invocationCount: 1 },
    },
  }));
  assert.equal(usage.credits, 0.09);
  assert.equal(usage.premium, 1);
  assert.deepEqual(usage.models, ['claude-haiku-5.5']);
  assert.deepEqual(usage.tokens, { input: 1000, output: 200, cacheRead: 300, cacheWrite: 40, reasoning: 50 });
});

function fakeCopilotResponse(result: string, usagePaths: string[]) {
  return (command: string, args: string[]) => {
    if (args[0] === '--version')
      return { status: 0, stdout: 'GitHub Copilot CLI 1.0.116.\n', stderr: '' };
    assert.equal(command, 'copilot');
    const usageFlag = args.indexOf('--usage-output-file');
    assert.ok(usageFlag >= 0);
    const usagePath = args[usageFlag + 1];
    usagePaths.push(usagePath);
    writeFileSync(usagePath, JSON.stringify({
      totalNanoAiu: 10000000,
      totalPremiumRequestCost: 1,
      modelMetrics: {
        'claude-haiku-5.5': {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadTokens: 10,
          cacheWriteTokens: 0,
          reasoningTokens: 5,
        },
      },
    }));
    return { status: 0, stdout: result, stderr: '' };
  };
}

test('AI review uses one model process for several sources and removes usage files', () => {
  const usagePaths: string[] = [];
  const response = JSON.stringify({ review: 'complete', findings: [] });
  const sources = ['one.md', 'two.md'].map((source, sourceIndex) => ({
    name: source,
    text: 'Clear text.',
    findings: [],
    scope: { name: 'all', ranges: [[1, 1]] },
    passages: [{
      id: `S${sourceIndex + 1}P1`,
      source,
      startLine: 1,
      endLine: 1,
      text: 'Clear text.',
      deterministic: [],
    }],
  }));
  const result = reviewWithModel(sources, options({ ai: true }), {
    spawnSync: fakeCopilotResponse(response, usagePaths),
    now: (() => { let value = 0; return () => { value += 100; return value; }; })(),
  });
  assert.equal(result.error, undefined);
  assert.equal(usagePaths.length, 1);
  assert.ok(usagePaths.every((file) => !existsSync(file)));
  assert.equal(result.usage.credits, 0.01);
  assert.match(formatUsageFooter(result, 2, 2), /sources=2/u);
});

test('AI review batches inputs over the model budget', () => {
  const usagePaths: string[] = [];
  const response = JSON.stringify({ review: 'complete', findings: [] });
  const sources = [{
    name: 'large.md',
    text: 'x'.repeat(120_000),
    findings: [],
    scope: { name: 'all', ranges: [[1, 1]] },
    passages: [{
      id: 'S1P1',
      source: 'large.md',
      startLine: 1,
      endLine: 1,
      text: 'x'.repeat(120_000),
      deterministic: [],
    }],
  }];
  const result = reviewWithModel(sources, options({ ai: true }), {
    spawnSync: fakeCopilotResponse(response, usagePaths),
  });
  assert.equal(result.error, undefined);
  assert.ok(usagePaths.length > 1);
  assert.equal(result.metadata.batches, usagePaths.length);
  assert.equal(result.usage.credits, usagePaths.length * 0.01);
});

test('malformed AI output returns an operational review error', () => {
  const usagePaths: string[] = [];
  const sources = [{
    name: 'one.md',
    text: 'Clear text.',
    findings: [],
    scope: { name: 'all', ranges: [[1, 1]] },
    passages: [{
      id: 'S1P1',
      source: 'one.md',
      startLine: 1,
      endLine: 1,
      text: 'Clear text.',
      deterministic: [],
    }],
  }];
  const result = reviewWithModel(sources, options({ ai: true }), {
    spawnSync: fakeCopilotResponse('FAIL', usagePaths),
  });
  assert.ok(result.error);
  assert.match(result.error, /JSON|expected/u);
  assert.ok(usagePaths.every((file) => !existsSync(file)));
});

test('a missing usage file keeps the prose result and reports unavailable usage', () => {
  const runner = (command: string, args: string[]) => {
    if (args[0] === '--version')
      return { status: 0, stdout: 'GitHub Copilot CLI 1.0.116.\n', stderr: '' };
    assert.equal(command, 'copilot');
    return {
      status: 0,
      stdout: JSON.stringify({ review: 'complete', findings: [] }),
      stderr: '',
    };
  };
  const result = reviewWithModel([{
    name: 'one.md',
    text: 'Clear text.',
    findings: [],
    scope: { name: 'all', ranges: [[1, 1]] },
    passages: [{
      id: 'S1P1',
      source: 'one.md',
      startLine: 1,
      endLine: 1,
      text: 'Clear text.',
      deterministic: [],
    }],
  }], options({ ai: true }), { spawnSync: runner });
  assert.equal(result.error, undefined);
  assert.equal(result.metadata.usageStatus, 'unavailable');
});
