# WI-006: Persisted-resource clipping

Canonical entry: [WI-006](../work-log.md#wi-006).

## Original goal

Keep recorded substantive tool output available in a portable archive. This item investigates the separate persisted-resource limit and prepares an owner decision, not remediation implementation.

The [original resource audit](https://github.com/rrabb/copilot-chat-exporter/blob/22a2f5d9b51f84f73b41da7c40186b79b3bb406d/work-log.md#L941) found an exporter rendering limit, not an upstream storage limit. It did not approve a replacement size or remedy.

## Done when

1. Characterize relevant persisted-resource categories and rendering behavior.
2. Establish threshold, Unicode excerpt, resource association, and accounting behavior with bounded synthetic cases.
3. Distinguish observed or potential information loss from untested possibilities.
4. Document alternatives, benefits, costs, risks, and repercussions.
5. Record an owner decision or explicit deferral/acceptance disposition.

Remediation implementation is not required to close this investigation. If approved and independently meaningful, remediation may receive a separate WI. This documentation promotion doesn't run the synthetic investigation or decide preservation/redaction policy.

## Current understanding

**Inferred from source at `180a06c`:** [resource loading](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/src/session/enrich.ts#L35) reads the complete resource as UTF-8. [Resource rendering](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/src/markdown.ts#L155) applies redaction and image-data replacement, then compares that text's UTF-8 length with `96 * 1024` bytes. The exporter owns this rendering threshold. Neither the loader nor the surviving storage evidence establishes an upstream 96 KiB cap.

Below the threshold, Markdown resources use Markdown rendering and other resources use a text fence. Above it, the renderer uses the first and last `48 * 1024` JavaScript string units and labels them as KiB excerpts. These are UTF-16 code-unit slices, not UTF-8 byte slices. A threshold crossing therefore doesn't alone establish how much unique content is omitted. Non-ASCII input can also invalidate the stated excerpt budget. No synthetic reproduction was run for this documentation promotion.

The omission notice links the original resource path; this branch doesn't create a complete portable text companion. The separate [inline tool-text path](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/src/markdown.ts#L254) can create companions, but it doesn't repair this resource branch. A resource can be optional to journal replay while still containing meaningful recorded output.

**Observed here on October 22, 2026, metadata only:** the referenced frozen manifest contains 45 resource records, all with sizes, maximum 84,918 bytes, and zero above 98,304 bytes. The older tracked audit covered 37 files across four resource directories in 81 Local journals, also maximum 84,918 bytes. These are different inventories. Neither exercises the limit or proves clipping harmless. No actual cap-triggered corpus loss has been established. Resource bodies and native stores were not reopened.

## Important decisions and tradeoffs

The approved inline tool-text threshold is over 300 lines **AND** over 15 KiB. Unknown response payload overflow uses **OR**. Neither decision automatically changes extra-metadata policy or this persisted-resource branch. Metadata policy remains with [WI-004](../work-log.md#wi-004).

| Open approach | Benefit | Cost or risk to investigate |
| --- | --- | --- |
| Keep all permitted resource text inline | Portable body without another file | Large archives and reader costs |
| Preview plus complete redacted companion | Bounded inline context while keeping text | Companion identity, links, write failures, and verification must be covered |
| Keep a deliberate clipping limit | Bounded resource display | Omission needs approval and accounting; original-path links aren't portable preservation |

These are alternatives, not decisions. The general preservation concern does not authorize cap removal, unredacted export, or a new numeric limit.

## Key findings and outcomes

The historical investigation already checked surviving resource sizes, identifier compatibility, UTF-8 validity, and NUL absence. Ordinary Node UTF-8 loading can replace invalid bytes; its read-error catch is not binary detection. Read failures, unsupported identifiers, absent optional files, and binary resources remain separate concerns.

[Layer D text accounting](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/src/verify/loss-account.ts#L327) consumes journal requests, not an independent list of persisted resource bodies. Its all-present result cannot prove complete resource preservation. Image hash checks are a separate guarantee, not a substitute for a resource-text check.

**Return to goal:** threshold ownership is established, but clipping impact and preservation/redaction policy remain open. Return characterized behavior, evidence limits, and alternatives to the owner for a decision or deferral/acceptance disposition. Don't turn this investigation into remediation, a general cache redesign, or report-size work.

## References

- [Current resource audit and policy questions](../work-log-archive.md#optional-resource-checks): historical observations and decision limits.
- [Rendering branch](../src/markdown.ts#L155), [loader](../src/session/enrich.ts#L35), and [loss accounting](../src/verify/loss-account.ts#L327): implementation evidence.
- [Frozen manifest](../reports/corpus/frozen-approved-snapshot-final-20261021.json): October 21 evidence, aggregate sizes checked October 22 without opening payloads. SHA-256 `15dc09c7593ad202dec0e6cf4ff963af6928beed0a6a58a0215bc0fbb39bbd64`. Not a portable fixture; absence later is an evidence gap, not permission to substitute a different corpus.
