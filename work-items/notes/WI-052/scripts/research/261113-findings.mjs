import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const output = process.env.WI052_RESEARCH_OUTPUT;
if (!output || !path.isAbsolute(output) || !path.resolve(output).startsWith(path.resolve('temp-tool-output') + path.sep))
  throw new Error('Set WI052_RESEARCH_OUTPUT to an absolute, new folder under temp-tool-output. See the script README.');
const readJson = name => JSON.parse(fs.readFileSync(path.join(output, name), 'utf8'));
const census = readJson('census.json');
const discovery = readJson('discovery.json');
const exports = readJson('export-results.json');
const inventories = census.inventories;
const sum = values => values.reduce((total, value) => total + value, 0);
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const counts = bucket => Object.fromEntries(Object.entries(inventories[bucket] ?? {}).map(([key, entry]) => [key, entry.occurrences]));
const local = census.sources.filter(source => source.family === 'local');
const sdk = census.sources.filter(source => source.family === 'sdk');
const relative = file => path.relative(output, file);

function filesIn(folder) {
  if (!fs.existsSync(folder))
    return [];
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    if (entry.isSymbolicLink())
      return [];
    return entry.isDirectory() ? filesIn(file) : entry.isFile() ? [file] : [];
  });
}

function selectedInventory(bucket, test) {
  return Object.fromEntries(Object.entries(inventories[bucket] ?? {}).filter(([key]) => test(key)));
}

function toolCategory(name) {
  if (/askQuestions|ask_user/.test(name))
    return 'Question dialog or user answer';
  if (/skill/.test(name))
    return 'Load reusable instructions';
  if (/Subagent|^(?:task|read_agent|write_agent|list_agents)$/.test(name))
    return 'Delegate work or read child-agent results';
  if (/patch|edit|create|replace|str_replace/i.test(name))
    return 'File edit, patch or file creation';
  if (/powershell|terminal|runTests|problems|getErrors/.test(name))
    return 'Command, test or diagnostic';
  if (/context7|mcp|github-mcp|codebase-memory/.test(name))
    return 'MCP or externally provided tool';
  if (/web|Search|Page|navigate|playwright|ChromeDevTools/i.test(name))
    return 'Web search, browser or fetched page';
  if (/sql|session|current|context/i.test(name))
    return 'Session history, context or structured state';
  if (/view|readFile|glob|grep|^rg$|find|Directory|memory/i.test(name))
    return 'Read files, search files or read stored memory';
  return 'Other recorded tool';
}

const responseLabels = {
  '(missing)': 'Markdown-string record with no kind discriminator. All observed records contain value plus Markdown flags. This is not a missing conversation item.',
  toolInvocationSerialized: 'Recorded tool lifecycle position. Count unique toolCallId separately because final responses can contain several lifecycle positions.',
  thinking: 'Readable assistant reasoning record.',
  questionCarousel: 'Interactive question record, including question/options metadata and a data field for answers.',
  inlineReference: 'Inline source or symbol reference.',
  undoStop: 'Undo/edit checkpoint marker.',
  codeblockUri: 'File URI associated with a code block.',
  textEditGroup: 'Recorded text-edit group.',
  progressTaskSerialized: 'Serialized progress task.',
  autoModeResolution: 'Automatic model/mode resolution metadata.',
  confirmation: 'Interactive confirmation record.',
  mcpServersStarting: 'MCP startup progress record.',
  progressMessage: 'Progress message record.',
  workspaceEdit: 'Workspace edit record.',
};

