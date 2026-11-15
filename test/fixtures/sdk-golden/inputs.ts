import type { SdkEvent } from '../../../src/session/sdk-events.ts';
import type { UsageCall } from '../../../src/types.ts';

export const DELEGATED_PROMPT = 'Review the invented patch.\nKeep this complete delegated input.\nReport both findings and limits.';
export const REPEATED_TEXT = 'Source-distinct repeated golden evidence.';
export const LINE_ONLY_TEXT = Array.from({ length: 302 }, (_unused, index) => `Short golden line ${index + 1}.`).join('\n');
export const BYTE_ONLY_TEXT = 'Invented byte boundary evidence. '.repeat(600);
export const SPILLED_TEXT = Array.from({ length: 302 }, (_unused, index) =>
  `Spilled golden line ${index + 1}: ${'complete invented evidence '.repeat(3)}authorization: bearer synthetic-golden-secret`).join('\n');

function recorder (): (type: string, data: Record<string, unknown>, agentId?: string) => SdkEvent {
  let sequence = 0;
  return (type, data, agentId) => {
    sequence += 1;
    const timestamp = new Date(Date.parse('2026-11-01T12:00:00.000Z') + sequence * 1000).toISOString();
    const id = `golden-event-${sequence}`;
    const raw = { type, data, timestamp, id, ...(agentId ? { agentId } : {}) };
    return { ...raw, raw, recordedLine: JSON.stringify(raw), line: sequence };
  };
}

export function catalog (): Record<string, unknown> {
  return {
    id: 'golden-catalog-model', name: 'Invented catalog', object: 'invented-object', vendor: 'invented-vendor',
    version: 'invented-catalog-version', modelProviderId: 'invented-provider', modelProviderOrdering: 7,
    provider: { id: 'invented-provider-id', kind: 'invented-provider-kind', label: 'Invented provider label' },
    is_chat_default: false, is_chat_fallback: true, model_picker_category: 'invented-category',
    model_picker_enabled: true, model_picker_price_category: 'invented-price-category', preview: false,
    supported_endpoints: ['invented-endpoint-one', 'invented-endpoint-two'],
    capabilities: {
      family: 'invented-family', object: 'invented-capability', tokenizer: 'invented-tokenizer', type: 'invented-type',
      limits: { max_context_window_tokens: 64000, max_output_tokens: 3000, max_prompt_tokens: 60000,
        vision: { max_prompt_image_size: 2000, max_prompt_images: 3, supported_media_types: ['image/invented', 'image/future'] } },
      supports: { parallel_tool_calls: true, streaming: true, structured_outputs: false, tool_calls: true,
        vision: false, reasoning_effort: ['invented-effort', 'future-effort'], adaptive_thinking: 'invented-adaptive' },
    },
    billing: { auto_discount: 0.25, restricted_to: ['invented-plan', 'future-plan'],
      token_prices: { batch_size: 10000,
        default: { cache_read_price: 2, cache_write_price: 3, input_price: 900000000, max_prompt_tokens: 16000, output_price: 5 },
        long_context: { cache_read_price: 6, cache_write_price: 7, input_price: 8, max_prompt_tokens: 32000, output_price: 9 } } },
  };
}

export function instruction (content: string): Record<string, unknown> {
  return { content, authority: 'invented-authority', lifetime: 'invented-lifetime', boundary: 'invented-boundary',
    fallback: 'invented-fallback', name: 'invented-instruction' };
}

function summary (): Record<string, unknown> {
  return { requestCount: 900, inputTokens: 901, outputTokens: 902, cachedTokens: 903, cacheWriteTokens: 904, totalNanoAiu: 905000000 };
}

function phaseModel (kind: string): string {
  if (kind === 'critic' || kind === 'judge')
    return 'invented-review-model';
  return kind === 'repair' ? 'invented-repair-model' : 'invented-primary-model';
}

