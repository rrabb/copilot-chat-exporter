import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const output = process.env.WI052_RESEARCH_OUTPUT;
if (!output || !path.isAbsolute(output) || !path.resolve(output).startsWith(path.resolve('temp-tool-output') + path.sep))
  throw new Error('Set WI052_RESEARCH_OUTPUT to an absolute, new folder under temp-tool-output. See the script README.');
const startedBefore = new Date('2026-11-13T17:13:58Z').getTime();
const excluded = new Set((process.env.WI052_EXCLUDE_SESSIONS ?? '').split(',').filter(Boolean));
const roots = [
  { channel: 'stable', path: path.join(process.env.APPDATA, 'Code') },
  { channel: 'insiders', path: path.join(process.env.APPDATA, 'Code - Insiders') },
];
const files = [];
const problems = [];
const otherChatFiles = [];

function addFile(file, family, root, channel) {
  const stat = fs.statSync(file);
  const id = family === 'local' ? path.basename(file, '.jsonl') : path.basename(path.dirname(file));
  if (excluded.has(id) || stat.mtimeMs >= startedBefore)
    return;
  files.push({ id, family, channel, root, path: file, bytes: stat.size, mtime: stat.mtime.toISOString() });
}

function discoverLocal(folder, root, channel) {
  if (!fs.existsSync(folder))
    return;
  try {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink())
        continue;
      const child = path.join(folder, entry.name);
      if (entry.name === 'chatSessions' || entry.name === 'emptyWindowChatSessions') {
        for (const name of fs.readdirSync(child)) {
          if (name.endsWith('.jsonl'))
            addFile(path.join(child, name), 'local', root, channel);
          else if (fs.statSync(path.join(child, name)).isFile())
            otherChatFiles.push({ root, channel, extension: path.extname(name), bytes: fs.statSync(path.join(child, name)).size });
        }
      } else if (!['node_modules', 'CachedData', 'CachedExtensionVSIXs', 'logs', 'chatEditingSessions', 'resources', 'transcripts'].includes(entry.name)) {
        discoverLocal(child, root, channel);
      }
    }
  } catch (error) {
    problems.push({ folder, code: error.code ?? error.name });
  }
}

for (const root of roots) {
  discoverLocal(path.join(root.path, 'User', 'workspaceStorage'), root.path, root.channel);
  discoverLocal(path.join(root.path, 'User', 'globalStorage'), root.path, root.channel);
  discoverLocal(path.join(root.path, 'User', 'profiles'), root.path, root.channel);
}
const sdkRoot = path.join(os.homedir(), '.copilot', 'session-state');
if (fs.existsSync(sdkRoot)) {
  for (const entry of fs.readdirSync(sdkRoot, { withFileTypes: true })) {
    const file = path.join(sdkRoot, entry.name, 'events.jsonl');
    entry.isDirectory() && fs.existsSync(file) && addFile(file, 'sdk', sdkRoot, 'agent-host-or-cli');
  }
}

const installations = [];
for (const folder of ['.vscode', '.vscode-insiders']) {
  const extensions = path.join(os.homedir(), folder, 'extensions');
  if (!fs.existsSync(extensions))
    continue;
  for (const entry of fs.readdirSync(extensions, { withFileTypes: true })) {
    if (!entry.name.toLowerCase().includes('copilot'))
      continue;
    const manifest = path.join(extensions, entry.name, 'package.json');
    if (!fs.existsSync(manifest))
      continue;
    const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    installations.push({ root: extensions, name: data.name, publisher: data.publisher, version: data.version });
  }
}
for (const channel of ['Microsoft VS Code', 'Microsoft VS Code Insiders']) {
  const install = path.join(process.env.LOCALAPPDATA, 'Programs', channel);
  if (!fs.existsSync(install))
    continue;
  const versions = [install, ...fs.readdirSync(install, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => path.join(install, entry.name))];
  for (const version of versions) {
    const manifest = path.join(version, 'resources', 'app', 'package.json');
    if (!fs.existsSync(manifest))
      continue;
    const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    installations.push({ root: path.dirname(manifest), name: data.name, version: data.version });
    const bundledExtensions = path.join(path.dirname(manifest), 'extensions');
    if (!fs.existsSync(bundledExtensions))
      continue;
    for (const name of fs.readdirSync(bundledExtensions).filter(name => name.toLowerCase().includes('copilot'))) {
      const extensionManifest = path.join(bundledExtensions, name, 'package.json');
      if (!fs.existsSync(extensionManifest))
        continue;
      const extension = JSON.parse(fs.readFileSync(extensionManifest, 'utf8'));
      installations.push({ root: path.dirname(extensionManifest), name: extension.name, publisher: extension.publisher, version: extension.version, bundled: true });
    }
  }
}

const result = {
  created: new Date().toISOString(),
  machine: { platform: process.platform, arch: process.arch, osRelease: os.release(), node: process.version },
  roots: roots.map(root => ({ ...root, exists: fs.existsSync(root.path) })),
  sdkRoot,
  excludedSessionIds: [...excluded],
  excludeModifiedAtOrAfter: new Date(startedBefore).toISOString(),
  installations,
  otherChatFiles,
  problems,
  files: files.sort((a, b) => b.bytes - a.bytes),
};
fs.writeFileSync(path.join(output, 'discovery.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ counts: Object.fromEntries(['local', 'sdk'].map(family => [family, files.filter(file => file.family === family).length])), installations, roots: result.roots, problems }, null, 2));
