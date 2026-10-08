import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chatDataKey, defaultChat, parseAgentHostIdentity, validStorageId } from './provider-identity.ts';
import type { AgentHostIdentity } from './provider-identity.ts';
import { childScopes, eventsInScope, isRecord, readSdkEvents } from './sdk-events.ts';
import type { SdkEventLog, ChildScopeProblem } from './sdk-events.ts';
import type { SdkEventSource, SessionOccurrence, SourceProvenance, InventoryDiagnostic, VerifiedChildScope } from './sources.ts';
import { occurrenceId } from './occurrence.ts';

class ProviderScopeError extends Error {
  readonly category: InventoryDiagnostic['category'];

  constructor (message: string, category: InventoryDiagnostic['category'] = 'source-unavailable') {
    super(message);
    this.category = category;
  }
}

function missing (error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function metadata (file: string, key: string) {
  try {
    await fs.stat(file);
  } catch (error) {
    if (missing(error))
      return { exists: false, value: undefined };
    throw error;
  }
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = database.prepare('SELECT value FROM session_metadata WHERE key = ?').all(key);
    if (rows.length > 1)
      throw new Error('Duplicate persisted provider metadata.');
    const value = rows[0]?.value;
    if (value !== undefined && typeof value !== 'string')
      throw new Error('Unsupported provider metadata value.');
    return { exists: true, value };
  } finally {
    database.close();
  }
}

interface CatalogEntry { chat: string; value: string | null }

async function catalog (root: string, session: string): Promise<CatalogEntry[]> {
  const file = path.join(root, 'User', 'globalStorage', 'agent-host.db');
  try {
    await fs.stat(file);
  } catch (error) {
    if (missing(error))
      return [];
    throw error;
  }
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_chats'").all();
    if (!tables.length)
      return [];
    return database.prepare('SELECT chat_uri, provider_data FROM session_chats WHERE session_uri = ?').all(session).map((row) => {
      if (typeof row.chat_uri !== 'string' || (row.provider_data !== null && typeof row.provider_data !== 'string'))
        throw new Error('Unsupported central chat catalog entry.');
      return { chat: row.chat_uri, value: row.provider_data };
    });
  } finally {
    database.close();
  }
}

function backingId (value: string) {
  let backing: unknown;
  try {
    backing = JSON.parse(value);
  } catch {
    throw new Error('Persisted provider backing is not JSON.');
  }
  if (!isRecord(backing) || typeof backing.sdkSessionId !== 'string' || !validStorageId(backing.sdkSessionId))
    throw new Error('Unsupported persisted SDK backing identity.');
  return backing.sdkSessionId;
}

interface Backing { id: string; evidence: string[]; warnings: string[] }

async function resolveBacking (root: string, identity: AgentHostIdentity, entries: CatalogEntry[]): Promise<Backing> {
  const exact = entries.filter((entry) => entry.chat === identity.chat);
  if (exact.length > 1)
    throw new Error('Duplicate exact chat catalog entries.');
  if (exact.length) {
    if (!exact[0].value)
      throw new Error('Exact central chat entry has no persisted provider backing.');
    return {
      id: backingId(exact[0].value), warnings: [],
      evidence: [`${path.join(root, 'User', 'globalStorage', 'agent-host.db')}:session_chats.provider_data:${identity.chat}`],
    };
  }
  const chatFile = path.join(root, 'agentSessionData', chatDataKey(identity.chat), 'session.db');
  const chat = await metadata(chatFile, 'agentHost.chatProviderData');
  if (chat.value) {
    return { id: backingId(chat.value), warnings: [], evidence: [`${chatFile}:session_metadata.agentHost.chatProviderData`] };
  }
  if (identity.chat !== defaultChat(identity.session))
    throw new Error('No persisted backing for this exact peer chat; no identity guess.');
  const file = path.join(root, 'agentSessionData', identity.id, 'session.db');
  const main = await metadata(file, 'defaultChatProviderData');
  if (main.value)
    return { id: backingId(main.value), warnings: [], evidence: [`${file}:session_metadata.defaultChatProviderData`] };
  if (!main.exists)
    throw new Error('No persisted default backing or local session database; fallback refused.');
  return {
    id: identity.id, evidence: [`${file}:existing session database; SDK header-validated provider-ID fallback`],
    warnings: ['Default Agent Host chat has no persisted SDK mapping. Provider session ID fallback was used only after verifying the existing local session database and matching SDK session.start header.'],
  };
}

