# Migration Plan - extracting the chat exporter into a portable tool

Status: Phases 0-6 complete locally. The activated CI job still needs its first runner execution.

This document records the method, not just the checklist. The checklist is easy to reproduce;
the method is the part worth reusing on the next refactor.

Terms used throughout - the parsed model, turn, kind, census - and the six design principles
behind them are defined once in the README's Concepts section, not repeated here.

## 1. Goal

Turn a ~1.6k-line single-file script into a self-contained tool that can be dropped into any
project - by copying a folder, running a single bundled file, or installing from a registry -
without changing a byte of its output along the way.

The repo this grew up in is an ArcGIS Experience Builder app. The exporter is not part of that
product; it is a tool that helps this project *and others*. Every structural decision below
follows from that one fact.

We are not hardset on the plan (it is a rough guide and a starting point) and we should be open to making changes that are reasonable, improve human readability/maintainability/upgradeability of code. During the execution of this plan, if we see room for improvements, we should suggest it and modify plan accordingly. 
Make a note to be concise and avoid deep industry jargon like load-bearing or esoteric terms about compilers, testing, etc. 
Finally as always review work performed and results and this plan and execution results of each phase of the plan, then suggest improvements/fixes, point out errors/confusions, then STOP and ask clarifying questions for any confusions.

### 1.1 Target shape

`tools/copilot-chat-exporter/` is the only thing a consumer copies, publishes, or subtrees.
Nothing outside it may be required at runtime, and nothing inside it may reach out.

```
tools/copilot-chat-exporter/
  package.json  README.md  tsconfig.json  .gitignore  .gitattributes          done
  LICENSE  CHANGELOG.md                                                 done
  ci/             gitlab-ci.yml (active include)                        done
  src/                                            ~lines
    cli.ts        orchestration, console, exit            348   only file with side effects
    args.ts       argv -> options, or a usage message      85   pure, so it is testable
    index.ts      public API + load/render pipeline        117   consumer entry point
    install.ts    install packaged skill + prompt          46   explicit-root filesystem API
    types.ts      the parsed model + glossary comments     207   DONE
    text.ts       palette + string shaping                232   DONE - shared, see below
    host.ts       storage discovery, roots, output, git    206   DONE
    markdown.ts   tool + turn + document rendering         738   DONE - flat, see below
    session/
      locate.ts   find / list / resolve a session         127   DONE
      journal.ts  jsonl -> delta replay -> requests       400   DONE
      classify.ts response item -> node; the kind lists   181   DONE - ** the VS Code seam **
      enrich.ts   resources, memory, versions, models     149   DONE
    verify/
        layers.ts   Layers A, B, C                          449   DONE
        golden.ts   digest, diff, normalize, snapshots       137   DONE
      test/           *.test.ts (115 tests), fixtures/ (done), baseline/ + snapshots/ (generated)
  docs/           SPEC.md  BUILD-PROMPT.md  UPGRADING.md (done)
  skill/          SKILL.md + export-chat.prompt.md (done)
```

Fourteen source files. The host repo keeps only thin
adapters: `"workspaces": ["tools/*"]`, root npm scripts, and a pointer skill at
`.github/skills/export-chat/SKILL.md` so the canonical skill travels with the tool.

**Sizing rule: split on evidence of pain, not in advance.** A module that exports one or two
things is a cost, not a virtue - it adds a file to open without adding a concept to understand.
When something must come out of a large file, it merges into *its consumer*, never into a
`utils.ts`; a bucket defined by size has no cohesion and becomes the drawer everything imports
and nobody owns. `markdown.ts` is deliberately left whole rather than pre-split into tool/turn/
document, because someone changing how a turn looks wants it in one place. It ended the phase at
711 lines, just past the ~700 mark; see step 7 for why that was flagged and not acted on.

Applying that rule collapsed the first draft of this tree from 22 files to 11. `config.ts` was
dropped - it would have been twenty lines of `MAX_*` constants, which live next to the code that
reads them until config-file loading actually exists. `verify/normalize.ts` (895 bytes) folded
into `verify/golden.ts`, since both of its callers compare against a saved copy. `host/` collapses
from three files into one: the only argument for an isolated 465-byte `git.ts` was that it is
the sole subprocess site, but a file boundary does not enforce that - so the invariant becomes a
checked one instead, *exactly one `execFileSync` under `src/`* (the test harness legitimately has
its own, which is why the check is scoped).

Three entries in that tree carry more weight than their size suggests.

**`types.ts` is the spine.** The input is a private, undocumented format owned by someone else
and versioned on their schedule, so the thing that matters most is that journal `kind` dispatch
stays concentrated in one function and that renderers work on this project's own `node.type`
vocabulary rather than VS Code's.

That property is already true of the code - it was true before this plan existed. Writing the
shapes down does not create it; it makes it *legible and checkable*, gives each half of the
pipeline something to be tested against independently, and gives a newcomer a single file that
answers "what is a turn". A measured attempt to go further - forbidding any journal-shaped object
from reaching `render/` - was dropped: it relocated four branch sites and eliminated none. See
the decision log.

**`session/classify.ts` is where a maintainer will actually work.** It holds `classifyNode` and
the three kind lists, and it is the answer to "VS Code changed, now what" - which is why
`docs/UPGRADING.md` points at it by name.

**`index.ts` is what makes it embeddable.** A CLI can only be run; a library API can be called.
It comes last because its signature is only honest once every side effect has been pushed out
to `cli.ts`. It also carries JSON output: if the parsed model is right, serialising it is close
to `JSON.stringify`, and something that small does not earn a module of its own. Being that
trivial is the point proved, not a reason to create `render/json.ts` - nor, as step 7 found out,
a reason to put it on the command line.

### 1.2 Portability contract

These seven conditions decide whether the goal is met. They are acceptance criteria, not
aspirations - a phase is not done if it breaks one.

| # | Condition | Status |
|---|---|---|
| 1 | Zero runtime dependencies; node builtins only, devDeps only | holds |
| 2 | No import crosses the package boundary in either direction | holds |
| 3 | No hardcoded workspace root; injected via `HostContext` | done, Phase 1 |
| 4 | No hardcoded output directory; precedence chain ending outside the project root | done, Phase 1 |
| 5 | Cross-platform storage discovery: Windows, macOS, Linux x four VS Code channels | done, Phase 1 |
| 6 | `bin` + `engines` + `files` describe a package that actually runs when installed | done, Phase 6 - packed install and API/bin checks pass |
| 7 | No printing and no exiting outside `cli.ts` | holds, Phase 3 - no `console.*` or `process.exit` under `src/` outside `cli.ts` |

