# Verification output guide

This guide explains the warnings, failures and verification results printed by the single-chat export command.

It uses two kinds of language:

- **Console line:** the text a user sees.
- **Plain meaning:** the explanation the verification report should give.

Agent Host and Copilot CLI output comes first. Local-chat-only checks follow.

## 1. Outcome and failure state

| Console condition | Plain meaning | Fails the command? | What to do |
| --- | --- | --- | --- |
| `Exported session ...` | The archive was published and verification didn't report a failure. | No | Review the archive. Check for schema warnings if the run printed any |
| `Export failed verification; written as ...verify-failed.md` | The exporter wrote the conversation, but one or more verification checks failed. | **Yes** | Inspect the failed archive and its sidecar. Use the failure log for details |
| `Failed checks: ...` | These are machine names for the checks that failed. The guide maps them below. | **Yes** | Start with the first failed check, then inspect the category counts |
| `Missing or partial: request N ...; and N more` | The first examples name recorded requests and content categories that Layer D could not find completely. | **Yes** | Compare those source records with the rendered archive |
| `Export verification failed; private source copy kept at: ...` | The exact captured input remains available for repeatable debugging. | **Yes** | Keep the copy until the problem is resolved |
| `Failure log: ...` | A private log contains the machine report, versions, command and source hash. | **Yes** | Open it locally. Review it before sharing because it can contain session content |
| `Export failed verification` with a `.verify-failed.md` archive | The failed file is evidence, not a normal verified archive. | **Yes** | Don't use it as a clean copy for review or deletion decisions |
| `An older .verify-failed.md archive exists... It was not deleted.` | A new successful export didn't remove older failed evidence. | No | Compare or keep the older run if needed |
| `Verification report could not be written: ...` | The archive result is separate from the sidecar-write problem. | **Yes for that command** | Fix the report path or permissions. Don't confuse this with content loss |
| `Verification could not finish` | The verifier threw an exception before producing a complete structured result. | **Yes** | Start with the exception and failure log |
| `Diagnostic task: ...diagnostics-...md` | A private repair bundle was written for this warning, failure or exception. | No by itself | Review the task and manifest locally. Don't upload them automatically |
| `Diagnostic privacy scan: 0 common pattern(s) found` | The bundled best-effort scan found no common credential pattern. | No | This isn't a clean bill of health. Review the bundle manually |

## 2. Agent Host and Copilot CLI event census

### `SDK event census`

This section explains which records the exporter saw in the selected Copilot chat.

| Console line | Plain meaning | Important limit |
| --- | --- | --- |
| `Scoped events: N` | The exporter considered N stored records for the selected conversation scope. | This is a stored-record count, not a count of visible chat messages |
| `Unhandled event types: ...` | Copilot recorded event types this exporter hasn't learned yet. | Their payloads may be incomplete in the normal export, or shown as diagnostic JSON |
| `Unsupported payload variants: ...` | The event type is known, but one or more fields changed or had an unsupported value. | Known fields can still render and verify. The changed fields need review |
| `Questions not fully read: none` | Every recognized question format was read. | It doesn't claim every future question format is known |
| `Questions not fully read: ...` | One or more question tools used a format the exporter could only partly read or had to guess. | The question box still shows recorded or guessed evidence. Strict mode fails |
| `Left out on purpose: ...` | Reviewed record types were counted but excluded to avoid duplicate or internal noise. | The source chat wasn't changed |

### Event categories in “left out”

| Category | What it contains | Why it isn't copied into the archive |
| --- | --- | --- |
| Permission prompts | Approval and permission lifecycle records | They are runtime control records. The visible permission result is represented elsewhere |
| Hook records | Hook start and end records | They describe internal automation rather than the user's conversation |
| Model request/response copies | Internal model snapshots and response copies | They often duplicate the prompt, assistant text or tool call already exported |
| Usage and cache checkpoints | Cumulative running totals, not individual calls | Adding every checkpoint would count the same usage more than once. The last total belongs in the cost section |
| External-tool duplicates | Bridge request and completion records for an external tool | The normal tool call and result already represent the operation |

### Schema drift

The final summary can use either of these forms:

| Console form | Meaning |
| --- | --- |
| `N unhandled SDK event type(s) - name=count` | No reviewed handler exists for that event type |
| `N unsupported SDK payload variant(s) - name=count` | The event handler exists, but a field or value changed |
| `name:unsupported=count` | The older combined format for a supported event with unsupported fields |

Examples:

