import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { brotliCompressSync, crc32, gzipSync } from 'node:zlib';
import { compressDetailedListingHtml, listingCompressionLoader } from '../src/session/compressed-listing.ts';
import type { ReportCompression } from '../src/session/compressed-listing.ts';
import { formatDetailedSessionListingHtml } from '../src/session/detailed-listing.ts';
import { detailedEvidence, detailedOccurrence } from './detailed-listing-fixture.ts';
import { delay, launchTestBrowser } from './browser-cdp.ts';

function rewrap (html: string): string {
  return html.replace(/(<script\b[^>]*type="application\/octet-stream"[^>]*>)([^<]+)(<\/script>)/gu,
    (_, open: string, data: string, close: string) => open + '\r\n' + data.replace(/.{1,76}/gu, '$&\r\n') + close);
}

test('production compressed reports survive file re-saves under their actual CSP', { timeout: 120_000 }, async context => {
  const browser = await launchTestBrowser();
  if (!browser) {
    context.skip('No Chromium browser installed. Set CCE_TEST_BROWSER to run CSP/re-save acceptance.');
    return;
  }
  context.after(() => browser.close());
  context.diagnostic(`Actual CSP enforced in ${browser.version}; no setBypassCSP or disabled web security.`);
  const row = detailedOccurrence('resave-fixture');
  row.title = 'Résumé café 日本語 😀';
  const evidence = detailedEvidence();
  evidence.turns[0]!.prompt = 'Unicode café 日本語 😀; literal <script>alert("never execute")</script>.';
  const html = formatDetailedSessionListingHtml([row], new Map([[row.occurrenceId, evidence]]), {}, '2026-10-19T12:00:00Z')
    .replace('<section id="grouped-view">', '<section id="grouped-view"><span id="literal-url-text" title="javascript: literal description, not a URL" data-copy="javascript: literal copy value"></span>');
  for (const codec of ['gzip', 'brotli'] as const) {
    const report = compressDetailedListingHtml(html, codec);
    assert.doesNotMatch(report, /[^\x00-\x7f]/u);
    const variants: [string, string | Buffer][] = [
      ['original', report],
      ['crlf', report.replace(/\r?\n/gu, '\r\n')],
      ['trim-trailing-whitespace', report.split('\n').map(line => line.trimEnd()).join('\n')],
      ['windows-1252', Buffer.from(report, 'latin1')],
      ['base64-76-columns', rewrap(report)],
      ['combined', Buffer.from(rewrap(report).replace(/\r?\n/gu, '\r\n').split('\n').map(line => line.trimEnd()).join('\r\n'), 'latin1')],
      ['changed-script-hash', report.replace(listingCompressionLoader(codec), ' ' + listingCompressionLoader(codec) + '\n')],
      ['fallback-rewrapped', rewrap(report)],
    ];
    for (const [name, content] of variants) {
      await context.test(`${codec}: ${name}`, async () => {
        const file = path.join(browser.directory, `${codec}-${name}.html`);
        await writeFile(file, content);
        const { page, close } = await browser.page();
        try {
          await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
            window.__violations=[];window.__scriptErrors=[];
            document.addEventListener('securitypolicyviolation',e=>window.__violations.push(e.violatedDirective));
            window.addEventListener('error',e=>window.__scriptErrors.push(e.message));
            ${name === 'fallback-rewrapped' ? 'Uint8Array.fromBase64=undefined;' : ''}
          ` });
          await page.send('Page.navigate', { url: pathToFileURL(file).href });
          let state = '';
          for (let i = 0; i < 500; i++) {
            state = await page.evaluate<string>("document.documentElement?.dataset.reportState||''");
            if (state === 'ready' || state === 'error')
              break;
            await delay(20);
          }
          assert.equal(state, 'ready', await page.evaluate<string>("document.getElementById('report-loading')?.textContent"));
          assert.deepEqual(await page.evaluate("window.__violations"), []);
          assert.deepEqual(await page.evaluate("window.__scriptErrors"), []);
          assert.deepEqual(await page.evaluate("({cards:document.querySelectorAll('.session-card').length,scripts:document.querySelectorAll('#compressed-content script').length,unicode:document.querySelector('#compressed-content').textContent.includes('café 日本語 😀')})"), { cards: 1, scripts: 0, unicode: true });
          assert.ok(await page.evaluate("document.querySelector('#conversation-index').textContent.includes('Résumé café 日本語 😀')"));
          assert.ok(await page.evaluate("document.querySelector('#compressed-content').textContent.includes('literal <script>alert(\"never execute\")</script>.')"));
          assert.equal(await page.evaluate("document.getElementById('literal-url-text').dataset.copy"), 'javascript: literal copy value');
          assert.ok(await page.evaluate("(()=>{const c=document.querySelector('.session-card');c.open=false;const closed=getComputedStyle(c.querySelector('.session-summary'),'::before').content;c.open=true;const open=getComputedStyle(c.querySelector('.session-summary'),'::before').content;return closed.includes('▶')&&open.includes('▼')})()"));
          assert.ok(await page.evaluate("(()=>{const s=document.getElementById('search');s.value='not-present-982364';s.dispatchEvent(new Event('input'));return document.querySelector('.session-card').hidden})()"));
          if (name === 'changed-script-hash') {
            const saved = typeof content === 'string' ? content : content.toString();
            const scripts = [...saved.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gu)];
            const script = scripts.at(-1)![1]!;
            assert.notEqual(createHash('sha256').update(script).digest('base64'), createHash('sha256').update(listingCompressionLoader(codec)).digest('base64'));
          }
        } finally {
          await close();
        }
      });
    }
    const unsafeEvidence = {
      'script-in-payload': '<section class="session-card"><script>window.__executed=true</script></section>',
      'event-handler': '<section class="session-card"><img src="missing" onerror="window.__executed=true"></section>',
      'svg-event-handler': '<section class="session-card"><svg OnLoAd="window.__executed=true"></svg></section>',
      'javascript-url': '<section class="session-card"><a href="javascript:window.__executed=true">Click</a></section>',
      'encoded-javascript-url': '<section class="session-card"><a href=" &#x6a;ava&#9;script&colon;window.__executed=true">Click</a></section>',
      'nested-template-handler': '<section class="session-card"><template><button onclick="window.__executed=true">Click</button></template></section>',
    };
    for (const [kind, markup] of [['corrupt-payload', null], ...Object.entries(unsafeEvidence)] as const) {
      await context.test(`${codec}: ${kind} inserts no cards`, async () => {
        let broken = report;
        if (kind === 'corrupt-payload') {
          broken = report.replace(/(id="report-payload"[^>]*>)[^<]+/u, '$1////');
        } else {
          assert.ok(markup);
          const raw = Buffer.from(markup);
          const bytes = codec === 'gzip' ? gzipSync(raw) : brotliCompressSync(raw);
          broken = report.replace(/(id="report-payload"[^>]*>)[^<]+/u, '$1' + bytes.toString('base64'))
            .replace(/data-bytes="\d+"/u, `data-bytes="${raw.length}"`).replace(/data-crc="\d+"/u, `data-crc="${crc32(raw)}"`);
        }
        await assertError(codec, broken, kind);
      });
    }
    await context.test(`${codec}: CSP blocks a changed loader without its nonce`, async () => {
      const loader = listingCompressionLoader(codec);
      const changed = report.replace(loader, ' ' + loader + '\n').replace(/ nonce="[^"]+"/gu, '');
      const file = path.join(browser.directory, `${codec}-csp-negative-control.html`);
      await writeFile(file, changed);
      const { page, close } = await browser.page();
      try {
        await page.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__violations=[];document.addEventListener('securitypolicyviolation',e=>window.__violations.push(e.violatedDirective));" });
        await page.send('Page.navigate', { url: pathToFileURL(file).href });
        for (let i = 0; i < 100 && !(await page.evaluate<number>("window.__violations.length")); i++)
          await delay(20);
        assert.ok(await page.evaluate<number>("window.__violations.length") > 0);
        assert.equal(await page.evaluate("document.querySelectorAll('.session-card').length"), 0);
        assert.equal(await page.evaluate("document.documentElement.dataset.reportState"), undefined);
      } finally {
        await close();
      }
    });
  }
  async function assertError (codec: ReportCompression, report: string, name: string) {
    const file = path.join(browser!.directory, `${codec}-${name}.html`);
    await writeFile(file, report);
    const { page, close } = await browser!.page();
    try {
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__violations=[];document.addEventListener('securitypolicyviolation',e=>window.__violations.push(e.violatedDirective));" });
      await page.send('Page.navigate', { url: pathToFileURL(file).href });
      for (let i = 0; i < 500; i++) {
        if (await page.evaluate("document.documentElement?.dataset.reportState==='error'"))
          break;
        await delay(20);
      }
      assert.ok(await page.evaluate("document.documentElement.dataset.reportState==='error'&&document.getElementById('report-loading').textContent.includes('Regenerate without')"));
      assert.equal(await page.evaluate("document.querySelectorAll('.session-card').length"), 0);
      assert.equal(await page.evaluate("!!window.__executed"), false);
      assert.deepEqual(await page.evaluate("window.__violations"), []);
    } finally {
      await close();
    }
  }
});
