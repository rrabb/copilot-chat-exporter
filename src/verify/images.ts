import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { scanFences } from '../text.ts';
import type { CompanionArtifact } from '../export-policy.ts';

export interface ImageAccount {
  unique: number;
  found: number;
  missing: number;
  referenceOnly: number;
  unresolved: number;
  excludedNotSubmitted: number;
  /** Used by the local corpus report to deduplicate across sources, never payload bytes. */
  hashes: string[];
  foundHashes: string[];
  missingHashes: string[];
  failed: boolean;
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// Independent of the export decoder: verification reads the recorded representation itself.
function recordedBytes (value: unknown): Buffer | null {
  if (typeof value === 'string') {
    const match = /^data:image\/[^;,]+;base64,(.*)$/isu.exec(value);
    const encoded = (match ? match[1]! : value).replace(/\s/gu, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded) || !encoded.length || encoded.length % 4 === 1)
      return null;
    const bytes = Buffer.from(encoded, 'base64');
    return bytes.length && bytes.toString('base64').replace(/=+$/u, '') === encoded.replace(/=+$/u, '') ? bytes : null;
  }
  if (object(value) && '$base64' in value)
    return recordedBytes(value.$base64);
  if (object(value)) {
    const keys = Object.keys(value);
    const indices = keys.map(Number).sort((a, b) => a - b);
    if (!keys.length || !keys.every((key) => /^\d+$/u.test(key)) || indices.some((key, index) => key !== index))
      return null;
    return recordedBytes(indices.map((key) => value[String(key)]));
  }
  if (Array.isArray(value) && value.length && value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255))
    return Buffer.from(value);
  return null;
}

interface RecordedInventory {
  images: Set<string>;
  references: Set<string>;
  unresolved: number;
}

function inventory (value: unknown, assets = new Map<string, string>()): RecordedInventory {
  const result: RecordedInventory = { images: new Set(), references: new Set(), unresolved: 0 };
  const visit = (item: unknown) => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!object(item))
      return;
    const mime = typeof item.mimeType === 'string' ? item.mimeType : item.contentType;
    const image = (typeof mime === 'string' && /^image\//iu.test(mime)) || item.kind === 'image' || item.type === 'image';
    if (image) {
      const bytes = recordedBytes(item.data ?? item.value ?? item.base64 ?? item.$base64);
      if (bytes) {
        result.images.add(hash(bytes));
        return;
      }
      if (typeof item.assetId === 'string' && assets.has(item.assetId)) {
        result.images.add(assets.get(item.assetId)!);
        return;
      }
      const location = ['path', 'filePath', 'fileUri', 'uri', 'url', 'src'].map((key) => item[key])
        .find((entry): entry is string => typeof entry === 'string' && !!entry);
      if (location) {
        result.references.add(location);
        return;
      }
      if (item.type === 'image' || item.kind === 'image' || ['data', 'value', 'base64', '$base64', 'assetId'].some((key) => key in item))
        result.unresolved++;
      return;
    }
    Object.values(item).forEach(visit);
  };
  visit(value);
  return result;
}

/** Links inside fenced code do not prove an artifact was kept. */
function archiveTargets (markdown: string, imagesOnly: boolean): Set<string> {
  const lines = markdown.split(/\r?\n/u);
  const { inside } = scanFences(lines);
  const live = lines.filter((_line, index) => !inside[index]).join('\n');
  const pattern = imagesOnly ? /!\[(?:\\.|[^\]\\])*\]\(([^)\s]+)\)/gu : /!?\[(?:\\.|[^\]\\])*\]\(([^)\s]+)\)/gu;
  const targets = [...live.matchAll(pattern)].map((match) => match[1]!);
  return new Set(targets.map((target) => {
    try {
      return decodeURIComponent(target);
    } catch (error) {
      if (!(error instanceof URIError))
        throw error;
      return target;
    }
  }));
}

