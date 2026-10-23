---
name: exporter-critique-prompt
description: "Critically review a draft prompt or plan for copilot-chat-exporter before anything runs: devil's advocate, pros and cons, repercussions, conflicts with project decisions, simpler alternatives, and a revised prompt."
argument-hint: "Paste the draft prompt or plan to review"
agent: agent
---

Review the draft below critically. **Don't execute any of it.** This is a review only: read files, docs, and Git state as needed, but don't edit, stage, commit, push, delete, install, export, or run builds, tests, or corpus runs.

Assume I may not know an area well, so my ask can have consequences I can't see. Make them visible before I commit. Disagree with me when the evidence supports it. Flag rabbit holes and low-value work, even when I asked for it.

## Project context to check first

- [AGENTS.md](../../AGENTS.md), [work-log.md](../../work-log.md) (dashboard and decisions), and [docs/SPEC.md](../../docs/SPEC.md) (behavior contract).
- Does the draft contradict an approved decision, reopen a closed work item, or skip a waiting one?
- Could it touch native session stores, print private session content, or put private values in a public commit or history?
- Does a before/after comparison use frozen copies? Results on live sources aren't comparable.
- Would it change exporter output (golden fixture, SPEC, README, CHANGELOG updates needed) or verifier strictness?
- Does it need a read-only report and my approval before implementation?

## Review steps

1. Restate what you think I'm trying to achieve, in one or two sentences. If the draft's steps don't serve that goal, say so.
2. Review each item, numbered to match my draft:
   - What it actually does, in plain words. Explain any term I might not know.
   - Pros and cons.
   - Repercussions: effects on exports, verification results, users, data, privacy, later work, and anything hard to undo.
   - Devil's advocate: the strongest case against doing it, or against doing it this way.
   - Simpler or cheaper alternative, if one exists.
3. Check the draft as a whole for ambiguity, contradictions, missing acceptance criteria, missing order or dependencies, scope creep, and too many items for one pass (long numbered prompts get items skipped; suggest a split).
4. Give a rough effort estimate per item (hours, with your confidence) and flag quick wins.

## Output

Lead with the verdict, then the details.

1. **Verdict**: go, go with changes, or rethink, with a one- or two-sentence reason.
2. **Biggest risks**: the top three, most serious first.
3. **Item review**: one table row per draft item: item, plain meaning, pros, cons, repercussions, devil's advocate, alternative, effort.
4. **Conflicts with project decisions or rules**: bullets, with the file and line.
5. **Questions for me**: only those whose answer changes the plan, each with options and your recommendation.
6. **Revised prompt**: ready to send, in a fenced block. Keep my numbering where it fits, and mark what you changed.

Cite evidence for factual claims and label inferences. Follow [writing-style.instructions.md](../instructions/writing-style.instructions.md).

## Draft to review

${input:draft:Paste the draft prompt or plan}
