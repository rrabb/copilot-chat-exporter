// Builds the LOD format workbench catalogue: one row per tool, event, response part, question or payload kind.
//
// Inputs (all read-only):
//   private-examples/catalogue/scan.private.json   recorded chats (redacted previews and complete evidence)
//   catalogue/public-sources.json                  SDK, CLI docs, VS Code source, installed extension manifest
//   observed-inventory.json, repository-inventory.json, online/findings.json   earlier WI-052 research
//
// Outputs:
//   catalogue/catalogue-index.json                  tracked, no chat text
//   private-examples/catalogue/examples.private.json   redacted recorded examples (private)
//   private-examples/catalogue/template-check.private.json   rendered suggestions (private)
//   catalogue/lod-format-choices.json               created once if missing, never overwritten
//
// Status: documented = named in a public source, observed = seen in a recorded chat or the earlier survey, both = either.
// Origin comes only from recorded fields. A name alone never decides MCP or built-in.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { catalogueFolder, notesFolder, privateFolder, replaceMilExample, requirePrivateOutput } from './common.mjs';
import { buildContext } from './context.mjs';
import { conceptOf, concepts, guiFor, researchByConcept, rowOverrides, sourceLinks, structuralLabel } from './suggestions.mjs';
import { renderTemplate, templateHash } from './template-engine.mjs';

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const scan = readJson(path.join(privateFolder, 'scan.private.json'));
const pub = readJson(path.join(catalogueFolder, 'public-sources.json'));
const observed = readJson(path.join(notesFolder, 'observed-inventory.json'));
const repository = readJson(path.join(notesFolder, 'repository-inventory.json'));
const online = readJson(path.join(notesFolder, 'online', 'findings.json'));

const indexFile = path.join(catalogueFolder, 'catalogue-index.json');
const choicesFile = path.join(catalogueFolder, 'lod-format-choices.json');
const examplesFile = requirePrivateOutput(path.join(privateFolder, 'examples.private.json'));
const checkFile = requirePrivateOutput(path.join(privateFolder, 'template-check.private.json'));

const sentence = (text, max = 150) => {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  const end = clean.search(/[.!?](\s|$)/);
  const first = end > 0 ? clean.slice(0, end + 1) : clean;
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
};
const isName = text => /^[A-Za-z_$][\w.$\-[\]]{0,70}$/.test(text);
const topKeys = (record, limit = 30) => Object.entries(record ?? {})
  .filter(([key]) => isName(key))
  .sort((a, b) => b[1] - a[1])
  .slice(0, limit)
  .map(([name, count]) => ({ name, count }));

// ---------------------------------------------------------------------------------------------------------------
// 1. Collect entries
// ---------------------------------------------------------------------------------------------------------------

const entries = new Map();
function entry(key, type, name) {
  if (!entries.has(key))
    entries.set(key, { key, type, name, observed: null, docs: {}, earlier: null, examples: [], notes: [] });
  return entries.get(key);
}

for (const row of scan.rows) {
  const item = entry(row.key, row.type, row.name);
  item.observed = row;
  item.examples = (row.examples ?? []).map(example => replaceMilExample(example, row.name));
}

const sdkEvents = new Map(pub.sdk.events.map(event => [event.type, event]));
const contentBlocks = new Map(pub.sdk.contentBlocks.map(block => [block.type, block]));
const cliTools = new Map(pub.cliDocs.tools.map(tool => [tool.name, tool]));
const vscodeKinds = new Map();
for (const part of pub.vscode.progressParts) {
  for (const kind of part.kinds)
    vscodeKinds.set(kind, part);
  if (part.interface === 'IChatTask')
    vscodeKinds.set('progressTask', part);
}
const markdownRowName = '(markdown record, no kind)';
const kindAlias = { [markdownRowName]: 'markdownContent' };

