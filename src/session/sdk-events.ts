import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { VerifiedChildScope } from './sources.ts';

export function isRecord (value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export interface SdkEvent {
  type: string;
  id?: string;
  agentId?: string;
  timestamp?: string;
  data: Record<string, unknown>;
  /** Complete recorded fields, including future fields, without truncation. */
  raw: Record<string, unknown>;
  /** Original JSON text for independent checks and values JSON.parse cannot represent exactly. */
  recordedLine: string;
  line: number;
}

export interface SdkEventLog {
  events: SdkEvent[];
  sha256: string;
  producer: string | null;
}

export class SdkEventLineError extends Error {
  readonly sourceLine: number;
  readonly excerpt: string;

  constructor (message: string, sourceLine: number, rawLine: string) {
    super(message);
    this.name = 'SdkEventLineError';
    this.sourceLine = sourceLine;
    this.excerpt = redactMalformedEventLine(rawLine);
  }
}

const SAFE_EXCERPT_KEYS = new Set([
  'accounting', 'agentId', 'authority', 'boundary', 'cacheReadTokens', 'cacheWriteTokens',
  'content', 'copilotUsage', 'data', 'detailedContent', 'duration', 'error', 'errorMessage',
  'id', 'inputTokens', 'kind', 'lifetime', 'message', 'model', 'name', 'outputTokens',
  'parentId', 'parentToolCallId', 'postInitial', 'prompt', 'reason', 'reasoningBlocks', 'reasoningText',
  'result', 'scope', 'sessionId', 'summary', 'timestamp', 'toolCallId', 'toolRequests',
  'totalNanoAiu', 'type', 'usage', 'version',
]);

function redactMalformedEventLine (line: string, limit = 600): string {
  let output = '';
  let index = 0;
  let fieldKey: string | null = null;
  const append = (value: string) => {
    if (output.length >= limit)
      return;
    output += value.slice(0, limit - output.length);
  };
  while (index < line.length && output.length < limit) {
    const char = line[index]!;
    if (char === '"') {
      const start = index++;
      let closed = false;
      for (; index < line.length; index += 1) {
        if (line[index] === '\\') {
          index += 1;
          continue;
        }
        if (line[index] === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) {
        append('"<redacted>');
        break;
      }
      const token = line.slice(start, index + 1);
      let next = index + 1;
      while (next < line.length && /\s/u.test(line[next]!))
        next += 1;
      if (line[next] === ':') {
        try {
          const key = JSON.parse(token);
          fieldKey = typeof key === 'string' && SAFE_EXCERPT_KEYS.has(key) ? key : null;
          append(JSON.stringify(fieldKey ?? '<key>'));
        } catch {
          fieldKey = null;
          append('"<key>"');
        }
      } else {
        let keep = false;
        try {
          const value = JSON.parse(token);
          keep = fieldKey === 'type' && typeof value === 'string' && /^[A-Za-z0-9_.-]{1,80}$/u.test(value);
        } catch {}
        append(keep ? token : '"<redacted>"');
        fieldKey = null;
      }
      index += 1;
      continue;
    }
    if (/[A-Za-z_$]/u.test(char)) {
      const start = index;
      while (index < line.length && /[A-Za-z0-9_$-]/u.test(line[index]!))
        index += 1;
      const token = line.slice(start, index);
      append(/^(?:true|false|null)$/u.test(token) ? token : '<redacted>');
      continue;
    }
    append(char);
    if (char === ',' || char === ':' || char === '{' || char === '}')
      fieldKey = char === ':' ? fieldKey : null;
    index += 1;
  }
  return output.length >= limit ? `${output}…<clipped>` : output;
}

/** Strict UTF-8 and stable reads; never starts a provider or repairs its storage. */
export async function readSdkEvents (file: string, sessionId: string): Promise<SdkEventLog> {
  const before = await fs.stat(file);
  const bytes = await fs.readFile(file);
  const after = await fs.stat(file);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
    throw new Error('SDK event log changed during read; retry.');
  const events: SdkEvent[] = [];
  const lines = new TextDecoder('utf-8', { fatal: true }).decode(bytes).split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!line.trim())
      continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new SdkEventLineError(`SDK event line ${index + 1} is not valid JSON; no partial backing verification.`, index + 1, line);
    }
    if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.data)
      || (value.agentId !== undefined && (typeof value.agentId !== 'string' || !value.agentId))
      || (value.id !== undefined && typeof value.id !== 'string')
      || (value.timestamp !== undefined && typeof value.timestamp !== 'string'))
      throw new SdkEventLineError(`SDK event line ${index + 1} has an unsupported envelope.`, index + 1, line);
    events.push({
      type: value.type, data: value.data, raw: value, recordedLine: line, line: index + 1,
      ...(typeof value.id === 'string' ? { id: value.id } : {}),
      ...(typeof value.agentId === 'string' ? { agentId: value.agentId } : {}),
      ...(typeof value.timestamp === 'string' ? { timestamp: value.timestamp } : {}),
    });
  }
  const starts = events.filter((event) => event.type === 'session.start');
  if (starts.length !== 1 || starts[0] !== events[0] || starts[0].agentId !== undefined
    || starts[0].data.sessionId !== sessionId || starts[0].data.version !== 1)
    throw new Error('SDK session.start identity/version does not match the resolved backing.');
  return {
    events, sha256: createHash('sha256').update(bytes).digest('hex'),
    producer: typeof starts[0].data.producer === 'string' ? starts[0].data.producer : null,
  };
}

export interface ChildScopeProblem { toolCallId?: string; reason: string }

export function childScopes (events: readonly SdkEvent[]) {
  const starts = events.filter((event) => event.type === 'subagent.started');
  const tools = new Set(starts.map((event) => event.data.toolCallId));
  const result: VerifiedChildScope[] = [];
  const problems: ChildScopeProblem[] = [];
  for (const tool of tools) {
    if (typeof tool !== 'string' || !tool) {
      problems.push({ reason: 'Subagent start lacks a persisted tool-call identity.' });
      continue;
    }
    const matching = starts.filter((event) => event.data.toolCallId === tool);
    const agents = new Set(matching.map((event) => event.agentId));
    const agent = matching[0].agentId;
    if (agents.size !== 1 || agent === undefined
      || starts.some((event) => event.agentId === agent && event.data.toolCallId !== tool)) {
      problems.push({ toolCallId: tool, reason: 'Subagent tool-call/agent mapping is ambiguous or incomplete.' });
      continue;
    }
    result.push({
      kind: 'subagent', agentId: agent, parentToolCallId: tool,
      evidenceRecordIds: matching.map((event) => event.id ?? `line:${event.line}`),
    });
  }
  return { scopes: result, problems };
}

/** Main excludes attributed/delegated records; child selects only its persisted agentId. */
export function eventsInScope (events: readonly SdkEvent[], scope: { kind: 'main' } | VerifiedChildScope) {
  return events.filter((event) => scope.kind === 'subagent' ? event.agentId === scope.agentId
    : event.agentId === undefined && !event.data.parentToolCallId);
}