function phase (fusionId: string, kind: string, content: string, verdict: string | null = null): Record<string, unknown> {
  const review = kind === 'critic' || kind === 'judge';
  return { fusionId, phaseId: `${fusionId}:${kind}`, phaseKind: kind, model: phaseModel(kind),
    reasoningEffort: 'invented-effort', role: review ? kind : 'solver', conversationScope: review ? 'review' : 'root',
    status: 'succeeded', projectionMode: review ? 'none' : 'staged', verdict, durationMs: 12,
    content, projectionMessage: review ? null : { role: 'assistant', content }, usage: summary() };
}

function resolution (fusionId: string, pattern: string, kinds: string[]): Record<string, unknown> {
  return { fusionId, turnId: `${fusionId}:turn`, syntheticModel: 'invented-fusion', pattern, contractVersion: 1,
    policy: 'invented-policy', policyVersion: 'invented-policy-version', planVersion: 'invented-plan-version',
    routeSource: 'invented-route', ruleId: `${fusionId}:rule`, primaryModel: 'invented-primary-model',
    secondaryModel: pattern === 'single' ? null : 'invented-review-model',
    fallbackModel: pattern === 'critique' ? 'invented-primary-model' : 'invented-fallback-model', followUpModel: 'invented-primary-model',
    ...(pattern === 'cascade' ? { judgeModel: 'invented-review-model', repairModel: 'invented-repair-model' } : {}), routingLatencyMs: 17,
    hint: 'Invented routing hint.', scores: { reasoning: 1, codeGen: 2, debugging: 3, toolUse: 4 },
    phasePlan: kinds.map(kind => ({ kind, role: kind === 'critic' || kind === 'judge' ? kind : 'solver',
      scope: kind === 'critic' || kind === 'judge' ? 'review' : 'root', conditional: kind === 'repair' || kind === 'revision' })) };
}

/** Five reviewed successful topologies in physical order. Prompts, values and text are invented. */
export function coreEvents (): SdkEvent[] {
  const add = recorder();
  const events = [add('session.start', { producer: 'synthetic', copilotVersion: 'invented-core-build' })];
  const workflows = [
    { id: 'core-draft', pattern: 'critique', completed: ['draft', 'critic'], final: 'draft' },
    { id: 'core-revision', pattern: 'critique', completed: ['draft', 'critic', 'revision'], final: 'revision' },
    { id: 'core-single', pattern: 'single', completed: ['primary'], final: 'primary' },
    { id: 'core-accept', pattern: 'cascade', completed: ['primary', 'judge'], final: 'primary' },
    { id: 'core-reject', pattern: 'cascade', completed: ['primary', 'judge', 'repair'], final: 'repair' },
  ];
  for (const flow of workflows) {
    events.push(add('user.message', { content: `Review invented workflow ${flow.id}.` }));
    const plan = flow.pattern === 'critique' ? ['draft', 'critic', 'revision']
      : flow.pattern === 'cascade' ? ['primary', 'judge', 'repair'] : ['primary'];
    events.push(add('session.fusion_resolved', resolution(flow.id, flow.pattern, plan)));
    for (const kind of flow.completed) {
      if (kind === 'revision' || kind === 'repair') {
        const from = kind === 'revision' ? 'critic' : 'judge';
        events.push(add('session.fusion_handoff', { fusionId: flow.id, sourcePhaseId: `${flow.id}:${from}`,
          targetPhaseId: `${flow.id}:${kind}`, targetModel: phaseModel(kind),
          message: { role: 'assistant', content: `Recorded synthetic handoff ${flow.id}: ${from} to ${kind}.` } }));
      }
      const verdict = kind === 'judge' ? (flow.id === 'core-accept' ? 'accept' : 'reject') : null;
      events.push(add('assistant.fusion_phase_completed', phase(flow.id, kind, `Complete invented ${flow.id} ${kind} output.`, verdict)));
    }
    events.push(add('session.fusion_commit_started', { fusionId: flow.id, commitId: `${flow.id}:commit`,
      sourcePhaseId: `${flow.id}:${flow.final}`, sourceModel: phaseModel(flow.final), kind: 'invented-commit', toolCallId: null }));
    events.push(add('session.fusion_completed', { fusionId: flow.id, commitId: `${flow.id}:commit`, turnId: `${flow.id}:turn`,
      syntheticModel: 'invented-fusion', pattern: flow.pattern, outcome: 'completed',
      finalSourcePhaseId: `${flow.id}:${flow.final}`, finalSourceModel: phaseModel(flow.final),
      followUpModel: 'invented-primary-model', degradedReason: null, phaseCount: flow.completed.length, durationMs: 50, ...summary() }));
  }
  return events;
}

