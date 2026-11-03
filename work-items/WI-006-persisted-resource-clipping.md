# WI-006: Persisted-resource clipping

Canonical entry: [WI-006](../work-log.md#wi-006).

## At a glance

- Goal: find what the 96 KiB resource limit hides, compare options and record the dev's choice.
- The exporter applies the limit after image replacement and best-effort redaction.
- Synthetic ASCII input lost one middle byte just over the limit.
- Unicode excerpts can overlap, misstate their size and split surrogate pairs.
- A resource with no matching call can be listed without its body being embedded.
- Layer D doesn't independently check resource bodies. A synthetic loss went unreported.
- The resource branch creates no full text companion. The printed source path isn't a Markdown link.
- The earlier 45-record inventory wasn't rechecked. This investigation used synthetic data only.
- The dev chose a preview plus a complete companion after best-effort redaction as the direction.
- No implementation, new limit or preview size is approved.
- The work tree separates the choice from the preview, verification and association follow-ups.

## Original goal

Keep recorded substantive tool output available in a portable archive. This item investigates the separate persisted-resource limit and prepares an owner decision, not remediation implementation.

The [original resource audit](https://github.com/rrabb/copilot-chat-exporter/blob/22a2f5d9b51f84f73b41da7c40186b79b3bb406d/work-log.md#L941) found an exporter rendering limit. It did not establish an upstream storage limit or approve a replacement size or remedy.

## Done when

1. Characterize relevant persisted-resource categories and rendering behavior.
2. Establish threshold, Unicode excerpt, resource association, and accounting behavior with bounded synthetic cases.
3. Distinguish observed or potential information loss from untested possibilities.
4. Document alternatives, benefits, costs, risks, and repercussions.
5. Record an owner decision or explicit deferral/acceptance disposition.

Remediation implementation is not required to close this investigation. Any implementation needs a separate approval after the dev's choice.

## Work tree

Progress as of 261103: 1 of 4 children done.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-028 Choose resource handling](../work-log.md#wi-028) | [question] | - | - |
| 2 | [WI-029 Resource preview and companion](../work-log.md#wi-029) | [build] | M | - |
| 3 | [WI-030 Verify resource text](../work-log.md#wi-030) | [build] | M | WI-029 |
| 4 | [WI-031 Research unmatched resources](../work-log.md#wi-031) | [research] | S | - |

Who and size for unfinished work are proposed estimates for the dev to confirm. The build items don't authorize implementation.

## Current understanding

**Inferred from current source at `a0e5a9a`:** [resource loading](../src/session/enrich.ts#L37) reads files as UTF-8. [Resource rendering](../src/markdown.ts#L157) replaces known image data and redacts the text before comparing its UTF-8 length with `96 * 1024` bytes. The exporter owns this rendering threshold. This code doesn't establish whether upstream storage has another limit.

**Observed here:** the following cases use generated data on Node 24.18.0. The [probe output](#261102---synthetic-probe-output) records the inputs and results.

| Finding | Input and observation | What it doesn't show |
| --- | --- | --- |
| Boundary and loss | Twelve ASCII and Unicode inputs were 98,303, 98,304 or 98,305 bytes. The first two sizes stayed inline. Every 98,305-byte input entered the clipping branch. In the ASCII saved-archive case, one unique middle byte was omitted. | Whether any real resource crosses the limit or loses content. |
| Unicode budgets and overlap | At 98,305 bytes, a three-byte-character input produced two 98,305-byte excerpts, each labeled 48 KiB. They overlapped completely, yet the output said the middle was omitted. The two- and four-byte cases also overlapped. | How often this occurs or what every Unicode input will do. Overlap counts use UTF-16 units, not bytes. |
| Split surrogate pairs | A 240,002-byte input made from four-byte characters split both excerpt boundaries. The saved Markdown contained two replacement characters and omitted 21,698 source UTF-16 units. [Archive writing](../src/archive-writer.ts#L123) encodes the Markdown as UTF-8. | Any observed corruption in a real session, or that every Unicode excerpt splits a pair. |
| Redaction and types | A synthetic 98,384-byte file became 98,294 bytes after redaction and wasn't clipped. A 98,417-byte file became 98,327 bytes and was clipped; its notice still showed the original size. A small `.md` resource used Markdown rendering; an oversized one used a text fence. A three-byte invalid UTF-8 sample decoded to a replacement character, NUL and `A`, not `null`. | Complete secret detection, behavior for every binary file, or results for image replacement. The current [redactor](../src/redaction.ts#L3) is best-effort. |
| Association | Synthetic `call_` and `toolu_` IDs matched. Renaming a file inside its matching directory kept the association. Renaming the call directory to a different ID left the file in the inventory but not at the original call. A missing directory or file produced no resource. See [loading](../src/session/enrich.ts#L43) and [call lookup](../src/markdown.ts#L459). | Real naming frequencies, why a particular file is missing, or a safe way to assign an unmatched body to a call. |
| Companion and path | An oversized resource produced no companion in a saved archive. A separate 400-line inline tool result planned one full-text companion. The resource notice prints the original path as inline code, not a Markdown link. See [resource rendering](../src/markdown.ts#L157) and [inline tool text](../src/markdown.ts#L253). | That the original path is portable, or that the inline companion preserves an independently stored resource body. The inline control checked the planned companion, not a written companion file. |
| Layer D | A synthetic journal and saved archive omitted the ASCII middle byte. [Layer D](../src/verify/loss-account.ts#L327) checked the prompt, reported no resource-body item and returned `failed: false`. When the same 1,400-line body was separately put in the synthetic journal, direct scoring reported 892 of 1,400 lines and `partial`; full and empty controls reported `present` and `absent`. | Verification of real resource bodies or a complete CLI run. The [CLI](../src/cli.ts#L398) also supplies linked text companions, but that doesn't add an independent resource input. |

**Prior report, not rechecked in this investigation:** the frozen manifest was reported to contain 45 resource records, all with sizes, maximum 84,918 bytes, and zero above 98,304 bytes. The older tracked audit covered 37 files across four resource directories in 81 Local journals, also maximum 84,918 bytes. These are different inventories. The synthetic probes don't establish whether a real resource lost content. No real sessions, native stores or private corpus were read.

The approved inline tool-text threshold is over 300 lines **AND** over 15 KiB. Unknown response payload overflow uses **OR**. Neither decision changes extra-metadata policy or the persisted-resource branch. Metadata policy remains with [WI-004](../work-log.md#wi-004).

## Options

**Decision 261103:** the dev chose option 1 as the direction: a bounded preview plus a complete redacted companion. The comparison favored it because it keeps Markdown readable and the processed text portable. Redaction is best-effort and doesn't guarantee removal of every secret.

| Option | Benefits | Costs and risks |
| --- | --- | --- |
| Preview plus complete redacted companion | Bounded inline text and a portable complete text file after redaction. | More disk space and files. Links, redaction limits, write failures, permissions and verification need careful handling. Large files may still contain secrets the redactor misses. |
| Keep permitted text inline | One portable document with no separate resource file. | Large Markdown files can slow readers and use more memory. Best-effort redaction still applies. |
| Keep a clipping limit with a clear notice | Bounds displayed resource size. | Deliberately loses the omitted text from the archive. Accurate byte and Unicode handling, omission reporting and acceptance need an agreed policy. A source path isn't portable preservation. |

**Scope:** this is a direction, not approval to implement. No new numeric limit, preview size or unredacted export was approved. Companion naming, permissions and write-failure handling remain to be designed.

## Follow-up acceptance

- **WI-028:** the dev's choice and its rationale are recorded above.
- **WI-029:** after separate implementation approval, provide a Unicode-safe preview and a linked companion containing the complete redacted resource text. Make preview and omission notices match the output.
- **WI-030:** check resource text independently of journal text, including the redacted companion when expected. Report missing or partial content.
- **WI-031:** investigate how to report unmatched resources without inventing a tool-call association or changing journal order.

The standalone repair of the current first/last excerpts can go if the new preview replaces them. Unicode-safe boundaries still matter. The existing [UTF-8 prefix helper](../src/markdown.ts#L239) may reduce that part of the work, but it doesn't create resource companions. WI-029 remains a provisional M because it now includes the preview and companion; revisit the estimate after design.

**Return to goal:** the research and choice are recorded. Preview implementation, independent verification and unmatched-resource research remain separate follow-ups.

## References

- [Current resource audit and policy questions](../work-log-archive.md#optional-resource-checks): historical observations and decision limits.
- [Rendering branch](../src/markdown.ts#L155), [loader](../src/session/enrich.ts#L35), and [loss accounting](../src/verify/loss-account.ts#L327): implementation evidence.
- [Frozen manifest](../reports/corpus/frozen-approved-snapshot-final-20261021.json): prior report of October 21 evidence and an October 22 aggregate-size check. The reported SHA-256 is `15dc09c7593ad202dec0e6cf4ff963af6928beed0a6a58a0215bc0fbb39bbd64`. Neither was rechecked here. This isn't a portable fixture; absence later is an evidence gap, not permission to substitute a different corpus.

## Notes

### 261102 - synthetic probe output

Generated boundary strings, resource files and journal records exposed the clipping, association and Layer D behavior without opening real sessions.

Receipts are Git-ignored local files and won't be present in a fresh clone: [threshold script](../temp-tool-output/wi-006-261102-2338/resource-thresholds.mts), [threshold output](../temp-tool-output/wi-006-261102-2338/thresholds-3.json), [association and Layer D script](../temp-tool-output/wi-006-261102-2338/association-layer-d.mts), [association and Layer D output](../temp-tool-output/wi-006-261102-2338/association-layer-d-1.json), [saved-archive script](../temp-tool-output/wi-006-261102-2338/synthetic-pipeline.mts), [saved-archive output](../temp-tool-output/wi-006-261102-2338/synthetic-pipeline-1.json), and [shared fixture helper](../temp-tool-output/wi-006-261102-2338/synthetic-fixtures.mts). The nested scripts use `../../src/` to reach the repository source.

| Input | Bytes | UTF-16 units | Clipped | First / last excerpt bytes | Overlap / omitted units | Replacement characters after UTF-8 encoding |
| --- | --- | --- | --- | --- | --- | --- |
| ASCII | 98,303 | 98,303 | No | - | - | 0 |
| ASCII | 98,304 | 98,304 | No | - | - | 0 |
| ASCII | 98,305 | 98,305 | Yes | 49,152 / 49,152 | 0 / 1 | 0 |
| 2-byte UTF-8 | 98,303 | 49,152 | No | - | - | 0 |
| 2-byte UTF-8 | 98,304 | 49,152 | No | - | - | 0 |
| 2-byte UTF-8 | 98,305 | 49,153 | Yes | 98,303 / 98,304 | 49,151 / 0 | 0 |
| 3-byte UTF-8 | 98,303 | 32,769 | No | - | - | 0 |
| 3-byte UTF-8 | 98,304 | 32,768 | No | - | - | 0 |
| 3-byte UTF-8 | 98,305 | 32,769 | Yes | 98,305 / 98,305 | 32,769 / 0 | 0 |
| 4-byte UTF-8 | 98,303 | 49,153 | No | - | - | 0 |
| 4-byte UTF-8 | 98,304 | 49,152 | No | - | - | 0 |
| 4-byte UTF-8 | 98,305 | 49,153 | Yes | 98,304 / 98,304 | 49,151 / 0 | 1 |

Non-ASCII cases use up to three ASCII padding bytes to reach the exact target. Excerpt overlap and omission count source UTF-16 units, not characters or bytes. The four-byte case can emit a replacement character even when its excerpt ranges overlap.

| Additional input | Result |
| --- | --- |
| 240,002-byte surrogate-boundary case | Both 49,152-unit excerpts split a pair. The excerpts omitted 21,698 units, and the saved archive contained two replacement characters. |
| 98,384-byte synthetic credential-like text | Redaction reduced it to 98,294 bytes, so it wasn't clipped. |
| 98,417-byte synthetic credential-like text | Redaction reduced it to 98,327 bytes. It was clipped, and the notice showed 98,417 bytes. |
| One invalid UTF-8 byte, NUL and `A` | The UTF-8 reader returned `U+FFFD`, `U+0000`, `A` with a non-null content field. |
| 400-line inline tool result | The renderer planned one full-text companion. Resource-only cases planned none. |

| Synthetic association | Resources found | Matched to the requested call | Body embedded at that call |
| --- | --- | --- | --- |
| Missing resource directory | 0 | 0 | No |
| Empty matching directory | 0 | 0 | No |
| Matching `call_` directory | 1 | 1 | Yes |
| Renamed file, same call directory | 1 | 1 | Yes |
| Directory renamed to another `call_` ID | 1 | 0 | No; inventory still lists the file |
| Directory without a recognized ID | 1 | 0 | No |
| Matching `toolu_` directory | 1 matching file | 1 | Yes |

| Layer D input | Result |
| --- | --- |
| Resource body absent from journal; saved resource clipped | Prompt present; no resource-body item; `failed: false`. |
| Same 1,400-line body added to synthetic journal; clipped Markdown | `partial`, 892 of 1,400 lines, `failed: true`. |
| Same journal body plus full text | `present`. |
| Same journal body with no output text | `absent`. |
| Journal body also rendered as inline tool text with a companion | Journal text `present`; the separate resource was still clipped. |
