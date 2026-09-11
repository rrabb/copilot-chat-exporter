---
description: "Executable TypeScript and JavaScript style for project-owned source, scripts, and tests: semicolons, readable guards, precise typing, and erasable Node TypeScript."
applyTo: "src/**/*.ts,src/**/*.js,scripts/**/*.ts,scripts/**/*.js,scripts/**/*.mjs,test/**/*.ts,test/**/*.js,test/**/*.mjs,*.js,*.cjs,*.mjs"
---

# TypeScript And JavaScript Style

Apply these rules to executable code you write or modify. Follow [documentation-style.instructions.md](documentation-style.instructions.md) for comments, JSDoc, user-facing strings, and other prose. Do not reformat unrelated code only to match these rules.

## Prefer Short-Circuit Calls For Simple Side Effects

When an `if` guards one side-effect expression with no `else`, use a short-circuit expression when it remains easy to read.

```ts
// Preferred
source && processSource(source);
isVerbose && console.error(summary);

// Avoid
if (source) processSource(source);
if (isVerbose) console.error(summary);
```

Use a normal `if` when the body returns, throws, breaks, continues, contains multiple statements, has an `else`, or reads more clearly as control flow.

## End Statements With Semicolons

Terminate statements with semicolons.

```ts
const records = parseJournal(raw);
session.turns.push(turn);
return session;
```

## Put Guard Bodies On Their Own Line

Do not place a controlled statement on the same line as its `if` condition.

```ts
// Preferred
if (!record)
  continue;
if (!sessionId)
  throw new Error('Session id is required.');

// Avoid
if (!record) continue;
if (!sessionId) throw new Error('Session id is required.');
```

Use braces for multiple statements and whenever they improve clarity.

## Preserve Erasable TypeScript

Source files run directly in Node without transpilation. Keep production syntax compatible with `erasableSyntaxOnly`; prefer `interface`, `type`, and other type-only constructs over TypeScript features that emit runtime code. Use `import type` when an import is used only as a type, and preserve `.ts` extensions in relative source imports.

## Use Precise Types

Do not use `any`, `as any`, `as unknown`, chained assertions, or broad index signatures only to silence an error. Validate unknown external data at the parsing boundary, then convert it to project-owned types. Use the narrowest assertion only when runtime evidence establishes a fact TypeScript cannot express.

Keep external VS Code records distinct from parsed exporter models. Do not leak undocumented journal structures into rendering code.

## Do Not Use "Shape" As A Generic Code Term

Do not use `shape` or a `Shape` suffix merely to indicate that a value, object, function, interface, or type has fields. This applies to function names, interface names, type aliases, class names, variable names, parameter names, property names, comments, JSDoc, test names, and user-facing strings.

Name each symbol for its purpose or contract. Prefer names such as `ParsedSession`, `ToolPatch`, `Resource`, `RenderReport`, `SessionLocation`, `JournalRecord`, `ToolResult`, or `ResponsePayload` over names such as `SessionShape`, `PatchShape`, `getResultShape`, or `recordShape`.

Choose the precise term that matches the code:

| Meaning | Prefer |
| --- | --- |
| TypeScript declaration | type or interface |
| Plain data carrier | record or object |
| Fixed-length positional values | tuple |
| Validated field definition | schema |
| Compatibility boundary | contract |
| Function parameters and return value | signature or return type |
| External input | payload or request |
| External output | response or result |
| Application data | state or model |
| Serialized data | format or wire format |
| One case in a union | variant or union member |

Reserve `shape` for array or tensor dimensions, JavaScript engine object layouts when that exact concept is under discussion, quoted external API terminology, or an established public identifier that cannot be renamed within the task. Follow the broader replacement table in [documentation-style.instructions.md](documentation-style.instructions.md).

## Keep Side Effects At The Boundary

Keep printing and process termination in `src/cli.ts`. Pass variable machine and run state into library functions. Prefer pure parsing, enrichment, rendering, and verification functions that can be tested without changing global process state.