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
npx copilot-chat-export
```

- The exporter auto-detects the current session from the `VSCODE_TARGET_SESSION_LOG` environment variable, so it targets the chat this command is run from.
- If the user provided an argument, treat it as the output path and pass it through, for example: `npx copilot-chat-export ${input:outputPath}`.
- To export a different past session, first list sessions with `npx copilot-chat-export --list`, then run `npx copilot-chat-export <sessionId> [outputPath]`.

After the command completes, report the written file path (printed as `Output: ...`) and a one-line summary of turns, tool calls, reasoning notes, and resources. Do not fabricate content; the script reads the native VS Code chat journal.
