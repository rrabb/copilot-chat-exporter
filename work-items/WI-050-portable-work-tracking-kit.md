# WI-050 Portable work-tracking kit

## At a glance

- **Goal:** reuse this project's lightweight work-tracking system in new and existing projects, without building a Jira replacement.
- **Owner:** [the exporter dashboard](../work-log.md#wi-050) owns this item's status, priority and next action.
- **Implementation:** the sister repository [work-tracking-system](../../work-tracking-system/README.md) owns the kit. Its [WI-001](../../work-tracking-system/work-tracking/items/WI-001-portable-kit.md) holds the full decision registry.
- **Evidence through 261110:** templates, installation guidance, five skills, four procedures and a minimal checker exist. Sandbox install/import and Local status/triage runs were reviewed in this chat.
- **Latest kit evidence checked 261112:** `1e09312` records the README quick start, commands, FAQ and pilot outcome. Its priority rules remain project-specific.
- **Real pilot 261112:** install and import ran on codebase-context, and the commits were pushed. The resulting tracker is usable. The review records changed test conditions, a publication-check gap and findings K1-K5 with their evidence limits. See [Real codebase-context pilot](#real-codebase-context-pilot-261112).
- **Accepted 261110:** the dev accepted decisions 30 and 31, including their behavior, and stopped further sandbox testing. The accepted handoff is recorded at `63bda59`.
- **Next:** about 2 weeks of normal use in codebase-context, per the [pilot plan](#pilot-plan-261112). A stronger publication check for private-source imports (K1) is proposed, not approved.
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

### Real codebase-context pilot (261112)

Reviewed 261112 from Copilot SDK/CLI session `2c407ad4-23ca-4409-a544-68f8cbdfc28f` (Agent Host ID `0cfb6154-dfb1-4311-a250-24d100cca0b2`), session checkpoints and the target repo at `42247e9`. Install and import ran in one chat. Three commits exist, and the remote-tracking reflog records an update by push at 261112-175237 -5. **Result: install and import produced a usable tracker, with limits on approval evidence and test coverage.**

| Check | Result | Evidence |
| --- | --- | --- |
| Install safety | ✅ Clean tree checked first. 17 new files, no overwrites, `.gitignore` gained `temp-tool-output/`. One question at a time: mode, areas, hook, priority rules, then the file plan. The agent restated the free-text area answer before using it | Session events; commit `ed66150` |
| Install stamp and checker | ✅ Handbook stamp `63bda59 on 261112`. Priority rules confirmed 261112. `check-tracking.mjs` passes on the dashboard and 2 topics | Target `handbook.md` L3, L55; checker run 261112 |
| Install handoff | ✅ The agent said to fully quit VS Code and run `/wt-import` in a fresh chat on a strong model | `events.jsonl` line 424 |
| Import size | 36 candidates: 20 WI rows, 12 Inbox, 3 rejected, 1 left for later. 24 more findings screened out with evidence | Import report Summary |
| Vendor and completed-work filtering | ✅ 2 quoted Esri TODOs rejected as third-party. Done items and cpe-exb app work screened out. This isn't a completeness audit of all source chats | Report D1-D2 and Screened out |
| Context to resume | Rows carry descriptions, priority, dependencies and import links. The two Next rows state their next action. Not every backlog row has a separate next-action sentence | Target dashboard |
| Duplicates merged | ✅ Merges noted in candidate rows, for example A8, B2 and B7. All 25 sandbox candidates mapped to this import (R1-R9) | Report L67, L78, L83, L203 |
| Source link per item | ⚠️ WI rows link the report file, not the candidate row. Inbox lines have no source link | Target dashboard |
| Retire with separate approval | A separate proposal is recorded, and the report/checkpoints say it was approved. Its answer text is elided in the surviving hook record. Three banners were added, leaving the old lists unchanged. README and `docs/temp` lists stayed as reference | Hook at `events.jsonl` L1337; report Outcomes; commit `42247e9` |
| Commits | ✅ Three commits with no coauthor trailers. Hook results confirm the three-commit choice and the date-correction/rebuild approval. Checkpoint 4 records the fixup and autosquash | Hooks at L1530 and L1724; Git history; checkpoint 4 |
| Priority question and Priority column | ✅ Install asked for priority rules. The report's WI table has a Priority column | Install events; report L124 |
| Review under 30 minutes | ❓ User review time wasn't measured. The initial approval question covered 30 candidates; six were added later. The import interaction lasted about 75 minutes, including scanning, questions, investigation and commits | Hook at L1133; report; event timestamps |
| Normal use after import | ✅ The same chat later planned WI-021 with a tracking-fields question. The dev changed its priority to High | Target dashboard L46 |

Differences from the [pilot plan](#pilot-plan-261112). The broader source scan was chosen by the dev. The missing per-item publication flag is a review gap, not an assumed approval to skip it.

| Plan | What happened | Effect |
| --- | --- | --- |
| Fresh chat after install and a VS Code restart | `/wt-import` ran in the install chat 4 minutes later. No skill content was attached, so the agent read `SKILL.md` and `import.md` itself | Fresh-chat slash-command loading is still untested on a real project. The fallback worked with full context |
| Strong model, not Auto | Fusion routing named `claude-opus-5.5` as primary, with a review/repair route. Three research subagents resolved to `gpt-5.6-luna` | Not a single-model trial. This result doesn't guarantee future Auto choices |
| Pass 1 without chat history | The dev included ignored `docs/temp/` and related chats. The report says 49 chats were filtered to 12, plus 3 transcripts read by 3 subagents. Extracts were clipped to work-marker lines | Offering chat mining afterward and repeat-import merging weren't exercised. This was a bounded scan, not full reading of every conversation |
| Privacy flag per item from ignored sources before commit | The report says chats are paraphrased and cited by date. It has no per-item publication flag | A scan of the 11 committed tracking files at `42247e9` found no Windows absolute-path or email-pattern matches. This doesn't certify privacy, licensing or absence of other confidential details |

Kit findings and proposals. Recording them doesn't approve implementation. K3 and K5 aren't confirmed defects.

| # | Gap | Why it matters | Possible fix |
| --- | --- | --- | --- |
| K1 | No per-candidate publication check for imports from ignored files or private chats | `import.md` already requires access approval when needed and forbids quoting secrets, credentials or personal data. Those rules don't make every private-source detail suitable for publication | Extend the existing rule: label private-source candidates and review their proposed public text before commit/push. Access approval isn't publication approval |
| K2 | No bounded chat-extraction procedure | This run wrote a journal extractor and clipped the inputs. Another agent needs to know what was scanned or skipped | Add bounded-read and omission-reporting guidance. Consider existing tools before writing another extractor, without requiring this exporter |
| K3 | Verification resumed after compaction | Checkpoint 4 describes `/wt-import` as invoked again. The available main conversation records don't establish whether this was a fresh request or replayed context | Watch during normal use. Don't diagnose a compaction bug from the checkpoint wording alone |
| K4 | Report links point to the file, not the candidate | Readers must search the report for C2 or A8 | Low. Anchor each candidate row, or leave as is |
| K5 | WI-021 is High and depends on Medium WI-018 and WI-019 | The dev chose High. The handbook doesn't require dependencies to inherit priority, and Do after records the order | No confirmed rule violation. Revisit only if work ordering becomes confusing |
| K6 | Install and import cost about 1,356 credits. The kit gives no cost guidance | The dev asked for cheaper subagents, and they were used. Their recorded calls cost about 0.2% of recorded per-call credits. Primary and repair calls account for most recorded costs | See [Credit use](#credit-use-in-the-real-pilot). Possible: name one model or use a lower Fusion effort, run import in a fresh chat, and have subagents return compact candidate tables |

#### Credit use in the real pilot

Cost, from cumulative usage checkpoints (observed here): install and hook Q&A 247.47 credits, import 1,108.39, and later activity 479.98. Total 1,835.84 credits and 33 recorded premium requests through 261112-193257 -5. Credits are nano-AIU divided by 1e9. Phase costs are differences between checkpoints at `events.jsonl` L574, L1888 and L2833, not sums of cumulative totals. The later phase includes WI-021 discussion and session-info requests.

**Why it cost this much (observed here, 261112).** Per-call `session.usage_record` entries, grouped by phase and model. Phases split at the same checkpoint lines. Probe scripts: `temp-tool-output/261112-2005-credit-probe/`.

| Phase | Model (role) | Effort | Calls | Credits | Largest input (tokens) |
| --- | --- | --- | --- | --- | --- |
| Install | `gpt-6-astra` (main, Auto/Fusion) | max | 24 | 246.3 | 75,133 |
| Install | `gpt-6-luna` (main, light steps) | medium | 10 | 1.1 | 67,392 |
| Import | `claude-opus-5.5` (main, Fusion primary) | xhigh | 119 | **774.0** | 187,998 |
| Import | `gpt-6-astra` (Fusion repair solver) | xhigh | 13 | **237.2** | 116,528 |
| Import | `gpt-6-sol` (Fusion judge) | high | 4 | 3.5 | 14,947 |
| Import | `gpt-5.6-luna` (3 explore subagents) | low | 11 | **2.9** | 43,360 |
| Later | `gpt-6-astra` (main) | varies | 17 | 336.2 | 147,942 |
| Later | `gpt-6.1-sol` (main) | medium | 30 | 77.5 | 157,406 |
| Later | `gpt-6-luna` (main) | medium | 5 | 0.2 | 14,084 |

Per-call records add up to ~1,678.9 credits. The checkpoints total 1,835.8. The ~157-credit gap is **unknown**. It may be calls without usage records, for example during the sparse interval below. Don't treat the per-model split as complete.

Price per million tokens, in credits, from the same records:

| Model | Input | Cache read | Cache write | Output |
| --- | --- | --- | --- | --- |
| `gpt-6-astra` (max) | 700 | 70 | 875 | 3,500 |
| `claude-opus-5.5` (xhigh) | 280 | 14 | 350 | 1,400 |
| `gpt-6-sol` / `gpt-6.1-sol` | 140 | 14 / 7 | 175 | 700 |
| `gpt-5.6-luna` | 20 | 2 | 25 | 120 |
| `gpt-6-luna` | 7 | 0.7 | 8.75 | 35 |

What drove the spend:

| # | Driver | Evidence | Share |
| --- | --- | --- | --- |
| 1 | **Fusion selected `gpt-6-astra` for primary and repair work.** Its recorded input and output prices are 2.5x Opus; cache reads are 5x | 41 primary calls cost ~582.5 credits. 13 import repair calls cost ~237.2. The import judge was `gpt-6-sol`, not Astra | ~819.7 credits, ~49% of recorded per-call credits |
| 2 | **The Opus main agent did the import itself**: 119 calls, each re-reading a context that grew to ~188K tokens | 12.2M cache-read tokens (~171 credits), 873K cache-write (~306), 184K output incl. 98K reasoning (~257) | ~774 credits, ~46% |
| 3 | **Cache writes**: Opus cache writes cost 25x cache reads in these records | 873K Opus cache-write tokens. Growth, model switches and expiry can affect caching, but the cause of each write wasn't checked | Part of driver 2 |
| 4 | **Install and import in one chat**, so the install context carried into the import | Plan asked for a fresh import chat. The run didn't do that | Not measured separately |
| 5 | Subagents | 3 `explore` agents on `gpt-5.6-luna` low. `subagent.completed` at L959 and L969 shows ~44-50K tokens each | ~2.9 credits, ~0.2% |

**Correction:** An earlier review attributed all Astra costs to Fusion review/repair at max effort. That was wrong. The install used Astra as the primary solver, and the import used it for repair at xhigh effort. The import judge used `gpt-6-sol`. See `events.jsonl` L4, L214, L575, L1651 and L1767. Recorded judge calls cost ~3.5 credits. Avoiding review could also avoid repair, but its cost and quality value cannot be predicted from this one run.

**Conclusion.** The cheaper subagents worked as asked. Their recorded costs were a small share. Astra primary and repair calls and the Opus primary calls account for most recorded per-call credits. The missing ~157 credits limit the breakdown.

Ways to cut cost, not yet tested or approved:

| Option | Expected effect | Risk |
| --- | --- | --- |
| Pick one model (for example Opus 5.5 or `gpt-6.1-sol`) instead of Fusion | Avoids Fusion's automatic judge and repair phases for the main request | The chosen model must still do the work. Savings and quality weren't measured |
| Try Fusion Standard instead of Max | May reduce cost while keeping automatic model selection | Savings and quality weren't measured. GitHub describes Standard as one model per task, but this session recorded a Standard cascade at L1899 |
| Run import in a fresh chat, as the plan said | Smaller context on every call | Needs the dev to follow the two-chat flow |
| Have subagents read sources and return compact candidate tables. The main agent only merges, asks and files | Fewer, shorter main-agent calls | Cheap models may miss or misread candidates. Needs a spot check |
| Lower main-agent reasoning effort (xhigh to high) for filing steps | Fewer reasoning tokens | Lower judgment quality on merges |
| Keep related steps close together when practical | May avoid cache expiry and repeated cache writes | Cache lifetime and actual savings vary. Hard to control in spare-time sessions |
| Pre-extract chat history with a script before import | Agent reads less raw text | Overlaps K2. Adds a tool step |

**Evidence limit:** Between about 261112-1651 and 261112-1750 -5, the file lacks ordinary main-conversation message and tool-execution records. Hooks, usage, fusion and system records remain. Hooks include question text and some answers: the field approval at L1229, reconciliation at L1432 and date-rebuild approval at L1724. Other answers, including the initial batch and retirement choice, are replaced with elision markers. Their exact choices can't be independently checked from those hook results. This is partial evidence, not proof that every question was lost or that the host failed to write them.

**Exporter check:** The saved export failed Layer D with 125 reported gaps and seven unhandled event types. That doesn't establish why the conversation records are sparse or prove 125 source events were lost. Both questions are in the exporter's Inbox.

**Git boundary for this review:** The extraction and pilot plan were committed as `da37fbc` at 261112-193649 -5 while review was underway. At recheck, the shared dashboard snapshot, index and that commit had the same dashboard blob (`8a536766`). The topic index blob also matched that commit (`143e10fa`). The pilot findings were unstaged additions on top. No index modification or history rewrite was needed.

### Corrections and evidence gaps

- The kit's own decision-29 follow-up is no longer uncommitted. `6dc9f5a` records it.
- The creator of sandbox `.chat-history/` exports is unknown. An earlier dashboard attribution to an unrelated tool was too strong. The `.vscode/` folder's creator is also unverified.
- The import fallback was revised because models could call a hidden manual skill and load the wrong workflow. The successful strong-model retest doesn't prove weak-model behavior.
- The checker catches detached WI rows and local inline file links. It doesn't validate heading fragments, reference-style links or the correctness of agent decisions.
- The first Local run's structured question answers existed in the journal but weren't rendered by the exporter. This is separately recorded in the [Inbox](../work-log.md#inbox), not fixed by the kit.
- The exporter's prompt migration is [WI-051](WI-051-prompt-to-skill-migration.md), not additional kit scope. Its commit doesn't establish kit acceptance.

## Resume point

Read the kit's current [dashboard](../../work-tracking-system/work-tracking/dashboard.md) and [topic](../../work-tracking-system/work-tracking/items/WI-001-portable-kit.md#resume-point) before issuing another implementation prompt. Check its Git state again because other sessions work there.

The real pilot ran 261112 and is reviewed under [Real codebase-context pilot](#real-codebase-context-pilot-261112). The recorded target install/import evidence is `42247e9`. Kit evidence `1e09312` records the README 60-second tour, Quick start, command table, model and cost guidance, FAQ and post-pilot handoff. README cost guidance addresses part of K6. Procedure changes for K1, K2 and K6 remain proposed, not approved. Next: about 2 weeks of normal use, logging friction in the target's Inbox. Before another import or heavy session, choose a model and effort level using the [recorded credit-use findings](#credit-use-in-the-real-pilot).

On 261112, the dev approved copying the file-based Tracking-line rule, post-commit reconciliation and commit-evidence rule into the exporter handbook, with matching Tracking wording in AGENTS.md. These edits were applied. The answer-interpretation rule was excluded. The exporter layout, priority rules, skills, procedures and checker stay unchanged. Review and acceptance of these exporter edits remain.

On 261112, the dev also approved adding kit-ownership pointers to AGENTS.md and the local handbook. The pointers distinguish the reusable kit's authority from the local rules and require approval before copying updates. Both pointers were added.

| Remaining work or decision | Boundary |
| --- | --- |
| Real codebase-context pilot | Install and import produced the recorded tracker. Normal use and the dev's acceptance remain. K1-K4 and K6 are possible follow-ups; K5 isn't a confirmed defect |
| Chat-history mining | Ran in pass 1 by the dev's choice. A later repeat `/wt-import` can still test merging into existing items. Bounded scanning guidance (K2) isn't in the kit |
| Approve the rest, pause, incomplete reporting, overrides | Not tested end to end. The install priority question and import Priority column were exercised 261112. Watch for the rest during real use |
| Later vsc-chat-tool and proj-ent-cfg-test pilots | Keep the real sister projects read-only outside approved pilot scope. A frozen-old-log test on a copy remains an option |
| Fuller checker | Planned after the pilot: statuses, Closed lookup and pinned line-link checks. The minimal checker isn't that implementation |
| Weak-model fallback test | Deferred unless its expected value justifies another run or the stray load recurs |
| Shared-project private mode, upgrades and board UI | Deferred. Don't expand the kit before real use justifies them |

## References

- Real pilot SDK/CLI session `2c407ad4-23ca-4409-a544-68f8cbdfc28f`, distinct from Agent Host ID `0cfb6154-dfb1-4311-a250-24d100cca0b2`. Source: its local `events.jsonl` and checkpoints 001 and 004.
- [Real pilot import report](../../codebase-context/work-tracking/notes/261112-1653-import/import-report.md), [target dashboard](../../codebase-context/work-tracking/dashboard.md) and [target handbook](../../codebase-context/work-tracking/handbook.md). Git checks use `42247e9`, not the later uncommitted WI-021 additions.
- [Saved export verification failure](../temp-tool-output/261112-1935-codebase-context-pilot/failed-2c407ad4-23ca-4409-a544-68f8cbdfc28f-261112_193453.log). The export is incomplete and isn't a substitute for checking the event records.
- [Kit README](../../work-tracking-system/README.md), [INSTALL](../../work-tracking-system/INSTALL.md), [dashboard](../../work-tracking-system/work-tracking/dashboard.md) and [WI-001](../../work-tracking-system/work-tracking/items/WI-001-portable-kit.md).
- [Kit decision source](../../work-tracking-system/work-tracking/notes/decisions-source.md) and [original inventory and alternatives](../../work-tracking-system/work-tracking/notes/inventory-and-options.md).
- [Checker source](../../work-tracking-system/template/work-tracking/check-tracking.mjs) and [checker tests](../../work-tracking-system/test/check-tracking.test.mjs).
- [First Local status export](../temp-tool-output/261110-1510-local-test/261110_wt-status-command-usage_21bb24f8.md) and [first Local triage export](../temp-tool-output/261110-1510-local-test/261110_wt-triage-command-usage_e47df75c.md).
- [Narrow update export](../temp-tool-output/261110-1620-1109-retest/261110_Update-work-tracking-files-plan_a644a043.md) and [Local triage retest export](../temp-tool-output/261110-1620-1109-retest/261110_wt-triage-command-usage_9d51e30b.md).
- This chat's planning and review context was summarized from checkpoints 001, 006 and 007. No chat transcript was copied into this topic.
- The original long dashboard row remains in exporter Git history at `2a8b2c5`. Read it with `git show 2a8b2c5:work-log.md`.

Sibling-project links require the local checkout layout. The session exports are ignored local evidence and won't accompany a normal clone.