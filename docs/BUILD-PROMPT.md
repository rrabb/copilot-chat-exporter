# Build Prompt - VS Code Copilot Chat Exporter

Use this prompt to (re)build the chat exporter from scratch, or to port it to another repo, while
preserving the exact layout and formatting. Pair it with the spec:
`tools/copilot-chat-exporter/docs/SPEC.md`. The spec is the contract; this prompt is the instruction.

---

## Task

Build a standalone Node.js ESM tool, `tools/copilot-chat-exporter`, that exports a VS Code
Copilot chat session into a single, human-readable Markdown archive with visual aids. Expose it as
`npm run ai:export:chat`. Then generate one reference archive and self-verify it.

Layout and formatting fidelity are acceptance criteria, not nice-to-haves. Follow the spec's
document layout (spec section 3), per-turn block (section 4), tool rendering (section 5), and visual
design system (section 6) exactly.

## Inputs and sources (spec section 2)

Read from `%APPDATA%/Code/User/workspaceStorage/<hash>/`:

- `chatSessions/<sessionId>.jsonl` - the DEFINITIVE journal (delta records `kind:0/1/2`). Everything
  primary comes from here.
- `GitHub.copilot-chat/chat-session-resources/<sessionId>/call_*|toolu_*` - raw tool-output bodies,
  correlated by `toolCallId`.
- `GitHub.copilot-chat/debug-logs/<sessionId>/models.json` - model id -> friendly name.
- `memory-tool/memories/<base64(sessionId)>/` and repo/user memory - memory & plan files.
- Copilot/VS Code version metadata for the metadata block.

Honor these non-negotiable parsing rules (spec section 2.2):

1. Recursively flatten nested arrays and numeric-keyed splice objects (`{"0":..,"1":..}`) before
   classifying `response[]` items. Missing this drops most tool calls.
2. Deep-walk reasoning (`thinking`) and de-duplicate, including prefix-duplicate streamed partials.
3. Preserve `response[]` order so assistant text, tool calls, and edits interleave exactly as in the
   live chat. Never bucket tools to the end of a turn.
4. Attribute nodes/scalars by request index, mapped to `requestId`.

## Output requirements

Produce the section order in spec section 3 (Session Metadata -> Contents -> User Questions ->
Cost and Timing Summary -> Executive Summary -> Important Outputs -> Files Modified -> Tool Usage ->
Conversation Transcript -> Memory and Plan Artifacts -> Export Provenance), each `##` ending with a
right-aligned back-to-contents link and using `<a id="...">` anchors.

Per-turn block (spec section 4): `---`, anchor, styled `<h3>` header with a blue `#1f6feb` prompt
badge and a right-aligned grey `#8b949e` `YY-MM-DD HH:MM` timestamp, a `> [!NOTE]` verbatim prompt,
a `🧠 Agent reasoning` collapsible of `💡` thoughts, a `#### 💬 Assistant Response` that interleaves
text and tools in chat order, a `ℹ️ Turn info` table, and a `<sub>` cost footer
(`⏱️ 🔢 💳 🤖`).

Tool rendering (spec section 5):

- A tool with no command, no persisted output, and no extra details = a single plain list line
  `- 🛠️ ✅ <code>tool</code>: summary` (NO `<details>` arrow).
- Otherwise a `<details>` with, as applicable: `**Command:**` fence, `**Output:**` line, per-resource
  `📦 Output body` collapsibles, and a `Tool details` JSON collapsible.

Formatting/visual system (spec section 6):

- Credits ALWAYS 2 decimals; friendly model names from `models.json`; thousands-separated tokens.
- Use a dynamic fence helper that picks a backtick run longer than any run inside the content, so
  embedded ``` never breaks a wrapper.
- Render markdown file outputs (memory/plan, `*.md` resources) as live Markdown inside a bordered
  box `<div style="border:1px solid #d0d7de;border-radius:6px;padding:2px 16px;margin:8px 0">`.
- Strip the bare ``` fences VS Code wraps around edit previews so `> 📄 Edited ...` renders clean.
- Redact `authorization: bearer`, api-key/token/password/client-secret assignments in embedded text.
- Keep the emoji legend meanings stable (spec section 6.1) and include the `> [!TIP]` visual guide at
  the top of the transcript.

## CLI contract (spec section 7)

Support: current session (via `VSCODE_TARGET_SESSION_LOG`), explicit `<sessionId>`, explicit
`chatSessions/<id>.jsonl` path, optional output path, and `--list`. Print a one-line
`Turns/tool calls/reasoning thoughts/resources` summary plus the `Output:` path. The source argument
must be a session id or a `chatSessions` journal path - reject/avoid `transcripts/*.jsonl` (different
schema, yields 0 turns).

## Repo conventions

- ESM (`import ...`), always-semicolons, short-circuit (`&&`) guard calls, if-bodies on their own
  line, plain hyphens (no em/en dashes) in comments and strings.
- Add `"ai:export:chat": "node ./tools/copilot-chat-exporter/src/cli.ts"` to the host `package.json`,
  and register the tool with `"workspaces": ["tools/*"]`.

## Definition of done (self-verify - spec section 8)

1. `npm run typecheck -w copilot-chat-exporter` reports zero; no editor errors.
2. Regenerate a rich baseline by **session id** (not a transcripts path):
   `npm run ai:export:chat -- <sessionId> docs/chat-exports/<name>.md`.
3. Counts are non-zero and reasonable (turns, tool calls, reasoning, resources).
4. Structural checks pass on the output: `<details>` balanced (ignoring copies inside fenced code),
   no orphan ``` above `> 📄 Edited`, no-output tools are plain lines, every `💳` credit is 2dp,
   friendly model names, bordered md boxes present, all 12 sections in order.
5. Eyeball one turn in the VS Code Markdown preview: badge + timestamp render, tools interleave in
   chat order, filenames present, edits are clean blockquotes, md artifact shows a border.

Report the output path and the summary line when done.
