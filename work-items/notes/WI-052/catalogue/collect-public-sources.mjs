// Collects public and installed facts about Copilot tools and events. Output has no chat text.
//   1. SDK session event types and fields from github/copilot-sdk at a pinned commit.
//   2. Copilot CLI tool names from github/docs at a pinned commit.
//   3. Copilot Chat extension tools from the VS Code installs on this machine (read only).
//   4. Local response part kinds from microsoft/vscode chatService.ts at a pinned commit.
// Usage: node work-items\notes\WI-052\catalogue\collect-public-sources.mjs
import fs from 'node:fs';
import path from 'node:path';
import { catalogueFolder, sha256 } from './common.mjs';

const sdkCommit = 'cf045793958ce674259c557f7769788f94ee20c9';
const sdkPath = 'nodejs/src/generated/session-events.ts';
const docsCommit = '4c6da2fbbfcffe74369bf4974229b5943ba6c02a';
const docsPath = 'content/copilot/reference/copilot-cli-reference/cli-command-reference.md';
const vscodeCommit = '827998555230f67dee66b1ae1521d8398cacb933';
const vscodePath = 'src/vs/workbench/contrib/chat/common/chatService/chatService.ts';

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`${response.status} for ${url}`);
  return response.text();
}

function firstSentence(text, limit = 220) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const end = clean.search(/[.!?](\s|$)/);
  const sentence = end > 0 ? clean.slice(0, end + 1) : clean;
  return sentence.length > limit ? `${sentence.slice(0, limit - 1)}…` : sentence;
}

function docBefore(lines, index) {
  let end = index - 1;
  if (!lines[end]?.trim().endsWith('*/'))
    return '';
  const doc = [];
  for (; end >= 0; end -= 1) {
    doc.unshift(lines[end]);
    if (lines[end].trim().startsWith('/**'))
      break;
  }
  return doc.map(line => line.replace(/^\s*\/?\*+\/?\s?/, '').replace(/\*\/\s*$/, '')).join('\n').trim();
}

// The generated file has one exported interface per event and per payload. Properties sit at two-space indent.
function parseSdkEvents(text) {
  const lines = text.split(/\r?\n/);
  const blocks = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^export interface (\w+)/.exec(lines[index]);
    if (!match)
      continue;
    let end = index + 1;
    while (end < lines.length && lines[end] !== '}')
      end += 1;
    const fields = [];
    for (let line = index + 1; line < end; line += 1) {
      const property = /^  (?:readonly )?("?[\w.$-]+"?)(\?)?: (.*)$/.exec(lines[line]);
      if (!property)
        continue;
      fields.push({
        name: property[1].replaceAll('"', ''),
        optional: Boolean(property[2]),
        type: property[3].replace(/;$/, '').slice(0, 140),
        description: firstSentence(docBefore(lines, line)),
      });
    }
    blocks.set(match[1], { name: match[1], doc: docBefore(lines, index), fields });
  }
  const events = [];
  const contentBlocks = [];
  for (const block of blocks.values()) {
    const typeField = block.fields.find(field => field.name === 'type');
    const literal = /^"([^"]+)"$/.exec(typeField?.type ?? '')?.[1];
    if (!literal)
      continue;
    const dataField = block.fields.find(field => field.name === 'data');
    if (dataField && block.fields.some(field => field.name === 'timestamp')) {
      const dataBlock = blocks.get(dataField.type.trim());
      const described = /^Session event "[^"]+"\.\s*(.*)$/s.exec(block.doc)?.[1] ?? block.doc;
      events.push({
        type: literal,
        interface: block.name,
        description: firstSentence(described),
        experimental: /@experimental/.test(block.doc) || /@experimental/.test(dataBlock?.doc ?? ''),
        deprecated: /@deprecated/.test(block.doc) || /@deprecated/.test(dataBlock?.doc ?? ''),
        dataInterface: dataBlock ? dataBlock.name : null,
        dataFields: dataBlock ? dataBlock.fields.map(({ name, optional, type, description }) => ({ name, optional, type, description })) : [],
      });
    } else {
      contentBlocks.push({ type: literal, interface: block.name, description: firstSentence(block.doc), fields: block.fields.map(field => field.name) });
    }
  }
  return { events: events.sort((a, b) => a.type.localeCompare(b.type)), contentBlocks: contentBlocks.sort((a, b) => a.type.localeCompare(b.type)), interfaces: blocks.size };
}

