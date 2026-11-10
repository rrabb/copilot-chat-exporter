---
name: status
description: "Read-only status update and prioritized todo table: done, in progress, waiting on me, next items with priority, effort (LOE), dependencies, quick wins, and risks. Use when returning to a project or before choosing what to do next."
argument-hint: "Optional: area or question to focus on"
agent: agent
---

Give me a status update and a prioritized todo table. **This is read-only.** Don't edit, stage, commit, push, delete, build, or start any item. Read-only commands such as `git status` and `git log` are fine.

Assume I've been away for days and don't remember the details. Every item must make sense on its own: no bare item numbers, internal labels, or jargon without a short explanation.

## Gather

1. Read the project's memory and instructions if they exist: `AGENTS.md`, `.github/copilot-instructions.md`, work logs, TODO or backlog files, and this chat's todos.
2. Check Git: current branch, `git status --short`, unpushed commits, and recent commits. Classify each uncommitted path as mine, yours, another session's, generated, or unexplained.
3. Note what was last validated (tests, build, other checks) and on which commit. Never imply a check ran on a later commit than it did.
4. If sources disagree (for example the log says done but Git shows it uncommitted), report the conflict instead of picking one.

## Output

Lead with a two- or three-sentence summary: where things stand and the single most useful next step.

**Status**

| Area | State | Evidence |
| --- | --- | --- |

States: done, in progress, waiting on me, blocked, not started.

**Waiting on me**: decisions or approvals I owe, each with the options and your recommendation.

**Next items**

| # | Item (plain words) | Why it matters | Priority | Effort (LOE) | Depends on | Quick win | Risk if skipped or done wrong |
| --- | --- | --- | --- | --- | --- | --- | --- |

- Priority: High, Medium, or Low, with a one-line reason.
- Effort: an hour range with your confidence (for example "2-4 h, medium confidence").
- Order rows by what you'd do first, and say why in one line under the table.
- Flag items that look like rabbit holes or low value, and items you'd drop.

**Risks and open questions**: anything stale, contradictory, unverified, or easy to break.

Cite the file, line, or command behind each claim. Label guesses. Unknown is never zero.

Follow the workspace writing-style instructions if they exist.

${input:focus:Optional: area or question to focus on}
