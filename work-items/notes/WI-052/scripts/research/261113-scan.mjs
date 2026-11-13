import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const output = process.env.WI052_RESEARCH_OUTPUT;
if (!output || !path.isAbsolute(output) || !path.resolve(output).startsWith(path.resolve('temp-tool-output') + path.sep))
  throw new Error('Set WI052_RESEARCH_OUTPUT to an absolute, new folder under temp-tool-output. See the script README.');
const discovery = JSON.parse(fs.readFileSync(path.join(output, 'discovery.json'), 'utf8'));
const buckets = {};
const sources = [];
const forced = (process.env.WI052_FORCED_PREFIXES ?? '').split(',').filter(Boolean);
const reuseFrozen = process.argv.includes('--reuse-frozen');
const exportResultsPath = path.join(output, 'export-results.json');
const exportedSamples = fs.existsSync(exportResultsPath) ? JSON.parse(fs.readFileSync(exportResultsPath, 'utf8')) : [];
const planPath = path.join(output, 'survey-plan.json');
const typeOf = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function choose() {
  const selected = [];
  for (const family of ['local', 'sdk']) {
    const all = discovery.files.filter(file => file.family === family && file.bytes > 1_000);
    const used = new Set();
    const add = (file, reason) => {
      if (!file || used.has(file.id))
        return;
      selected.push({ ...file, selectionReason: reason });
      used.add(file.id);
    };
    forced.forEach(prefix => add(all.find(file => file.id.startsWith(prefix)), 'Named flawed stress case requested by the research brief.'));
    all.filter(file => file.bytes < 60_000_000).slice(0, 7).forEach(file => add(file, 'Large journal/event stream, bounded below 60 MB.'));
    [...all].sort((a, b) => b.mtime.localeCompare(a.mtime)).slice(0, 4).forEach(file => add(file, 'Recent persisted session before the research started.'));
    [...all].filter(file => file.bytes < 2_000_000).sort((a, b) => a.mtime.localeCompare(b.mtime)).slice(0, 4).forEach(file => add(file, 'Older and smaller counterexample to the rich-session selection.'));
    for (const file of all.filter(file => file.bytes < 15_000_000)) {
      if (used.size >= 16)
        break;
      add(file, 'Medium session to complete the family quota.');
    }
  }
  return selected.map((file, index) => ({ ...file, label: `S${String(index + 1).padStart(3, '0')}` }));
}

const plan = fs.existsSync(planPath) ? JSON.parse(fs.readFileSync(planPath, 'utf8')) : choose();
!fs.existsSync(planPath) && fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
fs.mkdirSync(path.join(output, 'frozen'), { recursive: true });

function count(bucketName, key, context, amount = 1) {
  const bucket = buckets[bucketName] ??= {};
  const entry = bucket[key] ??= { occurrences: 0, sources: {}, examples: [] };
  entry.occurrences += amount;
  entry.sources[context.label] = (entry.sources[context.label] ?? 0) + amount;
  if (entry.examples.length < 3 && !entry.examples.some(example => example.source === context.label && example.location === context.location))
    entry.examples.push({ source: context.label, location: context.location });
}

function normalizedKey(key) {
  if (/^\d+$/.test(key))
    return '[]';
  if (/^(?:[0-9a-f]{24,}|[0-9a-f]{8}-[0-9a-f-]{20,}|(?:call_|toolu_|tooluse_|functions\.)[\w.-]+)$/i.test(key))
    return '{id}';
  if (/^(?:file:|https?:|[A-Za-z]:[\\/])/.test(key))
    return '{path}';
  return key;
}

function signature(value) {
  if (Array.isArray(value))
    return `array<${[...new Set(value.map(typeOf))].sort().join('|')}>`;
  if (object(value))
    return `{${[...new Set(Object.keys(value).map(normalizedKey))].sort().join(',')}}`;
  return typeOf(value);
}

