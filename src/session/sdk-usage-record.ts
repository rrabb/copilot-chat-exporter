import { isDeepStrictEqual } from 'node:util';
import type { UsageCall, UsageFusionAttribution } from '../types.ts';
import { isRecord } from './sdk-events.ts';
import type { SdkEvent } from './sdk-events.ts';
import { USAGE_METRICS } from './usage-figures.ts';

const STRING_TELEMETRY = [
  'modelDisplayName', 'responseModel', 'cacheExpiresAt', 'initiator', 'interactionType', 'transport', 'requestBodyEncoding',
  'apiCallId', 'providerCallId', 'serviceRequestId', 'apiEndpoint', 'reasoningSummary', 'frontierSource', 'finishReason',
  'websocketFallbackErrorKind', 'websocketFallbackReason',
];
const NUMBER_TELEMETRY = [
  'cost', 'timeToFirstTokenMs', 'outputTtftMs', 'interTokenLatencyMs', 'maxPromptTokens', 'maxOutputTokens',
  'requestBodyBytes', 'requestBodyWireBytes', 'availableToolCount', 'toolTokenCount', 'customToolCallCount',
  'unmatchedToolResultCount', 'orphanToolCallCount', 'cacheTtlSeconds', 'cachePolicyTtlSeconds', 'numToolCalls', 'thinkingDroppedBlocks',
  'websocketFallbackAfterMs', 'websocketFallbackStatusCode',
];
const BOOLEAN_TELEMETRY = [
  'isByok', 'isAuto', 'rte', 'inferenceGateway', 'cacheDetailsReported', 'contentFilterTriggered',
  'websocketFallbackReconnectAttempted', 'websocketFallbackStartedThisCall',
];
const FUSION_FIELDS = ['fusionId', 'syntheticModel', 'policy', 'pattern', 'phaseId', 'phaseKind', 'role', 'conversationScope', 'sourceModel'] as const;
const FIELDS = new Set([
  'accounting', 'model', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens',
  'duration', 'copilotUsage', 'reasoningEffort', 'fusion', 'parentToolCallId', 'provider', 'aiCreditsStatus',
  'toolCounts', 'thinkingDroppedReasons', ...STRING_TELEMETRY, ...NUMBER_TELEMETRY, ...BOOLEAN_TELEMETRY,
]);

export interface UsageRecords {
  calls: UsageCall[];
  diagnostics: Map<SdkEvent, string[]>;
  records: number;
  duplicates: number;
  conflicts: number;
}

function unknownFields (record: Record<string, unknown>, known: ReadonlySet<string>, path: string, issues: string[]): void {
  for (const key of Object.keys(record))
    !known.has(key) && issues.push(`${path}.${key}: unknown field`);
}

function counter (value: unknown, path: string, issues: string[]): number | null {
  if (value === undefined)
    return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    issues.push(`${path}: expected a finite nonnegative number`);
    return null;
  }
  return value;
}

function stringField (value: unknown, path: string, issues: string[]): string | undefined {
  if (value === undefined)
    return undefined;
  if (typeof value !== 'string') {
    issues.push(`${path}: expected a string`);
    return undefined;
  }
  return value;
}

