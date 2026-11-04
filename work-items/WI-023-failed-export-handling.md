# WI-023: Failed-export handling

Canonical entry: [WI-023](../work-log.md#wi-023). Code links below use commit `94f8f9270b8cc224c58d94b424bf55f0061f97ec`. Historical links use `180a06ce10eace027c8937c6c20331e5f3b524b0`.

## At a glance

- Goal: make verification failures reviewable without destroying an earlier export or its source evidence.
- When normal Local or SDK export verification fails, successful writes keep a warning-marked archive, capture, receipt and diagnostic log.
- [WI-043](../work-log.md#wi-043) covers missing receipts and notices when a failure log can't be written.
- Rejected approaches are in [Decisions and tradeoffs](#decisions-and-tradeoffs).

## Original goal

Keep failed verification results and their captured inputs available for review without replacing an earlier successful archive. The [approved publication decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L25) covers Local and SDK exports.

## Done when

- Check staged Markdown and linked companions before publishing a normal Local or SDK export. Verification failures exit nonzero without requiring `--strict`.
- When artifact writes succeed, keep the capture, receipt, companions, warning-marked failed Markdown and diagnostic log. Don't replace earlier successful or failed archives.
- Include a privacy warning and diagnostic JSON in the log. Name the actual failed file and label unavailable recorded versions.
- Provide a repeatable synthetic failure demo that protects its fixture inputs and earlier Markdown.

## Work tree

Progress as of 261103: 0 of 1 child done.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-043 Failure log write errors](../work-log.md#wi-043) | [build] | S | - |

## Current understanding

| Area | Evidence and limit |
| --- | --- |
| Verification and publication | **Inferred from source:** [Local](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/cli.ts#L477) and [SDK](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/sdk-cli.ts#L143) check staged files. The [writer](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/archive-writer.ts#L134) keeps the capture before publishing a uniquely named failed file. It leaves earlier successful and failed files in place. |
| Diagnostics | **Inferred from source:** the [failure log](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/verify/export-failure.ts#L88) starts with a privacy warning, then redacted JSON. It records the output, capture, failure details, runtime and recorded versions. Redaction is best effort; logs can contain session content and need review before sharing. |
| Later verification | **Inferred from source:** [saved-file verification](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/session/source-snapshot.ts#L361) requires the matching receipt. It doesn't silently substitute a live source when the receipt is missing. |
| Filesystem limit | **Documented:** the [archive](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L1007) says publication isn't an all-or-nothing operation across files after a power loss. A crash may leave artifacts from the attempt. The synthetic checks don't establish Windows access-control guarantees. |

## Decisions and tradeoffs

| Decision | Reason and evidence |
| --- | --- |
| Use a warning-marked `.verify-failed.md` and collision suffixes | Keeps failed output separate from earlier successful and failed archives. See the [approved decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L25). |
| Use `.log` with a warning followed by JSON | The log can contain session content. The console shows a short summary instead of the full JSON. See the [diagnostics decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L13). |
| Rejected: replace the output directly before verification | A failure could destroy the earlier Markdown. The dev chose [staged replacement](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L1000). |
| Rejected: regenerate SDK output to prove saved-file integrity | It didn't check the supplied file or companions. See the [old log](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L134). |
| Replaced deleting captures after failed verification | It removed evidence needed for later checks. See the [retention finding](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L80). |

## Findings and outcomes

### Failure log write errors

**Observed here:** synthetic Local and SDK exports were forced to fail verification, then an `EACCES` error was injected while writing the failure log. Both kept the earlier successful Markdown, the failed Markdown and the captured source. Neither wrote a failure log or receipt. Neither printed the notice that its source was kept. A later `--verify` of each failed file exited nonzero because its receipt was unavailable. The failed Markdown still named the capture in its warning.

**Inferred from source:** the [writer](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/archive-writer.ts#L177) publishes the failed Markdown before writing the log. An error writing the log throws before the [Local](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/cli.ts#L574) or [SDK](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/src/sdk-cli.ts#L108) path saves the receipt. [WI-043](../work-log.md#wi-043) tracks this separate job.

## Validation and limits

- `pnpm run demo:failure` exercised the five [committed synthetic cases](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/scripts/failure-demo.mjs#L30). Each failed as intended and kept its fixture source and earlier Markdown unchanged. The demo only previewed cleanup.
- Focused synthetic tests covered both providers, capture modes, read errors, missing content and companions, collision naming, warning text and fault injection. See the [CLI cases](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/test/cli.test.ts#L359) and [writer cases](https://github.com/rrabb/copilot-chat-exporter/blob/94f8f9270b8cc224c58d94b424bf55f0061f97ec/test/archive-writer.test.ts#L52). Full verification and a build weren't run.
- The log error probe used the committed demo fixtures and isolated caches. It used the staged-read injector in `missing-text` mode and made `fs.writeFile` throw `EACCES` for `.failure-log-*`. Its [outputs](../temp-tool-output/wi-023-log-failure-261103-184552/), the [demo](../temp-tool-output/failure-demo-20261103_184357/) and [focused test log](../temp-tool-output/wi-023-tests-261103-184429/focused-tests.log) are local-only and may be absent from another checkout.
- The graph reported changed file metadata. Claims above were checked against direct source reads, and tracked source, scripts and tests matched the cited commit.