Two conditions have deviated from the original design on purpose:

- **Condition 3** was specified as "default to `git rev-parse --show-toplevel`, then `cwd`".
  That is wrong here and would be wrong in any nested repo - see the trap in section 4. The
  workspace root now comes from the session's own `workspace.json`.
- **Condition 6 is closed locally.** The manifest points `bin` at `./dist/cli.js`, `exports` at
  `./dist/index.js`, and the build produces both files plus TypeScript declarations. Git installs
  build ignored `dist/` files through `prepare`; packed installation, bin, API, declaration, and
  skill-install checks pass. The activated CI job is the remaining independent environment check.

### 1.3 Distribution

Ordered by consumer friction, lowest first. Phase 6 picks one; the folder stays self-contained,
so the others remain available without rework.

| Method | Consumer command | When |
|---|---|---|
| Internal registry or GitHub Packages | `npx @scope/copilot-chat-export` | preferred, if a registry exists |
| `git subtree split` to its own repo | `npm i -D github:org/copilot-chat-exporter` | no registry, want history |
| `npm pack` tarball, vendored | `npm i -D ./vendor/*.tgz` | air-gapped |
| Plain folder copy | works because the folder is self-contained | always available fallback |

## 2. The method: save a copy first, then move, then reshape

The ordering principle is: **never refactor without a mechanical answer to "did the output
change?"** Everything else follows from that.

1. **Save a copy of the output before touching anything.** A large, real input was frozen and its
   export captured *using the pre-refactor code*. Every later step is then pass or fail rather
   than an argument about a difference.
2. **Move without reshaping.** The file was relocated verbatim; only two path constants changed.
   Both checks stayed green, which proved the move was inert.
3. **Remove machine-dependence before splitting.** Any behavior that varies by locale, install
   location, or working directory is noise that will pollute every future comparison. Eliminate
   it first, while the code is still one file and the blast radius is small.
4. **Prefer zero-diff changes.** Where possible, design each fix so it produces byte-identical
   output on the current machine. The saved copy then *proves* the change was inert instead of
   needing a judgement call about an expected difference. If a "zero-diff" change forces a
   re-record, that is a signal the change was not what you thought it was.
5. **Split last, smallest pieces first, with tests attached.** Modules come out in dependency
   order, each with its own tests, each verified by both checks.

## 3. The two recorded checks

| Check | Input | Compares | Portable? |
|---|---|---|---|
| Golden | 9-turn made-up journal | digest + full export (~27 KB) | Yes - kept in the repo, CI-able |
| Baseline | 73-turn / 1302-tool-call real session | full export, byte-exact | No - ~33 MB, gitignored |

Both compare against a saved copy, so they lock in current behavior *including current bugs*.
They prove "nothing changed", never "this is correct". Do not confuse the two.

The digest and the full export answer different questions, and both are needed. The digest names
*which field* drifted; the export shows *what the page now looks like*. A one-character heading
change passes the digest and fails the export - verified deliberately by corrupting the saved
copy and confirming the check failed with a line-level difference.

Normalization lives in `src/verify/golden.ts`, shared by the golden check and the harness, and
masks exactly four volatile things: the export timestamp, the live `git status` snapshot, the
working-tree line counts, and the document's own output path.

Two of those rules exist for non-obvious reasons:

- The **line-count** rule *drops* the suffix rather than masking it, because the suffix also
  disappears when a recorded file is later moved or deleted. Masking would have made the check
  fail for an unrelated reason.
- The **output-path** rule exists because the document embeds the path it was written to, so a
  "record" run and a "check" run differed on exactly one line. That was originally worked around
  by forcing every render to one fixed scratch path; normalizing is the real fix.

### 3.1 What the recorded checks do not test

Passing both means the output is unchanged. It never means the output is correct. A module split
that ships only these is, in the ordinary sense of the word, untested - so Phase 3 adds five
categories they cannot reach.

| Category | Asserts | Why the recorded checks miss it |
|---|---|---|
| Pure-function units - `text`, fence selection, path helpers | given input X, output Y | they only exercise the paths two particular sessions happen to take |
| Per-kind parser fixtures - one minimal journal per handled kind | each kind classifies to the expected node | a kind absent from both fixtures is never executed at all |
| Host tests against a stand-in `HostContext` | platform and precedence branches | both run on one machine, one OS, one storage layout |
| `resolveOutputPath` branches | the six-way default-path decision | both pass an explicit output path, so none of it runs |
| Packaging | the installed tarball actually runs | both run from the source tree, which is not what a consumer receives |

The packaging check is how contract condition 6 gets verified, and it is worth spelling out:
`npm pack`, install the tarball into a scratch directory, run the *installed* binary against the
golden fixture, diff against the committed render. Section 4 records a `bin`/`files` mismatch
that would have shipped a broken package; it was caught by reading the manifest, which is luck.
This check catches that class mechanically.

One rule ties the whole thing back to the Phase 2 census: **every kind in
`HANDLED_RESPONSE_KINDS` must appear in at least one committed fixture.** It is machine-checkable,
it gives the Phase 5 minimizer a concrete acceptance criterion, and it closes the gap where a
kind sits in the dispatch table having never once been executed by a test.

## 4. Traps found (the instructive part)

**The output was machine-dependent.** `Number.toLocaleString()` and `String.localeCompare()`
made thousands separators and sort order depend on the OS locale. This defeats portability and
makes the saved copy useless to another developer or to CI. Pinning the *test* locale was
rejected: Node on Windows takes its ICU default locale from the OS, not from `LANG`/`LC_ALL`,
so the workaround is harder than the fix and only fixes the test, not the product.

**Two different roots were entangled.** The tool needs a *package root* (where its own fixtures
live, derived from `__dirname`) and a *workspace root* (the project the session was about, used
for link relativization, line counts, and `git status`). Both came from the same `../..` hop,
which landed correctly only because the tool happened to sit exactly two levels down.

