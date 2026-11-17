# WI-061 End-of-turn writing-style review

## At a glance

- **Goal:** Assess an end-of-turn writing-style review for VS Code Copilot chats.
- **Scope:** Local and Agent Host chats, not Git hooks or CI.
- **Proposal:** Track files changed during a prompt, then check their user-facing text when the turn ends.
- **Reviewer:** Call a configured low-cost model only when eligible text changed.
- **Review modes:** Let the script write suggestions, or ask the main agent to apply them through its edit tools.
- **Boundary:** This topic records a proposal. It does not approve implementation.
- **Next:** The developer approves phase 1 of the 261116 plan in Notes. Phase 0 passed.
- **Source:** The 261116 chat discussion and its private export are linked below.

## Original goal

Review the user-facing text changed during each Copilot chat turn. Use a configured low-cost model and the project's writing rules. Skip the review when a turn changed no eligible prose.

The workflow should work in VS Code Local and Agent Host chats. It is not a Git or CI check.

### Intended workflow

The developer described this sequence on 261116:

1. Open a new or existing chat session.
2. Send the agent a prompt.
3. The agent changes and saves files of any type, such as md, ts, js, json, html, tsx or css.
4. Before the turn ends, an enforce-writing-style hook checks every file changed in that turn. If none hold user-facing text, such as Markdown or comments, the hook does nothing. Otherwise it calls a configured low-cost model, such as Haiku or Luna.
5. A setting picks what happens to the suggested fixes:
   - **Auto-save:** write the fixes on top of the agent's changes.
   - **Ask:** show the fixes in the native VS Code Copilot changed-files UI for review.

### How each step maps to hooks

| Step | Feasible? | Approach | Evidence |
| --- | --- | --- | --- |
| 1-2 | ✅ | Nothing to build. | - |
| 3. Find changed files | ⚠️ Extra work | A prompt-start hook saves file hashes per session. The end hook compares them. This also catches terminal edits. | From past chat, 261116 |
| 4. Filter and review | ✅ | Skip turns with no eligible text. Send only changed passages and the writing rules to the reviewer. | From past chat, 261116 |
| 5. Auto-save | ✅ but ⚠️ | The script writes fixes. They likely won't show **Keep** or **Undo**, because VS Code tracks only agent edit-tool changes. | Inferred from docs, untested |
| 5. Ask | ✅ Indirectly | The end hook blocks the stop and sends the fixes to the main agent. The agent applies them with its edit tools, so they show **Keep** and **Undo**. Edits are saved before you review them, and the extra turn uses the main model. | Inferred from docs, untested |

## Done when

- The developer chooses whether to prototype and names the starting harness and review mode.
- A prototype detects turn-level changes, skips turns without eligible prose and guards against repeated hook calls.
- The chosen review mode is tested for meaning changes, latency, cost and VS Code's edit review behavior.
- Any Local and Agent Host differences are tested separately before claiming support for both.

## Current understanding

