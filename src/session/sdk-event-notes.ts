import type { NoteNode } from '../types.ts';
import { EventFields } from './sdk-event-fields.ts';
import { modelCatalog } from './sdk-model-catalog.ts';

/** Keep recorded updates and delivery metadata as evidence, never as exporter instructions. */
export function eventNote (type: 'instruction.update' | 'session.mode_notice_delivered' | 'model.turn_retry', data: Record<string, unknown>): { note: NoteNode; issues: string[] } {
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
