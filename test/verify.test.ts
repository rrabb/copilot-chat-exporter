import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolNode, Turn } from '../src/types.ts';
import { MARK, sectionAnchor, userMessageAnchor, userMessageHref } from '../src/text.ts';
import { buildJournalCrossCheck, buildRenderReport, buildVerificationReport } from '../src/verify/layers.ts';
import { buildDigest, diffDigest, normalizeRender } from '../src/verify/golden.ts';
import { testSession, testTool, testTurn } from './helpers.ts';

// --- helpers -------------------------------------------------------------------------------

const turn = testTurn;

const tool = (toolCallId: string, over: Partial<ToolNode> = {}) => testTool({
  toolCallId,
  invocation: 'Read a file',
  ...over,
});

// A minimal export that passes every render check, so each test below can break exactly one
// thing and see only that check fail.
function renderFor (turns: Turn[]) {
  const lines = [sectionAnchor(MARK.sectionUserQuestions), ''];
  for (const t of turns)
    lines.push(`${t.number}. [Q${t.number}](${userMessageHref(t.number)})`);
  lines.push('', sectionAnchor(MARK.sectionCostTiming), '');
  for (const t of turns) {
    lines.push(userMessageAnchor(t.number));
    lines.push(`${MARK.requestHeadingPrefix}${t.number}</h3>`);
    lines.push(`> ${t.prompt}`);
    lines.push(MARK.assistantHeading);
    for (const node of t.toolNodes)
      lines.push(`- <sub>${MARK.toolBadgePrefix}<code>${node.toolId}</code></sub>`);
    for (const node of t.body)
      if (node.type === 'text')
        lines.push(node.text);
    lines.push('');
  }
  return lines.join('\n');
}

const journalLine = (value: unknown) => JSON.stringify({ kind: 2, k: ['requests', 0, 'response'], v: [value] });

// --- layer B: journal cross-check ------------------------------------------------------------

test('cross-check passes when every recorded tool call reached a parsed turn', () => {
  const session = testSession({ turns: [turn({ toolNodes: [tool('c1'), tool('c2')] })] });
  const raw = [
    journalLine({ kind: 'toolInvocationSerialized', toolCallId: 'c1' }),
    journalLine({ kind: 'toolInvocationSerialized', toolCallId: 'c2' }),
    journalLine({ kind: 'thinking', value: 'hmm' }),
  ].join('\n');
  const report = buildJournalCrossCheck(session, raw);
  assert.equal(report.failed, false);
  assert.equal(report.rawToolIds, 2);
  assert.equal(report.parsedToolIds, 2);
  assert.equal(report.rawThinking, 1);
});

test('cross-check names a tool call the parser silently dropped', () => {
  const session = testSession({ turns: [turn({ toolNodes: [tool('c1')] })] });
  const raw = [
    journalLine({ kind: 'toolInvocationSerialized', toolCallId: 'c1' }),
    journalLine({ kind: 'toolInvocationSerialized', toolCallId: 'c2' }),
  ].join('\n');
  const report = buildJournalCrossCheck(session, raw);
  assert.equal(report.failed, true);
  assert.deepEqual(report.dropped, ['c2']);
  assert.deepEqual(report.invented, []);
});

test('cross-check names a tool call the parser invented', () => {
  const session = testSession({ turns: [turn({ toolNodes: [tool('c1'), tool('ghost')] })] });
  const raw = journalLine({ kind: 'toolInvocationSerialized', toolCallId: 'c1' });
  const report = buildJournalCrossCheck(session, raw);
  assert.equal(report.failed, true);
  assert.deepEqual(report.invented, ['ghost']);
});

test('cross-check ignores tool ids quoted inside string values', () => {
  // This export is often self-referential: a prior export pasted into a tool result contains
  // tool ids as text. A plain object walk never descends into strings, so they stay excluded.
  const session = testSession({ turns: [turn({ toolNodes: [tool('c1')] })] });
  const raw = [
    journalLine({ kind: 'toolInvocationSerialized', toolCallId: 'c1' }),
    journalLine({ kind: 'textEditGroup', text: '{"kind":"toolInvocationSerialized","toolCallId":"quoted"}' }),
  ].join('\n');
  assert.equal(buildJournalCrossCheck(session, raw).failed, false);
});

