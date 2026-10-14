import { parseV4aPatch } from './edits.ts';
import { flattenItems } from './journal.ts';
import { isRecord } from './sdk-events.ts';
import type { ListingFileChange } from './listing-evidence-types.ts';

export function listingRecordedItems (value: unknown): unknown[] | null {
  if (Array.isArray(value))
    return value;
  if (!isRecord(value))
    return null;
  const keys = Object.keys(value);
  return keys.every((key) => /^(?:0|[1-9]\d*)$/u.test(key) && Number.isSafeInteger(Number(key)))
    ? keys.map(Number).sort((a, b) => a - b).map((key) => value[String(key)]) : null;
}

export function listingFileIdentity (value: string): string {
  let file = value.replaceAll('\\', '/');
  if (file.startsWith('file:')) {
    try {
      const uri = new URL(file);
      file = `${uri.hostname ? `//${uri.hostname}` : ''}${decodeURIComponent(uri.pathname)}`;
    } catch {
      return file;
    }
  }
  file = file.replace(/^\/(?=[a-z]:\/)/iu, '');
  return /^[a-z]:\/|^\/\//iu.test(file) ? file.toLowerCase() : file;
}

function textLines (value: string): string[] {
  const text = value.replace(/\r\n?/gu, '\n');
  return text ? (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n') : [];
}

export function listingLineDelta (before: string, after: string) {
  const oldLines = textLines(before);
  const newLines = textLines(after);
  if (!oldLines.length || !newLines.length)
    return { added: newLines.length, removed: oldLines.length, estimated: false };
  if (oldLines.length * newLines.length > 4_000_000)
    return { added: newLines.length, removed: oldLines.length, estimated: true };
  let row = new Uint32Array(newLines.length + 1);
  for (const oldLine of oldLines) {
    const next = new Uint32Array(newLines.length + 1);
    for (let column = 1; column <= newLines.length; column += 1)
      next[column] = oldLine === newLines[column - 1] ? row[column - 1] + 1 : Math.max(row[column], next[column - 1]);
    row = next;
  }
  return { added: newLines.length - row[newLines.length], removed: oldLines.length - row[newLines.length], estimated: false };
}

export function listingToolChanges (name: string, argumentsValue: unknown, source: string): ListingFileChange[] {
  let args: unknown = argumentsValue;
  if (typeof args === 'string' && !args.includes('*** Begin Patch')) {
    try {
      args = JSON.parse(args);
    } catch {
      return [];
    }
  }
  if (/apply_?patch/iu.test(name)) {
    const patch = typeof args === 'string' ? args
      : isRecord(args) ? args.input ?? args.patch : null;
    return typeof patch !== 'string' ? [] : parseV4aPatch(patch).map((file) => ({
      file: file.file, operation: file.op, added: file.additions,
      removed: file.op === 'deleted' && file.deletions === 0 ? null : file.deletions,
      estimated: false, source,
    }));
  }

  if (!isRecord(args))
    return [];
  if (/^(?:copilot_)?(?:create_file|createFile)$/u.test(name) && typeof args.filePath === 'string' && typeof args.content === 'string')
    return [{ file: args.filePath, operation: 'created', added: textLines(args.content).length, removed: 0, estimated: false, source }];
  const replacements = /^(?:copilot_)?(?:multi_replace_string_in_file|multiReplaceString)$/u.test(name)
    ? listingRecordedItems(args.replacements) ?? []
    : /^(?:copilot_)?(?:replace_string_in_file|replaceString)$/u.test(name) ? [args] : [];
  return replacements.flatMap((item: unknown) =>
    isRecord(item) && typeof item.filePath === 'string' && typeof item.oldString === 'string' && typeof item.newString === 'string'
      ? [{ file: item.filePath, operation: 'modified', ...listingLineDelta(item.oldString, item.newString), source }] : []);
}

export function incompleteLocalListingEdits (request: Record<string, unknown>): boolean {
  const result = isRecord(request.result) ? request.result : {};
  const metadata = isRecord(result.metadata) ? result.metadata : {};
  const rounds = listingRecordedItems(metadata.toolCallRounds) ?? [];
  return rounds.some((round) => isRecord(round)
    && (listingRecordedItems(round.toolCalls) ?? []).some((call: unknown) => isRecord(call) && typeof call.name === 'string'
      && /(?:apply_?patch|create_?file|replace_?string|multi_?replace_?string)/iu.test(call.name)
      && listingToolChanges(call.name, call.arguments, 'tool-call').length === 0));
}

export function localListingChanges (request: Record<string, unknown>): ListingFileChange[] {
  const result = isRecord(request.result) ? request.result : {};
  const metadata = isRecord(result.metadata) ? result.metadata : {};
  const rounds = listingRecordedItems(metadata.toolCallRounds) ?? [];
  const changes: ListingFileChange[] = [];
  const seen = new Set<string>();
  for (const round of rounds) {
    if (!isRecord(round))
      continue;
    for (const call of listingRecordedItems(round.toolCalls) ?? []) {
      if (!isRecord(call) || typeof call.name !== 'string')
        continue;
      const identity = typeof call.id === 'string' ? call.id : typeof call.toolCallId === 'string' ? call.toolCallId : null;
      if (identity && seen.has(identity))
        continue;
      identity && seen.add(identity);
      changes.push(...listingToolChanges(call.name, call.arguments, 'request.result.metadata.toolCallRounds'));
    }
  }
  const covered = new Set(changes.map((item) => listingFileIdentity(item.file)));
  for (const raw of flattenItems(request.response)) {
    const part: unknown = raw;
    if (!isRecord(part) || part.kind !== 'textEditGroup')
      continue;
    const uri = part.uri;
    const file = typeof uri === 'string' ? uri : isRecord(uri)
      ? typeof uri.fsPath === 'string' ? uri.fsPath : typeof uri.path === 'string' ? uri.path : typeof uri.external === 'string' ? uri.external : null
      : null;
    if (!file || covered.has(listingFileIdentity(file)))
      continue;
    const edits = [...flattenItems(part.edits)];
    let added = 0;
    let removed = 0;
    let known = edits.length > 0;
    for (const rawEdit of edits) {
      const edit: unknown = rawEdit;
      if (!isRecord(edit) || typeof edit.text !== 'string' || !isRecord(edit.range)) {
        known = false;
        continue;
      }
      added += textLines(edit.text).length;
      const range = edit.range;
      if (typeof range.startLineNumber !== 'number' || typeof range.endLineNumber !== 'number') {
        known = false;
        continue;
      }
      removed += range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn
        ? 0 : Math.max(0, range.endLineNumber - range.startLineNumber + 1);
    }
    changes.push({ file, operation: 'modified', added: known ? added : null, removed: known ? removed : null, estimated: true, source: 'response.textEditGroup' });
  }
  return changes;
}
