import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { InventoryDiagnostic, SessionOccurrence } from './sources.ts';

export interface SessionListingOptions {
  showIgnored?: boolean;
  last25?: boolean;
  fullIds?: boolean;
  terminalWidth?: number;
  diagnostics?: readonly InventoryDiagnostic[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

interface ConversationGroup {
  key: string;
  occurrences: SessionOccurrence[];
  representative: SessionOccurrence;
  activityTimestamp: number | null;
  createdTimestamp: number | null;
  promptCount: number | null;
  visibility: SessionOccurrence['visibility'];
  childWarnings: number;
}

function groupKey (session: SessionOccurrence): string | null {
  if (session.backing.status === 'verified') {
    const source = session.backing.source;
    if (source.kind === 'local-journal')
      return JSON.stringify(['local', source.sessionId, source.sha256]);
    return JSON.stringify([
      source.provider, source.chatIdentity, source.sessionId,
      source.scope.kind === 'main' ? 'main' : source.scope.agentId,
    ]);
  }
  if (session.provider === 'agent-host' || session.provider === 'copilot-cli')
    return JSON.stringify([session.provider, session.sessionId, session.backing.status, session.backing.reason]);
  return null;
}

function shortIds (groups: readonly ConversationGroup[]): Map<string, string> {
  const ids = groups.map((group) => group.representative.sessionId);
  return new Map(ids.map((id) => {
    if (!UUID.test(id))
      return [id, id] as const;
    const compactId = id.replaceAll('-', '');
    const compactIds = ids.map((candidate) => candidate.replaceAll('-', '').toLowerCase());
    let prefixLength = 8;
    while (prefixLength < compactId.length && compactIds.some((candidate) =>
      candidate !== compactId.toLowerCase() && candidate.startsWith(compactId.slice(0, prefixLength).toLowerCase())))
      prefixLength += 1;
    return [id, compactId.slice(0, prefixLength)] as const;
  }));
}

function sessionType (session: SessionOccurrence): string {
  if (session.backing.status === 'verified'
    && session.backing.source.kind === 'sdk-events'
    && session.backing.source.scope.kind === 'subagent')
    return 'sub-agent';
  if (session.sessionId.includes('#subagent/'))
    return 'sub-agent';
  if (session.provider === 'agent-host')
    return 'agent';
  if (session.provider === 'copilot-cli')
    return 'CLI agent';
  return session.provider;
}

function groupOccurrences (occurrences: readonly SessionOccurrence[]): ConversationGroup[] {
  const groups = new Map<string, ConversationGroup>();
  for (const session of occurrences) {
    const key = groupKey(session) ?? `occurrence:${session.occurrenceId}`;
    const group = groups.get(key);
    if (group) {
      group.occurrences.push(session);
      continue;
    }

    groups.set(key, {
      key, occurrences: [session], representative: session,
      activityTimestamp: session.activityTimestamp, createdTimestamp: session.createdTimestamp ?? null,
      promptCount: session.promptCount ?? null, visibility: session.visibility, childWarnings: 0,
    });
  }
  const result = [...groups.values()];
  for (const group of result) {
    group.occurrences.sort((left, right) =>
      (right.activityTimestamp ?? -Infinity) - (left.activityTimestamp ?? -Infinity)
      || left.occurrenceId.localeCompare(right.occurrenceId));
    group.representative = group.occurrences[0];
    const latest = group.occurrences.reduce((timestamp, session) =>
      Math.max(timestamp, session.activityTimestamp ?? -Infinity), -Infinity);
    group.activityTimestamp = Number.isFinite(latest) ? latest : null;
    group.createdTimestamp = group.occurrences.find((session) => session.createdTimestamp != null)?.createdTimestamp ?? null;
    group.promptCount = group.occurrences.find((session) => session.promptCount != null)?.promptCount ?? null;
    group.visibility = group.occurrences.some((session) => session.visibility.status === 'included')
      ? { status: 'included' }
      : group.occurrences[0].visibility;
  }
  for (const group of result) {
    if (group.representative.sessionId.includes('#subagent/'))
      continue;
    group.childWarnings = result.filter((candidate) =>
      candidate.visibility.status === 'hidden' && candidate.visibility.reason === 'ambiguous'
      && candidate.representative.provider === group.representative.provider
      && candidate.representative.sessionId.startsWith(`${group.representative.sessionId}#subagent/`)).length;
  }
  return result.sort((left, right) =>
    (right.activityTimestamp ?? -Infinity) - (left.activityTimestamp ?? -Infinity)
    || left.representative.sessionId.localeCompare(right.representative.sessionId));
}

function cleanCell (value: string): string {
  return value.replace(/[\r\n\t]+/gu, ' ').replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/\|/gu, '¦').replace(/\s{2,}/gu, ' ').trim();
}

function fit (value: string, width: number): string {
  const clean = cleanCell(value);
  const characters = Array.from(clean);
  if (characters.length <= width)
    return clean.padEnd(width);
  return `${characters.slice(0, Math.max(0, width - 1)).join('')}…`;
}

function dateCell (timestamp: number | null): string {
  return timestamp === null || !Number.isFinite(timestamp) ? 'unknown' : new Date(timestamp).toISOString().slice(0, 10);
}

function ignoredCounts (groups: readonly ConversationGroup[]) {
  const counts = new Map<string, number>();
  for (const group of groups) {
    if (group.visibility.status === 'hidden')
      counts.set(group.visibility.reason, (counts.get(group.visibility.reason) ?? 0) + 1);
  }
  return counts;
}

function localWorkspaceCounts (groups: readonly ConversationGroup[]): Map<string, number> {
  const workspacesById = new Map<string, Set<string>>();
  for (const group of groups) {
    for (const occurrence of group.occurrences) {
      if (occurrence.provider !== 'local')
        continue;
      if (occurrence.backing.status === 'unresolved'
        && occurrence.backing.reason === 'Local index entry has no journal.')
        continue;
      const workspaces = workspacesById.get(occurrence.sessionId) ?? new Set<string>();
      workspaces.add(occurrence.provenance.workspaceStoragePath);
      workspacesById.set(occurrence.sessionId, workspaces);
    }
  }
  return new Map([...workspacesById].map(([id, workspaces]) => [id, workspaces.size]));
}

function diagnosticCounts (
  occurrences: readonly SessionOccurrence[],
  diagnostics: readonly InventoryDiagnostic[] = [],
) {
  const distinct = new Map<string, InventoryDiagnostic['category']>();
  for (const occurrence of occurrences) {
    for (const diagnostic of occurrence.diagnostics)
      distinct.set(`${diagnostic.category}:${diagnostic.description}`, diagnostic.category);
  }
  for (const diagnostic of diagnostics)
    distinct.set(`${diagnostic.category}:${diagnostic.description}`, diagnostic.category);
  return {
    issues: distinct.size,
    identityWarnings: new Set(occurrences.flatMap((occurrence) =>
      occurrence.backing.status === 'verified' && occurrence.backing.source.kind === 'sdk-events'
        ? occurrence.backing.source.identityWarnings : [])).size,
    scopeWarnings: new Set(occurrences.flatMap((occurrence) =>
      occurrence.backing.status === 'verified' && occurrence.backing.source.kind === 'sdk-events'
        ? occurrence.backing.source.scopeWarnings : [])).size,
  };
}

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
  const titleWidth = Math.max(12, terminalWidth - (76 + idWidth));
  const headings = ['CREATED', 'UPDATED', 'PROMPTS', 'TYPE', 'ID/PREFIX', 'TITLE', 'STATUS'];
  const widths = [10, 10, 7, 11, idWidth, titleWidth, 20];
  const renderLine = (cells: string[]) => cells.map((cell, index) => fit(cell, widths[index])).join(' | ');
  const lines = [
    options.showIgnored
      ? `Showing ${shown.length} of ${candidates.length} total conversations (${eligible.length} eligible before ignored filters)${options.last25 ? ' (newest 25)' : ''}.`
      : `Showing ${shown.length} of ${candidates.length} eligible conversations${options.last25 ? ' (newest 25)' : ''}.`,
    `${occurrences.length} source occurrences; ${occurrences.length - groups.length} duplicate occurrences grouped.`,
    '',
    renderLine(headings),
    renderLine(widths.map((width) => '-'.repeat(width))),
  ];
  for (const group of shown) {
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
      dateCell(group.createdTimestamp),
      dateCell(group.activityTimestamp),
      group.promptCount === null ? 'unknown' : String(group.promptCount),
      sessionType(session),
      options.fullIds ? session.sessionId : ids.get(session.sessionId) ?? session.sessionId,
      session.title || '(untitled)',
      selectorStatus,
    ]));
  }
  if (shown.length === 0)
    lines.push('(no conversations to show)');
  const ignoredSummary = [...ignored.entries()].map(([reason, count]) => `${count} ${reason}`).join(', ');
  ignoredSummary && lines.push(`Ignored by default: ${ignoredSummary}.`);
  const ambiguousChildren = groups.filter((group) =>
    group.visibility.status === 'hidden' && group.visibility.reason === 'ambiguous'
    && group.representative.sessionId.includes('#subagent/')).length;
  ambiguousChildren > 0 && lines.push(`🟠 ❓ ${ambiguousChildren} ambiguous child scope(s) are hidden; verified parent conversations remain listed.`);
  const diagnostics = diagnosticCounts(occurrences, options.diagnostics);
  const warningParts = [
    diagnostics.issues > 0 ? `${diagnostics.issues} distinct source issue(s)` : '',
    diagnostics.identityWarnings > 0 ? `${diagnostics.identityWarnings} identity warning(s)` : '',
    diagnostics.scopeWarnings > 0 ? `${diagnostics.scopeWarnings} child-scope warning(s)` : '',
  ].filter(Boolean);
  warningParts.length > 0 && lines.push(`Warnings: ${warningParts.join(', ')}. Detailed storage paths are omitted.`);
  lines.push('Type: local = VS Code journal; agent = Agent Host main chat; sub-agent = child chat entry; CLI agent = Copilot CLI. Status shows whether its backing is verified.');
  lines.push('Status: verified = backing identity checked; unresolved = no verified chat backing; ambiguous (🟠 ❓) = multiple possible mappings. “path required” means this Local ID exists in multiple workspaces.');
  lines.push('Unknown dates/counts mean the source has no trustworthy value, not zero. New Chat rows with unknown creation and prompt count are hidden by default; use --show-ignored to include them.');
  lines.push('Use a verified Local ID/prefix from the ID / PREFIX column as the export selector. Unresolved rows have no verified export source; use an exact .jsonl path when status says “path required”.');
  lines.push('Prompt counts: main user prompts; child counts add one delegation plus recorded child user prompts.');
  lines.push('', 'Export a verified Local source: copilot-chat-export <sessionId> [outputPath] --user-data-root <path>');
  lines.push('Export current Local source: copilot-chat-export --current [outputPath] --user-data-root <path>');
  lines.push('Verified SDK backing does not yet imply Markdown export support.');
  return lines.join('\n');
}