const hintRules = [
  ['T44', /^user\.message$/],
  ['T45', /^assistant\.(message|turn_start|turn_end|message_delta)$/],
  ['T46', /^assistant\.reasoning/],
  ['T47', /^tool\.execution_/],
  ['T48', /^subagent\./],
  ['T49', /^skill\.invoked$/],
  ['T50', /^permission\./],
  ['T51', /^(user_input|elicitation)\./],
  ['T52', /^session\.(idle|compaction_|usage_info|usage_checkpoint|shutdown)/],
  ['T53', /^assistant\.usage$/],
];
const onlineById = new Map(online.types.map(type => [type.id, type]));
const sourceById = new Map(online.sources.map(source => [source.id, source]));
const apiIds = online.types.map(type => type.id).filter(id => {
  const number = Number(id.slice(1));
  return number <= 43 || number >= 54;
});

// Documented-only rows
for (const event of pub.sdk.events) {
  entry(`sdk-event:${event.type}`, 'SDK event', event.type);
}
for (const block of pub.sdk.contentBlocks)
  entry(`sdk-content:${block.type}`, 'SDK content block', block.type);
for (const tool of pub.cliDocs.tools)
  entry(`tool:${tool.name}`, 'Tool', tool.name);
for (const tool of pub.extension.tools)
  entry(`tool:${tool.name}`, 'Tool', tool.name);
for (const [kind, part] of vscodeKinds) {
  if (kind === 'markdownContent')
    continue;
  entry(`local-part:${kind}`, 'Local response part', kind);
}
for (const id of apiIds)
  entry(`api:${id}`, 'Public API type', onlineById.get(id).name);

