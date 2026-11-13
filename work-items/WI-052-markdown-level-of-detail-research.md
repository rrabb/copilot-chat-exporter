# WI-052 Markdown export Level of Detail research

## At a glance

- **Goal:** research independent controls for Markdown export content and detail, without implementing them.
- **Default:** keep the current detailed Markdown export unchanged.
- **Direction:** individual include/exclude switches, with short, medium and complete detail available per tool. No named whole-export profiles.
- **Evidence:** compare official documentation and public source with a bounded sample of Local and Agent Host/CLI chats.
- **Deliverables:** an HTML research report, reproducible type inventories and several current-format Markdown exports under `temp-tool-output/`.
- **Boundary:** record proposals, not approved CLI syntax or new rendering behavior.
- **Produced:** a searchable HTML report, 24 public sources, 56 online type entries, 41 candidate controls and six current-default exports.
- **Preserved:** [full research bundle](notes/WI-052/README.md) includes the searchable HTML, original proposals/public-source notes, complete sanitized census/findings, scripts and synthetic examples. Six real export bundles have separate ignored private copies.
- **Next:** the developer reviews the report and examples, then accepts the research or names gaps. Implementation needs separate approval.

## Original goal

On 261113, the developer requested online research into VS Code, Copilot, GitHub source and other relevant primary sources. Compare those findings with past Local and agent-hosted chats. List the input, output, tool, attachment and response formats encountered. Suggest export Level of Detail (LOD) controls, including per-tool choices. Select long, varied chats and export them for joint review.

This is a separate research item. It does not resume all of [WI-004](WI-004-fidelity-policy-research.md), authorize implementation, or approve changing established exclusions.

## Done when

- Official documentation and pinned public source support a cited inventory, with public API and private persistence formats distinguished.
- A bounded Local and Agent Host/CLI survey records its scope, source provenance and every type encountered within that scope.
- An HTML report separates documented types, observed types, proposals and unknowns.
- Several varied chats are exported with today's default behavior. Export and verification failures are labelled, not hidden.
- Every developer suggestion below is considered, including overlaps and risks.
- Findings, proposed next steps and open decisions are recorded here.
- The developer accepts the research.

## Research checklist

| Request | Research question |
| --- | --- |
| Keep detailed default | Which controls can be added without changing an ordinary export? |
| MCP calls and responses | Can recorded tool origin distinguish MCP reliably, without relying on names alone? |
| MCP calls without responses | Can input, output, errors and attachments be controlled separately? |
| All tools with or without results | What does "all" mean when MCP is a subset of tool calls? |
| All tools and MCP calls | Avoid duplicate categories and duplicated output. |
| All/no reasoning | Distinguish recorded readable reasoning, summaries, opaque tokens and missing evidence. |
| `ask_user` | Keep question title, choices, free text, skipped state and recorded answer together where available. |
| Per-tool short/medium/complete | Define deterministic representations and exact tool identity before choosing syntax. |
| One-line calls | Show action and identifying arguments without pretending an excerpt is complete. |
| One-line/no file reads | Separate built-in reads from shell commands and MCP tools that can also read files. |
| Agent instructions | Distinguish loaded content, references, system context and user-authored prompt text. |
| Agent memory | Separate recorded memory reads/writes, loaded instructions, graph results and session compaction. |
| Agent skills | Distinguish discovery, invocation, instructions loaded and ordinary file reads. |
| Other chat content | Inventory edits, citations, structured views, questions, images, progress, agents, usage and diagnostic events. |

## Decisions and tradeoffs

- **Developer direction, 261113:** individual switches rather than named whole-export levels.
- **Developer constraint, 261113:** keep current Markdown as the detailed default.
- Lower detail must be labelled as intentional exclusion or shortening. It must not be reported as complete source coverage.
- Collapsing content changes presentation, not what the archive contains. Excluding content must also consider linked companion files.
- Short call descriptions should use recorded descriptions and deterministic argument extraction, not invented summaries.
- A tool can read files, execute commands and return images in one call. Classification must allow unknown or mixed roles.
- Privacy, redaction and unsupported-event handling remain separate policies. Lower LOD is not a privacy guarantee.
- Existing permission/hook exclusions and opaque-reasoning exclusions are not reopened by this research.

## Evidence and limits

Durable research: [preserved notes](notes/WI-052/README.md). Original private output remains in the ignored research run linked from that index.

Session text and personal source paths belong in the ignored research output, not this tracked topic. Source stores remain read-only. Source/API declarations are not proof that an equivalent record was persisted in the sampled chats.

### Local survey findings

**Observed here, 261113:** the bounded survey covers 32 sources. It records 14 Local response variants, 52 SDK event types and 101 called-tool names. Local replay gives 438 final requests and 33,916 response positions from 4,018 mutation records. The SDK survey contains 71,411 events and 9,360 distinct started tool-call IDs. These are different units, not an additive conversation total.

