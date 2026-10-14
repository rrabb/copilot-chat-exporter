import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import test from 'node:test';
import { detailedListingController } from '../src/session/detailed-listing-controller.ts';

class Element {
  id: string;
  tagName = 'DIV';
  value = '';
  textContent = '';
  hidden = false;
  open = false;
  focused = false;
  dataset: Record<string, string> = {};
  children: Element[] = [];
  parentElement: Element | null = null;
  attributes = new Map<string, string>();
  events = new Map<string, () => unknown>();
  classes = new Set<string>();
  classList = {
    add: (name: string) => { this.classes.add(name); },
    remove: (name: string) => { this.classes.delete(name); },
    toggle: (name: string, enabled: boolean) => { enabled ? this.classes.add(name) : this.classes.delete(name); },
  };
  constructor (id = '') { this.id = id; }
  addEventListener (name: string, callback: () => unknown) { this.events.set(name, callback); }
  fire (name: string) { return this.events.get(name)?.(); }
  getAttribute (name: string) { return this.attributes.get(name); }
  setAttribute (name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute (name: string) { this.attributes.delete(name); name === 'id' && (this.id = ''); }
  focus () { this.focused = true; }
  scrollIntoView () {}
  closest (_selector: string): Element | null { return this.classes.has('session-card') ? this : this.parentElement?.closest(_selector) ?? null; }
  querySelector (_selector: string): Element { return this.children.find((item) => item.classes.has('comparison-summary'))!; }
  querySelectorAll (_selector: string): Element[] { return this.children.filter((item) => item.id); }
  append (...elements: Element[]) {
    for (const element of elements) {
      if (element.parentElement)
        element.parentElement.children = element.parentElement.children.filter((item) => item !== element);
      element.parentElement = this;
      this.children.push(element);
    }
  }
  replaceChildren () { this.children = []; }
  cloneNode (): Element {
    const copy = new Element(this.id);
    copy.textContent = this.textContent;
    copy.classes = new Set(this.classes);
    copy.append(...this.children.map((child) => child.cloneNode()));
    return copy;
  }
}

function controllerFixture () {
  const ids = new Map<string, Element>();
  const element = (id: string) => {
    const value = new Element(id);
    ids.set(id, value);
    return value;
  };
  const controlNames = ['search', 'type', 'status', 'model', 'project', 'prompts-min', 'prompts-max', 'prompts-known',
    'bytes-min', 'bytes-max', 'bytes-known', 'date-kind', 'date-from', 'date-to'];
  const filters = controlNames.map(element);
  for (const id of ['row-count', 'grouped-view', 'occurrence-view', 'reset', 'show-all', 'action-status',
    'view', 'density', 'sort', 'sort-direction', 'comparison', 'comparison-count', 'comparison-cards', 'clear-pins'])
    element(id);
  ids.get('date-kind')!.value = 'updated';
  ids.get('date-kind')!.dataset.default = 'updated';
  ids.get('sort')!.value = 'updated';
  const main = new Element('main');
  const cards = ['alpha', 'beta', 'unknown'].map((id, index) => {
    const card = element(id);
    card.tagName = 'DETAILS';
    card.classes.add('session-card');
    card.dataset = {
      main: 'true', search: `${id} prompt project`, title: id, type: 'local', status: 'verified',
      models: index === 2 ? '[]' : '["model"]', chips: index === 1 ? 'edits auto' : 'local',
      prompts: index === 2 ? '' : String(index * 3), bytes: index === 2 ? '' : String(index * 200),
      created: index === 2 ? '' : String(index + 1), updated: String(index + 1),
      createdDay: index === 2 ? '' : '2026-10-08', updatedDay: '2026-10-08',
      limited: index === 1 ? 'true' : 'false',
      projects: ['["P1"]', '["P1","P2"]', '[]'][index]!,
    };
    const summary = new Element();
    summary.classes.add('comparison-summary');
    card.append(summary);
    return card;
  });
  ids.get('grouped-view')!.append(...cards);
  const ignored = element('ignored');
  ignored.classes.add('session-card');
  const ignoredDetails = element('ignored-sessions');
  ignoredDetails.tagName = 'DETAILS';
  ignoredDetails.append(ignored);
  const betaDetails = element('beta-details');
  betaDetails.tagName = 'DETAILS';
  const turn = element('beta-turn-1');
  betaDetails.append(turn);
  cards[1]!.append(betaDetails);
  const occurrences = cards.map((card) => { const row = element(`${card.id}-occurrence`); row.dataset = { ...card.dataset }; return row; });
  const body = new Element();
  body.append(...occurrences);
  const table = Object.assign(element('occurrence-table'), { tBodies: [body] });
  const chips = ['auto', 'edits', 'local'].map((key) => {
    const button = new Element();
    button.dataset.chip = key;
    button.setAttribute('aria-pressed', 'false');
    return button;
  });
  const links = ['ignored', 'beta-turn-1'].map((id) => {
    const link = new Element();
    link.setAttribute('href', `#${id}`);
    return link;
  });
  const pins = cards.map((card) => {
    const button = new Element();
    button.dataset.pin = card.id;
    button.setAttribute('aria-pressed', 'false');
    card.append(button);
    return button;
  });
  const projectButtons = ['P2', '__multi'].map((value) => { const button = new Element(); button.dataset.projectPick = value; return button; });
  const copy = new Element();
  copy.dataset.copy = 'selector';
  const selectors = new Map<string, Element[]>([
    ['.session-card[data-main="true"]', cards], ['#occurrence-table tbody tr[data-search]', occurrences],
    ['[data-chip]', chips], ['[data-filter]', filters], ['a[href^="#"]', links],
    ['[data-pin]', pins], ['[data-copy]', [copy]], ['[data-project-pick]', projectButtons], ['.session-card, .session-card details', [...cards, betaDetails]],
  ]);
  new Script(detailedListingController).runInNewContext({
    document: {
      documentElement: new Element(),
      querySelector: () => main,
      querySelectorAll: (selector: string) => selectors.get(selector) ?? [],
      getElementById: (id: string) => ids.get(id),
      createElement: () => new Element(),
    },
    location: { hash: '' },
    window: { addEventListener: () => {} },
    navigator: { clipboard: { writeText: async () => { throw new Error('Clipboard blocked'); } } },
    setTimeout: (callback: () => void) => callback(),
  });
  const input = (id: string, value: string) => { const control = ids.get(id)!; control.value = value; control.fire('input'); control.fire('change'); };
  return { ids, cards, ignored, ignoredDetails, betaDetails, turn, links, chips, pins, copy, main, occurrences, table, input, projectButtons };
}

test('detailed controller combines exact ranges, unknown/model/chip/search filters and occurrence view', () => {
  const f = controllerFixture();
  assert.equal(f.ids.get('row-count')!.textContent, '2 of 3 grouped conversations shown');
  f.input('prompts-known', 'unknown');
  assert.deepEqual(f.cards.filter((card) => !card.hidden).map((card) => card.id), ['unknown']);
  f.ids.get('reset')!.fire('click');
  f.ids.get('show-all')!.fire('click');
  f.input('prompts-min', '1');
  f.input('prompts-max', '3');
  assert.deepEqual(f.cards.filter((card) => !card.hidden).map((card) => card.id), ['beta']);
  f.input('prompts-max', '2');
  assert.equal(f.cards.filter((card) => !card.hidden).length, 0);
  f.ids.get('reset')!.fire('click');
  f.chips[0]!.fire('click');
  f.chips[1]!.fire('click');
  assert.deepEqual(f.cards.filter((card) => !card.hidden).map((card) => card.id), ['beta']);
  f.ids.get('reset')!.fire('click');
  f.input('model', '?');
  assert.deepEqual(f.cards.filter((card) => !card.hidden).map((card) => card.id), ['unknown']);
  f.ids.get('reset')!.fire('click');
  f.input('search', 'beta prompt');
  assert.equal(f.cards.filter((card) => !card.hidden).length, 1);
  assert.equal(f.ignored.hidden, false);
  f.input('view', 'occurrences');
  assert.equal(f.ids.get('grouped-view')!.hidden, true);
  assert.equal(f.ids.get('occurrence-view')!.hidden, false);
  assert.equal(f.occurrences.filter((row) => !row.hidden).length, 1);
  f.input('date-from', '2026-10-09');
  assert.equal(f.occurrences.filter((row) => !row.hidden).length, 0);
});
test('relationship navigation reveals ignored/limited targets, opens ancestor disclosures and sorts unknown last', () => {
  const f = controllerFixture();
  f.input('search', 'nothing');
  f.links[0]!.fire('click');
  assert.equal(f.ignoredDetails.open, true);
  assert.equal(f.ignored.focused, true);
  assert.equal(f.ids.get('search')!.value, '');
  f.links[1]!.fire('click');
  assert.equal(f.betaDetails.open, true);
  assert.equal(f.cards[1]!.open, true);
  assert.equal(f.cards[1]!.hidden, false);
  assert.equal(f.turn.focused, true);
  f.input('sort', 'prompts');
  f.ids.get('sort-direction')!.fire('click');
  assert.deepEqual(f.ids.get('grouped-view')!.children.map((card) => card.id), ['alpha', 'beta', 'unknown']);
  assert.deepEqual(f.table.tBodies[0]!.children.map((row) => row.id), ['alpha-occurrence', 'beta-occurrence', 'unknown-occurrence']);
});
test('comparison pins exactly two summaries, density opens full prompts and clipboard failure is explicit', async () => {
  const f = controllerFixture();
  for (const button of f.pins)
    button.fire('click');
  assert.equal(f.ids.get('comparison-cards')!.children.length, 2);
  assert.match(f.ids.get('action-status')!.textContent, /Two chats/);
  f.ids.get('clear-pins')!.fire('click');
  assert.equal(f.ids.get('comparison')!.hidden, true);
  f.input('density', 'comprehensive');
  assert.equal(f.betaDetails.open, true);
  assert.ok(f.cards.every((card) => card.open));
  assert.equal(f.main.classes.has('comprehensive'), true);
  f.input('density', 'compact');
  assert.equal(f.main.classes.has('compact'), true);
  assert.equal(f.betaDetails.open, false);
  assert.ok(f.cards.every((card) => !card.open));
  await f.copy.fire('click');
  assert.match(f.ids.get('action-status')!.textContent, /Select and copy/);
});

test('project filter is inclusive and offers multi and unknown categories, also from chart buttons', () => {
  const f = controllerFixture();
  const visible = () => f.cards.filter((card) => !card.hidden).map((card) => card.id);
  f.ids.get('show-all')!.fire('click');
  assert.deepEqual(visible(), ['alpha', 'beta', 'unknown']);
  f.input('project', 'P1');
  assert.deepEqual(visible(), ['alpha', 'beta'], 'a multi-project chat matches each project it references');
  f.input('project', 'P2');
  assert.deepEqual(visible(), ['beta']);
  f.input('project', '__multi');
  assert.deepEqual(visible(), ['beta']);
  f.input('project', '__unknown');
  assert.deepEqual(visible(), ['unknown']);
  f.input('project', 'P1');
  f.input('search', 'alpha');
  assert.deepEqual(visible(), ['alpha'], 'project combines with the other filters');
  f.ids.get('reset')!.fire('click');
  assert.equal(f.ids.get('project')!.value, '', 'reset clears the project filter');
  f.projectButtons[0]!.fire('click');
  assert.equal(f.ids.get('project')!.value, 'P2');
  assert.deepEqual(visible(), ['beta'], 'a chart label applies its project filter');
  f.input('view', 'occurrences');
  assert.deepEqual(f.occurrences.filter((row) => !row.hidden).map((row) => row.id), ['beta-occurrence']);
});