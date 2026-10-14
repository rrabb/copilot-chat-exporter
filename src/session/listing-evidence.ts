import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { redactText } from '../redaction.ts';
import { parseChatSession, messageText } from './journal.ts';
import { readChatIndex } from './inventory.ts';
import { childScopes, eventsInScope, isRecord, readSdkEvents } from './sdk-events.ts';
import type { SdkEvent } from './sdk-events.ts';
import type { SessionOccurrence, SdkEventSource } from './sources.ts';
import type { ListingEvidence, ListingTurnEvidence, ListingArtifactLocation } from './listing-evidence-types.ts';
import { localListingChanges, listingToolChanges, incompleteLocalListingEdits, listingRecordedItems } from './listing-edits.ts';
import { collectListingStorage } from './listing-storage.ts';

function describe (error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function missing (error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
function text (value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
export function listingTimestamp (value: unknown): number | null {
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d{10,13}$/u.test(value) ? Number(value) : null;
  const timestamp = number === null ? typeof value === 'string' ? Date.parse(value) : NaN
    : number > 0 && number < 100_000_000_000 ? number * 1000 : number;
  return Number.isFinite(timestamp) && Number.isFinite(new Date(timestamp).getTime()) ? timestamp : null;
}
export function isAutoListingModel (model: string | null): boolean {
  return model !== null && /(?:^|\/)auto$/iu.test(model);
}
function uniqueModels (models: readonly string[]): string[] {
  return [...new Set(models.filter((model) => !isAutoListingModel(model)))];
}
function emptyEvidence (): ListingEvidence {
  return {
    state: 'unavailable', titles: [], dates: [], turns: [], models: [], files: [],
    bytes: null, byteScope: 'unknown', editTurns: null, errors: null, canceled: null,
    responsePresent: null, injectedPrompts: null, artifacts: [], artifactLocations: [], auditedBytes: null, artifactState: 'not-applicable',
    history: { state: 'not-applicable', turns: null, path: null }, context: [], fork: null,
    flags: [], diagnostics: [],
  };
}
function fields (evidence: ListingEvidence, record: unknown, source: string) {
  if (!isRecord(record))
    return;
  for (const [key, value] of Object.entries(record)) {
    if (/title/iu.test(key) && text(value))
      evidence.titles.push({ source: `${source}.${key}`, value: String(value) });
    if (/(?:Date|Timestamp)$/iu.test(key) || /^(?:createdAt|updatedAt|created_at|updated_at|timestamp|startTime|endTime)$/u.test(key)) {
      const timestamp = listingTimestamp(value);
      timestamp !== null && evidence.dates.push({ source: `${source}.${key}`, timestamp, recordedValue: String(value) });
    }
    key === 'timing' && fields(evidence, value, `${source}.timing`);
  }
}
export function localListingTurn (request: Record<string, unknown>, id: string, prompt: string): ListingTurnEvidence {
  const result = isRecord(request.result) ? request.result : {};
  const metadata = isRecord(result.metadata) ? result.metadata : {};
  const rounds = listingRecordedItems(metadata.toolCallRounds) ?? [];
  const selected = text(request.modelId);
  const roundModels = rounds.flatMap((round) => isRecord(round) && text(round.modelId) ? [String(round.modelId)] : []);
  const resolved = text(metadata.resolvedModel);
  const recordedRoundModels = uniqueModels(roundModels);
  const models = recordedRoundModels.length ? recordedRoundModels : uniqueModels(resolved ? [resolved] : []);
  return {
    id, prompt, role: 'human', timestamp: listingTimestamp(request.timestamp),
    selectedModel: selected, models, auto: isAutoListingModel(selected),
    effort: text(metadata.reasoningEffort) ?? text(request.reasoningEffort),
    credits: typeof request.copilotCredits === 'number' && Number.isFinite(request.copilotCredits) && request.copilotCredits >= 0
      ? request.copilotCredits : null,
    promptTokens: typeof request.promptTokens === 'number' && Number.isSafeInteger(request.promptTokens) && request.promptTokens >= 0
      ? request.promptTokens : null,
    completionTokens: typeof request.completionTokens === 'number' && Number.isSafeInteger(request.completionTokens) && request.completionTokens >= 0
      ? request.completionTokens : null,
    responsePresent: Array.isArray(request.response) ? request.response.length > 0 : null,
    canceled: request.isCanceled === true || (isRecord(request.modelState) && request.modelState.value === 2),
    error: isRecord(result.errorDetails) || isRecord(request.responseErrorDetails),
    files: localListingChanges(request),
  };
}
function summarize (evidence: ListingEvidence) {
  evidence.models = uniqueModels([...evidence.models, ...evidence.turns.flatMap((turn) => turn.models)]);
  evidence.files = evidence.turns.flatMap((turn) => turn.files);
  evidence.editTurns = evidence.turns.filter((turn) => turn.files.length > 0).length;
  evidence.flags.includes('incomplete-edit-evidence') && (evidence.editTurns = null);
}
async function history (evidence: ListingEvidence, journal: string, id: string, requests: Set<string>) {
  const file = path.join(path.dirname(path.dirname(journal)), 'chatEditingSessions', id, 'state.json');
  evidence.history.path = file;
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    evidence.history.state = missing(error) ? 'missing' : 'unreadable';
    if (!missing(error))
      evidence.diagnostics.push({ path: file, description: `Editing history: ${describe(error)}` });
    return;
  }
  const operations = isRecord(raw) && isRecord(raw.timeline) ? listingRecordedItems(raw.timeline.operations) : null;
  if (!operations) {
    evidence.history.state = 'unreadable';
    evidence.diagnostics.push({ path: file, description: 'Editing history has no supported timeline.operations array; count is unknown.' });
    return;
  }
  const ids = new Set<string>();
  for (const item of operations) {
    if (isRecord(item) && typeof item.requestId === 'string' && requests.has(item.requestId))
      ids.add(item.requestId);
  }
  evidence.history = { state: ids.size ? 'recorded' : 'empty', turns: ids.size, path: file };
}
async function artifacts (evidence: ListingEvidence, workspace: string, id: string, journal: string) {
  const copilot = path.join(workspace, 'GitHub.copilot-chat');
  const locations: { kind: string; path: string; form: 'file' | 'directory' }[] = [
    { kind: 'journal', path: journal, form: 'file' },
    { kind: 'chatEditingSessions', path: path.join(workspace, 'chatEditingSessions', id), form: 'directory' },
    { kind: 'transcript', path: path.join(copilot, 'transcripts', `${id}.jsonl`), form: 'file' },
    { kind: 'debug-logs', path: path.join(copilot, 'debug-logs', id), form: 'directory' },
    { kind: 'chat-session-resources', path: path.join(copilot, 'chat-session-resources', id), form: 'directory' },
  ];
  for (const location of locations) {
    const inventory: ListingArtifactLocation = { ...location, state: 'missing', bytes: null, files: null };
    evidence.artifactLocations.push(inventory);
    let bytes = 0;
    let files = 0;
    let present = false;
    const walk = async (folder: string): Promise<void> => {
      for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.join(folder, entry.name);
        if (entry.isSymbolicLink())
          throw new Error(`Artifact link not followed: ${file}. Directory size is unknown.`);
        if (entry.isDirectory())
          await walk(file);
        else if (entry.isFile()) {
          const size = (await fs.stat(file)).size;
          bytes += size;
          files += 1;
          location.kind === 'chat-session-resources' && evidence.artifacts.push({ path: file, bytes: size });
        }
      }
    };
    try {
      const stat = await fs.lstat(location.path);
      present = true;
      if (stat.isSymbolicLink() || (location.form === 'file' ? !stat.isFile() : !stat.isDirectory()))
        throw new Error('Artifact location has an unsupported file kind or link.');
      if (location.form === 'directory')
        await walk(location.path);
      else {
        bytes = stat.size;
        files = 1;
      }
      inventory.state = 'present';
      inventory.bytes = bytes;
      inventory.files = files;
    } catch (error) {
      if (!missing(error) || present) {
        inventory.state = 'unreadable';
        evidence.diagnostics.push({ path: location.path, description: `Artifact inventory incomplete: ${describe(error)}` });
      }
    }
  }
  evidence.artifactState = evidence.artifactLocations.some((item) => item.state === 'unreadable') ? 'unreadable' : 'read';
  evidence.auditedBytes = evidence.artifactState === 'read'
    ? evidence.artifactLocations.reduce((sum, item) => sum + (item.bytes ?? 0), 0) : null;
}

export function sdkListingTurns (all: readonly SdkEvent[], source: SdkEventSource): ListingTurnEvidence[] {
  const scoped = eventsInScope(all, source.scope);
  const prompts = scoped.filter((event) => event.type === 'user.message'
    && typeof event.data.content === 'string' && event.data.content.trim()
    && (source.scope.kind === 'subagent' || event.data.source === undefined || event.data.source === ''
      || (typeof event.data.source === 'string' && event.data.source.toLowerCase() === 'user')));
  const result: ListingTurnEvidence[] = [];
  const seenCalls = new Set<string>();
  const filesFor = (records: readonly SdkEvent[]) => records.flatMap((event) => {
    if (event.type !== 'tool.execution_start' || typeof event.data.toolName !== 'string' || typeof event.data.toolCallId !== 'string')
      return [];
    const toolCallId = event.data.toolCallId;
    if (seenCalls.has(toolCallId))
      return [];
    seenCalls.add(toolCallId);
    if (scoped.some((other) => other.type === 'tool.execution_complete'
      && other.data.toolCallId === toolCallId && other.data.success === false))
      return [];
    return listingToolChanges(event.data.toolName, event.data.arguments, `events.line:${event.line}`);
  });
  let selected: string | null = null;
  let effort: string | null = null;
  const settings = new Map<SdkEvent, { selected: string | null; effort: string | null }>();
  for (const event of all) {
    if (event.agentId === undefined && !event.data.parentToolCallId) {
      if (event.type === 'session.start' || event.type === 'session.resume' || event.type === 'session.model_change') {
        selected = text(event.data.newModel) ?? text(event.data.selectedModel) ?? selected;
        effort = text(event.data.reasoningEffort) ?? effort;
      }
    }
    settings.set(event, { selected, effort });
  }
  for (let index = 0; index < prompts.length; index += 1) {
    const prompt = prompts[index];
    const records = scoped.slice(scoped.indexOf(prompt) + 1, index + 1 < prompts.length ? scoped.indexOf(prompts[index + 1]) : scoped.length);
    const state = settings.get(prompt);
    const models = uniqueModels(records.flatMap((event) =>
      event.type === 'assistant.message' && text(event.data.model) ? [String(event.data.model)] : []));
    const files = filesFor(records);
    const assistant = records.filter((event) => event.type === 'assistant.message');
    result.push({
      id: prompt.id ?? `line:${prompt.line}`, prompt: String(prompt.data.content),
      role: source.scope.kind === 'subagent'
        ? typeof prompt.data.source === 'string' && prompt.data.source !== '' && prompt.data.source.toLowerCase() !== 'user'
          ? index === 0 ? 'delegated' : 'follow-up' : 'follow-up'
        : 'human',
      timestamp: listingTimestamp(prompt.timestamp), models, selectedModel: state?.selected ?? null,
      auto: isAutoListingModel(state?.selected ?? null), effort: state?.effort ?? null, files,
      responsePresent: assistant.some((event) => text(event.data.content) || text(event.data.reasoningText)) ? true
        : assistant.some((event) => typeof event.data.content !== 'string') ? null : false,
      error: records.some((event) => event.type === 'session.error'),
      canceled: records.some((event) => event.type === 'abort' || event.type === 'session.abort'),
    });
  }
  if (source.scope.kind === 'subagent' && !result.some((turn) => turn.role === 'delegated')) {
    const parentToolCallId = source.scope.parentToolCallId;
    const calls = all.filter((event) => event.type === 'tool.execution_start' && event.data.toolCallId === parentToolCallId);
    const args = calls.length === 1 && isRecord(calls[0].data.arguments) ? calls[0].data.arguments : {};
    const task = text(args.prompt) ?? text(args.task);
    if (task && result[0]?.prompt.trim() === task.trim())
      result[0].role = 'delegated';
    else if (task) {
      const firstPrompt = prompts[0];
      const initial = scoped.slice(0, firstPrompt ? scoped.indexOf(firstPrompt) : scoped.length);
      result.unshift({
        id: parentToolCallId, prompt: task, role: 'delegated', timestamp: listingTimestamp(calls[0].timestamp),
        selectedModel: settings.get(calls[0])?.selected ?? null,
        models: uniqueModels(initial.flatMap((event) => event.type === 'assistant.message' && text(event.data.model) ? [String(event.data.model)] : [])),
        auto: isAutoListingModel(settings.get(calls[0])?.selected ?? null),
        effort: settings.get(calls[0])?.effort ?? null,
        responsePresent: initial.some((event) => event.type === 'assistant.message' && text(event.data.content)),
        files: filesFor(initial), canceled: initial.some((event) => event.type === 'abort' || event.type === 'session.abort'),
        error: initial.some((event) => event.type === 'session.error'),
      });
    }
  }
  return result;
}

async function sdkMetadata (evidence: ListingEvidence, source: SdkEventSource) {
  const folder = path.dirname(source.path);
  const metadataFile = path.join(folder, 'vscode.metadata.json');
  try {
    const value: unknown = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
    if (!isRecord(value))
      throw new Error('Expected metadata object.');
    fields(evidence, value, 'sdk.vscode.metadata');
    if (source.scope.kind === 'main' && value.kind === 'forked' && typeof value.parentSessionId === 'string'
      && /^[a-zA-Z0-9_-]+$/u.test(value.parentSessionId))
      evidence.fork = { parentSessionId: value.parentSessionId, source: `${metadataFile}: kind=forked; parentSessionId` };
  } catch (error) {
    !missing(error) && evidence.diagnostics.push({ path: metadataFile, description: describe(error) });
  }
  const workspace = path.join(folder, 'workspace.yaml');
  try {
    const raw = await fs.readFile(workspace, 'utf8');
    const scalars = new Map<string, string>();
    for (const line of raw.split(/\r?\n/u)) {
      const match = /^([a-z_]+):\s*(.*?)\s*$/u.exec(line);
      if (!match)
        continue;
      if (scalars.has(match[1]))
        throw new Error(`Duplicate workspace.yaml field: ${match[1]}.`);
      let value = match[2];
      if (value.startsWith('"'))
        value = JSON.parse(value);
      else if (value.startsWith("'") && value.endsWith("'"))
        value = value.slice(1, -1).replaceAll("''", "'");
      else {
        if (/^[|>\[\]{}&*!]/u.test(value))
          throw new Error(`Unsupported workspace YAML scalar for ${match[1]}.`);
        value = value.replace(/\s+#.*$/u, '');
      }
      if (typeof value !== 'string')
        throw new Error('Unsupported workspace scalar.');
      scalars.set(match[1], value);
    }
    if (scalars.has('id') && scalars.get('id') !== source.sessionId)
      throw new Error('Workspace YAML identity changed or differs from verified backing.');
    const name = scalars.get('name');
    name && evidence.titles.push({ source: 'sdk.workspace.name', value: name });
    for (const field of ['created_at', 'updated_at']) {
      const value = scalars.get(field);
      const timestamp = listingTimestamp(value);
      value && timestamp !== null && evidence.dates.push({ source: `sdk.workspace.${field}`, timestamp, recordedValue: value });
    }
    for (const field of ['cwd', 'git_root', 'branch']) {
      const value = scalars.get(field);
      value && evidence.context.push({ field, value, source: workspace });
    }
  } catch (error) {
    !missing(error) && evidence.diagnostics.push({ path: workspace, description: describe(error) });
  }
}

/** Optional enrichment never changes backing verification, grouping, selection or visibility. */
export async function collectListingEvidence (occurrences: readonly SessionOccurrence[]): Promise<Map<string, ListingEvidence>> {
  const result = new Map<string, ListingEvidence>();
  const indexes = new Map<string, ReturnType<typeof readChatIndex>>();
  const logs = new Map<string, { log: Awaited<ReturnType<typeof readSdkEvents>>; size: number; mtime: number }>();
  for (const occurrence of occurrences) {
    const evidence = emptyEvidence();
    result.set(occurrence.occurrenceId, evidence);
    evidence.titles.push({ source: `listing.${occurrence.titleSource}`, value: occurrence.title });
    occurrence.visibility.status === 'hidden' && evidence.flags.push(`ignored:${occurrence.visibility.reason}`);
    const provenance = occurrence.provenance;
    if (provenance.indexKey) {
      let index = indexes.get(provenance.workspaceStoragePath);
      if (!index) {
        index = readChatIndex(provenance.workspaceStoragePath);
        indexes.set(provenance.workspaceStoragePath, index);
      }
      fields(evidence, index.entries.get(provenance.indexKey), 'index');
      evidence.diagnostics.push(...index.diagnostics.map((item) => ({ path: item.path, description: item.description })));
    }
    if (occurrence.backing.status !== 'verified') {
      evidence.flags.push('backing-unavailable');
      provenance.indexKey && evidence.flags.push('index-only');
      evidence.titles = evidence.titles.map((title) => ({ ...title, value: redactText(title.value).text }));
      continue;
    }
    const source = occurrence.backing.source;
    try {
      const before = await fs.stat(source.path);
      if (source.kind === 'local-journal') {
        !provenance.indexKey && evidence.flags.push('journal-only');
        const bytes = await fs.readFile(source.path);
        if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) {
          evidence.state = 'changed';
          throw new Error('Backing changed since inventory; rich conversation evidence omitted. Refresh the report.');
        }
        const session = parseChatSession(source.path, new TextDecoder('utf-8', { fatal: true }).decode(bytes),
          (state) => {
            fields(evidence, state, 'journal');
            if (isRecord(state) && (state.hasPendingEdits === true || (Array.isArray(state.pendingRequests) && state.pendingRequests.length > 0)))
              evidence.flags.push('pending-work');
            if (isRecord(state) && text(state.workingDirectory))
              evidence.context.push({ field: 'workingDirectory', value: String(state.workingDirectory), source: 'journal' });
          });
        if (session.errors.length)
          throw new Error(session.errors.join(' '));
        let synthetic = 0;
        const requests = new Map<string, Record<string, unknown>[]>();
        for (const request of session.rawRequests) {
          const id = typeof request.requestId === 'string' && request.requestId ? request.requestId : `synthetic_request_${++synthetic}`;
          if (!messageText(request.message).trim())
            continue;
          const bucket = requests.get(id) ?? [];
          bucket.push(request);
          requests.set(id, bucket);
        }
        evidence.turns = session.turns.map((turn) => {
          const request = requests.get(turn.requestId)?.shift();
          if (!request)
            throw new Error(`Replayed request identity missing for turn ${turn.number}; rich evidence omitted.`);
          return localListingTurn(request, turn.requestId, turn.prompt);
        });
        session.rawRequests.forEach((request, index) => fields(evidence, request, `request.${index + 1}`));
        session.rawRequests.some(incompleteLocalListingEdits) && evidence.flags.push('incomplete-edit-evidence');
        evidence.titles.push({ source: 'derived.firstPrompt', value: session.defaultTitle });
        evidence.bytes = bytes.length;
        evidence.byteScope = 'Complete Local journal file, including separators; resources shown separately.';
        evidence.errors = session.rawRequests.filter((request) =>
          isRecord(request.responseErrorDetails) || (isRecord(request.result) && isRecord(request.result.errorDetails))).length;
        evidence.canceled = session.rawRequests.filter((request) =>
          request.isCanceled === true || (isRecord(request.modelState) && request.modelState.value === 2)).length;
        evidence.flags.push(...session.census.unhandled.map(([kind, count]) => `unhandled:${kind}=${count}`),
          ...session.census.unrecognizedToolData.map(([kind, count]) => `unrecognized-tool:${kind}=${count}`));
        await history(evidence, source.path, source.sessionId, new Set(requests.keys()));
        await artifacts(evidence, provenance.workspaceStoragePath, source.sessionId, source.path);
      } else {
        let cached = logs.get(source.path);
        if (!cached) {
          const log = await readSdkEvents(source.path, source.sessionId);
          const stat = await fs.stat(source.path);
          cached = { log, size: stat.size, mtime: stat.mtimeMs };
          logs.set(source.path, cached);
        }
        if (cached.size !== before.size || cached.mtime !== before.mtimeMs) {
          evidence.state = 'changed';
          throw new Error('SDK backing changed since enrichment cache read; refresh the report.');
        }
        const log = cached.log;
        if (log.sha256 !== source.sha256) {
          evidence.state = 'changed';
          throw new Error('SDK backing changed since inventory; scoped conversation evidence omitted. Refresh the report.');
        }
        if (source.scope.kind === 'subagent') {
          const scope = source.scope;
          if (!childScopes(log.events).scopes.some((item) => item.agentId === scope.agentId && item.parentToolCallId === scope.parentToolCallId))
            throw new Error('Recorded child scope no longer matches verified identity.');
          const calls = log.events.filter((event) => event.type === 'tool.execution_start' && event.data.toolCallId === scope.parentToolCallId);
          if (calls.length === 1 && isRecord(calls[0].data.arguments)) {
            for (const key of ['description', 'name']) {
              const value = text(calls[0].data.arguments[key]);
              value && evidence.titles.push({ source: `delegation.arguments.${key}`, value });
            }
          }
          const starts = log.events.filter((event) => event.type === 'subagent.started'
            && event.agentId === scope.agentId && event.data.toolCallId === scope.parentToolCallId);
          for (const event of starts) {
            const value = text(event.data.agentDisplayName);
            value && evidence.titles.push({ source: 'subagent.started.agentDisplayName', value });
          }
        }
        const scoped = eventsInScope(log.events, source.scope);
        const assistant = scoped.filter((event) => event.type === 'assistant.message');
        evidence.models = uniqueModels(assistant.flatMap((event) => text(event.data.model) ? [String(event.data.model)] : []));
        evidence.responsePresent = assistant.some((event) => text(event.data.content) || text(event.data.reasoningText)) ? true
          : assistant.some((event) => typeof event.data.content !== 'string'
            || (Array.isArray(event.data.toolRequests) && event.data.toolRequests.length > 0)) ? null : false;
        scoped.some((event) => event.type === 'tool.execution_start' && typeof event.data.toolName === 'string'
          && /(?:apply_?patch|create_?file|replace_?string|multi_?replace_?string)/iu.test(event.data.toolName)
          && listingToolChanges(event.data.toolName, event.data.arguments, `line:${event.line}`).length === 0)
          && evidence.flags.push('incomplete-edit-evidence');
        evidence.turns = sdkListingTurns(log.events, source);
        source.scope.kind === 'subagent' && !evidence.turns.some((turn) => turn.role === 'delegated')
          && evidence.flags.push('delegated-task-unavailable');
        evidence.bytes = scoped.reduce((sum, event) => sum + Buffer.byteLength(event.recordedLine, 'utf8'), 0);
        evidence.byteScope = 'Exact scoped SDK record text, UTF-8 bytes excluding separators; not whole-file disk usage.';
        evidence.errors = scoped.filter((event) => event.type === 'session.error').length;
        evidence.canceled = scoped.filter((event) => event.type === 'abort' || event.type === 'session.abort').length;
        evidence.injectedPrompts = scoped.filter((event) => event.type === 'user.message' && typeof event.data.source === 'string'
          && event.data.source !== '' && event.data.source.toLowerCase() !== 'user').length;
        const malformed = scoped.some((event) => event.type === 'user.message' && (typeof event.data.content !== 'string'
          || (event.data.source !== undefined && typeof event.data.source !== 'string')));
        malformed && evidence.flags.push('incomplete-prompt-evidence');
        evidence.flags.push(...source.identityWarnings.map(() => 'identity-fallback'), ...source.scopeWarnings.map(() => 'scope-warning'));
        source.scope.kind === 'main' && await sdkMetadata(evidence, source);
        for (const event of new Set([scoped.find((item) => listingTimestamp(item.timestamp) !== null),
          scoped.findLast((item) => listingTimestamp(item.timestamp) !== null)])) {
          if (event)
            fields(evidence, { timestamp: event.timestamp }, `events.line:${event.line}`);
        }
      }
      const after = await fs.stat(source.path);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
        evidence.state = 'changed';
        throw new Error('Source changed during enrichment; rich evidence omitted.');
      }
      for (const [field, value] of [['birthtime', before.birthtimeMs], ['mtime', before.mtimeMs], ['ctime', before.ctimeMs]] as const)
        evidence.dates.push({ source: `filesystem.${field}`, timestamp: value, recordedValue: new Date(value).toISOString() });
      evidence.turns.forEach((turn, index) => {
        turn.timestamp !== null && evidence.dates.push({ source: `prompt.${index + 1}.timestamp`, timestamp: turn.timestamp, recordedValue: String(turn.timestamp) });
      });
      evidence.state = 'read';
      if (source.kind === 'local-journal')
        evidence.responsePresent = evidence.turns.some((turn) => turn.responsePresent === true) ? true
          : evidence.turns.some((turn) => turn.responsePresent === null) ? null : false;
      summarize(evidence);
    } catch (error) {
      evidence.diagnostics.push({ path: source.path, description: describe(error) });
      evidence.turns = [];
      evidence.models = [];
      evidence.files = [];
      evidence.bytes = null;
      evidence.editTurns = null;
      evidence.errors = null;
      evidence.canceled = null;
      evidence.responsePresent = null;
      evidence.history = { state: 'unreadable', turns: null, path: null };
      evidence.artifacts = [];
      evidence.artifactLocations = [];
      evidence.auditedBytes = null;
      evidence.artifactState = 'unreadable';
      evidence.context = [];
      evidence.fork = null;
      evidence.dates = evidence.dates.filter((date) => date.source.startsWith('index.'));
      evidence.titles = evidence.titles.filter((title) => title.source.startsWith('index.') || title.source.startsWith('listing.'));
      evidence.flags.push(evidence.state === 'changed' ? 'source-changed' : 'enrichment-unavailable');
    }
    for (const turn of evidence.turns) {
      const redacted = redactText(turn.prompt);
      turn.prompt = redacted.text;
      redacted.counts.size && evidence.flags.push('redacted-text');
    }
    evidence.titles = evidence.titles.map((title) => ({ ...title, value: redactText(title.value).text }));
    evidence.flags = [...new Set(evidence.flags)];
  }
  for (const occurrence of occurrences) {
    const data = result.get(occurrence.occurrenceId);
    const parent = occurrence.parentOccurrenceId ? result.get(occurrence.parentOccurrenceId) : undefined;
    if (data && parent) {
      for (const item of parent.context.filter((item) => item.field === 'cwd' || item.field === 'workingDirectory')) {
        if (!data.context.some((existing) => existing.field === item.field))
          data.context.push({ ...item, source: `parent.${item.source}` });
      }
    }
  }
  await collectListingStorage(occurrences, result);
  return result;
}