function eventLabel(type) {
  if (type.startsWith('hook.'))
    return 'Hook bookkeeping. Recorded in the census, not conversation prose.';
  if (type.startsWith('permission.'))
    return 'Permission lifecycle. Recorded in the census, not a user conversation turn.';
  if (type.startsWith('model.'))
    return 'Model request/response diagnostic copy. Can repeat conversation content.';
  if (type.startsWith('subagent.'))
    return 'Child-agent selection, setup or lifecycle metadata.';
  if (type.startsWith('skill.'))
    return 'Skill invocation or delivered skill-context reference.';
  if (type.startsWith('external_tool.'))
    return 'External-tool request or completion lifecycle.';
  if (type === 'tool.execution_start')
    return 'Tool execution start with tool name and recorded arguments.';
  if (type === 'tool.execution_complete')
    return 'Tool completion with result/error. Do not count as another tool call.';
  if (type === 'user.message')
    return 'Recorded user message, which can belong to a child scope.';
  if (type === 'assistant.message')
    return 'Assistant prose, readable/opaque reasoning, and/or tool requests.';
  if (type.startsWith('assistant.turn_'))
    return 'Assistant turn boundary. Not a separate prose message.';
  if (type.includes('fusion'))
    return 'Fusion execution metadata. The named Fusion stress sample fails content verification.';
  if (type.includes('usage') || type === 'session.shutdown')
    return 'Usage/accounting or shutdown record. Cumulative totals must not be added across resumes.';
  if (type.includes('compaction'))
    return 'Conversation compaction boundary or summary.';
  if (type === 'system.message')
    return 'Recorded system/instruction context. Default export uses linked companion files.';
  if (type === 'system.notification')
    return 'System notification.';
  if (type === 'abort' || type === 'session.error')
    return 'Abort or error state.';
  if (type === 'session.truncation')
    return 'Recorded truncation notice.';
  return 'Session lifecycle, mode, model or configuration metadata.';
}

const headers = [];
for (const source of sdk) {
  const input = fs.createReadStream(path.join(output, source.frozen));
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim())
      continue;
    const record = JSON.parse(line);
    if (record.type === 'session.start') {
      headers.push({
        label: source.label,
        id: source.id,
        producer: record.data?.producer ?? null,
        copilotVersion: record.data?.copilotVersion ?? null,
        hostType: record.data?.context?.hostType ?? null,
        eventVersion: record.data?.version ?? null,
        timestamp: record.timestamp ?? null,
      });
      break;
    }
  }
  lines.close();
  input.destroy();
}

