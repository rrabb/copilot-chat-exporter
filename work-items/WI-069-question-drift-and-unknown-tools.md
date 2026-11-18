# WI-069 Question drift and unknown question tools

## At a glance

- **Goal:** make sure a question to the user never silently loses its special box. This covers a new question tool, and a known question format that changes.
- **Follow-up to:** [WI-068](WI-068-question-answer-rendering.md), closed 261118. Its [known limits](WI-068-question-answer-rendering.md#known-limits) list what's still guessed.
- **Status:** ✅ Done. Accepted by the dev 261118.
- **Child:** [WI-070](../work-log.md#wi-070) collects real samples to replace the guesses.

## Why

Before this item, two kinds of drift were silent:

| Drift | Before | Risk |
| --- | --- | --- |
| A known format changes, for example new `ask_user` answer wording | The box showed ⚠️ and the raw data, but no check reported it | Only someone reading every export would notice |
| A new or renamed question tool, for example `ask_followup_question` | Rendered as an ordinary tool line | The decision got buried |

A new Local response `kind` was already caught by the census and failed `--strict` (see `docs/UPGRADING.md`).

## What was built (261118)

1. **Question census.** `questionCensus` in `src/session/questions.ts` fills `Census.questionWarnings` for Local and agent chats. Keys are `<source>:parse-warning` and `guessed:<tool name>`.
2. **Reporting.** `--verify` prints "Questions not fully read", and so does an export that has any. `--verify --strict` fails with the reason `question-not-read`. The verify JSON census has a `questionWarnings` map.
3. **Name detection.** `isQuestionLikeTool` splits the tool name into words and looks for: ask, question(s), elicit, elicitation, choose, choice(s), clarify, clarification, poll, survey, or "user input". `task` and `mask` don't match `ask`. `confirm` and `prompt` are left out because most tools with those words don't ask the user anything.
4. **Guessed box.** `parseGuessedQuestion` reads common field names:

| Part | Field names tried |
| --- | --- |
| Question | `message`, `question`, `prompt`, `text`, `body`, `description`, `query` |
| Title | `title`, `header`, `heading`, `label`, `name` |
| Choices | `choices`, `options`, `answers`, `buttons`, `items`, `enum`, `suggestions` (strings, or objects with `label`, `title`, `value`) |
| Several questions | `questions[]`, or a JSON `requestedSchema` or `schema` |
| Answer | The result text, with a prefix such as "User selected:" removed |

The box looks like any other question box, plus an ℹ️ line: "Unrecognized question tool `x`. The exporter guessed this layout from the tool's field names." With several fields, the whole answer shows as text, because it can't be split safely.

## Review fixes (261118)

The dev reviewed rendered samples and asked for these fixes:

| # | Problem | Fix |
|---|---|---|
| 1 | `recommended: true` showed as "(default)" | Shows "⭐ *(recommended)*" |
| 2 | Every guessed box said "Typed answer allowed" | Only when the tool sets `allowFreeformInput`, `allowFreeform`, `allow_freeform` or `allowCustom` to true |
| 3 | The recorded JSON showed `"answer": null` | Keeps the result text when there's no structured result |
| 4 | The badge cut `mcp_` from the tool name | Guessed boxes show the full tool name |

**More detail in warnings.** Each question that wasn't fully read now gets its own line: key, turn, title, what was read, and the argument names. `--verify` lists up to 20, and an export lists up to 5. The verify JSON census has a `questionWarningDetails` list. Example:

```text
guessed:ask_followup_question · turn 1 · "Which database?" · 1 field(s), 2 option(s), answered. Arguments: question, options
```

**Warning in the export (dev chose option 1).** When any question was guessed or not fully read, a `[!WARNING]` line under the decision index gives the count. It links to a list at the bottom, in the "about this export" section. Each list item links to its box, including questions inside sub-agents. The index marks every guessed question "ℹ️ Guessed", including cancelled and declined ones. Exports without warnings don't change. See the [examples](notes/WI-069/guessed-question-examples.md).

Checks: `pnpm run verify` passes 807 of 807, and the golden check matches.
## Checks

- Focused tests: 4 new cases in `test/questions.test.ts`. `pnpm run verify` passes 804 of 804, and the golden check matches.
- **False alarms:** 235 distinct tool names from this machine's agent and Local chats were checked on 261118. None matched the detector.
- Local `9d4f66e3` verify reports "Questions not fully read: none".
- ⚠️ `--verify 3eba66e9` (this very large agent chat) failed with a stack overflow in `src/verify/sdk-loss-account.ts`. This item didn't change that file. Logged in the Inbox.

## Limits

- The guessed layout is a best guess from field names. It can pick the wrong field as the question, or miss choices stored under another name.
- A question tool whose name has none of the words above still renders as an ordinary tool.
- The name list comes from tool names seen in VS Code, the Copilot SDK and common MCP servers. It isn't from a documented list.
