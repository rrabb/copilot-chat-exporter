# VS Code Copilot Chat Session Data

A practical guide for maintaining this exporter.

This document describes the data that this project currently reads from VS Code Copilot Chat
sessions. It is written for someone joining the project who needs to understand the tree, find the
right code, and safely respond when VS Code changes its session format.

> **Important:** `chatSessions/<sessionId>.jsonl` is an internal VS Code storage format. It is not
a public, versioned API. The diagrams below combine official VS Code source with shapes observed
in this project's local sessions. Every section labels which kind of evidence it uses.

## Start Here

There are two different things called a chat export:

| Thing | What it is | Stable? |
|---|---|---|
| VS Code **Chat: Export Chat...** | A user-facing JSON export containing prompts and responses | Documented as a feature, but its exact file shape is owned by VS Code |
| `chatSessions/<sessionId>.jsonl` | VS Code's local mutation log for the live chat model | Internal storage; this is what this tool reads |

This exporter reads the second one because it preserves the response stream, tool lifecycle, file
edits, and data that the user-facing export does not expose in the same way.

The safest mental model is:

```mermaid
flowchart TD
    A[VS Code Chat model] --> B[Serializable session object]
    B --> C[Mutation log]
    C --> D[chatSessions/session-id.jsonl]
    D --> E[This exporter]
    E --> F[Replay kind 0 snapshot]
    E --> G[Apply kind 1 and kind 2 changes]
    F --> H[Final requests array]
    G --> H
    H --> I[Classify response items]
    I --> J[Project-owned parsed model]
    J --> K[Markdown archive]
    J --> L[Verification and snapshots]
```

**Local evidence:** `src/session/journal.ts` performs the replay. **Official source:** VS Code's
`ChatSessionOperationLog` explains that the log exists to append mutations instead of repeatedly
serializing a long conversation.

## Evidence Levels

Use these words precisely when changing the parser:

- **Documented:** stated in official VS Code documentation or represented by a public or internal
  TypeScript declaration in the VS Code source.
- **Inferred from source:** visible in VS Code implementation, but not promised as a public file
  contract.
- **Observed here:** found in the local session corpus or the committed fixture.
- **Unknown:** not seen or not established. Do not guess it into a handler.

The official source is excellent evidence of what VS Code currently serializes. It is not a promise
that the private journal will remain unchanged.

## On-Disk Layout

**Observed here, with official source support for the names:**

```text
VS Code user data
└── User/workspaceStorage/<workspace-hash>/
    ├── workspace.json
    │   └── folder / workspace identity used by this exporter
    ├── chatSessions/
    │   └── <sessionId>.jsonl                 definitive journal for this tool
    └── GitHub.copilot-chat/
        ├── chat-session-resources/<sessionId>/
        │   └── large persisted tool-result bodies, when present
        ├── transcripts/<sessionId>.jsonl
        │   └── debug/event transcript, NOT the chat journal
        ├── debug-logs/<sessionId>/models.json
        │   └── model id to friendly display name
        └── memory-tool/memories/
            ├── <base64(sessionId)>/           session memory
            ├── repo/                          repository memory
            └── *.md                           user memory
```

The storage root varies by platform and VS Code channel. The owning code is
[src/host.ts](../src/host.ts), especially `workspaceStorageRoots()`, `resolveWorkspaceRoot()`, and
`createHostContext()`.

### Do not confuse these files

| File | Used by this exporter? | Why |
|---|---:|---|
| `chatSessions/<id>.jsonl` | Yes | The final persisted chat model, written as mutation records |
| `transcripts/<id>.jsonl` | Only for optional version labels | A different event/debug format; it does not contain the journal's request tree |
| `debug-logs/<id>/models.json` | Optional enrichment | Friendly model names |
| `chat-session-resources/<id>/...` | Optional enrichment | Large tool results that are not inline in the journal |
| `memory-tool/memories/...` | Optional enrichment | Memory and plan files shown in the archive |

The rejection of a transcript path is intentional. A transcript can be valid JSONL and still be
the wrong schema.

## The Journal Envelope

A journal is **JSON Lines**: one JSON object per physical line. In the sessions observed here, the
outer record has one of these shapes:

