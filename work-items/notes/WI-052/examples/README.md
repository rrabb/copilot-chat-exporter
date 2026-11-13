# Portable LOD review examples

These are synthetic examples, not anonymized transcripts of the six real research conversations. They show today's default detailed output, not implemented LOD switches.

| Example | Source | Shows |
| --- | --- | --- |
| [local-detailed.md](local-detailed.md) | Copy of the committed golden fixture in [local-input](local-input/) | Prompts, reasoning, tools, edits, metadata and synthetic companions |
| [sdk-detailed.md](sdk-detailed.md) | Invented [sdk-events.jsonl](sdk-events.jsonl) | File reads, a tool-based question/answer, MCP-style tool name, failed shell call, nested agent, compaction, edit details and opaque-reasoning count |
| [sample-checks.json](sample-checks.json) | Checks made during generation | Local CLI exit and independent SDK text-account results |

The MCP-style name illustrates a tool's presentation. It does not prove transport identity or implement an MCP classifier. The question example uses tool arguments/results, not a Local question-carousel record. The synthetic reviewer does not establish anything about Fusion.

Keep companion folders beside the Local Markdown file. The golden fixture may contain tiny placeholder image bytes, not real screenshots.

## Reproduce

Run from the repository root with the project's supported Node version:

```powershell
node work-items\notes\WI-052\examples\generate.mjs temp-tool-output\wi052-synthetic-rebuild
```

Use a fresh destination. The CLI refuses an existing output file. The generator reads the committed synthetic fixture and imports the current SDK renderer. It never reads native session stores. Logs and capture cache stay in ignored temporary output.

The saved examples are snapshots of the renderer at preservation time. Future renderer changes may produce different output. Generated IDs, dates and synthetic content are not historical user data.

## Real research samples

All six original real Markdown files and their companions have separate private copies under `../private-examples/exports/`. The private manifest maps sample labels to original artifacts and records hashes. This folder is ignored by Git and deliberately absent from the HTML file index.

These copies survive cleanup of the original temporary run, but Git does not back them up. Arrange a separate private backup before relying on them for long-term preservation.
