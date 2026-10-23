# Work-tracking handbook

How to keep the [dashboard](../work-log.md) and topic files useful. The dashboard says what to do. Topics remember why.

## Start a session

1. Read **Start here** on the dashboard: Do now, Decisions you owe, Inbox, In flight.
2. Triage the Inbox. For each line, propose one of: make a WI row, drop it with a reason, or keep it. If the Inbox passes about 15 lines, say so once.
3. Open the topic for the item you work on. Read **At a glance** first. Read the rest only when you need it.
4. Skip `work-log-archive.md` unless a link sends you there.

## Who owns what

| Fact | Owner |
| --- | --- |
| Status, priority, who, size, do after, next action | Dashboard row |
| Ideas not yet triaged | Dashboard Inbox |
| Dropped and rejected ideas, with reasons | Dashboard closed lookup |
| Goal, done when, work tree, findings, decisions, evidence, notes | Topic |
| Current product behavior | README and SPEC |
| Old chronology | Archive and pinned old log |

Link to the owner. Don't copy. Topics never state status.

## Statuses and priority

| Icon | Status | Meaning |
| --- | --- | --- |
| 🔜 | Next | Chosen to do soon. Has a tagged next action |
| 🔨 | Active | Work is underway |
| 📋 | Backlog | Worth doing, not chosen yet |
| ⏳ | Waiting | Blocked on a named thing ("waits for ...") |
| 💤 | Deferred | Paused until a named trigger |
| ✅ | Done | Done-when criteria met |
| ❌ | Dropped | Decided against |
| ↪️ | Superseded | Another item replaced it |

**Next means chosen to do soon. It does not approve implementation or Git actions.** Keep Next short (1-5) and ordered.

Priority is High, Medium or Low, shown after the status. "Quick win" is an optional marker.

## Tags, who and size

| Tag | Use for |
| --- | --- |
| `[idea]` | A possible feature or change |
| `[research]` | Find something out, test, measure, compare |
| `[build]` | Change code or docs |
| `[question]` | Needs a decision or answer from the dev |

The same tags prefix every Next action. **Who** is you (the dev), agent or both. **Size:** S under half a day, M about a day, L several days. The agent proposes who and size; the dev confirms.

## Inbox

One line per idea, newest at the bottom:

`261023 [idea] Show the auto-resolved model in listings (from: agent)`

- No ID, status or priority. Append only.
- Reread the Inbox right before you add a line. Two agents sometimes run at once.
- A line leaves the Inbox when triage makes it a WI row, drops it (closed lookup), or answers it.

## Capture check

After any substantive prompt that produced an idea, finding, decision or status change, update tracking. Skip plain Q&A.

| What happened | Where it goes |
| --- | --- |
| New idea, bug, question, research topic | Inbox line |
| Status or next action changed | Dashboard row |
| Finding, decision, rejected approach, evidence limit | Topic |
| Detour resolved part of the goal | Return-to-goal note in the topic |

End such replies with `Tracking: updated WI-NNN (what)` or `Tracking: no change`, on the line just above the `Evidence:` line.

## Rabbit holes

When work on one item turns up new work, make each new piece a **child WI**. Don't grow the parent's row.

| Field | Where | Rule |
| --- | --- | --- |
| Part of | Child topic first line; child row indented under parent | Exactly one parent |
| Do after | Dashboard row and parent work tree | Items that must finish first |
| Related | Dashboard links column | Optional |
| Size, type | Dashboard row and work tree | S/M/L, one tag |

The child topic's first line is: `Part of WI-NNN, found while working on: <parent goal>`.

The parent topic keeps its **Original goal** and a **Work tree**. The tree lists order, link, type, size and do-after. It does not repeat status. Refresh its single progress line whenever a child changes.

Example with made-up IDs:

```text
## Work tree
Progress as of 261023: 1 of 3 done

| # | Item                                      | Type       | Size | Do after |
| 1 | WI-901 Reproduce the cut on synthetic data | [research] | S    | -        |
| 2 | WI-902 Fix excerpt slicing by bytes        | [build]    | M    | WI-901   |
| 3 | WI-903 Ask: preview + companion, or keep?  | [question] | S    | WI-901   |
```

On the dashboard, children sit under the parent with `↳`. When the tree is done, add a return-to-goal note and check the parent's Done when.

## Filing agent output

When the dev decides to act on agent output, file it once:

1. Put the short version (findings, decisions) in the topic's main sections.
2. Put the full text under **Notes** at the bottom: `### 261023 - one-line summary`, newest first.
3. When Notes get long or the item closes, fold them into Current understanding and trim.

Don't paste routine command output, test totals or transcripts.

## Topic layout

| Section | Content |
| --- | --- |
| At a glance | About 15 lines: goal, tree progress, decisions made, next step, work in progress right now. No status words; the dashboard owns status |
| Original goal | The agreed outcome. Change it only by a recorded decision |
| Done when | Checkable criteria |
| Work tree | Parent topics only: the ordered list of child items |
| Current understanding | A synthesis, not a diary. Use evidence labels: documented, inferred from source, observed here, unknown |
| Decisions and tradeoffs | Choices, rejected options, reasons |
| Findings and outcomes | Results, gotchas, return-to-goal notes |
| Resume point | Optional while Active: in-flight state. Delete when it closes |
| References | Links to code, docs, commits, evidence |
| Notes | Filed agent output, dated |

Omit empty sections. No hard size cap; review a topic around 4,000 words. Older topics gain At a glance the next time they are edited.

## Scale the effort

| Kind | Record |
| --- | --- |
| Idea | One Inbox line |
| Task | One dashboard row |
| Research | Topic with evidence labels |
| Done | Outcome plus gotchas in the row or topic |

## Stable rules

- WI IDs are never reused. Gaps are fine (WI-005 and WI-011 are unused). Each row keeps its `wi-NNN` anchor when it moves.
- Dropped ideas get one line with the reason in the closed lookup, so nobody proposes them again.
- Reread an entry before you edit it, and keep other chats' changes. Ask if two edits conflict.
- Keep personal paths, real session IDs and credentials out of tracking files. Missing evidence stays labeled missing.
- The archive is old history. Nothing new goes there. Read it only through links.
