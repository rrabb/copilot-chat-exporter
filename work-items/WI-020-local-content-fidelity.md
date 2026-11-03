# WI-020: Local content fidelity

Canonical entry: [WI-020](../work-log.md#wi-020). The dashboard owns status and next actions.

## At a glance

- Goal: keep the approved Local conversation text, tool input and error evidence readable in exports.
- The delivered slice covers named Local text fixes, not every possible fidelity defect.
- Supported warning, confirmation, question, request-error and tool-error text is handled.
- Distinct terminal input is kept. An equivalent command echo isn't repeated as input.
- Long tool text uses a preview and complete companion after redaction, not the old fixed byte clip.
- Same-ID terminal continuations show new output and changed details without repeating earlier output.
- Unknown response records get an ordered JSON fallback and stay visible to the schema census.
- The original Local plan also named distinct reasoning. No later decision to drop that goal was found.
- A synthetic check found that different thinking IDs can become one rendered reasoning block.
- The same check showed Layer D reporting both reasoning texts present. It didn't test real chats.
- [WI-033](../work-log.md#wi-033) will research identity, position and a trustworthy check.
- The 96 KiB persisted-resource limit and its follow-ups belong to [WI-006](WI-006-persisted-resource-clipping.md).
- Extra metadata, omission reporting and redaction policy belong to [WI-004](WI-004-fidelity-policy-research.md).
- Rejected: a generic missing-whitespace detector and one flattened order sequence.
- Rejected: whole-record JSON as the general fidelity answer. The old 24 KiB tool-text clip was replaced.
- Work tree: 0 of 1 children done. Estimates need the dev's confirmation.

## Original goal

The [pinned old root log](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L356) combined Local preservation fixes with broader metadata and omission policy. The [earlier approved plan](../work-log-archive.md#export-phase-assessment-october-14-proposal-awaiting-approval) named distinct reasoning among the Local defects. The [later Local continuation](../work-log-archive.md#approved-october-16-continuation) completed the listed text and tool-input fixes, but didn't record a decision to drop the reasoning goal.

This topic records that delivered slice and the later terminal-continuation work. It doesn't claim that the broader old goal, `--high-fidelity`, `--no-redact`, or all metadata handling is complete. [WI-033](../work-log.md#wi-033) tracks the reasoning question. [WI-004](WI-004-fidelity-policy-research.md) owns the deferred policy questions. Source-aware verification has its own record in [WI-021](WI-021-source-aware-verification.md).

## Done when

- Supported Local warnings, confirmations, questions, request errors and tool errors reach readable output.
- Distinct terminal input is kept, and equivalent command input isn't duplicated.
- The approved tool-text preview and complete-companion rule replaces the old fixed byte clip.
- Same-ID terminal carryovers show new output and changed details without merging unrelated calls.
- Unknown response payloads remain visible for review, and remaining limits are recorded separately.

These criteria describe the delivered slice, not a guarantee of complete Local content preservation.

## Work tree

Progress as of 261103: 0 of 1 children done.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-033 Local reasoning identity](../work-log.md#wi-033) | [research] | M | - |

The child's who and size are proposed estimates for the dev to confirm. Research doesn't approve an implementation.

**Related, not children:** [WI-004](../work-log.md#wi-004) covers fidelity policy. [WI-006](../work-log.md#wi-006) covers persisted-resource clipping and its follow-ups. [WI-021](../work-log.md#wi-021) covers source-aware verification.

## Current understanding

**Inferred from source at `a0e5a9a8ab60b313108e88b61f648f0b05cc297f`:** the linked source and tests match that commit. These observations don't prove every record variant is handled.

| Area | Current behavior and limit |
| --- | --- |
| Local response text | The [classifier](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/session/classify.ts#L165) handles supported warning, confirmation, question-carousel, vulnerability and tool-error records. [Request errors](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/session/journal.ts#L365) are recorded and [rendered after the response](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/markdown.ts#L887). Malformed or unknown records can fall back to unreviewed JSON. |
| Terminal input | The [renderer](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/markdown.ts#L459) suppresses input that equals the normalized command, while different input remains. The [tests](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/test/markdown.test.ts#L540) cover both cases. The archive corrected the earlier diagnosis: distinct input had been suppressed, and the verifier also compared a different JSON representation. |
| Tool-text companions | [Tool text](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/export-policy.ts#L73) moves to a companion when it exceeds both 300 lines and 15 KiB. The preview has the first ten lines. Without a companion sink, [the renderer](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/markdown.ts#L253) keeps the full text inline. Redaction happens before tool text reaches this rule. |
| Unknown records | [Unreviewed response JSON](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/markdown.ts#L589) uses a separate overflow rule: over 300 lines **or** over 15 KiB. This doesn't settle the extra-metadata threshold in WI-004. |
| Terminal continuation | [The renderer](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/markdown.ts#L717) compares earlier-turn calls with the same ID. It emits an appended suffix or the full replacement when output isn't a prefix. It also keeps changed fields and status. [Tests](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/test/markdown.test.ts#L69) cover continuations, replacements, changed status, different IDs and same-turn entries. |
| Independent text check | [Layer D](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/verify/loss-account.ts#L327) checks terminal increments by call ID across requests. Its reasoning check accounts for text presence, not independent occurrence or position. A text match alone isn't proof of correct placement. |
| Persisted resources | A [separate renderer branch](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/markdown.ts#L157) still clips resources over 96 KiB. The inline tool-text companion rule doesn't cover that branch. WI-006 records synthetic loss, the chosen direction and separate follow-ups. |

### Local reasoning identity

**Observed here:** a [synthetic probe](../temp-tool-output/wi-020-261103-013512/reasoning-probe.mts) supplied two thinking records with different IDs and assistant text between them. When their text was identical or one was a prefix of the other, the parsed body had one reasoning block instead of two. In both cases, a direct Layer D check reported both reasoning texts present and `failed: false`. A control with different non-prefix text kept both blocks. The same-ID prefix control also produced one block.

The [classifier](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/session/classify.ts#L165) builds a thinking node from text without its recorded ID. The [journal parser](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/session/journal.ts#L210) collapses prefixes and [filters repeated thought text](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/session/journal.ts#L355). The [reasoning extractor](https://github.com/rrabb/copilot-chat-exporter/blob/a0e5a9a8ab60b313108e88b61f648f0b05cc297f/src/verify/loss-account.ts#L194) checks presence without a reasoning order or repeat group.

The probe shows a lost synthetic record boundary and position. It doesn't establish that a real conversation lost a distinct thought, or how every writer uses thinking IDs. The [earlier audit](../work-log-archive.md#confirmed-preservation-defects-and-verification-gaps) reported 15 candidate requests, not 15 proven real losses. That corpus wasn't rechecked here. Research must distinguish genuine updates from separate blocks before proposing a correction.

## Decisions and tradeoffs

| Approach | Decision and reason |
| --- | --- |
| Delivered slice and reasoning follow-up | On 261103, the dev chose to keep the completed Local fixes separate from WI-033. The broader original reasoning goal remains unresolved. This doesn't approve an implementation or decide how thinking IDs should be interpreted. |
| Generic missing-whitespace detector | Rejected. Saved Local fragments don't identify their producer and boundaries well enough. The checked VS Code writer can join Markdown without a separator. See [boundary research](../work-log-archive.md#item-3-adjacent-text-semantics-research). |
| One flattened order and repeat sequence | Rejected after false positives. Local snapshots and merged tools, agent scopes and companions don't share one rendered sequence. Source-aware checks replaced it. See [WI-021](WI-021-source-aware-verification.md#decisions-and-tradeoffs). |
| Fixed 24 KiB tool-text clipping | Replaced because it omitted substantive text. The [old implementation](https://github.com/rrabb/copilot-chat-exporter/blob/b3c75b65e11280cd95a97822037766435962c418/src/markdown.ts#L30) used a byte cap. The [approved companion rule](../work-log-archive.md#phase-0-and-phase-1-slice-1-october-14) keeps the processed text available instead. This doesn't remove the separate resource limit. |
| Terminal deduplication by matching text alone | Not adopted. Different IDs or same-turn entries can be distinct calls. The implemented continuation logic uses identity and an earlier turn instead. |
| Whole-record JSON for general high fidelity | Rejected because it duplicates the conversation and conflicts with the raw-source-bundle non-goal. This is a policy decision, not a delivered WI-020 feature. See [WI-004](WI-004-fidelity-policy-research.md#important-decisions-and-tradeoffs). |

The existing text-wide reasoning collapse is still in the code. Its replacement and the meaning of recorded IDs aren't decided by these other choices.

## Findings and outcomes

- The old root log's [four-carryover pending note](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L396) is stale. The later [receipt](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L47) and commit [`b1bcb61`](https://github.com/rrabb/copilot-chat-exporter/commit/b1bcb6142afe534039e5e691f0fb04148ec76ec2) record the terminal-delta work. That commit is an ancestor of the inspected source.
- The archive reported 3,571 tool inputs present across 83 indexed Local journals after the approved fixes. That historical run wasn't repeated here. Presence accounting doesn't establish correct reasoning placement or resource completeness.
- Focused parser, classifier, renderer, policy and loss-account tests passed with isolated cache and temporary paths. Full verification passed with Edge after Chrome failed to publish a debugger port. See [Notes](#261103---synthetic-reasoning-and-focused-checks).
- The completed Local slice advances readable playback. WI-033 records the synthetic reasoning case without treating the broader reasoning goal as resolved.

## References

- [Old #15 and #16](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L356), [Local continuation](../work-log-archive.md#approved-october-16-continuation), and [historical loss register](../work-log-archive.md#confirmed-preservation-defects-and-verification-gaps).
- [WI-021](WI-021-source-aware-verification.md), [WI-004](WI-004-fidelity-policy-research.md), and [WI-006](WI-006-persisted-resource-clipping.md) own related checks, policy and resource decisions.

## Notes

### 261103 - Synthetic reasoning and focused checks

Two different thinking IDs with identical or prefix text each produced one parsed reasoning block, while Layer D reported both texts present. The same-ID and different-text controls ran alongside them. The ignored local [probe](../temp-tool-output/wi-020-261103-013512/reasoning-probe.mts), [probe output](../temp-tool-output/wi-020-261103-013512/reasoning-probe.log), and [focused-test output](../temp-tool-output/wi-020-261103-013512/focused-tests.log) contain synthetic inputs and receipts; they may not exist in another checkout.

The initial [full verification](../temp-tool-output/wi-020-261103-013512/verify.log) stopped when Chrome didn't publish its debugger port. A focused browser retry and [full verification with Edge](../temp-tool-output/wi-020-261103-013512/verify-edge.log) passed, including the golden check. The Chrome failure's cause is unknown. [WI-008](../work-log.md#wi-008) tracks an earlier browser timeout; no connection between the failures was established. These runs used isolated user, cache and temporary paths, not real sessions or the private corpus.
