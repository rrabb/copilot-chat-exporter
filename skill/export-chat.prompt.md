---
name: export-chat
description: Export the current Copilot chat session to a rich Markdown archive (prompts, reasoning, tool calls, code blocks, tokens, timing).
argument-hint: [output path, e.g. docs/chat-exports/my-session.md]
agent: agent
tools: ['runCommands']
---

# Export this chat session

Export the **current** chat conversation to a human-readable Markdown archive.

Run this command in the integrated terminal from the workspace root:

```
npm run ai:export:chat -- --current
```

- If the project has no `ai:export:chat` script, use `npx --no-install copilot-chat-export --current` (works only when the package is installed; `--no-install` stops npm from downloading an unknown package).
- `--current` explicitly requests the Local session evidenced by `VSCODE_TARGET_SESSION_LOG`; unavailable or conflicting identity is an error, not a newest-session fallback. Running without arguments only lists.
- If the user provided an argument, treat it as the output path and pass it through, for example: `npm run ai:export:chat -- --current ${input:outputPath}`.
- If multiple installations are discovered, use interactive numbered root selection or ask for `--user-data-root <path>`. Current Agent Host/SDK identity export remains pending; never guess a substitute source.
- To export a different past session, first list sessions with `npm run ai:export:chat -- --list`, then run `npm run ai:export:chat -- <sessionId> [outputPath]`.
- Compact listings display a shortest unique hexadecimal UUID prefix (at least 8 characters), which may be used as `<sessionId>` when exactly one Local journal matches. Use `--list --full-ids` to print full IDs; duplicate IDs in multiple workspaces require an exact `.jsonl` path.
- The `TYPE` column distinguishes local, agent, sub-agent, and Copilot CLI entries. `verified` means a backing identity was checked, `unresolved` means no chat backing was verified, and `ambiguous` / `🟠 ❓` means the backing/scope could not be safely resolved.
- Use `--last25` for a compact recent list or `--show-ignored` to restore `/fix`, confirmed-empty, ambiguous, and `New Chat` rows with unknown creation date and prompt count omitted by default.
- Listing generates an offline HTML report by default; pass `--no-html` to suppress it, `--html-output <path>` to select a destination, and `--overwrite` only with explicit authorization to replace an existing report.
- If the output already exists, get explicit authorization before retrying with `--overwrite`; do not silently replace an earlier archive.

After the command completes, report the written file path (printed as `Output: ...`) and a one-line summary of turns, tool calls, reasoning notes, and resources. Do not fabricate content; the script reads the native VS Code chat journal.
