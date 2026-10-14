import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDetailedSessionListingHtml } from '../src/session/detailed-listing.ts';
import { compactCss, detailedEvidence, detailedOccurrence, detailedStylesForTest } from './detailed-listing-fixture.ts';

const render = (rows = [detailedOccurrence('one')], data = detailedEvidence(), options = {}) =>
  formatDetailedSessionListingHtml(rows, new Map(rows.map((row) => [row.occurrenceId, data])), options, '2026-10-08T19:00:00Z');
const header = (html: string) => html.match(/<summary class="session-summary">([\s\S]*?)<\/summary>/u)![1];
const card = (html: string) => html.match(/<details class="session-card[^>]*>([\s\S]*?)<\/details>\s*<\/section>/u)?.[1] ?? html;

test('unknown headline values use ?? when the source was read and ??? when it could not be read or verified', () => {
  const read = detailedEvidence({ turns: [], dates: [], flags: ['incomplete-prompt-evidence'] });
  const known = render([detailedOccurrence('one', { createdTimestamp: null, activityTimestamp: null })], read);
  assert.match(header(known), /<strong title="[^"]*"><span class="unknown" title="Unknown: [^"]*" aria-label="unknown">\?\?<\/span> turns<\/strong>/u);
  assert.match(header(known), /🌅 <span class="datetime"><span class="unknown"[^>]*>\?\?<\/span><\/span>/u);
  assert.ok(!header(known).includes('unknown turns'));
  const unavailable = detailedEvidence({ state: 'unavailable', turns: [], dates: [] });
  const none = render([detailedOccurrence('one', { createdTimestamp: null, activityTimestamp: null, promptCount: null })], unavailable);
  assert.match(header(none), /aria-label="unknown">\?\?\?<\/span> turns/u);
  assert.match(header(none), /the source could not be read or verified/u);
  assert.ok(!/>unknown</u.test(header(none)), 'visible header text never says "unknown"');
});

test('detail values use a single question mark with an explanatory title instead of the word unknown', () => {
  const html = render([detailedOccurrence('one')], detailedEvidence({ errors: null, canceled: null, injectedPrompts: null, bytes: null }));
  assert.match(html, /<dt>Request errors<\/dt><dd><span class="unknown" title="Unknown: no recorded value for this detail" aria-label="unknown">\?<\/span><\/dd>/u);
  assert.match(html, /Injected\/non-user SDK prompts: <span class="unknown"[^>]*>\?<\/span>\./u);
  assert.ok(html.includes('Question marks mean unknown, never zero'));
});

test('the table of contents uses a narrow title font and a bold, orange, monospaced project name', () => {
  const css = compactCss(render());
  assert.ok(css.includes('.index-list .toc-main>a{min-width:0;font:0.9375rem "Arial Narrow",Arial,sans-serif}'));
  assert.ok(css.includes('.workspace-name{color:var(--orange);font-family:monospace;font-weight:700}'));
  assert.ok(css.includes('.toc-number{font-weight:700}'));
});

test('an unresolved card marks unknown payload once and the missing model timeline with three marks', () => {
  const html = render([detailedOccurrence('one', { backing: { status: 'unresolved', reason: 'x' } })],
    detailedEvidence({ state: 'unavailable', turns: [], bytes: null, byteScope: 'unknown', models: [] }));
  assert.match(html, /Scoped payload: <span class="unknown" title="Size not measured">\?<\/span>\. Scope not measured\./u);
  assert.match(html, /Model-switch timeline:<\/strong> <span class="unknown"[^>]*>\?\?\?<\/span>/u);
});

test('the table of contents has a project/date/chip second line and bold numbers', () => {
  const a = detailedOccurrence('a', { createdTimestamp: 1700000000000, activityTimestamp: 1700003600000 });
  const reference = { ...a, occurrenceId: 'a2', provenance: { ...a.provenance, workspaceStoragePath: 'C:\\other',
    workspaceIdentity: { kind: 'workspace' as const, uri: 'file:///c%3A/w/team.code-workspace' } } };
  const first = { ...a, provenance: { ...a.provenance, workspaceIdentity: { kind: 'folder' as const, uri: 'file:///c%3A/p/cpe-exb' } } };
  const data = detailedEvidence();
  data.files = [{ file: 'a.ts', operation: 'modified', added: 2, removed: 1, estimated: false, source: 'tool' }];
  const html = render([first, reference], data);
  const toc = html.match(/<ol class="index-list">([\s\S]*?)<\/ol>/u)![1];
  assert.ok(toc.includes('<strong class="toc-number">#1</strong>'));
  assert.match(toc, /<span class="toc-main">[\s\S]*?<span class="index-meta"><strong>1 turn<\/strong><\/span><\/span>/u);
  assert.match(toc, /<span class="toc-sub"><span class="workspace-name" title="cpe-exb, team.code-workspace">📁 cpe-exb \+1<\/span>/u);
  assert.match(toc, /title="Last updated \(MMDD-HH:mm, generator-local time\)">🔄 \d{4}-\d{2}:\d{2}<\/span>/u);
  assert.ok(toc.includes('>2 w/s refs</span>'));
  assert.ok(toc.includes('✏️ 1 file'));
  assert.ok(!toc.includes('references') && !/· \d+ refs?/u.test(toc));
});

test('the table of contents marks an unknown project and date with question marks and omits the refs chip for one reference', () => {
  const html = render([detailedOccurrence('x', { activityTimestamp: null })], detailedEvidence({ dates: [] }));
  const toc = html.match(/<ol class="index-list">([\s\S]*?)<\/ol>/u)![1];
  assert.match(toc, /📁 <span class="unknown"[^>]*>\?\?<\/span>/u);
  assert.match(toc, /🔄 <span class="unknown"[^>]*>\?\?<\/span>/u);
  assert.ok(!toc.includes('w/s refs'));
});

test('project filter lists projects with counts plus multiple and unknown, and the chart counts inclusively', () => {
  const at = (id: string, uri: string | undefined, hash = id) => detailedOccurrence(id, {
    provenance: { userDataRoot: 'C:\\Code', workspaceStoragePath: `C:\\Code\\User\\workspaceStorage\\${hash}`,
      ...(uri ? { workspaceIdentity: { kind: 'folder' as const, uri } } : {}) },
  });
  const solo = at('11111111-1111-4111-8111-111111111111', 'file:///c%3A/p/alpha');
  const shared = at('22222222-2222-4222-8222-222222222222', 'file:///c%3A/p/alpha', 'h1');
  const sharedTwo = { ...at('22222222-2222-4222-8222-222222222222', 'file:///c%3A/p/beta', 'h2'), occurrenceId: 'shared-two' };
  const none = at('33333333-3333-4333-8333-333333333333', undefined);
  const html = render([solo, shared, sharedTwo, none]);
  const select = html.match(/<select id="project"[\s\S]*?<\/select>/u)![0];
  assert.ok(select.includes('<option value="">All projects</option>'));
  assert.ok(select.includes('<option value="__multi">Multiple projects (1)</option>'));
  assert.ok(select.includes('<option value="__unknown">No recorded project (1)</option>'));
  assert.ok(select.includes('<option value="file:///c%3A/p/alpha">alpha (2)</option>'), 'multi-project chat counts under alpha too');
  assert.ok(select.includes('<option value="file:///c%3A/p/beta">beta (1)</option>'));
  assert.ok(html.includes('data-projects="[&quot;file:///c%3A/p/alpha&quot;,&quot;file:///c%3A/p/beta&quot;]"'));
  assert.ok(html.includes('data-projects="[]"'));
  const chart = html.match(/<section class="panel" id="project-chart">[\s\S]*?<\/section>/u)![0];
  assert.ok(chart.includes('data-project-pick="__multi"') && chart.includes('data-project-pick="__unknown"'));
  assert.ok(chart.includes('data-project-pick="file:///c%3A/p/alpha"'));
  assert.ok(chart.includes('class="bar-project"') && chart.includes('class="bar-multi"') && chart.includes('class="bar-unknown"'));
  assert.ok(chart.includes('bars are not additive'));
});

test('equal folder names at different locations are disambiguated by their parent folder', () => {
  const at = (id: string, uri: string) => detailedOccurrence(id, {
    provenance: { userDataRoot: 'C:\\Code', workspaceStoragePath: `C:\\Code\\User\\workspaceStorage\\${id}`,
      workspaceIdentity: { kind: 'folder' as const, uri } },
  });
  const html = render([at('44444444-4444-4444-8444-444444444444', 'file:///c%3A/one/src'), at('55555555-5555-4555-8555-555555555555', 'file:///c%3A/two/src')]);
  assert.ok(html.includes('>src (one) (1)</option>') && html.includes('>src (two) (1)</option>'));
});

test('font sizes are rem-based on a single 125% root, with no pixel font sizes left', () => {
  const html = render();
  assert.ok(compactCss(html).includes('html{font-size:125%}'));
  assert.equal(/font(?:-size)?:[^;}]*\d+px/u.test(detailedStylesForTest()), false);
  assert.ok(compactCss(html).includes('font:0.875rem Arial,sans-serif'));
});

