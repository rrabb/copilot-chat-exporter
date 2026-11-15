Part of WI-042, found while working on: understanding Fusion mode and its recorded model/output evidence.

# WI-053 Agent Host Fusion export compatibility

## At a glance

- **Goal:** export recorded Agent Host Fusion content and usage without inventing missing history.
- **Developer decision, 261113:** create this focused child of WI-042 with High priority.
- **Baseline reason:** a real captured Fusion stress case failed export and saved-file verification with exit 2. The same frozen source now passes both through the built CLI.
- **Evidence:** use the retained WI-052 research capture, sample S017, without changing native session stores.
- **Separate questions:** unsupported Fusion events, usage records and absent ordinary conversation records do not have an established shared cause.
- **Boundary:** all four implementation phases approved 261113. Item closure and Git actions remain unapproved.
- **Baseline finding, 261113:** reproduced 125 Layer D gaps from the frozen source and saved archive. The checked main conversation had no gaps; three unattached child conversations explained the failed categories.
- **Separate baseline loss:** seven Fusion phase records contained text that the old verifier didn't check.
- **Implemented:** the existing SDK path keeps Fusion content and recorded attribution, renders identifiable children without parent calls, and accounts for persisted usage without combining incompatible sources.
- **Placement decision, 261113:** keep identifiable children without recorded parent calls in a clearly labelled separate section.
- **Next:** developer review and acceptance. All four phases are independently reviewed. Full verification still reports the unchanged pre-existing privacy failure. No item closure or Git actions are approved.
- **Estimate:** 14-24 hours for implementation and validation, excluding a new capture or broader listing changes.

## Original goal

The developer identifies Fusion as a new Copilot Agent Host chat mode. Determine what the exporter needs to support its recorded content accurately. Keep the urgent export compatibility work separate from WI-042's broader mode labels, listing filters and future-mode design.

## Done when

- Reproduce the current export and saved-file verification failure from the retained capture. Record the baseline without treating repeated verification as independent source evidence.
- Map encountered Fusion records, IDs, scope, ordering and content-bearing fields. Label unsupported or unknown meanings.
- Separate failures caused by unsupported events, verifier assumptions, exporter omissions and unavailable source records. Do not assign a common cause without evidence.
- Identify what must be rendered, represented as metadata, counted as an exclusion or left unknown, with reasons.
- Propose regression fixtures and verification expectations for each identified behavior.
- Propose surgical implementation steps, directly related documentation changes and their effort. Obtain separate implementation approval.
- The developer accepts the diagnosis and proposal.
- Under the later four-phase implementation approval, keep phase and handoff content, identifiable children without parent calls, and usage with its recorded ownership.
- Verify the frozen source through strict CLI export and saved-file checks, including negative cases. Check ordinary exports and update product documentation and generated output.
- Report remaining evidence limits and request developer acceptance before closing.

## Current understanding

### Observed here, 261113

The [WI-052 research](WI-052-markdown-level-of-detail-research.md) surveyed Local and SDK sources and exported six examples. Sample S017 is deliberately a flawed Fusion stress case, not an exemplary complete archive.

| Evidence | Finding | Limit |
| --- | --- | --- |
| Retained provider metadata | S017 has a verified Agent Host provider-to-SDK mapping. | Do not infer origin from a model name or `hostType` alone. |
| Default-format export | Export fails Layer D with exit 2 and keeps a warning-marked Markdown artifact, companions, diagnostics and source capture. | No repair was attempted. |
| Saved-file verification | The saved failed artifact also exits 2. | This confirms the reported failure, not its root cause. |
| SDK event inventory | Six Fusion event names occur in the bounded survey, listed below. | Survey-wide occurrence does not establish each event's semantics or frequency in S017. |
| Earlier dashboard evidence | Unsupported Fusion event types and `session.usage_record` accompany a failed export. Ordinary conversation records are also sparse during one interval. | Unsupported-event handling, text-check failures and source sparsity must be diagnosed separately. |
| Capture stability | The research reports unchanged hashes for all 32 surveyed source files. | Stable bytes do not prove that the producer recorded every live event. |

