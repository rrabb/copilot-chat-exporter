# WI-003: Remaining manual acceptance

Canonical entry: [WI-003](../work-log.md#wi-003).

## Original goal

Confirm the delivered exporter and listing workflow meet agreed behavior in actual use without changing source data. Legacy #13 bundled automated verification, corpus comparisons and manual acceptance. A passing automated suite isn't a substitute for required interactive acceptance.

## Done when

Recover the required checks and agree a bounded checklist with the owner. Close required checks with scoped pass/fail evidence or an owner-approved disposition. Separate optional compatibility coverage and unavailable evidence. These are proposed closure criteria for confirmation, not approval to execute or waive checks.

## Current understanding

**Documented in historical receipts:** root selection and safe CLI behavior were implemented and synthetically tested, but real interactive terminal acceptance remained. Listing implementation and extensive automated/browser checks also passed, while final user visual review remained a separate gate. No later receipt reviewed here establishes that those owner-facing gates closed.

The [old numbered table](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#numbered-todo-and-backlog) is historical, not today's test baseline. Later compression receipts supersede broad older statements that Firefox was untested. They don't establish actual clipboard permissions, real browser Find UI or low-end-device behavior.

### Acceptance inventory

The checks below are proposals for review. None was executed by this migration.

| Classification | Behavior and why it matters | Existing evidence and limit | Proposed bounded check and pass |
| --- | --- | --- | --- |
| Required, outstanding | Interactive root chooser selects the intended VS Code root, not an accidental default | Legacy #5/#6 explicitly leave terminal acceptance open; synthetic coverage isn't human interaction | Owner at an interactive terminal with multiple known roots selects each intended root. Pass: chosen root controls discovery, no implicit newest export. Confirm safe inputs and access first |
| Required, outstanding | Final user review of listing and workflow | Legacy #8/#13/#17/#18 keep visual/manual acceptance open despite automated/browser receipts | Owner reviews one agreed listing and representative source details, filters and navigation. Agree expected cases and sign-off before execution; this migration doesn't invent a final checklist |
| Satisfied for recorded scope | Automated CLI/root/selector checks and broad verification/build/corpus gates | Later root log records successful cumulative gates and exact-path selectors | Don't rerun merely to migrate memory. Historical success isn't acceptance of every future version |
| Satisfied for recorded scope | Compressed shell, queued interactions, deep links, search, failure behavior and PDF generation | Chrome/Edge checks and later Firefox compatibility/resave checks are recorded | Keep scope/version/input limits. PDF generation isn't user approval of printed readability |
| Untested coverage, not automatically required | Actual Ctrl+F UI and OS clipboard permissions | Browser Find approximation and stubbed clipboard checks don't exercise these | If owner selects them: use a known phrase and permitted clipboard operation. Agree expected values and permissions first |
| Untested coverage, not automatically required | Low-end devices and wider browser/platform matrix | Recorded desktop trials aren't broad compatibility or performance guarantees | Require a chosen device/browser and acceptance target before testing; no invented latency threshold |
| Ambiguous requirement | Final print readability and remaining visual cases | PDF/browser evidence exists; exact remaining owner-approved print scenarios weren't recovered | Ask owner to choose report, print mode and expected readable sections. Don't label all print work passed or mandatory |
| Evidence unavailable or insufficient | Whether later manual sign-off exists elsewhere | No closure receipt found in reviewed sources; private artifacts weren't reopened | Ask for the relevant approval/receipt. Absence here isn't proof nobody ever performed the check |

No proposed check authorizes an export, private capture, browser run or source access. Listing runs need an approved output location and `--html-output`. User interaction and appropriate terminal/root access are needed for the required chooser check.

## Important decisions and tradeoffs

- Keep completed implementation closed while required acceptance stays visible.
- Don't relabel required acceptance optional merely to close the item.
- Don't turn every untested browser or performance scenario into mandatory work.
- A generated PDF, approximate Find test or stubbed clipboard isn't the corresponding real-user acceptance result.
- Keep [inventory evidence](../work-log.md#wi-007) and [historical tool-identity closure](../work-log.md#wi-025) separate. Neither is a reason to repeat all UI acceptance.

## Key findings and outcomes

Later compression/resave receipts show Chrome/Edge checks and narrower Firefox checks. Earlier blanket Firefox uncertainty is stale. They also distinguish startup samples from settled heap and avoid claiming a general speedup. Such measurements don't define a new performance acceptance threshold.

**Return to goal:** the remaining task is a bounded owner-approved acceptance review, not reopening all delivered code or recreating an entire private corpus. Required terminal and final user-review gates remain, while exact print scenarios and optional platform coverage need clarification.

## References

- [Pinned original acceptance and root-selection receipts](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#numbered-todo-and-backlog).
- [Compressed report validation](../work-log-archive.md#follow-up-implementation-and-verification-october-19).
- [Production Brotli checks](../work-log-archive.md#production-brotli-extension) and [resave hardening](../work-log-archive.md#compressed-report-re-save-hardening): historical evidence, not checks rerun here.
