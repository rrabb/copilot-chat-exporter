---
description: "Writing style for all text Copilot writes: Markdown, docs, code comments, JSDoc, test descriptions, fixture prose, UI text, commit messages, and chat or agent responses. Covers plain language, precise terms, tables, plain hyphens, and no artificial line breaks."
applyTo: "**"
---
# Writing Style

Apply these rules to all text you write or change: Markdown, code comments, JSDoc, test descriptions, fixture prose, user-facing text (UI strings, log and error messages), commit messages, work logs, and chat or agent responses. Don't rewrite unrelated text just to match these rules.

Write like a senior engineer explaining something to a teammate. The reader is a developer skimming between tasks. They should understand each sentence on the first read.

## Write Plainly

- Lead with the point: what the reader should do or what happened, and why it matters. Put details and edge cases after.
- Cut detail the reader doesn't need. Say each thing once.
- Use one idea per sentence. Aim for under 20 words.
- Don't chain clauses with semicolons. Use separate sentences or a list.
- Use a bulleted list when there are 3 or more separate facts or rules.
- Use active voice and name the actor: "The scanner skips symlinks," not "Links are not followed."
- When you say what something doesn't do, also say what it does.
- Give the reason in one short clause when it isn't obvious.
- Use common words instead of specialized jargon when they explain the same idea. If a technical term is needed, define it the first time or link to it.
- Don't stack nouns ("scoped byte composition invalidation"). Break them into a phrase.
- Don't invent hyphenated adjectives ("detailed-only", "journal-owned"). Write it out: "only runs in detailed mode."
- Name commands, files, settings, stored records, and behavior precisely. Put identifiers, paths, and commands in `backticks`. Don't put ordinary words in backticks.
- Use contractions (don't, isn't, it's). They read more naturally.
 - Prefer tables (especially for prose lists or repeating fields) - see that section.
- Avoid terms the reader must decode. If one is needed, explain it in a short phrase.

## Tone

- Don't sound academic, scientific, researcher-like, legal, or like marketing copy.
- Don't hedge or over-qualify. State the fact once, with the one caveat that matters.
- Liberally use bold/italic/icons/emojis to draw reader's attention to important things. However, if most of a paragraph is bold or emojis, then nothing stands out.
- Cut adjectives that don't change the meaning ("very", "really", "simple", "important").

## Word Choices

Prefer the plain option. Use the original word when it's shorter or more precise.

| Avoid | Prefer |
| --- | --- |
| retain, preserve | keep |
| reveal | show |
| surface (see the section below) | show, report, return, list |
| precedence | priority, or "X wins over Y" |
| definite, definitely, definitive | (delete), or "main", "source of truth" |
| absolutely, totally | (delete) |
| explicit, explicitly | (delete), or "you must set" |
| contentful | non-empty, has content |
| contract (outside API compatibility) | rule, guarantee, expects |
| only (when it adds nothing) | (delete) |
| utilize, leverage | use |
| in order to | to |
| ensure that | make sure, or rephrase |
| subsequently, prior to | then, before |
| robust, seamless, comprehensive, powerful | (delete, or say what it actually does) |
| note that, it's important to note | (delete) |
| delve, crucial, pivotal, streamline, facilitate | (rephrase plainly) |

## Facts vs. Guesses

When describing framework, platform, API, SDK, or VS Code behavior, say how you know it. Use these evidence labels (defined in [CHAT-SESSION-SCHEMA.md](../../docs/CHAT-SESSION-SCHEMA.md)):

| Label | Meaning |
| --- | --- |
| documented | Stated in official docs |
| inferred from source | Read from source code, not documented |
| observed here | Seen in this project's data or runs |
| unknown | Not checked or no evidence |

Don't assume behavior without evidence. Don't describe an observed private format as a stable API.

## Prefer tables (especially for prose lists or repeating fields)

Use tables liberally, especially when the content is better presented in a table. Use icons, emojis, or other visual markers when applicable e.g. ✅, ❌, ⚠️, ℹ️, 💡, 🔒 instead of words. 
Give each column a heading that says what it holds, such as "Why", "Status", "Sensitive", or "Revisit when" etc. or use icons/emojis/visual markers when suitable.
Use a table when suitable, e.g. file/folder/item inventories, options with tradeoffs, decisions with reasons, version or compatibility matrices, commands with their purpose, status of a list of items, and terms with definitions.

- Use prose for reasoning that doesn't repeat. Most sections need both.

```markdown
<!-- Preferred -->
| Path | ℹ️ | Sensitive |
| --- | --- | --- |
| `.env.e2e.local` | Your portal credentials | ✅ |
| `.env.e2e.example` | Template, no real values |  ❌|

<!-- Avoid -->
The `.env.e2e.local` file holds your portal credentials and is sensitive, whereas `.env.e2e.example` is only a template and contains no real values.
```

## Don't Use "Shape" As A Generic Term

Don't use `shape` just to say that something has fields, properties, members, or a particular arrangement. Pick the word that names the subject's role. This applies to Markdown, comments, JSDoc, test descriptions, user-facing text, chat, and identifiers mentioned in prose.

Don't add a `Shape` suffix to a function, interface, type, class, variable, parameter, or property:

- `ParsedSession`, not `SessionShape`
- `JournalRecord`, not `JournalRecordShape`
- `ResponsePayload`, not `ResponseShape`
- `parseToolResult`, not `parseToolResultShape`

Pick the replacement that matches the meaning:

| Meaning | Use | Example |
| --- | --- | --- |
| General arrangement of fields or elements | structure | "The record structure contains an ID and label." |
| Collection organized for an operation | data structure | "Use a map data structure for lookup by ID." |
| TypeScript declaration or accepted values | type or interface | "The `ToolNode` interface contains the normalized tool fields." |
| Plain data carrier or stored item | record, object, or document | "The query returns one record per session." |
| Fixed-length positional values | tuple | "The tuple contains a tool ID and count." |
| Formally defined or validated data | schema | "Validate the fixture against the schema." |
| Compatibility promised across a boundary | contract | "Changing the output contract requires updating the golden fixture." |
| Function parameters and return value | signature or return type | "The callback signature accepts a session ID and returns a promise." |
| Component or function inputs | properties, parameters, or options | "The renderer options include the output path." |
| External input | request, input, or payload | "Validate the transcript payload before enrichment." |
| External output | response, output, or result | "The tool result contains text and metadata." |
| Function output | return value or result | "The parser result contains turns and warnings." |
| Application data | state, state model, or model | "Replay mutations into the session state." |
| Configuration fields and nesting | configuration or configuration schema | "Keep the build configuration compatible with Node 22." |
| Error fields and nesting | error type, error response, or error format | "Keep unknown fields in the error response." |
| One case in a union | variant, case, or union member | "Handle every response variant." |
| Data crossing a system boundary | external model, internal model, wire format, or serialized format | "Convert the journal wire format to the parsed model." |
| Data saved for later use | persisted format, stored record, or storage schema | "The storage schema is private and can change." |
| Array or tensor dimensions | array or dimensions | "The tensor array is `[32, 256, 256, 3]`." |
| JavaScript engine property layout | hidden class, object layout, map, or object shape | "V8 may assign the objects the same hidden class." |

`shape` is fine for:

- GIS, map, geometry, or physical objects.
- JavaScript engine internals, where "object shape" is the real term (last row above).
- A quoted external API term that can't be reworded.
- An established public identifier that can't be renamed in this task. Existing identifiers can stay when renaming them is unrelated to the task, but don't add new generic uses.

## Don't Use "Surface" As A Generic Term

Don't use `surface` as a vague verb or noun for "show", "expose", "report", or "area". Say what actually happens: where the thing appears and who sees it. This applies to Markdown, comments, JSDoc, test descriptions, user-facing text, chat, and identifiers mentioned in prose.

Don't add `surface` to a function, interface, type, class, variable, parameter, or property name:

- `showWarning`, not `surfaceWarning`
- `reportErrors`, not `surfaceErrors`
- `exposeApi`, not `surfaceApi`

Pick the replacement that matches the meaning:

| Meaning | Use | Example |
| --- | --- | --- |
| Display to the user | show, display | "Show the warning in the status bar." |
| Send up to the caller | return, throw, pass up | "Return the parse error to the caller." |
| Record for diagnostics | log, report | "Log the skipped record with its line number." |
| Make reachable from outside | expose, export | "Export `parseJournal` from the package." |
| Find during analysis | find, detect | "The scan found 3 orphaned resources." |
| Bring up for discussion | raise, mention, flag | "Flag the schema change in the PR description." |
| Public API ("API surface") | public API, exports | "Keep the public API small." |
| UI location ("UI surface") | view, panel, page, dialog, status bar | "Add the toggle to the settings panel." |
| Size or scope ("surface area") | scope, number of entry points | "This reduces the number of entry points to test." |

`surface` is fine for:

- GIS or geometry (elevation surface, terrain surface, 3D surfaces).
- The security term "attack surface".
- A quoted external API term that can't be reworded.
- An established public identifier that can't be renamed in this task. Existing identifiers can stay when renaming them is unrelated to the task, but don't add new generic uses.

## Use Exporter Terms Consistently

| Term | Meaning |
| --- | --- |
| journal | The `chatSessions/<sessionId>.jsonl` mutation log. It's the source of truth for a session. |
| transcript | The optional `GitHub.copilot-chat/transcripts/<sessionId>.jsonl` event stream |
| resource | A tool output body that's saved separately |
| enrichment | Optional data matched to a record that comes from the journal |
| parsed model | Our own representation of a session, used by rendering and verification |
| fixture | Recorded test input or expected output. Each fixture has a stated validation purpose. |

## Use Plain Hyphens

Use a plain hyphen `-` or reword the sentence instead of using an em dash or en dash. Keep a long dash only when quoting source text exactly.

## Code Comments

- A short summary of what a function, module, or tricky block does is welcome. It helps a new dev review the code fast. Put it at the top of the unit, not on every line.
- Explain non-obvious reasons, workarounds, edge cases, performance choices, compatibility limits, risks, and evidence limits.
- Don't narrate routine steps or trivial lines (`// increment counter`).
- Don't add terms the reader has to decode. Use the exporter terms above.
- No changelog comments ("fixed bug", "updated per review"). Those belong in the commit message or work log.
- If a comment needs more than a page, move the detail to the docs and link to it.

## Commit Messages

- Subject line: what changed, in imperative mood, under 72 characters. Example: "Skip symlinks when sizing folders".
- Body (when needed): a short summary of the main changes, then why. List touched areas as bullets if there are several.

## Markdown and Docs

- Use short sections with clear headings. Put the most-used information first.
- Show an example before describing edge cases.
- Use a numbered list for steps. Start each step with a verb.
- Follow "Use Plain Hyphens" above and "Don't Add Artificial Line Breaks" below.

## Do Not Manually Wrap Markdown Paragraphs

Keep MD paragraphs on one line and let the editor wrap it visually. Do not insert line breaks only to limit line length or make sentence appear shorter ex.cept for code comments or commit messages or for fixed-width output like CLI/console/ASCII tables/golden fixtures etc

Use separate lines where MD requires them, including headings, lists, tables, block quotes, and code blocks.
Prefer using tables and lists when suitable.

## Chat and Agent Responses

- Start with the result: what you did, what you found, or the answer. Remember to provide context/reasoning/background.
- Say clearly when something is a guess, wasn't verified or is ambiguous.
- Prefer tables/list/emojis/icons/visual markers etc over long prose when the content fits them.
- Give evidence for factual claims. Link to workspace files and line numbers when relevant.
- Avoid terms the reader must decode, however if necessary, provide context and brief explanation.
- When asking user questions always provide context, background, pros and cons, repercussions, risks, better approaches, alternatives, whether overkill, play devil's advocate. 
- Do not steer the user down a rabbit hole especially when user asks you to be a collaborator.

## Keep Docs in Sync

When behavior changes, update the doc that owns that topic and any summary that would now be wrong. Don't copy the full spec into the README, comments, and changelog. Link to the owning doc and give each audience a short summary.

## Example

Bad:

> Storage collection is detailed-only, cached by artifact path and read-only. Directory lengths count regular files without following links; changes detected during analysis invalidate composition and produce diagnostics.

Good:

> - Only runs in detailed mode. Results are cached per path. Never modifies files.
> - Folder sizes include regular files. Symlinks are skipped.
> - If a file changes during the scan, the breakdown is discarded and a diagnostic is reported.

## Final Check

Before finishing, re-read the text as a teammate who hasn't seen this code. If a sentence needs a second read, split it or simplify it.