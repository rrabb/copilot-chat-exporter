import { createHash } from 'node:crypto';
import type { CompanionArtifact, ContentLocation } from './export-policy.ts';

export interface RecordedImage {
  bytes: Uint8Array | null;
  mimeType: string;
  alt: string;
  recordedLocation?: string;
  location: ContentLocation;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function decodeRecordedImage (value: unknown): Uint8Array | null {
  if (record(value) && typeof value.$base64 === 'string')
    return decodeRecordedImage(value.$base64);
  if (record(value)) {
    const keys = Object.keys(value);
    if (!keys.length || !keys.every((key) => /^\d+$/u.test(key)))
      return null;
    const indices = keys.map(Number).sort((left, right) => left - right);
    if (!indices.every((key, index) => key === index))
      return null;
    return decodeRecordedImage(indices.map((key) => value[String(key)]));
  }
  if (Array.isArray(value))
    return value.length && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255) ? Uint8Array.from(value) : null;
  if (typeof value !== 'string')
    return null;
  const encoded = value.replace(/^data:image\/[^;,]+;base64,/iu, '').replace(/\s/gu, '');
  if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded))
    return null;
  const bytes = Buffer.from(encoded, 'base64');
  return bytes.length && bytes.toString('base64').replace(/=+$/u, '') === encoded.replace(/=+$/u, '') ? bytes : null;
}

/** Reads recorded values only. Paths and URLs are never opened. */
export function collectRecordedImages (value: unknown, location: ContentLocation = { sourceId: 'local-journal', field: 'image' }): RecordedImage[] {
  if (Array.isArray(value))
    return value.flatMap((item) => collectRecordedImages(item, location));
  if (!record(value))
    return [];
  const mimeType = typeof value.mimeType === 'string' ? value.mimeType : typeof value.contentType === 'string' ? value.contentType : '';
  if (/^image\//iu.test(mimeType) || value.kind === 'image' || value.type === 'image') {
    const recordedLocation = ['path', 'filePath', 'fileUri', 'uri', 'url', 'src'].map((key) => value[key])
      .find((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    const bytes = decodeRecordedImage(value.data ?? value.value ?? value.$base64 ?? value.base64);
    // SDK asset descriptors and telemetry do not contain another image.
    if (!bytes && typeof value.assetId === 'string')
      return [];
    if (!bytes && !recordedLocation && value.type !== 'image' && value.kind !== 'image'
      && !['data', 'value', '$base64', 'base64'].some((key) => key in value))
      return [];
    return [{
      bytes, mimeType, alt: typeof value.name === 'string' ? value.name : typeof value.description === 'string' ? value.description : 'Recorded image',
      ...(recordedLocation ? { recordedLocation } : {}), location,
    }];
  }
  return Object.entries(value).flatMap(([key, child]) => collectRecordedImages(child, { ...location, field: `${location.field}.${key}` }));
}

const extensions: Readonly<Record<string, string>> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/avif': 'avif',
  'image/tiff': 'tiff', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
};

export function saveImageCompanion (
  image: RecordedImage,
  sink: { assetsDirectory: string; companions: CompanionArtifact[] },
  preferredName?: string,
) {
  if (!image.bytes)
    return { href: image.recordedLocation ?? null, sha256: null, size: 0, representationChange: null };
  const sha256 = createHash('sha256').update(image.bytes).digest('hex');
  const existing = sink.companions.find((item) => item.kind === 'image'
    && createHash('sha256').update(item.bytes).digest('hex') === sha256);
  const extension = extensions[image.mimeType.toLowerCase()];
  const proposedPath = `${sink.assetsDirectory}/${preferredName ?? `image-${sha256}`}.${extension ?? 'bin'}`;
  const relativePath = existing?.relativePath ?? (sink.companions.some((item) => item.relativePath === proposedPath)
    ? `${sink.assetsDirectory}/image-${sha256}.${extension ?? 'bin'}` : proposedPath);
  existing || sink.companions.push({
    id: `image-${sha256}`, kind: 'image', relativePath,
    mediaType: extension ? image.mimeType : 'application/octet-stream', bytes: image.bytes, location: image.location,
  });
  return {
    href: relativePath, sha256, size: image.bytes.byteLength,
    representationChange: extension ? null : 'Recorded image MIME type is missing or unknown; exact bytes saved as .bin.',
  };
}