// Earlier survey (32 sources). Names that this scan did not see keep their earlier counts, labelled as such.
const earlierTools = observed.catalogues.toolNames.rows;
for (const [name, localRaw, localUnique, localNames, sdkRaw, sdkRequests, sdkStarts] of earlierTools) {
  const key = `tool:${name}`;
  const item = entry(key, 'Tool', name);
  if (!item.observed)
    item.earlier = { localCalls: localUnique, localNameMentions: localNames, localDefinitionMentions: localRaw, sdkNameMentions: sdkRaw, sdkRequests, sdkStarts };
}
for (const [kind, occurrences, label] of observed.catalogues.localResponseKinds.rows) {
  const key = `local-part:${kind === '(missing)' ? markdownRowName : kind}`;
  const item = entry(key, 'Local response part', kind === '(missing)' ? markdownRowName : kind);
  if (!item.observed)
    item.earlier = { localParts: occurrences };
  item.earlierLabel = label;
}
for (const [type, occurrences, label] of observed.catalogues.sdkEventTypes.rows) {
  const item = entry(`sdk-event:${type}`, 'SDK event', type);
  if (!item.observed)
    item.earlier = { sdkEvents: occurrences };
  item.earlierLabel = label;
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Attach documentation
// ---------------------------------------------------------------------------------------------------------------

function attachDocs(item) {
  const { key, name } = item;
  if (key.startsWith('tool:')) {
    const cli = cliTools.get(name);
    if (cli)
      item.docs.cli = cli;
    const ext = pub.extension.tools.find(tool => tool.name === name || tool.toolReferenceName === name);
    if (ext) {
      item.docs.extension = {
        name: ext.name,
        referenceName: ext.toolReferenceName,
        displayName: ext.displayName,
        userDescription: ext.userDescription,
        description: ext.description,
        tags: ext.tags,
        inputs: ext.inputProperties,
        versions: ext.versions,
      };
    }
  } else if (key.startsWith('sdk-event:')) {
    const event = sdkEvents.get(name);
    if (event) {
      item.docs.sdk = {
        interface: event.interface,
        description: event.description,
        experimental: event.experimental,
        deprecated: event.deprecated,
        fields: event.dataFields.slice(0, 40),
        fieldCount: event.dataFields.length,
      };
    }
    const hints = hintRules.filter(([, pattern]) => pattern.test(name)).map(([id]) => onlineById.get(id)).filter(Boolean);
    if (hints.length)
      item.docs.hints = hints.map(hint => ({ id: hint.id, name: hint.name, lodIdea: hint.lodIdea, caveat: hint.caveat }));
  } else if (key.startsWith('sdk-content:')) {
    const block = contentBlocks.get(name);
    if (block)
      item.docs.sdk = { interface: block.interface, description: block.description, fields: block.fields.map(field => ({ name: field })), fieldCount: block.fields.length };
  } else if (key.startsWith('local-part:')) {
    const part = vscodeKinds.get(kindAlias[name] ?? name);
    if (part)
      item.docs.vscode = { interface: part.interface, description: part.description, fields: part.fields.slice(0, 40), fieldCount: part.fields.length };
  } else if (key.startsWith('api:')) {
    const type = onlineById.get(key.slice(4));
    item.docs.online = {
      id: type.id,
      name: type.name,
      family: type.family,
      structure: type.structure,
      lodIdea: type.lodIdea,
      caveat: type.caveat,
      sources: type.sourceIds.map(id => sourceById.get(id)).filter(Boolean).map(source => ({ id: source.id, title: source.title, version: source.version, url: source.url })),
    };
  }
}
for (const item of entries.values())
  attachDocs(item);

// ---------------------------------------------------------------------------------------------------------------
// 3. Derived columns
// ---------------------------------------------------------------------------------------------------------------

const seenUnits = {
  localSessions: 'Local sessions containing the field',
  localCalls: 'Local tool calls',
  localParts: 'Local response parts',
  localRequests: 'Local requests',
  localQuestions: 'Local questions',
  sdkEvents: 'SDK events',
  sdkStarts: 'SDK tool starts',
  sdkRequests: 'SDK assistant tool requests',
  sdkBlocks: 'SDK content blocks',
  sdkAttachments: 'SDK attachments',
  sdkQuestions: 'SDK questions',
};
const shortUnit = { Local: 'L', SDK: 'S' };
const number = value => value.toLocaleString('en-US');

function seenOf(item) {
  const counts = item.observed?.counts ?? {};
  const parts = Object.entries(seenUnits)
    .filter(([key]) => counts[key] > 0)
    .map(([key, label]) => ({ key, label, value: counts[key] }));
  const failed = counts.sdkFailures ?? 0;
  const chatCount = item.observed ? item.observed.sessions.local + item.observed.sessions.sdk : null;
  const text = parts.length
    ? parts.map(part => `${shortUnit[part.label.split(' ')[0]] ?? ''} ${number(part.value)}`.trim()).join(' · ')
    : '';
  return { parts, failed, chatCount, text };
}

function scanDiagnostics(scan) {
  const diagnostics = { problems: Array.isArray(scan.problems) ? scan.problems.length : null };
  for (const key of ['parseErrors', 'replayErrors']) {
    const counts = scan.sources?.map(source => source[key]);
    const known = Array.isArray(counts) && counts.every(count => Number.isInteger(count) && count >= 0);
    diagnostics[key] = known ? counts.reduce((sum, count) => sum + count, 0) : null;
    diagnostics[`${key}Sources`] = known ? counts.filter(count => count > 0).length : null;
  }
  return diagnostics;
}

function familyOf(item) {
  const sessions = item.observed?.sessions;
  if (sessions) {
    const local = sessions.local > 0;
    const sdk = sessions.sdk > 0;
    if (local && sdk)
      return 'Local + SDK';
    if (local)
      return 'Local';
    if (sdk)
      return 'SDK';
    return item.key.startsWith('sdk-') ? 'SDK' : 'Local';
  }
  return item.earlier ? 'Earlier survey only' : 'Documented only';
}

function originOf(item) {
  if (!item.key.startsWith('tool:'))
    return { value: 'n/a', basis: 'Origin applies to tool rows only.' };
  const localKinds = {};
  const sdkKinds = {};
  const servers = new Set();
  for (const [label, count] of Object.entries(item.observed?.origin ?? {})) {
    const local = /^local source: (.*)$/.exec(label);
    if (local) {
      let kind = 'unknown';
      try {
        const source = JSON.parse(local[1]);
        kind = source.type === 'internal' ? 'built-in' : source.type === 'mcp' ? 'MCP' : source.type === 'extension' ? 'extension' : `other (${source.type})`;
        if (source.serverLabel)
          servers.add(source.serverLabel);
      } catch {
        kind = 'unknown';
      }
      localKinds[kind] = (localKinds[kind] ?? 0) + count;
    } else if (/^sdk field: mcp/.test(label)) {
      sdkKinds.MCP = Math.max(sdkKinds.MCP ?? 0, count);
    }
  }
  const kinds = {};
  for (const [kind, count] of Object.entries(localKinds))
    kinds[kind] = (kinds[kind] ?? 0) + count;
  for (const [kind, count] of Object.entries(sdkKinds))
    kinds[kind] = (kinds[kind] ?? 0) + count;
  const names = Object.keys(kinds);
  const counts = item.observed?.counts ?? {};
  const calls = (counts.localCalls ?? 0) + (counts.sdkStarts ?? 0);
  const recorded = Object.values(kinds).reduce((sum, count) => sum + count, 0);
  if (names.length) {
    return {
      value: names.length === 1 ? names[0] : 'mixed',
      basis: `Recorded on ${number(recorded)} of ${number(calls)} calls${servers.size ? ` (server: ${[...servers].join(', ')})` : ''}.`,
    };
  }
  if (item.docs.cli || item.docs.extension) {
    return {
      value: 'built-in (documented)',
      basis: item.docs.cli ? 'Listed in the Copilot CLI tool reference. No origin field recorded on calls.' : 'Listed in the installed Copilot Chat manifest. No origin field recorded on calls.',
    };
  }
  const requestOnly = (counts.sdkRequests ?? 0) > 0 && calls === 0;
  return {
    value: 'unknown',
    basis: requestOnly
      ? 'Only seen as assistant tool requests, and those records carry no origin fields. Not proven either way.'
      : calls > 0
        ? `No source or MCP fields recorded on ${number(calls)} calls. Not proven either way.`
        : 'Not called in the scanned chats, so no origin was recorded.',
  };
}

function labelOf(item) {
  const ext = item.docs.extension;
  const label = ext?.userDescription
    ?? (item.docs.cli ? item.docs.cli.description : undefined)
    ?? (item.docs.sdk?.description ? sentence(item.docs.sdk.description) : undefined)
    ?? (item.docs.vscode?.description ? sentence(item.docs.vscode.description) : undefined)
    ?? (item.docs.online ? item.docs.online.name : undefined)
    ?? item.earlierLabel
    ?? structuralLabel(item);
  return label ? sentence(label, 170) : undefined;
}

function notesOf(item) {
  const notes = [];
  if (item.earlier && !item.observed) {
    const calls = (item.earlier.localCalls ?? 0) + (item.earlier.sdkRequests ?? 0) + (item.earlier.sdkStarts ?? 0) + (item.earlier.localParts ?? 0) + (item.earlier.sdkEvents ?? 0);
    notes.push(calls > 0
      ? 'Not seen in this scan. The earlier survey of 32 sources counted it, so its counts below come from that survey.'
      : 'Listed in the tool definitions of recorded chats but never called. No example exists.');
  }
  if (item.key.startsWith('sdk-event:') && item.observed && !item.docs.sdk)
    notes.push('Recorded in SDK sessions but not in the public SDK event types at the pinned commit. It may be internal or newer.');
  if (item.key.startsWith('local-part:') && item.docs.vscode && item.name === markdownRowName)
    notes.push('The journal stores this record without a kind. The VS Code source calls it markdownContent.');
  return notes;
}

// Documented-only SDK events and tools get a labelled skeleton so the previews have fields to work with.
function skeletonValue(type) {
  const text = String(type ?? '').trim();
  const literal = /^['"]([^'"]+)['"]/.exec(text);
  if (literal)
    return literal[1];
  if (/\[\]$/.test(text) || /^Array</.test(text))
    return [];
  if (text === 'string')
    return '<string>';
  if (text === 'number')
    return 0;
  if (text === 'boolean')
    return true;
  if (/^\{/.test(text) || /^Record</.test(text))
    return {};
  return `<${text.slice(0, 30)}>`;
}

function skeletonFor(item) {
  const note = 'Synthetic skeleton built from documented field types. It is not a recorded example.';
  if (item.key.startsWith('sdk-event:') && item.docs.sdk) {
    const data = {};
    for (const field of item.docs.sdk.fields)
      data[field.name] = skeletonValue(field.type);
    return { slot: 'doc:skeleton', family: 'sdk', synthetic: true, note, value: { type: item.name, data } };
  }
  if (item.key.startsWith('tool:') && (item.docs.extension || item.docs.cli)) {
    const args = {};
    for (const input of item.docs.extension?.inputs ?? [])
      args[input.name] = skeletonValue(input.type);
    return { slot: 'doc:skeleton', family: 'sdk', synthetic: true, note, value: { start: { type: 'tool.execution_start', data: { toolName: item.name, arguments: args } } } };
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Build rows, suggestions and self-check
// ---------------------------------------------------------------------------------------------------------------

const links = sourceLinks(pub);
const researchFamilies = new Map(repository.families.map(family => [family.family, family]));
const rows = [];
const privateExamples = {};
const checks = {};
const problems = [];

for (const item of entries.values()) {
  const family = familyOf(item);
  const concept = conceptOf(item);
  const conceptInfo = concepts[concept];
  if (!conceptInfo)
    throw new Error(`No concept table entry for "${concept}" (row ${item.key})`);
  const override = rowOverrides[item.key] ?? {};
  const seen = seenOf(item);
  const documented = Boolean(item.docs.cli || item.docs.extension || item.docs.sdk || item.docs.vscode || item.docs.online);
  const seenAnywhere = Boolean(item.observed || item.earlier);
  const status = documented && seenAnywhere ? 'both' : seenAnywhere ? 'observed' : 'documented';
  const examples = item.examples.length ? item.examples : [skeletonFor(item)].filter(Boolean);
  const gui = guiFor({ key: item.key, family }, concept, item.docs);

  const suggest = {
    short: override.short ?? conceptInfo.short,
    medium: override.medium ?? conceptInfo.medium,
    include: override.include ?? conceptInfo.include ?? 'show',
    why: override.why ?? conceptInfo.why ?? '',
    scope: override.short || override.medium ? 'row' : 'concept',
  };
  suggest.shortHash = templateHash(suggest.short);
  suggest.mediumHash = templateHash(suggest.medium);

  const check = { examples: [] };
  const real = examples.filter(example => !example.synthetic);
  for (const example of examples) {
    const context = buildContext({ key: item.key, name: item.name }, example);
    const short = renderTemplate(suggest.short, context);
    const medium = renderTemplate(suggest.medium, context);
    check.examples.push({ slot: example.slot, synthetic: Boolean(example.synthetic), short, medium });
  }
  if (real.length) {
    const realChecks = check.examples.filter(example => !example.synthetic);
    for (const which of ['short', 'medium']) {
      const missingEverywhere = realChecks[0][which].missing.filter(field => realChecks.every(example => example[which].missing.includes(field)));
      if (missingEverywhere.length)
        problems.push({ key: item.key, template: which, missing: missingEverywhere });
    }
  }
  checks[item.key] = check;

  const links_ = [];
  if (item.docs.sdk && links.sdk)
    links_.push(links.sdk);
  if (item.docs.vscode && links.vscode)
    links_.push(links.vscode);
  if (item.docs.cli && links.cli)
    links_.push(links.cli);
  for (const source of item.docs.online?.sources ?? [])
    links_.push({ label: `${source.id}: ${source.title} (${source.version})`, url: source.url });

  const row = {
    id: item.key,
    type: item.type,
    name: item.name,
    label: labelOf(item) ?? conceptInfo.title,
    labelFromConcept: !labelOf(item),
    status,
    concept,
    family,
    origin: originOf(item),
    include: suggest.include,
    seen: { text: seen.text, parts: seen.parts, failed: seen.failed, chatCount: seen.chatCount },
    earlier: item.earlier,
    chats: item.observed ? { local: item.observed.sessions.local, sdk: item.observed.sessions.sdk } : null,
    days: item.observed?.days ?? null,
    first: item.observed?.first ?? null,
    last: item.observed?.last ?? null,
    notes: notesOf(item),
    docs: item.docs,
    fields: topKeys(item.observed?.fields),
    inputKeys: topKeys(item.observed?.inputKeys),
    resultKeys: topKeys(item.observed?.resultKeys),
    gui,
    links: links_,
    suggest,
    exampleSlots: examples.map(example => ({ slot: example.slot, synthetic: Boolean(example.synthetic), ...(example.privacyReplacement ? { privacyReplacement: true } : {}) })),
    hasRecorded: item.examples.some(example => !example.synthetic),
  };
  rows.push(row);
  if (examples.length)
    privateExamples[item.key] = examples;
}
rows.sort((a, b) => a.id.localeCompare(b.id));

// ---------------------------------------------------------------------------------------------------------------
// 5. Concept list, index, examples and checks
// ---------------------------------------------------------------------------------------------------------------

const usedConcepts = [...new Set(rows.map(row => row.concept))].sort();
const conceptList = usedConcepts.map(id => {
  const info = concepts[id];
  return {
    id,
    title: info.title,
    include: info.include ?? 'show',
    why: info.why ?? '',
    short: info.short,
    medium: info.medium,
    shortHash: templateHash(info.short),
    mediumHash: templateHash(info.medium),
    research: (researchByConcept[id] ?? []).map(name => researchFamilies.get(name)).filter(Boolean).map(family => ({ family: family.family, lod: family.lod, caveat: family.caveat })),
    rows: rows.filter(row => row.concept === id).length,
  };
});

const catalogueId = templateHash(rows.map(row => `${row.id}|${row.suggest.shortHash}|${row.suggest.mediumHash}`).join('\n'));
const index = {
  schema: 'wi052-catalogue-index/1',
  catalogueId,
  note: 'Derived facts and suggestions only. No chat text. Recorded examples live in the private examples file.',
  provenance: {
    scan: { created: scan.created, scope: scan.scope, rows: scan.rows.length, diagnostics: scanDiagnostics(scan), excludedCurrentSession: true },
    sdk: { repository: pub.sdk.repository, commit: pub.sdk.commit },
    cliDocs: { repository: pub.cliDocs.repository, commit: pub.cliDocs.commit },
    vscode: { repository: pub.vscode.repository, commit: pub.vscode.commit },
    extension: pub.extension.installs,
  },
  concepts: conceptList,
  rows,
};
writeFileSync(indexFile, `${JSON.stringify(index, null, 1)}\n`);

mkdirSync(privateFolder, { recursive: true });
writeFileSync(examplesFile, JSON.stringify({ schema: 'wi052-catalogue-examples/1', catalogueId, examples: privateExamples }));
writeFileSync(checkFile, JSON.stringify({ schema: 'wi052-template-check/1', catalogueId, problems, checks }));

if (!existsSync(choicesFile)) {
  writeFileSync(choicesFile, `${JSON.stringify({ schema: 'wi052-lod-format-choices/1', catalogueId, saved: null, concepts: {}, rows: {} }, null, 2)}\n`);
  console.log(`Created empty ${path.relative(process.cwd(), choicesFile)}`);
}

// ---------------------------------------------------------------------------------------------------------------
// 6. Console summary
// ---------------------------------------------------------------------------------------------------------------

const count = (items, select) => {
  const map = new Map();
  for (const item of items)
    map.set(select(item), (map.get(select(item)) ?? 0) + 1);
  return [...map].sort((a, b) => b[1] - a[1]).map(([key, value]) => `${key}=${value}`).join(' ');
};
console.log(`Rows: ${rows.length}  catalogueId=${catalogueId}`);
console.log(`By status:  ${count(rows, row => row.status)}`);
console.log(`By family:  ${count(rows, row => row.family)}`);
console.log(`By type:    ${count(rows, row => row.type)}`);
console.log(`By origin:  ${count(rows, row => row.origin.value)}`);
console.log(`By include: ${count(rows, row => row.include)}`);
console.log(`By concept: ${count(rows, row => row.concept)}`);
console.log(`Rows with a recorded example: ${rows.filter(row => row.hasRecorded).length}; privacy replacement only: ${rows.filter(row => !row.hasRecorded && row.exampleSlots.some(example => example.privacyReplacement)).length}; skeleton only: ${rows.filter(row => !row.hasRecorded && row.exampleSlots.length && !row.exampleSlots.some(example => example.privacyReplacement)).length}; no example: ${rows.filter(row => !row.exampleSlots.length).length}`);
console.log(`Label from concept title only: ${rows.filter(row => row.labelFromConcept).length}`);
console.log(`Template problems (field missing in every recorded example): ${problems.length}`);
for (const problem of problems.slice(0, 80))
  console.log(`  ${problem.key} [${problem.template}] missing: ${problem.missing.join(', ')}`);