function escapeHtml (value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function localDateCell (timestamp: number | null): string {
  if (timestamp === null || !Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime()))
    return 'unknown';
  const date = new Date(timestamp);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(date.getFullYear() % 100)}${two(date.getMonth() + 1)}${two(date.getDate())}_${two(date.getHours())}:${two(date.getMinutes())}`;
}

function pathLink (filePath: string): string {
  return `<a href="${escapeHtml(pathToFileURL(filePath).href)}"><code>${escapeHtml(filePath)}</code></a>`;
}

function sourceDetails (group: ConversationGroup): string {
  return group.occurrences.map((item, index) => {
    const provenance = item.provenance;
    const identity = provenance.workspaceIdentity;
    const storageId = path.basename(provenance.workspaceStoragePath);
    let workspaceName = 'unknown';
    if (identity) {
      const uri = new URL(identity.uri);
      workspaceName = decodeURIComponent(uri.pathname.split('/').filter(Boolean).at(-1) ?? '') || 'unknown';
    }
    const workspaceLink = identity?.uri.startsWith('file:')
      ? `<a href="${escapeHtml(identity.uri)}">${escapeHtml(identity.uri)}</a>`
      : escapeHtml(identity?.uri ?? 'unknown');
    const backing = item.backing;
    return `<section class="source-occurrence"><h3>Source ${index + 1} <span class="muted">${escapeHtml(workspaceName)}</span></h3><div class="source-grid"><section class="source-card"><h4>Conversation identity</h4><dl class="source-fields">
