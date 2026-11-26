import { buildDocument } from '../markdown.ts';
import type { FenceRepairs } from '../markdown.ts';
import type { CompanionArtifact } from '../export-policy.ts';
import type { ParsedSession, ToolGroupOrder } from '../types.ts';
import { eventsInScope, readSdkEvents } from './sdk-events.ts';
import type { SdkEvent } from './sdk-events.ts';
import type { InventoryDiagnostic, SdkEventSource, SessionOccurrence } from './sources.ts';
import { diagnosticAffectsSelector } from './sources.ts';
import { buildSdkSession } from './sdk-session.ts';
import { attachRunningTotals, attachUsage, copilotHomeOf, readUsageLedger, selectUsage, usageForScope } from './sdk-usage.ts';
import type { UsageCall } from './sdk-usage.ts';
import type { SourceCopy } from './source-snapshot.ts';

export interface SdkExport {
  fenceRepairs: FenceRepairs;
  markdown: string;
  companions: CompanionArtifact[];
  session: ParsedSession;
  leftOut: Map<string, number>;
  /** Selected conversation and descendants, for the independent content check. Main selections cover the whole log. */
  events: SdkEvent[];
  toolGroupOrder: ToolGroupOrder;
}

export interface SdkExportOptions {
  sourceCopy?: SourceCopy;
  title: string;
  assetsDirectory: string;
  outputPath: string;
  generatedAt: string;
  toolGroupOrder?: ToolGroupOrder;
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
  const built = buildSdkSession(events, scoped, { title: options.title, assetsDirectory: options.assetsDirectory, scope: source.scope });
  const rootAgentId = source.scope.kind === 'subagent' ? source.scope.agentId : null;
  const selected = usageForScope(events, selectUsage(events, options.ledger), rootAgentId);
  attachUsage(built.session, selected.calls, selected.source, built.events, scoped, selected.selection, rootAgentId);
  source.scope.kind === 'main' && attachRunningTotals(built.session, built.events);
  const opaque = built.session.turns.reduce((sum, turn) => sum + (turn.scalar.opaqueReasoningBlocks ?? 0), 0);
  const overflow = { assetsDirectory: options.assetsDirectory, companions: [] as CompanionArtifact[] };
  const fenceRepairs: FenceRepairs = { early: [], turnEnd: 0, html: [] };
  const base = buildDocument(built.session, {
    location: { sessionId: source.sessionId, sessionPath: source.path, hashRoot: '' },
    resources: { resources: [], byCall: new Map(), resourceRoot: '' },
    versions: { copilotVersion: built.copilotVersion, vscodeVersion: 'not recorded' },
    memory: { session: [], repo: [], user: [] },
    outputPath: options.outputPath,
    gitStatus: '',
    generatedAt: options.generatedAt,
    toolGroupOrder: options.toolGroupOrder ?? 'request',
    source: 'sdk-events',
    sourceCopy: options.sourceCopy,
    overflow,
    fenceRepairs,
  });
  const omissions = [...built.leftOut].sort(([left], [right]) => left.localeCompare(right));
  const childWarning = built.unresolvedChildScopes === 1
    ? '- 1 child conversation was omitted because its sub-agent mapping was ambiguous or incomplete. The parent conversation remains included.'
    : `- ${built.unresolvedChildScopes} child conversations were omitted because their sub-agent mappings were ambiguous or incomplete. The parent conversation remains included.`;
  const lines = [
    '',
    ...(built.unresolvedChildScopes === 0 ? [] : [
      '## Export warnings', '', childWarning,
      '',
    ]),
    '## Left out of this export', '',
    'These record kinds were counted and deliberately not exported (permissions, hooks and model request copies are noise; see the project notes).',
    '',
    '| What | Records |', '|---|---|',
    ...omissions.map(([name, count]) => `| ${name} | ${count.toLocaleString('en-US')} |`),
    ...(omissions.length ? [] : ['| (nothing) | 0 |']),
    '',
    `Reasoning recorded only as an encrypted token and therefore not readable: ${opaque.toLocaleString('en-US')} assistant message(s).`,
    '',
  ];
  return { markdown: `${base}${lines.join('\n')}`, companions: [...built.companions, ...overflow.companions], session: built.session, leftOut: built.leftOut, events: [...built.events], fenceRepairs, toolGroupOrder: options.toolGroupOrder ?? 'request' };
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

const SDK_SESSION_KEY_PATTERN = /^(?:agent-host-copilotcli|copilotcli):\/[a-z0-9._~-]+(?:[/#][a-z0-9._~-]+)*$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SdkSelectionCheck {
  qualified: boolean;
  sdk: SdkSelection | SdkSelection[] | null;
  local: SessionOccurrence[];
  unresolvedSdk: SessionOccurrence[];
  blockingDiagnostics: InventoryDiagnostic[];
}

function bareIdMatch (candidate: string, selector: string, qualified: boolean): boolean {
  if (qualified)
    return false;
  const wanted = selector.toLowerCase().replaceAll('-', '');
  const prefix = wanted.length >= 8 && /^[0-9a-f]+$/u.test(wanted);
  if (!prefix)
    return false;
  return candidate.replaceAll('-', '').toLowerCase().startsWith(wanted);
}

/** Checks all providers before the SDK command creates a capture or any export artifact. */
export function inspectSdkSelection (
  occurrences: readonly SessionOccurrence[],
  diagnostics: readonly InventoryDiagnostic[],
  selector: string,
): SdkSelectionCheck {
  const qualified = SDK_SESSION_KEY_PATTERN.test(selector);
  const local = occurrences.filter((occurrence) =>
    occurrence.provider === 'local' && UUID.test(occurrence.sessionId)
    && occurrence.localJournalPath !== undefined
    && bareIdMatch(occurrence.sessionId, selector, qualified));
  const unresolvedSdk = occurrences.filter((occurrence) => {
    if (occurrence.provider !== 'agent-host' && occurrence.provider !== 'copilot-cli')
      return false;
    if (occurrence.backing.status === 'verified' && occurrence.backing.source.kind === 'sdk-events')
      return false;
    if (qualified)
      return occurrence.sessionId.toLowerCase() === selector.toLowerCase();
    const native = occurrence.sessionId.replace(/^.*?:\//u, '').split('#')[0]!;
    return bareIdMatch(native, selector, false);
  });
  const blockingDiagnostics = qualified
    ? []
    : diagnostics.filter((diagnostic) => diagnosticAffectsSelector(diagnostic, selector));
  return {
    qualified,
    sdk: selectSdkSession(occurrences, selector),
    local,
    unresolvedSdk,
    blockingDiagnostics,
  };
}

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