test('cross-check survives a non-JSON line rather than throwing', () => {
  const session = testSession({ turns: [turn({ toolNodes: [tool('c1')] })] });
  const raw = ['not json at all', journalLine({ kind: 'toolInvocationSerialized', toolCallId: 'c1' })].join('\n');
  assert.equal(buildJournalCrossCheck(session, raw).failed, false);
});

// --- layer A: replayed journal vs parsed turns -----------------------------------------------

const rawRequest = (over: Record<string, unknown> = {}) => ({
  requestId: 'r1',
  message: { text: 'do the thing' },
  response: [],
  ...over,
});

test('verification report is clean when the parse matches the replayed journal', () => {
  const session = testSession({
    turns: [turn({ body: [{ type: 'text', text: 'done' }] })],
  });
  const report = buildVerificationReport(session, [rawRequest({ response: [{ value: 'done' }] })]);
  assert.equal(report.rawRequestCount, 1);
  assert.equal(report.parsedTurnCount, 1);
  assert.equal(report.mismatches.length, 0);
});

test('a tool call present in the journal but missing from the parse is reported per turn', () => {
  const session = testSession({ turns: [turn({ body: [{ type: 'text', text: 'done' }] })] });
  const report = buildVerificationReport(session, [rawRequest({
    response: [
      { value: 'done' },
      { kind: 'toolInvocationSerialized', toolCallId: 'c1', toolId: 'read_file', isComplete: true },
    ],
  })]);
  assert.equal(report.toolMismatches, 1);
  assert.match(report.mismatches[0].detail, /tool call count differs \(raw=1, parsed=0\)/);
});

test('reordering tool calls fails even though the counts still match', () => {
  // The anti-criterion: an export that buckets tool calls by type instead of keeping them
  // interleaved in recorded order has the right totals and the wrong story.
  const session = testSession({ turns: [turn({ toolNodes: [tool('c2'), tool('c1')] })] });
  const report = buildVerificationReport(session, [rawRequest({
    response: [
      { kind: 'toolInvocationSerialized', toolCallId: 'c1', toolId: 'read_file', isComplete: true },
      { kind: 'toolInvocationSerialized', toolCallId: 'c2', toolId: 'read_file', isComplete: true },
    ],
  })]);
  assert.equal(report.toolMismatches, 0);
  assert.equal(report.orderMismatches, 1);
});

test('a journal request with no parsed turn is reported as missing', () => {
  const session = testSession();
  const report = buildVerificationReport(session, [rawRequest()]);
  assert.equal(report.missingTurns, 1);
  assert.equal(report.mismatches[0].kind, 'missing-turn');
});

test('a parsed turn with no journal request is reported as extra', () => {
  const session = testSession({ turns: [turn({ requestId: 'ghost' })] });
  const report = buildVerificationReport(session, [rawRequest()]);
  assert.equal(report.extraTurns, 1);
  assert.equal(report.mismatches[0].kind, 'extra-turn');
});

test('the same tool call id under two turns is reported, not failed', () => {
  // VS Code reuses a toolCallId when the identical command runs again later. Both turns should
  // still show their own occurrence, so this is surfaced for a human, not treated as a defect.
  const session = testSession({
    turns: [
      turn({ number: 1, requestId: 'r1', toolNodes: [tool('shared')] }),
      turn({ number: 2, requestId: 'r2', toolNodes: [tool('shared')] }),
    ],
  });
  const report = buildVerificationReport(session, [
    rawRequest({ response: [{ kind: 'toolInvocationSerialized', toolCallId: 'shared', toolId: 'read_file', isComplete: true }] }),
    rawRequest({ requestId: 'r2', response: [{ kind: 'toolInvocationSerialized', toolCallId: 'shared', toolId: 'read_file', isComplete: true }] }),
  ]);
  assert.equal(report.crossTurnDuplicates.length, 1);
  assert.equal(report.crossTurnDuplicates[0].toolCallId, 'shared');
  assert.equal(report.mismatches.length, 0);
});

