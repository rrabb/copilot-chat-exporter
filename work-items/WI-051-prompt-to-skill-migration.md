# WI-051 Prompt-to-skill migration

## At a glance

- **Goal:** move this repo's exporter review/status slash commands from `.prompt.md` files to skills, because VS Code is deprecating prompt files.
- **Done:** `exporter-status` and `exporter-critique-prompt` are now manual skills. The old prompts moved to an ignored backup. Static checks and `pnpm run verify` passed.
- **Kept as is (your choice):** generic repo prompts `status` and `critique-prompt`. Packaged `export-chat` prompt and installer.
- **Personal skills:** `status` and `critique-prompt` under `~/.copilot/skills` got clearer input text. Pre-edit copies are in [docs/notes](../docs/notes/).
- **Next:** fully quit VS Code, then test both commands in fresh Local and Copilot chats. Then you accept or reopen.

## Original goal

From Inbox 261110. Decide whether this repo's prompts should become skills, list pros, cons and side effects, then migrate the approved subset without changing behavior.

## Done when

- ✅ Both exporter commands exist as skills with the same name, description and argument hint.
- ✅ Both are manual only (`disable-model-invocation: true`).
- ✅ Workflow text matches the old prompt, except approved link and input changes.
- ✅ All relative links resolve (8 links).
- ✅ Old exporter prompts are no longer in `.github/prompts`, and a copy is kept.
- ✅ `pnpm run verify` passes.
- ⬜ Fresh Local and Copilot chats run both commands as expected.
- ⬜ You accept the result.

## Current understanding

### Deprecation status