Six current-default Markdown examples were exported. Five pass saved-file verification. One SDK stress case fails Layer D and is kept as a failed artifact. A targeted check also finds one of five recorded answer strings unmatched in the Local question-answer example, even though its general verification passes. Passing verification is therefore not proof of complete question-answer export.

All 32 surveyed source hashes stayed unchanged during the run. Insiders metadata was discovered but its sessions were not sampled. Sanitized type/tool inventories and sample outcomes are preserved in the notes. Private inventories, sample identities, hashes, exact commands and 114 companion files stay in the ignored report folder.

The compact report lists 259 encountered tool names, including schemas, reference records and mirrors. Only 101 names occur in the actual-call inventories. These are different populations, not a revised tool-call count. All three exported SDK examples have verified Agent Host mappings from retained provider metadata. Other surveyed SDK origins remain unchecked.

### Public-source findings

**Documented:** the online inventory contains 56 entries across 24 primary sources. Entries include fully read definitions, partially read definitions and names encountered in exports. Their caveats remain visible. Sources cover VS Code documentation, pinned VS Code/Copilot source, the official Copilot SDK event reference, GitHub Copilot Memory and the MCP specification.

The SDK reference distinguishes model-facing result text, detailed display content and structured content blocks. It also distinguishes durable events from ephemeral live events. An offline export cannot recreate live-only questions, deltas or per-call usage that were never recorded. The checked SDK reference describes a newer version than several sampled logs, so its fields are candidates, not promises about historical data.

**Inferred from source:** the top-level serialized VS Code union includes a generic progress wrapper. Its nine top-level members are not nine total persisted response kinds. Do not infer missing tools or warnings from that union alone. A component-manifest dependency also does not establish which runtime executed a sampled chat.

**Recommendation:** begin with independent tool-input and result detail, exact per-tool overrides, MCP origin selection, readable reasoning on/off and question/answer representations. Keep current defaults, error/status clarity and exclusion accounting. Defer shell-based read inference, a full rule language, extra media decoding and reopened hook/permission policy.

### Validation boundary

`pnpm run verify` stops on one pre-existing public-document privacy-test failure in a dashboard evidence link. The same link is present in `HEAD`; this research did not introduce it. The separate `pnpm run golden` check passes. No production exporter code, tests or rendering defaults changed.

The HTML builder and report checks pass: all 41 controls appear, local evidence links resolve, IDs are unique and the offline search script parses. Browser checks confirm search narrows results, Clear restores them, the page fits its viewport and no external resources load.

### Preserved review material

- [Preserved HTML report](notes/WI-052/report.html): the original report layout rebuilt with sanitized full research data and repaired local links.
- [Complete preservation inventory](notes/WI-052/PRESERVATION.md): what is kept, redaction/count-conservation rules and private-backup limits.
- [Original proposals](notes/WI-052/ideas.json): complete proposal data, not just the prose summary.
- [Original public-source findings](notes/WI-052/online/findings.json), [narrative](notes/WI-052/online/report.md) and [symbol list](notes/WI-052/online/vscodeTypes-export-list.txt): full research and follow-up caveats.
- [Full census](notes/WI-052/corpus/census.json) and [full findings](notes/WI-052/corpus/findings.json): complete structural inventories with anonymized private keys/locators and unchanged bucket/source occurrence totals.
- [Full report catalogue](notes/WI-052/corpus/report-summary.json): preserves the selected field/type paths omitted from the first preservation pass.
- [Sample guide](notes/WI-052/examples/README.md): portable synthetic Local/SDK exports, source fixtures, generation checks and guidance for the six ignored private original bundles.
- [Script guide](notes/WI-052/scripts/README.md): report rebuild, preservation checks and historical research recipes.
- [Research index](notes/WI-052/README.md): findings, preservation boundaries and links to the original local examples.
- [Findings and interpretation](notes/WI-052/findings.md): recommendations, corrections and evidence limits.
- [Control catalogue](notes/WI-052/controls.md): all 41 proposals, illustrations, tradeoffs and open questions.
- [Public-source research](notes/WI-052/source-research.json): 24 sources, 56 type entries, version evidence and gaps.
- [Observed inventory](notes/WI-052/observed-inventory.json): distinct response/event/tool/discriminator names, counts, units and sanitized sample outcomes.
- [Repository format background](notes/WI-052/repository-formats.json): curated request/response/tool structures with historical-documentation caveats.

The original temporary run remains unchanged. The six real Markdown/companion bundles now have hash-checked private copies outside temporary output. Those copies are ignored by Git and still need a separate private backup. Raw native source captures/databases are not copied into tracked notes. The complete sanitized report/research data and synthetic examples are usable without temporary output.

## Candidate controls

