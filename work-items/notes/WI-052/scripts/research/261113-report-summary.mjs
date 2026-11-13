import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const output = process.env.WI052_RESEARCH_OUTPUT;
if (!output || !path.isAbsolute(output) || !path.resolve(output).startsWith(path.resolve('temp-tool-output') + path.sep))
  throw new Error('Set WI052_RESEARCH_OUTPUT to an absolute, new folder under temp-tool-output. See the script README.');
const target = path.join(output, 'report-summary.json');
const maxBytes = 300_000;
const findingsBytes = fs.readFileSync(path.join(output, 'findings.json'));
const censusBytes = fs.readFileSync(path.join(output, 'census.json'));
const findings = JSON.parse(findingsBytes);
const census = JSON.parse(censusBytes);
const inventories = census.inventories;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const retainedProviderMappings = findings.manifests.normalSdkCaptureManifests.map(reference => {
  const bytes = fs.readFileSync(path.join(output, reference.path));
  const metadata = JSON.parse(bytes);
  const source = metadata.selection?.source;
  const occurrence = metadata.selection?.occurrence;
  const backing = census.sources.find(item => item.family === 'sdk' && item.id === source?.sessionId);
  const mapping = metadata.identityRows?.find(row => {
    if (row.key !== 'agentHost.chatProviderData')
      return false;
    try {
      return JSON.parse(row.value).sdkSessionId === source?.sessionId;
    } catch {
      return false;
    }
  });
  const root = findings.scope.rootCounts.find(root => mapping?.evidence?.startsWith(`${root.path}\\agentSessionData\\`));
  const providerKey = metadata.selectedIndex?.sessionId;
  const verified = source?.kind === 'sdk-events'
    && source.provider === 'agent-host'
    && occurrence?.provider === 'agent-host'
    && typeof providerKey === 'string'
    && providerKey.startsWith('agent-host-copilotcli:/')
    && providerKey === occurrence.sessionId
    && Boolean(mapping && root && backing)
    && source.sha256 === backing?.frozenSha256;
  return {
    label: backing?.label ?? null,
    backingSdkSessionId: source?.sessionId ?? null,
    primaryLabel: 'SDK',
    attributedProvider: verified ? 'Agent Host' : 'unknown',
    providerMappingVerified: verified,
    owningUserDataRoot: verified ? root.path : null,
    providerKey: providerKey ?? null,
    identityMappingKey: mapping?.key ?? null,
    persistedIdentityEvidence: mapping?.evidence ?? null,
    mappingSdkIdAndFrozenHashMatch: verified,
    retainedMetadata: reference.path,
    retainedMetadataSha256: hash(bytes),
    caveat: 'Attribution uses the retained provider URI and agentHost.chatProviderData SDK-ID mapping under the owning Code root. Producer/copilotVersion/hostType alone are not used as origin evidence. No live store was reopened.',
  };
});
const count = (value, unit) => ({ count: value, unit });
const total = entries => Object.values(entries).reduce((sum, entry) => sum + entry.occurrences, 0);
const sortedEntries = object => Object.entries(object).sort(([a], [b]) => a.localeCompare(b));
const pointer = group => `census.json#/inventories/${group}`;
const sourceLabels = new Set(census.sources.map(source => source.label));
const groupNames = Object.keys(inventories);
const scopeNames = [...new Set(groupNames.map(group => group.slice(0, group.lastIndexOf('.'))))].sort();
const scopes = Object.fromEntries(scopeNames.map((name, index) => [name, `G${index + 1}`]));
const scopeLegend = Object.fromEntries(Object.entries(scopes).map(([name, code]) => [code, name]));
const relevantToolGroups = groupNames.filter(group => group.endsWith('.toolNames') || /\.(?:uniqueToolCalls|executionStarts|assistantToolRequests)$/.test(group));
const allToolNames = [...new Set(relevantToolGroups.flatMap(group => Object.keys(inventories[group])))].sort();
const discriminatorGroups = groupNames.filter(group => group.endsWith('.discriminators'));
const stateGroups = groupNames.filter(group => group.endsWith('.states'));

function discriminatorRows(groups) {
  return groups.flatMap(group => sortedEntries(inventories[group]).map(([key, entry]) => {
    const split = key.lastIndexOf(' = ');
    assert.ok(split >= 0);
    return [scopes[group.slice(0, group.lastIndexOf('.'))], key.slice(0, split), key.slice(split + 3), entry.occurrences];
  }));
}

