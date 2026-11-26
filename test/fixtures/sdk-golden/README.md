# Synthetic SDK/Fusion goldens

These fixtures test SDK and Fusion exports with invented chat events. Each saved expected archive is a golden. Tests compare rendered Markdown and companion files byte for byte.

The regular `pnpm test` command and final `pnpm run verify` run `test\sdk-golden.test.ts`. The separate `pnpm run golden` command still checks the unchanged Local fixture.

Each active archive also tests `readLinkedArchiveCompanions` using its saved `archive.md` path. The fixed `archive_assets_fixture` folder follows the disk reader's archive-stem prefix rule. Tests compare the companion files read from disk, including their exact bytes. They also check missing or corrupt disk evidence with the independent raw-field verifier.

## Purpose and evidence

Every prompt, prose body, ID, model, producer label and financial amount is invented. The inputs weren't sanitized from a real chat. These structural observations don't reconstruct missing native prose or prompt ordering.

| Input | Evidence class | Purpose and limit |
| --- | --- | --- |
| `coreEvents()` | Observed successful structures, synthetic scaffolding | Five workflows appear in reviewed physical order: critique draft-final, critique revision-final, single primary-final, cascade literal `accept` primary-final, and cascade literal `reject` repair-final. Each critique has one completed critic. The build and policy context is invented. The inputs don't infer a settings-change cause or parallel execution. |
| `exceptionEvents()` | Observed failed-path structure and observed note fields, synthetic composition | A failed judge appears as phase evidence before handoff, repair and final. It has `judge_call_failed`. A separate invented build stays separate. The instruction, notice and retry prefix order is composed for tests. It doesn't claim native adjacency or application. Two equal retry and catalog records stay distinct. |
| `edgeEvents()` | Defensive construction with reviewed field types | The inputs cover equal source-distinct text, same-event exact equality, whitespace-different projection, routing labels, usage conflicts and unknowns, delegation, detached scope, redaction, and both overflow criteria. Checkpoint placement is invented. It doesn't establish a native relationship or reconstruct a diff. |
| `edgeLedger()` | Defensive financial-source input | Rows supplied in the ledger replace receipts and legacy values without mixing. Recorded configured rates and phase summaries don't become calls. |

The tests build five views from three event inputs:

1. Core.
2. Exception.
3. Root edges with receipts.
4. The selected detached child.
5. Root edges with a ledger.

These views can overlap. Don't add their usage totals as separate histories.

All four reviewed catalog groups remain readable. Catalog identity, version and provider don't establish producer identity or prove which models calls used. Rates are configuration. Their currency and price units aren't inferred. Raw-field checks cover error, instruction and retry text. They don't check every catalog metadata value. Separate literal catalog assertions and full golden byte comparisons also check metadata.

The optional public two-critic scenario isn't included. The fixtures don't imply an observed completed multi-critic case. WI-054's pinned public references are version-specific supplements. They don't define a universal older persistence sequence. These fixtures don't certify every census field or type variant.

## Determinism

`renderSdkExport` receives fixed events, source metadata, output and asset names, generated time, and an optional ledger. The test helper sets UTC for each synchronous render, then restores the previous timezone. Tests check that another timezone doesn't change output bytes.

Tests don't normalize output. Source imports already use stable `source (not built)` commit provenance. Package version changes remain visible. Tests don't trim, scrub or normalize Markdown, models, usage, structure or companion content before comparison. Rendering still applies the product's normal credential redaction.

## Check and update

```powershell
pnpm test test\sdk-golden.test.ts
pnpm test --command test\fixtures\sdk-golden\update.ts --check
pnpm test --command test\fixtures\sdk-golden\update.ts --update
```

1. Review the intended semantics and evidence class before changing inputs.
2. Run the tests. Investigate semantic failures. Don't change expected counts just to match the renderer.
3. Run `--update` deliberately after semantic checks pass. During initial creation, missing expected artifacts are deliberate red failures.
4. Review every new Markdown and companion candidate. A passing updater doesn't count as developer acceptance.
5. Run check mode and regression tests before accepting a candidate.

The updater writes a content-addressed generation under `expected\<generation-hash>\`. It never overwrites or deletes generations it already saved. `active.json` selects the candidate and lists exact file sizes and SHA-256 hashes. Changing only this selector is deliberate. It doesn't mean the developer accepted the candidate. Repeating the update reuses matching bytes. Normal checks don't create or change expected files.

Inactive generations are historical candidates. They aren't expectations for current inputs or proof of disk-reader compatibility. Earlier candidates used the generic `assets` folder. Keep them until the developer permits cleanup.

The spill companion keeps the complete redacted note, not just ten preview lines. Tests check exact equality, corruption, removal, order and multiplicity. They also check missing, unlinked or moved companion cases. Byte-only and line-only bodies stay inline. Notes without a prompt can still have known unmatched usage. Zero requests don't erase charges.
