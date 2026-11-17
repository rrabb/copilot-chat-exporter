// LOD format workbench page script. build-page.mjs inlines template-engine.mjs and context.mjs ahead of this file,
// so resolveField, renderTemplate, listFields, listAliases, filterNames, templateHash and buildContext are in scope.
// Everything is drawn with textContent. There is no innerHTML, so recorded chat text can't inject markup.

const DATA = JSON.parse(document.getElementById('catalogue-data').textContent);
const INDEX = DATA.index;
const EXAMPLES = DATA.examples;
const CHOICES_SCHEMA = 'wi052-lod-format-choices/1';
const DRAFT_KEY = 'wi052.workbench.draft.v1';
const SHOT_PREFIX = 'wi052.workbench.shot.';
const SHOT_LIMIT = 1500000;
const CHOICES_BYTE_LIMIT = 5 * 1024 * 1024;

const rows = INDEX.rows;
const rowsById = new Map(rows.map(row => [row.id, row]));
const conceptsById = new Map(INDEX.concepts.map(concept => [concept.id, concept]));
const rowsByConcept = new Map();
for (const row of rows) {
  if (!rowsByConcept.has(row.concept))
    rowsByConcept.set(row.concept, []);
  rowsByConcept.get(row.concept).push(row);
}

function conceptSeenRank(id) {
  return Math.max(...rowsByConcept.get(id).map(row => row.seen.chatCount ?? -1));
}

// ---------- small helpers ----------

function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false)
      continue;
    if (key === 'class')
      node.className = value;
    else if (key === 'text')
      node.textContent = value;
    else if (key.startsWith('.'))
      node[key.slice(1)] = value;
    else if (key.startsWith('on'))
      node.addEventListener(key.slice(2), value);
    else
      node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false)
      continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const number = value => Number(value).toLocaleString('en-US');

function stamp(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getFullYear() % 100)}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function richText(text) {
  return String(text).split('`').map((part, index) => (index % 2 ? el('code', { text: part }) : part));
}

function safeLink(url, label) {
  if (!/^https:\/\//.test(url))
    return el('span', { text: label });
  return el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: label });
}

function prettyJson(value, limit = 200000) {
  let text;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = undefined;
  }
  if (text === undefined)
    text = String(value);
  return text.length > limit ? `${text.slice(0, limit)}\n… (${number(text.length - limit)} more characters not shown)` : text;
}

const debounce = (fn, wait) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
};

// ---------- the user's choices ----------

const newDictionary = () => Object.create(null);
const TEMPLATE_FIELDS = ['short', 'medium'];

function cleanEntry(source, allowed) {
  const entry = {};
  if (!source || typeof source !== 'object')
    return entry;
  for (const key of allowed) {
    const value = source[key];
    if ((key === 'short' || key === 'medium' || key === 'note') && typeof value === 'string')
      entry[key] = value;
    else if ((key === 'shortHash' || key === 'mediumHash' || key === 'reviewHash') && typeof value === 'string' && value.length <= 16)
      entry[key] = value;
    else if (key === 'include' && (value === 'show' || value === 'hide'))
      entry[key] = value;
    else if (key === 'review' && (value === 'accepted' || value === 'reviewed'))
      entry[key] = value;
  }
  return entry;
}

function normaliseChoices(input) {
  const choices = { schema: CHOICES_SCHEMA, catalogueId: INDEX.catalogueId, saved: null, concepts: newDictionary(), rows: newDictionary() };
  const report = { foreignId: null, unknownRows: 0, unknownConcepts: 0, resetReviews: 0, invalid: false };
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    report.invalid = input !== null && input !== undefined;
    return { choices, report };
  }
  if (input.schema !== CHOICES_SCHEMA)
    report.invalid = true;
  const hasEntries = Object.keys(input.concepts ?? {}).length > 0 || Object.keys(input.rows ?? {}).length > 0;
  if (hasEntries && typeof input.catalogueId === 'string' && input.catalogueId !== INDEX.catalogueId)
    report.foreignId = input.catalogueId;
  if (typeof input.saved === 'string')
    choices.saved = input.saved;
  const conceptFields = ['short', 'shortHash', 'medium', 'mediumHash', 'include'];
  const rowFields = ['short', 'shortHash', 'medium', 'mediumHash', 'include', 'review', 'reviewHash', 'note'];
  for (const [id, value] of Object.entries(input.concepts ?? {})) {
    const entry = cleanEntry(value, conceptFields);
    if (!Object.keys(entry).length)
      continue;
    choices.concepts[id] = entry;
    if (!conceptsById.has(id))
      report.unknownConcepts += 1;
  }
  for (const [id, value] of Object.entries(input.rows ?? {})) {
    const entry = cleanEntry(value, rowFields);
    if (!Object.keys(entry).length)
      continue;
    choices.rows[id] = entry;
    if (!rowsById.has(id))
      report.unknownRows += 1;
  }
  for (const [id, entry] of Object.entries(choices.rows)) {
    const row = rowsById.get(id);
    if (row && entry.review && entry.reviewHash !== currentReviewHash(row, choices)) {
      delete entry.review;
      delete entry.reviewHash;
      prune(choices.rows, id);
      report.resetReviews += 1;
    }
  }
  return { choices, report };
}

function sortedDictionary(dictionary) {
  const output = {};
  for (const key of Object.keys(dictionary).sort())
    output[key] = dictionary[key];
  return output;
}

function snapshot(choices) {
  return JSON.stringify({ concepts: sortedDictionary(choices.concepts), rows: sortedDictionary(choices.rows) });
}

function serialise(choices) {
  return `${JSON.stringify({ schema: CHOICES_SCHEMA, catalogueId: INDEX.catalogueId, saved: choices.saved, concepts: sortedDictionary(choices.concepts), rows: sortedDictionary(choices.rows) }, null, 2)}\n`;
}

const state = {
  choices: normaliseChoices(null).choices,
  savedSnapshot: '',
  server: false,
  saving: false,
  grouped: true,
  sort: { key: 'seen', direction: 'desc' },
  open: new Set(),
  collapsed: new Set(),
  filters: { search: '', inExamples: false, type: '', status: '', concept: '', origin: '', family: '', review: '', include: '', example: '' },
};

const userRow = id => state.choices.rows[id];
const userConcept = id => state.choices.concepts[id];

function effectiveTemplate(row, which, choices = state.choices) {
  const own = choices.rows[row.id]?.[which];
  if (typeof own === 'string')
    return { text: own, source: 'row-edit' };
  const group = choices.concepts[row.concept]?.[which];
  if (typeof group === 'string')
    return { text: group, source: 'group-edit' };
  return { text: row.suggest[which], source: row.suggest.scope === 'row' ? 'row-suggestion' : 'group-suggestion' };
}

function effectiveInclude(row, choices = state.choices) {
  const own = choices.rows[row.id]?.include;
  if (own)
    return { value: own, source: 'row-edit' };
  const group = choices.concepts[row.concept]?.include;
  if (group)
    return { value: group, source: 'group-edit' };
  return { value: row.include, source: 'suggestion' };
}

function currentReviewHash(row, choices = state.choices) {
  return templateHash(JSON.stringify([
    effectiveTemplate(row, 'short', choices).text,
    effectiveTemplate(row, 'medium', choices).text,
    effectiveInclude(row, choices).value,
  ]));
}

function reviewState(row) {
  const own = userRow(row.id);
  const group = userConcept(row.concept);
  const ownEdit = Boolean(own && (own.short !== undefined || own.medium !== undefined || own.include !== undefined));
  const groupEdit = Boolean(group && (group.short !== undefined || group.medium !== undefined || group.include !== undefined));
  const reviewed = Boolean(own?.review && own.reviewHash === currentReviewHash(row));
  const accepted = reviewed && own.review === 'accepted';
  const edited = ownEdit || groupEdit;
  return { state: accepted ? 'accepted' : reviewed ? 'reviewed' : 'not-reviewed', reviewed, accepted, edited, via: ownEdit ? 'this name' : groupEdit ? 'its group' : '' };
}

