# WI-019: Agent chat export and usage

Canonical entry: [WI-019](../work-log.md#wi-019). The dashboard owns status and next actions.

## At a glance

- Goal: export recorded Agent Host and Copilot CLI conversations with their available usage.
- Old items #9 and #20 describe a delivered slice, not proof that every event variant is kept.
- The CLI selects a verified main conversation. Subagent conversations render at their delegation calls.
- The earlier separate-child-export wording and the later inline decision aren't the same question.
- The current CLI doesn't select a child for a standalone export. Whether that remains wanted is unknown.
- Recorded nano-AIU supplies AI credits. Token counts aren't used to estimate credits.
- Checkpoint and shutdown totals are cumulative. The last total describes the whole event log.
- A 90% usage-row-to-reply ratio is a heuristic, not proof of complete attribution.
- A synthetic duplicate-ID case attached the later child under `--strict` without a warning; the real case below did not attach a child.
- The developer chose to omit ambiguous children, warn in the archive, and keep `--strict` passing; [WI-049](../work-log.md#wi-049) implements the policy and waits for review.
- Different child and parent task prompts can leave the original task out of Markdown.
- A task description can also be omitted when the child start record doesn't repeat it.
- Nested opaque reasoning can be counted in the parsed child but reported as zero in the footer.
- A 261102 listing showed 64 ambiguous scopes; a 60-day scan found no conflicting IDs or attachable child messages.
- One real export had no agent-attributed child messages, so real misattachment remains unconfirmed.
- [WI-034](../work-log.md#wi-034), [WI-035](../work-log.md#wi-035), [WI-036](../work-log.md#wi-036) and [WI-049](../work-log.md#wi-049) track the follow-ups.
- Rejected: flattening child turns into the main conversation, treating a summary as a transcript, and using the sister knowledge adapter as a fidelity engine.
- Rejected: adding cumulative totals, estimating credits from tokens, attributing whole-log totals to children, cross-chat totals, and one flattened verification sequence.
- Work tree: 1 of 4 children done. Estimates need the dev's confirmation.

## Original goal

The [pinned old log's item #9](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L350) called for rich Markdown from verified main, peer and subagent conversations, keeping recorded content and order. [Item #20](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L361) called for usage with scope, turn, source and completeness information. It ruled out estimating credits from tokens or assigning a whole-log total to a child.

The [earlier decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L451) said to export verified main, peer and subagent conversations separately and not merge child turns into the parent. The [261014 receipt](../work-log-archive.md#phase-0-and-phase-1-slice-1-october-14) records the later choice to show subagents inline, collapsed and labelled. The current [SPEC](../docs/SPEC.md#agent-chat-export-policy-approved-october-14) describes that inline behavior.

Inline nesting keeps a child distinct from main turns. It doesn't establish that someone withdrew the earlier idea of a separately selectable child export. No such decision was found in the records checked. The current CLI selects main scopes; whether a child-only export is still wanted remains open.

## Done when

These criteria describe the slice recorded as delivered in old #9 and #20. They don't guarantee complete preservation of every private event variant.

- A verified main Agent Host or Copilot CLI conversation can be selected and exported to Markdown.
- A recorded delegation with a usable mapping renders its child conversation at the call, with the returned summary distinguished from the conversation.
- Supported prompts, readable reasoning, assistant text, tool calls and results have rendering and synthetic regression coverage. Known exclusions and unhandled processed event types are reported.
- Recorded usage has a source and coverage information. Cumulative totals aren't added across resumes, and missing usage isn't invented.
- The independent agent text check and its limits are documented. New preservation or attribution gaps are tracked separately.

## Work tree

Progress as of 261103: 0 of 3 children done.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-034 Ambiguous subagent mapping](../work-log.md#wi-034) | [research] | M | - |
| 2 | [WI-035 Delegation inputs](../work-log.md#wi-035) | [research] | M | - |
| 3 | [WI-036 Child opaque reasoning count](../work-log.md#wi-036) | [build] | S | - |

The children's who and size are proposed estimates for the dev to confirm. These rows don't approve implementation.

**Related, not children:** [WI-021](WI-021-source-aware-verification.md) owns source-aware text checks. [WI-022](WI-022-source-captures-cache-cleanup.md) owns frozen captures and cleanup. [WI-024](../work-log.md#wi-024) owns recorded-image companions and their checks.

## Current understanding

**Inferred from source at `306498246c6714f6d496e6a045991889dbf79ad0`:** the linked source and tests matched that commit during this review. A private storage format can change, and these observations don't establish coverage of every variant.

| Area | Current behavior and limit |
| --- | --- |
| Source and selection | [The event reader](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-events.ts#L29) checks the read and requires a matching version-1 `session.start`. [CLI selection](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-export.ts#L96) accepts verified main scopes, not standalone child scopes. Capture of an incomplete trailing record has a separate notice and is covered by WI-022. |
| Child conversations | [The builder](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-session.ts#L485) attaches child events at the recorded task and follows up to eight levels. Unplaced eligible child events are counted. The mapping problem below shows that attachment doesn't always prove a unique identity. |
| Text and omissions | [The event parser](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-session.ts#L266) uses readable reasoning text, falling back to thinking or summary blocks. Known permission, hook and snapshot omissions are counted in processed scopes. Unhandled processed event types enter the census. The nested opaque-reasoning count has the limit below. |
| Verification | [The agent extractor](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/verify/sdk-loss-account.ts#L26) checks eligible message order within each agent scope. Tool fields and companion text don't all receive an order check. Text presence doesn't verify the identity of the attached child. |
| Usage sources | [The ledger reader](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-usage.ts#L66) opens the CLI store read-only. When no ledger calls are available, [the exporter](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-export.ts#L42) uses recorded model-call events. The [last shutdown or checkpoint total](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-usage.ts#L123) is a separate whole-log running total. |
| Attribution and units | [Call attribution](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-usage.ts#L159) uses prompt times and agent-start IDs. Unmatched calls are reported separately. Credits are recorded nano-AIU divided by one billion. Local `copilotCredits` uses a different, unverified unit and isn't mixed with these figures. The old request for exact turn attribution isn't proven for all timing or peer cases. |
| Coverage and totals | [The 90% rule](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-usage.ts#L194) compares usage-row count with assistant-message count across the log, including unmatched rows. It doesn't prove that each reply has a matching call. [Running-total differences](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-usage.ts#L213) can cover multiple turns and are labelled with the range. |
| Child usage in listings | [The listing adapter](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/listing-sdk-usage.ts#L55) filters a child's own calls by agent ID. [The disclosure](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/detailed-listing.ts#L126) labels the logged total as the whole log, not that child's cost. |

## Findings and outcomes

### Ambiguous subagent mapping

**Observed here:** a synthetic tool call had two `subagent.started` records with the same tool-call ID and different agent IDs. [Scope verification](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-events.ts#L70) returned no verified child and one ambiguity. The [builder's metadata map](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-session.ts#L159) nevertheless used the later agent ID.

261102 detailed listing, Code root: 5 parent chats show 64 ambiguous child scopes (+1, +1, +1, +4, +57). The listing labels these mappings "ambiguous or incomplete". A real export from the smallest test-labeled case had no agent-attributed child messages, no nested child conversation and no archive warning.

When both synthetic children had text, the first child's text was left out and Layer D failed. When the first child had only a start record, an isolated synthetic CLI export attached the second child's conversation, exited successfully with `--strict`, and reported the checked text present. The Markdown had no mapping warning. The [synthetic receipt](../temp-tool-output/261103-1300-wi-019/ambiguous-cli-probe.log) records the result. The existing [listing test](https://github.com/rrabb/copilot-chat-exporter/blob/0135c4e27a5c39e5cd18309c33c7c196523f999c/test/cli.test.ts#L689) reports an ambiguous child instead.

**Observed here - real export:** From the [261102 detailed listing](../temp-tool-output/111/copilot-chat-sessions-detailed-listing-261102_214215.html), an exact qualified key selected one 17-turn, test-labeled Agent Host chat with one ambiguous child scope. Its source had one `subagent.started` and one `subagent.completed` record sharing a parent `toolCallId`; neither had an `agentId`. Two main tool lifecycle records used that call ID, but no event in the backing log had an `agentId`. The export had no nested child conversation and no mapping warning. `--strict` exited 0. The listing showed both an ambiguous-child count and an ambiguous-mapping badge. The [local export receipt](../temp-tool-output/261105-0123-wi034-real/) keeps the raw output; no real chat IDs, paths, titles or text are recorded here.

This real case confirms an unresolved mapping and inconsistent reporting, not a wrong child attachment. It had no agent-attributed child conversation events to attach. It doesn't establish whether other real logs can match the synthetic duplicate-ID case.

**Observed here - 60-day metadata scan:** The active Copilot `session-state` root had 65 session directories and 52 event logs. Of those logs, 48 were modified within 60 days; all 48 had an event timestamp in the window. The scan found 64 incomplete mappings. None had duplicate start records with different `agentId` values, and none had both a matching parent tool call and an agent-attributed child message for the builder's last recorded agent ID. The scan classified records using event type, timestamp, `toolCallId` and `agentId`; it didn't print or save conversation text. Four older logs and 13 directories without event logs weren't opened. No second export was made because the scan found no attachable candidate.

The developer chose to stop the search at 60 days and decide from current evidence.

Current code confirms the distinction: [`childScopes`](../src/session/sdk-events.ts#L70) finds unresolved mappings, and the [builder](../src/session/sdk-session.ts#L160) attaches only verified agent IDs. The [archive renderer](../src/session/sdk-export.ts#L65) warns and omits the affected child. The [independent text check](../src/verify/sdk-loss-account.ts#L27) excludes candidate text tied to unresolved mappings, while still checking the main conversation and verified children. Listing provider resolution, badges and source details continue to show ambiguity in the [provider](https://github.com/rrabb/copilot-chat-exporter/blob/0135c4e27a5c39e5cd18309c33c7c196523f999c/src/session/provider-sources.ts#L317), [detailed listing](https://github.com/rrabb/copilot-chat-exporter/blob/0135c4e27a5c39e5cd18309c33c7c196523f999c/src/session/detailed-listing.ts#L341) and [source panel](https://github.com/rrabb/copilot-chat-exporter/blob/0135c4e27a5c39e5cd18309c33c7c196523f999c/src/session/detailed-source.ts#L193).

[WI-034](../work-log.md#wi-034) was accepted and closed on 261105. [WI-049](../work-log.md#wi-049) implements the selected response and waits for review.

#### WI-034 product response

| Option | Benefit | Cost or risk | Status |
| --- | --- | --- | --- |
| Omit ambiguous children by default and add an archive warning | Keeps the verified parent and makes the unresolved child count visible | Drops any child text with a weak mapping; `--strict` still passes | Implemented in WI-049 |
| Attach a candidate child and label its identity as uncertain | Keeps more recorded text | Can place another agent's private conversation under the wrong parent call | Not selected |
| Omit ambiguous children by default, warn in the archive and make `--strict` fail on unresolved mappings | Prevents a misleading attachment and gives audits a clear failure | Can omit useful child history or block strict exports that otherwise pass | Not selected |
| Make no export change and rely on the listing warning | No implementation cost | The Markdown can be shared without the listing and loses the ambiguity context | Not selected |

The detailed listing already shows the child count and mapping badge, while its source panel keeps warning details on demand. A readability improvement could use one concise parent-level warning and link it to source evidence. It should distinguish a recorded parent `toolCallId` from a verified child `agentId`, then use matching wording in the export. This would avoid repeating warning text while making the archive's omissions clear. See the [listing design guide](../docs/HTML-REPORT-DESIGN.md#purpose-and-principles).

### Delegated task input

**Observed here:** with one verified synthetic child, the parent call's full task prompt and the child's first `user.message` differed. The parsed tool kept the original prompt, but the Markdown showed the child's prompt and omitted the original. The [builder](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-session.ts#L249) replaces the initial placeholder with the child's message. [Rendering](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/markdown.ts#L432) then chooses that message over the recorded task prompt.

A second synthetic case kept the same prompt but omitted `agentDescription` from the child start. The task description remained in the parsed tool data but wasn't rendered. Layer D reported the tool input partial and failed in both cases. A control with matching prompts and a repeated description passed. No real-chat frequency or meaning of differing prompts was checked. [WI-035](../work-log.md#wi-035) tracks the input and verification follow-up.

### Child opaque reasoning count

**Observed here:** a synthetic child assistant message contained opaque reasoning. The parsed child turn counted one such message, but the export footer reported zero and the text check passed. [The footer calculation](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-export.ts#L48) sums main turns, not nested child turns. This is a count of unreadable material, not readable reasoning that can be reconstructed. [WI-036](../work-log.md#wi-036) tracks the count.

## Decisions and tradeoffs

| Approach | Decision and reason |
| --- | --- |
| Merge child turns into main turns | Rejected by the [earlier scope decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L451). Separate scopes keep the agent and delegation identifiable. |
| Treat a returned tool summary as the full child transcript | Rejected in the [archive research](../work-log-archive.md#sdk-coverage-and-source-limitations). A summary doesn't contain the child conversation. |
| Use the sister project's knowledge adapter as the fidelity engine | Rejected in the same research. It targets best-effort knowledge extraction and has omission rules unsuitable for this exporter. |
| Add shutdown or checkpoint totals across resumes | Rejected because the totals are cumulative and would overcount. See the [usage policy](../docs/SPEC.md#agent-usage-and-credits-approved-october-14). |
| Estimate credits from tokens or assign a whole-log total to a child | Rejected by [old item #20](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L361). Recorded credits and their scope are needed. |
| Sum credits across chats | Rejected because forks and copies can duplicate history. See [AGENTS.md](../AGENTS.md#usage-and-credits). |
| Use one flattened order sequence for all events | Rejected after false positives. Child conversations and companions don't render in raw event order. See [WI-021](WI-021-source-aware-verification.md#decisions-and-tradeoffs). |

## Notes

### 261105 - ambiguous child archive handling

The exporter now attaches only verified tool-call/agent-ID mappings. It omits unresolved child conversations and adds an archive warning. Layer D treats candidate text from those mappings as an intentional omission while still checking verified scopes. The synthetic CLI export passed `--strict`; the real wrong-child case remains unconfirmed. WI-034 was accepted and closed; WI-049 waits for review. The [focused tests](../temp-tool-output/261105-0205-wi049/focused-tests.log) and [full verification](../temp-tool-output/261105-0205-wi049/verify.log) are local receipts.

### 261103 - synthetic migration review

Focused checks used synthetic events and isolated home, cache and temporary paths. No real chat sessions or native stores were inspected. The [delegation probe](../temp-tool-output/261103-1300-wi-019/delegation-probe.mts) and [result](../temp-tool-output/261103-1300-wi-019/delegation-probe-opaque.log) cover prompts, mappings, opaque counts and the 90% boundary. The [CLI probe](../temp-tool-output/261103-1300-wi-019/ambiguous-cli-probe.mts) and [result](../temp-tool-output/261103-1300-wi-019/ambiguous-cli-probe.log) cover one ambiguous mapping through strict export. [Focused test results](../temp-tool-output/261103-1300-wi-019/focused-tests.log) and the [listing check](../temp-tool-output/261103-1300-wi-019/listing-ambiguity-test-rerun.log) are local, Git-ignored receipts.

The [old log](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L350) reported strict checks on 25 verified main sources at the time. Those historical corpus checks weren't rerun here and don't prove the synthetic cases above were covered. An [earlier archive note](../work-log-archive.md#sdk-coverage-and-source-limitations) said SDK export didn't exist yet. The later 261014 implementation receipt and current source supersede that statement.

The first attempt to run the focused listing test used an invalid Windows ESM import specifier. The corrected test-wrapper command passed; no product code changed.
