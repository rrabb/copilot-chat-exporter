/**
 * Private raw-event census for WI-054. This doesn't use the exporter's lossy parsed model.
 * Field inventory is exhaustive for parsed JSON values. Semantic observations are bounded heuristics, not a workflow validator.
 */
export const WINDOW_START = '2026-10-24T04:43:55.092Z';
export const WINDOW_END = '2026-11-14T04:43:55.092Z';
export type Period = 'inWindow' | 'beforeWindow' | 'afterWindow' | 'unknownTime';
export type Selection = 'qualified' | 'context-candidate' | 'unknown-candidate' | 'not-selected';

export interface Diagnostic {
  code: string;
  line?: number;
  detail?: string;
}

interface CensusRecord {
  line: number;
  type: string;
  period: Period;
  raw: unknown;
}

export interface FieldInventory {
  path: string;
  eventsPresent: number;
  missingEvents: number;
  occurrences: number;
  types: Record<string, number>;
  zeroOccurrences: number;
  emptyStringOccurrences: number;
  emptyArrayOccurrences: number;
  emptyObjectOccurrences: number;
  lines: number[];
  values: { value: string | number | boolean; occurrences: number; lines: number[] }[];
  omittedValueOccurrences: number;
}

export interface EventInventory {
  period: Period;
  type: string;
  events: number;
  lines: number[];
  fields: FieldInventory[];
}

interface Identity {
  line: number;
  period: Period;
  path: string;
  key: string;
  value: string;
}

interface Semantics {
  sequence: { line: number; type: string; period: Period }[];
  transitions: { fromLine: number; toLine: number; fromType: string; toType: string; sameFusionId: boolean | null }[];
  identities: Identity[];
  identityGroups: { key: string; value: string; lines: number[]; eventTypes: string[]; envelopeAgentIds: string[] }[];
  scopes: { line: number; period: Period; path: string; value: string }[];
  parentLinks: { line: number; path: string; value: string; matchingLines: number[]; status: string }[];
  versions: { line: number; path: string; value: string | number }[];
  projections: { line: number; path: string; equality: 'exact' | 'whitespace-only' | 'different' | 'not-comparable' }[];
}

export interface SourceCensus {
  status: 'complete' | 'partial';
  selection: Selection;
  /** Period counts cover parsed records. Malformed counts are separate because their timestamps are unknown. */
  counts: Record<Period | 'malformed', number>;
  evidence: { line: number; period: Period; kind: string; path: string }[];
  diagnostics: Diagnostic[];
  inventory: EventInventory[];
  semantics: Semantics;
}

export const LIMITATIONS = [
  'Scope is immediate session directories containing events.jsonl under supplied Agent Host/CLI session-state roots.',
  'Directory enumeration is not atomic. Sessions added after enumeration may be absent from this captured source set.',
  'No Local journals, database-only sessions, backups, other machines or inaccessible stores are searched.',
  'Freeze-selected retention keeps source bytes for qualified, review and unstable candidates. Excluded-source audits are carried forward during replay.',
  'Inventory-only retention keeps no event bytes and cannot be replayed. Later source changes or disappearance can prevent a complete rerun.',
  'Replay uses the original fixed window. It cannot reselect excluded sources for a different window.',
  'All reports, keys, values, identities and paths except summary.json are private and need review before publication.',
  'Raw field/type counts include every parsed JSON value. Malformed lines and undecodable UTF-8 make coverage partial.',
  'Period counts cover parsed records only. Malformed records and unreadable sources have unknown event families and times, not zero activity.',
  'Missing counts use event denominators, not array-element denominators. They do not count parent array elements missing a nested field. Repeated array members count as separate occurrences.',
  'Numbers use JavaScript JSON decoding. Exact numeric token spelling is not kept in the value inventory. Inventory-only runs depend on native sources for that evidence.',
  'Enum observations use a key allowlist, at most 100 distinct values per field, and strings up to 120 characters. Version strings use the same length limit.',
  'Semantic observations are not a complete state machine or proof of valid workflow, identity ownership or causal order.',
  'Transitions follow physical record order, including context. Parent links match raw parentId to envelope id within one source.',
  'Projection comparisons inspect sibling content and projectionMessage.content strings, not every possible text-bearing schema.',
  'Whitespace-only comparison removes JavaScript whitespace characters. This is a lexical observation, not semantic text equivalence.',
  'No usage aggregation or cross-source history-identity inference is performed. Duplicate groups mean identical source bytes.',
  'Two reads, hashes and metadata checks detect observed changes, not all concurrent writes or hostile link replacement races.',
  'The engine holds complete inventories in memory. Inventory-only JSON is streamed through gzip. Loading legacy JSON still needs room for a parsed report.',
] as const;

