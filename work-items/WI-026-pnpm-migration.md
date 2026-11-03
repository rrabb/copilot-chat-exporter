# WI-026: pnpm migration

Canonical entry: [WI-026](../work-log.md#wi-026). The dashboard owns status and next actions.

## At a glance

- Goal: finish the npm-to-pnpm move without changing exporter behavior.
- Development uses the pnpm version pinned in [package.json](../package.json). Node support stays at 22.18 or newer, with a 24.18.0 development pin.
- A local install guard rejects other package managers without downloading a helper.
- WI-027 covers the browser CSP assertion fix found during verification.
- WI-008 is related timeout/cleanup research, not a child or a prerequisite for this migration.
- Local verification passed after the CSP test fix. Remote CI and older browser versions weren't rerun.

## Original goal

Finish the dev's pnpm conversion across scripts, current documentation, packaged agent commands and opt-in CI examples. Keep historical npm receipts unchanged, keep the Node support floor, and leave the Git index alone.

## Done when

- Current development and CI commands use the pinned pnpm version and its lockfile.
- Installation rejects other package managers without downloading an unpinned helper.
- Documented CLI examples forward arguments correctly.
- Local install, build, package check and full verification support the migration.
- Separate browser failures have a recorded outcome or follow-up without silently skipping tests.

## Work tree

Progress as of 261102: 1 of 1 child done.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-027 Browser CSP assertions](../work-log.md#wi-027) | [build] | - | - |

Type, size and do-after match the dashboard. The dash keeps the dashboard's unset size for this completed child.

**Related, not a child:** [WI-008 Browser timeout and cleanup](../work-log.md#wi-008). The earlier full-run timeout and hang remain unexplained. Later normal exits don't prove cancellation cleanup works.

## Findings

| Finding | Evidence and limit |
| --- | --- |
| Install guard | **Inferred from source:** [require-pnpm.mjs](../scripts/require-pnpm.mjs) checks the package-manager user agent and reports an error for other managers. It replaces `npx only-allow pnpm`, so this guard doesn't download a helper. It isn't a security boundary and install scripts can be bypassed. |
| No bare `--` with pnpm run list | Use `pnpm run list --user-data-root <dir> --html-output <file>`. pnpm forwards a bare `--`, and the CLI's [unknown-option check](../src/args.ts) rejects it. A synthetic `--install-skill` invocation confirmed forwarding without the separator; it didn't exercise a native-session listing. |
| CSP probe and WI-027 | Chrome reports a CSP error just from parsing the test HTML, before our validation runs. The tests now allow that. **Observed here:** 20 synthetic cases on Chrome 156.0.8078.74 isolated `script-src-attr` events to detached-template parsing before validation, including parsing alone. No handlers executed or cards were inserted. Approved [test changes](../test/compressed-listing-browser.test.ts) accept no events or that directive for rejected handler cases. Error-state, zero-execution and zero-card checks remain, as do strict event checks elsewhere. Production browser code didn't change. Older browsers weren't rerun. |
| Return to the goal | The CSP assertion fix restored full local verification without changing the loader or skipping browser tests. The independent timeout/cleanup investigation stays separate under WI-008. |

## Notes

### 261102 - migration and browser receipts

These are receipts from the earlier work, not validation rerun for this topic update. The folders are ignored local evidence and aren't available in a fresh clone. Code links above keep the implementation references available.

| Scope | Receipt | Outcome and limit |
| --- | --- | --- |
| Initial pnpm conversion | [Initial run folder](../temp-tool-output/pnpm-cleanup-261102-1252/) | Manifest, scripts, Node types and setup docs changed to pnpm. The first full verification run timed out and hung. |
| Frozen install, build and package check | [Install](../temp-tool-output/pnpm-finish-261102-1415/install.log), [build](../temp-tool-output/pnpm-finish-261102-1415/build.log), [package check](../temp-tool-output/pnpm-finish-261102-1415/pack.log) | Local checks passed. CI templates remain opt-in and weren't run remotely. |
| CLI argument forwarding | [Synthetic installation](../temp-tool-output/pnpm-finish-261102-1415/cli-install.log) | `pnpm run export --install-skill <temporary-target>` succeeded without a separator. |
| Guard, installation and privacy | [Focused tests](../temp-tool-output/pnpm-finish-261102-1415/focused-tests.log) | Focused checks passed for the recorded working tree. |
| WI-027 before the fix | [Isolated browser run](../temp-tool-output/pnpm-cleanup-261102-1252/browser-test.log), [full verification before fix](../temp-tool-output/pnpm-finish-261102-1415/verify.log) | Six handler cases failed the zero-CSP-event assertion; their parent also failed. The later full run exited normally. |
| Synthetic CSP probe | [Probe script](../temp-tool-output/pnpm-finish-261102-1415/csp-probe.mts), [results](../temp-tool-output/pnpm-finish-261102-1415/csp-probe-results.json), [summary](../temp-tool-output/pnpm-finish-261102-1415/csp-probe.log) | Controlled parsing and validation cases established the event timing on Chrome 156, not the cause of the earlier hang. |
| Verification after WI-027 | [Full verification](../temp-tool-output/pnpm-finish-261102-1415/verify-after-csp.log), [separate golden check](../temp-tool-output/pnpm-finish-261102-1415/golden.log) | Full verification and exact golden comparison passed for that working tree. This isn't evidence for later code changes. |
| WI-008 unresolved timeout | [Original timeout log](../temp-tool-output/pnpm-cleanup-261102-1252/verify.log), [browser helper](../test/browser-cdp.ts) | The initial run required manual termination. No timeout/cancellation cleanup fix was made. |

Resume prompt for related work: Read AGENTS.md, the handbook, the WI-008 dashboard row and this topic's receipts. Investigate browser-test timeout/cancellation before changing cleanup. Don't treat the resolved CSP assertion failure as the hang's cause. Keep native session data read-only and don't stage or commit.