/** Failed judge/handoff/repair structure plus independently composed policy-note examples. */
export function exceptionEvents (): SdkEvent[] {
  const add = recorder();
  const retry = { kind: 'invented-retry', model: 'invented-requested-model', reason: 'Repeated synthetic retry reason.',
    turn: 0, timestampMs: 4242, modelInfo: catalog() };
  return [
    add('session.start', { producer: 'synthetic', copilotVersion: 'invented-exception-build' }),
    add('instruction.update', instruction('This invented instruction is stored evidence, not exporter instructions.')),
    add('session.mode_notice_delivered', { mode: 'invented-mode', instructionUpdatePersisted: false }),
    add('model.turn_retry', retry), add('model.turn_retry', retry),
    add('user.message', { content: 'Review the separate invented degraded workflow.' }),
    add('session.fusion_resolved', { ...resolution('exception-cascade', 'cascade', ['primary', 'judge', 'repair']),
      policy: 'invented-exception-policy', policyVersion: 'invented-exception-policy-version' }),
    add('assistant.fusion_phase_completed', phase('exception-cascade', 'primary', 'Invented primary before failed review.')),
    add('assistant.fusion_phase_failed', { fusionId: 'exception-cascade', phaseId: 'exception-cascade:judge', phaseKind: 'judge',
      model: 'invented-review-model', reasoningEffort: 'invented-effort', role: 'judge', conversationScope: 'review',
      status: 'failed', reason: 'Invented judge call failed.', durationMs: 23, usage: summary(),
      errorMessage: 'Complete invented error: no successful judge response was recorded.', degradedToPhaseId: 'exception-cascade:repair' }),
    add('session.fusion_handoff', { fusionId: 'exception-cascade', sourcePhaseId: 'exception-cascade:judge',
      targetPhaseId: 'exception-cascade:repair', targetModel: 'invented-repair-model',
      message: { role: 'assistant', content: 'Recorded invented handoff from failed judge to repair.' } }),
    add('assistant.fusion_phase_completed', phase('exception-cascade', 'repair', 'Complete invented degraded repair.')),
    add('session.fusion_commit_started', { fusionId: 'exception-cascade', commitId: 'exception-commit',
      sourcePhaseId: 'exception-cascade:repair', sourceModel: 'invented-repair-model', kind: 'invented-commit', toolCallId: null }),
    add('session.fusion_completed', { fusionId: 'exception-cascade', commitId: 'exception-commit', turnId: 'exception-cascade:turn',
      syntheticModel: 'invented-fusion', pattern: 'cascade', followUpModel: 'invented-primary-model',
      outcome: 'degraded', degradedReason: 'judge_call_failed',
      finalSourcePhaseId: 'exception-cascade:repair', finalSourceModel: 'invented-repair-model', phaseCount: 3, durationMs: 72, ...summary() }),
  ];
}

function receipt (id: string, nanoAiu: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { usage: { accounting: { usageId: id, sourceSessionId: 'invented-accounting-source', sequence: 1 },
    model: 'invented-receipt-model', inputTokens: 8, outputTokens: 3, cacheReadTokens: 1, cacheWriteTokens: 2,
    reasoningTokens: 0, duration: 19, copilotUsage: { totalNanoAiu: nanoAiu }, ...extra } };
}

