// Read-only scan of Local VS Code chat journals and agent session event logs.
// It counts every tool, event, response part and payload variant, and keeps one redacted example per kind.
// Output holds chat excerpts, so it must stay under work-items/notes/WI-052/private-examples/.
//
// Add --recover to restore complete evidence for the existing snapshot, without selecting new examples or changing counts.
// Usage: node --max-old-space-size=8192 work-items\notes\WI-052\catalogue\scan-sessions.mjs [--recover] [--out <file>] [--exclude <id,id>] [--only local|sdk] [--limit <n>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isoDate, prepareExample, privateFolder, recoverExample, replaceMilExample, requirePrivateOutput, shortHash } from './common.mjs';

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const outFile = requirePrivateOutput(option('--out') ?? path.join(privateFolder, 'scan.private.json'));
const excluded = new Set((option('--exclude') ?? '').split(',').filter(Boolean));
const only = option('--only');
const limit = option('--limit') ? Number(option('--limit')) : Infinity;
const recoveryScan = args.includes('--recover') ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : null;
if (recoveryScan && (recoveryScan.schema !== 'wi052-catalogue-scan/1' || !Array.isArray(recoveryScan.rows) || !Array.isArray(recoveryScan.sources)))
  throw new Error('Recovery requires an existing wi052-catalogue-scan/1 snapshot with rows and sources.');
const recoveryTargets = new Map();
for (const row of recoveryScan?.rows ?? []) {
  for (const example of row.examples ?? []) {
    if (example.synthetic || !example.clipped?.length || example.fullEvidence?.status === 'complete')
      continue;
    example.fullEvidence = { status: 'unavailable', reason: 'The original source record is missing or no longer matches its saved hash. This is the saved preview.' };
    if (!recoveryTargets.has(row.key))
      recoveryTargets.set(row.key, []);
    recoveryTargets.get(row.key).push({ example, row });
  }
}
if (recoveryScan && !recoveryTargets.size) {
  console.error('This snapshot has no shortened examples awaiting complete-evidence recovery. No files changed.');
  process.exit(0);
}

const rows = new Map();
const sources = [];
const problems = [];
const attemptLimit = 40;
const replaceLimit = 6;

function getRow(key, type, name) {
  let row = rows.get(key);
  if (!row) {
    row = { key, type, name, counts: {}, sessions: { local: new Set(), sdk: new Set() }, days: new Set(), first: null, last: null, fields: {}, inputKeys: {}, resultKeys: {}, origin: {}, slots: {} };
    rows.set(key, row);
  }
  return row;
}

function touch(row, unit, family, sid, day, amount = 1) {
  row.counts[unit] = (row.counts[unit] ?? 0) + amount;
  row.sessions[family].add(sid);
  if (!day)
    return;
  row.days.add(day);
  if (!row.first || day < row.first)
    row.first = day;
  if (!row.last || day > row.last)
    row.last = day;
}

function addKeys(bucket, object) {
  if (!object || typeof object !== 'object' || Array.isArray(object))
    return;
  for (const key of Object.keys(object)) {
    if (!(key in bucket) && Object.keys(bucket).length >= 80)
      continue;
    bucket[key] = (bucket[key] ?? 0) + 1;
  }
}

function richness(value) {
  let count = 0;
  const walk = (item, depth) => {
    if (!item || typeof item !== 'object' || depth > 2)
      return;
    for (const child of Object.values(Array.isArray(item) ? item.slice(0, 5) : item)) {
      count += 1;
      walk(child, depth + 1);
    }
  };
  walk(value, 0);
  return count;
}

