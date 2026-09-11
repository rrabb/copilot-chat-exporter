# Changelog

All notable changes to this project are documented here.

## [0.1.0] - Unreleased

### Added

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

### Fixed

- Preserve tool result structures that do not fit the readable text-result path instead of
	silently discarding them.
- Merge late `resultDetails` updates and avoid duplicating input or text output already rendered in
	dedicated sections.

### Known limitations

- VS Code's journal is a private, undocumented format and can change without notice.
- Resource, transcript, model, and memory stores are optional best-effort enrichment.
- Redaction is best effort and is not a compliance or secret-scanning control.
- npm registry publication is intentionally disabled with `private: true`; use a folder copy, git dependency, or packed tarball.
