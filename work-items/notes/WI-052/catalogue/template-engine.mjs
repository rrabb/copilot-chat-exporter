// Template engine for the LOD format workbench. It has no DOM or Node-only calls, so the builder can self-check
// suggestions and the HTML page can inline the same file.
//
// Syntax (see the "Template help" section of the page):
//   {field}                     first non-empty value of a field, with alias lookup
//   {a ?? b ?? 'text'}          first non-empty candidate
//   {field | head:80 | code}    filters, applied left to right
//   {if ok}...{else}...{/if}    one level of condition; {if !field} negates
//   {{ and }}                   literal braces

const aliasTable = {
  path: ['input.path', 'input.filePath', 'input.file', 'input.uri', 'input.paths', 'filePath', 'file', 'uri', 'path'],
  command: ['command', 'input.command', 'commandLine.original', 'commandLine'],
  query: ['input.query', 'input.pattern', 'input.search', 'input.text', 'input.libraryName', 'query', 'pattern'],
  url: ['input.url', 'input.urls', 'input.uri', 'url'],
  description: ['input.description', 'input.explanation', 'input.goal', 'intent', 'description'],
  prompt: ['input.prompt', 'prompt'],
  content: ['input.content', 'input.file_text', 'input.fileText', 'content'],
  oldText: ['input.old_str', 'input.oldString', 'input.old_string'],
  newText: ['input.new_str', 'input.newString', 'input.new_string'],
};

const missingMark = field => `⟨?${field}⟩`;

function getPath(value, path) {
  let current = value;
  for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (current === null || current === undefined || typeof current !== 'object')
      return undefined;
    current = current[part];
  }
  return current;
}

function isEmpty(value) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

export function resolveField(ctx, name) {
  const candidates = aliasTable[name] ?? [name];
  for (const candidate of candidates) {
    const value = getPath(ctx, candidate);
    if (!isEmpty(value))
      return value;
  }
  if (!name.includes('.')) {
    for (const holder of ['input', 'data', 'fields']) {
      const value = getPath(ctx, `${holder}.${name}`);
      if (!isEmpty(value))
        return value;
    }
  }
  return undefined;
}

function asText(value) {
  if (value === undefined || value === null)
    return '';
  if (typeof value === 'string')
    return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return JSON.stringify(value);
}

function clip(text, length) {
  return text.length > length ? `${text.slice(0, Math.max(0, length - 1))}…` : text;
}

function formatBytes(count) {
  if (count < 1024)
    return `${count} B`;
  if (count < 1024 * 1024)
    return `${(count / 1024).toFixed(count < 10240 ? 1 : 0)} KB`;
  return `${(count / 1024 / 1024).toFixed(1)} MB`;
}