export function object (value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function typeOf (value: unknown): string {
  if (value === null)
    return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

// Require a timezone and a real calendar date. Keep sub-millisecond digits for exact boundary comparisons.
function timestampNs (value: unknown): bigint | null {
  if (typeof value !== 'string')
    return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (!match)
    return null;
  const [, year, month, day, hour, minute, second, fraction = '', zone] = match;
  const days = new Date(`${year}-${month}-01T00:00:00Z`);
  days.setUTCMonth(days.getUTCMonth() + 1);
  days.setUTCDate(0);
  if (+month < 1 || +month > 12 || +day < 1 || +day > days.getUTCDate()
    || +hour > 23 || +minute > 59 || +second > 59)
    return null;
  const milliseconds = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}.${fraction.padEnd(3, '0').slice(0, 3)}${zone}`);
  if (!Number.isFinite(milliseconds))
    return null;
  return BigInt(milliseconds) * 1_000_000n + BigInt(fraction.padEnd(9, '0').slice(3) || '0');
}

const startNs = timestampNs(WINDOW_START)!;
const endNs = timestampNs(WINDOW_END)!;

function periodOf (value: unknown): Period {
  const timestamp = timestampNs(value);
  if (timestamp === null)
    return 'unknownTime';
  if (timestamp < startNs)
    return 'beforeWindow';
  return timestamp > endNs ? 'afterWindow' : 'inWindow';
}

function evidenceFor (record: CensusRecord): SourceCensus['evidence'] {
  if (!object(record.raw))
    return [];
  const result: SourceCensus['evidence'] = [];
  const add = (kind: string, field: string) => result.push({ line: record.line, period: record.period, kind, path: field });
  /(?:^|\.)fusion_[^.]+/u.test(record.type) && add('event-name', '$["type"]');
  const data = record.raw.data;
  if (!object(data))
    return result;
  object(data.fusion) && add('fusion-metadata', '$["data"]["fusion"]');
  for (const key of ['syntheticModel', 'syntheticModelId']) {
    if (data[key] === 'hydrafusion' || data[key] === 'hydrafusion-max')
      add('synthetic-selection', `$["data"][${JSON.stringify(key)}]`);
  }
  if (record.type === 'session.start' && (data.model === 'hydrafusion' || data.model === 'hydrafusion-max'))
    add('startup-synthetic-selection', '$["data"]["model"]');
  if ((record.type === 'session.start' || record.type === 'session.resume')
    && (data.selectedModel === 'hydrafusion' || data.selectedModel === 'hydrafusion-max'))
    add('recorded-synthetic-selection', '$["data"]["selectedModel"]');
  if (record.type === 'session.model_change' && (data.newModel === 'hydrafusion' || data.newModel === 'hydrafusion-max'))
    add('recorded-synthetic-selection', '$["data"]["newModel"]');
  return result;
}

interface Visit {
  value: unknown;
  path: string;
  key: string;
}

function walk (raw: unknown, visit: (item: Visit) => void) {
  const stack: Visit[] = [{ value: raw, path: '$', key: '' }];
  while (stack.length) {
    const item = stack.pop()!;
    visit(item);
    if (Array.isArray(item.value)) {
      for (let index = item.value.length - 1; index >= 0; index--)
        stack.push({ value: item.value[index], path: `${item.path}[]`, key: item.key });
    } else if (object(item.value)) {
      const entries = Object.entries(item.value);
      for (let index = entries.length - 1; index >= 0; index--) {
        const [key, value] = entries[index];
        stack.push({ value, path: `${item.path}[${JSON.stringify(key)}]`, key });
      }
    }
  }
}

const valueKeys = new Set([
  'type', 'kind', 'phaseKind', 'pattern', 'role', 'status', 'state', 'mode', 'scope', 'conversationScope', 'projectionMode',
  'model', 'modelId', 'selectedModel', 'syntheticModel', 'syntheticModelId', 'reasoningEffort', 'effort', 'decision',
  'action', 'finishReason', 'stopReason', 'policyVersion', 'enabled', 'strategy',
  'policy', 'outcome', 'turnKind', 'phaseRole', 'conditional', 'reason', 'toolName', 'provider', 'agentMode',
  'version', 'producer', 'producerVersion', 'cliVersion', 'sdkVersion', 'clientVersion', 'extensionVersion',
]);
const versionKeys = new Set(['version', 'producer', 'producerVersion', 'cliVersion', 'sdkVersion', 'clientVersion', 'extensionVersion']);

function valueKey (key: string) {
  return valueKeys.has(key) || /(?:Model|ModelId|Effort|Version|Mode|Kind|Role|Status|Policy|Pattern)$/u.test(key);
}

function enumValue (key: string, value: unknown): value is string | number | boolean {
  if (typeof value === 'boolean')
    return true;
  if (key === 'reason' && typeof value === 'string' && !/^[a-zA-Z0-9_.:-]+$/u.test(value))
    return false;
  return valueKey(key) && ((typeof value === 'number' && Number.isFinite(value))
    || (typeof value === 'string' && value.length <= 120 && !/[\r\n]/u.test(value)));
}

function inventory (records: CensusRecord[]): EventInventory[] {
  const groups = new Map<string, {
    period: Period; type: string; lines: number[];
    fields: Map<string, { field: FieldInventory; present: Set<number>; values: Map<string, FieldInventory['values'][number]> }>;
  }>();
  for (const record of records) {
    const groupKey = JSON.stringify([record.period, record.type]);
    let group = groups.get(groupKey);
    if (!group) {
      group = { period: record.period, type: record.type, lines: [], fields: new Map() };
      groups.set(groupKey, group);
    }
    group.lines.push(record.line);
    const fields = group.fields;
    walk(record.raw, ({ value, path: fieldPath, key }) => {
      let accumulator = fields.get(fieldPath);
      if (!accumulator) {
        accumulator = {
          field: {
            path: fieldPath, eventsPresent: 0, missingEvents: 0, occurrences: 0, types: {},
            zeroOccurrences: 0, emptyStringOccurrences: 0, emptyArrayOccurrences: 0, emptyObjectOccurrences: 0,
            lines: [], values: [], omittedValueOccurrences: 0,
          },
          present: new Set(), values: new Map(),
        };
        fields.set(fieldPath, accumulator);
      }
      const { field, present, values } = accumulator;
      const type = typeOf(value);
      field.occurrences++;
      field.types[type] = (field.types[type] ?? 0) + 1;
      value === 0 && field.zeroOccurrences++;
      value === '' && field.emptyStringOccurrences++;
      Array.isArray(value) && value.length === 0 && field.emptyArrayOccurrences++;
      object(value) && Object.keys(value).length === 0 && field.emptyObjectOccurrences++;
      present.add(record.line);
      if (enumValue(key, value)) {
        const valueKey = JSON.stringify(value);
        const existing = values.get(valueKey);
        if (existing) {
          existing.occurrences++;
          existing.lines.at(-1) !== record.line && existing.lines.push(record.line);
        } else if (values.size < 100) {
          values.set(valueKey, { value, occurrences: 1, lines: [record.line] });
        } else {
          field.omittedValueOccurrences++;
        }
      } else if (valueKey(key) && (typeof value === 'string' || typeof value === 'number')) {
        field.omittedValueOccurrences++;
      }
    });
  }
  return [...groups.values()].map(group => ({
    period: group.period, type: group.type, events: group.lines.length, lines: group.lines,
    fields: [...group.fields.values()].map(({ field, present, values }) => ({
      ...field,
      eventsPresent: present.size,
      missingEvents: group.lines.length - present.size,
      lines: [...present],
      types: Object.fromEntries(Object.entries(field.types).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
      values: [...values.values()],
    })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  })).sort((a, b) => {
    const left = JSON.stringify([a.period, a.type]);
    const right = JSON.stringify([b.period, b.type]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function semantics (records: CensusRecord[]): Semantics {
  const result: Semantics = {
    sequence: [], transitions: [], identities: [], identityGroups: [], scopes: [],
    parentLinks: [], versions: [], projections: [],
  };
  const envelopeIds = new Map<string, number[]>();
  const identityGroups = new Map<string, Semantics['identityGroups'][number]>();
  for (const record of records) {
    result.sequence.push({ line: record.line, type: record.type, period: record.period });
    if (object(record.raw) && typeof record.raw.id === 'string') {
      const lines = envelopeIds.get(record.raw.id) ?? [];
      lines.push(record.line);
      envelopeIds.set(record.raw.id, lines);
    }
    walk(record.raw, ({ value, path: fieldPath, key }) => {
      if (/^(?:id|.*Id|.*Ids)$/u.test(key) && typeof value === 'string') {
        result.identities.push({ line: record.line, period: record.period, path: fieldPath, key, value });
        const groupKey = JSON.stringify([key, value]);
        let group = identityGroups.get(groupKey);
        if (!group) {
          group = { key, value, lines: [], eventTypes: [], envelopeAgentIds: [] };
          identityGroups.set(groupKey, group);
        }
        !group.lines.includes(record.line) && group.lines.push(record.line);
        !group.eventTypes.includes(record.type) && group.eventTypes.push(record.type);
        if (object(record.raw) && typeof record.raw.agentId === 'string' && !group.envelopeAgentIds.includes(record.raw.agentId))
          group.envelopeAgentIds.push(record.raw.agentId);
      }
      if ((key === 'scope' || key === 'conversationScope' || key === 'scopeKind' || (key === 'kind' && fieldPath.includes('["scope"]')))
        && typeof value === 'string' && value.length <= 120 && !/[\r\n]/u.test(value))
        result.scopes.push({ line: record.line, period: record.period, path: fieldPath, value });
      if ((versionKeys.has(key) || /Version$/u.test(key))
        && ((typeof value === 'string' && value.length <= 120 && !/[\r\n]/u.test(value))
          || (typeof value === 'number' && Number.isFinite(value))))
        result.versions.push({ line: record.line, path: fieldPath, value });
      if (!object(value) || !Object.hasOwn(value, 'projectionMessage'))
        return;
      const projection = object(value.projectionMessage) ? value.projectionMessage.content : undefined;
      let equality: Semantics['projections'][number]['equality'] = 'not-comparable';
      if (typeof value.content === 'string' && typeof projection === 'string') {
        const normalize = (text: string) => text.replace(/\s/gu, '');
        equality = value.content === projection ? 'exact'
          : normalize(value.content) === normalize(projection) ? 'whitespace-only' : 'different';
      }
      result.projections.push({ line: record.line, path: `${fieldPath}["projectionMessage"]`, equality });
    });
  }
  result.identityGroups = [...identityGroups.values()];
  for (const record of records) {
    if (!object(record.raw) || typeof record.raw.parentId !== 'string')
      continue;
    const matchingLines = envelopeIds.get(record.raw.parentId) ?? [];
    result.parentLinks.push({
      line: record.line, path: '$["parentId"]', value: record.raw.parentId, matchingLines,
      status: matchingLines.length === 0 ? 'unresolved'
        : matchingLines.length > 1 ? 'ambiguous'
          : matchingLines[0] < record.line ? 'earlier' : matchingLines[0] === record.line ? 'self' : 'later',
    });
  }
  for (let index = 1; index < records.length; index++) {
    const previous = records[index - 1];
    const current = records[index];
    const fusionId = (record: CensusRecord) => object(record.raw) && object(record.raw.data)
      && typeof record.raw.data.fusionId === 'string' ? record.raw.data.fusionId : null;
    const leftId = fusionId(previous);
    const rightId = fusionId(current);
    result.transitions.push({
      fromLine: previous.line, toLine: current.line, fromType: previous.type, toType: current.type,
      sameFusionId: leftId === null || rightId === null ? null : leftId === rightId,
    });
  }
  return result;
}

function* sourceLines (input: Uint8Array) {
  let start = 0;
  for (let index = 0; index < input.length; index++) {
    if (input[index] !== 10)
      continue;
    yield input.subarray(start, index);
    start = index + 1;
  }
  if (start < input.length)
    yield input.subarray(start);
}

export function censusSource (input: Uint8Array): SourceCensus {
  const diagnostics: Diagnostic[] = [];
  const counts: SourceCensus['counts'] = { inWindow: 0, beforeWindow: 0, afterWindow: 0, unknownTime: 0, malformed: 0 };
  const records: CensusRecord[] = [];
  const evidence: SourceCensus['evidence'] = [];
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let line = 0;
  for (const encoded of sourceLines(input)) {
    line++;
    let value: string;
    try {
      value = decoder.decode(encoded);
    } catch (error) {
      if (!(error instanceof TypeError))
        throw error;
      diagnostics.push({ code: 'utf8', line, detail: 'Record is not valid UTF-8. Its event type and timestamp are unknown.' });
      counts.malformed++;
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(value);
    } catch (error) {
      if (!(error instanceof SyntaxError))
        throw error;
      diagnostics.push({ code: value.trim() ? 'json' : 'blank-line', line, detail: 'Record is not valid JSON.' });
      counts.malformed++;
      continue;
    }
    const type = object(raw) && typeof raw.type === 'string' && raw.type ? raw.type : '(invalid-event)';
    type === '(invalid-event)' && diagnostics.push({ code: 'event-type', line });
    const period = periodOf(object(raw) ? raw.timestamp : undefined);
    period === 'unknownTime' && diagnostics.push({ code: 'timestamp', line, detail: 'Missing, invalid or unsupported timestamp.' });
    counts[period]++;
    const record = { line, type, period, raw };
    records.push(record);
    evidence.push(...evidenceFor(record));
  }
  let selection: Selection = 'not-selected';
  if (evidence.some(item => item.period === 'inWindow'))
    selection = 'qualified';
  else if (evidence.some(item => item.period === 'unknownTime') || counts.malformed > 0
    || diagnostics.some(item => item.code === 'event-type'))
    selection = 'unknown-candidate';
  else if (evidence.length && counts.inWindow > 0)
    selection = 'context-candidate';
  else if (evidence.length && counts.unknownTime > 0)
    selection = 'unknown-candidate';
  const selected = selection !== 'not-selected';
  return {
    status: diagnostics.length ? 'partial' : 'complete', selection, counts, evidence, diagnostics,
    inventory: selected ? inventory(records) : [],
    semantics: semantics(selected ? records : []),
  };
}