**The obvious fix for that was also wrong.** Defaulting the workspace root to
`git rev-parse --show-toplevel` fails here: this repo's git root sits about three levels above
the project folder, so every path in the output would have been re-rooted. The correct source
is `workspaceStorage/<hash>/workspace.json`, which VS Code writes next to `chatSessions/` and
which names the exact folder the session belonged to. That is right regardless of where the
tool is installed, and it also fixes exporting a session that belongs to a *different*
workspace than the one you are standing in.

**Verification found a bug that review had missed.** Re-running the baseline from an unrelated
working directory failed on five lines - all of them *untitled* documents. `workspacePath()` used
`path.resolve(value)`, which resolves relative inputs against the current directory rather than
the workspace, so untitled documents rendered as absolute temp paths. The fix,
`path.resolve(ROOT, value)`, is zero-diff when the two coincide. Note the diagnosis: five
differing lines meant the root resolution was working correctly; had it fallen back to cwd, all
several thousand paths would have gone absolute. "Run it from somewhere else" is now a standing
check, and both comparisons pass from any working directory.

**All three verification layers shared one blind spot.** The parser silently ignores any
unrecognized node `kind`, and the "independent" Layer A cross-check re-derives tool calls by looking
for the same `kind` string. If VS Code renames a kind, content vanishes from exports and every
layer still agrees. Independence between checks is only real if they do not share assumptions.
The fix is a `kind` census: tally every distinct kind seen, diff against the handled set, and
report unhandled kinds in `--verify` *and* in the exported document itself.

**A tool call id can be reused within a single turn.** Progress updates for one call and a
genuinely new invocation of the same command look alike. Merging on id alone silently hides the
second invocation; the merge must be gated on the tracked entry still being incomplete.

**Wasted I/O hid behind a warm file cache.** Session resolution read every journal in full - 194
MB across 47 sessions - just to display titles that only `--list` uses. It measured as ~1.5 s
because the OS cache was warm, which is exactly why wall-clock time was the wrong metric. Fixed
by a bounded first-line read plus lazy titles. Note the non-obvious detail: a journal's *first*
record is a full state snapshot and can be 16 MB, so "read one line" is not automatically cheap.

**A published package can be broken while the local one works.** `bin` pointed into `src/`
while `files` excluded `src/`, so the tarball would have shipped a bin entry to a missing file.
Local success says nothing about the packaged artifact.

**Hand-authored fixtures drift from reality.** The synthetic golden fixture's own notes admit
two of its shapes have no real-session precedent. Deriving a fixture from a real session cannot
have that problem.

**An ignore list is a suppression list.** The census only warns about a kind that is in neither
the handled set nor the ignored set, so every entry in the ignore list is a standing promise to
stay silent. Fourteen of the original twenty entries had never been observed in any journal -
they were written from general knowledge of VS Code's response-content union. Several of them
(`pullRequest`, `multiDiffData`, `treeData`, `notebookEdit`) plausibly carry content, so the
alarm Phase 2 had just installed was pre-disabled for exactly the cases most likely to trip it.
They now live in `KNOWN_UNSEEN_KINDS`, which documents the name without suppressing it; if one
appears it is reported as unhandled and earns its classification with evidence. The change is
inert by construction - a kind that occurs in no fixture cannot alter any render - so both
checks validated it for free, and a scratch fixture with a kind renamed to `pullRequest`
confirmed the census now reports it.

**The provenance marker was itself unverified.** `VALIDATED_AGAINST` shipped as
"VS Code 1.106 / Copilot Chat 0.35", a guess. The install actually runs VS Code 1.134 and
Copilot Chat 0.62. The guess survived because Copilot Chat is now a *bundled* extension under
`resources/app/extensions/copilot-chat`, so the habitual check of `~/.vscode/extensions` finds
nothing and invites an assumption instead. A marker whose whole job is to tell a future reader
what the parse was validated against is worse than useless when wrong. Correcting it was the
first deliberately non-inert change of the migration: it altered exactly one line in each
saved copy, which was confirmed before re-recording.

**A move is only inert if you find every caller, and the fast way to check is the type checker.**
Extracting `session/locate.ts` broke two things at once. `readFirstLine` had a second caller -
`readVersions` - which the extraction missed; because that function wraps its work in a broad
`catch`, the resulting error became the string `unknown` in the export rather than a crash, and
only the byte comparison noticed. Worse, `SESSION_ID_PATTERN` was still used in argument parsing,
and **neither recorded check caught that at all**: both pass a `.jsonl` path, so the `||` in
`firstArgument?.endsWith('.jsonl') || SESSION_ID_PATTERN.test(...)` short-circuits before
reaching it. The tool crashed on `cli.ts <sessionId>`, its most ordinary invocation, while every
check reported green.

Both were reported by `tsc --noEmit` in about two seconds as `TS2304: Cannot find name`.
`node --check` cannot see them - it validates syntax, not bindings. So the type check belongs
*first* in the gate, ahead of the slow byte comparisons. While Phase 4 was in progress its count
had to be compared against a known figure, since a rise is a regression even when the total is
not zero; since Phase 4 the figure is zero and the rule is simply that it stays there. The
episode also showed that a broad `catch` intended for "this file is optional" silently absorbs
programming errors, and that command-line argument parsing has no test coverage at all.

`node --check` was later dropped from the gate entirely. It only ever pointed at `src/cli.ts`, so
after the split it validated 1 file of 12, and inside `npm run verify` it ran *after* the type
check, which parses all 12. It was a leftover from when the tool was one file.

**An unrecognised flag became a filename.** Argument parsing collected "everything that is not a
recognised flag" into a positional list, where the second entry is the output path. So a
misspelling was not an error, it was a destination:

```
node src/cli.ts <session> --verfiy
Output: ./--verfiy (28,388 bytes)      exit=0
```

That is a full export, written to a file named after the typo, reported as success, by someone
who believed they had run a verification. The lesson is narrow and repeatable: **a parser whose
fallback case is "treat it as data" cannot distinguish a typo from input.** The fix is to give it
the list of flags it knows and let it reject the rest.

The reason it survived this long is the more useful half. `cli.ts` was the one file with no
tests, and it had the worst defect history in the project - both bugs that ever shipped were in
argument handling. Those two facts have the same cause: the parsing ran at module top level, so
importing the file ran the tool, so no test could reach it. Untestable and buggy were not a
coincidence, they were the same property seen twice. Extracting `parseArgs` into `src/args.ts`
as a pure function that returns either options or a usage message made it ordinary to test, and
twelve tests went in with the fix.

