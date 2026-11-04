# WI-017: Detailed-report duplication

Canonical entry: [WI-017](../work-log.md#wi-017). Code links use commit `cba16b37b7e31de73530b355e9200edefa82b04c`. Historical links use `180a06ce10eace027c8937c6c20331e5f3b524b0`.

## At a glance

- Goal: reduce repeated detailed-report content without turning the offline investigation tool into a summary or dropping source evidence.
- Search uses cached, designated rendered text plus missing identifiers and paths. Full prompts in closed disclosures remain searchable.
- Case-insensitive substring matching and AND across words stay. Artifact, composition and diagnostic evidence deliberately broaden the earlier search coverage.
- Conversation search combines references. Occurrence search keeps each workspace's evidence separate while sharing conversation prompts.
- The frozen 405-occurrence sample shrank 19.53% normally and 19.60% with ignored chats. These aren't current-size or speed guarantees.
- Rejected: deleting search attributes or tooltips indiscriminately. That breaks search or hides useful values and explanations.
- Rejected: indexing whole cards or substituting browser Find. Controls pollute matches, and browser Find doesn't provide scoped report filters.
- Rejected: moving repeated search text wholesale into JSON or complete per-occurrence strings. That moves the duplication rather than removing it.
- [WI-012](../work-log.md#wi-012) holds the separate compact-record/shared-renderer experiment. Reusing a renderer alone doesn't reduce DOM nodes.
- [WI-018](../work-log.md#wi-018) owns compressed delivery, not a records rewrite. Design details stay in the [HTML report guide](../docs/HTML-REPORT-DESIGN.md#page-behavior).

## Original goal

Keep a useful, self-contained offline tool for finding chats by identifiers, prompts, files, artifacts, backing sources and diagnostic evidence. Reduce repeated serialized content without losing that evidence. The dev chose to implement original task #35 first, measure its results, then consider compact evidence records with one reusable browser renderer separately. See the [pinned old task](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L374) and [original goal and ordering decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L208).

This phase concerns detailed HTML. It doesn't authorize changes to basic HTML, discovery, Markdown export, native stores or usage correlation. [WI-016](WI-016-offline-listings.md) owns the broader listing behavior.

## Done when

These are the criteria for the previously accepted duplication work, not new implementation requests.

- Same-input before/after reports show a net byte reduction, including replacement metadata and controller costs.
- Search keeps identifiers, complete prompts, models/effort, files, workspace/source/context values and their correct attribution. It also searches the agreed investigative evidence.
- Queries work across shared and scoped fragments without mixing one occurrence's workspace evidence into another.
- Redaction, exact copy values, informative tooltips, accessible controls, filters, navigation and conventional no-JavaScript reading remain available.
- The result doesn't depend on a full browser-rendered rewrite, a new library or compression.

## Current understanding

| Area | Checked behavior and evidence |
| --- | --- |
| Kept matching rules | **Inferred from source:** the [controller](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing-controller.ts#L61) uses case-insensitive substring matching, with every query word required somewhere in the allowed fragments. [Query parsing](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing-controller.ts#L82) happens once per filter update, not once per row. |
| Kept full prompt access | **Inferred from source:** [turn rendering](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing.ts#L381) keeps full redacted text for clipped or derived previews. The [search cache](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing-controller.ts#L29) indexes those disclosures before filtering, independently of whether they are open. |
| Deliberately broader coverage | **Documented:** the [scope decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L235) added investigative evidence, not merely identical old search results. **Inferred from source:** [health diagnostics](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-source.ts#L129), [artifact values and composition](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-source.ts#L209), and [technical values](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-source.ts#L213) carry searchable reference associations. |
| Deliberately excluded text | **Inferred from source:** [designated extraction](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing-controller.ts#L12) skips controls, headings, captions and unknown placeholders. It doesn't walk arbitrary tooltips or unrelated family labels. Exact `data-copy` values still contribute useful paths even when button text is excluded. |
| Shared and scoped evidence | **Inferred from source:** the [cache](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing-controller.ts#L26) shares conversation fragments. Grouped search includes all references. Each occurrence adds its own referenced evidence and row text. [Occurrence rows](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing.ts#L435) use `data-conversation` and `data-reference`, so discovery doesn't depend on optional `data-search`. |
| Supplemental values | **Inferred from source:** the [helper](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-search.ts#L13) redacts, normalizes, deduplicates and escapes values absent from rendered labels. [Turn metadata](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing.ts#L392) adds missing raw model IDs. [Card metadata](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing.ts#L415) adds aggregate file paths without rendered turn rows. The controller combines supplements with rendered text, not an either/or fallback. |
| Tooltip rule | **Inferred from source:** [title generation](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-search.ts#L5) compares complete redacted text after whitespace normalization. It doesn't measure visual clipping or fold case. Additional IDs, paths and explanations remain. [Source copy controls](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-source.ts#L15) keep exact redacted values and accessible names without duplicate titles. |
| Offline reading and controls | **Inferred from source:** the [static report and CSP](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing.ts#L482) keep code separate from report text. The [no-JavaScript fallback](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing.ts#L496) exposes main cards and native disclosures. Interactive search, copying and comparison still need JavaScript. [Sorting and navigation](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing-controller.ts#L130) remain separate from text indexing. |

## Decisions and tradeoffs

These choices come from the [agreed scope](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L231), [implementation plan](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L264) and [acceptance criteria](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L302).

| Choice | Rejected approach | Why |
| --- | --- | --- |
| Remove duplicated representations, not investigative evidence | Reduce the report to a summary or drop provenance for a byte target | Identifying chats and understanding their backing evidence is the purpose of the report. |
| Replace full search attributes with cached designated text and missing-value supplements | Delete all `data-search` attributes without replacing their consumers | The old controller used them for nonempty search and occurrence discovery. Empty-query checks would miss both failures. |
| Keep deliberate search fields and occurrence attribution | Index entire cards, or substitute browser Find for report search | Whole cards include controls, generic explanations and unrelated labels. Browser Find doesn't provide the report's filters or reference attribution. |
| Cache text once, inserting spaces between fragments | Use visibility-dependent `innerText`, rescan large subtrees per keystroke, or require all words in one fragment | Closed evidence must remain searchable. Words may match different approved fragments without forming accidental joined words. |
| Omit titles that repeat the complete normalized label | Remove every title, use arbitrary length cutoffs, remove accessible names, or add layout observers in this phase | Full paths, raw model IDs, uncertainty and precision reasons add information. Actual clipping varies with viewport, CSS and fonts. |
| Reuse shared fragments with short reference markers | Move the full repeated corpus into JSON or eagerly concatenate it for every occurrence | This relocates duplication into bytes or memory. A full client-rendered model was excluded from this phase, not approved by the search-cache change. |
| Measure net savings on identical inputs | Treat deletion experiments as targets, add overlapping byte categories, or claim compression proves rendering improvements | Required metadata and controller code have costs. Compressed bytes, DOM size and responsiveness are different measurements. |
| Keep the first phase focused | Redesign source tables, minimize CSS/whitespace, or change basic HTML and discovery incidentally | The audit favored repeated search text. Broader presentation changes need separate evidence and approval. |

## Findings and outcomes

### Why duplication came first

**Documented:** the [initial audit](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L245) examined a saved 21,824,548-byte report. Full search attributes occupied 4,600,667 bytes (21.08%). Titles occupied 3,236,826 bytes (14.83%), but many contained useful information.

Their combined 35.91% was an upper deletion budget, not promised savings. Removing both in memory produced a nonfunctional 13.339 MiB experiment. The Why/source sections occupied 42.51% inclusively, overlapping those attribute counts. They weren't an additional independent saving. CSS, inline styles and the existing controller were much smaller contributors.

That audit and the later matched comparison used different report inputs. Don't compare the initial 21,824,548 bytes directly with the final report or combine their attribute counts.

### Results from the frozen sample

**Documented, not remeasured:** the [implementation comparison](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L214) used one saved 405-occurrence evidence snapshot, identical generation options and the same generation time.

| Report | Before bytes | After bytes | Saved bytes | Reduction |
| --- | ---: | ---: | ---: | ---: |
| Normal | 21,676,719 | 17,444,160 | 4,232,559 | 19.53% |
| Show ignored | 22,079,029 | 17,751,839 | 4,327,190 | 19.60% |

Selected changes in that show-ignored comparison:

- Search attributes fell from 4,630,353 to 48,586 bytes (98.95%). The 688 full corpora became 1,149 small supplemental attributes.
- Titles fell from 3,286,732 to 3,117,806 bytes. Removing 6,556 titles saved 168,926 bytes, just 5.14% of title bytes.
- New scoped associations cost 367,637 bytes. The controller grew by 2,036 bytes. These are selected components, not a complete byte-accounting equation. The table reports net savings after all changes.

The [historical content checks](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L223) found 1,595 prompt previews, 399 full-prompt blocks and 6,844 exact copy values byte-identical per report. They don't establish that later output remains byte-identical.

The show-ignored DOM element count increased from 322,522 to 324,342. This phase reduced serialized duplication, not DOM size. Measured gzip bytes fell from 2,655,711 to 1,944,121, but gzip delivery wasn't part of this phase. The later delivery work belongs to [WI-018](../work-log.md#wi-018).

**Documented:** [historical browser measurements](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L225) reported roughly 232-258 ms for instrumented indexing and 3.2-6.5 ms for synchronous queries. They describe that Windows/Chromium run, exclude paint time and aren't a before/after speedup claim. No numeric size or latency threshold was agreed.

### Deferred renderer ideas

The [deferred experiment](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L229) and [later opportunities](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L313) aren't implementation approval. [WI-012](../work-log.md#wi-012) remains the separate compact-evidence research item, not a new child created by this migration.

| Idea to keep | Constraint or reason to wait |
| --- | --- |
| Shared artifact catalog, deduplicated evidence records and one reusable evidence-table renderer | First prove that the records remove repeated content. A nested table isn't inherently a blocker, and helper/template reuse alone doesn't reduce DOM nodes. |
| Render details on demand or try virtualization | Search the complete records independently of open panels. Keep exact paths, workspace attribution, diagnostics, table navigation, accessibility and copy behavior. |
| Compare plain compact JSON before embedded compressed JSON | Don't replace duplicate HTML with duplicate JSON. Keep offline CSP and clear no-JavaScript/failure behavior. WI-018 wraps conventional HTML instead of implementing this redesign. |
| Consolidate repeated storage explanations, share path references, reduce `data-copy` duplication, or simplify source-table wrappers/classes | Keep caveats discoverable and exact redacted copy values recoverable without prefix, formatting or whitespace corruption. These change presentation beyond redundant-title removal. |
| Measure any later design across several costs | Compare delivered bytes, startup/decompression, query latency, peak memory and expanded DOM. A smaller payload alone doesn't justify the redesign. |

## Validation and limits

- **Observed here, 261104:** selected synthetic [search-helper and renderer tests](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/test/detailed-search.test.ts#L7) checked tooltip rules, supplements, recognized-credential redaction, aggregate paths and removal of full search corpora.
- The [controller case](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/test/detailed-listing-controller.test.ts#L321) checked full prompt text, words across fragments, artifact/diagnostic terms, reference isolation, excluded labels and cache reuse. Related selected cases checked filters, navigation, comparison, ignored evidence and the [rendered CSP](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/test/detailed-listing.test.ts#L11).
- The [focused runner](../temp-tool-output/261104-1459-wi017/run-focused.ps1) fixes the selected cases and uses the repository's cache-isolating wrapper. [Results](../temp-tool-output/261104-1459-wi017/focused-results.log) are Git-ignored local evidence and may be absent from another checkout.
- Controller tests use a synthetic DOM, not a real browser. No live inventory, browser review, size/performance remeasurement, full verification or build ran for this migration. Product code didn't change.
- Graph coverage reported changed file metadata. Current claims use direct source reads at the named clean code revision. The archive has the same Git blob at the historical and current commits.
- No new findings or children were filed. Existing Inbox lines and WI-018 were left unchanged.

## References

- [Old task #35 and implementation commits](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L374), [historical research and decisions](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L206), and [original private receipt links](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L227). Original private reports and browser receipts weren't rerun or reopened for this migration.
- [HTML report design guide](../docs/HTML-REPORT-DESIGN.md#page-behavior), [current search rules](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/docs/SPEC.md#L174), [WI-016 listings](WI-016-offline-listings.md), [WI-012 renderer research](../work-log.md#wi-012), and [WI-018 compressed reports](../work-log.md#wi-018).