```json
{"kind":0,"v":{...full session state...}}
{"kind":1,"k":["requests",0,"response"],"v":[...items to set...]}
{"kind":2,"k":["requests"],"v":[...request objects to append...]}
```

The outer `kind` is the **mutation operation**, not the kind of a response item.

```mermaid
flowchart LR
    R0["kind 0\nfull state"] --> S[replayed state]
    R1["kind 1\nset at path k"] --> S
    R2["kind 2\nappend at path k"] --> S
    S --> Q["state.requests[]"]
```

### Outer record fields

| Field | Meaning | Evidence |
|---|---|---|
| `kind: 0` | Initial full state snapshot | Observed here; matches the replay code |
| `kind: 1` | Set or replace a value at path `k` | Observed here; matches the replay code |
| `kind: 2` | Append a value at path `k` | Observed here; matches the replay code |
| `k` | Array of property names and array indexes | Observed here |
| `v` | Value for the operation | Observed here |

The first record normally carries the session header and an initial `requests` array. Later records
add requests, response items, metadata, and streamed updates.

## Replay Rules

The exporter does not parse each line as an independent conversation. It reconstructs state first.

```mermaid
flowchart TD
    A[Read nonblank lines] --> B{JSON parses?}
    B -- no --> C[Record warning and skip]
    B -- yes --> D{outer kind}
    D -- 0 --> E[Replace state with v]
    D -- 1 --> F[Append v at k]
    D -- 2 --> G[Set v at k]
    E --> H[Next line]
    F --> H
    G --> H
    C --> H
    H --> I{More lines?}
    I -- yes --> B
    I -- no --> J[Use final state]
    J --> K[Build turns from requests]
```

### Paths

A path is a mixed array of property names and numeric indexes:

```json
["requests", 3, "response"]
```

means:

```text
state
└── requests[3]
    └── response
```

A path can target a nested object or array. The replay helpers create an array when the next path
component is numeric and an object otherwise.

### Numeric-keyed splice objects

**Observed in the committed fixture and handled defensively:** an append value may be an object
whose keys are numeric strings instead of a JSON array.

```json
{
  "kind": 2,
  "k": ["requests", 4, "response"],
  "v": {
    "0": {"value": "first"},
    "1": {"value": "second"}
  }
}
```

`requestValues()` turns that into two values in numeric order. This shape was not found in the
45-session survey, so the fixture deliberately constructs it. Keep this handler unless local
source proves the format no longer needs it.

### Replay pseudocode

```text
state = null
for each nonblank JSON line:
    if record.kind == 0:
        state = record.v
    else if record.kind == 1:
      setAtPath(state, record.k, record.v)
    else if record.kind == 2:
      appendAtPath(state, record.k, record.v)

requests = state.requests or []
```

The real implementation also remaps some compaction updates and records parse warnings. Read
[session/journal.ts](../src/session/journal.ts) before changing these rules.

## The Session Tree

After replay, the important tree is:

```mermaid
flowchart TD
    S[Session header + requests[]]
    S --> H[Header]
    S --> R[Request / turn]
    R --> M[message]
    R --> P[response[]]
    R --> X[per-request scalar fields]
    M --> MT[text or parts]
    P --> N[response item]
    N --> K[kind discriminator]
    N --> T[toolInvocationSerialized]
    N --> TH[thinking]
    N --> TXT[implicit assistant text]
    N --> E[textEditGroup / workspaceEdit]
    N --> I[inlineReference]
    N --> D[other response kind]
    T --> SD[toolSpecificData]
    SD --> TK[tool payload kind]
```

A **turn** in this project's parsed model is one request plus its response. It is not necessarily
one physical journal record. A turn can be assembled from many `kind: 1` and `kind: 2` records.

## Session Header

### Current persisted header

**Official source, current VS Code model:** `ISerializableChatData3` has these fields:

```ts
interface ISerializableChatData3 {
  version: 3;
  sessionId: string;
  creationDate: number;
  customTitle: string | undefined;
  initialLocation: ChatAgentLocation | undefined;
  responderUsername: string;
  requests: ISerializableChatRequestData[];
  hasPendingEdits?: boolean;
  inputState?: ISerializableChatModelInputState;
  repoData?: IExportableRepoData;
  pendingRequests?: ISerializablePendingRequestData[];
  workingDirectory?: string;
}
```

