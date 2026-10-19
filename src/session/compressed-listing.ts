import { createHash } from 'node:crypto';
import { brotliCompressSync, constants, crc32, gzipSync } from 'node:zlib';
import { detailedListingController } from './detailed-listing-controller.ts';
import { brotliDecoderScript, brotliWasmBase64, brotliLicense } from '../generated/brotli-decoder.ts';
import { createListingCompressionLoader } from './compressed-listing-loader.ts';
import type { ReportCompression } from './compressed-listing-loader.ts';

export type { ReportCompression } from './compressed-listing-loader.ts';

export function listingCompressionLoader (codec: ReportCompression): string {
  return createListingCompressionLoader(codec, brotliDecoderScript);
}

export const compressedListingLoader = listingCompressionLoader('gzip');

/** Package detailed evidence with the explicitly selected codec. */
export function compressDetailedListingHtml (html: string, codec: ReportCompression = 'gzip'): string {
  if (codec !== 'gzip' && codec !== 'brotli')
    throw new Error('Unsupported report compression. Choose gzip or brotli.');
  const start = html.indexOf('<section id="grouped-view">');
  const end = html.indexOf('</main><script>');
  if (start < 0 || end < start || !html.endsWith(`<script>${detailedListingController}</script></body></html>`))
    throw new Error('Detailed report compression boundaries do not match the renderer.');
  const evidence = html.slice(start, end);
  const content = Buffer.from(evidence, 'utf8');
  const payload = (codec === 'gzip' ? gzipSync(content, { level: 9 }) : brotliCompressSync(content, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 8, [constants.BROTLI_PARAM_LGWIN]: 24 },
  })).toString('base64');
  const loader = listingCompressionLoader(codec);
  const hash = createHash('sha256').update(loader).digest('base64');
  const originalHash = createHash('sha256').update(detailedListingController).digest('base64');
  const shell = html.slice(0, start)
    .replace(`script-src 'sha256-${originalHash}'`, `script-src ${codec === 'brotli' ? "'wasm-unsafe-eval' " : ''}'sha256-${hash}' 'sha256-${originalHash}'`)
    .replace(/<noscript>[\s\S]*?<\/noscript>/u,
      `<noscript><p class="warning">Detailed evidence requires JavaScript and ${codec === 'gzip' ? 'native gzip decompression' : 'WebAssembly for Brotli decompression'} in this compressed report. The overview and Session TOC remain readable. Regenerate without --compressed or --compression to read detailed evidence without JavaScript.</p></noscript>`);
  const decoder = codec === 'brotli' ? `<!--\n${brotliLicense}\n--><script id="report-decoder" type="application/octet-stream">${brotliWasmBase64}</script>` : '';
  const crc = codec === 'brotli' ? ` data-crc="${crc32(content)}"` : '';
  const report = `${shell}<p id="report-loading" role="status" aria-live="polite">Loading conversations. The overview and Session TOC are available now; detailed evidence and report search require loading to finish.</p><div id="compressed-content"></div></main>${decoder}<script id="report-payload" type="application/octet-stream" data-bytes="${content.length}"${crc}>${payload}</script><script>${loader}</script></body></html>`;
  return report;
}