// Keeps the richest example under the size band for each row and slot. It stops trying after a fixed number of attempts to bound scan time.
function offer(row, slot, value, meta) {
  if (recoveryScan) {
    for (const target of recoveryTargets.get(row.key) ?? []) {
      const example = target.example;
      if (example.sid !== meta.sid || example.slot !== slot || example.locator !== meta.locator)
        continue;
      const recovered = recoverExample(example, value, row.name);
      if (recovered) {
        target.row.examples[target.row.examples.indexOf(example)] = recovered;
        target.example = recovered;
      }
    }
    return;
  }
  const current = row.slots[slot];
  if (current && (current.attempts >= attemptLimit || current.replacements >= replaceLimit))
    return;
  if (current)
    current.attempts += 1;
  const length = JSON.stringify(value)?.length ?? 0;
  const score = richness(value) * 10 - (length > 12000 ? 200 : 0) - (length < 60 ? 100 : 0) + Math.min(length, 4000) / 400;
  if (current && score <= current.score)
    return;
  const example = replaceMilExample({ ...meta, slot, value }, row.name);
  const prepared = prepareExample(example.value);
  row.slots[slot] = { ...example, ...prepared, score, attempts: (current?.attempts ?? 0) + 1, replacements: (current?.replacements ?? -1) + 1 };
}

function discoverLocal(folder, found) {
  if (!fs.existsSync(folder))
    return;
  let entries = [];
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch (error) {
    problems.push({ folder: shortHash(folder), code: error.code ?? error.name });
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink())
      continue;
    const child = path.join(folder, entry.name);
    if (entry.name === 'chatSessions' || entry.name === 'emptyWindowChatSessions') {
      for (const name of fs.readdirSync(child))
        name.endsWith('.jsonl') && found.push(path.join(child, name));
    } else if (!['node_modules', 'CachedData', 'CachedExtensionVSIXs', 'logs', 'chatEditingSessions', 'resources', 'transcripts'].includes(entry.name)) {
      discoverLocal(child, found);
    }
  }
}

function discover() {
  const files = [];
  if (only !== 'sdk') {
    for (const [channel, folder] of [['stable', 'Code'], ['insiders', 'Code - Insiders']]) {
      const found = [];
      for (const area of ['workspaceStorage', 'globalStorage', 'profiles'])
        discoverLocal(path.join(process.env.APPDATA, folder, 'User', area), found);
      for (const file of found)
        files.push({ family: 'local', channel, file, id: path.basename(file, '.jsonl') });
    }
  }
  if (only !== 'local') {
    const root = path.join(os.homedir(), '.copilot', 'session-state');
    for (const entry of fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }) : []) {
      const file = path.join(root, entry.name, 'events.jsonl');
      entry.isDirectory() && fs.existsSync(file) && files.push({ family: 'sdk', channel: 'agent-host-or-cli', file, id: entry.name });
    }
  }
  return files.filter(item => !excluded.has(item.id)).map(item => ({ ...item, stat: fs.statSync(item.file) }));
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

// Replays the Local journal mutation log: 0 snapshot, 1 set, 2 splice/append, 3 delete.
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
    const values = Array.isArray(record.v) ? record.v : record.v && typeof record.v === 'object' ? Object.keys(record.v).filter(key => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b)).map(key => record.v[key]) : [];
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