function catalogueRow(group, key, entry) {
  const split = key.lastIndexOf(': ');
  assert.ok(split >= 0);
  return [scopes[group.slice(0, group.lastIndexOf('.'))], key.slice(0, split), key.slice(split + 2), entry.occurrences];
}

function fieldPriority(row) {
  const [scope, field] = row;
  const name = scopeLegend[scope];
  const segments = field.split('.').length;
  const mainScope = ['local.final', 'sdk.raw'].includes(name) ? 0 : name === 'sdk.calls' ? 1 : name.endsWith('parsedInputs') ? 2 : 3;
  const copyPenalty = /(?:\.input\.|\.toolTelemetry\.|accountingSnapshot|promptCache|parameters\.properties|schema|enabledTools|pendingRequests)/.test(field) ? 4 : 0;
  const contentBonus = /response\[\]|\.result|\.arguments|\.attachments|variableData|error|cancel/i.test(field) ? -1 : 0;
  return segments + mainScope + copyPenalty + contentBonus;
}

const fullFieldCatalogue = groupNames.filter(group => group.endsWith('.fieldTypes'))
  .flatMap(group => sortedEntries(inventories[group]).map(([key, entry]) => catalogueRow(group, key, entry)))
  .sort((a, b) => fieldPriority(a) - fieldPriority(b) || a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
const variants = discriminatorRows(discriminatorGroups);
const states = discriminatorRows(stateGroups);
const distinctVariantNames = [...new Set(variants.map(row => row[2]))].sort();
const rootCoverage = [
  ...findings.scope.rootCounts.map(root => ({
    root: root.path,
    family: 'Local',
    channel: root.channel,
    discovered: count(root.discoveredJsonl, 'journal files'),
    sampled: count(census.sources.filter(source => source.family === 'local' && source.root === root.path).length, 'frozen journal files'),
  })),
  {
    root: census.discovery.sdkRoot,
    family: 'SDK',
    channel: 'SDK event storage; producer origin is not implied by this path',
    discovered: count(findings.scope.originalMetadataInventory.sdkEventFiles, 'event files'),
    sampled: count(census.sources.filter(source => source.family === 'sdk').length, 'frozen event files'),
  },
];
const sourceManifest = census.sources.map(source => [
  source.label,
  source.id,
  source.family,
  source.channel,
  source.frozen,
  source.frozenBytes,
  source.frozenSha256,
  source.sourceBefore.mtime,
  findings.manifests.finalSourceChecks.find(check => check.label === source.label)?.matchesFrozen ?? null,
  source.raw.nonblankRecords,
  source.final?.requests ?? null,
  source.final?.responseParts ?? null,
  source.final?.uniqueToolInvocationCalls ?? null,
  source.events?.uniqueStartedToolCallIds ?? null,
]);

const sampleSelections = findings.selectedSamples.map(sample => {
  const verification = findings.savedFileVerification.find(result => result.label === sample.label);
  const metrics = findings.markdownArtifactMetrics.find(result => result.label === sample.label);
  return {
    label: sample.label,
    id: sample.id,
    family: sample.family,
    originAttribution: sample.family === 'sdk'
      ? retainedProviderMappings.find(mapping => mapping.backingSdkSessionId === sample.id) ?? { primaryLabel: 'SDK', attributedProvider: 'unknown', providerMappingVerified: false, caveat: 'No retained owning-root/provider mapping was checked.' }
      : { primaryLabel: 'Local', channel: 'stable', attributedProvider: 'Local journal' },
    reason: sample.purpose,
    namedFlawedStressCase: sample.stress,
    artifacts: sample.artifacts.map(artifact => ({ path: artifact.path, size: count(artifact.bytes, 'bytes'), sha256: artifact.sha256, failedArchive: artifact.failedArchive })),
    exportExitCode: sample.export.exitCode,
    savedFileVerifyExitCode: sample.savedFileVerify.exitCode,
    savedFileVerificationTarget: verification.target,
    failureReasons: verification.failureReasons,
    logs: { exportStdout: sample.export.stdout, exportStderr: sample.export.stderr, verifyStdout: sample.savedFileVerify.stdout, verifyStderr: sample.savedFileVerify.stderr },
    captures: findings.manifests.normalCaptureJsonlFiles.filter(file => file.matchingSurveyLabels.includes(sample.label)).map(file => file.path),
    contentVerification: {
      columns: ['category', 'present', 'partial', 'absent'],
      units: { present: 'text pieces', partial: 'text pieces', absent: 'text pieces' },
      rows: Object.entries(verification.categoryStatus).map(([category, values]) => [category, values.present, values.partial, values.absent]),
    },
    imageVerification: { unit: 'image records or unique image byte payloads, according to the named column', counts: verification.images },
    outputMetrics: metrics ? {
      markdownLines: count(metrics.lines, 'lines'),
      detailsOpenTags: count(metrics.detailsOpenTags, 'textual Markdown disclosure markers'),
      companionFiles: count(metrics.companionFiles, 'files'),
      companionBytes: count(metrics.companionBytes, 'bytes'),
      caveat: metrics.caveat,
    } : null,
  };
});

const now = new Date();
const pad = number => String(number).padStart(2, '0');
const summary = {
  schemaVersion: 1,
  generatedLocal: `${String(now.getFullYear()).slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
  utcOffsetHours: -now.getTimezoneOffset() / 60,
  purpose: 'Compact projection of existing findings/census and retained export-capture provider metadata. No native source JSONL files or live session stores were opened. No new scan, export or production fix.',
  fullEvidence: {
    findings: { path: 'findings.json', size: count(findingsBytes.length, 'bytes'), sha256: hash(findingsBytes) },
    census: { path: 'census.json', size: count(censusBytes.length, 'bytes'), sha256: hash(censusBytes) },
    inventoryProvenance: 'Every full inventory entry in census.json includes per-source counts and up to three concrete source/line or final-state examples. This projection aggregates those entries.',
    commandsAndLogs: 'findings.json#/selectedSamples contains exact export/verification commands, environment overrides, durations and stdout/stderr paths.',
    artifactValidation: 'logs\\261113-artifact-check.stdout.log',
    sdkProviderAttributionEvidence: retainedProviderMappings.map(mapping => mapping.retainedMetadata),
  },
  sampling: {
    strategy: census.scope.selection,
    sourceFiles: count(census.sources.length, 'frozen source files'),
    localFiles: count(findings.scope.sampledLocalFiles, 'frozen journal files'),
    sdkFiles: count(findings.scope.sampledSdkFiles, 'frozen event files'),
    frozenInputSize: count(census.scope.frozenBytes, 'bytes'),
    discoveredLocalFiles: count(findings.scope.originalMetadataInventory.localJournalFiles, 'journal file occurrences'),
    discoveredLocalIds: count(findings.scope.originalMetadataInventory.localUniqueIds, 'distinct session IDs'),
    discoveredSdkFiles: count(findings.scope.originalMetadataInventory.sdkEventFiles, 'event files'),
    sourceMtimeRange: findings.scope.sourceFileMtimeRange,
    sourceMtimeMeaning: 'Filesystem observation, not asserted session creation dates.',
    discoveryCorrection: findings.scope.originalMetadataInventory.discoveryCorrection,
    excludedParent: findings.scope.excludedCurrentParent,
    activeSessionProtection: findings.scope.activeSessionProtection,
    roots: rootCoverage,
    rootsNotSampled: rootCoverage.filter(root => root.sampled.count === 0),
    sourceIds: census.sources.map(source => source.id),
    sdkOriginAttribution: {
      primaryFamilyLabel: 'SDK',
      verifiedAgentHost: count(retainedProviderMappings.filter(mapping => mapping.providerMappingVerified).length, 'SDK source files with a retained owning-root/provider mapping checked'),
      remainingUnchecked: count(census.sources.filter(source => source.family === 'sdk' && !retainedProviderMappings.some(mapping => mapping.providerMappingVerified && mapping.backingSdkSessionId === source.id)).length, 'SDK source files without an owning-root/provider attribution checked in this projection'),
      checkedMappings: retainedProviderMappings,
      caveat: 'Do not label the remaining SDK survey files Agent Host or CLI from producer strings, event paths or hostType values. Their origin remains unknown here.',
    },
    selectionReasons: { columns: ['source', 'reason'], rows: census.sources.map(source => [source.label, source.selectionReason]) },
    limitations: [
      'Purposeful sample, not exhaustive or statistically representative.',
      'The largest SDK sources above 60 MB were not sampled.',
      'One small Insiders journal was discovered as metadata but was not sampled.',
      'No remote, WSL, cloud or arbitrary custom user-data root survey.',
      'Includes older/smaller sessions and one empty Local placeholder.',
      'Per-file captures are reproducible, not an atomic multi-store snapshot.',
    ],
  },
  versions: {
    exporterPackage: findings.versions.exporterPackage,
    checkout: findings.versions.checkout,
    exportMode: findings.versions.exportMode,
    machine: findings.versions.machine,
    installed: findings.versions.installed,
    recordedSdkHeaders: findings.versions.sdkRecordedHeaders,
    caveat: findings.versions.limitation,
  },
  countsAndUnits: {
    rawLocalMutations: count(findings.totals.rawLocalMutationRecords, 'mutation records, including repeated snapshots/updates'),
    finalLocalRequests: count(findings.totals.replayedLocalRequests, 'requests after mutation replay'),
    finalLocalResponses: count(findings.totals.replayedLocalResponsePositions, 'response positions after replay, not unique lifecycle IDs'),
    uniqueLocalInvocations: count(findings.totals.uniqueLocalInvocationIdsWithinEachSourceSummed, 'tool-call identities, deduplicated within each source then summed'),
    rawSdkEvents: count(findings.totals.rawSdkEventRecords, 'event records across all recorded scopes'),
    sdkExecutionStarts: count(findings.totals.sdkToolExecutionStartRecords, 'tool.execution_start event records'),
    sdkUniqueStartedCalls: count(findings.totals.uniqueSdkStartedToolCallIdsWithinEachSourceSummed, 'started tool-call IDs, unique within each source then summed'),
    localResponseVariants: count(findings.totals.localResponseKindValuesIncludingAbsentKindMarkdown, 'distinct response variants including Markdown records without kind'),
    sdkEventTypes: count(findings.totals.sdkEventTypeValues, 'distinct event type values'),
    actualLocalTools: count(findings.totals.actualLocalToolNames, 'distinct tool names on final unique invocations'),
    actualSdkTools: count(findings.totals.actualSdkToolNames, 'distinct tool names on execution starts'),
    actualToolUnion: count(findings.totals.actualToolNameUnion, 'distinct actually called tool names across Local and SDK'),
    allEncounteredToolNames: count(allToolNames.length, 'distinct recorded tool-name values, including configured tools and copies'),
    discriminatorNames: count(distinctVariantNames.length, 'distinct short discriminator values across every discriminator catalogue'),
    exportAttempts: count(findings.totals.exportAttempts, 'export commands'),
    successfulExports: count(findings.totals.successfulExports, 'Markdown archives with export exit 0'),
    failedArchives: count(findings.totals.warningMarkedFailedExports, 'warning-marked failed Markdown archives'),
    savedFilePasses: count(findings.totals.savedFileVerificationPasses, 'saved-file verification commands with exit 0'),
    caution: 'Do not sum raw/final views or overlapping tool/name inventories. Forks, copies, hooks and model diagnostics repeat content. Null means not applicable or not recorded, never zero.',
  },
  sourceStability: {
    checkedAsOfLocal: findings.createdLocal,
    checkedAsOfUtcOffsetHours: findings.utcOffsetHours,
    allFrozenHashesMatchRecordedEndChecks: findings.totals.sourceHashesUnchangedThroughEnd,
    changedSources: count(findings.manifests.finalSourceChecks.filter(check => !check.matchesFrozen).length, 'source files whose recorded final hash differs from frozen bytes'),
    parseErrors: count(findings.totals.parseErrors, 'JSONL parse errors'),
    replayErrors: count(findings.totals.replayErrors, 'Local replay errors'),
    manifests: {
      columns: ['source', 'sessionId', 'family', 'channel', 'frozenPath', 'bytes', 'sha256', 'sourceMtime', 'endHashMatchesFrozen', 'rawRecords', 'finalRequests', 'finalResponsePositions', 'uniqueLocalCalls', 'uniqueSdkStartedCalls'],
      units: { bytes: 'bytes', rawRecords: 'mutation records for Local or event records for SDK', finalRequests: 'replayed requests', finalResponsePositions: 'replayed response positions', uniqueLocalCalls: 'per-source invocation identities', uniqueSdkStartedCalls: 'per-source started tool-call IDs' },
      rows: sourceManifest,
    },
    completeChecks: 'findings.json#/manifests/finalSourceChecks',
    note: 'This projection uses existing recorded stability evidence. It does not reread native sources or establish a newer observation time.',
  },
  sampleSelections,
  criticalCaveats: [
    {
      id: 'S001',
      label: 'S001',
      issue: 'Named flawed askQuestions/answer stress case, not an exemplary success.',
      usedQuestionCarousels: count(findings.localQuestionStressPresence.usedCarousels, 'final used question-carousel records'),
      recordedAnswers: count(findings.localQuestionStressPresence.recordedNonemptyAnswerStrings, 'nonempty recorded answer strings'),
      answersMatchedInMarkdown: count(findings.localQuestionStressPresence.presentNormalizedWhitespaceInSavedMarkdown, 'answer strings found after whitespace normalization'),
      answersNotMatched: count(findings.localQuestionStressPresence.recordedNonemptyAnswerStrings - findings.localQuestionStressPresence.presentNormalizedWhitespaceInSavedMarkdown, 'recorded answer strings not found after whitespace normalization'),
      verifierResult: 'Export and saved-file verification both exit 0. No dedicated user-answer category is reported.',
      caveat: findings.localQuestionStressPresence.limitation,
      evidence: 'findings.json#/localQuestionStressPresence',
    },
    {
      id: 'S017',
      label: 'S017',
      issue: 'Named sparse/Fusion stress case fails Layer D. Both export and saved-file verification exit 2.',
      action: 'Kept failed Markdown, diagnostic log, companions and capture. No retry or repair.',
      artifact: sampleSelections.find(sample => sample.label === 'S017').artifacts[0].path,
      evidence: 'findings.json#/savedFileVerification',
    },
    {
      issue: 'Privacy and fidelity limits',
      caveat: 'Exports and captures are private. Text redaction is best-effort and does not inspect image pixels. Passing content checks does not prove complete semantic fidelity.',
    },
  ],
  catalogues: {
    scopeLegend,
    countMeaning: 'Occurrence counts are aggregate inventory occurrences within the named scope. Raw mutations/events can repeat logical content. Final Local positions and actual tool identities have separate units.',
    normalization: census.scope.normalization,
    localResponseKinds: {
      columns: ['kind', 'occurrences', 'label'],
      unit: 'final replayed response positions',
      rows: sortedEntries(findings.labelledResponseKinds).map(([name, entry]) => [name, entry.occurrences, entry.label]),
      fullProvenance: 'census.json#/inventories/local.final.responseKinds',
    },
    sdkEventTypes: {
      columns: ['type', 'occurrences', 'label'],
      unit: 'raw event records',
      rows: sortedEntries(findings.labelledSdkEventTypes).map(([name, entry]) => [name, entry.occurrences, entry.label]),
      fullProvenance: 'census.json#/inventories/sdk.raw.eventTypes',
    },
    toolNames: {
      columns: ['name', ...relevantToolGroups],
      units: Object.fromEntries(relevantToolGroups.map(group => [group, group.endsWith('uniqueToolCalls') ? 'unique per-source Local invocation IDs' : group.endsWith('executionStarts') ? 'SDK tool execution-start records' : group.endsWith('assistantToolRequests') ? 'assistant tool-request records' : 'recorded tool-name occurrences, including definitions and copies'])),
      rows: allToolNames.map(name => [name, ...relevantToolGroups.map(group => inventories[group][name]?.occurrences ?? 0)]),
      caution: 'Zero means not observed in that particular recorded inventory. Columns overlap and must not be added as unique calls.',
      fullProvenance: relevantToolGroups.map(pointer),
    },
    payloadVariants: {
      columns: ['scope', 'fieldPath', 'value', 'occurrences'],
      unit: 'short discriminator occurrences within the named scope',
      rows: variants,
      coverage: 'All entries from every discriminator inventory: kind/type, MIME/content type, status/state/role, finish/stop reason and supported error-code labels. Includes nested content/result/attachment/parsed-input variants.',
      fullProvenance: discriminatorGroups.map(pointer),
    },
    stateValues: {
      columns: ['scope', 'fieldPath', 'value', 'occurrences'],
      unit: 'state-value occurrences within the named scope',
      rows: states,
      fullProvenance: stateGroups.map(pointer),
    },
    fieldPathTypes: {
      columns: ['scope', 'fieldPath', 'type', 'occurrences'],
      unit: 'field/type occurrences within the named scope',
      rows: [],
      totalCandidates: count(fullFieldCatalogue.length, 'aggregate scope/path/type rows in full census'),
      selected: count(0, 'aggregate scope/path/type rows included here'),
      omitted: count(0, 'aggregate scope/path/type rows available through full-census links'),
      coverageByScope: { columns: ['scope', 'candidateRows', 'includedRows'], unit: 'aggregate scope/path/type rows', rows: [] },
      selectionRule: 'Budget-limited catalogue, prioritizing shallower fields, final Local/event records, actual tool arguments, content/results/attachments and errors. No per-session copies or raw occurrences.',
      fullCatalogue: groupNames.filter(group => group.endsWith('.fieldTypes')).map(pointer),
    },
    completeInventoryIndex: {
      columns: ['name', 'distinctEntries', 'occurrences', 'evidence'],
      units: { distinctEntries: 'aggregate inventory keys', occurrences: 'inventory occurrences within that named group, not unique conversation parts' },
      rows: sortedEntries(inventories).map(([group, entries]) => [group, Object.keys(entries).length, total(entries), pointer(group)]),
    },
  },
  projectionBudget: { limit: count(maxBytes, 'UTF-8 bytes'), actual: count(0, 'UTF-8 bytes'), policy: 'Keep every kind, event type, tool name and discriminator entry. Trim only the optional field-path/type sampler to fit. Full evidence files remain unchanged.' },
};

const baseBytes = Buffer.byteLength(JSON.stringify(summary));
assert.ok(baseBytes < maxBytes - 2_048, `Required catalogues exceed budget: ${baseBytes} bytes.`);
let remaining = maxBytes - baseBytes - 2_048;
for (const row of fullFieldCatalogue) {
  const bytes = Buffer.byteLength(JSON.stringify(row)) + 1;
  if (bytes > remaining)
    break;
  summary.catalogues.fieldPathTypes.rows.push(row);
  remaining -= bytes;
}
const fieldRows = summary.catalogues.fieldPathTypes.rows;
summary.catalogues.fieldPathTypes.selected.count = fieldRows.length;
summary.catalogues.fieldPathTypes.omitted.count = fullFieldCatalogue.length - fieldRows.length;
summary.catalogues.fieldPathTypes.coverageByScope.rows = Object.keys(scopeLegend).map(scope => [
  scope,
  fullFieldCatalogue.filter(row => row[0] === scope).length,
  fieldRows.filter(row => row[0] === scope).length,
]).filter(row => row[1] > 0);
let serialized = JSON.stringify(summary);
for (let index = 0; index < 3; index += 1) {
  summary.projectionBudget.actual.count = Buffer.byteLength(serialized);
  serialized = JSON.stringify(summary);
}

assert.ok(Buffer.byteLength(serialized) <= maxBytes);
assert.equal(summary.projectionBudget.actual.count, Buffer.byteLength(serialized));
assert.equal(summary.catalogues.localResponseKinds.rows.length, Object.keys(inventories['local.final.responseKinds']).length);
assert.equal(summary.catalogues.sdkEventTypes.rows.length, Object.keys(inventories['sdk.raw.eventTypes']).length);
assert.equal(summary.catalogues.toolNames.rows.length, allToolNames.length);
assert.equal(summary.catalogues.payloadVariants.rows.length, discriminatorGroups.reduce((sum, group) => sum + Object.keys(inventories[group]).length, 0));
assert.ok(summary.sampling.sourceIds.length === 32 && new Set(summary.sampling.sourceIds).size === 32);
assert.ok(summary.sampling.selectionReasons.rows.every(([label]) => sourceLabels.has(label)));
assert.equal(hash(fs.readFileSync(path.join(output, 'findings.json'))), hash(findingsBytes));
assert.equal(hash(fs.readFileSync(path.join(output, 'census.json'))), hash(censusBytes));
fs.writeFileSync(target, serialized, { flag: 'wx' });
console.log(JSON.stringify({
  path: 'report-summary.json',
  bytes: Buffer.byteLength(serialized),
  schemaKeys: Object.keys(summary),
  sourceIds: summary.sampling.sourceIds.length,
  localKinds: summary.catalogues.localResponseKinds.rows.length,
  sdkEventTypes: summary.catalogues.sdkEventTypes.rows.length,
  toolNames: summary.catalogues.toolNames.rows.length,
  payloadVariantRows: summary.catalogues.payloadVariants.rows.length,
  distinctVariantValues: distinctVariantNames.length,
  sampledFieldPathTypeRows: fieldRows.length,
  totalFieldPathTypeRows: fullFieldCatalogue.length,
  completeEvidenceFilesUnchanged: true,
}));
