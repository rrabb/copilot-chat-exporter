import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { Script } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { createListingCompressionLoader } from '../src/session/compressed-listing-loader.ts';
import { compressDetailedListingHtml } from '../src/session/compressed-listing.ts';
import { formatDetailedSessionListingHtml } from '../src/session/detailed-listing.ts';
import { detailedOccurrence, detailedEvidence } from './detailed-listing-fixture.ts';

test('gzip output keeps the complete static shell and exact Unicode evidence', () => {
  const row = detailedOccurrence('gzip-fixture');
  const evidence = detailedEvidence();
  evidence.turns[0]!.prompt = 'Recorded café prompt with <script>literal text</script>.';
  const html = formatDetailedSessionListingHtml([row], new Map([[row.occurrenceId, evidence]]), {}, '2026-10-19T12:00:00Z');
  const report = compressDetailedListingHtml(html);
  const packed = report.match(/id="report-payload"[^>]*data-bytes="(\d+)">([^<]+)<\/script>/u)!;
  const raw = gunzipSync(Buffer.from(packed[2]!, 'base64'));
  assert.equal(raw.length, Number(packed[1]));
  assert.equal(raw.toString(), html.slice(html.indexOf('<section id="grouped-view">'), html.indexOf('</main><script>')));
  for (const marker of ['<header>', 'id="project-chart"', 'id="conversation-index"', 'id="search"'])
    assert.ok(report.indexOf(marker) < report.indexOf('id="compressed-content"'));
  assert.doesNotMatch(report, /<iframe|srcdoc=|crypto\.subtle/u);
  assert.throws(() => compressDetailedListingHtml('invalid'), /boundaries/u);
});

async function loadFixture (bytes: Buffer, expectedBytes: number, supported = true) {
  const frames: (() => void)[] = [];
  const main = { dataset: {}, addEventListener () {}, removeEventListener () {}, querySelectorAll: () => [] };
  const status = { textContent: '', setAttribute () {} };
  const target = { innerHTML: '' };
  const payload = { textContent: bytes.toString('base64'), dataset: { bytes: String(expectedBytes), crc: '0' }, remove () {} };
  const root = { dataset: { reportState: '' }, classList: { add () {} } };
  const elements = new Map<string, object>([['report-loading', status], ['compressed-content', target], ['report-payload', payload]]);
  const sandbox = {
    initialized: false,
    document: {
      documentElement: root, querySelector: () => main, getElementById: (id: string) => elements.get(id),
      createElement: () => ({ innerHTML: '', content: { querySelectorAll: () => [], replaceChildren () {} } }),
    },
    requestAnimationFrame: (callback: () => void) => { frames.push(callback); },
    setTimeout: (callback: () => void) => callback(),
    DecompressionStream: supported ? DecompressionStream : undefined,
    ...(supported ? {} : { WebAssembly: undefined }),
    Blob, Response, TextDecoder, TextEncoder, Uint8Array, atob, Error,
  };
  new Script(createListingCompressionLoader('globalThis.initialized = true;')).runInNewContext(sandbox);
  assert.equal(root.dataset.reportState, 'loading');
  assert.equal(target.innerHTML, '', 'evidence must not be inserted before the shell paint opportunity');
  frames.shift()!();
  assert.equal(target.innerHTML, '');
  frames.shift()!();
  const deadline = Date.now() + 10_000;
  while (root.dataset.reportState === 'loading' && Date.now() < deadline)
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  assert.notEqual(root.dataset.reportState, 'loading');
  return { root, target, status, sandbox };
}

test('loader waits for paint scheduling, validates UTF-8 bytes and initializes only after insertion', async () => {
  const text = '<section>Recorded prompt: café and 日本語</section>';
  const bytes = Buffer.from(text, 'utf8');
  const result = await loadFixture(gzipSync(bytes), bytes.length);
  assert.equal(result.root.dataset.reportState, 'ready');
  assert.equal(result.target.innerHTML, text);
  assert.equal(result.sandbox.initialized, true);
});

test('loader exposes unsupported, truncated, CRC and size errors without inserting partial evidence', async () => {
  const bytes = gzipSync(Buffer.from('<section>Evidence</section>'));
  const badCrc = Buffer.from(bytes);
  badCrc[badCrc.length - 8]! ^= 1;
  for (const [input, size, supported] of [
    [bytes, 27, false], [bytes.subarray(0, -4), 27, true], [badCrc, 27, true], [bytes, 1, true],
    [gzipSync(Buffer.from([0xff])), 1, true],
  ] as const) {
    const result = await loadFixture(input, size, supported);
    assert.equal(result.root.dataset.reportState, 'error');
    assert.equal(result.target.innerHTML, '');
    assert.equal(result.sandbox.initialized, false);
    assert.match(result.status.textContent, /Regenerate without --compressed/u);
  }
});
