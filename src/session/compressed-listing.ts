import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { detailedListingController } from './detailed-listing-controller.ts';
import { createListingCompressionLoader } from './compressed-listing-loader.ts';

export const compressedListingLoader = createListingCompressionLoader();

/** Package conventional detailed HTML without changing its static overview or TOC. */
export function compressDetailedListingHtml (html: string): string {
  const start = html.indexOf('<section id="grouped-view">');
  const end = html.indexOf('</main><script>');
  if (start < 0 || end < start || !html.endsWith(`<script>${detailedListingController}</script></body></html>`))
    throw new Error('Detailed report compression boundaries do not match the renderer.');
  const content = Buffer.from(html.slice(start, end), 'utf8');
  const payload = gzipSync(content, { level: 9 }).toString('base64');
  const hash = createHash('sha256').update(compressedListingLoader).digest('base64');
  const originalHash = createHash('sha256').update(detailedListingController).digest('base64');
  const shell = html.slice(0, start)
    .replace(`script-src 'sha256-${originalHash}'`, `script-src 'sha256-${hash}' 'sha256-${originalHash}'`)
    .replace(/<noscript>[\s\S]*?<\/noscript>/u, '<noscript><p class="warning">Detailed evidence requires JavaScript and native gzip decompression. The overview and Session TOC remain readable. Regenerate without --compressed for conventional HTML.</p></noscript>');
  return `${shell}<p id="report-loading" role="status" aria-live="polite">Loading conversations. The overview and Session TOC are available now; detailed evidence and report search require loading to finish.</p><div id="compressed-content"></div></main><script id="report-payload" type="application/octet-stream" data-bytes="${content.length}">${payload}</script><script>${compressedListingLoader}</script></body></html>`;
}
