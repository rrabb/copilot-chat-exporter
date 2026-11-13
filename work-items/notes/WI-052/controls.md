# LOD control catalogue

Preserved 261113. These are research ideas, not implemented flags or approved defaults. Keep the current detailed export as the default. Use independent controls, not named whole-export profiles.

Source: the saved WI-052 proposal catalogue. No raw chat text is included. Illustrative examples are not literal transcripts.

## Proposed controls

| group | control | values | recommendation | benefit | risk |
| --- | --- | --- | --- | --- | --- |
| Core | Detailed default | Existing behavior | Keep unchanged | Existing exports and automation keep their meaning. | Do not relabel today's export as lossless or claim pending fidelity flags exist. |
| Core | Prompts and replies | Keep; optional future role filter | Keep as core content in the first phase | A reader can follow the conversation. | System-initiated requests and hidden turns need separate classification. Do not remove instructions embedded in ordinary user text by pattern. |
| Tools | Tool selection | All; include exact tools; exclude exact tools | Support exact stable identity, with unknown names reported | User chooses specific noisy tools. | Aliases and renamed tools can make a rule stop matching. Report unmatched selectors. |
| Tools | Tool input detail | None; short; medium; complete | Independent of result detail | Calls can remain understandable without pages of arguments. | Input can include code, full delegated prompts, paths or credentials. Redact before extracting excerpts. |
| Tools | Tool result detail | None; short; medium; complete | Independent of input detail | Covers all calls with no results and compact-result requests. | An empty result is not the same as a deliberately excluded result or missing source. |
| Tools | Per-tool override | Exact tool identity -> input/detail/result/attachment settings | One canonical rule per tool | File reads can be short while failures and edits stay complete. | Do not introduce a full rule language before simpler selectors prove insufficient. |
| Tools | MCP origin filter | All; MCP only; non-MCP only; per recorded server/tool | MCP as subset, not second output stream | Covers MCP-only calls with or without responses. | A name prefix does not prove MCP transport. Origin can be missing or serialized differently. |
| Tools | Tool call line | Recorded description plus identifying arguments and status | Deterministic short representation | Matches requested one-line summaries. | Display descriptions can omit actual arguments. Label excerpted commands and never call them the full executed command. |
| Tools | Errors and cancellation | Keep status; short/full error evidence | Keep visible even when normal results are disabled | A failed call cannot look successful. | Needs approval as a result-filter exception. Error messages may contain sensitive text. |
| Tools | Repeated lifecycle updates | Current merge rules; future delta summary | Keep current identity/order rules | Less duplicate status/output. | Never deduplicate by matching text alone or combine different call IDs. |
| Tools | Progress and asynchronous output | None; milestones; complete recorded updates | Research separately from final results | Reduces repeated command polling. | A late failure or new output can occur after an initial tool response. |
| Files | File reads | None; one-line path/range; preview; complete | Treat as a semantic role with exact-tool overrides | Directly supports one-line reads and no reads. | Shell/MCP tools may also read files. Static command parsing cannot reliably classify arbitrary programs. |
| Files | Search results | Query only; query/count/paths; excerpts; complete | Separate queries from result bodies | Search often dominates long exports. | Missing matches and zero matches must not be confused. Preserve whether a result was truncated upstream. |
| Files | Edits and patches | Paths/status; summary; complete recorded patch | Keep distinct from file reads | Shows changes without all patch text when desired. | A path list cannot reconstruct edits. Never generate old file contents from today's working tree. |
| Files | Edit review actions | Summary; complete available records | Inventory accept/reject/undo separately | Distinguishes proposed edits from accepted edits. | Recorded edit intent does not prove final disk contents or developer acceptance. |
| Reasoning | Readable reasoning | None; complete; optional excerpt | First phase: on/off, no invented summary | Supports all/no reasoning. | A recorded model-written summary and a full thinking block are not equivalent. Keep source labels. |
| Reasoning | Opaque reasoning | Count/reason only | Never export opaque continuation tokens as readable thought | Explains unavailable reasoning. | Cannot decrypt or reconstruct. Not a richer selectable detail level. |
| Questions | User questions and answers | Title + answer; question/options + answer; complete structured exchange | Dedicated category, not just another tool-result blob | The short form can show the decision clearly. | Answers can be in tool results, question-carousel state, or later user turns. Preserve free text, skipped/cancelled and unanswered separately. |
| Questions | Question UI data | Hide layout; keep options/selected labels/validation as available | Do not require UI decoration for readable answers | Avoids noisy schemas. | MCP elicitation form data and a custom ask_user tool have different schemas. |
| Agents | Sub-agent conversations | Delegation line; recorded result summary; complete verified nested conversation | Separate delegation input from child transcript detail | Large child traces can be shortened selectively. | A returned summary is not a full transcript. Parent-child mapping must stay verified. |
| Agents | Delegation prompt | Short description; excerpt; complete | Default remains complete under current policy | Helps explain a child's assignment. | Changing the current always-complete child-prompt rule needs approval. |
| Agents | Agent metadata | Name/role; model/effort/timing; supported extra fields | Keep identity labels on any retained child output | Reader knows which agent acted. | Do not assign parent usage, effort or model to a child without recorded attribution. |
| Context | Instructions | Recorded references; excerpt; complete recorded content | Separate system/developer/project/user instructions where source distinguishes them | Allows less instruction boilerplate. | Loaded instructions may be absent from persisted records. Do not read current files to claim historical content. |
| Context | Skills and custom agents | Invocation/name only; recorded description; complete loaded content | Separate discovery, invocation and injected text | Shows workflow choice without repeating long instructions. | Reading SKILL.md does not prove a runtime skill invocation. Custom-agent definitions can contain private text. |
| Context | Memory | Operation/title; recorded content; complete supported payload | Separate read/write/delete/vote from loaded context | Explains memory influence and state-changing operations. | Graph lookup, saved Copilot memory, AGENTS.md and compaction are not one memory format. Never query current memory to reconstruct the past. |
| Context | Attachments and references | Labels/URI/range; excerpt; complete recorded text | Separate attached content from assistant citations | Documents input context. | Paths can be private. A link does not prove the bytes were recorded or are available now. |
| Context | Compaction and context transfer | Marker; summary; complete recorded compaction | Keep boundary visible | Explains a discontinuity in later replies. | A compaction summary is not the missing original conversation. |
| Media | Images and screenshots | Metadata/reference; linked bytes; future inline display | Keep current companion behavior as default | Control large visual evidence independently. | Image pixels bypass text redaction. Binary inclusion and inline presentation are separate choices. |
| Media | Audio/video/non-image data | Metadata; recorded transcript; supported companions | Inventory now; defer extraction beyond current policy | Makes documented upstream types visible as future work. | Documented MCP audio support does not prove local persistence or exporter support. Do not decode arbitrary payloads by default. |
| Media | MCP resources and structured output | Resource identity; selected fields; complete recorded structured content | Keep content blocks, structuredContent and errors distinct | Avoids flattening structured responses into unreadable text. | Resource links differ from embedded resources. Do not fetch a URI while exporting offline. |
| Presentation | Code blocks and diagrams | Keep; references/excerpts in non-default mode | Keep complete by default | Code and Mermaid often carry the main answer. | Naive line clipping breaks fences, indentation, tables and diagrams. |
| Presentation | Citations and references | None; labels/targets; complete recorded citation metadata | Keep source links with retained statements | Maintains evidence behind an answer. | Removing citations can leave claims unsupported. Link safety/trust metadata is not prose. |
| Presentation | Structured UI output | Plain summary; supported semantic rendering; recorded JSON fallback | Inventory trees, commands, plans, reviews and notebook edits separately | Captures content beyond Markdown prose. | UI widgets can carry decisions. Generic JSON fallback is not the same as a semantic renderer. |
| Presentation | Collapse state | Expanded; collapsed by category | Separate from LOD | Less scrolling without losing content. | Collapsed Markdown is still present, searchable and potentially private. |
| Artifacts | Companion-file policy | Current preview + full companion; future no companion for excluded content | Make exclusion apply to newly generated companion files too | A smaller export bundle is actually smaller. | Leaving a hidden full companion defeats content exclusion. Do not delete earlier exports or caches. |
| Metadata | Models, modes and effort | None; per-turn labels; complete supported records | Separate selected model from recorded answering model | Explains routing and model changes. | Auto/Fusion records vary by version. Unrecorded effort must remain unknown. |
| Metadata | Usage and credits | None; session summary; turn/agent detail; supported raw metadata | Keep source and coverage labels with any numbers | Reduce cost tables independently. | Never add cumulative checkpoints, mix Local units with nano-AIU, or treat missing as zero. |
| Metadata | Timing | None; timestamps/duration; detailed intervals | Keep recorded timing distinct from export time | Less turn-header noise. | Waiting, execution and wall-clock durations differ. Stable rendering needs an explicit context. |
| Diagnostics | Warnings, source gaps and exclusions | Short summary plus detailed manifest | Do not offer a silent mode that removes accountability | Readers know what lower LOD removed. | Counts need units: events, calls, text blocks, images and bytes are not interchangeable. |
| Diagnostics | Hooks, permissions and model snapshots | Keep existing exclusions; optional future research | No inclusion change in the first phase | Avoids reopening unrelated fidelity policy. | Can duplicate conversation or expose secrets. Documented events are not automatically export content. |
| Configuration | Settings file and rule priority | Default < global category < exact per-tool override; final exclusion wins within one resolved rule | Proposed ordering only; decide before implementation | Many per-tool choices are easier to reuse than a long command. | Ambiguous include/exclude precedence can silently hide data. Reject contradictory rules rather than guessing. |