function normalize (event: SdkEvent, issues: string[]): UsageCall | null {
  unknownFields(event.data, new Set(['usage']), 'data', issues);
  if (!isRecord(event.data.usage)) {
    issues.push('data.usage: expected an object');
    return null;
  }
  const data = event.data.usage;
  unknownFields(data, FIELDS, 'usage', issues);
  const accounting = isRecord(data.accounting) ? data.accounting : {};
  !isRecord(data.accounting) && issues.push('usage.accounting: expected an accounting identity');
  unknownFields(accounting, new Set(['usageId', 'sourceSessionId', 'sequence']), 'usage.accounting', issues);
  const usageId = stringField(accounting.usageId, 'usage.accounting.usageId', issues);
  const sourceSessionId = stringField(accounting.sourceSessionId, 'usage.accounting.sourceSessionId', issues);
  const sequence = counter(accounting.sequence, 'usage.accounting.sequence', issues);
  const identityValid = !!usageId && !!sourceSessionId && sequence !== null && Number.isSafeInteger(sequence);
  !identityValid && issues.push('usage.accounting: nonempty usageId/sourceSessionId and a nonnegative integer sequence are required');
  const model = stringField(data.model, 'usage.model', issues);
  !model && issues.push('usage.model: a nonempty model is required');
  const at = Date.parse(event.timestamp ?? '');
  !Number.isFinite(at) && issues.push('usage timestamp: missing or invalid');
  const provenance: NonNullable<UsageCall['provenance']> = {
    source: 'usage-record', durationEvidence: 'sdk-milliseconds-inferred-wrapper',
    ...(identityValid ? { accounting: { usageId: usageId!, sourceSessionId: sourceSessionId!, sequence } } : {}),
  };
  if (data.reasoningEffort === null)
    provenance.reasoningEffort = null;
  else {
    const effort = stringField(data.reasoningEffort, 'usage.reasoningEffort', issues);
    effort !== undefined && (provenance.reasoningEffort = effort);
  }
  const parent = stringField(data.parentToolCallId, 'usage.parentToolCallId', issues);
  parent !== undefined && (provenance.parentToolCallId = parent);
  if (data.fusion !== undefined) {
    if (!isRecord(data.fusion)) {
      issues.push('usage.fusion: expected an object');
    } else {
      unknownFields(data.fusion, new Set(FUSION_FIELDS), 'usage.fusion', issues);
      const fusion: UsageFusionAttribution = {};
      for (const key of FUSION_FIELDS) {
        const value = stringField(data.fusion[key], `usage.fusion.${key}`, issues);
        value !== undefined && (fusion[key] = value);
      }
      provenance.fusion = fusion;
    }
  }
  const telemetry: NonNullable<typeof provenance.telemetry> = [];
  for (const key of STRING_TELEMETRY) {
    const value = stringField(data[key], `usage.${key}`, issues);
    value !== undefined && telemetry.push({ field: key, value });
  }
  for (const key of NUMBER_TELEMETRY) {
    const value = counter(data[key], `usage.${key}`, issues);
    value !== null && telemetry.push({ field: key, value });
  }
  for (const key of BOOLEAN_TELEMETRY) {
    if (data[key] === undefined)
      continue;
    if (typeof data[key] === 'boolean')
      telemetry.push({ field: key, value: data[key] });
    else
      issues.push(`usage.${key}: expected a boolean`);
  }
  for (const [key, names] of [['provider', ['id', 'kind', 'label']]] as const) {
    const value = data[key];
    if (value === undefined)
      continue;
    if (!isRecord(value)) {
      issues.push(`usage.${key}: expected an object`);
      continue;
    }
    unknownFields(value, new Set(names), `usage.${key}`, issues);
    for (const name of names) {
      const field = stringField(value[name], `usage.${key}.${name}`, issues);
      field !== undefined && telemetry.push({ field: `${key}.${name}`, value: field });
    }
  }
  if (data.toolCounts !== undefined) {
    if (!isRecord(data.toolCounts))
      issues.push('usage.toolCounts: expected an object');
    else
      for (const [key, value] of Object.entries(data.toolCounts)) {
        const count = counter(value, `usage.toolCounts.${key}`, issues);
        count !== null && telemetry.push({ field: `toolCounts.${key}`, value: count });
      }
  }
  if (data.thinkingDroppedReasons !== undefined) {
    if (Array.isArray(data.thinkingDroppedReasons) && data.thinkingDroppedReasons.every((reason): reason is string => typeof reason === 'string'))
      telemetry.push({ field: 'thinkingDroppedReasons', value: data.thinkingDroppedReasons });
    else
      issues.push('usage.thinkingDroppedReasons: expected an array of strings');
  }
  let nanoAiu: number | null = null;
  if (data.copilotUsage !== undefined) {
    if (!isRecord(data.copilotUsage)) {
      issues.push('usage.copilotUsage: expected an object');
    } else {
      const billing = data.copilotUsage;
      unknownFields(billing, new Set(['model', 'totalNanoAiu', 'tokenDetails']), 'usage.copilotUsage', issues);
      billing.totalNanoAiu === undefined && issues.push('usage.copilotUsage.totalNanoAiu: missing amount');
      nanoAiu = counter(billing.totalNanoAiu, 'usage.copilotUsage.totalNanoAiu', issues);
      const billingModel = stringField(billing.model, 'usage.copilotUsage.model', issues);
      billingModel !== undefined && telemetry.push({ field: 'copilotUsage.model', value: billingModel });
      if (billing.tokenDetails !== undefined) {
        if (!Array.isArray(billing.tokenDetails))
          issues.push('usage.copilotUsage.tokenDetails: expected an array');
        else
          for (const [index, detail] of billing.tokenDetails.entries()) {
            const path = `copilotUsage.tokenDetails[${index}]`;
            if (!isRecord(detail)) {
              issues.push(`usage.${path}: expected an object`);
              continue;
            }
            unknownFields(detail, new Set(['batchSize', 'costPerBatch', 'tokenCount', 'tokenType', 'model']), `usage.${path}`, issues);
            for (const key of ['batchSize', 'costPerBatch', 'tokenCount', 'tokenType'])
              detail[key] === undefined && issues.push(`usage.${path}.${key}: missing required field`);
            for (const key of ['batchSize', 'costPerBatch', 'tokenCount']) {
              const value = counter(detail[key], `usage.${path}.${key}`, issues);
              value !== null && telemetry.push({ field: `${path}.${key}`, value });
            }
            for (const key of ['tokenType', 'model']) {
              const value = stringField(detail[key], `usage.${path}.${key}`, issues);
              value !== undefined && telemetry.push({ field: `${path}.${key}`, value });
            }
          }
      }
    }
  }
  if (data.aiCreditsStatus !== undefined) {
    if (data.aiCreditsStatus === 'complete' || data.aiCreditsStatus === 'partial' || data.aiCreditsStatus === 'unavailable')
      provenance.billingStatus = data.aiCreditsStatus;
    else
      issues.push('usage.aiCreditsStatus: unsupported billing status');
    if (data.aiCreditsStatus !== 'complete') {
      nanoAiu !== null && (provenance.reportedNanoAiu = nanoAiu);
      nanoAiu = null;
    }
  }
  const call: UsageCall = {
    at: Number.isFinite(at) ? at : null, agentId: event.agentId ?? null, model: model || null,
    inputTokens: counter(data.inputTokens, 'usage.inputTokens', issues),
    outputTokens: counter(data.outputTokens, 'usage.outputTokens', issues),
    cacheReadTokens: counter(data.cacheReadTokens, 'usage.cacheReadTokens', issues),
    cacheWriteTokens: counter(data.cacheWriteTokens, 'usage.cacheWriteTokens', issues),
    reasoningTokens: counter(data.reasoningTokens, 'usage.reasoningTokens', issues),
    durationMs: counter(data.duration, 'usage.duration', issues), nanoAiu, provenance,
  };
  telemetry.length && (provenance.telemetry = telemetry);
  issues.length && (provenance.issues = issues);
  return identityValid ? call : null;
}

