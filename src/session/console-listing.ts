import type { SessionOccurrence } from './sources.ts';
import type { SessionListingOptions } from './listing-model.ts';
import type { ConversationGroup } from './listing-model.ts';
import { cleanCell, dateCell, diagnosticCounts, fit, groupOccurrences, ignoredCounts, localWorkspaceCounts, offsetLabel, parentKey, sessionType, shortIds } from './listing-model.ts';

const DIM = '\u001b[2m';
const UNDIM = '\u001b[22m';
// Longer selectors (exact paths, qualified SDK keys) move to a numbered note under the table.
const ID_CAP = 36;
const TITLE_CAP = 90;

function consoleType (session: SessionOccurrence): string {
  const type = sessionType(session);
  return type === 'CLI agent' ? 'cli-agt' : type;
}

export function formatSessionListing (
  occurrences: readonly SessionOccurrence[],
  options: SessionListingOptions = {},
): string {
  const groups = groupOccurrences(occurrences);
  const ignored = ignoredCounts(groups);
  const eligible = groups.filter((group) => group.visibility.status === 'included');
  const ids = shortIds(groups);
  const isChild = (group: ConversationGroup) => sessionType(group.representative) === 'sub-agent';
  const selectorOf = (group: ConversationGroup) => options.fullIds
    ? group.representative.sessionId : ids.get(group.key) ?? group.representative.sessionId;
  const needle = options.find?.toLowerCase();
  const matches = (group: ConversationGroup) => !needle
    || [group.representative.title, group.representative.sessionId, selectorOf(group)]
      .some((value) => value.toLowerCase().includes(needle));
  const pool = (options.showIgnored ? groups : eligible).filter(matches);
  const hiddenChildren = options.subagents ? [] : pool.filter(isChild);
  const candidates = options.subagents ? pool : pool.filter((group) => !isChild(group));
  const shown = options.last25 ? candidates.slice(0, 25) : candidates;
  const childCounts = new Map<string, number>();
  for (const child of hiddenChildren) {
    const parentId = parentKey(child.representative.sessionId);
    childCounts.set(parentId, (childCounts.get(parentId) ?? 0) + 1);
  }
  const idAmbiguity = localWorkspaceCounts(groups);
  const sharedOffset = offsetLabel(options.now ?? Date.now());
  const terminalWidth = Math.max(90, options.terminalWidth ?? 110);
  const notes: string[] = [];
  const rows = shown.map((group) => {
    let selector = selectorOf(group);
    if (!options.fullIds && Array.from(selector).length > ID_CAP) {
      notes.push(selector);
      selector = `see [${notes.length}]`;
    }
    return {
      group, selector,
      type: consoleType(group.representative),
      turns: group.promptCount === null ? '?' : String(group.promptCount),
      created: dateCell(group.createdTimestamp, options.referenceYear, sharedOffset),
      updated: dateCell(group.activityTimestamp, options.referenceYear, sharedOffset),
    };
  });
  const headings = ['CREATED', 'UPDATED', 'TURNS', 'TYPE', 'ID/PREFIX', 'TITLE', 'STATUS'] as const;
  const idWidth = Math.max(10, ...rows.map((row) => Array.from(cleanCell(row.selector)).length));
  const createdWidth = Math.max(headings[0].length, ...rows.map((row) => row.created.length));
  const updatedWidth = Math.max(headings[1].length, ...rows.map((row) => row.updated.length));
  const turnsWidth = Math.max(headings[2].length, ...rows.map((row) => row.turns.length));
  const typeWidth = Math.max(headings[3].length, ...rows.map((row) => row.type.length));
  const statusWidth = 8;
  const titleWidth = Math.min(TITLE_CAP, Math.max(20, terminalWidth
    - (createdWidth + updatedWidth + turnsWidth + typeWidth + idWidth + statusWidth + 6 * 3)));
  const widths = [createdWidth, updatedWidth, turnsWidth, typeWidth, idWidth, titleWidth, statusWidth];
  const duplicateCount = occurrences.length - groups.length;
  const dim = (text: string) => options.color ? `${DIM}${text}${UNDIM}` : text;
  const renderLine = (cells: readonly string[], dimRow = false) => {
    const line = cells.map((cell, index) => {
      const fitted = fit(cell, widths[index]!);
      return cell === '?' && !dimRow ? dim(fitted) : fitted;
    }).join(' | ');
    return dimRow ? dim(line) : line;
  };
  const scope = options.find ? ` matching "${options.find}"` : '';
  const lines = [
    options.showIgnored
      ? `Showing ${shown.length} of ${candidates.length} total conversations${scope} (${eligible.length} eligible before ignored filters)${options.last25 ? ' (newest 25)' : ''}.`
      : `Showing ${shown.length} of ${candidates.length} eligible conversations${scope}${options.last25 ? ' (newest 25)' : ''}.`,
    `${occurrences.length} source occurrences across ${groups.length} conversations; ${duplicateCount} duplicate ${duplicateCount === 1 ? 'occurrence' : 'occurrences'} merged.`,
    ...(hiddenChildren.length
      ? [`${hiddenChildren.length} sub-agent ${hiddenChildren.length === 1 ? 'chat' : 'chats'} not shown. Sub-agent conversations are included in the parent chat export. Pass --subagents to list them.`]
      : []),
    `Times are local (${sharedOffset}). A different offset is appended, for example 0722-11:26-4h.`,
    'TURNS = user prompts. With child chats: add delegated prompts and one delegation per child.',
    '',
    renderLine(headings),
    renderLine(widths.map((width) => '-'.repeat(width))),
  ];
  for (const { group, created, updated, selector, type, turns } of rows) {
    const session = group.representative;
    const suggestedSelector = ids.get(group.key) ?? session.sessionId;
    const selectorStatus = session.provider === 'local'
      && ((idAmbiguity.get(session.sessionId) ?? 0) > 1 || suggestedSelector.endsWith('.jsonl'))
      ? '📁'
      : group.childWarnings > 0
        ? `⚠️ +${group.childWarnings}`
        : group.visibility.status === 'hidden'
          ? group.visibility.reason === 'ambiguous' ? '⚠️' : '⏭'
          : session.backing.status === 'verified'
            ? '✅'
            : session.backing.status === 'unsupported' ? '❌' : '❓';
    const children = childCounts.get(session.sessionId) ?? 0;
    const title = `${session.title || '(untitled)'}${children ? ` (+${children} sub)` : ''}`;
    lines.push(renderLine([
      created,
      updated,
      turns,
      type,
      selector,
      title,
      selectorStatus,
    ], session.backing.status !== 'verified' || group.visibility.status === 'hidden'));
  }
  notes.forEach((note, index) => lines.push(`[${index + 1}] ${note}`));
  if (shown.length === 0)
    lines.push('(no conversations to show)');
  const ambiguousChildren = groups.filter((group) =>
    group.visibility.status === 'hidden' && group.visibility.reason === 'ambiguous'
    && group.representative.sessionId.includes('#subagent/')).length;
  const ignoredSummary = [...ignored.entries()].flatMap(([reason, count]) => {
    if (reason === 'fix')
      return [`${count} ${count === 1 ? 'chat with a title' : 'chats with titles'} starting with /fix`];
    if (reason === 'ambiguous') {
      const otherCount = count - ambiguousChildren;
      return [
        ...(otherCount > 0 ? [`${otherCount} ${otherCount === 1 ? 'entry' : 'entries'} with unresolved identity or scope`] : []),
        ...(ambiguousChildren > 0 ? [`${ambiguousChildren} ambiguous child scope${ambiguousChildren === 1 ? '' : 's'}`] : []),
      ];
    }
    return [`${count} ${reason}`];
  }).join(', ');
  ignoredSummary && lines.push(`Ignored by default: ${ignoredSummary}.`);
  ambiguousChildren > 0 && lines.push('⚠️ Verified parent conversations remain listed; ambiguous child scopes are hidden.');
  const diagnostics = diagnosticCounts(occurrences, options.diagnostics);
  const warningParts = [
    diagnostics.issues > 0 ? `${diagnostics.issues} distinct source issue(s)` : '',
    diagnostics.identityWarnings > 0 ? `${diagnostics.identityWarnings} identity warning(s)` : '',
    diagnostics.scopeWarnings > 0 ? `${diagnostics.scopeWarnings} child-scope warning(s)` : '',
  ].filter(Boolean);
  warningParts.length > 0 && lines.push(`Warnings: ${warningParts.join(', ')}. Detailed storage paths are omitted.`);
  lines.push('Types: local (VS Code), agent (Agent Host), cli-agt (Copilot CLI), sub-agent (child chat), external (unsupported provider).');
  lines.push('Status: ✅ verified, ❓ unresolved, ❌ unsupported, ⚠ +N = N ambiguous child scopes (parent still works), 📁 exact Local path, ⏭ ignored.');
  lines.push('A ? in a date or prompt count means unknown, not zero.');
  options.referenceYear !== undefined && lines.push(`Year ${options.referenceYear} is omitted from matching dates; other years use YYMMDD.`);
  lines.push('New Chat rows with unknown creation and prompt count are hidden by default; use --show-ignored to include them.');
  lines.push('ID/PREFIX is a copy-ready selector. ❓ means no verified source. 📁 means an exact .jsonl path is required.');
  const root = occurrences[0]?.provenance.userDataRoot;
  const rootArgument = root ? ` --user-data-root "${root}"` : ' --user-data-root <path>';
  lines.push('', `Export: copilot-chat-export <ID/PREFIX> [outputPath]${rootArgument}`);
  lines.push(`Export the current Local chat: copilot-chat-export --current [outputPath]${rootArgument}`);
  return lines.join('\n');
}