<dt>Full session ID</dt><dd><code>${escapeHtml(item.sessionId)}</code></dd>
<dt>Occurrence ID</dt><dd><code>${escapeHtml(item.occurrenceId)}</code></dd>
${backing.status === 'verified' ? `<dt>Backing session ID</dt><dd><code>${escapeHtml(backing.source.sessionId)}</code></dd>` : ''}
${item.parentOccurrenceId ? `<dt>Parent occurrence ID</dt><dd><code>${escapeHtml(item.parentOccurrenceId)}</code></dd>` : ''}
<dt>Title / activity evidence</dt><dd>${escapeHtml(item.titleSource)} / ${escapeHtml(item.activitySource)}</dd>
${provenance.indexKey ? `<dt>Index key</dt><dd><code>${escapeHtml(provenance.indexKey)}</code></dd>` : ''}
</dl></section><section class="source-card"><h4>Workspace / project</h4><dl class="source-fields">
<dt>Workspace ID (storage hash)</dt><dd><code>${escapeHtml(storageId)}</code></dd>
<dt>Workspace name (URI basename)</dt><dd>${escapeHtml(workspaceName)}</dd>
<dt>Project / folder name</dt><dd>${escapeHtml(identity?.kind === 'folder' ? workspaceName : 'unknown (multi-root folders not inspected)')}</dd>
<dt>Workspace identity</dt><dd>${escapeHtml(identity?.kind ?? 'unknown')} - ${workspaceLink}</dd>
</dl></section><section class="source-card"><h4>Files / locations</h4><dl class="source-fields">
${backing.status === 'verified' ? `<dt>${backing.source.kind === 'local-journal' ? 'Journal JSONL' : 'SDK events JSONL'}</dt><dd>${pathLink(backing.source.path)}</dd>` : `<dt>Backing issue</dt><dd>${escapeHtml(backing.reason)}</dd>`}
<dt>Workspace storage</dt><dd>${pathLink(provenance.workspaceStoragePath)}</dd>
<dt>Workspace metadata</dt><dd>${pathLink(path.join(provenance.workspaceStoragePath, 'workspace.json'))}</dd>
<dt>User-data root</dt><dd>${pathLink(provenance.userDataRoot)}</dd>
${provenance.indexKey ? `<dt>Index database</dt><dd>${pathLink(path.join(provenance.workspaceStoragePath, 'state.vscdb'))}</dd>` : ''}
</dl></section></div>
${item.diagnostics.length ? `<div class="source-notes"><h4>Source issues</h4><dl class="source-fields">
${item.diagnostics.map((diagnostic) => `<dt>${escapeHtml(diagnostic.category)}</dt><dd>${escapeHtml(diagnostic.description)}<br>${pathLink(diagnostic.path)}</dd>`).join('')}
</dl></div>` : ''}</section>`;
  }).join('');
}

function listingStatus (group: ConversationGroup): string {
  if (group.visibility.status === 'hidden')
    return group.visibility.reason === 'ambiguous' ? 'ambiguous' : `ignored: ${group.visibility.reason}`;
  return group.representative.backing.status;
}

function statusExplanation (group: ConversationGroup): string {
  const session = group.representative;
  if (group.visibility.status === 'hidden') {
    if (group.visibility.reason === 'new-chat-unknown')
      return 'Hidden by the New Chat placeholder filter because both created date and prompt count are unknown. This does not prove the chat is empty.';
    if (group.visibility.reason === 'ambiguous')
      return 'The exporter could not safely choose one provider backing or child-agent scope.';
    return `Hidden by the default ${group.visibility.reason} filter.`;
  }
  const backing = session.backing;
  if (backing.status !== 'verified') {
    return backing.status === 'unsupported'
      ? 'The index entry uses a provider key this exporter does not currently know how to resolve.'
      : 'The index/reference exists, but no conversation backing was verified. The referenced file may be missing, unreadable, unsupported, or its identity mapping may be unavailable.';
  }
  if (backing.source.kind === 'local-journal')
    return 'A Local chat journal was found and its stored session ID was checked against this listing entry.';
  if (backing.source.scope.kind === 'subagent')
    return 'SDK event backing and the persisted parent-tool-call to child-agent mapping were verified.';
  return 'SDK event backing and the persisted provider-to-session identity were verified.';
}

function chartRows (counts: Map<string, number>, total: number, label: (value: string) => string = (value) => value): string {
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => {
      const percent = total === 0 ? 0 : Math.round(count * 100 / total);
      return `<div class="chart-row"><span>${escapeHtml(label(key))}</span><span class="bar" aria-label="${percent}%"><i style="width:${percent}%"></i></span><strong>${count}</strong></div>`;
    }).join('\n');
}

/** Self-contained offline inventory report, using the same grouping and filters as the console. */
export function formatSessionListingHtml (
  occurrences: readonly SessionOccurrence[],
  options: SessionListingOptions = {},
  generatedAt = new Date().toISOString(),
): string {
  const groups = groupOccurrences(occurrences);
  const eligible = groups.filter((group) => group.visibility.status === 'included');
  const candidates = options.showIgnored ? groups : eligible;
  const shown = options.last25 ? candidates.slice(0, 25) : candidates;
  const ids = shortIds(groups);
  const localCounts = localWorkspaceCounts(groups);
  const statuses = new Map<string, number>();
  const types = new Map<string, number>();
  for (const group of groups) {
    const status = listingStatus(group);
    const type = sessionType(group.representative);
    statuses.set(status, (statuses.get(status) ?? 0) + 1);
    types.set(type, (types.get(type) ?? 0) + 1);
  }
  const hiddenCount = groups.length - eligible.length;
  const root = occurrences[0]?.provenance.userDataRoot ?? 'selected VS Code user-data root';
  const renderRows = (rows: readonly ConversationGroup[], tableId: string) => rows.map((group, index) => {
    const session = group.representative;
    const isPathRequired = session.provider === 'local' && (localCounts.get(session.sessionId) ?? 0) > 1;
    const selector = options.fullIds || !UUID.test(session.sessionId)
      ? session.sessionId : ids.get(session.sessionId) ?? session.sessionId;
    const sourcePaths = isPathRequired
      ? group.occurrences.flatMap((item) => item.backing.status === 'verified' && item.backing.source.kind === 'local-journal'
        ? [item.backing.source.path] : [])
      : [];
    const details = [
      `<p class="callout">${escapeHtml(statusExplanation(group))}</p>`,
      sourceDetails(group),
      isPathRequired ? `<p><strong>This ID occurs in multiple workspaces.</strong> Select the exact journal file:</p><ul>${sourcePaths.map((file) => `<li>${pathLink(file)}</li>`).join('')}</ul>` : '',
      group.childWarnings > 0 ? `<p>${group.childWarnings} child scope(s) have unresolved identity evidence; the verified parent remains available.</p>` : '',
    ].filter(Boolean).join('');
    const promptCount = group.promptCount === null ? 'unknown' : String(group.promptCount);
    const title = session.title || '(untitled)';
    const status = listingStatus(group);
    const detailsId = `${tableId}-source-${index}`;
    const rowText = [sessionType(session), selector, session.sessionId, title, status, promptCount,
      localDateCell(group.createdTimestamp), localDateCell(group.activityTimestamp)].join(' ');
    return `<tr data-type="${escapeHtml(sessionType(session))}" data-details="${detailsId}" data-status="${escapeHtml(status)}" data-search="${escapeHtml(rowText.toLocaleLowerCase())}">
      <td class="datetime" data-timestamp="${group.createdTimestamp ?? ''}">${escapeHtml(localDateCell(group.createdTimestamp))}</td>
      <td class="datetime" data-timestamp="${group.activityTimestamp ?? ''}">${escapeHtml(localDateCell(group.activityTimestamp))}</td>
      <td class="numeric"><strong>${escapeHtml(promptCount)}</strong></td>
      <td><span class="type-badge">${escapeHtml(sessionType(session))}</span></td>
      <td><code class="selector">${escapeHtml(selector)}</code> <button class="copy" type="button" data-copy="${escapeHtml(selector)}" aria-label="Copy selector for ${escapeHtml(title)}">Copy</button>${isPathRequired ? '<strong class="path-required">path required</strong>' : ''}</td>
      <td class="title-cell">${escapeHtml(title)}</td>
      <td><span class="status status-${session.backing.status}">${escapeHtml(session.backing.status)}</span>${status !== session.backing.status ? `<span class="status status-filter">${escapeHtml(status)}</span>` : ''}<button class="source-toggle" type="button" aria-expanded="false" aria-controls="${detailsId}" hidden>Why / source</button></td>
    </tr>
    <tr class="source-detail-row" id="${detailsId}"><td colspan="7"><details class="row-details"><summary>Why / source: ${escapeHtml(title)}</summary><div class="source-panel"><div class="source-panel-heading"><h3>${escapeHtml(title)}</h3><button class="source-close" type="button" hidden>Close details</button></div>${details}</div></details></td></tr>`;
  }).join('\n');
  const tableRows = renderRows(shown, 'sessions');
  const ignoredRows = renderRows(groups.filter((group) => group.visibility.status === 'hidden'), 'ignored');
  const generated = new Date(generatedAt);
  if (!Number.isFinite(generated.getTime()))
    throw new Error('Listing report generatedAt must be a valid timestamp.');
  const typeOptions = [...new Set(shown.map((group) => sessionType(group.representative)))].sort();
  const statusOptions = [...new Set(shown.map(listingStatus))].sort();
  const summary = options.showIgnored
    ? `Showing ${shown.length} of ${candidates.length} conversations, including ignored rows.`
    : `Showing ${shown.length} of ${candidates.length} eligible conversations. ${hiddenCount} ignored by default.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VS Code Copilot chat inventory</title>