function baselineText(row, scope, which) {
  if (scope === 'group')
    return conceptsById.get(row.concept)[which];
  return userConcept(row.concept)?.[which] ?? row.suggest[which];
}

function baselineHash(row, scope, which) {
  return scope === 'group' ? conceptsById.get(row.concept)[`${which}Hash`] : row.suggest[`${which}Hash`];
}

function prune(dictionary, id) {
  if (dictionary[id] && !Object.keys(dictionary[id]).length)
    delete dictionary[id];
}

function setTemplate(row, scope, which, text) {
  const dictionary = scope === 'group' ? state.choices.concepts : state.choices.rows;
  const id = scope === 'group' ? row.concept : row.id;
  const entry = (dictionary[id] ??= {});
  if (text === baselineText(row, scope, which)) {
    delete entry[which];
    delete entry[`${which}Hash`];
  } else {
    entry[which] = text;
    entry[`${which}Hash`] = baselineHash(row, scope, which);
  }
  prune(dictionary, id);
  changed(scope === 'group' ? row.concept : null, row);
}

function resetTemplate(row, which) {
  const own = userRow(row.id);
  if (own && own[which] !== undefined) {
    delete own[which];
    delete own[`${which}Hash`];
    prune(state.choices.rows, row.id);
    changed(null, row);
    return;
  }
  const group = userConcept(row.concept);
  if (group && group[which] !== undefined) {
    delete group[which];
    delete group[`${which}Hash`];
    prune(state.choices.concepts, row.concept);
    changed(row.concept, row);
  }
}

function toggleInclude(row) {
  const current = effectiveInclude(row).value;
  const next = current === 'show' ? 'hide' : 'show';
  const entry = (state.choices.rows[row.id] ??= {});
  const baseline = userConcept(row.concept)?.include ?? row.include;
  if (next === baseline)
    delete entry.include;
  else
    entry.include = next;
  prune(state.choices.rows, row.id);
  changed(null, row);
}

function toggleGroupInclude(concept) {
  const current = userConcept(concept.id)?.include ?? concept.include;
  const next = current === 'show' ? 'hide' : 'show';
  const entry = (state.choices.concepts[concept.id] ??= {});
  if (next === concept.include)
    delete entry.include;
  else
    entry.include = next;
  prune(state.choices.concepts, concept.id);
  changed(concept.id, null);
}

function setReview(row, review) {
  const entry = (state.choices.rows[row.id] ??= {});
  if (review === 'not-reviewed') {
    delete entry.review;
    delete entry.reviewHash;
  } else {
    entry.review = review;
    entry.reviewHash = currentReviewHash(row);
  }
  prune(state.choices.rows, row.id);
  changed(null, row);
}

function setNote(row, text) {
  const entry = (state.choices.rows[row.id] ??= {});
  if (text)
    entry.note = text;
  else
    delete entry.note;
  prune(state.choices.rows, row.id);
  changed(null, row, { quiet: true });
}

// ---------- change tracking, status, draft ----------

const panelRefreshers = new Map();
const rowDom = new Map();
let statusNote = '';

const isDirty = () => snapshot(state.choices) !== state.savedSnapshot;

function setStatus(text, kind) {
  statusNote = text;
  const node = document.getElementById('status');
  node.textContent = text;
  node.className = kind ?? '';
}

function updateStatus() {
  const node = document.getElementById('status');
  if (isDirty()) {
    node.textContent = `Unsaved changes. ${statusNote}`;
    node.className = 'dirty';
  } else {
    node.textContent = statusNote;
    node.className = '';
  }
}

function updateStats() {
  let reviewed = 0;
  let accepted = 0;
  let edited = 0;
  let hidden = 0;
  for (const row of rows) {
    const review = reviewState(row);
    if (review.reviewed)
      reviewed += 1;
    if (review.accepted)
      accepted += 1;
    if (review.edited)
      edited += 1;
    if (effectiveInclude(row).value === 'hide')
      hidden += 1;
  }
  document.getElementById('stats').textContent = `${number(rows.length)} names · ${number(reviewed)} reviewed · ${number(accepted)} accepted · ${number(edited)} edited · ${number(hidden)} hidden by default`;
}

function writeDraft() {
  try {
    if (isDirty())
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ catalogueId: INDEX.catalogueId, at: new Date().toISOString(), snapshot: serialise(state.choices) }));
    else
      localStorage.removeItem(DRAFT_KEY);
  } catch (error) {
    setStatus(`Browser recovery storage could not be updated: ${error.message}. Use "Download copy" to keep your work.`, 'error');
  }
}

const saveDraft = debounce(writeDraft, 400);

function changed(conceptId, row, options) {
  const affected = conceptId ? rowsByConcept.get(conceptId) ?? [] : row ? [row] : [];
  for (const item of affected) {
    const entry = userRow(item.id);
    if (entry?.review && entry.reviewHash !== currentReviewHash(item)) {
      delete entry.review;
      delete entry.reviewHash;
      prune(state.choices.rows, item.id);
    }
    refreshRowCells(item);
  }
  if (!options?.quiet)
    for (const refresh of panelRefreshers.values())
      refresh();
  refreshGroupHeaders();
  updateStats();
  updateStatus();
  saveDraft();
}

// ---------- table rows ----------

const EARLIER_LABELS = {
  localCalls: 'Local calls',
  localNameMentions: 'Local name mentions',
  localDefinitionMentions: 'Local definition mentions',
  sdkNameMentions: 'SDK name mentions',
  sdkRequests: 'SDK requests',
  sdkStarts: 'SDK starts',
};

function exampleKind(row) {
  if (row.hasRecorded)
    return 'recorded';
  if (row.exampleSlots.some(example => example.privacyReplacement))
    return 'privacy';
  return row.exampleSlots.length ? 'skeleton' : 'none';
}

function seenCell(row) {
  const cell = el('td', { class: 'col-seen' });
  if (row.seen.chatCount !== null)
    cell.append(el('div', null, el('span', { class: 'num', text: number(row.seen.chatCount) }), ' scanned chats'));
  for (const part of row.seen.parts)
    cell.append(el('div', null, el('span', { class: 'num', text: number(part.value) }), ' ', el('span', { class: 'muted', text: part.label })));
  if (row.seen.failed)
    cell.append(el('div', { class: 'muted', text: `${number(row.seen.failed)} SDK tool failures` }));
  if (!row.seen.parts.length && row.earlier) {
    const entries = Object.entries(row.earlier).filter(([, value]) => value > 0);
    for (const [key, value] of entries)
      cell.append(el('div', null, 'earlier survey: ', el('span', { class: 'num', text: number(value) }), ' ', el('span', { class: 'muted', text: EARLIER_LABELS[key] ?? key })));
    if (!entries.length)
      cell.append(el('span', { class: 'muted', text: 'listed, never called' }));
  }
  if (!cell.childNodes.length)
    cell.append(el('span', { class: 'muted', text: 'not seen' }));
  return cell;
}

function subtitleNodes(row) {
  const concept = conceptsById.get(row.concept)?.title ?? row.concept;
  const bits = [
    el('span', { text: concept, title: 'Group' }),
    el('span', { text: row.origin.value, title: `Origin. ${row.origin.basis}` }),
    el('span', { text: row.status, title: 'Documented, observed in recorded chats, or both' }),
    el('span', { text: row.family, title: 'Which kind of chat recorded it' }),
  ];
  if (row.chats)
    bits.push(el('span', { text: `${row.chats.local} Local + ${row.chats.sdk} agent chats`, title: 'Chats where it was seen' }));
  if (row.first)
    bits.push(el('span', { text: row.first === row.last ? row.first : `${row.first} to ${row.last}`, title: 'First and last day seen' }));
  const output = [];
  bits.forEach((bit, index) => {
    if (index)
      output.push(' · ');
    output.push(bit);
  });
  return output;
}

