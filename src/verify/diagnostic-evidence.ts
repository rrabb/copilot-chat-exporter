import { createHash, createHmac } from 'node:crypto';
import type { SdkEvent } from '../session/sdk-events.ts';
import type { LossItem } from './loss-account.ts';

export const DIAGNOSTIC_EVIDENCE_VERSION = 1;

const DEFAULT_SAFE_PATHS = [
  'type',
  'data.type',
  'data.kind',
  'data.toolName',
  'data.success',
  'data.status',
  'data.error.code',
  'data.errorType',
  'data.infoType',
  'data.producer',
  'data.version',
  'data.shellExecution.exitCode',
  'data.toolRequests[].name',
  'data.toolRequests[].toolName',
];

const SAFE_KEY = /^[A-Za-z_$][A-Za-z0-9_$.-]{0,63}$/u;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu;
const HEX = /^[\da-f]{24,}$/iu;
const BASE64 = /^[A-Za-z0-9+/]{24,}={0,2}$/u;
const TOKEN_PREFIX = /^(?:ghp_|github_pat_|sk-|Bearer )/iu;
const DYNAMIC_KEY_ID = /^(?:[A-Za-z_-]*\d{3,}[A-Za-z_-]*|[\w.-]+@[\w.-]+)$/u;

type StringClass = 'credential' | 'empty' | 'identifier' | 'path' | 'text' | 'url';
type NumberClass = 'finite-integer-negative' | 'finite-integer-positive' | 'finite-integer-zero'
  | 'finite-fraction-negative' | 'finite-fraction-positive' | 'nonfinite';

export type DiagnosticRedactedValue =
  | { type: 'null' }
  | { type: 'boolean'; value: boolean }
  | { type: 'number'; class: NumberClass; value?: number }
  | { type: 'string'; class: StringClass; length: number; fingerprint: string; value?: string }
  | { type: 'array'; length: number; items: Array<{ index: number; value: DiagnosticRedactedValue }>; omitted: number }
  | { type: 'object'; entries: Array<{
    key: string;
    keyClass: 'plain' | 'fingerprinted';
    value: DiagnosticRedactedValue;
  }> }
  | { type: 'undefined' | 'bigint' | 'symbol' | 'function' | 'cycle' };

export interface DiagnosticRedactionOptions {
  fingerprintKey: string;
  safePaths?: readonly string[];
  maxArrayItems?: number;
}

export interface SchemaDiagnosticRecord {
  provider: 'local' | 'sdk';
  type: string;
  line: number;
  locator?: string;
  issues: readonly string[];
  value: unknown;
  linkedRecords?: DiagnosticLinkedRecord[];
  linkedOmitted?: number;
}

export interface DiagnosticLinkedRecord {
  role: 'tool-request' | 'tool-start' | 'tool-complete';
  type: string;
  line: number;
  locator?: string;
  value: unknown;
}

export interface SchemaDiagnosticField {
  path: string;
  types: string[];
}

export interface DiagnosticFieldOccurrence {
  path: string;
  type: string;
}

export interface SchemaDiagnosticSample {
  line: number;
  locator?: string;
  value: DiagnosticRedactedValue;
  valueHash: string;
  linkedRecords: Array<{
    role: DiagnosticLinkedRecord['role'];
    type: string;
    line: number;
    locator?: string;
    value: DiagnosticRedactedValue;
  }>;
  linkedOmitted: number;
}

export interface SchemaDiagnosticGroup {
  signature: string;
  provider: SchemaDiagnosticRecord['provider'];
  type: string;
  issues: string[];
  count: number;
  omitted: number;
  lines: number[];
  locators: string[];
  fields: SchemaDiagnosticField[];
  samples: SchemaDiagnosticSample[];
}

export interface SchemaDiagnosticEvidence {
  version: typeof DIAGNOSTIC_EVIDENCE_VERSION;
  records: number;
  groups: SchemaDiagnosticGroup[];
}

export interface ContentDiagnosticGroup {
  signature: string;
  category: string;
  status: LossItem['status'];
  count: number;
  requests: number[];
  sample: {
    request: number;
    chars: number;
    lines?: LossItem['lines'];
    evidence: NonNullable<LossItem['evidence']>;
  };
  omitted: number;
}

