# WI-022: Frozen captures, cache, and cleanup

Canonical entry: [WI-022](../work-log.md#wi-022).

## Original goal

Make export verification repeatable against the inputs actually exported. Live active-chat logs changed during comparisons, so apparent losses and before/after differences could not reliably establish exporter behavior.

The goal expanded through approved necessary work: keep the selected evidence, verify the file actually saved, reduce unrelated private capture data, and manage retention safely. It did not become a promise to solve every fidelity-policy or storage-format question.

## Done when

- Corpus and single-chat verification use fixed captured inputs, including required supplemental data and database consistency.
- Saved-file verification reads persisted Markdown and linked companions against the same capture, without silently substituting live sources.
- Selected captures, retention/receipts, replacement, and approved cleanup work safely across Local and SDK paths.
- Tests isolate their caches, and scoped validation supports the delivered behavior.

The repeatability criterion comes from the original objective. Saved-file checking, capture reduction, and safe cleanup were later approved additions. These criteria describe the delivered boundary, not the initial task verbatim. The [dashboard](../work-log.md#wi-022) owns its current status. Independent policy and evidence follow-ups do not reopen it.

## Current understanding

**Documented and inferred from source at `180a06c`:** corpus inputs freeze before discovery. Each file has size and SHA-256 evidence; SQLite backup includes committed WAL data. A fixed-length log read prevents a running session from extending the copy indefinitely. An incomplete final record without a terminating newline can be omitted with a notice. Invalid preceding records and complete-but-invalid final records still fail.

Captures are consistent per file, not globally atomic across logs and databases. Trimming keeps one replay log and records original/replay hashes and sizes, rather than storing a second complete `.recorded` log. Changes during capture are reported; frozen comparison results are not discarded merely because the live original grows.

Local exports keep the journal and supplemental inputs the renderer uses: selected index metadata, resources, transcript, model catalog, workspace metadata, and relevant user/repository/session Markdown memories. This replaces the earlier entire workspace database. Captured hashes are checked before replay; provenance still names original locations.

SDK discovery reads live identity/index mappings, then captures the selected event log, selected identity/index data, and usage rows for the backing session, including child agents. A small SQLite file holds those rows from a read-only transaction. Unrelated sessions/tables and broad catalog/state copies are excluded. A missing usage source/table keeps the recorded-event fallback.

Normal export verifies persisted staged Markdown and linked companions before publishing the normal destination. Success removes the source capture unless `--keep-source` was requested. Failure keeps evidence and exits nonzero; it must not replace an earlier successful archive. Later saved-file verification needs the same selector and retained capture. A not-kept receipt distinguishes intentional deletion from a missing kept copy. Neither case permits a silent switch to current live sources.

## Important decisions and tradeoffs

| Choice and approval boundary | Reason and consequence |
| --- | --- |
| Freeze before comparison; implemented in `2e404d1` | Changing live inputs prevented causal comparison. Per-file captures keep repeatability without claiming a global transaction. |
| Verify saved SDK files; implemented in `7e410f6` | Regeneration had checked new output instead of the supplied file. Historical success from that path is not saved-file integrity evidence. |
| Narrow selected captures; approved and implemented in `c09bffa` | Broad snapshots copied unrelated private data and cost time/disk. Selected metadata must still keep identity, usage fallback, and required enrichment. |
| Default verify/delete, optional `--keep-source`; implemented | Limits routine retained private data. Later file verification requires opting to keep the source. Failures keep it automatically. |
| Persistent platform cache, overridden by `CCE_CACHE_DIR`; approved and implemented | Avoids routine temp cleanup. It doesn't protect against manual removal or every OS policy. |
| Preview before deletion, default No, corpus opt-in; approved and implemented | Earlier cleanup could delete before showing targets. Automation must pass `--yes`; no terminal without it deletes nothing. |
| Legacy temporary captures remain report-only | Missing ownership evidence is not permission to migrate or delete existing directories. |

Cleanup reports exact paths, kinds, bytes, age, and affected exports before approval. `--dry-run` never deletes. `--include-corpus` is required for registered retained corpus snapshots. After approval, cleanup rechecks ownership identity, age selection, active producers/readers, and link safety. Captures and linked receipts are removed together. Borrowed corpus snapshots are not owned by a single-chat export and cannot be deleted by its disposal path.

Platform defaults are documented in the [private source-cache guide](../README.md#private-source-cache). Native stores are invalid capture destinations. Tests use isolated `CCE_CACHE_DIR` roots. Their full-run guard fingerprints real and legacy cache locations and fails if they change. This documentation promotion didn't access those locations.

## Key findings and outcomes

The work resolved several blockers that otherwise invalidated the original goal:

- Local replay initially captured the journal but could read later live supplemental memory. Capturing the required supplemental inputs fixed the synthetic regression.
- SDK verification regenerated Markdown and could miss edits or missing companions in the supplied file. Verification now checks saved bytes. SDK shell parsing also dropped arguments beyond the command; the same work kept shell IDs and other recorded arguments.
- Default cleanup removed captures after failed verification or saved-file read errors. Failure ownership/retention now protects evidence even if writing its receipt fails.
- Preview, fall-through, and error paths leaked owned SDK captures. Ownership distinguishes newly allocated captures from borrowed retained corpus inputs.
- Initial broad SDK captures kept approximately 1.51 GB in the measured case. Selected capture was approximately 153 MB, 89.89% smaller in that same-source comparison. This is one historical measurement, not a universal reduction.
- Unsafe cleanup deleted before inventory/confirmation. Approved behavior now previews and requires approval, rechecks readers, and protects unknown or linked entries.

The chronology contains apparently conflicting proposals and completion statements. The approved safety receipt supersedes earlier “not implemented” cache-location/confirmation proposals. Earlier “success keeps capture” wording predates the approved default-delete/`--keep-source` policy.

### Scoped validation receipts

These are October 21, 2026 historical receipts, not tests rerun for this documentation promotion.

| Scope and revision context | Recorded result | Limit |
| --- | --- | --- |
| Approved `c09bffa` implementation and `507c905` docs [snapshot receipt](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L39) | 584 tests, typechecks, golden, build; implementation bundle passed 31 bundled CLI checks | Supports those cumulative snapshots, not every later change |
| Approved implementation's [frozen comparison](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L41), repeated by the [later diagnostics receipt](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L15) | 110 sources, 101,425 text pieces, zero partial/absent; Local images 114/114 and SDK images 124/124 | Recorded corpus coverage, not all optional resource bodies or unknown variants |
| Same retained input set, [hash receipt](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L41) | 1,102 copied files / 1,501,298,661 bytes matched recorded hashes before and after | Capture integrity for that evidence set, not a global live-store transaction |
| Final same-renderer scorer pair, `6ab166a` optimization recorded by `ee564f9`; [measurement receipt](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L94) | 61,614 ms versus 17,755 ms, about 3.47x; compared results unchanged | One bounded pair. The scorer cache was a necessary performance detour, not a guaranteed speedup |

Later diagnostics/demo validation reached different totals. It belongs with [WI-023](../work-log.md#wi-023), not an accumulated test total for this item. Corpus source IDs now derive from normalized original paths. A run-local label is not a durable identity across reports.

### Return to goal and remaining limits

Frozen inputs, genuine saved-file checking, selected retention, and approved cleanup satisfy the original repeatability/lifecycle outcome. Performance work kept that workflow usable without changing matching thresholds. Narrowing reduced unrelated capture data without abandoning required evidence.

This does not establish byte-lossless export. Text redaction, missing optional stores, opaque data, persisted-resource clipping, and verification coverage limits remain distinct. Captures remain private and can be manually removed. Earlier regenerated-file checks do not prove old Markdown was repaired. Missing required source evidence causes an error rather than a live-source substitution.

Related independent work remains visible: [manual acceptance](../work-log.md#wi-003), [fidelity policy](../work-log.md#wi-004), [resource clipping](../work-log.md#wi-006), and [historical tool-identity closure](../work-log.md#wi-025). WI-003 covers legacy listing/browser/print checks. The reviewed completion receipts identify no remaining capture/cache-specific acceptance gate. Image presentation differs from the delivered byte companions in [WI-024](../work-log.md#wi-024).

## References

- [Current specification](../docs/SPEC.md#9-verification-run-this-every-time-the-script-changes) and [source-cache guide](../README.md#private-source-cache): current behavior, not a second spec here.
- [Capture/replay/receipts](../src/session/source-snapshot.ts#L53), [SDK selection](../src/session/sdk-capture.ts#L99), [cleanup](../src/session/source-cache.ts#L327), and [CLI confirmation](../src/cli.ts#L221): implementation.
- [Capture tests](../test/source-snapshot.test.ts), [cache tests](../test/cache.test.ts), and [isolation tests](../test/cache-isolation.test.ts): assertions read, not executed.
- [Approved safety and later receipts](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#current-status): chronology, validation scopes, and private evidence references.
- [Frozen-input commit](https://github.com/rrabb/copilot-chat-exporter/commit/2e404d1), [saved-file correction](https://github.com/rrabb/copilot-chat-exporter/commit/7e410f6), and [selected-capture/safety commit](https://github.com/rrabb/copilot-chat-exporter/commit/c09bffa): change history.
