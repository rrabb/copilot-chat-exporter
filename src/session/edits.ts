import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EditOperation, FileTouch, ParsedSession, PatchFileChange, ToolPatch } from '../types.ts';
import { workspacePath } from '../host.ts';
import { parseJson } from '../text.ts';

function normalizedFile (value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '').replaceAll('\\', '/');
}

function diffBody (lines: string[]) {
  return lines.map((line) => {
    if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))
      return line;
    if (line.startsWith('@@')) {
      const anchor = line.slice(2).trim();
      return anchor ? `@@ ${anchor} @@` : '@@';
    }
    return ` ${line}`;
  });
}

export function parseV4aPatch (source: string): PatchFileChange[] {
  const lines = String(source).replaceAll('\r\n', '\n').split('\n');
  const begin = lines.findIndex((line) => line === '*** Begin Patch');
  const end = lines.lastIndexOf('*** End Patch');
  if (begin < 0 || end <= begin)
    return [];

  const changes: PatchFileChange[] = [];
  const fileHeader = /^\*\*\* (Add|Update|Delete) File: (.+)$/;
  let index = begin + 1;
  while (index < end) {
    const header = fileHeader.exec(lines[index]);
    if (!header) {
      index += 1;
      continue;
    }

    const action = header[1];
    const previousFile = normalizedFile(header[2]);
    let file = previousFile;
    const body: string[] = [];
    index += 1;
    while (index < end && !fileHeader.test(lines[index])) {
      const move = /^\*\*\* Move to: (.+)$/.exec(lines[index]);
      if (move)
        file = normalizedFile(move[1]);
      else if (!lines[index].startsWith('***'))
        body.push(lines[index]);
      index += 1;
    }

    const additions = body.filter((line) => line.startsWith('+')).length;
    const deletions = body.filter((line) => line.startsWith('-')).length;
    const op: EditOperation = action === 'Add' ? 'created' : action === 'Delete' ? 'deleted' : (file !== previousFile ? 'renamed' : 'modified');
    const oldHeader = op === 'created' ? '/dev/null' : `a/${previousFile}`;
    const newHeader = op === 'deleted' ? '/dev/null' : `b/${file}`;
    changes.push({
      file,
      ...(file !== previousFile ? { previousFile } : {}),
      op,
      additions,
      deletions,
      diff: [`--- ${oldHeader}`, `+++ ${newHeader}`, ...diffBody(body)].join('\n').trimEnd(),
    });
  }
  return changes;
}

function decodedArguments (value: unknown): unknown {
  if (typeof value !== 'string')
    return value;
  const decoded = parseJson(value);
  return decoded ?? value;
}

function patchSource (value: unknown): string {
  const decoded = decodedArguments(value);
  if (typeof decoded === 'string')
    return decoded.includes('*** Begin Patch') ? decoded : '';
  if (!decoded || typeof decoded !== 'object')
    return '';
  for (const key of ['input', 'patch']) {
    const candidate = (decoded as Record<string, unknown>)[key];
    if (typeof candidate === 'string' && candidate.includes('*** Begin Patch'))
      return candidate;
  }
  return '';
}

function applyPatchRecords (record: any) {
  const candidates = [];
  if (record?.type === 'tool.execution_start') {
    candidates.push({
      toolCallId: record.data?.toolCallId,
      toolName: record.data?.toolName,
      arguments: record.data?.arguments,
      priority: 2,
    });
  }
  if (record?.type === 'assistant.message') {
    for (const request of Array.isArray(record.data?.toolRequests) ? record.data.toolRequests : []) {
      candidates.push({
        toolCallId: request?.toolCallId,
        toolName: request?.name,
        arguments: request?.arguments,
        priority: 1,
      });
    }
  }
  return candidates.filter((candidate) => /apply_?patch/i.test(String(candidate.toolName ?? '')));
}

