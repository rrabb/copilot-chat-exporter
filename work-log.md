# Work dashboard

Updated 261103. New here? Read the [handbook](work-items/README.md) first. Product goal and behavior live in [SPEC](docs/SPEC.md#project-goal-and-scope) and [README](README.md).

🔜 Next · 🔨 Active · 📋 Backlog · ⏳ Waiting · 💤 Deferred · ✅ Done · ❌ Dropped · ↪️ Superseded

## Start here

**Do now**

| # | Item | Next action | Who | Size |
| --- | --- | --- | --- | --- |
| 1 | [WI-001](#wi-001) Work-tracking setup | [build] Move WI-023, then WI-015 to WI-018. | both | L |

**Decisions you owe:** see the `[question]` lines in the [Inbox](#inbox). Lines marked "due when ..." can wait until then.

**Inbox:** see [Inbox](#inbox).

**In flight:** Nothing active.

## Overview

### Fidelity

| Item | What it is | Status | Type | Who | Size | Do after | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <a name="wi-004"></a>[WI-004 Fidelity policy](work-items/WI-004-fidelity-policy-research.md) | Decide extra metadata, omission notices and redaction, then plan `--high-fidelity` and `--no-redact`. Resumes when you pick policy work up again. | 💤 Deferred · Medium | [research] | you | M | - | old #15/#16 |
| <a name="wi-006"></a>[WI-006 Resource clipping](work-items/WI-006-persisted-resource-clipping.md) | Synthetic research exposed clipping. You chose a preview plus a complete redacted companion as the direction. | ✅ Done | [research] | - | - | - | WI-004; [decision](work-items/WI-006-persisted-resource-clipping.md#options) |
| <a name="wi-028"></a>↳ **WI-028** Resource policy choice | Part of WI-006. You chose a preview plus a complete redacted companion as the direction. | ✅ Done | [question] | - | - | - | [WI-006 decision](work-items/WI-006-persisted-resource-clipping.md#options) |
| <a name="wi-029"></a>↳ **WI-029** Resource preview and companion | Part of WI-006. Replace clipping with a Unicode-safe preview and a complete redacted companion. | 📋 Backlog · Medium | [build] | agent | M | - | [WI-006](#wi-006) |
| <a name="wi-030"></a>↳ **WI-030** Resource text verification | Part of WI-006. Independently verify resource text, including redacted companions, and report missing content. Waits for WI-029. | ⏳ Waiting · Medium | [build] | agent | M | WI-029 | [WI-006](#wi-006) |
| <a name="wi-031"></a>↳ **WI-031** Unmatched resources | Part of WI-006. Research how to report unmatched files without attaching them to the wrong call. | 📋 Backlog · Medium | [research] | agent | S | - | [WI-006](#wi-006) |
| <a name="wi-014"></a>**WI-014** Inline images | Decide whether to show images inline as well as linking the saved files. Resumes when you review a display proposal. | 💤 Deferred · Low | [idea] | both | M | - | WI-024 |
| <a name="wi-019"></a>[WI-019 Agent chat export and usage](work-items/WI-019-agent-chat-export.md) | Exports Agent Host and Copilot CLI chats with nested agents and recorded usage. | ✅ Done | [build] | - | - | - | old #9/#20 |
| <a name="wi-034"></a>↳ **WI-034** Ambiguous subagent mapping | Part of WI-019. Investigate how an ambiguous mapping reached a strict export without warning. | 📋 Backlog · High | [research] | both | M | - | [Finding](work-items/WI-019-agent-chat-export.md#ambiguous-subagent-mapping) |
| <a name="wi-035"></a>↳ **WI-035** Delegation inputs | Part of WI-019. Investigate missing original task prompts and descriptions when child records differ. | 📋 Backlog · Medium | [research] | agent | M | - | [Finding](work-items/WI-019-agent-chat-export.md#delegated-task-input) |
| <a name="wi-036"></a>↳ **WI-036** Child opaque reasoning count | Part of WI-019. Count opaque reasoning messages in nested child conversations. | 📋 Backlog · Medium | [build] | agent | S | - | [Finding](work-items/WI-019-agent-chat-export.md#child-opaque-reasoning-count) |
| <a name="wi-020"></a>[WI-020 Local content fidelity](work-items/WI-020-local-content-fidelity.md) | Records the Local text fixes and identity-keyed terminal deltas. [WI-033](#wi-033) researches reasoning IDs. | ✅ Done | [build] | - | - | - | old #15/#16 |
| <a name="wi-033"></a>↳ **WI-033** Local reasoning identity | Part of WI-020. Investigate lost reasoning positions and checks when different IDs have identical or prefix text. | 📋 Backlog · Medium | [research] | agent | M | - | [WI-020 finding](work-items/WI-020-local-content-fidelity.md#local-reasoning-identity) |
| <a name="wi-021"></a>[WI-021 Source-aware verification](work-items/WI-021-source-aware-verification.md) | Checks Local and agent exports with source-aware text and structural checks. | ✅ Done | [build] | - | - | - | old #10; [WI-025](#wi-025) |
| <a name="wi-032"></a>↳ **WI-032** Parser install hint | Part of WI-021. Change the missing-parser hint to recommend `pnpm install` and also check other messages for stale npm wording. | 📋 Backlog · Low | [build] | agent | S | - | [Finding](work-items/WI-021-source-aware-verification.md#parser-install-hint), [WI-026](#wi-026) |
| <a name="wi-024"></a>[WI-024 Image companions](work-items/WI-024-image-companions.md) | Saves recorded image bytes as hash-checked companions. | ✅ Done | [build] | - | - | - | [WI-014](#wi-014) |
| <a name="wi-037"></a>↳ **WI-037** SDK image privacy warning | Part of WI-024. Show the archive warning when SDK image companions bypass text redaction. | 📋 Backlog · High | [build] | agent | S | - | [Finding](work-items/WI-024-image-companions.md#sdk-image-privacy-warning) |
| <a name="wi-038"></a>↳ **WI-038** Repeated image positions | Part of WI-024. Investigate lost same-byte image positions without duplicating tool metadata. | 📋 Backlog · Medium | [research] | agent | M | - | [Finding](work-items/WI-024-image-companions.md#repeated-image-positions) |
| <a name="wi-039"></a>↳ **WI-039** Image MIME reuse note | Part of WI-024. Correct misleading MIME notes when deduplication reuses an existing file. | 📋 Backlog · Low | [build] | agent | S | - | [Finding](work-items/WI-024-image-companions.md#mime-note-after-deduplication) |

### Confidence

| Item | What it is | Status | Type | Who | Size | Do after | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <a name="wi-003"></a>[WI-003 Manual acceptance](work-items/WI-003-remaining-manual-acceptance.md) | The Code and Insiders root choosers and the Code listing review passed 261103. | ✅ Done | [research] | - | - | - | old #5/#6/#13 |
| <a name="wi-007"></a>**WI-007** Inventory evidence | Collect evidence for the listing cases still unverified (placeholders, child chats). Waits for an approved way to capture it. | ⏳ Waiting · Medium | [research] | both | M | - | old #7, WI-015; [7 ambiguous entries](work-items/WI-041-listing-labels.md#current-understanding) |
| <a name="wi-008"></a>**WI-008** Browser timeout and cleanup | Reproduce the browser timeout and check cleanup after cancellation. Later runs exited normally, but the earlier hang remains unexplained. | 📋 Backlog · Low | [research] | agent | S | - | [Browser helper](test/browser-cdp.ts), [receipts](work-items/WI-026-pnpm-migration.md#notes), [WI-027](#wi-027), [Chrome debugger-port failure](work-items/WI-020-local-content-fidelity.md#261103---synthetic-reasoning-and-focused-checks) |
| <a name="wi-015"></a>**WI-015** Discovery and selection | Finds chats in the covered stores and picks the root and exact chat safely. | ✅ Done | [build] | - | - | - | old #1/#5-7/#22 |
| <a name="wi-025"></a>**WI-025** Old tool-call gap | Confirm the old 1,040 vs 1,039 tool-call gap was the request-slot bug fixed in `a23fe4e`. Waits for a privacy-safe way to link that case. | ⏳ Waiting · Low | [research] | agent | S | - | WI-021 |

### Listing reports

| Item | What it is | Status | Type | Who | Size | Do after | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <a name="wi-009"></a>**WI-009** Sample report | Make an anonymized sample report to rebuild the design guide from. Waits for your approval. | ⏳ Waiting · Low | [build] | both | S | - | |
| <a name="wi-012"></a>**WI-012** Compact evidence | Try compact evidence records with one renderer. Resumes if report size becomes a problem again. | 💤 Deferred · Low | [research] | agent | L | - | WI-017 |
| <a name="wi-013"></a>**WI-013** Batched insertion | Try inserting compressed report cards in batches to shorten the long startup task. Resumes when you ask for it. | 💤 Deferred · Low | [research] | agent | M | - | WI-018 |
| <a name="wi-016"></a>**WI-016** Offline listings | Console, basic HTML and detailed HTML listings with source evidence. | ✅ Done | [build] | - | - | - | old #8/#17-19/#23/#25-30 |
| <a name="wi-017"></a>**WI-017** Duplication cut | Cut detailed-report size about 20% and kept full search. | ✅ Done | [build] | - | - | - | old #35 |
| <a name="wi-018"></a>**WI-018** Compressed reports | Optional gzip and Brotli detailed reports. | ✅ Done | [build] | - | - | - | |
| <a name="wi-041"></a>[WI-041 Listing labels and dates](work-items/WI-041-listing-labels.md) | Listing labels, compact local timestamps and the terminal-only run separator were accepted 261103. | ✅ Done | [build] | - | - | - | [WI-003](#wi-003) |
| <a name="wi-042"></a>[WI-042 Fusion and future modes](work-items/WI-042-fusion-and-future-modes.md) | Research recorded selection modes, per-turn models and effort, then propose filters and export labels that handle future modes. | 📋 Backlog · Medium | [research] | both | S | - | [WI-041](#wi-041) |

### Capture and failure handling

| Item | What it is | Status | Type | Who | Size | Do after | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <a name="wi-022"></a>[WI-022 Frozen captures and cleanup](work-items/WI-022-source-captures-cache-cleanup.md) | Freezes source inputs, checks the saved file, keeps captures safely and deletes only after you approve. | ✅ Done | [build] | - | - | - | WI-023 |
| <a name="wi-023"></a>**WI-023** Failed-export handling | Failed exports keep their evidence and write a private log; a demo reproduces the failures. | ✅ Done | [build] | - | - | - | WI-022 |

### Project upkeep

| Item | What it is | Status | Type | Who | Size | Do after | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <a name="wi-001"></a>**WI-001** Work-tracking setup | Finish the work-tracking migration. The dashboard, handbook and first topics are done. Type, size and who guesses accepted 261102. | 🔜 Next · High | [build] | both | L | - | [Topic](work-items/WI-001-work-tracking-setup.md), [Handbook](work-items/README.md), [completion check](work-items/README.md#completion-check) |
| <a name="wi-040"></a>↳ **WI-040** Tracking check script | Part of WI-001. Write `scripts/check-tracking.mjs` and a pnpm script `check:tracking`, then point the handbook's Completion check at it. | 📋 Backlog · Medium | [build] | agent | S | - | [WI-001](#wi-001) |
| <a name="wi-002"></a>**WI-002** Docs consistency | Bring README, SPEC and other docs in line once the WI-004 policy is decided. | 📋 Backlog · Medium | [build] | agent | M | WI-004 | old #12 |
| <a name="wi-010"></a>**WI-010** Graph refresh | Re-index the code graph if you plan to use graph tools. | 📋 Backlog · Low; Quick win | [build] | agent | S | - | old #32 |
| <a name="wi-026"></a>[WI-026 pnpm migration](work-items/WI-026-pnpm-migration.md) | Development commands and CI examples use pinned pnpm with a local install guard. Local validation passes, but remote CI hasn't been run. | ✅ Done | [build] | - | - | - | [Setup](README.md#install), [guard](scripts/require-pnpm.mjs), [receipts](work-items/WI-026-pnpm-migration.md#notes), [WI-027](#wi-027) |
| <a name="wi-027"></a>↳ **WI-027** Browser CSP assertions | Part of WI-026. Handler-case tests allow browser CSP reporting differences while keeping rejection, execution and insertion checks. | ✅ Done | [build] | - | - | - | [Test](test/compressed-listing-browser.test.ts), [findings](work-items/WI-026-pnpm-migration.md#findings), [receipts](work-items/WI-026-pnpm-migration.md#notes), [WI-008](#wi-008) |

## Inbox

Format: `YYMMDD [tag] text (from: you|agent)`. Append only. Reread before adding.

- 261023 [question] (due when WI-004 resumes) [WI-004](work-items/WI-004-fidelity-policy-research.md#owner-decisions-still-needed): answer the open policy questions. (from: agent)
- 261023 [question] [WI-009](#wi-009): approve or drop the anonymized sample report. (from: agent)
- 261023 [idea] Use the auto-resolved model as the listing's answering model; old #11 left it out. (from: agent)
- 261103 [question] (due when considering child-only export) [WI-019](work-items/WI-019-agent-chat-export.md#original-goal): does the earlier separate-child-export goal still apply after the inline decision? (from: agent)
- 261103 [idea] Sub-agents are 41% of console rows (93 of 229); 26 are listed more than once. Hide or collapse by default? Maybe have a multi-toggle set of buttons. Ideas? (from: you)
- 261103 [idea] HTML source panel repeats identical "ambiguous" notes (114 for one chat, about 49 KB). Show once with a count. (from: you)
- 261103 [research] Some chats have the same names or turns (CLI "run the prompt from..." and agent "New Chat"). Research ways to disambiguate or show possible links such as forks, parent/child, copies, clones, imports or exports, including whether they share sources, paths, files or events.jsonl. (from: you)
- 261103 [research] Data point for the same-chat question: the Insiders root lists one CLI chat, "Create a plan for creating an arc…", 5 prompts, created 2026-07-08, updated 2026-09-22. The Code root lists a chat with the same title, prompt count and created date, updated 2026-09-29. Same session or a copy? Not checked. (from: you)
- 261103 [question] (due when overwrite handling resumes) For existing output files, prompt in an interactive terminal with default No, or keep refusal? Decide listing HTML versus Markdown export scope and whether automation needs a force-refusal flag. Keep current protection until decided. (from: you)
- 261103 [idea] Add optional terminal colors to console listings, with plain redirected output and JSON and no meaning conveyed by color alone. (from: you)
- 261103 [idea] Print the console listing before writing optional HTML so a report collision doesn't hide the listing. Keep a failure exit if the requested HTML wasn't written. (from: agent)
- 261103 [build] Docs conflict: SDK Markdown rendering and usage correlation shown as pending (SPEC --list bullet and credits row, CHANGELOG Known limitations, HTML-REPORT-DESIGN usage note). README verify rows omit the generated-asset check. SPEC 6.5 says resource companions are open, but the direction was chosen in WI-006 (implementation WI-029). None depends on WI-004. (from: you)

## Closed lookup

Done items keep their ✅ row above. Dropped and rejected ideas, so nobody proposes them again:

| Idea | Why it was dropped | See |
| --- | --- | --- |
| Separate model-chip icon (old #21) | You skipped it. | - |
| Generic adjacent-text join detector | Real stream fragments made blind joins wrong; source-aware handling replaced it. | WI-021 |
| Whole-record JSON for high fidelity | Duplicates the conversation and conflicts with the no-raw-bundle rule. | WI-004 |
| Nested backup journals (`bkup2`) in discovery | You excluded them; exact-path export still works. | WI-015 |
| Extract non-image Base64 payloads | The audit found only images (now saved) and opaque reasoning (omitted on purpose). | WI-024 |
| Delete cache before showing targets | Unsafe; cleanup now previews and asks first. | WI-022 |

## Old history

The [old root log](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L3) and the [archive](work-log-archive.md) hold earlier goals, decisions and receipts. Later entries can supersede older pending notes. Read them through links, not by default.
