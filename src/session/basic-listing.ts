import { escapeHtml, pathLink, sourceDetails, chartRows, storageGuideHtml } from './listing-html.ts';
import type { SessionOccurrence } from './sources.ts';
import type { ConversationGroup, SessionListingOptions } from './listing-model.ts';
import { UUID, groupOccurrences, localWorkspaceCounts, sessionType, shortIds } from './listing-model.ts';
import { formatLocalListingDate as localDateCell } from './listing-preview.ts';

function listingStatus (group: ConversationGroup): string {
  if (group.visibility.status === 'hidden')
    return group.visibility.reason === 'ambiguous' ? 'ambiguous' : `ignored: ${group.visibility.reason}`;
  return group.representative.backing.status;
}

function statusExplanation (group: ConversationGroup): string {
  const session = group.representative;
  if (group.visibility.status === 'hidden') {
    if (group.visibility.reason === 'new-chat-unknown')
      return 'Hidden by the New Chat placeholder filter because both created date and prompt count are unknown. This does not prove the chat is empty.';
    if (group.visibility.reason === 'ambiguous')
      return 'The exporter could not safely choose one provider backing or child-agent scope.';
    return `Hidden by the default ${group.visibility.reason} filter.`;
  }
  const backing = session.backing;
  if (backing.status !== 'verified') {
    return backing.status === 'unsupported'
      ? 'The index entry uses a provider key this exporter does not currently know how to resolve.'
      : 'The index/reference exists, but no conversation backing was verified. The referenced file may be missing, unreadable, unsupported, or its identity mapping may be unavailable.';
  }
  if (backing.source.kind === 'local-journal')
    return 'A Local chat journal was found and its stored session ID was checked against this listing entry.';
  if (backing.source.scope.kind === 'subagent')
    return 'SDK event backing and the persisted parent-tool-call to child-agent mapping were verified.';
  return 'SDK event backing and the persisted provider-to-session identity were verified.';
}

