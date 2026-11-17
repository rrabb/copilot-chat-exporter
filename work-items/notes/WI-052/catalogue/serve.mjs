// Local helper server for the LOD format workbench. It serves the page and reads and writes one file:
// work-items\notes\WI-052\catalogue\lod-format-choices.json. It listens on 127.0.0.1 only and has no dependencies.
// Run: node work-items\notes\WI-052\catalogue\serve.mjs [--port 5252]
// Then open http://127.0.0.1:5252/ . Stop it with Ctrl+C.
import { constants, existsSync, mkdirSync, readFileSync, renameSync, copyFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { catalogueFolder, privateFolder } from './common.mjs';

const portFlag = process.argv.indexOf('--port');
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 5252;
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('Use --port with a number from 1024 to 65535.');
  process.exit(2);
}

const pageFile = path.join(privateFolder, 'format-workbench.html');
const choicesFile = path.join(catalogueFolder, 'lod-format-choices.json');
const backupFolder = path.join(privateFolder, 'choices-backups');
const SCHEMA = 'wi052-lod-format-choices/1';
const BODY_LIMIT = 5 * 1024 * 1024;
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

const baseHeaders = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "frame-ancestors 'none'",
};

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, { ...baseHeaders, 'content-type': type });
  response.end(body);
}

function emptyChoices() {
  return { schema: SCHEMA, catalogueId: '', saved: null, concepts: {}, rows: {} };
}

function cleanEntries(source, fields, label) {
  if (source === undefined)
    return {};
  if (!source || typeof source !== 'object' || Array.isArray(source))
    throw new Error(`${label} must be an object.`);
  const output = {};
  for (const [id, entry] of Object.entries(source)) {
    if (id === '__proto__' || id.length > 300)
      throw new Error(`${label} has a bad key.`);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error(`${label}.${id} must be an object.`);
    const clean = {};
    for (const [key, value] of Object.entries(entry)) {
      if (!fields.includes(key))
        throw new Error(`${label}.${id} has an unknown field "${key}".`);
      const text = key === 'short' || key === 'medium' || key === 'note';
      const hash = key === 'shortHash' || key === 'mediumHash' || key === 'reviewHash';
      if (text && typeof value !== 'string')
        throw new Error(`${label}.${id}.${key} must be text.`);
      if (hash && (typeof value !== 'string' || value.length > 16))
        throw new Error(`${label}.${id}.${key} must be a short hash.`);
      if (key === 'include' && value !== 'show' && value !== 'hide')
        throw new Error(`${label}.${id}.include must be show or hide.`);
      if (key === 'review' && value !== 'accepted' && value !== 'reviewed')
        throw new Error(`${label}.${id}.review must be reviewed or accepted.`);
      clean[key] = value;
    }
    if (Object.keys(clean).length)
      output[id] = clean;
  }
  return output;
}

function validateChoices(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('The body must be a JSON object.');
  if (input.schema !== SCHEMA)
    throw new Error(`The schema must be ${SCHEMA}.`);
  if (typeof input.catalogueId !== 'string' || input.catalogueId.length > 32)
    throw new Error('catalogueId must be a short string.');
  if (input.saved !== null && (typeof input.saved !== 'string' || input.saved.length > 40))
    throw new Error('saved must be null or a timestamp string.');
  return {
    schema: SCHEMA,
    catalogueId: input.catalogueId,
    saved: input.saved,
    concepts: cleanEntries(input.concepts, ['short', 'shortHash', 'medium', 'mediumHash', 'include'], 'concepts'),
    rows: cleanEntries(input.rows, ['short', 'shortHash', 'medium', 'mediumHash', 'include', 'review', 'reviewHash', 'note'], 'rows'),
  };
}

function stamp(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getFullYear() % 100)}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// Earlier versions of your choices are kept, because the file is the only copy of what you typed.
function backUp() {
  if (!existsSync(choicesFile))
    return;
  mkdirSync(backupFolder, { recursive: true });
  const prefix = `lod-format-choices.${stamp(new Date())}`;
  for (let sequence = 0; ; sequence += 1) {
    const name = `${prefix}-${String(sequence).padStart(6, '0')}.json`;
    try {
      copyFileSync(choicesFile, path.join(backupFolder, name), constants.COPYFILE_EXCL);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST')
        throw error;
    }
  }
}

function writeChoices(choices) {
  backUp();
  const temp = `${choicesFile}.tmp`;
  writeFileSync(temp, `${JSON.stringify(choices, null, 2)}\n`);
  renameSync(temp, choicesFile);
}

function readBody(request, response, done) {
  const chunks = [];
  let size = 0;
  request.on('data', chunk => {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      send(response, 413, 'The body is larger than 5 MiB.');
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
}

const server = http.createServer((request, response) => {
  if (!allowedHosts.has(request.headers.host ?? '')) {
    send(response, 403, 'Wrong host.');
    return;
  }
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    if (request.method !== 'GET') {
      send(response, 405, 'Use GET.');
      return;
    }
    if (!existsSync(pageFile)) {
      send(response, 404, 'The page is not built. Run build-catalogue.mjs and build-page.mjs first.');
      return;
    }
    send(response, 200, readFileSync(pageFile), 'text/html; charset=utf-8');
    return;
  }
  if (url.pathname !== '/api/choices') {
    send(response, 404, 'Not found.');
    return;
  }
  if (request.method === 'GET') {
    const body = existsSync(choicesFile) ? readFileSync(choicesFile, 'utf8') : JSON.stringify(emptyChoices());
    send(response, 200, body, 'application/json; charset=utf-8');
    return;
  }
  if (request.method !== 'PUT') {
    send(response, 405, 'Use GET or PUT.');
    return;
  }
  // Another website open in your browser must not be able to write this file.
  const origin = request.headers.origin;
  if ((origin && !allowedOrigins.has(origin)) || (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin')) {
    send(response, 403, 'Wrong origin.');
    return;
  }
  if (!String(request.headers['content-type'] ?? '').startsWith('application/json')) {
    send(response, 415, 'Send application/json.');
    return;
  }
  readBody(request, response, text => {
    try {
      writeChoices(validateChoices(JSON.parse(text)));
      send(response, 200, '{"ok":true}', 'application/json; charset=utf-8');
    } catch (error) {
      send(response, 400, error.message);
    }
  });
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Try --port ${port + 1}.` : error.message);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`LOD format workbench: http://127.0.0.1:${port}/`);
  console.log(`Choices file: ${choicesFile}`);
  console.log('Press Ctrl+C to stop.');
});