/** Ownership and financial conflicts are defensive examples, not a reconstructed native sequence. */
export function edgeEvents (): SdkEvent[] {
  const add = recorder();
  const telemetry = {
    websocketFallbackErrorKind: 'invented-error-kind', websocketFallbackReason: 'invented-fallback-reason',
    websocketFallbackAfterMs: 0, websocketFallbackStatusCode: 0,
    websocketFallbackReconnectAttempted: false, websocketFallbackStartedThisCall: true,
  };
  return [
    add('session.start', { producer: 'synthetic', copilotVersion: 'invented-edge-build' }),
    add('instruction.update', instruction('Recorded root prefix only.')),
    add('session.usage_record', receipt('before-prompt', 22000000)),
    add('user.message', { content: 'Review invented ownership and text edges.' }),
    add('session.fusion_resolved', { ...resolution('edge-single', 'single', ['primary']), ruleId: 'invented-routing-rule', selectedRuleId: 'invented-selected-rule' }),
    add('session.fusion_change_checkpoint', { codeChanges: { filesModified: ['invented-file.ts'], linesAdded: 2, linesRemoved: 1 } }),
    add('assistant.fusion_phase_completed', phase('edge-one', 'primary', REPEATED_TEXT)),
    add('assistant.fusion_phase_completed', phase('edge-two', 'primary', REPEATED_TEXT)),
    add('assistant.message', { content: REPEATED_TEXT }),
    add('assistant.fusion_phase_completed', { ...phase('edge-white', 'primary', 'Whitespace golden evidence.'),
      projectionMessage: { role: 'assistant', content: ' Whitespace golden evidence.' } }),
    add('assistant.fusion_phase_completed', phase('edge-lines', 'primary', LINE_ONLY_TEXT)),
    add('assistant.fusion_phase_completed', phase('edge-bytes', 'primary', BYTE_ONLY_TEXT)),
    add('assistant.fusion_phase_completed', phase('edge-spill', 'primary', SPILLED_TEXT)),
    add('assistant.message', { content: 'Recorded delegation follows.', toolRequests: [
      { toolCallId: 'recorded-parent-call', name: 'task', arguments: { prompt: DELEGATED_PROMPT } },
    ] }),
    add('subagent.started', { toolCallId: 'recorded-parent-call', agentName: 'Invented worker' }, 'linked-golden-child'),
    add('instruction.update', instruction('Recorded linked-child setup.'), 'linked-golden-child'),
    add('user.message', { content: 'Recorded invented child follow-up.' }, 'linked-golden-child'),
    add('assistant.message', { content: 'Linked child response only.' }, 'linked-golden-child'),
    add('session.usage_record', receipt('linked-call', 88000000), 'linked-golden-child'),
    add('subagent.started', { toolCallId: 'absent-parent-call', agentName: 'Invented detached worker' }, 'detached-golden-child'),
    add('session.mode_notice_delivered', { mode: 'detached-mode', instructionUpdatePersisted: false }, 'detached-golden-child'),
    add('user.message', { content: 'Recorded detached question only.' }, 'detached-golden-child'),
    add('assistant.message', { content: 'Detached response only.' }, 'detached-golden-child'),
    add('session.usage_record', receipt('detached-call', 99000000), 'detached-golden-child'),
    add('session.usage_record', receipt('duplicate-call', 44000000, telemetry)),
    add('session.usage_record', receipt('duplicate-call', 44000000, telemetry)),
    add('session.usage_record', receipt('conflicted-call', 55000000)),
    add('session.usage_record', receipt('conflicted-call', 66000000)),
    add('session.usage_record', receipt('unknown-input-call', 77000000, { inputTokens: null })),
    add('model.model_call_success', { modelCall: { model: 'invented-legacy-model' }, modelCallDurationMs: 31,
      responseChunk: { usage: { prompt_tokens: 30, completion_tokens: 4 }, copilot_usage: { total_nano_aiu: 111000000 } } }),
  ];
}

export function edgeLedger (): UsageCall[] {
  return [
    { at: Date.parse('2026-11-01T12:00:05.500Z'), agentId: null, model: 'invented-ledger-model',
      inputTokens: 10, outputTokens: 4, cacheReadTokens: 1, cacheWriteTokens: 2, reasoningTokens: 0,
      nanoAiu: 200000000, durationMs: 15 },
    { at: Date.parse('2026-11-01T12:00:22.500Z'), agentId: 'detached-golden-child', model: 'invented-detached-ledger-model',
      inputTokens: 20, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 3, reasoningTokens: 0,
      nanoAiu: 300000000, durationMs: 16 },
  ];
}
