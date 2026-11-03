import type { SessionOccurrence } from './sources.ts';
import type { SessionListingOptions } from './listing-model.ts';
import { UUID, cleanCell, dateCell, diagnosticCounts, fit, groupOccurrences, ignoredCounts, localWorkspaceCounts, sessionType, shortIds } from './listing-model.ts';

export function formatSessionListing (
  occurrences: readonly SessionOccurrence[],
  options: SessionListingOptions = {},
): string {
  const groups = groupOccurrences(occurrences);
  const ignored = ignoredCounts(groups);
  const eligible = groups.filter((group) => group.visibility.status === 'included');
  const candidates = options.showIgnored ? groups : eligible;
  const shown = options.last25 ? candidates.slice(0, 25) : candidates;
  const ids = shortIds(groups);
  const idAmbiguity = localWorkspaceCounts(groups);
  const terminalWidth = Math.max(90, options.terminalWidth ?? 110);
  const idWidth = Math.max(10, ...shown.map((group) => {
    const sessionId = group.representative.sessionId;
    if (!options.fullIds && !UUID.test(sessionId))
      return 10;
    return Array.from(cleanCell(options.fullIds ? sessionId : ids.get(sessionId) ?? sessionId)).length;
  }));
  const rows = shown.map((group) => ({
    group, created: dateCell(group.createdTimestamp, options.referenceYear),
    updated: dateCell(group.activityTimestamp, options.referenceYear),
  }));
  const headings = ['CREATED (LOCAL)', 'UPDATED (LOCAL)', 'PROMPTS', 'TYPE', 'ID/PREFIX', 'TITLE', 'STATUS'] as const;
  const createdWidth = Math.max(headings[0].length, ...rows.map((row) => row.created.length));
  const updatedWidth = Math.max(headings[1].length, ...rows.map((row) => row.updated.length));
  const titleWidth = Math.max(20, terminalWidth - (createdWidth + updatedWidth + 7 + 11 + idWidth + 20 + 6 * 3));
  const widths = [createdWidth, updatedWidth, 7, 11, idWidth, titleWidth, 20];
  const duplicateCount = occurrences.length - groups.length;
  const renderLine = (cells: readonly string[]) => cells.map((cell, index) => fit(cell, widths[index])).join(' | ');
  const lines = [
    options.showIgnored
      ? `Showing ${shown.length} of ${candidates.length} total conversations (${eligible.length} eligible before ignored filters)${options.last25 ? ' (newest 25)' : ''}.`
      : `Showing ${shown.length} of ${candidates.length} eligible conversations${options.last25 ? ' (newest 25)' : ''}.`,
    `${occurrences.length} source occurrences across ${groups.length} conversations; ${duplicateCount} duplicate ${duplicateCount === 1 ? 'occurrence' : 'occurrences'} merged.`,
    '',
    renderLine(headings),
    renderLine(widths.map((width) => '-'.repeat(width))),
  ];
  for (const { group, created, updated } of rows) {
    const session = group.representative;
    const status = group.visibility.status === 'hidden' && group.visibility.reason === 'ambiguous'
      ? '🟠 ❓ ambiguous' : group.visibility.status === 'hidden'
        ? group.visibility.reason === 'new-chat-unknown' ? 'ignored:new-chat?' : `ignored:${group.visibility.reason}`
        : session.backing.status;
    const statusWithChildren = group.childWarnings > 0
      ? `🟠 ❓ +${group.childWarnings}` : status;
    const selectorStatus = session.provider === 'local' && (idAmbiguity.get(session.sessionId) ?? 0) > 1
      ? 'path required' : statusWithChildren;
    lines.push(renderLine([
      created,
      updated,
      group.promptCount === null ? 'unknown' : String(group.promptCount),
      sessionType(session),
      options.fullIds ? session.sessionId : ids.get(session.sessionId) ?? session.sessionId,
      session.title || '(untitled)',
      selectorStatus,
    ]));
  }
  if (shown.length === 0)
    lines.push('(no conversations to show)');
  const ambiguousChildren = groups.filter((group) =>
    group.visibility.status === 'hidden' && group.visibility.reason === 'ambiguous'
    && group.representative.sessionId.includes('#subagent/')).length;
  const ignoredSummary = [...ignored.entries()].flatMap(([reason, count]) => {
    if (reason === 'fix')
      return [`${count} chat${count === 1 ? '' : 's'} with a title${count === 1 ? '' : 's'} starting with /fix`];
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
  ambiguousChildren > 0 && lines.push('🟠 ❓ Verified parent conversations remain listed; ambiguous child scopes are hidden.');
  const diagnostics = diagnosticCounts(occurrences, options.diagnostics);
  const warningParts = [
    diagnostics.issues > 0 ? `${diagnostics.issues} distinct source issue(s)` : '',
    diagnostics.identityWarnings > 0 ? `${diagnostics.identityWarnings} identity warning(s)` : '',
    diagnostics.scopeWarnings > 0 ? `${diagnostics.scopeWarnings} child-scope warning(s)` : '',
  ].filter(Boolean);
  warningParts.length > 0 && lines.push(`Warnings: ${warningParts.join(', ')}. Detailed storage paths are omitted.`);
  lines.push('Type: local = VS Code journal; agent = Agent Host main chat; sub-agent = child chat entry; CLI agent = Copilot CLI; external = provider reference outside Local, Agent Host and CLI sources. External references are unsupported for export.');
  lines.push('Status: verified = backing identity checked; unresolved = no verified chat backing; ambiguous (🟠 ❓) = identity or scope could not be resolved safely. “path required” means this Local ID exists in multiple workspaces.');
  lines.push('Dates use this machine’s local time; each timestamp includes its UTC offset. Unknown dates/counts mean the source has no trustworthy value, not zero.');
  options.referenceYear !== undefined && lines.push(`Year ${options.referenceYear} is omitted from matching dates; other years use YYMMDD.`);
  lines.push('New Chat rows with unknown creation and prompt count are hidden by default; use --show-ignored to include them.');
  lines.push('Use a verified Local ID/prefix from the ID / PREFIX column as the export selector. Unresolved rows have no verified export source; use an exact .jsonl path when status says “path required”.');
  lines.push('Prompt counts: main user prompts; child counts add one delegation plus recorded child user prompts.');
  lines.push('', 'Export a verified Local source: copilot-chat-export <sessionId> [outputPath] --user-data-root <path>');
  lines.push('Export current Local source: copilot-chat-export --current [outputPath] --user-data-root <path>');
  lines.push('Export an Agent Host or Copilot CLI main chat: copilot-chat-export <chat id | backing id | 8+ character prefix> [outputPath] --user-data-root <path>. Sub-agent conversations are included in the parent chat export.');
  return lines.join('\n');
}
