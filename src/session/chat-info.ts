import path from 'node:path';
import { redactText } from '../redaction.ts';
import type { SessionInventory } from './inventory.ts';
import type { ListingEvidence, ListingFileChange, ListingTurnEvidence } from './listing-evidence-types.ts';
import type { SessionOccurrence } from './sources.ts';
import { collectListingEvidence } from './listing-evidence.ts';
import { inspectSdkSelection } from './sdk-export.ts';
import { currentSessionFromEnv } from './locate.ts';
import { dateCell, groupOccurrences, offsetLabel, parentKey, sessionType, shortIds } from './listing-model.ts';
import type { ConversationGroup } from './listing-model.ts';
import { detailedChatType, detailedMetrics, detailedProjects, detailedTitle, detailedTitles } from './detailed-listing-presentation.ts';
import { listingModelLabel } from './listing-preview.ts';
import { compactTokenCount, listingUsage } from './listing-usage.ts';
import { listingRelationships } from './listing-relationships.ts';
import type { ListingRelationship } from './listing-relationships.ts';

export interface ChatInfoTitle { source: string; value: string }
export interface ChatInfoDate { source: string; timestamp: number; recordedValue: string }
export interface ChatInfoProject { name: string; uri: string; kind: 'folder' | 'workspace' }
export interface ChatInfoTurn {
  number: number; prompt: string; responsePreview: string | null; timestamp: number | null;
  role: 'human' | 'delegated' | 'follow-up'; model: string | null; effort: string | null;
  credits: number | null; promptTokens: number | null; completionTokens: number | null;
  editCount: number; addedLines: number | null; removedLines: number | null;
  canceled: boolean; error: boolean;
}
export interface ChatInfoTopTurn { number: number; prompt: string; credits: number | null }
export interface ChatInfoSubagent {
  selector: string; title: string; type: 'Sub-agent';
  status: 'verified' | 'unresolved' | 'unsupported'; promptCount: number;
  sourcePath: string | null; models: string[]; credits: number | null;
  firstPrompt: string | null; backingId: string | null;
}
export interface ChatInfoRelationship {
  kind: ListingRelationship['kind']; direction: 'parent' | 'child' | 'from' | 'to';
  target: string; evidence: string;
}
export interface ChatInfoArtifact {
  kind: string; path: string; state: 'present' | 'missing' | 'unreadable' | 'changed';
  bytes: number | null; files: number | null;
}
export interface ChatInfoStorageGroup {
  kind: 'chat' | 'vscode' | 'shared'; label: string; bytes: number | null;
  partial: boolean; lockFiles: number; artifacts: ChatInfoArtifact[];
}
export interface ChatInfoFileChange {
  path: string; operation: string; added: number | null; removed: number | null;
  turns: number[]; estimated: boolean;
}
export interface ChatInfoUsageModel {
  model: string; calls: number; credits: number | null; inputTokens: number | null;
  cacheReadTokens: number | null; cacheWriteTokens: number | null;
  outputTokens: number | null; cacheShare: number | null;
}
export interface ChatInfoUsage {
  kind: 'ai-credits' | 'local-copilot-credits' | 'none'; unit: string;
  credits: number | null; creditsRecorded: number; creditsTurns: number;
  promptTokens: number | null; promptTokensRecorded: number;
  completionTokens: number | null; completionTokensRecorded: number;
  cacheReadTokens: number | null; cacheWriteTokens: number | null; cacheShare: number | null;
  byModel: ChatInfoUsageModel[]; perCallRows: number | null; replies: number | null;
  complete: boolean; loggedCredits?: number | null; source?: string;
}
export interface ChatInfo {
  schemaVersion: 0; unstable: true; title: string; titleSources: ChatInfoTitle[];
  type: string; status: 'verified' | 'unresolved' | 'unsupported'; exportSupport: 'yes' | 'no';
  selector: string; fullKey: string; backingId: string; sourceKind: string; sourcePath: string | null;
  identityEvidence: string[]; indexKeys: string[]; occurrenceIds: string[];
  projects: ChatInfoProject[]; cwd: string | null; branch: string | null;
  created: number | null; updated: number | null; promptCount: number | null; replyCount: number | null;
  canceledTurns: number; errorTurns: number; subagentCount: number; models: string[]; modelChain: string;
  usage: ChatInfoUsage; editCount: number | null; addedLines: number | null; removedLines: number | null;
  files: ChatInfoFileChange[]; firstPrompt: string | null; lastPrompt: string | null;
  topTurns: ChatInfoTopTurn[]; turns: ChatInfoTurn[]; subagents: ChatInfoSubagent[];
  relationships: ChatInfoRelationship[]; artifacts: ChatInfoArtifact[]; storageGroups: ChatInfoStorageGroup[];
  scopedPayloadBytes: number | null; scopedPayloadLabel: string; totalBytes: number | null; totalBytesPartial?: boolean;
  dates: ChatInfoDate[]; warnings: string[]; diagnostics: string[]; exportCommand: string;
}

