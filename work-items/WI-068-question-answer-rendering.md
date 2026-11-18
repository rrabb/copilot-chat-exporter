# WI-068 Question and answer rendering

## At a glance

- **Goal:** show each agent question and its answer as a prominent decision box that never collapses. These answers steer the rest of the chat.
- **Decisions (261117):**
  - Hybrid style: a styled box with an outline heading.
  - A decision index near the top.
  - Raw JSON collapsed at the bottom of each box, and the answer shown once.
- **Scope:** agent `ask_user` (both input styles), Local `questionCarousel` (which also carries MCP form elicitations), and Local `elicitationSerialized` (MCP confirmations and URL requests).
- **Biggest finding:** Local exports drop the user's answer today. Only the questions and options render.
- **Research finding:** the agent's `user_input.*` and `elicitation.*` events are never written to disk, so there is nothing to parse. The `ask_user` tool records are the only trace.
- **Outcome:** dev accepted WI-068 on 261118. Phases 1-4 are complete and ready for commit grouping.
- **Evidence limits:** real MCP elicitation and `ask_user` cancellation samples remain optional.

## Original goal

From the dev's Inbox line of 261117: `ask_user` needs special treatment, not ordinary tool formatting. Its decisions drive the rest of the chat. Present the question, answer options and chosen answer with clear formatting like the GUI. Convey its importance visually and include a collapsed JSON structure.

## Done when

- Each question renders as a styled box with a heading and its Markdown rendered. Options show the default and chosen answer. The answer appears once.
- Freeform, multi-field, multi-select, boolean, skipped, declined and cancelled outcomes each have a distinct, readable form. Unparsed answers fall back to the raw text and are never dropped.
- Local `questionCarousel` answers render, closing the current answer loss.
- A decision index appears near the top when a chat has at least one question.
- Question Markdown can't break the surrounding export (headings demoted, fences closed, raw HTML escaped).
- Tests, golden fixtures, SPEC, CHANGELOG and verification checks are updated.

## Current understanding

### How it renders today

| Mechanism | Today | Evidence |
| --- | --- | --- |
| Agent `ask_user` | Generic tool line. Question and schema sit as plain text in a collapsed input block. The answer appears twice (result and detailed result). "Intent: Waiting for response" is noise. | Observed here (dev screenshot 261117), inferred from source: [renderToolNode](../src/markdown.ts) |
| Local `questionCarousel` | A note titled "Copilot questions" with titles, messages and options. **The `data` answer field is ignored, so the answer is lost.** | Inferred from source: `questionCarouselText` in [classify.ts](../src/session/classify.ts) |

### Census of this machine (261117)

A read-only probe scanned 79 agent session logs and 89 Local journals. Observed here:

| Mechanism | Count | Details |
| --- | --- | --- |
| `ask_user`, newer input `{message, requestedSchema}` | 344 calls | Results start "User responded". Field types: enum, multi-enum, boolean, string. Up to 7 fields in one form. |
| `ask_user`, older input `{question, choices, allow_freeform}` | 308 calls | Results start "User selected" (184) or "User responded". No elicitation telemetry. |
| `ask_user` failures | 1 | A schema validation error |
| `ask_user` declined or cancelled | 0 | All 343 calls with telemetry report `accept`. How decline is stored is unknown. |
| Local `questionCarousel` | 88 parts in 17 chats | 70 have `data` and `isUsed`. 18 lack them. Inferred: the journal writes the pending carousel first and patches the answer in later, so 18 may be earlier states rather than unanswered questions. Needs checking by `resolveId`. |
| Local MCP elicitation (`elicitationSerialized`, `elicitation2`) | 0 | See research below |
| Agent `user_input.*` and `elicitation.*` events | 0 | Never persisted. See research below. |

Agent sessions with questions: 47. Local chats with questions: 17. Answer `data` is keyed by `<call id>:<question index>` (observed here, two samples).

### Answer formats (observed here 261117)

| Record | Format |
| --- | --- |
| `ask_user` with choices | `User selected: <choice>` for a listed choice. `User responded: <text>` for a typed answer. |
| `ask_user` with one schema field | Content `User responded: <value>`. Detailed `User responded:` then `<field title or key>: <value>`. |
| `ask_user` with several fields | Content `User responded: key=value, key=value`. Detailed has one `<title or key>: <value>` line per field. |
| `ask_user` multi-select | Values joined with `, `. Options can contain commas, so splitting must match known options. |
| Local carousel | 69 unique questions by `resolveId`, all answered. 19 more were earlier unanswered copies that the journal later patched. 68 of 69 pair with a `vscode_askQuestions` call whose `toolCallId` equals `resolveId`, and the call always comes first. |
| Local carousel answers | `selectedValue` 134, `freeformValue` 30, `selectedValues` 9, `selectedValues` plus `freeformValue` 4. Question types: `singleSelect` 164, `multiSelect` 13. |