test('buttons and filter chips have themed backgrounds in light and dark schemes', () => {
  const css = detailedStylesForTest();
  assert.ok(css.includes('--btn:#dbe9f8'));
  assert.ok(css.includes('--chip:#eef4fb'));
  assert.ok(css.includes('button{cursor:pointer;background:var(--btn);border-color:var(--btn-line)}'));
  assert.ok(css.includes('.chips button{background:var(--chip);border-color:var(--chip-line)'));
  assert.ok(css.includes('--btn:#2c4766'), 'dark scheme variant');
});

test('MD replaces the word Markdown in chips and header dates are bold', () => {
  const html = render();
  assert.ok(header(html).includes('Local MD export supported'));
  assert.ok(!/class="tag[^"]*"[^>]*>[^<]*Markdown/u.test(header(html)));
  const sdk = render([detailedOccurrence('s', { backing: { status: 'unresolved', reason: 'x' } })]);
  assert.ok(!/class="tag[^"]*"[^>]*>[^<]*Markdown/u.test(header(sdk)));
  assert.ok(detailedStylesForTest().includes('.subtitle .datetime{font-weight:700}'));
});

test('the last-updated date is omitted when it matches created to the minute', () => {
  const same = render([detailedOccurrence('one', { createdTimestamp: 1700000000000, activityTimestamp: 1700000030000 })], detailedEvidence({ turns: [] }));
  assert.ok(!header(same).includes('aria-label="Updated"'));
  assert.ok(header(same).includes('last updated in the same minute'));
  assert.equal((header(same).match(/class="datetime"/gu) ?? []).length, 1);
  const different = render([detailedOccurrence('one', { createdTimestamp: 1700000000000, activityTimestamp: 1700003600000 })], detailedEvidence({ turns: [] }));
  assert.ok(header(different).includes('aria-label="Updated"'));
});