### Encountered Fusion event names

| Event | What needs checking |
| --- | --- |
| `session.fusion_resolved` | Mode/configuration evidence and its scope. |
| `assistant.fusion_phase_completed` | Phase identity, content and model attribution. |
| `session.fusion_commit_started` | Meaning of commit in this protocol. Do not assume it means a Git commit. |
| `session.fusion_change_checkpoint` | Whether it carries content, references or cumulative state. |
| `session.fusion_completed` | Outcome, final-output relationship and any totals. |
| `session.fusion_handoff` | Recorded ownership/phase transitions and correlation IDs. |

The questions above are investigation targets inferred from the names, not verified definitions.

### Documented and unknown

The official Copilot SDK event reference distinguishes durable events from ephemeral live events, and concise tool-result content from detailed and structured content. The checked reference is newer than several sampled logs. It is not proof of the meaning or availability of these private Fusion records.

Public Auto-routing types are not a Fusion specification. Neither model switching nor multiple answering models proves Fusion or model ensembling. The online pass did not establish Fusion's execution algorithm.

**Unknown:** which intermediate phases the live UI showed, the complete projection protocol, whether a mode-level effort exists independently of the selected model ID, and whether every usage summary is cumulative. The findings below establish recorded fields, not a stable upstream specification.

## Findings from the frozen capture, 261113

**Observed here:** [inspect.mts](../temp-tool-output/261113-1320-fusion-plan/inspect.mts) reads S017's retained source and saved archive. [diagnosis-v2.json](../temp-tool-output/261113-1320-fusion-plan/diagnosis-v2.json) records the results. The source hash stayed unchanged. No native session store was read or modified.

| Check | Result | Consequence |
| --- | --- | --- |
| Producer header | Event format version 1; `copilot-agent`, build `1.0.103-unstable.r41379698026.g3219c66`. | Scope support to observed records, not every Fusion release. |
| Failure reproduction | In-process rendering and saved-file Layer D checks both reproduce 125 missing/partial pieces. | Same source and verifier, not independent proof. No new CLI export was run. |
| Main conversation | Its 935 checked text pieces have no reported gaps. | This does not check Fusion content or prove the producer saved every live answer. |
| Child conversations | Three child scopes have unambiguous `subagent.started` mappings, but no corresponding parent tool call in ordinary or Fusion records. A hook mentions the IDs. | The renderer has no tool node at which to attach these children. Do not invent a parent call from the hook. |
| Failed categories | The failures concern child prompts, reasoning, tools and a system prompt. Checking children separately produces non-additive totals because companion text is deduplicated. | The 125 failures are not six unknown-event failures. Keep whole-log accounting as the baseline. |
| Fusion phase content | Seven phases: four primary, two judge, one repair. All have `content`. Five have an identical `projectionMessage.content`. Four phase texts also exactly match ordinary assistant messages. | Keep intermediate/review text. Avoid duplicating two fields of the same record, but don't merge different events by text alone. |
| Mode evidence | Four resolutions record `hydrafusion` or `hydrafusion-max`, `single` or `cascade`, versioned policies, model roles and phase plans. | Use recorded Fusion metadata, not model-switch heuristics. Don't turn `max` in a model ID into an independently verified effort setting. |
| Usage inventory | 233 `session.usage_record` events have distinct `usage.accounting.usageId` values. Today's census reports 222 because 11 belong to the unattached children. There is one legacy `model.model_call_success`. | New persisted usage needs an adapter and reconciliation, not addition to the legacy totals. |

**Inferred from current source, checked directly after graph lookup:**

- [eventsInScope](../src/session/sdk-events.ts) excludes attributed child events from the main conversation.
- [processScope and buildSdkSession](../src/session/sdk-session.ts) attach children through rendered tool nodes. Valid child mappings without parent nodes are counted as unplaced. The current warning specifically covers ambiguous/incomplete mappings, not this distinct case.
- [sdkLossPieces](../src/verify/sdk-loss-account.ts) still expects these unambiguously mapped child records. It does not extract Fusion content.
- [renderSdkExport](../src/session/sdk-export.ts) chooses database usage when available, otherwise legacy event usage. [usageFromEvents](../src/session/sdk-usage.ts) does not read `session.usage_record`.
- Graph coverage reported changed file metadata. These conclusions use direct source reads and the frozen-input probe, not a claim of complete graph coverage.

