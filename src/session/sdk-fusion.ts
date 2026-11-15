import type { NoteNode } from '../types.ts';
import { isRecord } from './sdk-events.ts';
import { EventFields } from './sdk-event-fields.ts';

type FusionEventType =
  | 'session.fusion_resolved'
  | 'assistant.fusion_phase_completed'
  | 'assistant.fusion_phase_failed'
  | 'session.fusion_commit_started'
  | 'session.fusion_change_checkpoint'
  | 'session.fusion_completed'
  | 'session.fusion_handoff';

const usageLabels: ReadonlyArray<readonly [string, string]> = [
  ['requestCount', 'Request count'], ['inputTokens', 'Input tokens'], ['outputTokens', 'Output tokens'],
  ['cachedTokens', 'Cached tokens'], ['cacheWriteTokens', 'Cache write tokens'], ['totalNanoAiu', 'Total nano-AIU'],
];

/** Normalize the reviewed Fusion event families to readable notes, not raw event dumps. */
export function fusionNote (type: FusionEventType, data: Record<string, unknown>): { note: NoteNode; issues: string[] } {
  const issues: string[] = [];
  const fields = new EventFields(data, issues);
  const details: string[] = [];
  let title: string;
  const add = (label: string, value: string | number | boolean | null | undefined) => {
    value !== undefined && details.push(`${label}: ${value === null ? 'null' : value}`);
  };
  const strings = (reader: EventFields, labels: ReadonlyArray<readonly [string, string]>) => {
    for (const [key, label] of labels)
      add(label, reader.string(key));
  };
  const counters = (reader: EventFields) => {
    for (const [key, label] of usageLabels)
      add(label, reader.counter(key));
  };
  const duration = (reader: EventFields, key: string, label: string) => {
    const value = reader.counter(key);
    add(label, value === undefined ? undefined : `${value} ms`);
  };
  switch (type) {
    case 'session.fusion_resolved': {
      const model = fields.string('syntheticModel', false, true);
      const pattern = fields.string('pattern', false, true);
      title = `🧪 Fusion resolved${model ? `: ${model}` : ''}${pattern ? ` | pattern ${pattern}` : ''}`;
      const version = fields.counter('contractVersion');
      add('Contract version', version);
      if (version !== undefined && version !== 1)
        issues.push('Unsupported contractVersion. Expected version 1.');
      strings(fields, [
        ['fusionId', 'Fusion ID'], ['turnId', 'Turn ID'], ['policy', 'Policy'], ['policyVersion', 'Policy version'],
        ['routeSource', 'Route source'], ['planVersion', 'Plan version'], ['ruleId', 'Rule ID'],
        ['selectedRuleId', 'Selected rule ID'], ['hint', 'Hint'],
        ['primaryModel', 'Primary model'], ['fallbackModel', 'Fallback model'], ['followUpModel', 'Follow-up model'],
        ['judgeModel', 'Judge model'], ['repairModel', 'Repair model'],
      ]);
      add('Secondary model', fields.string('secondaryModel', true));
      duration(fields, 'routingLatencyMs', 'Routing latency');
      const plan = fields.list('phasePlan');
      if (plan) {
        const entries: string[] = [];
        for (const [index, item] of plan.entries()) {
          if (!isRecord(item)) {
            issues.push(`Expected phasePlan[${index}] object.`);
            continue;
          }
          const phase = new EventFields(item, issues, `phasePlan[${index}].`);
          const values: string[] = [];
          for (const key of ['kind', 'role', 'scope']) {
            const value = phase.string(key);
            value !== undefined && values.push(`${key}: ${value}`);
          }
          const conditional = phase.flag('conditional');
          conditional !== undefined && values.push(`conditional: ${conditional}`);
          entries.push(`- ${index + 1}. ${values.join(', ')}`);
          phase.finish();
        }
        add('Phase plan', entries.length ? `\n${entries.join('\n')}` : '[]');
      }
      const scores = fields.record('scores');
      if (scores) {
        const values: string[] = [];
        for (const key of ['reasoning', 'codeGen', 'debugging', 'toolUse']) {
          const value = scores.number(key);
          value !== undefined && values.push(`${key}: ${value}`);
        }
        values.length && add('Scores', values.join(', '));
        scores.finish();
      }
      break;
    }
    case 'assistant.fusion_phase_failed': {
      const phase = fields.string('phaseKind', false, true);
      title = `🧪 Fusion phase failed${phase ? `: ${phase}` : ''}`;
      add('Phase kind', phase);
      strings(fields, [
        ['fusionId', 'Fusion ID'], ['phaseId', 'Phase ID'], ['model', 'Model'], ['reasoningEffort', 'Reasoning effort'],
        ['role', 'Role'], ['conversationScope', 'Scope'], ['status', 'Status'], ['reason', 'Reason'],
        ['degradedToPhaseId', 'Degraded to phase'],
      ]);
      duration(fields, 'durationMs', 'Duration');
      const usage = fields.record('usage');
      if (usage) {
        add('Phase usage', 'Summary metadata (not billed calls)');
        counters(usage);
        usage.finish();
      }
      add('Error message', fields.string('errorMessage'));
      break;
    }
    case 'assistant.fusion_phase_completed': {
      const phase = fields.string('phaseKind', false, true);
      title = `🧪 Fusion phase${phase ? `: ${phase}` : ''}`;
      strings(fields, [
        ['fusionId', 'Fusion ID'], ['phaseId', 'Phase ID'], ['model', 'Model'], ['reasoningEffort', 'Reasoning effort'],
        ['role', 'Role'], ['conversationScope', 'Scope'], ['status', 'Status'], ['projectionMode', 'Projection mode'],
      ]);
      add('Verdict', fields.string('verdict', true));
      duration(fields, 'durationMs', 'Duration');
      const content = fields.string('content');
      const projection = fields.record('projectionMessage', true);
      const projectionText = projection?.string('content');
      add('Projection role', projection?.string('role'));
      data.projectionMessage === null && add('Projection message', null);
      content && add('Phase output', `\n${content}`);
      // Deduplication is confined to identical fields within this one event.
      projectionText && projectionText !== content && add('Projection', `\n${projectionText}`);
      projection?.finish();
      const usage = fields.record('usage');
      if (usage) {
        counters(usage);
        usage.finish();
      }
      break;
    }
    case 'session.fusion_commit_started':
      title = '🧪 Fusion commit started';
      strings(fields, [
        ['fusionId', 'Fusion ID'], ['commitId', 'Commit ID'], ['sourcePhaseId', 'Source phase'],
        ['sourceModel', 'Source model'], ['kind', 'Kind'],
      ]);
      add('Tool call ID', fields.string('toolCallId', true));
      break;
    case 'session.fusion_change_checkpoint': {
      title = '🧪 Fusion change checkpoint';
      const changes = fields.record('codeChanges', false, true);
      if (changes) {
        const files = changes.list('filesModified');
        if (files) {
          const names: string[] = [];
          for (const [index, file] of files.entries()) {
            if (typeof file === 'string')
              names.push(file);
            else
              issues.push(`Expected codeChanges.filesModified[${index}] string.`);
          }
          add('Files', names.length ? names.join(', ') : '[]');
        }
        add('Lines added', changes.counter('linesAdded'));
        add('Lines removed', changes.counter('linesRemoved'));
        changes.finish();
      }
      break;
    }
    case 'session.fusion_completed':
      title = '🧪 Fusion completed';
      strings(fields, [
        ['fusionId', 'Fusion ID'], ['commitId', 'Commit ID'], ['turnId', 'Turn ID'], ['syntheticModel', 'Synthetic model'],
        ['pattern', 'Pattern'], ['outcome', 'Outcome'], ['finalSourcePhaseId', 'Final source phase'],
        ['finalSourceModel', 'Final source model'], ['followUpModel', 'Follow-up model'],
      ]);
      add('Degraded reason', fields.string('degradedReason', true));
      add('Phase count', fields.counter('phaseCount'));
      counters(fields);
      duration(fields, 'durationMs', 'Duration');
      break;
    case 'session.fusion_handoff': {
      title = '🧪 Fusion handoff';
      strings(fields, [
        ['fusionId', 'Fusion ID'], ['sourcePhaseId', 'From phase'], ['targetPhaseId', 'To phase'], ['targetModel', 'Target model'],
      ]);
      const message = fields.record('message', false, true);
      add('Message role', message?.string('role'));
      const content = message?.string('content', false, true);
      content && add('Handoff message', `\n${content}`);
      message?.finish();
      break;
    }
  }
  fields.finish();
  return { note: { type: 'note', title, ...(details.length ? { text: details.join('\n\n') } : {}) }, issues };
}