**A filtered command that matches nothing looks exactly like one that passed.** While verifying
snapshot support, `npm run ... --snapshot check <id> | Select-String 'Snapshot check'` printed
no matching line and was read as success. It had actually failed: the fixture is not in VS Code
storage, so it must be addressed by path rather than by bare session id. Every other check in
this document exists because output can look right while being wrong, and the verification
command itself turned out to have the same failure mode. Assert on the exit code, not on the
absence of an error line.

## 5. Phases

**Phase 0 - determinism and package contract. DONE.** Every item was designed to be zero-diff, so
the existing checks validated them without a re-record. Shipped: locale pinned via
`Intl.NumberFormat` / `Intl.Collator`; package root separated from workspace root, the latter
resolved from `workspace.json` with a `--workspace-root` override; `workspacePath()` made
cwd-independent; `files` corrected so a tarball ships what `bin` points at; the directory rule
adopted (`test/fixtures/` = saved artifacts to compare against, `test/baseline/` = generated output);
the normalizer lifted into `src/verify/normalize.ts` and shared (absorbed into
`src/verify/golden.ts` in Phase 3); a normalized golden render
committed so `--golden check` compares digest *and* render; dead code removed; the stale
reference export renamed to `reference-live-session-export.md` and made regenerable from the
frozen fixture via `npm run ai:export:chat:reference`.

Deferred out of Phase 0 rather than guessed: the package scope and the license both need a human
decision, and neither matters until publishing. `exports` and the `bin`-to-bundle switch were
deferred to the phases that create their targets - pointing them at files that do not exist yet
would be worse than omitting them.

Sequencing trap encountered: the render embeds its own output path, so the scratch file had to
move *before* the expected render was recorded.

**Phase 1 - host seam. DONE.** Shipped: `HostContext` carrying workspace root, output directory,
and git status; cross-platform storage discovery across Windows, macOS and Linux for four
channels (Code, Insiders, Exploration, VSCodium); git isolated to `src/host/git.ts` as the sole
`execFileSync` site; five-level output-directory precedence ending at `.copilot-chat-history/`
rather than the project root; `YYMMDD_slug_<idPrefix>.md` auto-naming. `uniquePath` and its `_2`
suffixing were deleted in favour of overwrite, since a re-export of the same session is the
normal case and a numbered pile is not.

All six output-path branches were walked by hand because neither check reaches them - both pass
an explicit output path. That gap is Phase 3's first debt.

**Phase 2 - schema-drift detection. DONE.** Shipped: the `kind` census reported in `--verify`
and in Export Provenance, a `--strict` exit code for CI, an in-document `[!WARNING]` when
content was dropped, and the `VALIDATED_AGAINST` marker.

It paid for itself immediately. The census flagged `workspaceEdit`, which turned out to be a
recorded *file deletion* that every previous export had silently dropped - the one class of bug
no check that compares the export against itself can find, because both sides of the comparison agreed the content did
not exist. It also produced one instructive false positive: `thinking=749` was flagged because
empty streamed partials legitimately classify to nothing. "Unhandled" had to be redefined as
*kind absent from the dispatch table*, not *kind that produced no node*.

**Phase 3 - module split with tests. DONE.** This is a move, not a redesign. The parsed model already
exists implicitly; `types.ts` writes it down first so each half of the pipeline has something to
be tested against. The order:

1. `types.ts` - the parsed model. Nothing after it can be tested on its own until this exists,
   which is why it leads rather than trails. **Done.**
2. `text.ts` - palette and string shaping. Pure, no dependencies, immediately unit-testable.
   **Done** - 17 unit tests, both recorded checks byte-identical, so the move was provably inert.
3. `host.ts` - merged from `host/`, absorbing the path and output-name helpers. **Done** -
   12 tests, including the six `resolveOutputPath` branches that Phase 1 left uncovered and the
   five-step output-directory chain. The "only one module starts a subprocess" claim is now a
   test rather than a comment.
4. `session/*` - `locate`, `journal`, `classify`, `enrich`. The only code that reads VS Code's
   private shapes. **Done** - 22 tests. Moving `locate` broke two things and produced the lesson
   in section 4 about running the type check first. `classify.ts` now holds the three kind lists
   next to the dispatch they describe, which is what makes `docs/UPGRADING.md` able to say "you
   edit this file" and mean it.
5. `render/markdown.ts` - reads the parsed model and nothing else. **Done**, as `src/markdown.ts`
   (452 lines) - `render/` would have contained a single file, which is a folder with nothing to
   group. 14 tests, the most important being that a turn body renders in recorded order rather
   than bucketed by type.
6. `verify/*` - `layers.ts`, then `golden.ts` (absorbing `normalize.ts`). **Done** - 20 tests.
   Only the builders moved; every `print*` function stayed in `cli.ts`, which turned contract
   condition 7 into a clean split between computing a report and showing one, at no conversion
   risk. The tests that matter here are the ones for the layers' own blind spots: that the
   cross-check ignores tool ids quoted inside string values, and that the render report ignores
   its own markers when they appear in fences or blockquotes - both of which a self-referential
   export produces constantly. `cli.ts` is 583 lines, down from 2,415.
