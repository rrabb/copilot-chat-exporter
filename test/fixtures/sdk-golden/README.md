
# SDK & Fusion Golden Fixtures

This directory holds the **golden test fixtures** for our SDK and Fusion export renderer. Instead of asserting against hundreds of individual lines of Markdown, `test\sdk-golden.test.ts` renders a known set of synthetic chat events and compares the **entire output**—byte for byte—against saved reference files ("goldens") in `expected\`.

* **Run everything:** `pnpm test` and `pnpm run verify` automatically run these tests alongside the rest of the suite.
* **Legacy Local fixtures:** `pnpm run golden` still checks the older, unchanged Local chat fixtures separately.

### How companion assets are tested

When an export is too large to stay inline (like a long note), the renderer writes it to a companion asset folder on disk.

* Each test runs `readLinkedArchiveCompanions` against the generated `archive.md` to verify that linked files follow our `<archive-stem>_assets` naming rule (tested via `archive_assets_fixture`).
* Tests compare the exact set of files and bytes read back from disk, and verify that missing, moved, or corrupted companion files are caught cleanly.

---

## What the synthetic inputs cover (and what they don't)

Every prompt, response, ID, model name, and dollar amount in these fixtures is **100% invented**. We did not sanitize a real chat log—we built synthetic event streams to match the real structural patterns we've observed in SDK/Fusion sessions without making assumptions about missing fields or native prompt ordering.

| Input builder | What it represents | What it tests (and its limits) |
| --- | --- | --- |
| `coreEvents()` | Real-world happy paths with synthetic text | Covers 5 standard workflows in order: draft-final critique, revision-final critique, single primary-final, cascade `accept` primary-final, and cascade `reject` repair-final. Assumes a single completed critic and a single build/policy context (does not imply parallel execution). |
| `exceptionEvents()` | Observed failure structures + error/retry fields | Tests a failed judge phase (`judge_call_failed`) before handoff and repair, using a separate build context. Instruction/notice/retry prefixes are ordered specifically to test rendering, not to claim how the host app orders them natively. |
| `edgeEvents()` | Defensive edge cases across known field types | Covers duplicate vs. source-distinct text, whitespace-only differences, routing labels, conflicting/unknown usage stats, delegation, detached child scopes, secret redaction, and inline-vs-spill overflow thresholds. Checkpoints here are placed for test coverage, not as real diffs. |
| `edgeLedger()` | Explicit financial/billing records | Verifies that explicit ledger rows cleanly replace receipt/legacy estimates without double-counting, and that configured rates/phase summaries aren't mistaken for actual API calls. |

### How the 5 render views work

`sdk-golden.test.ts` takes those three event builders (`core`, `exception`, `edge`) and produces **five distinct rendered views**:

1. Core workflows
2. Exception/failure paths
3. Root edge cases (using receipt/legacy usage)
4. A selected detached child scope
5. Root edge cases (using the explicit `edgeLedger()`)

> **Important:** Because views 3, 4, and 5 slice the same `edgeEvents()` data in different ways, their usage numbers intentionally overlap. Never sum the totals across all five views as if they were separate chat histories.

### A few things to keep in mind about metadata & scope

* **Catalog vs. actual calls:** All four model catalog groups are represented so we know they parse cleanly, but a model appearing in the catalog doesn't prove it was actually called, and configured rates don't carry inferred currency units.
* **What's left out:** Multi-critic scenarios aren't included here, and pinned public references (like WI-054) are treated as version-specific supplements rather than universal rules.
* **Spill & usage edge cases:** When a note spills into a companion file, the file must keep the **entire redacted note** (not just a 10-line preview), while byte-only or line-only bodies stay inline. Also, a note without a prompt can still carry valid usage charges—zero requests doesn't zero out cost.

---

## Deterministic rendering (no fuzzy matching)

We don't strip whitespace, normalize timestamps, or scrub package versions before comparing test outputs. If a byte changes, the test fails. To keep renders identical across developer machines and CI:

* **Timezone:** The test helper temporarily forces `UTC` during each render, restores your local timezone afterward, and explicitly verifies that changing timezones doesn't alter output bytes.
* **Commit provenance:** Source imports intentionally resolve to a fixed `source (not built)` string so local builds don't dirty the output.
* **Redaction:** Normal credential/secret redaction still runs during golden renders.

---

## How to check and update goldens

Use these commands from the repo root:

```powershell
# Run just the SDK golden test suite
pnpm test test\sdk-golden.test.ts

# Check if current outputs match active.json without modifying anything
pnpm test --command test\fixtures\sdk-golden\update.ts --check

# Generate a new golden snapshot under expected\<hash>\
pnpm test --command test\fixtures\sdk-golden\update.ts --update

```

### Workflow for updating fixtures

When you change renderer behavior or add new test cases, follow this order:

1. **Check the intent first:** Make sure your input changes match the evidence rules in the table above.
2. **Run the tests and read the diff:** If counts or structure fail, investigate *why* the semantics changed—don't blindly update goldens to silence a broken renderer.
3. **Run `--update` deliberately:** Only run the updater once you're confident the semantic output is right. (When adding brand-new test cases, seeing red "missing artifact" failures before updating is expected.)
4. **Inspect every generated file:** A green `--update` run just writes files; it doesn't mean the output is right. Read through the new Markdown and companion files yourself.
5. **Verify before committing:** Run `--check` and the full test suite (`pnpm test`) to confirm everything passes cleanly.

### How `expected\` generations are stored

* The updater writes each snapshot into a content-addressed folder (`expected\<generation-hash>\`) and never overwrites or deletes previous folders.
* `active.json` acts as the pointer to the current generation, recording exact file sizes and SHA-256 hashes. Updating `active.json` only happens when you run `--update`—running `--check` or `pnpm test` will never touch `expected\`.
* **Leave old folders alone:** Inactive generation folders (including older ones that used a generic `assets` directory name) are kept as historical reference. Don't delete them unless we explicitly plan a cleanup.
