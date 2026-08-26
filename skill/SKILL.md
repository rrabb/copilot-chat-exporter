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
- Installed package:
  ```
  npm exec -- copilot-chat-export
  ```
- Current session (auto-detected via `VSCODE_TARGET_SESSION_LOG`):
  ```
  npm run ai:export:chat
  ```
- Choose the output path:
  ```
  npm run ai:export:chat -- docs/chat-exports/my-session.md
  ```
- List all known sessions (id, date, title), then export one by id:
  ```
  npm run ai:export:chat -- --list
  npm run ai:export:chat -- <sessionId> [outputPath]
  ```

## Steps
1. Prefer the host's `ai:export:chat` script when present; otherwise use `npm exec -- copilot-chat-export`.
2. If the user named an output path or a session id, pass it through; otherwise export the current session.
3. Run the command in the terminal and wait for it to finish.
4. Report the `Output:` path and the one-line summary (turns, tool calls, reasoning notes, resources).

## Notes
- Do not fabricate content; the script only reads local journals.
- Colored badges render in the VS Code Markdown preview; GitHub shows the text without color.
- A folder-copy install may expose `tools/copilot-chat-exporter/src/cli.ts`; an installed package uses its `copilot-chat-export` bin.
