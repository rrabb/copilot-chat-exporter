// Shared helpers for the WI-052 LOD format workbench scripts: hashing, redaction and size limits.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const catalogueFolder = path.dirname(fileURLToPath(import.meta.url));
export const notesFolder = path.dirname(catalogueFolder);
export const repoRoot = path.resolve(notesFolder, '..', '..', '..');
export const privateFolder = path.join(notesFolder, 'private-examples', 'catalogue');

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function shortHash(value, length = 10) {
  return sha256(String(value)).slice(0, length);
}

export function hasMilReference(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return /[a-z0-9_-]+(?:\.|%2e|\\u002e)mil\b/i.test(text ?? '');
}

// Replace the whole example, not just its URL, so nearby text cannot identify the original service.
export function replaceMilExample(example, toolName) {
  if (!hasMilReference(example))
    return example;
  const strings = new Map();
  const types = new Set(['tool.execution_start', 'tool.execution_complete', 'singleSelect', 'multiSelect', 'text', 'markdown', 'toolInvocationSerialized']);
  const syntheticValue = (value, key = '') => {
    if (typeof value === 'string') {
      if (!value)
        return value;
      if ((key === 'type' || key === 'kind') && types.has(value))
        return value;
      if (['toolName', 'toolId', 'name'].includes(key) && value === toolName && !hasMilReference(value))
        return value;
      if (!strings.has(value)) {
        const index = strings.size + 1;
        const text = key === 'timestamp' ? '2000-01-01T00:00:00.000Z'
          : /^(?:url|uri)$/i.test(key) ? `https://example.invalid/synthetic-${index}`
          : `synthetic-${index}`;
        strings.set(value, text);
      }
      return strings.get(value);
    }
    if (typeof value === 'number')
      return key === 'exitCode' && value !== 0 ? 1 : 0;
    if (Array.isArray(value))
      return value.map(item => syntheticValue(item, key));
    if (value && typeof value === 'object') {
      const result = {};
      let index = 0;
      for (const [field, child] of Object.entries(value)) {
        let safeField = field;
        if (hasMilReference(field)) {
          do {
            safeField = `synthetic-field-${++index}`;
          } while (Object.hasOwn(value, safeField) || Object.hasOwn(result, safeField));
        }
        Object.defineProperty(result, safeField, { value: syntheticValue(child, field), enumerable: true, configurable: true, writable: true });
      }
      return result;
    }
    return value;
  };
  const value = syntheticValue(example.value);
  return {
    family: example.family,
    slot: example.slot,
    synthetic: true,
    privacyReplacement: true,
    note: 'Synthetic replacement for an example containing a military domain reference. Text, numbers and source metadata were replaced. Field structure and failure flags remain.',
    value,
    clipped: [],
    bytes: Buffer.byteLength(JSON.stringify(value) ?? 'null'),
  };
}