function parseArguments(value) {
  if (typeof value !== 'string')
    return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function discriminator(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value.kind ?? value.type ?? null : null;
}

// Round tool-call ids carry a `__vscode-<n>` suffix that the response part's toolCallId doesn't have.
const baseCallId = id => (typeof id === 'string' ? id.replace(/__vscode-\d+$/, '') : id);

function localToolEvidence(request, toolCallId) {
  const metadata = request?.result?.metadata;
  const rounds = Array.isArray(metadata?.toolCallRounds) ? metadata.toolCallRounds : [];
  const wanted = baseCallId(toolCallId);
  let call = null;
  for (const round of rounds) {
    call = (Array.isArray(round?.toolCalls) ? round.toolCalls : []).find(item => baseCallId(item?.id) === wanted) ?? call;
  }
  const results = metadata?.toolCallResults && typeof metadata.toolCallResults === 'object' ? metadata.toolCallResults : {};
  const resultKey = Object.keys(results).find(key => baseCallId(key) === wanted);
  const result = resultKey === undefined ? null : results[resultKey];
  return { call: call ? { ...call, arguments: parseArguments(call.arguments) } : null, result };
}

function analyzeLocal(state, source) {
  const { sid, day: fileDay } = source;
  const touchRow = (key, type, name, unit, day) => {
    const row = getRow(key, type, name);
    touch(row, unit, 'local', sid, day ?? fileDay);
    return row;
  };
  for (const key of Object.keys(state ?? {})) {
    const row = touchRow(`local-session-field:${key}`, 'Local session field', key, 'localSessions', fileDay);
    const value = key === 'requests' ? { note: 'Array of request records. Each request has the fields listed under Local request field.', count: Array.isArray(state[key]) ? state[key].length : null } : state[key];
    offer(row, 'local:typical', value, { family: 'local', sid, locator: `session.${key}`, when: fileDay });
  }
  const requests = Array.isArray(state?.requests) ? state.requests : [];
  source.requests = requests.length;
  for (const [index, request] of requests.entries()) {
    if (!request || typeof request !== 'object')
      continue;
    const day = isoDate(request.timestamp) ?? fileDay;
    for (const key of Object.keys(request)) {
      if (key === 'response')
        continue;
      const row = touchRow(`local-request-field:${key}`, 'Local request field', key, 'localRequests', day);
      offer(row, 'local:typical', request[key], { family: 'local', sid, locator: `requests[${index}].${key}`, when: day });
    }
    for (const [partIndex, part] of (Array.isArray(request.message?.parts) ? request.message.parts : []).entries()) {
      const kind = discriminator(part) ?? '(no discriminator)';
      const row = touchRow(`local-prompt-part:${kind}`, 'Local prompt part', kind, 'localParts', day);
      offer(row, 'local:typical', part, { family: 'local', sid, locator: `requests[${index}].message.parts[${partIndex}]`, when: day });
    }
    for (const [varIndex, variable] of (Array.isArray(request.variableData?.variables) ? request.variableData.variables : []).entries()) {
      const kind = discriminator(variable) ?? '(no discriminator)';
      const row = touchRow(`local-attachment:${kind}`, 'Local attachment', kind, 'localParts', day);
      offer(row, 'local:typical', variable, { family: 'local', sid, locator: `requests[${index}].variableData.variables[${varIndex}]`, when: day });
    }
    const response = Array.isArray(request.response) ? request.response : [];
    const lastTool = new Map();
    for (const [partIndex, part] of response.entries()) {
      if (part?.kind === 'toolInvocationSerialized')
        lastTool.set(part.toolCallId ?? `position:${partIndex}`, { part, partIndex });
    }
    for (const [partIndex, part] of response.entries()) {
      const kind = typeof part === 'string' ? '(plain string)' : part?.kind ?? '(markdown record, no kind)';
      const row = touchRow(`local-part:${kind}`, 'Local response part', kind, 'localParts', day);
      addKeys(row.fields, part);
      if (kind !== 'toolInvocationSerialized')
        offer(row, 'local:typical', part, { family: 'local', sid, locator: `requests[${index}].response[${partIndex}]`, when: day });
      if (kind === 'questionCarousel') {
        for (const [questionIndex, question] of (Array.isArray(part.questions) ? part.questions : []).entries()) {
          const variant = `${question?.type ?? '(no type)'}${question?.allowFreeformInput ? '+freeform' : ''}${Array.isArray(question?.options) && question.options.length ? '+options' : ''}`;
          const questionRow = touchRow(`local-question:${variant}`, 'Local question variant', variant, 'localQuestions', day);
          offer(questionRow, 'local:typical', { question, answer: part.data?.[question?.id] ?? null, isUsed: part.isUsed ?? null }, { family: 'local', sid, locator: `requests[${index}].response[${partIndex}].questions[${questionIndex}]`, when: day });
        }
      }
    }
    for (const [identity, { part, partIndex }] of lastTool) {
      const name = part.toolId ?? '(missing toolId)';
      const row = touchRow(`tool:${name}`, 'Tool', name, 'localCalls', day);
      addKeys(row.fields, part);
      addKeys(row.resultKeys, part.resultDetails);
      const evidence = localToolEvidence(request, part.toolCallId);
      addKeys(row.inputKeys, evidence.call?.arguments);
      const originValue = part.source === undefined ? '(no source field)' : typeof part.source === 'string' ? part.source : JSON.stringify(part.source).slice(0, 80);
      row.origin[`local source: ${originValue}`] = (row.origin[`local source: ${originValue}`] ?? 0) + 1;
      const failed = part.resultDetails?.isError === true;
      const where = { family: 'local', sid, locator: `requests[${index}].response[${partIndex}] (${identity})`, when: day };
      offer(row, failed ? 'local:error' : 'local:ok', { part, recordedCall: evidence.call, recordedResult: evidence.result }, where);
      offer(getRow('local-part:toolInvocationSerialized', 'Local response part', 'toolInvocationSerialized'), 'local:typical', part, where);
      const dataKind = part.toolSpecificData ? discriminator(part.toolSpecificData) ?? '(no kind)' : '(none)';
      const dataRow = touchRow(`local-tool-data:${dataKind}`, 'Local tool data', dataKind, 'localCalls', day);
      offer(dataRow, 'local:typical', part.toolSpecificData ?? { note: 'No toolSpecificData on this call.', toolId: name }, { family: 'local', sid, locator: `requests[${index}].response[${partIndex}].toolSpecificData`, when: day });
      const details = part.resultDetails;
      const detailKind = details === undefined || details === null ? '(none)' : Array.isArray(details) ? 'array of locations' : discriminator(details) ?? `object: ${Object.keys(details).sort().slice(0, 5).join(', ')}`;
      const detailRow = touchRow(`local-result-details:${detailKind}`, 'Local result details', detailKind, 'localCalls', day);
      offer(detailRow, 'local:typical', details ?? { note: 'No resultDetails on this call.', toolId: name }, { family: 'local', sid, locator: `requests[${index}].response[${partIndex}].resultDetails`, when: day });
    }
  }
}

function resultContentTypes(result) {
  return Array.isArray(result?.contents) ? result.contents.map(item => item?.type).filter(Boolean) : [];
}

// The agent's ask_user tool takes either a form schema or a question with choices. Name each variant by what the user can do.
function sdkQuestionVariants(input) {
  const properties = input?.requestedSchema?.properties;
  if (properties && typeof properties === 'object') {
    return [...new Set(Object.values(properties).map(property => {
      const hasOptions = Array.isArray(property?.enum) || Array.isArray(property?.oneOf) || Array.isArray(property?.items?.enum) || Array.isArray(property?.items?.anyOf);
      return `form field: ${property?.type ?? '(no type)'}${hasOptions ? ' with options' : ''}`;
    }))];
  }
  if (Array.isArray(input?.choices))
    return [input.allow_freeform === false ? 'question with choices only' : 'question with choices and free text'];
  return ['question with free text only'];
}

// JSON strings can contain U+2028/U+2029. Only LF separates JSONL records, unlike Node's readline.
async function* jsonLines(source) {
  let pending = '';
  const input = fs.createReadStream(source.file, { encoding: 'utf8', ...(source.byteLimit ? { end: source.byteLimit - 1 } : {}) });
  for await (const chunk of input) {
    const lines = (pending + chunk).split('\n');
    pending = lines.pop();
    yield* lines;
  }
  if (pending)
    yield pending;
}

async function scanLocal(source) {
  let state = null;
  for await (const line of jsonLines(source)) {
    if (!line.trim())
      continue;
    source.lines += 1;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      source.parseErrors += 1;
      continue;
    }
    try {
      state = replay(state, record);
    } catch (error) {
      source.replayErrors += 1;
      source.replayMessages.add(error.message);
    }
  }
  analyzeLocal(state, source);
}