### What gets persisted (research 261117)

| Mechanism | Stored where | Answer stored? | Evidence |
| --- | --- | --- | --- |
| Agent `ask_user` | `tool.execution_start` and `tool.execution_complete` in `events.jsonl` | ✅ As result text ("User responded:" or "User selected:") | Observed here |
| Agent `user_input.*`, `elicitation.*` events | Nowhere | Not on disk | Documented: SDK [streaming-events.md](https://github.com/microsoft/copilot-sdk/blob/main/docs/features/streaming-events.md) lines 755-800 mark them "Ephemeral", and line 45 defines ephemeral as not persisted. Rechecked 261117. |
| Local `vscode_askQuestions` | `questionCarousel` part | ✅ In `data` | Observed here, inferred from source |
| Local MCP form with fields | `questionCarousel` part with `source` set to the MCP server and `message` | ✅ In `data`, keyed by random question ids. The original property names and schema are lost. | Inferred from VS Code source, no real sample |
| Local MCP confirmation (no fields) or URL request | `elicitationSerialized` part | ❌ Only `state`: accepted or rejected. A pending request is saved as rejected. | Inferred from VS Code source, no real sample |
| `elicitation2` | Never on disk. It's the live form, converted to `elicitationSerialized` when saved. | - | Inferred from VS Code source |

Gotchas from the research, all inferred from VS Code source and unconfirmed in real data:

- A carousel with `isUsed: true` and empty `data` means "not answered". It can come from a skip, a cancelled request, a response that ended first, or a reload. Don't label it a deliberate skip.
- Answers to `password` questions are masked as `••••••••`.
- `ask_user` cancel may be stored as `success: false` with result content "User cancelled". Only third-party fixtures show this, so it's unverified. No decline string is known.
- The journal may not patch later carousel answers. Our journals do contain `data`, so this needs a real sample.

## Decisions and tradeoffs

| Date | Decision | Why |
| --- | --- | --- |
| 261117 | **Hybrid style:** a `<div>` box with thick colored left bar, tint and border, holding a real heading so each decision appears in the outline. | Most visible in VS Code preview. On GitHub the inline styles are stripped and it degrades to the plain heading and text. The dev's preview renders `[!IMPORTANT]` alerts as purple callouts, so alerts remain a fallback. |
| 261117 | Never collapsed. Raw question and answer JSON collapsed at the bottom of the box. | The decision must be visible. The raw record stays available for audit. |
| 261117 | Decision index near the top, only when the chat has questions. Answers cut to ~100 characters there. Full text stays in the box. | Fast overview of every steering decision. |
| 261117 | Cover all four mechanisms. Build the two observed ones first. Research the unseen two from source and online docs, then build parsers. Create a real sample if needed. | The dev wants full coverage. Building from source alone risks wrong rendering, so real samples are preferred when we can make them. Research outcome: agent `user_input.*` and `elicitation.*` events are never saved, so no parser is possible. Local MCP forms arrive as `questionCarousel`. Only `elicitationSerialized` needs a new parser. |
| 261117 | **Record design approved:** `ToolNode.question` for tool-based questions, a `QuestionNode` only for records with no tool call. | Keeps tool merging, resources and verification working. |
| 261117 | **Fail-safe rendering (dev rule):** when parsing fails, for example after a VS Code format change, the question still gets the big heading and visual markers. The question, answers and selection then show in a fail-safe JSON view. | The decision must stay prominent even when its structure is unknown. The parser sets `parseWarning` and keeps `raw` and `answerText` for this. |

Rejected: Mockup A alone (alert callout) and Mockup B alone (heading and rules). Both stay possible fallbacks. Mockups: [mockups.md](notes/WI-068/mockups.md).

### Risks

- Question Markdown is agent-written. An unclosed fence, stray `<details>` or `#` heading could break the rest of the export. The renderer needs guards.
- The "User responded:" and "User selected:" text formats are private and observed only. If parsing fails, show the raw answer.
- Never-collapsed boxes make exports with many long questions noticeably longer.

## Plan

| Phase | Work | Effort | Status |
| --- | --- | --- | --- |
| 1 | Census real examples. Research unseen record types. | ~1-2 h | Done 261117 |
| 2 | Parsed question record: text, fields, options, default, answer kind, provenance | ~2-3 h | Done and approved 261117 |
| 3 | Renderer, decision index and Markdown guards | ~2-3 h | Done and approved 261117 |
| 4 | Tests, golden, SPEC, CHANGELOG, verification | ~1-2 h | Done 261117, waits for dev acceptance |

### Phase 2 result (261117)

- `src/session/questions.ts` has `parseAskUser`, `parseCarousel` and `parseElicitation`. The record types are in `src/types.ts`.
- Agent `ask_user` and Local `vscode_askQuestions` tool nodes now carry `question`. Local carousels pair by `resolveId`, and the answered copy wins.
- Outcomes: answered, unanswered, cancelled, accepted, rejected, failed, unknown. "Declined" was first dropped, then restored 261117 at the dev's request. It's inferred from the recorded wording. CLI 1.0.112 defines the elicitation actions Accept, Decline and Cancel.
- **Moved to Phase 3:** emitting `QuestionNode` for MCP-only carousels and `elicitationSerialized`, and dropping the "Copilot questions" note. Both change the export, and Phase 2 had to keep rendering unchanged.
- Tests: `test/questions.test.ts`, 8 cases. `pnpm run verify` passed (796 tests). Golden output is unchanged.
- **Real-corpus run (read-only):** 654 of 654 `ask_user` answers and 69 of 69 unique carousels parsed, with 0 warnings. 16 fields had no answer. The 5 sampled were optional text fields left blank. Multi-line typed answers exist and parse correctly. The one earlier failed call didn't show up as failed in this run (not investigated).
- Docs: `docs/CHAT-SESSION-SCHEMA.md` has a new section, "Questions to the user and their answers".

### Phase 3 result (261117)

- `src/markdown.ts` renders each question as an amber box with a `### ❓ Agent asked · <title>` heading. The chosen option shows ✅, the default shows ⭐, and the answer sits in a green block. Declined, cancelled and other non-answers get a red box.
- Each box ends with a collapsed "🧾 Recorded question and answer" block. It holds the raw JSON and the tool's usual input and result blocks, so the verify checks still find them.
- A decision index, "❓ Agent questions and your answers", follows the user-questions list. Each row links to its box.
- If parsing fails, the box shows a warning line. The raw answer text and recorded JSON then show in the open.
- **Changed from the record design:** MCP-only carousels use `NoteNode.question` instead of a new `QuestionNode`. Paired carousel notes are removed, so Local answers show once.
- **Deferred, then built in Phase 4:** `elicitationSerialized` now renders as a question box. See the Phase 4 result.
- **Tests:** 3 renderer tests in `test/questions.test.ts`. `pnpm run verify` passes 798 of 799. The only failure is the golden check (1,026 → 1,066 lines), which Phase 4 updates.
- **Real exports:** Local `9d4f66e3`, `16c996f2` and `510a8b3d` pass every check. This agent chat (`3eba66e9`) shows 30 boxes and 30 index rows. Its content check reports 20 gaps, and a baseline export from `HEAD` reports the same 20, so they predate WI-068.
- Preview exports are in `temp-tool-output\261117-1837-wi068-phase3\`.

### Phase 4 result (261117)

- **`elicitationSerialized`:** no online docs describe it. VS Code source (`chatService.ts:622-661`) gives its fields. It has no options, just accepted or rejected. The box shows the title, message and MCP server. It also lists the implied buttons **Accept** and **Reject or no answer**, and marks the chosen one. It moved from `KNOWN_UNSEEN_KINDS` to the handled list, so a real sample no longer trips strict mode. It's still unverified against a real journal.
- Golden updated: 1,026 → 1,066 lines. The fixture carousel now renders as a red "no answer" box, plus one index row.
- Docs: `docs/SPEC.md` section 5.1 and the layout item 4 note, `docs/CHAT-SESSION-SCHEMA.md`, and `CHANGELOG.md`.
- `pnpm run verify` passes 800 of 800, and the golden check matches.

## Findings and outcomes

- Accepted 261118.
- Agent and Local questions now render as prominent decision boxes with a decision index.
- Local question answers no longer disappear from exports.
- Full verification passed with 800 of 800 tests before acceptance.
- Real MCP elicitation and `ask_user` cancellation records remain unverified.

### Known limits

Some questions render from a guess, because the format isn't documented and no real sample exists here. Each guess shows the recorded data, so nothing is lost. [WI-069](WI-069-question-drift-and-unknown-tools.md) reports drift, and [WI-070](../work-log.md#wi-070) collects real samples.

| Area | What's guessed | Evidence |
| --- | --- | --- |
| Local `elicitationSerialized` (MCP confirmation) | Whole layout. The Accept and Reject buttons are implied. "Rejected" can also mean "never answered". | Inferred from VS Code source. No real sample, and no online docs. |
| Local MCP form (`questionCarousel` without a tool call) | The layout. The original field names are lost. | Inferred from VS Code source. No real sample. |
| `ask_user` declined or cancelled | Inferred from words in the result text. The real text isn't known. | Only a third-party fixture shows "User cancelled". 0 of 343 calls here were declined. |
| `ask_user` failure | Rendered as failed, but 1 failure seen in Phase 1 didn't show up in Phase 2 | Not investigated |
| Password answers | Shown as hidden, because VS Code masks them | Inferred from source |
| Agent `user_input.*` and `elicitation.*` events | Not exported. They're never written to disk. | Documented in the SDK |
| A new question tool | A best-effort box from field names ([WI-069](WI-069-question-drift-and-unknown-tools.md)) | Built 261118 |

### Record design (approved 261117)

- A shared `QuestionRecord` holds the source, message, fields, options, answers, outcome, the raw recorded answer and the raw record.
- **Placement:** `ToolNode.question` for `ask_user` and `vscode_askQuestions`, so tool merging, resources and verification keep working. A new `QuestionNode` only for records with no tool call: MCP carousels and `elicitationSerialized`.
- A Local carousel pairs with its tool call by `resolveId`. Its old "Copilot questions" note is then dropped.
- Outcomes: answered, unanswered, declined, cancelled, accepted (confirmation), failed, unknown.
- The raw answer text is always kept. If parsing can't match an answer, the record carries a warning and the renderer shows the raw text.

## References

- Notes folder [notes/WI-068](notes/WI-068/README.md): the mockups and the read-only probe scripts. Their outputs hold snippets of real chats, so they go in the git-ignored `private\` subfolder. Moved from `temp-tool-output\261117-1743-ask-user-mockups\` on 261117.
- Earlier LOD findings on question records: [findings.md](notes/WI-052/findings.md), [controls.md](notes/WI-052/controls.md)

## Notes

### 261117 - Record fields for parsers (research agent, condensed)

Sources: `microsoft/vscode@main` fetched 261117, not diffed against stable 1.146.0, so line numbers may drift. `microsoft/copilot-sdk@main`. MCP spec 2025-11-25.

**`questionCarousel`** (`chatService.ts:541-620`): `questions[]`, `allowSkip`, `resolveId?`, `data?`, `isUsed?`, `message?`, `source?` (MCP server), `answeredExternally?`, `autoReply?`, `terminalId?`, `answerPresentation?`.

- Question: `id`, `type` (`text`, `singleSelect`, `multiSelect`), `title`, `message`, `detailedMessage`, `description`, `context`, `options[{id,label,value}]`, `defaultValue` (string or string array), `allowFreeformInput`, `required`, `password`, `validation`, `note`.
- `data` value per question id: a string, `{selectedValue?, freeformValue?}`, or `{selectedValues[], freeformValue?}`.
- MCP field mapping: `boolean` becomes `singleSelect` true/false. Enum and `oneOf` become `singleSelect`. Array of enum becomes `multiSelect`.

**`elicitationSerialized`** (`chatService.ts:622-661`): `title`, `message`, `subtitle` (`"<server> (MCP Server)"`), `source`, `state` (`accepted` or `rejected`), `isHidden`, `acceptedResult?` (never set by the MCP path).

**Agent `elicitation.requested` and `user_input.requested`** (ephemeral, listed only to explain the zero count): `message`, `mode` (`form` or `url`), `requestedSchema`, `url`, `elicitationSource`, `toolCallId`. Completion carries `action` (`accept`, `decline`, `cancel`) and `content`.

**Ways to create real samples:** write a minimal MCP server. Its tool calls `elicitInput` with a boolean, a string and an enum field. Run it in VS Code Agent mode to test accept, skip and reload. An empty `properties` object produces the confirmation case. For `ask_user` cancel, force a question in the CLI and press Esc.
