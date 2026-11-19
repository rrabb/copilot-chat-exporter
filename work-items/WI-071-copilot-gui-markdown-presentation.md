# WI-071 Copilot GUI-aligned Markdown presentation

## At a glance

- **Goal:** make exported Markdown easier to scan by matching useful Copilot GUI grouping, headings, status and summaries.
- **Boundary:** improve the presentation of content that the exporter already parsed. Don't hide source content, reorder the conversation or invent facts.
- **Not WI-052:** this is a concrete rendering item. WI-052 researches optional detail controls.
- **Direction (261118):** group Agent Host tool requests and use neutral tool styling.
- Keep questions and sub-agents standalone. Summarize usage without repeated warnings.
- **Sub-agent rule:** render each sub-agent at its recorded position. It is a sibling of an ordinary tool group, never a child of that group.
- **Usage rule:** show first model use and every model change. Put complete per-call detail in one collapsed block for each user request.
- **Implementation:** approved 261118. Review feedback added a second pass for titles, tool order and verification.
- **Checks:** `pnpm run verify` passes 818 of 818. Both typechecks, the Local golden and the SDK golden pass.
- **Outcome:** the dev accepted the final review export on 261118. WI-072 remains open for Local grouping research.

## Original goal

The exported Markdown currently renders every tool call as a separate block. The Copilot GUI groups calls requested in one assistant reply and shows richer one-line summaries.

The dev asked for research into grouping, tool summaries, repeated usage warnings, reasoning summaries and other missed or weak presentation. The comparison came from a rendered export, a screenshot of the Copilot GUI and session `3eba66e9`.

## Done when

- Agent Host calls from one `assistant.message.toolRequests[]` group in recorded order.
- A question never joins an ordinary tool group.
- A sub-agent never joins an ordinary tool group. It renders as a prominent standalone block at its recorded position.
- Ordinary read, search, glob and edit tools use quiet, neutral summaries with useful paths, ranges or queries.
- An exact duplicate `Intent` line is omitted from the expanded body. A different intent stays.
- Failed, cancelled or unfinished tools show status in the one-line header.
- A readable reasoning summary appears in the collapsed header. Model-call duration is labelled as such.
- First model use and each later model change get a 1-2 line usage summary.
- Every supported usage receipt stays available in collapsed detail. Unknown fields still reach the schema census.
- Known usage fields such as `responseModel` and `inferenceGateway` aren't reported as unsupported.
- Tests cover grouping, exceptions, headers, status, usage summaries and missing fields.
- `docs/SPEC.md`, `CHANGELOG.md` and relevant source-schema docs match the new output.
- Focused tests, golden review and `pnpm run verify` pass.
- The dev reviews the rendered result and decides whether derived group labels work.

## Work tree