**Observed in this project:** the first record contains the identity fields and `requests`. The
parser reads these session-level fields:

```ts
customTitle
creationDate
responderUsername
initialLocation
hasPendingEdits
inputState
repoData
pendingRequests
workingDirectory
requests
```

They are preserved in `ParsedSession` and in the importable JSON representation under its
`session` object. They are not currently rendered into the Markdown archive. That is a display
boundary, not a loss during parsing.

### Header ownership

| Question | Owner |
|---|---|
| Where is the session file? | `session/locate.ts` + `host.ts` |
| How is the header found? | `session/journal.ts` |
| Which header fields become output metadata? | `session/journal.ts` and `markdown.ts` |
| Which fields are parsed but not currently rendered? | `types.ts` and the session metadata block |

## Requests: One Turn's Input and Output

The official `ISerializableChatRequestData` extends response metadata and currently includes:

```ts
interface ISerializableChatRequestData {
  requestId: string;
  message: string | IParsedChatRequest;
  variableData: { variables: unknown[] };
  response: SerializedChatResponsePart[] | undefined;

  timestamp?: number;
  responseTimestamp?: number;
  responseId?: string;
  modelId?: string;
  modeInfo?: object;
  agent?: object;
  result?: object;
  modelState?: object;
  isCanceled?: boolean;             // deprecated compatibility field
  followups?: unknown[];
  usedContext?: object;
  contentReferences?: unknown[];
  codeCitations?: unknown[];
  timeSpentWaiting?: number;
  promptTokens?: number;
  completionTokens?: number;
  outputBuffer?: number;
  promptTokenDetails?: Array<{
    category: string;
    label: string;
    percentageOfPrompt: number;
  }> | { cacheReadTokens?: number; cacheWriteTokens?: number };
  copilotCredits?: number;
  modelTotals?: unknown[];
  sessionCopilotCredits?: number;
  elapsedMs?: number;

  editedFileEvents?: unknown[];
  hiddenFromTranscript?: boolean;
  isSystemInitiated?: boolean;
  systemInitiatedLabel?: string;
  terminalExecutionId?: string;
  origin?: object;
}
```

The exact declarations evolve in VS Code. The important maintenance rule is that request metadata
is attached to the request object, while response content is in `request.response[]`.

```mermaid
flowchart LR
    R[request] --> ID[requestId]
    R --> MSG[message]
    R --> SC[scalar metadata]
    R --> RESP[response[]]
    MSG --> PROMPT[user prompt]
    SC --> MODEL[model / mode / agent]
    SC --> COST[tokens / credits / elapsed]
    SC --> STATE[modelState / cancellation]
    RESP --> STREAM[ordered response items]
```

### Message shape

Two forms matter:

```json
{"message":"old-format prompt"}
```

or:

```json
{
  "message": {
    "text": "prompt text",
    "parts": []
  }
}
```

**Official source:** current serialized requests allow either a string or parsed request object for
backward compatibility. **Observed here:** most current local requests expose `message.text`.
`messageText()` supports the object form and message parts.

### Response order is meaningful

The response array is a stream-shaped list. Do not group it by category.

```text
response[]
├── { value: "I will inspect the file." }
├── { kind: "thinking", value: "First I will..." }
├── { kind: "toolInvocationSerialized", toolCallId: "call_1", ... }
├── { value: "The command returned..." }
├── { kind: "textEditGroup", ... }
└── { value: "The change is complete." }
```

The project converts this to `Turn.body` while preserving that order. The renderer walks
`Turn.body` in order, so prose before a tool stays before it in the Markdown archive.

## Response Items and the `kind` Field

The response item's `kind` is the discriminator for structured items. Assistant prose is the
important exception: **observed here, it has no `kind`; it is recognized by shape as an object with
a string `value`.**

### Response kinds currently observed here

The following census came from the project's real 73-turn session and the extended committed
fixture:

