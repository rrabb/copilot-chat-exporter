---
description: "Prose style for project-owned Markdown, comments, JSDoc, and user-facing text: concise language, precise terminology, plain hyphens, and unwrapped Markdown paragraphs."
applyTo: "**/*.md,src/**/*.ts,src/**/*.js,scripts/**/*.ts,scripts/**/*.js,scripts/**/*.mjs,test/**/*.ts,test/**/*.js,test/**/*.mjs,*.js,*.cjs,*.mjs"
---
# Documentation Style

Apply these rules to Markdown, comments, JSDoc, user-facing text, fixture prose, and other text you write or modify. Do not rewrite unrelated documentation only to match these rules.

## Use Concise, Plain Language

Write short, direct explanations that tell the reader what to do and why it matters. Avoid unnecessary detail, repetition, and specialized jargon when common words explain the same idea. Name commands, files, settings, storage records, and behavior precisely.

Distinguish facts from inference when documenting VS Code internals. Use the evidence terms established in `docs/CHAT-SESSION-SCHEMA.md`: documented, inferred from source, observed here, and unknown. Do not describe an observed private format as a stable API.

## Prefer Tables For Repeating Fields

Use tables for file inventories, commands and purposes, options and tradeoffs, compatibility matrices, record fields, statuses, and terms with definitions. Give each column a heading that states what it contains. Keep prose for reasoning that does not repeat.

## Do Not Use "Shape" As A Generic Term

Do not use `shape` merely to indicate that something has fields, properties, members, or a particular arrangement. This rule applies to Markdown, comments, JSDoc, test descriptions, user-facing text, chat, and identifiers discussed in prose. Choose the term that identifies the subject's role.

Do not add a `Shape` suffix to a function, interface, type, class, variable, parameter, or property. Prefer `ParsedSession` over `SessionShape`, `JournalRecord` over `JournalRecordShape`, `ResponsePayload` over `ResponseShape`, and `parseToolResult` over `parseToolResultShape`.

Choose the replacement that matches the meaning:


| Meaning                                   | Prefer                                                            | Example                                                              |
| ----------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| General arrangement of fields or elements | structure                                                         | "The record structure contains an ID and label."                     |
| Collection organized for an operation     | data structure                                                    | "Use a map data structure for lookup by ID."                         |
| TypeScript declaration or accepted values | type or interface                                                 | "The`ToolNode` interface contains the normalized tool fields."       |
| Plain data carrier or stored item         | record, object, or document                                       | "The query returns one record per session."                          |
| Fixed-length positional values            | tuple                                                             | "The tuple contains a tool ID and count."                            |
| Formally defined or validated data        | schema                                                            | "Validate the fixture against the schema."                           |
| Compatibility promised across a boundary  | contract                                                          | "Changing the output contract requires updating the golden fixture." |
| Function parameters and return value      | signature or return type                                          | "The callback signature accepts a session ID and returns a promise." |
| Component or function inputs              | properties, parameters, or options                                | "The renderer options include the output path."                      |
| External input                            | request, input, or payload                                        | "Validate the transcript payload before enrichment."                 |
| External output                           | response, output, or result                                       | "The tool result contains text and metadata."                        |
| Function output                           | return value or result                                            | "The parser result contains turns and warnings."                     |
| Application data                          | state, state model, or model                                      | "Replay mutations into the session state."                           |
| Configuration fields and nesting          | configuration or configuration schema                             | "Keep the build configuration compatible with Node 22."              |
| Error fields and nesting                  | error type, error response, or error format                       | "Preserve unknown fields in the error response."                     |
| One case in a union                       | variant, case, or union member                                    | "Handle every response variant."                                     |
| Data crossing a system boundary           | external model, internal model, wire format, or serialized format | "Convert the journal wire format to the parsed model."               |
| Data saved for later use                  | persisted format, stored record, or storage schema                | "The storage schema is private and can change."                      |
| Array or tensor dimensions                | array or dimensions                                               | "The tensor array is`[32, 256, 256, 3]`."                            |
| JavaScript engine property layout         | hidden class, object layout, map, or object shape                 | "V8 may assign the objects the same hidden class."                   |

Reserve `shape` for GIS/map/physical object terms, a quoted external API term that cannot be reworded, or an established public identifier that cannot be renamed within the task. Existing identifiers may remain when changing them would be unrelated, but do not introduce new generic uses.

## Use Exporter Terms Consistently

Use these exporter terms consistently:


| Term         | Meaning                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| journal      | The definitive`chatSessions/<sessionId>.jsonl` mutation log                  |
| transcript   | The optional`GitHub.copilot-chat/transcripts/<sessionId>.jsonl` event stream |
| resource     | A separately persisted tool-output body                                      |
| enrichment   | Optional data correlated to a journal-owned record                           |
| parsed model | The project-owned representation consumed by rendering and verification      |
| fixture      | Recorded test input or expected output with an explicit validation purpose   |

## Use Plain Hyphens

Use a plain hyphen `-` or reword the sentence instead of using an em dash or en dash. Preserve a long dash only when quoting source text that must remain exact.

## Do Not Manually Wrap Markdown Paragraphs

Keep each Markdown paragraph on one source line and let the editor wrap it visually. Do not insert line breaks only to limit line length or make a sentence appear shorter in the source.

Use separate lines where Markdown structure requires them, including headings, lists, tables, block quotes, and fenced code blocks. Start a new paragraph only when the subject or purpose changes.

## Keep Comments Useful

Explain non-obvious reasons, evidence limits, compatibility constraints, or risks. Do not restate code, narrate routine steps, or add terminology the reader must decode.

## Keep Contracts Synchronized

When behavior changes, update the narrowest authoritative document and any user-facing summary that would otherwise become inaccurate. Do not duplicate the full specification across README, comments, and changelog entries; link to the authoritative document and summarize only what each audience needs.
