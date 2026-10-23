# WI-004: Fidelity-policy research

Canonical entry: [WI-004](../work-log.md#wi-004).

## Original goal

Keep meaningful recorded content available without hiding omissions or exposing secrets. Legacy #15/#16 combined delivered Local text fixes with broader metadata, omission and redaction policy. Recovering that policy doesn't authorize implementation.

## Done when

**Proposed research criteria, requiring owner confirmation:** distinguish implemented behavior from approved intent, compare feasible metadata/remainder strategies, reconcile threshold evidence, define omission/redaction accounting and exclusions, and obtain an owner decision or recorded deferral. Implementation of flags isn't a research completion criterion. The historical umbrella doesn't establish whether all policy questions must close together.

## Current understanding

**Documented:** the user paused policy item 2 for further research while source-aware text verification proceeded. The [deferral](../work-log-archive.md#item-2-fidelity-policy-decision-deferred) identifies two different scopes: expose schema-aware unrendered fields already held by parsed models, or compare raw Local/SDK records against per-kind field allowlists. The latter could detect more missing fields but costs more maintenance, output and independent verification.

The [current SPEC](../docs/SPEC.md) records policy intent: opt-in `--high-fidelity` for extra JSON, visible default omissions, and `--no-redact` for disabling exporter text redaction. These aren't evidence that those flags are wired. Existing [policy helpers](../src/export-policy.ts) include `ExportPolicy`, `planMetadataText` and defaults. The archived integration gap remains evidence to recheck before any implementation plan, not a claim that every current text path lacks redaction.

Dedicated conversation text isn't extra metadata. Prompts, answers, readable reasoning, tool input/output and failure evidence must not be dropped under an extra-fields policy. An ordered generic JSON fallback for unknown responses is existing preservation work, not completion of a general high-fidelity mode.

| Category | Recorded rule or evidence | Boundary |
| --- | --- | --- |
| Substantive tool text | Current SPEC: over 300 lines **AND** over 15 KiB gives a ten-line preview and complete companion | Not permission to clip conversation content |
| Unknown response JSON | Current SPEC: over 300 lines **OR** over 15 KiB moves to a companion; census/strict review remains | Different overflow path, not extra-metadata approval |
| Extra metadata | Historical owner decision: over 100 lines, ten-line preview and full JSON companion. Current SPEC instead says the shared 300-line/15-KiB threshold | Decision evidence for that metadata change remains unresolved |
| Persisted resources | Separate exporter rendering limit | Investigation belongs to [WI-006](WI-006-persisted-resource-clipping.md), not this topic |

Do not resolve the metadata discrepancy by copying the tool-text decision. Existing helper behavior also doesn't prove approval.

## Important decisions and tradeoffs

| Decision or alternative | Meaning and consequence |
| --- | --- |
| Approved policy intent | Extra fields are opt-in, default omissions visible, text redaction applies across Markdown and companion text |
| Deferred integration | User requested more research, not immediate flag implementation |
| Schema-aware remainder | Smaller and easier to explain, but can't recover fields already discarded during parsing |
| Raw-field accounting | Wider coverage, but per-kind maintenance and duplication risks need research |
| Whole-record JSON | Rejected as the general answer: duplicates conversation and conflicts with the raw-source-bundle non-goal |
| Redaction accounting | Category/count/location diagnostics must not reveal values. Regex detection isn't comprehensive protection |
| Binary/opaque exclusions | Metadata and omission reasons, not invented readable reasoning. Recorded images have their own delivered companion policy |
| Source limitations | Missing backings, incomplete tails, migration and compaction can constrain originals. Don't count every absence as exporter loss |

## Key findings and outcomes

Local text fixes, unknown-response fallback and source-aware checks progressed separately from policy research. Earlier proposed generic text-boundary detection was replaced by source-specific handling, not a license to reconstruct missing text. Recorded image bytes are handled separately from text redaction; images can still contain private information.

**Return to goal:** useful groundwork exists, but policy intent, current wording and implementation must be reconciled before changes. Keep complete permitted text, accountable omissions and privacy as separate requirements rather than calling an export byte-lossless.

### Owner decisions still needed

- Confirm research completion criteria and whether the umbrella should remain together.
- Choose the remainder-accounting scope and supported field families.
- Reconcile extra-metadata overflow approval and representation without borrowing another category's threshold.
- Agree default notice/end-report detail, accounting categories, and redaction behavior across every textual artifact.
- Decide handling of unsupported semantics and unavailable source evidence without inventing content.

## References

- [Historical confirmed decisions](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#confirmed-user-decisions): policy intent, including the original metadata threshold.
- [Loss register](../work-log-archive.md#loss-register-and-decisions-still-required): categories and exclusions, not current implementation status.
- [Deferral and alternatives](../work-log-archive.md#item-2-fidelity-policy-decision-deferred), [SPEC](../docs/SPEC.md), and [policy groundwork](../src/export-policy.ts): reconcile before implementation.