## Short, medium and complete illustrations

| tool | short | medium | complete |
| --- | --- | --- | --- |
| view | view: AGENTS.md, requested lines 1-100; completed; result excluded | Recorded invocation plus path/range and a bounded preview, labelled as an excerpt | All supported recorded input and result, with today's overflow companion policy |
| codebase-memory-mcp-search_graph | search_graph: pattern *listing* in project C-_DEV-vsc-chat-tool; completed; result excluded | Pattern, project, filters and reported match/page counts, when actually recorded | All recorded query arguments and returned content, including coverage warnings |
| powershell | powershell: Inspect both projects and existing changes; command excerpt: Get-ChildItem ...; exit 0 | Recorded command, working directory, status and labelled output excerpt | Original/display commands where recorded, output/deltas, errors, exit code and duration |
| ask_user | ask_user: question title -> recorded selected label / free-text answer / skipped / unanswered | Question text, options and recorded answer, omitting layout metadata | Supported recorded form and response, with outcome and provenance |

## Design rules

- MCP calls are tool calls. Do not render a call twice because both selectors match.
- Separate content selection, detail level, collapse state and companion-file inclusion.
- None, short, medium and complete describe content detail, not whole-export profiles.
- Complete means all supported recorded content for that category, not raw-source completeness.
- Use recorded invocation descriptions or deterministic arguments. Do not add a summarizing model call.
- Keep call identity, order, status, errors, cancellation and exclusion counts intelligible at reduced detail.
- Classify by recorded provenance and payload first. Tool-name matching is a fallback and must be labelled.
- Do not infer missing history, fetch current instruction files, dereference remote attachments or decrypt opaque reasoning.
- Redaction and privacy are independent. Hiding an inline block while retaining its companion does not remove its data.
- Unknown new types still need drift reporting. An exclusion rule must not silence an unsupported format.