const artifactMetrics = [];
for (const entry of exports) {
  for (const artifact of entry.artifacts) {
    const file = path.join(output, artifact.path);
    const text = fs.readFileSync(file, 'utf8');
    const name = path.basename(file).replace(/\.verify-failed(?:-\d+)?\.md$/, '').replace(/\.md$/, '');
    const companions = fs.readdirSync(path.dirname(file), { withFileTypes: true })
      .filter(directory => directory.isDirectory() && directory.name.startsWith(`${name}_assets_`))
      .flatMap(directory => filesIn(path.join(path.dirname(file), directory.name)));
    const byExtension = {};
    for (const companion of companions) {
      const extension = path.extname(companion) || '(none)';
      byExtension[extension] ??= { files: 0, bytes: 0 };
      byExtension[extension].files += 1;
      byExtension[extension].bytes += fs.statSync(companion).size;
    }
    artifactMetrics.push({
      label: entry.label,
      path: artifact.path,
      bytes: fs.statSync(file).size,
      sha256: sha256(file),
      lines: text.split(/\r?\n/).length,
      detailsOpenTags: (text.match(/<details(?:\s[^>]*)?>/g) ?? []).length,
      detailsCloseTags: (text.match(/<\/details>/g) ?? []).length,
      summaryTags: (text.match(/<summary(?:\s[^>]*)?>/g) ?? []).length,
      headings: Object.fromEntries([1, 2, 3, 4, 5, 6].map(level => [level, (text.match(new RegExp(`^#{${level}} `, 'gm')) ?? []).length])),
      fenceMarkerLines: (text.match(/^[ \t]*`{3,}/gm) ?? []).length,
      markdownImageMarkers: (text.match(/!\[/g) ?? []).length,
      companionFiles: companions.length,
      companionBytes: sum(companions.map(companion => fs.statSync(companion).size)),
      companionExtensions: byExtension,
      companionManifest: companions.map(companion => ({ path: relative(companion), bytes: fs.statSync(companion).size, sha256: sha256(companion) })),
      caveat: 'These are textual Markdown-marker counts, not a second Markdown parser. Markers inside recorded code can contribute.',
    });
  }
}

const captureFolder = path.join(output, 'cache');
const captureFiles = filesIn(captureFolder);
const captureManifests = captureFiles.filter(file => path.basename(file) === 'source-snapshot.json').map(file => {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    path: relative(file),
    files: manifest.files.map(copy => ({
      source: copy.source,
      destination: relative(copy.destination),
      size: copy.size,
      sha256: copy.sha256,
      before: copy.before,
      after: copy.after,
      changedDuringCopy: copy.changedDuringCopy,
      skippedTrailingRecord: copy.skippedTrailingRecord,
      method: copy.method,
    })),
  };
});
const capturedJsonl = captureFiles.filter(file => file.endsWith('.jsonl')).map(file => {
  const hash = sha256(file);
  return { path: relative(file), bytes: fs.statSync(file).size, sha256: hash, matchingSurveyLabels: census.sources.filter(source => source.frozenSha256 === hash).map(source => source.label) };
});

const endChecks = census.sources.map(source => {
  const stat = fs.statSync(source.path);
  const hash = sha256(source.path);
  return { label: source.label, id: source.id, bytes: stat.size, mtime: stat.mtime.toISOString(), sha256: hash, matchesFrozen: hash === source.frozenSha256, statMatchesBefore: stat.size === source.sourceBefore.bytes && stat.mtime.toISOString() === source.sourceBefore.mtime };
});

const responseTypes = Object.fromEntries(Object.entries(inventories['local.final.responseKinds']).map(([kind, entry]) => [kind, { label: responseLabels[kind] ?? 'Unhandled research label.', ...entry }]));
const eventTypes = Object.fromEntries(Object.entries(inventories['sdk.raw.eventTypes']).map(([type, entry]) => [type, { label: eventLabel(type), ...entry }]));
const calledTools = Object.fromEntries(['local.final.uniqueToolCalls', 'sdk.calls.executionStarts'].map(bucket => [bucket, Object.fromEntries(Object.entries(inventories[bucket]).map(([name, entry]) => [name, { label: toolCategory(name), ...entry }]))]));
const verification = exports.map(entry => {
  const report = entry.verificationReport;
  return {
    label: entry.label,
    id: entry.id,
    stress: entry.stress,
    exportExitCode: entry.export.exitCode,
    savedFileVerifyExitCode: entry.savedFileVerify?.exitCode ?? null,
    failureReasons: report?.failureReasons ?? [],
    target: report?.layerD?.target,
    categoryStatus: report?.layerD?.totals,
    images: report?.images ? Object.fromEntries(Object.entries(report.images).filter(([, value]) => typeof value === 'number')) : null,
    order: report?.layerD?.order,
    multiplicity: report?.layerD?.multiplicity,
    scannerRequests: census.sources.find(source => source.label === entry.label)?.final?.requests ?? null,
    exporterRequestCheck: report?.layerB ?? null,
    failureSampleLocations: report?.layerD?.unaccounted ? Object.fromEntries(Object.entries(report.layerD.unaccounted).map(([category, items]) => [category, { count: Array.isArray(items) ? items.length : null, itemFieldNames: Array.isArray(items) && items[0] ? Object.keys(items[0]) : [] }])) : null,
  };
});
const localTools = new Set(Object.keys(inventories['local.final.uniqueToolCalls']));
const sdkTools = new Set(Object.keys(inventories['sdk.calls.executionStarts']));
const uniqueTools = new Set([...localTools, ...sdkTools]);
const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const now = new Date();
const pad = number => String(number).padStart(2, '0');
const localTimestamp = `${String(now.getFullYear()).slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const questionStress = local.find(source => source.id.startsWith('S001'));
const questionPresence = questionStress?.final.questionCarousels.flatMap(carousel => carousel.globalSavedMarkdownPresence ?? []) ?? [];
const findings = {
  createdLocal: localTimestamp,
  utcOffsetHours: -now.getTimezoneOffset() / 60,
  localDate: '261113',
  scope: {
    ...census.scope,
    originalMetadataInventory: {
      localJournalFiles: discovery.files.filter(file => file.family === 'local').length,
      sdkEventFiles: discovery.files.filter(file => file.family === 'sdk').length,
      localUniqueIds: new Set(discovery.files.filter(file => file.family === 'local').map(file => file.id)).size,
      emptyWindowJournalFiles: discovery.files.filter(file => file.family === 'local' && file.path.includes('emptyWindowChatSessions')).length,
      otherChatFileExtensions: Object.fromEntries([...new Set((discovery.otherChatFiles ?? []).map(file => file.extension))].map(extension => [extension || '(none)', discovery.otherChatFiles.filter(file => file.extension === extension).length])),
      discoveryCorrection: 'Initial metadata discovery found 115 chatSessions journals. Adding emptyWindowChatSessions added two files: one stable and one Insiders. Final count is 117 journals, not a source-data change.',
    },
    sampledLocalFiles: local.length,
    sampledSdkFiles: sdk.length,
    sourceFileMtimeRange: [census.sources.map(source => source.mtime).sort()[0], census.sources.map(source => source.mtime).sort().at(-1)],
    rootCounts: discovery.roots.map(root => ({ ...root, discoveredJsonl: discovery.files.filter(file => file.root === root.path).length })),
    excludedCurrentParent: 'private-id-0054',
    activeSessionProtection: 'Sources modified at/after task start were excluded before selection. No active parent source was read.',
    productionSourceInvestigation: 'None. Used README CLI instructions and documented journal semantics, plus independent Node built-in scanners. No production code symbols or call relationships were investigated.',
    noSourceWrites: true,
    captures: 'Each surveyed source is frozen independently with size/hash/mtime. Exporter also keeps normal --keep-source captures in this run-local CCE_CACHE_DIR, including SDK usage and Local companion metadata/resources.',
  },
  versions: {
    exporterPackage: packageJson.version,
    checkout: execFileSync('git', ['describe', '--always', '--dirty'], { encoding: 'utf8', windowsHide: true }).trim(),
    exportMode: 'node src\\cli.ts; source (not built). No production source edits.',
    machine: discovery.machine,
    installed: discovery.installations,
    sdkRecordedHeaders: headers,
    limitation: 'Installed editor/extension versions describe this machine now, not the versions that produced historical Local records. SDK headers record producer/version where available.',
  },
  totals: {
    rawLocalMutationRecords: sum(local.map(source => source.raw.nonblankRecords)),
    rawSdkEventRecords: sum(sdk.map(source => source.raw.nonblankRecords)),
    replayedLocalRequests: sum(local.map(source => source.final.requests)),
    replayedLocalResponsePositions: sum(local.map(source => source.final.responseParts)),
    uniqueLocalInvocationIdsWithinEachSourceSummed: sum(local.map(source => source.final.uniqueToolInvocationCalls)),
    sdkToolExecutionStartRecords: sum(sdk.map(source => source.raw.eventTypes['tool.execution_start'] ?? 0)),
    uniqueSdkStartedToolCallIdsWithinEachSourceSummed: sum(sdk.map(source => source.events.uniqueStartedToolCallIds)),
    localResponseKindValuesIncludingAbsentKindMarkdown: Object.keys(responseTypes).length,
    sdkEventTypeValues: Object.keys(eventTypes).length,
    actualLocalToolNames: localTools.size,
    actualSdkToolNames: sdkTools.size,
    actualToolNameUnion: uniqueTools.size,
    allEncounteredLocalToolNameValues: Object.keys(inventories['local.final.toolNames']).length,
    allEncounteredSdkToolNameValues: Object.keys(inventories['sdk.raw.toolNames']).length,
    exportAttempts: exports.length,
    successfulExports: exports.filter(entry => entry.export.exitCode === 0).length,
    warningMarkedFailedExports: exports.filter(entry => entry.export.exitCode !== 0 && entry.artifacts.length > 0).length,
    savedFileVerificationPasses: exports.filter(entry => entry.savedFileVerify?.exitCode === 0).length,
    sourceHashesUnchangedThroughEnd: endChecks.every(check => check.matchesFrozen),
    parseErrors: sum(census.sources.map(source => source.raw.parseErrors.length)),
    replayErrors: sum(local.map(source => source.raw.replayErrors.length)),
    note: 'Per-source totals are not a deduplicated cross-chat conversation total. Forks, copied history and model/hook copies can repeat content.',
  },
  labelledResponseKinds: responseTypes,
  labelledSdkEventTypes: eventTypes,
  labelledCalledTools: calledTools,
  contentAndAttachmentInventories: {
    localNestedResultDiscriminators: selectedInventory('local.final.discriminators', key => /result|output|toolSpecificData/i.test(key)),
    localRequestAndAttachmentDiscriminators: selectedInventory('local.final.discriminators', key => /message|variableData|attach|request.*mode/i.test(key)),
    sdkNestedContentAndAttachmentDiscriminators: selectedInventory('sdk.raw.discriminators', key => /content|result|output|attachment|reasoningBlocks|error/i.test(key)),
    localRequestAndAttachmentFields: selectedInventory('local.final.fieldTypes', key => /message|variableData|attach/i.test(key)),
    sdkAttachmentFields: selectedInventory('sdk.raw.fieldTypes', key => /attachments/i.test(key)),
    localQuestionFields: selectedInventory('local.final.fieldTypes', key => /response\[\]\.(?:questions|data|isUsed|allowSkip|resolveId)/.test(key)),
    semanticLimit: 'Field/type names and short discriminator values are observed. Descriptions inferred from names are research labels, not a claim about a stable private API.',
  },
  localQuestionStressPresence: {
    label: questionStress?.label ?? null,
    id: questionStress?.id ?? null,
    usedCarousels: questionStress?.final.questionCarousels.filter(carousel => carousel.used).length ?? null,
    recordedNonemptyAnswerStrings: questionPresence.length,
    presentLiteralInSavedMarkdown: questionPresence.filter(answer => answer.literalPresent).length,
    presentNormalizedWhitespaceInSavedMarkdown: questionPresence.filter(answer => answer.normalizedWhitespacePresent).length,
    checks: questionStress?.final.questionCarousels ?? [],
    limitation: 'Global string presence does not prove a correct answer location. One absent string may still be affected by Markdown escaping. No raw answer values are stored here.',
  },
  inventories,
  manifests: {
    discovery: 'discovery.json',
    sourceSelection: 'survey-plan.json',
    independentCensus: 'census.json',
    frozenSources: census.sources,
    finalSourceChecks: endChecks,
    normalSdkCaptureManifests: captureManifests,
    normalCaptureJsonlFiles: capturedJsonl,
  },
  selectedSamples: exports.map(({ verificationReport, ...entry }) => entry),
  savedFileVerification: verification,
  markdownArtifactMetrics: artifactMetrics,
  observations: [
    { label: 'Raw mutation counts differ from final conversation metrics', evidence: 'census.json local.raw versus local.final inventories', implication: 'LOD sizing must replay Local mutations before estimating readable content or unique tools.' },
    { label: 'Tool-name occurrence is not an execution count', evidence: 'All encountered Local/SDK tool names versus unique Local call IDs and SDK execution-start records.', implication: 'Tool schemas, model copies, hooks and lifecycle mirrors repeat names. Use the actual-call inventories for call composition.' },
    { label: 'Five useful saved Markdown exports, including four long eclectic conversations', evidence: 'S002, S014, S019 and S026 are long varied successful samples. S001 is a short required stress case.', implication: 'Use the four long successful exports for reading experiments; keep S001 as a separate question-answer fidelity test.' },
    { label: 'Named Local flaw is not disproved by a passing verifier', evidence: `S001 S001 exports and saved-file verification both exit 0. ${questionPresence.filter(answer => answer.normalizedWhitespacePresent).length} of ${questionPresence.length} recorded answer strings occur in the saved Markdown after whitespace normalization. Its Layer D categories contain question-carousel text but no dedicated user-answer category.`, implication: 'Treat it as the reported missing-answer stress case. Global text matching is not a semantic/ownership audit, and Markdown escaping can affect matching.' },
    { label: 'Named SDK Fusion case fails current verification', evidence: 'S017 S017 export and saved-file verification exit 2 with layer-d failure. Failed Markdown and logs are kept.', implication: 'Do not use it as an exemplary complete output. It is useful for showing sparse/Fusion evidence and failure presentation.' },
    { label: 'Current detailed output already contains disclosure blocks and companion files', evidence: 'markdownArtifactMetrics and default-export README behavior.', implication: 'A lower-detail view must distinguish folding navigation from deleting recorded evidence. Marker counts are approximate, not a DOM audit.' },
    { label: 'Images are present in successful Local samples', evidence: 'Saved-file image verification finds 44 unique images in S002 and one in S014; S002 separately excludes two draft attachments.', implication: 'A reading view needs an image/reference policy. Image pixels are not text-redacted.' },
    { label: 'Instructions and skills can be external companions', evidence: 'SDK Layer D system-prompt and skill-file categories pass in S019 and S026.', implication: 'Measure companion links alongside inline Markdown bytes. Do not assume the .md file contains all visible context.' },
  ],
  importantGaps: [
    'Purposeful sample of 32 sources, not an exhaustive or statistical corpus survey. Metadata-only discovery found more files.',
    'Stable and Insiders user-data roots both exist. Metadata discovery found one 1,782-byte Insiders .jsonl file, but no Insiders file was sampled. This does not establish Insiders-format coverage.',
    'Older/smaller sessions and an empty Local placeholder were included. Source file mtime is not asserted to be session creation time.',
    'The largest SDK files above 60 MB were not surveyed. No remote, WSL, cloud or arbitrary custom user-data roots were searched.',
    'The independent census inspects JSONL sources, not every supplementary resource/transcript body. Selected exports use the exporter normal capture/enrichment path.',
    'Raw Local and SDK field inventories include copies of content. Only replayed Local counts and per-ID tool metrics avoid mutation/lifecycle overcounting.',
    'Exact field-path inventories normalize array indices and dynamic ID/path keys as documented. Every primitive content value is not dumped.',
    'The generic discriminator inventory records short type/kind/state/code labels. Free-form text bodies, secrets and instruction contents are not research labels.',
    'ToolNames inventories include configured tools and hook/model copies. Actual called-tool inventories are separate, and execution starts are not guaranteed to complete.',
    'A final Local response position is not automatically a unique conversation part. Unique tool-call IDs are reported separately.',
    'SDK metrics cover all recorded agent scopes and event records. They are not claimed to equal main-chat rendered turns.',
    'The Local askQuestions bug was not fixed or independently audited. A passing verifier does not prove complete semantic fidelity.',
    'The SDK Fusion failure was kept without retries or a production fix. Category failures are in savedFileVerification and raw JSON verification logs.',
    'No LOD implementation, browser readability trial, token budget measurement or claim that all private variants are handled.',
    'Per-file frozen inputs and normal captures are reproducible but not an atomic snapshot across files or databases.',
    'Generated captures and exports remain private. Current best-effort text redaction is not complete sanitization.',
    'Tracking and the parent report are outside this agent output scope. Parent must reconcile WI-052 and the dashboard.',
  ],
  reproduction: {
    freshRun: [
      'Copy these scripts into a new approved ignored run folder; do not overwrite this run.',
      'Set the discovery start cutoff and excluded current session IDs for that new run.',
      'Run node <run>\\261113-discover.mjs.',
      'Run node <run>\\261113-scan.mjs. It freezes selected files with COPYFILE_EXCL.',
      'Run node <run>\\261113-export.mjs. It refuses to overwrite output/logs and keeps exporter captures.',
      'Run node <run>\\261113-findings.mjs.',
    ],
    frozenRescan: 'node temp-tool-output\\261113-121310-lod-research\\corpus\\261113-scan.mjs --reuse-frozen',
    sourceProtection: 'Scripts open native stores for reads only. All writes are under this run. Frozen-rescan reads the existing snapshots and rechecks original file hashes.',
    exactExportCommands: 'selectedSamples[].export and selectedSamples[].savedFileVerify hold executable, args, cwd, environment, timings, exit codes and relative stdout/stderr logs.',
  },
};

fs.writeFileSync(path.join(output, 'findings.json'), JSON.stringify(findings, null, 2));
console.log(JSON.stringify({ saved: 'findings.json', totals: findings.totals, markdown: artifactMetrics.map(artifact => ({ label: artifact.label, bytes: artifact.bytes, lines: artifact.lines, disclosures: artifact.detailsOpenTags, companionFiles: artifact.companionFiles, companionBytes: artifact.companionBytes })), sdkProducerLabels: [...new Set(headers.map(header => header.producer))], sdkHostLabels: [...new Set(headers.map(header => header.hostType))] }, null, 2));
