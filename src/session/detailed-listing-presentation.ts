import type { SessionOccurrence } from './sources.ts';
import type { ConversationGroup } from './listing-model.ts';
import type { ListingEvidence, ListingTitleEvidence } from './listing-evidence-types.ts';
import { sessionType, UUID } from './listing-model.ts';

export function detailedTypeOf (type: string) {
  switch (type) {
    case 'local': return { key: 'local', label: 'Local', icon: '💬' };
    case 'sub-agent': return { key: 'child', label: 'Sub-agent', icon: '↳' };
    case 'agent': return { key: 'agent', label: 'Agent Host', icon: '🤖' };
    case 'CLI agent': return { key: 'cli', label: 'Copilot CLI', icon: '💻' };
    case 'external': return { key: 'external', label: 'External', icon: '🌐' };
    default: return { key: 'other', label: 'Other', icon: '📦' };
  }
}

export function detailedChatType (row: SessionOccurrence) {
  return detailedTypeOf(sessionType(row));
}

export function detailedTitles (group: ConversationGroup, evidence: ReadonlyMap<string, ListingEvidence>): ListingTitleEvidence[] {
  const titles = group.occurrences.flatMap((row) => [
    ...(evidence.get(row.occurrenceId)?.titles ?? []),
    { source: `listing.${row.titleSource}`, value: row.title },
  ]);
  return titles.filter((title, index) => title.value.trim()
    && titles.findIndex((other) => other.source === title.source && other.value === title.value) === index);
}

/** Presentation only; recorded titles never replace the identity used for grouping/export. */
export function detailedTitle (group: ConversationGroup, titles: readonly ListingTitleEvidence[], parentTitle?: string): string {
  if (sessionType(group.representative) !== 'sub-agent')
    return group.representative.title || '(untitled)';
  const titled = group.occurrences.find((row) => row.titleSource !== 'fallback'
    && row.title.trim() && !/^(?:Subagent(?:\s+[0-9a-f-]+)?|New Chat|\(untitled\))$/iu.test(row.title.trim()));
  const recorded = titles.find((title) => title.source === 'delegation.arguments.description')
    ?? titles.find((title) => title.source === 'delegation.arguments.name')
    ?? titles.find((title) => title.source === 'subagent.started.agentDisplayName');
  return titled?.title ?? recorded?.value ?? `Subagent (${parentTitle || 'parent title unavailable'})`;
}

export function detailedWorkspace (group: ConversationGroup, parent?: ConversationGroup, data?: ListingEvidence) {
  const workspaceRow = (items: readonly SessionOccurrence[]) => items.find((row) => row.provenance.workspaceIdentity?.uri
    && !/agent-sessions\.code-workspace$/iu.test(row.provenance.workspaceIdentity.uri))
    ?? items.find((row) => row.provenance.workspaceIdentity?.uri);
  const own = workspaceRow(group.occurrences);
  const inherited = sessionType(group.representative) === 'sub-agent' && parent ? workspaceRow(parent.occurrences) : undefined;
  const uri = (inherited ?? own)?.provenance.workspaceIdentity?.uri
    ?? data?.context.find((item) => ['cwd', 'git_root', 'workingDirectory'].includes(item.field))?.value;
  let decoded = uri ?? '';
  let invalidEncoding = false;
  try {
    decoded = decodeURIComponent(decoded);
  } catch (error) {
    if (!(error instanceof URIError))
      throw error;
    invalidEncoding = true;
  }
  const name = decoded.replace(/[\\/]+$/u, '').split(/[\\/]/u).at(-1) || 'workspace unknown';
  return { uri: `${uri ?? 'Workspace/project not recorded'}${invalidEncoding ? ' (invalid URI encoding; recorded text retained)' : ''}`, name, inherited: Boolean(inherited), known: Boolean(uri) };
}

export function detailedBytes (bytes: number | null | undefined): string {
  if (bytes == null)
    return 'unknown';
  return `${bytes.toLocaleString('en-US')} bytes (${(bytes / 1024 / 1024).toFixed(1)} MB)`;
}

export function detailedHeaderId (row: SessionOccurrence): { value: string; title: string } {
  if (row.backing.status === 'verified' && row.backing.source.kind === 'sdk-events'
    && row.backing.source.scope.kind === 'subagent')
    return { value: row.backing.source.scope.agentId, title: `Exact child agent ID; provider/native key: ${row.sessionId}` };
  const nativeId = row.sessionId.match(/^[^:]+:\/([^?#/]+)/u)?.[1];
  return { value: nativeId && UUID.test(nativeId) ? nativeId : row.sessionId, title: `Provider/native key: ${row.sessionId}` };
}

/** Rich report metrics differ from the compact inventory's human-prompt policy. */
export function detailedMetrics (group: ConversationGroup, evidence?: ListingEvidence) {
  const source = group.representative.backing.status === 'verified' ? group.representative.backing.source : undefined;
  const read = evidence?.state === 'read';
  const scopedDates = read && source?.kind === 'sdk-events'
    ? evidence.dates.filter((item) => /^events\.line:\d+\.timestamp$/u.test(item.source)).map((item) => item.timestamp) : [];
  return {
    turns: read ? evidence.flags.includes('incomplete-prompt-evidence') ? null : evidence.turns.length : group.promptCount,
    created: scopedDates.length ? Math.min(...scopedDates) : group.createdTimestamp,
    updated: scopedDates.length ? Math.max(...scopedDates) : group.activityTimestamp,
  };
}