export interface ContentDiagnosticEvidence {
  version: typeof DIAGNOSTIC_EVIDENCE_VERSION;
  records: number;
  groups: ContentDiagnosticGroup[];
}

export interface DiagnosticFindingInput {
  provider: 'exporter' | 'local' | 'sdk';
  severity: 'failure' | 'warning';
  stage: string;
  category: string;
  check: string;
  message: string;
  locators?: readonly string[];
  schemaSignatures?: readonly string[];
  contentSignatures?: readonly string[];
}

export interface DiagnosticFinding extends DiagnosticFindingInput {
  signature: string;
  count: number;
  locators: string[];
  schemaSignatures: string[];
  contentSignatures: string[];
}

export interface DiagnosticEvidenceModel {
  version: typeof DIAGNOSTIC_EVIDENCE_VERSION;
  findings: DiagnosticFinding[];
  schema: SchemaDiagnosticEvidence;
  content: ContentDiagnosticEvidence;
}

export interface SdkSchemaDiagnosticSelection {
  event: SdkEvent;
  issues: readonly string[];
}

export interface SchemaDiagnosticCollectionOptions extends DiagnosticRedactionOptions {
  maxSamplesPerSignature?: number;
}

interface InternalRecord {
  provider: SchemaDiagnosticRecord['provider'];
  type: string;
  line: number;
  locator: string;
  issues: string[];
  value: unknown;
  signature: string;
  fields: SchemaDiagnosticField[];
  linkedRecords: DiagnosticLinkedRecord[];
  linkedOmitted: number;
}

function fingerprint (key: string, kind: string, value: string): string {
  return createHmac('sha256', key).update(`${kind}\0${value}`).digest('hex').slice(0, 16);
}

function safeSet (paths: readonly string[] | undefined): ReadonlySet<string> {
  return new Set([...DEFAULT_SAFE_PATHS, ...(paths ?? [])]);
}

function safePath (path: string, paths: ReadonlySet<string>): boolean {
  return paths.has(path);
}

function plainKey (key: string): boolean {
  if (!SAFE_KEY.test(key) || UUID.test(key) || HEX.test(key) || BASE64.test(key)
    || TOKEN_PREFIX.test(key) || DYNAMIC_KEY_ID.test(key))
    return false;
  return key.length <= 64;
}

function objectKey (key: string, keyValue: string): { key: string; keyClass: 'plain' | 'fingerprinted' } {
  return plainKey(key)
    ? { key, keyClass: 'plain' }
    : { key: `key:${fingerprint(keyValue, 'object-key', key)}`, keyClass: 'fingerprinted' };
}

function lastSegment (path: string): string {
  return path.split('.').at(-1)?.replace(/\[\]$/u, '').replace(/^(?:data|result|error)_?/u, '') ?? '';
}

function stringClass (path: string, value: string): StringClass {
  if (!value)
    return 'empty';
  const segment = lastSegment(path);
  if (/(?:password|secret|token|credential|authorization|api[-_]?key)$/iu.test(segment) || TOKEN_PREFIX.test(value))
    return 'credential';
  if (/(?:id|uuid|hash|identity)$/iu.test(segment) || UUID.test(value) || HEX.test(value))
    return 'identifier';
  if (/^(?:https?|file):\/\//iu.test(value) || /^(?:www|mailto:)/iu.test(value))
    return 'url';
  if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/u.test(value) || /(?:path|dir|directory|cwd|uri)$/iu.test(segment))
    return 'path';
  return 'text';
}

function numberClass (value: number): NumberClass {
  if (!Number.isFinite(value))
    return 'nonfinite';
  if (Number.isInteger(value))
    return value === 0 ? 'finite-integer-zero' : value > 0 ? 'finite-integer-positive' : 'finite-integer-negative';
  return value > 0 ? 'finite-fraction-positive' : 'finite-fraction-negative';
}

function representativeIndexes (length: number, limit: number): number[] {
  if (length <= limit)
    return Array.from({ length }, (_, index) => index);
  if (limit <= 0)
    return [];
  if (limit === 1)
    return [0];
  return [...new Set(Array.from({ length: limit }, (_, index) =>
    Math.floor(index * (length - 1) / (limit - 1))))];
}