function reviewCell(row) {
  const review = reviewState(row);
  const select = el('select', { 'aria-label': `Review ${row.name}`, title: 'Review applies to the current formats and show/hide setting.', onchange: event => {
    setReview(row, event.target.value);
    renderTable();
  } },
  el('option', { value: 'not-reviewed', text: 'Not reviewed' }),
  el('option', { value: 'reviewed', text: 'Reviewed' }),
  el('option', { value: 'accepted', text: 'Accepted' }));
  select.value = review.state;
  return el('div', null, select, review.edited ? el('span', { class: 'chip edited', text: 'edited', title: `Formats or include changed for ${review.via}.` }) : null);
}

function includeCell(row) {
  const include = effectiveInclude(row);
  const edited = include.source !== 'suggestion';
  const title = edited
    ? `You set this (${include.source === 'row-edit' ? 'this name' : 'its group'}). Suggested: ${row.include}. Click to flip.`
    : `Suggested default. ${row.suggest.why || ''} Click to flip.`;
  return el('button', { class: `chip ${include.value} ${edited ? 'edited' : ''}`, text: include.value, title, onclick: () => {
    toggleInclude(row);
    renderTable();
  } });
}

function refreshRowCells(row) {
  const dom = rowDom.get(row.id);
  if (!dom)
    return;
  dom.cells.review.replaceChildren(reviewCell(row));
  dom.cells.include.replaceChildren(includeCell(row));
}

function toggleOpen(row) {
  const dom = domFor(row);
  const expander = dom.tr.querySelector('.expander');
  const button = dom.tr.querySelector('[role=button]');
  if (state.open.has(row.id)) {
    state.open.delete(row.id);
    dom.tr.classList.remove('is-open');
    expander.textContent = '▸';
    button.setAttribute('aria-expanded', 'false');
    dom.detail?.remove();
    dom.detail = null;
    panelRefreshers.delete(row.id);
    return;
  }
  state.open.add(row.id);
  dom.tr.classList.add('is-open');
  expander.textContent = '▾';
  button.setAttribute('aria-expanded', 'true');
  dom.detail = el('tr', { class: 'detail' }, el('td', { colspan: 10 }, buildPanel(row)));
  dom.tr.after(dom.detail);
}

function domFor(row) {
  let dom = rowDom.get(row.id);
  if (dom)
    return dom;
  const review = el('td', { class: 'col-review' });
  const include = el('td', { class: 'col-include' });
  const toggle = () => toggleOpen(row);
  const nameBox = el('div', { role: 'button', tabindex: 0, 'aria-expanded': 'false', onkeydown: event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  } },
  el('span', { class: 'expander', text: '▸' }),
  el('code', { class: 'name', text: row.name }));
  const tr = el('tr', { class: 'row', 'data-id': row.id, onclick: event => {
    if (event.target.closest('button.chip, a, input, select, textarea'))
      return;
    toggle();
  } },
  review,
  include,
  el('td', { class: 'col-name' }, nameBox, el('span', { class: 'sub' }, subtitleNodes(row))),
  el('td', { class: 'col-type', text: row.type }),
  el('td', { class: `col-label ${row.labelFromConcept ? 'label-from-concept' : ''}`, text: row.label, title: row.labelFromConcept ? 'No name-specific label. Showing the group title.' : '' }),
  seenCell(row),
  el('td', { class: 'col-extra col-concept', text: conceptsById.get(row.concept)?.title ?? row.concept }),
  el('td', { class: 'col-extra col-status', text: row.status }),
  el('td', { class: 'col-extra col-origin', text: row.origin.value, title: row.origin.basis }),
  el('td', { class: 'col-extra col-family', text: row.family }));
  dom = { tr, detail: null, cells: { review, include } };
  rowDom.set(row.id, dom);
  refreshRowCells(row);
  return dom;
}

// ---------- filters, sorting, grouping ----------

const haystacks = new Map();
const exampleText = new Map();

function haystack(row) {
  let text = haystacks.get(row.id);
  if (text !== undefined)
    return text;
  const docs = row.docs ?? {};
  const parts = [row.id, row.name, row.label, row.type, conceptsById.get(row.concept)?.title, row.concept, row.origin.value, row.status, row.family, ...row.notes,
    docs.cli?.description, docs.extension?.displayName, docs.extension?.userDescription, docs.extension?.description, docs.sdk?.description, docs.sdk?.interface, docs.vscode?.description, docs.vscode?.interface, docs.online?.name, docs.online?.lodIdea];
  text = parts.filter(Boolean).join('\n').toLowerCase();
  haystacks.set(row.id, text);
  return text;
}

function examplesHaystack(row) {
  let text = exampleText.get(row.id);
  if (text !== undefined)
    return text;
  text = (EXAMPLES[row.id] ?? []).map(example => JSON.stringify(example.value) ?? '').join('\n').toLowerCase();
  exampleText.set(row.id, text);
  return text;
}

function matches(row) {
  const { filters } = state;
  if (filters.type && row.type !== filters.type)
    return false;
  if (filters.status && row.status !== filters.status)
    return false;
  if (filters.concept && row.concept !== filters.concept)
    return false;
  if (filters.origin && row.origin.value !== filters.origin)
    return false;
  if (filters.family && row.family !== filters.family)
    return false;
  if (filters.example && exampleKind(row) !== filters.example)
    return false;
  if (filters.review) {
    const review = reviewState(row);
    const values = { 'not-reviewed': !review.reviewed, 'not-accepted': !review.accepted, reviewed: review.state === 'reviewed', accepted: review.accepted, edited: review.edited };
    if (!values[filters.review])
      return false;
  }
  if (filters.include && effectiveInclude(row).value !== filters.include)
    return false;
  const terms = filters.search.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) {
    const text = haystack(row);
    const deep = filters.inExamples ? examplesHaystack(row) : '';
    if (!terms.every(term => text.includes(term) || deep.includes(term)))
      return false;
  }
  return true;
}

const REVIEW_ORDER = { 'not-reviewed': 0, reviewed: 1, accepted: 2 };

function compareRows(a, b) {
  const { key, direction } = state.sort;
  const factor = direction === 'asc' ? 1 : -1;
  let result = 0;
  if (key === 'seen')
    result = (a.seen.chatCount ?? -1) - (b.seen.chatCount ?? -1);
  else if (key === 'review')
    result = REVIEW_ORDER[reviewState(a).state] - REVIEW_ORDER[reviewState(b).state];
  else if (key === 'include')
    result = effectiveInclude(a).value.localeCompare(effectiveInclude(b).value);
  else if (key === 'name')
    result = a.name.localeCompare(b.name);
  else if (key === 'type')
    result = a.type.localeCompare(b.type);
  else if (key === 'label')
    result = a.label.localeCompare(b.label);
  else if (key === 'concept')
    result = (conceptsById.get(a.concept)?.title ?? '').localeCompare(conceptsById.get(b.concept)?.title ?? '');
  else if (key === 'status')
    result = a.status.localeCompare(b.status);
  else if (key === 'origin')
    result = a.origin.value.localeCompare(b.origin.value);
  else if (key === 'family')
    result = a.family.localeCompare(b.family);
  if (result === 0)
    result = a.name.localeCompare(b.name);
  return result * factor;
}

