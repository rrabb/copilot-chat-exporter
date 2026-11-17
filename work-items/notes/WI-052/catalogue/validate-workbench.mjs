// Static checks for the LOD format workbench build. Exit code 1 when a check fails.
// Run: node work-items\notes\WI-052\catalogue\validate-workbench.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { catalogueFolder, hasMilReference, privateFolder, replaceMilExample } from './common.mjs';

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const publicSources = readJson(path.join(catalogueFolder, 'public-sources.json'));
check('public source machine metadata has no host identifier', Object.keys(publicSources.machine).every(key => ['platform', 'node'].includes(key)));

const privateHost = ['portal', 'example', 'mil'].join('.');
const originalExample = {
  family: 'sdk',
  slot: 'sdk:error',
  sid: 'original-chat',
  locator: 'original-location',
  originalHash: 'original-hash',
  value: {
    start: { type: 'tool.execution_start', timestamp: '2026-01-01T00:00:00Z', data: { toolName: 'openBrowserPage', toolCallId: 'original-call', arguments: { url: `https://${privateHost}/private`, title: 'Original browser title' } } },
    complete: { type: 'tool.execution_complete', timestamp: '2026-01-01T00:00:01Z', data: { toolCallId: 'original-call', success: false, error: 'Original error', exitCode: 2 } },
  },
};
const replacement = replaceMilExample(originalExample, 'openBrowserPage');
check('sensitive examples become labelled synthetic replacements', replacement.synthetic && replacement.privacyReplacement && replacement.note);
check('replacement removes surrounding text and source provenance', !/original|private|portal/i.test(JSON.stringify(replacement.value)) && !replacement.sid && !replacement.locator && !replacement.originalHash);
check('replacement keeps event types, tool identity and failure state', replacement.value.start.type === 'tool.execution_start' && replacement.value.start.data.toolName === 'openBrowserPage' && replacement.value.complete.data.success === false);
check('replacement keeps matching call references', replacement.value.start.data.toolCallId === replacement.value.complete.data.toolCallId);
check('replacement is deterministic and leaves the input untouched', JSON.stringify(replacement) === JSON.stringify(replaceMilExample(originalExample, 'openBrowserPage')) && originalExample.sid === 'original-chat');
check('replacement is unchanged on a second pass', replaceMilExample(replacement, 'openBrowserPage') === replacement);
const ordinaryExample = { value: { url: 'https://example.com/', text: 'Keep this example.' } };
check('unrelated examples stay unchanged', replaceMilExample(ordinaryExample, 'openBrowserPage') === ordinaryExample && !hasMilReference('https://example.military/'));
check('domain detection covers uppercase, encoded dots, escaped dots and object keys', [
  privateHost.toUpperCase(),
  privateHost.replaceAll('.', '%2E'),
  privateHost.replaceAll('.', '\\u002e'),
  { [privateHost]: 'value' },
].every(hasMilReference));
const keyedExample = replaceMilExample({ family: 'local', slot: 'local:typical', value: { [privateHost]: 'Sensitive text', 'synthetic-field-1': 'Other text' } }, 'example');
check('replacement removes sensitive keys without losing adjacent fields', !hasMilReference(keyedExample) && Object.keys(keyedExample.value).length === 2);

const pageFile = path.join(privateFolder, 'format-workbench.html');
check('page exists', existsSync(pageFile), pageFile);
if (!existsSync(pageFile)) {
  report();
}

const html = readFileSync(pageFile, 'utf8');
const index = readJson(path.join(catalogueFolder, 'catalogue-index.json'));
const choices = readJson(path.join(catalogueFolder, 'lod-format-choices.json'));