// --- layer C: parsed turns vs the rendered file ----------------------------------------------

const checkNamed = (report: ReturnType<typeof buildRenderReport>, name: string) => report.checks.find((check) => check.name === name)!;

test('render report passes on a well-formed export', () => {
  const turns = [turn({ number: 1, toolNodes: [tool('c1')] }), turn({ number: 2, requestId: 'r2' })];
  const report = buildRenderReport(testSession({ turns }), renderFor(turns));
  assert.equal(report.failed, false, JSON.stringify(report.checks.filter((c) => !c.ok)));
  assert.deepEqual(report.counts, { anchors: 2, toc: 2, headers: 2, assistant: 2, badges: 1, detailsBalanced: true });
});

test('render report catches a turn that never made it into the file', () => {
  const turns = [turn({ number: 1 }), turn({ number: 2, requestId: 'r2' })];
  const markdown = renderFor([turns[0]]);
  const report = buildRenderReport(testSession({ turns }), markdown);
  assert.equal(report.failed, true);
  assert.equal(checkNamed(report, 'turn anchors == turns').ok, false);
});

test('render report catches a duplicated turn anchor', () => {
  const turns = [turn({ number: 1 }), turn({ number: 1, requestId: 'r2' })];
  const report = buildRenderReport(testSession({ turns }), renderFor(turns));
  assert.equal(checkNamed(report, 'no duplicate turn anchors').ok, false);
  assert.equal(checkNamed(report, 'turn anchors sequential 1..N').ok, false);
});

test('render report ignores its own markers quoted in fences and blockquotes', () => {
  // The exporter regularly exports sessions about itself, so a real export contains its own
  // scaffolding as quoted content. Counting that would make every such export look broken.
  const turns = [turn({ number: 1 })];
  const noise = [
    '````text',
    userMessageAnchor(99),
    `${MARK.requestHeadingPrefix}99</h3>`,
    MARK.assistantHeading,
    '<details><summary>unclosed on purpose',
    '````',
    `> ${userMessageAnchor(98)}`,
    `> ${MARK.assistantHeading}`,
    `> ](${userMessageHref(98)})`,
  ].join('\n');
  const report = buildRenderReport(testSession({ turns }), `${renderFor(turns)}\n${noise}\n`);
  assert.equal(report.failed, false, JSON.stringify(report.checks.filter((c) => !c.ok)));
  assert.equal(report.counts.anchors, 1);
  assert.equal(report.counts.toc, 1);
});

test('render report catches a recorded compact confirmation dropped from its turn', () => {
  const compact = turn({ number: 1, prompt: '/compact', body: [{ type: 'text', text: 'Compacted conversation.' }] });
  const withIt = buildRenderReport(testSession({ turns: [compact] }), renderFor([compact]));
  assert.equal(checkNamed(withIt, 'compact confirmation under its /compact turn').ok, true);

  const stripped = renderFor([compact]).replace('Compacted conversation.', '');
  const without = buildRenderReport(testSession({ turns: [compact] }), stripped);
  assert.equal(checkNamed(without, 'compact confirmation under its /compact turn').ok, false);
});

// --- the recorded checks ----------------------------------------------------------------------

test('normalizeRender hides only what legitimately changes between two runs', () => {
  const before = [
    '- **Export generated:** 2026-08-24 07:04',
    '### Chat Export Artifact',
    '',
    '- `docs/chat-exports/a.md`',
    '',
    '- ✏️ modified `src/cli.ts` (583 lines)',
    '- 🆕 created `src/verify/golden.ts` (106 lines)',
    '- kept `src/text.ts`',
  ].join('\n');
  const after = before
    .replace('2026-08-24 07:04', '2026-08-25 09:11')
    .replace('docs/chat-exports/a.md', 'docs/chat-exports/b.md')
    .replace(' (583 lines)', ' (612 lines)')
    .replace(' (106 lines)', '');
  assert.equal(normalizeRender(before), normalizeRender(after));
  // The last line is not volatile, so a real change to it still shows up.
  assert.notEqual(normalizeRender(before), normalizeRender(before.replace('- kept', '- dropped')));
});