| Evidence | Finding |
| --- | --- |
| From past chat, 261116 | A prompt-start hook can record a file snapshot. A turn-end script can compare file hashes and select changed files. |
| From past chat, 261116 | A separate model can review changed Markdown and comments. The first prototype should likely limit itself to Markdown. |
| From past chat, 261116 | The Copilot `agentStop` hook receives a transcript path, not the final reply text. It can block the stop and send a reason back to the main agent. |
| From past chat, 261116 | Repeated blocking is limited to eight consecutive turns. The hook should also skip a turn already continued by a hook. |
| From past chat, 261116 | A script can write fixes, but those edits likely won't appear in VS Code's native Keep/Undo list. This was inferred from the edit-review documentation, not tested. |
| From past chat, 261116 | A blocking end hook can ask the main agent to apply fixes with its edit tools. That may show them in Keep/Undo, but it does not show a preview before the agent applies them. |
| From past chat, 261116 | The Local and Agent Host hooks use different event names and payloads. Local hooks are deprecated, with removal planned for February 2027. |
| From past chat, 261116 | Copilot CLI 1.0.105 was available for a separate reviewer. Issue [#5306](https://github.com/github/copilot-cli/issues/5306) reports that an empty available-tools value exposed tools. Tool restrictions and hook recursion need real tests. |
| Unknown | Whether Local and Agent Host both honor the blocking workflow, whether the edits enter the native review list, and how long or costly a review takes. |

## Decisions and tradeoffs

- Prefer a file snapshot at prompt submission. Tool-call tracking may miss edits made by terminal commands.
- Start with Markdown. Extracting comments and UI strings from code needs separate rules.
- Use a recursion guard and stop retrying after the hook has already continued the turn.
- Give each session its own snapshot. Otherwise two chats in one workspace could compare against the wrong baseline.
- A script-written result is faster to apply but bypasses native edit review.
- Asking the main agent to apply changes uses another main-model turn. It can expose edits through the native review UI.
- Hooks cannot show a custom approval dialog before changes. A VS Code extension may be needed for that workflow.
- Treat reviewer failures and timeouts as errors. Do not report them as a successful review.
- Test file contents as untrusted input. They may contain instructions that try to steer the reviewer.
- Do not enable automatic fixes until tests show they keep technical meaning.

## Findings and outcomes

The idea is feasible enough for a bounded prototype, but the native approval flow is indirect. The reviewer can suggest changes. The main agent must apply them for VS Code to track them as agent edits.

The Inbox idea was filed here on 261116. No hook or reviewer script was created.

## References

- [Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)
- [VS Code hooks](https://code.visualstudio.com/docs/agent-customization/hooks)
- [Local hooks reference](https://code.visualstudio.com/docs/agents/reference/hooks-reference)
- [Migrate from Local customizations](https://code.visualstudio.com/docs/agent-customization/migrate-customizations)
- [Review agent edits in VS Code](https://code.visualstudio.com/docs/agents/run/review-code-edits)
- [Copilot CLI issue about available tools](https://github.com/github/copilot-cli/issues/5306)
- [Writing-style rules](../.github/instructions/writing-style.instructions.md)
- [Writing-style reference](../.github/instructions/writing-style-reference.md)
- [Chat export](../temp-tool-output/261116-1750-writing-style-hook-chat/writing-style-hook-discussion.verify-failed.md) - Layer D verification failed. Treat it as a reference, not a complete verified archive.
- [Chat export folder](../temp-tool-output/261116-1750-writing-style-hook-chat/) - includes linked companion files and the verification log.

## Notes

### 261116 - Feasibility discussion and chat export

The export covers the current 20-turn Agent Host chat, including earlier writing-style questions. It contains the turn-by-turn discussion and tool records.

Layer D found nine partial system-prompt records and three missing skill-file records. The exporter wrote the archive and companion files, but verification failed. The private source copy remains in the exporter's cache.

### 261116 - Draft implementation plan (not approved)

The script is a writing helper, not an enforcer. The developer named it `apply-writing-style`.

Decisions on 261116:

| Topic | Decision |
| --- | --- |
| Phasing | Build phases 0-2 first. The script writes suggestions only and never edits source files. |
| Location | `scripts/apply-writing-style.mjs` in this repo. Move it later if it proves useful. |
| Reviewer call | Use one adapter. Test Copilot CLI first and fall back only if the spike fails. The model must be configurable. |
| Name | `apply-writing-style` |

| Phase | Work | Effort |
| --- | --- | --- |
| 0. Spike | Prove a no-tools reviewer call with a cheap model, and that the child call doesn't trigger the hook again. | S |
| 1. Standalone script | Take Markdown files and their earlier text. Rewrite only changed paragraphs. Write suggestions and a report under `temp-tool-output/`. Never edit the source. | M |
| 2. Quality check | Run it on about 10 real diffs, including the `agent-fusion-golden-readme` README diff. Count meaning changes and rejected paragraphs. Record cost and time per paragraph. Phase 3 starts only after the dev reviews these results. | S-M |
| 3. Hook wiring | Agent Host first. A prompt-start hook saves a per-session snapshot. The stop hook runs the script and, in ask mode, sends the suggestions to the main agent. | M |
| 4. Later | Auto-save mode, Local hooks, code comments. | - |

Inputs:

- The core writing rules and selected reference sections.
- Changed paragraphs with their earlier text.
- `check-prose` warnings as hints.
- Protected terms and a config with model, mode, file globs and limits. A `--model` flag overrides the config.

`--model` accepts short names. Examples: `luna`, `gpt6-luna`, `haiku`, `haiku-5.5` and `claude-haiku-5.5`. The script resolves a short name against the CLI's list of available models:

- It compares names without case, dashes or vendor prefixes such as `claude-` and `gpt-`.
- A family name such as `haiku` picks the newest version.
- A name that matches more than one family, such as `5.5`, stops with an error that lists the matches.
- The report records the full model id that ran.

Phase 0 must find how the CLI lists its available models. If it can't, the script uses a model list from the config.

### 261116 - Phase 0 spike results

The spike ran in `temp-tool-output/261116-1840-apply-writing-style-spike/`. It made three paid calls for about 0.9 credits in total. Each call rewrote one test paragraph.

| Check | Result | Evidence |
| --- | --- | --- |
| Sign-in | ⚠️ The standalone CLI needed a one-time `/login`. VS Code's sign-in doesn't carry over. | Observed here |
| Model list | ✅ There's no CLI command, but `~/.copilot/data.db` caches 18 models in `app_state` key `copilot-available-models-v2`. That's a private store, so keep the config fallback. The same database holds access tokens, so read only that key. | Observed here |
| Credit cap | ℹ️ `--max-ai-credits` accepts 30 or more. | Observed here |
| No tools | ✅ With `--available-tools=none_placeholder`, the logs show no tool events. Haiku 4.5 invented tool output in its reply. The script must accept only the `<rewrite>` block. | Observed here |
| Prompt injection | ✅ `gpt-6-luna` and `claude-haiku-5.5` ignored an instruction hidden in the text. | Observed here, one sample each |
| Meaning | ✅ Both kept `likely`, the code span and the `[[P0]]` placeholder. Both kept "in order to", because the test prompt held only five rules. | Observed here, one sample each |
| Cost and time | `gpt-6-luna`: 10.3 s, 0.07 credits. `claude-haiku-5.5`: 6.8 s, 0.09 credits. The first Haiku 4.5 call cost 0.72 credits. | Observed here, single runs |
| Repo context | ✅ A working folder outside the repo gave no Git root or repo hooks. Inside the repo, the child picked up the repo's Git context. | Observed here |
| User hooks | ⚠️ User-level `sessionStart` and `agentStop` hooks still ran in the child. The `agentStop` input has `stop_hook_active` and `stopReason`. Phase 3 needs an env-var guard such as `APPLY_WRITING_STYLE_CHILD=1`. | Observed here. Env inheritance by hooks is untested. |
| Side effect | ⚠️ Each child call adds a session under `~/.copilot/session-state/`. These may appear in session lists. | Observed here |

Phase 0 outcome: the reviewer call works. Phase 1 can start once approved.

Each rewrite must pass these checks, or the script drops it:

- Masked code, links and identifiers come back unchanged.
- Headings and numbers match.
- `check-prose` warnings don't increase.