The earlier source-sparsity question remains open. Missing parent calls are observed. Why the producer omitted them, and whether Fusion caused that omission, remain unknown.

### Event handling proposal

This table describes proposed behavior, not current support. Keep source order and recorded IDs. Use project-owned types after validating each payload.

| Event | Captured fields | Proposed treatment |
| --- | --- | --- |
| `session.fusion_resolved` (4) | `fusionId`, `turnId`, selected synthetic model, pattern, policy/version, model roles, `phasePlan`, route and scores | Record configuration separately from answering models. Show a short Fusion note and readable details. Treat policy and plan versions as evidence, not algorithms implemented by the exporter. |
| `assistant.fusion_phase_completed` (7) | `fusionId`, `phaseId`, kind, role, scope, model, effort, status, duration, content, projection and usage | Keep complete phase text, including judge/review phases. Label it as phase output, not automatically as the delivered answer. Render identical content/projection fields once within that record. Keep a differing projection with its own label. |
| `session.fusion_commit_started` (4) | Fusion/commit IDs, source phase/model, kind; `toolCallId` is null in this capture | Show a Fusion transition. Do not label it a Git commit or fabricate a tool call. |
| `session.fusion_change_checkpoint` (3) | Changed file names and added/removed line counts | Show the recorded change summary. No reconstructed diff, and no invented phase association when an ID is missing. |
| `session.fusion_completed` (4) | Final source phase/model, outcome, follow-up model, request/phase counts, timing and usage totals | Show the recorded outcome and final attribution. Treat totals as a separate summary until reconciled. |
| `session.fusion_handoff` (1) | Source/target phase, target model, message role and content | Keep the complete handoff message and transition metadata. Don't invent a user turn. |
| `session.usage_record` (233) | Accounting identity/sequence, model, effort, token counters, duration, `copilotUsage.totalNanoAiu`, optional Fusion and parent-call attribution | Normalize recorded usage without rendering hundreds of raw records. Keep source/provenance and unresolved attribution visible in usage reporting. Report unknown or invalid variants. |

Fields outside a supported variant must stay available in the reader's raw record and produce a diagnostic where interpretation is missing. Don't implement a blanket raw-JSON export or silence unknown events. Existing hook, permission and snapshot exclusions remain unchanged.

## Implementation plan

**Approved, 261113:** implement all four phases with one implementation worker at a time. The coordinator reviews each phase and can advance after checking corrections. Approval does not close this item or allow staging, commits, pushes, worktrees, merges, deletion or history changes. Worker model/effort constraints must be verified before launch.

**Recommendation:** extend the existing Agent Host/Copilot CLI event path. A separate provider, parser or Fusion renderer would duplicate discovery, redaction, companion handling and verification.

| Phase | Work and expected result | Depends on | Estimate |
| --- | --- | --- | --- |
| 1. Lock evidence and tests | Turn observed sequences into synthetic fixtures. Establish ID relationships, projection rules and usage summary scope. Add failing tests for missing Fusion text, valid children without a parent call, and persisted usage. Review the output sample below. | Verified worker configuration | 2-4 hours |
| 2. Keep recorded content | Add validated Fusion payload types and parsing. Reuse ordered notes/text and existing overflow companions. Keep phase, handoff, outcome and change-summary content. Render verified children whose parent call is missing using the approved fallback. Extend independent text checks alongside these changes. | Phase 1 | 6-10 hours |
| 3. Account for usage | Adapt persisted usage records. Reconcile them with the captured database ledger, legacy calls and phase/Fusion/checkpoint summaries. Keep one count per verified identity, missing values unknown and unresolved ownership separate. Feed the existing export and listing usage consumers without new filters. | Phase 1; integrate with Phase 2 attribution | 3-5 hours |
| 4. Verify and document | Re-export the same frozen sample through the CLI and verify the saved artifact and companions. Check synthetic failures, ordinary SDK/Local regressions and deterministic/redacted output. Update owning docs and rebuild generated output when needed. | Phases 2 and 3 | 3-5 hours |

