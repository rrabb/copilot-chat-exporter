# WI-042: Fusion and future selection modes

Canonical entry: [WI-042](../work-log.md#wi-042).

## At a glance

- Goal: distinguish selection mode, selected model, answering model and effort in listings and exports.
- The dev reports that Fusion can use different models across turns.
- The dev reports that detailed listings already show the underlying model, Auto and effort for a Fusion chat.
- Neither report was reproduced here. Fusion's stored fields and their meaning are unknown.
- Existing listing evidence separates selected model, answering models, Auto and one effort value.
- The parsed listing turn has no separate selection-mode field.
- Unknown answering-model IDs can populate filters without a fixed model list.
- That doesn't prove that an unknown selection mode is kept or displayed.
- Investigate Local journals and agent event formats separately. Don't assume they encode modes the same way.
- Keep mode-level and model-level effort separate if the data records both.
- Don't infer Fusion from model switches or multiple answering models.
- Research first. Agree on labels and filters after identifying the recorded evidence.
- Initial research estimate: 2-4 hours, with implementation effort unknown until the fields are understood.

## Original goal

Find how Copilot Fusion records selection mode, models and effort. Propose accurate per-turn labels, HTML filters, timelines and export output. Check how unknown future modes behave before claiming forward compatibility.

## Done when

- Map the recorded fields and their sources using approved, redacted evidence or synthetic fixtures.
- Distinguish selected and answering models, mode and model effort, missing values and per-turn changes where the records allow it.
- Test current behavior for a Fusion example and an unknown future mode without altering real session data.
- The first step needs a disposable Fusion chat the dev makes with harmless prompts, so no real chat is read.
- Check parsing, unknown-field handling, HTML filtering, model timelines and Markdown exports. Report kept, ignored or missing information.
- Propose readable labels and filters, identify separate implementation jobs, and record the dev's choice or deferral.

## Current understanding

Inferred from current source, reviewed 261103 at baseline `306498246c6714f6d496e6a045991889dbf79ad0` with uncommitted WI-041 changes. Links below refer to working files.

| Code | Finding | Limit |
| --- | --- | --- |
| [ListingTurnEvidence](../src/session/listing-evidence-types.ts) | Stores `selectedModel`, `models`, `auto` and `effort`. | No separate selection-mode field. One effort value can't establish two distinct effort settings. |
| [localListingTurn](../src/session/listing-evidence.ts) | Reads request `modelId`, round model IDs, `resolvedModel` and reasoning effort. Auto recognition matches an ID ending in `auto`. | Doesn't establish how Fusion is represented. |
| [sdkListingTurns](../src/session/listing-evidence.ts) | Reads session selection settings and answering models from assistant messages. | Parent settings and child settings need separate checks. Fusion fields are unknown. |
| [Detailed listing](../src/session/detailed-listing.ts) | Displays selected models, answering models, Auto and effort. Model filters use recorded answering-model IDs. | Doesn't provide a separate mode filter. Inspect timelines, search and comparison behavior during research. |
| [listingModelLabel](../src/session/listing-preview.ts) | Formats known model names and falls back to the last component of an unfamiliar model ID. Raw IDs populate model-filter values. | Tolerating a model ID doesn't establish support for an unfamiliar mode or its metadata. |
| [Journal parser](../src/session/journal.ts) | Copies selected request fields including `modelState`, `modeInfo` and `result`. | Those fields aren't confirmed Fusion evidence. Unlisted request fields aren't automatically copied by this list. |

No Fusion session, native store or private corpus was read for this item. No official Fusion schema was checked. The dev's observations are leads, not verified storage facts.

## Decisions and tradeoffs

The dev requested this WI on 261103. Research is recorded for later. No Fusion implementation or real-session inspection is approved in the compact-console phase.

| Approach | Assessment |
| --- | --- |
| Separate tags for mode, selected model, answering model and effort | Recommended direction, subject to recorded fields and a sample review. |
| A label such as `copilot fusion-high-opus-low` | Keep as the dev's example of information to convey, not a chosen format. Without field meanings, two effort values could be confused. |
| Infer Fusion from different answering models | Reject as an identification rule. Model switching alone doesn't establish the selection mode. |
| Add a hard-coded list of known modes and discard everything else | Reject as a proposed design. Research a readable unknown-mode fallback that keeps available evidence and reports limits. |

## References

- [WI-041](WI-041-listing-labels.md), where the dev raised this separate request.
- [Dashboard Inbox](../work-log.md#inbox), including the older answering-model idea. Don't merge that idea without checking whether the sources and requested behavior match.