export class ChatInfoSelectionError extends Error {
  constructor (message: string) { super(message); this.name = 'ChatInfoSelectionError'; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const UUID_PREFIX = /^[0-9a-f]{8,32}$/iu;
const redacted = (value: string) => redactText(value).text;
const exactPath = (file: string) => path.resolve(file).replace(/[\\/]+$/u, '').toLowerCase();
const cleanText = (value: string) => redacted(value).replace(/[\r\n\t]+/gu, ' ').replace(/\s{2,}/gu, ' ').trim();

function oneLine (value: string | null | undefined, width = 120): string {
  if (!value) return '?';
  const chars = Array.from(cleanText(value));
  return chars.length <= width ? chars.join('') : `${chars.slice(0, Math.max(0, width - 1)).join('')}…`;
}

function localMatches (inventory: SessionInventory, selector: string): SessionOccurrence[] {
  if (selector.endsWith('.jsonl')) {
    const wanted = exactPath(selector);
    return inventory.occurrences.filter((row) => row.provider === 'local'
      && [row.localJournalPath, row.backing.status === 'verified'
        && row.backing.source.kind === 'local-journal' ? row.backing.source.path : null]
        .some((file) => typeof file === 'string' && exactPath(file) === wanted));
  }
  if (UUID_PREFIX.test(selector)) {
    const wanted = selector.replaceAll('-', '').toLowerCase();
    return inventory.occurrences.filter((row) => row.provider === 'local' && UUID.test(row.sessionId)
      && row.sessionId.replaceAll('-', '').toLowerCase().startsWith(wanted));
  }
  return [];
}

export function selectChatInfoOccurrence (inventory: SessionInventory, selector?: string): SessionOccurrence {
  let wanted = selector?.trim();
  if (!wanted) {
    const current = currentSessionFromEnv();
    if (!current)
      throw new ChatInfoSelectionError('--current could not be verified. Run from a Copilot chat or pass a session selector.');
    wanted = current.sessionId;
  }
  if (wanted.endsWith('.jsonl')) {
    const matches = localMatches(inventory, wanted);
    if (matches.length === 1) return matches[0]!;
    if (!matches.length) throw new ChatInfoSelectionError(`No Local chat has journal path ${wanted}.`);
    throw new ChatInfoSelectionError(`The journal path ${wanted} matches ${matches.length} occurrences; a unique result was not verified.`);
  }
  const exactChildren = inventory.occurrences.filter((row) => row.backing.status === 'verified'
    && row.backing.source.kind === 'sdk-events' && row.backing.source.scope.kind === 'subagent'
    && row.sessionId.toLowerCase() === wanted!.toLowerCase());
  if (exactChildren.length === 1) return exactChildren[0]!;
  if (exactChildren.length > 1)
    throw new ChatInfoSelectionError(`The selector matches ${exactChildren.length} SDK child conversations. Pass a verified qualified SDK key.`);
  const checked = inspectSdkSelection(inventory.occurrences, inventory.diagnostics, wanted);
  if (checked.blockingDiagnostics.length)
    throw new ChatInfoSelectionError('The selector could hide a chat and cannot be resolved safely. Exact Local paths and verified SDK keys are available in --list.');
  const local = localMatches(inventory, wanted);
  const sdk = checked.sdk;
  const sdkMatches = sdk === null ? [] : Array.isArray(sdk) ? sdk : [sdk];
  if (local.length > 1) throw new ChatInfoSelectionError(`The selector matches ${local.length} Local conversations. Pass an exact .jsonl path.`);
  if (sdkMatches.length > 1) throw new ChatInfoSelectionError(`The selector matches ${sdkMatches.length} SDK conversations. Pass a verified qualified SDK key.`);
  if (local.length === 1 && sdkMatches.length === 1)
    throw new ChatInfoSelectionError('The selector matches both a Local and an SDK chat. Pass an exact Local .jsonl path or a verified qualified SDK key.');
  if (local.length === 1) return local[0]!;
  if (sdkMatches.length === 1) return sdkMatches[0]!.occurrence;
  if (checked.unresolvedSdk.length)
    throw new ChatInfoSelectionError('The selector matched unresolved SDK chat data. Pass a verified qualified SDK key or run --list.');
  throw new ChatInfoSelectionError(`No chat matched selector "${wanted}". Run --list to copy an ID/PREFIX.`);
}

function statusFor (row: SessionOccurrence): 'verified' | 'unresolved' | 'unsupported' {
  return row.backing.status === 'verified' ? 'verified' : row.backing.status === 'unsupported' ? 'unsupported' : 'unresolved';
}
function typeFor (row: SessionOccurrence): string {
  const type = detailedChatType(row);
  return type.key === 'cli' ? 'cli-agt' : type.label;
}
function firstAndLastPrompt (turns: readonly ListingTurnEvidence[]) {
  const prompts = turns.map((turn) => oneLine(turn.prompt, 160)).filter((prompt) => prompt !== '?');
  return { first: prompts[0] ?? null, last: prompts.at(-1) ?? null };
}
function modelSequence (turns: readonly ListingTurnEvidence[]): string {
  const sequence: { model: string; count: number }[] = [];
  for (const turn of turns) {
    const modelId = turn.selectedModel ?? turn.models[0] ?? null;
    if (!modelId) continue;
    const model = listingModelLabel(modelId);
    const last = sequence.at(-1);
    if (last?.model === model) last.count += 1;
    else sequence.push({ model, count: 1 });
  }
  return sequence.length ? sequence.map((item) => item.count > 1 ? `${item.model} ×${item.count}` : item.model).join(' → ') : '?';
}
function changeSum (files: readonly ListingFileChange[], key: 'added' | 'removed'): number | null {
  return files.some((file) => file[key] === null) ? null : files.reduce((sum, file) => sum + (file[key] ?? 0), 0);
}
function aggregateFiles (turns: readonly ListingTurnEvidence[]): ChatInfoFileChange[] {
  const result = new Map<string, { path: string; operations: Set<string>; added: number | null; removed: number | null; turns: Set<number>; estimated: boolean }>();
  for (const [index, turn] of turns.entries()) {
    for (const file of turn.files) {
      const key = exactPath(file.file);
      const item = result.get(key) ?? { path: file.file, operations: new Set<string>(), added: 0, removed: 0, turns: new Set<number>(), estimated: false };
      item.operations.add(file.operation); item.turns.add(index + 1); item.estimated ||= file.estimated;
      item.added = item.added === null || file.added === null ? null : item.added + file.added;
      item.removed = item.removed === null || file.removed === null ? null : item.removed + file.removed;
      result.set(key, item);
    }
  }
  return [...result.values()].map((item) => ({ path: redacted(item.path), operation: [...item.operations].join(', '),
    added: item.added, removed: item.removed, turns: [...item.turns].sort((a, b) => a - b), estimated: item.estimated }))
    .sort((left, right) => left.path.localeCompare(right.path));
}
function sumEditLines (evidence: ListingEvidence) {
  const files = aggregateFiles(evidence.turns);
  if (evidence.editTurns === null) return { editCount: null, added: null, removed: null, files };
  return { editCount: files.length, added: changeSum(evidence.files, 'added'), removed: changeSum(evidence.files, 'removed'), files };
}
function turnCountAndReplyCount (evidence: ListingEvidence) {
  if (evidence.state !== 'read') return { promptCount: null, replyCount: null };
  if (evidence.flags.includes('incomplete-prompt-evidence'))
    return { promptCount: null, replyCount: evidence.responsePresent === true ? evidence.turns.length : null };
  return { promptCount: evidence.turns.length, replyCount: evidence.turns.filter((turn) => turn.responsePresent === true).length };
}
function usageModels (evidence: ListingEvidence): ChatInfoUsageModel[] {
  return (evidence.usage?.byModel ?? []).map((item) => ({ model: listingModelLabel(item.model), calls: item.calls,
    credits: item.credits, inputTokens: item.inputTokens, cacheReadTokens: item.cacheReadTokens,
    cacheWriteTokens: item.cacheWriteTokens, outputTokens: item.outputTokens,
    cacheShare: item.inputTokens && item.cacheReadTokens !== null ? item.cacheReadTokens / item.inputTokens : null }));
}
function chatUsage (row: SessionOccurrence, evidence: ListingEvidence): ChatInfoUsage {
  const totals = listingUsage(evidence.turns);
  const models = usageModels(evidence);
  const cacheReadTokens = models.length ? models.reduce((sum, item) => sum + (item.cacheReadTokens ?? 0), 0) : null;
  const cacheWriteTokens = models.length ? models.reduce((sum, item) => sum + (item.cacheWriteTokens ?? 0), 0) : null;
  const byModelInput = models.length ? models.reduce((sum, item) => sum + (item.inputTokens ?? 0), 0) : null;
  const cacheShare = byModelInput && cacheReadTokens !== null ? cacheReadTokens / byModelInput : null;
  if (row.provider === 'local') return {
    kind: 'local-copilot-credits', unit: 'request.copilotCredits (different unit, unverified)',
    credits: totals.credits.total, creditsRecorded: totals.credits.recorded, creditsTurns: totals.credits.turns,
    promptTokens: totals.promptTokens.total, promptTokensRecorded: totals.promptTokens.recorded,
    completionTokens: totals.completionTokens.total, completionTokensRecorded: totals.completionTokens.recorded,
    cacheReadTokens: null, cacheWriteTokens: null, cacheShare: null, byModel: [], perCallRows: null, replies: null,
    complete: totals.credits.recorded === totals.credits.turns, source: 'Local request counters',
  };
  return {
    kind: evidence.usage ? 'ai-credits' : 'none', unit: 'AI credits (nano-AIU / 1,000,000,000)',
    credits: totals.credits.total, creditsRecorded: totals.credits.recorded, creditsTurns: totals.credits.turns,
    promptTokens: totals.promptTokens.total, promptTokensRecorded: totals.promptTokens.recorded,
    completionTokens: totals.completionTokens.total, completionTokensRecorded: totals.completionTokens.recorded,
    cacheReadTokens, cacheWriteTokens, cacheShare, byModel: models, perCallRows: evidence.usage?.perCallRows ?? null,
    replies: evidence.usage?.replies ?? null, complete: evidence.usage?.complete ?? totals.credits.recorded === totals.credits.turns,
    loggedCredits: evidence.usage?.loggedCredits ?? null, source: evidence.usage?.source ?? 'No supported recorded counter',
  };
}
function relatedChildGroups (selected: ConversationGroup, groups: readonly ConversationGroup[], relationships: readonly ListingRelationship[]) {
  const byKey = new Map(groups.map((group) => [group.key, group]));
  return [...new Set(relationships.filter((edge) => edge.kind === 'parent' && edge.to === selected.key && edge.from !== selected.key)
    .map((edge) => byKey.get(edge.from)).filter((group): group is ConversationGroup => group !== undefined))];
}
function artifactRows (evidence: ListingEvidence): ChatInfoArtifact[] {
  const unique = new Map<string, ChatInfoArtifact>();
  for (const item of evidence.storage ?? []) unique.set(exactPath(item.path), {
    kind: item.kind, path: redacted(item.path), state: item.state, bytes: item.bytes, files: item.files,
  });
  return [...unique.values()].sort((left, right) => left.path.localeCompare(right.path));
}
function storageGroups (artifacts: readonly ChatInfoArtifact[]): ChatInfoStorageGroup[] {
  const groups = new Map<'chat' | 'vscode' | 'shared', ChatInfoArtifact[]>([['chat', []], ['vscode', []], ['shared', []]]);
  for (const item of artifacts) {
    const kind = /\\agentSessionData\\/iu.test(item.path) ? 'vscode'
      : /(?:state\.vscdb(?:\.(?:backup|wal|shm))?|workspace\.json)$/iu.test(item.path) ? 'shared' : 'chat';
    groups.get(kind)!.push(item);
  }
  const label: Record<'chat' | 'vscode' | 'shared', string> = { chat: 'This chat', vscode: 'VS Code', shared: 'Shared' };
  return (['chat', 'vscode', 'shared'] as const).map((kind) => {
    const items = groups.get(kind)!;
    const lockFiles = items.filter((item) => /(?:lock|hold)$/iu.test(item.path)).length;
    const measured = items.filter((item) => typeof item.bytes === 'number');
    return { kind, label: label[kind], bytes: measured.length ? measured.reduce((sum, item) => sum + (item.bytes ?? 0), 0) : null,
      partial: items.some((item) => item.bytes === null || item.state !== 'present'), lockFiles, artifacts: items };
  });
}

export async function buildChatInfo (inventory: SessionInventory, selected: SessionOccurrence, rootArgument: string | null = null): Promise<ChatInfo> {
  const groups = groupOccurrences(inventory.occurrences);
  const selectedGroup = groups.find((group) => group.occurrences.some((row) => row.occurrenceId === selected.occurrenceId))
    ?? groupOccurrences([selected])[0]!;
  const preliminary = await collectListingEvidence(selectedGroup.occurrences);
  const children = relatedChildGroups(selectedGroup, groups, listingRelationships(groups, preliminary));
  const evidence = await collectListingEvidence([...selectedGroup.occurrences, ...children.flatMap((child) => child.occurrences)]);
  const selectedEvidence = evidence.get(selectedGroup.representative.occurrenceId) ?? evidence.get(selected.occurrenceId);
  const data: ListingEvidence = selectedEvidence ?? {
    state: 'unavailable', titles: [], dates: [], turns: [], models: [], bytes: null, byteScope: 'unknown', files: [], editTurns: null,
    errors: null, canceled: null, responsePresent: null, injectedPrompts: null,
    history: { state: 'not-applicable', turns: null, path: null }, context: [], fork: null, artifacts: [], artifactLocations: [],
    auditedBytes: null, artifactState: 'not-applicable', flags: [], diagnostics: [],
  };
  const titles = detailedTitles(selectedGroup, evidence);
  const title = redacted(detailedTitle(selectedGroup, titles));
  const metrics = detailedMetrics(selectedGroup, data);
  const counts = turnCountAndReplyCount(data);
  const edits = sumEditLines(data);
  const prompts = firstAndLastPrompt(data.turns);
  const usage = chatUsage(selected, data);
  const topTurns = data.turns.map((turn, index) => ({ number: index + 1, prompt: oneLine(turn.prompt, 90), credits: turn.credits ?? null }))
    .filter((turn) => turn.credits !== null).sort((left, right) => (right.credits ?? -1) - (left.credits ?? -1)).slice(0, 3);
  const turns: ChatInfoTurn[] = data.turns.map((turn, index) => ({
    number: index + 1, prompt: redacted(turn.prompt), responsePreview: turn.responsePreview ? redacted(turn.responsePreview) : null,
    timestamp: turn.timestamp, role: turn.role, model: turn.selectedModel ? listingModelLabel(turn.selectedModel)
      : turn.models[0] ? listingModelLabel(turn.models[0]) : null, effort: turn.effort,
    credits: typeof turn.credits === 'number' ? turn.credits : null,
    promptTokens: typeof turn.promptTokens === 'number' ? turn.promptTokens : null,
    completionTokens: typeof turn.completionTokens === 'number' ? turn.completionTokens : null,
    editCount: new Set(turn.files.map((file) => exactPath(file.file))).size,
    addedLines: changeSum(turn.files, 'added'), removedLines: changeSum(turn.files, 'removed'), canceled: turn.canceled, error: turn.error,
  }));
  const subagents: ChatInfoSubagent[] = children.map((child) => {
    const childData = evidence.get(child.representative.occurrenceId);
    const childTitle = detailedTitle(child, detailedTitles(child, evidence), title);
    const source = child.representative.backing.status === 'verified' ? child.representative.backing.source : null;
    const delegated = childData?.turns.find((turn) => turn.role === 'delegated') ?? childData?.turns[0];
    return { selector: child.representative.sessionId, title: redacted(childTitle), type: 'Sub-agent', status: statusFor(child.representative),
      promptCount: childData?.state === 'read' ? childData.turns.length : child.promptCount ?? 0, sourcePath: source ? redacted(source.path) : null,
      models: [...new Set((childData?.models ?? []).map(listingModelLabel))], credits: childData?.usage?.agent?.credits ?? null,
      firstPrompt: delegated ? oneLine(delegated.prompt, 140) : null, backingId: source?.sessionId ?? null };
  });
  const relations = listingRelationships(groups, evidence);
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const relationships = [...new Map(relations.filter((edge) => edge.from === selectedGroup.key || edge.to === selectedGroup.key)
    .map((edge): [string, ChatInfoRelationship] => {
      const outgoing = edge.from === selectedGroup.key;
      const other = byKey.get(outgoing ? edge.to ?? '' : edge.from);
      const direction = edge.kind === 'parent' ? outgoing ? 'parent' : 'child' : outgoing ? 'from' : 'to';
      const target = other ? detailedTitle(other, detailedTitles(other, evidence), title) : edge.targetLabel;
      return [`${edge.kind}|${direction}|${target}|${edge.evidence}`, { kind: edge.kind, direction, target: redacted(target), evidence: redacted(edge.evidence) }];
    })).values()];
  const artifacts = artifactRows(data);
  const groupedStorage = storageGroups(artifacts);
  const ownBytes = groupedStorage.filter((group) => group.kind !== 'shared' && group.bytes !== null).map((group) => group.bytes!);
  const source = selected.backing.status === 'verified' ? selected.backing.source : null;
  const warningSet = new Set<string>();
  if (source === null) warningSet.add(selected.backing.status === 'unsupported' ? 'Backing uses an unsupported provider.' : 'Backing is unresolved.');
  data.flags.forEach((flag) => warningSet.add(redacted(flag)));
  data.diagnostics.forEach((item) => warningSet.add(redacted(`${item.path}: ${item.description}`)));
  if (source?.kind === 'sdk-events') [...source.identityWarnings, ...source.scopeWarnings].forEach((item) => warningSet.add(redacted(item)));
  const dates: ChatInfoDate[] = [...new Map([
    ...(selected.createdTimestamp != null ? [[`listing.created`, { source: 'listing.created', timestamp: selected.createdTimestamp, recordedValue: String(selected.createdTimestamp) }] as const] : []),
    ...(selected.activityTimestamp != null ? [[`listing.updated`, { source: 'listing.updated', timestamp: selected.activityTimestamp, recordedValue: String(selected.activityTimestamp) }] as const] : []),
    ...data.dates.map((item) => [`${item.source}:${item.timestamp}`, item] as const),
  ].map((item) => [item[0], item[1]])).values()].map((item) => ({ source: item.source, timestamp: item.timestamp, recordedValue: item.recordedValue }));
  const root = rootArgument ?? inventory.userDataRoot;
  const mainSelector = sessionType(selected) === 'sub-agent' ? selected.sessionId : shortIds(groups).get(selectedGroup.key) ?? selected.sessionId;
  return {
    schemaVersion: 0, unstable: true, title, titleSources: titles.map((item) => ({ source: item.source, value: redacted(item.value) })),
    type: typeFor(selected), status: statusFor(selected), exportSupport: source ? 'yes' : 'no', selector: mainSelector, fullKey: selected.sessionId,
    backingId: source?.sessionId ?? selected.sessionId,
    sourceKind: source ? source.kind === 'local-journal' ? 'Local journal' : 'SDK events' : 'Unresolved backing',
    sourcePath: source ? redacted(source.path) : null,
    identityEvidence: source?.kind === 'sdk-events' ? [...source.identityEvidence, ...source.identityWarnings, ...source.scopeWarnings].map(redacted) : [],
    indexKeys: [...new Set(selectedGroup.occurrences.flatMap((row) => row.provenance.indexKey ? [row.provenance.indexKey] : []))].map(redacted),
    occurrenceIds: selectedGroup.occurrences.map((row) => row.occurrenceId),
    projects: detailedProjects(selectedGroup).map((project) => ({ name: redacted(project.label), uri: redacted(project.key), kind: project.kind })),
    cwd: redacted(data.context.find((item) => item.field === 'cwd' || item.field === 'workingDirectory')?.value ?? '') || null,
    branch: redacted(data.context.find((item) => item.field === 'branch')?.value ?? '') || null,
    created: metrics.created, updated: metrics.updated, promptCount: counts.promptCount, replyCount: counts.replyCount,
    canceledTurns: turns.filter((turn) => turn.canceled).length, errorTurns: turns.filter((turn) => turn.error).length,
    subagentCount: children.length, models: [...new Set(data.models.map(listingModelLabel))], modelChain: modelSequence(data.turns),
    usage, editCount: edits.editCount, addedLines: edits.added, removedLines: edits.removed, files: edits.files,
    firstPrompt: prompts.first, lastPrompt: prompts.last, topTurns, turns, subagents, relationships, artifacts,
    storageGroups: groupedStorage, scopedPayloadBytes: data.bytes,
    scopedPayloadLabel: source?.kind === 'sdk-events' ? "this chat's records in events.jsonl"
      : source?.kind === 'local-journal' ? "this chat's journal records" : 'recorded chat data',
    totalBytes: ownBytes.length ? ownBytes.reduce((sum, value) => sum + value, 0) : null,
    totalBytesPartial: groupedStorage.filter((group) => group.kind !== 'shared').some((group) => group.partial),
    dates, warnings: [...warningSet], diagnostics: data.diagnostics.map((item) => redacted(`${item.path}: ${item.description}`)),
    exportCommand: `node src/cli.ts ${parentKey(mainSelector)}${root ? ` --user-data-root "${redacted(root)}"` : ''}`,
  };
}
function bytesText (bytes: number | null): string {
  if (bytes === null) return '?';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
function creditText (value: number | null): string {
  if (value === null) return '?';
  if (value >= 100) return Math.round(value).toLocaleString('en-US');
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
function statusText (status: ChatInfo['status']): string {
  return status === 'verified' ? '✅ verified' : status === 'unsupported' ? '❌ unsupported' : '❓ unresolved';
}
function spanText (created: number | null, updated: number | null): string {
  if (created === null || updated === null || updated < created) return '?';
  const minutes = Math.round((updated - created) / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h${String(minutes % 60).padStart(2, '0')}m` : `${minutes % 60}m`;
}

export function stripChatInfoMarkdown (value: string): string {
  const lines = value.replace(/\r\n?/gu, '\n').split('\n');
  const output: string[] = [];
  let tableRows = 0;
  const flushTable = () => {
    if (tableRows) output.push(`[table: ${tableRows} ${tableRows === 1 ? 'row' : 'rows'}]`);
    tableRows = 0;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.includes('|') && /^\s*\|?.*\|.*\|?\s*$/u.test(line)) {
      if (!/^\s*\|?\s*:?-{3,}/u.test(line)) tableRows += 1;
      continue;
    }
    flushTable();
    let text = line.replace(/^#{1,6}\s+/u, '').replace(/^[-*+]\s+/u, '').replace(/^>\s?/u, '');
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1').replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1');
    text = text.replace(/\*\*([^*]+)\*\*|__([^_]+)__/gu, '$1$2').replace(/~~([^~]+)~~/gu, '$1').replace(/\*\*|__/gu, '');
    text = text.replace(/^```.*$/u, '').trim();
    if (text) output.push(text);
  }
  flushTable();
  return output.join(' ').replace(/\s{2,}/gu, ' ').trim();
}
function wordLimit (value: string, limit: number) {
  const words = value.trim().split(/\s+/u).filter(Boolean);
  return { text: words.slice(0, limit).join(' '), total: words.length, clipped: words.length > limit };
}
export function wrapChatInfoText (value: string, width: number, prefix = '', hangingPrefix = prefix): string[] {
  const words = value.trim().match(/\[table:\s+\d+\s+rows?\]|\S+/gu) ?? [];
  if (!words.length) return [`${prefix}?`];
  const lines: string[] = [];
  let line = prefix;
  for (const word of words) {
    const gap = line === '' || line.endsWith(' ') ? '' : ' ';
    if (Array.from(`${line}${gap}${word}`).length > width && line.length > 0) {
      lines.push(line.trimEnd()); line = `${hangingPrefix}${word}`;
    } else line += `${gap}${word}`;
  }
  lines.push(line.trimEnd());
  return lines;
}
export interface ChatInfoFormatOptions { terminalWidth?: number; now?: number; referenceYear?: number; color?: boolean; homeDir?: string }
interface Style { bold: (value: string) => string; dim: (value: string) => string; green: (value: string) => string }
function makeStyle (enabled: boolean): Style {
  const paint = (code: string, value: string) => enabled ? `\u001b[${code}m${value}\u001b[0m` : value;
  return { bold: (value) => paint('1', value), dim: (value) => paint('2', value), green: (value) => paint('32', value) };
}
function styledUnknowns (value: string, effects: Style): string {
  return value.replace(/(?<![\p{L}\p{N}_])\?(?!\?)/gu, effects.dim('?'));
}
function plural (count: number | null, one: string, many = `${one}s`): string { return count === null ? '?' : `${count} ${count === 1 ? one : many}`; }
function noWrap (label: string, value: string, labelWidth: number): string { return `${label.padEnd(labelWidth)} ${value}`; }
function aligned (label: string, value: string, width = 10, max = 110): string[] {
  const prefix = `${label.padEnd(width)} `;
  return wrapChatInfoText(value, max, prefix, ' '.repeat(prefix.length));
}
function section (title: string, width: number, effects: Style): string {
  const plain = `── ${title} `;
  return `${effects.bold(plain)}${'─'.repeat(Math.max(4, width - Array.from(plain).length))}`;
}
function displayPath (file: string, homeDir?: string): string {
  const home = homeDir?.replace(/[\\/]+$/u, '');
  return home && file.toLowerCase().startsWith(`${home.toLowerCase()}\\`) ? `~\\${file.slice(home.length + 1)}` : file;
}
function relativePath (base: string | null, file: string): string | null {
  if (!base) return null;
  const relative = path.relative(base, file);
  return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) ? relative.replaceAll('\\', '/') : null;
}
function commonFolder (files: readonly string[]): string {
  if (!files.length) return '';
  let folder = path.dirname(files[0]!);
  for (const file of files.slice(1)) {
    while (path.relative(folder, file).startsWith('..') || path.isAbsolute(path.relative(folder, file))) folder = path.dirname(folder);
    if (path.dirname(folder) === folder) break;
  }
  return folder;
}
function compactFolderPath (folder: string, homeDir?: string): string {
  const shown = displayPath(folder, homeDir).replace(/([A-Za-z0-9-]{9})([A-Za-z0-9_-]{12,})/gu, '$1…');
  return shown;
}
function sharedHeader (info: ChatInfo, options: ChatInfoFormatOptions, width: number, effects: Style): string[] {
  const now = options.now ?? Date.now();
  const referenceYear = options.referenceYear ?? new Date(now).getFullYear();
  const offset = offsetLabel(now);
  const date = (value: number | null) => dateCell(value, referenceYear, offset);
  const titleLine = `━━ ${info.title} `;
  const context = [info.projects.map((item) => item.name).join(', '), info.branch].filter((item) => item && item !== '?').join(' · ') || '?';
  const outcomes = [plural(info.promptCount, 'turn'), plural(info.replyCount, 'reply', 'replies'),
    info.canceledTurns ? `${plural(info.canceledTurns, 'canceled turn')} 🚫` : '',
    info.errorTurns ? `${plural(info.errorTurns, 'error')} ⚠️` : '', plural(info.subagentCount, 'sub-agent')].filter(Boolean).join(' · ');
  return [
    `${effects.bold(titleLine)}${'━'.repeat(Math.max(4, width - Array.from(titleLine).length))}`, `${effects.green(statusText(info.status))} · ${info.type}`,
    noWrap('Select', info.selector, 9), noWrap('Key', info.fullKey, 9),
    noWrap('Backing', `${info.backingId} (${info.sourceKind})`, 9), ...aligned('Project', context, 9, width),
    section(`Activity (local, ${offset})`, width, effects),
    ...aligned('Created', `${date(info.created)} · Updated ${date(info.updated)} · Span ${spanText(info.created, info.updated)}`, 9, width),
    ...aligned('Turns', outcomes, 9, width), ...aligned('Models', info.modelChain, 9, width),
  ];
}
function costLines (info: ChatInfo, width: number, effects: Style, color: boolean): string[] {
  const usage = info.usage;
  const lines = [section('Cost', width, effects)];
  if (usage.kind === 'none' || usage.credits === null) lines.push(...aligned('Credits', '? · usage not recorded', 9, width));
  else if (usage.kind === 'local-copilot-credits')
    lines.push(...aligned('Credits', `${creditText(usage.credits)} · different unit, unverified (${usage.creditsRecorded}/${usage.creditsTurns} turns)`, 9, width));
  else {
    const partial = usage.creditsRecorded < usage.creditsTurns ? '~' : '';
    lines.push(...aligned('Credits', `${partial}${creditText(usage.credits)} (~$${(usage.credits * 0.01).toFixed(2)}) · ${usage.creditsRecorded}/${usage.creditsTurns} ${usage.creditsTurns === 1 ? 'turn' : 'turns'} recorded`, 9, width));
  }
  const input = usage.promptTokens === null ? '?' : compactTokenCount(usage.promptTokens);
  const output = usage.completionTokens === null ? '?' : compactTokenCount(usage.completionTokens);
  const cache = usage.cacheShare == null ? '' : ` (${Math.round(usage.cacheShare * 100)}% cache read)`;
  lines.push(...aligned('Tokens', `in ${input}${cache} · out ${output}`, 9, width));
  const byModel = usage.byModel ?? [];
  if (byModel.length) {
    const maxCredits = Math.max(...byModel.map((item) => item.credits ?? 0), 1);
    const modelWidth = Math.max(...byModel.map((item) => item.model.length), 10);
    const callsWidth = Math.max(...byModel.map((item) => `${item.calls} calls`.length), 5);
    const creditsWidth = Math.max(...byModel.map((item) => creditText(item.credits).length), 7);
    byModel.forEach((item, index) => {
      const share = usage.credits && item.credits !== null ? Math.round(item.credits / usage.credits * 100) : null;
      const bar = color && item.credits !== null ? ` ${'█'.repeat(Math.max(1, Math.round(item.credits / maxCredits * 10)))}` : '';
      const calls = `${item.calls} calls`;
      const text = `${item.model.padEnd(modelWidth)}  ${calls.padStart(callsWidth)}  ${creditText(item.credits).padStart(creditsWidth)}${share === null ? '' : `  ${String(share).padStart(3)}%`}${bar}`;
      lines.push(noWrap(index ? '' : 'By model', text, 9));
    });
  }
  const creditWidth = Math.max(...info.topTurns.slice(0, 3).map((turn) => creditText(turn.credits).length), 1);
  info.topTurns.slice(0, 3).forEach((turn, index) => {
    const prefix = `${(index ? '' : 'Top').padEnd(9)} #${turn.number}  ${creditText(turn.credits).padStart(creditWidth)} · `;
    const prompt = stripChatInfoMarkdown(turn.prompt).replace(/\s+/gu, ' ');
    const room = Math.max(10, width - prefix.length);
    lines.push(prefix + (prompt.length > room ? `${prompt.slice(0, room - 1).trimEnd()}…` : prompt));
  });
  return lines;
}
function changeLines (info: ChatInfo, width: number, effects: Style): string[] {
  const changedTurns = info.turns.filter((turn) => turn.editCount).map((turn) => turn.number);
  return [section('Changes', width, effects),
    ...aligned('Edits', `${info.editCount === null ? '?' : plural(info.editCount, 'file')} · +${info.addedLines ?? '?'} / -${info.removedLines ?? '?'}${changedTurns.length === 1 ? ` · turn ${changedTurns[0]}` : ''}`, 9, width),
    ...aligned('First', stripChatInfoMarkdown(info.firstPrompt ?? '?'), 9, width),
    ...aligned('Last', stripChatInfoMarkdown(info.lastPrompt ?? '?'), 9, width)];
}
function storageSummaryLines (info: ChatInfo, options: ChatInfoFormatOptions, width: number, effects: Style): string[] {
  const lines = [section('Storage', width, effects)];
  const groups = (info.storageGroups ?? []).filter((item) => item.artifacts.length);
  const hasRecords = typeof info.scopedPayloadBytes === 'number';
  const labelWidth = Math.max(9, ...groups.map((group) => group.label.length), hasRecords ? 'Records'.length : 0);
  const sizes = groups.map((group) => `${group.partial ? '~' : ''}${bytesText(group.bytes)}`);
  if (hasRecords) sizes.push(bytesText(info.scopedPayloadBytes));
  const sizeWidth = Math.max(...sizes.map((size) => size.length), 1);
  for (const group of groups) {
    const folder = commonFolder(group.artifacts.map((item) => item.path));
    const locks = group.lockFiles ? ` (+${plural(group.lockFiles, 'lock file')})` : '';
    const share = group.kind === 'shared' ? ' · all chats here' : '';
    const size = `${group.partial ? '~' : ''}${bytesText(group.bytes)}`.padStart(sizeWidth);
    lines.push(noWrap(group.label, `${size}  ${effects.dim(compactFolderPath(folder, options.homeDir))}${locks}${share}`, labelWidth));
  }
  if (hasRecords)
    lines.push(noWrap('Records', `${bytesText(info.scopedPayloadBytes).padStart(sizeWidth)} · ${info.scopedPayloadLabel}`, labelWidth));
  return lines;
}

export function formatChatInfo (info: ChatInfo, options: ChatInfoFormatOptions = {}): string {
  const width = Math.max(60, options.terminalWidth ?? 110);
  const effects = makeStyle(options.color === true);
  const lines = [...sharedHeader(info, options, width, effects), ...costLines(info, width, effects, options.color === true),
    ...changeLines(info, width, effects), ...storageSummaryLines(info, options, width, effects)];
  if (info.warnings.length)
    lines.push(section('Warnings', width, effects), ...info.warnings.slice(0, 4).flatMap((warning) => aligned('⚠', warning, 3, width)));
  lines.push(noWrap('Export', effects.dim(info.exportCommand), 9));
  lines.push(...aligned('More', '--full for turns, files and sources · --json for scripts', 9, width));
  return lines.join('\n');
}
function turnLines (info: ChatInfo, width: number, effects: Style): string[] {
  const lines = [section('Turns', width, effects)];
  lines.push('  #  time        model                effort   credits       in      out  files  flags');
  for (const turn of info.turns) {
    const time = turn.timestamp === null ? '?' : dateCell(turn.timestamp, new Date(turn.timestamp).getFullYear(), offsetLabel(turn.timestamp));
    const flags = `${turn.canceled ? '🚫' : ''}${turn.error ? ' ⚠️' : ''}`.trim();
    lines.push(`${String(turn.number).padStart(2, '0').padStart(3, ' ')}  ${time.padEnd(11)} ${(turn.model ?? '?').padEnd(20)} ${(turn.effort ?? '?').padEnd(7)} ${creditText(turn.credits).padStart(7)} ${(turn.promptTokens === null ? '?' : compactTokenCount(turn.promptTokens)).padStart(8)} ${(turn.completionTokens === null ? '?' : compactTokenCount(turn.completionTokens)).padStart(8)} ${String(turn.editCount).padStart(5)}  ${flags}`);
    const prompt = wordLimit(stripChatInfoMarkdown(turn.prompt), 60);
    lines.push(...wrapChatInfoText(`${prompt.text}${prompt.clipped ? ` … (${prompt.total} words)` : ''}`, width, '   👤 ', '      '));
    const response = stripChatInfoMarkdown(turn.responsePreview ?? '') || '?';
    lines.push(...wrapChatInfoText(response, width, '   🤖 ', '      '));
  }
  if (!info.turns.length) lines.push('?  No turns recorded.');
  return lines;
}
function fullFileLines (info: ChatInfo, width: number, effects: Style): string[] {
  const lines = [section('Files changed', width, effects)];
  const files = info.files ?? [];
  if (!files.length) return [...lines, '?  No file changes recorded.'];
  const rows = files.map((file) => ({
    path: relativePath(info.cwd, file.path) ?? file.path,
    operation: file.operation,
    change: `+${file.added ?? '?'}/-${file.removed ?? '?'}`,
    turns: file.turns.join(','),
  }));
  const changeWidth = Math.max(...rows.map((row) => row.change.length), 5);
  const turnWidth = Math.max(...rows.map((row) => row.turns.length), 5);
  const allModified = rows.every((row) => row.operation === 'modified' || row.operation === 'edit');
  const operationWidth = allModified ? 0 : Math.max(...rows.map((row) => row.operation.length), 3);
  lines.push(`${'change'.padStart(changeWidth)}  ${'turns'.padStart(turnWidth)}${operationWidth ? `  ${'op'.padEnd(operationWidth)}` : ''}  path`);
  for (const row of rows)
    lines.push(`${row.change.padStart(changeWidth)}  ${row.turns.padStart(turnWidth)}${operationWidth ? `  ${row.operation.padEnd(operationWidth)}` : ''}  ${effects.dim(row.path)}`);
  return lines;
}
function subagentLines (info: ChatInfo, width: number, effects: Style): string[] {
  const lines = [section('Sub-agents', width, effects)];
  if (!info.subagents.length) return [...lines, 'none recorded'];
  for (const child of info.subagents) {
    const mark = child.status === 'verified' ? '✅' : child.status === 'unsupported' ? '❌' : '❓';
    const model = child.models.join(', ') || '?';
    const cost = child.credits === null ? '? credits' : `${creditText(child.credits)} credits`;
    lines.push(`${mark} ${child.title} · ${model} · ${cost} · ${plural(child.promptCount, 'prompt')}`);
    lines.push(`   ${effects.dim(child.selector)}`);
    lines.push(...wrapChatInfoText(child.firstPrompt ?? '?', width, '   ↳ ', '     '));
  }
  return lines;
}
function dateAndTitleLines (info: ChatInfo): string[] {
  const titleWidth = Math.max(...info.titleSources.map((item) => item.source.length), 5);
  const dateWidth = Math.max(...info.dates.filter((item) => !/^(?:prompt|request)\./u.test(item.source)).map((item) => item.source.length), 4);
  const identityWidth = Math.max('Key'.length, ...info.indexKeys.map(() => 'Index key'.length), ...info.occurrenceIds.map(() => 'Occurrence'.length), ...info.identityEvidence.map(() => 'Evidence'.length));
  const lines = ['Titles'];
  info.titleSources.forEach((item) => lines.push(noWrap(item.source, oneLine(item.value, 120), titleWidth)));
  lines.push('Dates');
  info.dates.filter((item) => !/^(?:prompt|request)\./u.test(item.source)).forEach((item) =>
    lines.push(noWrap(item.source, dateCell(item.timestamp, new Date(item.timestamp).getFullYear(), offsetLabel(item.timestamp)), dateWidth)));
  lines.push('Identity', noWrap('Key', info.fullKey, identityWidth));
  info.indexKeys.forEach((key) => lines.push(noWrap('Index key', key, identityWidth)));
  info.occurrenceIds.forEach((id) => lines.push(noWrap('Occurrence', id, identityWidth)));
  info.identityEvidence.forEach((item) => lines.push(noWrap('Evidence', item, identityWidth)));
  return lines;
}

function pathLines (info: ChatInfo, options: ChatInfoFormatOptions, effects: Style): string[] {
  const lines = ['Paths'];
  const groups = (info.storageGroups ?? []).filter((item) => item.artifacts.length);
  const labelWidth = Math.max(9, ...groups.map((group) => group.label.length));
  const sizeWidth = Math.max(...groups.map((group) => `${group.partial ? '~' : ''}${bytesText(group.bytes)}`.length), ...groups.flatMap((group) => group.artifacts.map((item) => bytesText(item.bytes).length)), 1);
  for (const group of groups) {
    const paths = group.artifacts.map((item) => item.path);
    const folder = commonFolder(paths);
    const locks = group.lockFiles ? ` · ${plural(group.lockFiles, 'lock file')}` : '';
    const size = `${group.partial ? '~' : ''}${bytesText(group.bytes)}`.padStart(sizeWidth);
    lines.push(noWrap(group.label, `${size} · ${effects.dim(displayPath(folder, options.homeDir))}${locks}`, labelWidth));
    for (const artifact of group.artifacts) {
      const name = path.relative(folder, artifact.path).replaceAll('\\', '/');
      lines.push(`   ${bytesText(artifact.bytes).padStart(sizeWidth)}  ${effects.dim(name || path.basename(artifact.path))}`);
    }
  }
  return lines;
}
function sourceLines (info: ChatInfo, options: ChatInfoFormatOptions, width: number, effects: Style): string[] {
  const lines = [section('Sources', width, effects), ...dateAndTitleLines(info), ...pathLines(info, options, effects)];
  if (info.relationships.length) {
    lines.push('Relationships');
    const width = Math.max(...info.relationships.map((item) => item.direction.length));
    for (const item of info.relationships) lines.push(noWrap(item.direction, item.target, width));
  }
  return lines;
}
export function formatChatInfoFull (info: ChatInfo, options: ChatInfoFormatOptions = {}): string {
  const width = Math.max(60, options.terminalWidth ?? 110);
  const effects = makeStyle(options.color === true);
  const text = [
    ...sharedHeader(info, options, width, effects), ...turnLines(info, width, effects),
    ...costLines(info, width, effects, options.color === true), ...fullFileLines(info, width, effects),
    ...subagentLines(info, width, effects), ...sourceLines(info, options, width, effects),
  ].join('\n');
  return options.color === true ? styledUnknowns(text, effects) : text;
}
export function formatChatInfoJson (info: ChatInfo): string { return JSON.stringify(info, null, 2); }
