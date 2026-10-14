---
name: export-chat
description: Export the current (or a specified) Copilot chat session to a rich Markdown archive - prompts, agent reasoning, tool calls, code blocks, token cost, and timing. USE WHEN the user asks to export, archive, or save a chat/conversation, or types /export-chat.
license: MIT
---

# Export chat session

Export a VS Code Copilot chat conversation to a human-readable Markdown archive using the repo's exporter.

## When to use
- The user asks to export / archive / save the current chat, or types `/export-chat`.
- The user wants a past session exported by id.

## How it works
The exporter reads VS Code's **native chat journal** (`chatSessions/<id>.jsonl`) as the definitive source and enriches raw tool-output bodies from `chat-session-resources`. It produces a Markdown file with: session metadata, a cost/timing summary, a user-questions table of contents, per-turn prompts (styled header + right-aligned timestamp), recovered agent reasoning (🧠/💡), interleaved tool calls (🛠️) with persisted output (📦), assistant text and code blocks, a per-turn `ℹ️ Turn info` panel, and a cost footer (⏱️ 🔢 💳 🤖).

## Commands (run from the workspace root)
- Current session (auto-detected via `VSCODE_TARGET_SESSION_LOG`), using the host project's script:
  ```
  npm run ai:export:chat -- --current
  ```
- Installed package only (the project lists it as a dependency):
  ```
  npm exec -- copilot-chat-export --current
  ```
- Choose the output path:
  ```
  npm run ai:export:chat -- --current docs/chat-exports/my-session.md
  ```
- List all known sessions (id, date, title), then export one by id:
  ```
  npm run ai:export:chat -- --list
  npm run ai:export:chat -- --list --full-ids
  npm run ai:export:chat -- <sessionId-or-unique-prefix> [outputPath]
  ```
- For a shorter recent list use `--last25`; use `--show-ignored` to include `/fix`, confirmed-empty, and ambiguous entries hidden by default.
- Compact listings show the shortest unique UUID prefix (at least 8 hexadecimal characters), which can be passed directly for export when exactly one Local journal matches. Use listing-only `--full-ids` for complete IDs; if the same ID exists in multiple workspaces, pass an exact `.jsonl` path.
- The listing `TYPE` column identifies local, agent, sub-agent, or Copilot CLI rows; `ID/PREFIX` contains the copyable selector. `verified` means backing identity was checked; `unresolved` means no chat backing was verified; `ambiguous` / `🟠 ❓` means a safe backing/scope could not be selected. Verified SDK backing does not yet mean SDK Markdown export is supported.
- `New Chat` rows with both creation date and prompt count unknown are hidden by default; `--show-ignored` includes them.
- Listing also writes a self-contained HTML report to the invoking directory by default. Use `--no-html` to suppress it or `--html-output <path>` to choose a destination; an existing report requires `--overwrite`. The report is offline and is not opened automatically.
- Add listing-only `--detailed` for the richer identification report: prompts, models, historical edits, title/date evidence, family links and source diagnostics. It replaces basic HTML only; console output is unchanged. `--detailed --no-html` warns and produces only the console listing. Reports contain private text and paths; best-effort redaction is not full sanitization.

## Steps
1. Prefer the host's `ai:export:chat` script when present (a linked install defines it as `node tools/copilot-chat-exporter/dist/cli.js`). Use `npm exec -- copilot-chat-export` only when the package is installed; otherwise npm downloads whatever package has that name from the registry.
2. Pass an explicit session id/path when given. Otherwise pass `--current`, plus an output path if supplied. No arguments now lists instead of exporting. If current identity or root selection is unavailable/ambiguous, ask the user to select a root/source; never guess the newest session.
3. Run the command in the terminal and wait for it to finish.
4. Report the `Output:` path and the one-line summary (turns, tool calls, reasoning notes, resources).

## Notes
- Do not fabricate content; the script only reads local journals.
- Multiple installations require `--user-data-root <path>` or an interactive numbered selection. Provider rows may be listed but SDK Markdown export/current identity is still being implemented; do not substitute a similarly named Local session.
- Existing archive files are refused unless `--overwrite` is explicitly authorized. Do not add that flag automatically to bypass a refusal; get the user's replacement decision first.
- Colored badges render in the VS Code Markdown preview; GitHub shows the text without color.
- A folder-copy install may expose `tools/copilot-chat-exporter/src/cli.ts`; an installed package uses its `copilot-chat-export` bin.
