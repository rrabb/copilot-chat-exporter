# Changelog

All notable changes to this project are documented here.

## [0.1.0] - Unreleased

### Added

- Generated Brotli asset verification normalizes notice-file line endings so LF and CRLF checkouts produce identical embedded assets.

- Machine-readable `--verify --json` reports and a reproducible corpus runner, including source-change checks and detection of base64-like strings at 64 KiB. Verification uses a pinned, dev-only Markdown parser; an unavailable parser fails strict verification. SDK fence repairs are reported and gated like Local.
- Git-status snapshots use content-sized fences so recorded backticks cannot end their code block.
- Inline references keep their recorded labels and stay inline inside code; Layer D scores reference names.
- Layer A ignores tool IDs from replaced request slots. Carousel labels matching their values count once. Same-ID cross-turn copies with no new content become continuation notes; new content and hidden tools remain visible.
- Known-kind output checks include a reviewed missing-tool-content representation, counted separately as `tool-no-content`; unfamiliar records fall back to JSON and fail strict.
- Fence repairs keep list and blockquote prefixes, and fence whitespace no longer treats BOMs as indentation. Unclosed comments and script/style/textarea/pre tags outside code are escaped and recorded without failing strict.
- Public examples and tests use synthetic identifiers, with a privacy guard. No session data or Git history is changed.

- Local UUID and prefix selection now searches both workspace journals and empty-window journals. Duplicate IDs still require an exact `.jsonl` path; missing IDs explain how to list sessions and choose the correct user-data root.
- Unknown Local response kinds are kept as collapsed, redacted JSON only, held until an open code fence closes, with companion files for payloads over 300 lines OR 15 KiB. They remain visible in the schema census and fail strict verification until reviewed. Layer C checks that each block round-trips through `JSON.parse`.
- `markdownVuln` response items render semantically: their text joins the surrounding run so code blocks stay continuous, and their warnings follow the run, labeled as unvalidated.
- Layer D scores adjacent text fragments joined into whole lines (`assistant-text-joined`), so short fragments next to code are checked.
- Optional `--detailed --compression gzip|brotli` output, with `--compressed` preserved as a gzip alias: standalone compressed HTML with the complete overview/Session TOC visible before evidence decoding, queued filters/links, same-document insertion and explicit unsupported/corrupt-file messages. Brotli uses quality 8, embeds a build-only WASM decoder and notices, and checks stream completion, byte count, CRC32 and UTF-8. Conventional HTML remains the default and retains no-JS evidence reading. No runtime npm dependency, iframe, CDN or records/renderer redesign; basic HTML is unchanged.
- Compressed-report re-save resilience: deterministic content-derived CSP nonces with retained hashes, single-line ASCII loader/decoder scripts, correctly encoded Unicode shell/CSS and whitespace-tolerant payload/WASM base64. Actual-CSP Chrome/Edge regression tests cover format-only re-saves, literal script text, corruption and rejection of script elements, event handlers and javascript URLs; generated-asset verification checks the pinned decoder/WASM without rewriting stale output. The CLI warns when explicitly requested Brotli is larger than gzip without switching codecs.