test('normalizeRender masks the worktree snapshot without swallowing what follows', () => {
  const text = '### Current Worktree Snapshot\n\n```text\n M src/cli.ts\n```\n\n### Next Section\n';
  const out = normalizeRender(text);
  assert.match(out, /```text\n<volatile>\n```/);
  assert.match(out, /### Next Section/);
});

test('a digest diff points at the exact field that drifted', () => {
  const committed = { schema: 2, turns: 2, toolCalls: { total: 3, distinct: 3 }, thoughts: 1, render: {}, census: {}, perTurn: [{ n: 1 }, { n: 2 }] };
  const fresh = { ...committed, toolCalls: { total: 2, distinct: 2 }, perTurn: [{ n: 1 }, { n: 3 }] };
  const diffs = diffDigest(committed, fresh);
  assert.deepEqual(diffs.map((d) => d.path), ['toolCalls', 'perTurn[1]']);
  assert.deepEqual(diffs[0].expected, { total: 3, distinct: 3 });
});

test('an unchanged digest produces no diff', () => {
  const digest = { schema: 2, turns: 1, toolCalls: { total: 1, distinct: 1 }, thoughts: 0, render: { anchors: 1 }, census: { seen: { thinking: 1 } }, perTurn: [{ n: 1 }] };
  assert.deepEqual(diffDigest(digest, structuredClone(digest)), []);
});

// --- the digest a snapshot records --------------------------------------------------------------

const digestSession = (over: Parameters<typeof testSession>[0] = {}) => testSession({
  turns: [turn({ number: 1, reasoning: ['thought one'], body: [{ type: 'text', text: 'done' }], toolNodes: [tool('c1', { output: 'line\nline' })] })],
  census: {
    seen: new Map([['toolInvocationSerialized', 2], ['thinking', 1]]),
    dropped: new Map(),
    toolData: new Map([['terminal', 2]]),
    unhandled: [],
    unrecognizedToolData: [],
  },
  ...over,
});

test('the digest keeps structure and order but replaces contents with hashes', () => {
  const digest = buildDigest(digestSession(), { anchors: 1 });
  assert.equal(digest.turns, 1);
  assert.deepEqual(digest.toolCalls, { total: 1, distinct: 1 });
  assert.deepEqual(digest.perTurn[0].toolIds, ['c1']);
  assert.equal(digest.perTurn[0].termLines, 2);
  assert.match(digest.perTurn[0].promptSha, /^[0-9a-f]{64}$/);
  assert.equal(digest.perTurn[0].thoughtShas.length, 1);
  // The point of hashing: the text itself never lands in the file.
  assert.equal(JSON.stringify(digest).includes('do the thing'), false);
});

test('the digest records the census, sorted by kind', () => {
  // Without this a snapshot could not tell you that a new node kind appeared, which is the one
  // thing it exists to catch.
  const digest = buildDigest(digestSession(), {});
  assert.deepEqual(Object.keys(digest.census.seen), ['thinking', 'toolInvocationSerialized']);
  assert.deepEqual(digest.census.toolData, { terminal: 2 });
  assert.deepEqual(digest.census.unhandled, []);
});

test('a kind this build cannot handle shows up as census drift', () => {
  const before = buildDigest(digestSession(), {});
  const after = buildDigest(digestSession({
    census: {
      seen: new Map([['toolInvocationSerialized', 2], ['thinkingV2', 1]]),
      dropped: new Map([['thinkingV2', 1]]),
      toolData: new Map([['terminal', 2]]),
      unhandled: [['thinkingV2', 1]],
      unrecognizedToolData: [],
    },
  }), {});
  const paths = diffDigest(before, after).map((diff) => diff.path);
  assert.deepEqual(paths, ['census.seen', 'census.dropped', 'census.unhandled']);
});

test('notes are supplied by the caller, not baked into the digest', () => {
  assert.deepEqual(buildDigest(digestSession(), {}).notes, []);
  assert.deepEqual(buildDigest(digestSession(), {}, ['constructed by hand']).notes, ['constructed by hand']);
});
