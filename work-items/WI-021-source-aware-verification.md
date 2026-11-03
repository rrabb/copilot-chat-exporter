# WI-021: Source-aware verification

Canonical entry: [WI-021](../work-log.md#wi-021). The dashboard owns status and next actions.

## At a glance

- Goal: compare recorded conversation content with the export without claiming complete losslessness.
- Local and agent chats use separate source extractors and a shared text scorer.
- Layer D checks presence, eligible message order and missing repeated occurrences.
- Local joined-line checks also cover some short fragments.
- Reasoning snapshots and tool fields don't all have an independent order check.
- Linked text companions can contribute to the content check.
- Persisted Local resource bodies aren't independently checked. See [WI-006](WI-006-persisted-resource-clipping.md).
- Layer A checks Local tool identities independently. Other layers have limits on independence.
- A missing parser is reported and fails strict verification.
- Parser and seeded fuzz tests cover Markdown structure. They don't prove every input is safe.
- The 261102 review corrected the old Layer D "presence only" description.
- A historical scoring comparison reported an improvement. It wasn't rerun here.
- The old tool-call gap remains a separate question in [WI-025](../work-log.md#wi-025).
- The parser's outdated install hint is tracked in [WI-032](../work-log.md#wi-032).
- Rejected: a generic missing-whitespace detector and one flattened order sequence (see [Decisions](#decisions-and-tradeoffs)).
- Work tree: 0 of 1 children done. [WI-032](../work-log.md#wi-032) is the open follow-up.

## Original goal

Old item #10 called for source-aware verification and a schema census for agent chats, serialization checks, and continued Local journal regression checks. The agreed result was a useful check of the approved content scope, not a guarantee that every recorded field is exported. See the [pinned old root log](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L351) and the [archive](../work-log-archive.md#source-aware-follow-up-approved-design-implemented-and-validated-with-explicit-limits).

## Done when

- Local and agent checks report missing or partial eligible text and check order and repeats where the source supports those comparisons.
- Local journal identity and render checks, agent schema drift, and parser checks have regression coverage.
- Reviewed records with no tool content get a missing-data representation. Unexpected content remains visible for review.
- Parser and deterministic fuzz tests exercise malformed Markdown and serialization boundaries.
- Decisions, evidence limits and independent follow-ups are recorded without a losslessness claim.

## Work tree

Progress as of 261103: 0 of 1 children done.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-032 Parser install hint](../work-log.md#wi-032) | [build] | S | - |

The unfinished child's who and size are proposed estimates for the dev to confirm. The build item doesn't approve implementation.

**Related, not children:** [WI-025](../work-log.md#wi-025) investigates the old tool-call gap. [WI-030](../work-log.md#wi-030) covers independent verification of persisted resource text after WI-029.

## Current understanding

**Inferred from current source at `a0e5a9a`:** these checks cover different steps and don't all have the same independence.

| Check | What the code does and its limit |
| --- | --- |
| Local journal and render | [Layer A](../src/verify/layers.ts#L298) derives tool IDs from raw journal records and accounts for replaced request slots. It doesn't replay deeper edits inside a request. [Layer B](../src/verify/layers.ts#L50) compares requests with parsed turns but shares classification helpers and compares the first response text. [Layer C](../src/verify/layers.ts#L444) checks render markers and inline unknown-response JSON, not complete source fidelity. |
| Local text | [Layer D](../src/verify/loss-account.ts#L157) extracts text from replayed requests. It checks prompt and prose order and repeats, plus joined lines containing some short fragments. Reasoning snapshots and tool fields get presence accounting rather than a general sequence check. |
| Agent text | [The agent extractor](../src/verify/sdk-loss-account.ts#L26) groups eligible prompt, reasoning, prose and tool-intent order by main or agent scope. It keys tool arguments by scope and call ID. Tool fields and companion text aren't treated as one event-order sequence. |
| Text scoring | [The scorer](../src/verify/loss-account.ts#L356) reports present, partial and absent pieces. It fails on unaccounted pieces, eligible order errors or missing repeats, and caches exact searches during one scoring call. A match can occur elsewhere in the export, so present isn't proof that every placement is right. |
| Missing or unreviewed content | [The classifier](../src/session/classify.ts#L325) accepts a no-content tool marker only for a bounded set of reviewed fields. Unexpected fields or unrepresented content fall back to unreviewed JSON. The [journal census](../src/session/journal.ts#L377) records unhandled kinds. |
| Verification modes | [Local failure rules](../src/verify/json-report.ts#L87) and [agent failure rules](../src/verify/json-report.ts#L140) fail text loss with or without `--strict`. Strict also fails on unhandled kinds and early fence closes. [A missing parser](../src/verify/parser-check.ts#L46) is skipped in ordinary mode and fails strict mode. |
| Saved files and images | With a file argument, [Local](../src/cli.ts#L380) and [agent](../src/sdk-cli.ts#L118) verification read the given Markdown and linked companions. Without one, they check a generated preview. [Image verification](../src/verify/images.ts#L110) separately compares recorded image hashes with linked companion bytes. It isn't a general binary or resource-body check. |
| Parser, fuzz and corpus | [The parser](../src/verify/parser-check.ts#L30) loads `markdown-it` on demand. [Seeded fuzz tests](../test/fuzz.test.ts#L19) use a parser oracle. The [corpus runner](../scripts/verify-corpus.mjs#L188) uses frozen inputs by default and supports live inputs separately. |

**Recorded 261102:** the former [AGENTS.md](../AGENTS.md#project-map) claim that Layer D checks presence only was stale. The project map and [SPEC 9.1](../docs/SPEC.md#91-audit-architecture-independence-model) now describe its order, repeat and joined-line checks. These checks apply only to the eligible categories above.

**Known limits:** Layer D doesn't independently read persisted Local resource bodies. Short or otherwise ineligible text can be unchecked. Overlapping text and a match in the wrong location can make a result ambiguous. Opaque data isn't covered by text accounting. See [WI-006](WI-006-persisted-resource-clipping.md) and [SPEC 9.1](../docs/SPEC.md#91-audit-architecture-independence-model).

## Decisions and tradeoffs

| Approach | Decision and reason |
| --- | --- |
| Generic missing-whitespace detector | Rejected. Local records don't identify the producer or fragment boundary well enough, and the checked VS Code writer can join Markdown without a separator. A separator-free join alone isn't proof of loss. See the [archive](../work-log-archive.md#item-3-adjacent-text-semantics-research). |
| One flattened order and repeat sequence | Rejected after false positives. Local snapshots and merged tools don't have the same sequence as rendered messages. Agent child scopes and companions aren't emitted in raw event order. Source-aware groups replaced this approach. See the [archive](../work-log-archive.md#source-aware-follow-up-approved-design-implemented-and-validated-with-explicit-limits). |
| Blanket exceptions for partial matches | Not approved. The [old proposal](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L144) called for evidence for each exception. Current failure rules accept no category-wide clipping or command-echo exception. |
| Parser dependency | `markdown-it` was approved for verification and tests, not as a bundled runtime dependency. The [manifest](../package.json) pins it as a development dependency, and the [build](../scripts/build.mjs#L26) leaves packages external. |

## Findings and outcomes

### Historical results, not rerun

The [261021 frozen-corpus report](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L92) recorded 110 sources and 101,425 checked text pieces, with none partial or absent. That is a report about its captured inputs and eligible checks, not proof that all source content was kept. This review didn't open the private corpus.

The [same-renderer scoring comparison](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L94) reported 61,614 ms before and 17,755 ms after, about 3.47 times faster in one pair. Current source still caches searches, but this review didn't rerun or independently validate that benchmark.

The [archive](../work-log-archive.md#source-aware-follow-up-approved-design-implemented-and-validated-with-explicit-limits) records a 1,040 versus 1,039 Local tool-ID mismatch. The current request-slot regression passes, but whether it fixes that exact historical case remains unknown. [WI-025](../work-log.md#wi-025) owns that question.

### Parser install hint

**Observed here, 261103:** a synthetic missing-parser result tells the reader to run `npm install`. The [install guard](../scripts/require-pnpm.mjs) rejects a synthetic npm user agent and says to use pnpm. No installer ran. The hint is a separate follow-up in [WI-032](../work-log.md#wi-032), related to the [pnpm migration](WI-026-pnpm-migration.md). This doesn't change the completed verification scope.

## Notes

### 261103 - source review and synthetic checks

Focused synthetic verifier, parser, fuzz, image, classifier, corpus-runner and saved-file checks passed with isolated temp and cache paths. The [focused checks](../temp-tool-output/wi-021-261103-011227/focused-tests.log), [saved-file check](../temp-tool-output/wi-021-261103-011227/sdk-file-test.log), [classifier and corpus checks](../temp-tool-output/wi-021-261103-011227/classification-corpus-tests.log), and [install-hint probe](../temp-tool-output/wi-021-261103-011227/parser-hint.log) are local-only receipts. They don't establish current real-corpus results or a current performance measurement.
