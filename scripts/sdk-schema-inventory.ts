import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { diagnosticFieldOccurrences } from '../src/verify/diagnostic-evidence.ts';

interface FieldCount {
  presentLines: Set<number>;
  occurrences: number;
  types: Map<string, number>;
}

interface EventCount {
  events: number;
  lines: number[];
  fields: Map<string, FieldCount>;
}

export interface SdkSchemaInventory {
  format: 1;
  sourceHash: string;
  sourceBytes: number;
  valuesIncluded: false;
  bodyIncluded: false;
  eventTypes: Array<{
    type: string;
    events: number;
    lines: number[];
    fields: Array<{
      path: string;
      present: number;
      missing: number;
      occurrences: number;
      types: Record<string, number>;
    }>;
  }>;
}

export function inventorySdkSchema (bytes: Uint8Array, eventTypes?: ReadonlySet<string>): SdkSchemaInventory {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const groups = new Map<string, EventCount>();
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (!line.trim())
      continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error(`SDK event line ${index + 1} is not valid JSON.`);
    }
    if (event === null || typeof event !== 'object' || Array.isArray(event))
      throw new Error(`SDK event line ${index + 1} is not an object.`);
    if (typeof Reflect.get(event, 'type') !== 'string')
      throw new Error(`SDK event line ${index + 1} has no string type.`);
    if (eventTypes?.has(Reflect.get(event, 'type')) === false)
      continue;
    const record = event as Record<string, unknown>;
    const type = record.type as string;
    if (record.data === null || typeof record.data !== 'object' || Array.isArray(record.data))
      throw new Error(`SDK event line ${index + 1} has no object data payload.`);
    let group = groups.get(type);
    if (!group) {
      group = { events: 0, lines: [], fields: new Map() };
      groups.set(type, group);
    }
    group.events += 1;
    group.lines.push(index + 1);
    for (const occurrence of diagnosticFieldOccurrences(record.data, 'data')) {
      let count = group.fields.get(occurrence.path);
      if (!count) {
        count = { presentLines: new Set(), occurrences: 0, types: new Map() };
        group.fields.set(occurrence.path, count);
      }
      count.presentLines.add(index + 1);
      count.occurrences += 1;
      count.types.set(occurrence.type, (count.types.get(occurrence.type) ?? 0) + 1);
    }
  }
  const normalized = [...groups].map(([type, group]) => ({
    type,
    events: group.events,
    lines: group.lines,
    fields: [...group.fields].map(([field, count]) => ({
      path: field,
      present: count.presentLines.size,
      missing: group.events - count.presentLines.size,
      occurrences: count.occurrences,
      types: Object.fromEntries([...count.types].sort(([left], [right]) => left.localeCompare(right))),
    })).sort((left, right) => left.path.localeCompare(right.path)),
  })).sort((left, right) => left.type.localeCompare(right.type));
  return {
    format: 1,
    sourceHash: createHash('sha256').update(bytes).digest('hex'),
    sourceBytes: bytes.length,
    valuesIncluded: false,
    bodyIncluded: false,
    eventTypes: normalized,
  };
}

const help = [
  'Private SDK field inventory. Source files are read-only.',
  '',
  'Usage: node scripts\\sdk-schema-inventory.ts --events-file <events.jsonl> --output <new.json> [--event-type <type> ...]',
  '',
  'The report keeps event types, field paths, value types, counts and line numbers.',
  'It does not copy strings, numbers, booleans, prompt bodies or model output.',
  'Reports are private because field names and line counts can still describe a chat.',
].join('\n');

export async function main (args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      'events-file': { type: 'string' },
      output: { type: 'string' },
      'event-type': { type: 'string', multiple: true },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(help);
    return 0;
  }
  if (!values['events-file']?.trim() || !values.output?.trim())
    throw new Error('Supply --events-file and --output.');
  const bytes = await fs.readFile(values['events-file']);
  const selected = values['event-type']?.length ? new Set(values['event-type']) : undefined;
  const report = inventorySdkSchema(bytes, selected);
  const output = path.resolve(values.output);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({
    output,
    sourceHash: report.sourceHash,
    eventTypes: report.eventTypes.map((item) => ({ type: item.type, events: item.events, fields: item.fields.length })),
  }));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`SDK schema inventory failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
