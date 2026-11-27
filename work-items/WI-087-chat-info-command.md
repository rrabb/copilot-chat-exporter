# WI-087 Chat info command

- Status: 🔵 Planned. Requirements agreed 261126. No code yet.
- Tags: [build]
- Related: [WI-015](WI-015-discovery-and-selection.md) (selectors), [WI-086](../work-log.md#wi-086) (terminal listing conventions)

## Goal

`copilot-chat-export --info <selector>` prints one chat's details in the terminal. You can check a chat's identity, size, cost and history without opening the HTML listing or exporting it. It resolves selectors the same way export does, and refuses ambiguous ones the same way.

## Design: one data object, several renderers

1. Build one project-owned `ChatInfo` object from the existing listing and detailed-listing data modules (`src/session/listing-*.ts`, `detailed-*.ts`, `sdk-usage*.ts`).
2. Render it three ways: terminal default view, terminal `--full`, and `--json`.
3. Next month, the HTML per-chat card should render from the same object. That's a refactor of `detailed-listing`, not a new HTML page.

**JSON:** `--info <selector> --json` prints the object with `schemaVersion: 0`. It's an unstable debug format, and fields may change until the HTML renderer uses it. It isn't a SPEC contract yet (decided 261126).

## Default view (target about 40 lines)

About 40 lines is a soft target. Nothing gets clipped to fit it.

- Title, type, status and export support
- Copy-ready selector, full key and backing ID
- Workspace or project, cwd, branch
- Created and updated dates, using listing date formats, with the UTC offset shown once
- Turns, sub-agent count, reply count
- Model chain on one line, such as `gpt-5 → claude-sonnet (x3)` (idea 2)
- Credits with coverage, token counts marked partial when partial, edits
- First and last prompt, one line each
- Top turns by credits (idea 1)
- Related files with sizes, and a total size of unique files
- Warnings
- A paste-ready export command (idea 3), then a `--full` hint

## `--full` view

Covers everything the HTML card has, except file composition, byte breakdowns and SQLite page statistics.

- Numbered turn list with time, model, effort, credits, edits and the prompt
- About the first 100 words of each turn's final assistant message. Reasoning isn't included.
- Sub-agents with their selectors and prompts
- Every date with its source, and every title or name with its source
- Identity and provenance: index keys, chat URI, evidence paths
- All related file paths and sizes, like the unified evidence table but without file composition

## Decisions (261126)

| Decision | Choice |
| --- | --- |
| Chat kinds | ✅ Local and agent chats from the start. Local usage gets a "different unit, unverified" label and is never mixed with credits. |
| JSON | ✅ `--json`, unstable, `schemaVersion: 0` |
| `--info --current` | ✅ Show the chat in use (idea 4) |
| Two-chat compare | ❌ Not in the terminal (idea 5) |
| Testing | Prototype level: a few focused tests plus a real-data check. No golden contract. |

## Defaults chosen by the agent (override if you disagree)

- Unknown values print `?`, never zero. Credits follow the [SPEC usage rules](../docs/SPEC.md#agent-usage-and-credits-approved-october-14). Credits are nano-AIU divided by 1e9. Cumulative totals are never added across resumes.
- Redaction applies to `--info` output like it does to exports.
- Total size counts each unique file once.
- `--json` writes to stdout, so you redirect it to save a file.

## Plan

1. Run a short trial (about 1-2 hours) to time how long gathering the details takes for one chat. If it needs the full inventory and is slow, add a targeted single-chat path.
2. Build `ChatInfo` and the default view.
3. Add `--full`, including the 100-word response previews. Those need the conversation parser for that one chat.
4. Add `--json` and `--current`.
5. Update the README and CHANGELOG. Add SPEC notes only for behavior, not the JSON fields.

Effort: about 1-1.5 days for both chat kinds. The HTML refactor is separate, planned for next month.

## Risks

- ⚠️ Reading the full inventory for one chat could be slow. The spike checks this first.
- ⚠️ Response previews depend on the parser and may be missing for some chats. Show `?` when they are.
- ℹ️ People may script against the JSON. The `schemaVersion: 0` field and the unstable label warn them that fields can change.
