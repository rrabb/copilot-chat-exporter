# WI-016: Offline listings

Canonical entry: [WI-016](../work-log.md#wi-016). Code links use commit `cba16b37b7e31de73530b355e9200edefa82b04c`. Historical links use `180a06ce10eace027c8937c6c20331e5f3b524b0`.

## At a glance

- Goal: find remembered chats through console, basic HTML and detailed HTML listings, with evidence for their identity and sources.
- Basic HTML is the default. `--detailed` writes the detailed report instead, without changing the compact console listing.
- `--detailed --no-html` keeps the console listing and warns. It isn't a usage error unless compression is also requested.
- Design and layout detail live in the [HTML report design guide](../docs/HTML-REPORT-DESIGN.md), not this topic.
- Detailed counts and SDK activity dates can differ from compact inventory metrics. Their evidence rules differ.
- Rejected: make detailed HTML the default or emit both reports, fail ordinary `--detailed --no-html`, and infer primary/copy ownership or safe deletion from reference order or byte counts.
- New synthetic findings: child headers and project filters can name different projects, and an enrichment read failure can miss the unreadable-source attention category.
- Work tree: 0 of 2 children done. The project-source choice needs the dev's decision before a build.
- [WI-003](WI-003-remaining-manual-acceptance.md) records later listing acceptance. [WI-041](WI-041-listing-labels.md) owns the later count-label and console-date changes.
- [WI-017](../work-log.md#wi-017) owns search duplication work. [WI-018](../work-log.md#wi-018) owns compressed delivery. Neither is migrated here.

## Original goal

Make the default listing useful for recognizing a chat, choosing a supported export selector, and inspecting its evidence without changing native storage. Add an opt-in detailed identification report without replacing the compact console or basic HTML workflow. The [old listing task](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L349), [basic refinements](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L358), [project/source work](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L364) and [detailed-report expansion](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L107) establish that scope.

Discovery and selection belong to [WI-015](WI-015-discovery-and-selection.md). Agent Markdown export and usage rules belong to [WI-019](WI-019-agent-chat-export.md). Listing presentation doesn't establish new source identity, completeness or cleanup guarantees.

## Done when

These are the criteria for the previously accepted listing work. The later exceptions below have separate children.

- Console and basic HTML share grouping, ignored categories and the optional newest-25 limit.
- Basic HTML remains the default. Detailed mode writes one detailed report and keeps the compact console.
- Reports explain unknown values, backing status, source references and supported export selectors without treating missing evidence as zero.
- Detailed reports provide ordered prompts/tasks, models, editing evidence, recorded relationships, separately labeled hints, filters, comparison and source evidence.
- Long or derived prompt previews keep the full recorded text available under redaction. Conventional reports keep evidence readable without JavaScript.
- Source details distinguish references, scoped bytes, physical files and logical database measurements. They don't recommend deletion.
- Output refuses existing files unless overwrite was requested. Report generation never opens a browser automatically.
- Required manual acceptance stays with [WI-003](WI-003-remaining-manual-acceptance.md), rather than being inferred from synthetic tests.

## Work tree

Progress as of 261104: 0 of 2 children done.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-047 Child project attribution](../work-log.md#wi-047) | [research] | S | - |
| 2 | [WI-048 Enrichment failure attention](../work-log.md#wi-048) | [build] | S | - |

## Current understanding

| Area | Checked behavior and evidence |
| --- | --- |
| CLI modes | **Inferred from source:** [argument rules](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/args.ts#L113) and [listing dispatch](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/cli.ts#L299) keep basic HTML as the default. Rich enrichment runs for detailed HTML, not for `--no-html`. |
| Shared grouping and filters | **Inferred from source:** [group keys](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-model.ts#L27) use verified source identity/scope. Local keys include the session ID and byte digest, not the title. [Console](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/console-listing.ts#L9) and [basic HTML](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/basic-listing.ts#L41) share grouping and main-row limits. |
| Ignored isn't empty | **Inferred from source:** [inventory rules](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/inventory.ts#L219) distinguish confirmed-empty, `/fix` and exact unknown `New Chat` cases. [Basic HTML](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/basic-listing.ts#L90) keeps a separate complete ignored table. [Detailed mode](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing.ts#L231) keeps all candidate cards and applies its limit through selection metadata. |
| Rich evidence and metrics | **Inferred from source:** [enrichment](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-evidence.ts#L308) checks backing bytes and recorded SDK scope. [Detailed metrics](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing-presentation.ts#L116) use rich task counts and scoped event dates, not the compact human-prompt policy. Selection and answering-model evidence remain separate in [Local turns](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-evidence.ts#L60). |
| Prompts and offline reading | **Inferred from source:** [previews](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-preview.ts#L17) keep 70 words or use the first 50 and last 20 above that threshold. [Turn rendering](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing.ts#L381) adds full redacted text for clipped or derived previews. Detailed HTML embeds a static controller with a [hash-based CSP](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing.ts#L482) and [no-JavaScript reading fallback](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing.ts#L496). |
| Search, projects and relationships | **Inferred from source:** the [controller](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing-controller.ts#L26) caches designated content and keeps occurrence-specific evidence separate. [Relationship construction](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-relationships.ts#L12) separates recorded links from best-effort copy/fork hints. These hints don't change group keys. Project attribution has the WI-047 exception below. |
| Source and storage detail | **Inferred from source:** [storage collection](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-storage.ts#L206) caches each artifact per report. [SQLite analysis](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-storage.ts#L43) uses read-only transactions and separates logical value bytes from physical measurements. [Change checks](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-storage.ts#L168) omit unstable composition. [Source rendering](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-source.ts#L131) keeps reference attribution and qualified ownership wording. This isn't an atomic backup or a reclaimable-byte estimate. |
| Attention and publication | **Inferred from source:** [attention conditions](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-attention.ts#L11) describe evidence, not deletability. WI-048 records a missing failure category below. The [HTML writer](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-report.ts#L50) refuses existing files by default and stages requested replacement. The [CLI](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/cli.ts#L315) publishes HTML before printing the console listing; changing that order is an existing Inbox proposal, not new work filed here. |

## Decisions and tradeoffs

| Decision | Chosen approach and reason | Rejected approach or boundary | Evidence |
| --- | --- | --- | --- |
| Keep a quick default | Basic HTML plus compact console. Detailed HTML is opt-in. | Rejected making detailed HTML the default or emitting both HTML reports for one request. | [Detailed-mode decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L107), [current dispatch](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/cli.ts#L315). |
| Resolve the ordinary flag conflict without losing the list | `--detailed --no-html` warns and prints the console list. | Rejected a fatal usage error for this combination. Compression has stricter rules and remains separate. | [Owner decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L109), [warning](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/cli.ts#L330), [compression validation](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/args.ts#L129). |
| Keep factual source labels | Show references, exact recorded routes, scoped/shared bytes and qualified removal impacts. | Rejected primary/copy labels based on reference order and cleanup conclusions based on size or apparent duplication. | [Approved source work](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L365), [reference display](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-source.ts#L131). |
| Keep CLI destination behavior | Default output stays in the invoking directory. Development captures use an explicit ignored destination. | Don't change the CLI default to the development artifact folder. Never open a browser automatically. | [Destination decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L446), [review-output convention](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L196), [filename helper](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-report.ts#L15). |
| Keep separate evidence rules | Rich child task counts and scoped SDK activity can differ from compact listing values. | Don't force numerical parity by dropping recorded child follow-ups or by changing the compact policy. | [Refinement rationale](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L125), [metrics helper](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing-presentation.ts#L116). |
| Keep later work separate | WI-017 records search duplication changes. WI-018 records compression. The design guide owns layout detail. | Don't turn this migration into a renderer rewrite or duplicate the guide. Compact evidence and batched insertion remain WI-012 and WI-013. | [Search work](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L206), [compression history](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L327), [design guide](../docs/HTML-REPORT-DESIGN.md). |

## Findings and outcomes

### Historical claims and later changes

- **Documented:** the [archive](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L165) records phased renderer, evidence and browser checks. Those are historical receipts, not checks rerun for this migration.
- **Documented:** [WI-003](WI-003-remaining-manual-acceptance.md#acceptance-inventory) records the dev's 261103 Code listing review. [WI-041](WI-041-listing-labels.md#decisions-and-tradeoffs) records the later accepted labels and compact local console dates. Older listing screenshots and byte-for-byte comparisons aren't today's output baseline.
- **Inferred from source:** the earlier SDK usage deferral was superseded. [Enrichment now attaches recorded SDK usage](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-evidence.ts#L434), under [WI-019's rules](WI-019-agent-chat-export.md). This isn't permission to infer credits from tokens or selected models from answering models.
- **Unknown:** this migration doesn't establish complete placeholder or child discovery coverage. [WI-007](../work-log.md#wi-007) still owns that evidence question. A passing renderer fixture doesn't prove complete discovery.

### Child project attribution

**Observed here:** a synthetic child with its own recorded `child-project` reference displayed `parent-project` in its header. Its `data-projects` filter value contained `child-project`. A control without the child's own reference inherited the parent consistently.

The [header helper](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing-presentation.ts#L42) prefers the parent for a child. The [project helper](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing-presentation.ts#L90) prefers the child's own references. The renderer uses them for [filter metadata](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing.ts#L301) and the [visible header](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-listing.ts#L340).

The guide also needs one agreed rule: [Associated project](../docs/HTML-REPORT-DESIGN.md#associated-project) describes own references before parent fallback, while [Family / relationships](../docs/HTML-REPORT-DESIGN.md#family--relationships-and-sub-agents) says child projects come from the parent. [WI-047](../work-log.md#wi-047) records the research, not an approved change to source priority.

**Owner question:** When a child has its own recorded workspace, should its header, TOC, filter and chart use that workspace, its parent's workspace, or show both? The dev decides before any build. No real-data occurrence was checked.

### Enrichment failure attention

**Observed here:** a generated journal enriched successfully. After the probe moved that fixture file aside, enrichment returned `unavailable`, with `enrichment-unavailable` and the read error. The card showed the failure, but the attention panel had no `Unreadable or changed source` category for it.

The [enrichment error path](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-evidence.ts#L469) records the failure without changing the inventory row. The [attention predicate](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/detailed-attention.ts#L38) checks `changed` enrichment or an inventory unreadable diagnostic, not this later read failure. Controls with either recognized condition produced the category.

[WI-048](../work-log.md#wi-048) covers the missing category and its filter. This isn't a claim that the diagnostic disappeared or that source data was lost. A fix must distinguish an actual read failure from ordinary unavailable metadata on an unverified reference. No real-data occurrence was checked.

## Validation and limits

- **Observed here:** the [isolated probes](../temp-tool-output/261104-1402-wi016/listing-probes.mts) reproduced both findings and checked their controls. They assert current behavior, including the defects, not successful fixes.
- Selected synthetic tests covered mode compatibility, shared grouping, ignored evidence, exact prompt-preview thresholds, rich child metrics, relationship hints, controller search/navigation, read-only storage measurements and safe publication. The [runner](../temp-tool-output/261104-1402-wi016/run-focused.ps1) fixes the selected cases and uses the repository's cache-isolating test wrapper.
- [Probe results](../temp-tool-output/261104-1402-wi016/probe-results.log) and [focused results](../temp-tool-output/261104-1402-wi016/focused-results.log) are Git-ignored local evidence. Another checkout may not have them. Test-created fixture folders were cleaned up.
- No live chat inventory, browser review, compression benchmark, full verification or build was run. Controller checks use a synthetic DOM, not a real browser. Historical performance figures weren't remeasured.
- The graph reported changed file metadata. Claims use direct source reads and synthetic checks at the named clean code revision. The archive has the same Git blob at both cited commits.
- Existing Inbox lines were left unchanged. This migration files only the two new findings above. Suggestions about existing listing ideas and the next two migrations require a separate decision.

## References

- [Pinned listing decisions](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L435), [detailed implementation](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L111), [source redesign](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L479) and [design-guide purpose](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L498).
- [HTML report design guide](../docs/HTML-REPORT-DESIGN.md), [WI-015 discovery](WI-015-discovery-and-selection.md), [WI-003 acceptance](WI-003-remaining-manual-acceptance.md) and [WI-041 labels and dates](WI-041-listing-labels.md).
