import { buildDocument } from '../markdown.ts';
import type { CompanionArtifact } from '../export-policy.ts';
import type { ParsedSession } from '../types.ts';
import { eventsInScope, readSdkEvents } from './sdk-events.ts';
import type { SdkEvent } from './sdk-events.ts';
import type { SdkEventSource, SessionOccurrence } from './sources.ts';
import { buildSdkSession } from './sdk-session.ts';
import { attachRunningTotals, attachUsage, copilotHomeOf, readUsageLedger, usageFromEvents } from './sdk-usage.ts';
import type { UsageCall } from './sdk-usage.ts';

export interface SdkExport {
  markdown: string;
  companions: CompanionArtifact[];
  session: ParsedSession;
  leftOut: Map<string, number>;
  /** Every event in the log, for the independent content check; delegated agents are included. */
  events: SdkEvent[];
}

export interface SdkExportOptions {
  title: string;
  assetsDirectory: string;
  outputPath: string;
  generatedAt: string;
  /** Usage rows the CLI stored for this chat (see readUsageForSource). Without them the log's own usage events are used. */
  ledger?: readonly UsageCall[];
}

/** Read the whole event log (main conversation and delegated agents), refusing one that changed since the inventory. */
export async function readSdkScope (source: SdkEventSource): Promise<SdkEvent[]> {
  const log = await readSdkEvents(source.path, source.sessionId);
  if (log.sha256 !== source.sha256)
    throw new Error('SDK event log changed since the inventory was taken; retry the export.');
  return log.events;
}

/** Pure: one verified SDK scope, with delegated agents nested, as Markdown plus the companion files it links to. */
export function renderSdkExport (events: SdkEvent[], source: SdkEventSource, options: SdkExportOptions): SdkExport {
  const scoped = eventsInScope(events, source.scope);
  const built = buildSdkSession(events, scoped, { title: options.title, assetsDirectory: options.assetsDirectory });
  const stored = options.ledger ?? [];
  stored.length ? attachUsage(built.session, stored, 'session-store', events, scoped) : attachUsage(built.session, usageFromEvents(events), 'event-log', events, scoped);
  attachRunningTotals(built.session, events);
  const opaque = built.session.turns.reduce((sum, turn) => sum + (turn.scalar.opaqueReasoningBlocks ?? 0), 0);
  const overflow = { assetsDirectory: options.assetsDirectory, companions: [] as CompanionArtifact[] };
  const base = buildDocument(built.session, {
    location: { sessionId: source.sessionId, sessionPath: source.path, hashRoot: '' },
    resources: { resources: [], byCall: new Map(), resourceRoot: '' },
    versions: { copilotVersion: built.copilotVersion, vscodeVersion: 'not recorded' },
    memory: { session: [], repo: [], user: [] },
    outputPath: options.outputPath,
    gitStatus: '',
    generatedAt: options.generatedAt,
    source: 'sdk-events',
    overflow,
  });
  const omissions = [...built.leftOut].sort(([left], [right]) => left.localeCompare(right));
  const lines = [
    '', '## Left out of this export', '',
    'These record kinds were counted and deliberately not exported (permissions, hooks and model request copies are noise; see the project notes).',
    '',
    '| What | Records |', '|---|---|',
    ...omissions.map(([name, count]) => `| ${name} | ${count.toLocaleString('en-US')} |`),
    ...(omissions.length ? [] : ['| (nothing) | 0 |']),
    '',
    `Reasoning recorded only as an encrypted token and therefore not readable: ${opaque.toLocaleString('en-US')} assistant message(s).`,
    '',
  ];
  return { markdown: `${base}${lines.join('\n')}`, companions: [...built.companions, ...overflow.companions], session: built.session, leftOut: built.leftOut, events };
}

/** The usage rows the CLI stored for one chat's event log, read without changing the database. Empty when there are none. */
export function readUsageForSource (source: SdkEventSource): UsageCall[] {
  return readUsageLedger(copilotHomeOf(source.path), source.sessionId).calls;
}

/** Convenience for callers that do not need the two steps apart. */
export async function exportSdkScope (source: SdkEventSource, options: SdkExportOptions): Promise<SdkExport> {
  return renderSdkExport(await readSdkScope(source), source, { ledger: readUsageForSource(source), ...options });
}

export interface SdkSelection { occurrence: SessionOccurrence; source: SdkEventSource }

/**
 * A verified main-scope Agent Host or Copilot CLI chat selected by its exact qualified chat key,
 * its native chat UUID, or the SDK backing session ID (the folder name under `session-state`), or
 * a unique prefix of at least 8 hex characters of either. Several workspace references to one backing are one chat.
 */
export function selectSdkSession (occurrences: readonly SessionOccurrence[], selector: string): SdkSelection | SdkSelection[] | null {
  const wanted = selector.toLowerCase().replaceAll('-', '');
  const prefix = wanted.length >= 8 && /^[0-9a-f]+$/u.test(wanted);
  const matches = new Map<string, SdkSelection>();
  for (const occurrence of occurrences) {
    const backing = occurrence.backing;
    if (backing.status !== 'verified' || backing.source.kind !== 'sdk-events' || backing.source.scope.kind !== 'main')
      continue;
    const native = occurrence.sessionId.replace(/^.*?:\//u, '').split('#')[0]!.toLowerCase().replaceAll('-', '');
    const sdk = backing.source.sessionId.toLowerCase().replaceAll('-', '');
    const exact = occurrence.sessionId.toLowerCase() === selector.toLowerCase();
    if (exact || (prefix && (native.startsWith(wanted) || sdk.startsWith(wanted))))
      matches.set(`${backing.source.path}|${backing.source.chatIdentity}`, { occurrence, source: backing.source });
  }
  const found = [...matches.values()];
  return found.length === 0 ? null : found.length === 1 ? found[0]! : found;
}
