import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const readJson = (name) => JSON.parse(readFileSync(join(root, name), 'utf8').replace(/^\uFEFF/, ''));
const ideas = readJson('ideas.json');
const repository = readJson('repository-inventory.json');
const online = readJson(join('online', 'findings.json'));
const corpus = readJson(join('corpus', 'report-summary.json'));
const validation = readJson('validation.json');
const synthesis = readJson('synthesis.json');
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const text = (value) => value === null ? 'not recorded' : escape(value);
const inline = (value) => {
  if (value === null || value === undefined)
    return 'not recorded';
  if (typeof value === 'string' && /^https:\/\/[^\s]+$/.test(value))
    return `<a href="${escape(value)}" rel="noreferrer">${escape(value)}</a>`;
  if (typeof value !== 'object')
    return text(value);
  if (Array.isArray(value) && value.every((item) => item === null || typeof item !== 'object'))
    return value.map(text).join('<br>');
  return `<pre>${escape(JSON.stringify(value, null, 2))}</pre>`;
};
const table = (rows) => {
  if (rows.length === 0)
    return '<p>No entries recorded in this section.</p>';
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return `<div class="table-wrap"><table><thead><tr>${keys.map((key) => `<th>${escape(key)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr data-search>${keys.map((key) => `<td>${inline(row[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
};
const render = (value, depth = 0) => {
  if (value === null || typeof value !== 'object')
    return `<p>${inline(value)}</p>`;
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((item) => item && typeof item === 'object' && !Array.isArray(item)))
      return table(value);
    return `<ul>${value.map((item) => `<li data-search>${typeof item === 'object' ? render(item, depth + 1) : inline(item)}</li>`).join('')}</ul>`;
  }
  return Object.entries(value).map(([key, item]) => {
    if (item === null || typeof item !== 'object')
      return `<p data-search><strong>${escape(key)}:</strong> ${inline(item)}</p>`;
    return `<details${depth === 0 ? ' open' : ''}><summary>${escape(key)}${Array.isArray(item) ? ` (${item.length})` : ''}</summary>${render(item, depth + 1)}</details>`;
  }).join('');
};
const list = (items) => `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>`;
const files = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
  if (entry.name === 'private-examples')
    return [];
  const path = join(folder, entry.name);
  return entry.isDirectory() ? files(path) : [path];
});
const artifactRows = files(root).filter((path) => /\.(?:md|html|log|json|mjs|mts|txt)$/.test(path) && !path.includes(`${sep}snapshots${sep}`) && !['report.html', 'report-manifest.json'].includes(relative(root, path))).map((path) => {
  const name = relative(root, path).split(sep).join('/');
  return { name, bytes: statSync(path).size, href: name.split('/').map(encodeURIComponent).join('/') };
});
const artifactTable = `<div class="table-wrap"><table><thead><tr><th>File</th><th>Bytes</th></tr></thead><tbody>${artifactRows.map((row) => `<tr data-search><td><a href="${escape(row.href)}">${escape(row.name)}</a></td><td>${row.bytes.toLocaleString('en-US')}</td></tr>`).join('')}</tbody></table></div>`;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="referrer" content="no-referrer">
<title>WI-052 - Markdown export LOD research</title>
<style>
:root{font:16px/1.5 system-ui,sans-serif;color:#182638;background:#f3f6fa;--panel:#fff;--line:#cbd5e1;--accent:#165d9c}
*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1600px;margin:auto;padding:1.4rem 2rem}header{background:#173451;color:#fff;max-width:none}header>div{max-width:1536px;margin:auto}h1{font-size:2rem;margin:.2rem 0}h2{scroll-margin-top:1rem;border-bottom:2px solid var(--accent);padding-bottom:.4rem}h3{margin-top:1.5rem}a{color:var(--accent)}header a{color:#c6e4ff}nav{display:flex;flex-wrap:wrap;gap:.8rem;margin:1rem 0}.notice,.card{background:var(--panel);padding:1rem 1.2rem;border:1px solid var(--line);border-radius:.5rem;margin:1rem 0}.notice{border-left:6px solid #c17a00}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1rem}.grid .card{margin:0}strong{font-weight:650}code,pre{font:13px/1.4 ui-monospace,Consolas,monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:28rem;overflow:auto;min-width:220px}p,li,td{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;background:var(--panel);font-size:.9rem}th,td{text-align:left;vertical-align:top;padding:.65rem .8rem;border:1px solid var(--line)}th{background:#e8eff7;position:sticky;top:0}td{min-width:120px}.table-wrap{overflow:auto;max-height:75vh;margin:1rem 0}details{border:1px solid var(--line);border-radius:.3rem;margin:.8rem 0;padding:.6rem;background:var(--panel)}summary{cursor:pointer;font-weight:650}input{width:min(100%,650px);padding:.7rem;font:inherit;border:1px solid var(--line);border-radius:.3rem}button{padding:.6rem;font:inherit;cursor:pointer;margin:.3rem}section{margin-bottom:2.5rem}.muted{color:#52657a}.pill{display:inline-block;background:#ffe4a6;color:#482b00;padding:.2rem .6rem;border-radius:1rem;font-weight:bold}.hidden{display:none!important}
@media(prefers-color-scheme:dark){:root{color:#e5edf7;background:#111b28;--panel:#1b2a3d;--line:#465970;--accent:#8cc9ff}th{background:#273c55}.muted{color:#b4c6d9}input{background:#1b2a3d;color:#e5edf7}}
@media print{header{background:none;color:#000}header a{color:#000}nav,.search-controls{display:none}.table-wrap{max-height:none;overflow:visible}pre{max-height:none}th{position:static}details{break-inside:avoid}body{font-size:10pt}main{padding:0}.hidden{display:revert!important}}
</style></head><body>
<header><div><span class="pill">Preserved sanitized research - no implementation</span><h1>Markdown export Level of Detail</h1><p>WI-052 | 261113 -5 | Local, Agent Host and Copilot CLI evidence</p><nav><a href="#recommendation">Recommendation</a><a href="#controls">Control catalogue</a><a href="#formats">Repository formats</a><a href="#online">Online research</a><a href="#corpus">Observed chats and exports</a><a href="#decisions">Decisions</a><a href="#artifacts">Files</a></nav></div></header>
<main><div class="notice"><strong>Preservation edition:</strong> source locators and dynamic/private field names are anonymized. Detailed inventories and counts are kept, but anonymized commands cannot identify the original chats. Use the synthetic examples for portable review. Real export bundles are available only in the ignored private archive on the originating machine. See <a href="PRESERVATION.md">preservation details</a> and <a href="examples/README.md">sample guide</a>.</div>
<section id="recommendation"><h2>Recommendation and boundaries</h2><p><strong>${escape(ideas.recommendation)}</strong></p><div class="grid"><div class="card"><strong>Default stays detailed</strong><p>No named whole-export profiles. Choose content and detail independently.</p></div><div class="card"><strong>MCP is a tool origin</strong><p>All tool calls already includes MCP. MCP-only is a filter, not an extra duplicated block.</p></div><div class="card"><strong>Short does not mean complete</strong><p>Excerpts, exclusions, source gaps and upstream clipping need distinct labels.</p></div><div class="card"><strong>Keep research local</strong><p>Exports and companions can contain private text and images. No report upload is required.</p></div></div><div class="notice"><strong>Coverage statement:</strong> this report lists the types found in the cited public sources and the bounded local survey. It does not claim all possible historical chat formats, tools, sessions or renderer support. Online API types, internal persistence types and actual sampled data are separate evidence.</div><h3>Design rules</h3>${list(ideas.principles)}<h3>Read this report</h3><p>Filter table rows below. Clear the filter to restore everything. Expand sections for full evidence. Source and census JSON files remain linked for independent review. Counts in raw mutation/event inventories are not counts of unique rendered calls.</p><div class="search-controls"><label for="filter">Find a tool, type or proposal</label><br><input id="filter" type="search" placeholder="Examples: ask_user, image, reasoning, MCP, error"><button id="clear" type="button">Clear</button><button id="expand" type="button">Expand all evidence</button><span id="matches" aria-live="polite"></span></div></section>
<section id="controls"><h2>What the research changes</h2>${table(synthesis.findings)}<h3>Recommended first implementation proposal, not approval</h3>${list(synthesis.recommendedFirstScope)}<h2>Proposed controls (${ideas.controls.length})</h2><p>Names and values describe ideas, not approved CLI flags. Short/medium/complete are per-category or per-tool levels, not whole-export presets. Start with fewer controls rather than exposing every stored field.</p>${table(ideas.controls)}<h3>Requested short, medium and complete examples</h3><p>Illustrations only. These lines are not newly implemented output. Use actual recorded values and redact before shortening.</p>${table(ideas.examples)}</section>
<section id="formats"><h2>Repository format background</h2><p>${escape(repository.evidence)} Source: ${escape(repository.source)}.</p><div class="notice">The repository schema guide contains older statements that conflict with current README/SPEC behavior. In particular, its SDK-not-implemented and old clipping statements are not treated as current runtime evidence. See local export results for observed behavior.</div>${table(repository.families)}</section>
<section id="online"><h2>Online documentation and public source</h2><p>Public APIs describe what an extension or server can emit. Serialization source describes what may survive on disk. Neither establishes that every sampled session contains those records. Exact checked sources and version caveats follow.</p>${render(online)}</section>
<section id="corpus"><h2>Observed chats, inventories and Markdown exports</h2><div class="notice"><strong>Key result:</strong> six current-default exports include four long varied examples and two deliberately flawed stress cases. Five pass saved-file verification. The SDK Fusion stress case fails Layer D. The Local question stress case passes general verification, but only four of five recorded answer strings match after whitespace normalization. That comparison is not a full semantic audit, and escaping may affect matching. Do not treat a pass as proof that user answers are complete.</div><p>Do not confuse raw lifecycle/mutation counts with final-state conversation counts. The tables below aggregate distinct types. The complete occurrence/field-path data remains in <a href="corpus/findings.json">findings.json</a> and <a href="corpus/census.json">census.json</a>.</p>${render(corpus)}<h3>Open the examples</h3><p>Markdown and logs are linked in the file index. Keep sibling asset folders beside each Markdown file. Use VS Code Markdown preview to inspect nested details, code blocks and companion links.</p></section>
<section id="decisions"><h2>Decisions before implementation</h2>${list(ideas.openQuestions)}<h3>Phased next steps</h3>${table(ideas.stages)}<h3>Limits and counterarguments</h3>${list(ideas.limitations)}<p><strong>Cheaper alternative:</strong> keep all content and change collapse state alone. This reduces scrolling, not bundle size or disclosure. The stronger alternative is deterministic per-tool content controls with clear exclusions, at the cost of more parsing and verification work.</p><h3>Verification design to research</h3><ul><li>Resolve a content policy once, before rendering and companion creation. Keep default policy behavior unchanged.</li><li>Record selected categories, exact tool rules and excluded counts in the archive. Keep unavailable source content separate.</li><li>Verify selected text, order, call identity, errors and companions against independent source evidence. Do not weaken existing full-export checks to make reduced exports pass.</li><li>Test default output equality, input/result combinations, global/per-tool conflicts, unknown tools, MCP attribution, questions/answers, multi-part results, nested agents and sidecar exclusions.</li><li>Use shared semantic tests across Local and SDK formats. Pairwise combinations can supplement, not replace, high-risk end-to-end cases.</li></ul></section>
<section id="artifacts"><h2>Evidence files and reproduction</h2><p>Run <code>node work-items\\notes\\WI-052\\build-report.mjs</code> from the repository root to rebuild this HTML from saved JSON. Local corpus scripts and per-export logs are listed below. No network request is made by this report or its search controls.</p>${artifactTable}<h3>Validation and baseline limits</h3>${render(validation)}<h3>Tracking and repository references</h3>${render(ideas.tracking)}</section>
</main><footer><p>Research date: 261113 -5. Suggestions are not an implementation plan approval. No production exporter behavior changed.</p></footer>
<script>
const filter = document.getElementById('filter');
const rows = [...document.querySelectorAll('[data-search]')];
const update = () => {
  const query = filter.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const row of rows) {
    const matches = !query || row.textContent.toLocaleLowerCase().includes(query);
    row.classList.toggle('hidden', !matches);
    visible += Number(matches);
    if (query && matches) {
      let parent = row.parentElement;
      while (parent) {
        if (parent.tagName === 'DETAILS')
          parent.open = true;
        parent = parent.parentElement;
      }
    }
  }
  document.getElementById('matches').textContent = query ? visible + ' matching entries' : '';
};
filter.addEventListener('input', update);
document.getElementById('clear').addEventListener('click', () => { filter.value = ''; update(); });
document.getElementById('expand').addEventListener('click', () => {
  for (const detail of document.querySelectorAll('details'))
    detail.open = true;
});
</script></body></html>`;
writeFileSync(join(root, 'report.html'), html, 'utf8');
const manifest = files(root).filter((path) => !path.endsWith(`${sep}report-manifest.json`)).map((path) => ({
  path: relative(root, path).split(sep).join('/'),
  bytes: statSync(path).size,
  sha256: createHash('sha256').update(readFileSync(path)).digest('hex')
}));
writeFileSync(join(root, 'report-manifest.json'), JSON.stringify({ date: ideas.date, files: manifest }, null, 2) + '\n');
console.log(`Created report.html (${Buffer.byteLength(html)} bytes), ${ideas.controls.length} proposed controls, ${manifest.length} hashed evidence files.`);
