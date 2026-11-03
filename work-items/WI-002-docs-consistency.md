# WI-002: Docs consistency

Canonical entry: [WI-002](../work-log.md#wi-002).

## At a glance

- Goal: fix documentation conflicts that don't depend on WI-004.
- WI-004-dependent changes wait for its policy decision.
- The docs-conflict idea entered the Inbox on 261103.
- Its destination is this WI-002 topic.
- Six conflicts were listed from the 261103 docs.
- Each conflict below is inferred from those docs, not rechecked against code.
- The supplied list says none depends on WI-004.
- Those dependency labels have not been independently checked.
- No documentation was changed as part of this initial capture.
- No code, tests or generated assets were checked.
- Fix only conflicts that remain after checking current behavior.
- Keep policy-dependent wording until WI-004 has a decision.
- Report any conflict that turns out to need WI-004.

## Original goal

Fix the documentation conflicts that do not depend on WI-004. Keep policy-dependent changes waiting for the WI-004 decision.

## Done when

- Check each reported conflict against current code and approved decisions.
- Correct the conflicts that do not depend on WI-004.
- Record any conflicts that depend on WI-004 and leave them unchanged until its policy is decided.
- Run the relevant documentation checks and record the results.

## Current understanding

The following conflicts are **inferred from the 261103 docs, not rechecked against code**. “No” in the dependency column records the supplied triage and is not an independent verification.

| Where | Conflict | Depends on WI-004? |
| --- | --- | --- |
| SPEC `--list` bullet | Says SDK Markdown rendering and sister-filter parity are pending. Inferred from the 261103 docs, not rechecked against code. | No |
| CHANGELOG Known limitations | Says SDK rendering and current selection are in progress. Inferred from the 261103 docs, not rechecked against code. | No |
| SPEC credits row | Says SDK usage correlation is a separate follow-up (todo #20). Inferred from the 261103 docs, not rechecked against code. | No |
| HTML-REPORT-DESIGN usage note | Says usage correlation remains deferred. Inferred from the 261103 docs, not rechecked against code. | No |
| README verify rows | Omit the generated-asset check. Inferred from the 261103 docs, not rechecked against code. | No |
| SPEC 6.5 resource companions | Says resource companions are open although WI-006 chose the direction; implementation is WI-029. Inferred from the 261103 docs, not rechecked against code. | No |