| Response kind | Current handling | Parsed result |
|---|---|---|
| no kind + string `value` | classify as assistant text | `TextNode` |
| `thinking` | read `value`, discard empty partials, collapse prefixes | `ThinkNode` and `Turn.reasoning` |
| `markdownContent` | Defined by current VS Code source, but not seen in this project's persisted journal; persisted Markdown is currently observed as kind-less `{value: string}` | Handled for forward compatibility; current corpus does not exercise the named kind |
| `toolInvocationSerialized` | read tool identity and payload | `ToolNode` |
| `inlineReference` | reduce URI/reference to a readable label | `RefNode` |
| `textEditGroup` | read edited URI | `EditNode` |
| `workspaceEdit` | one item can produce several file operations | multiple `EditNode`s |
| `questionCarousel` | currently deliberately ignored | census only |
| `confirmation` | currently deliberately ignored | census only |
| `progressMessage` | currently deliberately ignored | census only |
| `progressTaskSerialized` | currently deliberately ignored | census only |
| `codeblockUri` | currently deliberately ignored | census only |
| `undoStop` | currently deliberately ignored | census only |

The current real-session counts are recorded by `--verify`; do not copy the example counts above
into code. Run the census against a new session after a VS Code update. The `markdownContent` row
is intentionally called out because official source names it while the current journal writer
serializes ordinary Markdown to a kind-less value object. That is an observed persistence detail,
not a promise that the wrapper can never appear.

### Other kinds in official VS Code source

The current VS Code source declares more kinds than this local corpus has exercised, including
`systemNotification`, `warning`, `info`, `treeData`, `pullRequest`, `extensions`, `hook`,
`planReview`, `elicitationSerialized`, `autoModeResolution`, and others. Some are excluded from
history or only occur in specific agents and tools.

That difference is expected. A declaration is not the same as an observed journal example, and an
observed example is not the same as a promise that the kind will remain unchanged.

### The three lists in this project

`session/classify.ts` keeps these lists beside `classifyNode()`:

```mermaid
flowchart TD
    ITEM[response item] --> C{classifyNode}
    C -->|recognized + useful| HANDLED[handled kind\nbecomes project node]
    C -->|recognized but no archive content| IGNORED[ignored by design\ncensus still counts it]
    C -->|unknown or unsupported| UNKNOWN[unhandled\nstrict mode fails]
    HANDLED --> PAYLOAD{toolSpecificData.kind}
    PAYLOAD -->|known fields| LIFTED[lifted into ToolNode]
    PAYLOAD -->|reviewed generic| GENERIC[generic JSON dump]
    PAYLOAD -->|new payload kind| PAYUNKNOWN[unrecognized payload\nstrict mode fails]
```

| List | Meaning | What to do when a new name appears |
|---|---|---|
| handled | The project has a branch and content reaches the archive | Add or update tests and output expectations |
| ignored | The project intentionally drops it because it is UI/control state | Confirm it carries no content needed by the archive |
| known but unseen | A documented or researched possibility, not a suppression | Leave it unsuppressed; it must alert if it appears |
| unhandled | Content may be silently lost | Inspect a real node before changing code |
| generic payload | Content is retained as JSON without specialized fields | Decide whether a specialized renderer is worth it |

An unknown response kind must never be added to the ignore list just to make a check green.

## Tool Invocation Nodes

### Outer tool item

The official current declaration for a serialized invocation contains the following important
fields:

```ts
interface IChatToolInvocationSerialized {
  kind: 'toolInvocationSerialized';
  toolCallId: string;
  toolId: string;
  invocationMessage: string | MarkdownString;
  pastTenseMessage?: string | MarkdownString;
  originMessage?: string | MarkdownString;
  toolSpecificData?: object;
  resultDetails?: object;
  isConfirmed?: boolean | object;
  isComplete: boolean;
  source?: string;
  subAgentInvocationId?: string;
  generatedTitle?: string;
}
```

**Observed here:** the exporter sees repeated serialized items for the same `toolCallId` as a
call moves from incomplete to complete. It merges only while the stored call is incomplete.
After completion, a later item with the same id is treated as a new invocation. This matters
because VS Code can reuse an id for a repeated command.

```mermaid
sequenceDiagram
    participant J as journal response[]
    participant P as parser
    participant T as toolNodesById
    J->>P: toolCallId=c1, isComplete=false
    P->>T: create c1
    J->>P: toolCallId=c1, isComplete=true, output
    P->>T: merge into incomplete c1
    J->>P: toolCallId=c1, isComplete=true, new invocation
    P->>T: create a second c1 node
```