// The IChatProgress union lists every response part kind the Local chat model can hold. Members with several kinds keep each one.
function parseVscodeProgress(text) {
  const lines = text.split(/\r?\n/);
  const unionStart = lines.findIndex(line => line.startsWith('export type IChatProgress ='));
  if (unionStart < 0)
    throw new Error('IChatProgress union not found.');
  const members = [];
  for (let index = unionStart + 1; index < lines.length; index += 1) {
    const member = /^\s*\| (\w+)(;?)$/.exec(lines[index]);
    if (!member)
      break;
    members.push(member[1]);
    if (member[2])
      break;
  }
  const parts = [];
  for (const name of members) {
    const index = lines.findIndex(line => new RegExp(`^export interface ${name}\\b`).test(line));
    if (index < 0) {
      parts.push({ interface: name, kinds: [], description: '', fields: [], note: 'declared elsewhere' });
      continue;
    }
    let end = index + 1;
    while (end < lines.length && lines[end] !== '}')
      end += 1;
    const body = lines.slice(index + 1, end);
    const kinds = [...new Set(body.map(line => /^\s*(?:readonly )?kind: '([^']+)'/.exec(line)?.[1]).filter(Boolean))];
    const fields = [];
    for (let line = index + 1; line < end; line += 1) {
      const property = /^\t(?:readonly )?(\w+)(\?)?: (.*)$/.exec(lines[line]);
      if (property)
        fields.push({ name: property[1], optional: Boolean(property[2]), type: property[3].replace(/;$/, '').slice(0, 120) });
    }
    parts.push({ interface: name, kinds, description: firstSentence(docBefore(lines, index)), fields });
  }
  return parts;
}

function parseCliTools(markdown) {
  const start = markdown.indexOf('## Tool availability values');
  const end = markdown.indexOf('## Tool permission patterns');
  if (start < 0 || end < 0)
    throw new Error('CLI tool availability section not found.');
  const tools = [];
  let group = '';
  for (const line of markdown.slice(start, end).split(/\r?\n/)) {
    const heading = /^### (.+)$/.exec(line);
    if (heading) {
      group = heading[1];
      continue;
    }
    const row = /^\|\s*(`[^|]+?)\s*\|\s*(.+?)\s*\|$/.exec(line);
    if (!row || row[1].startsWith('Tool'))
      continue;
    for (const name of row[1].match(/`([^`]+)`/g).map(token => token.slice(1, -1)))
      tools.push({ name, group, description: row[2].replace(/`/g, '') });
  }
  return tools;
}

function localExtensions() {
  const roots = [['stable', 'Microsoft VS Code'], ['insiders', 'Microsoft VS Code Insiders']];
  const installs = [];
  for (const [channel, folder] of roots) {
    const base = path.join(process.env.LOCALAPPDATA, 'Programs', folder);
    for (const entry of fs.existsSync(base) ? fs.readdirSync(base, { withFileTypes: true }) : []) {
      const extension = path.join(base, entry.name, 'resources', 'app', 'extensions', 'copilot');
      const app = path.join(base, entry.name, 'resources', 'app', 'package.json');
      if (!entry.isDirectory() || !fs.existsSync(path.join(extension, 'package.json')) || !fs.existsSync(app))
        continue;
      const manifestText = fs.readFileSync(path.join(extension, 'package.json'), 'utf8');
      const nlsFile = path.join(extension, 'package.nls.json');
      installs.push({
        channel,
        vscode: JSON.parse(fs.readFileSync(app, 'utf8')).version,
        extension: JSON.parse(manifestText).version,
        manifest: JSON.parse(manifestText),
        nls: fs.existsSync(nlsFile) ? JSON.parse(fs.readFileSync(nlsFile, 'utf8')) : {},
        sha256: sha256(manifestText),
      });
    }
  }
  return installs;
}

function collectExtensionTools(installs) {
  const tools = new Map();
  const toolSets = new Map();
  for (const install of installs) {
    const label = `${install.channel} VS Code ${install.vscode}, Copilot Chat ${install.extension}`;
    const resolve = value => typeof value === 'string' ? value.replace(/^%(.+)%$/, (_, key) => install.nls[key]?.message ?? install.nls[key] ?? value) : value;
    for (const tool of install.manifest.contributes?.languageModelTools ?? []) {
      const entry = tools.get(tool.name) ?? { name: tool.name, versions: [] };
      entry.toolReferenceName = tool.toolReferenceName ?? null;
      entry.displayName = resolve(tool.displayName) ?? null;
      entry.userDescription = firstSentence(String(resolve(tool.userDescription) ?? ''), 300);
      entry.description = firstSentence(String(tool.modelDescription ?? ''), 300);
      entry.tags = tool.tags ?? [];
      const required = new Set(tool.inputSchema?.required ?? []);
      entry.inputProperties = Object.entries(tool.inputSchema?.properties ?? {}).map(([name, property]) => ({ name, type: property?.type ?? null, required: required.has(name), description: firstSentence(String(property?.description ?? ''), 160) }));
      entry.versions.push(label);
      tools.set(tool.name, entry);
    }
    for (const set of install.manifest.contributes?.languageModelToolSets ?? [])
      toolSets.set(set.name, { name: set.name, referenceName: set.referenceName ?? null, description: firstSentence(String(resolve(set.description) ?? ''), 200), tools: set.tools ?? [] });
  }
  return {
    installs: installs.map(({ channel, vscode, extension, sha256: hash }) => ({ channel, vscode, extension, manifestSha256: hash })),
    tools: [...tools.values()].sort((a, b) => a.name.localeCompare(b.name)),
    toolSets: [...toolSets.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

const sdkText = await fetchText(`https://raw.githubusercontent.com/github/copilot-sdk/${sdkCommit}/${sdkPath}`);
const docsText = await fetchText(`https://raw.githubusercontent.com/github/docs/${docsCommit}/${docsPath}`);
const vscodeText = await fetchText(`https://raw.githubusercontent.com/microsoft/vscode/${vscodeCommit}/${vscodePath}`);
const sdk = parseSdkEvents(sdkText);
const vscodeParts = parseVscodeProgress(vscodeText);
const cliTools = parseCliTools(docsText);
const extension = collectExtensionTools(localExtensions());

const output = {
  schema: 'wi052-public-sources/1',
  note: 'Derived facts only. No chat text. Evidence labels: documented (CLI docs), inferred from source (SDK generated types, extension manifests).',
  sdk: { repository: 'github/copilot-sdk', commit: sdkCommit, path: sdkPath, sourceBytes: Buffer.byteLength(sdkText), sourceSha256: sha256(sdkText), interfaces: sdk.interfaces, events: sdk.events, contentBlocks: sdk.contentBlocks },
  cliDocs: { repository: 'github/docs', commit: docsCommit, path: docsPath, sourceSha256: sha256(docsText), tools: cliTools },
  vscode: { repository: 'microsoft/vscode', commit: vscodeCommit, path: vscodePath, sourceSha256: sha256(vscodeText), progressParts: vscodeParts },
  extension,
  machine: { platform: process.platform, node: process.version },
};
fs.writeFileSync(path.join(catalogueFolder, 'public-sources.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ vscodeProgressParts: vscodeParts.length, vscodeKinds: vscodeParts.flatMap(part => part.kinds).length, events: sdk.events.length, contentBlocks: sdk.contentBlocks.length, interfaces: sdk.interfaces, cliTools: cliTools.length, extensionTools: extension.tools.length, toolSets: extension.toolSets.length, installs: extension.installs }, null, 2));