| Item | Explanation |
| --- | --- |
| `model.telemetry=2` | Two telemetry records used an event type the exporter didn't review |
| `instruction.update_delivery=1` | One instruction-delivery record used an event type outside the reviewed set |
| `instruction.update:unsupported=1` | The instruction event was recognized, but part of its content had an unfamiliar field or value |
| `assistant.fusion_phase_completed:unsupported=1` | The Fusion phase event rendered, but one payload detail wasn't reviewed |
| `session.fusion_completed:unsupported=1` | The Fusion completion event rendered, but one payload detail wasn't reviewed |
| `session.usage_record:unsupported=1` | One usage receipt had an unsupported or invalid field. This isn't a failed tool call and doesn't automatically mean all usage is unavailable |

**Counts matter.** The summary's first number can count distinct event or variant names. The `=N` values count records.

## 3. Layer D: recorded content

Layer D compares source text with the saved Markdown and linked text companions.

It checks these source categories:

- prompts and answers
- assistant text
- readable reasoning
- tool input, output and errors
- compaction summaries
- system prompts and skill files
- Fusion phase and handoff text
- instruction, retry and error text

### Layer D summary lines

| Console line | Plain meaning | Fails? |
| --- | --- | --- |
| `Content pieces checked: N` | N recognized text pieces were compared with the output. | No by itself |
| `category: X present, Y partial, Z absent` | Every result in that category is present, only partly found, or missing. | Partial or absent fails |
| `Every checked piece of recorded content appears in the export.` | Every recognized piece was found completely enough for this check. | No |
| `NOT IN THE EXPORT: N piece(s)` | Layer D couldn't find those source pieces in the archive or linked text companions. | **Yes** |
| `Only partly in the export: N piece(s)` | The archive contains only part of those source pieces. No approved blanket exception exists. | **Yes** |
| `Source-ordered message text: X checked, Y out of order` | The exporter found X eligible sequence items and reports how many changed order. | Y greater than 0 fails |
| `Repeated source-distinct message text: X groups checked, Y occurrences missing` | Identical text came from several source records. The report checks whether every occurrence survived. | Y greater than 0 fails |

### Why `partial` and `absent` differ

| Result | Meaning |
| --- | --- |
| Present | The complete normalized, redacted source text was found |
| Partial | Only part of a multi-line or long source item was found |
| Absent | Neither enough start/end text nor the required lines were found |

The test can use companion files for long text. A companion can make the text pass even when only a preview appears in the Markdown.

### What Layer D doesn't prove

- It doesn't prove every private source field is understood.
- A matching string elsewhere in the archive isn't proof of ideal visual placement in ambiguous cases.
- It doesn't independently check every text companion checksum.
- It doesn't decrypt opaque reasoning.
- Images have a separate byte check.

### Example failed run

| Output result | Plain explanation |
| --- | --- |
| 852 `tool-intent` absent | Tool heading text from 852 calls wasn't found in the generated archive |
| 8 `compaction-summary` partial | The linked or inline summaries weren't fully accounted for by the verifier |
| 12 `system-prompt` partial | The linked or inline system prompts weren't fully accounted for |
| 1 `tool-input` partial | One tool input wasn't fully found |
| 1 `tool-output` partial | One tool output wasn't fully found |
| 14 repeated occurrences missing | The source repeated the same eligible text 14 more times than the export accounted for |

That failed run shows why a verifier failure needs investigation. Partial and absent text can come from a real export loss, a companion-accounting problem, or a verifier bug. Keep the failure log and failed archive until the cause is reviewed.

## 4. Images

| Console line | Plain meaning | Fails? |
| --- | --- | --- |
| `N unique` | N distinct recorded image byte sets were found in the source. | No |
| `N found` | The linked companion set contained a byte-for-byte matching image. | No |
| `N missing` | A recorded image had no matching linked companion bytes. | **Yes** |
| `N unresolved` | The source referred to image data the verifier couldn't turn into recorded bytes. | **Yes for SDK/Local image accounting when required** |
| `N reference-only` | The source only named an image or location. It didn't include the bytes for this check. | Warning or review information |
| `N excluded-not-submitted` | A draft image wasn't used in the submitted request. | No |

Image verification checks bytes, not what the image shows. The normal text-redaction rules cannot inspect image pixels.

## 5. Markdown parser check

The parser check asks whether generated Markdown still has the intended structure.