Progress as of 261118: 3 of 4 items complete. WI-072 remains queued after WI-071.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | Agent Host grouping, quiet headers and status | [build] | M | complete 261118 |
| 2 | Standalone sub-agent and reasoning presentation | [build] | M | complete after 1 |
| 3 | Usage summaries, model-change rows and kept detail | [build] | M | complete 261118 |
| 4 | [WI-072 Local tool batch research](../work-log.md#wi-072) | [research] | S | WI-071 |

## Current understanding

### Tool groups are recorded for Agent Host chats

**Observed here, 261118:** one `assistant.message` contains the ordered `toolRequests[]` array. The execution events then carry each matching `toolCallId`.

For session `3eba66e9`:

| Finding | Count | Limit |
| --- | ---: | --- |
| Assistant messages with tool requests | 1,094 | One sampled Agent Host session |
| Messages with 2-11 requests | 361 | About 33% of tool-bearing messages |
| Multi-tool messages containing a question-like tool | 0 | This sample doesn't prove future separation |
| Sources with an exact persisted group title | 0 | The group boundary exists, but no group name was found |

Request 56 records two `view` calls in one assistant message. The current parser puts both into the flat `Turn.body` stream at [sdk-session.ts](../src/session/sdk-session.ts). The renderer then gives each call its own block at [markdown.ts](../src/markdown.ts).

**Decision:** keep the assistant message identity on each tool and group only tools that share it. Don't group adjacent calls from separate assistant messages.

### Group titles need a cautious fallback

The source records a boundary, but it doesn't record a title such as "Read 4 files". The title must be derived.

Use a specific title only when every member is the same quiet operation:

| Calls | Proposed title |
| --- | --- |
| Several `view` calls | `Read 3 files` |
| Several `grep` or `rg` calls | `Search 4 queries` |
| Several edits | `Edit 5 files` |
| Mixed calls | `5 tool calls` |

If a derived label becomes confusing, remove the specific wording. Fall back to the generic call count. Never use the label as evidence that an operation happened.

### Ordinary tool calls should stay quiet

**Decision:** don't add colorful book, search or folder emojis to ordinary calls. They draw too much attention away from decisions, failures and sub-agents.

Use this priority:

1. A plain text label plus the existing neutral styling.
2. A monochrome symbol when Markdown and the preview support it consistently.
3. The current generic `🛠️` tool marker as fallback.

Keep complete tool input and output in the expanded body.

### Questions and sub-agents don't join tool groups

Questions already have special rendering from WI-068. A question-like tool stays as a standalone, never-collapsed box.

Sub-agents get similar importance, but the source order stays intact:

- Detect the recorded delegation tool at its normal stream position.
- Close any ordinary tool group before it.
- Render the sub-agent as a prominent standalone block.
- Continue ordinary tools after that block.
- Keep the delegated task, returned summary and full child conversation available.

Moving all sub-agents to a separate section was rejected. It is easier to scan, but it can imply a different execution order.

### The repeated usage warning isn't a tool failure

**Observed here:** `session.usage_record` carries real model-call usage. The parser recognizes tokens, credits, duration and accounting fields.

The parser reports the whole receipt as unsupported when it finds any unknown field.

The sampled receipt also recorded:

- `model: claude-opus-5.5`
- `responseModel: claude-opus-5-5`
- `inferenceGateway: false`
- token and timing counters
- AI-credit totals
- tool counts
- completion reason

The 1,172 sampled receipts in `3eba66e9` included:

- 692 with `responseModel`
- 692 with `inferenceGateway`
- 647 repeated unsupported-payload notes in the exported Markdown

The warning catches schema drift. It doesn't mean that the model call failed.

**Decision:** accept reviewed known fields into normalized usage data. Keep unknown fields and invalid values in the census. Don't print one warning per receipt.

### Usage should explain model changes without losing detail

Use one line for the first model used in a contiguous run and another line whenever the model changes. This matters in Fusion mode, where the persisted receipts can show a mid-request model change.

Example:

> 🔢 Used `claude-opus-5.5` [in 1.41m, out 34.5k, reasoning 345, 2.6s]<br>
> 🔀 Model changed to `gpt-6.1-sol` [in 210k, out 18.2k, reasoning 120, 1.9s]

Keep one collapsed table for all usage calls in that user request. It should hold:

- timestamp
- model and provider response model
- input, output, cached and reasoning tokens
- duration
- credits
- finish reason
- delegation scope
- reviewed telemetry such as gateway and tool counts
- unknown-field names and validation issues

Only known values appear in the 1-2 line summary. Missing stays unknown or omitted from that line. A blank usage line never renders.

### Reasoning can show model-call duration

The source doesn't record time per readable thought. It records the duration of the model call that produced the assistant message.

**Decision:** show the duration, but label it as model-call time. Don't call it thinking time.

```text
🧠 Agent reasoning: **Reviewed detail links and planned anchor generation** (model call 1s)
```

When several thoughts belong to one assistant message:

```text
🧠 Agent reasoning: **Planned question-warning anchors and detail links** (3 thoughts, model call 11.3s)
```

## Proposed presentation

These mockups are for review. They aren't output yet.

### Ordinary multi-tool group

```html
<details class="tool-group">
  <summary>🛠️ Read 3 files · 3 completed</summary>

  <details>
    <summary>view: Read .\AGENTS.md, lines 1-80</summary>
    <!-- complete input and result -->
  </details>

  <details>
    <summary>view: Read .\src\markdown.ts, lines 505-527</summary>
    <!-- complete input and result -->
  </details>

  <details>
    <summary>view: Read .\work-log.md, lines 1-56</summary>
    <!-- complete input and result -->
  </details>
</details>
```

Why this direction:

- The outer line explains the batch.
- Inner calls keep precise actions and paths.
- There is no colorful per-tool icon.
- Failure status can appear as `2 completed, 1 failed`.

### Search header

```text
🛠️ rg: Decisions|guessed|parseWarning|Schema drift|unhandled
```

If the intent is the same query, the expanded `Intent` line is omitted. A different intent remains.

### Standalone sub-agent

```html
<div class="agent-block">
  <h3>🤖 Sub-agent · Explore Markdown renderer</h3>
  <p><strong>Task:</strong> Find the tool and reasoning rendering paths.</p>
  <p><strong>Result:</strong> Grouping is flattened in the SDK parser; the renderer owns each header.</p>
  <p><strong>Work:</strong> 7 tool calls, 3 messages, 18.4s, model claude-haiku-5.5.</p>

  <details>
    <summary>Full sub-agent conversation</summary>
    <!-- complete recorded child conversation -->
  </details>
</div>
```

The block is at the delegation point in the parent stream. It can stay collapsed, but the heading and 1-5 line summary remain visible.

### Model usage and reasoning

```text
🧠 Agent reasoning: **Planned the question anchors** (model call 2.6s)

🔢 Used `claude-opus-5.5` [in 109.8k, out 237, reasoning 63, 2.6s]

🛠️ rg: Decisions|guessed|parseWarning
```

If the next receipt uses another model:

```text
🔀 Model changed to `gpt-6.1-sol` [in 80.1k, out 4.2k, reasoning 210, 1.9s]
```

## Decisions and tradeoffs

| Date | Decision | Why |
| --- | --- | --- |
| 261118 | Agent Host grouping is in scope. Local grouping is a child item. | Agent Host has a recorded `toolRequests[]` boundary. Local grouping needs more research. |
| 261118 | Group titles are derived and provisional. | No persisted title exists. Revisit generic-only titles if readers miss important calls. |
| 261118 | Ordinary tools use neutral visual treatment. | Colorful per-tool emojis would distract from questions, sub-agents and failures. |
| 261118 | Questions and sub-agents stay outside ordinary groups. | They affect the conversation and deserve their own attention. |
| 261118 | Sub-agents stay at their recorded position. | A separate section is easier to scan but changes the apparent order. |
| 261118 | Exact duplicate Intent lines are omitted. | The one-line header already says the same thing. Non-duplicate intent stays. |
| 261118 | Failed status appears in the header. | A collapsed failure must not look like a successful call. |
| 261118 | Usage summaries show first use and model changes. | Repeating every receipt creates noise, while model switches carry useful Fusion context. |
| 261118 | Model-call duration can appear beside reasoning. | It is recorded, but it must not be labelled as thought-only time. |
| 261118 | Implementation starts only after dev approval. | The dev reviewed the plan and said "ok proceed". |
| 261118 | Request order is the default. `--tool-group-order completion` is optional. | Copilot displays completion order for parallel calls, but request order keeps the model's recorded plan and the old behavior. |
| 261118 | A group title is derived from operation counts, not copied as a persisted GUI title. | The sampled event log stores individual tool requests, not the Copilot GUI's outer title. |
| 261118 | Intent is omitted only when its exact normalized text appears in the header. | Broader path matching created 852 false Layer D absences in the real export. |

## Risks and limits

| Risk | Effect | Mitigation |
| --- | --- | --- |
| A private source field changes | Groups disappear or attach incorrectly | Keep strict source checks and fall back to ungrouped calls |
| A derived group label sounds specific but is wrong | Readers can miss the actual work | Use generic counts for mixed calls and revisit after a real export review |
| A nested `<details>` structure is hard to keyboard-read | Grouping helps length but may hurt accessibility | Use real headings for important content and test keyboard preview behavior |
| Usage summaries hide phase detail | Model credit or timing can be misread | Keep the complete call table collapsed and keep model-change order |
| Summing usage by request double-counts copied histories | Totals can be wrong | Keep agent scope, receipt identity and existing dedup rules. Don't add child usage to parent totals |
| Local batches don't have the Agent Host boundary | A source-order inference could regroup unrelated calls | WI-072 must establish real evidence before any Local change |

## Implementation plan

| Phase | Work | Gate |
| --- | --- | --- |
| 1 | Add source-backed batch identity to the parsed model and loss checks | Dev approves implementation |
| 2 | Render Agent Host tool groups, quiet summaries and header status | Phase 1 tests pass |
| 3 | Promote questions and sub-agents out of ordinary groups | Rendered mockup review |
| 4 | Add reasoning summary and usage model-change rows | Usage scope and billing tests pass |
| 5 | Add a collapsed per-request usage table and normalize reviewed known fields | No repeated receipts shown in the main stream |
| 6 | Update focused tests, goldens, SPEC, schema docs and CHANGELOG | Review actual before/after export |
| 7 | Run `pnpm run verify` and record findings | Dev acceptance |

## Findings and outcomes

### Implementation 261118

- `ToolNode` keeps the assistant-message batch ID and structured SDK arguments. `ThinkNode` keeps a recorded model-call duration.
- `TurnUsage` keeps ordered own and delegated call rows after existing deduplication and attribution.
- `view`, `grep`/`rg`, `glob` and common edit tools get quiet deterministic headers. Complete input and output stay expanded on demand.
- A tool batch groups only ordinary consecutive calls with the same assistant-message ID. Questions and sub-agents close the group.
- Sub-agents render in a purple standalone block with visible task, result and work lines. Full child conversation stays collapsible.
- Failed tools show `⚠️ failed` in the one-line header.
- Reasoning headers use the first recorded sentence. One thought omits the count. Duration is labelled as model-call time.
- The renderer shows first model use and every later model change per request. A collapsed table keeps every selected call, reviewed telemetry and provenance.
- `responseModel` and `inferenceGateway` now parse without a schema warning.
- Terminal calls use a recorded `description` as a yellow one-line summary beside the exact command. Matching Intent text isn't repeated.
- Unsupported usage receipts no longer create a note per receipt. Their diagnostics group by issue, with counts and example line numbers.
- Local tool grouping remains untouched and belongs to WI-072.

**Accepted 261118:** the developer reviewed the final completion-order export. The command description, completion order, reasoning titles and verification results met the requested presentation.

### Validation so far

- `pnpm test test/markdown.test.ts test/sdk-session.test.ts test/sdk-usage-record.test.ts`: 102 of 102 pass.
- `pnpm run typecheck`: pass.
- `pnpm run typecheck:test`: pass.
- Local and SDK goldens were updated after reviewing the output changes.
- `pnpm run verify`: pass before review fixes. The suite ran 813 tests.
- Review fixes: 818 tests pass, the Local golden matches 1,066 normalized lines, and the SDK golden check passes.

### Review fixes 261118

- The real export's 852 missing tool intents came from a semantic duplicate rule. It now omits an Intent only when its normalized text matches the header.
- Copilot's GUI displays the first completion for parallel calls. The source log keeps both request order and completion events.
- Request order remains the default. `--tool-group-order completion` sorts only ordinary children inside one recorded batch.
- Mixed-group titles now derive from counts, for example "Ran 3 commands, read 4 files". These outer GUI strings aren't persisted in the event log.
- `reasoningBlocks.summary` keeps separate bold-titled items. The parser now keeps one `ThinkNode` per item, so each item gets a lightbulb.
- A frozen real-session probe shows 1,737 tool intents present, zero absent, with both request and completion modes. The remaining 22 Layer D items are pre-existing partial checks for compaction summaries, system prompts and tool text. The earlier baseline had 23 before the newer source snapshot changed.
- A final frozen probe finds the highlighted `Inventory staged...` command description in the header and still reports zero missing intents.
- [Final review export](../temp-tool-output/261118-EXPORTS/wi071-final-review.verify-failed.md) was generated 261118. It records `completion` in Session Metadata. The `reasoning` census increased because each saved summary item is now one thought. It also shows highlighted command descriptions beside exact commands.

### Private source copy meaning

A `.verify-failed.md` keeps a frozen, private source capture so saved-file verification can use the same evidence later. The folder contains a copied `events.jsonl`, a selected-row usage database, source hashes and capture metadata.

It is not the live Copilot session folder. It isn't modified with the source. After the final review export, the cache has ten kept captures totalling about 708 MB. Repeated failed attempts keep distinct evidence by output receipt.

Preview cleanup with:

```powershell
node src\cli.ts --cache --clean --dry-run --older-than 0
```

This command doesn't delete anything. Actual cleanup requires `--yes` or an interactive confirmation and should be a separate decision.

## References

- [sdk-session.ts](../src/session/sdk-session.ts): Agent Host event parser and current flat tool stream.
- [sdk-events.ts](../src/session/sdk-events.ts): source envelope and Agent Host scope rules.
- [sdk-usage-record.ts](../src/session/sdk-usage-record.ts): usage normalization and unknown-field checks.
- [markdown.ts](../src/markdown.ts): tool, sub-agent, note and reasoning rendering.
- [WI-068](WI-068-question-answer-rendering.md): prominent question treatment.
- [WI-019](WI-019-agent-chat-export.md): nested Agent Host conversation and usage decisions.
- [WI-052](WI-052-markdown-level-of-detail-research.md): related display research, not this item's owner.
