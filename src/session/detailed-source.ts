import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { redactText } from '../redaction.ts';
import type { SessionOccurrence } from './sources.ts';
import type { ConversationGroup } from './listing-model.ts';
import type { ListingEvidence } from './listing-evidence-types.ts';
import type { StorageArtifact } from './listing-storage.ts';
import { escapeHtml } from './listing-html.ts';
import { formatLocalListingDate } from './listing-preview.ts';
import { listingFileIdentity } from './listing-edits.ts';

const safe = (value: string) => escapeHtml(redactText(value).text);
const pill = (value: string, hint = '') => `<span class="tag"${hint ? ` title="${safe(hint)}"` : ''}>${safe(value)}</span>`;
const copy = (value: string) => ` <button type="button" class="enhanced-only source-copy" data-copy="${safe(value)}" title="Copy the full value" aria-label="Copy the full value">📋</button>`;
const value = (text: string) => `<span class="source-value">${safe(text)}</span>${text.length > 30 ? copy(text) : ''}`;
const details = (title: string, content: string, cls = '') => `<details${cls ? ` class="${cls}"` : ''}><summary>${title}</summary>${content}</details>`;

export function storageBytes (bytes: number | null | undefined): string {
  if (bytes == null)
    return '<span class="unknown" title="Size not measured">?</span>';
  const short = bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
  return `<span class="storage-size"><strong>${short}</strong> <span class="exact-bytes">${bytes.toLocaleString('en-US')} bytes</span></span>`;
}

export function referenceBasis (row: SessionOccurrence): string {
  if (row.provenance.indexKey)
    return 'Persisted index entry';
  if (row.parentOccurrenceId)
    return 'Derived through parent';
  if (row.backing.status === 'verified' && row.backing.source.kind === 'local-journal')
    return 'Journal without index entry';
  return 'No recorded index entry';
}

function purpose (artifact: StorageArtifact): { purpose: string; impact: string } {
  const name = path.basename(artifact.path);
  if (/(?:-wal|-shm)$/u.test(name))
    return { purpose: 'SQLite live write-ahead-log/shared-memory sidecar; tied to its database, not one chat.', impact: 'Do not delete while the database is in use. May discard uncheckpointed changes or interfere with live database access.' };
  if (/\.vscdb\.backup$/u.test(name))
    return { purpose: 'Workspace database backup; freshness and recoverability not verified.', impact: 'Removes this backup. It is not an independently verified conversation backup.' };
  if (name === 'state.vscdb')
    return { purpose: 'Workspace SQLite state: chat index, UI/editor state, prompt input history and extension data.', impact: 'May lose workspace state and chat-list metadata. Conversation files are separate; recovery behavior is not verified.' };
  if (name === 'workspace.json')
    return { purpose: 'Recorded folder or workspace identity for this storage directory.', impact: 'Workspace association becomes unavailable to this tool. Recreation behavior is not verified.' };
  if (name === 'events.jsonl' || /chatSessions[\\/]/u.test(artifact.path))
    return { purpose: 'Backing conversation records. A single SDK file can contain parent, child and peer scopes.', impact: 'Removes this backing content for every scope using this file. Other copies or recovery mechanisms are not established.' };
  if (name === 'agent-host.db')
    return { purpose: 'Global Agent Host metadata; identity evidence only where explicitly recorded below.', impact: 'May affect multiple agent sessions. Do not remove a shared database to clean up one chat.' };
  if (name === 'session.db')
    return { purpose: /agentSessionData[\\/]/u.test(artifact.path) ? 'VS Code session metadata and recorded identity binding.' : 'SDK session database; internal contents not interpreted by this report.', impact: 'May remove session metadata or identity evidence; fallback/recovery behavior is not verified.' };
  if (name === 'workspace.yaml')
    return { purpose: 'SDK working directory, title and date metadata; distinct from workspace.json.', impact: 'May lose SDK metadata and provenance; conversation records are stored separately.' };
  if (/chatEditingSessions[\\/]/u.test(artifact.path))
    return { purpose: 'Recorded edit history and snapshots.', impact: 'May lose edit-history restoration data; conversation records are separate.' };
  if (/transcripts[\\/]/u.test(artifact.path))
    return { purpose: 'Extension transcript artifact; not assumed to be a complete backup.', impact: 'Removes that transcript. Redundancy and recovery are not established.' };
  if (/debug-logs[\\/]/u.test(artifact.path))
    return { purpose: 'Extension diagnostic logs.', impact: 'Removes diagnostic evidence; application impact is not verified.' };
  return { purpose: 'Related session artifact; names and sizes measured, contents not interpreted.', impact: 'Impact is not verified. Preserve until its role is understood.' };
}

