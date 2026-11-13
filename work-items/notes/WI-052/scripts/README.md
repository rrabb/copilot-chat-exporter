# Preserved research scripts

[build-report.mjs](../build-report.mjs) rebuilds the preserved HTML from the saved sanitized JSON. [validate-report.mjs](../validate-report.mjs) checks that report's controls, anchors and local links.

```powershell
node work-items\notes\WI-052\build-report.mjs
node work-items\notes\WI-052\validate-report.mjs
node work-items\notes\WI-052\validate-preservation.mjs
```

The [preservation checker](../validate-preservation.mjs) also checks inventory conservation, public identity patterns, script syntax and private-copy hashes when that archive is present.

[preserve-original-run.mjs](preserve-original-run.mjs) keeps the expanded preservation process itself: anonymization, collision protection, baseline accounting and private bundle copying. It requires the original ignored research run and writes the same preserved research files. Do not run it as a routine HTML rebuild or after manually changing the preserved JSON without first reviewing its writes.

## Corpus research recipes

The [research folder](research/) preserves the six original discovery, scan, export, findings, summary and checking scripts. Machine/session identifiers are anonymized. Output is now gated by `WI052_RESEARCH_OUTPUT`, which must name an absolute folder under the repository's `temp-tool-output/`.

These are historical research recipes, not production commands. They are syntax-checked, not rerun against native stores during preservation.

| Script | Purpose | Private inputs needed |
| --- | --- | --- |
| `261113-discover.mjs` | Discover source files and store metadata | Native stores on the current machine |
| `261113-scan.mjs` | Select/freeze sources, replay Local mutations and build census | Discovery output, or original frozen inputs for `--reuse-frozen` |
| `261113-export.mjs` | Export selected samples and verify saved files | Census with real source locators, the exporter and approved native inputs |
| `261113-findings.mjs` | Assemble full research findings | Census, discovery, captures, export outcomes and logs |
| `261113-report-summary.mjs` | Build the compact report catalogue | Full findings and original evidence |
| `261113-check.mjs` | Validate that research run | Original source/capture manifests and export files |

The anonymized JSON in these notes intentionally cannot locate real sessions. A fresh approved run needs its own discovery and source locators. Do not treat anonymous labels as runnable IDs.

Before discovery, set `WI052_EXCLUDE_SESSIONS` to a comma-separated list of active/current sessions to exclude. Optional `WI052_FORCED_PREFIXES` replaces the original hard-coded stress-case selectors. For an exact repeat of the original run, the private inputs and mappings are still required.

The scripts preserve the original methodology and its limitations. They are not a newly reviewed or hardened general-purpose scanning API. Do not run them just to rebuild the HTML.