A tool node in this project's model is:

```ts
interface ToolNode {
  type: 'tool';
  toolId: string;
  toolCallId: string;
  invocation: string;
  pastTense: string;
  title: string;
  isComplete: boolean;
  isConfirmed?: boolean | Record<string, unknown>;
  toolSpecificData: ToolPayload | null;
  command: string;
  promptText: string;
  todos: TodoItem[] | null;
  output: string;
  resultText: string;
  exitCode: number | null;
  duration: number | null;
  fileUri: string;
}
```

This is a project-owned shape, not VS Code's shape. `classifyNode()` is the conversion boundary.

### `toolSpecificData`

This is a second discriminator nested inside the tool item:

```mermaid
flowchart TD
    T[toolInvocationSerialized] --> D[toolSpecificData]
    D --> TERM["kind: terminal"]
    D --> TODO["kind: todoList"]
    D --> SUB["kind: subagent"]
    D --> INPUT["kind: input"]
    D --> OTHER["future or other kind"]
    TERM --> TC[commandLine + output + state]
    TODO --> TL[todoList[]]
    SUB --> SP[prompt + result + agent identity]
    INPUT --> IR[rawInput]
    OTHER --> JSON[generic JSON rendering]
```

#### Terminal payload

**Official source and observed here:**

```json
{
  "kind": "terminal",
  "commandLine": {
    "original": "node --check file.ts",
    "forDisplay": "node --check file.ts"
  },
  "terminalCommandOutput": {
    "text": "OK\n",
    "truncated": false,
    "lineCount": 1
  },
  "terminalCommandState": {
    "exitCode": 0,
    "duration": 1234
  }
}
```

The official declaration now includes more optional terminal fields: working directory, display
language, confirmation details, sandbox state, terminal session id, output truncation metadata,
and repair information. The project currently lifts the command, output, exit code and duration.
Do not assume `original` is the only command field; VS Code distinguishes the command that ran
from the command shown to the user.

#### Todo payload

```json
{
  "kind": "todoList",
  "todoList": [
    {"id":"one","title":"Inspect parser","status":"completed"},
    {"id":"two","title":"Add test","status":"in-progress"}
  ]
}
```

Statuses observed and declared by VS Code are `not-started`, `in-progress`, and `completed`.

#### Subagent payload

**Observed here and supported by current VS Code source:**

```json
{
  "kind": "subagent",
  "agentName": "Explore",
  "description": "Research the parser",
  "prompt": "Find the tool identity logic",
  "result": "The id is merged while incomplete"
}
```

The parent session does not necessarily contain the subagent's entire turn-by-turn conversation.
Current VS Code's local-to-Agent-Host import code explicitly carries the subagent summary prompt and
result, not an assumed complete child transcript in the parent response item.

#### Input payload

```json
{
  "kind": "input",
  "rawInput": {"query":"chat session storage"}
}
```

Current VS Code source uses this for tool input when a more specialized payload is not available.
This project keeps it as a reviewed generic JSON dump. A new `input` shape should not be treated as
an error merely because it is not a terminal or todo list.

### Result details

A tool can carry result information in `resultDetails`, while terminal output can be nested under
`toolSpecificData.terminalCommandOutput`. A subagent result can be a plain `toolSpecificData.result`.
These are not interchangeable.

```mermaid
flowchart LR
    T[tool node] --> A[toolSpecificData]
    T --> B[resultDetails]
    A --> C[terminal output]
    A --> D[subagent result]
    B --> E[generic input/output result]
    C --> F[ToolNode.output]
    D --> G[ToolNode.resultText]
    E --> G
```

The classifier routes these into project-owned fields so the renderer does not need to understand
VS Code's changing storage shapes.

## File Edits

There are multiple edit-related response shapes.

| Shape | Meaning | Current project result |
|---|---|---|
| `textEditGroup` | An edit group with a URI | One `EditNode` |
| `workspaceEdit` | A list of old/new resource pairs | One `EditNode` per operation |
| `codeblockUri` | A control marker associated with an edit/code block | Ignored by design |
| `externalEdit` | Newer external edit representation in VS Code source | Not observed here; census must alert if it appears |

`workspaceEdit` operations are positional:

