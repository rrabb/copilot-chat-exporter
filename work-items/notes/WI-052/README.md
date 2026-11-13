# WI-052 preserved LOD research

Saved and expanded 261113. This folder keeps the original research deliverables as well as concise notes. Start with the [searchable HTML report](report.html), [preservation inventory](PRESERVATION.md), or [findings](findings.md).

Research only. No switches are implemented or approved here. Keep the current detailed Markdown export as the default. The developer chose independent controls rather than named whole-export profiles.

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

## Work items

- [WI-052](../../WI-052-markdown-level-of-detail-research.md) owns research decisions and the next review.
- [WI-004](../../WI-004-fidelity-policy-research.md) owns the broader deferred metadata/redaction policy.
- [WI-053](../../WI-053-agent-host-fusion-export-compatibility.md) owns the Fusion compatibility follow-up.
