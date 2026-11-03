# AGENTS.md - copilot-chat-exporter

Project mode: prototype

This is the single project instruction file for all agents and harnesses. `.github/copilot-instructions.md` only points here. Personal working preferences (collaboration, asking, evidence, git safety, time format) live in the user-level instructions and still apply.


### Project memory and work tracking

Read in this order: the [handbook](work-items/README.md) (statuses, tags, rules), the **Start here** section of the [work-log.md](work-log.md) dashboard, then the topic in `work-items/` for the item you work on. Skip `work-log-archive.md` unless a link sends you there.

For this project the dashboard's Do now table is the handoff for a new chat. Don't add a kickoff prompt to it; put 'what next' notes in your reply.

- **Inbox:** put each new idea, bug, question or research topic in the dashboard Inbox as one line: `YYMMDD [tag] text (from: you|agent)`. Tags: `[idea]` `[research]` `[build]` `[question]`. Append only, and reread before you add. At session start, say what to do with each line: make a row, drop it, or keep it.
- **Capture check:** after a prompt that produced something worth keeping (an idea, finding, decision or status change), update the Inbox, the dashboard row or the topic. Skip the update for plain Q&A. End every reply, including plain Q&A, with `Tracking: updated WI-NNN (what)` or `Tracking: no change`, just above the `Evidence:` line. The line also shows that this file loaded.
- **Completion check:** before reporting completion, run the handbook's [Completion check](work-items/README.md#completion-check). Tracking is part of finishing the task. If tracking can't be updated, report the task as incomplete and explain why.
- Closing an item needs the dev's confirmation. See the handbook. Finishing the work you were asked to do is not closing. Set it Waiting for the dev's acceptance, say what to check, and ask.
- **Rabbit holes:** new work found while working on an item becomes a child WI with exactly one `Part of` parent and its `Do after` items. Add it to the parent's Work tree and refresh the tree's progress line.
- Don't log routine actions, test totals or transcripts. Reread an entry before you edit it, and keep other chats' changes.

## Goal

Capture every Copilot chat session, wherever it lives (VS Code Local journals, Agent Host, Copilot CLI), and export each one as a rich, near-lossless Markdown review artifact. A reader should be able to replay how and why something was done. The most important content is readable reasoning (chain of thought), AI messages, tool calls with inputs and outputs, file changes, models, usage, and timing. HTML export is a later phase. See README "Project goal" and [docs/SPEC.md](docs/SPEC.md) "Project goal and scope".

- **Out of scope:** Claude and Codex provider chats.
- **Not exported (noise):** permission prompts, hooks, snapshot noise, and binary data that can't render inline. Every omission is counted and reported.

## Project rules

- Never delete or modify session data. `chatSessions/`, `~/.copilot/session-state/`, and `~/.copilot/session-store.db` are read-only.
- [vsc-chat-tool](../vsc-chat-tool) is a read-only sister project for reference.
- Never add a `Co-authored-by` trailer. As a backstop, `.githooks/commit-msg` (enabled through `core.hooksPath`) strips Copilot co-author trailers.
- Save review reports, runtime captures, and logs under `temp-tool-output/`, in timestamped run folders, and keep earlier outputs. For listing runs, pass `--html-output` explicitly. Don't change the CLI's default working-directory behavior. Automated test folders keep their own cleanup.
- Keep changes focused. Don't reformat unrelated code or docs.
- Follow [code-style](.github/instructions/code-style.instructions.md) for TypeScript and JavaScript, and [writing-style](.github/instructions/writing-style.instructions.md) for all prose, including chat. The writing-style replacement table covers banned vague terms such as "shape" and "surface".
- **Instruction loading:** new agent chats can keep old instruction text until you fully quit VS Code (all windows). We observed this on 261023. Agent and Local chats both read `~/.copilot/copilot-instructions.md`. Local chats also read the VS Code profile `prompts` folder and send identical text once. To see what a chat actually loaded, read the first `system.message` in `~/.copilot/session-state/<id>/events.jsonl` instead of asking the model.

## Runtime and package boundaries

- Requires Node.js 22.18 or newer (dev pin: Node 24.18 in `.node-version`). Use the pnpm version pinned in `package.json`. Source TypeScript runs directly through Node type stripping.
- ESM with strict TypeScript: `moduleResolution: "nodenext"`, `verbatimModuleSyntax`, `isolatedModules`, `erasableSyntaxOnly`. Keep the `.ts` extensions in imports.
- Zero runtime dependencies unless a dependency has a clear, reviewed benefit over Node built-ins.
- `src/cli.ts` is the only module that prints output or exits the process. Library modules stay callable in-process.
- `dist/` is generated. Change the source and run `pnpm run build`; never hand-edit bundles or declarations.

## Source of truth