async function scanSdk(source) {
  const pending = new Map();
  const { sid } = source;
  for await (const line of jsonLines(source)) {
    if (!line.trim())
      continue;
    source.lines += 1;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      source.parseErrors += 1;
      continue;
    }
    const type = typeof event?.type === 'string' ? event.type : '(missing type)';
    const data = event?.data && typeof event.data === 'object' ? event.data : {};
    const day = isoDate(event?.timestamp) ?? source.day;
    const meta = { family: 'sdk', sid, locator: `events.jsonl line ${source.lines}`, when: day };
    const eventRow = getRow(`sdk-event:${type}`, 'SDK event', type);
    touch(eventRow, 'sdkEvents', 'sdk', sid, day);
    addKeys(eventRow.fields, data);
    offer(eventRow, 'sdk:typical', event, meta);
    if (type === 'tool.execution_start') {
      const name = data.toolName ?? '(missing toolName)';
      const row = getRow(`tool:${name}`, 'Tool', name);
      touch(row, 'sdkStarts', 'sdk', sid, day);
      addKeys(row.inputKeys, data.arguments);
      for (const field of ['mcpServerName', 'mcpToolName'])
        data[field] !== undefined && (row.origin[`sdk field: ${field}`] = (row.origin[`sdk field: ${field}`] ?? 0) + 1);
      data.toolCallId && pending.set(data.toolCallId, { event, name, line: source.lines });
    } else if (type === 'tool.execution_complete') {
      const start = pending.get(data.toolCallId);
      pending.delete(data.toolCallId);
      const name = start?.name ?? data.toolName ?? '(unmatched completion)';
      const row = getRow(`tool:${name}`, 'Tool', name);
      const failed = data.success === false;
      touch(row, failed ? 'sdkFailures' : 'sdkCompletions', 'sdk', sid, day);
      addKeys(row.resultKeys, data.result);
      offer(row, failed ? 'sdk:error' : 'sdk:ok', { start: start?.event ?? null, complete: event }, { ...meta, locator: `events.jsonl lines ${start?.line ?? '?'} and ${source.lines}` });
      for (const contentType of resultContentTypes(data.result)) {
        const contentRow = getRow(`sdk-content:${contentType}`, 'SDK result content', contentType);
        touch(contentRow, 'sdkBlocks', 'sdk', sid, day);
        offer(contentRow, 'sdk:typical', data.result.contents.find(item => item?.type === contentType), { ...meta, locator: `events.jsonl line ${source.lines} result.contents[]` });
      }
      if (name === 'ask_user' && start) {
        for (const variant of sdkQuestionVariants(start.event.data.arguments)) {
          const questionRow = getRow(`sdk-question:${variant}`, 'SDK question variant', variant);
          touch(questionRow, 'sdkQuestions', 'sdk', sid, day);
          offer(questionRow, 'sdk:typical', { start: start.event, complete: event }, { ...meta, locator: `events.jsonl lines ${start.line} and ${source.lines}` });
        }
      }
    } else if (type === 'assistant.message') {
      for (const request of Array.isArray(data.toolRequests) ? data.toolRequests : []) {
        const name = request?.name ?? '(missing name)';
        const row = getRow(`tool:${name}`, 'Tool', name);
        touch(row, 'sdkRequests', 'sdk', sid, day);
        offer(row, 'sdk:request', request, { ...meta, locator: `events.jsonl line ${source.lines} toolRequests[]` });
      }
    } else if (type === 'user.message') {
      for (const attachment of Array.isArray(data.attachments) ? data.attachments : []) {
        const kind = attachment?.type ?? '(no type)';
        const row = getRow(`sdk-attachment:${kind}`, 'SDK prompt attachment', kind);
        touch(row, 'sdkAttachments', 'sdk', sid, day);
        offer(row, 'sdk:typical', attachment, { ...meta, locator: `events.jsonl line ${source.lines} attachments[]` });
      }
    }
  }
  for (const { event, name, line } of pending.values()) {
    const row = getRow(`tool:${name}`, 'Tool', name);
    offer(row, 'sdk:ok', { start: event, complete: null }, { family: 'sdk', sid, locator: `events.jsonl line ${line} (no completion recorded)`, when: source.day });
  }
}

