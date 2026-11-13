# Expanded research preservation

Expanded 261113 after the developer requested the original report, proposals, source notes, detailed inventories and examples rather than summaries alone.

## What survives without temporary output

| Material | Preserved location | Treatment |
| --- | --- | --- |
| Searchable HTML report | [report.html](report.html) | Rebuilt with the original layout and full saved report data, sanitized and linked to this folder |
| Original proposal data | [ideas.json](ideas.json) | All fields, proposals, illustrations, questions and phase ideas |
| Public-source findings | [online/findings.json](online/findings.json) | All 24 sources, 56 entries, proposals and gaps |
| Public-source narrative | [online/report.md](online/report.md) | Original research narrative and bounded follow-up corrections |
| VS Code symbol export list | [online/vscodeTypes-export-list.txt](online/vscodeTypes-export-list.txt) | Complete supporting symbol list |
| Detailed corpus census | [corpus/census.json](corpus/census.json) | All inventory buckets, entries, counts and per-source-label occurrences |
| Full corpus findings | [corpus/findings.json](corpus/findings.json) | Detailed analysis, inventories, outcomes and anonymized provenance/commands |
| Report catalogue | [corpus/report-summary.json](corpus/report-summary.json) | Full report-facing projection, including the selected field/type paths |
| Survey and export metadata | [corpus/discovery.json](corpus/discovery.json), [corpus/survey-plan.json](corpus/survey-plan.json), [corpus/export-results.json](corpus/export-results.json) | Structure and metadata kept with private locators anonymized |
| Interpretation/background | [synthesis.json](synthesis.json), [repository-inventory.json](repository-inventory.json), [validation.json](validation.json) | Original findings and historical validation context |
| Reusable logic | [script guide](scripts/README.md) | Report builder/checks and guarded historical research recipes |
| Shareable examples | [example guide](examples/README.md) | Synthetic Local and SDK source/output pairs |
| Preservation accounting | [preservation-manifest.json](preservation-manifest.json) | Original research-file hashes, inventory entry counts, transformation counts and private-copy totals |
| Original run manifest | [original-report-manifest.json](original-report-manifest.json) | Sanitized original artifact inventory and hashes, separate from the rebuilt HTML's manifest |

The concise notes remain useful entry points. They do not replace the fuller preserved source files.

## Fidelity and privacy

- Full session IDs and source prefixes become stable sample labels or anonymous tokens.
- Personal home paths, email addresses and recognized credential patterns are masked.
- Dynamic text-bearing schema keys and question-answer field names become stable anonymous tokens. The key content is removed, not the structural count.
- Inventory key collisions cause preservation to fail rather than overwrite data. Bucket sizes, entry counts, occurrence totals and source-label counts are checked against the originals.
- Private native paths and reproduction selectors are no longer executable locators. Public URLs, commit references, type names, useful structures and counts remain.
- Raw chat transcripts, source captures/databases, private instruction bodies, images and original logs containing conversation text are not placed in Git.

Original public-source entries include partial/name-only reads and tentative LOD ideas. They are not proof of renderer support. The narrative's later follow-up corrects earlier Memory and dependency conclusions. Read [findings.md](findings.md) for the synthesis and interpretation caveats.

The census intentionally keeps multiple overlapping raw/final views. Its size is not evidence that every entry is a distinct message or tool call.

## Real sample exports

All six real exports and their full companion bundles are copied byte-for-byte to the ignored `private-examples/exports/` folder. Its private manifest records original filenames, sample mappings, byte sizes and SHA-256 values. Every copied file was compared with its original.

No original file was moved or deleted. The private archive protects against deleting the original temporary run, not against losing this working copy. Git does not protect it. Arrange a separate private backup.

## What cannot be recreated from these notes

The sanitized census and commands cannot reconstruct original conversations, private loaded context, images, source databases or the exact identity mappings. Synthetic examples are explicitly invented/fixture-based and are not substitutes for the original six conversations.

Exact source-based reruns still require the private native sources or frozen captures from the original run. Public-source research and the sanitized report remain usable without those inputs.
