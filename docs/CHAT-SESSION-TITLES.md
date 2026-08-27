# VS Code Copilot Chat Session Titles

This guide explains every title-like value encountered while maintaining this exporter. Titles
are the main human-readable way to identify a session, but VS Code stores several values with
different owners and lifetimes. Treating them as one field loses information and can show an old
name after a user renames a chat.

The findings below were checked against Microsoft VS Code source and local VS Code storage on
2026-08-26. These are internal implementation details, not a public storage contract.

## Short Answer

For a local chat, this exporter keeps three distinct values:

| Exporter field | Meaning | Source |
|---|---|---|
| `title` | Effective current display title | Indexed GUI title, then journal `customTitle`, then default title |
| `customTitle` | Explicit title replayed from the journal | `chatSessions/<sessionId>.jsonl` |
| `defaultTitle` | First prompt's first line, at most 200 characters | Computed to match `ChatModel.getDefaultTitle()` |

The current precedence is:

```text
state.vscdb index title
  -> journal customTitle
  -> first prompt, first line, first 200 characters
  -> untitled placeholder
```

The index is authoritative only for the current local GUI title. The journal remains
authoritative for prompts, responses, tools, edits, and per-turn metadata.

## Storage Map

On Windows, a workspace-local session normally uses:

```text
%APPDATA%\Code\User\workspaceStorage\<workspace-hash>\
  state.vscdb
  chatSessions\<sessionId>.jsonl
```

Other VS Code channels use sibling roots such as `Code - Insiders`. See `workspaceStorageRoots()`
in `src/host.ts` for the complete platform and channel list.

### Session ID

`sessionId` is a UUID identity, not a title. It correlates the journal, index entry, resources,
debug logs, transcripts, and session memory.

```text
Journal filename: chatSessions/<sessionId>.jsonl
Journal snapshot: v.sessionId
SQLite index:     entries[sessionId].sessionId
```

Changing a title does not change the session ID.

### Current GUI index title

```text
File:       workspaceStorage/<workspace-hash>/state.vscdb
Table:      ItemTable
Row key:    chat.ChatSessionStore.index
Value:      JSON text
JSON path:  entries[sessionId].title
```

Example index value:

```json
{
  "version": 1,
  "entries": {
    "1e6f4d3f-34bd-4f42-a5bd-d6a48ed6447d": {
      "sessionId": "1e6f4d3f-34bd-4f42-a5bd-d6a48ed6447d",
      "title": "Building-chat-exporter"
    }
  }
}
```

VS Code's `ChatSessionStore.setSessionTitle(sessionId, title)` updates this index entry. The
method does not update the live model or journal in the same operation. This is why a manual GUI
rename can be newer than the journal's `customTitle`.

The exporter opens `state.vscdb` read-only. A missing, locked, corrupt, unreadable, or older
incompatible database is optional metadata failure and falls back to the journal.

### Journal customTitle

The journal is a mutation log. The initial value can appear in the `kind: 0` snapshot:

```json
{"kind":0,"v":{"sessionId":"...","customTitle":"Initial title"}}
```

Later root-level replacements can update it:

```json
{"kind":1,"k":["customTitle"],"v":"Later title"}
```

The latest root-level value wins. A nested field such as
`["requests", 0, "response", "customTitle"]` is unrelated and must not rename the session.

VS Code version 3 serialization names this field `customTitle`. The operation-log schema writes
it from a live model only when `hasCustomTitle` is true.

### Live ChatModel title

The in-memory `ChatModel` has:

```ts
get title(): string {
  return this._customTitle || ChatModel.getDefaultTitle(this._requests);
}
```

`ChatModel.title` is computed. It is not another journal field. `setCustomTitle(title)` changes
the private `_customTitle` value and emits a `setCustomTitle` model event.

### Default title

`ChatModel.getDefaultTitle()` uses:

```text
first request -> message text -> first line -> substring(0, 200)
```