- Detailed listing: agent chats (Agent Host, delegated agents, Copilot CLI) now show credits and tokens like Local chats do: per-turn and per-chat chips with the basis stated (per-call rows, `from totals`, `turns a-b`, `partial rows`), a disclosure with the last logged total, per-call coverage and a by-model table. The console listing no longer says agent export is unsupported.
- Agent credits per turn from running totals: for chats with no per-call usage rows (most of them), each turn gets the difference between consecutive checkpoint totals, labelled "from running totals", with a range when one checkpoint covers several turns; the Cost section lists the five most expensive turns and a table of all turns, and output tokens are shown where messages record them. Example: the turn that cost 81.57 credits is now visible in this chat's export.
- Agent usage and credits: per model, per turn and per delegated agent, as AI credits (recorded nano-AIU / 1,000,000,000; 1 credit = $0.01, verified on 247 of 247 logged calls against the recorded rates and GitHub's published prices). Sources: the Copilot CLI store `~/.copilot/session-store.db` (read-only), else `model.model_call_success` events, plus the last logged running total. Calls are matched to turns by time and to agents by agent id; unmatched calls are shown with their credits. The Cost section states the source, usage rows against assistant replies and the share of the logged total; nothing recorded shows "not recorded", never zero. Credits are never estimated from tokens.
- Tool text over 300 lines and over 15 KiB (terminal output, tool input and results, detailed results, tool-result JSON, file patches) now shows its first 10 lines and links a companion file with the full text, for Local and agent exports. The old 24 KiB head-and-tail clip is gone; library callers without a companion folder keep the full text inline. `--verify` reads the newest sibling companion folder. On the real data this removed all 4 partial agent tool errors (24 agent chats, 61,771 pieces: 0 absent, 0 partial, 61 companion files in total, at most 15 per chat) and cut Local partials from 141 to 43. The content check also no longer reports a false partial for prompts that contain quote markers.
- Agent export: sub-agent conversations are nested inline at the delegation point (collapsed, labelled, with summary), SDK exports show "not exported" instead of zero usage, the detailed listing marks exportable agent chats with a copy-ready command, and the content check is about 9 times faster.
- Agent Host and Copilot CLI export (main conversation): `copilot-chat-export <chat id | backing id | prefix>` reads the SDK `events.jsonl` through the existing verified-source identity and writes the same rich Markdown as Local chats: prompts, readable reasoning, assistant messages, tool calls with readable arguments, outputs, errors and diffs, compaction summaries and model/mode/plan notes. System prompts, skill files and images are saved as linked companion files; permission prompts, hook records, model request copies and external-tool duplicates are counted and left out. Event types outside the kept and left-out lists are reported as drift. See `docs/SPEC.md` for the approved policy. Modules: `src/session/sdk-session.ts`, `sdk-export.ts`, `src/sdk-cli.ts`, `src/verify/sdk-loss-account.ts`.
- `--verify` on an agent chat prints the event census and an independent content check. On the 23 real agent chats of the development machine (52,970 pieces of content) none was missing and 5 were partial.
- Markdown renderer: note blocks (collapsed or one line), an "Intent" line and a "Detailed result" block for tools, and Turn info rows for reasoning recorded, attachments and injected context.
- `--verify` Layer D: an independent recorded-content check (`src/verify/loss-account.ts`, `buildLossAccount`). It does not call the classifier or renderer; it reads the raw requests and reports, per category, how much recorded text is present, partial or absent in the Markdown (per line for tool and terminal output). `--verify --strict` fails on absent content. On the development corpus it measured the Local export's real gaps: request-error messages, warnings and clipped outputs are lost or partial; answers and reasoning are present.
- Project goal and source capability matrix in README and SPEC.
- Detailed report size reduction: DOM-backed cached investigative search replaces duplicated card/occurrence search corpora; only missing exact model/file values use supplemental `data-search`. Short reference markers keep workspace/source/artifact/diagnostic matches occurrence-specific. Full collapsed prompts remain searchable, generic UI text is excluded, and content-redundant tooltips are omitted without removing explanations or copy-button accessible names. Basic HTML and native-store behavior are unchanged.
- Inventory now reads chats saved by windows with no folder open: `globalStorage\emptyWindowChatSessions` journals plus the same chat index key in `globalStorage\state.vscdb`. They are tagged `provenance.store = 'empty-window'`, shown as "(empty window)" with no invented project, and include Agent Host and Copilot CLI references saved from such windows. The legacy `workspaceStorage\no-workspace` folder was already covered as an ordinary store. `transferredChatSessions` is deliberately excluded (short-lived duplicate). A missing global database is not reported as noise.
- Detailed report "Needs attention" panel: collapsed by default with per-condition count chips; expands to a table of observed conditions (unresolved backing, unsupported provider key, ambiguous mapping or child scope, journal without index entry, unreadable or changed source, parent or fork source outside the inventory, audit notes) with qualified wording and a Show button that filters to exactly the counted chats. Informational only; no deletion advice.
- `autoModeResolution` journal records (which model Auto picked, in both the newer `resolved` and older flattened shapes) are parsed into `turn.scalar.autoModelResolutions` and shown as an "Auto resolved model" row in the Markdown turn-info table. The kind moved from the known-unseen list to the handled list, so it no longer raises a schema-drift warning.
- The unified evidence table dropped its constant `Field` column (it always read `Location`); columns are now Artifact, Value, Size / state, Tied to, Purpose and Potential impact if removed.
- Consolidated detailed Why/source: health/audit cards, factual workspace-reference labels, compact evidence chain with conditional lineage, storage summary and one collapsed unified artifact table with nested per-reference technical identity. Different child IDs, derived references without an index row, shared backing and unresolved mappings remain explicit; no primary/copy attribution or safe-deletion verdicts.
- Cached read-only storage measurements: SQLite page/free-page and logical UTF-8/blob value sizes, largest workspace-state keys, JSONL recorded-type/mutation byte composition, related-directory composition, database sidecars/backups and report sharing counts. Scoped bytes are separate from whole files. Changed/unreadable analyses report diagnostics and omit unreliable composition.
- Bold abbreviated storage sizes with regular small Arial Narrow exact comma-separated byte counts; shortened path prefixes, full-value copy controls and file links. Historical comparison HTML is preserved in an ignored reference archive.

- Detailed report: two-line TOC (bold number, project name, last updated `MMDD-HH:mm`, `N w/s refs`, edit chip), an inclusive project/workspace/folder filter with Multiple/No recorded project categories, a non-additive chats-per-project chart, and disambiguated duplicate folder names. New newcomer guide `docs/CHAT-SESSION-LOCATIONS.md`.
- Local session and per-turn credit/input/output-token chips with independent coverage and labelled partial totals; a dedicated usage disclosure explains provenance and unavailable SDK correlation.
- Compact Arial Narrow titles/chips, one chip per answering-model list, created/updated icons with tooltips and user-selected child/history/hint/cancellation/Agent Host icons.
- Detailed report presentation round 3: `rem`-based type scale on a 125% root; `⬆️~15.4M ⬇️~730k` token chips; `?`/`??`/`???` instead of the word unknown (reason in tooltips); `N refs` in the TOC with Arial Narrow titles; themed buttons and filter chips; `icon label: value` lines for sections with nothing or one line; collapsed artifact locations; no repeated full prompts when only whitespace differs; `MD` in chips; bold header dates with the updated date omitted when equal to created; 🔝 for the card TOC link; Arial Narrow model-switch links. Fixed a double `?` for unknown payload and a `(0)` audit count that ignored diagnostics.
- Rounded whole-number credits, abbreviated `k`/`M` token chips (nearest, for example `⬆️~15.4M ⬇️~730k`) with `~` for partial values, and an unavailable-usage chip that replaces the credits/tokens disclosure in the expanded card (in normal flow, not right-aligned). Unknown model chips are omitted. Tentative fork/copy hints use `⑂?` in the amber hint tone; the `N w/s refs · 1 conv` chip is bold magenta. Compare/Link/TOC are small Arial Narrow controls at the top right of the expanded card.
- Detailed report review fixes: correct singular/plural labels, TOC grid without overlapping columns and duplicate numbering, semantic summary-chart colors with card-matching type labels, readable symbol glyphs, non-Local audited-byte wording, artifact counts, and no repeated `Selected` chip when it equals the answering model.
- Type-colored, natively collapsed detailed cards with two metadata subheaders, a top session TOC, icon controls and colored turn/edit/credit/effort pills.
- Early list-based title provenance, compact date provenance with collapsed prompt timestamps, comma-formatted payload sizes and no redundant full-prompt disclosures for short complete text.
- Separate `--detailed` offline identification report with ordered/full prompt text, model/Auto/effort evidence, title/date provenance, historical file-change/editing-history details, artifacts and exact scoped SDK sizes.
- Verified family/peer/recorded-fork navigation and explicitly unproven copy/fork hints; grouped/occurrence views, full-text filters/ranges, model-switch timeline and two-chat summary comparison.
- Separate evidence, edit parsing, relationship, basic/detailed rendering, shared HTML, style and controller modules; hash-authorized detailed controller with offline CSP and native no-JavaScript readability.
- Detailed report names are distinct from basic names. `--detailed --no-html` warns and keeps only the compact listing. Existing default console/basic report behavior and publication safety are preserved.

- Full-width HTML source panels with grouped identity/workspace/file cards, accessible expand/close controls, and session-paired sorting/filtering in both session tables.

- Refined HTML listing with local `YYMMDD_HH:MM` dates, compact Arial Narrow dates/selectors, bold prompt counts, complete linked workspace/source details, and a separate collapsed ignored-session table.

- Shared staged archive writer with complete companion byte verification, timestamped collision-safe assets, failure cleanup and explicit `--overwrite` for Local Markdown.
- Shared redaction detector with category/count/location accounting for future fidelity planners; full renderer policy integration remains pending.
- Exact Agent Host/Copilot CLI SDK backing verification, persisted peer-origin checks and child-scope inventory expansion with immediate-parent evidence.
- Explicit default-chat provider-ID fallback warnings and `🟠 ❓` ambiguous-child indicators; main identity remains available when independently verified.
- Strict UTF-8/stable SDK event reads with complete raw field retention and integrity metadata; SDK rendering remains pending.
- Explicit `--user-data-root` selection, interactive root chooser and non-interactive ambiguity errors.
- Root-scoped journal/index inventory with retained index-only/provider occurrences and read/identity diagnostics.
- Compact grouped console listing with created/activity dates, scope-specific prompt counts, filtered/duplicate totals, `--show-ignored`, `--last25`, and listing-only `--full-ids`.
- Listing now shows chat type and copyable unique UUID prefixes; unknown-metadata `New Chat` placeholders are hidden by default and restored with `--show-ignored`.
- Listing now generates a self-contained offline HTML report by default, with search, sorting, filters, inventory charts, copyable selectors, source/status explanations and a linked storage guide. `--no-html`, `--html-output`, and explicit `--overwrite` control report writing; the report is never auto-opened.
- Export-policy/source/artifact contracts and tested 10/100-line presentation helpers; renderer/companion integration remains pending.
- Replay of VS Code Copilot Chat JSONL journals into a project-owned session model.
- Rich Markdown archives with prompts, assistant text, reasoning records, tool calls, file edits, resources, token usage, and timing.
- Schema census, three verification layers, strict mode, portable golden fixture, and local session snapshots.
- Strict TypeScript checks for production and test code with Node's built-in test runner.
- Bundled CLI and importable API with generated TypeScript declarations.
- `--install-skill <targetRoot>` for installing the Copilot skill and prompt into another repository.
- MIT license and GitHub/GitLab CI templates.
- Shape-based compatibility for arbitrary built-in, extension, MCP, user-defined, external, and
	agent-host tool IDs without a closed tool-name registry.
- Complete `resultDetails` retention with generic Markdown rendering for URI/location results,
	non-text embeds and references, MCP metadata, errors, serialized data, and future fields.
- Optional transcript-backed `apply_patch` enrichment with linked file paths, submitted addition and deletion counts, and collapsible syntax-highlighted diff fragments.

### Fixed

- A non-text response item inside a code block no longer closes the fence early. Unbalanced fences close only at the end of a turn; an early close is reported and fails `--strict`. A close at the end of a turn is recorded as a representation change and does not fail `--strict`.
- Fence tracking in the renderer and in Layer C now recognizes `~~~` fences as well as backtick fences. A closer must use the same character and be at least as long as the opener. This removes three Layer C `<details>` false positives in the real corpus. The edit-preview strips stay backtick-only, because the exporter writes those fences itself.
- The classifier's validated-version label now names VS Code 1.141.2 (commit 16507d91) / Copilot Chat 0.69.0, the version bundled in that build's `resources/app/extensions/copilot/package.json`.
- Detailed subagent headings now use real titles from alternate workspace references or uniquely bound recorded delegation descriptions/names instead of a synthetic agent UUID. Parent workspace and fallback titles remain presentation-only.
- Detailed `--show-ignored` no longer duplicates complete ignored cards in both main and ignored sections.
- Detailed headers, filters, initial ordering and TOC now use all recorded child task/follow-up entries and latest exact-scope SDK event activity. The compact console's existing prompt-count policy remains unchanged.
- No-argument CLI invocation now lists instead of exporting an implicit newest/current session.
- Library resolution requires an explicit source or explicit `current: true`; duplicate UUIDs, conflicting current/root evidence and wrong-format journal paths fail instead of selecting a guessed source.
- Short UUID prefixes select a Local journal only when the prefix uniquely matches; collisions and repeated workspace IDs fail safely instead of selecting arbitrarily.
- Preserve tool result structures that do not fit the readable text-result path instead of
	silently discarding them.
- Merge late `resultDetails` updates and avoid duplicating input or text output already rendered in
	dedicated sections.
- Stop presenting current working-tree file lengths as edit statistics when historical patch details are unavailable.

### Known limitations

- SDK Markdown rendering/current selection, broader default filter parity and shared fidelity/redaction/companion rendering are still in progress. Basic and detailed offline HTML listings are available; private formats and broader discovery coverage remain limited.
- VS Code's journal is a private, undocumented format and can change without notice.
- Resource, transcript, model, and memory stores are optional best-effort enrichment.
- Redaction is best effort and is not a compliance or secret-scanning control.
- npm registry publication is intentionally disabled with `private: true`; use a folder copy, git dependency, or packed tarball.