| Fact | Evidence |
| --- | --- |
| Installed VS Code is 1.145.2 (commit `c4453f8`) | Observed here |
| Latest vscode-docs source (261111) says prompt files run in Local sessions, Local is deprecated and scheduled for removal by February 2027, and existing prompts should become skills | Documented ([prompt-files.md source](https://github.com/microsoft/vscode-docs/blob/main/docs/agent-customization/prompt-files.md)) |
| The published docs site still showed older wording at check time | Observed here |
| Prompts still work in installed 1.145.2 Local chats. Deprecation is a direction, not a removal yet | Observed here |
| Native Copilot (Agent Host, CLI) doesn't load `.prompt.md` workflows. It loads skills | Observed here (earlier sessions) |
| Microsoft's converter adds `disable-model-invocation: true`, maps name, description and argument hint, and drops `agent`, `model` and `tools` | Documented ([migrate customizations](https://code.visualstudio.com/docs/agent-customization/migrate-customizations#_convert-prompt-files-to-skills)) |

### Prompt inventory at start

| File | Kind | Decision |
| --- | --- | --- |
| `.github/prompts/exporter-status.prompt.md` | Project-specific | ✅ Migrated |
| `.github/prompts/exporter-critique-prompt.prompt.md` | Project-specific | ✅ Migrated |
| `.github/prompts/status.prompt.md` | Generic, untracked | ⏸️ Kept unchanged |
| `.github/prompts/critique-prompt.prompt.md` | Generic, untracked | ⏸️ Kept unchanged |
| `skill/export-chat.prompt.md` | Packaged with the installer | ❌ Out of scope. Installer and tests expect both prompt and skill |

### Pros, cons and side effects

| Topic | 👍 Pro | 👎 Con / risk | Effect here |
| --- | --- | --- | --- |
| Future support | Skills are the supported path. Prompts go away with Local | None | Commands keep working after Local is removed |
| Harness reach | Skills load in Local and native Copilot | Native Copilot behavior was not live-tested | Needs fresh-chat check |
| Auto invocation | Skills can load on their own when the description matches | A status or critique run could start without you asking | Set `disable-model-invocation: true` |
| `agent`, `model`, `tools` fields | - | Skills drop these. The command runs in whatever agent and model the chat uses | Old prompts didn't rely on them in a way that mattered (inferred) |
| Read-only rule | - | Prose "read-only" isn't tool isolation. It was never enforced in the prompt either | No change in safety |
| `${input:...}` variables | Plain text instructions work in every harness | Skills don't define prompt input variables | Replaced with "use text after the command, else ..." |
| Folder depth | - | Skills sit one folder deeper, so relative links break | Root links now `../../../`, writing-style links `../../instructions/` |
| Same-name copies | - | A prompt and a skill with one name can both show up, and the prompt wins in Local | Old exporter prompts moved out |
| Copies drift | - | Repo prompt, repo skill and personal skill don't sync | Generic repo prompts and personal skills now differ in input text |
| Packaged export | - | Moving it changes installer output and tests. Moving text can't add Agent Host `--current` support | Left alone |

### Which copy runs when names match

Source: VS Code 1.145.2 [`promptsServiceImpl.ts`](https://github.com/microsoft/vscode/blob/1.145.2/src/vs/workbench/contrib/chat/common/promptSyntax/service/promptsServiceImpl.ts). A downloaded copy matched the tag after normalizing line endings. Evidence: inferred from source, not exercised in the UI.

| Lines | What the code does |
| --- | --- |
| ~397-411 | Lists user (profile) prompts before workspace prompts |
| 575-588 | Puts prompt files before skills in slash discovery |
| 618-635 | Deduplicates same-name skills by priority. Doesn't deduplicate prompts against skills |
| 701-713 | Name lookup takes the first eligible match, filtered by session type |
| 1493-1512 | Skill priority: workspace, personal, plugin, extension API, extension contribution |

| Collision (Local, typed name) | Winner |
| --- | --- |
| Profile prompt vs workspace prompt | Profile prompt |
| Prompt vs skill | Prompt |
| Workspace skill vs personal skill | Workspace skill |

- ⚠️ "Workspace always wins" is wrong. It holds for skills only.
- ⚠️ Native Copilot duplicate-skill priority is unknown.
- The default VS Code profile prompt folder had 0 `.prompt.md` files at check time (observed here). The generic duplicates live as personal skills in `~/.copilot/skills`.

## Decisions and tradeoffs

| # | Decision | Rejected option | Why |
| --- | --- | --- | --- |
| 1 | Migrate the 2 exporter prompts only | Migrate all 5 | Generic and packaged ones carry extra risk or other owners |
| 2 | Keep names, keep manual invocation | Rename, or allow auto invocation | No surprise runs, no muscle-memory change |
| 3 | Don't merge generic and exporter workflows | Merge while migrating | One change at a time keeps the diff checkable |
| 4 | Replace `${input:...}` with plain instructions | Keep the variable syntax | Skills don't define it |
| 5 | Keep generic repo prompts unchanged | Move or delete them | Your choice. Revisit when Local is removed |
| 6 | Back up personal skills to `docs/notes` before editing them | Edit with no copy | `~/.copilot/skills` isn't under Git |
| 7 | Move old exporter prompts to an ignored backup, not delete | Leave both active | A same-name prompt would beat the skill in Local |

## Findings and outcomes

- The first move patch had empty hunks and failed with no changes. A context-only patch worked.
- `get-session-info` and `codebase-memory` personal skills weren't edited by this work, so they have no backup here.

### Backups

| Original | Copy | In Git? |
| --- | --- | --- |
| `~/.copilot/skills/status/SKILL.md` (before edit) | [status.SKILL.bkup.md](../docs/notes/status.SKILL.bkup.md) | In this repo as a one-time snapshot |
| `~/.copilot/skills/critique-prompt/SKILL.md` (before edit) | [critique-prompt.SKILL.bkup.md](../docs/notes/critique-prompt.SKILL.bkup.md) | In this repo as a one-time snapshot |
| `.github/prompts/exporter-status.prompt.md` | `temp-tool-output/261110-1731-prompt-migration/` | Ignored copy. Also in Git history (last commit `c8cdae1`) |
| `.github/prompts/exporter-critique-prompt.prompt.md` | Same folder | Same |

## References

- [exporter-status skill](../.github/skills/exporter-status/SKILL.md), [exporter-critique-prompt skill](../.github/skills/exporter-critique-prompt/SKILL.md)
- Migration run: `temp-tool-output/261110-1731-prompt-migration/` (`validate.mjs --complete`, `verify.log`)
- Pinned source copy: `temp-tool-output/261110-1700-prompt-collision/promptsServiceImpl-1.145.2.ts`
- [Agent skills docs](https://code.visualstudio.com/docs/agent-customization/agent-skills)
- Installer pairing: [src/install.ts](../src/install.ts), [test/install.test.ts](../test/install.test.ts). Current-session lookup: [src/session/locate.ts](../src/session/locate.ts)