## Questions before implementation

1. When results are excluded, should errors still show a short message, or status only?
2. Should short and medium use fixed lines/bytes, category-specific fields, or user-set limits? No thresholds approved.
3. Does no file reads mean excluding returned file contents, hiding read calls, or both?
4. Which recorded fields establish MCP origin across Local and SDK sources?
5. Should excluded full content be absent from new companions, while frozen source captures remain independent diagnostics?
6. How should missing user answers and unsupported event types affect reduced-detail verification?
7. Which loaded instruction/memory/skill records actually survive in each source, and which are just references?
8. How should exact tool aliases, unmatched selectors and contradictory overrides be reported?

## Proposed phases

| stage | work | effort | notApproved |
| --- | --- | --- | --- |
| 1 - Agree semantics | Review examples, category inventory and default behavior. Decide whether errors override result exclusion. | Small research/design phase | No CLI syntax or code changes. |
| 2 - Small coherent implementation proposal | Tool input/results, MCP selection, reasoning, questions and exact per-tool overrides, with exclusion accounting and saved-file verification. | Medium to large; estimate after tracing both renderers | No permission to implement yet. |
| 3 - Optional extension | Semantic file/search roles, instructions/skills/memory, structured widgets, richer media and reusable configuration. | Several separate items if selected | Do not bundle these into the first implementation. |
