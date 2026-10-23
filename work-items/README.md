# Project-memory handbook

**Published maintenance conventions.** The [dashboard](../work-log.md) is the entry point. This handbook explains maintenance; it is not a second task index.

## Read the minimum useful context

Start tracked work at the dashboard. Identify the relevant WI entry and read its topic if one exists. Follow a source reference when the decision depends on it. Read product documentation for behavior. Don't load the archive by default.

A short dashboard row can be sufficient for a small investigation or an approval gate. A topic is useful when restarting otherwise requires recovering decisions, rejected approaches, evidence limits, or several related findings. Create knowledge that saves another investigation, not paperwork for every command.

Before changing tracking, reread the affected entries and inspect concurrent changes. Reconcile new decisions and edits rather than overwriting another agent's update. Unrelated dirty files stay untouched. If changes conflict, ask the user which intent should win.

## Keep one owner for each fact

| Owner | Information kept there |
| --- | --- |
| Dashboard | Current focus, status, priority, conditions, and next action |
| Topic | Original goal, done-when criteria, understanding, rationale, findings, outcomes, and evidence |
| Product documentation | Current product goal, user behavior, and technical rules |
| Legacy archive | Historical chronology after a future approved freeze |

Link between these owners instead of copying their contents. A topic can explain why a design was chosen without becoming a second specification. A historical receipt can support completion without becoming a current task list. There is no global decisions register.

## Use statuses consistently

| Status | Meaning |
| --- | --- |
| Next | Deliberately selected for near-term attention, with a concrete next action |
| Active | Substantive work is underway |
| Backlog | Discoverable work without a commitment to start next |
| Waiting | Progress needs a named external event, approval, evidence, or acceptance |
| Deferred | Deliberately paused until a named revisit condition |
| Done | Agreed completion criteria are met |
| Dropped | A decision rejected or abandoned the work |
| Superseded | Another identified item replaced its remaining purpose |

Use one status, not combinations such as Next-Deferred. Waiting needs a concrete condition. Deferred needs a reason or trigger, so it doesn't mean forgotten. Backlog does not itself authorize implementation.

Next selects attention, not authorization to implement, stage, commit, push, or perform other actions requiring approval. Its action can be research, investigation, validation, preparing alternatives, seeking a decision, or implementing an already-approved change. Keep Next small and ordered, normally 1-5 items.

Use High, Medium, or Low priority. Quick win is an optional marker, not another priority. Separate proposed priority from user approval. Don't promote an investigation because its topic file already exists. The dashboard may have no Next or Active rows while it waits for review.

## Keep identities and aliases stable

Use issued WI-NNN identities. Never reuse an assigned ID for a different outcome. Gaps are allowed. Keep filenames stable when status changes, and keep completed records in place. Row anchors provide durable links when an item moves between dashboard sections.

Keep useful old task numbers or aliases where they help locate history. Several aliases may refer to one item. An old title is not a reason to create another identity. Deliberately unallocated numbers need no fake Superseded record.

## Choose useful work boundaries

| Situation | Treatment |
| --- | --- |
| Small, understandable task | Dashboard row until richer history justifies a topic |
| Investigation with reusable findings | Focused topic and a dashboard entry |
| Work needed to meet the original goal | Necessary subtask under the parent |
| Work with separate approval, status, or acceptance | Independent follow-up when justified |
| Unapproved idea | Mark approval boundary before scheduling work |
| Accepted limitation | Record the decision and consequence; don't invent an active task |

Split a compound item when its remaining parts can progress or close independently. Merge repeated mentions that describe the same outcome. A policy umbrella can stay together while its decisions need joint review; split it later if independent approval or implementation warrants that.

## Keep the original goal visible

Every topic starts with Original goal and Done when. These describe the agreed outcome, not the latest detour. Don't silently rewrite them to match an implementation. Record a changed goal as a decision with its reason and approval.

When a substantial detour resolves a blocker, add a short return-to-goal checkpoint: what was learned, which original criterion it addressed, what remains, and how work returns. Distinguish necessary fixes from useful independent ideas. A new performance measurement or browser experiment must not quietly replace the original user need.

For completed work, the checkpoint should connect the detours to the delivered outcome. For unresolved work, it should recover the route to the next decision. A reader should understand that route without reconstructing every intermediate action.

## Record decisions and evidence

Keep the current synthesis near the top. Record meaningful alternatives, their tradeoffs, rejected unsafe behavior, and consequences. Say whether a choice was proposed, approved, or implemented. Finding existing code does not prove approval; an approved proposal does not prove delivery.

Use evidence labels: documented, inferred from source, observed here, or unknown. Scope measurements by date, revision, inputs, and method. Distinguish fresh checks from historical receipts. A passing corpus supports its recorded cases, not all possible storage variants or future sessions.

Keep supporting logs, captures, profiles, and validation reports outside tracking documents. Link to relevant evidence and state when it is private, unavailable, or not reopened. Keep personal paths, real session identifiers, and credentials out of portable memory. Missing evidence stays missing; don't fill it with a plausible story.

## Update after meaningful progress

Update understanding when an investigation changes it. Record a decision when it affects future choices. Record outcomes and independent follow-ups when work ends. Don't append routine agent actions, repeated test totals, or transcript-like narration.

Update current status and next action once, in the dashboard. The topic keeps the knowledge needed to resume. There is no mandatory Kind field, daily entry, or checklist for every command. Optional sections should earn their context cost.

## Close the right scope

Close a parent when its agreed outcome is met. Keep required acceptance visible until it is satisfied; don't relabel it optional merely to close an item. Conversely, optional independent work must not hold a completed parent Active.

If implementation is complete but required manual acceptance remains, say so and record the gate. If acceptance is independently tracked, link it without claiming it has passed. Preserve the distinction between delivered implementation, accepted behavior, and evidence still needed.

Keep completed identities discoverable through brief outcomes and references. The operational dashboard must stay compact. When closed history dominates first-load context, review the lookup strategy instead of enlarging the dashboard indefinitely. Don't create a second index or automation prematurely.

## Control context and chronology

Aim for 800-1,200 words for the handbook/dashboard, 300-800 for an ordinary topic, and 800-1,500 for complex work. These are review targets, not caps. Condense repetition before deleting rationale. Split independent work before splitting one continuous explanation.

Collapsible sections still cost context when an agent loads the whole file. Prefer a short synthesis with focused evidence links. Don't archive active or deferred work merely because it is old. After a future migration, freeze legacy chronology only when its important knowledge has a recorded destination. This documentation promotion doesn't perform that freeze.