/** Source presentation preserves field/value/reference tuples, including differences between occurrences. */
export function renderDetailedSource (
  group: ConversationGroup,
  evidence: ReadonlyMap<string, ListingEvidence>,
  anchor: string,
): string {
  const refs = group.occurrences;
  const chip = (index: number) => `<span class="workspace-ref ref-${index % 4}" title="${safe(refs[index]!.provenance.workspaceIdentity?.uri ?? refs[index]!.provenance.workspaceStoragePath)}">W${index + 1}</span>`;
  const name = (row: SessionOccurrence) => {
    const uri = row.provenance.workspaceIdentity?.uri;
    if (!uri)
      return path.basename(row.provenance.workspaceStoragePath);
    try {
      return decodeURIComponent(uri.replace(/[\\/]+$/u, '').split('/').at(-1)!);
    } catch {
      return uri;
    }
  };
  const prefixPath = (file: string) => {
    const root = group.representative.provenance.userDataRoot;
    const prefixes: [string, string][] = [
      ['‹WS›', path.join(root, 'User', 'workspaceStorage')],
      ['‹Global›', path.join(root, 'User', 'globalStorage')],
      ['‹Agent›', path.join(root, 'agentSessionData')],
      ['‹Code›', root],
    ];
    const copilot = file.match(/^(.+[\\/]\.copilot)(?:[\\/]|$)/iu)?.[1];
    copilot && prefixes.unshift(['‹.copilot›', copilot]);
    const match = prefixes.find(([, base]) => file.toLowerCase() === base.toLowerCase() || file.toLowerCase().startsWith(`${base.toLowerCase()}${path.sep}`));
    const label = match ? `<span class="path-prefix" title="${safe(match[1])}">${safe(match[0])}</span>${safe(file.slice(match[1].length))}` : safe(file);
    return `<span class="source-path">${label}</span> <a href="${safe(pathToFileURL(file).href)}" title="Open this location">↗</a>${copy(file)}`;
  };
  const allArtifacts = new Map<string, { item: StorageArtifact; refs: number[] }>();
  refs.forEach((row, index) => {
    for (const item of evidence.get(row.occurrenceId)?.storage ?? []) {
      const existing = allArtifacts.get(item.path);
      if (existing)
        existing.refs.push(index);
      else
        allArtifacts.set(item.path, { item, refs: [index] });
    }
  });
  const health = new Map<string, 'danger' | 'warning' | 'info'>();
  const note = (text: string, tone: 'danger' | 'warning' | 'info' = 'warning') => health.set(text, tone);
  refs.forEach((row) => {
    const data = evidence.get(row.occurrenceId);
    row.backing.status !== 'verified' && note(`${name(row)}: ${row.backing.reason}`, 'danger');
    data?.state !== 'read' && note(`Conversation enrichment: ${data?.state ?? 'not collected'}.`, 'danger');
    row.diagnostics.forEach((item) => note(`${item.category}: ${item.description}`));
    data?.diagnostics.forEach((item) => note(`${item.path}: ${item.description}`));
    data?.flags.forEach((flag) => note(`Audit note: ${flag}`));
    if (!row.provenance.indexKey && row.parentOccurrenceId)
      note(`${name(row)}: no own index entry; reference derived through the recorded parent.`, 'info');
    if (row.backing.status === 'verified' && row.backing.source.kind === 'sdk-events')
      [...row.backing.source.identityWarnings, ...row.backing.source.scopeWarnings].forEach((text) => note(text));
  });
  const healthHtml = health.size ? `<section class="source-health"><h3>🩺 Health checks · 🔎 Audit flags / diagnostics</h3><div class="health-cards">${[...health].map(([text, tone]) => `<div class="health-${tone}">${tone === 'danger' ? '🚨' : tone === 'info' ? 'ℹ️' : '⚠️'} ${safe(text)}</div>`).join('')}</div></section>`
    : '<div class="field-line"><strong>🩺 Health checks · 🔎 Audit flags / diagnostics:</strong> none detected in the checks performed.</div>';
  const referenceSummary = `<section><h3>📍 Where it is referenced (${refs.length})</h3><div class="table-wrap"><table class="reference-summary"><thead><tr><th>Ref</th><th>Project / workspace</th><th>Reference basis</th><th>Context</th></tr></thead><tbody>${refs.map((row, index) => {
    const data = evidence.get(row.occurrenceId);
    const cwd = data?.context.find((item) => item.field === 'cwd' || item.field === 'workingDirectory')?.value;
    const uri = row.provenance.workspaceIdentity?.uri;
    const cwdMatches = !!cwd && !!uri && listingFileIdentity(cwd) === listingFileIdentity(uri);
    return `<tr><td>${chip(index)}</td><td><a href="#${anchor}-workspace-${index + 1}" title="${safe(uri ?? row.provenance.workspaceStoragePath)}">${safe(name(row))}</a></td><td>${safe(referenceBasis(row))}</td><td>${cwdMatches ? pill('cwd matches', 'Observed path match; not proof of origin or redundancy.') : ''}${index > 0 ? pill('Additional workspace reference') : ''}</td></tr>`;
  }).join('')}</tbody></table></div></section>`;
  const routes = refs.map((row, index) => {
    const nodes = [`${chip(index)} ${safe(name(row))}`, safe(referenceBasis(row))];
    if (row.backing.status === 'verified') {
      const source = row.backing.source;
      if (source.kind === 'sdk-events') {
        source.scope.kind === 'subagent' && nodes.push('Parent identity + verified child scope');
        nodes.push(...[...new Set(source.identityEvidence.map((item) => item.match(/^(.+?\.(?:db|vscdb))(?::|$)/iu)?.[1] ?? item))].map((item) => `<span title="${safe(item)}">${safe(path.basename(item))}</span>`));
      }
      nodes.push(`${safe(path.basename(source.path))} ${source.kind === 'sdk-events' && source.scope.kind === 'subagent' ? '(shared with parent)' : ''}`);
    } else {
      nodes.push('Unresolved backing');
    }
    return nodes;
  });
  const chain = `<section><h3>⛓ Chain at a glance</h3><div class="source-chain">${routes[0]!.map((node) => `<span class="chain-node">${node}</span>`).join('<span class="chain-arrow">→</span>')}${refs.length > 1 ? pill(`${refs.length} workspace references`, 'Expand detailed lineage for each reference and its evidence route.') : ''}</div>${refs.length > 1 || refs.some((row) => row.parentOccurrenceId || row.backing.status !== 'verified') ? details('Detailed lineage map', `<div class="source-lineage">${routes.map((nodes) => `<div>${nodes.map((node) => `<span class="chain-node">${node}</span>`).join('<span class="chain-arrow">→</span>')}</div>`).join('')}</div>`) : ''}<p class="caption">Arrows show this report's recorded evidence route, not a mandatory VS Code database-access sequence. No database hop is inferred merely because its file exists.</p></section>`;
  const tuples = new Map<string, { field: string; text: string; refs: number[] }>();
  const add = (field: string, text: string, index: number) => {
    const key = JSON.stringify([field, text]);
    const existing = tuples.get(key);
    if (existing)
      existing.refs.push(index);
    else
      tuples.set(key, { field, text, refs: [index] });
  };
  refs.forEach((row, index) => {
    add('Full session ID', row.sessionId, index);
    add('Occurrence ID (exporter)', row.occurrenceId, index);
    add('Title / activity evidence', `${row.titleSource} / ${row.activitySource}`, index);
    add('Listing title', row.title, index);
    add('Created timestamp', row.createdTimestamp == null ? 'Not recorded' : String(row.createdTimestamp), index);
    add('Activity timestamp', row.activityTimestamp == null ? 'Not recorded' : String(row.activityTimestamp), index);
    add('Visibility', row.visibility.status === 'hidden' ? `hidden: ${row.visibility.reason}` : 'included', index);
    add('Provider', row.provider, index);
    add('User-data root', row.provenance.userDataRoot, index);
    add('Workspace name', name(row), index);
    add('Workspace identity', row.provenance.workspaceIdentity ? `${row.provenance.workspaceIdentity.kind} - ${row.provenance.workspaceIdentity.uri}` : 'Not recorded', index);
    add('Workspace storage', row.provenance.workspaceStoragePath, index);
    add('Workspace ID', path.basename(row.provenance.workspaceStoragePath), index);
    row.provenance.indexKey && add('Persisted index key', row.provenance.indexKey, index);
    row.parentOccurrenceId && add('Parent occurrence ID', row.parentOccurrenceId, index);
    if (row.backing.status === 'verified') {
      const source = row.backing.source;
      add('Backing session ID', source.sessionId, index);
      add('Backing path', source.path, index);
      add('Backing provenance workspace storage', source.provenance.workspaceStoragePath, index);
      source.provenance.indexKey && add('Backing provenance index key', source.provenance.indexKey, index);
      add('Schema version', String(source.schemaVersion), index);
      add('Inventory SHA-256', source.sha256, index);
      if (source.kind === 'sdk-events') {
        add('Producer', source.producer ?? 'Not recorded', index);
        add(source.scope.kind === 'subagent' ? 'Parent chat identity' : 'Exact chat identity', source.chatIdentity, index);
        add('Scope', JSON.stringify(source.scope), index);
        source.identityEvidence.forEach((item) => add('Identity evidence', item, index));
        add('Identity warnings', source.identityWarnings.join('; ') || 'none', index);
        add('Scope warnings', source.scopeWarnings.join('; ') || 'none', index);
      }
    }
    const data = evidence.get(row.occurrenceId);
    data?.context.forEach((item) => add(`${item.field} (${item.source})`, item.value, index));
    data?.titles.forEach((item) => add(`Title: ${item.source}`, item.value, index));
    data?.dates.filter((item) => !/^(?:events\.line:\d+\.|request\.\d+\.|prompt\.\d+\.)/u.test(item.source))
      .forEach((item) => add(`Date: ${item.source}`, `${item.timestamp} - ${item.recordedValue}`, index));
    if (data) {
      add('Rich content state', data.state, index);
      add('Conversation byte scope', data.byteScope, index);
      add('Scoped bytes', data.bytes == null ? 'Not measured' : String(data.bytes), index);
    }
  });
  const artifactRows = [...allArtifacts.values()].map(({ item, refs: seen }) => {
    const info = purpose(item);
    const breakdown = item.parts.length ? details('Composition / what uses the bytes', `<p class="caption">${safe(item.measurement)}</p>${item.database ? `<p>Logical stored values: ${storageBytes(item.database.logicalBytes)} across ${item.database.keys} keys. These are not additional physical bytes.</p>` : ''}<table><thead><tr><th>Contributor</th><th>Size</th><th>Records / files</th></tr></thead><tbody>${item.parts.map((part) => `<tr><td>${safe(part.name)}</td><td>${storageBytes(part.bytes)}</td><td>${part.count ?? '—'}</td></tr>`).join('')}</tbody></table>`)     : `<div class="caption">${safe(item.measurement || 'No composition available.')}</div>`;
    return `<tr><td><strong>${safe(item.kind)}</strong></td><td>Location</td><td>${prefixPath(item.path)}${breakdown}</td><td>${storageBytes(item.bytes)}<br>${safe(item.state)}${item.modified != null ? `<br><span class="datetime">🔄 ${formatLocalListingDate(item.modified)}</span>` : ''    }${item.files != null ? `<br>${item.files} ${item.files === 1 ? 'file' : 'files'}` : ''}</td><td>${seen.map(chip).join(' ')}${item.sharedBy ? `<div class="caption" title="Counts include all inventoried occurrences, including hidden ones; not a claim of exclusive ownership.">${item.sharedBy.conversations} report chats / ${item.sharedBy.occurrences} refs</div>` : ''}${item.kind === 'agent-host.db' ? pill('Global database', 'Not exclusively owned by these workspaces or this conversation.') : ''}</td><td>${safe(info.purpose)}</td><td>${safe(info.impact)}</td></tr>`;
  }).join('');
  const workspaceDetails = refs.map((row, index) => `<div id="${anchor}-workspace-${index + 1}">${chip(index)} <strong>${safe(name(row))}</strong> · ${safe(referenceBasis(row))}</div>`).join('');
  const technical = details('🔐 Technical identity / all unique values and reference differences', `  <p class="caption">Recorded prompt/event timestamps remain in Dates and provenance; prompt text remains in Ordered prompts. They are not repeated in this identity table.</p><div class="table-wrap"><table><thead><tr><th>Field</th><th>Unique value</th><th>Seen in</th></tr></thead><tbody>${[...tuples.values()].map((item) => `<tr><th>${safe(item.field)}</th><td>${value(item.text)}</td><td>${item.refs.map(chip).join(' ')}</td></tr>`).join('')}</tbody></table></div>`);
  const representativeData = evidence.get(group.representative.occurrenceId);
  const status = group.representative.backing.status === 'verified' ? `Verified ${group.representative.backing.source.kind} binding at inventory time` : 'Backing unresolved';
  const statusSummary = `<p class="source-status">${pill(status)}${pill(`Content: ${representativeData?.state ?? 'not read'}`)}${group.representative.backing.status === 'verified' && group.representative.backing.source.kind === 'sdk-events' && group.representative.backing.source.scope.kind === 'subagent' ? pill('Shared parent backing · scoped child', 'This child has no independent events.jsonl; its recorded scope is inside the parent backing file.') : ''}</p>`;
  const summary = `<section><h3>📦 Storage summary</h3><p>Scoped payload: ${storageBytes(representativeData?.bytes)}. ${representativeData?.byteScope && representativeData.byteScope !== 'unknown' ? safe(representativeData.byteScope) : 'Scope not measured.'}</p>${representativeData?.auditedBytes != null ? `<p>Checked Local journal / sibling total: ${storageBytes(representativeData.auditedBytes)}; includes the journal, excludes workspace databases.</p>` : ''}<p class="caption">Artifact sizes below are whole-file or directory measurements.   Shared files are listed once per card, not additional copies; do not sum across parent/child cards or directory and descendant-file rows. Database logical values and scoped SDK bytes are not reclaimable-space estimates.</p></section>`;
  const unified = details('🧰 Unified evidence table', `<p class="caption">W labels identify workspace references, not exclusive artifact ownership. Potential removal impacts are informational, not cleanup instructions.</p>${workspaceDetails}<div class="table-wrap"><table class="unified-evidence"><thead><tr><th>Artifact</th><th>Field</th><th>Value</th><th>Size / state</th><th>Tied to</th><th>Purpose</th><th>Potential impact if removed</th></tr></thead><tbody>${artifactRows || '<tr><td colspan="7">Storage artifacts were not collected.</td></tr>'}</tbody></table></div>${technical}`);
  return statusSummary + healthHtml + referenceSummary + chain + summary + unified;
}