export function parseTranscriptPatches (raw: string) {
  const candidates = new Map<string, ToolPatch>();
  const priorities = new Map<string, number>();
  const completions = new Map<string, boolean>();
  for (const line of raw.split(/\r?\n/)) {
    const record = parseJson(line);
    if (!record)
      continue;
    if (record.type === 'tool.execution_complete') {
      const toolCallId = typeof record.data?.toolCallId === 'string' ? record.data.toolCallId : '';
      if (toolCallId && typeof record.data?.success === 'boolean')
        completions.set(toolCallId, record.data.success);
    }
    for (const candidate of applyPatchRecords(record)) {
      const toolCallId = typeof candidate.toolCallId === 'string' ? candidate.toolCallId : '';
      const source = patchSource(candidate.arguments);
      const files = source ? parseV4aPatch(source) : [];
      if (!toolCallId || !files.length || candidate.priority < (priorities.get(toolCallId) ?? 0))
        continue;
      candidates.set(toolCallId, { toolCallId, files, succeeded: null });
      priorities.set(toolCallId, candidate.priority);
    }
  }
  const patches = new Map<string, ToolPatch>();
  for (const [toolCallId, patch] of candidates) {
    const succeeded = completions.get(toolCallId) ?? null;
    succeeded !== false && patches.set(toolCallId, { ...patch, succeeded });
  }
  return patches;
}

export async function loadTranscriptPatches (hashRoot: string, sessionId: string) {
  const transcriptPath = path.join(hashRoot, 'GitHub.copilot-chat', 'transcripts', `${sessionId}.jsonl`);
  try {
    return parseTranscriptPatches(await fs.readFile(transcriptPath, 'utf8'));
  } catch {
    return new Map<string, ToolPatch>();
  }
}

function relativeChange (change: PatchFileChange): PatchFileChange {
  const file = workspacePath(change.file);
  const previousFile = change.previousFile ? workspacePath(change.previousFile) : undefined;
  const lines = change.diff.split('\n');
  lines[0] = change.op === 'created' ? '--- /dev/null' : `--- a/${previousFile ?? file}`;
  lines[1] = change.op === 'deleted' ? '+++ /dev/null' : `+++ b/${file}`;
  return { ...change, file, previousFile, diff: lines.join('\n') };
}

function mergeOperation (current: EditOperation, incoming: EditOperation): EditOperation {
  if (current === 'created' || incoming === 'created')
    return 'created';
  if (incoming === 'deleted' || incoming === 'renamed')
    return incoming;
  return current;
}

/** Adds optional transcript evidence without changing journal-owned turn order or tool identity. */
export function attachTranscriptPatches (session: ParsedSession, patches: Map<string, ToolPatch>) {
  const sessionFiles = new Set(session.editedFiles);
  const attachedCalls = new Set<string>();
  for (const turn of session.turns) {
    const touches = new Map<string, FileTouch>(turn.filesTouched.map((touch) => [touch.file, { ...touch }]));
    for (const node of turn.toolNodes) {
      const patch = patches.get(node.toolCallId);
      if (!patch || attachedCalls.has(node.toolCallId))
        continue;
      attachedCalls.add(node.toolCallId);
      node.patchFiles = patch.files.map(relativeChange);
      for (const change of node.patchFiles) {
        const existing = touches.get(change.file);
        const touch: FileTouch = existing ?? { file: change.file, op: change.op, additions: 0, deletions: 0, diffs: [] };
        touch.op = existing ? mergeOperation(existing.op, change.op) : change.op;
        touch.additions = (touch.additions ?? 0) + change.additions;
        touch.deletions = (touch.deletions ?? 0) + change.deletions;
        touch.diffs = [...(touch.diffs ?? []), change.diff];
        touches.set(change.file, touch);
        sessionFiles.add(change.file);
      }
    }
    turn.filesTouched = [...touches.values()];
  }
  session.editedFiles = [...sessionFiles];
  return session;
}