function joinPath (parent: string, child: string): string {
  return parent ? `${parent}.${child}` : child;
}

function normalizePathKey (path: string, key: string): string {
  return joinPath(path, plainKey(key) ? key : '<key>');
}

function diagnosticType (value: unknown): string {
  if (value === null)
    return 'null';
  if (Array.isArray(value))
    return 'array';
  return typeof value;
}

function requireFingerprintKey (key: string): void {
  if (!key)
    throw new Error('Diagnostic fingerprintKey must be nonempty.');
}

export function redactDiagnosticValue (value: unknown, options: DiagnosticRedactionOptions): DiagnosticRedactedValue {
  requireFingerprintKey(options.fingerprintKey);
  const allowed = safeSet(options.safePaths);
  const limit = options.maxArrayItems ?? 3;
  if (!Number.isInteger(limit) || limit < 0)
    throw new Error('maxArrayItems must be a nonnegative integer.');
  const active = new WeakSet<object>();
  const redact = (item: unknown, path: string): DiagnosticRedactedValue => {
    if (item === null)
      return { type: 'null' };
    if (typeof item === 'boolean')
      return { type: 'boolean', value: item };
    if (typeof item === 'number') {
      return safePath(path, allowed)
        ? { type: 'number', class: numberClass(item), value: item }
        : { type: 'number', class: numberClass(item) };
    }
    if (typeof item === 'string') {
      const valueClass = stringClass(path, item);
      const base = {
        type: 'string' as const,
        class: valueClass,
        length: item.length,
        fingerprint: fingerprint(options.fingerprintKey, `string:${valueClass}`, item),
      };
      return safePath(path, allowed) ? { ...base, value: item } : base;
    }
    if (typeof item === 'bigint')
      return { type: 'bigint' };
    if (typeof item === 'undefined')
      return { type: 'undefined' };
    if (typeof item === 'symbol')
      return { type: 'symbol' };
    if (typeof item === 'function')
      return { type: 'function' };
    if (active.has(item))
      return { type: 'cycle' };
    active.add(item);
    let result: DiagnosticRedactedValue;
    if (Array.isArray(item)) {
      const indexes = representativeIndexes(item.length, limit);
      result = {
        type: 'array',
        length: item.length,
        items: indexes.map((index) => ({ index, value: redact(item[index], `${path}[]`) })),
        omitted: item.length - indexes.length,
      };
    } else {
      result = {
        type: 'object',
        entries: Object.keys(item).sort().map((key) => {
          const outputKey = objectKey(key, options.fingerprintKey);
          const childPath = joinPath(path, key);
          return { ...outputKey, value: redact(Reflect.get(item, key), childPath) };
        }),
      };
    }
    active.delete(item);
    return result;
  };
  return redact(value, '');
}

export function diagnosticFieldOccurrences (value: unknown, prefix = ''): DiagnosticFieldOccurrence[] {
  const result: DiagnosticFieldOccurrence[] = [];
  const active = new WeakSet<object>();
  const walk = (item: unknown, path: string) => {
    const type = diagnosticType(item);
    path && result.push({ path, type });
    if (item === null || typeof item !== 'object' || active.has(item))
      return;
    active.add(item);
    if (Array.isArray(item))
      for (const child of item)
        walk(child, `${path}[]`);
    else
      for (const key of Object.keys(item).sort())
        walk(Reflect.get(item, key), normalizePathKey(path, key));
    active.delete(item);
  };
  walk(value, prefix);
  return result;
}

