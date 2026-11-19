import type { NoteNode } from '../types.ts';
import { isRecord } from './sdk-events.ts';
import { EventFields } from './sdk-event-fields.ts';
import { modelCatalog } from './sdk-model-catalog.ts';

/** Keep recorded updates and delivery metadata as evidence, never as exporter instructions. */
export function eventNote (type: 'instruction.update' | 'instruction.update_delivery' | 'session.mode_notice_delivered' | 'model.turn_retry', data: Record<string, unknown>): { note: NoteNode; issues: string[] } {
  const issues: string[] = [];
  const fields = new EventFields(data, issues);
  const details: string[] = [];
  let title: string;
  if (type === 'instruction.update') {
    title = 'Instruction update';
    for (const [key, label] of [
      ['authority', 'Authority'], ['lifetime', 'Lifetime'], ['boundary', 'Boundary'], ['fallback', 'Fallback'], ['name', 'Name'],
    ] as const) {
      const value = fields.string(key);
      value !== undefined && details.push(`${label}: ${value}`);
    }
    const content = fields.string('content');
    content !== undefined && details.push(`Content:\n${content}`);
    const postInitial = fields.flag('postInitial');
    postInitial !== undefined && details.push(`Recorded after initial user message: ${postInitial}`);
  } else if (type === 'instruction.update_delivery') {
    title = 'Instruction update delivered';
    for (const [key, label] of [
      ['deliveryId', 'Delivery ID'], ['firstUpdateEventId', 'First update event ID'],
      ['latestUpdateEventId', 'Latest update event ID'], ['outcome', 'Outcome'],
      ['capability', 'Capability'], ['reason', 'Reason'],
    ] as const) {
      const value = fields.string(key);
      value !== undefined && details.push(`${label}: ${value}`);
    }
    for (const [key, label] of [['updateCount', 'Update count'], ['requestGeneration', 'Request generation']] as const) {
      const value = fields.counter(key);
      value !== undefined && details.push(`${label}: ${value}`);
    }
  } else if (type === 'session.mode_notice_delivered') {
    title = 'Mode notice delivered';
    const mode = fields.string('mode');
    mode !== undefined && details.push(`Mode: ${mode}`);
    const persisted = fields.flag('instructionUpdatePersisted');
    persisted !== undefined && details.push(`Instruction update persisted: ${persisted}`);
  } else {
    title = 'Model turn retry';
    for (const [key, label] of [['kind', 'Kind'], ['model', 'Requested model'], ['reason', 'Reason']] as const) {
      const value = fields.string(key);
      value !== undefined && details.push(`${label}: ${value}`);
    }
    for (const [key, label] of [['turn', 'Local model-loop turn index'], ['timestampMs', 'Recorded timestamp (ms)']] as const) {
      const value = fields.number(key);
      value !== undefined && details.push(`${label}: ${value}`);
    }
    const catalog = fields.record('modelInfo');
    if (catalog) {
      const lines = modelCatalog(catalog);
      details.push(`Model catalog:\n${lines.join('\n\n')}`);
    }
  }
  fields.finish();
  return { note: { type: 'note', title, ...(details.length ? { text: details.join('\n\n') } : {}) }, issues };
}

/** Render transport telemetry as a reviewed diagnostic while keeping its open nested payload visible. */
export function modelTelemetryNote (data: Record<string, unknown>): { note: NoteNode; issues: string[] } {
  const issues: string[] = [];
  const fields = new EventFields(data, issues);
  const kind = fields.string('kind', false, true);
  const telemetry = fields.record('telemetry', false, true);
  fields.finish();
  if (kind !== undefined && kind !== 'telemetry')
    issues.push(`Expected kind telemetry.`);
  const event = telemetry?.string('event');
  const properties = isRecord(data.telemetry) && isRecord(data.telemetry.properties) ? data.telemetry.properties : {};
  const metrics = isRecord(data.telemetry) && isRecord(data.telemetry.metrics) ? data.telemetry.metrics : {};
  telemetry?.record('properties');
  telemetry?.record('metrics');
  telemetry?.record('restrictedProperties');
  telemetry?.finish();
  const safeString = (record: Record<string, unknown>, key: string) => typeof record[key] === 'string' ? record[key] : undefined;
  const safeNumber = (record: Record<string, unknown>, key: string) => typeof record[key] === 'number' && Number.isFinite(record[key]) && record[key] >= 0
    ? record[key] : undefined;
  const model = safeString(properties, 'model');
  const outcome = safeString(properties, 'outcome');
  const disposition = safeString(properties, 'disposition');
  const durationMs = safeNumber(metrics, 'duration_ms');
  const frames = safeNumber(metrics, 'frames_received');
  const bytes = safeNumber(metrics, 'bytes_received');
  const outputTokens = safeNumber(metrics, 'output_tokens');
  const summary = [
    event ? `Event: ${event}` : '',
    model ? `Model: ${model}` : '',
    outcome ? `Outcome: ${outcome}` : '',
    disposition ? `Disposition: ${disposition}` : '',
    durationMs !== undefined ? `Duration: ${durationMs} ms` : '',
    frames !== undefined ? `Frames received: ${frames}` : '',
    bytes !== undefined ? `Bytes received: ${bytes}` : '',
    outputTokens !== undefined ? `Output tokens: ${outputTokens}` : '',
  ].filter(Boolean).join('\n\n');
  const label = [model, outcome].filter(Boolean).join(' · ');
  return {
    note: { type: 'note', title: `📡 Model telemetry${label ? `: ${label}` : ''}`, ...(summary ? { text: summary } : {}) },
    issues,
  };
}
