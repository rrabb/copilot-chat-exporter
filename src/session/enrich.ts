// The optional stores that sit beside the journal: tool output bodies, memory files, model
// names, and the version header. Also line counts, which come from the working tree rather than
// from VS Code.
//
// Everything here is best-effort. `chat-session-resources/` in particular is rotated and emptied
// by VS Code, so a missing store yields empty results rather than an error.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getWorkspaceRoot } from '../host.ts';
import { COLLATOR, parseJson } from '../text.ts';
import { readFirstLine } from './locate.ts';

async function walkFiles (directory: string): Promise<string[]> {
  const files: string[] = [];
  try {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory())
        files.push(...await walkFiles(entryPath));
      if (entry.isFile())
        files.push(entryPath);
    }
  } catch {
    // Resources are optional.
  }
  return files;
}

export interface Resource {
  toolCallId?: string;
  filePath: string;
  relative: string;
  bytes: number;
  content: string | null;
}

// Tool output too large to inline is written to its own file, named after the tool call.
export async function loadResources (hashRoot: string, sessionId: string) {
  const resourceRoot = path.join(hashRoot, 'GitHub.copilot-chat', 'chat-session-resources', sessionId);
  const byCall = new Map<string, Resource[]>();
  const resources: Resource[] = [];
  for (const filePath of await walkFiles(resourceRoot)) {
    const relative = path.relative(resourceRoot, filePath).replaceAll('\\', '/');
    const callDir = relative.split('/').find((part) => part.startsWith('call_') || part.startsWith('toolu_'));
    const toolCallId = callDir?.split('__')[0];
    const stat = await fs.stat(filePath);
    let content: string | null = null;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch {
      // Non-text or unreadable resource.
    }
    const resource = { toolCallId, filePath, relative, bytes: stat.size, content };
    resources.push(resource);
    if (toolCallId) {
      const list = byCall.get(toolCallId) ?? [];
      list.push(resource);
      byCall.set(toolCallId, list);
    }
  }
  return { resourceRoot, resources, byCall };
}

// Read from the working tree, so the number reflects the file now rather than at the time of the
// edit. A file that has since moved or been deleted simply has no count.
export async function lineCountsFor (files: string[]) {
  const counts = new Map<string, number>();
  for (const file of files) {
    try {
      const content = await fs.readFile(path.resolve(getWorkspaceRoot(), file), 'utf8');
      counts.set(file, content.split(/\r?\n/).length);
    } catch {
      // File may not exist on disk (untitled, deleted, or outside the workspace).
    }
  }
  return counts;
}

export interface MemoryFile {
  name: string;
  path: string;
  content: string;
}

export async function loadMemoryFiles (hashRoot: string, sessionId: string) {
  const base = path.join(hashRoot, 'GitHub.copilot-chat', 'memory-tool', 'memories');
  const readGroup = async (directory: string) => {
    const group: MemoryFile[] = [];
    try {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.md'))
          continue;
        group.push({ name: entry.name, path: path.join(directory, entry.name), content: await fs.readFile(path.join(directory, entry.name), 'utf8') });
      }
    } catch {
      // Group is optional.
    }
    return group.sort((left, right) => COLLATOR.compare(left.name, right.name));
  };
  // Session-scoped memory is filed under the base64 of the session id.
  const sessionDir = path.join(base, Buffer.from(sessionId).toString('base64'));
  return {
    session: await readGroup(sessionDir),
    repo: await readGroup(path.join(base, 'repo')),
    user: await readGroup(base),
  };
}

export async function readVersions (hashRoot: string, sessionId: string) {
  const transcriptPath = path.join(hashRoot, 'GitHub.copilot-chat', 'transcripts', `${sessionId}.jsonl`);
  try {
    const start = parseJson(await readFirstLine(transcriptPath));
    if (start?.type === 'session.start')
      return { copilotVersion: start.data.copilotVersion, vscodeVersion: start.data.vscodeVersion };
  } catch {
    // Versions are optional.
  }
  return { copilotVersion: 'unknown', vscodeVersion: 'unknown' };
}

// The catalog maps an internal model id to the name shown in the picker. Held here because every
// turn needs it and threading a lookup table through the whole renderer would be noise.
let modelNames = new Map<string, string>();

export async function loadModelNames (hashRoot: string, sessionId: string) {
  const modelsPath = path.join(hashRoot, 'GitHub.copilot-chat', 'debug-logs', sessionId, 'models.json');
  const map = new Map<string, string>();
  try {
    const catalog = parseJson(await fs.readFile(modelsPath, 'utf8'), []);
    for (const model of Array.isArray(catalog) ? catalog : [])
      model?.id && model?.name && map.set(model.id, model.name);
  } catch {
    // Model catalog is optional.
  }
  modelNames = map;
  return map;
}

export function modelName (modelId: string | undefined) {
  if (!modelId)
    return 'unknown';
  const bare = String(modelId).replace(/^copilot\//, '');
  if (modelNames.has(bare))
    return modelNames.get(bare);
  if (bare === 'auto')
    return 'Auto';
  return bare.replace(/[-/]/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}
