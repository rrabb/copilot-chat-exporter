import type { Census, ParsedSession, QuestionRecord, Turn } from '../types.ts';
import { flattenItems, requestValues } from '../session/journal.ts';
import { fusionNote } from '../session/sdk-fusion.ts';
import type { FusionEventType } from '../session/sdk-fusion.ts';
import { eventNote, modelTelemetryNote } from '../session/sdk-event-notes.ts';
import { parseUsageRecords } from '../session/sdk-usage-record.ts';
import { splitSdkSchemaDrift } from '../session/sdk-schema.ts';
import type { SdkEvent } from '../session/sdk-events.ts';
import { isRecord } from '../session/sdk-events.ts';
import {
  sdkSchemaDiagnosticRecords,
} from './diagnostic-evidence.ts';
import type { SchemaDiagnosticRecord, SdkSchemaDiagnosticSelection } from './diagnostic-evidence.ts';

export function localDiagnosticSchemaRecords (
  rawRequests: readonly unknown[],
  census: Census,
): SchemaDiagnosticRecord[] {
  const unhandled = new Set(census.unhandled.map(([kind]) => kind));
  const unrecognized = new Set(census.unrecognizedToolData.map(([kind]) => kind));
  const records: SchemaDiagnosticRecord[] = [];
  for (const [requestIndex, request] of rawRequests.entries()) {
    if (!isRecord(request))
      continue;
    let responseIndex = 0;
    for (const item of requestValues(request.response))
      for (const leaf of flattenItems(item)) {
        responseIndex += 1;
        if (!isRecord(leaf))
          continue;
        const kind = typeof leaf.kind === 'string' ? leaf.kind : '';
        const locator = `request ${requestIndex + 1} response ${responseIndex}`;
        if (unhandled.has(kind))
          records.push({
            provider: 'local',
            type: kind,
            line: requestIndex + 1,
            locator,
            issues: ['unreviewed Local response kind'],
            value: leaf,
          });
        const toolData = isRecord(leaf.toolSpecificData) ? leaf.toolSpecificData : null;
        const payloadKind = typeof toolData?.kind === 'string' ? toolData.kind : '';
        if (payloadKind && unrecognized.has(payloadKind))
          records.push({
            provider: 'local',
            type: `tool-data:${payloadKind}`,
            line: requestIndex + 1,
            locator,
            issues: [`unreviewed toolSpecificData kind ${payloadKind}`],
            value: leaf,
          });
      }
  }
  return records;
}

const FUSION_TYPES: ReadonlySet<string> = new Set([
  'session.fusion_resolved',
  'assistant.fusion_phase_completed',
  'assistant.fusion_phase_failed',
  'session.fusion_commit_started',
  'session.fusion_change_checkpoint',
  'session.fusion_completed',
  'session.fusion_handoff',
]);

function isFusionEventType (type: string): type is FusionEventType {
  return FUSION_TYPES.has(type);
}

function unsupportedIssues (event: SdkEvent, usageIssues: ReadonlyMap<SdkEvent, string[]>): string[] {
  const usage = usageIssues.get(event);
  if (usage?.length)
    return [...usage];
  if (isFusionEventType(event.type))
    return fusionNote(event.type, event.data).issues;
  switch (event.type) {
    case 'instruction.update':
    case 'instruction.update_delivery':
    case 'session.mode_notice_delivered':
    case 'model.turn_retry':
      return eventNote(event.type, event.data).issues;
    case 'model.telemetry':
      return modelTelemetryNote(event.data).issues;
    case 'session.shutdown':
    case 'session.usage_checkpoint': {
      const total = event.data.totalNanoAiu;
      return typeof total === 'number' && Number.isFinite(total) && total >= 0
        ? []
        : [`${event.type} totalNanoAiu must be a finite nonnegative number`];
    }
    default:
      return [];
  }
}

export function sdkDiagnosticSchemaRecords (
  events: readonly SdkEvent[],
  census: Census,
): SchemaDiagnosticRecord[] {
  const drift = splitSdkSchemaDrift(census.unhandled);
  const unhandled = new Set(drift.unhandledEvents.map(([type]) => type));
  const unsupported = new Set(drift.unsupportedPayloads.map(([type]) => type));
  const usage = parseUsageRecords(events).diagnostics;
  const selections: SdkSchemaDiagnosticSelection[] = [];
  for (const event of events) {
    if (unhandled.has(event.type)) {
      selections.push({ event, issues: ['unreviewed SDK event type'] });
      continue;
    }
    if (!unsupported.has(event.type))
      continue;
    const issues = unsupportedIssues(event, usage);
    selections.push({
      event,
      issues: issues.length ? issues : ['reviewed SDK event type has an unsupported payload variant'],
    });
  }
  return sdkSchemaDiagnosticRecords(events, selections);
}

function questionDiagnostic (question: QuestionRecord | undefined, turn: number, provider: 'local' | 'sdk'): SchemaDiagnosticRecord[] {
  if (!question || (question.source !== 'guessed' && !question.parseWarning))
    return [];
  const issue = question.parseWarning ?? `question tool ${question.toolName ?? 'unknown'} was guessed`;
  return [{
    provider,
    type: `question:${question.source}:${question.toolName ?? 'known'}`,
    line: turn,
    locator: `turn ${turn} question`,
    issues: [issue],
    value: {
      source: question.source,
      toolName: question.toolName,
      question: question.raw.question,
      answer: question.raw.answer,
      parseWarning: question.parseWarning,
    },
  }];
}

function questionRecordsForTurns (turns: readonly Turn[], provider: 'local' | 'sdk'): SchemaDiagnosticRecord[] {
  const records: SchemaDiagnosticRecord[] = [];
  for (const turn of turns) {
    for (const node of turn.body) {
      if (node.type === 'tool' || node.type === 'note')
        records.push(...questionDiagnostic(node.question, turn.number, provider));
      if (node.type === 'tool' && node.subagent)
        records.push(...questionRecordsForTurns(node.subagent.turns, provider));
    }
  }
  return records;
}

export function questionDiagnosticSchemaRecords (
  session: ParsedSession,
  provider: 'local' | 'sdk',
): SchemaDiagnosticRecord[] {
  return questionRecordsForTurns(session.turns, provider);
}
