# Upgrading when VS Code or Copilot changes

Read this when an export loses content, when `--verify` reports unhandled kinds, or when you are
handed this tool after a VS Code update and something looks wrong.

## Why this document exists

This tool reads a **private, undocumented file format** that Microsoft owns and changes without
notice or migration notes. There is no published schema to check against and no deprecation
warning. The only thing that will tell you the format moved is this tool's own kind census -
and the census only tells you *that* something changed, not what to do about it. This is the
what-to-do-about-it.

## The one-sentence version

**When VS Code changes what a chat session looks like, you edit `classifyNode`.** Everything
after it reads a parsed model this project owns, and is unaffected.

## Vocabulary you need first

If the terms below are unfamiliar, read the Concepts section of the README before continuing.
The two that get confused most often:

- a **turn** is an input concept - one user prompt and everything the assistant did in reply;
- a **section** is an output concept - one of the `##` regions of the produced Markdown.

A **kind** is the field that says what an item in `request.response[]` is. Kinds are the part of
the format most likely to change, which is why they get their own machinery.

---

## Symptoms, and what each one means

| What you see | Most likely cause |
|---|---|
| `UNHANDLED kinds (content dropped in silence)` in `--verify` | A new or renamed kind. Start at step 1 |
| `--strict` exits 2 in CI | Same thing, failing a build on purpose |
| A `[!WARNING]` admonition inside an exported document | Same thing, surfaced to the reader of the export |
| Zero turns, or a large drop in turn count | The journal envelope or delta encoding changed - see *Other kinds of change* |
| A tool call renders with no output | `toolSpecificData` moved or was renamed for that tool |
| Content visible in the chat window but missing from the export | A kind is being classified to nothing, or is wrongly on the ignore list |
| Everything parses but the page looks wrong | Rendering, not parsing. Nothing in this document applies |

---

## Snapshots, and what they are for

A **snapshot** is a small record of how one of your own sessions parses right now. You take one
before you change any code, and check it afterwards to see exactly what your change did.

```sh
node src/cli.ts --snapshot update <sessionId>   # record it
node src/cli.ts --snapshot check  <sessionId>   # what moved since?
```

It is saved to `test/snapshots/<sessionId>.digest.json` and it holds the *shape* of the
conversation, not its words: how many turns, how many thoughts per turn, which tool calls ran and
in what order, which files were touched, and the kind census. Prompts and answers are stored as
hashes. So it stays a few KB even for a long conversation, and it never contains anything you
would mind having on disk. It is gitignored, because it names a session that exists only in your
VS Code storage.

### What finds a schema change, and what fixes it

These are two different jobs, and mixing them up wastes time:

- **The census finds it.** Run `--verify --strict` on a session recorded *after* the VS Code
  update. It lists any kind this build has no handler for.
- **The snapshot protects you while you fix it.** It tells you what your new code did to a real
  conversation, and confirms it disturbed nothing else.

A snapshot on its own will never announce a schema change. Old sessions on disk do not change: a
conversation recorded last month keeps its old shape forever, so re-checking it after a VS Code
update shows nothing. Drift only shows up in a session recorded after the update, which is why
step 1 below is a census and not a snapshot check.

### The loop

1. `--verify --strict <newSessionId>` and read the census. Clean means nothing changed that
   matters here.
2. `--snapshot update <sessionId>` on the session that shows the problem, **before** editing
   anything.
3. Make the change (steps 2 to 4 below).
4. `--snapshot check <sessionId>`. Read the diff.
5. If it is what you intended, `--snapshot update` again to re-record.

Step 4 is the payoff. A failing check names the field and the turn, not just "something changed":

```
Snapshot check: FAILED, 6 field(s) drifted
  - [census.unhandled] expected=[] actual=[["thinkingV2",4]]
  - [census.dropped]   expected={}  actual={"thinkingV2":4}
  - [perTurn[1]] ... "thoughts":1 -> "thoughts":0
  - [perTurn[7]] ... "thoughts":2 -> "thoughts":0
```

That is the report from a deliberate test where `thinking` was renamed to `thinkingV2`. Working
in the fix direction you see the mirror image: `census.unhandled` emptying, and those same turns
getting their content back. That is your confirmation, on the conversation that actually
motivated the change.

### Two things to know

**Snapshot finished conversations, not ones you are still in.** VS Code keeps appending to a
session's journal as you chat. Snapshot a live session and a later check reports drift from the
new turns rather than from your code. This is exactly why the baseline check uses a frozen copy
instead of reading live storage.

**They are also just extra coverage.** The two committed checks only ever exercise two
conversations. Snapshotting three or four of your richest real sessions gives you a regression
net over paths neither fixture reaches, which is worth having before any refactor, not only
before a schema fix.