These are ideas, not approved switch names or implementation scope. The [preserved control catalogue](notes/WI-052/controls.md) keeps the full comparison, rationale and risks.

| Category | Candidates | Main caution |
| --- | --- | --- |
| Core conversation | Keep current default. Keep prompts/replies. Consider role filters later. | A system-initiated request can still affect later conversation. |
| Tool selection | All, exact include/exclude, MCP only, non-MCP only, recorded server/tool identity. | MCP is a subset of tools. Names alone do not prove origin. |
| Tool inputs | None, short, medium, complete, with exact per-tool overrides. | Arguments may contain source code, full task prompts or private text. |
| Tool results | None, short, medium, complete, separately from inputs. | Excluded, empty, missing and upstream-truncated results need different labels. |
| Tool status | Keep identity/status. Decide short/full errors and cancellation exceptions. | No-results output must not make a failed call look successful. |
| Streaming | Milestones, asynchronous updates, repeated lifecycle records and terminal deltas. | Never deduplicate different calls by text similarity. |
| Reads and searches | No reads, one-line path/range, excerpts, complete reads; queries/counts/paths/excerpts for searches. | Shell and MCP calls can mix reading, execution and edits. |
| Edits | Paths/status, summary, full recorded patches; separate review, acceptance, rejection and undo evidence. | Proposed patches do not establish final disk contents or acceptance. |
| Reasoning | Readable on/off, optional excerpts. Opaque reasoning stays count/reason only. | Recorded summaries and complete thinking blocks are different evidence. |
| Questions | Title plus answer, question/options plus answer, complete supported structured exchange. | Keep free text, selected labels, skipped, cancelled and unanswered distinct. |
| Agents | Delegation line, result summary, verified nested conversation; separate prompt and metadata detail. | Existing always-complete child prompts need a policy decision before reducing detail. |
| Instructions | References, excerpt or complete recorded system/developer/project/user instructions. | Do not reread current files to claim historical loaded content. |
| Skills/custom agents | Discovery, invocation, description and loaded instruction content as separate choices. | A file read alone does not establish runtime invocation. |
| Memory | Operation/title or recorded payload. Distinguish read/write/delete/vote, graph results and loaded context. | Saved memory, instructions and compaction are not one format. |
| Context | Attachment labels/URI/ranges, recorded text, citations, follow-ups and compaction markers/summaries. | References do not prove historical bytes are available. |
| Media/MCP content | Image references/companions; audio/video metadata or recorded transcript; text, images, resources, resource links and structured output. | Upstream type support does not establish persistence or exporter support. Never fetch remote resources during export. |
| Assistant presentation | Code/diagrams, citations, trees, plans, reviews, commands, notebook edits and other structured views. | Naive excerpts can break Markdown or remove a recorded decision. |
| Metadata | Model/mode/effort, timing, session/turn/agent usage, extra supported fields. | Keep source/unit/coverage labels. Unknown is not zero. |
| Archive presentation | Collapse state, inline display, previews and generated companion inclusion. | Collapsing does not remove data. Exclusion must consider new companions too. |
| Diagnostics | Exclusion manifest, source gaps, representation changes, schema drift and warnings. | Do not allow silent loss accounting. Keep existing hook/permission/snapshot exclusions. |
| Reusable settings | Global defaults, category rules and exact tool overrides, with reported unmatched selectors. | Decide priority and reject contradictory rules before implementing a rule system. |

### Short, medium and complete

- **Short:** recorded action/description plus identifying arguments and status. For a read, show path/range. For a question, show title and recorded outcome.
- **Medium:** category-specific fields and a labelled bounded excerpt. Exact limits are undecided.
- **Complete:** all supported recorded content for that category, retaining existing companion rules. This does not claim raw-source completeness.

Use recorded descriptions and deterministic field extraction, not another model call to summarize history. Redact before extracting a shortened representation.

### Questions before building

1. If results are excluded, should errors show a short message or status alone?
2. Does "no file reads" remove calls, returned file contents, or both?
3. How do recorded Local and SDK fields establish MCP origin and exact tool identity?
4. Which limits define medium detail without breaking code, tables, diagrams or Unicode?
5. Should excluded content also be absent from newly generated companions? Frozen diagnostic captures remain a separate policy.
6. How should verification check selected content without treating deliberate exclusions as missing source content?
7. Which instruction, skill and memory evidence survives in each source?
8. How should exact tool aliases, unmatched selectors and contradictory overrides behave?

## Next review

Start with the [preserved findings](notes/WI-052/findings.md) and [controls](notes/WI-052/controls.md). If the local artifacts remain available, compare one long Local example with one long Agent Host example and review the question-answer/Fusion stress cases separately. Then accept the research or request specific gaps. Choose the first implementation scope and resolve error/result behavior before changing code. No switch implementation or item closure is approved.
