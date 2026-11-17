// Builds the LOD format workbench page: one self-contained HTML file with the catalogue, the recorded examples,
// the template engine, the page script, and a copy of the saved choices.
// Run: node work-items\notes\WI-052\catalogue\build-page.mjs
// Output: work-items\notes\WI-052\private-examples\catalogue\format-workbench.html (private: it embeds redacted chat excerpts).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { catalogueFolder, privateFolder, requirePrivateOutput } from './common.mjs';

// Working copies are CRLF. Browsers hash script text after turning CRLF into LF, so do the same here.
const read = file => readFileSync(path.join(catalogueFolder, file), 'utf8').replace(/\r\n/g, '\n');
const index = JSON.parse(read('catalogue-index.json'));
const examplesFile = path.join(privateFolder, 'examples.private.json');
const examples = JSON.parse(readFileSync(examplesFile, 'utf8'));
if (examples.catalogueId !== index.catalogueId)
  throw new Error(`Examples (${examples.catalogueId}) do not match the catalogue (${index.catalogueId}). Run build-catalogue.mjs first.`);

const choicesFile = path.join(catalogueFolder, 'lod-format-choices.json');
const choices = existsSync(choicesFile)
  ? JSON.parse(readFileSync(choicesFile, 'utf8'))
  : { schema: 'wi052-lod-format-choices/1', catalogueId: index.catalogueId, saved: null, concepts: {}, rows: {} };

const stripExports = source => source.replace(/^export /gm, '');
const script = [
  "'use strict';",
  '(() => {',
  stripExports(read('template-engine.mjs')),
  stripExports(read('context.mjs')),
  read('workbench.js'),
  '})();',
].join('\n');

// The CSP only allows these exact script and style texts, so a page edited by hand won't run.
const compile = new vm.Script(script, { filename: 'workbench.inline.js' });
if (!compile)
  throw new Error('The page script did not compile.');

const style = read('workbench.css');
const hash = text => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
const csp = [
  "default-src 'none'",
  `script-src ${hash(script)}`,
  `style-src ${hash(style)}`,
  'img-src data:',
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const dataBlock = JSON.stringify({ built: new Date().toISOString(), index, examples: examples.examples, choices })
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const option = (value, label) => `<option value="${value}">${label}</option>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>LOD format workbench - WI-052</title>
<style>${style}</style>
</head>
<body>
<header class="top">
  <div class="top-row">
    <h1>LOD format workbench <span class="muted small">WI-052</span></h1>
    <span id="stats" class="small muted"></span>
    <span class="spacer"></span>
    <span id="status" role="status"></span>
    <button id="save" class="primary" title="Ctrl+S">Save</button>
    <button id="copy" title="Download a dated copy of your choices">Download copy</button>
    <button id="load-button">Load file…</button>
    <input id="load" type="file" accept=".json,application/json" hidden>
  </div>
  <div class="filters">
    <input id="search" type="search" placeholder="Search name, label, type, group, docs…" aria-label="Search">
    <label><input id="f-deep" type="checkbox"> also search recorded examples</label>
    <label>Review <select id="f-review">${option('', 'any')}${option('not-reviewed', 'not reviewed')}${option('not-accepted', 'not accepted')}${option('reviewed', 'reviewed, not accepted')}${option('accepted', 'accepted')}${option('edited', 'edited')}</select></label>
    <label>Include <select id="f-include">${option('', 'any')}${option('show', 'show')}${option('hide', 'hide')}</select></label>
    <label>Type <select id="f-type">${option('', 'any')}</select></label>
    <label>Group <select id="f-concept">${option('', 'any')}</select></label>
    <label>Status <select id="f-status">${option('', 'any')}</select></label>
    <label>Origin <select id="f-origin">${option('', 'any')}</select></label>
    <label>Family <select id="f-family">${option('', 'any')}</select></label>
    <label>Example <select id="f-example">${option('', 'any')}${option('recorded', 'recorded')}${option('privacy', 'privacy replacement only')}${option('skeleton', 'skeleton only')}${option('none', 'none')}</select></label>
    <label><input id="group" type="checkbox" checked> group by concept</label>
    <span class="small muted">Columns:</span>
    <label><input id="col-concept" type="checkbox"> group</label>
    <label><input id="col-status" type="checkbox"> status</label>
    <label><input id="col-origin" type="checkbox"> origin</label>
    <label><input id="col-family" type="checkbox"> family</label>
    <button id="collapse" class="small">Close open rows</button>
    <span id="count" class="small muted"></span>
  </div>
</header>
<main>
  <p id="scan-warning" class="warnline" role="status" hidden></p>
  <div id="banners"></div>
  <details class="about"><summary>About this catalogue, colours, and limits</summary><div id="about-body"></div></details>
  <table id="catalogue">
    <thead>
      <tr>
        <th class="sortable" data-key="review">Review</th>
        <th class="sortable" data-key="include">Include</th>
        <th class="sortable" data-key="name">Kind name</th>
        <th class="sortable" data-key="type">Type</th>
        <th class="sortable" data-key="label">Label</th>
        <th class="sortable" data-key="seen" title="Sort by scanned chats containing this name. Occurrence counts below use separate units.">Seen</th>
        <th class="sortable col-extra col-concept" data-key="concept">Group</th>
        <th class="sortable col-extra col-status" data-key="status">Status</th>
        <th class="sortable col-extra col-origin" data-key="origin">Origin</th>
        <th class="sortable col-extra col-family" data-key="family">Family</th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <div id="empty" class="empty" hidden>No names match the current filters.</div>
</main>
<script type="application/json" id="catalogue-data">${dataBlock}</script>
<script>${script}</script>
</body>
</html>
`;

mkdirSync(privateFolder, { recursive: true });
const output = requirePrivateOutput(path.join(privateFolder, 'format-workbench.html'));
writeFileSync(output, html);
console.log(`Wrote ${output}`);
console.log(`Size ${(statSync(output).size / 1024 / 1024).toFixed(2)} MB. Catalogue ${index.catalogueId}. Rows ${index.rows.length}.`);
console.log(`CSP script ${hash(script).slice(0, 24)}…`);
