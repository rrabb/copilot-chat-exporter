# WI-003: Remaining manual acceptance

Canonical entry: [WI-003](../work-log.md#wi-003).

## At a glance

- Goal: confirm the chooser and listing work as expected through bounded manual checks.
- Passed: the Code root chooser and listing review on 261103.
- Listing review counts: 229 eligible, 174 hidden, 555 occurrences, 152 duplicates grouped into 403 rows.
- Passed: the Insiders chooser on 261103. Entering 2 selected the Code - Insiders root, and no export ran.
- Insiders listing: 1 of 1 eligible, 2 source occurrences, 0 duplicates grouped (2 rows), 1 confirmed-empty chat hidden.
- All required checks have passed.
- Print is optional and isn't required for completion.
- Optional browser, clipboard and device coverage isn't required.
- Evidence: the dev's report and local listing files.
- No real chat content was opened for this acceptance update.

## Original goal

Confirm the delivered exporter and listing workflow meet agreed behavior in actual use without changing source data. Legacy #13 bundled automated verification, corpus comparisons and manual acceptance. A passing automated suite isn't a substitute for required interactive acceptance.

## Done when

Checklist approved 261103. Done when the Insiders chooser check passes and the dev records the result, with no export made.

## Current understanding

On 261103, the dev reported that the root chooser and listing review passed for the Code root. The Code listing review covered the console list and HTML listing; their counts agreed. The Insiders chooser passed later that day.

The [old numbered table](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#numbered-todo-and-backlog) is historical, not today's test baseline. Later compression receipts supersede broad older statements that Firefox was untested. They don't establish actual clipboard permissions, real browser Find UI or low-end-device behavior.

### Acceptance inventory

The dev approved this checklist on 261103. The Code chooser, Code listing review and Insiders chooser passed on that date.

| Classification | Behavior and why it matters | Existing evidence and limit | Proposed bounded check and pass |
| --- | --- | --- | --- |
| Satisfied for Code and Insiders | Interactive root chooser selects the intended VS Code root, not an accidental default | Code passed 261103. Insiders passed 261103: the dev ran `pnpm run list --html-output temp-tool-output\wi-003-insiders-listing.html` and entered 2. The console named the Code - Insiders root and no export ran. Console: 1 of 1 eligible, 2 source occurrences, 0 grouped, 1 confirmed-empty hidden. HTML: "Showing 1 of 1 eligible conversations. 1 ignored by default", generated 261103_15:10 for the Code - Insiders root, local time (America/New_York); the ignored chat is empty. The HTML card shows 2 grouped rows. That isn't a count conflict: the console reports duplicates grouped (occurrences minus rows), and the HTML reports rows after grouping (2 - 0 = 2; for Code, 555 - 152 = 403). The shared word "grouped" is confusing; see [WI-041](../work-log.md#wi-041) | Passed 261103 for both roots |
| Satisfied for Code root | Final user review of listing and workflow | Dev reviewed the console list and HTML listing for Code on 261103. Counts agree: 229 eligible, 174 hidden, 555 occurrences, 152 duplicates grouped into 403 rows | Passed 261103 for the Code root |
| Satisfied for recorded scope | Automated CLI/root/selector checks and broad verification/build/corpus gates | Later root log records successful cumulative gates and exact-path selectors | Don't rerun merely to migrate memory. Historical success isn't acceptance of every future version |
| Satisfied for recorded scope | Compressed shell, queued interactions, deep links, search, failure behavior and PDF generation | Chrome/Edge checks and later Firefox compatibility/resave checks are recorded | Keep scope/version/input limits. PDF generation isn't user approval of printed readability |
| Untested coverage, not automatically required | Actual Ctrl+F UI and OS clipboard permissions | Browser Find approximation and stubbed clipboard checks don't exercise these | If owner selects them: use a known phrase and permitted clipboard operation. Agree expected values and permissions first |
| Untested coverage, not automatically required | Low-end devices and wider browser/platform matrix | Recorded desktop trials aren't broad compatibility or performance guarantees | Require a chosen device/browser and acceptance target before testing; no invented latency threshold |
| Optional, not required | Final print readability | Dev approved print as optional on 261103; PDF/browser evidence exists | No print check is required for WI-003 |
| Owner-reported acceptance | Whether later manual sign-off exists elsewhere | Dev reported the Code chooser, Code listing review and Insiders chooser passed on 261103; no private artifacts were opened | No separate sign-off search is needed; all required checks passed |

No proposed check authorizes an export, private capture, browser run or source access. Listing runs need an approved output location and `--html-output`.

## Important decisions and tradeoffs

- Keep completed implementation closed while required acceptance stays visible.
- Don't relabel required acceptance optional merely to close the item.
- Don't turn every untested browser or performance scenario into mandatory work.
- A generated PDF, approximate Find test or stubbed clipboard isn't the corresponding real-user acceptance result.
- Keep [inventory evidence](../work-log.md#wi-007) and [historical tool-identity closure](../work-log.md#wi-025) separate. Neither is a reason to repeat all UI acceptance.

## Key findings and outcomes

Later compression/resave receipts show Chrome/Edge checks and narrower Firefox checks. Earlier blanket Firefox uncertainty is stale. They also distinguish startup samples from settled heap and avoid claiming a general speedup. Such measurements don't define a new performance acceptance threshold.

**Return to goal:** Code chooser, Code listing review and Insiders chooser passed 261103. Print is optional, so no required check is left.

## References

- [Pinned original acceptance and root-selection receipts](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#numbered-todo-and-backlog).
- [Compressed report validation](../work-log-archive.md#follow-up-implementation-and-verification-october-19).
- [Production Brotli checks](../work-log-archive.md#production-brotli-extension) and [resave hardening](../work-log-archive.md#compressed-report-re-save-hardening): historical evidence, not checks rerun here.
