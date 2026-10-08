# Copilot Chat Exporter Guidance

This repository builds a Node.js CLI and library that export VS Code Copilot Chat sessions as deterministic Markdown archives. Preserve recorded information faithfully, keep compatibility with evolving private VS Code storage formats, and make missing optional data explicit rather than fabricating it.

## Local Guidance

- Follow [.github/instructions/code-style.instructions.md](instructions/code-style.instructions.md) for project-owned TypeScript and JavaScript.
- Follow [.github/instructions/documentation-style.instructions.md](instructions/documentation-style.instructions.md) for Markdown, comments, JSDoc, and user-facing text.
- Follow established repository patterns when generic guidance conflicts with this project.
- Keep changes focused. Do not reformat unrelated code or documentation.
- Save development/review reports, runtime captures, test output logs, and validation logs under the project-root `temp-tool-output/` directory. Use timestamped filenames or run folders and preserve earlier outputs for user review. For listing runs, pass `--html-output` explicitly; do not change the CLI's default working-directory behavior. Automated fixture sandboxes and their normal cleanup remain unchanged. Keep private generated artifacts out of commits.

## Precise Terminology

- Do not use `shape` or a `Shape` suffix in function names, interface names, type names, variable names, parameter names, property names, comments, documentation, user-facing text, or chat when a more precise term is available.
- Name a value by its role or contract, not merely by the fact that it has fields. Prefer terms such as type, interface, structure, schema, contract, record, tuple, payload, response, state, model, format, variant, or result.
- Reserve `shape` for a quoted external API term, array or tensor dimensions, JavaScript engine object layouts, or an established public identifier that cannot be changed within the task.
- Follow the replacement table in [.github/instructions/documentation-style.instructions.md](instructions/documentation-style.instructions.md) and the naming rules in [.github/instructions/code-style.instructions.md](instructions/code-style.instructions.md).
- Same thing goes for the usage of 'surface' in names, explanations, and docs; prefer more precise terminology.

## Runtime And Package Boundaries

- Node.js 22.18 or newer is required because source TypeScript runs directly through Node type stripping.
- The package is ESM and uses strict TypeScript with `moduleResolution: "nodenext"`, `verbatimModuleSyntax`, `isolatedModules`, and `erasableSyntaxOnly`.
- Preserve `.ts` extensions in source imports.
- Keep runtime dependencies at zero unless a dependency provides a clear, reviewed benefit that cannot reasonably be implemented with Node built-ins.
- `src/cli.ts` is the only source module that may print output or terminate the process. Keep library modules callable in-process.
- Treat `dist/` as generated output. Change source and run `npm run build`; do not hand-edit bundles or declarations.

## Source Of Truth And Compatibility

- `chatSessions/<sessionId>.jsonl` is definitive for conversation order, prompts, reasoning records, tool calls, assistant text, edits, and per-turn metadata.
- Sibling stores such as transcripts, resources, debug logs, title indexes, and memory files are optional enrichment. Their absence must not prevent a journal export.
- Match optional records to journal records by stable identities such as `toolCallId`; optional stores must not create or reorder turns.
- VS Code's stored session format is private and can change. Parse external records into project-owned types at the boundary, retain unknown structured payloads when practical, and report unsupported variants through the schema census instead of silently dropping them.
- Preserve response-stream order. Do not move tool calls, reasoning, edits, or assistant text into type-based buckets.
- Deduplicate repeated tool lifecycle records by identity while merging later status and result fields into the first recorded position.
- Do not reconstruct unavailable history from current working-tree state. Label missing evidence explicitly.
- Keep rendering deterministic. Values that vary by run or machine, including the clock, output path, and Git status, must enter through renderer context rather than being read during rendering.
- Apply redaction and bounded clipping to newly rendered raw content. Preserve enough head and tail context to diagnose clipped output.

## Project Map

| Path | Responsibility |
| --- | --- |
| `src/cli.ts` | Command-line entry, user-visible output, and process exit behavior |
| `src/index.ts` | Public library entry and load, render, and serialization orchestration |
| `src/session/` | Journal replay, node classification, optional store loading, and enrichment |
| `src/markdown.ts` | Markdown rendering from project-owned parsed models |
| `src/verify/` | Structural, journal, and rendered-output verification |
| `src/types.ts` | Exporter-owned parsed model and shared contracts |
| `test/fixtures/golden/` | Portable committed fixture and expected output |
| `test/baseline/` | Machine-local large regression fixture, ignored by Git |
| `docs/SPEC.md` | Authoritative behavior and output contract |
| `docs/CHAT-SESSION-SCHEMA.md` | Storage format, evidence levels, and parser maintenance guide |
| `docs/UPGRADING.md` | Procedure for adapting to VS Code format changes |

## Validation

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Type-check production source without emitting files |
| `npm run typecheck:test` | Type-check source and tests |
| `npm test` | Run the complete Node test suite |
| `npm run golden` | Compare the portable model digest and Markdown render with the committed fixture |
| `npm run verify` | Run both typechecks, all tests, and the golden check |
| `npm run build` | Build CLI and library bundles plus declarations in `dist/` |
| `npm run verify:local` | Run portable verification and the machine-local large baseline |

Run the narrowest relevant test immediately after the first substantive edit, then run `npm run verify` before completion. Update the golden fixture only for an intentional, reviewed contract or rendering change. Do not update a fixture merely to make a failing check pass. The local baseline is optional because its source session is machine-specific and ignored by Git.

## Documentation And Release Consistency

- Update `docs/SPEC.md` when behavior or rendered Markdown changes.
- Update `docs/CHAT-SESSION-SCHEMA.md` when storage evidence, parsing rules, or enrichment behavior changes.
- Update `docs/UPGRADING.md` when compatibility or migration procedures change.
- Update `README.md` for user-visible commands, flags, requirements, or package behavior.
- Update `CHANGELOG.md` for notable user-visible changes.
- Keep CLI behavior, library behavior, tests, fixtures, and documentation in agreement.