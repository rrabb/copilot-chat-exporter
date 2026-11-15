Part of WI-054, found while working on: mapping the complete Fusion census to exporter handling and test coverage.

# WI-055 New agent event families

Canonical entry: [WI-055](../work-log.md#wi-055).

## At a glance

- **Goal:** keep and test four event families found in real Fusion sources but unrecognized at the initial audit.
- **Evidence:** the fixed-window WI-054 census, family-recognition probe and bounded native representative review.
- **Approval, 261114:** the developer selected the focused handling/core-edge golden profile, including these event notes and full readable reviewed catalog groups.
- **Scope:** WI-056 and B1 passed independent review. Next: B2 retry/catalog notes and combined product documentation. No default catalog exclusion, new billing or broader per-call archive.
- **Limit:** selected native records establish observed payloads, not a complete cross-version specification.

## Observed gap, 261114

| Family | In-window records | Recognition when audited | Approved handling to implement |
| --- | --- | --- | --- |
| `assistant.fusion_phase_failed` | 1 | Unhandled | Keep error text, metadata and degradation relationship with independent content checks. |
| `instruction.update` | 2 | Unhandled | Keep full redacted instruction content and authority/lifetime/boundary metadata. |
| `model.turn_retry` | 33 | Unhandled | Keep distinct retry notes and readable reviewed catalog groups, without creating usage calls. |
| `session.mode_notice_delivered` | 2 | Unhandled | Keep mode and persistence metadata as a separate note. |

Counts are record occurrences across the 19 qualifying physical sources, not unique operations or usage calls. Do not silently add an exclusion or weaken strict verification to hide these gaps.

At the initial audit, the [builder](../src/session/sdk-session.ts) reported these four names as unknown in its schema census. The saved probe confirmed that gap. It didn't establish whether their source text appeared elsewhere or what every strict CLI invocation did. The reviewed B1 implementation now handles three families. B2 owns the remaining retry family.

## Representative findings and proposed handling

The approved four-source review included the failed phase, both instruction updates, both notices and three of the 33 retries. The coordinator independently checked their saved fields against the exact original census prefixes. No full event logs, instruction text or error bodies were saved.

| Family | Observed here | Proposed readable output |
| --- | --- | --- |
| Failed phase | Judge/review failure with reason, full error text in the source, phase usage and a degradation target matching the later repair/final phase. | A failure note with identities, model/effort, role/scope, status/reason, duration, target and full redacted error text. Phase usage stays summary metadata, never another billed call. |
| Instruction update | Nonempty content plus authority, lifetime, boundary, fallback and name. Recorded configuration describes persistent runtime instructions. | Keep the full redacted instruction body and metadata as a note. Don't deduplicate equal names or treat the body as executable instructions to the exporter. |
| Retry | Model/reason, recorded local turn index zero, numeric timestamp and configured model catalog. | Keep each retry separately, including reason, local index, time and readable model metadata. Local turn zero isn't user turn Q0 or zero usage. Catalog prices aren't charges. |
| Mode notice | Mode string and `instructionUpdatePersisted` boolean. No instruction/notice body in the observed payload. | A metadata note with both values. Don't infer that a UI was seen, instructions reached a model, or a mode change succeeded. |

For failed errors and instruction bodies, add independent raw-field text checks for scope, order, multiplicity, redaction and linked overflow content. A retry reason needs its own text expectation if archived as text. Metadata requires direct assertions beyond the text verifier.

### Retry catalog tradeoff

The worker initially proposed a counted exclusion for catalog details. The coordinator measured the three selected `modelInfo` objects: each is **1,409 bytes when compactly reserialized as JSON**, with identical values. This isn't their on-disk substring or rendered Markdown size. Other retry catalogs haven't been sized.

This sample doesn't justify calling the catalog large or dropping it by default. The project aims for near-lossless archives. **Prefer readable retention of the reviewed catalog groups**, with configured billing rates labelled as configuration. Keep all retry records distinct. Unknown catalog fields must still diagnose.

Counted exclusion remains an unchosen alternative requiring separate developer approval, named omitted groups, an exact counting rule and a visible explanation. Repeated catalog values alone don't prove the snapshot is redundant elsewhere. No exclusion or deduplication is approved.

The coordinator also found that the initial handoff `sourcePresent`/`targetPresent` flags checked completed phases only. A failed judge is still a recorded phase. Its absence from the completed list isn't missing source evidence. The worker corrected this interpretation in `review-corrections.private.json`. The coordinator verified all seven handoffs against their scoped phase witnesses.

The same amendment withdraws the catalog-exclusion recommendation. Its four readable groups cover all 60 observed descendant paths/types in the selected retry catalog: identity/provider, availability/endpoints, capabilities and configured billing. The coordinator independently checked that grouping. Future fields remain diagnostic, and this isn't a claim about every retry catalog in the census.

### Acceptance checks for implementation

- Keep valid sibling fields when another field has an invalid type. Keep missing, null, false and zero distinct.
- Keep error/instruction/reason text complete through redaction and the existing companion rules. Loss, corruption, reordering and duplicate required evidence must fail independent checks.
- Keep separate updates, notices and retries in stream order. Don't infer relationships from adjacency.
- Keep envelope agent scope and existing detached ownership. Don't use nested catalog IDs or a model-loop index to assign a user turn.
- Don't add retry, phase-summary or configured-price amounts to selected financial usage.
- Unknown event/payload variants must remain diagnostic. Recognizing a family name isn't complete field support.

## Implementation order, 261114

1. **B1:** failed-phase, instruction-update and mode-notice notes, their metadata assertions and independent text checks. Reuse typed field validation without weakening accepted Fusion handling.
2. **B2:** distinct retry notes with the full reviewed readable catalog groups, metadata/text checks and combined product documentation for WI-055/WI-056.

The coordinator reviews each return before assigning the next slice. This split keeps the content/verifier work separate from the catalog parser without changing the approved policy. No native reads or new goldens are needed during these slices. Final matrix refresh, integrated verification and developer acceptance remain later steps.

### B1 independent review and correction gate

The worker returned typed notes for the three B1 families, an unchanged extracted field reader and independent raw-field checks. Its focused/regression runs pass, but the coordinator reproduced a presentation regression that those assertions missed.

For one instruction update followed by one recorded user message, the new ordering helper creates a synthetic first turn. The archive claims two user requests, numbers the real request Q2 and reports an unavailable start despite the real prompt timestamp. Avoiding usage on the untimed turn doesn't fix those counts or numbering.

**Approved correction, 261114:** the developer permits extending the existing WI-053 edits in [types.ts](../src/types.ts) and [markdown.ts](../src/markdown.ts), while keeping earlier work. Keep pre-prompt notes separate from user requests, wire their rendering and add count/number/date/ownership regressions. The Local golden must remain unchanged. Return this correction for independent review before B2.

Independent reproduction: `temp-tool-output/261114-1719-fusion-implementation/slice-b1/coordinator-prelude-check.mts` and `coordinator-prelude-before.private.json`. It uses invented events and an empty supplied ledger, not native stores. The result supplements, rather than replaces, the worker's `handoff.private.json`.

**Correction reviewed, 261114:** optional `prePromptNotes` now holds recorded notes outside user turns. Root, selected-child, nested and detached rendering use the full note renderer, including redaction, companions and image warnings. Notes-only SDK exports have zero user requests. Real questions keep their numbering, timestamps and usage ownership. Older pending notes also move to this collection, so SDK consumers must read both it and turn bodies. This representation change needs the B2 migration documentation.

The coordinator independently reran the stricter reproduction and the focused/shared-renderer checks, both typechecks and the unchanged Local golden. A clean existing SDK test expected both system versions inside the first turn. The worker strengthened it to require the first prefix version, later turn version, distinct links and both full companion bodies. This changed the assertion for the intentional representation correction, not production behavior to appease a test.

B1 is accepted for integration, not work-item closure. Reviewed evidence includes `coordinator-prelude-after-02.private.json`, `coordinator-prefix-focused.log`, `coordinator-prefix-regression.log` and the worker's `correction-01/` and `correction-02/` handoffs under the B1 folder. The next worker boundary is `accepted-source-baseline.json`. B2, matrix refresh, goldens and final verification/build remain outstanding.

### B2 independent review, 261114

Retry notes now keep the reviewed catalog groups, full reasons and distinct stream positions. Independent source/test inspection checked nested field diagnostics, real empty versus unsupported containers, scope isolation, live companion links and unchanged financial selection. The coordinator constructed invented values from all 60 saved catalog path/type rows. All were accepted without unsupported-field diagnostics, and every unique string/number appeared in parsed notes and Markdown. Exact labelled tests separately cover the boolean fields and group placement.

The coordinator independently reran affected/shared regressions, both typechecks, privacy checks and the unchanged Local golden. The ten changed originals are within B2 ownership; the other 19 accepted B1 files match byte-for-byte. Combined product documentation now records the prefix migration, configuration-versus-charges distinction and bounded receipt visibility. No implementation correction was needed after this review.

B2 is accepted for integration, not closure or global schema completeness. Evidence is under `temp-tool-output/261114-1719-fusion-implementation/slice-b2/`: `handoff-01.private.md`, `coordinator-regressions.log`, `coordinator-catalog-review.mts`, `coordinator-catalog-review.private.json` and the new 30-file `accepted-source-baseline.json`. Goldens, bounded matrix refresh and final verification/build remain before developer acceptance.

### Integrated checks complete, 261114

The subsequent SDK core/edge goldens, bounded mapping and final verification/build passed independent review. Exact saved-file companion checks now use the disk reader, not a manually supplied replacement. Full reason/error/instruction evidence, distinct retries and unknown financial counters remain checked. See [WI-054's acceptance handoff](WI-054-fusion-census-and-golden-fixtures.md#final-integration-and-acceptance-handoff-261114).

**Accepted and closed, 261115:** the developer accepted the notes, complete reviewed catalog groups, SDK prefix migration and bounded coverage limits. Independent integrated checks completed the Done-when criteria. No default catalog exclusion or new financial source was added.

## Evidence and reproduction

- [WI-054 native findings](WI-054-fusion-census-and-golden-fixtures.md#native-census-findings-261114).
- Private event counts and results: `temp-tool-output/261114-0024-fusion-coordination/event-coverage.private.json` and `family-dispositions.private.json`.
- Independent probe: `temp-tool-output/261114-0024-fusion-coordination/check-event-families.mts`. Its first run used the wrong builder signature. The corrected run passes both the all-events and scoped-events arguments.
- [Public SDK definitions](https://github.com/github/copilot-sdk/blob/cf045793958ce674259c557f7769788f94ee20c9/nodejs/src/generated/session-events.ts) describe the experimental durable phase-failure event. Match producer versions before applying newer fields.
- Representative observations, policy proposal and saved-evidence validation: `temp-tool-output/261114-1612-fusion-representatives/`.
- Independent native-prefix checks and catalog measurement: `coordinator-review.mjs` and `coordinator-review.private.json` in that folder.
- Final corrected proposal and independent saved-evidence checks: `review-corrections.private.json`, `coordinator-corrections-check.mjs` and `coordinator-corrections-check.private.json` in that folder.

## Done when

- Inspect the recorded payload variants and confirm where their evidence does or doesn't reach an export.
- Choose and document a policy for each family, keeping unknown meanings labelled.
- Obtain approval for production changes or new exclusions.
- Add synthetic positive/negative checks and update the WI-054 coverage matrix.
- Run relevant verification and request developer acceptance before closure.
