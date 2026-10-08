import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import test from 'node:test';
import { formatSessionListingHtml } from '../src/session/listing.ts';

class Element {
  hidden = false;
  open = false;
  value = '';
  textContent = '';
  focused = false;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  events = new Map<string, () => void>();
  selectors = new Map<string, Element>();
  classList = { add: (_name: string) => {} };
  readonly id: string;
  constructor (id = '') { this.id = id; }
  addEventListener (name: string, callback: () => void) { this.events.set(name, callback); }
  fire (name: string) { this.events.get(name)?.(); }
  setAttribute (name: string, value: string) { this.attributes.set(name, value); }
  getAttribute (name: string) { return this.attributes.get(name); }
  querySelector (selector: string) { return this.selectors.get(selector); }
  focus () { this.focused = true; }
}

test('full-width source panels toggle, filter, and sort with their own session rows', () => {
  const html = formatSessionListingHtml([]);
  const panelA = new Element('a-panel');
  const panelB = new Element('b-panel');
  const ignoredPanel = new Element('ignored-panel');
  const buttons: Element[] = [];
  const closes: Element[] = [];
  for (const panel of [panelA, panelB, ignoredPanel]) {
    panel.selectors.set('details', new Element());
    const close = new Element();
    panel.selectors.set('.source-close', close);
    closes.push(close);
    const button = new Element();
    button.setAttribute('aria-controls', panel.id);
    buttons.push(button);
  }
  const rowA = Object.assign(new Element(), {
    dataset: { details: panelA.id, search: 'alpha', type: 'local', status: 'verified' },
    cells: [{ innerText: 'Alpha', dataset: {} }],
  });
  const rowB = Object.assign(new Element(), {
    dataset: { details: panelB.id, search: 'beta', type: 'local', status: 'verified' },
    cells: [{ innerText: 'Beta', dataset: {} }],
  });
  const rows: Element[] = [rowB, panelB, rowA, panelA];
  const body = {
    rows,
    append (...elements: Element[]) {
      for (const element of elements) {
        rows.splice(rows.indexOf(element), 1);
        rows.push(element);
      }
    },
  };
  const headerCell = {};
  const sort = Object.assign(new Element(), {
    dataset: { sort: 'title' },
    closest: (selector: string) => selector === 'tr' ? { cells: [headerCell] } : headerCell,
  });
  const table = { tBodies: [body], querySelectorAll: () => [sort] };
  const search = new Element();
  const controls = new Map<string, Element>([
    ['#search', search], ['#type-filter', new Element()], ['#status-filter', new Element()],
    ['#row-count', new Element()], ['#reset', new Element()], ['#storage-guide', new Element()],
    ['[data-open-guide]', new Element()], ['#ignored-sessions', new Element()], ['[data-open-ignored]', new Element()],
  ]);
  const panels = new Map([panelA, panelB, ignoredPanel].map((panel) => [panel.id, panel]));
  new Script(html.match(/<script>([\s\S]*?)<\/script>/u)![1]).runInNewContext({
    document: {
      querySelector: (selector: string) => selector === '#sessions' ? table : controls.get(selector),
      querySelectorAll: (selector: string) => selector === 'button.source-toggle' ? buttons : [],
      getElementById: (id: string) => panels.get(id),
    },
    location: { hash: '' }, window: { addEventListener: () => {} },
  });
  assert.ok(panelA.hidden && panelB.hidden && ignoredPanel.hidden);
  buttons[0].fire('click');
  assert.equal(panelA.hidden, false);
  assert.equal(buttons[0].getAttribute('aria-expanded'), 'true');
  search.value = 'beta';
  search.fire('input');
  assert.equal(rowA.hidden, true);
  assert.equal(panelA.hidden, true);
  assert.equal(controls.get('#row-count')!.textContent, '1 of 2 rows');
  controls.get('#reset')!.fire('click');
  assert.equal(panelA.hidden, false, 'filter reset restores the expanded panel');
  sort.fire('click');
  assert.deepEqual(rows, [rowA, panelA, rowB, panelB]);
  sort.fire('click');
  assert.deepEqual(rows, [rowB, panelB, rowA, panelA]);
  closes[0].fire('click');
  assert.equal(panelA.hidden, true);
  assert.equal(buttons[0].focused, true);
  assert.equal(buttons[0].getAttribute('aria-expanded'), 'false');
  buttons[2].fire('click');
  search.value = 'no match';
  search.fire('input');
  assert.equal(ignoredPanel.hidden, false, 'main-table filtering leaves ignored-table details alone');
});
