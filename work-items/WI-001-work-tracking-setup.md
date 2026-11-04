# WI-001: Work-tracking setup

Canonical entry: [WI-001](../work-log.md#wi-001). The dashboard owns status and next actions.

## At a glance

- Goal: a light work log that one dev and AI agents share as backlog, notes and handoff, not Jira. The migration moves the old root log into topics, one at a time.
- Next: see Do now.
- Done when every pending topic is migrated or marked "row is enough", and the dev confirms.
- WI-040 is the one child in the work tree. It may stay open as its own item.
- The handbook owns the item-closing and completion-check rules.

## Original goal

One developer works on this project in spare time with AI agents. AI produces ideas fast; the dev has to track, judge and document them, and agents forget between sessions. The work log is the dev's backlog, todo list, research notes, dashboard and memory, and the handoff for the next agent or chat, so finished work isn't redone. It must not become Jira. The migration moves the old root log's goals, decisions and rejected approaches into this system, one topic at a time.

## Done when

- Every pending topic is migrated or marked 'row is enough'. The dev confirms. WI-040 may stay open as its own item.

## Work tree

Progress as of 261103: 0 of 1 child done.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-040 Tracking check script](../work-log.md#wi-040) | [build] | S | - |

### Migration status

| Topic | State |
| --- | --- |
| WI-002, 003, 004, 006, 019, 020, 021, 022, 023, 024, 026, 041, 042 | Topic exists |
| WI-015, 016, 017, 018 | Pending |
| WI-007, 008, 009, 010, 012, 013, 014, 025 | Row is enough unless touched |

## Design decisions

| Area | Source |
| --- | --- |
| Closing an item | [Handbook](README.md#closing-an-item) |
| Completion check | [Handbook](README.md#completion-check) |