| Check | Plain meaning |
| --- | --- |
| Turn anchors outside code | Every turn has one real link target, not a target hidden inside a code block |
| Request headings outside code | Every question has one visible request heading |
| Assistant headings parse as headings | Every assistant section is real Markdown structure |
| Section headings parse as headings | The contents list points to real section headings |
| Unknown blocks hold exactly one JSON code block | Unreviewed Local records are kept as one parseable JSON block |

Other messages:

| Console line | Plain meaning | Fails? |
| --- | --- | --- |
| `OK ...` | The named Markdown structure check passed. | No |
| `FAIL ...` | The archive structure differs from the expected turn or section layout. | **Yes** |
| `Parser check - skipped: markdown-it unavailable` | The optional verification parser isn't installed. | Only strict mode |
| `Parser check - FAIL: markdown-it unavailable` | Strict verification requires the parser. | **Yes** |

The parser uses `markdown-it` for verification. A parser failure means the saved file's structure is wrong or the required verification tool is unavailable. It doesn't mean Copilot itself failed.

## 6. Code-fence and HTML repairs

Chat content can include unfinished code fences or raw HTML tags. The exporter repairs those cases so the rest of the archive remains readable.

| Console line | Plain meaning | Fails strict? |
| --- | --- | --- |
| `Code fences closed by the exporter: 0 before the end of a turn` | No open code block had to be closed early. | No |
| `N before the end of a turn` | Chat text changed the Markdown code-fence structure. The exporter closed it to protect later content. | **Yes** |
| `N at the end of a turn` | A final turn fence was closed at the natural turn boundary. | No |
| `HTML escapes: N` | The exporter escaped an unclosed comment or raw-text tag so it couldn't consume later Markdown. | No |

The plain report should show these as safety repairs, not content loss. In strict mode, an early close is a failure.

## 7. Export summary

| Console line | Plain meaning |
| --- | --- |
| `Exported session ...` | The output path contains the published archive |
| `Title` / `Custom Title` / `Default Title` | Recorded title variants and their provenance |
| `First Prompt` / `Last Prompt` | Short previews that help identify the export |
| `Session from ... to ...` | Earliest prompt and latest recorded response time |
| `Turns` | Visible question/answer turns in the selected scope |
| `Tool calls` | Calls kept in the exported parsed model |
| `Reasoning thoughts` | Readable reasoning items kept in the export |
| `Resources` | Supplementary saved resources counted for the export |
| `Output: ... (N bytes)` | Final published or failed archive path and exact byte size |
| `Companion files: N in ...` | Long text, system prompts, skill files or images saved beside the archive |

## 8. Local-chat verification

Local exports have extra checks because the source is a replayed VS Code journal.

### Verifier summary

| Console line | Plain meaning | Failure condition |
| --- | --- | --- |
| `Requests (journal)` | Final replayed source requests | Compared with parsed turns |
| `Turns (parsed)` | Turns produced by the parsed model | Count should match requests |
| Prompt/response/thought/tool mismatches | A source request and parsed turn differ in those categories | Failure |
| Terminal-output mismatches | A terminal command or output differs after parsing | Failure |
| Tool-call or thought order mismatches | The source and parsed model kept different order | Failure |
| Missing turns | Source requests didn't produce parsed turns | Failure |
| Extra turns | Parsed turns don't map to source requests | Failure |
| Cross-turn tool IDs | One tool identity appears under multiple turns | Informational review unless another mismatch exists |

### Raw journal cross-check

| Console line | Plain meaning | Failure condition |
| --- | --- | --- |
| `Distinct tool calls (journal walk)` | Tool IDs independently read from the raw journal | Should match parsed IDs |
| `Distinct tool calls (parsed turns)` | Tool IDs in the parsed model | Should match raw IDs |
| `DROPPED by parser` | The parser lost a tool ID found in the journal | Failure |
| `INVENTED by parser` | The parsed model contains a tool ID absent from the journal | Failure |
| `Tool-call identity: exact match` | Raw and parsed tool identities agree | Pass |

### Layer C: saved Markdown structure