function groupHeaderRow(concept, shown) {
  const user = userConcept(concept.id);
  const include = user?.include ?? concept.include;
  const includeEdited = user?.include !== undefined;
  const collapsed = state.collapsed.has(concept.id);
  const title = el('span', { class: 'gtitle', role: 'button', tabindex: 0, 'aria-expanded': String(!collapsed), onclick: () => {
    if (state.collapsed.has(concept.id))
      state.collapsed.delete(concept.id);
    else
      state.collapsed.add(concept.id);
    renderTable();
  }, onkeydown: event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.currentTarget.click();
    }
  }, text: `${collapsed ? '▸' : '▾'} ${concept.title}` });
  const includeButton = el('button', { class: `chip ${include} ${includeEdited ? 'edited' : ''}`, text: `group: ${include}`, title: `Default for every name in this group that has no include choice of its own. Suggested: ${concept.include}. ${concept.why ?? ''}`, onclick: () => {
    toggleGroupInclude(concept);
    renderTable();
  } });
  const template = which => {
    const text = user?.[which] ?? concept[which];
    return el('span', { class: `gtpl ${user?.[which] !== undefined ? 'is-edited' : ''}`, text: `${which}: ${text}` });
  };
  return el('tr', { class: 'group-head', 'data-concept': concept.id }, el('td', { colspan: 10 },
    title, ' ', includeButton,
    el('span', { class: 'gmeta', text: `${shown} shown of ${number(rowsByConcept.get(concept.id)?.length ?? 0)}${concept.why ? ` · ${concept.why}` : ''}` }),
    template('short'), template('medium')));
}

function refreshGroupHeaders() {
  for (const head of document.querySelectorAll('tr.group-head')) {
    const concept = conceptsById.get(head.dataset.concept);
    if (!concept)
      continue;
    const shown = rowsByConcept.get(concept.id).filter(matches).length;
    head.replaceWith(groupHeaderRow(concept, shown));
  }
}

function renderTable() {
  const tbody = document.getElementById('rows');
  const visible = rows.filter(matches);
  const fragment = document.createDocumentFragment();
  if (state.grouped) {
    const groups = new Map();
    for (const row of visible) {
      if (!groups.has(row.concept))
        groups.set(row.concept, []);
      groups.get(row.concept).push(row);
    }
    const order = [...groups.keys()].sort((a, b) => (conceptSeenRank(b) - conceptSeenRank(a)) || a.localeCompare(b));
    for (const id of order) {
      const concept = conceptsById.get(id);
      const list = groups.get(id).sort(compareRows);
      fragment.append(groupHeaderRow(concept, list.length));
      if (state.collapsed.has(id))
        continue;
      for (const row of list)
        appendRow(fragment, row);
    }
  } else {
    for (const row of visible.sort(compareRows))
      appendRow(fragment, row);
  }
  tbody.replaceChildren(fragment);
  document.getElementById('count').textContent = `${number(visible.length)} of ${number(rows.length)} names shown`;
  document.getElementById('empty').hidden = visible.length > 0;
  for (const head of document.querySelectorAll('th.sortable')) {
    const active = head.dataset.key === state.sort.key;
    head.setAttribute('aria-sort', active ? (state.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    head.dataset.arrow = active ? (state.sort.direction === 'asc' ? ' ▲' : ' ▼') : '';
    head.textContent = `${head.dataset.label}${head.dataset.arrow}`;
  }
}

function appendRow(fragment, row) {
  const dom = domFor(row);
  fragment.append(dom.tr);
  if (state.open.has(row.id) && dom.detail)
    fragment.append(dom.detail);
}

// ---------- detail panel ----------

function kv(pairs) {
  const list = el('dl', { class: 'kv' });
  for (const [key, value] of pairs) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length))
      continue;
    list.append(el('dt', { text: key }), el('dd', null, value));
  }
  return list;
}

function fieldTable(fields, columns) {
  const table = el('table', { class: 'mini' }, el('thead', null, el('tr', null, columns.map(([, label]) => el('th', { text: label })))));
  const body = el('tbody');
  for (const field of fields)
    body.append(el('tr', null, columns.map(([key]) => el('td', null, typeof field[key] === 'boolean' ? (field[key] ? 'yes' : 'no') : field[key] === undefined ? '' : richText(field[key])))));
  table.append(body);
  return table;
}

function countChips(items, limit = 24) {
  if (!items?.length)
    return undefined;
  const wrap = el('span');
  for (const item of items.slice(0, limit))
    wrap.append(el('span', { class: 'chip', text: `${item.name} ×${number(item.count)}` }), ' ');
  if (items.length > limit)
    wrap.append(el('span', { class: 'muted', text: `+${items.length - limit} more` }));
  return wrap;
}

function docsBlocks(row) {
  const docs = row.docs ?? {};
  const blocks = [];
  if (docs.cli) {
    blocks.push(el('div', null, el('span', { class: 'chip doc', text: 'Copilot CLI reference' }), ' ', el('strong', { text: docs.cli.group }), ': ', docs.cli.description));
  }
  if (docs.extension) {
    const extension = docs.extension;
    blocks.push(el('div', null,
      el('span', { class: 'chip doc', text: 'Copilot Chat extension manifest' }), ' ',
      el('strong', { text: extension.displayName ?? extension.name }), extension.userDescription ? ` - ${extension.userDescription}` : '',
      extension.description ? el('div', { class: 'muted small', text: extension.description }) : null,
      extension.versions?.length ? el('div', { class: 'muted small', text: `Seen in: ${extension.versions.join('; ')}` }) : null,
      extension.inputs?.length ? el('details', null, el('summary', { text: `Inputs (${extension.inputs.length})` }), fieldTable(extension.inputs, [['name', 'Name'], ['type', 'Type'], ['required', 'Required'], ['description', 'Description']])) : null));
  }
  if (docs.sdk) {
    const sdk = docs.sdk;
    blocks.push(el('div', null,
      el('span', { class: 'chip doc', text: 'Copilot SDK types' }), ' ', el('code', { text: sdk.interface }),
      sdk.experimental ? el('span', { class: 'chip stale', text: 'experimental' }) : null,
      sdk.deprecated ? el('span', { class: 'chip stale', text: 'deprecated' }) : null,
      sdk.description ? el('div', { text: sdk.description }) : null,
      sdk.fields?.length ? el('details', null, el('summary', { text: `Documented fields (${sdk.fields.length})` }), fieldTable(sdk.fields, [['name', 'Name'], ['type', 'Type'], ['optional', 'Optional'], ['description', 'Description']])) : null));
  }
  if (docs.vscode) {
    const part = docs.vscode;
    blocks.push(el('div', null,
      el('span', { class: 'chip doc', text: 'VS Code source' }), ' ', el('code', { text: part.interface }),
      part.description ? el('div', { text: part.description }) : null,
      part.fields?.length ? el('details', null, el('summary', { text: `Declared fields (${part.fields.length})` }), fieldTable(part.fields, [['name', 'Name'], ['type', 'Type'], ['optional', 'Optional']])) : null));
  }
  if (docs.online) {
    const online = docs.online;
    blocks.push(el('div', null,
      el('span', { class: 'chip doc', text: 'Online research' }), ' ', el('strong', { text: online.name }),
      online.structure ? el('div', null, 'Structure: ', el('code', { text: online.structure })) : null,
      online.lodIdea ? el('div', { text: `LOD idea: ${online.lodIdea}` }) : null,
      online.caveat ? el('div', { class: 'muted small', text: `Caveat: ${online.caveat}` }) : null));
  }
  for (const hint of docs.hints ?? []) {
    blocks.push(el('div', null,
      el('span', { class: 'chip doc', text: `Research ${hint.id}` }), ' ', el('strong', { text: hint.name }),
      hint.lodIdea ? el('div', { text: hint.lodIdea }) : null,
      hint.caveat ? el('div', { class: 'muted small', text: `Caveat: ${hint.caveat}` }) : null));
  }
  return blocks;
}

