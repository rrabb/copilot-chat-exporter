# Changelog

All notable changes to this project are documented here.

## [0.1.0] - Unreleased

### Added

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

- No-argument CLI invocation now lists instead of exporting an implicit newest/current session.
- Library resolution requires an explicit source or explicit `current: true`; duplicate UUIDs, conflicting current/root evidence and wrong-format journal paths fail instead of selecting a guessed source.
- Short UUID prefixes select a Local journal only when the prefix uniquely matches; collisions and repeated workspace IDs fail safely instead of selecting arbitrarily.
- Preserve tool result structures that do not fit the readable text-result path instead of
	silently discarding them.
- Merge late `resultDetails` updates and avoid duplicating input or text output already rendered in
	dedicated sections.
- Stop presenting current working-tree file lengths as edit statistics when historical patch details are unavailable.

### Known limitations

- SDK Markdown rendering/current selection, default filter parity, offline HTML and shared fidelity/redaction/companion rendering are still in progress.
- VS Code's journal is a private, undocumented format and can change without notice.
- Resource, transcript, model, and memory stores are optional best-effort enrichment.
- Redaction is best effort and is not a compliance or secret-scanning control.
- npm registry publication is intentionally disabled with `private: true`; use a folder copy, git dependency, or packed tarball.