| Console line | Plain meaning | Failure condition |
| --- | --- | --- |
| `turn anchors == turns` | The archive has one anchor per parsed turn | Failure if counts differ |
| `turn anchors sequential 1..N` | Anchor numbering stayed in sequence | Failure if missing or reordered |
| `no duplicate turn anchors` | Turn links are unique | Failure if duplicated |
| `TOC entries == turns` | The question list links once per turn | Failure if counts differ |
| `request headers == turns` | Every turn has one question heading | Failure if counts differ |
| `assistant sections == turns` | Every turn has one assistant section | Failure if counts differ |
| `tool badges == tool nodes` | The visible tool badges match the parsed tool records | Failure if counts differ |
| `<details> balanced` | Collapsible blocks open and close correctly | Failure if structure is unbalanced |
| Compact confirmation under its turn | A recorded `/compact` confirmation stayed under that turn | Failure if lost |
| Unknown-response JSON round-trips | A generic unreviewed record still contains the exact redacted JSON block | Failure if invalid or changed |
| `Layer C - skipped: no output file given` | No saved file was supplied, so render checks couldn't run. | Not a failure by itself |
| `Layer C - skipped: could not read output file` | The saved file couldn't be opened. | Failure in machine verification |

### Local schema census

| Console line | Plain meaning | Failure behavior |
| --- | --- | --- |
| `Response items walked` | Records visited in final replayed Local response values | Count only |
| `Handled kinds` | Record types with reviewed rendering | Pass |
| `Handled but empty` | Recognized partial/streaming records that carried no renderable text | Usually informational |
| `Dropped by design` | Reviewed presentation or bookkeeping records intentionally not exported | No |
| `Known but never observed here` | Reviewed names that didn't appear in this chat | No |
| `toolSpecificData lifted into fields` | Known tool payload types converted to readable fields | Pass |
| `toolSpecificData rendered generically` | Unknown-looking but reviewed tool payloads kept as JSON | Pass |
| `UNRECOGNIZED toolSpecificData kinds` | The content renders generically, but the field layout wasn't reviewed | Strict failure |
| `UNREVIEWED response kinds` | The exporter lacks a reviewed handler | Raw JSON may remain. Strict fails |

## 9. Machine failure reason appendix

These names can appear in `Failed checks`, JSON output or the failure log.

| Failure reason | What failed | Plain next action |
| --- | --- | --- |
| `layer-a-tool-ids` | Raw Local journal tool IDs differ from parsed tool IDs | Inspect dropped or invented tool IDs |
| `layer-b-mismatch` | A parsed turn differs from the replayed Local request | Inspect the named request and mismatch field |
| `turn-count` | Raw request count differs from parsed turn count | Inspect missing or extra turns |
| `layer-c` | The saved Local Markdown structure doesn't match parsed turns | Inspect the named structural check |
| `layer-d` | Recorded text is partial, absent, out of order or missing a repeated occurrence | Compare the named category and request with the archive and companions |
| `image-loss` | A required recorded image didn't match linked bytes | Inspect the archive's image links and companion folder |
| `parser-check` | Markdown parser checks failed, or the parser is unavailable in strict mode | Install the pinned dependencies or fix the generated structure |
| `unreadable-output` | The requested saved archive couldn't be read | Check the path, permissions and file integrity |
| `unhandled-kind` | A strict run saw an unreviewed response or SDK event type | Review the raw payload, then add a handler or approved rule |
| `unrecognized-tool-data` | A strict Local run saw a `toolSpecificData` layout that wasn't reviewed | Inspect the generic JSON and add a semantic or reviewed generic case |
| `question-not-read` | A strict run couldn't fully read a question format | Inspect the question's turn, title and argument names |
| `early-fence-close` | A strict run needed to close a code fence before the turn ended | Inspect the recorded Markdown boundary and source text |
| `verification-error` | The verifier threw or couldn't complete | Inspect the exception, stack and frozen source |

## 10. Other command and output failures

These don't come from a verification category, but they can appear in the same export command.

| Error family | Plain meaning | Next action |
| --- | --- | --- |
| Unknown option or usage error | A flag, value or command combination is invalid. | Correct the command from the error's usage text |
| Selector didn't resolve uniquely | The ID or prefix matched no chat or several chats. | Use an exact qualified selector or exact journal path |
| Output already exists | The default command won't replace an archive. | Review the existing file, then use `--overwrite` if intended |
| Source changed during capture | The live session changed while the exporter copied it. | Retry after the chat stops changing |
| Invalid journal or SDK record | A complete stored line has invalid JSON or an unsupported envelope. | Keep the source unchanged and inspect the named line |
| Saved source copy unavailable | The receipt exists, but later verification can't use the exact kept source. | Re-export with `--keep-source` |
| Source copy wasn't kept | The original normal export deliberately discarded its frozen source. | Re-export with `--keep-source` before file verification |
| Saved export belongs to another selector | The receipt and requested chat ID don't match. | Verify with the selector stored for that output |
| Companion read failure | A linked companion is missing, unreadable or moved. | Restore the exact companion folder or re-export |
| Sidecar write failure | Verification finished, but the explanation file couldn't be published. | Fix the output path or permissions and rerun verification |