const wantedSources = new Set([...recoveryTargets.values()].flat().map(target => target.example.sid));
const found = discover().filter(item => !recoveryScan || recoveryScan.sources.some(source =>
  wantedSources.has(source.sid) && source.family === item.family && source.id === item.id && source.channel === item.channel))
  .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs).slice(0, limit);
const started = Date.now();
for (const [index, item] of found.entries()) {
  const source = {
    sid: shortHash(`${item.family}:${item.id}`),
    family: item.family,
    channel: item.channel,
    id: item.id,
    bytes: item.stat.size,
    mtime: item.stat.mtime.toISOString(),
    day: isoDate(item.stat.mtimeMs),
    file: item.file,
    lines: 0,
    parseErrors: 0,
    replayErrors: 0,
    replayMessages: new Set(),
  };
  if (recoveryScan) {
    const frozen = recoveryScan.sources.find(item => item.sid === source.sid);
    source.byteLimit = frozen.bytes;
    source.day = frozen.day;
  }
  try {
    item.family === 'local' ? await scanLocal(source) : await scanSdk(source);
  } catch (error) {
    problems.push({ sid: source.sid, error: error.message });
  }
  sources.push(source);
  console.error(`${index + 1}/${found.length} ${item.family} ${source.sid} ${(item.stat.size / 1048576).toFixed(1)} MB lines=${source.lines} elapsed=${Math.round((Date.now() - started) / 1000)}s rows=${rows.size}`);
}