const redactionPatterns = [
  // `[\\/]+` also matches paths that were JSON-stringified once or twice (doubled backslashes).
  [/[A-Z](?::|%3A)[\\/]+Users[\\/]+[^\\/\s"'<>]+/gi, '<home>'],
  [/\/Users\/[^/\s"'<>]+/g, '<home>'],
  [/[A-Z](?::|%3A)[\\/]+_DATA[\\/]+[^\s"'<>]*/gi, '<private-project-path>'],
  [/\b[A-Z]-_DATA-[A-Za-z0-9._-]*/gi, '<private-project-id>'],
  [/\b[A-Z]-Users-[A-Za-z0-9._-]*/gi, '<private-project-id>'],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '<email>'],
  [/\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}\b/g, '<credential>'],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, '<credential>'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '<credential>'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '<credential>'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/g, '$1 <credential>'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '<private-key>'],
  [/\b((?:password|passwd|secret|token|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi, '$1<credential>'],
];
const guidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function redactText(text) {
  let result = text;
  for (const [pattern, replacement] of redactionPatterns)
    result = result.replace(pattern, replacement);
  return result.replace(guidPattern, match => `id-${shortHash(match.toLowerCase(), 8)}`);
}

const base64Pattern = /^[A-Za-z0-9+/=\r\n]{400,}$/;

// Clips long strings, long arrays and wide objects so one example stays readable. Records what was clipped.
export function clipValue(value, limits, clipped, trail = '') {
  if (typeof value === 'string') {
    if (base64Pattern.test(value)) {
      clipped.push({ path: trail, chars: value.length, reason: 'base64' });
      return `<base64 data, ${value.length} chars>`;
    }
    if (value.length > limits.string) {
      clipped.push({ path: trail, chars: value.length, reason: 'long string' });
      const head = value.slice(0, limits.string);
      return `${head}\n...[clipped ${value.length - limits.string} of ${value.length} chars]`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    const kept = value.slice(0, limits.array).map((item, index) => clipValue(item, limits, clipped, `${trail}[${index}]`));
    if (value.length > limits.array) {
      clipped.push({ path: trail, items: value.length, reason: 'long array' });
      kept.push(`...[clipped ${value.length - limits.array} of ${value.length} items]`);
    }
    return kept;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    const result = Object.fromEntries(entries.slice(0, limits.keys).map(([key, item]) =>
      [key, clipValue(item, limits, clipped, trail ? `${trail}.${key}` : key)]));
    if (entries.length > limits.keys) {
      clipped.push({ path: trail, keys: entries.length, reason: 'wide object' });
      result['...clipped'] = `${entries.length - limits.keys} of ${entries.length} keys`;
    }
    return result;
  }
  return value;
}

export function redactValue(value) {
  if (typeof value === 'string')
    return redactText(value);
  if (Array.isArray(value))
    return value.map(redactValue);
  if (value && typeof value === 'object') {
    const entries = new Map();
    for (const [key, item] of Object.entries(value)) {
      const base = redactText(key);
      let safeKey = base;
      for (let index = 2; entries.has(safeKey); index += 1)
        safeKey = `${base} [${index}]`;
      entries.set(safeKey, redactValue(item));
    }
    return Object.fromEntries(entries);
  }
  return value;
}

const clipLadder = [
  { string: 3000, array: 25, keys: 60 },
  { string: 1200, array: 15, keys: 40 },
  { string: 400, array: 8, keys: 30 },
  { string: 120, array: 4, keys: 20 },
];
const exampleByteLimit = 24 * 1024;

export function completeEvidence(value) {
  const omissions = [];
  const full = redactValue(clipValue(value, { string: Infinity, array: Infinity, keys: Infinity }, omissions));
  return { status: 'complete', value: full, omissions, bytes: Buffer.byteLength(JSON.stringify(full) ?? 'null') };
}

// Only an exact match can replace a historical preview with complete evidence.
export function recoverExample(example, value, name) {
  if (sha256(JSON.stringify(value) ?? 'null') !== example.originalHash)
    return null;
  const replacement = replaceMilExample({ ...example, value }, name);
  if (replacement.privacyReplacement)
    return replacement;
  return { ...example, fullEvidence: completeEvidence(value) };
}

// Returns a redacted, size-limited copy plus the original size and what was clipped.
export function prepareExample(value) {
  const original = JSON.stringify(value) ?? 'null';
  let result = null;
  for (const limits of clipLadder) {
    const clipped = [];
    const candidate = redactValue(clipValue(value, limits, clipped));
    result = { value: candidate, clipped, bytes: Buffer.byteLength(JSON.stringify(candidate) ?? 'null') };
    if (result.bytes <= exampleByteLimit)
      break;
  }
  if (result.bytes > exampleByteLimit) {
    const text = JSON.stringify(result.value);
    result = {
      value: { note: `Still large after clipping (${result.bytes} bytes). Showing the first 12000 characters of its JSON.`, json: text.slice(0, 12000) },
      clipped: [...result.clipped, { path: '', chars: text.length, reason: 'whole example' }],
      bytes: 12200,
    };
  }
  return {
    ...result,
    originalBytes: Buffer.byteLength(original),
    originalHash: sha256(original),
    ...(result.clipped.length ? { fullEvidence: completeEvidence(value) } : {}),
  };
}

export function isoDate(value) {
  if (value === undefined || value === null)
    return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function requirePrivateOutput(file) {
  const resolved = path.resolve(file);
  const allowed = [path.join(notesFolder, 'private-examples'), path.join(repoRoot, 'temp-tool-output')];
  if (!allowed.some(folder => resolved.startsWith(folder + path.sep)))
    throw new Error(`Private output must be under ${allowed.join(' or ')}: ${resolved}`);
  return resolved;
}
