Part of [WI-022](WI-022-source-captures-cache-cleanup.md), the source capture and cleanup item. Found while reviewing cache use in a real Windows profile.

# WI-083 Capture retention and crash recovery

## At a glance

- **Goal:** keep stable source copies for the command without large private leftovers.
- **Policy:** delete the frozen source after a run unless the user chose to keep it.
- **Flags:** `--keep-source-on-problem` keeps a source after a problem. `--keep-source` keeps it after any run.
- **Cleanup finding:** dead owners, stale registrations and partial registration failures can leave capture data that current cleanup misses or hides.
- **Diagnostic limit:** diagnostic evidence needs a total size limit before it replaces keeping the full source.
- **Related:** [WI-043](../work-log.md#wi-043) (errors when writing the failure log) keeps the run receipt, or result record, and console output working.
- **Outcome:** the developer accepted Slices A and B on 261126. Commits: `604d867` and `f12b570`.
- **Follow-up:** [WI-084](../work-log.md#wi-084) defers the missing byte count on the exit-hook path.

## Work tree

Progress as of 261126: 0 of 1 child done. The parent outcome is complete, and its deferred child remains open.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-084 Exit-hook cleanup size notice](../work-log.md#wi-084) | [build] | S | - |

## Original goal

Keep export verification repeatable during one run without surprising users with large chat copies left in the cache. These copies stay fixed for the run.

The current system freezes source data because live Copilot logs can change during export and verification. How long should the copy stay after the command? How should the tool recover from crashes? What evidence should a failure keep after it deletes the full source?

## Done when

- The owner approves a clear retention rule for clean captures, warnings, failures and exceptions.
- The design states which flag keeps sources and when the flag must be passed.
- Abandoned captures and stale registrations have a safe inventory and cleanup rule.
- A failed or warning result can explain what evidence remains and what was deleted.
- Diagnostic evidence has a policy for total size, a privacy warning and a shortening notice.
- Plan focused cases for crashes, stale registrations and partial registration failures.
- README, the specification (SPEC) and tracking changes are listed for later implementation.
- The developer separately accepts the research and approves implementation.

## Questions and proposed answers

### 1. Can the tool run without a frozen copy?

Not today. Local exports, Agent Host exports and Copilot CLI exports require a copied source. Agent Host is the chat service behind VS Code agent sessions. Copilot CLI means Copilot command-line interface.

A mode without a copy is possible. The tool could read fixed bytes into memory or parse read-only source views. That would cost more memory and parser work. It could also make repeatable verification weaker if a live chat changes.

The practical fix is smaller. Keep a fixed disk copy for the command's lifetime, then delete it unless the user chose to keep it.

### 2. Does a frozen copy create work for crash cleanup?

Yes. **Inferred from source:** the current exit hook removes temporary captures after a normal exit. It can't handle a forced kill or power loss.

**Inferred from source:** the code has three cleanup gaps:

1. A dead process can leave an unkept capture. Current cleanup selects only kept captures, so it skips the leftover.
2. A stale registration points to a missing capture folder. It stops the entire cache report with `ENOENT` (file not found). The user can't inspect valid captures after that error.
3. Capture creation can leave an unregistered folder if owner registration fails midway.

A 261125 live cache review found one 80.59 MiB kept export capture from the Software Development Kit (SDK) layer. It also found nine stale registrations. The SDK layer backs Agent Host and CLI chats. The figures describe this development machine, not expected user storage.

### 3. Should warnings and failures keep the frozen source by default?

The proposed answer is no. Keep the source only when the user asks for it before the run.

| Result | Proposed default | With a keep flag |
| --- | --- | --- |
| Clean export | Delete capture | Keep capture |
| Warning | Delete capture | Keep capture |
| Verification failure | Delete capture | Keep capture |
| Handled exception | Delete after writing diagnostics | Keep capture |

These artifacts can remain:

- failed archive
- companions, which are files the tool writes beside the archive
- receipt, which records the run result
- diagnostic metadata

They help explain the result without keeping a complete private log.

Add `--keep-source-on-problem`. It would keep a source only after a warning, failure or exception.

Keep `--keep-source` for broader use. It would keep a source after any run, including a clean export.

The console should say what happened:

> Frozen source removed: 80.49 MiB. This run can't be replayed from the exact source later. Use `--keep-source` before a future run if you need that evidence.

An automatic rerun can see different chat bytes. The message should say that a rerun may not recreate the evidence.

### Why the current behavior might be right

Deleting after failure loses exact replay evidence. That means the tool can't rerun the same source and expect the same result. The live chat may change before a rerun.

That replay value is the strongest argument for the current policy. It lets a maintainer inspect the same source that produced the failed Markdown.

The proposed change trades replay confidence for lower privacy risk and less hidden disk use. The trade is acceptable only if the tool reports the deleted bytes and the lost replay option.

An interactive prompt after failure would keep the choice close to the event. It would also break automation and ask users about a file they may not know. A flag chosen before the run is more predictable.

### 4. What cleanup work should follow?

| Priority | Work | Why |
| --- | --- | --- |
| 1 | Continue listing after stale registrations | Users can still inspect valid captures |
| 1 | Recover dead captures that aren't kept after confirmation | This fixes the crash leak |
| 1 | Roll back partial registration failures | This prevents folders with no registration |
| 2 | Report unregistered `cce-*` folders as unknown | It makes leftovers visible without unsafe deletion |
| 2 | Cap exact diagnostic evidence | It prevents a large diagnostic from replacing a large capture |
| 2 | Show source size after each keep | It makes retention cost visible |
| 3 | Add diagnostics and evidence totals to `--cache` | Users can see all private data owned by the exporter |

Skip `%TEMP%` in automatic cleanup because other tools own files there. Cleanup touches only captures owned by the exporter.

Don't add automatic deletion by age or size. Preview and confirmation give users control. A hidden time or size rule could destroy needed failure evidence.

### 5. Which earlier recommendations are worth doing?

| Item | Recommendation | Pros | Cons and counterarguments |
| --- | --- | --- | --- |
| Delete captures after warnings and failures | ✅ Do | Less hidden storage and privacy risk | Replay of the exact failed source becomes unavailable |
| Add `--keep-source-on-problem` | ✅ Do | Gives developers a narrow choice | Users must choose it before failure |
| Keep a temporary disk copy | ✅ Do | Stable verification with little parser churn | It still needs crash recovery |
| Build a parser that skips copying | ⏸️ Defer | Avoids temporary disk writes | Higher memory use and a larger redesign |
| Fix stale registrations | ✅ Do first | Unblocks the cleanup command | Damaged metadata needs careful classification |
| Recover abandoned captures | ✅ Do first | Fixes a real crash leak | Cleanup must check the owner process and active readers |
| Cap diagnostic evidence | ✅ Do before changing retention | Prevents another large private file | A shortened sample may omit useful context |
| Add automatic age or size deletion | ❌ Reject | Keeps cleanup predictable and user-led | Users must remember to run cleanup |
| Clean Windows Temp automatically | ❌ Reject | Avoids touching other tools' files | It leaves unrelated leftovers in place |
| Make WI-043 (errors when writing the failure log) the next item | ℹ️ Lower its priority | It still matters for receipt correctness | The policy and cleanup bugs have broader impact |

WI-043 remains related. An error writing the failure log must not stop receipt writing. Under a new policy, the receipt must say whether the source was kept or deleted.

## Proposed evidence policy

Diagnostic evidence can be large. The tool can write exact failed text in full today. Evidence larger than 256 KiB moves to a separate file, but the move doesn't cap the bytes.

Before diagnostics replace keeping the full source, add a total byte limit. Keep:

- a bounded head and tail
- the full hash
- byte count
- source locator
- a notice saying how many bytes were shortened

## Recommended first implementation slice

1. Add receipt states for `kept`, `deleted` and `cleanup-failed`.
2. Stop keeping full sources by default after warnings and failures.
3. Keep diagnostics within a visible total byte limit.
4. Make `--cache` continue through stale registrations.
5. Recover abandoned captures after a preview.
6. Add focused tests for dead owners, stale registrations and partial registration failures.

This change is bounded. It skips the parser redesign. It still serves the main goal: stable checks that the export matches its source, without hidden private copies.

## Evidence and limits

**Observed here 261125:**

- `%LOCALAPPDATA%\copilot-chat-exporter\cache` used about 80.7 MiB.
- One kept SDK `events.jsonl` accounted for 80.49 MiB.
- Nine stale registration files pointed to missing capture folders.
- `node src/cli.ts --cache` stopped with `ENOENT`.

These figures describe this machine only. They can't predict how much cache other users will accumulate.

**Inferred from source:**

- [`loadSession`](../src/index.ts#L67) always creates a Local capture.
- [`snapshotSdkSelection`](../src/session/sdk-capture.ts#L99) always creates an Agent Host or CLI capture.
- [`source-cache.ts`](../src/session/source-cache.ts#L9) removes temporary captures only on normal process exit.
- [`cleanSourceCache`](../src/session/source-cache.ts#L327) selects only kept captures.
- [Local retention](../src/cli.ts#L857) keeps failed or diagnostic captures.
- [SDK retention](../src/sdk-cli.ts#L363) uses the same broad rule.
- [`collectContentDiagnosticEvidence`](../src/verify/diagnostic-evidence.ts#L548) can collect exact failed text.

The code graph reported no issue for the relied-on files. The index metadata was newer than the previous direct reads. We checked conclusions against source, not the graph alone.

## Decisions needed

On 261125 the developer split the work into two slices. They chose Slice A first. For decision 4, they chose to report stale registrations and remove them through the normal cleanup preview and confirmation.

Still open for Slice B:

1. ✅ Approved 261125: delete the full source by default after warnings and failures.
2. ✅ Approved 261125: add `--keep-source-on-problem`.
3. ✅ Decided 261125: limit diagnostic evidence to 4 MiB per bundle. That's more than twice the largest real bundle, 1.7 MiB. See [Is a diagnostic limit needed?](#is-a-diagnostic-limit-needed).
4. ✅ Approved 261125: build Slice B with receipt states, the retention change, the 4 MiB diagnostic limit and WI-043 folded in. Slice A was committed as `604d867`.

### Is a diagnostic limit needed?

**Observed here 261125:** only 2 diagnostic bundles exist on this machine. Both come from the same failed export, with 1.7 MiB of evidence each.

| Measure | Value |
| --- | --- |
| Evidence file | `schema-and-content.json`, 1,707 KiB, all in content evidence |
| Largest texts | 17 system-prompt texts of 15 to 78 KiB each, all different |
| Failed archive beside it | 12,242 KiB, which already holds the same text |
| Earlier chats | No past chat reported a bundle size problem. The WI-077 review said bundles still needed a frozen case to replay some failures. |

**What this means:**

- A 1 MiB limit would have shortened the only real bundle. Removing duplicates wouldn't help, because the texts differ.
- Evidence adds little new private data. The failed archive beside it already contains the same text.
- The risk is a rare export with many failed large texts. Today nothing stops that growth.

**Recommendation and decision:** the agent suggested an 8 MiB backstop instead of a tight 1 MiB limit. The developer chose 4 MiB. Either value leaves the real case untouched and stops runaway growth. Each shortened text keeps its head, tail, byte count and SHA-256 hash. The bundle states how many bytes it shortened. **Counterargument:** with only one real sample, 8 MiB is a guess. Skipping the limit is also reasonable, because the failed archive beside the bundles is already 12 MiB.

Decision 4 above approved this. Slice B below records what was built.

## Slice A: cleanup bug fixes (built 261125)

**Accepted 261125** by the developer. The kept 80 MiB failed-export source wasn't deleted.

This slice fixes leftovers without changing what a run keeps.

| Fix | What changed | Test |
| --- | --- | --- |
| Stale registrations | `--cache` lists them instead of stopping with `ENOENT`. `--clean` removes only the registration file after preview and confirmation. It rechecks the file before deleting it. | `stale registrations do not stop the listing...` |
| Abandoned captures | An unkept capture whose owner process is gone shows as `abandoned`. `--clean` selects it like a kept capture. A running owner or live reader still protects a capture. | `cleanup recovers captures whose owner process died...` |
| Failed registration | A registration that fails partway removes the new capture folder and its owner marker. | `a failed registration removes the new capture folder` |
| Exit hook | One failed removal no longer skips the remaining captures. A capture whose folder can't be removed keeps its registration, so cleanup can find it later. | none (process exit path) |

Files: [`source-cache.ts`](../src/session/source-cache.ts), [`cli.ts`](../src/cli.ts), [`cache.test.ts`](../test/cache.test.ts), README, SPEC and CHANGELOG.

**Observed here 261125:** `node src/cli.ts --cache` now runs on the real cache without an error. It lists 1 kept capture of 84,502,010 bytes, 9 stale registrations and 2 failure logs. Before this change it stopped with `ENOENT`. Nothing was deleted from the real cache.

**Limits:**

- **Unknown:** what removed the 9 capture folders while their registrations stayed. One possible cause is an exit-hook removal that failed partway on Windows. The new hook handles that case. The dates, 261112 to 261118, overlap the WI-077 work on verification diagnostics.
- A reused process ID makes a dead owner look alive. The capture is then skipped, which is the safe direction.
- Unregistered `cce-*` folders and receipts orphaned by stale registrations are still not reported. They stay in the priority 2 list above.

### How to check Slice A

1. Run `node src/cli.ts --cache` and confirm it lists everything without an error.
2. Run `node src/cli.ts --cache --clean --dry-run` and confirm the 9 stale registrations and the 80 MiB kept capture show as `Eligible`.
3. Run `node src/cli.ts --cache --clean` and answer `y` if you want to free about 80 MiB. This deletes the kept source of the failed WI-071 review export (`wi071-final-review.verify-failed.md`). That archive can't be re-verified afterward.

## Slice B: delete sources after problems by default (built 261125)

**Accepted 261126.** This slice changes what a problem run keeps. Commit `f12b570`.

| Change | What it does now | Test |
| --- | --- | --- |
| Default after a problem | Warnings, failures and exceptions delete the frozen source after the failed archive, failure log and diagnostic bundle are written. The console prints `Frozen source removed (N MiB)` and names the flag that keeps it. | `failed ... default export removes its capture after ...` (5 cases) |
| `--keep-source-on-problem` | Keeps the source only after a problem. It works for export and live `--verify`. Cache and listing commands reject it. | `failed ... --keep-source-on-problem export keeps its capture ...` (5 cases), `args.test.ts` |
| Receipt | A deleted failure source gets a `not-kept` receipt with the failure recorded. A later saved-file `--verify` explains that the copy wasn't kept and names both keep flags. | the default cases above |
| Failed archive, log and report | The warning, failure log `capture` field, diagnostic bundle and `--explain` report say the source was removed, instead of pointing to a deleted folder. | the default cases above, `archive-writer.test.ts` |
| Saved-file `--verify` | Never deletes the kept capture it reads. That capture belongs to an earlier export. | existing saved-file tests |
| WI-043 | A failure-log write error is reported on the console. The failed archive and receipt are still written. | `failure log write error still publishes...` |
| 4 MiB evidence limit | Past 4 MiB, the longest evidence texts keep their first 2,000 and last 500 characters plus byte count and SHA-256. The manifest's `limits.evidenceShortened` records how many were shortened. | `evidence over the total limit shortens...` |

Files: [`args.ts`](../src/args.ts), [`cli.ts`](../src/cli.ts), [`sdk-cli.ts`](../src/sdk-cli.ts), [`archive-writer.ts`](../src/archive-writer.ts), [`export-failure.ts`](../src/verify/export-failure.ts), [`explanation.ts`](../src/verify/explanation.ts), [`diagnostic-bundle.ts`](../src/verify/diagnostic-bundle.ts), [`source-snapshot.ts`](../src/session/source-snapshot.ts), their tests, README, SPEC and CHANGELOG.

**Not built from the approved scope:**

- The developer dropped the separate `cleanup-failed` receipt state on 261126. The console already reports the deletion error and points to `--cache --clean`. Slice A lists the leftover as `abandoned`.
- The diagnostic task Markdown doesn't mention shortening. The notice is inside each shortened text and in the manifest.

### Limits after acceptance 261126

- An exception before the failed archive is written can still leave the capture for the exit hook to delete. The hook deletes it without a size message. The developer deferred this to [WI-084](../work-log.md#wi-084).
- The 4 MiB limit was tested with synthetic data only. The two real bundles are 1.7 MiB, so they're unchanged. Keep this limit until a larger real bundle can test the boundary.

**Validation:** `pnpm run verify` passed 890 of 890 tests, both type checks, generated-file checks and the golden checks on 261125.

### How to check Slice B

1. Read the `failed ... default export removes its capture` tests in [`cli.test.ts`](../test/cli.test.ts).
2. Export a chat you know fails, without flags. Confirm the `Frozen source removed` line and that `node src/cli.ts --cache` shows no new capture.
3. Repeat with `--keep-source-on-problem`. Confirm the capture is listed as kept.