Estimated total: **14-24 hours, roughly 2-3 working days**. This is an engineering estimate, not a measured runtime. Stop and ask if Phase 1 needs fresh private evidence or reveals an incompatible protocol. Don't spend this estimate on broad Fusion UI research.

Likely code changes, to confirm while writing the failing tests:

| Responsibility | Existing files to extend |
| --- | --- |
| Validated records, ordered content and unplaced children | [sdk-events.ts](../src/session/sdk-events.ts), [sdk-session.ts](../src/session/sdk-session.ts), [types.ts](../src/types.ts) |
| Shared rendering and warnings | [sdk-export.ts](../src/session/sdk-export.ts), [markdown.ts](../src/markdown.ts) |
| Usage and existing listing totals | [sdk-usage.ts](../src/session/sdk-usage.ts), [listing-sdk-usage.ts](../src/session/listing-sdk-usage.ts) |
| Independent checks and CLI integration | [sdk-loss-account.ts](../src/verify/sdk-loss-account.ts), [sdk-cli.ts](../src/sdk-cli.ts), existing SDK/usage/loss-account tests |

No new runtime dependency, discovery provider, standalone Fusion renderer or CLI flag is proposed.

### Child-placement choice

These are recorded child conversations with an unambiguous identity but no recorded parent call. They are not WI-049's ambiguous mappings.

**Developer choice, 261113:** keep them in the labelled separate section. The choice approves the planned behavior, not implementation.

| Option | Benefit | Cost or risk |
| --- | --- | --- |
| **Chosen: a separate "Recorded child conversations - parent call missing" section** | Keeps available child prompts, reasoning, tools and results without inventing delegation history. Sort sections by their first recorded event and keep each child's internal order. | Requires an additional rendering path and verification for the section. It must not claim a parent turn or original task-call position. |
| Omit with a specific warning and counted exclusions | Smaller change, consistent with refusing guessed placement. | Deliberately loses readable, confidently identified child content. This needs a separate approved omission policy, not a verifier exception disguised as a fix. |
| Recreate parent calls from hooks or model snapshots | Could resemble the original live conversation. | Reject. It changes the source-of-truth rule and can invent prompts, results or ordering. |

Ambiguous mappings keep WI-049's existing omission-and-warning behavior. A mapping without a parent tool call must not become a confidently nested child.

### Proposed Markdown sample

The phase model names and placeholder text below are synthetic. The selected Fusion ID is observed. This is a review sample, not an implemented format.

```markdown
Fusion selection: hydrafusion | Pattern: cascade

### Fusion phase: primary
Model: model-a | Model effort: medium | Status: succeeded
[Complete recorded phase text]

### Fusion phase: judge
Model: model-b | Model effort: high | Scope: review
[Complete recorded review text]

Fusion completed: [recorded outcome] | Final source: [recorded phase/model]

## Recorded child conversations - parent call missing
The child records identify this conversation. The parent tool call isn't recorded.
[Complete recorded child prompt and conversation]
```

Keep the ordinary final assistant message in its recorded position. A phase and final message may repeat text. For the first implementation, labelled repetition is safer than merging separate records without a proven identity relationship. Existing content-hash companions can share identical long text.

### Regression and acceptance checks