const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1] ?? '';
const hash = text => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
const scripts = [...html.matchAll(/<script( type="application\/json" id="catalogue-data")?>([\s\S]*?)<\/script>/g)];
const code = scripts.find(match => !match[1])?.[2] ?? '';
check('CSP allows exactly the inline script', csp.includes(`script-src ${hash(code)}`));
check('CSP allows exactly the inline style', csp.includes(`style-src ${hash(style)}`));
check('CSP blocks everything else', csp.startsWith("default-src 'none'") && !/unsafe-inline|unsafe-eval|http:|https:/.test(csp), csp);
check('no inline style attributes in the page markup', !/<[a-z][^>]*\sstyle=/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));
check('no external resources', !/\s(?:src|href)=["']https?:/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));

const forbidden = /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval|new Function)\b/;
const workbenchSource = readFileSync(path.join(catalogueFolder, 'workbench.js'), 'utf8').replace(/\/\/.*$/gm, '');
check('workbench.js avoids HTML injection APIs', !forbidden.test(workbenchSource), workbenchSource.match(forbidden)?.[0] ?? '');
check('workbench.js uses no setAttribute("style")', !/setAttribute\(\s*['"]style/.test(workbenchSource));

const requiredIds = ['status', 'stats', 'count', 'save', 'copy', 'load-button', 'load', 'search', 'f-deep', 'group', 'collapse', 'f-type', 'f-status', 'f-concept', 'f-origin', 'f-family',
  'f-review', 'f-include', 'f-example', 'col-concept', 'col-status', 'col-origin', 'col-family', 'banners', 'scan-warning', 'about-body', 'catalogue', 'rows', 'empty', 'catalogue-data'];
const missingIds = requiredIds.filter(id => !html.includes(`id="${id}"`));
check('page has every element id the script uses', missingIds.length === 0, missingIds.join(', '));
const sortKeys = [...html.matchAll(/data-key="([a-z]+)"/g)].map(match => match[1]);
check('table has the 10 sortable columns', sortKeys.length === 10, sortKeys.join(','));

const dataText = /<script type="application\/json" id="catalogue-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
check('embedded data has no raw "<"', !dataText.includes('<'));
let data;
try {
  data = JSON.parse(dataText);
  check('embedded data parses', true);
} catch (error) {
  check('embedded data parses', false, error.message);
}
if (data) {
  check('embedded catalogue id matches the index', data.index.catalogueId === index.catalogueId, `${data.index.catalogueId} vs ${index.catalogueId}`);
  check('embedded index equals catalogue-index.json', JSON.stringify(data.index) === JSON.stringify(index));
  const withExamples = Object.keys(data.examples).length;
  check('every example key is a catalogue row', Object.keys(data.examples).every(id => index.rows.some(row => row.id === id)));
  check('embedded examples cover the rows that say they have one', index.rows.filter(row => row.hasRecorded || row.exampleSlots?.length).every(row => data.examples[row.id]?.length), `${withExamples} rows with examples`);
  check('recorded example flags exclude synthetic replacements', index.rows.every(row => row.hasRecorded === Boolean(data.examples[row.id]?.some(example => !example.synthetic))));
  check('privacy replacement flags match the embedded examples', index.rows.every(row => row.exampleSlots.every((slot, position) => Boolean(slot.privacyReplacement) === Boolean(data.examples[row.id]?.[position]?.privacyReplacement))));
  const examples = Object.values(data.examples).flat();
  check('shortened examples carry complete evidence or an unavailable notice', examples.every(example =>
    !example.clipped?.length || example.fullEvidence?.status === 'complete' || (example.fullEvidence?.status === 'unavailable' && example.fullEvidence.reason)));
  check('complete evidence reports its size and intentional binary omissions', examples.filter(example => example.fullEvidence?.status === 'complete').every(example =>
    example.fullEvidence.bytes === Buffer.byteLength(JSON.stringify(example.fullEvidence.value) ?? 'null') &&
    Array.isArray(example.fullEvidence.omissions) && example.fullEvidence.omissions.every(item => item.reason === 'base64')));
}

const rowIds = new Set();
const duplicates = [];
for (const row of index.rows) {
  if (rowIds.has(row.id))
    duplicates.push(row.id);
  rowIds.add(row.id);
}
check('row ids are unique', duplicates.length === 0, duplicates.slice(0, 5).join(', '));
const conceptIds = new Set(index.concepts.map(concept => concept.id));
check('every row has a known group', index.rows.every(row => conceptIds.has(row.concept)));
check('every row has a short and medium suggestion', index.rows.every(row => row.suggest?.short && row.suggest?.medium));
check('Review state and Default include data exist on every row', index.rows.every(row => row.include === 'show' || row.include === 'hide'));
check('Seen ranks use scanned chats, not added occurrence units', index.rows.every(row => row.seen.chatCount === (row.chats ? row.chats.local + row.chats.sdk : null) && !('total' in row.seen)));

const scan = readJson(path.join(privateFolder, 'scan.private.json'));
const diagnostics = index.provenance.scan.diagnostics;
check('scan diagnostics include the recorded parse and replay totals', diagnostics?.parseErrors === scan.sources.reduce((sum, source) => sum + source.parseErrors, 0) && diagnostics?.replayErrors === scan.sources.reduce((sum, source) => sum + source.replayErrors, 0) && diagnostics?.problems === scan.problems.length);
check('session-field rows show their recorded counts', scan.rows.filter(row => row.counts.localSessions).every(observed => index.rows.find(row => row.id === observed.key)?.seen.parts.some(part => part.key === 'localSessions' && part.value === observed.counts.localSessions)));

check('choices file has the expected schema', choices.schema === 'wi052-lod-format-choices/1');
check('choices file keeps only known fields', Object.values({ ...choices.concepts, ...choices.rows }).every(entry => Object.keys(entry).every(key => ['short', 'shortHash', 'medium', 'mediumHash', 'include', 'review', 'reviewHash', 'note'].includes(key))));

const check2 = readJson(path.join(privateFolder, 'template-check.private.json'));
check('template self-check found no problems', check2.problems.length === 0 && check2.catalogueId === index.catalogueId, `${check2.problems.length} problems`);
for (const name of ['scan.private.json', 'examples.private.json', 'template-check.private.json', 'format-workbench.html']) {
  const text = readFileSync(path.join(privateFolder, name), 'utf8');
  check(`${name} has no military domain references`, !hasMilReference(text));
}

// Tracked files must not contain private paths, e-mail addresses, or credentials. Scripts hold the redaction patterns themselves, so only data files and notes are scanned.
const privacy = [
  [/[A-Z](?::|%3A)[\\/]+_DATA\b/i, 'private project path'],
  [/[A-Z](?::|%3A)[\\/]+Users[\\/]+(?!<home>)[^\\/\s"'<>]+/i, 'user home path'],
  [/reim5052/i, 'user name'],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, 'e-mail address'],
  [/\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}\b/, 'GitHub token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
];
const trackedData = readdirSync(catalogueFolder).filter(name => /\.(json|md)$/i.test(name));
for (const name of trackedData) {
  const text = readFileSync(path.join(catalogueFolder, name), 'utf8');
  const hits = privacy.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  check(`${name} has no private data`, hits.length === 0, hits.join(', '));
}
// This file holds the patterns it searches for, so it skips itself.
const trackedScripts = readdirSync(catalogueFolder).filter(name => /\.(mjs|js|css)$/i.test(name) && name !== 'validate-workbench.mjs');
for (const name of trackedScripts) {
  const text = readFileSync(path.join(catalogueFolder, name), 'utf8');
  check(`${name} has no user name or home path`, !/reim5052|C:\\Users\\reim/i.test(text));
}

report();

function report() {
  const failed = results.filter(result => !result.ok);
  for (const result of results)
    console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.detail && !result.ok ? `  -> ${result.detail}` : ''}`);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
}