/** Self-contained offline inventory report, using the same grouping and filters as the console. */
export function formatSessionListingHtml (
  occurrences: readonly SessionOccurrence[],
  options: SessionListingOptions = {},
  generatedAt = new Date().toISOString(),
): string {
  const groups = groupOccurrences(occurrences);
  const eligible = groups.filter((group) => group.visibility.status === 'included');
  const candidates = options.showIgnored ? groups : eligible;
  const shown = options.last25 ? candidates.slice(0, 25) : candidates;
  const ids = shortIds(groups);
  const localCounts = localWorkspaceCounts(groups);
  const statuses = new Map<string, number>();
  const types = new Map<string, number>();
  for (const group of groups) {
    const status = listingStatus(group);
    const type = sessionType(group.representative);
    statuses.set(status, (statuses.get(status) ?? 0) + 1);
    types.set(type, (types.get(type) ?? 0) + 1);
  }
  const hiddenCount = groups.length - eligible.length;
  const root = occurrences[0]?.provenance.userDataRoot ?? 'selected VS Code user-data root';
  const renderRows = (rows: readonly ConversationGroup[], tableId: string) => rows.map((group, index) => {
    const session = group.representative;
    const isPathRequired = session.provider === 'local' && (localCounts.get(session.sessionId) ?? 0) > 1;
    const selector = options.fullIds || !UUID.test(session.sessionId)
      ? session.sessionId : ids.get(session.sessionId) ?? session.sessionId;
    const sourcePaths = isPathRequired
      ? group.occurrences.flatMap((item) => item.backing.status === 'verified' && item.backing.source.kind === 'local-journal'
        ? [item.backing.source.path] : [])
      : [];
    const details = [
      `<p class="callout">${escapeHtml(statusExplanation(group))}</p>`,
      sourceDetails(group),
      isPathRequired ? `<p><strong>This ID occurs in multiple workspaces.</strong> Select the exact journal file:</p><ul>${sourcePaths.map((file) => `<li>${pathLink(file)}</li>`).join('')}</ul>` : '',
      group.childWarnings > 0 ? `<p>${group.childWarnings} child scope(s) have unresolved identity evidence; the verified parent remains available.</p>` : '',
    ].filter(Boolean).join('');
    const promptCount = group.promptCount === null ? 'unknown' : String(group.promptCount);
    const title = session.title || '(untitled)';
    const status = listingStatus(group);
    const detailsId = `${tableId}-source-${index}`;
    const rowText = [sessionType(session), selector, session.sessionId, title, status, promptCount,
      localDateCell(group.createdTimestamp), localDateCell(group.activityTimestamp)].join(' ');
    return `<tr data-type="${escapeHtml(sessionType(session))}" data-details="${detailsId}" data-status="${escapeHtml(status)}" data-search="${escapeHtml(rowText.toLocaleLowerCase())}">
      <td class="datetime" data-timestamp="${group.createdTimestamp ?? ''}">${escapeHtml(localDateCell(group.createdTimestamp))}</td>
      <td class="datetime" data-timestamp="${group.activityTimestamp ?? ''}">${escapeHtml(localDateCell(group.activityTimestamp))}</td>
      <td class="numeric"><strong>${escapeHtml(promptCount)}</strong></td>
      <td><span class="type-badge">${escapeHtml(sessionType(session))}</span></td>
      <td><code class="selector">${escapeHtml(selector)}</code> <button class="copy" type="button" data-copy="${escapeHtml(selector)}" aria-label="Copy selector for ${escapeHtml(title)}">Copy</button>${isPathRequired ? '<strong class="path-required">path required</strong>' : ''}</td>
      <td class="title-cell">${escapeHtml(title)}</td>
      <td><span class="status status-${session.backing.status}">${escapeHtml(session.backing.status)}</span>${status !== session.backing.status ? `<span class="status status-filter">${escapeHtml(status)}</span>` : ''}<button class="source-toggle" type="button" aria-expanded="false" aria-controls="${detailsId}" hidden>Why / source</button></td>
    </tr>
    <tr class="source-detail-row" id="${detailsId}"><td colspan="7"><details class="row-details"><summary>Why / source: ${escapeHtml(title)}</summary><div class="source-panel"><div class="source-panel-heading"><h3>${escapeHtml(title)}</h3><button class="source-close" type="button" hidden>Close details</button></div>${details}</div></details></td></tr>`;
  }).join('\n');
  const tableRows = renderRows(shown, 'sessions');
  const ignoredRows = renderRows(groups.filter((group) => group.visibility.status === 'hidden'), 'ignored');
  const generated = new Date(generatedAt);
  if (!Number.isFinite(generated.getTime()))
    throw new Error('Listing report generatedAt must be a valid timestamp.');
  const typeOptions = [...new Set(shown.map((group) => sessionType(group.representative)))].sort();
  const statusOptions = [...new Set(shown.map(listingStatus))].sort();
  const summary = options.showIgnored
    ? `Showing ${shown.length} of ${candidates.length} conversations, including ignored rows.`
    : `Showing ${shown.length} of ${candidates.length} eligible conversations. ${hiddenCount} ignored by default.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VS Code Copilot chat inventory</title>
<style>
:root{color-scheme:light dark;font:16px/1.5 system-ui,Segoe UI,sans-serif;--bg:#f4f7fb;--card:#fff;--ink:#182536;--muted:#5d6b7c;--line:#d9e1ec;--accent:#1769aa;--soft:#eaf3fc;--warn:#8a4b00;--good:#19734a;--bad:#9b2c2c}
@media(prefers-color-scheme:dark){:root{--bg:#111923;--card:#1b2735;--ink:#e5edf7;--muted:#a5b3c3;--line:#344456;--accent:#79baff;--soft:#223b52;--warn:#ffd08b;--good:#8ce0b1;--bad:#ffaaaa}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink)}main{max-width:1480px;margin:auto;padding:clamp(1rem,3vw,2.5rem)}a{color:var(--accent)}header,.panel,.metric,.guide{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 4px 20px #142c4510}header{padding:1.5rem 1.75rem;border-top:5px solid var(--accent)}h1{margin:.1rem 0;font-size:clamp(1.6rem,3vw,2.3rem)}h2{font-size:1.25rem;margin:0 0 .7rem}.eyebrow{color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:.78rem}.muted,.caption{color:var(--muted)}.top-link{display:inline-block;margin-top:.5rem;font-weight:650}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:.75rem;margin:1rem 0}.metric{padding:1rem 1.1rem}.metric strong{display:block;font-size:1.65rem;line-height:1.2}.metric span{color:var(--muted);font-size:.88rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}.panel{padding:1.1rem 1.25rem;margin-bottom:1rem}.chart-row{display:grid;grid-template-columns:minmax(95px,150px) 1fr 2.5rem;gap:.65rem;align-items:center;margin:.48rem 0;font-size:.9rem}.bar{height:.65rem;border-radius:2rem;background:var(--soft);overflow:hidden}.bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent),#5dc4bb)}.chart-row strong{text-align:right}.controls{display:flex;flex-wrap:wrap;gap:.65rem;align-items:center}.controls label{display:flex;gap:.45rem;align-items:center;font-weight:600}.controls input,.controls select{min-height:2.4rem;padding:.4rem .65rem;border:1px solid var(--line);border-radius:7px;background:var(--card);color:var(--ink)}#search{flex:1;min-width:220px}button{font:inherit;color:var(--ink);background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:.25rem .55rem;cursor:pointer}button:hover{border-color:var(--accent)}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px}table{width:100%;border-collapse:collapse;min-width:1050px;background:var(--card)}th,td{text-align:left;padding:.65rem .7rem;border-bottom:1px solid var(--line);vertical-align:top}th{position:sticky;top:0;background:var(--soft);z-index:1;white-space:nowrap}th button{font-weight:700;background:transparent;border:0;padding:0}.numeric{text-align:right;font-variant-numeric:tabular-nums}.title-cell{font-weight:600;min-width:180px}.selector{font-size:.9rem;user-select:all;overflow-wrap:anywhere}.type-badge,.status{display:inline-block;padding:.12rem .48rem;border-radius:1rem;font-size:.78rem;font-weight:700;background:var(--soft);white-space:nowrap}.status-verified{color:var(--good)}.status-unresolved,.status-unsupported{color:var(--warn)}.status-ambiguous,.status-filter,.path-required{color:var(--bad)}.status-filter{display:block;width:max-content;margin-top:.25rem}.path-required{display:block;font-size:.76rem;margin-top:.3rem}.row-details{margin-top:.45rem;max-width:340px;font-size:.84rem}.row-details summary,.guide>summary{cursor:pointer;color:var(--accent);font-weight:650}.row-details code,.tree code{overflow-wrap:anywhere}.copy{font-size:.75rem}.diagram{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.65rem;align-items:stretch;margin:1rem 0}.node{border:1px solid var(--line);border-radius:10px;padding:.8rem;background:var(--soft);position:relative}.node strong{display:block}.node:not(:last-child):after{content:'→';position:absolute;right:-.65rem;top:40%;z-index:2;color:var(--accent);font-weight:900}@media(max-width:650px){.node:not(:last-child):after{content:'↓';right:48%;top:auto;bottom:-1rem}.diagram{grid-template-columns:1fr}.chart-row{grid-template-columns:100px 1fr 2rem}}.tree{overflow:auto;background:var(--bg);border:1px solid var(--line);padding:1rem;border-radius:8px;font: .88rem/1.5 ui-monospace,Consolas,monospace}.guide{margin-top:1.25rem;padding:1rem 1.3rem}.guide[open]{padding-bottom:1.5rem}.guide-content{padding-top:.8rem}.guide table{min-width:0}.guide td:first-child{font-weight:700;white-space:nowrap}.callout{border-left:4px solid var(--accent);padding:.65rem .9rem;background:var(--soft);border-radius:0 8px 8px 0}.warning{border-left-color:#d99b2b}footer{color:var(--muted);font-size:.85rem;padding:1.2rem 0}.empty{text-align:center;padding:2rem;color:var(--muted)}
</style>
<style>
.datetime,.selector{font-family:"Arial Narrow",Arial,sans-serif;font-size:.8rem}.datetime{white-space:nowrap;font-variant-numeric:tabular-nums}.source-fields{margin:.7rem 0}.source-fields dt{font-weight:700;margin-top:.45rem}.source-fields dd{margin:0;overflow-wrap:anywhere}.row-details{max-width:430px}.source-fields code{font-family:"Arial Narrow",Arial,sans-serif;font-size:.8rem}
[hidden]{display:none!important}.source-toggle{display:block;margin-top:.5rem;font-size:.85rem;color:var(--accent)}.source-toggle[aria-expanded=true]{font-weight:700}.source-detail-row>td{padding:.9rem;background:var(--bg);border-bottom:2px solid var(--accent)}.source-detail-row .row-details{max-width:none;margin:0;font-size:.9rem}.source-panel{padding:.7rem}.source-panel-heading{display:flex;justify-content:space-between;gap:1rem;align-items:center}.source-panel h3{margin:.3rem 0;overflow-wrap:anywhere}.source-occurrence{margin-top:1rem}.source-occurrence>h3{font-size:1rem}.source-occurrence>h3 span{font-weight:400;margin-left:.5rem}.source-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr);gap:.8rem}.source-card{min-width:0;padding:1rem;background:var(--card);border:1px solid var(--line);border-radius:10px}.source-card h4,.source-notes h4{margin:0;color:var(--accent)}.source-notes{margin-top:.8rem;padding:.8rem;border-left:3px solid var(--warn)}.source-fields code{font-size:.9rem}.source-fields dt{color:var(--muted);font-size:.78rem}.source-fields dd{margin:.15rem 0 .65rem}.source-close{font-size:.8rem;white-space:nowrap}.source-detail-row.enhanced summary{display:none}@media(max-width:900px){.source-grid{grid-template-columns:1fr}}
.source-detail-row>td,.guide .source-detail-row>td{white-space:normal;font-weight:400}
</style>
</head>
<body><main>
<header><div class="eyebrow">Local, read-only inventory</div><h1>VS Code Copilot chat sessions</h1><p>${escapeHtml(summary)} This report was generated <span class="datetime">${escapeHtml(localDateCell(generated.getTime()))}</span> for <code>${escapeHtml(root)}</code>. Dates use the report generator's local time (${escapeHtml(Intl.DateTimeFormat().resolvedOptions().timeZone)}).</p><a class="top-link" href="#storage-guide" data-open-guide>How storage, IDs, and statuses work ↓</a> · <a href="#ignored-sessions" data-open-ignored>Ignored sessions (${hiddenCount}) ↓</a></header>
<section class="metrics" aria-label="Inventory totals">
<div class="metric"><strong>${groups.length}</strong><span>grouped rows</span></div><div class="metric"><strong>${occurrences.length}</strong><span>workspace/provider references</span></div><div class="metric"><strong>${eligible.length}</strong><span>eligible before default filters</span></div><div class="metric"><strong>${hiddenCount}</strong><span>hidden by default</span></div><div class="metric"><strong>${shown.length}</strong><span>main-table rows</span></div>
</section>
<section class="grid" aria-label="Inventory charts">
<div class="panel"><h2>Backing status</h2><p class="caption">Grouped rows, not physical files.</p>${chartRows(statuses, groups.length, (value) => value.replace('ignored: ', 'Hidden: ')) || '<p>No rows discovered.</p>'}</div>
<div class="panel"><h2>Chat types</h2><p class="caption">Type describes the source family or verified child scope.</p>${chartRows(types, groups.length) || '<p>No rows discovered.</p>'}</div>
</section>
<section class="panel"><h2>Find a session</h2><div class="controls"><label for="search">Search</label><input id="search" type="search" placeholder="Title, ID, type, status"><label for="type-filter">Type</label><select id="type-filter"><option value="">All types</option>${typeOptions.map((type) => `<option>${escapeHtml(type)}</option>`).join('')}</select><label for="status-filter">Status</label><select id="status-filter"><option value="">All statuses</option>${statusOptions.map((status) => `<option>${escapeHtml(status)}</option>`).join('')}</select><button id="reset" type="button">Reset filters</button><span id="row-count" aria-live="polite">${shown.length} rows</span></div><p class="caption">Select/copy a verified Local ID prefix for export. Rows marked “path required” show the exact journal path in their details. File links point to recorded or expected local locations; they do not confirm that a path still exists. Your browser may restrict opening local files.</p></section>
<section class="panel"><h2>Sessions</h2><div class="table-wrap"><table id="sessions"><thead><tr>${[['created','Created'],['updated','Updated'],['prompts','Prompts'],['type','Type'],['selector','ID / selector'],['title','Title'],['status','Backing / visibility']].map(([key,label]) => `<th scope="col"><button type="button" data-sort="${key}">${label} ↕</button></th>`).join('')}</tr></thead><tbody>${tableRows || '<tr><td colspan="7" class="empty">No sessions match the selected listing options.</td></tr>'}</tbody></table></div></section>
${storageGuideHtml}
<details class="guide" id="ignored-sessions"><summary>Ignored sessions (${hiddenCount})</summary><div class="guide-content"><p>All grouped sessions hidden by the default rules, including their reasons and source details. This section is independent of the main table's filters and newest-25 limit. With --show-ignored, these rows also appear in the main table.</p><div class="table-wrap"><table id="ignored-table"><thead><tr><th>Created</th><th>Updated</th><th>Prompts</th><th>Type</th><th>ID / selector</th><th>Title</th><th>Backing / visibility</th></tr></thead><tbody>${ignoredRows || '<tr><td colspan="7" class="empty">No ignored sessions.</td></tr>'}</tbody></table></div></div></details>
<footer>Generated locally by copilot-chat-exporter. Self-contained HTML; no external libraries, fonts, images, or network requests. The counters describe this inventory snapshot, not a count of every physical chat file or every chat ever created.</footer>
</main>
<script>
(() => {
  const table=document.querySelector('#sessions'), body=table.tBodies[0], rows=[...body.rows].filter(row=>row.dataset.search!==undefined), search=document.querySelector('#search'), type=document.querySelector('#type-filter'), status=document.querySelector('#status-filter'), counter=document.querySelector('#row-count');
  const panels=new Map();
  for(const button of document.querySelectorAll('button.source-toggle')){
    const panel=document.getElementById(button.getAttribute('aria-controls')),details=panel.querySelector('details'),close=panel.querySelector('.source-close');
    panels.set(panel.id,{panel,details,button});
    panel.hidden=true;panel.classList.add('enhanced');button.hidden=false;close.hidden=false;
    const toggle=(open)=>{details.open=open;panel.hidden=!open;button.setAttribute('aria-expanded',String(open));};
    button.addEventListener('click',()=>toggle(!details.open));
    close.addEventListener('click',()=>{toggle(false);button.focus();});
  }
  const apply=()=>{let count=0;for(const row of rows){const match=(!search.value||row.dataset.search.includes(search.value.toLocaleLowerCase()))&&(!type.value||row.dataset.type===type.value)&&(!status.value||row.dataset.status===status.value);row.hidden=!match;const entry=panels.get(row.dataset.details);entry.panel.hidden=!match||!entry.details.open;if(match)count+=1;}counter.textContent=count+' of '+rows.length+' rows';};
  search.addEventListener('input',apply);type.addEventListener('change',apply);status.addEventListener('change',apply);document.querySelector('#reset').addEventListener('click',()=>{search.value='';type.value='';status.value='';apply();});
  for(const button of table.querySelectorAll('th button[data-sort]'))button.addEventListener('click',()=>{const key=button.dataset.sort,index=[...button.closest('tr').cells].indexOf(button.closest('th'));const direction=button.dataset.direction==='asc'?'desc':'asc';button.dataset.direction=direction;const sorted=[...rows].sort((a,b)=>{const dates=key==='created'||key==='updated',x=dates?a.cells[index].dataset.timestamp:a.cells[index].innerText.trim(),y=dates?b.cells[index].dataset.timestamp:b.cells[index].innerText.trim(),xu=!x||x==='unknown',yu=!y||y==='unknown';if(xu||yu)return xu?(yu?0:1):-1;const cmp=dates||key==='prompts'?Number(x)-Number(y):x.localeCompare(y,undefined,{numeric:true,sensitivity:'base'});return direction==='asc'?cmp:-cmp;});for(const row of sorted)body.append(row,panels.get(row.dataset.details).panel);rows.splice(0,rows.length,...sorted);apply();});
  for(const button of document.querySelectorAll('button.copy'))button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copy);button.textContent='Copied';setTimeout(()=>button.textContent='Copy',1200);}catch{button.textContent='Select text';}});
  const guide=document.querySelector('#storage-guide'),openGuide=()=>{if(location.hash==='#storage-guide')guide.open=true;};document.querySelector('[data-open-guide]').addEventListener('click',()=>{guide.open=true;});window.addEventListener('hashchange',openGuide);openGuide();
  const ignored=document.querySelector('#ignored-sessions'),openIgnored=()=>{if(location.hash==='#ignored-sessions')ignored.open=true;};document.querySelector('[data-open-ignored]').addEventListener('click',()=>{ignored.open=true;});window.addEventListener('hashchange',openIgnored);openIgnored();
})();
</script>
</body></html>`;
}