function walk(value, field, context, namespace, parentKey = '') {
  count(`${namespace}.fieldTypes`, `${field}: ${typeOf(value)}`, context);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${field}[]`, { ...context, location: `${context.location}[${index}]` }, namespace, parentKey));
    return;
  }
  if (!object(value))
    return;
  const entries = Object.entries(value);
  if (entries.length > 32 && entries.every(([key]) => /^\d+$/.test(key))) {
    const groups = {};
    for (const [, item] of entries)
      groups[typeOf(item)] = (groups[typeOf(item)] ?? 0) + 1;
    for (const [type, amount] of Object.entries(groups))
      count(`${namespace}.fieldTypes`, `${field}.[]: ${type}`, context, amount);
    count(`${namespace}.numericObjectLengths`, `${field}: ${entries.length}`, context);
    return;
  }
  for (const [key, item] of entries) {
    const next = `${field}.${normalizedKey(key)}`;
    if (typeof item === 'boolean')
      count(`${namespace}.booleanValues`, `${next} = ${String(item)}`, context);
    const discriminator = ['type', 'kind', 'mimeType', 'mime', 'contentType', 'status', 'state', 'role', 'finishReason', 'stopReason', 'errorType'].includes(key);
    const errorCode = key === 'code' && /error|diagnostic/i.test(field) && /^[A-Z][A-Z0-9_]{2,80}$/.test(String(item));
    if ((discriminator || errorCode) && ['string', 'number', 'boolean'].includes(typeof item)) {
      if (String(item).length < 200 && !String(item).includes('\n'))
        count(`${namespace}.discriminators`, `${next} = ${String(item)}`, context);
    }
    if ((['toolName', 'toolId'].includes(key) || key === 'name' && /(?:toolRequests|toolCalls|tools|toolCall)\[\]?$/.test(field)) && typeof item === 'string') {
      count(`${namespace}.toolNames`, item, context);
      count(`${namespace}.toolNamePaths`, `${next} = ${item}`, context);
    }
    if (['arguments', 'input', 'parameters', 'args', 'toolSpecificData'].includes(key)) {
      count(`${namespace}.inputStructures`, `${next}: ${signature(item)}`, context);
      if (typeof item === 'string') {
        try {
          const parsed = JSON.parse(item);
          if (object(parsed) || Array.isArray(parsed)) {
            count(`${namespace}.inputStructures`, `${next} (JSON string): ${signature(parsed)}`, context);
            walk(parsed, `${next}.{parsed-json}`, context, `${namespace}.parsedInputs`);
          }
        } catch {
          count(`${namespace}.inputStructures`, `${next}: non-JSON string`, context);
        }
      }
    }
    if (/^(?:isError|isCanceled|isCancelled|cancelled|canceled|success|complete|isComplete|isHidden)$/.test(key) && ['boolean', 'string'].includes(typeof item))
      count(`${namespace}.states`, `${next} = ${String(item)}`, context);
    if (['version', 'vscodeVersion', 'extensionVersion', 'copilotVersion', 'clientVersion', 'cliVersion', 'sdkVersion'].includes(key) && typeof item === 'string' && /^[\w.+-]{1,60}$/.test(item))
      count(`${namespace}.versions`, `${next} = ${item}`, context);
    walk(item, next, context, namespace, key);
  }
}

function atPath(state, keys, create = true) {
  let current = state;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (current === null || typeof current !== 'object')
      throw new Error('Mutation traverses a non-object.');
    if (current[key] === undefined && create)
      current[key] = typeof keys[index + 1] === 'number' ? [] : {};
    current = current[key];
  }
  return current;
}

function replay(state, record) {
  if (record.kind === 0)
    return structuredClone(record.v);
  const keys = record.k;
  if (!Array.isArray(keys))
    throw new Error('Mutation has no path array.');
  if (record.kind === 1) {
    if (keys.length === 0)
      return structuredClone(record.v);
    atPath(state, keys.slice(0, -1))[keys.at(-1)] = structuredClone(record.v);
  } else if (record.kind === 2) {
    let array = atPath(state, keys);
    if (!Array.isArray(array)) {
      array = [];
      if (keys.length === 0)
        state = array;
      else
        atPath(state, keys.slice(0, -1))[keys.at(-1)] = array;
    }
    if (Number.isInteger(record.i) && record.i >= 0)
      array.length = record.i;
    const values = Array.isArray(record.v) ? record.v : object(record.v) ? Object.keys(record.v).filter(key => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b)).map(key => record.v[key]) : [];
    for (const value of values)
      array.push(structuredClone(value));
  } else if (record.kind === 3) {
    const parent = atPath(state, keys.slice(0, -1), false);
    parent && delete parent[keys.at(-1)];
  } else {
    throw new Error('Unknown mutation kind.');
  }
  return state;
}

function measureText(value, totals = { strings: 0, chars: 0, utf8Bytes: 0, newlines: 0, longestChars: 0 }) {
  if (typeof value === 'string') {
    totals.strings += 1;
    totals.chars += value.length;
    totals.utf8Bytes += Buffer.byteLength(value);
    totals.newlines += value.split('\n').length - 1;
    totals.longestChars = Math.max(totals.longestChars, value.length);
  } else if (Array.isArray(value)) {
    value.forEach(item => measureText(item, totals));
  } else if (object(value)) {
    Object.values(value).forEach(item => measureText(item, totals));
  }
  return totals;
}

function finalLocal(state, source) {
  const requests = Array.isArray(state?.requests) ? state.requests : [];
  const responseKinds = {};
  const responseText = {};
  const toolIds = new Set();
  const toolCalls = new Set();
  const calledTools = {};
  const requestIds = new Set();
  let responseParts = 0;
  const requestRecords = [];
  const questionCarousels = [];
  const stressExport = source.id.startsWith('S001') ? exportedSamples.find(entry => entry.id === source.id)?.artifacts[0] : null;
  const stressMarkdown = stressExport ? fs.readFileSync(path.join(output, stressExport.path), 'utf8') : null;
  const normalizedMarkdown = stressMarkdown?.replace(/\s+/g, ' ').trim() ?? null;
  const answerStrings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(answerStrings) : [];
  for (const [index, request] of requests.entries()) {
    const context = { label: source.label, location: `final.requests[${index}]` };
    const parts = Array.isArray(request?.response) ? request.response : [];
    request?.requestId && requestIds.add(request.requestId);
    count('local.final.requestStructures', signature(request), context);
    for (const [partIndex, part] of parts.entries()) {
      const kind = part?.kind ?? '(missing)';
      responseKinds[kind] = (responseKinds[kind] ?? 0) + 1;
      const metrics = measureText(part);
      responseText[kind] ??= { parts: 0, chars: 0, utf8Bytes: 0, longestChars: 0 };
      responseText[kind].parts += 1;
      responseText[kind].chars += metrics.chars;
      responseText[kind].utf8Bytes += metrics.utf8Bytes;
      responseText[kind].longestChars = Math.max(responseText[kind].longestChars, metrics.longestChars);
      count('local.final.responseKinds', kind, { ...context, location: `${context.location}.response[${partIndex}]` });
      count('local.final.responseStructures', `${kind}: ${signature(part)}`, context);
      part?.toolCallId && toolIds.add(part.toolCallId);
      if (part?.kind === 'questionCarousel') {
        const values = object(part.data) ? Object.values(part.data) : [];
        questionCarousels.push({
          requestIndex: index,
          responseIndex: partIndex,
          questionCount: Array.isArray(part.questions) ? part.questions.length : null,
          used: typeof part.isUsed === 'boolean' ? part.isUsed : null,
          answerDataType: typeOf(part.data),
          answerDataKeys: values.length,
          answerValueTypes: values.map(typeOf),
          answerStringMetrics: measureText(part.data),
          globalSavedMarkdownPresence: stressMarkdown === null ? null : answerStrings(part.data).filter(value => value.trim()).map(value => ({
            sha256: digest(value),
            chars: value.length,
            literalPresent: stressMarkdown.includes(value),
            normalizedWhitespacePresent: normalizedMarkdown.includes(value.replace(/\s+/g, ' ').trim()),
            caveat: 'Whole-file text presence only, not ownership or semantic verification. Markdown escaping can affect literal matching.',
          })),
        });
      }
      if (part?.kind === 'toolInvocationSerialized') {
        const toolName = part.toolId ?? '(missing)';
        const identity = part.toolCallId ?? `position:${index}:${partIndex}`;
        count('local.final.toolInvocationPositions', toolName, context);
        if (!toolCalls.has(identity)) {
          toolCalls.add(identity);
          calledTools[toolName] = (calledTools[toolName] ?? 0) + 1;
          count('local.final.uniqueToolCalls', toolName, context);
        }
      }
      responseParts += 1;
    }
    requestRecords.push({ index, responseParts: parts.length, responseKinds: [...new Set(parts.map(part => part?.kind ?? '(missing)'))], textMetricsAllStringFields: measureText(request) });
  }
  walk(state, 'session', { label: source.label, location: 'final' }, 'local.final');
  source.final = {
    requests: requests.length,
    uniqueRequestIds: requestIds.size,
    responseParts,
    uniqueResponseToolCallIds: toolIds.size,
    uniqueToolInvocationCalls: toolCalls.size,
    calledTools,
    responseKinds,
    responseTextAllStringFields: responseText,
    textMetricsAllStringFields: measureText(state),
    requestsByIndex: requestRecords,
    questionCarousels,
  };
}

async function scan(item) {
  const statBefore = fs.statSync(item.path);
  const frozen = path.join(output, 'frozen', `${item.label}-${item.family}-${item.id}.jsonl`);
  if (fs.existsSync(frozen) && !reuseFrozen)
    throw new Error(`Frozen input exists: ${path.basename(frozen)}. Use a new run directory.`);
  !fs.existsSync(frozen) && fs.copyFileSync(item.path, frozen, fs.constants.COPYFILE_EXCL);
  const bytes = fs.readFileSync(frozen);
  const statAfterCopy = fs.statSync(item.path);
  const source = {
    ...item,
    frozen: path.relative(output, frozen),
    sourceBefore: { bytes: statBefore.size, mtime: statBefore.mtime.toISOString() },
    frozenSha256: digest(bytes),
    frozenBytes: bytes.length,
    frozenCreated: fs.statSync(frozen).birthtime.toISOString(),
    changedDuringCopy: statBefore.size !== statAfterCopy.size || statBefore.mtimeMs !== statAfterCopy.mtimeMs,
    raw: { lines: 0, nonblankRecords: 0, parseErrors: [], mutationKinds: {}, eventTypes: {}, replayErrors: [], eventScopes: {} },
  };
  let state = null;
  const ids = new Set();
  const toolStartIds = new Set();
  const toolCompleteIds = new Set();
  const eventsByType = {};
  const calledTools = {};
  for await (const line of readline.createInterface({ input: fs.createReadStream(frozen), crlfDelay: Infinity })) {
    source.raw.lines += 1;
    if (!line.trim())
      continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      source.raw.parseErrors.push({ line: source.raw.lines, code: error.name, bytes: Buffer.byteLength(line) });
      continue;
    }
    source.raw.nonblankRecords += 1;
    const context = { label: item.label, location: `line ${source.raw.lines}` };
    if (item.family === 'local') {
      const kind = String(record.kind);
      source.raw.mutationKinds[kind] = (source.raw.mutationKinds[kind] ?? 0) + 1;
      count('local.raw.mutationKinds', kind, context);
      count('local.raw.mutationPaths', Array.isArray(record.k) ? record.k.map(key => typeof key === 'number' ? '[]' : normalizedKey(String(key))).join('.') : '(snapshot)', context);
      walk(record, 'mutation', context, 'local.raw');
      try {
        state = replay(state, record);
      } catch (error) {
        source.raw.replayErrors.push({ line: source.raw.lines, reason: error.message, mutationKind: record.kind });
      }
    } else {
      const type = String(record.type ?? '(missing)');
      source.raw.eventTypes[type] = (source.raw.eventTypes[type] ?? 0) + 1;
      count('sdk.raw.eventTypes', type, context);
      count('sdk.raw.eventDataStructures', `${type}: ${signature(record.data)}`, context);
      walk(record, 'event', context, 'sdk.raw');
      record.id && ids.add(record.id);
      const scope = record.agentId ?? record.data?.agentId ?? '(main-or-unlabelled)';
      source.raw.eventScopes[scope] = (source.raw.eventScopes[scope] ?? 0) + 1;
      type === 'tool.execution_start' && record.data?.toolCallId && toolStartIds.add(record.data.toolCallId);
      type === 'tool.execution_complete' && record.data?.toolCallId && toolCompleteIds.add(record.data.toolCallId);
      if (type === 'tool.execution_start') {
        const toolName = record.data?.toolName ?? '(missing)';
        calledTools[toolName] = (calledTools[toolName] ?? 0) + 1;
        count('sdk.calls.executionStarts', toolName, context);
        count('sdk.calls.inputStructures', `${toolName}: ${signature(record.data?.arguments)}`, context);
        walk(record.data?.arguments, `tool[${toolName}].arguments`, context, 'sdk.calls');
      }
      if (type === 'assistant.message' && Array.isArray(record.data?.toolRequests)) {
        for (const request of record.data.toolRequests)
          count('sdk.calls.assistantToolRequests', request.name ?? '(missing)', context);
      }
      if (type === 'tool.execution_complete') {
        count('sdk.calls.completionStructures', signature(record.data?.result), context);
        count('sdk.calls.completionStates', `success=${String(record.data?.success)},error=${typeOf(record.data?.error)}`, context);
      }
      eventsByType[type] ??= { records: 0, stringChars: 0, stringBytes: 0, longestString: 0 };
      const metrics = measureText(record.data);
      eventsByType[type].records += 1;
      eventsByType[type].stringChars += metrics.chars;
      eventsByType[type].stringBytes += metrics.utf8Bytes;
      eventsByType[type].longestString = Math.max(eventsByType[type].longestString, metrics.longestChars);
    }
  }
  if (item.family === 'local') {
    finalLocal(state, source);
  } else {
    source.events = {
      records: source.raw.nonblankRecords,
      uniqueEventIds: ids.size,
      uniqueStartedToolCallIds: toolStartIds.size,
      uniqueCompletedToolCallIds: toolCompleteIds.size,
      startedWithoutCompletion: [...toolStartIds].filter(id => !toolCompleteIds.has(id)).length,
      completedWithoutStart: [...toolCompleteIds].filter(id => !toolStartIds.has(id)).length,
      byType: eventsByType,
      calledTools,
      countingRule: 'Event records across all recorded scopes. Lifecycle start/complete are not unique tool calls. No claim that these equal rendered turns.',
    };
  }
  sources.push(source);
  console.log(JSON.stringify({ label: source.label, id: source.id, family: source.family, bytes: source.frozenBytes, records: source.raw.nonblankRecords, requests: source.final?.requests, parts: source.final?.responseParts, eventTypes: Object.keys(source.raw.eventTypes).length, parseErrors: source.raw.parseErrors.length, replayErrors: source.raw.replayErrors.length }));
}

for (const item of plan)
  await scan(item);
for (const source of sources) {
  const current = fs.statSync(source.path);
  source.sourceAfterSurvey = { bytes: current.size, mtime: current.mtime.toISOString() };
  source.changedThroughSurveyEnd = current.size !== source.sourceBefore.bytes || current.mtime.toISOString() !== source.sourceBefore.mtime;
  source.sourceSha256AfterSurvey = digest(fs.readFileSync(source.path));
  source.hashChangedThroughSurveyEnd = source.sourceSha256AfterSurvey !== source.frozenSha256;
}

const census = {
  created: new Date().toISOString(),
  schemaVersion: 1,
  scope: {
    sources: sources.length,
    frozenBytes: sources.reduce((sum, source) => sum + source.frozenBytes, 0),
    selection: 'Stratified purposeful sample, not a random sample. One source per session ID. Large streams capped at 60 MB in selection.',
    raw: 'Raw Local inventories count mutation payload occurrences, including repeated snapshots and updates. Never treat them as unique conversation parts.',
    final: 'Local final inventories replay all mutation kinds 0/1/2/3 first, including truncate-then-push. Final response positions are not deduplicated by tool lifecycle ID.',
    sdk: 'SDK inventories count every event record and all recorded agent scopes. Unique lifecycle IDs are separate metrics.',
    normalization: 'Array indices and numeric keys become []. UUID/hash/call-ID map keys become {id}; absolute path/URI map keys become {path}. No primitive text values are stored except short discriminator, tool-name, state and version labels.',
    provenance: 'Each inventory count includes per-source counts and up to three concrete source/line or final-state examples.',
    privacy: 'Private original sources are copied solely below this ignored corpus folder. No source body or instruction text is printed.',
    textMetrics: 'Lengths include every string field, including metadata/encoded data, not just reader-visible prose. They are labelled to avoid claiming a prose token total.',
  },
  discovery: { roots: discovery.roots, sdkRoot: discovery.sdkRoot, files: discovery.files.length, installations: discovery.installations, machine: discovery.machine },
  sources,
  inventories: buckets,
};
fs.writeFileSync(path.join(output, 'census.json'), JSON.stringify(census, null, 2));
console.log(JSON.stringify({ saved: 'census.json', sources: sources.length, inventoryGroups: Object.keys(buckets).length, frozenBytes: census.scope.frozenBytes }));
