# WI-050 Portable work-tracking kit

## At a glance

- **Goal:** reuse this project's lightweight work-tracking system in new and existing projects, without building a Jira replacement.
- **Owner:** [the exporter dashboard](../work-log.md#wi-050) owns this item's status, priority and next action.
- **Implementation:** the sister repository [work-tracking-system](../../work-tracking-system/README.md) owns the kit. Its [WI-001](../../work-tracking-system/work-tracking/items/WI-001-portable-kit.md) holds the full decision registry.
- **Evidence through 261110:** templates, installation guidance, five skills, four procedures and a minimal checker exist. Sandbox install/import and Local status/triage runs were reviewed in this chat.
- **Latest source checked here:** the kit checkout is clean at `6dc9f5a`. Its own priority rules are confirmed.
- **Safety boundary:** the real codebase-context pilot hasn't run. Sandbox results don't count as real-project acceptance.
- **Accepted 261110:** the dev accepted decisions 30 and 31, including their behavior, and stopped further sandbox testing. The kit handoff is committed at `63bda59`, checked 261112.
- **Next:** the real codebase-context pilot in fresh chats in the target project. Scope and import-quality checklist are under [Pilot plan](#pilot-plan-261112).
- **Separate exporter work:** [WI-051](WI-051-prompt-to-skill-migration.md) owns this repo's review/status skill migration. Missing structured question answers remain in the exporter's [Inbox](../work-log.md#inbox).

## Original goal

Make the dashboard, handbook, topic files, agent instructions and related workflows portable. A solo developer working part-time should be able to drop the kit into another project and resume work across interrupted agent sessions.

The kit must also inspect existing backlogs, TODOs, wishlists and work logs, then import approved work. It must keep enough context to explain decisions and continue work, without reproducing a full issue-tracking service.

WI-050 replaces [WI-040](../work-log.md#wi-040), the proposed exporter tracking checker. The kit now owns that checker. [WI-001](WI-001-work-tracking-setup.md) records this change.

## Done when

- The kit includes reusable tracking templates, collaboration guidance, writing rules and agent entry instructions.
- Installation works in new and existing projects without overwriting existing instructions or silently changing project choices.
- Import reviews selected sources, records each candidate's outcome and files approved work. Any source retirement needs separate approval.
- Status, triage, critique and pause workflows support handoff without starting unapproved work.
- The minimal checker validates dashboard WI anchors and local topic links before the pilot.
- The approved pilot sequence is exercised and accepted: codebase-context, then vsc-chat-tool, then proj-ent-cfg-test. Shared-project use remains separate.

## Current understanding

### Ownership and layout

| Component | Responsibility |
| --- | --- |
| `work-tracking/dashboard.md` | Current status, priority, next action, Inbox and Closed lookup |
| `work-tracking/handbook.md` | Tracking rules, evidence labels, closing, completion and pause rules |
| `work-tracking/items/WI-NNN-short-name.md` | Goals, findings, decisions, evidence and resume context |
| `work-tracking/notes/` | Durable import reports and planning sources, not additional WI topics |
| `work-tracking/collaboration.md` | Portable collaboration guidance, controlled by the project's `Collaboration style:` choice |
| AGENTS block and Copilot pointer | Tell fresh agents what to read and which rules to follow |
| `.github/instructions/` | Writing guidance. Existing project rules aren't overwritten |
| `.github/skills/wt-*/SKILL.md` | Five thin workflow entry files: status, critique, import, triage and pause |
| `work-tracking/procedures/` | Four workflow procedures. Pause points to the handbook rule |
| `INSTALL.md` in the kit | Self-starting installation guidance. There is no user-profile installer command |
| `work-tracking/check-tracking.mjs` | Zero-dependency Node checker. The template and kit's own tracking use the same implementation |
| Optional commit hook | Offered during installation, never enabled without approval |

The exporter isn't being converted to this installed layout. Improvements land in the kit first and are copied here only through separate approved work.

### Evidence boundaries

Historical results below summarize the 261106-261110 reviews in this chat and the linked kit records. They weren't rerun during this extraction. Current Git state and the sandbox procedure comparison were checked read-only on 261110.

| Label | What it supports here |
| --- | --- |
| Documented | Approved decisions and findings persisted in the kit topic |
| From past chat | Earlier session reviews, summarized rather than copied as transcripts |
| Observed here | Kit Git state, existing reference files, matching triage hashes and remaining sandbox Tracking-rule differences |
| Unknown | Unverified runtime behavior, missing attribution or work not exercised |

The original estimate was about 6-9 hours through the first pilot. That was a planning estimate, not measured effort. Repeated sandbox rounds expanded the work.

## Decisions and tradeoffs

This is a summary. Numbered decisions and their detailed reasons belong to the [kit topic](../../work-tracking-system/work-tracking/items/WI-001-portable-kit.md#decisions-and-tradeoffs).

| Decision | Benefit | Cost or boundary |
| --- | --- | --- |
| Lean copy-in kit in its own repository | No service or tracking CLI required. Projects keep their own records | Every installed copy is a fork. Updates are manual |
| Port the handbook, remove exporter-specific rules | Reuses a process already exercised here | Reading cost follows the kit into every project. Trim from pilot evidence, not guesses |
| Keep the exporter layout unchanged | Avoids disrupting this project's working tracker | Improvements need a separate hand-copy step |
| Put tracking inside `work-tracking/` | Makes the system easy to locate and reuse | Agent entry instructions and skills still live outside that folder |
| Do now plus Resume point provide the handoff | One place for the next agent to start | No duplicate kickoff prompt. Project collaboration guidance must agree |
| Collaboration defaults on, with a project switch | Other machines can follow the process without personal profile files | Existing project choices must be kept or changed with approval |
| Commit tracking in solo projects | Decisions travel with the code | Private tracking in shared repositories is deferred. cpe-exb comes later |
| Ask which import sources to use on every run | Supports Markdown lists, logs, grouped code comments, Unreleased changelogs, GitHub work, past chats and Git history | Slow or private sources aren't scanned by default |
| Minimal Node checker before the pilot, fuller checks later | Catches broken anchors and links without dependencies | It isn't a general Markdown parser or an agent-behavior test |
| Keep planning and import evidence in `notes/` | Findings survive beyond temporary reports | The checker skips that folder when scanning WI topic links |
| Pin LF in kit source, keep target line-ending policy | Makes source consistent without forcing a target policy | Installation and copying still need care |
| Pause is an action, not a status | Reuses the handbook's resume rules | It doesn't run Completion check or imply closing the item |
| Preserve existing project instructions during install | Avoids silent changes to project mode, collaboration and writing rules | Conflicts need a proposal. Approved extra doc edits report before, after and why |
| Decision 25: commit hashes are evidence after they exist | Avoids stale commit-state narration in tracking | Reconcile Completion check steps 2 and 5 after a commit |
| Decision 26: use project skills, not prompt wrappers | The kit workflow can be delivered in Local and Agent Host chats | Import, triage and pause are manual. `INSTALL.md` replaces `wt-install` |
| Decision 27: check ignored scratch output and clean empty old prompt folders | Keeps local captures out of Git and removes migration debris | Git-only checks must report failures. Removal requires approval. Appending to `.gitignore` must handle a missing final newline |
| Decision 28: file approved open work, then Retire or Keep as reference | Avoids two active trackers after import | Retire freezes the selected section after separate approval. Keep as reference may drift. There is no Keep active option |
| Decision 28: exclusions, third-party labels and a no-skill-tool fallback | Avoids importing vendor TODOs or invoking an unrelated skill | A strong-model tip isn't proof that weaker models follow the rules |
| Decision 29: priority defaults, confirmation date and answer interpretation | Makes imported priorities visible and avoids silently interpreting free text | Install asks for confirmation. Triage asks until confirmed. Inferred choices need approval |
| Decision 30: batch-first triage with stable temporary IDs | Full recommendations can be accepted, overridden or reviewed individually | Unanswered lines stay in the Inbox. Reviewed Keep entries remain there too |
| Decision 30: progress and incomplete-work reporting | Makes interrupted triage resumable | The incomplete line goes directly above Tracking, not after Evidence. No handbook exception was added |
| Decision 31: Approve the rest as recommended | Avoids another clarification to finish one-at-a-time triage | It covers the current and every unanswered ID. Show those IDs in the choice and before editing |
| Decision 31: allow file-based Tracking updates | Handbook/dashboard edits with no owning WI get a valid footer | Name each WI or file. Separate multiple updates with `; ` |

### Pilot plan (261112)

Decided by the dev 261112, after a status review:

| Decision | Detail |
| --- | --- |
| End state | Undecided: personal kit or public reusable kit. Decide after the pilot shows results. Versioning, an update path and publishing stay off the roadmap until then |
| Where it runs | Fresh VS Code chats opened in `C:\_DEV\codebase-context`, not the kit chat. Install first, then fully quit VS Code, then `/wt-import` in another fresh chat with a strong model |
| Import scope | Pass 1 scans docs and tracked files, including the Git-ignored `docs\temp` notes and benchmarks. Exclude `vendors` (third-party ArcGIS code) and chat history. Reserve `docs\temp\history` for the optional second pass |
| Chat history | Optional pass 2 through `/wt-import`, now or later. After pass 1, offer chat mining without starting it. The dev confirmed this 261112, correcting the agent's earlier first-pass interpretation. No separate command is planned |
| Quality checklist | Completeness (spot-check), no junk (vendor TODOs, done items, chat noise), enough context to resume, duplicates merged, a source link per item, sensible grouping, review in under 30 minutes. Carrying over status and priority wasn't chosen |
| After the import | Use the kit in normal work for about 2 weeks. Log friction in the Inbox. Then decide on trimming and whether the deferred edge-case tests are needed |

**Repeat imports:** You can run `/wt-import` multiple times with different sources. Each run checks previous reports and current tracking. Propose new items, added context, duplicate merges and conflicts for review. Merge approved changes into existing items rather than creating another tracker. This is the agreed pilot behavior, not a tested guarantee of automatic merging. The current [import procedure](../../work-tracking-system/template/work-tracking/procedures/import.md) covers previous reports and duplicate detection, but doesn't yet define context-enrichment and conflict handling.

**Large history files:** [Building-AI-indexer-research.md](../../codebase-context/docs/temp/history/Building-AI-indexer-research.md) is 8,501,303 bytes (8.50 MB). [Building-AI-indexer.md](../../codebase-context/docs/temp/history/Building-AI-indexer.md) is 1,652,056 bytes. [exb-api-evidence-index-session.md](../../codebase-context/docs/temp/history/exb-api-evidence-index-session.md) is 1,065,214 bytes. These are files in the target project, not the kit. Their sizes were checked 261112. A sub-agent per file doesn't solve the largest file's reading limit by itself. Any mining pass needs bounded reads and a record of sections scanned or skipped.

Pilot risks found 261112 (observed here):

- All three repos (`work-tracking-system`, `codebase-context`, this exporter) are public on GitHub (anonymous API returns 200). `docs\temp` is Git-ignored in the target, so imported text from it becomes public once committed. The import report must flag items from ignored files for a privacy check before commit.
- No personal identifiers were found in committed kit files. The target's uncommitted `package.json` adds the same author name and email this exporter already publishes.
- The target's tracked code has almost no TODO markers (2 files, both in `vendors`). Open work lives in docs and notes.

### Earlier options that no longer apply

| Earlier option | Replacement or reason |
| --- | --- |
| Six prompt commands, including a user-profile installer | Five project skills and self-starting `INSTALL.md`, through decision 26 |
| Wrap-up procedure | Handbook pause rule and a thin pause entry |
| Keep an imported list active alongside the new dashboard | Retire or Keep as reference, through decision 28 |
| Batch only above 20 Inbox lines | Always offer batch first. The first 14-line Local run already stalled |
| Put the incomplete-triage warning after the footers | Put it above Tracking. The existing footer rule stays |
| Import already offered the exact three triage choices | Correction: import used table-first approval, but didn't contain those exact choices |
| Replace the kit with Backlog.md or Beads | The 261106 comparison favored the existing lightweight process. A board UI, automated upgrades and shared private mode remain deferred |

## Findings and outcomes

### Work completed or exercised

| Date | Work | Outcome and evidence |
| --- | --- | --- |
| 261106 | Inventory, alternatives and approved design | Kit layout, ownership, import sources, collaboration and pilot order recorded. Planning sources are now kept in the kit's `notes/` |
| 261106 | Phase 1 templates and kit's own tracker | Phase 1 accepted. Source milestones: `dd6e59a`, `8dc2376`, `9a5c6f8` and `9812eb9` |
| 261106 | Cleanup, source notes and line endings | Tracking wording and decision reasons aligned. Root agent entry added. Notes and LF conventions recorded through `ec73703`, `afbd226` and `79eedce` |
| 261108-261109 | Phase 2 assets and first sandbox feedback | Procedures, wrappers, README and install guidance implemented. Anchor, mode and installation feedback incorporated through `7459f92`, `eedff54` and `52f5e4e` |
| 261109 | Existing-project conflict rehearsal | A non-Git vsc-chat-tool copy exposed writing-style conflicts, extra doc edits, missing renamed-command pointers, duplicate mode questions and temporary-only import evidence. Fixes: `d162c5d`, `3aa572f`, `7b48258` |
| 261109 | Minimal checker | `cf42086` added an optional tracking-directory argument and broken-link regression. It checks template and kit tracking without installation |
| 261109 | Skills and reinstall on the 1109 copy | `362e00b` replaced prompts. Five skills, fallback guidance, approved old-prompt removal and the optional hook were exercised |
| 261109 | Installation cleanup | `c35070f` added the scratch-ignore and empty-directory handling |
| 261109-261110 | Agent Host import and revised-source retest | First run exposed duplicate trackers and vendor candidates. Retest filed approved candidates and froze two sections after separate approval. The source was a modified checkout, not an exact commit stamp |
| 261110 | Import and priority refinements | `ba38042` implements decisions 28 and 29. `6dc9f5a` later confirms the kit's own priority rules and answer-interpretation rule |
| 261110 | First Local status/triage review | Status stayed read-only. Triage approvals and conditional-answer clarification worked, but one-at-a-time processing and a detached WI row exposed gaps |
| 261110 | Batch triage and checker regression | `714a901` implements decision 30. The detached-row regression failed before the fix. Existing valid tables and the independent bad-link case remain covered |
| 261110 | Narrow 1109 update and Local retest | Priority confirmation, full batch choice, progress and clarification worked. The update kept existing WIs and Inbox contents |
| 261110 | Approve-the-rest and file Tracking form | `6c0339c` implements decision 31. Automated checker results don't verify these agent interactions |

Commit hashes above refer to the kit's local Git history. They were checked for existence during extraction. Agent checkpoint commits aren't counted as implementation milestones.

### What the sandbox runs actually established

| Run | Result | Limit |
| --- | --- | --- |
| Initial Agent Host import | 27 candidates: 17 WI rows and 10 Inbox entries. Checker passed | No freeze proposal for the roadmap To do list. Two quoted vendor TODOs were filed. An unrelated critique skill loaded |
| Agent Host retest | 25 candidates: 10 WI rows, 14 Inbox entries and 1 merged outcome. Two sections frozen after approval. No stray skill-tool calls in the reviewed run | Sources, exclusions and filing choices changed, so the totals aren't comparable. Exact source revision wasn't recorded |
| First Local status, chat `21bb24f8` | Read-only status worked. Local supplied the skill through an attached `promptFile` containing `SKILL.md` | This verifies that run, not every harness or model |
| First Local triage, chat `e47df75c` | Reviewed 3 of 14 entries: retained C04, filed C07 as WI-011 and dropped C08 with a reason | About six minutes in the reviewed session, not a benchmark. Eleven entries remained unanswered |
| Local update, chat `a644a043` | Changed tracking files with separate approvals and a handbook diff before saving | This was a targeted update, not a clean reinstall |
| Local triage retest, chat `9d51e30b` | Priority confirmation, batch choices, progress and clarification worked. All 12 entries were approved Keep | About 17 minutes in the reviewed session. Model reported as Auto, resolved model unknown. Pause, overrides and incomplete reporting weren't exercised |
| Current 1109 copy check | Triage procedure SHA256 matches the kit. Priority confirmation remains dated 261110 | The sandbox handbook and AGENTS block still lack decision 31's file-based Tracking rule |

The 14-to-12 change isn't lost work. Filing C07 and dropping C08 removed two lines. Retained C04 plus eleven unanswered lines made twelve. The later Keep approvals reviewed all twelve without shrinking the Inbox.

### Corrections and evidence gaps

- The kit's own decision-29 follow-up is no longer uncommitted. `6dc9f5a` records it.
- The creator of sandbox `.chat-history/` exports is unknown. An earlier dashboard attribution to an unrelated tool was too strong. The `.vscode/` folder's creator is also unverified.
- The import fallback was revised because models could call a hidden manual skill and load the wrong workflow. The successful strong-model retest doesn't prove weak-model behavior.
- The checker catches detached WI rows and local inline file links. It doesn't validate heading fragments, reference-style links or the correctness of agent decisions.
- The first Local run's structured question answers existed in the journal but weren't rendered by the exporter. This is separately recorded in the [Inbox](../work-log.md#inbox), not fixed by the kit.
- The exporter's prompt migration is [WI-051](WI-051-prompt-to-skill-migration.md), not additional kit scope. Its commit doesn't establish kit acceptance.

## Resume point

Read the kit's current [dashboard](../../work-tracking-system/work-tracking/dashboard.md) and [topic](../../work-tracking-system/work-tracking/items/WI-001-portable-kit.md#resume-point) before issuing another implementation prompt. Check its Git state again because other sessions work there.

Stopped 261112 before the pilot. The kit is clean at `63bda59`. The uncommitted `package.json` change is in codebase-context, not the kit. Next: run install in a fresh target chat, then a docs/code import. Offer optional chat mining afterward. This chat reviews the import against the [pilot checklist](#pilot-plan-261112).

| Remaining work or decision | Boundary |
| --- | --- |
| Real codebase-context pilot | Approved 261112 with the scope above. Install and import edits still need approval inside the target chat. Retiring source lists needs separate approval |
| Chat-history mining | Optional second `/wt-import` run, now or later. Compare findings with current tracking and pass-1 reports. Propose context additions, duplicates and conflicts before approved merges. Bounded scanning and kit procedure changes remain unimplemented |
| Approve the rest, pause, incomplete reporting, overrides, install priority question, import Priority column | Not tested end to end. The dev chose 261110 not to run more sandbox tests. Watch for them during real use |
| Later vsc-chat-tool and proj-ent-cfg-test pilots | Keep the real sister projects read-only outside approved pilot scope. A frozen-old-log test on a copy remains an option |
| Fuller checker | Planned after the pilot: statuses, Closed lookup and pinned line-link checks. The minimal checker isn't that implementation |
| Weak-model fallback test | Deferred unless its expected value justifies another run or the stray load recurs |
| Shared-project private mode, upgrades and board UI | Deferred. Don't expand the kit before real use justifies them |

## References

- [Kit README](../../work-tracking-system/README.md), [INSTALL](../../work-tracking-system/INSTALL.md), [dashboard](../../work-tracking-system/work-tracking/dashboard.md) and [WI-001](../../work-tracking-system/work-tracking/items/WI-001-portable-kit.md).
- [Kit decision source](../../work-tracking-system/work-tracking/notes/decisions-source.md) and [original inventory and alternatives](../../work-tracking-system/work-tracking/notes/inventory-and-options.md).
- [Checker source](../../work-tracking-system/template/work-tracking/check-tracking.mjs) and [checker tests](../../work-tracking-system/test/check-tracking.test.mjs).
- [First Local status export](../temp-tool-output/261110-1510-local-test/261110_wt-status-command-usage_21bb24f8.md) and [first Local triage export](../temp-tool-output/261110-1510-local-test/261110_wt-triage-command-usage_e47df75c.md).
- [Narrow update export](../temp-tool-output/261110-1620-1109-retest/261110_Update-work-tracking-files-plan_a644a043.md) and [Local triage retest export](../temp-tool-output/261110-1620-1109-retest/261110_wt-triage-command-usage_9d51e30b.md).
- This chat's planning and review context was summarized from checkpoints 001, 006 and 007. No chat transcript was copied into this topic.
- The original long dashboard row remains in exporter Git history at `2a8b2c5`. Read it with `git show 2a8b2c5:work-log.md`.

Sibling-project links require the local checkout layout. The session exports are ignored local evidence and won't accompany a normal clone.