- **Local chats:** `chatSessions/<sessionId>.jsonl` decides conversation order, prompts, reasoning, tool calls, assistant text, edits, and per-turn metadata. Sibling stores (transcripts, resources, debug logs, title indexes) only enrich. They never create or reorder turns, and their absence never blocks an export. Match them to the journal by stable ids such as `toolCallId`.
- **Agent chats (Agent Host, Copilot CLI):** `~/.copilot/session-state/<id>/events.jsonl` is the source. Sub-agents render inline in the parent chat, and the sub-agent prompt is always kept whole.
- VS Code's storage format is private and changes. Parse records into project-owned types when you first read them. Keep unknown payloads when practical, and report unhandled variants through the schema census instead of dropping them silently.
- Keep response-stream order. Don't group tool calls, reasoning, edits, or text by type. Deduplicate repeated tool lifecycle records by id, merging later status and results into the first position.
- Never rebuild missing history from the current working tree. Label missing evidence.
- Rendering is deterministic. Values that vary by run or machine (clock, output path, Git status) enter through the renderer context.
- Apply redaction to newly rendered raw content, including companion files.
- **Long text isn't clipped.** Text over 300 lines AND over 15 KiB shows its first 10 lines inline and links a companion file named by content hash (`src/export-policy.ts`, `src/markdown.ts`). Library callers without an overflow sink keep the full text inline. Persisted resources over 96 KiB are still clipped; see [WI-006](work-items/WI-006-persisted-resource-clipping.md).

## Usage and credits

The rules are in SPEC [Agent usage and credits](docs/SPEC.md#agent-usage-and-credits-approved-october-14). The traps that cause wrong numbers:

- Credits = nano-AIU / 1e9. Local `copilotCredits` is a different, unverified unit, so never mix the two.
- Checkpoint and shutdown totals are cumulative, so never add them across resumes.
- Forks and copies duplicate history, so a cross-chat total would double-count.

## Project map

| Path | Responsibility |
| --- | --- |
| `src/cli.ts`, `src/sdk-cli.ts`, `src/args.ts` | CLI entry, agent-chat commands, argument parsing |
| `src/index.ts` | Public library entry: load, render, serialize |
| `src/markdown.ts`, `src/export-policy.ts` | Markdown rendering, companion and size rules |
| `src/session/journal.ts`, `classify.ts`, `enrich.ts` | Local journal replay, node classification, enrichment |
| `src/session/sdk-*.ts` | Agent chat events, export, and usage |
| `src/session/listing*.ts`, `detailed-*.ts` | Console listing and the HTML listing reports |
| `src/verify/` | Structural, journal, and rendered-output checks. Layer D text checks vary by category. Details and limits: [WI-021](work-items/WI-021-source-aware-verification.md) and [SPEC 9.1](docs/SPEC.md#91-audit-architecture-independence-model). It doesn't check persisted resource bodies (see [WI-006](work-items/WI-006-persisted-resource-clipping.md)). |
| `src/types.ts` | Exporter-owned parsed model and shared types |
| `test/fixtures/golden/` | Portable committed fixture and expected output |
| `test/baseline/` | Machine-local large fixture, ignored by Git |
| `docs/SPEC.md` | Behavior and output rules (the reference) |
| `docs/CHAT-SESSION-SCHEMA.md`, `docs/UPGRADING.md` | Storage format, and how to adapt to VS Code changes |
| `docs/HTML-REPORT-DESIGN.md` | Listing report design guide |

## Commands

| Command | Use |
| --- | --- |
| `pnpm install` | Install dependencies. Uses `pnpm-lock.yaml`. Don't use npm. |
| `pnpm test` | Full test suite. Don't use `node --test test/`. |
| `pnpm run verify` | Generated-file check, both typechecks, tests, golden check. Run it before finishing. |
| `pnpm run build` | Rebuild `dist/` |
| `pnpm run verify:local` | `verify` plus the machine-local baseline (optional) |
| `pnpm run golden:update` | Only for an intentional, reviewed rendering or contract change |
| `pnpm run list --user-data-root <dir> --html-output <file>` | Session listing. Don't add `--`: pnpm passes it on and the CLI rejects it. |
| `node src/cli.ts <id or 8-char prefix>` | Export one chat |
| `node src/cli.ts --verify <id> <absolute-file>` | Layer D content check. The output path must be absolute. |

- Run the narrowest relevant test right after the first real edit, then `pnpm run verify`.
- Write inline probes as `temp-tool-output\*.mts` that import `../src/...`.
- Working copies are CRLF while `.gitattributes` pins LF, so Git's CRLF warnings are harmless. Use the `edit` tool for multi-line changes.

## Keep docs in sync

| Change | Update |
| --- | --- |
| Behavior or rendered Markdown | `docs/SPEC.md` |
| Storage evidence, parsing, enrichment | `docs/CHAT-SESSION-SCHEMA.md` |
| Compatibility or migration steps | `docs/UPGRADING.md` |
| Commands, flags, requirements, package behavior | `README.md` |
| Listing report layout or conventions | `docs/HTML-REPORT-DESIGN.md` |
| Notable user-visible changes | `CHANGELOG.md` |
| Decisions, findings, status | `work-log.md` dashboard and `work-items/` topics, per the handbook |