function whatSection(row) {
  const concept = conceptsById.get(row.concept);
  const section = el('section', null, el('h3', { text: 'What it is' }));
  section.append(kv([
    ['Label', row.label],
    ['Type', row.type],
    ['Group', concept ? `${concept.title}${concept.why ? ` - ${concept.why}` : ''}` : row.concept],
    ['Status', row.status],
    ['Family', row.family],
    ['Origin', `${row.origin.value} - ${row.origin.basis}`],
    ['Suggested include', `${row.include}${row.suggest.why ? ` - ${row.suggest.why}` : ''}`],
    ['Seen', row.seen.parts.length ? row.seen.parts.map(part => `${number(part.value)} ${part.label}`).join('; ') : undefined],
    ['Chats', row.chats ? `${row.chats.local} Local, ${row.chats.sdk} agent (SDK, Agent Host, or Copilot CLI)` : undefined],
    ['Days', row.days ? `${row.days} days between ${row.first} and ${row.last}` : undefined],
    ['Notes', row.notes.join(' ')],
  ]));
  for (const block of docsBlocks(row))
    section.append(block);
  const observed = [['Observed input keys', row.inputKeys], ['Observed result keys', row.resultKeys], ['Observed fields', row.fields]];
  for (const [label, items] of observed) {
    if (items?.length)
      section.append(el('div', { class: 'small' }, el('strong', { text: `${label}: ` }), countChips(items)));
  }
  if (row.links?.length) {
    const links = el('div', { class: 'small' }, el('strong', { text: 'Sources: ' }));
    row.links.forEach((link, index) => {
      if (index)
        links.append(' · ');
      links.append(safeLink(link.url, link.label));
    });
    section.append(links);
  }
  if (concept?.research?.length) {
    const research = el('details', null, el('summary', { text: `LOD research notes for this group (${concept.research.length})` }));
    for (const item of concept.research)
      research.append(el('div', { class: 'small' }, el('strong', { text: item.family }), item.lod ? ` - ${item.lod}` : '', item.caveat ? el('div', { class: 'muted', text: `Caveat: ${item.caveat}` }) : null));
    section.append(research);
  }
  return section;
}

function exampleSuffix(example) {
  return example.privacyReplacement ? ' (synthetic privacy replacement)' : example.synthetic ? ' (skeleton, not recorded)' : '';
}

function exampleLabel(example, index) {
  const complete = example.fullEvidence?.status === 'complete';
  const bytes = complete ? example.fullEvidence.bytes : example.bytes;
  const size = bytes !== undefined ? ` · ${number(bytes)} B${!complete && example.clipped?.length ? ' preview' : ''}${example.originalBytes > bytes ? ` of ${number(example.originalBytes)} B original` : ''}` : '';
  return `${index + 1}. ${example.slot}${exampleSuffix(example)}${example.when ? ` · ${example.when}` : ''}${size}`;
}

function evidenceValue(example) {
  if (example.fullEvidence?.status === 'complete')
    return { label: 'Complete redacted example', value: example.fullEvidence.value, omissions: example.fullEvidence.omissions };
  if (example.clipped?.length)
    return { label: 'Complete evidence unavailable. Saved preview only.', value: example.value, reason: example.fullEvidence?.reason ?? 'This snapshot contains only a shortened example.' };
  return { label: example.synthetic ? 'Synthetic example, not recorded evidence' : 'Complete redacted example', value: example.value, omissions: [] };
}

function evidenceSection(row) {
  const examples = EXAMPLES[row.id] ?? [];
  const section = el('section', null, el('h3', { text: `Evidence and examples (${examples.length} ${examples.length === 1 ? 'example' : 'examples'})` }));
  if (!examples.length) {
    section.append(el('div', { class: 'muted', text: 'No example exists. This name is only documented, or was listed but never called in the scanned chats.' }));
    return section;
  }
  section.append(el('div', { class: 'muted small', text: 'Complete redacted examples and labelled synthetic examples. Missing complete records are labelled as previews. Open one to read it.' }));
  examples.forEach((example, index) => {
    const details = el('details', { class: 'evidence' }, el('summary', { text: exampleLabel(example, index) }));
    let built = false;
    details.addEventListener('toggle', () => {
      if (!details.open || built)
        return;
      built = true;
      const evidence = evidenceValue(example);
      details.append(el('strong', { text: evidence.label }));
      if (evidence.reason)
        details.append(el('div', { class: 'warning', text: evidence.reason }));
      if (evidence.omissions?.length)
        details.append(el('div', { class: 'small', text: `Omitted base64-like data (${evidence.omissions.length} fields): ${evidence.omissions.map(item => `${item.path} (${number(item.chars)} characters)`).join('; ')}` }));
      if (example.synthetic)
        details.append(el('div', { class: 'skeleton-note', text: example.note ?? 'Synthetic skeleton built from documented field types. It is not a recorded example.' }));
      else
        details.append(kv([
          ['Chat', example.sid ? `${example.family} · ${example.sid} (hashed id, see the scan manifest)` : example.family],
          ['Where', example.locator],
          ['Original size', example.originalBytes !== undefined ? `${number(example.originalBytes)} B, hash ${String(example.originalHash ?? '').slice(0, 12)}` : undefined],
          ['Saved preview clipping', example.clipped?.length ? example.clipped.map(item => `${item.path}: ${item.reason}${item.chars ? ` (${number(item.chars)} chars)` : ''}${item.items ? ` (${number(item.items)} items)` : ''}`).join('; ') : undefined],
        ]));
      details.append(el('pre', { text: prettyJson(evidence.value, Infinity) }));
    });
    section.append(details);
  });
  return section;
}

function screenshotSlot(row) {
  const key = `${SHOT_PREFIX}${row.id}`;
  const message = el('div', { class: 'small muted' });
  const holder = el('div');
  const show = () => {
    holder.replaceChildren();
    let data = null;
    try {
      data = localStorage.getItem(key);
    } catch {
      data = null;
    }
    if (data && /^data:image\/(png|jpeg|gif|webp);base64,/.test(data)) {
      holder.append(el('img', { src: data, alt: `Your screenshot of ${row.name} in the Copilot GUI` }), el('button', { text: 'Remove screenshot', onclick: () => {
        try {
          localStorage.removeItem(key);
        } catch {
          // Nothing stored.
        }
        show();
      } }));
    }
  };
  const accept = file => {
    if (!file || !/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
      message.textContent = 'Use a PNG, JPEG, GIF, or WebP image.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result);
      if (data.length > SHOT_LIMIT) {
        message.textContent = `That image is ${number(data.length)} characters. The limit is ${number(SHOT_LIMIT)}. Crop it or save it smaller.`;
        return;
      }
      try {
        localStorage.setItem(key, data);
        message.textContent = 'Saved in this browser only. It is not part of the JSON file.';
      } catch {
        message.textContent = 'This browser blocked storing the image.';
      }
      show();
    };
    reader.readAsDataURL(file);
  };
  const box = el('div', { class: 'shot', tabindex: 0, onpaste: event => {
    const item = [...(event.clipboardData?.items ?? [])].find(entry => entry.type.startsWith('image/'));
    if (item)
      accept(item.getAsFile());
  } },
  el('strong', { text: 'Your screenshot (optional)' }),
  el('div', { class: 'small muted', text: 'Click here and paste an image, or choose a file. Kept in this browser only.' }),
  el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', onchange: event => accept(event.target.files[0]) }),
  message, holder);
  show();
  return box;
}