function account (recorded: RecordedInventory, markdown: string, companions: readonly CompanionArtifact[], excludedNotSubmitted: number): ImageAccount {
  const targets = archiveTargets(markdown, true);
  const available = new Set(companions.filter((item) => targets.has(item.relativePath)).map((item) => hash(item.bytes)));
  const foundHashes = [...recorded.images].filter((value) => available.has(value)).sort();
  const missingHashes = [...recorded.images].filter((value) => !available.has(value)).sort();
  return {
    unique: recorded.images.size, found: foundHashes.length, missing: missingHashes.length,
    referenceOnly: recorded.references.size, unresolved: recorded.unresolved, excludedNotSubmitted,
    hashes: [...recorded.images].sort(), foundHashes, missingHashes, failed: missingHashes.length > 0,
  };
}

export function verifyLocalImages (requests: readonly unknown[], raw: string, markdown: string, companions: readonly CompanionArtifact[]): ImageAccount {
  let excluded = 0;
  for (const line of raw.split(/\r?\n/u).filter((line) => line.trim())) {
    const entry: unknown = JSON.parse(line);
    if (!object(entry))
      continue;
    const mutation = Array.isArray(entry.k) && ['inputState', 'pendingRequests'].includes(String(entry.k[0]));
    const snapshot = entry.kind === 0 && object(entry.v) ? [entry.v.inputState, entry.v.pendingRequests] : null;
    if (mutation || snapshot) {
      const drafts = inventory(mutation ? entry.v : snapshot);
      excluded += drafts.images.size + drafts.unresolved + drafts.references.size;
    }
  }
  return account(inventory(requests), markdown, companions, excluded);
}

export function verifySdkImages (events: readonly { type: string; data: Record<string, unknown> }[], markdown: string, companions: readonly CompanionArtifact[]): ImageAccount {
  const assets = new Map<string, string>();
  for (const event of events) {
    if (event.type !== 'session.binary_asset')
      continue;
    const bytes = recordedBytes(event.data.data);
    if (bytes && typeof event.data.assetId === 'string')
      assets.set(event.data.assetId, hash(bytes));
  }
  // SDK intentionally excludes hook/model copies. Inspect exported event kinds and their assets.
  const kept = events.filter((event) => ['session.binary_asset', 'user.message', 'tool.execution_complete'].includes(event.type));
  return account(inventory(kept.map((event) => event.data), assets), markdown, companions, 0);
}

/** Reads only linked companions next to this export, never recorded image paths. */
export async function readLinkedImageCompanions (markdown: string, outputPath: string): Promise<CompanionArtifact[]> {
  return readLinkedArchiveCompanions(markdown, outputPath, true);
}

/** Reads only links into this archive's sibling asset folder, never native session locations. */
export async function readLinkedArchiveCompanions (markdown: string, outputPath: string, imagesOnly = false): Promise<CompanionArtifact[]> {
  const directory = path.dirname(path.resolve(outputPath));
  const prefix = `${path.basename(outputPath, path.extname(outputPath)).replace(/\.verify-failed(?:-\d+)?$/u, '')}_assets_`;
  const result: CompanionArtifact[] = [];
  for (const target of archiveTargets(markdown, imagesOnly)) {
    const parts = target.split('/');
    if (parts.length !== 2 || !parts[0]!.startsWith(prefix) || parts.some((part) => !part || part === '..' || part.includes('\\')))
      continue;
    const file = path.join(directory, ...parts);
    try {
      const linkStat = await fs.lstat(file);
      const folderStat = await fs.lstat(path.dirname(file));
      if (linkStat.isSymbolicLink() || folderStat.isSymbolicLink() || !linkStat.isFile())
        throw new Error('Archive companion is not a regular archive file.');
      const text = /\.(?:txt|json|diff|md)$/iu.test(file);
      result.push({ id: target, kind: text ? 'metadata' : 'image', relativePath: target, mediaType: text ? 'text/plain' : 'application/octet-stream',
        bytes: await fs.readFile(file), location: { sourceId: 'export', field: 'image-companion' } });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
        throw error;
      // An absent linked file remains unavailable and is reported as loss by the caller.
    }
  }
  return result;
}