It does not add an ellipsis. The exporter computes the same value as `defaultTitle`. Because the
completion summary always prints the first prompt, it suppresses `Default Title` when this value
is simply the expected first-prompt-derived text.

### Legacy computedTitle

Serialized schema version 2 used `computedTitle`. Current VS Code normalization converts it to
version 3 as `customTitle: raw.computedTitle`. New code should not write `computedTitle`; it is a
backward-compatibility input only.

## Similar Names From Other Systems

| Name | Owner | Is it the local chat title? | Details |
|---|---|---:|---|
| `IChatSessionItem.label` | Agent Sessions UI | No | Presentation label. Local adapter copies `chatDetail.title` into it. |
| `agentSessions.model.cache[].label` | Agent Sessions cache | No | Workspace cache refreshed from providers. It is not the authoritative local title store. |
| `IChatSession.title` | Contributed session provider | No for local journals | Optional provider-owned title for external or Agent Host sessions. |
| Provider `summary` | Provider-specific session lists | No for local journals | Some provider adapters map a summary into a UI title or label. |
| Tool `generatedTitle` | Response tool invocation | No | Describes one tool call. The exporter maps it to `ToolNode.title`. |
| `(untitled)` | Exporter or UI display | No | Placeholder shown when no real title is available. It is not stored. |

### userTitle and internalTitle

No current local chat-session schema field named `userTitle` or `internalTitle` was found in the
VS Code chat source reviewed for this work. `user title` is a useful informal phrase for a manual
rename, whose verified local persisted representation is the index `title`. Do not add parser
branches for either name without concrete storage or source evidence.

## Exporter Behavior

The title pipeline is split by responsibility:

| Code | Responsibility |
|---|---|
| `src/session/locate.ts` | Reads indexed titles and scans journal title mutations for `--list` fallback |
| `src/session/journal.ts` | Replays the journal, preserves `customTitle`, and computes `defaultTitle` |
| `src/index.ts` | Applies the indexed GUI title to effective `title` without overwriting `customTitle` |
| `src/markdown.ts` | Uses effective `title` for the document heading and metadata |
| `src/host.ts` | Uses effective `title` for generated filenames |
| `src/export-summary.ts` | Prints title provenance, prompt previews, dates, counts, and output size |

When changing title handling:

1. Change `readIndexedTitles()` only if VS Code changes the index key or JSON shape.
2. Change `readSessionTitle()` or journal replay only if the mutation shape changes.
3. Change `loadSession()` only if precedence changes.
4. Keep SQLite access read-only and retain journal fallback.
5. Do not use tool `generatedTitle` or Agent Sessions cache `label` as a local session title.
6. Add a test where the index and journal deliberately disagree.

## Research Sources

Current Microsoft VS Code source reviewed on 2026-08-26:

- [`chatModel.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/common/model/chatModel.ts)
  defines `ChatModel.title`, `customTitle`, `getDefaultTitle()`, `setCustomTitle()`, serialized
  versions 1 through 3, and `computedTitle` migration.
- [`chatSessionStore.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/common/model/chatSessionStore.ts)
  defines `chat.ChatSessionStore.index`, `IChatSessionEntryMetadata.title`, index persistence, and
  `setSessionTitle()`.
- [`chatSessionOperationLog.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/common/model/chatSessionOperationLog.ts)
  defines the mutation-log storage schema and its `customTitle` adapter.
- [`chatSessionsService.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/common/chatSessionsService.ts)
  defines provider-owned `IChatSession.title`, `renameSession()`, and `IChatSessionItem.label`.
- [`localAgentSessionsController.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/browser/agentSessions/localAgentSessionsController.ts)
  shows the local Agent Sessions adapter assigning `chatDetail.title` to `label`.
- [`agentSessionsModel.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/browser/agentSessions/agentSessionsModel.ts)
  defines `AgentSessionsCache`, the `agentSessions.model.cache` key, and serialized `label`.

Local evidence also came from comparing journal and SQLite values for sessions where the Chat GUI
showed a newer manual rename. Local values establish the observed divergence; the source links
above establish which code owns each field.