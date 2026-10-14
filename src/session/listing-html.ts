import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ConversationGroup } from './listing-model.ts';

export function escapeHtml (value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

export function pathLink (filePath: string): string {
  return `<a href="${escapeHtml(pathToFileURL(filePath).href)}"><code>${escapeHtml(filePath)}</code></a>`;
}

export function sourceDetails (group: ConversationGroup): string {
  return group.occurrences.map((item, index) => {
    const provenance = item.provenance;
    const identity = provenance.workspaceIdentity;
    const storageId = path.basename(provenance.workspaceStoragePath);
    let workspaceName = 'unknown';
    if (identity) {
      const uri = new URL(identity.uri);
      workspaceName = decodeURIComponent(uri.pathname.split('/').filter(Boolean).at(-1) ?? '') || 'unknown';
    }
    const workspaceLink = identity?.uri.startsWith('file:')
      ? `<a href="${escapeHtml(identity.uri)}">${escapeHtml(identity.uri)}</a>`
      : escapeHtml(identity?.uri ?? 'unknown');
    const backing = item.backing;
    return `<section class="source-occurrence"><h3>Source ${index + 1} <span class="muted">${escapeHtml(workspaceName)}</span></h3><div class="source-grid"><section class="source-card"><h4>Conversation identity</h4><dl class="source-fields">
<dt>Full session ID</dt><dd><code>${escapeHtml(item.sessionId)}</code></dd>
<dt>Occurrence ID</dt><dd><code>${escapeHtml(item.occurrenceId)}</code></dd>
${backing.status === 'verified' ? `<dt>Backing session ID</dt><dd><code>${escapeHtml(backing.source.sessionId)}</code></dd>` : ''}
${item.parentOccurrenceId ? `<dt>Parent occurrence ID</dt><dd><code>${escapeHtml(item.parentOccurrenceId)}</code></dd>` : ''}
<dt>Title / activity evidence</dt><dd>${escapeHtml(item.titleSource)} / ${escapeHtml(item.activitySource)}</dd>
${provenance.indexKey ? `<dt>Index key</dt><dd><code>${escapeHtml(provenance.indexKey)}</code></dd>` : ''}
</dl></section><section class="source-card"><h4>Workspace / project</h4><dl class="source-fields">
<dt>Workspace ID (storage hash)</dt><dd><code>${escapeHtml(storageId)}</code></dd>
<dt>Workspace name (URI basename)</dt><dd>${escapeHtml(workspaceName)}</dd>
<dt>Project / folder name</dt><dd>${escapeHtml(identity?.kind === 'folder' ? workspaceName : 'unknown (multi-root folders not inspected)')}</dd>
<dt>Workspace identity</dt><dd>${escapeHtml(identity?.kind ?? 'unknown')} - ${workspaceLink}</dd>
</dl></section><section class="source-card"><h4>Files / locations</h4><dl class="source-fields">
${backing.status === 'verified' ? `<dt>${backing.source.kind === 'local-journal' ? 'Journal JSONL' : 'SDK events JSONL'}</dt><dd>${pathLink(backing.source.path)}</dd>` : `<dt>Backing issue</dt><dd>${escapeHtml(backing.reason)}</dd>`}
<dt>Workspace storage</dt><dd>${pathLink(provenance.workspaceStoragePath)}</dd>
<dt>Workspace metadata</dt><dd>${pathLink(path.join(provenance.workspaceStoragePath, 'workspace.json'))}</dd>
<dt>User-data root</dt><dd>${pathLink(provenance.userDataRoot)}</dd>
${provenance.indexKey ? `<dt>Index database</dt><dd>${pathLink(path.join(provenance.workspaceStoragePath, 'state.vscdb'))}</dd>` : ''}
</dl></section></div>
${item.diagnostics.length ? `<div class="source-notes"><h4>Source issues</h4><dl class="source-fields">
${item.diagnostics.map((diagnostic) => `<dt>${escapeHtml(diagnostic.category)}</dt><dd>${escapeHtml(diagnostic.description)}<br>${pathLink(diagnostic.path)}</dd>`).join('')}
</dl></div>` : ''}</section>`;
  }).join('');
}

export function chartRows (counts: Map<string, number>, total: number, label: (value: string) => string = (value) => value, tone?: (value: string) => string): string {
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => {
      const percent = total === 0 ? 0 : Math.round(count * 100 / total);
      return `<div class="chart-row"><span>${escapeHtml(label(key))}</span><span class="bar" aria-label="${percent}%"><i${tone ? ` class="${escapeHtml(tone(key))}"` : ''} style="width:${percent}%"></i></span><strong>${count}</strong></div>`;
    }).join('\n');
}


