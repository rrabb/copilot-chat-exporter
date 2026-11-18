# WI-052 preserved LOD research

Saved and expanded 261113. This folder keeps the original research deliverables as well as concise notes. Start with the [searchable HTML report](report.html), [preservation inventory](PRESERVATION.md), or [findings](findings.md).

Research only. No switches are implemented here. Keep the current detailed Markdown export as the default. On 261117 the developer approved optional named presets alongside independent controls. Individual overrides win. See [WI-067's decision](../../WI-067-exporter-lod-config.md#cli-decision-261117).

## Working private casebook, 261117

Open the [LOD scenario casebook](private-examples/casebook/presentation.html).
Its scripts and all sixteen direct source dependencies now resolve inside WI-052's private examples folder.
Three full captures come from the shared corpus. Thirteen smaller dependencies have frozen copies under the working casebook's `inputs/`.
No full captures are duplicated inside the casebook.

The [input manifest](private-examples/casebook/inputs.private.json) maps historical source identities to these saved files.
The historical fixture guide was recovered from Git with CRLF line endings. Its hash matches the original evidence.
Current working-tree documentation wasn't substituted or changed.

```powershell
node work-items\notes\WI-052\private-examples\casebook\mine-evidence.mjs
node work-items\notes\WI-052\private-examples\casebook\build-casebook.mjs
node work-items\notes\WI-052\private-examples\casebook\validate-casebook.mjs
node work-items\notes\WI-052\private-examples\casebook\verify-portability.mjs
```

The final command rebuilds with filesystem access restricted to the working casebook and shared corpus.
It checks all sixteen source hashes and compares generated content against the unchanged archive.
Only source links differ from the archived data. Examples, scenarios, source descriptions and selected content match.
The [portability result](private-examples/casebook/portability-validation.private.json) records the checks.

Browser checks confirmed eleven scenario buttons, working detail controls and gallery search.
Searching for `question` showed three examples. Clearing restored all eighteen. Rendered evidence links no longer point into temporary output.

Original temporary files and the archive below remain unchanged. The working casebook, its inputs and corpus stay Git-ignored.
Whether to commit reviewed code or a synthetic version is a separate Inbox decision.

## Private casebook copy, 261117

The [casebook bundle](private-examples/casebook-261115-0224/) now has a private copy outside temporary output.
All 16 original files match by relative path, byte count and SHA-256. The original bundle stayed unchanged.
The [copy verification record](private-examples/casebook-261115-0224/copy-verification.private.json) records the source, destination and file hashes.

The copy keeps the presentation, selected data, evidence manifest, scripts, template and validation results.
It remains ignored by Git and still needs a separate private backup.
### Link portability check, 261117

The [private link audit](private-examples/casebook-261115-0224/link-portability.private.json) compares the original and copied locations.

| Check | Result |
| --- | --- |
| Internal anchors | All 14 checked anchors resolve across the two HTML files. |
| Copied evidence links | All 16 distinct source targets are missing at the copied location. They account for 48 link checks across both HTML files and the data. |
| Original evidence links | All 16 targets still exist at their original locations. |
| Source content hashes | Fifteen targets match the recorded hashes. The SDK fixture guide differs. Its README currently has uncommitted edits. |
| Copied validator | Fails at the first missing source link. Earlier embedded-data and script/style checks passed before that assertion. |
| Mining script | Assumes the repository root is two directories above itself. That assumption fails in the copy. |

The archive keeps the embedded presentation but isn't a portable evidence bundle.
Use the working casebook above for repaired evidence links.
Rebasing links would restore access on this machine, but wouldn't save their targets outside temporary output.
A portable bundle needs selected dependency copies and adapted paths. The working casebook above now has both.
Don't rerun the archive's mining script. Reusable code hasn't been reviewed for publication or moved into tooling.

A separate private backup means another protected storage location, not another folder in this checkout.
Git doesn't back up these ignored files. Both local copies can be lost together if this drive fails.
No separate backup destination has been chosen or checked.

### Shared private frozen corpus, 261117

The developer chose one shared corpus rather than duplicate complete captures inside each casebook.
The [private corpus](private-examples/corpus/) now keeps these three existing frozen inputs:

| Sample label | Recorded family | Bytes |
| --- | --- | ---: |
| S026 | Agent events | 29,610,189 |
| S019 | Agent events | 53,016,742 |
| S001 | Local journal | 700,690 |
| **Total** | **Three captures** | **83,327,621** |

These are copies of the original research run's frozen files, not new captures from live chat stores.
The casebook describes them as captured on 261113. That isn't their conversation date or this copy's date.
Each file matches its casebook source hash. The original files stayed unchanged.

The [private corpus manifest](private-examples/corpus/manifest.private.json) records hashes, byte sizes, original locations and casebook source mappings.
Filenames use the full SHA-256 hash plus `.jsonl`, so future tools can reuse identical content without another copy.
Treat these captures as read-only. Add new content under its own hash instead of replacing existing files.

Future tools should resolve inputs through this manifest, not hard-code the original temporary paths.
The working casebook's input manifest maps its source identities to these hash-based corpus filenames.
Its miner reads those mapped files, not the original temporary paths.
Only the three JSONL dependencies live in the shared corpus. The thirteen smaller dependencies live under the working casebook's `inputs/`.

The corpus is ignored by Git and isn't approved for publication. It still needs a separate private backup.
Casebook integration is complete. Reusable-tool structure and publication remain separate decisions.

## What is kept

| File | Contents | Evidence |
| --- | --- | --- |
| [report.html](report.html) | Full searchable report rebuilt from preserved sanitized inputs | Original report layout and research data, with repaired local links |
| [PRESERVATION.md](PRESERVATION.md) | Complete artifact inventory, fidelity/privacy decisions and backup limits | Expanded preservation accounting |
| [ideas.json](ideas.json) | Complete original proposal data | All original fields, not just the prose summary |
| [online research](online/report.md) | Original public-source narrative and follow-up corrections | Includes [original findings JSON](online/findings.json) and [symbol list](online/vscodeTypes-export-list.txt) |
| [corpus census](corpus/census.json) and [full findings](corpus/findings.json) | Detailed inventory buckets, all entries, per-source-label counts and analysis | Private identities and text-bearing keys anonymized, counts retained |
| [report catalogue](corpus/report-summary.json) | Full report-facing inventory and selected field/type paths | Original projection, sanitized rather than reduced again |
| [examples](examples/README.md) | Portable synthetic Local/SDK exports plus private-copy guidance | Real output format with explicitly synthetic inputs |
| [scripts](scripts/README.md) | Rebuild/check commands and historical research recipes | Private defaults removed; no native rescan during preservation |
| [findings.md](findings.md) | Recommendations, corrections, version limits and unresolved questions | Synthesis of the original public-source and corpus research |
| [controls.md](controls.md) | All 41 candidate controls, short/medium/complete illustrations, tradeoffs and proposed phases | Proposals, not existing CLI flags |
| [source-research.json](source-research.json) | 24 public sources, 56 type entries, source versions, partial/name-only caveats and research gaps | Official docs and public source checked during the original research |
| [observed-inventory.json](observed-inventory.json) | All 14 Local response variants, 52 SDK event types, 259 encountered tool names, 1,149 discriminator rows, state variants and sample outcomes | Aggregated observations from 32 source files |
| [repository-formats.json](repository-formats.json) | Request, response, tool, attachment and metadata families from the repository schema guide | Background documentation, not a new runtime census |

JSON catalogues keep column names, scope labels, units and counts so later work can compare formats without rereading private chats. Counts across raw records, final replayed content and lifecycle copies must not be added together.

## Main conclusions

- Separate tool selection, input detail, result detail, attachments and collapse state.
- MCP is a subset of tools, not an additional output stream.
- Use exact per-tool overrides. Do not infer every file read from arbitrary shell commands.
- Short output should use recorded descriptions and deterministic fields, not another model call.
- Questions need title/options/recorded answer and distinct skipped, cancelled and unavailable states.
- Ephemeral live events cannot be restored by an offline export.
- Keep error/status clarity, source gaps, unknown-type reporting and intentional-exclusion counts.
- Excluding content must also govern newly generated companions. Collapsing content does not remove it.
- Instructions, skills, saved memory, graph results and compaction are different evidence.
- Keep privacy/redaction separate from LOD. Image pixels bypass text redaction.

## Survey and example results

The bounded survey includes 32 sources. It produced six current-default exports: four long varied examples and two stress cases. All three exported SDK examples have verified Agent Host mappings. Insiders metadata was discovered but its sessions were not sampled.

| Result | Meaning |
| --- | --- |
| 101 actually called tool names | Names on final Local invocations or SDK execution starts |
| 259 encountered tool names | Also includes configured schemas, copies and reference records |
| Five saved-file checks pass | A pass does not prove complete semantic fidelity |
| Local question stress sample S001 | Four of five recorded answer strings match after whitespace normalization despite general verification passing. Escaping may affect matching. |
| Fusion stress sample S017 | Export and saved-file verification both fail Layer D with exit 2. Diagnosis belongs to WI-053. |
| All 32 source hashes unchanged | Stable bytes during the survey, not proof of complete live recording |

## Privacy and preservation boundary

The notes keep aggregate type/tool names, schema descriptions, counts, public citations and findings. Personal home paths, email addresses and full session IDs are removed. Samples use run-local labels instead of identities.

Full field-path inventories and original metadata structures are now retained, with private locators and dynamic text-bearing keys anonymized. Stable tokens prevent distinct private keys from being merged. Preservation checks compare bucket sizes, entry counts, occurrence totals and source-label counts with the original census/findings.

Raw chats, answer values, loaded private instructions, source captures, database copies and real images are not placed in Git. Original source identities and reproduction selectors are anonymized, so the saved commands describe the method but cannot identify real sessions.

No chat transcript is pasted into tracked notes. Redaction is a targeted preservation measure, not a guarantee that every future dataset is safe to publish.

## Real sample archive and original artifacts

All six real export bundles now have hash-checked private copies under `private-examples/exports/`, outside temporary output but ignored by Git. Arrange a separate private backup. The portable [synthetic examples](examples/README.md) are eligible for source control and contain no real conversation text.

The originals remain unchanged in the ignored [research run](../../../temp-tool-output/261113-121310-lod-research/). That link is optional and machine-local. The preserved HTML, full sanitized research data, source notes and synthetic examples do not depend on it.

The private copies keep the original Markdown and all companions, but not the source databases/captures. Exact source-based reruns still require those private inputs. The tracked research cannot reconstruct a real conversation.

## LOD format workbench

Added 261115 under [WI-058](../../../work-log.md#wi-058). A searchable page lists every tool, event, response and question kind. Each row expands to show recorded evidence and how the Copilot GUI draws it. Two editable boxes hold the short and medium format. Your edits save to JSON. Research only: no exporter code reads the choices file.

Findings, counts and evidence limits are in the [WI-052 topic](../../WI-052-markdown-level-of-detail-research.md#format-workbench-261115).

Public source metadata records the platform and Node version, not the hostname or a hostname-derived identifier. Recorded examples and the built HTML stay private and need separate backup.

### Run it

| Step | Command |
| --- | --- |
| Sanitize an older derived scan | `node work-items\notes\WI-052\catalogue\sanitize-scan.mjs` |
| Recover complete evidence for an older shortened scan | `node --max-old-space-size=8192 work-items\notes\WI-052\catalogue\scan-sessions.mjs --recover` |
| Rebuild the catalogue | `node work-items\notes\WI-052\catalogue\build-catalogue.mjs` |
| Rebuild the page | `node work-items\notes\WI-052\catalogue\build-page.mjs` |
| Start the helper server | `node work-items\notes\WI-052\catalogue\serve.mjs [--port N]`, then open `http://127.0.0.1:5252/` |
| Check the page | `node work-items\notes\WI-052\catalogue\validate-workbench.mjs` |
| Test choice saving and recovery | `pnpm test test\lod-workbench.test.ts` |
| Rescan chats (read-only) | `node --max-old-space-size=8192 work-items\notes\WI-052\catalogue\scan-sessions.mjs --exclude <session id>` |

Without the helper server, open the built page from disk. Save then downloads the JSON and the file picker loads one. That path is inferred, not browser-tested.

### Saving your choices

Formats and notes have no per-field character limit. Imports and server saves allow choices files up to 5 MiB, measured as UTF-8 bytes. Larger files trigger an interactive warning and leave your current choices unchanged. Use **Download copy** to keep oversized edits. Reduce their size before importing or saving through the server.

You can keep editing during a server save. The Save button stays disabled until the request finishes. Edits made during that request stay marked as unsaved. The page also updates their browser recovery draft without waiting for the normal typing delay.

Browser recovery storage can be unavailable or full. The page reports storage failures. Use **Download copy** rather than relying on a recovery draft.

Backup names include a sequence number, so saves within one second don't overwrite each other's backups. Every backup is kept. The server never deletes older backups. Back up this folder separately and watch its disk use.

### Complete recorded evidence

The HTML embeds complete redacted values for the selected examples. They stay collapsed until opened. Large evidence panels have no text display cap. This works offline without companion files or the helper server.

Complete means the selected example, not its whole chat. Short and medium suggestions still use the same saved previews. Restoring complete evidence doesn't change those suggestions or your review marks.

The page labels omitted base64-like data and reports each field's path and character count. This detection is a heuristic, not proof that the value is binary. Redaction still masks matching text. Whole military-domain examples still become labelled synthetic replacements.

Older scans may contain only shortened previews. Make a private backup of the derived scan before running `--recover`. Recovery reads only the selected source chats, bounded by the recorded source sizes. It keeps counts and selected examples. It checks each original value against its saved hash before keeping a complete redacted copy. Missing or changed evidence stays labelled unavailable, with the old preview shown. New scans keep complete evidence when first recording an example.

Observed here: all 84 shortened examples were recovered. There were no unavailable matches or new privacy replacements. The self-contained HTML grew from 2.85 MiB to 6.40 MiB. An offline Chromium check opened a complete example containing over two million rendered characters without shortening it. These files remain private and need publication review.

### Reviewing formats and counts

Each row has a Review dropdown:

| State | Meaning |
| --- | --- |
| Not reviewed | You haven't marked the current formats and show/hide setting as examined |
| Reviewed | You've examined them but haven't approved them |
| Accepted | You've examined and approved them |

Edited is a separate badge, not a review state. An edited row can also be reviewed or accepted. The Not accepted filter includes both unreviewed rows and reviewed rows without approval. Reviewed, not accepted shows only examined rows awaiting approval.

Changing an effective short format, medium format or show/hide setting resets review to Not reviewed. A group edit resets only affected rows. Notes don't reset review. Saved review marks include a fingerprint of those formats and settings. Changed suggestions or older imported marks without a fingerprint need another review. The page warns when loading resets marks.

Seen sorts by the number of scanned chats containing each name. Groups rank by their most widely seen member. Occurrence counts keep their separate units. SDK requests and starts aren't added together. Counts describe the scanned sample, not all chats.

The page shows scan warnings above the table, separately from file-loading messages. Warnings mean counts or examples may be incomplete. The refreshed snapshot has no parse or replay errors. This doesn't prove complete coverage of every chat.

The scanner reads LF-delimited JSON records and supports CRLF. Unicode line separators inside strings aren't record boundaries. An earlier reader split one valid result into three invalid fragments. [WI-066](../../WI-052-markdown-level-of-detail-research.md#scanner-record-boundaries-261117) records the repair and measured count changes.

Short shell suggestions show a nonzero recorded exit code even when the tool reports success. Tool success and command exit status are separate evidence.

### Files

| Path | Holds | In Git |
| --- | --- | --- |
| [catalogue/](catalogue/) scripts | Scanner, public-source collector, template engine, suggestions, page builder, helper server, validator | ✅ |
| [catalogue/catalogue-index.json](catalogue/catalogue-index.json) | Names, groups, counts, suggested formats, source links. No chat text. | ✅ |
| [catalogue/lod-format-choices.json](catalogue/lod-format-choices.json) | Your saved short and medium formats | ✅ |
| `private-examples/catalogue/format-workbench.html` | The built page with redacted examples embedded | ❌ ignored |
| `private-examples/catalogue/examples.private.json`, `scan.private.json` | Recorded examples and raw scan output | ❌ ignored |
| `private-examples/catalogue/choices-backups/` | Every earlier choices version, written before each save. No automatic deletion. | ❌ ignored |

The page needs the private folder because the examples come from real chats. Back that folder up separately. The redaction masks user-home paths and project paths under `_DATA`, so other local paths can remain in examples.

### Military domain examples

Approved 261116: replace entire examples containing military domain references with labelled synthetic examples. Replacements keep field structure, tool identity and failure flags. They replace text, numbers and source metadata, including surrounding browser titles and answers.

The scanner applies this rule before clipping. The catalogue builder also applies it when reading older snapshots. Run `sanitize-scan.mjs` to update an older derived snapshot, then rebuild the catalogue and page. The command doesn't change original chat journals.

The current snapshot has eight replacements. Its other 507 recorded examples and observed counts are unchanged. The validator checks all four generated artifacts for domain references. It also checks replacement labels and matching tool call references.

These changes don't approve publication. The files remain ignored by Git. Other real conversation excerpts and cross-project paths still need review.

## Work items

- [WI-058](../../../work-log.md#wi-058) owns the format workbench.
- [WI-052](../../WI-052-markdown-level-of-detail-research.md) owns research decisions and the next review.
- [WI-004](../../WI-004-fidelity-policy-research.md) owns the broader deferred metadata/redaction policy.
- [WI-053](../../WI-053-agent-host-fusion-export-compatibility.md) owns the Fusion compatibility follow-up.