<style>
:root{color-scheme:light dark;font:16px/1.5 system-ui,Segoe UI,sans-serif;--bg:#f4f7fb;--card:#fff;--ink:#182536;--muted:#5d6b7c;--line:#d9e1ec;--accent:#1769aa;--soft:#eaf3fc;--warn:#8a4b00;--good:#19734a;--bad:#9b2c2c}
@media(prefers-color-scheme:dark){:root{--bg:#111923;--card:#1b2735;--ink:#e5edf7;--muted:#a5b3c3;--line:#344456;--accent:#79baff;--soft:#223b52;--warn:#ffd08b;--good:#8ce0b1;--bad:#ffaaaa}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink)}main{max-width:1480px;margin:auto;padding:clamp(1rem,3vw,2.5rem)}a{color:var(--accent)}header,.panel,.metric,.guide{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 4px 20px #142c4510}header{padding:1.5rem 1.75rem;border-top:5px solid var(--accent)}h1{margin:.1rem 0;font-size:clamp(1.6rem,3vw,2.3rem)}h2{font-size:1.25rem;margin:0 0 .7rem}.eyebrow{color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:.78rem}.muted,.caption{color:var(--muted)}.top-link{display:inline-block;margin-top:.5rem;font-weight:650}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:.75rem;margin:1rem 0}.metric{padding:1rem 1.1rem}.metric strong{display:block;font-size:1.65rem;line-height:1.2}.metric span{color:var(--muted);font-size:.88rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}.panel{padding:1.1rem 1.25rem;margin-bottom:1rem}.chart-row{display:grid;grid-template-columns:minmax(95px,150px) 1fr 2.5rem;gap:.65rem;align-items:center;margin:.48rem 0;font-size:.9rem}.bar{height:.65rem;border-radius:2rem;background:var(--soft);overflow:hidden}.bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent),#5dc4bb)}.chart-row strong{text-align:right}.controls{display:flex;flex-wrap:wrap;gap:.65rem;align-items:center}.controls label{display:flex;gap:.45rem;align-items:center;font-weight:600}.controls input,.controls select{min-height:2.4rem;padding:.4rem .65rem;border:1px solid var(--line);border-radius:7px;background:var(--card);color:var(--ink)}#search{flex:1;min-width:220px}button{font:inherit;color:var(--ink);background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:.25rem .55rem;cursor:pointer}button:hover{border-color:var(--accent)}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px}table{width:100%;border-collapse:collapse;min-width:1050px;background:var(--card)}th,td{text-align:left;padding:.65rem .7rem;border-bottom:1px solid var(--line);vertical-align:top}th{position:sticky;top:0;background:var(--soft);z-index:1;white-space:nowrap}th button{font-weight:700;background:transparent;border:0;padding:0}.numeric{text-align:right;font-variant-numeric:tabular-nums}.title-cell{font-weight:600;min-width:180px}.selector{font-size:.9rem;user-select:all;overflow-wrap:anywhere}.type-badge,.status{display:inline-block;padding:.12rem .48rem;border-radius:1rem;font-size:.78rem;font-weight:700;background:var(--soft);white-space:nowrap}.status-verified{color:var(--good)}.status-unresolved,.status-unsupported{color:var(--warn)}.status-ambiguous,.status-filter,.path-required{color:var(--bad)}.status-filter{display:block;width:max-content;margin-top:.25rem}.path-required{display:block;font-size:.76rem;margin-top:.3rem}.row-details{margin-top:.45rem;max-width:340px;font-size:.84rem}.row-details summary,.guide>summary{cursor:pointer;color:var(--accent);font-weight:650}.row-details code,.tree code{overflow-wrap:anywhere}.copy{font-size:.75rem}.diagram{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.65rem;align-items:stretch;margin:1rem 0}.node{border:1px solid var(--line);border-radius:10px;padding:.8rem;background:var(--soft);position:relative}.node strong{display:block}.node:not(:last-child):after{content:'→';position:absolute;right:-.65rem;top:40%;z-index:2;color:var(--accent);font-weight:900}@media(max-width:650px){.node:not(:last-child):after{content:'↓';right:48%;top:auto;bottom:-1rem}.diagram{grid-template-columns:1fr}.chart-row{grid-template-columns:100px 1fr 2rem}}.tree{overflow:auto;background:var(--bg);border:1px solid var(--line);padding:1rem;border-radius:8px;font: .88rem/1.5 ui-monospace,Consolas,monospace}.guide{margin-top:1.25rem;padding:1rem 1.3rem}.guide[open]{padding-bottom:1.5rem}.guide-content{padding-top:.8rem}.guide table{min-width:0}.guide td:first-child{font-weight:700;white-space:nowrap}.callout{border-left:4px solid var(--accent);padding:.65rem .9rem;background:var(--soft);border-radius:0 8px 8px 0}.warning{border-left-color:#d99b2b}footer{color:var(--muted);font-size:.85rem;padding:1.2rem 0}.empty{text-align:center;padding:2rem;color:var(--muted)}
</style>
<style>
.datetime,.selector{font-family:"Arial Narrow",Arial,sans-serif;font-size:.8rem}.datetime{white-space:nowrap;font-variant-numeric:tabular-nums}.source-fields{margin:.7rem 0}.source-fields dt{font-weight:700;margin-top:.45rem}.source-fields dd{margin:0;overflow-wrap:anywhere}.row-details{max-width:430px}.source-fields code{font-family:"Arial Narrow",Arial,sans-serif;font-size:.8rem}
[hidden]{display:none!important}.source-toggle{display:block;margin-top:.5rem;font-size:.85rem;color:var(--accent)}.source-toggle[aria-expanded=true]{font-weight:700}.source-detail-row>td{padding:.9rem;background:var(--bg);border-bottom:2px solid var(--accent)}.source-detail-row .row-details{max-width:none;margin:0;font-size:.9rem}.source-panel{padding:.7rem}.source-panel-heading{display:flex;justify-content:space-between;gap:1rem;align-items:center}.source-panel h3{margin:.3rem 0;overflow-wrap:anywhere}.source-occurrence{margin-top:1rem}.source-occurrence>h3{font-size:1rem}.source-occurrence>h3 span{font-weight:400;margin-left:.5rem}.source-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr);gap:.8rem}.source-card{min-width:0;padding:1rem;background:var(--card);border:1px solid var(--line);border-radius:10px}.source-card h4,.source-notes h4{margin:0;color:var(--accent)}.source-notes{margin-top:.8rem;padding:.8rem;border-left:3px solid var(--warn)}.source-fields code{font-size:.9rem}.source-fields dt{color:var(--muted);font-size:.78rem}.source-fields dd{margin:.15rem 0 .65rem}.source-close{font-size:.8rem;white-space:nowrap}.source-detail-row.enhanced summary{display:none}@media(max-width:900px){.source-grid{grid-template-columns:1fr}}
.source-detail-row>td,.guide .source-detail-row>td{white-space:normal;font-weight:400}
</style>
</head>
<body><main>
<header><div class="eyebrow">Local, read-only inventory</div><h1>VS Code Copilot chat sessions</h1><p>${escapeHtml(summary)} This report was generated <span class="datetime">${escapeHtml(localDateCell(generated.getTime()))}</span> for <code>${escapeHtml(root)}</code>. Dates use the report generator's local time (${escapeHtml(Intl.DateTimeFormat().resolvedOptions().timeZone)}).</p><a class="top-link" href="#storage-guide" data-open-guide>How storage, IDs, and statuses work ↓</a> · <a href="#ignored-sessions" data-open-ignored>Ignored sessions (${hiddenCount}) ↓</a></header>
<section class="metrics" aria-label="Inventory totals">
<div class="metric"><strong>${groups.length}</strong><span>grouped rows</span></div><div class="metric"><strong>${occurrences.length}</strong><span>workspace/provider references</span></div><div class="metric"><strong>${eligible.length}</strong><span>eligible before default filters</span></div><div class="metric"><strong>${hiddenCount}</strong><span>hidden by default</span></div><div class="metric"><strong>${shown.length}</strong><span>main-table rows</span></div>
</section>
<section class="grid" aria-label="Inventory charts">
<div class="panel"><h2>Backing status</h2><p class="caption">Grouped rows, not physical files.</p>${chartRows(statuses, groups.length, (value) => value.replace('ignored: ', 'Hidden: ')) || '<p>No rows discovered.</p>'}</div>
<div class="panel"><h2>Chat types</h2><p class="caption">Type describes the source family or verified child scope.</p>${chartRows(types, groups.length) || '<p>No rows discovered.</p>'}</div>
</section>
<section class="panel"><h2>Find a session</h2><div class="controls"><label for="search">Search</label><input id="search" type="search" placeholder="Title, ID, type, status"><label for="type-filter">Type</label><select id="type-filter"><option value="">All types</option>${typeOptions.map((type) => `<option>${escapeHtml(type)}</option>`).join('')}</select><label for="status-filter">Status</label><select id="status-filter"><option value="">All statuses</option>${statusOptions.map((status) => `<option>${escapeHtml(status)}</option>`).join('')}</select><button id="reset" type="button">Reset filters</button><span id="row-count" aria-live="polite">${shown.length} rows</span></div><p class="caption">Select/copy a verified Local ID prefix for export. Rows marked “path required” show the exact journal path in their details. File links point to recorded or expected local locations; they do not confirm that a path still exists. Your browser may restrict opening local files.</p></section>
<section class="panel"><h2>Sessions</h2><div class="table-wrap"><table id="sessions"><thead><tr>${[['created','Created'],['updated','Updated'],['prompts','Prompts'],['type','Type'],['selector','ID / selector'],['title','Title'],['status','Backing / visibility']].map(([key,label]) => `<th scope="col"><button type="button" data-sort="${key}">${label} ↕</button></th>`).join('')}</tr></thead><tbody>${tableRows || '<tr><td colspan="7" class="empty">No sessions match the selected listing options.</td></tr>'}</tbody></table></div></section>
<details class="guide" id="storage-guide"><summary>How VS Code stores chats, why values can be unknown, and what the status labels mean</summary><div class="guide-content">
<p>This inventory reads local metadata and conversation files from the selected VS Code user-data root. It does not edit VS Code storage, start an agent, fetch remote chats, or reconstruct deleted content. Storage layouts are version-sensitive; this report explains the files the exporter currently checks, not a guarantee that every profile, remote host, or future format is covered.</p>
<h2>Local chat: workspace index → journal</h2>
<div class="diagram" role="img" aria-label="VS Code user data root contains workspaceStorage, each workspace contains a state database and chatSessions journals, and the exporter checks matching IDs"><div class="node"><strong>VS Code user-data root</strong><code>Code/User/</code></div><div class="node"><strong>Workspace folder</strong><code>workspaceStorage/&lt;workspace-hash&gt;/</code></div><div class="node"><strong>Metadata index</strong><code>state.vscdb</code><br>titles and some activity dates</div><div class="node"><strong>Chat journal</strong><code>chatSessions/&lt;session-id&gt;.jsonl</code><br>recorded turns and creation evidence</div></div>
<p>The index and journal answer different questions. The index is useful for the current displayed title and can contain a reference after its journal is gone. The journal is the source checked for Local prompt count and recorded creation time. The exporter only calls a Local entry empty when it successfully reads a valid journal and confirms there are no requests or pending edits.</p>
<h2>Agent Host / Copilot SDK: references → event log</h2>
<div class="tree"><code>Code/User/globalStorage/agent-host.db</code>  (session_chats catalog: chat URI → provider backing)
Code/User/agentSessionData/&lt;chat-key&gt;/session.db  (chat-specific identity metadata)
                 │ exact persisted mapping
                 ▼
%USERPROFILE%/.copilot/session-state/&lt;sdk-session-id&gt;/events.jsonl
                 └─ session.start header must match the backing ID and supported version</div>
<p>These provider chats are not Local journals. A provider/index row is only a reference until the exporter can follow its persisted mapping to a valid SDK event log. Agent Host sessions may also contain peer chats and sub-agent scopes; a child needs recorded parent-tool-call and agent identity evidence. <code>COPILOT_HOME</code> can change the SDK state directory.</p>
<h2>What the statuses mean</h2><div class="table-wrap"><table><thead><tr><th>Status</th><th>Plain-language meaning</th><th>What to do</th></tr></thead><tbody>
<tr><td>verified</td><td>The matching journal/event backing was found and its identity checked. This verifies the source, not necessarily that the provider can already be exported to Markdown.</td><td>For a Local row, copy its ID/prefix. For unsupported provider export, wait for SDK export support.</td></tr>
<tr><td>unresolved</td><td>A reference exists, but there is no verified backing. The journal/events file may be missing, unreadable, malformed, unsupported, or its mapping may not be available. This is not proof the chat was deleted.</td><td>Check the correct VS Code root/profile and whether the referenced file still exists. <code>--show-ignored</code> does not repair missing data.</td></tr>
<tr><td>ambiguous · 🟠 ❓</td><td>More than one candidate matched, or a persisted parent-tool-call ↔ sub-agent mapping was incomplete/conflicting. The exporter refuses to attach a possibly wrong chat.</td><td>Keep an independently verified parent; do not infer a child transcript from its title or nearby files.</td></tr>
<tr><td>unsupported</td><td>The index key is recognized as an external/unknown provider family, but this exporter has no resolver for it.</td><td>Its metadata can be listed, but its conversation cannot be verified or exported here.</td></tr>
<tr><td>path required</td><td>The same Local UUID has journal files in multiple workspace-hash folders. The UUID alone does not identify which file to export.</td><td>Expand “Why / source” and pass the exact <code>chatSessions/&lt;id&gt;.jsonl</code> path.</td></tr>
<tr><td>ignored</td><td>A listing rule hid the row, such as <code>/fix</code>, confirmed-empty, ambiguous, or the selected New Chat placeholder rule.</td><td>Expand “Ignored sessions” at the bottom. Use <code>--show-ignored</code> to also include these rows in the main table and console.</td></tr>
</tbody></table></div>
<h2>Why values can be unknown</h2><div class="callout"><strong>Unknown is not zero.</strong> A count of <code>0</code> means a verified backing was read and contained zero counted prompts. <code>unknown</code> means the exporter lacks enough trustworthy evidence to calculate a value.</div>
<ul><li><strong>Created date unknown:</strong> the Local journal has no usable creation timestamp, or the row has no readable journal. SDK creation time comes from a verified session-start record; a resumed or malformed source may not supply a trustworthy original date.</li><li><strong>Prompt count unknown:</strong> no verified journal/event scope exists, or recorded provider prompt data is malformed/incomplete. Delegated tool instructions are not counted as extra parent human prompts.</li><li><strong>Activity date unknown:</strong> neither a trustworthy index date nor a recorded journal/event timestamp was available. The file's modified time is not treated as the conversation's true activity date.</li></ul>
<h2>Why multiple workspaces happen</h2><p>VS Code stores Local chat journals below each workspace hash. The same UUID can therefore appear under two separate workspace folders, for example after workspace changes, copies, migration, or retained index/journal data. Similar IDs or titles do not prove two records are the same conversation. When the ID appears more than once, the exporter deliberately asks for the exact journal path rather than choosing one by recency.</p>
<h2>How to use the selector</h2><ol><li>Copy the value in <strong>ID / selector</strong> for a verified Local row.</li><li>Pass it as the first argument to the exporter, for example <code>node .\\dist\\cli.js 1a2b3c4d docs\\chat-exports\\session.md --user-data-root "C:\\Users\\you\\AppData\\Roaming\\Code"</code>.</li><li>If the row says <strong>path required</strong>, copy one exact journal path from its details instead. A shortened ID is never used to guess between multiple workspace files.</li></ol>
<p class="callout warning"><strong>Coverage limit:</strong> current discovery covers the selected root's <code>User/workspaceStorage</code> entries and the provider backings that can be verified from local metadata. It does not claim full coverage of other VS Code profiles, remote/cloud storage, missing/rotated journals, or future storage schemas.</p>
</div></details>
<details class="guide" id="ignored-sessions"><summary>Ignored sessions (${hiddenCount})</summary><div class="guide-content"><p>All grouped sessions hidden by the default rules, including their reasons and source details. This section is independent of the main table's filters and newest-25 limit. With --show-ignored, these rows also appear in the main table.</p><div class="table-wrap"><table id="ignored-table"><thead><tr><th>Created</th><th>Updated</th><th>Prompts</th><th>Type</th><th>ID / selector</th><th>Title</th><th>Backing / visibility</th></tr></thead><tbody>${ignoredRows || '<tr><td colspan="7" class="empty">No ignored sessions.</td></tr>'}</tbody></table></div></div></details>
<footer>Generated locally by copilot-chat-exporter. Self-contained HTML; no external libraries, fonts, images, or network requests. The counters describe this inventory snapshot, not a count of every physical chat file or every chat ever created.</footer>
</main>
<script>
(() => {
  const table=document.querySelector('#sessions'), body=table.tBodies[0], rows=[...body.rows].filter(row=>row.dataset.search!==undefined), search=document.querySelector('#search'), type=document.querySelector('#type-filter'), status=document.querySelector('#status-filter'), counter=document.querySelector('#row-count');
  const panels=new Map();
  for(const button of document.querySelectorAll('button.source-toggle')){
    const panel=document.getElementById(button.getAttribute('aria-controls')),details=panel.querySelector('details'),close=panel.querySelector('.source-close');
    panels.set(panel.id,{panel,details,button});
    panel.hidden=true;panel.classList.add('enhanced');button.hidden=false;close.hidden=false;
    const toggle=(open)=>{details.open=open;panel.hidden=!open;button.setAttribute('aria-expanded',String(open));};
    button.addEventListener('click',()=>toggle(!details.open));
    close.addEventListener('click',()=>{toggle(false);button.focus();});
  }
  const apply=()=>{let count=0;for(const row of rows){const match=(!search.value||row.dataset.search.includes(search.value.toLocaleLowerCase()))&&(!type.value||row.dataset.type===type.value)&&(!status.value||row.dataset.status===status.value);row.hidden=!match;const entry=panels.get(row.dataset.details);entry.panel.hidden=!match||!entry.details.open;if(match)count+=1;}counter.textContent=count+' of '+rows.length+' rows';};
  search.addEventListener('input',apply);type.addEventListener('change',apply);status.addEventListener('change',apply);document.querySelector('#reset').addEventListener('click',()=>{search.value='';type.value='';status.value='';apply();});
  for(const button of table.querySelectorAll('th button[data-sort]'))button.addEventListener('click',()=>{const key=button.dataset.sort,index=[...button.closest('tr').cells].indexOf(button.closest('th'));const direction=button.dataset.direction==='asc'?'desc':'asc';button.dataset.direction=direction;const sorted=[...rows].sort((a,b)=>{const dates=key==='created'||key==='updated',x=dates?a.cells[index].dataset.timestamp:a.cells[index].innerText.trim(),y=dates?b.cells[index].dataset.timestamp:b.cells[index].innerText.trim(),xu=!x||x==='unknown',yu=!y||y==='unknown';if(xu||yu)return xu?(yu?0:1):-1;const cmp=dates||key==='prompts'?Number(x)-Number(y):x.localeCompare(y,undefined,{numeric:true,sensitivity:'base'});return direction==='asc'?cmp:-cmp;});for(const row of sorted)body.append(row,panels.get(row.dataset.details).panel);rows.splice(0,rows.length,...sorted);apply();});
  for(const button of document.querySelectorAll('button.copy'))button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copy);button.textContent='Copied';setTimeout(()=>button.textContent='Copy',1200);}catch{button.textContent='Select text';}});
  const guide=document.querySelector('#storage-guide'),openGuide=()=>{if(location.hash==='#storage-guide')guide.open=true;};document.querySelector('[data-open-guide]').addEventListener('click',()=>{guide.open=true;});window.addEventListener('hashchange',openGuide);openGuide();
  const ignored=document.querySelector('#ignored-sessions'),openIgnored=()=>{if(location.hash==='#ignored-sessions')ignored.open=true;};document.querySelector('[data-open-ignored]').addEventListener('click',()=>{ignored.open=true;});window.addEventListener('hashchange',openIgnored);openIgnored();
})();
</script>
</body></html>`;
}