export const storageGuideHtml = `<details class="guide" id="storage-guide"><summary>How VS Code stores chats, why values can be unknown, and what the status labels mean</summary><div class="guide-content">
<p>This inventory reads local metadata and conversation files from the selected VS Code user-data root. It does not edit VS Code storage, start an agent, fetch remote chats, or reconstruct deleted content. Storage layouts are version-sensitive; this report explains the files the exporter currently checks, not a guarantee that every profile, remote host, or future format is covered.</p>
<h2>Local chat: workspace index → journal</h2>
<div class="diagram" role="img" aria-label="VS Code user data root contains workspaceStorage, each workspace contains a state database and chatSessions journals, and the exporter checks matching IDs"><div class="node"><strong>VS Code user-data root</strong><code>Code/User/</code></div><div class="node"><strong>Workspace folder</strong><code>workspaceStorage/&lt;workspace-hash&gt;/</code></div><div class="node"><strong>Metadata index</strong><code>state.vscdb</code><br>titles and some activity dates</div><div class="node"><strong>Chat journal</strong><code>chatSessions/&lt;session-id&gt;.jsonl</code><br>recorded turns and creation evidence</div></div>
<p>The index and journal answer different questions. The index is useful for the current displayed title and can contain a reference after its journal is gone. The journal is the source checked for Local prompt count and recorded creation time. The exporter only calls a Local entry empty when it successfully reads a valid journal and confirms there are no requests or pending edits.</p>
<h2>Agent Host / Copilot SDK: references → event log</h2>
<div class="tree"><code>Code/User/globalStorage/agent-host.db</code>  (session_chats catalog: chat URI → provider backing)
Code/User/agentSessionData/&lt;chat-key&gt;/session.db  (chat-specific identity metadata)
                 │ exact persisted mapping
                 ▼
%USERPROFILE%/.copilot/session-state/&lt;sdk-session-id&gt;/events.jsonl
                 └─ session.start header must match the backing ID and supported version</div>
<p>These provider chats are not Local journals. A provider/index row is only a reference until the exporter can follow its persisted mapping to a valid SDK event log. Agent Host sessions may also contain peer chats and sub-agent scopes; a child needs recorded parent-tool-call and agent identity evidence. <code>COPILOT_HOME</code> can change the SDK state directory.</p>
<h2>What the statuses mean</h2><div class="table-wrap"><table><thead><tr><th>Status</th><th>Plain-language meaning</th><th>What to do</th></tr></thead><tbody>
<tr><td>verified</td><td>The matching journal/event backing was found and its identity checked. This verifies the source, not necessarily that the provider can already be exported to Markdown.</td><td>For a Local row, copy its ID/prefix. For unsupported provider export, wait for SDK export support.</td></tr>
<tr><td>unresolved</td><td>A reference exists, but there is no verified backing. The journal/events file may be missing, unreadable, malformed, unsupported, or its mapping may not be available. This is not proof the chat was deleted.</td><td>Check the correct VS Code root/profile and whether the referenced file still exists. <code>--show-ignored</code> does not repair missing data.</td></tr>
<tr><td>ambiguous · 🟠 ❓</td><td>More than one candidate matched, or a persisted parent-tool-call ↔ sub-agent mapping was incomplete/conflicting. The exporter refuses to attach a possibly wrong chat.</td><td>Keep an independently verified parent; do not infer a child transcript from its title or nearby files.</td></tr>
<tr><td>unsupported</td><td>The index key is recognized as an external/unknown provider family, but this exporter has no resolver for it.</td><td>Its metadata can be listed, but its conversation cannot be verified or exported here.</td></tr>
<tr><td>path required</td><td>The same Local UUID has journal files in multiple workspace-hash folders. The UUID alone does not identify which file to export.</td><td>Expand “Why / source” and pass the exact <code>chatSessions/&lt;id&gt;.jsonl</code> path.</td></tr>
<tr><td>ignored</td><td>A listing rule hid the row, such as <code>/fix</code>, confirmed-empty, ambiguous, or the selected New Chat placeholder rule.</td><td>Expand “Ignored sessions” at the bottom. Use <code>--show-ignored</code> to also include these rows in the main table and console.</td></tr>
</tbody></table></div>
<h2>Why values can be unknown</h2><div class="callout"><strong>Unknown is not zero.</strong> A count of <code>0</code> means a verified backing was read and contained zero counted prompts. <code>unknown</code> means the exporter lacks enough trustworthy evidence to calculate a value.</div>
<ul><li><strong>Created date unknown:</strong> the Local journal has no usable creation timestamp, or the row has no readable journal. SDK creation time comes from a verified session-start record; a resumed or malformed source may not supply a trustworthy original date.</li><li><strong>Prompt count unknown:</strong> no verified journal/event scope exists, or recorded provider prompt data is malformed/incomplete. Delegated tool instructions are not counted as extra parent human prompts.</li><li><strong>Activity date unknown:</strong> neither a trustworthy index date nor a recorded journal/event timestamp was available. The file's modified time is not treated as the conversation's true activity date.</li></ul>
<h2>Why multiple workspaces happen</h2><p>VS Code stores Local chat journals below each workspace hash. The same UUID can therefore appear under two separate workspace folders, for example after workspace changes, copies, migration, or retained index/journal data. Similar IDs or titles do not prove two records are the same conversation. When the ID appears more than once, the exporter deliberately asks for the exact journal path rather than choosing one by recency.</p>
<h2>How to use the selector</h2><ol><li>Copy the value in <strong>ID / selector</strong> for a verified Local row.</li><li>Pass it as the first argument to the exporter, for example <code>node .\\dist\\cli.js 1a2b3c4d docs\\chat-exports\\session.md --user-data-root "C:\\Users\\you\\AppData\\Roaming\\Code"</code>.</li><li>If the row says <strong>path required</strong>, copy one exact journal path from its details instead. A shortened ID is never used to guess between multiple workspace files.</li></ol>
<p class="callout warning"><strong>Coverage limit:</strong> current discovery covers the selected root's <code>User/workspaceStorage</code> entries and the provider backings that can be verified from local metadata. It does not claim full coverage of other VS Code profiles, remote/cloud storage, missing/rotated journals, or future storage schemas.</p>
</div></details>`;
