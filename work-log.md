# Work dashboard

Updated 261023. New here? Read the [handbook](work-items/README.md) first. Product goal and behavior live in [SPEC](docs/SPEC.md#project-goal-and-scope) and [README](README.md).

🔜 Next · 🔨 Active · 📋 Backlog · ⏳ Waiting · 💤 Deferred · ✅ Done · ❌ Dropped · ↪️ Superseded

## Start here

**Do now**

| # | Item | Next action | Who | Size |
| --- | --- | --- | --- | --- |
| 1 | [WI-003](#wi-003) Manual acceptance | [question] Confirm the [checklist](work-items/WI-003-remaining-manual-acceptance.md#acceptance-inventory), then run the two required checks | you | S |
| 2 | [WI-006](#wi-006) Resource clipping | [research] Test the 96 KiB limit with small synthetic cases, then write up options for you to pick | agent | M |

**Decisions you owe:** 4. See the `[question]` lines in the [Inbox](#inbox).

**Inbox:** 6 lines to triage.

**In flight:** nothing is Active.

## Overview

### Fidelity

| Item | What it is | Status | Type | Who | Size | Do after | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <a name="wi-004"></a>[WI-004 Fidelity policy](work-items/WI-004-fidelity-policy-research.md) | Decide extra metadata, omission notices and redaction, then plan `--high-fidelity` and `--no-redact`. Resumes when you pick policy work up again. | 💤 Deferred · Medium | [research] | you | M | - | old #15/#16 |
| <a name="wi-006"></a>[WI-006 Resource clipping](work-items/WI-006-persisted-resource-clipping.md) | Find out what the 96 KiB limit on saved tool resources hides, then fix it or accept it. | 🔜 Next · Medium | [research] | agent | M | - | WI-004 |
| <a name="wi-014"></a>**WI-014** Inline images | Decide whether to show images inline as well as linking the saved files. Resumes when you review a display proposal. | 💤 Deferred · Low | [idea] | both | M | - | WI-024 |
| <a name="wi-019"></a>**WI-019** Agent chat export | Exports Agent Host and Copilot CLI chats with usage and credits. | ✅ Done | [build] | - | - | - | old #9/#20 |
| <a name="wi-020"></a>**WI-020** Local content fidelity | Keeps Local text, inputs and errors; repeated terminal output shows only the new part (`b1bcb61`). | ✅ Done | [build] | - | - | - | old #15/#16 |
| <a name="wi-021"></a>**WI-021** Source-aware verification | Checks exports against the source, with parser and fuzz tests and faster scoring. | ✅ Done | [build] | - | - | - | old #10, WI-025 |
| <a name="wi-024"></a>**WI-024** Image companions | Saves recorded images as exact-byte files and checks their hashes. | ✅ Done | [build] | - | - | - | WI-014 |

### Confidence

| Item | What it is | Status | Type | Who | Size | Do after | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <a name="wi-003"></a>[WI-003 Manual acceptance](work-items/WI-003-remaining-manual-acceptance.md) | Check by hand that the root chooser and the final listing work as agreed. | 🔜 Next · Medium | [research] | you | S | - | old #5/#6/#13 |
| <a name="wi-007"></a>**WI-007** Inventory evidence | Collect evidence for the listing cases still unverified (placeholders, child chats). Waits for an approved way to capture it. | ⏳ Waiting · Medium | [research] | both | M | - | old #7, WI-015 |
| <a name="wi-008"></a>**WI-008** Browser timeout | If the browser test times out again under load, reproduce it before changing anything. | 📋 Backlog · Low | [research] | agent | S | - | |
| <a name="wi-015"></a>**WI-015** Discovery and selection | Finds chats in the covered stores and picks the root and exact chat safely. | ✅ Done | [build] | - | - | - | old #1/#5-7/#22 |
| <a name="wi-025"></a>**WI-025** Old tool-call gap | Confirm the old 1,040 vs 1,039 tool-call gap was the request-slot bug fixed in `a23fe4e`. Waits for a privacy-safe way to link that case. | ⏳ Waiting · Low | [research] | agent | S | - | WI-021 |

### Report size

| Item | What it is | Status | Type | Who | Size | Do after | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <a name="wi-009"></a>**WI-009** Sample report | Make an anonymized sample report to rebuild the design guide from. Waits for your approval. | ⏳ Waiting · Low | [build] | both | S | - | |
| <a name="wi-012"></a>**WI-012** Compact evidence | Try compact evidence records with one renderer. Resumes if report size becomes a problem again. | 💤 Deferred · Low | [research] | agent | L | - | WI-017 |
| <a name="wi-013"></a>**WI-013** Batched insertion | Try inserting compressed report cards in batches to shorten the long startup task. Resumes when you ask for it. | 💤 Deferred · Low | [research] | agent | M | - | WI-018 |
| <a name="wi-016"></a>**WI-016** Offline listings | Console, basic HTML and detailed HTML listings with source evidence. | ✅ Done | [build] | - | - | - | old #8/#17-19/#23/#25-30 |
| <a name="wi-017"></a>**WI-017** Duplication cut | Cut detailed-report size about 20% and kept full search. | ✅ Done | [build] | - | - | - | old #35 |
| <a name="wi-018"></a>**WI-018** Compressed reports | Optional gzip and Brotli detailed reports. | ✅ Done | [build] | - | - | - | |

### Capture and failure handling

| Item | What it is | Status | Type | Who | Size | Do after | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <a name="wi-022"></a>[WI-022 Frozen captures and cleanup](work-items/WI-022-source-captures-cache-cleanup.md) | Freezes source inputs, checks the saved file, keeps captures safely and deletes only after you approve. | ✅ Done | [build] | - | - | - | WI-023 |
| <a name="wi-023"></a>**WI-023** Failed-export handling | Failed exports keep their evidence and write a private log; a demo reproduces the failures. | ✅ Done | [build] | - | - | - | WI-022 |

### Project upkeep

| Item | What it is | Status | Type | Who | Size | Do after | Links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <a name="wi-001"></a>**WI-001** Work-tracking setup | Move the old work log into this dashboard and topics, one batch at a time. Waits for your review of this redesign. | ⏳ Waiting · High | [build] | both | L | - | |
| <a name="wi-002"></a>**WI-002** Docs consistency | Bring README, SPEC and other docs in line once the WI-004 policy is decided. | 📋 Backlog · Medium | [build] | agent | M | WI-004 | old #12 |
| <a name="wi-010"></a>**WI-010** Graph refresh | Re-index the code graph if you plan to use graph tools. | 📋 Backlog · Low; Quick win | [build] | agent | S | - | old #32 |

## Inbox

Format: `YYMMDD [tag] text (from: you|agent)`. Append only. Reread before adding.

- 261023 [research] Does AGENTS.md's Layer D "presence only" claim match the source-aware checks in code and SPEC? (from: you)
- 261023 [question] [WI-003](work-items/WI-003-remaining-manual-acceptance.md#acceptance-inventory): approve the proposed checklist and say which print cases matter. (from: agent)
- 261023 [question] [WI-004](work-items/WI-004-fidelity-policy-research.md#owner-decisions-still-needed): answer the open policy questions when you resume policy work. (from: agent)
- 261023 [question] [WI-009](#wi-009): approve or drop the anonymized sample report. (from: agent)
- 261023 [question] [WI-001](#wi-001): review this tracking redesign and confirm the agent's proposed type, size and who for each row. (from: agent)
- 261023 [idea] Use the auto-resolved model as the listing's answering model; old #11 left it out. (from: agent)

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
