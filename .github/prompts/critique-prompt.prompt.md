---
name: critique-prompt
description: "Critically review my draft prompt or plan before anything runs. Use when I'm unsure about an ask, working with unfamiliar tech, or want devil's advocate, pros and cons, repercussions, simpler alternatives, and a revised prompt."
argument-hint: "Paste the draft prompt or plan to review"
agent: agent
---

Review the draft below critically. **Don't execute any of it.** This is a review only: read files, docs, and Git state as needed, but don't edit, stage, commit, push, delete, install, or run builds or tests.

Assume I may not know this technology well, so my ask can have consequences I can't see. Your job is to make those visible before I commit to them. Disagree with me when the evidence supports it. Flag rabbit holes and low-value work, even when I asked for it.

## Review steps

1. Read the context the draft depends on: project instructions, the files or docs it names, and earlier decisions in this chat or the project's work log. Check whether any claim in the draft is outdated or wrong.
2. Restate what you think I'm trying to achieve, in one or two sentences. If the draft's steps don't serve that goal, say so.
3. Review each item, numbered to match my draft:
   - What it actually does, in plain words. Explain any term I might not know.
   - Pros and cons.
   - Repercussions: what changes for users, data, other code, cost, time, or later work. Call out anything hard to undo, such as deletions, history rewrites, pushes, data migrations, or privacy exposure.
   - Devil's advocate: the strongest case against doing it, or against doing it this way.
   - Simpler or cheaper alternative, if one exists.
4. Check the draft as a whole for:
   - Ambiguous wording that two agents could read differently.
   - Contradictions with each other, with earlier decisions, or with project rules.
   - Missing acceptance criteria: how will we know each item is done and correct?
   - Missing order or dependencies between items.
   - Checks that need fixed inputs to mean anything (before/after comparisons, timing, counts).
   - Scope creep, or too many items for one pass. Long numbered prompts get items skipped; suggest a split.
   - Steps that should be read-only reports before any change.
5. Give a rough effort estimate per item (hours, with your confidence) and flag quick wins.

## Output

Lead with the verdict, then the details. Use tables where items repeat the same fields.

1. **Verdict**: go, go with changes, or rethink. One or two sentences on why.
2. **Biggest risks**: the top three, most serious first.
3. **Item review**: one table row per draft item: item, plain meaning, pros, cons, repercussions, devil's advocate, alternative, effort.
4. **Gaps and contradictions**: bullets.
5. **Questions for me**: only questions whose answer would change the plan, each with options and your recommendation.
6. **Revised prompt**: a ready-to-send version with the fixes applied, in a fenced block. Keep my numbering where it still fits, and mark what you changed.

Cite evidence (file, doc link, or command output) for factual claims, and label anything you inferred. If you couldn't check something, say so.

Follow the workspace writing-style instructions if they exist.

## Draft to review

${input:draft:Paste the draft prompt or plan}