function schemaFields (value: unknown): SchemaDiagnosticField[] {
  const fields = new Map<string, Set<string>>();
  for (const occurrence of diagnosticFieldOccurrences(value)) {
    const types = fields.get(occurrence.path) ?? new Set<string>();
    types.add(occurrence.type);
    fields.set(occurrence.path, types);
  }
  return [...fields].map(([path, types]) => ({ path, types: [...types].sort() }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function safeValues (value: unknown, paths: ReadonlySet<string>): Array<{ path: string; value: unknown }> {
  const result: Array<{ path: string; value: unknown }> = [];
  const active = new WeakSet<object>();
  const walk = (item: unknown, path: string) => {
    if (path && safePath(path, paths) && (
      item === null || typeof item === 'boolean'
      || typeof item === 'string' || typeof item === 'number' && Number.isFinite(item)
    ))
      result.push({ path, value: item });
    if (item === null || typeof item !== 'object' || active.has(item))
      return;
    active.add(item);
    if (Array.isArray(item)) {
      for (const child of item)
        walk(child, `${path}[]`);
    } else {
      for (const key of Object.keys(item).sort())
        walk(Reflect.get(item, key), joinPath(path, key));
    }
    active.delete(item);
  };
  walk(value, '');
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

function schemaSignature (record: SchemaDiagnosticRecord, fields: SchemaDiagnosticField[], paths: ReadonlySet<string>): string {
  return createHash('sha256').update(JSON.stringify({
    provider: record.provider,
    type: record.type,
    issues: [...record.issues].sort(),
    fields,
    safeValues: safeValues(record.value, paths),
  })).digest('hex');
}

function sampleRecord (record: InternalRecord, options: SchemaDiagnosticCollectionOptions): SchemaDiagnosticSample {
  const value = redactDiagnosticValue(record.value, options);
  const linkedRecords = record.linkedRecords.map((link) => ({
    role: link.role,
    type: link.type,
    line: link.line,
    ...(link.locator ? { locator: link.locator } : {}),
    value: redactDiagnosticValue(link.value, options),
  }));
  return {
    line: record.line,
    locator: record.locator,
    value,
    valueHash: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
    linkedRecords,
    linkedOmitted: record.linkedOmitted,
  };
}

export function collectSchemaDiagnosticEvidence (
  records: readonly SchemaDiagnosticRecord[],
  options: SchemaDiagnosticCollectionOptions,
): SchemaDiagnosticEvidence {
  requireFingerprintKey(options.fingerprintKey);
  const paths = safeSet(options.safePaths);
  const grouped = new Map<string, InternalRecord[]>();
  for (const record of records) {
    const fields = schemaFields(record.value);
    const internal: InternalRecord = {
      provider: record.provider,
      type: record.type,
      line: record.line,
      locator: record.locator ?? `${record.provider} line ${record.line}`,
      issues: [...record.issues].sort(),
      value: record.value,
      signature: schemaSignature(record, fields, paths),
      fields,
      linkedRecords: record.linkedRecords ?? [],
      linkedOmitted: record.linkedOmitted ?? 0,
    };
    const group = grouped.get(internal.signature) ?? [];
    group.push(internal);
    grouped.set(internal.signature, group);
  }
  const limit = options.maxSamplesPerSignature ?? 3;
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error('maxSamplesPerSignature must be a positive integer.');
  const groups: SchemaDiagnosticGroup[] = [...grouped].map(([signature, entries]) => {
    entries.sort((left, right) => left.line - right.line);
    const samples = representativeIndexes(entries.length, limit)
      .map((index) => sampleRecord(entries[index]!, options));
    const first = entries[0]!;
    return {
      signature,
      provider: first.provider,
      type: first.type,
      issues: first.issues,
      count: entries.length,
      omitted: entries.length - samples.length,
      lines: entries.map((entry) => entry.line),
      locators: entries.map((entry) => entry.locator),
      fields: first.fields,
      samples,
    };
  }).sort((left, right) => left.signature.localeCompare(right.signature));
  return { version: DIAGNOSTIC_EVIDENCE_VERSION, records: records.length, groups };
}

export interface ExactDiagnosticRecord {
  signature: string;
  provider: SchemaDiagnosticRecord['provider'];
  type: string;
  line: number;
  locator: string;
  issues: string[];
  /** The recorded value with every key kept. Only strings over the clip limit lose their middle. */
  value: unknown;
  linkedRecords: Array<{ role: DiagnosticLinkedRecord['role']; type: string; line: number; locator?: string; value: unknown }>;
  clippedStrings: number;
}

export interface ExactRecordOptions {
  safePaths?: readonly string[];
  maxRecordsPerSignature?: number;
  headChars?: number;
  tailChars?: number;
}

function clipStrings (value: unknown, head: number, tail: number, counter: { clipped: number }): unknown {
  if (typeof value === 'string') {
    if (value.length <= head + tail)
      return value;
    counter.clipped += 1;
    const sha = createHash('sha256').update(value).digest('hex');
    return `${value.slice(0, head)}\n[cce clipped: ${value.length} chars, sha256 ${sha}]\n${value.slice(-tail)}`;
  }
  if (Array.isArray(value))
    return value.map((item) => clipStrings(item, head, tail, counter));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clipStrings(item, head, tail, counter)]));
  return value;
}

/**
 * Picks the same first, middle and last records per signature as the structural samples, but keeps
 * recorded values. The caller must treat the result as private exact evidence.
 */
export function exactDiagnosticRecords (
  records: readonly SchemaDiagnosticRecord[],
  options: ExactRecordOptions = {},
): ExactDiagnosticRecord[] {
  const paths = safeSet(options.safePaths);
  const limit = options.maxRecordsPerSignature ?? 3;
  const head = options.headChars ?? 2000;
  const tail = options.tailChars ?? 500;
  if (![limit, head, tail].every((value) => Number.isInteger(value) && value >= 0) || limit < 1)
    throw new Error('Exact record limits must be nonnegative integers, with at least one record per signature.');
  const grouped = new Map<string, SchemaDiagnosticRecord[]>();
  for (const record of records) {
    const signature = schemaSignature(record, schemaFields(record.value), paths);
    const group = grouped.get(signature) ?? [];
    group.push(record);
    grouped.set(signature, group);
  }
  const result: ExactDiagnosticRecord[] = [];
  for (const [signature, entries] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
    entries.sort((left, right) => left.line - right.line);
    for (const index of representativeIndexes(entries.length, limit)) {
      const record = entries[index]!;
      const counter = { clipped: 0 };
      const value = clipStrings(record.value, head, tail, counter);
      const linkedRecords = (record.linkedRecords ?? []).map((link) => ({
        role: link.role,
        type: link.type,
        line: link.line,
        ...(link.locator ? { locator: link.locator } : {}),
        value: clipStrings(link.value, head, tail, counter),
      }));
      result.push({
        signature,
        provider: record.provider,
        type: record.type,
        line: record.line,
        locator: record.locator ?? `${record.provider} line ${record.line}`,
        issues: [...record.issues].sort(),
        value,
        linkedRecords,
        clippedStrings: counter.clipped,
      });
    }
  }
  return result;
}

export function collectContentDiagnosticEvidence (items: readonly LossItem[]): ContentDiagnosticEvidence {
  const grouped = new Map<string, LossItem[]>();
  for (const item of items) {
    if (!item.evidence)
      throw new Error('Content diagnostic evidence was not captured while running Layer D.');
    const signature = createHash('sha256').update(JSON.stringify({
      category: item.category,
      status: item.status,
      textHash: item.evidence.textHash,
      matchedHash: item.evidence.matchedText === null
        ? null
        : createHash('sha256').update(item.evidence.matchedText).digest('hex'),
      lines: item.lines ?? null,
    })).digest('hex');
    const group = grouped.get(signature) ?? [];
    group.push(item);
    grouped.set(signature, group);
  }
  const groups: ContentDiagnosticGroup[] = [...grouped].map(([signature, entries]) => {
    entries.sort((left, right) => left.request - right.request);
    const first = entries[0]!;
    return {
      signature,
      category: first.category,
      status: first.status,
      count: entries.length,
      requests: entries.map((item) => item.request),
      sample: {
        request: first.request,
        chars: first.chars,
        ...(first.lines ? { lines: first.lines } : {}),
        evidence: first.evidence!,
      },
      omitted: entries.length - 1,
    };
  }).sort((left, right) => left.signature.localeCompare(right.signature));
  return { version: DIAGNOSTIC_EVIDENCE_VERSION, records: items.length, groups };
}

export function buildDiagnosticEvidenceModel (
  findings: readonly DiagnosticFindingInput[],
  schema: SchemaDiagnosticEvidence,
  content: ContentDiagnosticEvidence,
): DiagnosticEvidenceModel {
  const grouped = new Map<string, { base: DiagnosticFinding; locators: Set<string> }>();
  for (const input of findings) {
    const identity = {
      provider: input.provider,
      severity: input.severity,
      stage: input.stage,
      category: input.category,
      check: input.check,
      message: input.message,
      schemaSignatures: [...(input.schemaSignatures ?? [])].sort(),
      contentSignatures: [...(input.contentSignatures ?? [])].sort(),
    };
    const signature = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    let group = grouped.get(signature);
    if (!group) {
      group = {
        base: {
          ...input,
          signature,
          count: 0,
          locators: [],
          schemaSignatures: identity.schemaSignatures,
          contentSignatures: identity.contentSignatures,
        },
        locators: new Set(),
      };
      grouped.set(signature, group);
    }
    group.base.count += 1;
    for (const locator of input.locators ?? [])
      group.locators.add(locator);
  }
  return {
    version: DIAGNOSTIC_EVIDENCE_VERSION,
    findings: [...grouped.values()].map(({ base, locators }) => ({
      ...base,
      locators: [...locators].sort(),
    })).sort((left, right) => left.signature.localeCompare(right.signature)),
    schema,
    content,
  };
}

function toolCallId (event: SdkEvent): string | null {
  return typeof event.data.toolCallId === 'string' && event.data.toolCallId
    ? event.data.toolCallId
    : null;
}

function toolRequests (event: SdkEvent): Array<Record<string, unknown>> {
  const requests = event.data.toolRequests;
  return Array.isArray(requests)
    ? requests.filter((request): request is Record<string, unknown> =>
      request !== null && typeof request === 'object' && !Array.isArray(request))
    : [];
}

function matchingToolIds (event: SdkEvent): Set<string> {
  const result = new Set<string>();
  const direct = toolCallId(event);
  direct && result.add(direct);
  for (const request of toolRequests(event)) {
    if (typeof request.toolCallId === 'string' && request.toolCallId)
      result.add(request.toolCallId);
  }
  return result;
}

function linkedSdkRecords (events: readonly SdkEvent[], selected: SdkEvent, maxLinkedRecords: number): {
  records: DiagnosticLinkedRecord[];
  omitted: number;
} {
  const ids = matchingToolIds(selected);
  if (!ids.size)
    return { records: [], omitted: 0 };
  const records: DiagnosticLinkedRecord[] = [];
  for (const event of events) {
    if (event === selected)
      continue;
    const direct = toolCallId(event);
    if (direct && ids.has(direct)) {
      if (event.type === 'tool.execution_start' || event.type === 'tool.execution_complete') {
        records.push({
          role: event.type === 'tool.execution_start' ? 'tool-start' : 'tool-complete',
          type: event.type,
          line: event.line,
          locator: `line ${event.line}`,
          value: event.raw,
        });
      }
      continue;
    }
    const requests = toolRequests(event).filter((request) =>
      typeof request.toolCallId === 'string' && ids.has(request.toolCallId));
    for (const request of requests)
      records.push({
        role: 'tool-request',
        type: event.type,
        line: event.line,
        locator: `line ${event.line}`,
        value: { type: event.type, data: { toolRequests: [request] } },
      });
  }
  records.sort((left, right) => left.line - right.line);
  return { records: records.slice(0, maxLinkedRecords), omitted: Math.max(0, records.length - maxLinkedRecords) };
}

export function sdkSchemaDiagnosticRecords (
  events: readonly SdkEvent[],
  selections: readonly SdkSchemaDiagnosticSelection[],
  maxLinkedRecords = 12,
): SchemaDiagnosticRecord[] {
  if (!Number.isInteger(maxLinkedRecords) || maxLinkedRecords < 0)
    throw new Error('maxLinkedRecords must be a nonnegative integer.');
  return selections.map(({ event, issues }) => {
    const linked = linkedSdkRecords(events, event, maxLinkedRecords);
    return {
      provider: 'sdk',
      type: event.type,
      line: event.line,
      locator: `line ${event.line}`,
      issues,
      value: event.raw,
      linkedRecords: linked.records,
      linkedOmitted: linked.omitted,
    };
  });
}