function guiSection(row) {
  const section = el('section', null, el('h3', { text: 'How the Copilot GUI shows it' }));
  for (const item of row.gui ?? []) {
    const evidence = item.evidence === 'documented' ? 'documented' : item.evidence.startsWith('inferred') ? 'inferred' : 'unknown';
    section.append(el('div', { class: `gui-item ${evidence}` },
      el('strong', { text: item.where }), ' ', el('span', { class: 'chip', text: item.evidence }),
      el('div', null, richText(item.text)),
      el('div', { class: 'muted small', text: item.basis })));
  }
  section.append(screenshotSlot(row));
  return section;
}

function preferredExample(row) {
  const examples = EXAMPLES[row.id] ?? [];
  const good = examples.findIndex(example => !example.synthetic && /ok|typical/.test(example.slot));
  if (good >= 0)
    return good;
  const real = examples.findIndex(example => !example.synthetic);
  return real >= 0 ? real : 0;
}

const contextCache = new Map();

function contextFor(row, index) {
  const key = `${row.id}#${index}`;
  if (!contextCache.has(key))
    contextCache.set(key, buildContext({ key: row.id, name: row.name }, EXAMPLES[row.id][index]));
  return contextCache.get(key);
}

const SOURCE_LABELS = {
  'row-edit': 'edited (this name)',
  'group-edit': 'edited (group)',
  'row-suggestion': 'suggested (this name)',
  'group-suggestion': 'suggested (group)',
};

function templateHelp() {
  const syntax = [
    ['{field}', 'The value. A field the example lacks shows as ⟨?field⟩.'],
    ['{a ?? b ?? \'text\'}', 'The first one that has a value.'],
    ['{value | filter:arg}', 'Change the value. Chain several filters with |.'],
    ['{if f}…{else}…{/if}', 'Conditional. One level only, no nesting. {if !f} negates.'],
    ['{{ and }}', 'Literal braces.'],
    ['data.context.repository', 'Dotted names need the full path.'],
  ];
  const table = el('table', null, el('thead', null, el('tr', null, el('th', { text: 'Write' }), el('th', { text: 'Result' }))));
  const body = el('tbody');
  for (const [write, result] of syntax)
    body.append(el('tr', null, el('td', null, el('code', { text: write })), el('td', { text: result })));
  table.append(body);
  return el('details', { class: 'help' }, el('summary', { text: 'Template help' }), table, el('div', { class: 'small' }, el('strong', { text: 'Filters: ' }), filterNames.join(', ')));
}

function formatsSection(row) {
  const examples = EXAMPLES[row.id] ?? [];
  const concept = conceptsById.get(row.concept);
  const local = { example: preferredExample(row), box: 'short' };
  const section = el('section', null, el('h3', { text: 'Short and medium formats' }));
  const areas = {};
  const refreshers = [];

  const exampleSelect = el('select', { 'aria-label': 'Example used for the previews', onchange: event => {
    local.example = Number(event.target.value);
    refreshAll(true);
  } }, examples.map((example, index) => el('option', { value: index, text: exampleLabel(example, index), '.selected': index === local.example })));

  const scopeSelect = el('select', { 'aria-label': 'Where your edit applies', onchange: () => refreshAll(false) },
    el('option', { value: 'group', text: `Whole group: ${concept?.title ?? row.concept}` }),
    el('option', { value: 'row', text: 'This name only' }));
  const initialScope = userRow(row.id)?.short !== undefined || userRow(row.id)?.medium !== undefined || row.suggest.scope === 'row' ? 'row' : 'group';
  scopeSelect.value = initialScope;
  const scopeNote = el('div', { class: 'small muted' });
  const includeButton = el('button');
  const fieldsBox = el('div', { class: 'fields' });

  const scopeFor = which => (userRow(row.id)?.[which] !== undefined ? 'row' : scopeSelect.value);

  const updateScopeNote = () => {
    const others = (rowsByConcept.get(row.concept) ?? []).filter(item => item.id !== row.id);
    const specific = others.filter(item => item.suggest.scope === 'row' || userRow(item.id)?.short !== undefined || userRow(item.id)?.medium !== undefined).length;
    scopeNote.textContent = scopeSelect.value === 'group'
      ? `An edit applies to all ${rowsByConcept.get(row.concept).length} names in this group, except names with their own edit${specific ? ` (${specific} others have their own format or edit)` : ''}.`
      : 'An edit applies to this name only and wins over the group.';
  };

  const refreshInclude = () => {
    const include = effectiveInclude(row);
    includeButton.className = `chip ${include.value} ${include.source !== 'suggestion' ? 'edited' : ''}`;
    includeButton.textContent = `default: ${include.value}${include.source !== 'suggestion' ? ' (edited)' : ''}`;
  };
  includeButton.addEventListener('click', () => {
    toggleInclude(row);
    renderTable();
  });
  includeButton.title = 'Whether this kind appears in exports by default. Click to flip.';

  const buildFields = () => {
    fieldsBox.replaceChildren();
    if (!examples.length)
      return;
    try {
      const context = contextFor(row, local.example);
      const aliases = listAliases(context);
      const fields = listFields(context, 40);
      fieldsBox.append(el('span', { class: 'muted small', text: 'Insert a field:' }));
      for (const name of aliases)
        fieldsBox.append(chip(name, 'Shortcut name'));
      for (const field of fields)
        fieldsBox.append(chip(field.path, `${field.kind}: ${field.sample}`));
    } catch {
      fieldsBox.append(el('span', { class: 'muted small', text: 'Field list unavailable for this example.' }));
    }
  };

  const chip = (name, title) => el('button', { class: 'chip', text: name, title, onclick: () => {
    const area = areas[local.box];
    const start = area.selectionStart ?? area.value.length;
    const end = area.selectionEnd ?? area.value.length;
    const token = `{${name}}`;
    area.value = `${area.value.slice(0, start)}${token}${area.value.slice(end)}`;
    area.focus();
    area.selectionStart = start + token.length;
    area.selectionEnd = start + token.length;
    area.dispatchEvent(new Event('input'));
  } });

  const buildBox = which => {
    const heading = el('h4', null, which === 'short' ? 'Short format' : 'Medium format');
    const sourceChip = el('span', { class: 'chip' });
    const staleChip = el('span', { class: 'chip stale', text: 'suggestion changed since you edited', hidden: true });
    heading.append(sourceChip, staleChip);
    const area = el('textarea', { class: 'tpl', spellcheck: 'false', 'aria-label': `${which} format template`, onfocus: () => {
      local.box = which;
    } });
    areas[which] = area;
    const suggested = el('div', { class: 'small muted', hidden: true });
    const reset = el('button', { text: 'Reset' });
    const preview = el('div', { class: 'rendered' });

    const renderPreview = () => {
      if (!examples.length) {
        preview.replaceChildren(el('div', { class: 'muted small', text: 'No example to render against.' }));
        return;
      }
      try {
        const output = renderTemplate(area.value, contextFor(row, local.example));
        preview.replaceChildren(...[
          el('div', { class: 'head', text: `Rendered with example ${local.example + 1}${exampleSuffix(examples[local.example])}. Plain text here. The export writes Markdown.` }),
          el('pre', { text: output.text || '(empty)' }),
          output.missing.length ? el('div', { class: 'warnline', text: `Not in this example: ${output.missing.join(', ')}. It may exist in other examples.` }) : null,
        ].filter(Boolean));
      } catch (error) {
        preview.replaceChildren(el('div', { class: 'errline', text: `This template can't be rendered: ${error.message}` }));
      }
    };

    const update = () => {
      const effective = effectiveTemplate(row, which);
      if (area.value !== effective.text)
        area.value = effective.text;
      const edited = effective.source.endsWith('edit');
      area.className = `tpl ${edited ? 'is-edited' : 'is-suggested'}`;
      area.rows = Math.min(14, Math.max(2, effective.text.split('\n').length + 1));
      sourceChip.textContent = SOURCE_LABELS[effective.source];
      sourceChip.className = `chip ${edited ? 'edited' : ''}`;
      const storedHash = effective.source === 'row-edit' ? userRow(row.id)?.[`${which}Hash`] : effective.source === 'group-edit' ? userConcept(row.concept)?.[`${which}Hash`] : undefined;
      const currentHash = effective.source === 'row-edit' ? row.suggest[`${which}Hash`] : concept?.[`${which}Hash`];
      staleChip.hidden = !(edited && storedHash && currentHash && storedHash !== currentHash);
      suggested.hidden = !edited;
      suggested.replaceChildren('Suggested: ', el('code', { text: effective.source === 'group-edit' ? concept[which] : row.suggest[which] }));
      reset.disabled = !edited;
      reset.textContent = effective.source === 'group-edit' ? 'Reset group edit' : 'Reset this name';
      reset.title = 'Go back to the suggested format';
      renderPreview();
    };

    area.addEventListener('input', () => {
      setTemplate(row, scopeFor(which), which, area.value);
    });
    reset.addEventListener('click', () => {
      resetTemplate(row, which);
    });
    refreshers.push(update);
    return el('div', { class: 'fmt' }, heading, area, suggested, el('div', { class: 'toolbar-inline' }, reset), preview);
  };

  const refreshAll = rebuildFields => {
    updateScopeNote();
    refreshInclude();
    if (rebuildFields)
      buildFields();
    for (const refresh of refreshers)
      refresh();
  };

  const toolbar = el('div', { class: 'toolbar-inline' },
    examples.length ? el('label', { class: 'small' }, 'Preview with ', exampleSelect) : el('span', { class: 'muted small', text: 'No example available.' }),
    el('label', { class: 'small' }, 'Edits apply to ', scopeSelect),
    includeButton,
    el('button', { text: 'Accept as is', title: 'Mark reviewed without changing anything', onclick: () => {
      toggleAccepted(row);
      renderTable();
    } }));
  section.append(toolbar, scopeNote, fieldsBox, el('div', { class: 'formats' }, buildBox('short'), buildBox('medium')), templateHelp());
  buildFields();
  panelRefreshers.set(row.id, () => refreshAll(false));
  refreshAll(false);
  return section;
}

