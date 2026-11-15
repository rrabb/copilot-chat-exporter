Part of WI-053, found while working on: validating Fusion export against recorded sessions and a portable synthetic regression set.

# WI-054 Fusion census and golden fixtures

Canonical entry: [WI-054](../work-log.md#wi-054).

## At a glance

- **Goal:** inventory recent Agent Host/Copilot CLI Fusion records with a reproducible command, then small synthetic fixtures that test their handling.
- **Approved, 261114:** save the research, choices, alternatives and plan here, and begin implementation.
- **Origin:** promoted the 261113 dashboard Inbox census proposal here on 261114.
- **Review gate:** the developer reviewed the matrix, representative findings and scope choices, then approved the focused handling/core-edge golden profile on 261114. Implement in independently reviewed slices.
- **Implementation outcome, 261114:** census, focused compatibility and five synthetic golden views passed independent review and final checks. Review the [fixture guide](../test/fixtures/sdk-golden/README.md) and remaining evidence limits before acceptance.
- **Scope:** Agent Host and Copilot CLI event sources covered by WI-053. Report discovery limits rather than claim coverage of inaccessible machines or stores. Local journal compatibility and broader listing/filter design remain outside this child.
- **Ownership:** one implementation worker at a time for scripts, tests and product docs. Coordinator reviews, runs independent checks and maintains tracking. Workers share this working tree, not isolated copies.
- **Estimate:** proposed size L for the complete follow-up. Allow roughly 2-4 hours for a first census/tooling pass. Fixture count, remaining effort and runtime are unknown until discovery.
- **Accepted and closed, 261115:** the developer accepted WI-054, its three completed children and WI-053's original four-phase implementation. Recorded coverage and retention limits remain unchanged.

## Original goal

Create synthetic Fusion golden fixtures based on the unique recorded structures, values, ordering and relationships found in recent chats. Public definitions guide valid examples. Native records establish what the installed producers actually persisted. Don't copy private chat prose into committed fixtures.

## Decisions and choices

| Choice | Decision and reason |
| --- | --- |
| Real chat access | Developer permits read-only use of real Fusion chats from the preceding three weeks. Never change session stores or their databases. |
| Eligibility | Use Fusion activity within the fixed window, including sessions created earlier. Don't select by creation date or file modification time alone. |
| Fixed end | `2026-11-13T23:43:55.092-05:00`, or `261113-234355 -5`. Don't move the end when running later. |
| Fixed start | End minus 504 hours: `2026-10-24T00:43:55.092-04:00`, or `261024-004355 -4`. The offset difference is daylight saving time. |
| Boundary convention | Include both exact endpoints. Test the boundaries and the adjacent excluded instants. This makes the selected interval reproducible. |
| Context | Older records may explain identities, settings and relationships. Never count them as in-window observations. Preserve context separately from window counts. |
| Retention revision, 261114 | Developer chose inventory plus representatives after the native-size preflight. Scan all sources, keep private inventories/provenance/hashes, and don't copy full native logs during this pass. Choose a small representative set later. |
| Replay tradeoff | Hashes identify the scanned bytes but cannot reconstruct them. The full census cannot be replayed if uncopied originals change or disappear. Mark inventory-only reports as not replayable from frozen inputs. |
| Discovery | Use actual structured Fusion events/metadata or recorded synthetic model selections. Model switching and quoted mentions of Fusion aren't sufficient evidence. Report context-only and ambiguous candidates separately. |
| Inventory | First collect every recorded field/type variant across all event types in qualifying sessions. Don't prefilter by current exporter support or a guess about relevance. |
| Meaningful differences | Include absence/null/zero, empty containers, enum/configuration values, exact text equality versus whitespace differences, ordering, identity, scope and conversation relationships. Keep arbitrary text/identifiers private. |
| Handling | Every observed variant gets a disposition: render, account, use structurally, approved exclusion, or unsupported/unknown with a diagnostic. Classification isn't proof of complete semantic understanding. |
| Public references | Use pinned documentation/source/tests as scenario references. They aren't a complete execution state machine or a stable cross-version persistence specification. |
| Evidence classes | Separate observed cases, upstream-supported but unobserved cases, and hypothetical defensive cases. |
| Fixture design | Compatible scenarios can occupy separate turns of one merged synthetic chat. Keep conflicting histories, incompatible versions and exceptional cases separate. Don't invent combinations merely to reduce fixture count. |
| Golden expectations | Review intended behavior independently. Don't bless current exporter output automatically or weaken verification to make it pass. |
| Matrix sequencing, 261114 | Developer reviewed the matrix summary and chose representative/policy review before fixtures. The coordinator bounded this pass to at most four native sources, no full-log copies and no parser changes. This isn't fixture-creation approval. |
| Implementation profile, later 261114 | Developer selected `focused-and-goldens`: implement WI-056 compatibility, then WI-055 readable event/catalog notes, then core/edge synthetic goldens. Extending listed existing edits is approved. No default catalog omission, broader per-call archive, Git operations or item closure. |
| Existing Local golden | Keep it intact unless a necessary shared change is reviewed. An SDK log cannot simply replace its input. |
| Privacy | Native/frozen inputs, raw inventory keys/values, source paths and identities stay in ignored private run folders. Only reviewed synthetic data and sanitized findings may be tracked. |
| Git safety | No staging, commits, pushes, worktrees, merges, history changes or file deletion without separate approval. Keep existing edits. |

## Work tree

Progress as of 261115: 3 of 3 child items done. WI-055, WI-056 and WI-057 passed independent review and were accepted and closed by the developer.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-056 Fusion routing and receipt fields](WI-056-fusion-routing-and-receipt-fields.md) | [build] | S | - |
| 2 | [WI-055 New agent event families](WI-055-new-agent-event-families.md) | [build] | M | - |
| 3 | [WI-057 Local golden scratch isolation](#wi-057-local-golden-scratch-isolation-261115) | [build] | S | - |

## Options and tradeoffs

| Option | Pros | Cons / decision |
| --- | --- | --- |
| **Inventory/hashes plus public references, selected frozen representatives, then synthetic fixtures** | Covers observed producer variants and documented workflows while keeping less private data. Portable and reviewable. | Full census replay depends on unchanged available originals. Selected after the developer's retention review. |
| Freeze every qualifying/ambiguous source | Enables complete replay without native originals. | More private copies and disk use. Tooling supports this, but it isn't the chosen native-run policy. |
| Commit a real frozen chat as a golden | Real ordering and relationships. | Private content, unstable producer details and large review cost. Rejected for committed fixtures. Keep frozen private inputs for validation. |
| Use public types/tests alone | Faster, concrete field definitions and replay examples. | Newer snapshots omit older/private records. Unit stubs can omit workflow stages or reuse IDs. Not enough alone. |
| Use recent observations alone | Matches installed producers. | Misses valid but unobserved patterns, failures and future changes. Supplement with labelled upstream/defensive cases. |
| One fixture containing every combination | One output to inspect. | Can represent an impossible history and hide which behavior failed. Rejected. |
| Snapshot current output without semantic checks | Cheap regression detection. | Can lock in omissions or wrong attribution. Rejected as the acceptance rule. |
| Full simulator of all Fusion execution paths | Could enforce a formal model. | No verified complete cross-version specification. High effort with uncertain value. Defer. |

## Research and evidence

### Public upstream references

The [WI-042 reference check](WI-042-fusion-and-future-modes.md#public-fusion-reference-check-261113) corrects the earlier WI-052 search, which missed public Fusion workflow descriptions.

| Reference | Finding | Limit |
| --- | --- | --- |
| [Official Fusion guide, pinned source](https://github.com/github/docs/blob/d59b2631959db46d71ca5f7748ec04311c6d0870/content/copilot/concepts/models/copilot-fusion.md) | **Documented:** Single uses one model. Cascade drafts and judges, then accepts or escalates. Critique combines parallel independent criticism before revision. Patterns can change per prompt. Fusion doesn't start subagents. | Conceptual behavior, not an exhaustive persisted-event sequence. Model and effort selection can change per step. |
| [SDK event definitions](https://github.com/github/copilot-sdk/blob/cf045793958ce674259c557f7769788f94ee20c9/nodejs/src/generated/session-events.ts#L855) | **Inferred from source:** phase kinds include `primary`, `judge`, `repair`, `draft`, `critic`, `revision`, `follow_up`. Scopes include `root`/`review`. Projection modes include `append`/`staged`/`none`. Phase completion is a durable replay checkpoint. | Experimental snapshot targets CLI `1.0.112-0`, newer than S017's `1.0.103-unstable.r41379698026.g3219c66`. Don't require newer fields in older logs. |
| [SDK streaming reference](https://github.com/github/copilot-sdk/blob/cf045793958ce674259c557f7769788f94ee20c9/docs/features/streaming-events.md) | **Documented:** persisted versus ephemeral events, durable `parentId` ancestry, envelope `agentId`, and tool-call correlation. | A live stream isn't an on-disk fixture. `parentId` isn't parent tool-call ownership. |
| [VS Code Fusion replay](https://github.com/microsoft/vscode/blob/4347d45a5a71e1d3c20a953ff727fbc3a4c6b2d1/src/vs/platform/agentHost/node/copilot/copilotFusionReplay.ts) and [identity correlation](https://github.com/microsoft/vscode/blob/4347d45a5a71e1d3c20a953ff727fbc3a4c6b2d1/src/vs/platform/agentHost/node/copilot/copilotFusionEventIdentity.ts) | **Inferred from source:** routing can precede its user message. Workflow IDs and agent-loop turn IDs differ. Replay handles cancellation, delayed events and request ownership. | UI child-chat presentation doesn't prove that a Fusion review is a delegated SDK subagent. |
| [Synthetic upstream helpers](https://github.com/microsoft/vscode/blob/4347d45a5a71e1d3c20a953ff727fbc3a4c6b2d1/src/vs/platform/agentHost/test/node/copilotFusionTestEvents.ts) and [replay tests](https://github.com/microsoft/vscode/blob/4347d45a5a71e1d3c20a953ff727fbc3a4c6b2d1/src/vs/platform/agentHost/test/node/mapSessionEvents.test.ts#L155) | **Inferred from tests:** phase tools/chunks, early routing, cancellation, interruption, delayed events and root/subagent separation are useful scenarios. | Component stubs aren't complete valid histories. UI tests hide some phase text which this archive must keep when recorded. |

Public captures are retained under `temp-tool-output/261113-2350-fusion-upstream-research/`. The checked SDK TypeScript file doesn't contain `session.usage_record` or the observed older commit/checkpoint/handoff event names. Public sources don't establish those persisted formats.

### Existing exporter evidence

- [WI-053 frozen validation](WI-053-agent-host-fusion-export-compatibility.md#implementation-evidence-261113) establishes a bounded stress case, not an exhaustive three-week census.
- The previous WI-052 survey contains 32 selected sources. Don't relabel it as the full requested census.
- The current [golden digest](../src/verify/golden.ts) reads root turns. It doesn't directly digest Fusion note bodies, detached-child bodies or usage. Its `notes` field is supplied annotations, not every parsed note.
- Existing focused tests cover Fusion parsing/rendering, detached children, independent content checks and persisted usage. Map their actual assertions rather than assume that a passing suite covers every new variant.
- Text verification checks content, order and multiplicity, not every text companion's checksum. Image hash verification is separate.
- Native sparse history remains unexplained. Don't reconstruct missing history or attribute it to Fusion without evidence.

### Baseline assertions checked before the census

These are reviewed assertions, not a completed coverage matrix. Their inputs are unit examples, not proof of complete runtime workflows.

| Behavior | Existing assertion | Remaining gap |
| --- | --- | --- |
| Exact same-record projection deduplication and separate equal assistant text | [SDK Fusion tests](../test/sdk-fusion.test.ts#L62) count two output occurrences and check model/effort attribution. | Match observed combinations and versions to valid complete fixture scenarios. |
| Different projection text and handoff content | [Cascade test](../test/sdk-fusion.test.ts#L92) checks both bodies and the repair label. | This doesn't validate the complete Cascade execution sequence. |
| Resolution metadata and object phase plans | [Metadata test](../test/sdk-fusion.test.ts#L531) checks recorded model roles, conditional scopes, null and zero values. | Inventory other producer fields before choosing the fixture records. |
| Linked companion content, presence and order | [Negative companion checks](../test/sdk-fusion.test.ts#L985) reject corrupt, missing, fenced, unlinked or moved required evidence. | Add reviewed golden artifacts without treating this as general checksum authentication. |
| Usage source priority and nested versus detached ownership | [Receipt selection](../test/sdk-usage-record.test.ts#L152) checks partial-ledger priority. [Ownership checks](../test/sdk-usage-record.test.ts#L170) distinguish matched and unmatched calls. | Map all observed receipt variants and retained unknowns to test assertions. |

The coordinator also checked the new raw census against the existing frozen S017 source using `temp-tool-output/261114-0024-fusion-coordination/check-inventory.mts`. Its known hash, recorded event/receipt counts and six Fusion families match. The census includes all 44 event types in that source, not just Fusion records. This remains a one-source smoke check, not the requested native census.

## Phased plan

### 1. Reproducible discovery and inventory

Implement a bounded research command with synthetic tests. Reuse existing discovery and census helpers where suitable. Keep runtime/export behavior unchanged.

- Enumerate accessible native Agent Host/CLI sources, including older-created sessions. Report roots, unavailable/unreadable sources and scope exclusions.
- Select by structured Fusion evidence and event timestamps. Retain ambiguous candidates for review rather than silently discard them.
- Stable-read sources without copying their full bodies during the chosen inventory-only pass. Record SHA-256, byte counts, producer/version and provenance. Detect mutations and report them rather than claim a stable source.
- Inventory all in-window records and field/type variants, including unknown event names, array members and presence denominators. Keep pre-window context distinct.
- Record ordering, identities, projection equality, scope/topology and meaningful configuration values. Don't treat arbitrary text as a safe public enum.
- Identify exact duplicate bytes separately from distinct sources, forks and duplicated histories. Don't invent a combined usage total.
- Report malformed records, invalid timestamps, unknown eligibility and discovery gaps. A partial report must say it is partial.
- Preserve private reports. Choose representative source copies later, checking their hashes against the census before calling them the same evidence. Generate a concise sanitized summary after review.

### 2. Coverage matrix and developer review

Produce `variant -> disposition -> source evidence -> existing assertion -> missing test -> proposed scenario`. Distinguish field/type coverage from semantic understanding.

Candidate scenarios include Single, both Cascade decisions, parallel Critique, pattern changes, root/review scope, projection modes, phase text/tools/chunks, exact equality versus whitespace, missing-parent children, receipt precedence/conflicts, fallback, cancellation/interruption, early routing and delayed events.

Review the actual observed variants before fixing the scenario list or promising a fixture count. Stop for the developer's matrix/scenario review before Phase 3.

### 3. Synthetic fixtures and independent checks

After review, use invented prose/IDs while keeping the meaningful relationships and version rules. Compatible examples may share a synthetic chat across separate turns. Keep observed examples separate from unobserved/defensive cases, and don't merge contradictory versions into one event.

Replacing large bodies must keep the property under test: exact equality or whitespace differences, ordering, identifiers and references, and the 300-line/15-KiB overflow boundary where relevant. A short placeholder cannot test overflow. Generate invented long content for that case rather than keep private prose.

Add normalized SDK/Fusion Markdown and companion goldens, semantic assertions for content/attribution/usage/topology, and negative tests for loss, duplicates, wrong ownership/order and missing artifacts. Don't add a runtime SDK dependency just to validate synthetic data without reviewing that cost.

Existing mechanisms checked before implementation:

- [The current Local golden](../src/verify/golden.ts) owns the committed Local fixture/digest and normalization. Keep it intact. Its digest isn't an SDK note/usage/child oracle.
- [renderSdkExport](../src/session/sdk-export.ts#L45) accepts events, source metadata, deterministic rendering options and supplied ledger rows without opening the native stores. Use this path rather than the convenience loader that discovers a ledger.
- [The test wrapper](../scripts/test.mjs) discovers root-level `test/*.test.ts` files. An SDK golden test there runs under the existing `pnpm test` and `verify` commands. No new public CLI flag is needed.
- Freeze test context and normalize genuine volatile metadata without hiding meaningful source/ownership/companion differences. Pair reviewed Markdown/companion expectations with independent semantic assertions, not a snapshot of current output alone.

### 4. Regression validation and handoff

Run the narrow tests after the first real edit, then `pnpm run verify`. Rebuild generated output if source changes require it. Validate frozen exports and saved artifacts where necessary. Update owning product docs for behavior changes, and this topic/dashboard for findings and limits. Request developer acceptance without closing either work item.

## Done when

- The fixed-window command, private inventory and source hashes report coverage and failures. Reproduction requires unchanged originals except for selected frozen representatives. Inventory-only output never claims complete frozen replay.
- Every observed field/type variant has a disposition and test mapping, with unknown meanings labelled.
- The developer reviewed the coverage matrix and proposed scenarios before fixture creation.
- Reviewed synthetic fixtures cover the selected scenarios without private content or impossible combinations.
- Independent semantic/negative checks cover what the current Local digest misses.
- Targeted tests and required verification pass without weakening checks or changing native data.
- Findings, remaining limits and maintenance steps are recorded. The developer accepts the result.

## Native census findings, 261114

The inventory-only native command completed in 28.2 seconds. It scanned the configured SDK root, which is the same path as the user-default root. It did not copy native event files.

| Measure | Observed result |
| --- | --- |
| Physical sources scanned | 71 |
| Qualified Fusion sources / distinct full-source hashes | 19 / 19 |
| Context-only or unknown candidates | 0 / 0 |
| Unreadable/unstable sources or incomplete roots | 0 |
| In-window records across qualifying sources | 75,272 |
| In-window event families | 57 |
| Distinct event-type/field-path pairs | 12,128 |
| Distinct event-type/field-path/value-type combinations | 12,198 |
| Copied native event files | 0 |
| Fusion resolutions by pattern | Single 55, Cascade 26, Critique 15 |
| Completed phase records | 148: primary 78, judge 23, repair 11, draft 15, critic 15, revision 6 |
| Completed phase scopes | Root 110; review 38 |
| Completed phase projection modes | Staged 110; none 38 |
| Failed phase records | 1, in judge/review scope |
| Persisted usage receipt records | 4,334 |

Counts are physical record occurrences, not deduplicated workflows, model calls or cross-chat usage. Equal full-source hashes weren't found among the qualifying files, but that doesn't rule out forks or copied partial histories. The 96 resolution records and 93 completion records aren't proof of three failures. Correlation and boundary checks remain.

The semantic value collector omitted 5,445 observations through its documented bounds/filters. These occur in `assistant.message`, `tool.execution_start`, hooks and permissions, not the seven observed Fusion event families. Field/type coverage remains complete for parsed records. This is not a claim that every semantic variant is understood. Missingness uses event counts, not counts of parent array members.

An independent name-recognition probe classifies the 57 families as 27 recognized, 12 structural, 14 approved exclusions and 4 unhandled. The four unhandled families have 38 records and now belong to [WI-055](WI-055-new-agent-event-families.md). Recognition isn't field-level correctness or completed test mapping.

### Initial policy matrix

This accounts for all field/type combinations by their event family's current policy. It isn't the finished variant-to-assertion matrix. A recognized family can still have unsupported fields or missing output.

| Current family policy | Families | Records | Field/type combinations | Remaining review |
| --- | --- | --- | --- | --- |
| Recognized | 27 | 27,717 | 5,989 | Map fields and relationships to actual renderer/accounting behavior and assertions. |
| Structural markers | 12 | 10,500 | 406 | Check whether recorded fields fit the existing marker policy. Don't assume every payload is empty. |
| Approved exclusions | 14 | 37,017 | 5,682 | Check exclusion counts and reuse existing tests. No need to put private hook/permission bodies in fixtures. |
| Unhandled | 4 | 38 | 121 | Keep diagnostics and unknowns. WI-055 owns handling decisions. |

### Candidate fixture arrangement

| Candidate | Intended coverage | Evidence boundary |
| --- | --- | --- |
| One merged core chat, with compatible scenarios in separate turns | Single, both Cascade paths, draft-final and revision-final Critique, model/effort changes, normal tools and pattern changes. | Workflow correlation supports these paths. Accept/repair decision meanings remain inferred without literal verdicts. A representative review must confirm producer compatibility before merging records. |
| Archive-boundary cases | Missing-parent children, nested ownership, unmatched usage, redaction and generated long text/companions. | S017 and existing assertions establish several cases. Confirm their variants against the new census. |
| Interrupted/replay cases | Early routing, distinct workflow/agent-loop IDs, cancellation and delayed events. | Public tests establish useful scenarios. Label cases unobserved until a native trace verifies them. |
| Defensive tests | Unsupported versions/fields, malformed values, missing/corrupt/moved companions and contradictory receipts. | Reuse existing negative tests where they already prove the requirement. Don't force invalid histories into the successful core golden. |

This is a proposal, not fixture-creation approval or a promised fixture count.

### Coverage review, 261114

The worker produced a complete private enumeration and a bounded field audit. The coordinator reviewed extraction/mapping logic, inspected parser and test assertions, revalidated compressed input, and independently checked row identities, workflow references and physical chronology. No native logs were opened or copied for this review.

| Check | Result and limit |
| --- | --- |
| Enumeration | All 12,198 unique event-type/path/type rows are present. This isn't a count of features or execution combinations. |
| Field audit | The seven Fusion families and persisted receipts account for 293 reviewed rows. |
| Other fields | 11,905 rows remain `unknown-needs-review`. Event-name recognition or an exclusion policy isn't field-level proof. This pass doesn't claim complete semantic coverage. |
| Direct assertions | The inspected tests directly assert 62 of the priority field/type rows. Another 231 lack a qualifying direct assertion in that inspected scope. These aren't code-coverage percentages or proof that no other tests exist. |
| New gaps | Failed phases remain with WI-055. WI-056 records `selectedRuleId` and six websocket fallback receipt fields. Unknown keys are diagnosed, not silently handled. |
| Archive visibility | Parsed receipt provenance/telemetry isn't equivalent to individual Markdown output. The current cost table aggregates selected calls. Review any new visibility policy separately from usage priority. |
| Independent verification | Focused Fusion, receipt and privacy tests pass. The previous full verification remains applicable because protected implementation files are unchanged. |

The independent review found no source/test correction needed for the census itself. The worker returned `review-addendum.private.json` after feedback: `projectionMode` values `staged`/`none` and nullable `projectionMessage` are different fields. Root/review scope must also stay separate unless the observations are joined within one event. The addendum clarifies packaging without changing matrix counts or conclusions.

#### Correlated workflow evidence

These are groups within a physical source and envelope agent scope, joined by top-level Fusion IDs. They aren't deduplicated operations across copied or forked histories.

| Scenario | Recorded evidence | Limit |
| --- | --- | --- |
| Cascade with primary final | 13 workflows have a completed judge and final source pointing to primary, with no completed repair. | Calling this acceptance is inferred from topology, not a saved verdict value. |
| Cascade with repair final | Ten workflows complete a judge and later repair that becomes final. One more has a failed judge followed by degraded repair. | Literal verdict/error/degraded-reason text needs representative review. |
| Critique | Fifteen workflows each have one distinct completed critic phase. Nine finish with draft, six with revision. | No completed multi-critic workflow is demonstrated. Missing/in-flight phases and parallel execution remain unknown. |
| Pattern changes | Fourteen physical sources record different patterns within the same envelope agent scope. | Record order doesn't establish a setting-change cause or producer-version compatibility. |
| Projection equality | 110 completed-phase observations have exact same-record content/projection equality. Another 38 aren't comparable. | This doesn't establish native whitespace-difference or long-text boundary cases. Keep those synthetic/defensive. |

#### Proposed scenario groups and review gate

The worker proposed 12 scenario groups, not 12 fixtures. Keep compatible successful workflows together and isolate cases with different setup or expected diagnostics.

| Group | Proposed contents | Evidence and gate |
| --- | --- | --- |
| Successful core | Single, Cascade primary-final, Cascade repair-final, both one-critic final paths and per-turn pattern changes. | Observed topology. Review selected representative versions and literal decision fields before freezing expectations. |
| Text and archive boundaries | Exact equality, null projection, distinct/whitespace text, generated long text and companions. | Mix of observed, existing synthetic and defensive cases. Keep the overflow size requirements. |
| Ownership and usage | Missing-parent/nested children, detached ownership, positive receipt fields, source priority and conflicts. | Existing assertions plus observed receipt fields. Don't claim every topology/conflict was newly found in the corpus. |
| Policy-gated exceptions | Failed phase/degraded repair, routing rule field and websocket fallback receipt fields. | WI-055/WI-056 need policy choices. Successful core fixtures needn't wait for every exception. |
| Optional upstream case | Two critics with distinct IDs. | Documented but not demonstrated by this completed-phase corpus. Keep it separate from the observed core. |

**Recommendation:** use the bounded core/edge arrangement rather than audit every arbitrary tool/hook field or create one giant history. First review a small representative set and the known-gap policy. Don't bless missing values merely because current output passes a snapshot. Broader unknown fields and per-call telemetry visibility stay visible as limits or separate choices.

The developer selected that preparation on 261114. The worker completed a four-source review chosen from saved provenance rather than a new corpus scan. Source bytes/hashes were compared with the census. Only targeted structural/configuration evidence was saved, without full logs or verbatim chat/instruction/error bodies. An unchanged original prefix is labelled separately from a changed full file.

This pass asks for producer compatibility, literal verdict/degraded-reason evidence where appropriate, and policies/tests for WI-055/WI-056. It doesn't approve parser changes, native copies, a broader per-call Markdown dump or golden fixtures. Review output belongs under `temp-tool-output/261114-1612-fusion-representatives/`.

Private deliverables are `variant-policy-test-matrix.private.json`, `review-findings-and-scenarios.private.json`, `review-addendum.private.json`, `validation.private.json` and supporting reductions under `temp-tool-output/261114-0130-fusion-matrix/`. The coordinator's independent result is `temp-tool-output/261114-0024-fusion-coordination/matrix-review-02.private.json`. It checks the saved reduction against the matrix; it doesn't independently reparse the 489 MiB JSON. Source references point to the current working tree and need review after source edits.

### Representative review, 261114

The worker inspected 164 selected records in four native sources, plus seven metadata followups within those same records. The coordinator independently reread all 164 targets, comparing configuration/identity fields, body lengths, projection equality and source headers. All four original-length byte ranges match their census hashes. Three files still match the original full files. One has a newer tail, which wasn't parsed or counted. No full logs or verbatim chat/instruction/error bodies were saved.

| Question | Observed result | Limit |
| --- | --- | --- |
| Can one source ground the successful core? | Yes. Five workflows share one recorded source header and policy context: Critique draft-final, Critique revision-final, Single, Cascade primary-final and Cascade repair-final, in that physical order. | One header and no recorded resume isn't per-workflow proof of the producing binary. |
| What were the Cascade decisions? | Selected judge records contain literal `accept` and `reject`. The former ends with primary, the latter with repair. | This grounds those selected examples, not every producer's verdict vocabulary. |
| What was the degraded path? | A failed judge names a repair target matching the later final phase. The completion records `judge_call_failed`. | It has a different source header build. Keep the exceptional fixture separate from the successful core. |
| Are the two rule fields aliases? | No reviewed pair supports collapsing them: four selected records contain both fields with different values. | The internal routing algorithm remains unknown. |
| Do new names contain useful text? | Failed phases contain error text. Instruction updates contain persistent instruction text and metadata. Notices contain mode/persistence metadata, not a body. Retry records contain reason and configured model metadata. | A recorded instruction/update/notice doesn't prove actual model application or UI delivery. |
| Are retries a usage source? | Their model catalog includes configured billing information, not receipts. | No retry success, billable outcome or parent-turn ownership is established. Don't add another usage stream. |

The original matrix still has 293 audited rows and 11,905 rows marked unknown. This targeted followup doesn't silently change their dispositions or certify every catalog/tool/hook field. It supplies evidence for the next handling and fixture choices.

#### Independent review feedback

The coordinator requested two corrections to the worker's proposal:

- Handoff source/target presence must include failed as well as completed phases. A recorded failed judge isn't missing evidence merely because it isn't completed.
- Don't default to losing retry catalog data to save unspecified space. The three selected snapshots are each 1,409 bytes when compactly reserialized as JSON. Rendered size and the broader retry corpus aren't measured. Prefer readable retention of the reviewed groups, with any exclusion requiring a named rule, counts and approval.

The selected catalogs have equal content, but keep the three retry records distinct. Configured prices never become recorded charges. Worker amendments remain private alongside the original artifacts.

The worker returned `review-corrections.private.json` and withdrew the lossy catalog recommendation. The coordinator verified all seven corrected handoffs, the exact grouping of 60 observed catalog descendant paths/types, and unchanged earlier artifacts. Readable retention covers identity/provider, availability/endpoints, capabilities and configured billing. These remain proposals, not implemented behavior.

#### Reviewed implementation choices

| Choice | Benefit | Cost and remaining limit |
| --- | --- | --- |
| **Recommended: focused field/event compatibility, then core/edge goldens** | Keep the seven WI-056 fields and useful WI-055 event content. Add readable retry catalog metadata instead of a default lossy exclusion. Then freeze intended output with semantic/negative checks. | Small field change plus medium event/verifier work, followed by fixture validation. Doesn't implement a complete per-call receipt archive. |
| WI-056 and supported core first | Gets bounded compatibility and golden coverage sooner. | Failed errors, instruction bodies and other WI-055 records remain diagnosed but unhandled. Keep these gaps open rather than bless omissions. |
| Pause after research | No behavior changes or new implementation cost. | Golden coverage and known handling gaps remain unfinished. |

The recommended choice keeps ledger/receipt/legacy priority and the existing Local golden unchanged. Broader per-call Markdown archival, including nonselected receipt evidence, stays a separate choice. Successful core fixtures shouldn't claim native multi-critic execution. Generated long/whitespace/invalid cases keep their defensive labels.

**Approved, 261114:** the developer selected the recommended focused handling and core/edge golden profile. This permits extending existing WI-053 edits in [sdk-fusion.ts](../src/session/sdk-fusion.ts), [sdk-session.ts](../src/session/sdk-session.ts), [sdk-usage-record.ts](../src/session/sdk-usage-record.ts), [sdk-loss-account.ts](../src/verify/sdk-loss-account.ts), related tests and owning product docs. Keep existing work and review the integrated diff. Approval doesn't authorize staging, commits, pushes, deletions or closing work items.

Implementation order: WI-056 fields/tests, independent review; WI-055 event/catalog notes and independent checks, independent review; SDK core/edge goldens and semantic/negative checks; final verification/build/docs handoff. One worker edits at a time. Product documentation can be combined with the event slice. First-slice output belongs under `temp-tool-output/261114-1719-fusion-implementation/slice-a/`.

The field slice passed independent source/test review. The coordinator independently checked focused behavior, both typechecks and the remaining protected files. Product documentation, matrix refresh and final integration remain outstanding. WI-055 is split into B1 content/notice notes and B2 retry catalog/combined documentation so each return stays reviewable.

B1 initially returned with a counted fake user turn. The coordinator reproduced the inflated count, shifted numbering and unavailable start. After the developer approved extending the staged type/renderer files, the worker replaced it with optional `prePromptNotes`. Independent reproduction, affected rendering/accounting tests, typechecks and the unchanged Local golden pass. B1 is accepted for integration. B2 owns retry catalogs and combined documentation, including the SDK prefix migration. See [WI-055's correction gate](WI-055-new-agent-event-families.md#b1-independent-review-and-correction-gate).

B2 subsequently passed independent source/test/documentation review. Invented inputs exercise all 60 reviewed catalog path/type rows without reading native logs. The complete rendered groups, reason checks, prefix migration and configured-price boundaries are accepted for integration. See [WI-055's B2 review](WI-055-new-agent-event-families.md#b2-independent-review-261114). Next, create the five-workflow core and separate exceptional/ownership/usage/text goldens, with semantic and negative checks before accepting expected output. Preserve the Local golden and historical matrix. Broader corpus fields remain unknown.

**Frozen regression rechecked, 261114:** current source rendering of the existing S017 capture passes saved-text, structure, image, companion-link and determinism checks. Its input hash is unchanged. The earlier root/child/companion and matched/unmatched accounting counts also match. This uses the existing frozen input and writes derived Markdown/companions, not new native-log copies. S017 remains a separate stress case, not the selected S000019 successful-core source. Evidence: `temp-tool-output/261113-1515-fusion-review/followup-source-261114-204519/review.json`. Built-CLI and final integrated verification still follow the golden review.

### Golden integration review, 261114

C returned five golden views from three invented event streams, a deliberate immutable update workflow and a bounded evidence map. The coordinator reviewed core model/final-phase relationships, exceptional-path content, usage ownership, redaction and companion bytes. The map distinguishes direct focused assertions from typed witnesses with exact snapshots. Its 205 evidence rows aren't independent semantic audits; 184 rows remain unknown. The original matrix stays unchanged.

Independent review found unchecked manifest descriptors and an extra-file mutation that also lacked its original archive. The worker corrected both with isolated negative cases. The coordinator's original tampered-hash probe now rejects the bad descriptor without modifying any fixture.

A further disk check found that the custom `assets` folder didn't match the saved archive's required sibling prefix. The worker corrected it to `archive_assets_fixture`, added actual disk-reader checks and measured rendered-note thresholds. Independent final review confirms complete saved companion bytes and full inline bodies at the single-predicate boundaries. Earlier candidate generations remain intact and inactive. No native data was used to create them.

The rebuilt CLI separately passes the current frozen S017 saved artifact and rejects removed handoff text and a corrupted required companion. It reuses the existing kept snapshot; no raw copy is added, and original input/archive hashes stay unchanged. The coordinator's first probe renamed the Markdown without matching its asset prefix. Correcting the derived test layout fixed that setup error, not product code. Evidence is under `temp-tool-output/261114-1719-fusion-implementation/slice-c/`, including `coordinator-built-cli.mjs`, timestamped built-check reports, `coordinator-manifest-check.mjs` and the worker's correction handoffs.

### Final integration and acceptance handoff, 261114

All approved implementation slices passed independent review. `pnpm run verify` passes generated checks, both typechecks, the full suite and the unchanged Local golden. `pnpm run build` rebuilt the CLI, library and declarations. Check mode and deliberate no-op SDK updates leave all retained bytes and mtimes unchanged. The coordinator independently checked all 1,164 mapping references and the unchanged historical matrix.

The active [SDK golden generation](../test/fixtures/sdk-golden/active.json) selects five views and seven exact artifacts. Its two 42,265-byte text companions keep every redacted line. Only this generation is current. On 261115, the developer approved deleting the two inactive candidates and excluding their 14 files from the index. The coordinator also deleted 68 obsolete Local golden asset folders after checking their identical synthetic PNGs, keeping the folder linked by the current render. The active SDK fixture passed all 34 focused tests afterward. Full verification passed all 762 tests, both typechecks and the Local golden. That check generated another asset folder; the coordinator removed its now-obsolete predecessor, leaving one current bundle. No other index entries changed. The later approved [WI-057 harness isolation](#wi-057-local-golden-scratch-isolation-261115) prevents new successful-run accumulation without changing ordinary export retention.

Review the [fixture guide and maintenance commands](../test/fixtures/sdk-golden/README.md), [semantic/negative tests](../test/sdk-golden.test.ts), prefix migration and the bounded mapping limits before acceptance. The final projection covers 389 rows: 205 have scoped evidence and 184 remain unknown. It maps all 60 reviewed catalog descendants and seven WI-056 fields without claiming full corpus semantics. The full inventory still needs available unchanged originals for replay. Persisted-resource clipping and broader per-call Markdown archival remain outside this profile.

**Acceptance and completion check, 261115:** the developer accepted WI-053 through WI-057. Their dashboard rows, topic outcomes and parent progress are reconciled. The last full verification passed 768 tests, both typechecks and the unchanged Local golden; frozen built-CLI checks and no-accumulation evidence remain recorded above. No new runtime claims were made during this documentation-only closure. WI-042's broader research and unrelated acceptance gates remain open.

Final evidence: `coordinator-verify-final.log`, `coordinator-build-01.log`, `coordinator-built-261114-213342.private.json`, `correction-04.private.md`, `bounded-evidence-map-04.private.json` and `ownership-evidence-audit-04.private.json` under the C folder. No native session data or Git history was changed. Earlier staged content was left intact; approved working-tree extensions remain unstaged. Implementation completion doesn't close WI-054, its children or WI-053.

Private evidence: `sources.private.json`, `observations.private.json`, `configuration-followup.private.json`, `representative-findings.private.json`, `policy-and-scenarios.private.json`, `review-corrections.private.json` and `validation.private.json` under `temp-tool-output/261114-1612-fusion-representatives/`. The independent `coordinator-review.mjs` and `coordinator-review.private.json` verify the raw prefix reads and targeted observations. At that research checkpoint, all 25 protected implementation files matched their earlier hashes. `coordinator-corrections-check.mjs` and its result independently check the final saved-evidence amendment without more native reads.

### WI-057 Local golden scratch isolation, 261115

Part of WI-054, found while reviewing its staged fixtures and generated Local golden assets. The developer approved Local golden isolation only, using the ignored `temp-tool-output/` folder. Automatic SDK candidate pruning wasn't approved.

The worker changed the Local golden CLI and helper, added six regression tests, updated README/SPEC/CHANGELOG and rebuilt generated output. Each operation owns a unique timestamped run. Success deletes its exact writer-recorded files and empty folders. Mismatches or errors keep the run and print its absolute path. Cleanup rejects symlinks, changed run identity and unowned entries before deletion. Existing baseline bundles, failed runs, SDK candidates and ordinary exports aren't pruned. An earlier verification failure isn't cleared by golden update.

Independent coordinator review and full verification passed 768 tests, both typechecks and the unchanged Local expected render/digest. Two additional successful golden checks left no new retained run folders. The four baseline files and Local fixture files kept identical hashes. The retained failed archive and image also matched the worker's recorded hashes. Worker build and built-CLI checks passed. Evidence is under `temp-tool-output/261115-0013-local-golden-prevention/`: `coordinator-verify.log`, `coordinator-repeat-1.log`, `coordinator-repeat-2.log`, `proof.json`, `build.log` and `built-golden.log`.

At the implementation checkpoint, the staged file count remained 41 after the approved 14-entry removal. New implementation and tracking edits weren't staged. `git diff --check` passed for those working-tree edits. The separate cached check reported trailing spaces in the unchanged active SDK golden text; those fixture bytes weren't altered to silence the check. **WI-057 accepted and closed, 261115:** the developer accepted the success/failure retention behavior and verified no-accumulation result.

### Storage correction and independent validation

The first private report was about 489 MiB, and its manifest duplicated about 426 MiB of analysis. The worker replaced inventory-only persistence with streamed gzip and a slim manifest. The compact set is 37.6 MiB, 95.9% smaller than the original pair.

The coordinator converted the existing inventory without rereading native logs. Both compressed and decompressed hashes/byte counts pass, and the decompressed bytes match the original report's SHA-256 exactly. The summary is identical and the compact output has no copied event files. No observations were removed to get the smaller file.

**Disk retention:** the original 915 MiB pair still exists. It wasn't deleted, so the smaller archive hasn't freed that space. Removing the two redundant derived JSON files needs separate approval. Don't delete any native source or run folder.

At the storage-correction checkpoint, independent `pnpm run verify` passed generated checks, both typechecks, the full suite and the existing Local golden. All 25 protected pre-existing source/test/product-documentation files matched their earlier hashes then. Later approved implementation changes need their own integrated verification.

### Commands and retained outputs

The [research command](../scripts/fusion-census-cli.ts) takes a session-state root or a Copilot home. Use a new private output folder on each run:

```powershell
$sdkHome = if ($env:COPILOT_HOME) { $env:COPILOT_HOME } else { Join-Path $env:USERPROFILE '.copilot' }
node scripts\fusion-census-cli.ts --inventory-only --copilot-home $sdkHome --output-dir temp-tool-output\261114-0030-fusion-census\<new-run-name>
```

Inventory-only output contains `report.private.json.gz`, a slim `manifest.private.json`, and an aggregate `summary.json`. The command verifies compressed and decompressed bytes. It rejects inventory-only manifests as frozen replay inputs.

| Retained output | Use |
| --- | --- |
| `temp-tool-output/261114-0030-fusion-census/native-inventory-compact-01/` | Validated compact inventory. Use this for further analysis. |
| `temp-tool-output/261114-0030-fusion-census/native-inventory-01/` | Original oversized report/manifest, kept pending cleanup approval. |
| `temp-tool-output/261114-0024-fusion-coordination/qualified-sources.private.json` | Small private index naming all 19 source aliases, paths and hashes. |
| `temp-tool-output/261114-0024-fusion-coordination/compact-inventory.mts` | Reproduces the conversion from the old artifacts without native reads. Run with `node --expose-gc`. |
| `temp-tool-output/261114-0024-fusion-coordination/verify-final.log` | Independent verification after the storage correction. |

The command log, independent family probe and protected-file hashes are also under the coordinator folder. Full raw-source census replay isn't available under the chosen retention policy.

## Resume point

261114: Phase 1 tooling returned as four new census script/test files. Runtime agent metadata reports `gpt-6.1-sol`, as requested. Requested effort is `medium`; internal reasoning effort isn't independently observable. The worker used this working tree, and no existing source/test implementation was changed.

The first independent review found three census gaps despite green tests: identity groups were populated only when a projection existed, `conversationScope` values weren't collected, and explicit Fusion selection in `session.model_change.data.newModel` wasn't recognized. The worker corrected all three with regression tests. The coordinator inspected the corrections and independently ran the census/privacy checks. An explicit recorded synthetic selection is evidence. Ordinary model switching alone still isn't.

Native preflight found one distinct accessible SDK root. Its 71 event logs total about 1.18 GiB and include an actively growing file. The later inventory-only run succeeded with no native event copies. See the findings above.

The inventory-only option and storage correction are independently reviewed and validated on the captured native inventory. Phase 1 is complete. Phase 2 produced all 12,198 matrix rows and the bounded 293-row Fusion/receipt audit. Other fields remain labelled unknown. The coordinator independently checked counts, correlations and new field gaps, and accepted the worker's scenario-wording addendum. No source/test changes or fixture creation occurred during this matrix pass.

The approved representative reads, focused compatibility and synthetic goldens are complete, independently reviewed and developer-accepted on 261115. WI-054 and its three children are closed. Final verification/build, actual saved-file companion checks and frozen built-CLI positive/negative checks pass. Keep the optional prefix representation, financial selection and active fixture. The two inactive candidates were removed with approval on 261115. The accepted 30-file B2 boundary is under `temp-tool-output/261114-1719-fusion-implementation/slice-b2/`. No full native copies were created.

The approved profile may extend the listed WI-053 files while keeping prior work. Other edits and the unrelated instruction file stay untouched. The coordinator owns this topic, the dashboard and the parent's work tree.
