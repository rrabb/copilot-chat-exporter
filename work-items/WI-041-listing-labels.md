# WI-041: Listing labels and dates

Canonical entry: [WI-041](../work-log.md#wi-041).

## At a glance

- Goal: make console and HTML listing labels explain counts and show dates in local time.
- Found 261103 while reviewing the Code and Insiders listings for [WI-003](../work-log.md#wi-003). All totals reconcile, so this is a wording problem, not a count bug. Console dates differed because they used UTC while HTML used local time.
- Count labels distinguish duplicate occurrences from conversations after merging.
- The console explains `/fix`, `external` and ambiguous entries.
- Console timestamps use local time and compact UTC offsets, such as `1103-18:10 (UTC-5h)` when the run's year is 2026. Other years keep `YY`.
- The 261102 listing had 71 ambiguous entries: 64 child scopes and 7 other entries. Their exact source-specific causes weren't checked.
- The 7 other entries are labeled as unresolved identity or scope. Their exact source-specific causes remain unknown.
- The dev accepted the labels, compact dates, narrower columns and terminal listing separator on 261103.
- Redirected output has no separator. HTML dates, filenames, overwrite behavior and JSON keep their existing behavior.
- [WI-042](WI-042-fusion-and-future-modes.md) records Fusion research. Overwrite prompts and other display ideas remain in the Inbox.

## Original goal

Listing readers can tell what each count, hidden reason and chat type means without reading the source.

## Done when

- The console and HTML use distinct labels for conversations and duplicate occurrences.
- The console explains the `/fix` hidden reason, `external` type and ambiguous-entry counts.
- Console timestamps show machine-local time with the UTC offset.
- Current-year console dates omit `YY`. Whole-hour offsets use `(UTC-4h)` and fractional offsets keep minutes, such as `(UTC+5:30)`.
- Date columns use the space their values need. The legend names the omitted year.
- Successful listing runs end with a blank line, a dashed line and a blank line when stdout is a terminal.
- Redirected output has no separator. JSON, HTML dates, output filenames and overwrite protection keep their existing behavior.
- Tests cover the new wording, and SPEC matches.

## Decisions and tradeoffs

### 261103 - Compact console follow-up

The dev approved compact console dates, narrower columns and a terminal-only separator. The CLI supplies the run's local year to the formatter so year omission doesn't depend on a hidden clock. Library calls without that context keep the year.

Keep the UTC offset on each date because daylight-saving changes can give two dates different offsets. Don't drop fractional-hour minutes. HTML dates and filenames aren't part of this change.

Overwrite prompts, console colors and printing the listing before HTML publication are proposals in the dashboard Inbox. No behavior changes for those proposals were approved. [WI-042](WI-042-fusion-and-future-modes.md) owns the separate Fusion research request.

The earlier Done status lacked dev confirmation and was corrected during this follow-up. The dev accepted the implementation on 261103 after the agent showed synthetic examples and validation results and the dev checked it in a separate terminal (dev-reported, not seen by the agent).

## Current understanding

Code root listing, 261102 run, reviewed 261103 (observed here, from the dev's console output and HTML screenshot):

| Check | Result |
| --- | --- |
| Backing statuses, 210 + 71 + 54 + 37 + 17 + 12 + 2 | 403 rows ✅ |
| Hidden, 71 + 54 + 37 + 12 | 174 ✅ |
| Main table: 205 verified + 5 🟠 ❓ parents + 17 unresolved + 2 unsupported | 229 ✅. The HTML counts the 5 flagged parents as verified (210). |
| Sub-agents: 93 shown + 64 hidden ambiguous child scopes | 157 ✅ |
| 🟠 ❓ markers: +1, +1, +1, +4, +57 | 64, matching the warning line ✅ |
| Chat types: 157 + 127 + 111 + 5 + 3 | 403 ✅ |

### Label findings and resolutions

| Label | Original problem | Resolution |
| --- | --- | --- |
| "grouped" | Console counted duplicate occurrences merged (152). HTML counted conversations after merging (403). Insiders had 0 duplicates and 2 conversations. The same word described both totals. | Console now reports source occurrences, conversations and duplicates merged. Basic and detailed HTML call the result conversations after merging duplicates. |
| "fix" | "Ignored by default: ... 37 fix" didn't say these chats have titles starting with `/fix`. | Console says "37 chats with a title starting with `/fix`." The filter still uses the existing title rule. |
| "external" | 2 shown console rows (3 in the HTML) use type `external`. The Type legend didn't define it. Its backing is `unsupported`. | Console defines `external` as a provider reference outside Local, Agent Host and CLI sources, and says these references aren't supported for export. |
| Ambiguous entries | The 261102 listing had 71 hidden ambiguous entries: 64 child scopes and 7 others. The console didn't identify those two counts separately. | Console separates child scopes from other entries with unresolved identity or scope. The 7 entries' exact causes remain unknown. |
| Dates | Console used UTC calendar dates, while basic HTML showed local date and time. The 261102 run had 40 values on different calendar days. | Console timestamps use local time, omit the run's year when it matches, and include a compact UTC offset. Date columns fit their values. HTML remains local and names the report timezone. |

## Findings and outcomes

The dev accepted this implementation on 261103. [Synthetic date tests](../test/listing.test.ts) cover other years, daylight-saving changes, UTC, positive and negative fractional offsets, and a UTC date whose local year differs. A 140-column table keeps its dates and short title without clipping.

[Synthetic CLI tests](../test/cli.test.ts) check the separator after the final HTML path and with `--no-html`. Redirected output has no separator, JSON stays parseable, and existing overwrite-refusal tests still pass. The build and project verification pass. The agent inspected no real listing or Fusion session. The dev's own check is dev-reported.

Very narrow terminals and full IDs can still exceed the available width. The seven other ambiguous entries' exact causes remain unknown. Neither limit was part of the compact-display implementation.

### Original estimate

| Part | Files | Size |
| --- | --- | --- |
| Clarify counts, hidden reasons and provider types | `console-listing.ts`, `basic-listing.ts`, `detailed-listing.ts`, focused tests | ~1 hour |
| Show console timestamps in local time with the UTC offset | `listing-model.ts`, `console-listing.ts`, focused test | ~30 min |
| Update listing behavior and layout docs | `docs/SPEC.md`, `docs/HTML-REPORT-DESIGN.md`, `CHANGELOG.md` | ~15 min |
| Identify the 7 ambiguous records' exact source causes | Needs more evidence than the counts in the reviewed listing | Unknown |

## References

- [WI-003 acceptance inventory](WI-003-remaining-manual-acceptance.md#acceptance-inventory), where the conflict first showed.
- [WI-019 ambiguous subagent finding](WI-019-agent-chat-export.md#ambiguous-subagent-mapping), related to the 64 child scopes.
- [WI-007 Inventory evidence](../work-log.md#wi-007), linked for the seven unexplained ambiguous entries. No investigation was done for this update.
