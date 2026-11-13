# WI-042: Fusion and future selection modes

Canonical entry: [WI-042](../work-log.md#wi-042).

## At a glance

- Goal: distinguish selection mode, selected model, answering model and effort in listings and exports.
- The dev reports that Fusion can use different models across turns.
- The dev reports that detailed listings already show the underlying model, Auto and effort for a Fusion chat.
- Initial labels/effort reports were not reproduced. WI-053 now has a frozen-input diagnosis and implementation proposal from the WI-052 Fusion sample.
- Existing listing evidence separates selected model, answering models, Auto and one effort value.
- The parsed listing turn has no separate selection-mode field.
- Unknown answering-model IDs can populate filters without a fixed model list.
- That doesn't prove that an unknown selection mode is kept or displayed.
- Investigate Local journals and agent event formats separately. Don't assume they encode modes the same way.
- Keep mode-level and model-level effort separate if the data records both.
- Don't infer Fusion from model switches or multiple answering models.
- Research first. Agree on labels and filters after identifying the recorded evidence.
- Initial research estimate: 2-4 hours, with implementation effort unknown until the fields are understood.
- Next: review WI-053's export plan first. Keep broad label/filter research separate and do not infer mode effort from a synthetic model ID.

## Original goal

Find how Copilot Fusion records selection mode, models and effort. Propose accurate per-turn labels, HTML filters, timelines and export output. Check how unknown future modes behave before claiming forward compatibility.

## Done when

- Map the recorded fields and their sources using approved, redacted evidence or synthetic fixtures.
- Distinguish selected and answering models, mode and model effort, missing values and per-turn changes where the records allow it.
- Test current behavior for a Fusion example and an unknown future mode without altering real session data.
- WI-053 may start from the approved retained WI-052 capture. Propose a disposable Fusion chat with harmless prompts if controlled evidence is still needed.
- Check parsing, unknown-field handling, HTML filtering, model timelines and Markdown exports. Report kept, ignored or missing information.
- Propose readable labels and filters, identify separate implementation jobs, and record the dev's choice or deferral.

## Current understanding

### Work tree

Progress as of 261113: 0 of 1 child items done. WI-053 has a diagnosis and implementation proposal for developer review.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-053 Agent Host Fusion export compatibility](WI-053-agent-host-fusion-export-compatibility.md) | [research] | S | - |

The developer approved this focused High-priority child on 261113. It owns the retained failure evidence and diagnosis. Broad listing labels, filters and future-mode behavior remain here.

### Agent Host evidence from WI-053

**Observed here, 261113:** [WI-053's frozen-input diagnosis](WI-053-agent-host-fusion-export-compatibility.md#findings-from-the-frozen-capture-261113) found recorded `hydrafusion`/`hydrafusion-max` selections, `single`/`cascade` patterns, model roles and per-phase reasoning effort. It separates three problems: unsupported phase content, recorded children without parent calls, and persisted usage not read by the existing event fallback.

The proposal extends the current SDK path. It does not create a Fusion provider, infer mode from model switches, or approve new listing filters. Treat the selected synthetic model ID and per-phase model effort as separate recorded facts. A separate mode-effort field remains unverified.

The developer chose a labelled separate section for identifiable child conversations whose parent calls are missing. WI-053 records the choice. Implementation still needs approval.

### Initial source review

Inferred from current source, reviewed 261103 at baseline `306498246c6714f6d496e6a045991889dbf79ad0` with uncommitted WI-041 changes. Links below refer to working files.

| Code | Finding | Limit |
| --- | --- | --- |
| [ListingTurnEvidence](../src/session/listing-evidence-types.ts) | Stores `selectedModel`, `models`, `auto` and `effort`. | No separate selection-mode field. One effort value can't establish two distinct effort settings. |
| [localListingTurn](../src/session/listing-evidence.ts) | Reads request `modelId`, round model IDs, `resolvedModel` and reasoning effort. Auto recognition matches an ID ending in `auto`. | Doesn't establish how Fusion is represented. |
| [sdkListingTurns](../src/session/listing-evidence.ts) | Reads session selection settings and answering models from assistant messages. | Parent settings and child settings need separate checks. Fusion fields are unknown. |
| [Detailed listing](../src/session/detailed-listing.ts) | Displays selected models, answering models, Auto and effort. Model filters use recorded answering-model IDs. | Doesn't provide a separate mode filter. Inspect timelines, search and comparison behavior during research. |
| [listingModelLabel](../src/session/listing-preview.ts) | Formats known model names and falls back to the last component of an unfamiliar model ID. Raw IDs populate model-filter values. | Tolerating a model ID doesn't establish support for an unfamiliar mode or its metadata. |
| [Journal parser](../src/session/journal.ts) | Copies selected request fields including `modelState`, `modeInfo` and `result`. | Those fields aren't confirmed Fusion evidence. Unlisted request fields aren't automatically copied by this list. |

At the initial 261103 review, no Fusion session, native store or private corpus was read for this item. The 261113 WI-052 survey later encountered six Fusion event families and reproduced a real Agent Host export failure. [WI-053](WI-053-agent-host-fusion-export-compatibility.md) records that evidence and its limits. An official Fusion schema and the model/effort field meanings remain unverified.

## Decisions and tradeoffs

The dev requested this WI on 261103. On 261113, the dev approved WI-053 using the retained research evidence. That approval does not authorize implementation or broader listing changes.

| Approach | Assessment |
| --- | --- |
| Separate tags for mode, selected model, answering model and effort | Recommended direction, subject to recorded fields and a sample review. |
| A label such as `copilot fusion-high-opus-low` | Keep as the dev's example of information to convey, not a chosen format. Without field meanings, two effort values could be confused. |
| Infer Fusion from different answering models | Reject as an identification rule. Model switching alone doesn't establish the selection mode. |
| Add a hard-coded list of known modes and discard everything else | Reject as a proposed design. Research a readable unknown-mode fallback that keeps available evidence and reports limits. |

## References

- [WI-041](WI-041-listing-labels.md), where the dev raised this separate request.
- [Dashboard Inbox](../work-log.md#inbox), including the older answering-model idea. Don't merge that idea without checking whether the sources and requested behavior match.
