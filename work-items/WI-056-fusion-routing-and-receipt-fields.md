Part of WI-054, found while working on: mapping observed Fusion fields to exporter handling and test assertions.

# WI-056 Fusion routing and receipt fields

Canonical entry: [WI-056](../work-log.md#wi-056).

## At a glance

- **Goal:** choose and test handling for seven observed fields in two event families the exporter already recognizes.
- **Evidence:** the saved WI-054 inventory, current parser code and independent synthetic field probes.
- **Approval, 261114:** the developer selected the focused handling/core-edge golden profile and permits extending the existing related source/tests.
- **Next:** combine product documentation with WI-055, refresh the field-to-assertion evidence and run final integration checks. The field implementation passed independent review.
- **Separate concern:** WI-055 owns new event names. This item owns new fields within recognized names.

## Findings, 261114

| Family and fields | Observed occurrences | Behavior when found |
| --- | --- | --- |
| `session.fusion_resolved.data.selectedRuleId` | Seven records across three physical sources | The reader reports an unrecognized field. The routing note doesn't keep its value. |
| `session.usage_record.data.usage.websocketFallbackAfterMs`, `websocketFallbackErrorKind`, `websocketFallbackReason`, `websocketFallbackReconnectAttempted`, `websocketFallbackStartedThisCall`, `websocketFallbackStatusCode` | At least one of these fields occurs in 81 distinct physical receipt records across five sources. Status code occurs in 16 records. | The reader reports all six keys as unknown. Normalized telemetry doesn't keep their values. Known financial counters can still be counted. |

These are physical record counts, not deduplicated model calls or independently charged usage.

**Initial source audit:** the [Fusion reader](../src/session/sdk-fusion.ts) consumed `ruleId`, not `selectedRuleId`. Its unread-key check diagnosed the latter. The [receipt allowlist](../src/session/sdk-usage-record.ts) didn't include the six websocket fields. The implementation below resolves these initial gaps.

**Observed here:** independent invented-value probes reproduce both gaps. A receipt with all six extra fields still keeps a known positive nano-AIU amount. This isn't evidence that any particular native receipt was billed successfully, and it doesn't establish the meaning of every extra field.

## Representative review and approved policy

The bounded native review and independent coordinator read confirm the following. These sample counts supplement the full census, rather than replace it.

| Evidence | Finding and limit |
| --- | --- |
| Four routing records | Both `ruleId` and `selectedRuleId` are present and differ in every reviewed pair. Don't treat one as an alias or replacement. The selection algorithm remains unknown. |
| 37 of the 81 websocket-bearing receipt records | Status code is present in 16 and absent in 21. Both `websocketFallbackStartedThisCall` booleans occur. Reconnect-attempted is false throughout this sample. |
| Defensive boundaries | Zero timing/status, null values and true reconnect-attempted weren't observed in the selected sample. Test them as synthetic boundaries, not native examples. |

| Field | Proposed handling | Acceptance check |
| --- | --- | --- |
| `selectedRuleId` | Existing optional string reader, rendered under **Selected rule ID**, separate from **Rule ID**. | Assert distinct simultaneous values in the exact routing record. Test one/both absent, equal/empty strings and invalid types. |
| `websocketFallbackAfterMs`, `websocketFallbackStatusCode` | Existing finite nonnegative number validation. Don't invent an HTTP-only range or integer requirement. | Keep recorded/synthetic zero. Invalid values diagnose without erasing valid siblings. |
| `websocketFallbackErrorKind`, `websocketFallbackReason` | Existing string telemetry helper, without restricting values to observed spellings. | Assert the exact named entries and future string values. |
| `websocketFallbackReconnectAttempted`, `websocketFallbackStartedThisCall` | Literal boolean telemetry. Don't coerce strings, numbers or null. | Keep false and true. Absence adds no entry and isn't zero or null. |

**Archive limit:** this approval covers compatibility, not complete receipt archival. The receipt parser keeps the new fields in telemetry after implementation. They reach the selected usage calls when receipts win. A preferred ledger can replace that call set. The current Markdown cost table doesn't print every telemetry field. A readable per-call archive, including evidence from nonselected sources, needs a separate design.

Keep ledger/receipt/legacy priority, accounting deduplication/conflict handling, detached ownership, unknown counters and credit conversion unchanged. A retry or status field doesn't create a billed call, prove success or make usage free.

## Implementation review, 261114

The worker added the selected-rule label and six keys through existing typed readers. Independent source/test inspection found no further correction needed. The new tests assert separate/equal/empty/absent rule IDs, exact telemetry entries, false/zero values, malformed fields with valid siblings kept, and diagnostics for future fields. Existing financial selection and ownership tests remain unchanged.

The saved first run fails on the six intended regression assertions. A later run exposed a new test's wrong parsed-turn property. The worker corrected that test setup, not the existing behavior tests. The coordinator independently reran the focused Fusion/receipt/privacy checks and both typechecks. At this review boundary, the other 21 protected implementation files matched their earlier hashes.

Evidence belongs under `temp-tool-output/261114-1719-fusion-implementation/slice-a/`, including the before/after logs and `coordinator-validation.log`. This completes the field implementation review, not the documentation/matrix/final-validation work or developer acceptance. Parsed telemetry still isn't a full per-call Markdown archive.

The combined B2 product documentation has since passed independent review. It covers separate rule labels, six typed websocket fields, source priority and the per-call archive limit. Bounded matrix refresh and final integration still precede acceptance. See [WI-055's B2 review](WI-055-new-agent-event-families.md#b2-independent-review-261114).

The subsequent bounded mapping links all seven fields to current source/tests. Integrated goldens, full verification and generated build passed independent checks. Review separate rule IDs, literal telemetry values and the per-call archive limit before accepting this item. See [WI-054's final handoff](WI-054-fusion-census-and-golden-fixtures.md#final-integration-and-acceptance-handoff-261114).

## Options and tradeoffs

| Option | Benefit | Cost or risk |
| --- | --- | --- |
| Keep useful values through existing note/provenance helpers | Avoids losing routing/debugging evidence and follows existing parsing patterns. | Requires reviewed labels, value validation, tests and a decision about Markdown visibility. |
| Deliberately exclude specific debug fields | Keeps output smaller. | Needs an approved omission rule and counts. Don't silently mark unknown fields handled. |
| Keep the current diagnostics temporarily | No behavior change while policy is reviewed. | Values remain absent from normalized notes/calls. A passing existing suite isn't evidence of support. |

Don't add a whole-record JSON bundle or change ledger/receipt/legacy priority to fix these fields. Per-call telemetry visibility is a separate archive-policy choice, not a financial reconciliation fix.

## Evidence and reproduction

- [WI-054 coverage review](WI-054-fusion-census-and-golden-fixtures.md#coverage-review-261114).
- Private full matrix and field probes: `temp-tool-output/261114-0130-fusion-matrix/`.
- Independent reviewer script/result: `temp-tool-output/261114-0024-fusion-coordination/review-matrix.mjs` and `matrix-review-02.private.json`.
- The private matrix retains source-line references and handling/assertion evidence. That first field review used saved inventory, without native reads.
- Later representative observations and proposals: `temp-tool-output/261114-1612-fusion-representatives/`. The coordinator's `coordinator-review.mjs` checks all 164 targeted records against the four original census prefixes. `coordinator-review.private.json` records the successful independent result. No full logs or native prose were saved.

## Done when

- Review the observed fields and producer context using a small representative set.
- Choose whether each field is rendered, kept as parsed provenance or deliberately excluded.
- Obtain approval before production changes or new exclusions.
- Add exact-field positive/negative assertions and update the WI-054 matrix.
- Keep known amounts, unknown counters and source priority unchanged.
- Run relevant verification and request developer acceptance before closure.