---

## Step 1 - confirm and measure

```sh
node src/cli.ts --verify --strict <sessionId>
```

The census block is the part that matters:

```
Schema census (response items vs handled kinds)
- Response items walked: 1,404 across 10 distinct kind(s)
- Validated against: VS Code 1.134 / Copilot Chat 0.62 (journal schema kind 0/1/2)
- Handled kinds: toolInvocationSerialized=557, thinking=474, ...
- Handled but empty (streamed partials): ...
- Dropped by design: undoStop=155, codeblockUri=155, ...
- Known but never observed here (not suppressed): pullRequest, treeData, ...
- UNHANDLED kinds (content dropped in silence): 1
    pullRequest: 3 occurrence(s)
```

Three lists appear there, and understanding the difference between them is the whole point of
step 3. Note also *Handled but empty*: a handled kind producing no node is normal - streamed
`thinking` partials arrive empty - and is not drift.

Now take a snapshot of this session, before you change anything:

```sh
node src/cli.ts --snapshot update <sessionId>
```

## Step 2 - look at the actual node

Never classify a kind from its name. Dump a real one. Save this as a scratch `.mjs` file:

```js
import fs from 'node:fs';
const [, , file, wanted] = process.argv;

// Mirrors the parser: response[] contains nested arrays and numeric-keyed splice objects.
const flat = (n, out = []) => {
  if (n == null) return out;
  if (Array.isArray(n)) { for (const x of n) flat(x, out); return out; }
  if (typeof n === 'object' && typeof n.kind !== 'string') {
    const numeric = Object.keys(n).filter((k) => /^\d+$/.test(k));
    if (numeric.length) { for (const k of numeric) flat(n[k], out); return out; }
  }
  out.push(n);
  return out;
};

for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let record;
  try { record = JSON.parse(line); } catch { continue; }
  const stack = [record];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) { stack.push(...current); continue; }
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current.response)) {
      for (const item of flat(current.response)) {
        if (item?.kind === wanted) {
          console.log(JSON.stringify(item, null, 2).slice(0, 4000));
          process.exit(0);
        }
      }
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
}
console.log('not found:', wanted);
```

```sh
node scratch.mjs "<...>/workspaceStorage/<hash>/chatSessions/<id>.jsonl" pullRequest
```

On Windows, do **not** create that file with `Set-Content -Encoding utf8` - PowerShell 5.1 writes
a BOM, `JSON.parse` fails on the first line, and you get a silent zero-result run. Use
`[System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($false)))`.

Now answer one question from what you see: **would a reader of the export miss this content?**

## Step 3 - decide which of the three lists it belongs in

| Verdict | Action | Effect |
|---|---|---|
| Carries content a reader would miss | Add a `classifyNode` branch **and** add the name to `HANDLED_RESPONSE_KINDS` | It renders |
| Presentation or bookkeeping only, or content already captured elsewhere - **and you have seen it in a real journal** | Add to `IGNORED_RESPONSE_KINDS` | Silently dropped, census stays quiet |
| You know the name exists but have never observed one | Add to `KNOWN_UNSEEN_KINDS` | Documented, still reported if it appears |

**The rule that matters: never put an unobserved name on the ignore list.** The ignore list is a
suppression list - every entry is a standing promise that the census will stay silent. This tool
once shipped fourteen ignore entries written from general knowledge rather than evidence, which
pre-disabled the alarm for exactly the kinds most likely to carry lost content. Verify first:

```sh
# from the package root
grep -o '"kind":"pullRequest"' test/fixtures/golden/*.jsonl | wc -l
```

If the count is zero, it goes in `KNOWN_UNSEEN_KINDS`, not `IGNORED_RESPONSE_KINDS`.

## Step 4 - implement the branch

`classifyNode` takes one response item and returns a node, `null`, or **an array of nodes**.
Three details that are easy to miss:

- **Returning an array is supported and sometimes required.** `workspaceEdit` does this: a single
  edit item can describe several file operations, so it returns one node per operation. The parse
  loop flattens whatever comes back.
- **Returning `null` is normal**, not a failure. Empty streamed partials classify to nothing.
- **Assistant prose has no `kind` at all.** It is matched by shape, and the census accounts for it
  under `(implicit text)` and `(no kind or value)`. If markdown ever grows a `kind`, both the
  classifier and those census buckets need attention.

Keep the branch in `classifyNode` and keep everything it produces in the project's own node
shapes. Do not let the VS Code object escape into the renderer - that boundary is what stops the
next VS Code release from becoming a second refactor.

## Step 5 - verify, in this order