/** Normalize one log in stream order. Only the recorded accounting identity deduplicates calls. */
export function parseUsageRecords (events: readonly SdkEvent[]): UsageRecords {
  const result: UsageRecords = { calls: [], diagnostics: new Map(), records: 0, duplicates: 0, conflicts: 0 };
  const identities = new Map<string, { event: SdkEvent; call: UsageCall }>();
  for (const event of events) {
    if (event.type !== 'session.usage_record')
      continue;
    result.records++;
    const issues: string[] = [];
    const call = normalize(event, issues);
    issues.length && result.diagnostics.set(event, issues);
    const identity = call?.provenance?.accounting;
    if (!call || !identity)
      continue;
    const key = JSON.stringify([identity.sourceSessionId, identity.usageId]);
    const previous = identities.get(key);
    if (!previous) {
      identities.set(key, { event, call });
      result.calls.push(call);
      continue;
    }
    if (previous.event.agentId === event.agentId && isDeepStrictEqual(previous.event.data.usage, event.data.usage)) {
      result.duplicates++;
      continue;
    }
    result.conflicts++;
    issues.push('usage.accounting: conflicting repeated identity; financial counters are unknown');
    result.diagnostics.set(event, issues);
    const originalIssues = result.diagnostics.get(previous.event) ?? [];
    originalIssues.push(issues.at(-1)!);
    result.diagnostics.set(previous.event, originalIssues);
    for (const metric of USAGE_METRICS)
      previous.call[metric] = null;
    if (previous.call.provenance) {
      previous.call.provenance.conflicted = true;
      previous.call.provenance.issues = [...(previous.call.provenance.issues ?? []), issues.at(-1)!];
      if (previous.call.provenance.accounting && previous.call.provenance.accounting.sequence !== identity.sequence)
        previous.call.provenance.accounting.sequence = null;
    }
    previous.call.agentId !== call.agentId && (previous.call.agentId = null);
    previous.call.model !== call.model && (previous.call.model = null);
  }
  return result;
}
