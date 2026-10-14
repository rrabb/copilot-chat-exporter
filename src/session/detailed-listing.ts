import { createHash } from 'node:crypto';
import path from 'node:path';
import { redactText } from '../redaction.ts';
import type { SessionOccurrence } from './sources.ts';
import { groupOccurrences, localWorkspaceCounts, sessionType, shortIds } from './listing-model.ts';
import type { ConversationGroup, SessionListingOptions } from './listing-model.ts';
import { escapeHtml as html, pathLink, chartRows, storageGuideHtml } from './listing-html.ts';
import { renderDetailedSource, storageBytes } from './detailed-source.ts';
import { attentionFlags, renderAttentionPanel } from './detailed-attention.ts';
import { formatLocalListingDate as date, formatListingTurnDate, previewListingPrompt, listingModelLabel, sdkListingPromptOverview } from './listing-preview.ts';
import type { ListingEvidence, ListingFileChange } from './listing-evidence-types.ts';
import { listingRelationships } from './listing-relationships.ts';
import type { ListingRelationship } from './listing-relationships.ts';
import { detailedListingStyles } from './detailed-listing-styles.ts';
import { detailedListingController } from './detailed-listing-controller.ts';
import { listingFileIdentity } from './listing-edits.ts';
import { detailedChatType, detailedTypeOf, detailedTitle, detailedTitles, detailedWorkspace, detailedProjects, detailedHeaderId, detailedMetrics } from './detailed-listing-presentation.ts';
import { compactTokenCount, listingUsage } from './listing-usage.ts';
import type { ListingUsageMetric } from './listing-usage.ts';

