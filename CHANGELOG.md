# Changelog

All notable changes to this project are documented here.

## [0.1.0] - Unreleased

### Added

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