export interface ProviderResolverOptions { copilotHome?: string }
export interface ResolvedProviderSource {
  source: SdkEventSource;
  children: SdkEventSource[];
  activityTimestamp: number | null;
  createdTimestamp: number | null;
  promptCount: number | null;
  confirmedEmpty: boolean;
  childParents: Map<string, string | null>;
  childActivity: Map<string, number | null>;
  childCreated: Map<string, number | null>;
  childPromptCounts: Map<string, number | null>;
  childProblems: ChildScopeProblem[];
}

/** Cache only scope/integrity metadata, not private conversation bodies across backing reads. */
export function createProviderSourceResolver (options: ProviderResolverOptions = {}) {
  const homeArgument = options.copilotHome ?? (process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot'));
  if (!homeArgument.trim())
    throw new Error('copilotHome requires a nonempty directory path.');
  const home = path.resolve(homeArgument);
  const logs = new Map<string, Promise<{
    sha256: string; producer: string | null; scopes: VerifiedChildScope[];
    activity: Map<string, number | null>;
    created: Map<string, number | null>;
    promptCounts: Map<string, number | null>;
    confirmedEmpty: Map<string, boolean>;
    childParents: Map<string, string | null>;
    childProblems: ChildScopeProblem[];
    size: number;
    mtimeMs: number;
  }>>();
  async function log (id: string) {
    let result = logs.get(id);
    if (!result) {
      result = (async () => {
        const file = path.join(home, 'session-state', id, 'events.jsonl');
        const fingerprint = await fs.stat(file);
        const read: SdkEventLog = await readSdkEvents(file, id);
        const after = await fs.stat(file);
        if (fingerprint.size !== after.size || fingerprint.mtimeMs !== after.mtimeMs)
          throw new Error('SDK backing changed during scope verification; retry.');
        const { scopes, problems } = childScopes(read.events);
        const activity = new Map<string, number | null>();
        const created = new Map<string, number | null>();
        const promptCounts = new Map<string, number | null>();
        const confirmedEmpty = new Map<string, boolean>();
        const mainStart = read.events[0];
        const mainCreated = mainStart?.timestamp === undefined ? null : Date.parse(mainStart.timestamp);
        created.set('', Number.isFinite(mainCreated) ? mainCreated : null);
        for (const scope of [{ kind: 'main' } as const, ...scopes]) {
          const scopeId = scope.kind === 'main' ? '' : scope.agentId;
          const scoped = eventsInScope(read.events, scope);
          let latest: number | null = null;
          for (const event of scoped) {
            const time = event.timestamp === undefined ? NaN : Date.parse(event.timestamp);
            if (Number.isFinite(time) && (latest === null || time > latest))
              latest = time;
          }
          activity.set(scopeId, latest);
          const userMessages = scoped.filter((event) => event.type === 'user.message');
          const userPromptEvents = userMessages.filter((event) => event.data.source === undefined || event.data.source === ''
            || (typeof event.data.source === 'string' && event.data.source.toLowerCase() === 'user'));
          const hasUnknownSource = userMessages.some((event) =>
            event.data.source !== undefined && typeof event.data.source !== 'string');
          const hasUnknownContent = userPromptEvents.some((event) => typeof event.data.content !== 'string');
          const recordedPrompts = userPromptEvents.filter((event) => typeof event.data.content === 'string'
            && event.data.content.trim().length > 0).length;
          promptCounts.set(scopeId, hasUnknownSource || hasUnknownContent ? null
            : recordedPrompts + (scope.kind === 'subagent' ? 1 : 0));
          if (scope.kind === 'subagent') {
            const starts = read.events.filter((event) => event.type === 'subagent.started'
              && event.agentId === scope.agentId);
            const startTime = starts[0]?.timestamp === undefined ? NaN : Date.parse(starts[0].timestamp);
            created.set(scopeId, Number.isFinite(startTime) ? startTime : null);
          }
          const setupEvents = new Set([
            'session.start', 'session.model_change', 'session.permissions_changed',
            'session.auto_mode_resolved',
          ]);
          confirmedEmpty.set(scopeId, scope.kind === 'main' && promptCounts.get(scopeId) === 0
            && scoped.every((event) => setupEvents.has(event.type)));
        }
        const childParents = new Map<string, string | null>();
        for (const scope of scopes) {
          const calls = read.events.filter((event) => event.type === 'tool.execution_start'
            && event.data.toolCallId === scope.parentToolCallId);
          if (calls.length === 1) {
            const call = calls[0];
            if (call.agentId === undefined && !call.data.parentToolCallId)
              childParents.set(scope.agentId, null);
            else if (call.agentId !== undefined && scopes.some((candidate) => candidate.agentId === call.agentId))
              childParents.set(scope.agentId, call.agentId);
          }
        }
        return {
          sha256: read.sha256, producer: read.producer, scopes, activity, created, promptCounts,
          confirmedEmpty, childParents, childProblems: problems,
          size: after.size, mtimeMs: after.mtimeMs,
        };
      })();
      logs.set(id, result);
    }
    const summary = await result;
    const current = await fs.stat(path.join(home, 'session-state', id, 'events.jsonl'));
    if (summary.size !== current.size || summary.mtimeMs !== current.mtimeMs)
      throw new Error('SDK backing changed since cached scope verification; retry with a fresh resolver.');
    return summary;
  }

  async function resolve (key: string, provenance: SourceProvenance): Promise<ResolvedProviderSource> {
    let backing: Backing;
    let chat: string;
    let provider: 'agent-host' | 'copilot-cli';
    let tool: string | undefined;
    if (key.startsWith('copilotcli:/')) {
      const id = key.slice('copilotcli:/'.length);
      if (!validStorageId(id) || id.startsWith('untitled-'))
        throw new Error('Untitled or unsupported Copilot CLI identity has no verified session folder.');
      provider = 'copilot-cli';
      chat = key;
      backing = { id, evidence: ['Exact Copilot CLI index key and SDK folder/header identity.'], warnings: [] };
      const workspaceFile = path.join(home, 'session-state', id, 'workspace.yaml');
      let workspace: string | undefined;
      try {
        workspace = new TextDecoder('utf-8', { fatal: true }).decode(await fs.readFile(workspaceFile));
      } catch (error) {
        if (!missing(error))
          throw error;
      }
      if (workspace !== undefined) {
        const identities = workspace.split(/\r?\n/).filter((line) => /^id\s*:/u.test(line));
        if (identities.length > 1)
          throw new Error('workspace.yaml has duplicate session identities.');
        if (identities.length) {
          const yamlId = identities[0].replace(/^id\s*:\s*/u, '').trim().replace(/^(['"])(.*)\1$/u, '$2');
          if (yamlId !== id)
            throw new Error('workspace.yaml identity does not match the SDK folder.');
          backing.evidence.push(`${workspaceFile}:id matches exact SDK folder.`);
        }
      }
    } else {
      provider = 'agent-host';
      const identity = parseAgentHostIdentity(key);
      const entries = await catalog(provenance.userDataRoot, identity.session);
      tool = identity.toolCallId;
      const candidates = tool === undefined ? [identity.chat]
        : [...new Set([identity.chat, ...entries.map((entry) => entry.chat)])];
      const matches: { backing: Backing; chat: string }[] = [];
      const failures: string[] = [];
      let ambiguousChild = false;
      for (const candidate of candidates) {
        try {
          const parsed = new URL(candidate);
          const peer = parseAgentHostIdentity(`agent-host-copilotcli:/${identity.id}#${parsed.hostname}`);
          if (peer.chat !== candidate)
            throw new Error('Unsupported persisted peer catalog URI.');
          const resolved = await resolveBacking(provenance.userDataRoot, peer, entries);
          const summary = await log(resolved.id);
          if (tool !== undefined && summary.childProblems.some((problem) => problem.toolCallId === tool))
            ambiguousChild = true;
          if (tool === undefined || summary.scopes.some((scope) => scope.parentToolCallId === tool))
            matches.push({ backing: resolved, chat: candidate });
        } catch (error) {
          failures.push(error instanceof Error ? error.message : 'Provider resolution failed.');
        }
      }
      if (failures.length || matches.length !== 1)
        throw new ProviderScopeError(
          `Exact provider scope cannot be uniquely verified (${matches.length} matches, ${failures.length} unavailable candidates). ${failures.join(' ')}`,
          matches.length > 1 || ambiguousChild ? 'ambiguous' : 'source-unavailable',
        );
      backing = matches[0].backing;
      chat = matches[0].chat;
    }
    const summary = await log(backing.id);
    const scope = tool === undefined ? { kind: 'main' } as const
      : summary.scopes.find((candidate) => candidate.parentToolCallId === tool);
    if (!scope)
      throw new ProviderScopeError('Subagent has no unique persisted agentId mapping.', 'ambiguous');
    const source: SdkEventSource = {
      kind: 'sdk-events', provider, sessionId: backing.id,
      path: path.join(home, 'session-state', backing.id, 'events.jsonl'),
      schemaVersion: 1, producer: summary.producer, scope, chatIdentity: chat, provenance,
      identityEvidence: backing.evidence, identityWarnings: backing.warnings, sha256: summary.sha256,
      scopeWarnings: summary.childProblems.map((problem) => `${problem.reason} Affected child remains unresolved; main scope is independently verified.`),
    };
    return {
      source, activityTimestamp: summary.activity.get(scope.kind === 'main' ? '' : scope.agentId) ?? null,
      createdTimestamp: summary.created.get(scope.kind === 'main' ? '' : scope.agentId) ?? null,
      promptCount: summary.promptCounts.get(scope.kind === 'main' ? '' : scope.agentId) ?? null,
      confirmedEmpty: summary.confirmedEmpty.get(scope.kind === 'main' ? '' : scope.agentId) ?? false,
      children: scope.kind === 'main' ? summary.scopes.map((child) => ({ ...source, scope: child })) : [],
      childParents: summary.childParents,
      childActivity: summary.activity,
      childCreated: summary.created,
      childPromptCounts: summary.promptCounts,
      childProblems: summary.childProblems,
    };
  }
  return { resolve };
}

export async function resolveProviderOccurrences (occurrences: SessionOccurrence[], options: ProviderResolverOptions = {}) {
  const resolver = createProviderSourceResolver(options);
  const families: { row: SessionOccurrence; resolved: ResolvedProviderSource }[] = [];
  for (const row of occurrences) {
    if (row.provider !== 'agent-host' && row.provider !== 'copilot-cli')
      continue;
    try {
      const resolved = await resolver.resolve(row.sessionId, row.provenance);
      families.push({ row, resolved });
      row.backing = { status: 'verified', source: resolved.source };
      row.createdTimestamp = resolved.createdTimestamp;
      row.promptCount = resolved.promptCount;
      if (resolved.confirmedEmpty)
        row.visibility = { status: 'hidden', reason: 'confirmed-empty' };
      if (resolved.promptCount === null)
        row.diagnostics.push({
          path: resolved.source.path, category: 'invalid-data',
          description: 'Prompt count is unknown because a recorded user message is malformed.',
        });
      for (const warning of resolved.source.scopeWarnings)
        row.diagnostics.push({ path: resolved.source.path, category: 'ambiguous', description: warning });
      if (row.activityTimestamp === null && resolved.activityTimestamp !== null) {
        row.activityTimestamp = resolved.activityTimestamp;
        row.activitySource = 'events';
      }
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Provider backing resolution failed.';
      row.backing = { status: 'unresolved', reason: description };
      row.diagnostics.push({
        path: row.provenance.workspaceStoragePath,
        category: error instanceof ProviderScopeError ? error.category : 'source-unavailable', description,
      });
      if (error instanceof ProviderScopeError && error.category === 'ambiguous')
        row.visibility = { status: 'hidden', reason: 'ambiguous' };
    }
  }
  for (const { row, resolved } of families) {
    if (resolved.source.scope.kind !== 'main')
      continue;
    const family = new Map<string, SessionOccurrence>();
    for (const source of resolved.children) {
      if (source.scope.kind !== 'subagent')
        continue;
      const scope = source.scope;
      let child = occurrences.find((candidate) => candidate.provenance.workspaceStoragePath === row.provenance.workspaceStoragePath
        && candidate.backing.status === 'verified' && candidate.backing.source.kind === 'sdk-events'
        && candidate.backing.source.sessionId === source.sessionId && candidate.backing.source.chatIdentity === source.chatIdentity
        && candidate.backing.source.scope.kind === 'subagent' && candidate.backing.source.scope.agentId === scope.agentId);
      if (!child) {
        const key = `${row.sessionId}#subagent/${encodeURIComponent(scope.parentToolCallId)}`;
        child = {
          occurrenceId: occurrenceId(row.provenance, key),
          provider: row.provider, sessionId: key, title: `Subagent ${scope.agentId}`, titleSource: 'fallback',
          activityTimestamp: resolved.childActivity.get(scope.agentId) ?? null,
          activitySource: resolved.childActivity.get(scope.agentId) == null ? 'unknown' : 'events',
          createdTimestamp: resolved.childCreated.get(scope.agentId) ?? null,
          promptCount: resolved.childPromptCounts.get(scope.agentId) ?? null,
          provenance: { ...row.provenance, indexKey: undefined },
          backing: { status: 'verified', source },
          visibility: { status: 'included' },
          diagnostics: resolved.childPromptCounts.get(scope.agentId) === null ? [{
            path: source.path, category: 'invalid-data',
            description: 'Subagent prompt count is unknown because a recorded user message is malformed.',
          }] : [],
        };
        occurrences.push(child);
      }
      family.set(scope.agentId, child);
    }
    for (const [agent, child] of family) {
      const parent = resolved.childParents.get(agent);
      const seen = new Set<string>([agent]);
      let ancestor = parent;
      while (typeof ancestor === 'string' && !seen.has(ancestor)) {
        seen.add(ancestor);
        ancestor = resolved.childParents.get(ancestor);
      }
      const cycle = typeof ancestor === 'string' && seen.has(ancestor);
      if (parent !== undefined && !cycle) {
        const parentRow = parent === null ? row : family.get(parent);
        parentRow && (child.parentOccurrenceId = parentRow.occurrenceId);
      } else {
        child.diagnostics.push({
          path: resolved.source.path, category: 'source-unavailable',
          description: cycle ? 'Child scope is verified, but persisted parent relationships form a cycle; parent link omitted.'
            : 'Child scope is verified, but its immediate parent relationship has no unique persisted tool.execution_start evidence.',
        });
      }
    }
    for (const problem of resolved.childProblems) {
      if (!problem.toolCallId)
        continue;
      const key = `${row.sessionId}#subagent/${encodeURIComponent(problem.toolCallId)}`;
      const existing = occurrences.find((candidate) => candidate.sessionId === key
        && candidate.provenance.workspaceStoragePath === row.provenance.workspaceStoragePath);
      if (existing)
        continue;
      occurrences.push({
        occurrenceId: occurrenceId(row.provenance, key),
        provider: row.provider, sessionId: key, title: 'Ambiguous subagent', titleSource: 'fallback',
        activityTimestamp: null, activitySource: 'unknown',
        createdTimestamp: null, promptCount: null,
        provenance: { ...row.provenance, indexKey: undefined },
        backing: { status: 'unresolved', reason: problem.reason },
        visibility: { status: 'hidden', reason: 'ambiguous' },
        diagnostics: [{ path: resolved.source.path, category: 'ambiguous', description: problem.reason }],
      });
    }
  }
}