test('sections with nothing or one line to show become field lines with the same icon and label', () => {
  const html = card(render());
  assert.ok(html.includes('<strong>🩺 Health checks · 🔎 Audit flags / diagnostics:</strong> none detected in the checks performed.</div>'));
  assert.ok(html.includes('<strong>🌳 Family / relationships:</strong> none recorded</div>'));
  assert.ok(!html.includes('<summary>🔎 Audit flags / diagnostics'));
  assert.ok(!html.includes('<summary>🌳 Family / relationships'));
  assert.ok(html.includes('<strong>📋 Export selector / command:</strong> <code class="selector">'));
  assert.ok(!html.includes('<summary>📋 Export selector / command'));
  const exportLine = html.match(/<strong>📋 Export selector \/ command:[\s\S]*?<\/div>/u)![0];
  assert.equal((exportLine.match(/data-copy=/gu) ?? []).length, 2, 'selector and command copy buttons stay on the single line');
  // One recorded model state means there was no switch: one line holding the link.
  assert.match(html, /<strong>🤖 Model-switch timeline:<\/strong> <a href="#session-1-turn-1">Turn 1: answer-model · Auto · effort high<\/a>/u);
  assert.ok(!html.includes('<summary>🤖 Model-switch timeline'));
});

test('sections with several lines stay expandable', () => {
  const data = detailedEvidence({ flags: ['pending-work'], diagnostics: [{ path: 'C:\\x', description: 'Problem' }] });
  data.turns.push({ ...data.turns[0]!, id: 'two', models: ['other-model'], selectedModel: 'other-model', auto: false });
  const html = render([detailedOccurrence('one')], data);
  assert.ok(html.includes('class="health-cards"') && html.includes('Audit note: pending-work') && html.includes('C:\\x: Problem'), 'health cards consolidate flags and diagnostics above evidence');
  assert.ok(html.includes('<summary>🤖 Model-switch timeline</summary>'));
});

test('the model timeline does not repeat Auto as a separate selected model', () => {
  const html = render();
  assert.ok(!html.includes('selected Auto'));
});

test('prompts differing only by whitespace are not shown twice, while derived or clipped text still is', () => {
  const data = detailedEvidence();
  data.turns[0] = { ...data.turns[0]!, prompt: 'Short question \n' };
  const same = render([detailedOccurrence('one')], data);
  assert.ok(!same.includes('<details class="full-prompt"'));
  assert.ok(!same.includes('Derived SDK overview'));
  assert.ok(!same.includes('class="prompt-preview clipped-preview"'));
  const long = detailedEvidence();
  long.turns[0] = { ...long.turns[0]!, prompt: Array.from({ length: 80 }, (_, index) => `word${index}`).join(' ') };
  const clipped = render([detailedOccurrence('one')], long);
  assert.ok(clipped.includes('<details class="full-prompt"'));
  assert.ok(clipped.includes('class="prompt-preview clipped-preview"'));
});

