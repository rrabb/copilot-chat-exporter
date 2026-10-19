import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { brotliCompressSync, brotliDecompressSync, crc32, gunzipSync, gzipSync } from 'node:zlib';
import { Script } from 'node:vm';
import test from 'node:test';
import { compressDetailedListingHtml, compressedListingLoader, listingCompressionLoader } from '../src/session/compressed-listing.ts';
import type { ReportCompression } from '../src/session/compressed-listing.ts';
import { brotliWasmBase64, brotliWasmSha256, brotliDecoderScript } from '../src/generated/brotli-decoder.ts';
import { createListingCompressionLoader } from '../src/session/compressed-listing-loader.ts';
import { formatDetailedSessionListingHtml } from '../src/session/detailed-listing.ts';
import { detailedListingController } from '../src/session/detailed-listing-controller.ts';
import { detailedOccurrence, detailedEvidence } from './detailed-listing-fixture.ts';

test('compression preserves the complete shell and exact UTF-8 evidence with no iframe or runtime hash', () => {
  const html = formatDetailedSessionListingHtml([], new Map(), {}, '2026-10-19T12:00:00Z');
  const start = html.indexOf('<section id="grouped-view">');
  const end = html.indexOf('</main><script>');
  const report = compressDetailedListingHtml(html);
  const payload = report.match(/id="report-payload"[^>]*data-bytes="(\d+)">([^<]+)<\/script>/u)!;
  const content = gunzipSync(Buffer.from(payload[2]!, 'base64'));
  assert.equal(content.length, Number(payload[1]));
  assert.equal(content.toString('utf8'), html.slice(start, end));
  for (const marker of ['<header>', '<section class="metrics">', '<section class="grid">', 'id="project-chart"', 'id="conversation-index"', 'id="search"'])
    assert.ok(report.indexOf(marker) < report.indexOf('id="compressed-content"'), marker);
  const hash = createHash('sha256').update(compressedListingLoader).digest('base64');
  assert.ok(report.includes(`script-src 'sha256-${hash}'`));
  assert.doesNotMatch(report, /<iframe|srcdoc=|crypto\.subtle|unsafe-eval/u);
  assert.match(report, /<noscript>.*Regenerate without --compressed/u);
  assert.doesNotMatch(report, /JavaScript is disabled\. All main candidate/u);
  new Script(compressedListingLoader);
});

test('compression rejects unexpected renderer boundaries instead of dropping content', () => {
  assert.throws(() => compressDetailedListingHtml('<!doctype html><main>Other report</main>'), /boundaries/u);
});

test('nonempty cards round-trip exactly while all overview and TOC markup stays static', () => {
  const row = detailedOccurrence('compressed-fixture');
  const evidence = detailedEvidence();
  evidence.turns[0]!.prompt = 'Recorded café prompt with <script>alert("not executable")</script> text.';
  const html = formatDetailedSessionListingHtml([row], new Map([[row.occurrenceId, evidence]]), {}, '2026-10-19T12:00:00Z');
  const report = compressDetailedListingHtml(html);
  const overview = html.slice(html.indexOf('<header>'), html.indexOf('<section class="panel"><h2>Find the chat'));
  const asciiOverview = overview;
  assert.ok(overview.length > 0 && report.includes(asciiOverview));
  const payload = report.match(/id="report-payload"[^>]*>([^<]+)<\/script>/u)![1]!;
  const content = gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');
  assert.equal(content, html.slice(html.indexOf('<section id="grouped-view">'), html.indexOf('</main><script>')));
  assert.ok(content.includes('&lt;script&gt;'));
  assert.throws(() => compressDetailedListingHtml(report), /boundaries/u);
});

async function loadFixture (bytes: Buffer, expectedBytes: number, supported = true, codec: ReportCompression = 'gzip', checksum = 0, wasm = brotliWasmBase64) {
  const frames: (() => void)[] = [];
  const main = { dataset: {}, addEventListener () {}, removeEventListener () {}, querySelectorAll: () => [] };
  const status = { textContent: '', setAttribute () {} };
  const target = { innerHTML: '' };
  const payload = { textContent: bytes.toString('base64'), dataset: { bytes: String(expectedBytes), crc: String(checksum) }, remove () {} };
  const root = { dataset: { reportState: '' }, classList: { add () {} } };
  const elements = new Map<string, object>([['report-loading', status], ['compressed-content', target], ['report-payload', payload]]);
  elements.set('report-decoder', { textContent: wasm, remove () {} });
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
  new Script(createListingCompressionLoader(codec, brotliDecoderScript, 'globalThis.initialized = true;')).runInNewContext(sandbox);
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

test('Brotli packages verified decoder assets and notices without network or gzip dependency', () => {
  assert.equal(createHash('sha256').update(Buffer.from(brotliWasmBase64, 'base64')).digest('hex'), brotliWasmSha256);
  const html = formatDetailedSessionListingHtml([], new Map(), {}, '2026-10-19T12:00:00Z');
  const report = compressDetailedListingHtml(html, 'brotli');
  const payload = report.match(/id="report-payload"[^>]*>([^<]+)</u)![1]!;
  assert.equal(brotliDecompressSync(Buffer.from(payload, 'base64')).toString(), html.slice(html.indexOf('<section id="grouped-view">'), html.indexOf('</main><script>')));
  assert.match(report, /script-src 'wasm-unsafe-eval' 'sha256-/u);
  assert.match(report, /Copyright \(c\) 2026 Yulong Ming/u);
  assert.match(report, /Copyright \(c\) 2016 Dropbox/u);
  assert.match(report, /id="report-decoder"/u);
  assert.doesNotMatch(report, /new DecompressionStream|<iframe/u);
});

test('real bundled Brotli decoder loads exact Unicode and rejects malformed, truncated, trailing, length, CRC, UTF-8 and WASM errors', async () => {
  const raw = Buffer.from('<section>café 日本語 evidence</section>');
  const packed = brotliCompressSync(raw);
  const loaded = await loadFixture(packed, raw.length, true, 'brotli', crc32(raw));
  assert.equal(loaded.root.dataset.reportState, 'ready', loaded.status.textContent);
  assert.equal(loaded.target.innerHTML, raw.toString());
  assert.equal(loaded.sandbox.initialized, true);
  for (const [input, size, checksum, supported, wasm] of [
    [Buffer.from([255, 255]), raw.length, crc32(raw), true, brotliWasmBase64],
    [packed.subarray(0, -2), raw.length, crc32(raw), true, brotliWasmBase64],
    [Buffer.concat([packed, Buffer.from([0])]), raw.length, crc32(raw), true, brotliWasmBase64],
    [packed, 1, crc32(raw), true, brotliWasmBase64],
    [packed, raw.length, 0, true, brotliWasmBase64],
    [brotliCompressSync(Buffer.from([255])), 1, crc32(Buffer.from([255])), true, brotliWasmBase64],
    [packed, raw.length, crc32(raw), false, brotliWasmBase64],
    [packed, raw.length, crc32(raw), true, 'AAAA'],
  ] as const) {
    const result = await loadFixture(input, size, supported, 'brotli', checksum, wasm);
    assert.equal(result.root.dataset.reportState, 'error', result.status.textContent);
    assert.equal(result.target.innerHTML, '');
    assert.equal(result.sandbox.initialized, false);
    assert.match(result.status.textContent, /Regenerate without/u);
  }
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