```mermaid
flowchart TD
    W[workspaceEdit] --> E1[oldResource + newResource]
    W --> E2[oldResource only]
    W --> E3[newResource only]
    E1 --> R[renamed]
    E2 --> D[deleted]
    E3 --> C[created]
```

The source declaration calls these `oldResource` and `newResource`. This project maps them to
`created`, `deleted`, or `renamed` and later groups the touched files per turn.

## Thinking and Compaction

### Thinking

A `thinking` item has a `value` that can be a string or an array of parts. VS Code source also
records reasoning duration in newer serialized forms.

This project:

1. reads the value with `thinkingText()`;
2. ignores an empty streamed partial;
3. removes shorter prefixes when a later item contains the completed text;
4. keeps the resulting thought at its recorded position in `Turn.body`;
5. also stores the deduplicated list in `Turn.reasoning`.

```mermaid
flowchart LR
    A[thinking partial 1] --> B["value: First I"]
    B --> C[thinking partial 2]
    C --> D["value: First I will inspect"]
    D --> E[collapse shorter prefix]
    E --> F[one thought in body and reasoning]
```

### `/compact`

`/compact` is a real request in observed sessions. Its confirmation can arrive on a neighboring
request or as a standalone response append. The parser has explicit logic to keep
`Compacted conversation.` with the `/compact` turn.

This is why the parser has both:

- index remapping while replaying compaction updates; and
- a post-parse repair pass that moves the canonical confirmation back to the `/compact` turn.

Do not delete this as duplicate-looking code without running the compact fixture tests and the
real-session snapshot.

## Metadata and Costs

The request carries scalar fields copied from the journal. The project uses these for the archive:

```mermaid
flowchart TD
    R[request scalar fields] --> M[modelId / modeInfo / agent]
    R --> T[timestamp / responseTimestamp / elapsedMs]
    R --> C[promptTokens / completionTokens / copilotCredits]
    R --> X[promptTokenDetails / modelTotals / sessionCopilotCredits]
    R --> Q[contentReferences / codeCitations / followups]
    M --> O[turn info table]
    T --> O
    C --> O
    X --> O
    Q --> O
```

`TurnScalars` is project-owned and deliberately has an index signature because VS Code adds fields
faster than this archive needs to render them. When a new field becomes important, declare it in
`src/types.ts`, add it to the scalar collection list in `src/session/journal.ts`, and add a focused
test before adding a renderer row.

One caution from current VS Code source: usage can be updated more than once, and tool-loop turns
can involve more than one model request. Do not assume that summing every intermediate usage record
is the same as the final billed total.

## The Project-Owned Model

The conversion boundary is deliberately small:

```mermaid
classDiagram
    class ParsedSession {
      +customTitle
      +creationDate
      +responderUsername
      +initialLocation
      +turns[]
      +census
      +errors[]
    }
    class Turn {
      +number
      +requestId
      +ts
      +prompt
      +reasoning[]
      +prose[]
      +body[]
      +toolNodes[]
      +todos[]
      +filesTouched[]
      +scalar
    }
    class TextNode {
      +type = text
      +text
    }
    class ThinkNode {
      +type = think
      +text
    }
    class RefNode {
      +type = ref
      +text
    }
    class EditNode {
      +type = edit
      +uri
      +op
    }
    class ToolNode {
      +type = tool
      +toolId
      +toolCallId
      +toolSpecificData
      +output
      +resultText
    }
    ParsedSession "1" --> "many" Turn
    Turn "1" --> "many" TextNode
    Turn "1" --> "many" ThinkNode
    Turn "1" --> "many" RefNode
    Turn "1" --> "many" EditNode
    Turn "1" --> "many" ToolNode
```

The declarations live in [src/types.ts](../src/types.ts). The parser creates them in
[session/journal.ts](../src/session/journal.ts). The renderer consumes them in
[markdown.ts](../src/markdown.ts). This separation is the main defense against schema changes:
only the parser and classifier should know VS Code's private names.

### Node conversion table

