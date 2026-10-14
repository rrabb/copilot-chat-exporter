# Where VS Code Copilot chat sessions live

A newcomer guide to how this tool finds chat sessions, why one conversation can show up in several places, and what the report statuses mean. Details of the file formats are in [CHAT-SESSION-SCHEMA.md](CHAT-SESSION-SCHEMA.md) and title sources are in [CHAT-SESSION-TITLES.md](CHAT-SESSION-TITLES.md). Paths below use placeholders: `<code-root>` is a VS Code user-data root such as `%APPDATA%\Code` or `%APPDATA%\Code - Insiders`.

## The short version

1. VS Code keeps workspace chat references in a workspace storage directory. Do not infer corruption from the directory name or its length.
2. A small `workspace.json` in that folder says which folder or `.code-workspace` file the hash stands for. That is the "project".
3. Chats opened with no folder are stored globally, not per workspace.
4. Agent Host and Copilot CLI chats keep conversation records in an SDK session folder. Workspace indexes and provider databases hold references and identity metadata.
5. One conversation can have several workspace references. That alone does not prove copied content, which reference came first, or safe deletion.

## Step 1 - which VS Code installation

Every VS Code flavor has its own user-data root. This tool discovers roots on the machine and asks which one to use when there is more than one. `--user-data-root <path>` selects one without prompting. Chats from different roots are never mixed.

```text
<code-root>\
  User\
    workspaceStorage\<workspace-hash>\   one folder per workspace or folder
    globalStorage\                       data shared by all windows
```

## Step 2 - chat types

| Type | Where the conversation content lives | Notes |
| --- | --- | --- |
| Local (Copilot Chat in the editor) | `workspaceStorage\<hash>\chatSessions\<id>.jsonl` | Event journal. The only type the tool can export to Markdown today. |
| Agent Host | Index entry in the workspace, SDK session folder for content | The index key looks like `agent-host-copilotcli:/<id>#<chat>`. |
| Copilot CLI | Same chain as Agent Host | Started from the terminal or the agent sessions view. |
| Sub-agent | Inside shared SDK events | Linked by verified agent/tool-call IDs. Titles can come from its own index row, SDK delegation or parent fallback. Some workspace references are derived through the parent with no own index row. |
| External | Provided by another extension | Listed but not backed by a readable journal. |

## Step 3 - how a workspace becomes a "project"

```text
workspaceStorage\<workspace-hash>\
  workspace.json          {"folder": "file:///c%3A/p/my-project"}  or  {"workspace": "file:///.../x.code-workspace"}
  state.vscdb             SQLite; key chat.ChatSessionStore.index lists the chats of this workspace
  chatSessions\           one .jsonl journal per Local chat
  chatEditingSessions\    optional edit-history state per chat
  GitHub.copilot-chat\    optional transcripts, debug logs, chat resources
```

- The report's project name is the last segment of the `folder` or `workspace` URI. Hover shows the full URI.
- A `.code-workspace` file can hold several folders. The tool reports the workspace file and does not inspect the folders inside it.
- "w/s refs" counts distinct `workspaceStorage\<hash>` folders that mention a conversation. It can be larger than the number of projects.

## Step 4 - chats outside any workspace

| Location | Meaning | Tool coverage |
| --- | --- | --- |
| `globalStorage\emptyWindowChatSessions\<id>.jsonl` | Journals from windows with no folder open | Inventoried. The chat index for these windows is the same `chat.ChatSessionStore.index` key, but in `globalStorage\state.vscdb` (application scope), so Agent Host and CLI references saved from an empty window appear as references too. Shown as "(empty window)" with no invented project |
| `workspaceStorage\no-workspace\chatSessions` | Older layout for the same case | Covered by the normal `workspaceStorage` scan, as an ordinary store with no `workspace.json` |
| `globalStorage\transferredChatSessions` | A temporary copy made when a chat is moved to another window | Deliberately not inventoried (see below) |

Evidence: VS Code's [`chatSessionStore.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/common/model/chatSessionStore.ts) picks `emptyWindowChatSessions` for a window with no folder and `no-workspace\chatSessions` as the previous empty-window location, and stores the index in the application scope for empty windows. The same file records a transfer in a separate profile-scoped index (`ChatSessionStore.transferIndex`) keyed by the destination folder, with a 5-minute expiry, and deletes the file after use. It is a short-lived duplicate of a chat that already exists elsewhere, so listing it would show the same conversation twice and then disappear. This is derived from reading the source, not from a live transfer.

On the development machine this added three rows to the Stable root (one real Agent Host chat, one `New Chat` placeholder that is hidden by default, and one empty journal that is hidden as confirmed empty) and two to the Insiders root (one Copilot CLI chat and one empty journal). Counts change as VS Code runs.

The store is not a workspace, so the report labels it "(empty window)" rather than guessing a project. The project filter files these chats under "No recorded project" unless the chat itself records a working directory.

## Step 5 - the Agent Host and Copilot CLI chain