function notesSection(row) {
  const area = el('textarea', { class: 'note', spellcheck: 'true', 'aria-label': 'Your note about this name', '.value': userRow(row.id)?.note ?? '', oninput: event => setNote(row, event.target.value) });
  return el('section', null, el('h3', { text: 'Your note (saved in the JSON)' }), area);
}

function buildPanel(row) {
  return el('div', { class: 'panel' }, whatSection(row), evidenceSection(row), guiSection(row), formatsSection(row), notesSection(row));
}

// ---------- save, load, draft ----------

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = el('a', { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function save() {
  if (state.saving)
    return;
  const saved = new Date().toISOString();
  const submittedSnapshot = snapshot(state.choices);
  const body = serialise({ ...state.choices, saved });
  if (state.server) {
    if (new TextEncoder().encode(body).byteLength > CHOICES_BYTE_LIMIT) {
      const message = 'Your choices exceed 5 MiB. Server save was blocked. Your edits stay in this page. Use "Download copy" to keep them.';
      setStatus(message, 'error');
      writeDraft();
      window.alert(message);
      return;
    }
    state.saving = true;
    document.getElementById('save').disabled = true;
    try {
      const response = await fetch('/api/choices', { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
      if (!response.ok)
        throw new Error(`${response.status} ${await response.text()}`);
    } catch (error) {
      setStatus(`Save failed: ${error.message}. Use "Download copy" to keep your work.`, 'error');
      writeDraft();
      return;
    } finally {
      state.saving = false;
      document.getElementById('save').disabled = false;
    }
    setStatus(`Saved ${stamp(new Date())} to lod-format-choices.json (work-items\\notes\\WI-052\\catalogue).`);
  } else {
    download('lod-format-choices.json', body);
    setStatus(`Downloaded lod-format-choices.json at ${stamp(new Date())}. Put it in work-items\\notes\\WI-052\\catalogue\\ to make it the startup file. No helper server is running.`);
  }
  state.choices.saved = saved;
  state.savedSnapshot = submittedSnapshot;
  writeDraft();
  updateStatus();
}

function downloadCopy() {
  const copy = { ...state.choices, saved: new Date().toISOString() };
  download(`lod-format-choices-${stamp(new Date())}.json`, serialise(copy));
}

function banner(text, kind, ...buttons) {
  const node = el('div', { class: `banner ${kind ?? ''}` }, text, buttons);
  document.getElementById('banners').append(node);
  return node;
}

function describeLoad(report, source) {
  const notes = [];
  if (report.invalid)
    notes.push('The file does not look like a LOD format choices file. Nothing unknown was kept.');
  if (report.foreignId)
    notes.push(`It was saved against catalogue ${report.foreignId}, this page is ${INDEX.catalogueId}. Entries match by name. Names that no longer exist are kept in the file.`);
  if (report.unknownRows || report.unknownConcepts)
    notes.push(`${report.unknownRows} row entries and ${report.unknownConcepts} group entries match nothing in this catalogue. They stay in the file.`);
  if (report.resetReviews)
    notes.push(`${report.resetReviews} review marks were reset because their formats or settings changed, or their original values couldn't be verified. Review those rows again.`);
  if (notes.length)
    banner(`${source}: ${notes.join(' ')}`, 'warn');
}

function applyChoices(parsed, sourceName) {
  for (const id of [...state.open])
    toggleOpen(rowsById.get(id));
  const { choices, report } = normaliseChoices(parsed);
  state.choices = choices;
  for (const row of rows)
    refreshRowCells(row);
  describeLoad(report, sourceName);
  renderTable();
  updateStats();
  updateStatus();
  saveDraft();
}

async function loadFromFile(file) {
  if (!file)
    return;
  if (file.size > CHOICES_BYTE_LIMIT) {
    const message = 'That file exceeds 5 MiB. Import was blocked. Your current choices are unchanged. Use "Download copy" to keep current edits.';
    setStatus(message, 'error');
    window.alert(message);
    return;
  }
  if (isDirty() && !window.confirm('You have unsaved changes. Loading a file replaces them in this page. Continue?'))
    return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (error) {
    setStatus(`Could not read ${file.name}: ${error.message}`, 'error');
    return;
  }
  document.getElementById('banners').replaceChildren();
  applyChoices(parsed, file.name);
  setStatus(`Loaded ${file.name} at ${stamp(new Date())}. It is only in this page until you Save.`);
  updateStatus();
}

async function startup() {
  let source = 'the copy embedded in this page';
  let parsed = DATA.choices;
  if (location.protocol === 'http:') {
    try {
      const response = await fetch('/api/choices', { cache: 'no-store' });
      if (response.ok) {
        parsed = await response.json();
        state.server = true;
        source = 'lod-format-choices.json (helper server)';
      }
    } catch {
      // No helper server. Use the embedded copy.
    }
  }
  const { choices, report } = normaliseChoices(parsed);
  state.choices = choices;
  state.savedSnapshot = snapshot(choices);
  describeLoad(report, source);
  const savedAt = choices.saved ? ` Last saved ${stamp(new Date(choices.saved))}.` : '';
  setStatus(state.server
    ? `Loaded ${source}.${savedAt} Save writes it back.`
    : `No helper server. Using ${source}.${savedAt} Save downloads a file. Run serve.mjs for one-click saves.`);
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    if (draft && draft.catalogueId === INDEX.catalogueId && typeof draft.snapshot === 'string') {
      const draftChoices = normaliseChoices(JSON.parse(draft.snapshot)).choices;
      if (snapshot(draftChoices) !== state.savedSnapshot) {
        const node = banner(`Unsaved edits from ${stamp(new Date(draft.at))} were found in this browser. `, 'warn',
          el('button', { text: 'Restore them', onclick: () => {
            applyChoices(JSON.parse(draft.snapshot), 'Restored draft');
            node.remove();
          } }),
          el('button', { text: 'Discard', onclick: () => {
            localStorage.removeItem(DRAFT_KEY);
            node.remove();
          } }));
      }
    }
  } catch {
    // A broken or blocked draft is ignored.
  }
  renderTable();
  updateStats();
  updateStatus();
  openFromHash();
}

function openFromHash() {
  const match = /^#row=(.+)$/.exec(location.hash);
  if (!match)
    return;
  const row = rowsById.get(decodeURIComponent(match[1]));
  if (!row)
    return;
  if (!matches(row)) {
    banner(`${row.name} is hidden by the current filters. Clear them to see it.`, 'warn');
    return;
  }
  state.collapsed.delete(row.concept);
  renderTable();
  if (!state.open.has(row.id))
    toggleOpen(row);
  domFor(row).tr.scrollIntoView({ block: 'start' });
}

// ---------- toolbar wiring ----------

function fillSelect(select, values, labelOf) {
  for (const value of values)
    select.append(el('option', { value, text: labelOf ? labelOf(value) : value }));
}

function wireToolbar() {
  const distinct = pick => [...new Set(rows.map(pick))].sort((a, b) => a.localeCompare(b));
  fillSelect(document.getElementById('f-type'), distinct(row => row.type));
  fillSelect(document.getElementById('f-status'), distinct(row => row.status));
  fillSelect(document.getElementById('f-concept'), INDEX.concepts.filter(concept => rowsByConcept.has(concept.id)).map(concept => concept.id).sort((a, b) => conceptsById.get(a).title.localeCompare(conceptsById.get(b).title)), id => `${conceptsById.get(id).title} (${rowsByConcept.get(id).length})`);
  fillSelect(document.getElementById('f-origin'), distinct(row => row.origin.value));
  fillSelect(document.getElementById('f-family'), distinct(row => row.family));
  const bind = (id, key) => document.getElementById(id).addEventListener('change', event => {
    state.filters[key] = event.target.value;
    renderTable();
  });
  bind('f-type', 'type');
  bind('f-status', 'status');
  bind('f-concept', 'concept');
  bind('f-origin', 'origin');
  bind('f-family', 'family');
  bind('f-review', 'review');
  bind('f-include', 'include');
  bind('f-example', 'example');
  document.getElementById('search').addEventListener('input', debounce(event => {
    state.filters.search = event.target.value;
    renderTable();
  }, 120));
  document.getElementById('f-deep').addEventListener('change', event => {
    state.filters.inExamples = event.target.checked;
    renderTable();
  });
  document.getElementById('group').addEventListener('change', event => {
    state.grouped = event.target.checked;
    renderTable();
  });
  const table = document.getElementById('catalogue');
  for (const name of ['concept', 'status', 'origin', 'family'])
    document.getElementById(`col-${name}`).addEventListener('change', event => table.classList.toggle(`show-${name}`, event.target.checked));
  for (const head of document.querySelectorAll('th.sortable')) {
    head.dataset.label = head.textContent;
    head.addEventListener('click', () => {
      const key = head.dataset.key;
      state.sort = state.sort.key === key ? { key, direction: state.sort.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: key === 'seen' ? 'desc' : 'asc' };
      renderTable();
    });
  }
  document.getElementById('collapse').addEventListener('click', () => {
    for (const id of [...state.open])
      toggleOpen(rowsById.get(id));
  });
  document.getElementById('save').addEventListener('click', save);
  document.getElementById('copy').addEventListener('click', downloadCopy);
  const picker = document.getElementById('load');
  document.getElementById('load-button').addEventListener('click', () => picker.click());
  picker.addEventListener('change', async event => {
    await loadFromFile(event.target.files[0]);
    picker.value = '';
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });
  window.addEventListener('beforeunload', event => {
    if (isDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  window.addEventListener('hashchange', openFromHash);
  const header = document.querySelector('header.top');
  const setHeight = () => document.documentElement.style.setProperty('--head-height', `${header.offsetHeight}px`);
  setHeight();
  new ResizeObserver(setHeight).observe(header);
}

function showScanWarnings() {
  const diagnostics = INDEX.provenance?.scan?.diagnostics;
  const messages = [];
  for (const [key, label] of [['parseErrors', 'unparseable lines'], ['replayErrors', 'journal replay errors']]) {
    const count = diagnostics?.[key];
    if (typeof count !== 'number') {
      messages.push(`Totals for ${label} are unavailable.`);
    } else if (count > 0) {
      const sources = diagnostics[`${key}Sources`];
      messages.push(`${number(count)} ${label}${typeof sources === 'number' ? ` in ${number(sources)} source${sources === 1 ? '' : 's'}` : ''}.`);
    }
  }
  if (typeof diagnostics?.problems !== 'number')
    messages.push('Other scan-problem totals are unavailable.');
  else if (diagnostics.problems > 0)
    messages.push(`${number(diagnostics.problems)} other scan problems.`);
  const node = document.getElementById('scan-warning');
  node.hidden = messages.length === 0;
  node.textContent = messages.length ? `Scan warnings: ${messages.join(' ')} Counts and examples may be incomplete.` : '';
}

function fillAbout() {
  showScanWarnings();
  const { provenance } = INDEX;
  const scope = provenance.scan.scope;
  const about = document.getElementById('about-body');
  about.append(
    el('p', { text: `Catalogue ${INDEX.catalogueId}, built ${DATA.built}. ${INDEX.note}` }),
    kv([
      ['Scanned chats', `${scope.local.files} Local files (${scope.local.firstDay} to ${scope.local.lastDay}) and ${scope.sdk.files} agent session files (${scope.sdk.firstDay} to ${scope.sdk.lastDay}). The chat that built this page was excluded.`],
      ['Agent chats', 'SDK, Agent Host, and Copilot CLI sessions share one event format here, so they are not told apart.'],
      ['SDK types', `github/copilot-sdk at ${provenance.sdk.commit.slice(0, 7)}`],
      ['CLI reference', `github/docs at ${provenance.cliDocs.commit.slice(0, 7)}`],
      ['VS Code source', `microsoft/vscode at ${provenance.vscode.commit.slice(0, 7)}`],
      ['Installed extension', provenance.extension.map(item => `Copilot Chat ${item.extension} (VS Code ${item.vscode}, ${item.channel})`).join('; ')],
    ]),
    el('p', { text: 'Colours: suggested text is blue-grey. Text you changed is orange with an "edited" label. Evidence labels: documented = in official docs. inferred from source = read from code. unknown = not checked or no evidence. Counts use different units per kind, so they are never added together. Origin comes only from recorded evidence, never from a name.' }),
    el('p', { text: 'Seen sorts by scanned chats containing a name. Groups rank by their most widely seen member. Earlier-survey rows without chat counts rank below current observations. These counts describe the scanned sample, not all chats.' }),
    el('p', { text: 'Reviewed means examined but not approved. Accepted also counts as reviewed. Edited is separate and can overlap either state. Changing effective formats or show/hide resets review. Notes keep it. Changed suggestions also reset review when choices load.' }),
    el('p', { text: 'Limits: examples are redacted copies. Base64-like data omissions and unavailable complete evidence are labelled. The GUI column is mostly inferred from source and has no screenshots unless you add one. A page opened from disk keeps its starting copy of your choices inside the page.' }));
}

wireToolbar();
fillAbout();
startup();