| VS Code input | Project node | Conversion owner |
|---|---|---|
| kind-less `{value: string}` | `TextNode` | `classifyNode()` |
| `{kind: 'thinking'}` | `ThinkNode` | `classifyNode()` |
| `{kind: 'inlineReference'}` | `RefNode` | `classifyNode()` |
| `{kind: 'textEditGroup'}` | `EditNode` | `classifyNode()` |
| `{kind: 'workspaceEdit'}` | `EditNode[]` | `classifyNode()` |
| `{kind: 'toolInvocationSerialized'}` | `ToolNode` | `classifyNode()` |
| anything else | `null` plus census entry | `classifyNode()` + `journal.ts` |

`classifyNode()` may return one node, an array of nodes, or `null`. The array case is necessary
for a single `workspaceEdit` containing several file operations.

## What Is Not the Same Thing

These pairs are easy to confuse:

| Do not confuse | Difference |
|---|---|
| outer `kind` and response-item `kind` | Outer `kind` selects snapshot/set/append; inner `kind` identifies response content |
| `toolId` and `toolCallId` | `toolId` names the tool; `toolCallId` identifies an invocation occurrence and may be reused |
| `toolInvocation` and `toolInvocationSerialized` | Live model object versus persisted/reloaded invocation; this exporter sees the serialized form |
| `response[]` and `response.entireResponse` | The journal has the serialized response array; VS Code's live model exposes richer response views |
| `markdownContent` and kind-less `{value}` | VS Code's live response model uses the named kind; the persisted journal observed here stores ordinary Markdown without that wrapper |
| `chatSessions` and `transcripts` | Different stores with different schemas |
| `thinking` count and thought text | Streamed partials can count in the census while producing no final thought node |
| `workspaceEdit` and `textEditGroup` | One describes old/new resources; the other describes an edit group tied to a URI |
| files mentioned in text and files touched by edits | Text can mention a file without a structured edit node |

## How to Investigate a Schema Change

Use a session recorded after the VS Code or Copilot update. An old session cannot reveal a new
schema: its bytes do not change when VS Code updates.

### 1. Find the change

```powershell
node src/cli.ts --verify --strict <new-session-id>
```

Read these lines:

```text
UNHANDLED kinds (content dropped in silence)
UNRECOGNIZED toolSpecificData kinds
```

The first means a response item was dropped. The second means the response survived through the
generic path but its nested payload kind is not on a reviewed list.

### 2. Save a small structural record

```powershell
node src/cli.ts --snapshot update <session-id>
```

This saves a few-KB digest in `test/snapshots/`. It records counts, order, file names, the census,
and hashes of prompt/assistant text. It does not preserve the full conversation contents.

### 3. Inspect the actual node

The name is not enough. Dump one real response item from the journal and redact any sensitive
content before sharing it. The existing procedure is in
[docs/UPGRADING.md](UPGRADING.md), Step 2.

Useful places to inspect, in order:

1. this project's local `classify.ts` and `journal.ts`;
2. local committed fixture and `--verify` census;
3. the matching VS Code source declaration in `chatService.ts` or `chatModel.ts`;
4. the matching VS Code implementation or tests;
5. official issue history if the change came from a migration or regression.

### 4. Add the smallest handler

Put the new branch in `classifyNode()` or add the nested payload to its handling list. Keep the
new branch at the conversion boundary. Do not spread the VS Code field name through the renderer.

### 5. Check the motivating session

```powershell
node src/cli.ts --snapshot check <session-id>
```

You want the census to show the new kind handled and the affected turns to regain the expected
nodes. A snapshot does not prove the output is semantically right, so also add a focused unit test
with a fabricated, minimal example of the shape.

### 6. Re-run the project gate

```powershell
npm run verify -w copilot-chat-exporter
node src/cli.ts --verify --strict <session-id>
```

Read the diff before re-recording the snapshot or golden fixture. A passing comparison means
"unchanged from the saved record", not "correct".

## Useful Commands

```powershell
# list sessions known to this machine
node src/cli.ts --list

# inspect a current or recent session
node src/cli.ts --verify --strict <session-id>

# record one session's structural digest
node src/cli.ts --snapshot update <session-id>

# compare after changing the parser
node src/cli.ts --snapshot check <session-id>

# run the committed, reviewable checks
npm run verify -w copilot-chat-exporter

# include the large machine-local baseline
npm run verify:local -w copilot-chat-exporter
```

## Sources and Search Results

### Official Microsoft and VS Code documentation

