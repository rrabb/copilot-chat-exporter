# VS Code Copilot Chat Exporter - Specification

Authoritative spec for `tools/copilot-chat-exporter`, the exporter that turns a VS Code
Copilot chat session into a single human-readable Markdown archive with visual aids.

This document is the contract. When you change the script, keep this spec and the on-disk output
in agreement, then follow the Verification section before considering the change done.

- Script: `tools/copilot-chat-exporter/src/cli.ts`
- npm entry: `npm run ai:export:chat`
- Run prompt (invoke the exporter): `.github/prompts/export-chat.prompt.md`
- Run skill (agent parity): `tools/copilot-chat-exporter/skill/SKILL.md`, surfaced to this repo through `.github/skills/export-chat/SKILL.md`
- Build prompt (recreate the exporter from this spec): `tools/copilot-chat-exporter/docs/BUILD-PROMPT.md`
- Reference output: `docs/chat-exports/reference-live-session-export.md`, regenerated from the frozen live-session fixture with `npm run ai:export:chat:reference`

## 1. Goal

Produce ONE Markdown file that a human can read top-to-bottom or navigate like a tree:
metadata -> cost -> summaries -> per-turn transcript with reasoning, tool calls, code, and cost.
Layout and formatting are first-class requirements, not cosmetic. Fidelity to the visual design
system below is part of "correct output."

Design priorities, in order:

1. Faithful to what actually happened (exact chat order, real values, no fabrication).
2. Human-readable and scannable (collapsible detail, emoji signposts, deep links).
3. Renders well in the VS Code Markdown preview first, GitHub second (inline styles degrade
   gracefully - GitHub strips them but still shows text/markdown).

## 2. Data sources (single-source-of-truth model)

The native chat journal is definitive. Everything else only enriches it.

| Source | Path (under the workspace-storage hash root) | Provides |
|---|---|---|
| Chat journal (DEFINITIVE) | `chatSessions/<sessionId>.jsonl` | prompts, reasoning, tool calls, assistant text, edits, per-turn scalars (tokens, credits, timing, model), **terminal output** |
| Raw tool outputs | `GitHub.copilot-chat/chat-session-resources/<sessionId>/call_*` or `toolu_*` | large tool-output bodies (`content.txt`), correlated by `toolCallId`. VS Code rotates/clears this store, so treat it as a bonus, not a dependency |
| Tool arguments (optional) | `GitHub.copilot-chat/transcripts/<sessionId>.jsonl` | `session.start`, `user.message`, `assistant.message`, `tool.execution_start` (toolCallId, toolName, **arguments**), `tool.execution_complete` (toolCallId, success). NOT the same schema as the journal and holds NO output bodies |
| Model catalog | `GitHub.copilot-chat/debug-logs/<sessionId>/models.json` | model id -> friendly name (e.g. `claude-opus-4.8` -> "Claude Opus 4.8") |
| On-disk memory | `memory-tool/memories/<base64(sessionId)>/` and `repo/`, user scope | session/repo/user memory + plan files |
| Versions | product/version metadata for Copilot + VS Code | metadata block |

Storage root on Windows: `%APPDATA%/Code/User/workspaceStorage/<hash>/`.

### 2.1 Journal format (`chatSessions/<id>.jsonl`)

A delta journal, one JSON record per line:

- `kind:0` `{ v: {...} }` - full snapshot (usually the first line). `v.requests[]` holds the turns.
- `kind:1` `{ k: [path...], v }` - SET value at path `k`.
- `kind:2` `{ k: [path...], v }` - APPEND at path `k`.

Turn (request) fields used: `requestId`, `message` (prompt), `response[]` (stream),
`timestamp`, `modelId`, `promptTokens`, `completionTokens`, `copilotCredits`, `elapsedMs`,
`promptTokenDetails` (category/label/percentage breakdown; older data may contain cache fields), `responseId`, `responseTimestamp`, `followups`,
`contentReferences`, `codeCitations`, `agent`, `modeInfo`, `isCanceled`.

`response[]` item kinds: `thinking` (reasoning), `toolInvocationSerialized` (tool call),
`textEditGroup` (file edit), `inlineReference`, and plain `{ value: "text" }` assistant text.

### 2.2 Critical parsing rules (do not regress these)

- **Recursive flattening.** Delta payloads and `response[]` items are frequently nested arrays or
  numeric-keyed splice objects like `{"0":..,"1":..}`. Flatten recursively before classifying
  (`flattenItems` / `spliceValues`). Skipping this drops the majority of tool calls (regression seen:
  72 vs 400+ tool calls).
- **Deep reasoning walk.** Reasoning can be nested below the node level; walk deeply
  (`collectThinking`) and de-duplicate. Also collapse prefix-duplicate thoughts
  (`collapsePrefixes`) so streamed partials do not repeat.
- **Index attribution.** Attribute nodes/scalars by request index, then map index -> `requestId`.
- **Chat-order preservation.** Keep `response[]` order so text, tools, and edits interleave exactly
  as they happened. Do NOT bucket all tools to the end of a turn.
- **Deduplicate tool calls by `toolCallId`.** The journal re-emits the same invocation as it
  progresses (queued -> running -> complete with output); a single call can appear up to 4 times and
  a later copy can land 150+ stream positions away, i.e. in a different turn. Keep the **first**
  occurrence (that is the chat display order) and **merge** later field updates into it
  (`pastTenseMessage`, `generatedTitle`, `isComplete`, `toolSpecificData`, terminal output, exit
  code, duration, `resultDetails`). Appending every occurrence both duplicates entries and scrambles
  the visible sequence.

## 3. Document layout (section order is part of the contract)

Top-to-bottom. Each `##` section ends with a right-aligned "Back to Contents" link.

1. `<a id="top"></a>` + `# Copilot Chat Export: <title>` + one-line intro blockquote.
2. `## Session Metadata` - bullet list: Session ID, Title, Session started, Export covers through,
   Export generated, Copilot version, VS Code version, Responder, User requests, Assistant reasoning
   turns, Tool calls, Persisted result resources, Models used, and a **Total cost** line
   (`⏱️ <elapsed> · 🔢 <completion> completion tokens · 💳 <credits> credits · 🤖 <n> model(s)`).
3. `<a id="contents"></a> ## Contents` - numbered links to the 9 sections below.
4. `## User Questions and Requests` - numbered list, one line per turn:
   `N. 🔷 [Q<N>: <clipped prompt, brackets escaped>](#user-message-N) - YYYY-MM-DD`.
5. `## Cost and Timing Summary` - table `Model | Turns | Prompt tokens | Completion tokens | Credits |
   Elapsed`, right-aligned numerics, a **Total** row, and a note that prompt tokens are per-request
   context sizes (not additive), while completion tokens and credits are the per-turn increment.
