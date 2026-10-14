import type { ConversationGroup } from './listing-model.ts';
import type { ListingEvidence } from './listing-evidence-types.ts';
import type { ListingRelationship } from './listing-relationships.ts';
import { referenceBasis } from './detailed-source.ts';
import { escapeHtml as html } from './listing-html.ts';

/**
 * Evidence-based conditions worth a second look. They describe what the exporter observed, never
 * whether a chat is safe to delete. One chat can match several.
 */
export const attentionConditions = [
  { flag: 'unresolved', icon: '❓', label: 'Unresolved backing', tone: 'warning',
    meaning: 'A reference exists, but no readable conversation content was verified (index entry without a journal or SDK events, or a source that could not be read). Not proof the chat is gone.' },
  { flag: 'unsupported', icon: '⛔', label: 'Unsupported provider key', tone: 'warning',
    meaning: 'The index uses a provider key this exporter cannot resolve. The entry is listed, not exported.' },
  { flag: 'ambiguous', icon: '🟠', label: 'Ambiguous mapping or child scope', tone: 'warning',
    meaning: 'Identity or child-scope evidence fits more than one candidate. Nothing is guessed; the verified part stays available.' },
  { flag: 'journal-only', icon: '🧾', label: 'Journal without index entry', tone: 'neutral',
    meaning: 'A Local journal exists but no persisted chat index entry in its store names it. This says nothing about whether VS Code shows it.' },
  { flag: 'unreadable', icon: '🚨', label: 'Unreadable or changed source', tone: 'danger',
    meaning: 'Reading failed, or the file changed while the report was built. Rich evidence was omitted; see Why / source.' },
  { flag: 'dangling-link', icon: '🔗', label: 'Parent or fork source outside this inventory', tone: 'neutral',
    meaning: 'A recorded parent or fork origin is not among the listed chats (it may be ignored, deleted, or in a store this report does not read).' },
  { flag: 'audit', icon: '🔎', label: 'Audit notes', tone: 'neutral',
    meaning: 'Parser or audit flags such as partial edit evidence, unrecognized records or redacted text. See the audit legend.' },
] as const;

/** Flags for the quick-filter attribute. `unresolved`, `unsupported` and `audit` come from the existing chip logic. */
export function attentionFlags (
  group: ConversationGroup,
  data: ListingEvidence | undefined,
  edges: readonly ListingRelationship[],
): string[] {
  const rows = group.occurrences;
  return [
    group.childWarnings > 0 || rows.some((row) => row.diagnostics.some((item) => item.category === 'ambiguous')) ? 'ambiguous' : '',
    rows.some((row) => referenceBasis(row) === 'Journal without index entry') ? 'journal-only' : '',
    data?.state === 'changed' || rows.some((row) => row.diagnostics.some((item) => item.category === 'unreadable')) ? 'unreadable' : '',
    edges.some((edge) => edge.from === group.key && edge.to === null && (edge.kind === 'parent' || edge.kind === 'fork')) ? 'dangling-link' : '',
  ].filter(Boolean);
}

export function renderAttentionPanel (counts: ReadonlyMap<string, number>, listed: number, ignored: number): string {
  const active = attentionConditions.filter((item) => (counts.get(item.flag) ?? 0) > 0);
  const ignoredLine = ignored ? `<p class="caption">🙈 ${ignored.toLocaleString('en-US')} more ${ignored === 1 ? 'chat is' : 'chats are'} hidden by default rules; see <a href="#ignored-sessions">Ignored sessions</a>.</p>` : '';
  if (!active.length)
    return `<section class="panel attention" id="needs-attention"><div class="field-line"><strong>🛎️ Needs attention:</strong> none detected in the checks performed (${listed.toLocaleString('en-US')} listed chats).</div>${ignoredLine}</section>`;
  const rows = active.map((item) => {
    const count = counts.get(item.flag) ?? 0;
    return `<tr><td><span class="tag tone-${item.tone}">${item.icon} ${html(item.label)}</span></td><td class="numeric"><strong>${count.toLocaleString('en-US')}</strong></td><td>${html(item.meaning)}</td><td><button type="button" class="enhanced-only" data-attention="${item.flag}" title="Show only these chats">Show</button></td></tr>`;
  }).join('');
  const chips = active.map((item) => `<span class="tag tone-${item.tone}" title="${html(item.label)}">${item.icon} ${(counts.get(item.flag) ?? 0).toLocaleString('en-US')}</span>`).join(' ');
  return `<section class="panel attention" id="needs-attention"><details><summary><strong>🛎️ Needs attention</strong> · ${active.length} ${active.length === 1 ? 'condition' : 'conditions'} among ${listed.toLocaleString('en-US')} listed chats ${chips}</summary><div class="table-wrap"><table><thead><tr><th>Condition</th><th>Chats</th><th>What it means</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><p class="caption">Informational only: a flag is not a deletion or cleanup recommendation, and one chat can match several rows. Counts cover the chats listed in this report.</p>${ignoredLine}</details></section>`;
}
