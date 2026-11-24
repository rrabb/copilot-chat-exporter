Part of [WI-077](WI-077-ai-verification-diagnostics.md). Found while giving an AI agent a bundle for repairing a verification failure.

# WI-079 Diagnostic bundle coverage and robustness

## At a glance

- **Goal:** close the test holes in the bundle. Add the signals that cost the second blind eval a case.
- **Type:** [build]
- **Priority:** Medium
- **Size:** L, in three slices that you can approve one at a time.
- **Status 261124:** accepted. All three slices are implemented. Focused CLI and diagnostic tests pass, and `pnpm run demo:diagnostics` passes 11 scenarios.
- **Next:** none for the accepted scope. Resume G26 only if a measured repair case proves that current evidence is insufficient.
- **Not in scope:** G24 is accepted in [WI-081](../work-log.md#wi-081). G26 is deferred in [WI-077](WI-077-ai-verification-diagnostics.md).

## Why this exists

WI-077's 261124 review found two kinds of problems:

- **Untested paths.** The plan listed 13 things the bundle should cover. Four have no test.
- **Missing signals.** In blind eval 2, an agent without the archive proposed weakening the verifier. Nothing told it the archive was edited after export.

Every item here is evidence-backed by the [WI-077 review](WI-077-ai-verification-diagnostics.md#review-261124), the [real-CLI demo](WI-077-ai-verification-diagnostics.md#real-cli-demo-261124-f10) or [eval 2](WI-077-ai-verification-diagnostics.md#blind-agent-eval-2-261124).

## Scope

### Slice 1: two small fixes with visible effect

| # | Item | What changes | Size |
| --- | --- | --- | --- |
| G25 | Say whether the archive still matches its export | The bundle states one of three things: the archive matches the export, it differs, or there's no baseline | S |
| G22 | No bundle for user errors | A typo like `3eba66ez` no longer writes a bundle. Real exporter faults still do | S |

**G25 limits.** These come from reading `src/session/source-snapshot.ts:346`:

- The receipt stores `outputSha256` only for a successful export. A failed export stores null, so there's no baseline.
- That is correct, not a bug. A failure at export time means the archive is exactly what the renderer wrote.
- The comparison is byte exact. A harmless CRLF conversion by an editor or Git counts as "differs". Say so in the wording, and consider adding the size.
- The receipt is keyed by output path. A re-export to the same path replaces it.

**G22 needs a rule.** Decide which errors belong to the user. Examples: "No ... session matching", an ambiguous prefix and a missing archive path. Keep every other load exception writing a bundle. A broad rule would hide real faults. The demo's scenario 09 pins today's behavior. It flags the change, and you must update its expectation.

### Slice 2: coverage tests (F11)

| Item | Today | Note |
| --- | --- | --- |
| Local CLI end-to-end bundle | Demo scenario 10 only. Not a test | Parked idea below |
| Fence repair that becomes a strict failure | No test | |
| Invalid usage receipts | No test | |
| Source capture, source read, output write and command discovery exceptions | Only the load exception is in the demo | |
| Diagnostic writer failure must not hide the original error | No test | `src/cli.ts:92-107` already catches it. A test locks the behavior |
| Local record `line` is the request number, not the journal line | Documented in `docs/VERIFICATION.md` | Keep it separate from source-file line claims. The parsed request model doesn't keep the originating JSONL line |

**Parked idea: demo scenarios as `pnpm test` cases.** You asked for an explanation before we decide. The demo isn't in `pnpm run verify`, so a regression there goes unseen until someone runs it. Moving a few scenarios into tests would put them under `verify`. The cost is slower tests and one more sandbox to keep working. Scenarios 04, 10 and 11 are the likely candidates.

### Slice 3: new signals for the repair agent

| # | Item | What changes | Size |
| --- | --- | --- | --- |
| G20 | Excerpt of the bad record on load errors | The bundle keeps a clipped, redacted excerpt of the record that failed to parse | M |
| G21 | Better location for SDK content findings | An SDK chat often has one request, so give an event line or an archive position | M |

**G20 privacy.** A bad record can hold private text. Send the excerpt through the same redaction as other samples, or keep it only in the restricted raw-records file.

## Coverage map

Compared with the plan's "Required coverage" list. Based on test names. Test bodies weren't all reread.

| Plan item | Test today |
| --- | --- |
| Unhandled Local response kinds and `toolSpecificData` kinds | ✅ `diagnostic-source.test.ts` |
| SDK unknown events and unsupported payloads | ✅ `diagnostic-source.test.ts` |
| Question parsing warnings | ✅ `diagnostic-source.test.ts` |
| Layer D partial, absent, order and multiplicity | ✅ `diagnostic-evidence.test.ts` |
| Missing images | ✅ `diagnostic-bundle.test.ts` |
| Corrupt images | ❓ Not checked |
| Parser failures | ✅ `diagnostic-bundle.test.ts` |
| Verifier and exporter exceptions | ✅ `diagnostic-bundle.test.ts` |
| Invalid usage receipts | ✅ `diagnostic-source.test.ts` |
| Fence repairs that become strict failures | ✅ `diagnostic-bundle.test.ts` |
| Source capture, source read and output write exceptions | ✅ Existing CLI and archive-writer failure tests |
| Writer failure keeps the original error | ✅ `cli.test.ts` |
| Local CLI end to end | ✅ Existing failed-export CLI matrix now asserts the Local and SDK bundle |

## Done when

- Each slice has tests that fail without it. Focused tests pass 53 or more checks together.
- G22 landed. The demo's scenario 09 expects no bundle, and `pnpm run demo:diagnostics` passes all 11 scenarios.
- Blind eval 2 reran on the content case with only the task and manifest. The agent stopped blaming the renderer, chose "restore or re-export", and cited event line 4. It still called the case a miss because the bundle excludes the archive body and frozen source. That's correct evidence loss, not another code pointer. The bundle's replay command is the cheaper next step.
- The README and SPEC wording for the bundle matches what the bundle says.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| G22's rule hides a real exporter fault | Default to writing a bundle. List the user errors by name |
| G25 reports "differs" for a harmless edit | Word it as "bytes differ", not "someone broke it" |
| G20 leaks private text | Redact the excerpt or keep it only in the restricted file |
| Tests built on `cli-sandbox.mjs` slow `verify` | Time the first one before adding more |

## Evidence

- `src/session/source-snapshot.ts:346` and `:352`: receipt hash, null on failure.
- `src/cli.ts:92-107`: the diagnostic writer catches its own failure.
- `scripts/diagnostics-demo.mjs` and `scripts/lib/cli-sandbox.mjs`: the sandbox to build the tests on. See the [README](../README.md#cli-sandbox).
- `test/cli.test.ts`, `test/diagnostic-bundle.test.ts`, `test/diagnostic-evidence.test.ts`, `test/diagnostic-source.test.ts`, `test/provider-sources.test.ts` and `test/sdk-event-notes.test.ts`.
- `pnpm test` focused selectors: 63 slice-3 checks pass. The CLI selector adds the Local and SDK end-to-end coverage.
- `pnpm run demo:diagnostics`: 11 of 11 scenarios pass.
- `pnpm run verify`: 866 tests and both goldens pass.
- Blind eval on `diagnostics-demo-20261124_172756/04-content-loss`: the agent selected restore/re-export and no renderer module. It scored miss because the exact archive and source were intentionally absent.

## Outcome 261124

The dev accepted WI-079 on 261124. All three slices are complete, full verification passes, and the real-CLI demo passes all 11 cases. The later blind eval chose restore or re-export before renderer changes and cited the SDK event-line locator.
