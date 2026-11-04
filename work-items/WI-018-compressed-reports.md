# WI-018: Compressed detailed reports

Canonical entry: [WI-018](../work-log.md#wi-018). Code links use commit `cba16b37b7e31de73530b355e9200edefa82b04c`. Historical links use `180a06ce10eace027c8937c6c20331e5f3b524b0`.

## At a glance

- Goal: smaller self-contained files for sharing and storage, not fewer DOM nodes or a promised startup speedup.
- Conventional HTML stays the default. Compression requires detailed HTML. `--compressed` selects gzip; `--compression` selects gzip or Brotli.
- Gzip shipped first with native decoding. Brotli began as a benchmark, then gained approval with a bundled decoder and fixed quality 8/window 24.
- Decoder overhead can make Brotli larger on small reports. The CLI warns but doesn't change the chosen codec.
- The overview, complete TOC and controls stay static. Evidence loads once into the same document. Detailed evidence requires JavaScript.
- Inputs keep their latest values while loading. After initialization, a hash target keeps its usual priority and resets filters.
- Current CSP uses hashes and a deterministic nonce. Brotli also needs `wasm-unsafe-eval`. The nonce and checksums aren't authentication.
- Decoding, byte counts, UTF-8 and targeted HTML checks precede live insertion. Failure messages explain how to regenerate conventional HTML.
- Rejected: iframe/srcdoc and document.write insertion. The approved loader keeps navigation and evidence in the existing document.
- Rejected for this phase: a second renderer, records rewrite and premature batching. They add drift or complexity without a demonstrated benefit.
- Rejected: random nonces and mandatory runtime Web Crypto checks. Reproducible output and accidental-corruption checks don't require either.
- Historical measurements describe specific report versions, browsers and fixtures. Later validation added work, so older timings aren't today's baseline.
- [WI-013](../work-log.md#wi-013) holds batching research. [WI-012](../work-log.md#wi-012) holds compact-record rendering. Neither is part of this migration.

## Original goal

Make the detailed report smaller to distribute while keeping its evidence, search and navigation. Package the conventional renderer's output instead of creating another rendering system. In-file compression mainly helps file shares, attachments and storage. HTTP compression already provides much of that delivery saving for served reports.

The [pinned old root task](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L374) links the shared report-size history and implementation commits. Its [compression follow-up](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L327) records the gzip-first plan and later decisions. [WI-017](WI-017-report-size-reduction.md) owns the preceding search/tooltip duplication work. Design detail stays in the [HTML report guide](../docs/HTML-REPORT-DESIGN.md#optional-compressed-detailed-html).

## Done when

These are the criteria for the previously accepted compression work, not new implementation requests.

- Compression is opt-in, detailed-listing-only, with validated flags and unchanged output/overwrite rules.
- Both codecs package the same evidence. The complete overview and TOC remain usable without waiting for cards.
- Queued actions, links, search, copy and comparison work after loading. Conventional HTML keeps full no-JavaScript reading.
- Corrupt or unsupported payloads report failure. Invalid evidence isn't inserted partially, and checksums aren't described as authentication.
- Decoder licensing, generated-asset checks, offline CSP and repeatable output are covered by repository tests.
- Measurements distinguish delivered bytes, paint, readiness, transient heap, settled heap and DOM size.

## Current understanding

| Area | Checked behavior and evidence |
| --- | --- |
| Flags and API | **Inferred from source:** [argument validation](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/args.ts#L122) requires detailed HTML listing and rejects `--no-html`, unknown codecs and conflicting alias/Brotli selection. Repeated `--compression` values fail. The [public API](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/index.ts#L38) exports the compressor and codec type. The library defaults to gzip and doesn't print. |
| One renderer and exact boundaries | **Inferred from source:** the [wrapper](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing.ts#L16) requires output from the matching detailed renderer. It compresses everything from `grouped-view` through the footer, before `</main>`. Unexpected boundaries fail instead of silently dropping content. Gzip uses level 9. Brotli uses quality 8/window 24. |
| Static overview and TOC | **Inferred from source:** the [shell](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing.ts#L34) keeps the preceding header, metadata, navigation, privacy notice, counts, graphs, project list, Needs attention, complete TOC and controls. Native disclosures don't depend on decoded cards. Only the evidence tail is compressed. |
| Paint and queued actions | **Inferred from source:** the [loader](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing-loader.ts#L107) waits for first contentful paint where supported, otherwise two animation frames and a timer. [Queue handlers](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing-loader.ts#L33) keep the latest input values and project/attention/chip/reset/show-all/sort intent, not every keystroke. Static links can update the hash while loading. |
| Same-document initialization | **Inferred from source:** [validated evidence is inserted once](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing-loader.ts#L90), queue handlers are removed, then the existing controller initializes. [Pending state](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing-controller.ts#L192) keeps view, density, sorting and the lifted newest-25 limit. [Hash navigation](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing-controller.ts#L145) resets filters and opens the target. It can therefore override a queued search. |
| Corruption checks | **Inferred from source:** [gzip decoding](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing-loader.ts#L5) fully consumes the native stream. The [Brotli wrapper](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/scripts/generate-brotli.mjs#L24) requires final success and complete input consumption, bounds output using the expected length, and frees decoder results/stream resources. Both check [decoded byte count and strict UTF-8](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing-loader.ts#L66). Brotli adds a [separate CRC32 check](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing-loader.ts#L122). These detect accidental corruption, not authenticity. |
| HTML checks before insertion | **Inferred from source:** [generation](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing.ts#L23) and [decoding](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing-loader.ts#L74) reject literal script elements. An inert template then checks parsed elements, including nested templates, for scripts, event handlers and javascript URLs. Escaped script examples and ordinary `title`/`data-copy` text aren't rejected as executable URLs. This is a targeted guard, not a general-purpose HTML sanitizer. |
| CSP and file-edit compatibility | **Inferred from source:** [CSP generation](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing.ts#L33) keeps hashes and adds a content-derived nonce to every inline script. Only Brotli adds `wasm-unsafe-eval`, not JavaScript `unsafe-eval`. [ASCII shell/CSS encoding](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing.ts#L41), [single-line ASCII loaders](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/scripts/generate-brotli.mjs#L53) and [whitespace-tolerant base64](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing-loader.ts#L24) support the tested file edits. Arbitrary editor rewrites aren't guaranteed safe. |
| Failures and no JavaScript | **Inferred from source:** the [failure path](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing-loader.ts#L98) disables enhancement controls and shows an alert with regeneration instructions. Decode, integrity and HTML-validation failures happen before live insertion. The [no-JavaScript notice](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/compressed-listing.ts#L36) explains that only the static shell is readable. Card search, browser Find, copy, comparison and printing detailed evidence must wait for readiness. |
| Packaging and size warnings | **Inferred from source:** the [generator](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/scripts/generate-brotli.mjs#L10) checks `brotli-dec-wasm@2.3.2` and its pinned WASM hash, embeds the MIT license and upstream notices, and bundles build-time dependencies. [Build](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/scripts/build.mjs#L16) regenerates assets. [Check mode](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/scripts/generate-brotli.mjs#L69) doesn't rewrite stale assets. The [CLI](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/cli.ts#L322) compares complete file sizes and warns if chosen Brotli is larger. It doesn't switch codecs. |

## Decisions and tradeoffs

| Choice | Rejected approach | Why and evidence |
| --- | --- | --- |
| Keep conventional HTML as the default | Make compressed evidence the default archival format | Detailed evidence needs JavaScript and decoding support. The [known limits](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L394) also include unreadable Git diffs and no DOM reduction. |
| Ship native gzip first, benchmark Brotli separately | Ship a decoder based on raw-payload savings alone | The [initial decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L335) required decoder-size, timing and CSP evidence. Native Brotli was unavailable in the tested Chrome 155, not a claim about every future browser. Later approval superseded the benchmark-only restriction. |
| Offer explicit Brotli at quality 8/window 24 | Default to quality 11 or automatically change the selected codec | [Quality 11](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L439) took much longer for a smaller payload. Fixed overhead still hurts small reports. The later warning informs the user without overriding their choice. |
| Insert into the existing document with `innerHTML` | iframe/srcdoc, document.write, or adopting contextual fragments without a benefit | The [iframe prototype](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L357) broke outer-hash navigation. Print, clipboard and accessibility weren't established. `document.write` was excluded from the approved comparison. [Fragment timings](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L419) overlapped and slightly reversed in Edge, so the simpler insertion stayed. |
| Keep the full overview and TOC static, then apply the latest actions | Compress the whole document, delay every shell interaction, or replay every queued query | The [shell requirement](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L359) makes the report useful before cards exist. Replaying stale queries adds work without helping the user. |
| Reuse conventional HTML and the existing controller | A second evidence renderer, immediate compact-record rewrite or premature batching | A second renderer can drift. [Batching](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L378) needs measured benefit and complete fragments with correct containers. Don't split arbitrary HTML or add offset tables now. |
| Validate native gzip checks, Brotli CRC32, length and UTF-8 | Mandatory runtime SHA-256/Web Crypto or treating an embedded digest as authenticity | The [payload decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L364) concerns accidental corruption. A hash stored in an editable report doesn't authenticate that report. |
| Derive the nonce from content and executable code | A fresh random nonce for every generated file | The [final decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L471) restores byte-reproducibility. The predictable nonce allows tested re-saves. It isn't a secret or a web-application injection boundary. |
| Keep measurements as observations | Invent numeric shipping thresholds, add an experimental flag, or claim a general speedup | The dev [dropped those extra gates](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L371). Browser ranges overlap, and later validation adds work. |
| Distinguish transient and settled memory | Rewrite the loader based on the startup heap sample alone | The [settled-heap check](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L431) didn't support a persistent decoded-string leak. It didn't remove the startup allocation or long-task cost. |

## Findings and outcomes

### Historical phases and superseded claims

**Documented:** the archive records several implementations, not one unchanged benchmark.

| Phase | What to keep | What later changed |
| --- | --- | --- |
| Gzip first | `--compressed`, native gzip, conventional default, no records rewrite | Brotli was benchmark-only at this point. |
| Production Brotli | Explicit codec, quality 8/window 24, embedded decoder and notices, strict integrity checks | [Production approval](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L435) superseded statements that the decoder and WASM CSP permission weren't shipped. |
| File-edit compatibility | Nonce fallback, ASCII scripts/shell, CSS escapes, base64 whitespace handling, oversize warning and generated-asset checks | The [first compatibility pass](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L453) used a fresh random 192-bit nonce. That isn't current behavior. |
| Deterministic output and parsed-HTML checks | Content-derived SHA-256 nonce, inert-template validation and exact source/package output equality | [Final validation](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L469) adds parsing work, so older readiness timings don't describe this version. |
| Clean-checkout compatibility | Normalize embedded notice line endings before asset generation | The [old root log](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L257) records this later fix. The [current generator](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/scripts/generate-brotli.mjs#L17) implements it. |

The early verification review corrected a brittle source assertion, a racy fixture wait and nested test placement, not two production bugs. Later Windows browser-startup retries were harness fixes. See the [test review](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L425) and [compatibility validation](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L461).

### Payloads, decoder overhead and complete files

**Documented, not remeasured:** the [early 405-occurrence comparison](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L342) started from 17,751,839 conventional bytes. These are base64 payloads, not final shell-first files with all decoder costs:

| Encoding | Payload bytes after base64 | Limit |
| --- | ---: | --- |
| Gzip level 9 | 2,592,164 | Native decode was about 76 ms. Prototype ready time was 1,244 ms versus 1,012 ms for its same-batch control. |
| Deflate-raw level 9 | 2,592,140 | Saving 24 bytes didn't justify a different format. |
| Brotli quality 6 | 808,452 | Excludes decoder overhead. |
| Brotli quality 11/window 24 | 652,892 | The roughly 4x payload advantage over gzip wasn't a complete-file advantage. |

The [measured benchmark decoder](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L419) added 208,439 WASM bytes and 9,579 JavaScript bytes. Base64 expanded the WASM to 277,920 bytes, superseding the earlier unmeasured 70-150 KB estimate. Its complete benchmark file was about 2.38x smaller than gzip, not 4x.

**Observed here, 261104:** the [current asset probe](../temp-tool-output/261104-1541-wi018/decoder-bytes.mts) measured the same 208,439 WASM bytes and 277,920 base64 bytes, plus 8,067 bytes for today's exported decoder helper. The historical 9,579-byte JavaScript count describes the older benchmark. The generation changes behind that difference weren't traced. These component counts aren't total report overhead: the combined loader/controller, notices and shell also contribute. [Raw counts](../temp-tool-output/261104-1541-wi018/decoder-bytes.json) contain no chat data.

**Documented:** complete-file results below use a later 17,748,324-byte conventional baseline. Don't subtract across the earlier prototype and these later versions.

| Version | Gzip bytes | Brotli bytes | Meaning |
| --- | ---: | ---: | --- |
| [Gzip release and separate Q11 benchmark](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L410) | 2,818,640 | 1,182,732 | Brotli was instrumented and benchmark-only. |
| [Production Q8](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L439) | 2,818,865 | 1,271,385 | Brotli was about 55% smaller here. A ten-occurrence report was about 167 KB gzip versus 412 KB Brotli. |
| [First file-edit compatibility pass](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L463) | 2,820,285 | 1,272,571 | Added compatibility protections. Concurrent browser work prevents a controlled timing comparison. |
| [Final deterministic nonce and HTML checks](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L475) | 2,821,024 | 1,273,322 | Final archived capture, not today's regenerated size. |

The production quality comparison tried levels 4/6/8/9/10/11 with empty, one-, ten- and full-occurrence payloads. On the full evidence tail, Q8 produced 537,841 bytes in 225 ms. Q11 produced 473,912 bytes in 11,085 ms. That tradeoff, plus the fixed decoder cost, explains the Q8 choice without creating an automatic codec rule.

### Timing, memory and browser limits

**Documented, not rerun:** the [first loader comparison](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L410) reported:

| Variant | Chrome full-ready median (range), ms | Sampled peak JS heap |
| --- | ---: | ---: |
| Conventional | 984 (950-1,067) | 13.9 MiB |
| Gzip, innerHTML | 938 (902-1,129) | 51.4 MiB |
| Gzip, contextual fragment | 969 (908-1,033) | 51.3 MiB |
| Benchmark Brotli Q11 | 918 (877-1,021) | 61.8 MiB, excluding WASM memory |

The contextual-fragment file was 2,818,944 bytes including instrumentation. Five rotated trials used Chrome 155.0.8059.80 and Edge 155.0.4283.62, fresh contexts, reused browser/filesystem caches and a 1440x1000 viewport on Windows. The [methodology](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L417) defines readiness as two animation frames after controller initialization, not guaranteed physical presentation.

- Gzip saved 84.12% on that sample. Expanded DOM stayed around 591,800 nodes.
- Chrome first-contentful-paint medians improved from 220 to 172 ms, but the longest-task median rose from about 272 to 579 ms.
- Edge full-ready medians were 922 ms conventional and 909 ms gzip. Overlapping ranges don't establish a general speedup.
- The [settled-heap experiment](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L431) found 7.551 MiB conventional versus 7.640 MiB gzip after two seconds and forced GC. The difference was 92,956 bytes. The earlier roughly 51 MiB startup sample was transient in that experiment, not total process memory or proof of a persistent leak.
- [Production Brotli trials](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L445) used a different, polling-observed readiness metric: gzip/Brotli medians were 926/979 ms in Chrome and 913/944 ms in Edge. Settled JS heap was about 7.63-7.64 MiB with no live WASM memory after GC. Peak WASM, native DOM and total process memory weren't established.
- [Final parsed-HTML validation trials](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L475) used five alternating fresh contexts without concurrent browser work. Gzip readiness was 1,474.6 ms (1,444.3-1,735.1), Brotli 1,407.2 ms (1,371.7-1,455.9), sampled every 20 ms. The added inert-template parse makes older timings non-comparable. Settled JS heap stayed near 7.7 MiB with no retained WASM memory after GC.

The archive records Chrome/Edge search, held-shell, queued-action, exact prompt/copy, comparison, PDF, corruption and actual-CSP checks. Later Firefox checks were a smaller compatibility suite, not the full Chromium suite. Browser Find used an approximation, clipboard calls were stubbed, and real Ctrl+F UI, clipboard permissions and low-end devices remained unverified. [Final receipts](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L477) link the private evidence without making it part of this migration's checks.

### Separate renderer work

[WI-013](../work-log.md#wi-013) keeps the batching question prompted by the long startup task. A later experiment must define complete card/section boundaries and containers before attempting batches. [WI-012](../work-log.md#wi-012) keeps shared compact records, one renderer and rendering details on demand. Compression doesn't implement either idea or reduce the expanded DOM.

## Validation and limits

- **Observed here, 261104:** selected synthetic [compression tests](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/test/compressed-listing.test.ts#L14) checked exact evidence round trips, static shell, deterministic nonces, CSP strings, decoder assets, Unicode and failure paths. They ran the real embedded Brotli decoder in a simulated page, not a browser.
- Selected [argument tests](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/test/args.test.ts#L113) and [queued-state tests](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/test/detailed-listing-controller.test.ts#L190) checked flags and controller initialization. [Generated-asset tests](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/test/generated-report-assets.test.ts#L8) checked stale assets, WASM pins and notice line endings in temporary copies, without rewriting product files.
- The [focused runner](../temp-tool-output/261104-1541-wi018/run-focused.ps1) fixes the selection and uses the repository's cache-isolating wrapper. [Results](../temp-tool-output/261104-1541-wi018/focused-results.log) and the decoder-byte probe are Git-ignored local evidence.
- The synthetic page doesn't implement real HTML parsing or enforce CSP. [Browser cases](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/test/compressed-listing-browser.test.ts#L21) cover those checks, but weren't run here. Inert-template behavior and actual-CSP re-save acceptance remain source-checked and historically documented, not newly browser-verified.
- No live inventory, browser benchmark, full verification, build or packed-library smoke test ran. Historical performance figures weren't remeasured. Product code didn't change.
- Graph coverage reported changed metadata and partial parsing in unrelated public-export lines. Claims use direct source reads at the named clean revision. The archive has the same Git blob at both cited commits.
- No new child items were filed. Existing Inbox lines stayed intact. The separate WI-001 acceptance question doesn't close any product or follow-up work.

## References

- [Pinned old root task and commits](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L374), [gzip-first plan](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L327), [Brotli decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L435), and [final compatibility changes](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L467).
- [Current behavior rules](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/docs/SPEC.md#L138), [HTML design guide](../docs/HTML-REPORT-DESIGN.md#optional-compressed-detailed-html), [WI-016 listings](WI-016-offline-listings.md), [WI-017 duplication work](WI-017-report-size-reduction.md), and [later browser-test maintenance](WI-026-pnpm-migration.md#findings).
