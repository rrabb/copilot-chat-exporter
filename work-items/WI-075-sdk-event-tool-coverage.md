Part of [WI-019](WI-019-agent-chat-export.md).

# WI-075 SDK event and tool coverage inventory

## At a glance

- **Goal:** measure which Local, Agent Host and Copilot CLI events and tools the exporter covers.
- **Scope:** private native inventory, public definitions, exporter handling and a proposed synthetic fixture matrix.
- **Status:** research only. No new native scan or fixture implementation starts yet.
- **Priority:** medium. WI-074's generic fallback prevents silent omission of newly seen SDK event types.
- **Parent:** [WI-019](WI-019-agent-chat-export.md).
- **Related:** [WI-052](WI-052-markdown-level-of-detail-research.md), [WI-054](WI-054-fusion-census-and-golden-fixtures.md) and [WI-074](WI-074-sdk-schema-drift-compatibility.md).

## Original goal

Create a complete, reviewable coverage picture for the event and tool names that the project can observe.

The result must distinguish:

| Population | Meaning |
| --- | --- |
| Exporter-known | The exporter has a reviewed handler, structural use, marker rule or intentional omission |
| Publicly documented | A public SDK type or official source defines the event or field |
| Native-observed | A native Local or Agent Host/CLI record appeared in an accessible source |
| Unknown | The inventory cannot assign a reviewed meaning or handling policy |

The work isn't a claim that every future event, MCP tool or producer version can be known.

## Existing evidence to reuse

| Source | What it contributes | Limit |
| --- | --- | --- |
| [WI-052](WI-052-markdown-level-of-detail-research.md) | Saved Local and SDK inventories, LOD research, scripts and findings | Selected corpus and research choices, not a complete current native census |
| [700-row format workbench](notes/WI-052/private-examples/catalogue/format-workbench.html) | Merged event, response, tool, question and public-type names | Private page with capped/redacted examples. It isn't exporter test coverage |
| [Interactive casebook](notes/WI-052/private-examples/casebook/presentation.html) | Eleven scenarios and eighteen tool-format comparisons | Presentation evidence, not a complete event lifecycle fixture |
| [LOD report](notes/WI-052/report.html) | Research conclusions, type inventories and related proposals | A historical research snapshot, not a fresh producer scan |
| [WI-052 observed inventory](notes/WI-052/observed-inventory.json) | Distinct names, counts and sanitized observations | Reuse and compare. Don't relabel it as current |
| [WI-052 full census](notes/WI-052/corpus/census.json) | Field paths, counts and frozen source evidence | Large saved corpus, not all accessible current chats |
| [WI-054](WI-054-fusion-census-and-golden-fixtures.md) | Fixed-window SDK/Fusion census, compatibility matrix and five golden views | Scoped to Fusion and an older fixed window |
| [WI-074 inventory command](../scripts/sdk-schema-inventory.ts) | Path/type/count inventory for one exact SDK event file, without values or bodies | One source at a time. It doesn't inventory tools or discover all roots |

The first research step is to reuse and reconcile these artifacts. A new scan runs only after their inventory format and coverage limits are understood.

## Recommended design

Use a private inventory, a tracked matrix and several small synthetic sessions.

### 1. Private inventory

Inventory without copying conversation text:

- Event names from Local and SDK records.
- Field paths and value types.
- Tool names from requests, execution starts and completions.
- Tool-specific data kinds and result-detail kinds.
- Question and sub-agent identities.
- Producer/version evidence and source hashes.
- Missing, malformed, duplicated and unreadable sources.
- Counts by physical source, without adding duplicate histories into one chat total.

The report keeps values only when they are safe, bounded enum or configuration observations. Prompt, reasoning, tool output and arbitrary strings stay out.

### 2. Coverage matrix

Create one row per event, field variant or tool-rendering family:

| Column | Purpose |
| --- | --- |
| Identity | Event type, field path or tool family |
| Evidence | Native line counts, public reference and WI-052/WI-054 prior art |
| Current disposition | Handle, count, use structurally, intentionally omit, unsupported or unknown |
| Output behavior | Inline, note, companion, marker, counted omission or diagnostic |
| Verification | Layer D category, parser check, structural check or none |
| Existing test | Exact focused or golden assertion |
| Missing case | Smallest useful synthetic scenario |
| Limit | Privacy, source, version or semantic uncertainty |

Tool IDs with the same rendering contract don't each need a separate golden. They still belong in the inventory and matrix.

### 3. Synthetic fixture families

Do not create one chat containing every event and tool.

Use small compatible sessions:

- Session lifecycle and boundaries.
- Assistant messages and readable reasoning.
- Ordinary tools grouped by renderer contract.
- Questions, answers and sub-agents.
- Fusion workflows and failure paths.
- Usage, billing and transport telemetry.
- Instruction, notice, retry and model-change records.
- Unknown, malformed and unsupported defensive cases.
- Local-only response and journal variants.

Keep conflicting versions, impossible lifecycles and exceptional failures in separate streams.

## Important decisions

- **Do not define complete as every possible future extension.** Extensible MCP tools and private producers make that impossible.
- **Define complete as every observed or public-reviewed identity classified, with clearly named unknowns.**
- Don't accept current output automatically as correct.
- Don't copy private chat bodies into committed fixtures.
- Don't turn one inventory value into a blanket schema approval.
- Don't mix identical byte copies, forks or resumed logs into a single usage or event total.

## Research questions

1. How much of the 700-row WI-052 catalogue is still current after WI-074?
2. Which public SDK events aren't in the native corpus, and which native event types aren't public?
3. Which tool IDs use the same rendering contract?
4. Which matrix rows already have direct tests and which rely only on snapshots?
5. Which Local records can map to the same conceptual rows without claiming identical storage formats?
6. Which unknowns need a handler, an approved omission, or only a kept diagnostic?
7. What fresh window or set of roots gives useful coverage without producing unmanageable private evidence?

## Phases

1. **Reconcile existing evidence.** Compare WI-052, WI-054, WI-074, current public types and exporter code.
2. **Review matrix design.** Present counts and missing categories before building fixtures.
3. **Run a current private inventory.** Use an approved fixed window and exact roots.
4. **Propose fixture families.** Stop for developer review before creating them.
5. **Implement approved fixtures.** Add semantic and negative checks after separate approval.
6. **Handoff.** Update docs, limits, rerun commands and acceptance evidence.

## Done when

- The private inventory covers every approved root and reports discovery, read, parse and time-window limits.
- Every observed event type and tool identity appears in the matrix.
- Public-only and native-only identities remain distinct.
- Every row has a disposition or a named unknown.
- The matrix names current assertions and missing checks.
- Fixture families are reviewed before creation.
- No private conversation body enters tracked fixtures.
- A reproducible rerun command and frozen output hashes are recorded.
- `pnpm run verify` passes after any approved fixture additions.
- The developer accepts the research and separately approves implementation.

## Evidence and limits

The WI-052 workbench has 700 rows. It merges 431 shown and 269 hidden suggestions.

The suggestions come from scanned chats, public SDK types, CLI docs, VS Code source and an earlier 259-name inventory.

It has useful prior art, but it is not a guarantee of current exporter coverage:

- Some rows are display suggestions.
- Some rows have no recorded example.
- Some public types have no native observation.
- Seventeen recorded SDK event types were outside the pinned public SDK types during that research.
- The saved examples can contain private data and must remain ignored.

WI-075 must keep these facts separate. A row in the workbench isn't automatically a tested exporter contract.