## 11. Failure log and source capture

The failure log is private. It can contain:

- command arguments
- check results and category counts
- error messages or stack traces
- source hash and capture path
- exporter, VS Code and Copilot versions
- limited source text through errors or arguments

The log's credential redaction is best effort. Review it before sharing.

The kept capture is the frozen source pair used for that run. It enables the same issue to be reproduced without reading the live chat again.

### When the failure log exists

| Run | Log behavior |
| --- | --- |
| Normal export that fails verification | Always writes a `failed-<session>-<timestamp>.log` beside the `.verify-failed.md` archive |
| `--verify <source> <archive.md>` that fails | Writes the log under the configured cache's `failures` directory |
| `--verify <source>` that fails | Writes the log under the configured cache's `failures` directory |
| Verification throws an exception | Converts the exception to `verification-error` and writes the same kind of log |
| Invalid command, unreadable source, destination error or another operational error before verification | No verification log is guaranteed. The command still prints the error |

The verification sidecar links the exact log path when one exists. Normal exports create the sidecar only with `--explain`. A standalone `--verify` with an archive path creates the sidecar automatically.

An older run can have a valid failure log without a sidecar because the plain-English report didn't exist yet.

## 12. What the report explains

The report mirrors every major terminal section:

1. Verdict
2. Source census
3. Schema drift and unfamiliar payloads
4. Local journal checks, when Local
5. Recorded-content check
6. Order and repeated occurrences
7. Image check
8. Markdown parser check
9. Code-fence and HTML repairs
10. Failure summary and category counts
11. Export summary
12. Intentional omissions
13. Failure log and kept capture
14. Limits and next action
15. Reproduction facts

The failure-log link should appear near the verdict and again in the final action section.

## 13. AI diagnostic bundle

A verification warning, verification failure or exporter exception writes:

- `<archive>.diagnostics-<timestamp>.md`, or a cache-based task when no archive exists
- `<archive>.diagnostics-<timestamp>.json`
- an optional restricted evidence folder for large exact Layer D text
- an optional `<archive>.diagnostics-<timestamp>.raw-records.jsonl` with the exact recorded records behind each finding

Clean verification writes none. A normal failed shell command doesn't trigger a bundle when verification is clean.

The manifest separates two evidence types:

| Evidence | Content |
| --- | --- |
| Schema | Event or payload type, field paths, value types, safe discriminator values, line or turn locators, issue and one-to-three structurally redacted samples |
| Fidelity | Exact failed source piece, normalized compared text, best rendered match, source hash and request or line locators |

Schema evidence keeps key names and parser-relevant structure. It fingerprints private strings, IDs, paths, tokens and dynamic keys with a bundle-local secret. It keeps no binary image body. Fidelity evidence is exact because redacting the value could remove the verifier defect.

The task file is written for a repair agent. It lists these sections when they apply:

| Section | What it gives the agent |
| --- | --- |
| Failure reasons | Each verifier reason mapped to a category (`images`, `parser`, `schema-drift`, `structure` and so on) and its likely source modules |
| Exception | The stage that threw (`load`, `verify` or `export`), the first project stack frames and the partial report |
| Failed parser checks | The expected marker, where it landed inside a code fence, the fence opener line and a short excerpt |
| Missing or unresolved images | The recorded line and JSON path of each image whose bytes didn't reach the archive |
| Companion links | Linked companion files that are missing, and files in the assets folder that nothing links |
| Exact content | JSON paths into the manifest for the exact recorded and rendered text |
| Raw records | Line numbers in the raw records file |
| Replay | A `node src/cli.ts --verify` command for the saved archive, the exporter commit and, for source runs, the checkout status |

**Raw records.** The raw records file keeps up to three exact recorded records per schema signature. Strings over 2,500 characters keep the first 2,000 and last 500 characters. A marker gives the length and SHA-256. The manifest indexes the file by line but never copies raw values. The privacy scanner covers this file too. ⚠️ It holds unredacted session content, so review it before you share it.

**Known limit.** For Local chats, the record `line` is the request number, not the journal file line.

The task and manifest are private. The exporter never uploads them or sends them to an agent automatically. It prints the scanner's common-pattern count. Zero isn't proof that sharing is safe. `--verify --json` still writes one JSON document to stdout. Diagnostic paths go to stderr.