const safe = (value: string) => html(redactText(value).text);
const unknownReasons = {
  1: 'no recorded value for this detail',
  2: 'the headline value could not be established from recorded evidence',
  3: 'the source could not be read or verified, so nothing is known for this conversation',
} as const;
/** One mark for a minor detail, two for a headline value, three when the whole source is unavailable. */
const unk = (level: 1 | 2 | 3, reason: string = unknownReasons[level]) => `<span class="unknown" title="${safe(`Unknown: ${reason}`)}" aria-label="unknown">${'?'.repeat(level)}</span>`;
const known = (value: number | null | undefined, level: 1 | 2 | 3 = 1) => value == null ? unk(level) : value.toLocaleString('en-US');
const bytes = (value: number | null | undefined, level: 1 | 2 | 3 = 1) => value == null ? unk(level) : storageBytes(value);
const when = (timestamp: number | null | undefined, level: 1 | 2 | 3, reason: string) => date(timestamp) === 'unknown' ? unk(level, reason) : date(timestamp);
// Symbol glyphs render tiny in Arial Narrow; the glyph class selects a symbol font.
const withGlyphs = (markup: string) => markup.replace(/↳|⑂\?/gu, (mark) => `<span class="glyph">${mark}</span>`);
const plural = (value: number, one: string, many = `${one}s`) => `${value.toLocaleString('en-US')} ${value === 1 ? one : many}`;
const tag = (value: string, title = '', tone = '') => `<span class="tag${tone ? ` tone-${tone}` : ''}"${title ? ` title="${safe(title)}"` : ''}>${withGlyphs(safe(value))}</span>`;
const uniqueFiles = (files: readonly ListingFileChange[]) => new Set(files.map((file) => listingFileIdentity(file.file))).size;
function day (timestamp: number | null | undefined): string {
  if (timestamp == null || !Number.isFinite(new Date(timestamp).getTime()))
    return '';
  const local = new Date(timestamp);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
}
function sumChanges (files: readonly ListingFileChange[]): string {
  const sum = (key: 'added' | 'removed') => files.some((file) => file[key] === null)
    ? '?' : String(files.reduce((total, file) => total + (file[key] ?? 0), 0));
  return `+${sum('added')} / -${sum('removed')}${files.some((file) => file.estimated) ? ' (estimated)' : ''}`;
}
function editTag (files: readonly ListingFileChange[]): string {
  const sum = (key: 'added' | 'removed') => files.some((file) => file[key] === null)
    ? '?' : known(files.reduce((total, file) => total + (file[key] ?? 0), 0));
  const count = uniqueFiles(files);
  return `<span class="tag edit-chip" title="Recorded changed files and submitted line changes${files.some((file) => file.estimated) ? '; includes estimates' : ''}">✏️ ${count} ${count === 1 ? 'file' : 'files'} · <span class="added">+${sum('added')}</span> <span class="removed">-${sum('removed')}</span>${files.some((file) => file.estimated) ? ' ≈' : ''}</span>`;
}
function typeTag (row: SessionOccurrence): string {
  const type = detailedChatType(row);
  return `<span class="tag type-${type.key}" title="${safe(`Chat type: ${sessionType(row)}; provider: ${row.provider}`)}">${withGlyphs(type.icon)} ${type.label}</span>`;
}
function fileTable (files: readonly ListingFileChange[]): string {
  return `<div class="table-wrap"><table><thead><tr><th>File</th><th>Operation</th><th>Added</th><th>Removed</th><th>Evidence / precision</th></tr></thead><tbody>${files.map((file) =>
    `<tr><td><code>${safe(file.file)}</code></td><td>${safe(file.operation)}</td><td class="added">${known(file.added)}</td><td class="removed">${known(file.removed)}</td><td>${file.estimated ? 'Estimated' : 'Recorded tool call'} · ${safe(file.source)}</td></tr>`).join('')}</tbody></table></div>`;
}
function field (name: string, value: string): string {
  return `<dt>${html(name)}</dt><dd>${value}</dd>`;
}
function table (headings: string[], rows: string[][]): string {
  return `<div class="table-wrap"><table><thead><tr>${headings.map((name) => `<th>${html(name)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function disclosure (title: string, content: string, className = ''): string {
  return `<details${className ? ` class="${className}"` : ''}><summary>${title}</summary><div>${content}</div></details>`;
}
/** A section with nothing or one line to show is a field line, not a disclosure. */
function fieldLine (title: string, value: string, hint = '', className = ''): string {
  return `<div class="field-line${className ? ` ${className}` : ''}"${hint ? ` title="${safe(hint)}"` : ''}><strong>${title}:</strong> ${value}</div>`;
}
function modelTag (models: readonly string[], compact = false): string {
  return models.length ? tag(`🤖 ${compact && models.length > 3 ? `${models.length} models` : models.map(listingModelLabel).join(' · ')}`,
    `Recorded answering-model IDs: ${models.join(', ')}`, 'model') : '';
}
function usageValue (metric: ListingUsageMetric): string {
  return metric.total === null ? '?'
    : `${metric.recorded < metric.turns ? '~' : ''}${Math.ceil(metric.total).toLocaleString('en-US')}`;
}
function usageCoverage (metric: ListingUsageMetric): string {
  return `${metric.recorded}/${metric.turns} counted turns have a valid recorded counter`;
}
function usageTags (usage: ReturnType<typeof listingUsage>): string {
  const tokens = (metric: ListingUsageMetric, arrow: string) => metric.total === null ? ''
    : `${arrow}${metric.recorded < metric.turns ? '~' : ''}${compactTokenCount(metric.total)}`;
  return [
    usage.credits.total !== null ? tag(`💳 ${usageValue(usage.credits)}c`,
      `Recorded incremental Copilot credits; ${usageCoverage(usage.credits)}. Partial values are prefixed with ~; rounded up to whole credits.`, 'credits') : '',
    usage.promptTokens.total !== null || usage.completionTokens.total !== null
      ? tag([tokens(usage.promptTokens, '⬆️'), tokens(usage.completionTokens, '⬇️')].filter(Boolean).join(' '),
        `⬆️ prompt (input) tokens: ${usageCoverage(usage.promptTokens)}. ⬇️ completion (output) tokens: ${usageCoverage(usage.completionTokens)}. Partial values are prefixed with ~; compact counts are rounded to the nearest displayed unit. Token counts include repeated context.`, 'credits') : '',
  ].join('');
}
function hasUsage (usage: ReturnType<typeof listingUsage>): boolean {
  return usage.credits.total !== null || usage.promptTokens.total !== null || usage.completionTokens.total !== null;
}
const usageUnavailableTag = () => tag('Usage unavailable', 'No supported recorded credit/token counters for these counted turns; SDK correlation is not implemented.', 'neutral');
function usageDisclosure (usage: ReturnType<typeof listingUsage>): string {
  if (!hasUsage(usage))
    return '';
  return disclosure('💳 Credits / 🔢 tokens', `<p>${usageTags(usage)}</p>${table(['Recorded metric', 'Counted-turn sum', 'Coverage / source'], [
    ['Copilot credits', safe(usageValue(usage.credits)), `${usageCoverage(usage.credits)} · <code>request.copilotCredits</code>`],
    ['⬆️ Prompt tokens (input)', safe(usageValue(usage.promptTokens)), `${usageCoverage(usage.promptTokens)} · <code>request.promptTokens</code>`],
    ['⬇️ Completion tokens (output)', safe(usageValue(usage.completionTokens)), `${usageCoverage(usage.completionTokens)} · <code>request.completionTokens</code>`],
  ])}<p class="caption">Sums cover counted Local requests only, once per conversation, not per workspace reference. Missing counters are unknown, not zero; partial sums are not complete session totals. SDK model-call usage, child completion totals and cumulative checkpoints are not yet correlated here. No conversion to credits or attribution of parent usage to children is performed. Token counts can include repeated context and are not unique text size.</p>`, 'usage-disclosure');
}

/** Pure renderer: supplied evidence is a snapshot; no storage, network or machine reads here. */
export function formatDetailedSessionListingHtml (
  occurrences: readonly SessionOccurrence[],
  evidence: ReadonlyMap<string, ListingEvidence>,
  options: SessionListingOptions = {},
  generatedAt = new Date().toISOString(),
): string {
  if (!Number.isFinite(Date.parse(generatedAt)))
    throw new Error('Detailed report generatedAt must be a valid timestamp.');
  const groups = groupOccurrences(occurrences);
  const metadata = (group: ConversationGroup) => group.occurrences.map((row) => evidence.get(row.occurrenceId))
    .find((item) => item?.state === 'read') ?? evidence.get(group.representative.occurrenceId);
  groups.sort((left, right) =>
    (detailedMetrics(right, metadata(right)).updated ?? -Infinity) - (detailedMetrics(left, metadata(left)).updated ?? -Infinity)
    || left.representative.sessionId.localeCompare(right.representative.sessionId));
  const ids = shortIds(groups);
  const workspaceCounts = localWorkspaceCounts(groups);
  const relationships = listingRelationships(groups, evidence);
  const anchors = new Map(groups.map((group, index) => [group.key, `session-${index + 1}`]));
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const titlesByGroup = new Map(groups.map((group) => [group.key, detailedTitles(group, evidence)]));
  const parentOf = (group: ConversationGroup) => {
    const key = relationships.find((edge) => edge.kind === 'parent' && edge.from === group.key)?.to;
    return key ? byKey.get(key) : undefined;
  };
  const titleFor = (group: ConversationGroup, seen = new Set<string>()): string => {
    if (seen.has(group.key) || seen.size >= 32)
      return detailedTitle(group, titlesByGroup.get(group.key)!);
    const parent = parentOf(group);
    const parentTitle = parent ? titleFor(parent, new Set([...seen, group.key])) : undefined;
    return detailedTitle(group, titlesByGroup.get(group.key)!, parentTitle === '(untitled)' ? undefined : parentTitle);
  };
  const groupByOccurrence = new Map(groups.flatMap((group) => group.occurrences.map((row) => [row.occurrenceId, group] as const)));
  const projectsByGroup = new Map(groups.map((group) => [group.key, detailedProjects(group, parentOf(group))]));
  // Disambiguate equal folder names that point at different URIs by adding the parent folder.
  const projectLabels = new Map<string, string>();
  {
    const byLabel = new Map<string, Set<string>>();
    for (const list of projectsByGroup.values())
      for (const project of list)
        byLabel.set(project.label, (byLabel.get(project.label) ?? new Set()).add(project.key));
    for (const list of projectsByGroup.values()) {
      for (const project of list) {
        const parts = project.key.replace(/[\\/]+$/u, '').split('/');
        projectLabels.set(project.key, (byLabel.get(project.label)?.size ?? 0) > 1 && parts.length > 1 ? `${project.label} (${parts.at(-2)})` : project.label);
      }
    }
    // Parent folders can still collide (for example two ".../WebApps/cpe-exb"): add one more segment, then an ordinal.
    const keysByLabel = new Map<string, string[]>();
    for (const [key, label] of projectLabels) keysByLabel.set(label, [...(keysByLabel.get(label) ?? []), key]);
    for (const keys of keysByLabel.values()) {
      if (keys.length < 2) continue;
      keys.forEach((key, index) => {
        const parts = key.replace(/[\\/]+$/u, '').split('/');
        projectLabels.set(key, `${projectLabels.get(key)!.replace(/ \(.*\)$/u, '')} (${parts.slice(-3, -1).join('/')}) #${index + 1}`);
      });
    }
  }
  const projectLabel = (key: string) => projectLabels.get(key) ?? key;
  const mainGroups = options.showIgnored ? groups : groups.filter((group) => group.visibility.status === 'included');
  // Inclusive: a conversation counts under every project it is referenced from, so totals are not additive.
  const projectCounts = new Map<string, number>();
  let multiProjectCount = 0;
  let unknownProjectCount = 0;
  for (const group of mainGroups) {
    const list = projectsByGroup.get(group.key)!;
    list.length > 1 && (multiProjectCount += 1);
    !list.length && (unknownProjectCount += 1);
    for (const project of list)
      projectCounts.set(project.key, (projectCounts.get(project.key) ?? 0) + 1);
  }
  const selected = new Set((options.last25 ? mainGroups.slice(0, 25) : mainGroups).map((group) => group.key));
  const ignored = groups.filter((group) => group.visibility.status === 'hidden');
  const allModels = new Map<string, number>();
  const types = new Map<string, number>();
  const statuses = new Map<string, number>();
  const flags = new Map<string, number>();
  for (const group of groups) {
    const data = metadata(group);
    for (const model of data?.models ?? [])
      allModels.set(model, (allModels.get(model) ?? 0) + 1);
    const type = sessionType(group.representative);
    types.set(type, (types.get(type) ?? 0) + 1);
    const status = group.representative.backing.status;
    statuses.set(status, (statuses.get(status) ?? 0) + 1);
    for (const flag of new Set([...(data?.flags ?? []), ...group.occurrences.flatMap((row) => row.diagnostics.map((item) => item.category))]))
      flags.set(flag, (flags.get(flag) ?? 0) + 1);
  }
  const edgeLink = (edge: ListingRelationship, reverse = false) => {
    const key = reverse ? edge.from : edge.to;
    const target = key ? groups.find((group) => group.key === key) : undefined;
    const label = target ? titleFor(target) : `${edge.targetLabel} (outside this inventory or non-unique target)`;
    return key && anchors.has(key) ? `<a href="#${anchors.get(key)}">${safe(label)}</a>` : safe(label);
  };
  const edgesFor = (group: ConversationGroup) => relationships.filter((edge) => edge.from === group.key || edge.to === group.key);
  const familyTree = (key: string, seen = new Set<string>()): string => {
    const group = groups.find((item) => item.key === key);
    if (!group)
      return '';
    const label = `<a href="#${anchors.get(key)}">${safe(titleFor(group))}</a>`;
    if (seen.has(key) || seen.size >= 32)
      return `<li>${label} (cycle or depth limit; follow the link for details)</li>`;
    const next = new Set([...seen, key]);
    const children = relationships.filter((edge) => edge.kind === 'parent' && edge.to === key).map((edge) => familyTree(edge.from, next));
    return `<li>${label}${children.length ? `<ul>${children.join('')}</ul>` : ''}</li>`;
  };
  const chipsFor = (group: ConversationGroup, data: ListingEvidence | undefined) => {
    const edges = edgesFor(group);
    return [
      sessionType(group.representative) === 'local' ? 'local' : '',
      group.representative.backing.status,
      group.visibility.status === 'hidden' ? 'ignored' : '',
      sessionType(group.representative) === 'sub-agent' ? 'child' : '',
      edges.some((edge) => edge.kind === 'parent' && edge.to === group.key) ? 'parent' : '',
      edges.some((edge) => edge.kind === 'fork') ? 'fork' : '',
      edges.some((edge) => edge.kind.startsWith('likely')) ? 'hint' : '',
      data?.models.length && data.models.length > 1 ? 'multi-model' : '',
      data?.turns.some((turn) => turn.auto) ? 'auto' : '',
      data?.files.length ? 'edits' : '',
      data?.history.state === 'recorded' ? 'history' : '',
      data?.artifactLocations.some((item) => item.state === 'present' && item.kind !== 'journal') || data?.artifacts.length ? 'artifacts' : '',
      data?.errors ? 'errors' : '',
      data?.canceled ? 'canceled' : '',
      data?.responsePresent === false ? 'no-response' : '',
      data?.state !== 'read' ? 'metadata-only' : '',
      data?.flags.length || data?.diagnostics.length || group.childWarnings || group.occurrences.some((row) => row.diagnostics.length) ? 'audit' : '',
      ...attentionFlags(group, data, edges),
    ].filter(Boolean).join(' ');
  };
  const searchFor = (group: ConversationGroup, data: ListingEvidence | undefined) => [
    titleFor(group),
    ...group.occurrences.flatMap((row) => [row.title, row.sessionId, row.occurrenceId, row.provenance.workspaceStoragePath,
      row.provenance.workspaceIdentity?.uri ?? '', row.backing.status,
      row.backing.status === 'verified' ? row.backing.source.path : row.backing.reason]),
    ...(titlesByGroup.get(group.key)?.map((title) => title.value) ?? []), ...(data?.turns.map((turn) => turn.prompt) ?? []),
    ...(data?.models ?? []), ...(data?.turns.flatMap((turn) => [turn.selectedModel ?? '', turn.effort ?? '']) ?? []),
    ...(data?.files.map((file) => file.file) ?? []), ...(data?.context.map((item) => item.value) ?? []),
  ].join(' ').toLowerCase();
  const attributes = (group: ConversationGroup, data: ListingEvidence | undefined) => {
    const metrics = detailedMetrics(group, data);
    const projectKeys = (projectsByGroup.get(group.key) ?? []).map((project) => project.key);
    return `data-search="${safe(searchFor(group, data))}" data-title="${safe(titleFor(group))}" data-type="${safe(sessionType(group.representative))}" data-status="${group.representative.backing.status}" data-projects="${html(JSON.stringify(projectKeys))}" data-models="${html(JSON.stringify(data?.models ?? []))}" data-chips="${chipsFor(group, data)}" data-prompts="${metrics.turns ?? ''}" data-bytes="${data?.bytes ?? ''}" data-created="${metrics.created ?? ''}" data-updated="${metrics.updated ?? ''}" data-created-day="${day(metrics.created)}" data-updated-day="${day(metrics.updated)}" data-limited="${options.last25 && !selected.has(group.key)}"`;
  };
  const renderCard = (group: ConversationGroup, main: boolean): string => {
    const row = group.representative;
    const data = metadata(group);
    const metrics = detailedMetrics(group, data);
    const anchor = anchors.get(group.key)!;
    const edges = edgesFor(group);
    const local = row.backing.status === 'verified' && row.backing.source.kind === 'local-journal';
    const exact = (workspaceCounts.get(row.sessionId) ?? 0) > 1;
    const selector = local && exact && row.backing.status === 'verified' ? row.backing.source.path : ids.get(row.sessionId) ?? row.sessionId;
    const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
    const command = `copilot-chat-export ${quote(selector)} --user-data-root ${quote(row.provenance.userDataRoot)}`;
    const readiness = !local ? row.backing.status === 'verified' ? 'Verified SDK source; MD export not implemented' : 'No verified export backing'
      : data?.state === 'changed' ? 'Source changed; refresh before export' : exact ? 'Local export: exact path required' : 'Local MD export supported';
    const workspace = detailedWorkspace(group, parentOf(group), data);
    // Headline values are ?? when the source was read, ??? when it could not be read or verified at all.
    const headline: 2 | 3 = row.backing.status === 'verified' && data?.state === 'read' ? 2 : 3;
    const createdText = when(metrics.created, headline, 'no recorded creation evidence');
    const sameMoment = metrics.created != null && metrics.updated != null && date(metrics.created) === date(metrics.updated);
    const headerId = detailedHeaderId(row);
    const headerIdLabel = row.backing.status === 'verified' && row.backing.source.kind === 'sdk-events'
      && row.backing.source.scope.kind === 'subagent' ? 'agentID' : 'sID';
    const workspaceIds = [...new Set(group.occurrences.map((item) => path.basename(item.provenance.workspaceStoragePath)))];
    const children = edges.filter((edge) => edge.kind === 'parent' && edge.to === group.key).length;
    const forks = edges.filter((edge) => edge.kind === 'fork' && edge.to === group.key).length;
    const usage = listingUsage(data?.state === 'read' ? data.turns : []);
    const modelTags = modelTag(data?.models ?? [], true);
    const top = `<summary class="session-summary"><span class="title-line"><span class="index-circle" title="Position in this generated snapshot">${groups.indexOf(group) + 1}</span>${typeTag(row)}<strong class="session-title">${safe(titleFor(group))}</strong>${children ? tag(`↳ ${plural(children, 'subagent')}`, 'Recorded immediate child conversations', 'child') : ''}${forks ? tag(`🌿 ${plural(forks, 'fork')}`, 'Recorded fork children', 'fork') : ''}${edges.some((edge) => edge.kind === 'fork' && edge.from === group.key) ? tag('🌿 Forked', 'Persisted fork metadata', 'fork') : ''}${workspaceIds.length > 1 ? tag(`${workspaceIds.length} w/s refs · 1 conv`, 'One verified conversation referenced from distinct workspace stores', 'refs') : ''}${edges.some((edge) => edge.kind === 'likely-fork') ? tag('⑂? Likely fork', 'Unproven content-based hint; not identity evidence', 'hint') : ''}${edges.some((edge) => edge.kind === 'likely-copy') ? tag('⑂? Likely copy', 'Unproven content-based hint; not identity evidence', 'hint') : ''}</span>
<span class="subtitle"><strong title="Recorded prompts/delegated tasks including child follow-ups, not assistant iterations">${known(metrics.turns, headline)} ${metrics.turns === 1 ? 'turn' : 'turns'}</strong><span class="workspace-name" title="${safe(workspace.uri)}${workspace.inherited ? ' (from recorded parent)' : ''}">📁 ${workspace.known ? safe(workspace.name) : unk(2, 'workspace/project not recorded')}</span><span title="Created: recorded creation evidence${sameMoment ? '; last updated in the same minute' : ''}" aria-label="Created">🌅 <span class="datetime">${createdText}</span></span>${sameMoment ? '' : `<span title="Updated: recorded latest scoped activity" aria-label="Updated">🔄 <span class="datetime">${when(metrics.updated, headline, 'no recorded activity evidence')}</span></span>`}${modelTags}${usageTags(usage)}${data?.files.length ? editTag(data.files) : ''}</span>
<span class="subtitle status-line">${tag(`${row.backing.status === 'verified' ? '✅' : row.backing.status === 'unsupported' ? '⛔' : '❓'} ${row.backing.status}`, 'Backing identity status, not a completeness guarantee', row.backing.status === 'verified' ? 'success' : 'warning')}${tag(readiness, 'Markdown (MD) export support is independent of source verification', local ? 'success' : 'neutral')}${group.visibility.status === 'hidden' ? tag(`🙈 Ignored: ${group.visibility.reason}`, 'Hidden by default inventory rules', 'warning') : ''}${group.childWarnings ? tag(`❓ ${plural(group.childWarnings, 'ambiguous child scope')}`, 'Main identity remains separate', 'warning') : ''}${group.occurrences.some((item) => item.diagnostics.some((diagnostic) => diagnostic.category === 'ambiguous')) ? tag('🟠 Ambiguous mapping', 'Source mapping is not uniquely established; see Why/source', 'warning') : ''}${data?.errors ? tag(`🚨 ${plural(data.errors, 'error')}`, 'Recorded request/session errors, not all tool failures', 'danger') : ''}${data?.canceled ? tag(`🚫 ${data.canceled} canceled`, 'Recorded cancellation/abort indicators', 'warning') : ''}${data?.flags.length ? tag(`🔎 ${plural(new Set(data.flags).size, 'audit note')}`, data.flags.join(', '), 'warning') : ''}<span title="${safe(workspaceIds.join(', '))}">wsID: <code>${safe(workspaceIds.join(', '))}</code></span><span title="${safe(headerId.title)}">${headerIdLabel}: <code>${safe(headerId.value)}</code></span></span></summary>`;
    const first = data?.turns[0]?.prompt;
    const last = data?.turns.at(-1)?.prompt;
    const displayPrompt = (prompt: string) => row.backing.status === 'verified'
      && row.backing.source.kind === 'sdk-events' && row.backing.source.scope.kind === 'main' ? sdkListingPromptOverview(prompt) : prompt;
    const summary = `<div class="comparison-summary"><div class="evidence-grid">
<section class="evidence-card"><h3>Conversation</h3><dl>${field('Created', `<span class="datetime">${createdText}</span>`)}${field('Updated', `<span class="datetime">${when(metrics.updated, headline, 'no recorded activity evidence')}</span>`)}${field('Recorded turns / tasks', `<strong>${known(metrics.turns, headline)}</strong>`)}${field('Compact inventory prompt count', known(group.promptCount))}${field('Models that answered', data?.models.length ? modelTag(data.models) : 'Not recorded (model selection is separate).')}${field('Scoped payload', bytes(data?.bytes))}${field('Export', html(readiness))}</dl></section>
<section class="evidence-card"><h3>Workspace / project</h3><dl>${field('Workspace URI', row.provenance.workspaceIdentity?.uri ? safe(row.provenance.workspaceIdentity.uri) : unk(1, 'workspace/project not recorded'))}${field('Storage hash', `<code>${safe(path.basename(row.provenance.workspaceStoragePath))}</code>`)}${field('References', String(group.occurrences.length))}${(data?.context ?? []).map((item) => field(item.field, `${safe(item.value)} <span class="caption">(${safe(item.source)})</span>`)).join('')}</dl></section>
<section class="evidence-card"><h3>Changes / outcomes</h3><dl>${field('Files changed', data?.state === 'read' ? `${data.flags.includes('incomplete-edit-evidence') ? 'Incomplete: at least ' : ''}<strong>${uniqueFiles(data.files)}</strong> in ${known(data.editTurns)} turns; ${safe(sumChanges(data.files))}` : unk(headline, 'edit evidence was not read'))}${field('Editing history', `${data?.history.state ? safe(data.history.state) : unk(1, 'editing-history state was not read')}; ${known(data?.history.turns)} matching turns`)}${field('Request errors', known(data?.errors))}${field('Canceled requests / events', known(data?.canceled))}${field('Recorded response', data?.responsePresent == null ? unk(1, 'response presence could not be determined') : data.responsePresent ? 'present' : 'not found in counted prompts')}${field('Artifacts', data?.artifactLocations.length ? `${data.artifactLocations.filter((item) => item.state === 'present').length} present locations / ${data.artifactLocations.length} checked; ${bytes(data.auditedBytes)}` : data?.artifactState === 'not-applicable' ? 'not applicable to scoped SDK evidence' : unk(1, 'artifact locations were not checked'))}</dl></section>
</div><p><strong>First:</strong> ${first ? safe(previewListingPrompt(displayPrompt(first)).text) : unk(headline, 'no recorded first prompt')}</p><p><strong>Last:</strong> ${last ? safe(previewListingPrompt(displayPrompt(last)).text) : unk(headline, 'no recorded last prompt')}</p></div>`;
    const breadcrumb: string[] = [group.key];
    while (breadcrumb.length < 32) {
      const parent = relationships.find((edge) => edge.kind === 'parent' && edge.from === breadcrumb[0] && edge.to !== null);
      if (!parent?.to || breadcrumb.includes(parent.to))
        break;
      breadcrumb.unshift(parent.to);
    }
    const trail = breadcrumb.map((key) => {
      const ancestor = groups.find((item) => item.key === key)!;
      return `<a href="#${anchors.get(key)}">${safe(titleFor(ancestor))}</a>`;
    }).join(' → ');
    const familyList = `<p>Recorded parent breadcrumbs: ${trail}</p><div class="tree"><ul>${familyTree(breadcrumb[0])}</ul></div><ul class="family-list">${edges.map((edge) => {
      const reverse = edge.to === group.key && edge.from !== group.key;
      const name = reverse ? edge.kind === 'parent' ? 'Child' : edge.kind === 'fork' ? 'Forked child' : edge.kind
        : edge.kind === 'parent' ? 'Parent' : edge.kind === 'fork' ? 'Recorded fork from' : edge.kind;
      return `<li>${tag(name)} ${edgeLink(edge, reverse)}<div class="caption">${safe(edge.evidence)}</div></li>`;
    }).join('')}</ul>`;
    const familySection = edges.length ? disclosure('🌳 Family / relationships', familyList)
      : fieldLine('🌳 Family / relationships', 'none recorded', 'No recorded family relationship or qualifying best-effort hint found. Similar titles alone do not establish a relationship.');
    const timeline: string[] = [];
    let previous = '';
    for (const [index, turn] of (data?.turns ?? []).entries()) {
      const state = JSON.stringify([turn.models, turn.selectedModel, turn.effort]);
      if (state !== previous) {
        const answering = turn.models.map(listingModelLabel);
        const showSelected = turn.selectedModel && !turn.auto && !answering.includes(listingModelLabel(turn.selectedModel));
        timeline.push(`<a href="#${anchor}-turn-${index + 1}">Turn ${index + 1}: ${answering.length ? safe(answering.join(', ')) : unk(2, 'no recorded answering-model evidence')}${turn.auto ? ' · Auto' : ''}${showSelected ? ` · selected ${safe(listingModelLabel(turn.selectedModel!))}` : ''}${turn.effort ? ` · effort ${safe(turn.effort)}` : ''}</a>`);
        previous = state;
      }
    }
    const turns = data?.state === 'read' ? `<ol class="turns">${data.turns.map((turn, index) => {
      const overview = displayPrompt(turn.prompt);
      const preview = previewListingPrompt(overview);
      const fullWords = previewListingPrompt(turn.prompt).wordCount;
      const choiceLabel = turn.role === 'human' ? 'Selected' : 'Session selected';
      const effortLabel = turn.role === 'human' ? 'Effort' : 'Session effort';
      // Whitespace-only differences (trailing newline, line breaks) are not worth a second copy of the same words.
      const sameWords = previewListingPrompt(overview).text === previewListingPrompt(turn.prompt).text && previewListingPrompt(overview).wordCount === fullWords;
      const needsFull = preview.clipped || !sameWords;
      return `<li class="turn-card" id="${anchor}-turn-${index + 1}"><div class="turn-meta">${tag(turn.role === 'human' ? '👤' : turn.role === 'delegated' ? '↳ delegated' : '💬 follow-up', turn.role, turn.role === 'human' ? 'human' : 'child')}<span class="datetime">${turn.timestamp == null ? unk(1, 'no recorded timestamp for this turn') : formatListingTurnDate(turn.timestamp, metrics.created)}</span>${turn.models.length ? modelTag(turn.models) : ''}${turn.auto ? tag(turn.role === 'human' ? 'Auto' : 'Session Auto', 'Recorded automatic model selection, not an answering-model ID', 'auto') : ''}${turn.selectedModel && !turn.auto && !turn.models.some((model) => listingModelLabel(model) === listingModelLabel(turn.selectedModel!)) ? tag(`${choiceLabel}: ${listingModelLabel(turn.selectedModel)}`, turn.selectedModel, 'neutral') : ''}${turn.effort ? tag(`🧠 ${effortLabel}: ${turn.effort}`, 'Recorded reasoning effort setting', 'effort') : ''}${usageTags(listingUsage([turn]))}${turn.canceled ? tag('🚫 Canceled', 'Recorded cancellation', 'warning') : ''}${turn.error ? tag('🚨 Request error', 'Recorded error evidence', 'danger') : ''}${turn.files.length ? editTag(turn.files) : ''}</div>
<p class="prompt-preview${needsFull ? ' clipped-preview' : ''}">${safe(preview.text)}</p>${!sameWords ? '<p class="caption">Derived SDK overview omits recognized context/reminder wrappers; full recorded text is preserved below.</p>' : ''}${needsFull ? disclosure(`Full ${turn.role === 'delegated' ? 'delegated task' : 'prompt'} · ${fullWords} words${preview.clipped ? ' · middle clipped in preview' : ''}`, `<pre>${safe(turn.prompt)}</pre>`, 'full-prompt') : ''}
${turn.files.length ? disclosure('✏️ Files changed by this turn', fileTable(turn.files)) : ''}</li>`;
    }).join('')}</ol>` : `<p class="warning">Conversation evidence is ${safe(data?.state ?? 'unavailable')}. Unknown is not empty. Source diagnostics below explain what could not be read.</p>`;
    const titles = titlesByGroup.get(group.key)!;
    const titleValues = [...new Set(titles.map((title) => title.value))];
    const actions = `<div class="card-actions enhanced-only"><button type="button" title="Pin this conversation for a two-chat comparison" data-pin="${anchor}" aria-pressed="false">📌 Compare</button><a href="#${anchor}" title="Permanent link within this report">🔗 Link</a><a href="#conversation-index" title="Open all-session table of contents">🔝 TOC</a></div>`;
    const titleList = `<section class="title-provenance"><div class="titles-head"><h3>🏷️ Titles at each storage level</h3>${actions}</div><ul>${titleValues.map((value) => `<li><code class="evidence-label">${safe(titles.filter((title) => title.value === value).map((title) => title.source).join(' · '))}</code><span>${safe(value)}</span></li>`).join('') || '<li>Unknown / not recorded.</li>'}</ul></section>`;
    const notes = [hasUsage(usage) ? '' : usageUnavailableTag(), data?.models.length ? '' : '<span class="note" title="No recorded answering-model evidence; model selection is shown separately when recorded.">🤖 No recorded answering-model evidence</span>'].join('');
    const dates = data?.dates ?? [];
    const promptDates = dates.filter((item) => /^(?:(?:request|prompt)\.\d+\.|events\.line:\d+\.)/u.test(item.source));
    const timestampLabel = promptDates.some((item) => item.source.startsWith('events.')) ? 'Event / prompt timestamps' : 'Prompt / request timestamps';
    const dateRows = (items: typeof dates) => `<dl class="date-provenance">${items.map((item) => field(item.source, `<span class="datetime" title="${safe(item.recordedValue)}">${date(item.timestamp)}</span>`)).join('')}</dl>`;
    const dateSection = `<section class="evidence-card dates-card"><h3>🕒 Dates and provenance</h3>${dateRows(dates.filter((item) => !promptDates.includes(item)))}${promptDates.length > 1 ? disclosure(    `${timestampLabel} (${promptDates.length})`, dateRows(promptDates)) : promptDates.length === 1 ? fieldLine('Prompt / request timestamp', `<span class="datetime" title="${safe(promptDates[0]!.recordedValue)}">${date(promptDates[0]!.timestamp)}</span>`, promptDates[0]!.source, 'compact') : ''}</section>`;
    const payload = `<section class="evidence-card"><h3>📝 Editing history / injected prompts</h3><p>Injected/non-user SDK prompts: ${known(data?.injectedPrompts)}. These are not added to main human prompt counts.</p><p>Editing history: ${safe(data?.history.state ?? 'unknown')}${data?.history.turns != null ? ` · ${data.history.turns} turns` : ''}.</p>${data?.history.path ? `<p>History state: ${pathLink(data.history.path)}</p>` : ''}</section>`;
    const timelineCaption = 'Only recorded answering evidence is called an answering model. Auto and selected model are separate. Changes apply at prompt boundaries, not every assistant iteration.';
    const timelineSection = timeline.length > 1
      ? disclosure('🤖 Model-switch timeline', `<p class="caption">${timelineCaption}</p><div class="timeline">${timeline.join('')}</div>`)
      : fieldLine('🤖 Model-switch timeline', timeline[0] ?? unk(headline, 'no recorded model evidence'), timeline.length ? `No model switch recorded. ${timelineCaption}` : timelineCaption);
    const copyable = local && data?.state !== 'changed';
    const exportSection = fieldLine('📋 Export selector / command',
      `<code class="selector">${safe(selector)}</code>${copyable ? ` <button type="button" title="Copy the exact supported export selector" class="enhanced-only" data-copy="${html(selector)}">📋 Copy selector</button> <button type="button" title="Copy quoted PowerShell export command" class="enhanced-only" data-copy="${html(command)}">💻 Copy command</button>` : ''}`,
      copyable ? `Command: ${command}` : `${readiness}. The selector is shown for reference only.`);
    return `<details class="session-card chat-${detailedChatType(row).key}" id="${anchor}" data-main="${main}" ${attributes(group, data)}${main && !selected.has(group.key) ? ' hidden' : ''}>
${top}<div class="session-body">${titleList}
${notes ? `<div class="card-notes">${notes}</div>` : ''}${usageDisclosure(usage)}
${disclosure(`🗨️ Ordered prompts / delegated tasks (${data?.state === 'read' ? data.turns.length : unk(headline, 'conversation evidence was not read')})`, turns)}
${familySection}
${timelineSection}
${disclosure('📊 Conversation / workspace / outcomes and first / last previews', summary)}
<div class="evidence-grid supplemental">${dateSection}${payload}</div>
${disclosure(`🗂️ Why / source · ${group.occurrences.length} ref${group.occurrences.length === 1 ? '' : 's'}`, renderDetailedSource(group, evidence, anchor), 'why-source')}
${exportSection}
</div></details>`;
  };
  const occurrenceRows = occurrences.filter((row) => options.showIgnored || row.visibility.status === 'included').map((row, index) => {
    const group = groupByOccurrence.get(row.occurrenceId)!;
    const data = evidence.get(row.occurrenceId);
    const perOccurrence = { ...group, representative: row, occurrences: [row], createdTimestamp: row.createdTimestamp ?? null,
      activityTimestamp: row.activityTimestamp, promptCount: row.promptCount ?? null };
    const metrics = detailedMetrics(perOccurrence, data);
    const level: 2 | 3 = row.backing.status === 'verified' && data?.state === 'read' ? 2 : 3;
    return `<tr id="occurrence-${index + 1}" ${attributes(perOccurrence, data)}><td><a href="#${anchors.get(group.key)}">${safe(titleFor(group))}</a></td><td>${typeTag(row)}</td><td><strong>${known(metrics.turns, level)}</strong></td><td class="datetime">${when(metrics.created, level, 'no recorded creation evidence')}</td><td class="datetime">${when(metrics.updated, level, 'no recorded activity evidence')}</td><td><code>${safe(row.occurrenceId)}</code><br><code>${safe(row.provenance.workspaceStoragePath)}</code></td><td>${safe(row.backing.status)}</td></tr>`;
  }).join('');
  const chipLabels: [string, string][] = [
    ['local', '💬 Local'], ['verified', '✅ Verified'], ['unresolved', '❓ Unresolved'], ['parent', '↳ Has children'], ['child', '↳ Sub-agent'],
    ['fork', '🌿 Recorded fork'], ['hint', '⑂? Tentative hints'], ['multi-model', '🤖 Multiple models'], ['auto', '✨ Auto'],
    ['edits', '✏️ Files changed'], ['history', '📝 Editing history'], ['artifacts', '📦 Artifacts'], ['errors', '🚨 Request errors'],
    ['canceled', '🚫 Canceled'], ['no-response', '∅ No response evidence'], ['metadata-only', '🏷️ Metadata only'], ['audit', '🔎 Audit notes'],
  ];
  const scriptHash = createHash('sha256').update(detailedListingController).digest('base64');
  const numberFilter = (key: string, title: string) => `<label>${title} min <input type="number" min="0" id="${key}-min" data-filter></label><label>max <input type="number" min="0" id="${key}-max" data-filter></label><select id="${key}-known" data-filter aria-label="${title} evidence"><option value="">Known or unknown</option><option value="known">Known only</option><option value="unknown">Unknown only</option></select>`;
  const stamp = (timestamp: number | null | undefined) => {
    if (timestamp == null || !Number.isFinite(new Date(timestamp).getTime()))
      return '';
    const local = new Date(timestamp);
    const two = (value: number) => String(value).padStart(2, '0');
    return `${two(local.getMonth() + 1)}${two(local.getDate())}-${two(local.getHours())}:${two(local.getMinutes())}`;
  };
  const indexLinks = groups.map((group) => {
    const data = metadata(group);
    const metrics = detailedMetrics(group, data);
    const level: 2 | 3 = group.representative.backing.status === 'verified' && data?.state === 'read' ? 2 : 3;
    const projects = projectsByGroup.get(group.key)!;
    const workspace = detailedWorkspace(group, parentOf(group), data);
    const refs = new Set(group.occurrences.map((row) => path.basename(row.provenance.workspaceStoragePath))).size;
    const projectName = workspace.known
      ? `<span class="workspace-name" title="${safe(projects.length ? projects.map((project) => projectLabel(project.key)).join(', ') : workspace.uri)}">📁 ${safe(workspace.name)}${projects.length > 1 ? ` +${projects.length - 1}` : ''}</span>`
      : `<span class="workspace-name">📁 ${unk(2, 'workspace/project not recorded')}</span>`;
    const updated = stamp(metrics.updated);
    return `<li><span class="toc-main"><a href="#${anchors.get(group.key)}"><strong class="toc-number">#${groups.indexOf(group) + 1}</strong> ${safe(titleFor(group))}</a>${typeTag(group.representative)}<span class="index-meta">${metrics.turns === null ? `${unk(level)} turns` : `<strong>${plural(metrics.turns, 'turn')}</strong>`}</span></span><span class="toc-sub">${projectName}<span class="datetime" title="Last updated (MMDD-HH:mm, generator-local time)">🔄 ${updated ? updated : unk(level, 'no recorded activity evidence')}</span>${refs > 1 ? tag(`${refs} w/s refs`, 'One verified conversation referenced from distinct workspace stores', 'refs') : ''}${data?.files.length ? editTag(data.files) : ''}</span></li>`;
  }).join('');
  const projectRows = [...projectCounts].sort((left, right) => right[1] - left[1] || projectLabel(left[0]).localeCompare(projectLabel(right[0])));
  const projectRow = (name: string, count: number, tone: string, pick: string, title: string) => `<div class="chart-row"><span><button type="button" class="link-button" data-project-pick="${html(pick)}" title="${safe(title)}">${safe(name)}</button></span><span class="bar" aria-label="${mainGroups.length ? Math.round(count * 100 / mainGroups.length) : 0}%"><i class="${tone}" style="width:${mainGroups.length ? Math.round(count * 100 / mainGroups.length) : 0}%"></i></span><strong>${count}</strong></div>`;
  const projectChartRows = [
    ...projectRows.map(([key, count]) => projectRow(projectLabel(key), count, 'bar-project', key, `Filter to ${key}`)),
  ];
  const projectChart = `<section class="panel" id="project-chart"><h2>Chats per project</h2><p class="caption">Conversations referenced from each workspace or folder (${options.showIgnored ? 'all' : 'main candidates'}). A conversation referenced from several projects counts under each of them, so bars are not additive. Click a name to filter.</p>${projectRow('multiple projects', multiProjectCount, 'bar-multi', '__multi', 'Chats referenced from two or more projects')}${projectRow('no recorded project', unknownProjectCount, 'bar-unknown', '__unknown', 'Chats with no recorded workspace or folder')}${projectChartRows.slice(0, 12).join('')}${projectChartRows.length > 12 ? disclosure(`All ${projectChartRows.length} projects`, projectChartRows.slice(12).join('')) : ''}</section>`;
  const projectOptions = [...projectCounts].sort((left, right) => projectLabel(left[0]).localeCompare(projectLabel(right[0]), undefined, { sensitivity: 'base' }))
    .map(([key, count]) => `<option value="${html(key)}">${safe(projectLabel(key))} (${count})</option>`).join('');
  const ignoredCards = ignored.map((group) => mainGroups.includes(group)
    ? `<p><a href="#${anchors.get(group.key)}">${safe(titleFor(group))}</a> ${tag(`Ignored: ${group.visibility.status === 'hidden' ? group.visibility.reason : ''}`, 'Already shown in the main listing with --show-ignored', 'warning')}</p>`
    : renderCard(group, false)).join('');
  const attentionCounts = new Map<string, number>();
  for (const group of mainGroups)
    for (const flag of new Set(chipsFor(group, metadata(group)).split(' ')))
      attentionCounts.set(flag, (attentionCounts.get(flag) ?? 0) + 1);
  const attentionPanel = renderAttentionPanel(attentionCounts, mainGroups.length, options.showIgnored ? 0 : ignored.length);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Detailed VS Code chat session listing</title><style>${detailedListingStyles}</style></head>
<body><main><header><div class="caption">Offline · read-only · detailed identification report</div><h1>VS Code chat session listing</h1><p>Generated <span class="datetime">${date(Date.parse(generatedAt))}</span> for <code>${safe(occurrences[0]?.provenance.userDataRoot ?? 'selected user-data root')}</code>. Dates use the generator's local clock.</p>
<nav><a href="#conversation-index">📚 Session TOC</a> · <a href="#models-used">🤖 Models used</a> · <a href="#storage-guide">🗂️ Storage / IDs / statuses</a> · <a href="#ids-sizes">📦 IDs / sizes</a> · <a href="#how-to">ℹ️ How to use / limits</a> · <a href="#audit-legend">🔎 Audit legend</a> · <a href="#ignored-sessions">🙈 Ignored (${ignored.length})</a></nav>
<p class="warning">This report contains private prompt text and local paths. Best-effort credential redaction is applied to newly collected prompt/title text, not a guarantee of sanitization. Keep the report private. Verified SDK backing does not mean SDK Markdown export is available.</p></header>
<section class="metrics">${[[groups.length, 'grouped conversations'], [occurrences.length, 'workspace occurrences'], [mainGroups.length, 'main candidates'], [selected.size, 'initially shown'], [ignored.length, 'ignored groups'], [allModels.size, 'answering model IDs']].map(([value, label]) => `<div class="metric"><strong>${value}</strong>${label}</div>`).join('')}</section>
<section class="grid"><div class="panel"><h2>Backing status</h2>${chartRows(statuses, groups.length, (value) => value, (value) => `bar-${value}`)}</div><div class="panel"><h2>Chat types</h2>${chartRows(types, groups.length, (value) => detailedTypeOf(value).label, (value) => `bar-${detailedTypeOf(value).key}`)}</div><div class="panel"><h2>Answering models</h2><p class="caption">Top eight raw IDs by conversation count. Mixed-model conversations appear more than once; totals are not additive.</p>${chartRows(new Map([...allModels].sort((a, b) => b[1] - a[1]).slice(0, 8)), groups.length, listingModelLabel)}<a href="#models-used">All ${allModels.size} answering model IDs ↓</a></div></section>
${projectChart}
${attentionPanel}
<details class="guide" id="conversation-index"><summary>📚 Session TOC / grouped conversation index (${groups.length})</summary><p class="caption">All conversations, including ignored and newest-25-limited entries. Follow a title to reveal and open its card.</p><ol class="index-list">${indexLinks}</ol></details>
<section class="panel"><h2>Find the chat you remember</h2><div class="controls"><input id="search" data-filter type="search" aria-label="Search titles, full prompts, IDs, workspace, model and files" placeholder="Search titles, full prompts, IDs, models, files or projects…">
<label>Type <select id="type" data-filter><option value="">All</option>${[...types.keys()].map((type) => `<option>${safe(type)}</option>`).join('')}</select></label><label>Backing <select id="status" data-filter><option value="">All</option>${[...statuses.keys()].map((status) => `<option>${status}</option>`).join('')}</select></label><label>Project <select id="project" data-filter title="Projects are the recorded workspaces/folders a chat is referenced from"><option value="">All projects</option><option value="__multi">Multiple projects (${multiProjectCount})</option><option value="__unknown">No recorded project (${unknownProjectCount})</option>${projectOptions}</select></label>
<label>Model <select id="model" data-filter><option value="">All answering models</option><option value="?">Unknown answering model</option>${[...allModels.keys()].sort().map((model) => `<option value="${html(model)}">${safe(listingModelLabel(model))} (${safe(model)})</option>`).join('')}</select></label></div><p class="caption">Detailed turns include recorded child delegated tasks and follow-ups. SDK dates use first/last scoped event activity. The compact console retains its narrower prompt-count policy.</p>
<div class="chips">${chipLabels.map(([key, label]) => `<button type="button" title="Filter: ${html(label)}. All active chips must match." data-chip="${key}" aria-pressed="false">${withGlyphs(label)}</button>`).join('')}</div>
${disclosure('Date / numeric ranges', `<div class="controls"><label>Date field <select id="date-kind" data-filter data-default="updated"><option value="updated">Updated</option><option value="created">Created</option></select></label><label>From <input type="date" id="date-from" data-filter></label><label>Through <input type="date" id="date-to" data-filter></label>${numberFilter('prompts', 'Turns/tasks')}${numberFilter('bytes', 'Scoped bytes')}</div><p class="caption">Date ranges use generator-local calendar days, regardless of the browser's timezone. Unknown values sort last and never satisfy a numeric/date range.</p>`)}
<div class="controls"><label>View <select id="view"><option value="grouped">Grouped conversations</option><option value="occurrences">Workspace occurrences</option></select></label><label>Detail <select id="density"><option value="balanced">Collapsed cards</option><option value="compact">Compact summaries</option><option value="comprehensive">Comprehensive / full prompts</option></select></label><label>Sort <select id="sort"><option value="updated">Updated</option><option value="created">Created</option><option value="prompts">Prompts</option><option value="bytes">Scoped bytes</option><option value="title">Title</option></select></label><button id="sort-direction" title="Reverse sort order; unknown values remain last">⬇️ Descending</button><button id="reset" title="Clear every search, chip and range filter">🔄 Reset filters</button>${options.last25 ? '<button id="show-all" title="Reveal all main candidates">📋 Remove newest-25 limit</button>' : '<button id="show-all" hidden>📋 Show all main candidates</button>'}<strong id="row-count" aria-live="polite">${selected.size} of ${mainGroups.length} grouped conversations shown</strong></div><p id="action-status" role="status"></p><noscript><style>.session-card[hidden],#occurrence-view[hidden]{display:block!important}</style><p class="warning">JavaScript is disabled. All main candidate cards are shown without the newest-25 limit so native disclosures, source links and the index remain usable. Interactive filtering, copying and comparison require JavaScript.</p></noscript></section>
<section class="panel" id="comparison" hidden><h2>Side-by-side comparison</h2><span id="comparison-count">0 of 2 chats pinned</span> <button id="clear-pins" title="Remove both pinned conversations">🧹 Clear pins</button><div id="comparison-cards" class="compare-grid"></div></section>
<section id="grouped-view">${mainGroups.map((group) => renderCard(group, true)).join('') || '<p>No main conversations in this inventory.</p>'}</section>
<section class="panel" id="occurrence-view" hidden><h2>Workspace occurrences</h2><p>Separate references remain visible here. Follow the title link to the grouped conversation and use Why / source for full IDs and paths. Grouping uses verified identity, never a copy/fork hint.</p><div class="table-wrap"><table id="occurrence-table"><thead><tr><th>Conversation</th><th>Type</th><th>Turns/tasks</th><th>Created</th><th>Updated</th><th>Occurrence / workspace</th><th>Backing</th></tr></thead><tbody>${occurrenceRows}</tbody></table></div></section>
<details class="guide" id="models-used"><summary>Models used (${allModels.size} raw answering-model IDs)</summary><p>Distinct raw IDs in first-use evidence. Auto is a selection mode, not an answering model. Selected-only models are displayed per turn, not counted as answering evidence. Model aliases are not silently merged.</p>${table(['Model ID', 'Conversations'], [...allModels].sort((a, b) => b[1] - a[1]).map(([model, count]) => [safe(model), String(count)]))}</details>
${storageGuideHtml}
<details class="guide" id="ids-sizes"><summary>Understanding IDs, grouping and sizes</summary><div class="diagram"><div class="node"><strong>Workspace hash</strong>A storage folder, not a chat ID.</div><div class="node"><strong>Occurrence ID</strong>One exact provider/workspace reference.</div><div class="node"><strong>Conversation group</strong>Verified source identity; Local UUID + digest, or SDK chat + exact scope.</div><div class="node"><strong>Backing session ID</strong>Journal UUID or SDK session.start identity; child agent ID is a separate scope.</div></div><p>Scoped SDK bytes exclude unrelated child/main records and line separators. Local bytes are the full journal including separators. Artifact bytes are separate. Multiple references and scopes may share a physical file: never sum these figures as unique disk usage. Missing files, unreadable histories and unsupported variants remain unknown, not zero.</p><p>Local IDs in several workspace folders require an exact journal path even when their digest matches. Short prefixes are checked against the complete inventory, including ignored entries.</p></details>
<details class="guide" id="how-to"><summary>How to use this report / limits</summary><ol><li>Search a remembered phrase, file, project or answering model. All search words must occur somewhere in the conversation evidence.</li><li>Combine quick chips and range filters; all active conditions must match. Reset filters when a conversation is missing.</li><li>Open ordered prompts for previews; long prompts preserve 50 head and 20 tail words. Full text remains in a native disclosure. Delegated tasks and later child prompts are labelled separately.</li><li>Follow family links. Recorded forks are not the same as inferred forks/copies. Navigation resets filters and reveals ignored/limited targets, but never changes inventory identity.</li><li>Pin at most two cards for side-by-side summaries. Select grouped or occurrence view to distinguish conversations from workspace references.</li><li>Copy a supported Local selector or PowerShell command. File links are read-only references and may be blocked by the browser or point to paths that no longer exist.</li><li>Question marks mean unknown, never zero: <span class="unknown">?</span> a minor detail was not recorded, <span class="unknown">??</span> a headline value such as the turn count or a date could not be established, <span class="unknown">???</span> the source could not be read or verified at all. Hover a mark for the reason.</li></ol><p>Discovery currently covers the selected root's User/workspaceStorage and provider backings resolved from local records. Other profiles, remote/cloud stores, rotated/deleted content and future schema variants are not guaranteed. The report does not start providers, edit native storage, repair mappings, fetch external content or reconstruct history from current files. Editing counts describe recorded tool calls/markers, not current diffs or successful persisted Keep/Undo decisions. Selected models are not proof of which model answered.</p><p>SDK request-error/cancel indicators count recognized persisted session.error and abort events, not all tool failures or every possible outcome variant. A zero recognized count is not proof of a flawless conversation. Local errors count request error records independently of cancellation.</p></details>
<details class="guide" id="audit-legend"><summary>Audit flag legend and observed flags</summary><p>Source statuses and audit flags are separate. Verified means backing identity passed; it does not prove complete semantic fidelity. Audit notes explain missing/changed/unsupported evidence without upgrading or downgrading inferred relationships.</p>${table(['Flag', 'Meaning'], [
  ['backing-unavailable', 'No verified backing; index metadata only.'], ['source-changed', 'SHA-256 or stable-read check no longer matches the inventory; rich evidence omitted.'],
  ['enrichment-unavailable', 'Backing could not be enriched; see the explicit diagnostic.'], ['incomplete-prompt-evidence', 'Malformed SDK source/content; available prompt entries are partial.'],
  ['delegated-task-unavailable', 'Child identity is verified but its initial delegated task text could not be recovered.'],
  ['incomplete-edit-evidence', 'A recognized editing tool has missing/unsupported arguments. Listed file changes are partial, not a complete zero or total.'],
  ['index-only / journal-only / pending-work', 'Reference has no verified backing; journal has no index reference; or replayed Local state retains pending work.'],
  ['identity-fallback / scope-warning', 'Persisted mapping fallback or a child-scope warning from inventory.'],
  ['unhandled:* / unrecognized-tool:*', 'Journal schema census found content needing parser review.'], ['redacted-text', 'Best-effort credential detection replaced text; not a complete privacy guarantee.'],
  ['BEST-EFFORT', 'Content similarity suggests a copy/fork; never used for grouping or export selection.'],
  ['estimated', 'Edit-marker estimate or bounded line-diff approximation, not an exact historical diff.'],
].map(([flag, meaning]) => [html(flag), html(meaning)]))}<h3>Observed flags / categories</h3>${table(['Flag', 'Grouped conversations'], [...flags].sort((a, b) => b[1] - a[1]).map(([flag, count]) => [safe(flag), String(count)]))}${options.diagnostics?.length ? disclosure('Inventory-wide diagnostics', table(['Path', 'Issue'], options.diagnostics.map((item) => [pathLink(item.path), safe(item.description)]))) : ''}</details>
<details class="guide" id="ignored-sessions"><summary>Ignored sessions (${ignored.length})</summary><p>All ignored groups and their reasons. By default their cards are independent of main filters and newest-25. With --show-ignored complete cards appear above; the links here reveal them without duplicating content. Unknown New Chat placeholders are not proven empty.</p>${ignoredCards || '<p>No ignored sessions.</p>'}</details>
<footer>Generated locally by copilot-chat-exporter. No external scripts, fonts, images or network requests. Native storage and sister project remain read-only.</footer></main><script>${detailedListingController}</script></body></html>`;
}
