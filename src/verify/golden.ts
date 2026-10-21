// The recorded checks: save what a parse produced, then compare a later run against it.
//
// This catches what the three layers cannot. A change that shifts both sides of every
// comparison identically still looks consistent to them; a copy recorded from the OLD, correct
// parse of the SAME frozen bytes does not move, so it mismatches.
//
// Two things are recorded, and the difference matters:
//
//   - the golden fixture (committed): one small made-up session, digest AND a byte-exact copy
//     of its render. Small enough to review in a pull request.
//   - a snapshot (machine-local): the digest only, for any session you have. Contents are
//     reduced to hashes, so its size is bounded by turn and tool counts rather than by payloads.
//     This is how you cover a conversation containing a shape neither committed fixture has.

import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ParsedSession, ToolNode, TurnNode } from '../types.ts';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.basename(moduleDir) === 'verify'
  ? path.resolve(moduleDir, '..', '..')
  : path.resolve(moduleDir, '..');

// fixtures/ holds the saved artifacts a check compares against; baseline/ holds generated output.
const GOLDEN_DIR = path.join(PKG, 'test', 'fixtures', 'golden');

export const GOLDEN_FIXTURE_PATH = path.join(GOLDEN_DIR, '00000000-0000-4000-8000-000000000000.jsonl');
export const GOLDEN_DIGEST_PATH = path.join(GOLDEN_DIR, 'golden-session.digest.json');
export const GOLDEN_EXPECTED_RENDER_PATH = path.join(GOLDEN_DIR, 'golden-session.expected.md');
export const GOLDEN_SCRATCH_OUTPUT = path.join(PKG, 'test', 'baseline', 'golden.render.md');

// Machine-local, and gitignored: a snapshot names one of *your* sessions and is only meaningful
// beside the storage it was taken from.
export const SNAPSHOT_DIR = path.join(PKG, 'test', 'snapshots');
export const snapshotPath = (sessionId: string) => path.join(SNAPSHOT_DIR, `${sessionId}.digest.json`);

// Two shapes in the fixture have no real-session precedent (see spec 9.4): flag them here so
// a future contributor knows those two are deliberately constructed, not reproduced.
export const GOLDEN_SYNTHETIC_NOTES = [
  'numeric-keyed splice-object response delta (turn 5) - not observed in any of 45 surveyed local sessions',
  'isCanceled: true (turn 6) - not observed in any of 45 surveyed local sessions',
];

// Hides the parts of an export that legitimately differ between two runs of unchanged code, so
// a comparison only fails on a real rendering change. Shared with the live-session harness.
//
// The line-count suffix is DROPPED rather than masked, because it also disappears entirely once
// a recorded file has been moved or deleted - masking would fail for an unrelated reason.
export function normalizeRender (markdown: string): string {
  return String(markdown)
    .replace(/^- \*\*Export generated:\*\* .*$/m, '- **Export generated:** <volatile>')
    .replace(/^(- \*\*Exporter:\*\* `[^`]+` \(commit `)[^`]+(`\))$/m, '$1<volatile>$2')
    .replace(/\bgolden\.render_assets_\d{6}_\d{6}(?:_\d+)?\//gu, 'golden.render_assets_<volatile>/')
    .replace(/(### Current Worktree Snapshot\n\n```text\n)[\s\S]*?(\n```)/, '$1<volatile>$2')
    .replace(/(### Chat Export Artifact\n\n)- `[^`]*`$/m, '$1- `<volatile>`')
    .replace(/^(- (?:✏️|🆕) (?:modified|created) `[^`]+`)(?: \((?:[\d,]+|<volatile>) lines\))?$/gm, '$1');
}

function sha256 (text: string) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// Sorted by kind so a new one shows up as an added line rather than reordering the whole block.
const countsObject = (map: Map<string, number>) => Object.fromEntries(
  [...(map ?? [])].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
);

// Normalized, timestamp-free digest of the parsed turns, the render-shape counts from the same
// parse's rendered output, and the kind census. Contents are reduced to hashes: structure and
// order are what a regression moves, and hashes keep the file diffable at any session size.
//
// The census is in here because "a session containing something this build has never seen" is
// exactly what a snapshot is for - adding a handler for a new kind should show up as the census
// moving, not only as one turn's text changing.
export function buildDigest (session: ParsedSession, renderCounts: Record<string, unknown>, notes: string[] = []) {
  const perTurn = session.turns.map((turn) => {
    const assistantText = turn.body
      .filter((node: TurnNode) => node.type === 'text' || node.type === 'ref')
      .map((node: any) => node.text.trim())
      .filter(Boolean)
      .join('\n');
    let termLines = 0;
    for (const tool of turn.toolNodes)
      if (tool.output)
        termLines += tool.output.split('\n').length;
    return {
      n: turn.number,
      requestId: turn.requestId,
      promptSha: sha256(turn.prompt.trim()),
      assistantSha: sha256(assistantText),
      thoughts: turn.reasoning.length,
      thoughtShas: turn.reasoning.map((thought) => sha256(thought)),
      tools: turn.toolNodes.length,
      toolIds: turn.toolNodes.map((node) => node.toolCallId).filter(Boolean),
      termLines,
      files: turn.filesTouched.map((entry) => entry.file),
      compact: turn.prompt.trim() === '/compact',
    };
  });
  const allToolIds = session.turns.flatMap((turn) => turn.toolNodes.map((node) => node.toolCallId).filter(Boolean));
  return {
    schema: 2,
    turns: session.turns.length,
    toolCalls: { total: allToolIds.length, distinct: new Set(allToolIds).size },
    thoughts: session.turns.reduce((sum, turn) => sum + turn.reasoning.length, 0),
    perTurn,
    render: renderCounts,
    census: {
      seen: countsObject(session.census.seen),
      dropped: countsObject(session.census.dropped),
      toolData: countsObject(session.census.toolData),
      unhandled: session.census.unhandled,
      unrecognizedToolData: session.census.unrecognizedToolData,
    },
    notes,
  };
}

// Field-level diff so a mismatch points at exactly what drifted rather than just "digest changed".
export function diffDigest (committed: any, fresh: any) {
  const diffs: Array<{ path: string; expected: unknown; actual: unknown }> = [];
  const compare = (path_: string, expected: unknown, actual: unknown) => {
    const same = JSON.stringify(expected) === JSON.stringify(actual);
    if (!same)
      diffs.push({ path: path_, expected, actual });
  };
  compare('schema', committed.schema, fresh.schema);
  compare('turns', committed.turns, fresh.turns);
  compare('toolCalls', committed.toolCalls, fresh.toolCalls);
  compare('thoughts', committed.thoughts, fresh.thoughts);
  compare('render', committed.render, fresh.render);
  for (const field of ['seen', 'dropped', 'toolData', 'unhandled', 'unrecognizedToolData'])
    compare(`census.${field}`, committed.census?.[field], fresh.census?.[field]);
  const maxLen = Math.max(committed.perTurn?.length ?? 0, fresh.perTurn?.length ?? 0);
  for (let i = 0; i < maxLen; i += 1)
    compare(`perTurn[${i}]`, committed.perTurn?.[i], fresh.perTurn?.[i]);
  return diffs;
}