| Case | Required check |
| --- | --- |
| Single, cascade, repair and handoff | Every recorded content field is rendered or linked with its role, scope and model. Missing optional fields don't become invented values. |
| Repeated/projection content | Same-record duplicate fields are accounted once. Distinct equal-text phases and ordinary messages stay distinct. Changed projection text isn't lost. |
| Children without a parent call | All three synthetic child conversations remain readable under the approved policy. No fabricated task call or parent-turn attribution. Existing ambiguous-child tests keep their behavior. |
| Usage | Test duplicate accounting IDs, overlapping sources, resumes, missing fields, child/phase ownership and conflicting totals. Credits use nano-AIU / 1e9. Never add cumulative summaries to per-call totals or combine copies/forks. |
| Unknown/invalid/future records | Keep available IDs and labels, report unsupported variants and leave strict verification failing when required content isn't supported. No fixed list that silently discards unfamiliar models or modes. |
| Redaction and long text | Check inline and companion content, including new phase and handoff text. Existing size thresholds and image privacy rules stay unchanged. |
| Independent verification | Removing phase, handoff or recovered-child text must fail. Test ordering and multiplicity within the relevant scope. Don't feed the verifier the parser's already-filtered output as its expected source. |
| Frozen S017 | Re-run against the same hash. Explain and resolve all 125 baseline gaps under the chosen policy. Require the new Fusion-content checks to pass too. An old-verifier pass alone is insufficient. |
| CLI and ordinary exports | Check export and saved-file verification, `--strict`, failure receipts, source retention and companions. Ordinary Local/SDK golden output must not change unintentionally. |

Start with `pnpm test test\sdk-session.test.ts test\sdk-usage.test.ts test\listing-sdk-usage.test.ts test\loss-account.test.ts`, then add the relevant capture/CLI selectors for the implemented paths. Finish with `pnpm run verify` and `pnpm run build` when source changes require generated output. Don't update golden expectations merely to hide a regression.

### Documentation and deferred work

| Owner | Update during implementation |
| --- | --- |
| [Storage schema](../docs/CHAT-SESSION-SCHEMA.md) | Observed Fusion fields, producer/version, correlation rules and evidence limits. |
| [SPEC](../docs/SPEC.md) | Phase content, child placement, usage reconciliation, exclusions and independent verification. |
| [Upgrading guide](../docs/UPGRADING.md) | New event variants and the compatibility regression checklist. |
| [README](../README.md), [CHANGELOG](../CHANGELOG.md) | Supported Fusion export behavior and known limitations. No new CLI flag is proposed. |
| WI-042 and this topic | Findings, approval decisions, remaining work and acceptance. |

**Deferred:** Local Fusion storage, broad mode filters, listing/timeline redesign, LOD switches and inferred reconstruction from hooks. WI-042 keeps mode/model presentation research. Existing usage consumers should receive corrected accounting, but changing their layout needs a separate sample and approval.

### Validation and evidence limits

- Planning changed no production code, test expectations, generated files or native session data. The ignored diagnostic script and its outputs are kept for reproduction.
- `pnpm test test\privacy.test.ts` already failed before these tracking edits because an existing dashboard link contains a real session UUID. This task does not change that unrelated link.
- `pnpm run verify` passed generated-file and type checks, then failed on the same privacy test. Its final golden step did not run. [Verification log](../temp-tool-output/261113-1320-fusion-plan/verify.log). `git diff --check` passed.
- The in-process probe uses event-log usage fallback, not the saved database ledger. Credit totals and summary reconciliation are not yet verified.
- Exact phase-text comparisons establish duplication in this capture, not a stable projection rule. Phase order, final-source references and malformed/future sequences need the Phase 1 fixtures.
- A bounded Context7 lookup of the official Copilot SDK returned general session-event documentation, not a Fusion specification. No public-schema completeness claim is made.
- No live UI comparison, fresh Fusion chat, new full CLI export, unknown-mode execution test or complete sparse-history diagnosis was performed during planning.

### Implementation preflight, 261113

