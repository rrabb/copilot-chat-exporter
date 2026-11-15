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
- The [public reference check](#public-fusion-reference-check-261113) found official workflow descriptions, generated SDK event types and VS Code replay tests. They guide synthetic scenarios but don't establish every version's persisted format.
- Initial research estimate: 2-4 hours, with implementation effort unknown until the fields are understood.
- Next: the developer reviews WI-053's completed implementation and documented limits. All four phases are independently reviewed. Full verification passes after the approved privacy-link cleanup. Keep broad label/filter research separate and do not infer mode effort from a synthetic model ID.

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

Progress as of 261113: 0 of 1 child items done. WI-053's four implementation phases are independently reviewed and await developer acceptance. It isn't closed. Frozen-source, usage, golden, build, built-CLI and full verification checks pass after approved privacy-link cleanup.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-053 Agent Host Fusion export compatibility](WI-053-agent-host-fusion-export-compatibility.md) | [build] | L | - |

The developer approved this focused High-priority child on 261113. It owns the retained failure evidence and diagnosis. Broad listing labels, filters and future-mode behavior remain here.

### Agent Host evidence from WI-053

**Observed here, 261113:** [WI-053's frozen-input diagnosis](WI-053-agent-host-fusion-export-compatibility.md#findings-from-the-frozen-capture-261113) found recorded `hydrafusion`/`hydrafusion-max` selections, `single`/`cascade` patterns, model roles and per-phase reasoning effort. It separates three problems: unsupported phase content, recorded children without parent calls, and persisted usage not read by the existing event fallback.

The proposal extends the current SDK path. It does not create a Fusion provider, infer mode from model switches, or approve new listing filters. Treat the selected synthetic model ID and per-phase model effort as separate recorded facts. A separate mode-effort field remains unverified.

The developer chose a labelled separate section for identifiable child conversations whose parent calls are missing. All four WI-053 implementation phases are approved. Worker configuration must be verified before launch, and neither item is closed.

### Public Fusion reference check, 261113

The public sources describe more than the earlier [WI-052 online search](notes/WI-052/online/report.md) established. That search's Fusion gap is not evidence that public workflow descriptions or replay logic are unavailable.

| Source | What it establishes | Limit |
| --- | --- | --- |
| [Official GitHub Fusion documentation, pinned source](https://github.com/github/docs/blob/d59b2631959db46d71ca5f7748ec04311c6d0870/content/copilot/concepts/models/copilot-fusion.md) | **Documented:** Single uses one model. Cascade drafts, judges and may escalate. Critique drafts, runs independent critics in parallel, combines feedback and revises. Patterns can change per prompt. Fusion doesn't start subagents. | Describes intended behavior, not an exhaustive persisted-event sequence. |
| [Copilot SDK event definitions](https://github.com/github/copilot-sdk/blob/cf045793958ce674259c557f7769788f94ee20c9/nodejs/src/generated/session-events.ts#L855) and [streaming reference](https://github.com/github/copilot-sdk/blob/cf045793958ce674259c557f7769788f94ee20c9/docs/features/streaming-events.md) | **Inferred from source:** phase kinds include `primary`, `judge`, `repair`, `draft`, `critic`, `revision` and `follow_up`. Scopes are `root` and `review`. Projection modes are `append`, `staged` and `none`. **Documented:** persisted and ephemeral events have different replay behavior. | This snapshot targets CLI `1.0.112-0`, newer than the frozen S017 producer `1.0.103-unstable.r41379698026.g3219c66`. The definitions are experimental. |
| [VS Code Fusion replay](https://github.com/microsoft/vscode/blob/4347d45a5a71e1d3c20a953ff727fbc3a4c6b2d1/src/vs/platform/agentHost/node/copilot/copilotFusionReplay.ts) and [request correlation](https://github.com/microsoft/vscode/blob/4347d45a5a71e1d3c20a953ff727fbc3a4c6b2d1/src/vs/platform/agentHost/node/copilot/copilotFusionEventIdentity.ts) | **Inferred from source:** routing can precede its user message. Workflow turn IDs needn't match agent-loop turn IDs. Replay uses request ownership and durable ancestry, and rejects stale or cancelled ownership. | UI replay is not the exporter's archive policy. A phase shown as a child chat isn't proof of a delegated SDK subagent. |
| [VS Code synthetic event helpers](https://github.com/microsoft/vscode/blob/4347d45a5a71e1d3c20a953ff727fbc3a4c6b2d1/src/vs/platform/agentHost/test/node/copilotFusionTestEvents.ts) and [history replay tests](https://github.com/microsoft/vscode/blob/4347d45a5a71e1d3c20a953ff727fbc3a4c6b2d1/src/vs/platform/agentHost/test/node/mapSessionEvents.test.ts#L155) | **Inferred from tests:** scenarios cover review output, phase tools and message chunks, early routing, interruption, cancellation, delayed events and root/subagent separation. | These are component tests. The helpers can reuse event IDs, and tests can omit parts of a workflow. Don't copy them unchanged as valid complete persisted sessions. |

#### Consequences for synthetic fixtures

- Start with Single, both Cascade decisions, and Critique with parallel critics. Include changes of pattern across turns.
- Add scenarios for scopes, projection modes, phase text/tool ownership, chunk identity, routing fallback, interruption and delayed events after cancellation. Check each scenario against its version and persistence rules.
- Keep `parentId` ancestry, `agentId` scope, workflow IDs and tool-call ownership separate. Don't turn live-only progress into normal persisted input without evidence that the producer saved it.
- Don't copy UI omissions into archive expectations. VS Code tests deliberately hide some private or provisional phase text, while this exporter keeps recorded phase content.
- Classify scenarios as observed in frozen records, supported by upstream references but not yet observed, or hypothetical defensive cases. Every observed variant still needs a handling decision and coverage.

The checked SDK TypeScript file doesn't contain `session.usage_record` or the older commit/checkpoint/handoff event names observed here. These sources therefore don't establish those persisted formats. The planned [fixed-window census](../work-log.md#inbox) remains necessary to map actual versions, private records and combinations. No native census or fixture implementation ran during this reference check.

Public captures are kept under `temp-tool-output/261113-2350-fusion-upstream-research/`. The pinned links above identify the sources without relying on a changing default branch.

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

At the initial 261103 review, no Fusion session, native store or private corpus was read for this item. The 261113 WI-052 survey later encountered six Fusion event families and reproduced a real Agent Host export failure. [WI-053](WI-053-agent-host-fusion-export-compatibility.md) records that evidence and its limits. The public reference check above now establishes published workflow descriptions and event types for a pinned SDK snapshot. Cross-version persistence and the mapping of mode effort to native fields still need evidence.

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