6. `## Executive Summary` - 2 short paragraphs (what/when + tool/reasoning/model/cost totals).
7. `## Important Outputs` - "Recorded Resources" list + "Recorded Output Limitation" `> [!NOTE]`.
8. `## Files Modified` - Files Edited in This Session; Chat Export Artifact (output path);
   Current Worktree Snapshot (`git status --short` in a ```text fence).
9. `## Tool Usage` - table `Tool | Calls | Persisted outputs`, sorted by tool name.
10. `## Conversation Transcript` - `> [!TIP]` visual-guide legend, then one block per turn (section 4 below).
11. `## Memory and Plan Artifacts` - on-disk memory/plan files, each as a bordered Markdown box
    inside a `<details>`.
12. `## Export Provenance` - source-journal path, resource root, single-source statement, redaction
    note, rendering note (inline styles preview-only).

## 4. Per-turn transcript block (the heart of the layout)

For each turn, in order:

1. `---` separator.
2. `<a id="user-message-N"></a>` anchor.
3. Styled header (HTML so the badge/timestamp render in preview):
   `<h3>🔷 Request N&nbsp; <span style="{PROMPT_BADGE}">{clipped prompt}</span>
   <span style="{MUTED}">{YY-MM-DD HH:MM}</span></h3>`
   - `PROMPT_BADGE` = `background:#1f6feb;color:#fff;padding:2px 8px;border-radius:4px;font-weight:600` (blue pill).
   - `MUTED` = `float:right;color:#8b949e;font-weight:400` (right-aligned grey timestamp).
4. `> [!NOTE]` callout containing **USER QUESTION / REQUEST** and the full verbatim prompt.
5. Reasoning is **not** hoisted into a single per-turn block. Each run of `thinking` nodes is emitted
   at its recorded stream position as `<details class="agent-reasoning"><summary>🧠 Agent reasoning
   (N thought(s))</summary>` with one `💡` per thought, grey and indented (`margin-top:8px` so the
   text never touches the summary line above it). Multiple thoughts in one block are joined with
   `<br>`, not blank lines - each still starts on its own line, but a multi-thought turn does not
   accumulate a full paragraph gap between every thought. This matches the chat, where thoughts
   appear between tool calls.
6. `#### 💬 Assistant Response` - walk the ordered turn body and **interleave**:
   - Assistant text/inline refs accumulate into a run and flush as live Markdown inside an
     `ASSISTANT_BOX` accent block (section 6.0) before the next tool/edit.
   - Tool call rendering (section 5).
   - File edit marker: `> 📄 Edited \`<relative path>\``. Strip the bare ``` fences VS Code wraps
     around edit previews (a trailing fence on the run before the edit, a leading fence on the run
     after) so the edit note does not render inside an empty code box.
   - After the body: a `**📄 Files touched (n):**` digest (🆕 created / ✏️ modified, with line counts)
     and a `🗒️ Todo list at this turn (n)` collapsible when present.
   - If no assistant text was recorded: `_No assistant text was recorded for this turn._`.
7. `<details><summary>ℹ️ Turn info</summary>` - table of Model, Mode, Agent, Response ID, prompt/
   completion tokens, prompt detail categories or legacy cache fields, Credits, Elapsed, Sources,
   Code citations, Followups, Requested, Responded, Canceled.
8. Cost footer: `<sub>⏱️ <elapsed> · 🔢 <prompt> prompt + <completion> completion (=<total>) ·
   💳 <credits> credits · 🤖 <model name></sub>`.
9. Right-aligned "Back to questions" link.

## 5. Tool call rendering rules

- **Header/summary.** `🛠️ <code><toolFriendly(toolId)></code>: <summary>`, wrapped in the muted
  treatment of section 6.0. Summary = the terminal command or the tool's past-tense/invocation
  message, run through `renderToolText()` (section 6.0a): a `[label](file:///...)` link becomes a
  real clickable relative link when the target is inside the workspace, or a colored (`FILE_LINK_COLOR`)
  but non-clickable span when it is not; a `` `backtick span` `` (a search tool's regex/glob) gets the
  same `COMMAND_CODE` styling as a terminal command. Falls back to the friendly tool id when there is
  no message at all.
- **Summaries wrap, they do not truncate.** A long summary flows onto the next line. Only a
  pathological one-liner is cut, at `MAX_SUMMARY_CHARS` (1000), because a multi-KB generated command
  would bury the rows around it. For terminal tools the untruncated command is always available in
  the `**Command:**` fence inside the collapsible, so the cap never loses information.
- **Status icons mark exceptions only.** A completed call carries no icon - the absence of a warning
  is the success signal. `⏳` marks a call still running; `⚠️` marks a non-zero terminal exit. Emoji
  cannot be muted by CSS, so a per-row ✅ would out-shout the assistant prose beside it.
- **No expandable content = plain line, no arrow.** If a tool has no terminal command, no persisted
  output resource, and no extra `toolSpecificData` details, render a single list line:
  `- 🛠️ <code>readFile</code>: Read <file>`. Do NOT emit an empty `<details>` whose only body is
  "Output: not persisted...".
- **Expandable tools** use `<details>` and may contain, in order:
  - `**Command:**` + fenced command (terminal tools).
  - `📟 Terminal output (exit N · <duration> · N lines)` collapsible with the captured output in a
    ```text fence. Source: `toolSpecificData.terminalCommandOutput.text`, with status from
    `toolSpecificData.terminalCommandState` (`exitCode`, `duration`). Strip ANSI/VT escape sequences
    (SGR colors, cursor moves, OSC title writes), normalize CRLF, and drop the leading fragment of
    the shell's own command echo. Clip to `MAX_TERMINAL_OUTPUT_BYTES` (24 KiB) head+tail. Badge ⚠️ on
    a non-zero exit, nothing on exit 0.
  - `📦 Tool result` collapsible from `resultDetails.output[]` entries where `isText` is true (MCP
    tools and some terminal calls carry the model-facing result here). A subagent call has no
    `resultDetails.output`; its report is the plain string `toolSpecificData.result`, so it is routed
    into this same slot instead of being left to the generic JSON dump below.
  - `📝 Subagent prompt` collapsible from `toolSpecificData.prompt` (the instructions given to the
    subagent), rendered as a plain text fence directly under the tool header - the readable
    counterpart to `**Command:**` for a call that delegates instead of executing.
  - `**Persisted output:**` line plus one `📦 Output body` collapsible per persisted resource.
  - `Tool details` collapsible with pretty-printed `toolSpecificData` JSON for non-terminal,
    non-todoList tools. For a `subagent` call this JSON has `prompt` and `result` removed - they
    already render above as readable text, so keeping them here too would show the same content
    twice, once legible and once as an escaped one-line JSON string.
  - Only when none of the above exist, `**Output:** not persisted as a separate resource (returned
    inline).`
  - `<details><summary>Tool details</summary>` with pretty-printed `toolSpecificData` JSON for
    non-terminal, non-todoList tools.
- Todo-list tools are summarized once per turn as the `🗒️ Todo list` digest, not as raw JSON.

## 6. Formatting and visual design system

### 6.0 Reading hierarchy: answer loud, machinery quiet

The export must reproduce the *weighting* of the live chat window, not just its content. In the chat,
assistant prose is full-size and full-contrast while tool rows are small and grey, so a reader skims
the narrative and dives into the machinery only on demand. An export that renders both at equal
weight forces the reader to parse every row to find the answer.

Two mechanisms, chosen so the hierarchy survives both renderers:

| Element | Treatment | Constant |
|---|---|---|
| Assistant prose run | left accent bar + `font-size:1.06em` + breathing margin | `ASSISTANT_BOX` |
| Every meta summary (tool call, terminal output, tool result, output body, tool details, reasoning, todos, turn info, copy source) | wrapped in `<sub>` **and** a grey span | `MUTED_SUMMARY` via `mutedSummary()` |
| The `<code>` tool-name badge inside a summary | golden-brown, transparent background, set **on the element** | `MUTED_CODE` (`#d0b682`) |
| A terminal command, or a search tool's regex/glob backtick span | small monospace with a cool tint - "this text is the machine-facing part" | `COMMAND_CODE` (`#928363`) |
| A filename inside a tool summary that resolves to a workspace file | real `[label](relative/path)` markdown link, no extra color needed - the link itself is the affordance | n/a - see 6.0a |
| A filename inside a tool summary that does **not** resolve to a workspace file (AppData/workspaceStorage internals) | colored but inert span, so it still reads as "this is a filename" | `FILE_LINK_COLOR` (`#c8937c`) |

> [!IMPORTANT]
> GitHub strips inline `style` but preserves `<sub>`. That split is deliberate: in the VS Code preview
> the reader gets colour plus size, and on GitHub the size difference alone still separates answer
> from machinery. A colour-only approach would render as a flat, undifferentiated wall on GitHub.

> [!WARNING]
> Muting a `<code>` badge by setting colour on an ancestor **does not work**. The preview stylesheet
> sets `code { color: var(--vscode-textPreformat-foreground) }` explicitly, and an explicit rule on
> the element beats an inherited value from a parent. The badge must be styled directly or it stays
> bright orange inside a wrapper that claims to mute it. Emoji are immune to CSS colour entirely -
> the only way to quiet one is to not emit it (hence the icon policy in section 5).

`ASSISTANT_BOX` deliberately sets **no `color`**. A hardcoded foreground colour looks wrong in
whichever preview theme the reader is not using; contrast comes from the muted surroundings instead.

### 6.0a File links and command styling inside a tool summary (`renderToolText`)

A tool's past-tense/invocation message is not shown verbatim - it is run through `renderToolText()`,
a small tokenizer that finds two things and swaps them for styled markup while leaving everything
else as plain escaped text:

1. `[label](file:///...)` - a file reference (often with an empty `label`, e.g. `[](file:///...)`).
   The URI is decoded, any `?query` or `#fragment` suffix is stripped, and the result is resolved
   with `workspacePath()`:
   - **Inside the workspace** -> a real `[display](relative/path)` markdown link (clickable in both
     the VS Code preview and GitHub).
   - **Outside the workspace** (e.g. an AppData/workspaceStorage internal path) -> a
     `<span style="color:${FILE_LINK_COLOR}">display</span>` - still visually called out as a
     filename, just not clickable, since a link to it would not resolve for a reader.
   - `display` prefers the link's own label (e.g. `jimu-framework-apis`) and falls back to
     `path.basename()` of the decoded path.
2. `` `backtick span` `` - typically a search tool's regex or glob (`Searched for regex `X` (`Y`),
   N results`). Rendered as `<code style="${COMMAND_CODE}">` - the same treatment a terminal command
   gets, since both are "the machine-facing part of the summary."

**Why a placeholder pass, not a single regex-and-escape:** the function first replaces every match
with a `\u0000<index>\u0000` marker, HTML-escapes the *whole remaining string* with `esc()` (so plain
prose around the matches is safe even if it contains stray `<`/`>`/`&`), then substitutes the markers
back with the pre-built (already-escaped-internally) replacement HTML. Escaping before generating the
markup would double-escape the tags; escaping only the matched fragments would leave the surrounding
prose unescaped. The marker round-trip is what makes both safe at once.

**Length cap happens before styling, not after.** `MAX_SUMMARY_CHARS` (see section 5) is measured
against the *plain* text (`stripMarkdown()` output), and only when it fits does the raw text get
passed to `renderToolText()`. Clipping the markup-laden HTML directly would risk cutting a summary
off mid-tag; clipping the plain text first and skipping styling entirely for the rare pathological
case is always safe, if slightly less pretty.

**Line-range fragments are intentionally dropped, not turned into anchors.** A file link's `#1-1`
style suffix is VS Code's own internal anchor, not a dependable "start-end" line range - it has been
observed reading `#1-1` on a link whose accompanying text says "lines 1 to 420". Building a
`#L<start>-L<end>` anchor from it would show a confidently wrong range, which is worse than no range
at all. The fragment is stripped before both the link target and the basename fallback are computed.

> [!NOTE]
> A session used to **build or debug this exporter** can end up searching a prior export of itself
> (e.g. grepping the previous archive for `<code>` tags to verify an earlier fix). When that happens,
> the raw regex/summary text legitimately contains literal HTML-looking substrings as *search-target
> data*, not as markup that leaked through. `esc()` still escapes it correctly - the row just reads
> oddly (a mix of styled and plain fragments, or visible `&lt;code&gt;` text) because VS Code's own
> message template only wraps *part* of a multi-clause regex in backticks. Confirmed by direct test:
> feeding the tokenizer nasty multi-span and raw-HTML inputs still produces balanced, fully-escaped
> output every time - this is a faithful render of an unusual input, not a tokenizer defect. Do not
> "fix" it by hiding or reformatting the literal text.

### 6.1 Emoji legend (stable meanings)

🔷 user request · 💬 assistant answer · 🧠 reasoning · 💡 thought · 🛠️ tool call · 📟 terminal output ·
📦 tool output/result · 📄 edited file · 📋 copy source · ℹ️ turn info · ⏱️ elapsed · 🔢 tokens ·
💳 credits · 🤖 model · 🗒️ todos · 🆕 created · ✏️ modified · ⬆️ back-to-nav.

Status icons are exception-only: `⏳` a call still running, `⚠️` a non-zero exit. A clean, completed
call carries no status icon (section 5).

### 6.2 Numbers, models, timestamps

- **Credits always 2 decimals** (`fmtCredits`, `.toFixed(2)`), everywhere they render.
- **Model names are friendly**, resolved via `models.json` (`modelName`); `auto` -> "Auto".
- **Token counts** use thousands separators.
- **Timestamps:** metadata uses ISO (`YYYY-MM-DD HH:MM:SSZ`); the turn header uses compact
  `YY-MM-DD HH:MM`; the TOC uses `YYYY-MM-DD`.

### 6.3 Safe fences

Use `fenceFor(content, lang)` for every embedded code/text block: it picks a backtick run longer
than any run inside the content, so embedded ``` never breaks the wrapper. This matters because the
archive can embed prior chat content that itself contains code fences.

### 6.3a Indented collapsible bodies (and the HTML-block rule)

Collapsible bodies are wrapped in `<div style="margin-left:...">` so content reads as a child of its
summary: `BODY_INDENT` (2em) for a tool/todo/turn-info body, `NESTED_INDENT` (1em) for blocks nested
inside one (terminal output, tool result, resource body, tool details). Stop at two levels - deeper
nesting squeezes wide code and terminal output. Agent reasoning uses the same 2em plus grey text.

> [!WARNING]
> A `<div>` must be followed by a **blank line**, and `</div>` preceded by one. Without them
> CommonMark treats the run as a raw HTML block and stops parsing Markdown until the next blank
> line, so fences, links and inline code render literally. This has bitten the export twice: a
> prompt rendered as a literal `> How do I...` with a visible `>`, and the first reasoning thought
> lost its inline code while later ones kept it. Never indent with leading spaces instead - 4+
> spaces would create an unintended code block.

### 6.4 Markdown artifacts: render only when safe

Embedded Markdown files (memory/plan files, persisted `*.md` outputs) are rendered **live inside a
bordered box only when they are safe to render**. Live rendering of arbitrary Markdown corrupts the
page: a `<Select>`/`<Option>` in a doc becomes a real dropdown, `<img>` fetches, and embedded
headings hijack the document outline.

Classify each artifact with a risk scan that ignores fenced regions (inside a fence content is
already inert) and flags:

| Risk | Why it breaks rendering |
|---|---|
| raw HTML/XML tag (`<[A-Za-z]...>`) | renders as live elements (dropdowns, inputs, layout) |
| HTML comments (`<!--`) | can swallow following content |
| ATX headings (`# ...`) | pollute the document outline / TOC navigation |
| anchors (`<a id=...>`) | duplicate ids collide with the export's own anchors |
| unclosed code fence | breaks the wrapper and everything after it |

- **No risks** -> bordered box (`✅ rendered`) plus a `📋 Copy source` collapsible.
- **Any risk** -> plain fenced ```markdown source (`⚠️ shown as source (<reasons>)`).

Either way prefix a `<sub>` stats line (`N lines · N bytes · mode`) and, where known, a
`- Source: <path>` line. Showing *why* it fell back keeps the output honest and debuggable.

Note the risk scan must ignore inline code spans when auditing output: `` `<script>` `` in prose is
literal text, not live HTML.

### 6.5 Bordered box (safe Markdown only)

`<div style="border:1px solid #d0d7de;border-radius:6px;padding:2px 16px;margin:8px 0"> ... </div>`.
The border shows in the VS Code preview; GitHub strips the style but still renders the Markdown.
Large resources (> `MAX_EMBEDDED_RESOURCE_BYTES`, 96 KiB) are clipped to first+last 48 KiB in a fence.

### 6.6 Copy affordances

Clipboard access requires JavaScript, which every Markdown renderer strips, so the export cannot
ship a scripted copy button. The **fenced code block is the copyable unit**: GitHub and the VS Code
Markdown preview both attach a native hover copy button to code fences. Therefore:

- Terminal commands and non-Markdown tool outputs already live in fences and are copyable for free.
- Content that renders live (bordered Markdown boxes, file lists) has no copy affordance, so it is
  **paired** with a `<details><summary>📋 Copy source</summary>` collapsible holding the same content
  inside a fence. The reader gets the pretty rendering by default and the raw, copyable text on demand.
- Per-turn file digests get `📋 Copy these paths`; the Files Modified section gets
  `📋 Copy all edited paths` (newline-separated, `text` fence, ready to paste).
- Copy blocks are skipped when the content exceeds `MAX_COPY_SOURCE_BYTES` (32 KiB) to avoid
  doubling the document size.
- 📋 is reserved for copy affordances in the legend, and the transcript carries a `> [!TIP]`
  explaining the convention.

### 6.7 Structural HTML neutralization (required for correctness)

Embedded content routinely quotes `<details>` / `<summary>` / `<div>` markup - memory and plan files
document it, assistant prose explains it, and reasoning notes discuss it. Rendered live, an unmatched
`<details>` opens a collapsible that never closes and **swallows the rest of the document**.

Escape these tags to `&lt;...` **outside fenced code** (inside a fence they are already inert, and
escaping there would corrupt the code display). Apply to: bordered Markdown box content, assistant
text runs, user prompt blockquotes, and recovered reasoning notes. Do NOT apply to the fenced copy
source - it must stay verbatim and copyable.

### 6.8 Navigation and safety

- Every `##` section and every turn provides a right-aligned back-to-nav link; sections use HTML
  `<a id="...">` anchors for deep linking.
- **Redaction** masks common `authorization: bearer`, api-key/token/password/client-secret
  assignment forms in all embedded text.
- Never fabricate content; render only what the local journals contain. Where data is missing, say
  so (e.g. "not persisted", "No assistant text was recorded").

## 7. CLI contract

- `npm run ai:export:chat` - export the current session (auto-detected via
  `VSCODE_TARGET_SESSION_LOG`, else the most recently modified session).
- `npm run ai:export:chat -- <outputPath.md>` - current session to a chosen path.
- `npm run ai:export:chat -- <sessionId> [outputPath]` - a specific session by id.
- `npm run ai:export:chat -- <chatSessions/...jsonl> [outputPath]` - a specific journal file.
- `npm run ai:export:chat -- --list` - list sessions (id, date, title).
- `npm run ai:export:chat -- --verify <sessionId|chatSessions/...jsonl>` - run source-side machine verification (Layers A + B) without writing an export file.
- `npm run ai:export:chat -- --verify <sessionId> <outputFile>` - additionally run Layer C against an existing rendered file.
- `npm run ai:export:chat -- --audit ...` - alias for `--verify`.
- `npm run ai:export:chat -- --golden check` - diff the golden fixture's digest
  against the committed baseline.
- `npm run ai:export:chat -- --golden update` - recompute and overwrite the committed digest.
- `npm run ai:export:chat -- --snapshot update <sessionId>` - record a digest of one of your own
  sessions under `test/snapshots/` (gitignored). See 9.7.
- `npm run ai:export:chat -- --snapshot check <sessionId>` - recompute and diff against it.

Markdown is the only output format. `sessionToJson` in `src/index.ts` returns the parsed model as
data for a caller that wants it, but it is deliberately not exposed as a flag: it is untruncated,
so a long session runs to tens of MB, and no consumer has asked for it.

A normal export also runs a **driftless Layer C self-check** on the content it just rendered
(reported as `Layer C self-check: all N render checks pass.`), and exits non-zero if any render
check fails.

**Output path resolution when no path is given:**

1. Directory, first match wins: `--out-dir <path>`, then `chatExport.outDir` in the workspace's
   `package.json`, then `outDir` in `.chatexportrc.json`, then `docs/chat-exports/` when it already
   exists, and finally `.copilot-chat-history/`. All are resolved against the workspace root.
   The workspace root itself is never used, so exports cannot scatter through a consumer's project.
2. Filename: `YYMMDD_slug_<idPrefix>.md` - a UTC datestamp of the session's **first turn** (not the
   export), the session title slugified (spaces to dashes, `\ / : * ? " < > |` stripped so it is a
   valid Windows filename, collapsed dashes, capped at 80 chars), and the first 8 characters of the
   session id. Falls back to the first prompt, then `copilot-chat`, for an untitled session.
3. Collision: none by construction. The name identifies the session, so a repeat export refreshes
   that archive in place.

> [!IMPORTANT]
> Dating the conversation rather than the export is what makes the name stable: re-exporting a
> growing session keeps writing to the same file instead of spawning a copy per run. This matches
> the one-file-per-session convention used by the `.chat-history/` exporter in this repo.

Prints one summary line: `Turns: N; tool calls: N; reasoning thoughts: N; resources: N` and the
`Output:` path.

> [!WARNING]
> The source argument must be a **session id** or a **`chatSessions/<id>.jsonl`** path. Do NOT pass a
> `transcripts/<id>.jsonl` path - that is a different schema and yields 0 turns (it will silently
> overwrite a good output file with an almost-empty one).

## 8. Acceptance criteria - what must be captured

This section defines **completeness**: section 9 checks that the output is well-formed, this one
checks that nothing the chat recorded was silently lost.

The governing rule: **present-or-stated**. If the journal recorded an element, the export must show
it. If it did not, the export must say so in words. Silently omitting an element is a defect,
because a reader cannot tell "the agent did not do this" from "the exporter dropped it".

### 8.1 Per user turn (question)

Every turn must carry each element below whenever the journal holds it.

| # | Element | Journal source | Rendered as | When absent |
|---|---|---|---|---|
| A1 | User prompt, verbatim and complete | `message.text` / `message.parts[].text` | `> [!NOTE]` callout + prompt box. The `<h3>` badge holds a clipped copy for scanning **only** - it never replaces the full text | never absent |
| A2 | Agent thinking | `response[].kind === 'thinking'` | `🧠 Agent reasoning (N thought(s))` collapsible **at its stream position**, one `💡` per thought, prefix-duplicates collapsed | no reasoning block for that turn |
| A3 | Assistant prose | `response[]` plain `{value}` items + `inlineReference` | accent block, live Markdown, in chat order | `_No assistant text was recorded for this turn._` |
| A4 | Tool call identity + intent | `toolId`, `pastTenseMessage` / `invocationMessage` / `generatedTitle` | muted `🛠️ <code>toolId</code>: summary`, wrapped not truncated, with file references linked/colored and regex-or-glob spans command-styled (section 6.0a) | falls back to the friendly tool id |
| A5 | Terminal command | `toolSpecificData.commandLine.original` | `**Command:**` + `powershell` fence, always full text | n/a |
| A6 | Terminal output + exit status | `terminalCommandOutput.text`, `terminalCommandState.exitCode` / `.duration` | `📟 Terminal output (exit N · duration · N lines)` collapsible, ANSI stripped, command echo trimmed | n/a |
| A7 | Model-facing tool result | `resultDetails.output[]` where `isText`, or `toolSpecificData.result` for a subagent call | `📦 Tool result (N lines)` collapsible | `**Output:** not persisted as a separate resource (returned inline).` |
| A8 | Persisted output bodies | `chat-session-resources/<toolCallId>/` | `**Persisted output:**` line + one `📦 Output body` collapsible per resource | omitted - the store rotates, so absence is normal and is covered by the Recorded Output Limitation note |
| A9 | Remaining tool payload | `toolSpecificData` (non-terminal, non-todoList) | `⚙️ Tool details` JSON collapsible | n/a |
| A10 | Files changed | `textEditGroup.uri` + create/edit tool URIs | three places: inline `> 📄 Edited <path>` marker at the point of edit, per-turn `📄 Files touched (n)` digest with 🆕/✏️ and line counts, and the session-level `## Files Modified` roll-up | digest omitted for the turn; section says none recorded |
| A11 | Todo state | `toolSpecificData.kind === 'todoList'` | `🗒️ Todo list at this turn (n)` with `[x]` / `[~]` / `[ ]` | omitted |
| A12 | Cost and timing | `promptTokens`, `completionTokens`, `copilotCredits`, `elapsedMs`, `promptTokenDetails` | `ℹ️ Turn info` table + `<sub>` cost footer; credits always 2dp | zeros or `n/a`, never blank |
| A13 | Model, mode, agent | `modelId` (friendly via `models.json`), `modeInfo`, `agent` | Turn info table + 🤖 in the footer | `unknown` |
| A14 | Chat ordering | `response[]` index | A2-A6 and A10 interleaved in recorded order, never bucketed by type | n/a |

### 8.2 Session level

| # | Element | Rendered as |
|---|---|---|
| B1 | Every user turn, none dropped | `## User Questions and Requests` count == turn blocks == `Q<N>` anchors |
| B2 | Session identity and provenance | `## Session Metadata` + `## Export Provenance` with the source journal path |
| B3 | Aggregate cost | `## Cost and Timing Summary` per-model table + Total row |
| B4 | Tool inventory | `## Tool Usage` table, counts equal distinct `toolCallId`s |
| B5 | All files touched across the session | `## Files Modified` + `📋 Copy all edited paths` |
| B6 | Memory and plan artifacts on disk | `## Memory and Plan Artifacts`, each rendered or shown as source per section 6.4 |
| B7 | Reading legend | `> [!TIP]` visual guide + copy-convention tip in the transcript header |

### 8.3 Presentation criteria

| # | Criterion |
|---|---|
| C1 | Assistant prose is visibly more prominent than the tool/meta rows around it, in **both** the VS Code preview and on GitHub (section 6.0) |
| C2 | No meta summary renders at full size or full contrast - including the `<code>` tool-name badge |
| C3 | Long summaries wrap; nothing is truncated except at `MAX_SUMMARY_CHARS`, and only where the full text remains available elsewhere |
| C4 | Status icons appear only for exceptions (`⏳`, `⚠️`) |
| C5 | Collapsible bodies are indented at most two levels (`BODY_INDENT`, then `NESTED_INDENT`) |
| C6 | Every embedded artifact is labelled `✅ rendered` or `⚠️ shown as source (<reasons>)` |
| C7 | A file reference inside a tool summary is a real link when the target is inside the workspace, or a colored (`FILE_LINK_COLOR`) non-link when it is not - never a plain unstyled filename |

### 8.4 Anti-criteria (an export failing any of these is wrong even if it looks fine)

- Reasoning hoisted to the top of a turn instead of sitting where it happened.
- Tool calls bucketed at the end of a turn instead of interleaved.
- A tool call appearing more than once because progress updates were not deduped by `toolCallId`.
- Terminal output missing because only `chat-session-resources` was consulted.
- An element quietly dropped rather than reported as absent.

## 9. Verification (run this every time the script changes)

Correctness = the output still matches this spec AND the numbers/order match reality. Use a known
session with rich content (e.g. `reference-live-session-export.md`) as the baseline.

### 9.1 Audit architecture (independence model)

Governing principle: **a check is only as strong as its independence from what it checks.** Two
derivations that share code share bugs, so they validate each other into a false sense of safety.
Design every verification layer to be as independent as practical from the stage it audits.

The export pipeline has three stages where a defect can hide, and three matching verification layers:

```
raw jsonl lines
   |  (A) delta replay: setAtPath / appendAtPath / remapCompactIndex
   v
state.requests[]              <- reconstructed final request objects
   |  (B) shared primitives: flattenItems, classifyNode, collectThinking, mergeToolNode
   v
turns[]  +  rawRequests       <- BOTH branch off the same state.requests[]
   |  (C) renderTurnBody / renderToolNode / section assembly
   v
the .md file
```

| Bug location | Example | Caught by current `--verify`? | Why |
|---|---|---|---|
| A. Delta replay | `appendAtPath` drops an append; `remapCompactIndex` mis-shifts | No | Both sides read the already-replayed `state.requests[]`; the loss is baked in first |
| B. Shared primitive | `flattenItems` skips a nested splice object; `classifyNode` misreads a kind | No | Both sides call the same function, so both lose the same node identically |
| B'. Normalization only | compact reattachment, empty-prompt turn filtering, dedup application | **Yes** | The turn-builder does this; the raw summary does not, so they diverge |
| C. Rendering | assistant text dropped, wrong escaping, compact placed under wrong heading | No | The verifier never opens the `.md` |
| Ordering within a turn | tools/thoughts same count but wrong sequence | **Yes** | Per-turn `toolIdSeq`/`thoughtSeq` order compare in `buildVerificationReport`, gated on equal counts |
| Cross-turn `toolCallId` reuse | same id genuinely invoked again in a later turn | **Yes** (reported, non-failing) | `crossTurnDuplicates` in `buildVerificationReport`; confirmed benign per-turn-scoped case, see the note below |

**Confirmed finding (2026-08-22): within-turn `toolCallId` reuse was a real defect, now fixed.**
Investigating the cross-turn-duplicate report surfaced a case where the SAME `toolCallId` appeared
twice within one turn's own raw response (an identical terminal command run twice back-to-back).
The original merge rule (`if (existing) mergeToolNode(...)`) folded the second, genuinely new
invocation into the first node unconditionally, silently hiding it and overwriting the first node's
output with the second call's result. Fixed by gating the merge on `!existing.isComplete`: a further
same-id node only merges while the tracked entry hasn't completed yet; once complete, a repeat id
starts a new node. Applied identically in `parseChatSession` and `summarizeRequestForVerify` so
Layer B stays in sync. Cross-turn reuse (different turns, same id) remains benign and unfixed, since
dedup is intentionally scoped per turn.

**Layer A - raw-delta cross-check (IMPLEMENTED, `buildJournalCrossCheck`).** Re-derives tool-call identity
straight from the journal with a generic object walk keyed on `kind`, deliberately NOT reusing
`flattenItems`/`classifyNode`, so a silent-drop bug in those shared primitives cannot hide behind an
identical derivation. A plain walk never descends into string values, so tool ids embedded in quoted
prior exports or subagent result blobs are excluded for free. It reports distinct journal tool ids vs
parsed tool ids and fails on any `dropped` (in journal, absent from turns) or `invented` (the reverse).

**Layer B - parse-vs-turns (IMPLEMENTED, `buildVerificationReport`).** Compares the replayed-requests
summary against the final parsed-turns summary. Its scope covers the **normalization layer** (row
B') - it is where the `/compact` bug lived - plus per-turn tool-call and thought **order** (compares
`toolIdSeq`/`thoughtSeq` when counts already match) and session-level cross-turn `toolCallId`
multiplicity. Remaining future upgrade: assert the full response-text sequence rather than only the
first.

**Layer C - turns-vs-rendered-file (IMPLEMENTED, `buildRenderReport`).** Re-reads the `.md` and
asserts the artifact reflects the parsed turns: `user-message-N` anchor count == turns and sequential,
section-scoped TOC count == turns, `<h3>` request headers == turns, `#### 💬 Assistant Response`
sections == turns, tool badges == tool nodes, `<details>` balance, and `Compacted conversation.` under
its `/compact` turn when that confirmation was recorded; response-less `/compact` turns are reported
as having no recorded confirmation. All counts run against **scaffold-only** text (`scaffoldText`): fenced regions
AND blockquote lines are removed, and every marker is anchored to line-start generated markup, because
a self-referential transcript quotes these markers in both fenced tool results and blockquoted user
pastes. Catches stage C regressions (escaping, placement, mislabeling, dropped prose); misses upstream
correctness (garbage in, faithfully-rendered garbage out).

**CLI mapping.** `--verify <sessionId>` runs Layers A/B (source-side truth). `--verify <sessionId>
<outputFile>` additionally runs Layer C against that file, and a normal export runs Layer C in-process
on the content it just rendered. The output file is optional; the layers are complementary.

**Driftless vs stale Layer C.** Layer C must check the rendered file that corresponds to the *current*
journal snapshot. The export's in-process self-check is driftless (same parse produced both the file
and the tool-node count). Running `--verify <id> <file>` against a file written by an *earlier* export
reports a badge/anchor deficit equal to the tool calls recorded since - expected for a live,
self-referential session, not a render bug. Prefer the export self-check, or export and verify in one
invocation, when auditing the session that is building the exporter.

### 9.2 Fast automated gate

1. **Types and syntax:** `npm run typecheck -w copilot-chat-exporter` (must report zero).
2. **Lint/type errors:** check the file has no problems (editor diagnostics / `get_errors`).
   `npm run typecheck -w copilot-chat-exporter` is the eventual gate; it stays red until the
   annotation pass lands.
3. **Run the verifier first** from a session id (never a transcripts path):
   `npm run ai:export:chat -- --verify <sessionId>`. Add `--strict` to fail on schema drift.
4. **Regenerate the baseline** from a session id:
   `npm run ai:export:chat:reference`.
5. **Counts sanity:** the printed `Turns / tool calls / reasoning thoughts / resources` should be
   non-zero and within a small delta of the last known-good run. A sudden drop (e.g. tool calls
   falling by hundreds, or turns -> 0) means a parsing regression - stop and investigate.

`--verify` / `--audit` exit code contract:
- `0` = no mismatches detected.
- `2` = at least one mismatch or request/turn count mismatch.

### 9.3 Verifier report expectations

`--verify` prints a deterministic summary that must be reviewed before a release:
- Layer B: request count from replayed journal and parsed turn count; mismatch counts for prompts,
  first response text, thought counts, tool-call counts, terminal output line totals, tool-call order,
  and thought order; missing and extra turns by `requestId`; compact diagnostics (reattachment count +
  per-`/compact` checks); cross-turn `toolCallId` duplicates (reported with per-occurrence turn/tool
  context, non-failing - legitimate when the same command runs again in a later turn).
- Layer A cross-check: distinct journal tool ids vs parsed tool ids, streamed-thinking count, and any
  `dropped`/`invented` tool ids (a non-empty list fails the run).
- Layer C (when an output file is passed): one PASS/FAIL line per render check (anchors, TOC, headers,
  assistant sections, tool badges, `<details>` balance, compact placement).

### 9.4 Journal shape catalogue (evidence for the golden fixture)

Surveyed all 45 local `chatSessions/*.jsonl` files to confirm which tricky shapes the parser must
handle are real (not just theoretical) before committing them to a golden fixture (9.5).

| Shape | Status | Evidence |
|---|---|---|
| Re-emitted/deduped `toolCallId` (same call appended 2-4x as it progresses) | **Real, common** | 151 in the working session; 3,849 in another - the dominant shape, not an edge case |
| Same completed `toolCallId` reused for a new invocation within one turn | **Real** | identical terminal commands were invoked twice in the working session; merge must stop after `isComplete: true` |
| Prefix-duplicate streamed thought (a later thought is a longer version starting with an earlier one's text) | **Real** | e.g. two `thinking` appends both starting `"No screenshot actually came through, just the file, but I ca…"`, one a strict extension of the other |
| `/compact` turn needing reattachment (standalone `Compacted conversation.` lands on the wrong index) | **Real** | 1 reattachment observed in the working session across 3 `/compact` turns |
| Response-less `/compact` turn | **Real** | the current chat session contained a final `/compact` request with no recorded assistant response while export ran; Layer C must not invent or require a confirmation |
| Terminal tool output with raw ANSI escapes + a captured exit code | **Real** | `toolSpecificData.terminalCommandOutput.text` containing `\u001b[...m` sequences alongside `terminalCommandState.exitCode` |
| `textEditGroup` (file edit marker) | **Real, common** | 54 occurrences in one session |
| `inlineReference` (file/symbol reference) | **Real, common** | 51 occurrences in one session |
| `todoList` tool payload, including an empty list | **Real, common** | dozens of occurrences, counts ranging from 0 to several |
| Subagent tool call with both `toolSpecificData.prompt` and a populated `toolSpecificData.result` | **Real** | found in a different session (prompt 1,721 chars, result 8,187 chars); the working session only had one subagent call and it was still in-progress (`prompt` set, `result` not yet populated) - both states are real |
| `request.confirmation` field (e.g. `"Try Again"`) alongside `message.text` | **Real, but redundant** | always accompanied a non-empty `message.text` in every case found (e.g. `message.text: "@agent Try Again"`); not a distinct content carrier, so the parser's `messageText()` does not need to special-case it |
| `contentReferences`, prompt-token detail categories | **Real** | `promptTokenDetails` contains System/User Context category rows in the working session |
| Numeric-keyed splice object as a delta value (e.g. `{"0": {...}, "1": {...}}` instead of an array) | **Not found in corpus (0 of 45 sessions)** | `flattenItems` handles this defensively per the historical "72 vs 400+ tool calls" regression note, but no live example exists locally; must be hand-constructed (synthetic) for the fixture and labelled as such |
| `isCanceled: true` on a request | **Not found in corpus (0 of 45 sessions)** | rendered today (`renderTurnInfo`'s `Canceled` row) but never exercised by a real session on this machine; synthetic for the fixture |
| `codeCitations` / `followups` populated with entries | **Not found populated** (fields exist but empty in surveyed sessions) | lower priority; not included in the first fixture cut |

**Conclusion:** the fixture can be built almost entirely from real, observed shapes. Two cases (splice-object delta, `isCanceled: true`) have no local precedent and must be synthetic - labelled `"synthetic": true` per case in the fixture so the digest and any future contributor knows those two are constructed defenses, not reproductions.

### 9.5 Golden baseline (IMPLEMENTED)

Closes item 10 from the audit-limitations review: every Layer A/B/C check today is internal-consistency
(the export compared against itself), so a systematic drift that shifts both sides of a comparison the
same way passes everywhere. A golden baseline adds an externally-committed answer key for one frozen
input, so a systematic drift shows up even when it is self-consistent.

**Fixture.** A small, hand-assembled journal at
`tools/copilot-chat-exporter/test/fixtures/golden/00000000-0000-4000-8000-000000000000.jsonl`, covering one of each selected shape in
the 9.4 catalogue (including completed-ID reuse, response-less compact, and cross-turn reuse, and
marking the two synthetic cases). It is kept intentionally small (9 turns) so it stays reviewable in
a PR diff.

**Digest AND a normalized render.** A raw `.md` byte-diff is too brittle on its own: it embeds
`Export generated: <now>`, a live `git status` snapshot, working-tree line counts, and its own output
path, so it would fail on every run regardless of correctness. Both committed artifacts therefore go
through `src/verify/golden.ts`, which masks exactly those four things:

- `tools/copilot-chat-exporter/test/fixtures/golden/golden-session.digest.json`, a normalized,
  deterministic digest computed purely from the parse (`parseChatSession` + `buildRenderReport`) -
  no timestamps, no absolute paths, no `models.json`, no resource store.
- `tools/copilot-chat-exporter/test/fixtures/golden/golden-session.expected.md` (~27 KB), the
  normalized render itself. The digest answers "which field drifted"; the render answers "what does
  the page now look like", and turns a rendering change into a reviewable markdown diff in a PR.

`--golden check` compares both and fails on either. The digest alone is insufficient: a one-character
heading change passes the digest and fails the render.

Generated renders are written to `test/baseline/` (gitignored); `test/fixtures/` holds only the saved
artifacts a check compares against.

Digest shape:
```json
{
  "schema": 2,
  "turns": 6,
  "toolCalls": { "total": 9, "distinct": 8 },
  "thoughts": 5,
  "perTurn": [
    { "n": 1, "requestId": "req_a", "promptSha": "ab12…", "thoughts": 1, "thoughtShas": ["cd34…"],
      "tools": 2, "toolIds": ["call_a", "call_b"], "termLines": 3,
      "files": ["src/x.ts"], "compact": false }
  ],
  "render": { "anchors": 6, "toc": 6, "headers": 6, "assistant": 6, "badges": 9, "detailsBalanced": true },
  "census": { "seen": { "thinking": 4 }, "dropped": {}, "toolData": { "terminal": 5 },
               "unhandled": [], "unrecognizedToolData": [] },
  "notes": []
}
```
SHA-256 of normalized prompt/assistant text keeps the digest small while still detecting content
changes. `toolIds` and `thoughtShas` recorded in order also give the per-turn tool-call and thought
**order** and **multiplicity** checks on this fixture, at no extra cost. The census is in the digest
so that adding a handler for a new kind registers as a change, not only as one turn's text moving.
`notes` is supplied by the caller: the golden fixture passes the two synthetic-case labels, a
snapshot passes none.

**CLI.** `--golden check` parses the fixture, recomputes the digest, and diffs it against the committed
file (exit 2 with a field-level diff on mismatch). `--golden update` recomputes and overwrites the
committed digest - a deliberate, reviewed action gated by the PR diff, the same way a snapshot-test
update is.

**Why it catches what A/B/C miss.** A `flattenItems` change that silently drops a nested tool call
still makes Layer A and Layer B agree with each other (both derive from the same, now-wrong, parse of
the live session). The committed digest, taken from the old and correct parse of the same frozen fixture
bytes, does not move - so it mismatches and the run fails. That is the systematic-drift signal nothing
else provides.

**Limits.** Only proves no regression against the frozen fixture; a real session using an input shape
the fixture does not cover can still regress silently. Two mitigations: add a fixture case whenever a
new bug class is found, so the fixture becomes the regression corpus over time; and see 9.7 for
pointing the same comparison at an arbitrary session. Item 11 (Layer A's cross-check
sharing the parser's `JSON.parse`-skip-on-error behavior) is a separate gap this does not close; that
needs its own malformed-line fixture case.

### 9.7 Session snapshots (IMPLEMENTED)

The same digest, recorded for any session the user has, rather than for the committed fixture. It
exists because of the limit stated directly above: the two committed checks cover two conversations,
and the session that motivates a change is almost never one of them.

- `--snapshot update <sessionId>` renders in memory, builds the digest, and writes
  `test/snapshots/<sessionId>.digest.json`.
- `--snapshot check <sessionId>` recomputes and diffs, exit 2 with a field-level diff on mismatch.

**Digest only, no render.** Contents are reduced to hashes, so size is bounded by turn and tool
counts rather than by payloads: a 9-turn session is about 4.6 KB. A full render would be megabytes
per session and is what `--golden` already provides for the one session small enough to review.

**Gitignored.** A snapshot names a session that exists only in one machine's VS Code storage, so it
is meaningless in another checkout. `test/snapshots/` is ignored for that reason, not because it is
disposable.

**What it is for.** Adding a handler for a new node kind should move `census.unhandled` and the
specific turns that gained content, and a snapshot shows exactly that. `docs/UPGRADING.md` folds it
into the procedure: record before changing anything, check after implementing, re-record last.

### 9.6 Structural checks on the generated file

- **`<details>` balance:** count `<details` opens vs `</details>` closes. They should match, EXCEPT
  for literal occurrences embedded inside fenced code blocks (the archive can quote its own tags).
  When counting, ignore matches inside ``` fences - and use a **fence-length-aware** scanner, because
  `fenceFor` emits 4+ backtick wrappers around content that itself contains ``` lines. Also track
  running depth: it must never go negative and must end at 0.
- **Copy affordances:** `📋 Copy source` / `📋 Copy these paths` / `📋 Copy all edited paths`
  collapsibles are present and each wraps a fenced block.
- **No live HTML leaks:** strip fenced regions AND inline code spans, then confirm no
  `<select|option|input|button|iframe|script|style|form` tags remain. Any hit means embedded content
  is rendering as real UI.
- **Markdown artifacts labelled:** each embedded `.md` artifact shows either `✅ rendered` or
  `⚠️ shown as source (<reasons>)`.
- **No duplicate tool calls:** the reported tool-call count should equal the number of distinct
  `toolCallId`s in the journal, not the number of `toolInvocationSerialized` nodes (the latter is
  inflated by progress updates). Spot-check a turn against the live chat: the order and the set of
  tool entries must match one-for-one.
- **Terminal output present:** `📟 Terminal output` blocks appear for terminal calls, contain no raw
  `\u001b[` escape sequences, and show a plausible exit code and duration.
- **No orphan edit fences:** no bare ``` line immediately above a `> 📄 Edited` line (outside quoted
  content). This is the "empty text box around an edit" bug.
- **No-output tools are plain lines:** tools with no command/resource/details render as `- 🛠️ ...`,
  not as a `<details>` whose only body is the "not persisted" line.
- **Every meta summary is muted:** using the same fence-aware scanner, `<summary><sub>` should equal
  the `<details` count minus the document-level Memory-artifact summaries (2 when both memory groups
  are present). Any other bare `<summary>` in transcript output is a miss.
- **Tool-name badges are muted at the element:** every `<code` inside a summary carries its own
  `style=` with a colour. An inherited colour on a wrapper is not sufficient (section 6.0).
- **No stray success icons:** the transcript contains no `🛠️ ✅`; the only status icons present are
  `⏳` and `⚠️`.
- **Summaries wrap rather than truncate:** ellipsis-terminated summaries (`…</span>`) should be rare
  and each one should exceed `MAX_SUMMARY_CHARS`. A crop at ~120 chars means the old clip is back.

> [!WARNING]
> Every check in this section must **ignore fenced regions**, not just the `<details>` balance check.
> An export of a session that built the exporter embeds *earlier exports* inside tool results, so a
> naive scan reports the old format's `🛠️ ✅` rows and bare `<summary>` tags as live defects. Measured
> naively this export showed 85 stray ticks and 58 bare summaries; fence-aware, the true counts are 0
> and 2.
- **Credits are 2dp:** every rendered `💳 <n> credits` matches `\d+\.\d{2}`.
- **Model names are friendly:** the metadata "Models used" and per-turn footers show names, not raw
  ids (unless `models.json` was unavailable).
- **Bordered md boxes:** the Memory and Plan Artifacts section uses the `border:1px solid` div.
- **Required sections present:** all 12 `##` sections from section 3 exist and in order.

### 9.7 Spot-check one rich turn by eye

Open the file in the **VS Code Markdown preview** (not just the raw text) and confirm on a known turn:

- The blue prompt badge and right-aligned timestamp render.
- Assistant text and tool calls appear in the **same order as the live chat** (tools interleaved,
  not lumped at the end).
- Filenames appear in read/edit summaries (not blank).
- An edit renders as a clean `> 📄 Edited ...` blockquote (no wrapping code box).
- A markdown artifact renders inside a visible border.
- **Squint test (criterion C1):** defocus and scroll a tool-heavy turn. The assistant prose should
  read as the dominant band and the tool rows as grey texture. If a green tick, an orange badge, or
  a tool row is the first thing the eye lands on, the hierarchy is inverted - fix it before shipping.
- Repeat the squint test on GitHub (or any renderer that strips inline styles) to confirm the `<sub>`
  fallback alone still separates answer from machinery.

### 9.8 When you change parsing

If you touch `parseChatSession`, `flattenItems`, `spliceValues`, `collectThinking`, or
`classifyNode`, re-run 9.2-9.7 against at least two different sessions (one large, one small) via
`--list`, because delta shapes vary between sessions.

## 10. Known pitfalls (learned the hard way)

- Passing a `transcripts/<id>.jsonl` path -> 0 turns and overwrites the good file. Use the session id.
- Forgetting recursive flattening -> most tool calls vanish.
- Assuming `/compact` control turns always keep their own response index -> the journal can drift compaction updates to the neighboring request, so `Compacted conversation.` appears under the wrong turn unless remap + reattachment guards run.
- Counting rendered markers on a self-referential export without excluding BOTH fenced regions and blockquote lines -> false positives, because the transcript quotes its own markers in fenced tool results (`🛠️ <code>`, `<details>`) and in blockquoted user pastes (`> ... </details>` copied from a prior verification run). Layer C uses `scaffoldText` (drop fences + blockquotes) and anchors every count to line-start generated markup.
- Verifying a rendered file written by an earlier export against the current journal -> a badge/anchor deficit equal to the tool calls made since. Use the driftless in-process self-check, not a stale file.
- Rendering md outputs as raw fences instead of a bordered box -> looks like code, not a document.
- Leaving VS Code's edit-preview ``` fences in -> empty box around `> 📄 Edited`.
- Using raw `copilotCredits` -> long decimals; always `fmtCredits`.
- Counting `<details>` without excluding fenced/embedded copies -> false imbalance alarms. A naive
  fence tracker that toggles on any ``` line also miscounts, because 4-backtick wrappers legitimately
  contain ``` lines; match the closing run length against the opening one.
- Rendering embedded `<details>`/`<summary>` markup live -> a collapsible opens and never closes,
  hiding everything after it. Always neutralize structural HTML outside fences (section 6.7).
- Rendering an arbitrary `.md` artifact live in the bordered box -> docs that *document* HTML render
  it as real UI (a `<Select>` became an actual dropdown). Run the risk scan (section 6.4) and fall
  back to fenced source; do not try to escape your way out of arbitrary HTML.
- Auditing for live tags without stripping inline code spans -> false positives, since `` `<script>` ``
  in prose is literal text.
- Treating every `toolInvocationSerialized` node as a separate tool call -> duplicated entries and a
  scrambled sequence, because the journal re-emits each call as its status changes. Dedupe by
  `toolCallId` (section 2.2).
- Merging every same-`toolCallId` node unconditionally -> a genuinely NEW invocation silently
  disappears. VS Code can reuse the exact same `toolCallId` when the identical command/tool+args runs
  again later (confirmed via the Layer B cross-turn-duplicate audit, spec 9.1 item 4: the same
  terminal command's `toolCallId` recurred within one turn and again in the next). Only fold a
  same-id node into the tracked entry while that entry is still `isComplete: false`; once complete,
  a further same-id node is a fresh call and must start a new entry, or its real output gets
  overwritten onto the wrong badge's position.
- Assuming terminal output is only in `chat-session-resources` -> it is usually inline in the journal
  at `toolSpecificData.terminalCommandOutput.text`. The resources store is frequently empty because
  VS Code rotates it, so an export that relies on it alone will show no outputs at all.
- Hoisting reasoning into one per-turn block -> the export no longer matches the chat, where thoughts
  are interleaved between tool calls. Render `thinking` nodes where they occur (section 4).
- Resolving a file link to `basename` without stripping the `#L10-L20` fragment -> summaries read
  `export-copilot-chat.mjs#508-508, lines 508 to 560`.
- Muting a summary by putting the colour on a wrapping `<span>` -> the `<code>` tool-name badge stays
  bright, because the preview stylesheet sets `code { color: ... }` explicitly and an explicit rule
  on the element beats an inherited one. Style the `code` element itself.
- Trying to tone down a status emoji with CSS -> emoji ignore `color` entirely. The only lever is
  whether you emit it, which is why a completed call carries no icon.
- Clipping tool summaries to a fixed width -> the informative half of a search pattern or a long
  command is replaced by `…`. Let summaries wrap; cap only pathological lengths.
- Setting an explicit text colour on the assistant block -> unreadable in whichever preview theme the
  reader is not using. Derive prominence from the muted surroundings instead.
- Leaving a subagent's `result`/`prompt` only in the raw `toolSpecificData` JSON dump -> the report
  renders as an escaped one-line string (literal `\n`s, no real line breaks) and, worse, the tool
  still prints "not persisted as a separate resource" even though the result is sitting right there
  in the JSON. Route `toolSpecificData.result` into the same `resultText` slot other tools use, and
  `toolSpecificData.prompt` into its own `📝 Subagent prompt` fence, then strip both from the JSON dump.
- Joining multiple reasoning thoughts with blank lines -> each becomes its own paragraph, so a
  5-thought turn accumulates five paragraph gaps. Join with `<br>` instead: still one thought per
  line, without the compounding vertical space.
- Escaping a tool summary's plain text and *then* inserting generated markup (a file link, a
  command `<code>` span) -> the markup's own `<`/`>` get escaped too, showing literal `&lt;code&gt;`
  instead of a styled element. Tokenize first (placeholder markers), escape the whole string once,
  then substitute the pre-escaped replacements back in (section 6.0a).
- Reading a confusing-looking tool summary from a self-referential test session (one used to build
  or debug this exporter, which ends up searching its own prior exports) as a rendering bug ->
  verify with a direct, isolated repro of the tokenizer first. It has been faithfully correct in
  every case tested; the confusing part is almost always that VS Code's own message only wrapped
  *part* of a multi-clause regex in backticks (section 6.0a).
