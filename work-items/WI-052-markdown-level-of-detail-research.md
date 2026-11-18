# WI-052 Markdown export Level of Detail research

## At a glance

- **Goal:** research independent controls for Markdown export content and detail, without implementing them.
- **Default:** keep the current detailed Markdown export unchanged.
- **Direction:** individual include/exclude switches, with short, medium and complete detail available per tool. No named whole-export profiles.
- **Evidence:** compare official documentation and public source with a bounded sample of Local and Agent Host/CLI chats.
- **Deliverables:** an HTML research report, an interactive offline [LOD casebook](notes/WI-052/private-examples/casebook/presentation.html), an offline [format workbench](#format-workbench-261115) ([WI-058](../work-log.md#wi-058)), reproducible type inventories and several current-format Markdown exports.
- **Boundary:** record proposals, not approved CLI syntax or new rendering behavior.
- **Produced:** a searchable HTML report, 24 public sources, 56 online type entries, 41 candidate controls and six current-default exports. The casebook adds 11 scenarios and 18 tool comparisons: 14 real examples and four labelled synthetic fallbacks.
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

## Work tree

Progress as of 261117: 0 of 6 descendant items done. WI-058 has five repair children below.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-058 LOD format workbench](#format-workbench-261115) | [build] | M | - |
| 2 | [WI-062 Workbench choice safety](#choice-safety-repairs-261116), part of WI-058 | [build] | M | - |
| 3 | [WI-063 Workbench catalogue accuracy](#catalogue-accuracy-repairs-261116), part of WI-058 | [build] | M | - |
| 4 | [WI-064 Keep workbench backups](#backup-and-evidence-policy-261116), part of WI-058 | [build] | S | - |
| 5 | [WI-065 Complete workbench evidence](#backup-and-evidence-policy-261116), part of WI-058 | [build] | S | - |
| 6 | [WI-066 JSONL record boundaries](#scanner-record-boundaries-261117), part of WI-058 | [build] | S | - |

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
- **Developer clarification, 261117:** allow optional named CLI presets alongside individual controls. Apply the preset first, then individual overrides. Without either, keep current output unchanged. See [WI-067's decision and examples](WI-067-exporter-lod-config.md#cli-decision-261117). Format model and implementation remain unapproved.
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

## Interactive casebook 261115

The developer approved an interactive offline presentation using real examples from recent retained captures. Synthetic examples fill gaps where suitable real examples weren't selected. This extends the research, not the exporter.

Open the [LOD casebook](notes/WI-052/private-examples/casebook/presentation.html). Start with the developer's scenario, then compare the tool formats and recent fixture lessons. The file embeds its data and doesn't load network resources automatically. Evidence links use saved inputs under WI-052, including the shared frozen private corpus.

| Part | What it demonstrates |
| --- | --- |
| Scenario lab | Eleven starting scenarios apply independent controls. These aren't proposed named whole-export CLI profiles. The developer's example keeps prompts, messages, intermediate updates, readable reasoning and complete question exchanges, with short ordinary tools. |
| Real examples | Fourteen selections cover Local and SDK questions, file reads, searches, commands, polling, patches, documentation lookup, browser checks, delegation, skills and queries. Four labelled synthetic fallbacks cover graph warnings, structured MCP resources, images and question states. |
| Format choices | Three short layouts, two medium layouts and two full layouts. Question choices and recorded answers stay complete even in medium semantic JSON. Full JSON keeps selected input, result and any additional raw question state. |
| Conversation boundary | Ten source-ordered selected blocks from one agent capture. These aren't a continuous turn or complete chat. Supplemental examples from other sources stay separate. |
| Fixture and audit lessons | Missing file bodies aren't empty results. Tool completion doesn't establish process success. Delegation receipts aren't child history. Prefix notes don't create user turns. Routing fields aren't aliases. Catalogue prices aren't charges. Equal source-distinct text isn't a duplicate. |
| Coverage boundary | The bounded map has scoped evidence for 205 of 389 rows. It isn't a global semantic-coverage percentage. Full detail can't restore missing history, upstream clipping or unsupported content. |
| Overflow | The retained threshold checks require both more than 300 lines and more than 15 KiB. The complete redacted companion remains distinct from its ten-line preview. This doesn't fix persisted-resource clipping. |
| Privacy | The HTML still embeds its full selected examples after targeted presentation redaction. Hiding content doesn't remove those bytes or certify safe publication. The file and its private source captures need separate backup. |

Source hashes and selected-record hashes are locked in the [private evidence manifest](notes/WI-052/private-examples/casebook/evidence-manifest.private.json). Mining, building and validation scripts live beside the presentation. The original research and casebook archive remain unchanged.

**Migrated 261117:** `temp-tool-output\261115-0224-wi052-lod-casebook\` → `work-items\notes\WI-052\private-examples\casebook\`. Unchanged originals and validation reports are saved in sibling folder [casebook-261115-0224](notes/WI-052/private-examples/casebook-261115-0224/). Dependencies are saved locally and mapped in the working casebook's [inputs.private.json](notes/WI-052/private-examples/casebook/inputs.private.json).

Three captures use the shared corpus. Thirteen smaller inputs have frozen copies beside the working scripts.
The fixture guide's historical bytes were recovered from Git and match the original hash.
Restricted-filesystem rebuilding passes without access to original temporary files.
Only source links changed in the generated data. The eighteen examples, eleven scenarios and selected content match the archive.
Browser checks covered scenario selection, detail controls, search and repaired link targets.
See the [working casebook guide](notes/WI-052/README.md#working-private-casebook-261117) for commands, validation and privacy limits.

Validation checks source order, inventories, source links, escaping and script/style hashes. Browser checks cover scenario controls, overrides, question preservation, all full input/result pairs, format choices and searches. Desktop and a measured 390-pixel viewport passed. Restrictive-CSP fallback reading keeps all comparisons and source links. An isolated engine-disabled browser context wasn't available. The settings-download payload matched the displayed recipe, but actual file saving wasn't tested. Original results are archived in [final browser checks](notes/WI-052/private-examples/casebook-261115-0224/browser-final-checks.json), [view checks](notes/WI-052/private-examples/casebook-261115-0224/browser-view-checks.json) and [static validation](notes/WI-052/private-examples/casebook-261115-0224/static-validation.json). Repository verification passed in the archived [saved log](notes/WI-052/private-examples/casebook-261115-0224/repository-verify.log).

No exporter behavior, default, CLI flag, fixture or native session store changed. The presentation doesn't fix the recorded Local question-answer export gap.

## Format workbench 261115

Found while working on the casebook. The developer wanted to see how each tool, event, response and question kind looks. They also wanted to type their own short and medium format for each. [WI-058](../work-log.md#wi-058) tracks the page. How to run it and where each file lives: [notes README](notes/WI-052/README.md#lod-format-workbench).

| Part | Result |
| --- | --- |
| Names | 700 rows merged from the scanned chats, public SDK types, CLI docs, VS Code source and the earlier 259-name inventory. Suggested default: 431 show, 269 hide. |
| Examples | After the 261116 privacy replacements, 331 names have recorded examples. Three have only privacy replacements. Another 142 have documented-field skeletons, and 224 have none. |
| Formats | Templates with `{field}` placeholders, suggested per group. Your edit overrides one name or its whole group. Saved to `lod-format-choices.json`, which the page loads on start. |
| GUI column | Local rows are inferred from source (`chatService.ts` at the pinned commit). Agent rows are mostly unknown. No screenshots exist. Each row has a slot for your own. |

Evidence limits:

- **Scan scope (observed here):** 117 Local journals (2026-03-03 to 2026-11-12) and 71 agent session files (2026-05-18 to 2026-11-15). The chat that built the page was excluded.
- **One agent family:** recorded events can't tell Agent Host, Copilot CLI and SDK sessions apart.
- **Origin** (built-in, MCP, unknown) comes only from recorded evidence, never from a name.
- **17 recorded SDK event types** aren't in the public SDK types at the pinned commit. They may be internal or newer.
- **Privacy:** the built page embeds redacted, size-capped examples, so it stays in the ignored `private-examples` folder. Tracked files hold no chat text.
- **Browser checks (observed here):** all 700 detail panels opened without errors. Edit, colour change, Save through the helper server, reload, file picker, draft restore and the unsaved-changes warning were exercised in Chromium. Opening the page from disk wasn't tested because the browser tool blocks `file:` URLs. The download-only fallback is inferred.
- **Not built:** a separate group editor panel. Edit a group's formats through any row with the scope set to "Whole group".
- **Suggestions only:** no exporter code reads the choices file.
- **Scanner finding:** Local `toolCallRounds` ids and `toolCallResults` keys carry a `__vscode-<n>` suffix that the response part's `toolCallId` lacks. The scanner strips it. Whether the exporter loses data on it is an open Inbox question.

### Privacy replacements 261116

The developer approved replacing whole military-domain examples with labelled synthetic equivalents for WI-058. Eight examples were replaced in the derived scan, then the catalogue and HTML were rebuilt. The remaining 507 recorded examples and all observed counts were unchanged.

Replacements keep field structure, tool identity, matching references and failure flags. They remove surrounding recorded text, numbers and source metadata. They are no longer recorded evidence. Three names now have only privacy replacements, which explains the recorded-name count changing from 334 to 331.

The scanner applies the rule before clipping, and the builder applies it to older example inputs. The [sanitizer](notes/WI-052/catalogue/sanitize-scan.mjs) updates an older derived snapshot without reading or changing source chats. The [validator](notes/WI-052/catalogue/validate-workbench.mjs) checks the four generated artifacts and replacement behavior.

Other real conversation excerpts and cross-project paths still need publication review. This change doesn't approve staging, committing or changing ignore rules. It doesn't sanitize earlier research captures or exports.

### Choice safety repairs 261116

[WI-062](../work-log.md#wi-062) is part of WI-058. The developer approved fixing the review findings in phases, starting with protecting saved choices.

Approved behavior:

- Remove per-field limits for formats and notes.
- Keep the 5 MiB limit for file imports and server saves. Measure serialized UTF-8 bytes.
- Show an interactive warning when a file exceeds that limit. Keep current choices and allow Download copy.
- Keep backup retention unchanged until a separate decision, now covered by WI-064 below.

Implemented:

- Save records the submitted snapshot, not edits made while the request runs. Later edits stay unsaved with a refreshed recovery draft.
- The Save button and keyboard shortcut cannot start overlapping requests in one page.
- Failed saves leave the saved timestamp unchanged.
- Long formats and notes survive normalization, serialization and recovery without shortening.
- Backups use exclusive creation with sequence numbers to avoid same-second overwrites.
- Recovery-storage failures show a message rather than silently losing the fallback.

Observed here: focused synthetic regressions pass through the actual page functions and server validation/backup functions. Filesystem tests use isolated temporary choices, not the developer's saved file. The private page was rebuilt and its static validator passes. `pnpm run verify` passes, including both typechecks and the golden check.

Limits: these checks don't repeat the earlier browser acceptance run. Separate tabs can still overwrite each other's choices. Catalogue-accuracy repairs are covered by [WI-063](../work-log.md#wi-063). WI-064 below changes backup retention. WI-065 restores complete recorded evidence. Prose-checker scope remains follow-up work.

The [choice-safety tests](../test/lod-workbench.test.ts) run with `pnpm test test\lod-workbench.test.ts`. User-facing saving rules are in the [notes README](notes/WI-052/README.md#saving-your-choices).

### Catalogue accuracy repairs 261116

[WI-063](../work-log.md#wi-063) is part of WI-058. The developer resumed the second repair phase and approved these behavior choices:

- Sort Seen by scanned chats containing each name. Keep occurrence counts separate. Rank groups by their most widely seen member.
- Add a real Reviewed state. Accepted also counts as reviewed. Edited remains a separate flag.
- Offer Not reviewed, Not accepted, Reviewed but not accepted, Accepted and Edited filters.
- Use a dropdown for Not reviewed, Reviewed and Accepted. Accepting doesn't require a separate Reviewed action.
- Reset review when effective short/medium formats or show/hide settings change. Group changes affect only rows whose effective content changes. Notes keep review.
- Store a format/settings fingerprint so changed suggestions also reset review after reload. Warn about imported marks without a matching fingerprint.

Implemented repairs also show the previously omitted Local session-field counts, nonzero exits in short shell suggestions and persistent aggregate scan diagnostics. The original derived scan recorded three apparent parse failures in one source. [WI-066](#scanner-record-boundaries-261117) identifies and fixes their cause.

Observed here: focused synthetic regressions, static validation and `pnpm run verify` pass. The catalogue and page rebuild from the existing derived snapshot without rescanning or changing source chats. The saved choices file wasn't changed.

Chromium checks exercised the real page with an isolated in-memory choices server. Review filters, approval reset after editing, overlapping Edited/Accepted membership and save/reload all passed without script errors. The scan warning remained visible after reload. The recorded nonzero shell example also renders its exit code in the actual short suggestion. Tool success remains separate from command exit status.

The [validation folder](../temp-tool-output/261116-2244-catalogue-accuracy/) keeps logs and desktop screenshots, including the [review controls](../temp-tool-output/261116-2244-catalogue-accuracy/review-accepted-edit.png). These screenshots show the workbench, not the Copilot GUI.

Scope limits: this phase doesn't change backup retention, restore clipped examples, fix prose-checker scope or revise writing guidance. The workbench remains research only. No exporter code consumes its choices.

### Backup and evidence policy 261116

The developer approved keeping every choices backup, with no automatic deletion ([WI-064](../work-log.md#wi-064)). Unique backup names remain.

The developer chose complete redacted examples embedded in the HTML, collapsed until opened ([WI-065](../work-log.md#wi-065)). Separate full-evidence files were rejected as unnecessary complexity for this sample.

Recovery must keep the selected examples and observed counts. Read only the original journals/event logs. Check each recovered value against its saved original hash. Label missing or changed records unavailable. Keep redaction, labelled binary omissions and whole-example military-domain replacements. Complete examples remain private, not approved for publication.

Observed here before recovery: 84 examples have clipping metadata, across 31 source chats. Their original serialized values total about 5.4 MiB. The existing derived scan no longer contains their complete values. The page also has a separate 200,000-character display cap to bypass for complete evidence.

Implemented and observed here:

- The helper server keeps every backup. An isolated regression kept 32 distinct same-second backups, including the earliest versions.
- Recovery restored all 84 examples with matching original hashes. It read 34 source files for 31 chat identities. Some Local journals have duplicate copies.
- The frozen scan's counts, selected previews and source manifest are unchanged. Repeating recovery from a frozen copy produced identical evidence.
- The recovery pass reported no source, parse or replay errors. This doesn't remove the original survey's three parse warnings.
- Complete values stay collapsed. Their renderer bypasses the display cap. The HTML grew from 2.85 MiB to 6.40 MiB.
- Complete examples report 276 omitted base64-like fields. This is a heuristic, not proof of binary content. No additional military-domain replacements were needed.
- An isolated Chromium check loaded the actual HTML from disk and opened 2,109,428 rendered JSON characters without shortening. No script errors occurred. The observed startup check took about 0.4 seconds, not a performance guarantee.
- The actual choices file's hash is unchanged. No check wrote to the developer's choices or backups.

Focused regressions, static page checks and `pnpm run verify` pass. Tests cover unavailable evidence, hash mismatches, redaction, privacy replacements and complete text, arrays and objects. Redaction now keeps fields whose keys become identical after masking.

The first full run hit a Windows file-lock error during repeated atomic renames in the expanded backup test. The retention test now exercises backup creation directly. It still checks actual saves separately. Production save-error handling wasn't changed.

The [validation folder](../temp-tool-output/261116-2313-evidence-policy/) keeps frozen inputs, measurements, recovery logs, full verification and an offline-browser screenshot. The larger HTML and backups still need separate private backup. The workbench remains research only.

### Scanner record boundaries 261117

[WI-066](../work-log.md#wi-066) is part of WI-058. The developer approved investigating the warning, fixing the reader and refreshing the catalogue.

Observed here: the affected Local journal is valid JSONL. Its second record contains two Unicode line separators (`U+2028`) inside recorded web content. Node 24.18.0's `readline` splits on these characters. The scanner therefore treated one valid mutation as three invalid fragments and skipped the whole result. A synthetic example reproduces the failure. No chat source needs repair.

The scanner now separates records at LF (newline), keeping Unicode separators inside JSON strings. Both Local and agent readers use this streaming helper. CRLF, blank lines and frozen byte boundaries still work. The final record doesn't need a trailing newline. Genuinely invalid JSON still contributes to the warning.

The refresh used the original 188 source files and recorded byte boundaries, not newer chats. A comparison pass using the old reader reproduced the saved counts, field inventories and source diagnostics. Source-prefix hashes matched between old-reader and fixed-reader passes. This confirms repeatability here, not a historical whole-source hash guarantee.

| Measured change | Before | After |
| --- | --- | --- |
| Apparent parse failures | 3 | 0 |
| Journal replay errors | 0 | 0 |
| Other scan problems | 0 | 0 |
| Local requests with a result field | 1,591 | 1,592 |
| Web-fetch `query` field observations | 193 | 195 |
| Web-fetch `urls` field observations | 193 | 195 |

Tool-call counts and the 700-name catalogue are unchanged. The refresh keeps saved examples when their selected source values match. It also keeps the eight matching privacy replacements. Embedded evidence, suggested formats and the saved choices file match the previous page exactly. All 84 complete examples remain available.

The regression failed before the reader change and passed afterward. Full verification and static page validation pass. An integrated-browser check opened the rebuilt HTML from disk. It showed the corrected result count and no visible scan warning.

The [validation folder](../temp-tool-output/261117-0014-scan-boundaries/) keeps frozen inputs, comparison scripts, source-prefix hashes and measurements. It also keeps verification and browser results. The exporter parser wasn't changed. Other data-quality warnings remain enabled.

On 261117, the developer approved removing hostname-derived metadata before committing the workbench. The collector and saved public inventory now keep only platform and Node version in their machine metadata. A static publication check guards those allowed fields. This removes an unnecessary machine identifier without changing catalogue rows, evidence or format choices. Private examples and HTML still need separate backup and publication review.

### Resume point

Catalogue-accuracy implementation and validation are complete. WI-063 and WI-062 still need acceptance. Restart the helper server and reload the page to review the dropdown, filters, count units and scan warning.

WI-064 and WI-065 are implemented and verified. Review the rebuilt page's complete evidence and the keep-all backup policy. WI-062 and WI-063 still need acceptance. No item was closed. Prose-checker scope and writing-guidance inconsistencies remain separate follow-ups.

WI-066 fixes the reported scan warning. Reload the page and check that the warning is gone. The earlier repairs still need acceptance.

## Next review

Start with the [format workbench](notes/WI-052/README.md#lod-format-workbench) ([WI-058](../work-log.md#wi-058)): browse the kinds, edit the short and medium formats you want, and save. Then open the [interactive casebook](notes/WI-052/private-examples/casebook/presentation.html), especially the developer's scenario, decision ledger and failure investigation. Compare the question formats and error behavior before choosing controls. Consult the [preserved findings](notes/WI-052/findings.md), [controls](notes/WI-052/controls.md) and long Local/Agent Host exports for the wider evidence. Then accept the research or request specific gaps. Implementation scope, medium limits and exclusion rules need separate approval. No switch implementation or item closure is approved. The possible build that follows, including the format model choice (slots, templates or both), is in [WI-067](WI-067-exporter-lod-config.md).
