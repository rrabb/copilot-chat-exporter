import type { InventoryDiagnostic, SessionOccurrence } from './sources.ts';
import { isChildScopeKey } from './sources.ts';
import { formatLocalListingDate } from './listing-preview.ts';

export interface SessionListingOptions {
  showIgnored?: boolean;
  last25?: boolean;
  fullIds?: boolean;
  terminalWidth?: number;
  /** Show sub-agent rows. Hidden by default because they export inside their parent chat. */
  subagents?: boolean;
  /** Case-insensitive text that a row's title, ID or selector must contain. */
  find?: string;
  /** Dim unresolved rows and unknown cells with ANSI codes. Set only for an interactive terminal. */
  color?: boolean;
  /** Time used for the shared UTC offset line. Defaults to the current time. */
  now?: number;
  /** Local year of the listing run. Omit to keep the year in every console date. */
  referenceYear?: number;
  diagnostics?: readonly InventoryDiagnostic[];
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface ConversationGroup {
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

/**
 * Shortest unique selector per group, keyed by group key. Local and SDK rows both use a prefix of
 * the chat UUID. A full-UUID collision falls back to the exact Local path or the qualified SDK key.
 * Sub-agent rows reuse their parent's selector, because they export inside the parent chat.
 */
export function shortIds (groups: readonly ConversationGroup[]): Map<string, string> {
  const isChild = (group: ConversationGroup) => sessionType(group.representative) === 'sub-agent';
  const aliases = groups.filter((group) => !isChild(group)).flatMap((group) =>
    group.occurrences.flatMap((occurrence) => {
      const values = [occurrence.sessionId];
      const backing = occurrence.backing;
      if (backing.status === 'verified' && backing.source.kind === 'sdk-events')
        values.push(backing.source.chatIdentity, backing.source.sessionId);
      return values.flatMap((value) => {
        const candidate = nativeId(value);
        return UUID.test(candidate) ? [candidate.replaceAll('-', '').toLowerCase()] : [];
      }).map((id) => ({ group, id }));
    }));
  const pick = (group: ConversationGroup): string => {
    const session = group.representative;
    if (session.provider !== 'local' && session.backing.status !== 'verified')
      return '-';
    const id = nativeId(session.sessionId);
    if (!UUID.test(id))
      return session.sessionId;
    const compactId = id.replaceAll('-', '').toLowerCase();
    let prefixLength = 8;
    while (prefixLength < compactId.length && aliases.some((candidate) =>
      candidate.group !== group && candidate.id.startsWith(compactId.slice(0, prefixLength))))
      prefixLength += 1;
    const collidesAtFullId = aliases.some((candidate) => candidate.group !== group && candidate.id === compactId);
    if (!collidesAtFullId)
      return compactId.slice(0, prefixLength);
    if (session.provider === 'local')
      return session.localJournalPath ?? compactId;
    return session.sessionId;
  };
  const result = new Map<string, string>();
  for (const group of groups.filter((candidate) => !isChild(candidate)))
    result.set(group.key, pick(group));
  for (const group of groups.filter(isChild)) {
    const parentId = parentKey(group.representative.sessionId);
    const parent = groups.find((candidate) => !isChild(candidate) && candidate.representative.sessionId === parentId);
    result.set(group.key, parent ? result.get(parent.key)! : pick(group));
  }
  return result;
}

export function sessionType (session: SessionOccurrence): string {
  if (session.backing.status === 'verified'
    && session.backing.source.kind === 'sdk-events'
    && session.backing.source.scope.kind === 'subagent')
    return 'sub-agent';
  if (isChildScopeKey(session.sessionId))
    return 'sub-agent';
  if (session.provider === 'agent-host')
    return 'agent';
  if (session.provider === 'copilot-cli')
    return 'CLI agent';
  return session.provider;
}

export function groupOccurrences (occurrences: readonly SessionOccurrence[]): ConversationGroup[] {
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

export function cleanCell (value: string): string {
  return value.replace(/[\r\n\t]+/gu, ' ').replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/\|/gu, '¦').replace(/\s{2,}/gu, ' ').trim();
}

export function fit (value: string, width: number): string {
  const clean = cleanCell(value);
  const characters = Array.from(clean);
  if (characters.length <= width)
    return clean.padEnd(width);
  return `${characters.slice(0, Math.max(0, width - 1)).join('')}…`;
}

/** Local UTC offset label such as `UTC-5h` or `UTC+5:30`. */
export function offsetLabel (timestamp: number): string {
  const offsetMinutes = -new Date(timestamp).getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetRemainder = String(Math.abs(offsetMinutes) % 60).padStart(2, '0');
  return `UTC${offsetSign}${offsetRemainder === '00' ? `${offsetHours}h` : `${offsetHours}:${offsetRemainder}`}`;
}

/** Formats a local date with a compact UTC offset when it differs from the listing's shared offset. */
export function dateCell (timestamp: number | null, referenceYear?: number, sharedOffset?: string): string {
  if (timestamp === null || !Number.isFinite(timestamp))
    return '?';
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime()))
    throw new RangeError('Timestamp is outside the supported date range.');
  const offset = offsetLabel(timestamp);
  const full = formatLocalListingDate(timestamp).replace('_', '-');
  const localDate = date.getFullYear() === referenceYear ? full.slice(2) : full;
  return offset === sharedOffset ? localDate : `${localDate}${offset.slice(3)}`;
}

/** The parent chat key of a child-scope key. */
export function parentKey (sessionId: string): string {
  return sessionId.split(/#subagent\/|\?subagentChatResource/u)[0]!;
}

/** The chat UUID inside a Local ID or a qualified SDK key such as `agent-host-copilotcli:/<uuid>#...`. */
export function nativeId (sessionId: string): string {
  return sessionId.replace(/^.*?:\//u, '').split(/[#?]/u)[0]!;
}

export function ignoredCounts (groups: readonly ConversationGroup[]) {
  const counts = new Map<string, number>();
  for (const group of groups) {
    if (group.visibility.status === 'hidden')
      counts.set(group.visibility.reason, (counts.get(group.visibility.reason) ?? 0) + 1);
  }
  return counts;
}

export function localWorkspaceCounts (groups: readonly ConversationGroup[]): Map<string, number> {
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

export function diagnosticCounts (
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
