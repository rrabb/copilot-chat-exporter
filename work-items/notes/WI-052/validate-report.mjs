import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, 'report.html'), 'utf8');
const ideas = JSON.parse(readFileSync(join(root, 'ideas.json'), 'utf8'));
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');
assert.ok(html.includes('Preserved sanitized research - no implementation'));
assert.ok(html.includes('Default stays detailed'));
for (const control of ideas.controls)
  assert.ok(html.includes(escape(control.control)), `Missing control: ${control.control}`);
const links = [...html.matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1].replaceAll('&amp;', '&'));
let localFiles = 0;
for (const href of links) {
  if (href.startsWith('#')) {
    assert.ok(ids.includes(href.slice(1)), `Missing anchor: ${href}`);
    continue;
  }
  if (href.startsWith('https://'))
    continue;
  const path = resolve(root, decodeURIComponent(href));
  assert.ok(path.startsWith(root + sep), `Local link escapes research folder: ${href}`);
  assert.ok(existsSync(path), `Missing local evidence file: ${href}`);
  localFiles++;
}
assert.ok(localFiles >= 8, 'Expected source data, scripts and export/log links');
assert.ok(!/<script[^>]+src=|<iframe|<img[^>]+src="https?:|<link[^>]+href="https?:/i.test(html), 'Report must not load remote assets');
const script = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script, 'Expected offline search script');
new Function(script[1]);
console.log(`Report checks passed: ${ideas.controls.length} controls, ${ids.length} unique IDs, ${localFiles} existing local evidence links, no remote assets, valid search-script syntax.`);