test('derived SDK overviews keep one full-text disclosure with an explanation', () => {
  const base = detailedOccurrence('x');
  const sdk = { ...base, backing: { status: 'verified' as const, source: {
    kind: 'sdk-events' as const, provider: 'agent-host' as const, sessionId: 'backing', path: 'C:\\events.jsonl', schemaVersion: 1,
    sha256: 'sha', producer: null, scope: { kind: 'main' as const }, chatIdentity: 'chat', provenance: base.provenance,
    identityEvidence: [], identityWarnings: [], scopeWarnings: [],
  } } };
  const data = detailedEvidence();
  data.turns[0] = { ...data.turns[0]!, prompt: '<reminder>hidden context words</reminder>\nPlease help me today' };
  const html = render([sdk], data);
  assert.ok(html.includes('Derived SDK overview omits recognized context/reminder wrappers'));
  assert.ok(html.includes('<details class="full-prompt"'));
});

test('card links use the top icon and the unified artifact evidence is collapsed', () => {
  const data = detailedEvidence({
    artifactLocations: [{ kind: 'journal', path: 'C:\\j.jsonl', form: 'file', state: 'present', bytes: 10, files: 1 }],
    auditedBytes: 10,
    storage: [{ kind: 'journal', path: 'C:\\j.jsonl', state: 'present', bytes: 10, files: 1, modified: null, parts: [], measurement: 'Physical file length.' }],
  });
  const html = render([detailedOccurrence('one')], data);
  assert.ok(html.includes('🔝 TOC</a>'));
  assert.ok(!html.includes('📚 TOC</a>'));
  assert.ok(html.includes('📚 Session TOC</a>'), 'page navigation keeps its own icon');
  assert.ok(html.includes('<details><summary>🧰 Unified evidence table</summary>'));
  assert.ok(html.includes('class="source-path">C:\\j.jsonl</span>'));
  assert.ok(!html.includes('<summary>Artifact locations'), 'no duplicate artifact inventory');
  assert.ok(!html.includes('<details open'));
});

test('a single prompt timestamp is a field line while several stay in a disclosure', () => {
  const one = detailedEvidence({ dates: [{ source: 'request.1.timestamp', timestamp: 1700000000000, recordedValue: '1700000000000' }] });
  assert.ok(render([detailedOccurrence('one')], one).includes('<strong>Prompt / request timestamp:</strong>'));
  const several = detailedEvidence({ dates: [
    { source: 'request.1.timestamp', timestamp: 1700000000000, recordedValue: 'a' },
    { source: 'request.2.timestamp', timestamp: 1700000100000, recordedValue: 'b' },
  ] });
  assert.ok(render([detailedOccurrence('one')], several).includes('<summary>Prompt / request timestamps (2)</summary>'));
});

test('SDK event timestamps are collapsed with prompt dates and not repeated in technical identity', () => {
  const data = detailedEvidence({ dates: [
    { source: 'events.line:1.timestamp', timestamp: 1700000000000, recordedValue: '2023-11-14T22:13:20Z' },
    { source: 'events.line:2.timestamp', timestamp: 1700000001000, recordedValue: '2023-11-14T22:13:21Z' },
    { source: 'index.lastMessageDate', timestamp: 1700000001000, recordedValue: '1700000001000' },
  ] });
  const html = render([detailedOccurrence('one')], data);
  assert.ok(html.includes('<summary>Event / prompt timestamps (2)</summary>'));
  assert.ok(!html.includes('Date: events.line:'), 'event-by-event dates have one location, not another identity-table copy');
  assert.ok(html.includes('Date: index.lastMessageDate'), 'per-reference index date evidence is preserved');
});

test('folder names that still collide after adding the parent get a longer path and an ordinal', () => {
  const at = (id: string, uri: string) => detailedOccurrence(id, {
    provenance: { userDataRoot: 'C:\\Code', workspaceStoragePath: `C:\\Code\\User\\workspaceStorage\\${id}`,
      workspaceIdentity: { kind: 'folder' as const, uri } },
  });
  const html = render([at('66666666-6666-4666-8666-666666666666', 'file:///c%3A/a/same/src'), at('77777777-7777-4777-8777-777777777777', 'file:///d%3A/b/same/src')]);
  assert.ok(html.includes('>src (a/same) #1 (1)</option>') && html.includes('>src (b/same) #2 (1)</option>'));
});