function basename(text) {
  const clean = text.replace(/[?#].*$/, '').replace(/[\\/]+$/, '');
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    decoded = clean;
  }
  return decoded.split(/[\\/]/).pop() ?? decoded;
}

const filters = {
  head: (value, arg) => clip(asText(value), Number(arg) || 80),
  tail: (value, arg) => {
    const text = asText(value);
    const length = Number(arg) || 80;
    return text.length > length ? `…${text.slice(text.length - length + 1)}` : text;
  },
  lines: (value, arg) => {
    const rows = asText(value).split(/\r?\n/);
    const limit = Number(arg) || 5;
    return rows.length > limit ? `${rows.slice(0, limit).join('\n')}\n… (+${rows.length - limit} lines)` : rows.join('\n');
  },
  first: value => asText(value).split(/\r?\n/).find(row => row.trim()) ?? '',
  oneline: value => asText(value).replace(/\s+/g, ' ').trim(),
  trim: value => asText(value).trim(),
  basename: value => asText(value).split(/,\s*/).map(basename).join(', '),
  bytes: value => formatBytes(typeof value === 'number' ? value : new TextEncoder().encode(asText(value)).length),
  count: value => {
    if (Array.isArray(value))
      return String(value.length);
    if (value && typeof value === 'object')
      return String(Object.keys(value).length);
    return String(asText(value).length);
  },
  linecount: value => String(asText(value) === '' ? 0 : asText(value).split(/\r?\n/).length),
  json: value => JSON.stringify(value),
  pretty: value => JSON.stringify(value, null, 2),
  keys: value => (value && typeof value === 'object' ? Object.keys(value).join(', ') : ''),
  join: (value, arg) => (Array.isArray(value) ? value.map(asText).join(arg === undefined || arg === ',' ? ', ' : arg === ';' ? '; ' : arg) : asText(value)),
  pick: (value, arg) => {
    if (Array.isArray(value))
      return value.map(item => getPath(item, arg ?? '')).filter(item => !isEmpty(item));
    return getPath(value, arg ?? '');
  },
  code: value => `\`${asText(value).replaceAll('`', "'")}\``,
  fence: (value, arg) => `\`\`\`${arg ?? ''}\n${asText(value)}\n\`\`\``,
  upper: value => asText(value).toUpperCase(),
  lower: value => asText(value).toLowerCase(),
  ms: value => {
    const number = Number(value);
    if (!Number.isFinite(number))
      return '';
    return number < 1000 ? `${Math.round(number)} ms` : `${(number / 1000).toFixed(1)} s`;
  },
  default: value => value,
};

export const filterNames = Object.keys(filters);

function parseExpression(expression) {
  const [head, ...filterParts] = expression.split(/\s*\|\s*/);
  const candidates = head.split(/\s*\?\?\s*/).map(item => item.trim()).filter(Boolean);
  const steps = filterParts.map(part => {
    const colon = part.indexOf(':');
    return colon < 0 ? { name: part.trim(), arg: undefined } : { name: part.slice(0, colon).trim(), arg: part.slice(colon + 1) };
  });
  return { candidates, steps };
}

function evaluateCandidates(ctx, candidates) {
  for (const candidate of candidates) {
    const literal = /^(['"])(.*)\1$/.exec(candidate);
    if (literal)
      return { value: literal[2], field: candidate };
    const value = resolveField(ctx, candidate);
    if (!isEmpty(value))
      return { value, field: candidate };
  }
  return { value: undefined, field: candidates[0] ?? '' };
}

function evaluate(ctx, expression, missing, used) {
  const { candidates, steps } = parseExpression(expression);
  const found = evaluateCandidates(ctx, candidates);
  const fallback = steps.find(step => step.name === 'default');
  let value = found.value;
  if (isEmpty(value)) {
    if (fallback)
      return fallback.arg ?? '';
    missing.add(candidates.join(' ?? '));
    return missingMark(candidates.join(' ?? '));
  }
  used.add(found.field);
  for (const step of steps) {
    const apply = filters[step.name];
    if (!apply) {
      missing.add(`filter:${step.name}`);
      return `⟨?filter ${step.name}⟩`;
    }
    value = apply(value, step.arg);
    if (isEmpty(value) && step.name !== 'default')
      return '';
  }
  return asText(value);
}

function isTruthy(value) {
  if (Array.isArray(value))
    return value.length > 0;
  if (value && typeof value === 'object')
    return Object.keys(value).length > 0;
  return Boolean(value) && value !== 'false' && value !== '0';
}

export function renderTemplate(template, ctx) {
  const missing = new Set();
  const used = new Set();
  const protectedText = String(template ?? '').replaceAll('{{', '\u0001').replaceAll('}}', '\u0002');
  const conditioned = protectedText.replace(/\{if (!?)([^}]+)\}([\s\S]*?)(?:\{else\}([\s\S]*?))?\{\/if\}/g, (_, negate, expression, yes, no) => {
    const { candidates } = parseExpression(expression);
    const found = evaluateCandidates(ctx, candidates);
    const truthy = isTruthy(found.value);
    return (negate ? !truthy : truthy) ? yes : (no ?? '');
  });
  const text = conditioned
    .replace(/\{([^{}]+)\}/g, (_, expression) => evaluate(ctx, expression, missing, used))
    .replaceAll('\u0001', '{')
    .replaceAll('\u0002', '}');
  return { text, missing: [...missing], used: [...used] };
}

// Lists the fields a template can use, so the page can offer them as chips. Depth and count are capped.
export function listFields(ctx, limit = 60) {
  const fields = [];
  const visit = (value, path, depth) => {
    if (fields.length >= limit || isEmpty(value))
      return;
    if (value && typeof value === 'object' && !Array.isArray(value) && depth < 3) {
      for (const [key, child] of Object.entries(value))
        visit(child, path ? `${path}.${key}` : key, depth + 1);
      return;
    }
    const sample = asText(value).replace(/\s+/g, ' ');
    fields.push({ path, kind: Array.isArray(value) ? 'array' : typeof value, sample: clip(sample, 60) });
  };
  visit(ctx, '', 0);
  return fields;
}

export function listAliases(ctx) {
  return Object.keys(aliasTable).filter(name => !isEmpty(resolveField(ctx, name)));
}

// Small stable hash (FNV-1a) used to notice when a suggestion changed after the user edited a box.
export function templateHash(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
