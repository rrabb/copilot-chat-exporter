# WI-087 Chat info command

- Status: ⏳ Waiting · Medium. Implementation 261126. Review fixes done 261126 (see [Fix results](#fix-results-261126)). Waiting for dev acceptance.
- Tags: [build]
- Related: [WI-015](WI-015-discovery-and-selection.md) (selectors), [WI-086](../work-log.md#wi-086) (terminal listing conventions)

## At a glance

- Goal: inspect one chat through `--info <selector>`, with a compact default view, `--full` and unstable JSON.
- Shared data: `ChatInfo` is a project data type. Terminal, JSON and the future HTML card should render from it.
- Scope: Local and agent chats use the same selector rules. These rules refuse ambiguous matches.
- Decisions:
  - Schema 0
  - 100-word final-response previews
  - Unique top-level artifact totals
  - No chat-to-chat comparison in terminal output
- Progress: argument parsing and focused tests pass. Real Local and Agent Host checks pass. Regular and detailed HTML listings are in `temp-tool-output/261126-2040-wi087-validation/` for review.

## Goal

`copilot-chat-export --info <selector>` prints one chat's details in the terminal. You can check a chat's identity, size, cost and history without opening the HTML listing or exporting it. It resolves selectors the same way export does, and refuses ambiguous ones the same way.

## Done when

- `--info <selector>` shows a compact, redacted summary for one verified Local or agent chat.
- `--info --current` uses the same verified evidence for the current session as Local export.
- `--full` adds:
  - Every title and date source
  - Every turn and 100-word response preview
  - Sub-agents, relationships and artifact paths
- `--json` prints `schemaVersion: 0` and is identified as unstable.
- Selection failures create no archive or source capture.
- Focused parser and renderer tests pass. Real Agent Host and Local checks pass. Regular and detailed HTML reports remain readable and structurally unchanged.

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

## Implementation and review

- 261126: argument parsing, `ChatInfo`, terminal default/full renderers and unstable JSON are implemented.
- Real Agent Host check: `79df1255` resolved to the underlying chat `474cc940-6847-4e78-b701-b87f663910d5`, 7 prompts, 422.02 credits, 4 sub-agents and 15 related artifacts.
- Real Local check: `e47df75c` resolved as a verified journal, 2 prompts and a partial 1.3 MB top-level artifact total. An unreadable resources directory stays unknown instead of hiding the known size.
- Regular and detailed `--last25` reports ran sequentially with the same Code root. Both showed 777 source occurrences across 622 conversations, with 216 sub-agent chats hidden. HTML sizes and main sections were reviewed.
- Remaining work:
  - Make the full terminal view easier to read
  - Add CLI and library tests for ambiguous and current paths
  - Run `pnpm run verify`
  - Add final docs

## Review 261126 and approved plan

A review compared `--info` and `--info --full` for `79df1255` and `abe198e4` with their cards in the regular and detailed `--last25` reports. The data gathering works and takes about 10.5 s per chat. The terminal output had correctness bugs and was hard to read. You approved the plan below on 261126. Raw outputs are in `temp-tool-output/261126-2135-wi087-info-review/`.

### Bugs found

| # | Problem | Evidence |
| --- | --- | --- |
| B1 | Every sub-agent selector printed the parent prefix, so none could be copied. | `chat-info.ts` used `ids.get(child.key)`. The listing shows the full `#subagent/call_…` key. |
| B2 | Sub-agents counted twice: 4 in `--info`, 2 in the detailed card. Each child showed as a verified "Subagent <uuid>" row and an unresolved row with the real name. | `79df1255` and `abe198e4` `--full` output |
| B3 | The relationship line labelled this chat's own occurrence hash as `parent:`. | The detailed card shows "Child · <name>". |
| B4 | Canceled turns weren't flagged. | `ChatInfoTurn.canceled` was never rendered. The card shows 🚫. |
| B5 | Per-turn "edits" counted edit records, not files (turn 6: 30 edits vs 16 files). | `editCount: turn.files.length` |
| B6 | The artifact total included the workspace `state.vscdb` and backup (~70 MB) that every chat in the workspace shares. | The card reports 11.6 MB for the chat's own data. |
| B7 | Credit rounding differed from the HTML (422 vs 423, turn 4: 176 vs 177). | Both outputs. The HTML rule wasn't checked. |

Readability problems: three date formats in one output, `--full` repeated the default view and the artifact list, lines up to 714 characters, raw token counts, markdown tables and links flattened into previews, and legends that didn't match the shown values.

### Plan

1. **Phase 1:** fix B1-B7.
2. **Phase 2:** section layout with aligned labels, a turns table with wrapped prompt and response previews (markdown stripped, tables shown as `[table: N rows]`), one date format (`1126-14:44` in text, ISO only in JSON), and ANSI color only on a terminal with `NO_COLOR` unset.
3. **Phase 3:** add to `ChatInfo`: cost by model (calls, credits, input, cache read and write, output), cache share, canceled and error flags, a per-file change list, sub-agent details (name, copyable key, model, credits, first prompt) and storage grouped as this chat, VS Code per-chat and shared.

`--full` gets most of the detailed card except file and database composition. Actionable sections come first (turns, cost by model, files, sub-agents). Titles, dates, identity and paths go last under Sources. The default view has no hard line limit. It grows when a line adds value.

Cut from text output but kept in JSON: raw recorded timestamp values, `prompt.N` date rows and occurrence hashes. Lock, hold and empty files fold into one count.

Deferred: checkpoint titles (format unchecked), tool-call counts per turn (unknown whether listing evidence has them), searching both Code roots to skip the root prompt (collision risk because `~/.copilot` is shared).

### Fix results 261126

A build agent did all three phases in three passes. The coordinator reviewed each pass. Outputs are in `temp-tool-output/261126-2200-wi087-info-fixes/` (`before`, `after`, `after2`, `after3`).

| Item | Result |
| --- | --- |
| B1-B6 | ✅ Fixed. `79df1255` shows 2 named sub-agents and `abe198e4` shows 1, matching the detailed cards. Child rows now come from the listing's parent edges, like the card's family tree. |
| B7 | ✅ Explained. The card header rounds up (`Math.ceil`, `detailed-listing.ts:83`). The card's credit table and `--info` round to nearest (`creditText`). |
| Previews | ✅ `responsePreview` now keeps line breaks, so tables show as `[table: 4 rows]` or `[table: 1 row]`. Only `--info` reads it, so HTML output can't change. |
| Layout | ✅ Aligned turns, files, cost-by-model and storage columns. Flags sit at the row end. Paths aren't wrapped, and `~` stands for the home folder in text only. Top turns stay one line each. |
| Color | ✅ ANSI color only on a terminal with `NO_COLOR` unset. Piped output has no color codes. |

Known limits: `--full` repeats the Cost section from the default view. Each chat still takes about 10.5 s because it builds the full inventory.

## Risks

- ⚠️ Reading the full inventory for one chat could be slow. The spike checks this first.
- ⚠️ Response previews depend on the parser and may be missing for some chats. Show `?` when they are.
- ℹ️ People may script against the JSON. The `schemaVersion: 0` field and the unstable label warn them that fields can change.
