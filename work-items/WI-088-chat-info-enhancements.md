Part of [WI-087](WI-087-chat-info-command.md).

# WI-088 Chat info enhancements

## At a glance

- **Goal:** turn the WI-087 acceptance review into small, measurable improvements to terminal detail, JSON and shared report data.
- **Why:** the first version works, but its display rules still drift from the detailed HTML card. The JSON also carries presentation fields and duplicated storage rows.
- **Scope limit:** don't build a second transcript exporter. Keep the existing terminal layout and unstable JSON until a stable schema earns the change.
- **Evidence:** `79df1255` was compared across `--info`, `--info --full`, JSON, the regular listing and the detailed listing on 261126.
- **Next:** review the recommended order, then approve one slice before implementation.

## Comparison: detailed card vs. `--info --full`

| Area | Detailed HTML card | `--info --full` | Review |
| --- | --- | --- | --- |
| Identity | Title, type, project, dates, status and export support | Selector, full key, backing ID, project and status | ✅ Both cover the needed identity |
| Turns | Collapsible prompts, model, effort, costs, tokens and edits | Every turn in order with prompt and assistant preview | Terminal adds useful response context |
| Credits | Header rounds 422.02 up to 423 credits. The accounting table rounds to 422 | Shows 422 and keeps smaller values more precise | ⚠️ The display policies differ |
| Turn costs | 177, 132 and 81 credits | 176, 131 and 80.6 credits | Same records, different rounding |
| Files | 16 files, `+390/-66`, operation records and event-line evidence | 16 aggregate files, `+/-`, path and turn | HTML is stronger for showing where each value came from |
| Sub-agents | 2 linked child cards and a family tree | 2 named children with full keys, model, cost and first prompt | ✅ The two views complement each other |
| Regular listing | 4 sub-agent occurrence rows: 2 verified and 2 unresolved references | 2 merged, verified child conversations | Expected listing-model difference |
| Storage | 11.6 MB scoped payload | 13.7 MB backing folder, 168 KB VS Code data, 70.1 MB shared data and 11.6 MB records | Terminal explains ownership better |
| Dates | Headline dates and provenance cards | Headline and every recorded date source | ✅ Values match |
| Navigation | Search, filters, links, disclosures and pinning | Linear terminal report, copyable keys and JSON | Each view fits its medium |

## Main feedback

| # | Finding | Recommendation |
| --- | --- | --- |
| 1 | `--info` and the detailed card now match on counts and core values | Keep the accepted terminal layout |
| 2 | Detailed headlines round credits up. The terminal and detailed accounting table round to the nearest value | Use one display policy. Recommend nearest rounding with exact values in JSON and HTML tooltips |
| 3 | "This chat" means the backing folder for an SDK chat, not its scoped transcript records | Rename it "Backing folder" for SDK chats and "Journal" for Local chats |
| 4 | `--full` clips prompts to 60 words and replies to about 100 words | Keep clipping, but call these previews in help and output |
| 5 | Table placeholders don't name columns | Consider `[table: 4 rows · columns: Area, Status, Evidence]` when the header can be parsed |
| 6 | The full output omits model auto/selected state and per-turn usage basis | Add these only for accounting diagnosis. Don't add them by default without a user need |
| 7 | The HTML and terminal answer different questions | Don't copy the card into the terminal |
| 8 | A future `--turn N` view is more useful than dumping a full transcript | Defer full terminal transcripts. The exporter already handles lossless review |

## JSON schema review

### What works

The tested record is 30,545 bytes and has 48 top-level fields. It keeps:

- typed unknowns as `null`
- full prompts
- structured turn records
- per-model usage
- unique file changes
- sub-agents and relationships
- grouped storage
- date provenance
- `schemaVersion: 0` and `unstable: true`

This is useful for scripts, but it isn't a stable public schema.

### Problems to fix before version 1

| Problem | Current effect | Recommendation |
| --- | --- | --- |
| Artifacts repeat | 15 artifact objects appear in `artifacts` and again under `storageGroups` | Keep one artifact list. Add a group key to each row |
| Ambiguous `totalBytes` | It sums non-shared groups, not every byte in `artifacts` | Rename it `ownedBytes` or `backingBytes`. Define its exact scope |
| Floating credit value | `usage.credits` is `422.02170500000005` | Emit the canonical integer in nano-AIU, the recorded credit unit, plus a decimal credit view |
| Presentation fields | `exportCommand`, `modelChain`, `topTurns` and shortened first/last prompts mix display data with facts | Keep exact facts at the top level. Put render hints under `display`, or remove them |
| Preview-only replies | JSON has full prompts but only `responsePreview` | State in help and schema docs that this isn't a transcript |
| Missing accounting evidence | Per-turn usage basis, selected/auto model state and some coverage fields aren't serialized | Add them only after a schema-use case proves the value |
| No renderer parity test | JSON, terminal and HTML can choose different counts or rounding | Test exact source values and approved display rules |

### Is JSON used by HTML?

No. The current paths are separate:

| Output | Main input |
| --- | --- |
| Regular HTML | `SessionOccurrence` groups |
| Detailed HTML | `ListingEvidence` |
| `--info` text and JSON | `ChatInfo` |

They share lower-level listing evidence, but each path chooses fields and formatting separately. Don't make HTML consume the CLI JSON yet.

Prefer a shared exact-facts record. Then render terminal text, JSON and HTML from that record with separate display rules. A stable shared record is more useful than serializing terminal labels into HTML.

## Recommended order

| Priority | Work | Value | Effort |
| --- | --- | --- | --- |
| 1 | Keep the accepted WI-087 terminal layout | High | No work |
| 2 | Align credit rounding and SDK/Local storage labels | High | S |
| 3 | Remove artifact duplication and define byte-scope names | High | S |
| 4 | Add JSON rules for unknown values, credit precision and coverage | High | M |
| 5 | Add a shared exact-facts card record for terminal and HTML | Medium | M |
| 6 | Add `--turn N` or selected full-response inspection | Medium | M |
| 7 | Publish JSON schema version 1 | Low until fields settle | M |

## Performance item

`buildChatInfo` currently collects listing evidence for the selected chat, finds child relationships, then collects it again with the child chats.

This is an optimization hypothesis, not a measured claim. The accepted WI-087 run took about 10.5 seconds, but that includes full-inventory discovery.

Measure before changing code:

1. Time inventory discovery separately.
2. Time `buildChatInfo` for one SDK chat with children.
3. Time the two evidence-collection calls separately.
4. Reuse the first selected-chat map when adding child evidence.
5. Compare output hashes and elapsed time before and after.

Proceed only if the repeated read costs enough time to justify extra cache and merge logic.

## Done when

- One approved slice has tests for its exact facts and display rules.
- Credit rounding is the same where the interface promises the same metric.
- SDK and Local storage labels name the measured files accurately.
- JSON has one artifact row per measured path.
- JSON byte and credit fields state their units and scope.
- The text help says that `--full` and JSON contain previews, not complete responses.
- Any shared HTML work uses exact facts, not terminal strings.
- Before-and-after timing exists for the evidence-read optimization.
- `pnpm run verify` passes.

## Deferred

- A lossless terminal transcript
- Full prompts and responses in `--info --json`
- JSON schema version 1
- A direct HTML renderer over CLI JSON
- Checkpoint titles
- Tool-call counts per turn
- Searching both VS Code roots for one command

