# Synthetic SDK/Fusion goldens

Normal `pnpm test` and final `pnpm run verify` discover `test\sdk-golden.test.ts`. They compare complete Markdown, the exact file set and every companion byte. `pnpm run golden` still checks the unchanged Local fixture.

Each active archive also uses `readLinkedArchiveCompanions` on its saved `archive.md` path. The fixed `archive_assets_fixture` folder follows the disk reader's archive-stem prefix rule. Tests compare disk-read companion sets/bytes and check missing/corrupt disk evidence with the independent raw-field verifier.

## Purpose and evidence

Every prompt, prose body, ID, model, producer label and financial amount is invented. These inputs weren't sanitized from a real chat. Structural observations don't reconstruct missing native prose or prompt ordering.

| Input | Evidence class | Purpose and limit |
| --- | --- | --- |
| `coreEvents()` | Observed successful structures, synthetic scaffolding | Five workflows in reviewed physical order: critique draft-final, critique revision-final, single primary-final, cascade literal `accept` primary-final, cascade literal `reject` repair-final. Each critique has one completed critic. One invented build/policy context, no inferred settings-change cause or parallel execution. |
| `exceptionEvents()` | Observed failed-path structure and observed note fields, synthetic composition | Failed judge is recorded phase evidence before handoff and repair/final, with `judge_call_failed`. A different invented build stays separate. Instruction/notice/retry prefix order is composed for tests, not claimed native adjacency or application. Two equal retry/catalog records stay distinct. |
| `edgeEvents()` | Defensive construction with reviewed field types | Equal source-distinct text, same-event exact equality, whitespace-different projection, routing labels, usage conflicts/unknowns, delegation, detached scope, redaction and both overflow criteria. Checkpoint placement is invented, not a native relationship or reconstructed diff. |
| `edgeLedger()` | Defensive financial-source input | Explicit ledger rows replace receipts/legacy without mixing. Recorded configured rates and phase summaries don't become calls. |

Five render views use these three event inputs: core, exception, root edges with receipts, the selected detached child, and root edges with a ledger. Views overlap by design; never add their usage as separate histories.

All four reviewed catalog groups remain readable. Catalog identity/version/provider aren't producer identity or proven-used call models. Rates are configuration, with currency/price units not inferred. Current raw-field checks cover error/instruction/retry text, not every catalog metadata value. Literal catalog assertions and full golden byte comparisons supply separate metadata checks.

The optional public two-critic scenario isn't included. No completed multi-critic observation is implied. Pinned public references in WI-054 are version-specific supplements, not a universal older persistence sequence. This fixture set doesn't certify every census field/type variant.

## Determinism

`renderSdkExport` receives fixed events, source metadata, output/asset names, generated time and optional ledger. The test helper sets UTC for each synchronous render and restores the prior timezone. Tests check another timezone doesn't change output bytes.

No output normalization occurs. Source imports already use stable `source (not built)` commit provenance. Package version changes remain visible. Markdown, models, usage, structure and companion content aren't trimmed, scrubbed or normalized for comparison. Rendering still performs the product's normal credential redaction.

## Check and update

```powershell
pnpm test test\sdk-golden.test.ts
pnpm test --command test\fixtures\sdk-golden\update.ts --check
pnpm test --command test\fixtures\sdk-golden\update.ts --update
```

1. Review intended semantics and the evidence class before changing inputs.
2. Run the tests. Investigate semantic failures rather than changing expected counts to match the renderer.
3. Deliberately run `--update` after semantic checks pass. During initial creation, missing expected artifacts are purposeful red failures.
4. Review every new Markdown/companion candidate. A passing updater isn't developer acceptance.
5. Run check mode and the regression tests before accepting the candidate.

The updater writes a content-addressed generation under `expected\<generation-hash>\`. It never overwrites or deletes retained generations. `active.json` selects the candidate and lists exact file sizes/SHA-256 hashes. Updating only that selector is deliberate, not acceptance. Repeating the update reuses matching bytes. Normal checks don't create or change expected files.

Inactive generations are historical candidates, not expectations for current inputs or proof of disk-reader compatibility. Earlier candidates used the generic `assets` folder. Keep them until the developer permits cleanup.

The spill companion retains the complete redacted note, not just ten preview lines. Exact equality, corruption, removal, order/multiplicity and missing/unlinked/moved companion probes are tested. The byte-only and line-only bodies remain inline. Notes without a prompt can still have known unmatched usage; zero requests doesn't erase charges.