```sh
npm run typecheck -w copilot-chat-exporter   # catches a missing binding in seconds
npm run test      -w copilot-chat-exporter   # unit tests
npm run golden    -w copilot-chat-exporter   # committed made-up session: digest + full export
npm run baseline  -w copilot-chat-exporter   # frozen real session, byte-exact
node src/cli.ts --snapshot check <sessionId> # the session that actually had the new kind
```

Then both again from an unrelated working directory - that check is what caught a
cwd-dependent path bug that review had missed:

```sh
cd $env:TEMP    # or /tmp
node <repo>/tools/copilot-chat-exporter/src/cli.ts --golden check
node <repo>/tools/copilot-chat-exporter/test/baseline.ts
```

Adding a handled kind **will** change the export, so both checks are expected to fail. That is
the point at which people make the real mistake:

> **Read the reported diff and confirm it is exactly the change you intended - before you
> re-record.** Both checks compare against a saved copy. They prove nothing changed; they cannot
> tell you the new output is correct. Re-recording without reading the diff converts a bug into
> the new expected behaviour, permanently.

Only then:

```sh
npm run golden:update   -w copilot-chat-exporter
npm run baseline:update -w copilot-chat-exporter
node src/cli.ts --snapshot update <sessionId>
```

## Step 6 - record what you validated against

Update `VALIDATED_AGAINST`. The census detects a new or renamed kind; it cannot detect an
existing kind quietly changing meaning, so the marker is the only signal a future reader gets.

Finding the two version numbers is less obvious than it looks, because **Copilot Chat is now a
bundled built-in extension** - `~/.vscode/extensions` does not contain it, and an empty listing
there invites a guess. That is how this constant shipped wrong once.

```powershell
$app = 'C:\Users\<you>\AppData\Local\Programs\Microsoft VS Code\<commitHash>\resources\app'
(Get-Content "$app\product.json" -Raw | ConvertFrom-Json).version
(Get-Content "$app\extensions\copilot-chat\package.json" -Raw | ConvertFrom-Json).version
```

On macOS and Linux the equivalents live under
`/Applications/Visual Studio Code.app/Contents/Resources/app/` and `/usr/share/code/resources/app/`.

Updating this constant changes one line in every export, so both checks will fail on exactly
that line. Confirm the diff is one line, then re-record.

---

## Other kinds of change

Not everything is a new kind. Match the symptom to the owner:

| What changed | Where you work | Signal |
|---|---|---|
| A response item kind | `classifyNode` (`session/classify.ts`) | Census reports unhandled |
| `toolSpecificData` shape for a tool | `classifyNode` | Tool renders with no command or output |
| Delta encoding - the `kind 0/1/2` snapshot/set/append records | `parseChatSession` (`session/journal.ts`) | Zero turns, or turn count collapses |
| Where VS Code stores sessions; a new channel or renamed folder | `host.ts` | `--list` finds nothing |
| Resource file naming under `chat-session-resources/` | `loadResources` (`session/enrich.ts`) | Tool results missing, terminal output intact |
| Model metadata in `debug-logs/<id>/models.json` | `readModelNames` (`session/enrich.ts`) | Raw model ids appear instead of friendly names |
| Nothing - the parse is fine, the page looks wrong | `markdown.ts` | Census clean, saved-copy checks fail |
| A check reports a difference that is not real | `verify/layers.ts`, or the masking rules in `verify/golden.ts` | A green export fails a check |

## Traps that have actually bitten people here

- **`transcripts/<id>.jsonl` is not the journal.** It is a different schema in the same folder
  tree. Passing it produces zero turns and silently overwrites a good export. The definitive
  store is `chatSessions/<id>.jsonl`.
- **The journal re-emits each tool call** as its status changes - queued, running, complete. One
  session had 549 nodes for 397 distinct `toolCallId`s, with later copies drifting 150+ stream
  positions into a different turn. Keep the *first* occurrence for ordering and merge later
  updates into it.
- **A tool call id can be reused inside one turn.** Merging on id alone hides the second
  invocation; the merge must be gated on the tracked entry still being incomplete.
- **The first record of a journal is a full snapshot and can be 16 MB.** "Just read the first
  line" is not automatically cheap.
- **The golden fixture contains only seven distinct kinds.** If you are writing a drift test by
  renaming a kind, rename one that is actually present, or your test silently does nothing.
- **Terminal output lives in the journal**, at `toolSpecificData.terminalCommandOutput.text`, not
  only in the resources folder. It needs ANSI stripping and command-echo trimming.
- **`chat-session-resources/` is rotated and emptied by VS Code.** Never treat it as durable.

## If you are adding a capability rather than absorbing a change

The same boundary applies in reverse. New information from the journal enters through
`session/`, becomes part of the parsed model in `types.ts`, and is rendered in `render/`. If you
find yourself reaching into a raw VS Code object from inside a renderer, the change belongs one
layer up.
