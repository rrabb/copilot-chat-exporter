# WI-023: Failed-export handling

Canonical entry: [WI-023](../work-log.md#wi-023). Source links below point to commit `94f8f9270b8cc224c58d94b424bf55f0061f97ec`; historical links point to `180a06ce10eace027c8937c6c20331e5f3b524b0`.

## At a glance

- **Goal:** Keep failed exports and their input files available for review without overwriting an earlier valid export.
- **Failure outputs:** When Local or SDK verification fails, the exporter keeps a warning-marked Markdown file, a receipt, and diagnostics. It keeps the source copy only when the user chose a keep flag.
- **Completed fix:** [WI-043](../work-log.md#wi-043) keeps publishing the archive and receipt when writing the failure log fails. The console reports the log error.
- **Tradeoffs:** See [Decisions and tradeoffs](#decisions-and-tradeoffs) for rejected designs.

## Original goal

Keep failed export outputs and their saved source inputs available for review without replacing an earlier valid export. This requirement covers both Local and SDK exports under the [approved publication decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L25).

## Done when

- **Pre-publish check:** Validate staged Markdown and linked companion files before publishing a Local or SDK export, and exit nonzero on failure even without `--strict`.
- **Keep failure files:** Save the receipt, companion files, warning-marked Markdown and diagnostic log without overwriting earlier exports. Keep the source copy only when the user chose a keep flag.
- **Log diagnostics:** Start the failure log with a privacy warning followed by diagnostic JSON that names the failed file and marks missing version fields.
- **Repeatable demo:** Provide a synthetic failure demo that leaves its test inputs and any earlier Markdown untouched.

## Work tree

Progress as of 261126: 1 of 1 child done.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-043 Failure log write errors](../work-log.md#wi-043) | [build] | S | - |

## Current understanding

| Area | Evidence and limit |
| --- | --- |
| Verification and publication | **Inferred from source:** [cli.ts](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/cli.ts#L477) (Local) and [sdk-cli.ts](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/sdk-cli.ts#L143) (SDK) check staged files before publishing. When verification fails, [archive-writer.ts](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/archive-writer.ts#L134) saves the source copy and writes a uniquely named failed file, leaving earlier exports intact. |
| Diagnostics | **Inferred from source:** [export-failure.ts](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/verify/export-failure.ts#L88) writes a failure log starting with a privacy warning followed by redacted JSON covering the output path, source copy, failure details, runtime, and recorded versions. Because redaction is best-effort, review logs for session content before sharing. |
| Later verification | **Inferred from source:** [source-snapshot.ts](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/session/source-snapshot.ts#L361) requires the matching tracking receipt to verify a saved file and never falls back silently to live source data when that receipt is missing. |
| Filesystem limit | **Documented:** Per [work-log-archive.md](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L1007), multi-file publishing is not atomic across power loss, so a crash can leave partial output files behind. Synthetic tests also do not verify Windows access-control behavior. |

## Decisions and tradeoffs

| Decision | Reason and evidence |
| --- | --- |
| Write a warning-marked `.verify-failed.md` file with collision suffixes | Keeps failed output separate from earlier valid and failed exports ([approved decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L25)). |
| Write a `.log` file with a privacy warning and JSON | Logs can contain private chat text, so the console prints a short summary instead of dumping full JSON ([diagnostics decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L13)). |
| Rejected: overwrite existing output before verifying | A failed check would destroy the previous valid Markdown, so the dev chose [staged replacement](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L1000). |
| Rejected: regenerate SDK output to verify saved files | Regenerating output skipped checking the actual saved Markdown and companion files ([old log](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L134)). |
| Delete source copies after failed verification unless the user chose a keep flag | WI-083 changed the earlier retention decision. Diagnostics and the receipt explain the result without leaving a full private log by default. `--keep-source-on-problem` keeps exact replay evidence. |

## Findings and outcomes

### Failure log write errors

**Observed here:** When synthetic Local and SDK exports failed verification and `fs.writeFile` threw `EACCES` on the failure log, both runs preserved the earlier valid Markdown, the failed Markdown, and the source copy. However, neither run wrote a failure log or tracking receipt, nor printed the notice confirming the source copy was kept. Although the failed Markdown still named the saved source path in its warning, running `--verify` later exited nonzero because the receipt was missing.

**Inferred from source at the cited revision:** [archive-writer.ts](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/archive-writer.ts#L177) wrote the failed Markdown before creating the failure log. A write error stopped execution before the Local or SDK path saved the receipt. [WI-043](../work-log.md#wi-043) tracked this bug.

**Outcome accepted 261126:** `writeArchive` returns the failure-log error instead of throwing. The failed archive and receipt are still written. The CLI reports why the failure log is missing. The focused regression passes.

`pnpm run verify` completed with 890 of 890 tests.

## Validation and limits

- **Failure demo:** `pnpm run demo:failure` ran the five [committed synthetic cases](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/scripts/failure-demo.mjs#L30), failing as expected while leaving test inputs and earlier Markdown unchanged (cleanup was preview-only).
- **Focused tests:** Unit tests in [cli.test.ts](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/test/cli.test.ts#L359) and [archive-writer.test.ts](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/test/archive-writer.test.ts#L52) covered both providers, source-copy modes, read errors, missing content, collision names, warning text, and fault injection; full verification and build were not run.
- **Log-error probe:** Using isolated caches and the demo fixtures, the probe simulated a `missing-text` read error and forced `fs.writeFile` to throw `EACCES` on `.failure-log-*`. Local outputs live under `temp-tool-output/` ([wi-023-log-failure-261103-184552/](../temp-tool-output/wi-023-log-failure-261103-184552/), [failure-demo-20261103_184357/](../temp-tool-output/failure-demo-20261103_184357/), and [focused-tests.log](../temp-tool-output/wi-023-tests-261103-184429/focused-tests.log)) and may not exist in other checkouts.
- **Source verification:** Every claim above was verified directly against source files, scripts, and tests at commit `94f8f9270b8cc224c58d94b424bf55f0061f97ec`.