- [Manage agent sessions in VS Code](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions)
  documents sessions, compaction, multiple chats, session history, and the user-facing
  **Chat: Export Chat...** JSON command. It does not document the private `chatSessions/*.jsonl`
  mutation-log format.
- [Debug chat interactions](https://code.visualstudio.com/docs/agents/agent-troubleshooting/chat-debug-view)
  documents Agent Logs and Chat Debug View, including raw prompts, context, tool payloads, and
  exported OTLP debug sessions. These are useful complementary sources, not the local chat journal
  schema.
- [Use chat in VS Code](https://code.visualstudio.com/docs/chat/chat-overview) documents prompts,
  responses, tools, context, and session behavior at the product level.
- [Prompt files](https://code.visualstudio.com/docs/agent-customization/prompt-files) documents
  prompt-file locations and invocation, useful for the project's skill integration but not for
  journal parsing.

### Official VS Code source

These are the strongest technical references for current shapes, but they are internal source and
can change:

- [`chatSessionOperationLog.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/common/model/chatSessionOperationLog.ts)
  defines the mutation-log purpose, the storage schema, request fields, response-part persistence,
  and the distinction between dynamic and static response kinds.
- [`chatModel.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/common/model/chatModel.ts)
  defines `ISerializableChatData1/2/3`, request and response metadata, `IChatModel`, serialization,
  normalization, and compatibility behavior.
- [`chatService.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/common/chatService/chatService.ts)
  defines serialized tool invocations, terminal/todo/subagent/input payloads, response kinds,
  question carousels, confirmations, workspace edits, and usage fields.
- [`promptTokenDetails.ts`](https://github.com/microsoft/vscode/blob/main/extensions/copilot/src/platform/tokenizer/node/promptTokenDetails.ts)
  defines the category/label/percentage breakdown used by `promptTokenDetails` and shows how
  system instructions, tool definitions, messages, files, and tool results are classified.
- [`importLocalConversationToAgentSession.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/importLocalConversationToAgentSession.ts)
  shows current handling of markdown, reasoning, inline references, tool calls, subagent summaries,
  and the fact that other progress kinds are skipped during local-to-Agent-Host import.
- [`chatSessionStore.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/common/model/chatSessionStore.ts)
  shows session loading, normalization, and storage-location behavior.

### GitHub issues and community search

- The VS Code issue search for `chatSessions jsonl` returned current reports including
  [JSON-to-JSONL migration not performed](https://github.com/microsoft/vscode/issues/324959),
  [history missing when the JSONL file is absent](https://github.com/microsoft/vscode/issues/324662),
  and an [import-local-conversation change](https://github.com/microsoft/vscode/pull/324858).
  These support the practical conclusion that storage migrations and missing files are real failure
  modes, but they do not publish a stable JSONL schema.
- The former
  [`microsoft/vscode-copilot-release`](https://github.com/microsoft/vscode-copilot-release) issue
  tracker is archived and its relevant session issues are historical feedback rather than a schema
  authority.
- Reddit searches for `chat history jsonl` in `r/vscode` and `r/GithubCopilot` were attempted, but
  the fetcher returned no readable result beyond the Reddit shell page. No Reddit claim is used in
  this guide.
- Stack Overflow's tagged VS Code/Copilot listing returned HTTP 403 to the fetcher. No Stack
  Overflow claim is used in this guide.

## Maintenance Rules

1. Treat the journal as private input, not a supported API.
2. Replay the outer mutation log before interpreting requests.
3. Keep all VS Code-specific names in `session/classify.ts` and `session/journal.ts`.
4. Preserve response order; never bucket prose, thoughts, tools, and edits by type.
5. Treat a new kind as a question to investigate, not as an error to suppress.
6. Use the census to find drift and a session snapshot to measure the fix on the motivating session.
7. Add a small fabricated test for every newly handled shape.
8. Read verification diffs before re-recording them.
9. Keep raw contents out of structural snapshots; hashes and counts are enough for regression work.
10. When official source and local behavior disagree, record both and prefer the behavior required by
    the local journal until the difference is understood.

The parser's job is not to predict every future VS Code field. It is to preserve what the journal
contains, report what it cannot interpret, and make the conversion boundary easy to update when
that report arrives.