- Agent-mode terminal and editing tools are available. Initial Git status showed no tracked edits and one unrelated untracked instruction file, which was left untouched.
- The submitted worker model and effort were placeholders. A model-selection question returned no concrete selection. The checked user settings contain no worker model/effort preference. No worker launched, so its effective model, effort and workspace isolation are unverified.
- The developer's revised prompt allows model selection within eligibility rules rather than requiring an exact name. Those rules exclude Luna, Haiku and lower-capability workers, forbid Auto/fallback, and cap effort at medium. The remaining launch gate is verifying an eligible runtime configuration, not obtaining an exact-name choice. Tool discovery did not expose a worker-defaults inspection command. No worker was launched to guess its settings.
- `pnpm test test\privacy.test.ts` still fails on the existing dashboard UUID link. No test expectations were changed.
- The earlier export cache path is unavailable. The survey's frozen S017 source still exists and matches the planning SHA-256. Use that frozen copy, not a live session. Source bytes were not modified.
- Phase 1 acceptance remains synthetic regression cases for phase/projection text, valid children without parent calls, persisted usage identity and independent loss detection. Expected failures must demonstrate unsupported behavior, not missing imports or invalid fixtures.
- **Launch confirmed later, 261113:** the coordinator requested `gpt-5.3-codex` at `medium` effort. The launcher accepted those arguments and runtime agent metadata reports that model. Internal reasoning effort isn't independently observable. Worker cwd and visible tracking edits match this repository, so writes are treated as shared and serialized. Phase 1 is delegated.
- **Serialized replacement, 261113:** the first worker confirmed it had stopped with no commands or writes running. The coordinator launched `gpt-6.1-sol` at requested medium effort for a smaller metadata-parsing correction before the remaining Phase 2 integration work.
- **Usage-unit reference, 261113:** the [official generated SDK types at `cf045793958ce674259c557f7769788f94ee20c9`](https://github.com/github/copilot-sdk/blob/cf045793958ce674259c557f7769788f94ee20c9/nodejs/src/generated/session-events.ts#L9103) document `assistant.usage.duration` as milliseconds and describe its shared accounting identity. Applying that unit to persisted `usage_record.usage.duration` remains an inference until the receipt mapping is checked. A targeted read-only lookup found no rows for S017 in the current CLI ledger, so that comparison cannot verify the mapping. The pinned source and bounded comparison script are kept in the ignored review folder.
- **Approved resumption, 261113:** for WI-053, the developer allows `gpt-6-sol` at medium/high, `claude-sonnet-5.5` at medium, `claude-opus-5.5` at medium/low, or `gpt-6.1-sol` at medium/low. The GPT-6 Sol high option updates the earlier medium cap for that model. The developer confirmed that this allowance is for WI-053, not a permanent personal preference. The coordinator checked the existing GPT-6.1 Sol worker and picked up its saved work. No new worker was needed.

## Resume point

**Implementation and independent review complete, 261113.** All four approved phases are reviewed. The coordinator picked up the existing `gpt-6.1-sol` worker's five product-documentation updates and build, checked the nullable public types and unmatched-usage label, and found no further corrections needed. The worker remains idle. No source/test changes were taken over by the coordinator.

Next, the developer reviews [the built-CLI frozen export](../temp-tool-output/261113-1515-fusion-review/final-built-2233/S017.md), its child section and usage figures, and the documented evidence limits. [The final built-CLI report](../temp-tool-output/261113-1515-fusion-review/final-built-2233/review.json) confirms strict export and saved-file verification, rejection of removed handoff text and a corrupted required companion, successful restoration, and unchanged source bytes. Keep all edits and evidence. No more implementation is proposed unless review finds a specific issue.

`pnpm run verify` passes generated-file checks and both typechecks, then fails on the same pre-existing privacy check. The final suite reports no other failures. The privacy test and dashboard UUID set are unchanged from `HEAD`. A separate golden check passes because full verification stops before that step. Keep the failure visible and don't weaken its test or alter the unrelated link.

Receipt duration remains inferred from the official SDK millisecond field, not matched to ledger rows. Text checks assess coverage, order and repeated occurrences, not every text companion's checksum. The cause of sparse native history remains unknown. Existing persisted-resource clipping and broader mode/filter research remain outside this work. Neither implementation completion nor this handoff closes the item or approves Git actions.

### Implementation evidence, 261113

The [first saved-artifact review](../temp-tool-output/261113-1515-fusion-review/metadata-review/review.json) found the missing child and Fusion text but rejected duplicate root-heading markers. The [corrected child-rendering review](../temp-tool-output/261113-1515-fusion-review/child-review/review.json) passes content and structural checks. The [independent Phase 2 review](../temp-tool-output/261113-1515-fusion-review/verifier-review/review.json) also uses actual saved companion objects. All generated companions are linked, repeated renders are identical and the source hash is unchanged. Synthetic CLI checks reject missing, corrupt, unlinked or reordered long Fusion bodies. Legacy concatenated-string verifier input remains compatible but cannot prove link positions.

**Observed here, Phase 3:** [the frozen usage review](../temp-tool-output/261113-1515-fusion-review/usage-review/review.json) has no unsupported event families or missing text. Persisted receipts supply 233 distinct calls: 222 match root turns and 11 remain detached or unmatched. The one legacy success isn't added. A nonempty ledger still wins, even if partial. Otherwise receipts win over legacy successes. Missing metrics stay unknown, conflicting identities count once with diagnostics, and detached child calls aren't assigned invented parent turns.

**Observed here, CLI and negative checks:** [the source CLI review](../temp-tool-output/261113-1515-fusion-review/usage-cli-unique/review.json) passes strict export and saved-file verification. Removing the handoff or corrupting a required system-prompt companion fails. Restoring the derived artifacts passes, and the frozen input hash is unchanged. [The targeted negative review](../temp-tool-output/261113-1515-fusion-review/negative-review.json) rejects removal of each of the eight Fusion phase/handoff blocks, including text repeated in ordinary assistant messages.

**Verification limit:** this checks source-text coverage, order and multiplicity, not every text artifact's checksum. Corrupting a redundant companion can pass when other rendered records still supply the required evidence. The first broad corruption probe chose such a file. The corrected probe uses a companion with required source text. General text-artifact authentication is not added here.

**Phase 4 pause checkpoint, 261113:** the [worker handoff](../temp-tool-output/261113-1605-fusion-final/phase4-handoff.txt) records five owning-document updates, focused usage checks and a successful generated build. Those documentation changes awaited independent review at the pause. The [renewed frozen-source check](../temp-tool-output/261113-1515-fusion-review/final-source-1605/review.json) passes text, structure, image, companion-link, determinism and unchanged-input checks. The [ordinary golden check](../temp-tool-output/261113-1515-fusion-review/final-source-1605/golden.log) still matches. The [privacy recheck](../temp-tool-output/261113-1515-fusion-review/final-source-1605/privacy-recheck.log) and [comparison with HEAD](../temp-tool-output/261113-1515-fusion-review/final-source-1605/privacy-head-comparison.log) confirm the existing unrelated failure without printing identifiers.

**Final independent review, 261113:** the five documentation changes match the implemented rules and evidence limits. The [final verification log](../temp-tool-output/261113-2233-fusion-final-review/verify.log) contains the unchanged privacy failure and no other test failures. [Comparison with HEAD](../temp-tool-output/261113-2233-fusion-final-review/privacy-head-comparison.log) confirms that baseline without printing identifiers. [Build](../temp-tool-output/261113-2233-fusion-final-review/build.log) and [normalized golden](../temp-tool-output/261113-2233-fusion-final-review/golden.log) checks pass. [Frozen-source checks](../temp-tool-output/261113-1515-fusion-review/final-source-2233/review.json) keep nine root turns, three detached children and twelve linked companions, with no unsupported events or lost text. [Usage assertions](../temp-tool-output/261113-2233-fusion-final-review/usage-assertions.log) confirm 233 receipts counted once: 222 root-matched and 11 detached/unmatched. The available legacy success isn't added. [Built-CLI checks](../temp-tool-output/261113-1515-fusion-review/final-built-2233/review.json) pass positive, negative and restored-artifact cases. No native session data was changed.

## Scope and guardrails

| In scope | Not included without another decision |
| --- | --- |
| Agent Host Fusion event parsing, ordering and retained content | Broad listing/filter or timeline redesign |
| Recorded phase/model/agent attribution where evidence supports it | Guessing the algorithm or filling missing history |
| Failure diagnostics, exclusion accounting and source-aware verification | Reconstructing answers from incomplete hooks/model snapshots |
| Related usage-field diagnosis with correct units and cumulative handling | Estimating credits from tokens or combining incompatible totals |
| A tested implementation proposal and documentation plan | Implementing LOD switches or changing current export defaults |

Never modify session stores. Keep source gaps labelled. A clean verification result must reflect supported content, not weakened checks.

## Decisions and tradeoffs

- **Approved, 261113:** a focused High-priority child of WI-042, rather than expanding that item's listing/design scope.
- **Approved evidence boundary:** diagnosis can start with this session's retained, read-only capture. A fresh chat is needed only for unanswered controlled experiments.
- **Approved, 261113:** save this planning pass in WI-053 and update related tracking while keeping existing edits. This does not approve implementation.
- **Chosen, 261113:** keep identifiable children whose parent calls are missing in a clearly labelled separate section. Don't guess their parent turn.
- **Approved later, 261113:** all four implementation phases, with delegated source/test/product-documentation changes and coordinator review. Worker configuration remains a launch prerequisite. Item closure and Git actions remain separate.
- **Implementation review, 261113:** detached child sections must reuse the complete shared renderer, including redaction, nested agents and tool details. Parser-created text previews must not bypass renderer redaction or leave a second long projection unlinked. Phase 2 was returned for these corrections before usage work.
- **Worker review, 261113:** the `gpt-5.3-codex` worker corrected several issues but still used configuration fields that don't match the frozen records and missed requested regression cases. Try `gpt-6.1-sol` at medium effort after a serialized handoff. No comparative model benchmark was run, and the same independent review gates still apply.
- **Approved evidence extension, 261113:** real Fusion chats from the preceding three weeks may be used if needed. Inspect them read-only and test frozen, hash-checked copies under ignored run folders. This does not allow modifying native sessions or publishing private chat content.
- **Phase 3 implementation choice, 261113:** keep the existing database-ledger-first rule. When it has no rows, prefer validated persisted usage receipts over legacy model-call events. Report the chosen source and alternatives rather than combining streams without shared identities. Keep phase and cumulative summaries separate.
- **Recommendation:** diagnose first, then approve implementation. A generic JSON fallback may keep unknown payloads, but does not establish correct semantic rendering or usage attribution.
- **Cheaper option considered:** promote WI-042 alone. Rejected for tracking because it mixes urgent export failures with broader presentation work.

## References

- [WI-042 Fusion and future modes](WI-042-fusion-and-future-modes.md): parent scope and work tree.
- [WI-052 LOD research](WI-052-markdown-level-of-detail-research.md): source of this session's evidence.
- [Research HTML report](../temp-tool-output/261113-121310-lod-research/report.html): observed inventories, source caveats and sample results.
- [Corpus catalogue](../temp-tool-output/261113-121310-lod-research/corpus/report-summary.json): sample S017 identity, failed artifact path, verified provider mapping and verification categories.
- [Full corpus findings](../temp-tool-output/261113-121310-lod-research/corpus/findings.json): exact export commands, capture paths, source hashes and logs.
- [Online findings](../temp-tool-output/261113-121310-lod-research/online/findings.json): SDK reference, pinned source evidence and unresolved schema limits.
- [Frozen-input planning probe](../temp-tool-output/261113-1320-fusion-plan/inspect.mts) and [diagnosis](../temp-tool-output/261113-1320-fusion-plan/diagnosis-v2.json): reproduced loss categories, child placement, phase fields and usage identity counts.
- [Official SDK generated event types](https://github.com/github/copilot-sdk/blob/main/nodejs/src/generated/session-events.ts): general reference returned by Context7, not a pinned Fusion specification.
- [Dashboard Inbox](../work-log.md#inbox): earlier failed-export and sparse-record findings. Keep their unresolved questions separate.

Private session identities and paths stay in the ignored evidence files. Follow the catalogue's paths rather than inventing a new selector or exporting a different live version.
