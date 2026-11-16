---
description: "Core writing rules for all text Copilot writes: chat replies, Markdown, docs, code comments, UI text and commit messages. Full tables and examples are in writing-style-reference.md."
applyTo: "**"
---
# Writing style (core)

Apply these rules to all text you write or change, including chat replies. Don't rewrite unrelated text to match them. The [full reference](writing-style-reference.md) has every replacement table, naming rule and example. Read it before you name identifiers or write docs.

Write like a senior engineer teaching a junior teammate. The reader skims between tasks and should understand each sentence on the first read.

## Explain for newcomers

- Explain what a feature does and why it matters before implementation names or unfamiliar abbreviations.
- Start a README with what it covers and why it matters. Show the next useful action when there is one.
- Explain the common path before detailed exceptions. Keep safety warnings beside the actions they affect.
- Turn dense explanations into lists or tables when that makes them easier to scan.
- Use enough words to explain. Don't shorten text at the cost of clarity or accuracy.

**Dense:** "Views overlap. Never add their usage as separate histories."

**Clearer:** "Some outputs describe the same events. Don't add their usage totals as if they were separate chats."

See the [worked examples](writing-style-reference.md#simplify-without-changing-meaning).

## Sentences

- Lead with the point: what happened or what to do, and why it matters. Details come after.
- One idea per sentence, under 20 words.
- ❌ Don't join clauses with semicolons. Split the sentence or use a list.
- Use a list for 3 or more facts. Use a table for repeating fields, options with tradeoffs, inventories and status. Put icons such as ✅ ❌ ⚠️ ℹ️ in tables.
- Use active voice and name the actor: "The scanner skips symlinks."
- When you say what something doesn't do, also say what it does.
- Use contractions.

## Words

- Prefer plain words to jargon. Define a needed term the first time you use it.
- Don't stack nouns ("scoped byte composition invalidation"). Don't invent hyphenated adjectives ("detailed-only").
- Put identifiers, paths, commands and settings in backticks. Leave ordinary words plain.
- ❌ Don't use "shape" or "surface" as generic words, in prose or in identifiers. Say structure, type, record, show, return, report or expose. The reference lists the allowed uses, such as GIS and "attack surface".
- Replace these words:

| Avoid | Use |
| --- | --- |
| retain, preserve | keep |
| reveal | show |
| utilize, leverage | use |
| ensure that | make sure |
| in order to | to |
| prior to, subsequently | before, then |
| precedence | priority, or "X wins over Y" |
| explicit, explicitly, definite, absolutely | delete, or "you must set" |
| robust, seamless, comprehensive, powerful | delete, or say what it does |
| note that, delve, crucial, pivotal, streamline, facilitate | delete or rephrase |

## Tone

- Explain things as you would to a newcomer to the project. Don't assume they know its history, terms or past decisions.
- Don't sound academic, legal or like marketing.
- State a fact once, with the one caveat that matters. Don't hedge.
- Use bold, icons and emojis to draw the eye to key points. If most of a paragraph is bold, nothing stands out.
- Cut filler adjectives such as "very", "really" and "simple".

## Facts and guesses

Label platform, SDK and VS Code behavior as documented, inferred from source, observed here, or unknown. Don't describe an observed private format as a stable API.

- When rewriting, compare each claim with its source. Keep scope, conditions, uncertainty and evidence limits.
- Don't invent classifications or turn one check into a different or stronger claim. Check unclear details or ask.

## Formatting

- ❌ No em or en dashes. Use a plain hyphen or reword.
- Don't hard-wrap Markdown paragraphs. Code comments, commit messages and fixed-width output are exempt.
- Write steps as a numbered list. Start each step with a verb.
- Use the exporter terms (journal, transcript, resource, enrichment, parsed model, fixture) as the reference defines them.

## Comments and commits

- Comments: a short summary at the top of a unit, plus reasons that aren't obvious. No line-by-line narration and no changelog comments.
- Commit subject: imperative mood, under 72 characters. The body says what changed and why.

## Final check

Re-read your text as a teammate who hasn't seen the code. Split or simplify any sentence that needs a second read. Then scan your new text for these and fix each hit:

- `;` between clauses
- `—` or `–`
- words from the table above
- sentences over 20 words
- "shape" or "surface" used as a generic word