7. `index.ts`, and the JSON probe. **Done** - 6 tests. `loadSession` and `renderSession` are what
   `cli.ts`'s 250-line top-level block collapsed into, which is also what makes the pipeline
   callable from a test at all. `package.json` gained the `exports` map deferred out of Phase 0,
   now that it has something to point at.

   **The probe passed, and the flag it arrived on was then removed.** `sessionToJson` needed
   exactly two pieces of real work, and both are about the container rather than the model: the
   census `Map`s stringify to `{}` and had to be converted, and `rawRequests` is excluded because
   it is the input. Everything else is the parsed turns as they already are. That is the claim in
   section 5 proved.

   Running it on a real session then made the case against shipping it as `--format json`: a
   73-turn conversation that renders as 2.4 MB of Markdown is 40 MB of JSON, because every tool
   output is embedded whole - terminal transcripts, file reads, prior exports quoted back through
   a subagent result. Those bytes are the least informative part of the file for any correctness
   question, and they make the artifact too large to diff or review. The structural summary that
   *would* be useful for that already existed as the golden digest builder: same turns, same order, same
   tool-id sequence, contents reduced to hashes, size bounded by counts rather than payloads.

   So `sessionToJson` stays as an exported function with no CLI surface, for a caller that
   genuinely needs contents, and the flag, the `.json` extension plumbing in `resolveOutputPath`,
   and the two format-dispatch tests are gone. The probe was a claim about the design, not a
   feature request, and it was treated as one only after the fact - the flag went in first and
   had to be taken back out.

   `buildDocument` moved into `markdown.ts` rather than a new `document.ts`, per the merge-into-
   its-consumer rule. That puts the file at 711 lines, just over the ~700 threshold set above.
   Flagged rather than acted on: the seam is real ("how a turn looks" versus "what sections the
   page has") but nobody has yet been made worse off by the size, and the rule was written to
   need evidence of pain, not a line count alone.

   The move also removed the last non-determinism from rendering: `outputPath`, `gitStatus` and
   `generatedAt` are parameters now, not calls to the clock and to git from inside the renderer.
   A test can therefore assert that the same parse renders the same bytes twice, which is the
   property both recorded checks silently depend on.

Each extraction ships its own `node:test` file in the same step, drawn from the taxonomy in
section 3.1. Satisfies contract condition 7.

**Phase 3 addendum - session snapshots.** Removing `--format json` left a real question standing:
what *does* answer "did my change break a conversation the committed fixtures do not contain".
The golden digest builder was already the right artifact - turn and tool structure, tool-call order,
files touched, contents reduced to hashes - and was only prevented from serving any session by
two accidents: it baked in the golden fixture's synthetic-case notes, and there was no way to
name an output file. Both were a few lines.

So it became `buildDigest(session, renderCounts, notes)`, and `--snapshot check|update` writes
and compares `test/snapshots/<sessionId>.digest.json`. Gitignored, because a snapshot names a
session that exists only in one machine's VS Code storage.

The census went into the digest at the same time, which cost one re-record of the committed
golden digest. That is the move the plan warns about, so the diff was read first: six fields,
all of them the schema bump and the five new census keys, with no per-turn and no render
movement. Without the census a newly handled kind would show up only as one turn's text
changing, which is the weakest possible signal for the exact case snapshots exist to cover.

Proved end to end by renaming `thinking` to `thinkingV2` in a copy of the golden fixture and
running `--snapshot check` against the original's snapshot: six fields drifted, naming
`census.unhandled` gaining `thinkingV2` and the two turns whose thought counts fell to zero.
That is the report a maintainer wants on the day VS Code renames something.

JSON output is a required outcome of this phase, though not a required *file*, and not a required
*flag* either. If the parsed model is sound, serialising it is nearly `JSON.stringify`; if it
turns out to need real work, something leaked and the split has not actually happened. It is a
claim about the design that can be proved wrong, rather than a feature request - so once proved,
keeping it reachable from the API is enough.

`docs/UPGRADING.md` is written (ahead of the split, since the census can already fire). It
covers: the symptom table; how to dump a real node rather than guessing from a kind name; the
three-list decision with the rule that an unobserved name never goes on the suppression list;
the fact that `classifyNode` may return an array and that assistant prose has no `kind` at all;
the verify order with the warning to read the diff *before* re-recording; and how to refresh
`VALIDATED_AGAINST`, including that Copilot Chat is a bundled extension absent from
`~/.vscode/extensions`. Its "where you work" table needs its module column updated as each
extraction lands.

`resolveOutputPath` needs a unit test specifically, because neither check covers it - both pass
an explicit output path, so the function that picks a default is entirely untested. All six of
its branches were verified by hand in Phase 1; that is not a substitute.

**Phase 4 - annotation pass. DONE.** Cleared the 28 inference errors, then `noImplicitAny`, then
`strict`, one flag at a time as planned. Every step was byte-exact, because the rule was
annotations only: if fixing an error needed a code change, that was a finding to report rather
than something to paper over.

Three code changes did happen, each provably inert. `JSON.parse(value)` became
`JSON.parse(String(value))` - `JSON.parse` already coerces, and the pathological input lands on
the same `catch`. `Number.isFinite(x)` became `typeof x === 'number' && Number.isFinite(x)` in
two places - `Number.isFinite` returns false for every non-number, so the added clause cannot
change a result, it only lets the compiler see what was already true. And the four
`error.code || error.message` sites became one `errorLabel()` helper, because a caught value is
`unknown` under `strict` and four casts would have been worse than one function.

Counts: 28 pre-existing, then 258 under `noImplicitAny`, then 27 under `strict`. The last number
is the interesting one - a codebase that had never been null-checked produced 27 errors, not
hundreds, because the coercing helpers in `text.ts` were already written to handle a missing
value. Their signatures just had not said so. Most of the fix was `number` becoming
`number | null | undefined` on functions that already returned `'0'` or `'not recorded'` for it.

Two findings worth keeping:

- **`TurnScalars` was six fields behind the code.** It declared `modelId`, the two token counts,
  credits, `elapsedMs` and `responseTimestamp`, with an index signature described as "collected
  but not yet rendered". But `turnInfo` renders `agent`, `modeInfo`, `responseId`, `timestamp`,
  `promptTokenDetails`, `contentReferences`, `codeCitations`, `followups` and `isCanceled` too.
  The index signature had been quietly absorbing all of them. Now declared, one per entry in
  `SCALAR_FIELDS`.
- **Connecting `parseChatSession` to `ParsedSession` surfaced nothing.** The declared model and
  the code already agreed, which is the answer Phase 3 was hoping for when it wrote `types.ts`
  first.

Where `any` survived, it is deliberate and marked: `classifyNode(item: any)` and the journal
helpers around it take one record of an undocumented format owned by someone else. Declaring a
shape there would be a guess that the compiler then enforces as though it were known.

**Phase 5 - portable fixture and CI. DONE, with the minimizer dropped.**

The plan called for a minimizer that derives a small redacted fixture from a real session, with
the census as its acceptance test. Measuring the gap first made that unnecessary. The committed
fixture was missing exactly nine shapes: `workspaceEdit`, an empty streamed `thinking` partial,
six ignore-list kinds (`undoStop`, `codeblockUri`, `progressMessage`, `progressTaskSerialized`,
`confirmation`, `questionCarousel`), and the `input` tool payload. Six of those nine are kinds
that classify to nothing, where `{"kind":"undoStop"}` *is* the whole shape - nothing to derive.
That left two that needed real structure, and both were readable straight out of the local
journal.

So the shapes were transcribed from real nodes and the content was invented, which gets the
coverage a minimizer would have produced without writing a minimizer, without committing content
derived from someone's real conversations, and without a large generated diff. The fixture grew
by one turn. Its census now matches a real 73-turn session on every response kind and every tool
payload kind. Re-recording was reviewed first: seven fields, all of them the new turn and the
census gaining those kinds, with no movement in `perTurn[0..8]`.

Keeping the plan's own framing: hand-authored still covers deliberately constructed edge cases.
What changed is the claim that only a derived fixture can cover reality - it can also be covered
by reading reality and writing it down, and the census proves which.

**Portability was the part that actually needed work.** Both recorded checks had only ever run on
Windows, so "machine-independent" was an assumption, not a result. Two things were checked:

- Fixture paths were computed under both `path.win32` and `path.posix` semantics. They agree, so
  a Linux runner produces the same `c:/fixture/...` strings.
- The fixture journal had **mixed line endings** (34 CRLF lines plus 12 LF ones). With
  `core.autocrlf=input`, a fresh clone would have received a file different from the one on the
  authoring machine. Normalizing it to LF left the render byte-exact, which also proves the
  parser is line-ending independent, and `.gitattributes` now pins the package to LF so the
  expected render can never be handed to a comparison in CRLF form.

The committed render was also checked for leaked host paths (`_DATA`, the username, `AppData`,
drive letters): none.

**CI is active for the current GitLab home.** Two jobs are written, because the package has two
homes. The monorepo root pipeline includes `ci/gitlab-ci.yml`; the job runs when exporter files
change. It is destined for its own GitHub repository, so
`ci/github-workflow.yml` is a workflow to copy to `.github/workflows/verify.yml` after
extraction; that one runs a matrix of ubuntu and windows on Node 22.18 and 24, because the first
run on Linux is the real test of the portability work above.

The first GitLab runner execution is still external evidence; it cannot be produced from the
local workspace. The gate itself is one command, `npm run verify`, followed in CI by the build
and package dry run. `verify:local` adds the baseline that only this machine has.

**Phase 6 - distribution. DONE LOCALLY.** The MIT license is in place, and the author and
copyright holder is `rrabbani`. The bundle and package boundary are now implemented: `scripts/
build.mjs` uses esbuild to produce `dist/cli.js`, `dist/index.js`, and declarations; Node
built-ins remain external, `bin` points at the CLI bundle, and `exports` points at the typed API
bundle. The `prepare` hook builds ignored `dist/` artifacts for git installs. The package
still supports the folder-copy development path through `src/cli.ts`.

The newcomer-facing schema guide is now `docs/CHAT-SESSION-SCHEMA.md`. It is intentionally
separate from the contract: the contract says what this exporter promises, while the guide says
what VS Code currently stores, which parts are official source evidence, which parts are local
observations, and how to investigate the next change without treating an undocumented file as a
stable API.

The bundle passed its golden check. The actual packed tarball installed into a clean temporary
prefix, its Windows bin shim rejected an unknown flag with exit 1, and the installed API exposed
`loadSession`, `renderSession` and `sessionToJson`. The first bundled golden check found a real
path bug - the source module and bundled module have different directory depths - and the
package-root calculation now handles both. The final rehearsal verifies the packed bin, API,
declarations, and `--install-skill`; the tarball contains the bundle, license, changelog, docs,
skill, prompt, and CI templates, but not tests, fixtures, snapshots, or source maps.

`--install-skill <targetRoot>` installs both the skill and prompt under the explicit root and
reports created versus replaced files. `CHANGELOG.md` carries the unreleased 0.1.0 notes. The
package deliberately remains `private: true`: folder, git, and tarball distribution are enough
for current consumers, so npm registry publication and scope selection are deferred until a real
registry consumer exists. GitHub workflow activation remains a repository-extraction step.

The license is MIT, `LICENSE` is in place, and the author and copyright holder is `rrabbani`.
The npm publication decision is recorded as "not yet" - see section 8.

This phase closes contract condition 6. `bin` moves to the bundled `dist/cli.js` while the
development npm script stays on `src/cli.ts`, so publishing does not cost the fast edit/verify
loop that the whole method depends on.

The runtime floor is `engines: ">=22.18"`, not the `>=20` this plan originally carried. Node 20
is end-of-life, and 22 is both the current LTS and the line where type stripping landed. The
bundled CLI targets Node 22.18, so the source development path and the published path currently
share that floor. The GitHub matrix is the remaining independent check of that claim.

## 6. Decision log

| Decision | Rationale |
|---|---|
| Consumption model: folder-copy primary, bundle as build output, registry-publishable | The "drop one file in" goal conflicts with a module split unless a bundler is added; supporting both costs one devDependency |
| Workspace root from the session's `workspace.json` | Correct at any install depth, and correct when exporting another workspace's session |
| Line-count annotations stay always-on, skipped when the file is missing | Accepted trade: exports remain working-tree dependent, so the normalizer keeps masking them |
| Golden scratch render stays in the workspace, not a temp directory | A failed check needs the markdown to be immediately readable; the digest diff names the drifted field but not what changed on the page |
| `--golden check` compares digest *and* a saved copy of the export | ~27 KB is cheap, gives CI a byte-level check immediately, and turns output changes into reviewable markdown differences |
| Keep both fixtures | Different coverage: reality vs constructed edge cases |
| Baseline stays local-only | ~33 MB; the derived fixture is the portable answer |
| Unused *fields* deferred to post-migration; dead *code* removed immediately | Deleting an uncalled function is provably inert; rendering an unused field changes output and would muddy the zero-diff staging |
| Parser/verifier duplication kept and commented | Layer B must not reuse the parser it checks; the residual risk is that editing both together silently re-converges them |
| Unverified kinds documented in `KNOWN_UNSEEN_KINDS` rather than deleted or ignored | Deleting loses the research; ignoring suppresses the census. A third list keeps the name as a note while leaving the alarm armed |
| `types.ts` written first | The parsed model already exists implicitly. Declaring it up front gives every later extraction something to be tested against, and gives a newcomer one file that answers "what is a turn" |
| Dropped a proposed rule forbidding journal shapes in `render/` | Measured before adopting: it would have relocated four branch sites and removed none, at the cost of a non-inert change mid-refactor. The property that actually matters - `kind` dispatch in one function, renderers on our own `node.type` - already holds |
| Orphaned code merges into its consumer; no `utils.ts` | A bucket defined by size has no cohesion. It becomes the drawer everything imports and nobody owns, and it grows without an owner to say no |
| `text.ts` is a shared leaf at `src/`, not `render/format.ts` | Mapping the dependencies before moving showed several primitives are needed on both sides - `extractUri` while parsing *and* while rendering, `COLLATOR` for a parsed file list *and* a rendered table. Under `render/` those would force `session/` to import upward. A leaf everyone depends on has no such direction |
| `host/` collapsed to one file; the subprocess invariant became a check | Three files totalling 150 lines cost a reader three opens. A file boundary never enforced "only one `execFileSync`" anyway - a scoped assertion does |
| JSON output is a function, not a module and not a flag | If the parsed model is right the implementation is trivial, and that is the point proved rather than a reason to create a file. Shipping it as `--format json` was a mistake corrected in step 7: 40 MB of embedded tool output, and no consumer asking |
| JSON output required in Phase 3, not optional | It is the cheapest way to prove the parsed model is real. "Usable by programs rather than only by readers" was the weaker half of this and should not have been read as a feature request |
| A structural summary, not a full dump, is what answers a correctness question | Hashes of prompts and assistant text plus counts, tool-id order and files touched are bounded by counts rather than payloads. `buildDigest` already is this; the full dump is not a substitute for it |
| The digest was generalized and given `--snapshot`, rather than left welded to the fixture | It was already the right shape for any session. The only thing stopping it was the hardcoded synthetic-case notes and no way to name an output file. Both were a few lines |
| The census went into the digest, costing one re-record | "A session containing something this build has never seen" is exactly what a snapshot is for, and without the census a new handler shows up only as one turn's text changing. The re-record diff was reviewed first: six fields, all of them the schema bump and the five new census keys, no per-turn or render movement |
| Snapshots are gitignored, not committed | A snapshot names a session that exists only in one machine's VS Code storage. Committing one would be noise in every other checkout |
| Fixture extended by hand instead of by a minimizer | Measured first: six of the nine missing shapes classify to nothing, so there was nothing to derive, and the other two were readable from the local journal. Transcribing shapes and inventing content gets the same census coverage with no generated diff and no real conversation content committed |
| Package pinned to LF via `.gitattributes` | The recorded checks compare bytes and read the expected render from the working tree. A CRLF checkout would fail them for a reason unrelated to the change under review |
| CI enabled through a local include | The monorepo root now declares the test stage and includes the exporter job; the first runner execution remains external evidence |
| Two CI files, one per host | The package is developed in a GitLab repo and destined for a GitHub one. A workflow under `tools/` does nothing on GitHub anyway, since GitHub only reads `.github/workflows/` at a repository root, so both are templates rather than live config |
| License MIT | Chosen by the maintainer. Recorded here because `LICENSE` and `package.json` must agree, and a published package with `UNLICENSED` is unusable by anyone |
| Published floor `engines: ">=22"`; `bin` to the bundle, dev script to `src/cli.ts` | Node 20 is end-of-life and 22 is where type stripping landed; splitting bin from the dev script keeps the fast loop without narrowing consumers |
| Portability verified by installing the packed tarball, not by inspection | The one packaging bug found so far was caught by reading the manifest; luck is not a control |
| Redaction hardening deferred to post-migration | It changes rendered output, so it cannot ride the zero-diff staging that Phases 0-4 depend on. Section 7.1 records the design so the deferral is not amnesia |
| Scope and license deferred out of the early phases | Both need a human decision and neither matters until publishing; guessing a scope would churn every workspace reference for no benefit. License has since been settled as MIT; the scope is still open, and section 7 records why it should be settled before the first publish rather than after |

## 7. Post-migration backlog

- **Observe the first CI run.** The GitLab include is active. Confirm the runner image and first
  fresh-checkout result. After extraction to GitHub, copy `ci/github-workflow.yml` to
  `.github/workflows/verify.yml` and observe the Ubuntu/Windows Node 22.18/24 matrix.
- **Publish to npm, or decide not to.** Not blocking anything: the tool is consumed by copying
  the folder, which is what it was built for, and `npm i git+https://github.com/<org>/<repo>`
  already works without a registry entry at all. Current recommendation is to leave it
  unpublished until someone outside this repository actually wants to install it by name.

  What has to be true before `npm publish` will run:

  1. `private: true` comes off `package.json`. It is there deliberately, as the catch that stops
     an accidental publish while the package is a workspace member.
  2. The name is settled. `@rrabbani/copilot-chat-exporter` is the zero-friction option: the
     account exists and public scoped packages are free. Unscoped `copilot-chat-exporter` is
     shorter but has to win a global race for a fairly guessable name. An organisation scope
     (`@<org>/...`) costs an npm org, free while the package is public.
  3. Record a new registry release decision. Phase 6 is complete for folder, git, and tarball
     distribution; npm publication is intentionally deferred.

  **Pick the scope before the first publish, not after.** A scope cannot be renamed in place; a
  move from `@rrabbani/...` to `@<org>/...` means publishing under a new name, deprecating the
  old one, and every consumer editing their `package.json`. So the question to answer up front is
  not "which is easiest today" but "is this tool likely to outlive one maintainer's involvement".
  If yes, start with an org scope even though it is slightly more setup. Section 8 has the full
  comparison.
- Decide render-or-drop for fields collected but never rendered: `isConfirmed`,
  `initialLocation`, `modelState`, `timeSpentWaiting`.
- **Low priority - render selected session metadata in Markdown.** The JSON API already preserves
  session-wide values, but the Markdown renderer omits them because they are operational state,
  not conversation content. Decide whether a compact, opt-in metadata section improves exported
  documents without exposing draft input or attachment details. Example from a real session,
  with `inputState` deliberately summarized:

  ```json
  {
    "customTitle": "Using DataSourceManager in widget",
    "creationDate": 1787162897045,
    "responderUsername": "GitHub Copilot",
    "initialLocation": "panel",
    "hasPendingEdits": false,
    "inputState": {
      "keys": ["attachments", "mode", "selectedModel", "inputText", "selections", "permissionLevel", "contrib"]
    },
    "pendingRequests": [],
    "copilotVersion": "0.61.0",
    "vscodeVersion": "1.133.0"
  }
  ```
- Revisit the deliberate parser/verifier duplication: keep, or unify and accept a weaker Layer B.
- Consolidate the near-duplicate exports of the same session under `docs/chat-exports/`.
- `.chat-history/` is a second, pre-existing exporter from a different tool. It has no code
  collision with this one. Its naming convention was adopted here, and because it is an
  independent render of the same journals it can serve as a cross-check that this parse is not
  dropping turns.
- `markdown.ts` is 732 lines, past the ~700 mark section 1.1 sets. The seam if it is ever split
  is `buildDocument` (what sections the page has) versus everything above it (how one turn
  looks). Waiting on evidence of pain rather than the line count.

### 7.1 Redaction hardening

**What exists.** A single `redact()` function applying two regular expressions - one for
`Authorization: Bearer <token>`, one for `api_key` / `access_token` / `refresh_token` /
`password` / `client_secret` assignments. Its *plumbing* is genuinely good: it is applied at
roughly twenty call sites, covering terminal output, tool results, MCP payloads, resource
bodies, memory and plan files, edited-file paths, the session title, and the `git status`
snapshot. There is no obvious rendering path that bypasses it.

**What is not known.** Scanning the 2.4 MB baseline render for `[REDACTED]` returns **zero
matches**. The same scan for high-confidence secret formats - `ghp_`/`gho_`/`ghs_`,
`github_pat_`, JWTs, `AKIA`, `sk-`, `xox[bapr]-`, PEM private-key headers - also returns zero.
So this corpus is clean, and that is the good news; but it also means the redaction path has
never executed on real input. It is simultaneously untested and unproven.

**Why it matters more here than in a typical tool.** The input is an unfiltered recording of an
engineering session: files read into context, `.env` contents, terminal output including
environment dumps, connection strings, cloud credentials pasted into a prompt. The output is a
Markdown file that people commit to repositories and paste into tickets. The blast radius of a
miss is a secret in version control, which is the expensive kind.

**Why it is deferred rather than done now.** Every improvement here changes rendered bytes the
moment it matches something, so it cannot ride the zero-diff staging that Phases 0-4 depend on.
It also wants the module boundary from Phase 3 to live in - `src/security/redact.ts` with the
rule table as data rather than inline regexes in a 108 KB file.

**Approaches, cheapest first.**

1. *Standard ruleset.* A table of named, individually-tested patterns: GitHub tokens (classic
   and fine-grained), JWTs, AWS access-key IDs and secret keys, GCP service-account JSON, Azure
   connection strings, Slack tokens, PEM blocks, `postgres://user:pass@host` style URLs, and
   whole-line matches for `.env` assignments. Low false-positive rate because each pattern is
   anchored to a known format. Covers the credentials that actually leak.
2. *High-entropy heuristic.* Flag long base64/hex runs whose Shannon entropy exceeds a threshold
   and which do not look like a hash, path, or content-addressed id. Catches formats nobody
   enumerated - which is the whole point - at the cost of false positives on minified code,
   digests, and UUID-dense output. If adopted, it belongs behind `--redact=strict` rather than
   in the default path, because a false positive silently corrupts an archive.
3. *Context allowlisting.* Suppress rules inside regions known to be safe, and conversely raise
   sensitivity inside regions known to be risky - terminal output and resource bodies are far
   likelier to carry credentials than a heading or a tool name.

Expose the level as `--redact=off|standard|strict`, defaulting to `standard`, and state plainly
in the SPEC that redaction is best-effort and not a compliance control. `off` matters for
reproducing an export exactly; the flag should be recorded in Export Provenance so a reader
knows which mode produced the file.

**How to test it.** Three layers, none of which requires real secrets:

- *Per-rule unit tests* over a synthetic corpus of **fabricated** credentials in the correct
  shapes, one positive and one near-miss negative per rule - `AKIA` followed by 15 characters
  instead of 16 must not match. This is the layer that would have caught two regexes doing
  nothing.
- *A leak test over the full render.* Run the exporter across a fixture seeded with fabricated
  secrets at every rendering path - terminal output, tool result, memory file, file path, title,
  prompt text - then assert the output contains none of them. This tests the plumbing rather
  than the patterns, and it is the check that catches a newly added renderer that forgot to call
  `redact()`.
- *A false-positive guard.* Assert that the committed golden render, redacted at `strict`, is
  byte-identical to the same render at `standard`. Any difference is a false positive on known
  good content, surfaced as a failing test instead of a corrupted archive.

Phase 5 was originally where this stopped being theoretical, because a derived fixture would have
been real chat content that had to be produced *through* the redactor before being committed.
Dropping the minimizer removed that forcing function - the fixture is hand-authored, so nothing
in the repository depends on the redactor being right. That makes this backlog item easier to
keep deferring and no less important: the risk was never the fixture, it was the exports people
actually commit.

## 8. The npm scope question

`copilot-chat-exporter` is currently an unscoped, `private: true` workspace package, which is
correct while it lives inside another repository and is never published. Publishing needs a name,
and the name is the decision.

An npm package name is either **unscoped** (`copilot-chat-exporter`) or **scoped**
(`@some-scope/copilot-chat-exporter`). A scope is a namespace owned by a user or an organisation.

| Option | What it costs | What it gives |
|---|---|---|
| Don't publish; consume by folder copy or a git URL | Nothing. This already works today | No name to argue about, no registry account, no supply-chain surface. `npm i git+https://github.com/<org>/<repo>` installs it |
| Unscoped `copilot-chat-exporter` | The name must be globally unique and unclaimed, and it is a plausible name someone else may take | Shortest to type |
| Scoped `@rrabbani/copilot-chat-exporter` | Nothing further: the account exists, and public scoped packages are free | Cannot collide with anyone |
| Scoped `@<org>/copilot-chat-exporter` | Needs an npm organisation; free for public packages, paid only if private | Cannot collide, and ownership survives one person leaving |

Recommendation: **do not publish yet**. The tool is consumed by copying a folder, which is goal
2 of the original brief and already satisfied; a registry entry adds a name to maintain and a
release to cut without changing how anyone uses it. When it is published, `@rrabbani/...` is the
zero-friction choice; move to an organisation scope only if the tool outlives one maintainer's
involvement, since a scope cannot be renamed after the fact without republishing under a new name.

Whichever way it goes, `private: true` must come off and the name must be set before
`npm publish` will run - which is the safety catch currently preventing an accidental publish.