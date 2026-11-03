---
name: exporter-status
description: "Read-only copilot-chat-exporter status and prioritized todo table from the work-log dashboard and Git: done, waiting on me, next items with priority, effort (LOE), dependencies, quick wins, and risks."
argument-hint: "Optional: work item or area to focus on"
agent: agent
---

Give me a status update and a prioritized todo table for this project. **This is read-only.** Don't edit, stage, commit, push, delete, build, export, or start any item. Read-only commands such as `git status` and `git log` are fine.

Assume I've been away for days and don't remember the details. Every item must make sense on its own: name the work item (for example "WI-006 Persisted-resource clipping") and explain it in plain words. No bare numbers or legacy labels without an explanation.

## Gather

1. Read [work-log.md](../../work-log.md) (the dashboard owns status, priority, and next action), [work-items/README.md](../../work-items/README.md), and linked topics as needed. Read [AGENTS.md](../../AGENTS.md) for project rules.
2. Check Git: branch, `git status --short`, `git log origin/main..HEAD --oneline`, and recent commits. Classify each uncommitted path as mine, the user's customization, another session's, generated, line-ending only, or unexplained.
3. Report what was last validated (`pnpm run verify` count, build, built-CLI tests, corpus run) and on which commit. Never imply a check ran on a later commit than it did. Corpus figures must come from a recorded corpus report; give the stable source hash alongside any S-number.
4. If the work log and Git disagree, report the conflict instead of picking one. Priorities in the dashboard are proposals until I approve them.

## Output

Lead with a two- or three-sentence summary: where things stand and the single most useful next step.

**Status**

| Area | State | Evidence |
| --- | --- | --- |

**Waiting on me**: decisions or approvals I owe, each with options and your recommendation.

**Next items**

| # | Work item (plain words) | Why it matters | Priority | Effort (LOE) | Depends on | Quick win | Risk if skipped or done wrong |
| --- | --- | --- | --- | --- | --- | --- | --- |

- Priority: High, Medium, or Low, with a one-line reason.
- Effort: an hour range with your confidence.
- Order rows by what you'd do first, and say why under the table.
- Flag rabbit holes, low-value items, and items you'd drop or defer.

**Risks and open questions**: anything stale, contradictory, unverified, or easy to break.

Cite the file, line, or command behind each claim. Label guesses. Unknown is never zero. Don't print private session content. Follow [writing-style.instructions.md](../instructions/writing-style.instructions.md).

${input:focus:Optional: work item or area to focus on}