```text
workspace index / derived parent reference
  -> recorded identity route (alternatives, not mandatory consecutive hops):
       globalStorage\agent-host.db       session_chats.provider_data
       agentSessionData\<chat-key>\session.db   session_metadata
       provider-ID fallback             only with a matching validated SDK header
  -> %USERPROFILE%\.copilot\session-state\<sdk-session-id>\events.jsonl
       main chat / peer chat / verified sub-agent scope
```

`COPILOT_HOME` overrides the `.copilot` folder. Next to `events.jsonl` there may be `workspace.yaml` and `vscode.metadata.json`. A report row is "verified" when its recorded identity route and SDK content/scope validation succeed. A route directly established by `agent-host.db` does not imply a separate `session.db` hop. This describes observed private storage, not a stable public API.

## Why one conversation shows up several times

- **Workspace transitions.** VS Code copies the session file to the new workspace's storage and leaves the original behind. Same UUID, several `<workspace-hash>` folders.
- **Reopened workspaces.** A folder opened as a plain folder and later as part of a `.code-workspace` gets two hashes.
- **Forks and copies.** A fork has a new ID and a similar title. The tool labels these "likely fork" or "likely copy" as best-effort hints, never as facts.
- **Several user-data roots.** Stable and Insiders keep separate copies.

The report groups only occurrences with established grouping identity. Forks, possible copies and separate user-data roots are not merged because of similar titles or content. Why/source lists each reference under its own W label.

## Reading the detailed Why/source section

| Section | What to use it for |
| --- | --- |
| Health checks / audit notes | See unavailable or changed evidence, scope warnings and derived child references with no own index entry. No warnings is not proof that every possible store was searched. |
| Where it is referenced | See project/workspace names and separate labels: persisted index entry, derived through parent, cwd matches, additional workspace reference. A cwd match is a path observation, not proof of origin. |
| Chain at a glance / detailed lineage | Follow the recorded evidence route. Detailed lineage appears when references, a derived parent or an unresolved route add information. |
| Storage summary | Compare scoped conversation bytes with whole-file and related-folder sizes without treating them as additive. |
| Unified evidence table | Inspect artifact locations, sizes, timestamps, state, report sharing counts, purpose and qualified removal impact. |
| Technical identity / unique values | Compare each field/value/reference tuple, including different full child IDs or different title/date sources. Matching values are combined only for the same field. |

Paths use `‹Code›`, `‹WS›`, `‹Global›`, `‹Agent›` and `‹.copilot›` prefixes where applicable; hover gives the expanded base, the link opens the full path and the copy control copies the displayed value's full path. Secrets still follow the report's redaction policy. All collection is read-only and only runs for detailed reports.

## What makes a large file large?

The report measures, rather than guesses:

- **SQLite:** physical file length, allocated/free pages from a read transaction, total logical stored-value bytes and largest keys for workspace `ItemTable` databases. Values use blob/UTF-8 byte lengths, not JavaScript character counts. A large `memento/interactive-session` value can include prompt input history and attachments; it is not the workspace chat index. The report does not expose its contents or claim all SQLite bytes are chat content.
- **JSONL:** whole-file byte totals by recorded `type` or journal mutation `kind`, including separators. This is not a prompt-versus-response breakdown, and a child's scoped bytes are only a subset of the shared SDK file.
- **Directories:** sum of regular file lengths grouped by immediate child. This is not allocated disk space. Links are not followed.

Logical value bytes are already within database pages; do not add them to physical bytes. Directories include their files, so directory and descendant-file rows also overlap. Free-page bytes describe SQLite allocation, not a safe chat deletion estimate. WAL-visible page counts can differ from the main database file while VS Code is running. Changes detected during file analysis suppress composition; live directory enumeration is not an atomic filesystem snapshot. Sharing counts describe the inventoried report only, including hidden occurrences, not every external consumer.

## Status words

| Status | Meaning |
| --- | --- |
| verified | The backing store was found and checked. Says nothing about export support. |
| unresolved | The index mentions the chat but the backing file or SDK chain was not found. |
| unsupported | Found, but the tool has no reader for this type. |
| ambiguous | More than one candidate matched, so the tool refuses to guess. Hidden by default. |
| ignored | Hidden by rule: ambiguous rows, `/fix` helper chats, `new-chat-unknown`, `confirmed-empty`. `--show-ignored` reveals them. |

## Orphans and cleanup

An orphan is an artifact with no partner: an index entry with no journal, a journal with no index entry, an SDK folder no workspace points to. The tool only reads. It never deletes or moves anything. If you want to clean up:

- Several references do not establish redundant copies. Preserve all references until identity, content differences and recovery behavior are understood.
- An old workspace reference may still be used by VS Code. A child's derived reference may have no own index row and no independent backing file.
- Do not delete `state.vscdb` or `agent-host.db` by hand. Other extensions use them.
- Close VS Code before changing anything and back up the folder first.

## Evidence levels used in the report

| Mark | Meaning |
| --- | --- |
| `?` | A minor detail is missing. |
| `??` | A headline value is missing after the source was read. |
| `???` | The source was not read or could not be verified. |
| `[best-effort]` | A heuristic, for example fork or copy detection. |
