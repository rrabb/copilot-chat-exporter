# WI-068 notes

Working files for [WI-068 Question and answer rendering](../../WI-068-question-answer-rendering.md). Moved from `temp-tool-output\261117-1743-ask-user-mockups\` on 261117.

| File | What it is |
| --- | --- |
| [mockups.md](mockups.md) | The rendering mockups. The approved style is a hybrid of Mockup C's box and Mockup B's heading. Open it in Markdown preview. |
| `question-census.mjs` | Counts question records and answer outcomes in agent session logs and Local journals |
| `answer-shapes.mjs` | Groups `ask_user` answer text formats |
| `carousel-pairing.mjs` | Checks how Local carousels pair with `vscode_askQuestions` calls |
| `peek.mjs` | Prints a few raw question records |
| `parser-corpus.mts` | Runs the exporter's question parsers over real chats and reports outcomes and warnings |
| `private\` | Git-ignored outputs. They hold snippets of real chats. |

⚠️ Every script reads live chat data read-only. Counts change as you chat, so treat old numbers as dated.

Run from the repository root:

```powershell
node work-items\notes\WI-068\parser-corpus.mts
node work-items\notes\WI-068\question-census.mjs work-items\notes\WI-068\private\question-census.private.json
```