const output = {
  schema: 'wi052-catalogue-scan/1',
  created: new Date().toISOString(),
  node: process.version,
  excluded: [...excluded],
  scope: Object.fromEntries(['local', 'sdk'].map(family => [family, {
    files: sources.filter(source => source.family === family).length,
    bytes: sources.filter(source => source.family === family).reduce((sum, source) => sum + source.bytes, 0),
    firstDay: sources.filter(source => source.family === family).map(source => source.day).filter(Boolean).sort()[0] ?? null,
    lastDay: sources.filter(source => source.family === family).map(source => source.day).filter(Boolean).sort().at(-1) ?? null,
  }])),
  problems,
  sources: sources.map(({ file, replayMessages, ...source }) => ({ ...source, replayMessages: [...replayMessages] })),
  rows: [...rows.values()].sort((a, b) => a.key.localeCompare(b.key)).map(row => ({
    key: row.key,
    type: row.type,
    name: row.name,
    counts: row.counts,
    sessions: { local: row.sessions.local.size, sdk: row.sessions.sdk.size },
    days: row.days.size,
    first: row.first,
    last: row.last,
    fields: row.fields,
    inputKeys: row.inputKeys,
    resultKeys: row.resultKeys,
    origin: row.origin,
    examples: Object.values(row.slots).map(({ score, attempts, replacements, ...example }) => example),
  })),
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
if (recoveryScan) {
  const targets = [...recoveryTargets.values()].flat();
  const complete = targets.filter(target => target.example.fullEvidence?.status === 'complete').length;
  const synthetic = targets.filter(target => target.example.privacyReplacement).length;
  recoveryScan.evidenceRecovery = {
    requested: targets.length,
    recovered: complete,
    privacyReplacements: synthetic,
    unavailable: targets.length - complete - synthetic,
    sourceFiles: sources.length,
    sourceErrors: problems.length,
    parseErrors: sources.reduce((sum, source) => sum + source.parseErrors, 0),
    replayErrors: sources.reduce((sum, source) => sum + source.replayErrors, 0),
  };
  console.error(`Complete evidence: ${complete} recovered, ${synthetic} privacy replacements, ${recoveryScan.evidenceRecovery.unavailable} unavailable.`);
  console.error(`Recovery diagnostics: ${problems.length} source errors, ${recoveryScan.evidenceRecovery.parseErrors} parse errors, ${recoveryScan.evidenceRecovery.replayErrors} replay errors.`);
}
fs.writeFileSync(outFile, JSON.stringify(recoveryScan ?? output));
console.error(`Wrote ${(recoveryScan ?? output).rows.length} rows to ${path.relative(process.cwd(), outFile)} in ${Math.round((Date.now() - started) / 1000)}s`);
