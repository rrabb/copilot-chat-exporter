# Project work dashboard

**Published project memory.** This dashboard and the three linked handbook/topic records establish the approved C1/C2 structure. Project-memory migration remains incomplete. Product priorities below are provisional suggestions, not approved ordering.

## Purpose and reading order

Use this page to find current work, its condition, and its next action. Read a linked topic for goals, rationale, and findings. Read the [handbook](work-items/README.md) for terminology and maintenance rules. The [product goal](docs/SPEC.md#project-goal-and-scope) and [current behavior](README.md) remain in product documentation.

Each identity appears once below. Row anchors remain stable when statuses change. Missing topic links mean the row currently carries enough context, not that a file is missing. WI-005 and WI-011 are unallocated. WI-004 includes the previously separate metadata-overflow proposal; the optional listing-model thought has no identity yet.

## Current focus

The four approved C1/C2 documents are published. The immediate next step is promotion review, instruction adoption review, and approval of the next migration batch. The [transition entry](#wi-001) records that gate. C3-C5 and standing-instruction adoption are not authorized by this promotion. No product investigation is automatically Next. Product priorities remain subject to user selection.

The dashboard owns status, proposed priority, waiting/revisit conditions, and next action. Topics do not repeat those fields. Historical table numbers and aliases help find evidence but do not determine present status. The ten completed entries below describe delivered scope; separate acceptance and evidence questions remain independently visible.

## Waiting

| Identity and outcome | Status | Proposed priority | Condition and next action |
| --- | --- | --- | --- |
| <a name="wi-001"></a>**WI-001 Project-memory transition** | Waiting | High | User review of this promotion. Review the dashboard, handbook, and two topics, then review instruction adoption and approve the next migration batch. C3-C5 remain unauthorized; the broader transition is incomplete. |
| <a name="wi-003"></a>**WI-003 Remaining manual acceptance** | Waiting | Medium | User access to required manual checks. Recover outstanding UI/print/browser checks from legacy #13, #5/#6/#8 receipts, and compressed-report viewer limits. Separate required acceptance from untested platform coverage and agree a bounded checklist before execution; don't reopen completed implementation. |
| <a name="wi-007"></a>**WI-007 Remaining inventory evidence** | Waiting | Medium | Evidence for placeholder/child identity cases. Identify the exact unverified inventory cases from legacy #7, separate unavailable records from parser faults, and define an approved evidence capture. Selection implementation is already delivered. |
| <a name="wi-009"></a>**WI-009 Anonymized report fixture** | Waiting | Low | Approval needed for proposed synthetic/design fixture work. Agree useful report states, privacy checks, and acceptance before creating it. Alias: `next-design-fixture`. Fixture creation still requires separate approval. |
| <a name="wi-025"></a>**WI-025 Historical tool-identity closure check** | Waiting | Low | Privacy-safe linkage to the original 1,040/1,039 case. Record whether it matches the request-slot verifier correction in `a23fe4e`; don't infer a new exporter bug from stale counts. Alias: `next-local-toolcall-mismatch`. |

## Backlog

| Identity and outcome | Status | Proposed priority | Next action and boundary |
| --- | --- | --- | --- |
| <a name="wi-002"></a>**WI-002 Documentation consistency** | Backlog | Medium | Reconcile deferred policy wording and completed receipts in docs after agreeing each policy. Legacy #12; aliases `exporter-docs`, `next-acceptance`. Documentation agreement must not silently approve a product change. |
| <a name="wi-006"></a>**WI-006 [Persisted-resource clipping](work-items/WI-006-persisted-resource-clipping.md)** | Backlog | Medium | Request a bounded synthetic investigation of thresholds, Unicode excerpts, resource association, and accounting. Document alternatives and seek an owner decision or deferral/acceptance disposition. Priority remains unapproved; remediation is outside this item. |
| <a name="wi-008"></a>**WI-008 Browser timeout investigation** | Backlog | Low | If the intermittent timeout recurs, isolate parallel-load and readiness effects with a reproducible case. Legacy alias `next-browser-parallel-flake`. No confirmed product fault or browser workaround is recorded. |
| <a name="wi-010"></a>**WI-010 Graph refresh** | Backlog | Low; Quick win | If graph tooling will be used, refresh it against the chosen source revision and check coverage. Legacy #32, alias `next-graph-reindex`. Optional maintenance, not an export prerequisite. |

## Deferred

| Identity and outcome | Status | Proposed priority | Revisit condition and next action |
| --- | --- | --- | --- |
| <a name="wi-004"></a>**WI-004 Fidelity-policy research** | Deferred | Medium | User resumes policy work. Reconcile `--high-fidelity`, `--no-redact`, extra-metadata thresholds, omission notices, and companion redaction before implementation. Includes former WI-005 proposal; aliases `exporter-local-fidelity`, `next-local-fidelity`. |
| <a name="wi-012"></a>**WI-012 Compact evidence experiment** | Deferred | Low | User requests another report-size experiment. Compare a compact evidence record/renderer with accepted output and access requirements. It is not unfinished original #35 duplication reduction. |
| <a name="wi-013"></a>**WI-013 Batched compressed insertion** | Deferred | Low | User authorizes a bounded compressed-report experiment. Measure insertion/readiness behavior without changing recorded results or current default delivery. Keep it separate from delivered gzip/Brotli support. |
| <a name="wi-014"></a>**WI-014 Inline-image presentation** | Deferred | Low | User reviews an image-display proposal. Agree display/readability behavior separately from keeping recorded image bytes. Existing image companion delivery is complete; no resizing or new loss policy is approved. |

## Closed-work lookup

Completed work keeps its identity. These entries summarize outcomes rather than every validation run. Manual acceptance is WI-003. Unknown future evidence does not make every delivered parent Active.

| Identity | Status | Delivered boundary and legacy pointers |
| --- | --- | --- |
| <a name="wi-015"></a>**WI-015 Discovery, roots, and selection** | Done | Approved discovery/root and explicit Local selector work delivered. Legacy #1/#5-7/#22. Residual inventory evidence is WI-007, not a reopened selector implementation. |
| <a name="wi-016"></a>**WI-016 Offline listings and evidence design** | Done | Approved offline report layout and evidence behavior delivered. Legacy #8/#17-19/#23/#25-30. Manual acceptance and optional design fixtures have separate entries. |
| <a name="wi-017"></a>**WI-017 Detailed-report duplication reduction** | Done | Original #35 duplication reduction delivered. Compact evidence experimentation remains WI-012; it is not a completion criterion added after delivery. |
| <a name="wi-018"></a>**WI-018 Compressed report delivery** | Done | Gzip/Brotli report delivery and hardening delivered. WI-013 is a separate experiment, not missing basic compressed-report support. |
| <a name="wi-019"></a>**WI-019 SDK export and usage** | Done | Approved SDK export/usage scope delivered, including legacy #9/#20. Optional or newly discovered policy work does not expand this original outcome. |
| <a name="wi-020"></a>**WI-020 Local recorded-content fidelity** | Done | Approved text/input/error fixes and identity-keyed terminal deltas delivered, including `b1bcb61`. Legacy #15/#16 and `next-terminal-delta`. Fidelity-policy decisions and resource clipping remain WI-004/WI-006. |
| <a name="wi-021"></a>**WI-021 Source-aware verification** | Done | Delivered source-aware checks, parser/fuzz/scoring work, and request-slot verifier correction. Legacy #10. Exact historical mismatch closure is WI-025, not a claim that the whole verifier remains unfinished. |
| <a name="wi-022"></a>**WI-022 [Frozen captures, cache, and cleanup](work-items/WI-022-source-captures-cache-cleanup.md)** | Done | Frozen inputs, selected captures, saved-file verification, retention/receipts, isolated testing, and approved safe cleanup delivered. Related diagnostics/demo are WI-023. |
| <a name="wi-023"></a>**WI-023 Failed-export diagnostics and demo** | Done | Failure publication, private diagnostic logs, build identity/local times, cached-log cleanup, and repeatable synthetic demo delivered through the latest receipts. |
| <a name="wi-024"></a>**WI-024 Recorded image companions** | Done | Recorded Local/SDK image-byte companions and independent hash checks delivered. This does not authorize image redaction, resizing, or a new presentation policy. |

## Historical evidence

The [legacy root log at the promotion baseline](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L3) and [archive](work-log-archive.md) keep earlier goals, decisions, rejected approaches, receipts, and research requirements discoverable. Read the relevant section when needed, not both logs by default. Older pending statements can be superseded by later receipts. The archive remains unchanged; full topic migration and reconciliation of its old root-heading links await a separately approved batch.
