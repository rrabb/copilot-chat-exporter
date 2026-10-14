import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDetailedSessionListingHtml } from '../src/session/detailed-listing.ts';
import { detailedEvidence, detailedOccurrence, detailedStylesForTest } from './detailed-listing-fixture.ts';

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

test('an unresolved card marks unknown payload once and the missing model timeline with three marks', () => {
  const html = render([detailedOccurrence('one', { backing: { status: 'unresolved', reason: 'x' } })],
    detailedEvidence({ state: 'unavailable', turns: [], bytes: null, byteScope: 'unknown', models: [] }));
  assert.match(html, /Scoped payload: <strong><span class="unknown"[^>]*>\?<\/span><\/strong><\/p>/u);
  assert.match(html, /Model-switch timeline:<\/strong> <span class="unknown"[^>]*>\?\?\?<\/span>/u);
});

test('the table of contents abbreviates references, uses singular forms and a narrow title font', () => {
  const a = detailedOccurrence('a');
  const reference = { ...a, occurrenceId: 'a2', provenance: { ...a.provenance, workspaceStoragePath: 'C:\\other' } };
  const html = render([a, reference]);
  assert.ok(html.includes('· 2 refs</span>'));
  assert.ok(!html.includes('references</span>'));
  assert.ok(html.includes('.index-list li>a{min-width:0;font:0.9375rem "Arial Narrow",Arial,sans-serif}'));
});

test('font sizes are rem-based on a single 125% root, with no pixel font sizes left', () => {
  const html = render();
  assert.ok(html.includes('html{font-size:125%}'));
  assert.equal(/font(?:-size)?:[^;}]*\d+px/u.test(detailedStylesForTest()), false);
  assert.ok(html.includes('body{margin:0;background:var(--bg);color:var(--ink);font:0.875rem Arial,sans-serif'));
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
  assert.ok(html.includes('<div class="field-line" title="No additional flags and no enrichment/source diagnostics."><strong>🔎 Audit flags / diagnostics:</strong> none</div>'));
  assert.ok(html.includes('<strong>🌳 Family / forks / copies:</strong> none recorded</div>'));
  assert.ok(!html.includes('<summary>🔎 Audit flags / diagnostics'));
  assert.ok(!html.includes('<summary>🌳 Family / forks / copies'));
  assert.ok(html.includes('<strong>📋 Export selector / command:</strong> <code class="selector">'));
  assert.ok(!html.includes('<summary>📋 Export selector / command'));
  assert.equal((html.match(/data-copy=/gu) ?? []).length, 2, 'selector and command copy buttons stay on the single line');
  // One recorded model state means there was no switch: one line holding the link.
  assert.match(html, /<strong>🤖 Model-switch timeline:<\/strong> <a href="#session-1-turn-1">Turn 1: answer-model · Auto · effort high<\/a>/u);
  assert.ok(!html.includes('<summary>🤖 Model-switch timeline'));
});

test('sections with several lines stay expandable', () => {
  const data = detailedEvidence({ flags: ['pending-work'], diagnostics: [{ path: 'C:\\x', description: 'Problem' }] });
  data.turns.push({ ...data.turns[0]!, id: 'two', models: ['other-model'], selectedModel: 'other-model', auto: false });
  const html = render([detailedOccurrence('one')], data);
  assert.ok(html.includes('<summary>🔎 Audit flags / diagnostics (2)</summary>'), 'flags and diagnostics are both counted');
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

test('card links use the top icon and artifact locations are collapsed', () => {
  const data = detailedEvidence({
    artifactLocations: [{ kind: 'journal', path: 'C:\\j.jsonl', form: 'file', state: 'present', bytes: 10, files: 1 }],
    auditedBytes: 10,
  });
  const html = render([detailedOccurrence('one')], data);
  assert.ok(html.includes('🔝 TOC</a>'));
  assert.ok(!html.includes('📚 TOC</a>'));
  assert.ok(html.includes('📚 Session TOC</a>'), 'page navigation keeps its own icon');
  assert.ok(html.includes('<summary>Artifact locations (1 present of 1 checked)</summary>'));
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
