Part of [WI-021](WI-021-source-aware-verification.md), found while planning the WI-076 verification explanation.

# WI-077 AI verification diagnostics

## At a glance

- **Goal:** make warnings and failures easy to hand to an AI coding agent as a reproducible bug report.
- **Main output:** a versioned diagnostic bundle with redacted schema samples and exact fidelity evidence, plus a short agent-ready task file.
- **Shared model:** use the same structured verification result planned for WI-076.
- **Privacy:** the dev prefers exact local capture with manual review. Automatic upload is out of scope.
- **Failure evidence:** include enough selected source and output data for offline triage without the full capture. Link the full frozen capture when it exists.
- **Status 261124:** the approved fixes (F1-F6, F8, F10, F12) are implemented and verified. A real-CLI demo and a second blind eval followed. The item waits for dev acceptance. Coverage work moved to child WI-079.
- **Trigger:** create a bundle for verification warnings or failures and exporter or verifier exceptions. Don't create one for a normal recorded tool failure when verification is clean.
- **Output:** collision-safe Markdown, JSON and selected-evidence artifacts. Schema samples keep names and types while private values are redacted. A clean run creates nothing.

## Original goal

Verification warnings often need more than a summary:

- exact event or tool type
- source line or record position
- field names and value types
- accepted fields and unsupported fields
- expected source text
- rendered evidence and companion links
- failure category and check result
- exporter, source and parser versions
- a frozen source hash or captured source

The current verification JSON deliberately removes recorded text and samples. Failure logs keep the report and runtime details, but they don't guarantee every detail needed to reproduce an unhandled structure.

WI-077 should close that gap without weakening the privacy policy.

## Done when

- Verification warnings and failures produce one collision-safe diagnostic bundle.
- Exporter and verifier exceptions produce a best-effort bundle from the evidence still available.
- Clean verification produces no diagnostic bundle.
- A normal failed shell command, test command, request or recorded tool call does not create a bundle by itself.
- The machine manifest and agent task use the same collected data.
- Selected exact evidence is sufficient for first-pass triage without the frozen capture.
- New and unsupported schema records include redacted structural samples and linked record locators.
- Repeated schema records use one sample per distinct field-path and value-type signature.
- Safe discriminators and value classes survive redaction when parser branches need them.
- Free text, IDs, paths, URLs, tokens and binary bodies don't appear in schema samples.
- The bundle includes hashes, locators, versions, expected and actual evidence, code-path hints and unknowns.
- Every omitted or capped sample has an exact total and reason.
- The CLI never uploads the bundle or passes it to a remote service.
- Local, SDK, image, parser, schema, question and exception fixtures cover the new collector.
- The redaction and sensitive-pattern limits are visible in every sharing decision.
- README, SPEC and the verification guide match the behavior.

## Current understanding

This is possible for the current code:

- SDK events keep the complete `raw` object and original JSON line.
- Layer D keeps every missing or partial item, including request, category, status, character count and a source sample.
- Layer D's internal item model does not keep the complete source piece or an expected source hash.
- Local unknown items can keep a redacted raw representation.
- Question warnings already record turn, title, summary and top-level argument names.
- SDK schema warnings have event type, line information and unsupported-field reasons in several paths.
- Failure runs keep a frozen source capture.
- Verification already exposes a versioned JSON report.
- Tool failures are recorded as conversation data. They aren't exporter failures unless another check fails.

The missing work is a diagnostic collector. It must gather samples while parsing, normalizing and verifying. The current JSON report and failure conversion discard important details.

## Current output and gaps 261123

| Failure or warning family | Current evidence | Missing for triage | Current trigger |
| --- | --- | --- | --- |
| Recorded shell failure | Tool name, command, nonzero exit, duration, output and failed badge | Stable tool or event locator in the verification report. This is expected source data, not an exporter defect by itself | No diagnostic bundle |
| Recorded SDK tool error | Tool status, result text, error message and some error code text | Separate success, error code, shell exit and raw completion fields | No diagnostic bundle |
| Recorded request or session error | Error note in the archive | A typed error family and record locator | No diagnostic bundle |
| Local Layer A or B mismatch | Console may print tool IDs and mismatch detail | Exact dropped or invented IDs and full mismatch data after conversion to verification JSON | Verification failure |
| Local Layer C structure failure | Check name, expected and actual counts | Source or output excerpt around the failed structure | Verification failure |
| Layer D content failure | Category totals, five locations and a frozen capture path | Full expected piece, best actual match, source and output hashes, lines found and stable record identity | Verification failure |
| SDK schema drift | Type name, record count, unsupported-reason note and raw payload in the archive | Redacted record per distinct signature with field paths, value types and source line | Warning or strict failure |
| Local schema or tool-data drift | Kind or payload name and count | Redacted representative, journal line, turn and field structure | Warning or strict failure |
| Question warning | Turn, title, summary and top-level argument names | Exact question arguments, answer or error, parser warning field and raw tool identity | Warning or strict failure |
| Usage warning | Aggregate message in `session.errors`, sometimes with line examples | Structured receipt identity, issue fields and one exact representative | Warning |
| Image failure | Unique, found and missing counts plus content hashes | Event or turn locator, MIME type, link target, reference status and missing hash's origin | Verification failure |
| Markdown parser failure | Check name, detail, skipped state and timing | Archive hash and a bounded source excerpt around the failed location | Verification failure |
| Fence or HTML repair | Counts and some kinds. Internal arrays keep early-repair turns | Turn and repair locations in machine output, plus before or after excerpt | Warning, strict failure for early fence |
| Verifier exception | Error message, stack and frozen capture | Failed stage, partial report and writer or collector status | Verification failure |
| Export command or I/O exception | One console error | Structured stage, command, versions, output path, partial artifacts and stack. A capture may not exist yet | No bundle today |

### What the verification files currently keep

**Observed here:** `VerificationJson` keeps counts and names. It intentionally removes recorded text, samples and tool-call IDs.

**Observed here:** `LossAccount.unaccounted` keeps each failed item's request, category, status, character count, sample and line coverage. Then `lossJson()` reduces the list to category totals.

**Observed here:** `ExportFailure` keeps the reduced verification report and only the first five failure locations. It doesn't receive the original `LossItem` sample.

**Observed here:** SDK events keep `raw`, `recordedLine` and source line. Known payload warnings keep their reasons while they render. The failure report doesn't include those reasons unless they appear in `session.errors`.

**Observed here:** `ToolNode` keeps exit code, result text, result error, duration and structured arguments. SDK processing also marks a tool `failed`. None of that makes the verification command fail unless recorded content is lost or another verifier check fails.

These findings match the focused verification, failure and report tests run on 261123. All 13 passed.

## External diagnostic patterns 261123

| Tool | Pattern | Use for WI-077 | Don't copy |
| --- | --- | --- | --- |
| Playwright traces | Record failed action context, before and after state, source location, console, network, errors, metadata and attachments. `retain-on-failure` avoids keeping every trace | Correlate failures by action or source record. Keep selected state and links to code locations | A full browser-style timeline for every export would be large and unrelated to this CLI |
| Node test runner | One structured event stream feeds human and machine reporters. Events include diagnostics, stdout, stderr and source locations. Rerun state identifies failed tests | Keep one typed diagnostic model and render it as Markdown and JSON. Separate stdout or stderr from the verdict | A public reporter API isn't needed in the first phase |
| pytest | Captures stdout and stderr with the failing test's traceback. It doesn't print successful tests' captured output | Attach captured process output and stage traces only to the failing unit or command | Capturing every unrelated environment value |
| GitHub Actions | Adds runner and worker debug logs only when deeper diagnostics are enabled | Keep a base manifest plus an optional deeper stage trace if volume grows | A remote upload or CI-only control |
| npm | Writes a local debug log on failure and prints its path. Redaction is best effort and logs can rotate | Print exact bundle paths, show best-effort privacy limits and keep correlation data | Automatic deletion of this project's approved failure evidence |

**Inferred from these sources:** a useful failure artifact separates the verdict from the failed action. It also keeps before and after evidence plus replay metadata. It stores rich evidence only for failed or warning runs.

## Recommended outputs

### Human report

WI-076 owns the plain-English `*.verification.md` sidecar.

### Agent task file

WI-077 proposes a collision-safe sibling `*.diagnostics.md`:

1. **Goal**
   - Diagnose the named warnings or failures.
   - Don't change tests to make the current result pass.

2. **Observed result**
   - Exact exit reason
   - Failed categories and counts
   - Strict-mode effect
   - Archive and companion paths

3. **Evidence limits**
   - Which checks ran
   - Which source parts were unavailable
   - Which samples are redacted or omitted

4. **Relevant structures**
   - Event, response or tool type
   - Source line or turn
   - Field-path and type map
   - One bounded sample per distinct signature
   - Accepted and unsupported fields

5. **Expected versus actual**
   - Expected source piece
   - Best rendered match
   - Companion evidence
   - Why the check reported partial or absent

6. **Reproduction**
   - Exact command with sensitive arguments removed
   - Source hash
   - Capture path or capture-unavailable reason
   - Exporter version and commit
   - VS Code, Copilot and Node versions when recorded

7. **Suggested investigation paths**
   - Parser module
   - Normalizer module
   - Renderer module
   - Verifier module
   - Directly related tests

8. **Acceptance checks**
   - Keep every required source piece.
   - Keep order and repeated occurrences correct.
   - Add focused regression coverage.
   - Explain any remaining unsupported field.

### Machine bundle

Add a versioned `*.diagnostics.json` for stable agent input. Suggested top-level sections:

```text
schemaVersion
generatedAt
bundleId
source
runtime
command
archive
verification
warnings
failures
samples
captures
redaction
limits
```

### Selected evidence

Add a collision-safe sibling evidence folder only when the manifest would otherwise contain large or multi-file exact evidence.

The bundle must support first-pass triage when the original source and cache aren't present:

- redacted raw record for each distinct schema signature
- exact expected source piece for each distinct content failure signature
- best actual rendered match or a clear "no match" result
- exact tool arguments, result, error, exit and duration when a failing invariant depends on those values
- saved Markdown excerpt for parser, structure or output-location failures
- stack and failed stage for an exception
- hashes for every included artifact and omitted capture

The JSON keeps one redacted representative per distinct schema signature. It also keeps every failed locator, so repeated failures aren't mistaken for one event. A cap must state the exact input count, kept count, signature count and omitted count.

One redacted sample is normally enough for one field-path and value-type signature. Keep up to three when safe discriminators or issue reasons differ inside that signature. Choose first, middle and last records so a later variant doesn't hide behind the first occurrence.

Signatures must include the fields that matter for diagnosis:

| Failure family | Signature input |
| --- | --- |
| Schema drift | Event or payload type, issue, field paths and value types |
| Question drift | Question source, tool name, parser issue and argument keys |
| Content loss | Category, normalized source-content hash, status, line counts and expected length |
| Tool failure evidence | Tool name, success state, exit or error family and payload field map |
| Image failure | MIME type, source hash, missing or unresolved state and link target |
| Parser or structure failure | Check name, expected state, actual state and output location |
| Exception | Stage, error name, message and stack fingerprint |

The full frozen capture remains linked. The diagnostic bundle must not require that path to answer "what changed or failed?"

## Offline diagnostic minimum

The bundle must be enough to create a focused synthetic fixture without the native chat:

| Evidence | Keep offline | Don't keep by default |
| --- | --- | --- |
| Event identity | Event type, scope fingerprint, source line, event kind and order | Raw session, agent or tool IDs |
| Structure | Every field path, key set, array length, nullability and value type | Free-form values |
| Scalars | Safe discriminators, booleans, accepted enum values and failure codes | Prompt, response, path, URL, token and identifier strings |
| Value guidance | String length, character class, numeric range and SHA-256 fingerprint | Exact private value |
| Error | Issue code, field path, expected rule and actual type or class | Secret text embedded in an exception |
| Lifecycle | Linked request, start and completion records when pairing affects the bug | Unrelated surrounding events |
| Versioning | Exporter version and commit, Copilot or VS Code version, source hash and schema version | Machine-specific unrelated environment |
| Fidelity failure | Exact selected expected and actual text for the failed source-content signature | Other chat content |
| Images | MIME type, byte size, hash, missing state and link target | Image pixels or binary data |

For a new SDK event, an agent should be able to write a parser fixture from a small field map. The map needs event type, key paths, value types, issue and safe discriminators. It does not need the original prompt or output.

For a known event with a new payload variant, include the accepted paths and the unsupported paths. That difference is usually more useful than a private value.

For a content-verification bug, redacting the failed text could destroy the defect. Keep the exact failed piece and exact best match or "no match" result. Keep one representative per distinct normalized-text hash.

## Suggested sample record

```text
type
category
count
firstLine
firstTurn
eventOrToolIds
sourceLine
sourcePathOrLocator
fieldPaths
valueTypes
fieldStructure
acceptedPaths
unsupportedPaths
issues
redactedValue
exactValue
expectedValue
actualValue
sourceHash
sampleHash
```

The diagnostic file should record type and structure, not only text. For example, it should show that `usage.tokens.input` is an array when a counter was expected.

## Privacy policy

The dev's exact-evidence choice applies when text or values are part of the failed invariant. Schema-drift repair usually needs structure, not private values. New and unsupported event samples are therefore redacted by field.

The diagnostic writer must not claim that redaction or a scanner makes the bundle safe. The default use is local review and a trusted local agent.

Add a best-effort sensitive-data scan to exact mode without changing its contents:

1. Scan a copy of the report and count recognizable patterns.
2. Never print matched values.
3. If patterns are found, show a hard console warning and `[!CAUTION]` report block.
4. If none are found, say that no common patterns were found. State that this is not a clean bill of health.
5. If the scan fails, use the hard warning.
6. Keep the exact mode and scanner result in the manifest.
7. List source paths and values at the narrowest useful scope.
8. Never include unrelated records only because they share the same source file.

### Structural redaction rules

| Source value | Diagnostic value |
| --- | --- |
| Object | Keep every key. Recurse without dropping unsupported fields |
| Array | Keep length and recurse through the selected element samples |
| String | Keep type, length, character class and hash. Keep only allow-listed discriminator or error-code values |
| Number | Keep finite, integer, sign, range and exact value only when a validation rule depends on it |
| Boolean and null | Keep exact value |
| Identifier, path, URL or token | Replace with a stable bundle-local fingerprint and type class |
| Base64 or binary | Keep media type, decoded size and hash. Omit bytes |
| Exception | Keep name, code, failed stage, redacted message and stack |

Use a bundle-local fingerprint such as `id:sha256-short` so repeated references still match inside one bundle. The original identifier must not be recoverable from the diagnostics.

The existing redaction detector is useful prior art, but it recognizes only bearer credentials and several assignment names. The diagnostic collector needs a separate structural redaction pass because pattern replacement can't classify field structure.

## Capture policy

Failed verification already keeps a source capture. A warning-only successful export normally discards its temporary capture.

The diagnostic feature should:

- keep the complete frozen source capture for warning or failure bundles
- link diagnostics to the source hash, not only a temporary path
- include selected evidence under the per-family exact and redacted rules
- keep failure evidence without replacing older failure captures
- include all records selected as relevant in the JSON bundle
- report when a frozen source wasn't available
- store in-memory `--verify` diagnostics under the configured cache when no output path exists
- store exporter and verifier exceptions beside the requested output when possible, otherwise in the configured cache

Do not overwrite an older bug report. Use a timestamp or collision suffix, like failure logs. The console prints the new pair of Markdown and JSON paths. This avoids hidden replacement without adding files to ordinary exports.

## Required coverage

The initial diagnostic collector should cover:

- unhandled Local response kinds
- unrecognized `toolSpecificData` kinds
- SDK unknown event types
- supported SDK events with unsupported payloads
- question parsing warnings
- invalid usage receipts
- Layer D partial and absent pieces
- order and multiplicity failures
- missing or corrupt images
- parser failures
- fence repairs that can become strict failures
- verification exceptions, stack traces and output paths
- command discovery, source capture, source-read and output-write exceptions

## Plan

### Phase 1 - model and collector

**Estimate:** M, about half to one day.

1. Add a versioned diagnostic model separate from shareable `VerificationJson`.
2. Give every failure a stable category, stage, check, locator, severity and signature.
3. Collect details where they first exist.
4. Keep exact selected values without leaking this detail into the ordinary shareable JSON report.
5. Add a best-effort environment and command manifest with sensitive arguments removed.
6. Add field-path, value-type and stable-signature extraction for schema warnings.
7. Add structural redaction for schema samples and allow-list safe parser discriminators.
8. Add linked lifecycle sampling for tool requests, starts and completions.

### Phase 2 - writer and CLI wiring

**Estimate:** M, about one day.

1. Render Markdown and JSON from the same model.
2. Write selected evidence files with content hashes and collision-safe names.
3. Keep the frozen capture linked by hash and path.
4. Generate bundles for verification warnings, verification failures and verifier exceptions.
5. Generate best-effort bundles for exporter exceptions after enough context exists.
6. Never let diagnostic write failure hide or replace the original exception.
7. Print the task, manifest and evidence paths with one manual-review warning.
8. Keep `--verify --json` stdout to one JSON document. Print artifact paths to stderr or add them to the human task only.

### Phase 3 - focused coverage and docs

**Estimate:** M, about half to one day.

1. Add synthetic Local and SDK warning and failure fixtures.
2. Cover Layer D, schema, question, image, parser, fence, exception and I/O failure families.
3. Check exact-byte round trips for fidelity evidence and manifest hashes.
4. Check that schema samples keep keys and value types while removing private values and raw identifiers.
5. Prove clean runs create no diagnostic artifacts.
6. Prove a recorded failed tool in a clean export doesn't create a bundle.
7. Replay one frozen private failure after the synthetic fixtures pass.
8. Update README, SPEC and the verification guide.

### Phase 4 - review

**Estimate:** S, a focused review.

1. Review clean, warning, failure and exception samples.
2. Compare the agent task with what a repair agent can infer without the source cache.
3. Record remaining limits.
4. Ask for acceptance before considering automatic fix commands or remote services.

## Phase 1 implementation 261123

- Added a versioned diagnostic model for findings, schema evidence and content evidence.
- Added structural redaction for field names, safe discriminators, value classes and bundle-local fingerprints.
- Added one-to-three sample grouping by field-path and value-type signature.
- Added linked SDK tool request, start and completion evidence without raw tool IDs.
- Added opt-in Layer D failed-text capture. Normal verification doesn't keep the exact text.
- Added exact and best-match collection for partial or absent content failures.
- Reused the diagnostic field walker in the existing SDK schema inventory.
- Added focused tests for leakage, grouping, lifecycle links, exact fidelity evidence and stable finding signatures.

### Validation

- Focused suites: 29 tests pass.
- Full `pnpm run verify`: 850 tests pass.
- Source and test typechecks pass.
- Both golden digest and render checks pass.
- CLI output and verification JSON behavior didn't change.

### Phase 1 boundary

Phase 1 added evidence types and collectors only. It didn't wire CLI output or write files. Phase 2 is recorded below.

## Phase 2 implementation 261123

- Added collision-safe Markdown and JSON diagnostic bundle writing.
- Added task files, repair hints, runtime versions, sanitized commands, hashes and scanner counts.
- Added Local, SDK, question, usage, schema and unsupported tool-data evidence adapters.
- Added warning and failure triggers for direct verification and normal exports.
- Added best-effort exporter and verifier exception bundles.
- Kept `--verify --json` stdout to one JSON document. Diagnostic paths go to stderr.
- Kept clean runs and ordinary recorded tool failures bundle-free.
- Kept warning captures for later offline diagnosis.
- Added optional restricted evidence folders for bundles over 256 KiB.
- Added collision, exception, schema, content, lifecycle, privacy, large-file and CLI integration tests.
- Updated README, SPEC, verification guide and changelog.

The final verification runs 850 tests with zero failures. Both goldens pass. `pnpm run build` completes.

## Real-chat replay 261123

The copy-only demo lives in `temp-tool-output/261123-diagnostics-bundle/`.

- The script read a real Agent Host event log once and copied the bytes into the demo folder.
- The native session source wasn't changed.
- The full frozen copy holds 3,908 records.
- Each scenario uses a 15-record real main-conversation slice that verifies clean.
- Total generated output, frozen source, script and cases are about 34.1 MB.

| Case | Exit | Failure reason | Diagnostic |
| --- | ---: | --- | --- |
| `01-real-clean` | 0 | none | none |
| `02-real-with-tool-failure` | 0 | none | none |
| `03-schema-warning` | 0 | none | task and manifest |
| `04-schema-failure-strict` | 2 | `unhandled-kind` | task and manifest |
| `05-content-loss` | 2 | `layer-d` | task and manifest |
| `06-parser-failure` | 2 | `parser-check` | task and manifest |
| `07-image-loss` | 2 | `image-loss` | task and manifest |
| `08-verifier-exception` | 1 | verification exception | task and manifest |

The schema warning and strict-failure manifests contain two redacted structure groups. They don't contain the injected private payload, token or instruction text. The common-pattern scan reported zero in all generated manifests. That is not a privacy guarantee.

The tool-failure archive shows exit 7, a failed badge and the recorded tool error. Its verification still passes and no diagnostic bundle exists. That confirms source tool failure is separate from exporter failure.

The content-loss bundle keeps the exact failed source piece and best match status. The parser, image and exception cases each report only the intended failure family.

## Review 261124

A second chat reviewed the demo bundles as repair input. The question was whether an agent could find each injected fault from the bundle alone, without the source chat.

**Verdict:** the trigger split, redaction approach and schema evidence work. The other families are too thin for reliable offline repair.

| Case | Could an agent find the fault from the bundle alone? | Why |
| --- | --- | --- |
| 03, 04 schema | ✅ Yes | Field paths, value types, issue text and line locators are enough to write a parser fixture |
| 05 content loss | ⚠️ Probably the wrong place first | The exact text is there, but nothing says the archive links a companion file that is missing on disk. An agent would suspect the renderer |
| 06 parser | ⚠️ Only from the JSON | The failed check (`assistant headings parse as headings`, `headings=0`) is in `verification.parser.checks`. The task file only says "parser-check". There's no archive excerpt |
| 07 image | ❌ No | It gives only a missing hash. There's no event line, asset ID, MIME type, expected link target, or link-versus-file status |
| 08 exception | ❌ No | It's labeled `exception/exporter` for a verifier fault. There's no failed stage and no partial report. The stack is synthetic |

### Gaps found

| # | Gap | Evidence |
| --- | --- | --- |
| G1 | The demo calls `writeDiagnosticBundle` directly and never runs the CLI. The CLI path is covered only by the `test/cli.test.ts` schema-drift test | `temp-tool-output/261123-diagnostics-bundle/demo.mts` |
| G2 | The demo's capture path and source hash belong to the full 3,908-record log. The injected events aren't in that file, so the bundle's reproduction facts can't reproduce the case. Real CLI runs don't have this problem | demo `source.hash`, `capturePath` |
| G3 | The demo shows `copilotVersion: not recorded`, but `session.start` records `1.0.108-0`. The CLI passes versions, so only the demo misses them | `src/sdk-cli.ts`, demo manifests |
| G4 | "Start investigating" always lists `diagnostic-bundle.ts` and `diagnostic-source.ts`. That sends a repair agent to the diagnostics code instead of the fault | `src/verify/diagnostic-bundle.ts:357` |
| G5 | Enum-like values such as `authority: "user"` and `lifetime: "session"` are fingerprinted. Safe values come only from a fixed path list, so new or unsupported events lose their discriminators | `src/verify/diagnostic-evidence.ts:7` |
| G6 | The plan promised accepted and unsupported paths for known events. The bundle only has free-text issue strings | WI-077 "Offline diagnostic minimum" |
| G7 | Content and image findings don't record companion link status: link present, target path and file present | 05 and 07 manifests |
| G8 | Image findings have no locators | 07 `failure.locations` is empty |
| G9 | Parser findings don't name the failed check in the task file and have no archive excerpt | 06 task file |
| G10 | Exception findings have no stage and no partial report. A verifier exception is labeled as an exporter exception | 08 manifest |
| G11 | The manifest stores the verification report three times: `verification`, `verificationDetails` and `failure.details` | all manifests |
| G12 | Findings are duplicated: a generic `layer-d` or `schema-drift` finding sits beside each specific one | 03 and 05 task files |
| G13 | The command is recorded but there's no ready-to-run replay command | all manifests |
| G14 | `exporterCommit` reads "source (not built)" when run from source. The dirty-tree state isn't recorded | all manifests |
| G15 | Plan coverage still missing: Local CLI end-to-end, fence repair, usage receipts, I/O and source-read exceptions, and a diagnostic writer failure that must not hide the original error | test names in the three diagnostic test files |

### Ideas, not yet approved

- Write a redacted `*.fixture-seed.events.jsonl` with type-valid placeholder values. An agent could copy it straight into a test.
- Take the safe discriminator paths from the parser's own known enum fields instead of a fixed list.
- Measure bundle usefulness with a blind-agent eval. Give each bundle to a fresh agent without the source. Score whether it names the root cause and the right module. Run it before and after the fixes.

**Next:** the dev chose a blind-agent baseline eval, then fixes, then a second eval run.

### Blind-agent baseline 261124

Five fresh read-only agents each got one bundle in a neutral `case-N` folder. Paths were rewritten and the capture was removed to simulate offline use. Each agent could read only its case folder plus `src/`, `test/` and `docs/`. The answer key was written before any result was read. Run folder: `temp-tool-output/261124-1135-wi077-blind-eval/`.

| Case | Score | Confidence | What decided it |
| --- | --- | --- | --- |
| 03 schema | ✅ Full | high | Found both records and the right validators (`sdk-event-notes.ts`, `sdk-event-fields.ts`). It read the exact values from `archive.md`, not from the bundle. Hints named `classify.ts` and `questions.ts`, which don't apply |
| 05 content | ⚠️ Partial | medium | Found "link present, companion missing" only by listing the assets folder. It missed the exact text in the JSON and said it was unavailable |
| 06 parser | ⚠️ Partial | medium | Named the failed check but guessed a tokenizer problem. It saw "not a heading" in the archive but didn't link it to the missing marker |
| 07 image | ✅ Full | high | Found "link present, file missing" only by listing the assets folder. Hints listed only the diagnostics modules |
| 08 exception | ✅ Full | low | Correctly said no product fault can be located. The bundle has no stage and no real origin |

**Main finding:** the agents mostly succeeded from `archive.md` and the assets folder, not from the bundle. Cases 05 and 07 would fail if the archive were moved or deleted.

### More gaps from the eval

| # | Gap | Evidence |
| --- | --- | --- |
| G16 | 🐛 Failure hints never fire. `failureFindings` sets `category` to the raw failure reason (`image-loss`, `parser-check`, `unhandled-kind`). `investigationPaths` matches `images`, `parser` and `schema-drift` only | `src/verify/diagnostic-bundle.ts:165`, `src/verify/diagnostic-bundle.ts:356` |
| G17 | The task file doesn't say where the exact evidence is in the JSON, so a reader can miss the 69 KB recorded text | case 05 agent report |
| G18 | Schema hints miss the SDK validators `src/session/sdk-event-notes.ts` and `src/session/sdk-event-fields.ts` | case 03 agent report |
| G19 | A `parser-check` failure is labeled stage `parse`. The check reads the exported Markdown, so it's a verify stage | `src/verify/diagnostic-bundle.ts:171` |

## Fix implementation 261124

The dev approved F1-F6, F8, F10 and F12, with F11 as child [WI-079](../work-log.md#wi-079). F7 and F9 stay deferred.

| Fix | What changed | Where |
| --- | --- | --- |
| F1 hints | Each failure reason maps to a category (`images`, `parser`, `schema-drift`, `structure` and so on) and its source modules. SDK validators and stack-frame files join the hint list. A generic reason finding is dropped when a specific finding has the same category | `src/verify/diagnostic-bundle.ts` |
| F2 companions | The task lists live companion links, missing targets and unlinked files | `companionLinkStatus` in `src/verify/images.ts` |
| F3 task file | The task names the exact JSON path of each exact text, and the raw-records lines | `renderTask` |
| F4 parser | Each failed check shows where its marker landed inside a fence, the fence opener line and an excerpt | `parserEvidence` |
| F5 exception | `exceptionStage` is `load`, `verify` or `export`. The task shows project stack frames and any partial report | `src/cli.ts`, `src/sdk-cli.ts` |
| F6 manifest | `schemaVersion: 2`. The report is stored once, not three times | `writeDiagnosticBundle` |
| F8 replay | A `--verify` replay command when the archive exists, otherwise the sanitized command. Source runs record the checkout commit and dirty-file count | `replayCommand`, `gitCheckout` in `src/host.ts` |
| F12 raw records | `<bundle>.raw-records.jsonl` keeps up to 3 exact records per schema signature. Strings over 2,500 characters keep the first 2,000 and last 500, plus length and SHA-256. The manifest indexes it by line, and the scanner covers it | `exactDiagnosticRecords` in `src/verify/diagnostic-evidence.ts` |

Image locators (`sdkImageLocators`, `localImageLocators`) give each missing or unresolved image its line and JSON path.

**Validation:** `pnpm run verify` passes 856 tests and both goldens. Six focused tests were added in `test/diagnostic-bundle.test.ts` and `test/images.test.ts`. One existing assertion changed on purpose: exporter exceptions now report stage `export`, not `exception` (F5 contract change).

**Repairs found by verify and the demo:**

- `host.test.ts` allows only `host.ts` to start a subprocess. The checkout lookup moved there as `gitCheckout`.
- `JSON.stringify` doubled Windows backslashes in the replay path. The path is now quoted plainly.
- A load exception offered a `--verify` replay for an archive that was never written. The replay now requires the archive to exist.

### Real-CLI demo 261124 (F10)

Every scenario runs `node src/cli.ts` against a sandbox `COPILOT_HOME` built from a 633-line frozen slice of a real chat. Faults go into copies of the slice or into a fresh `--keep-source` export. Folder: `temp-tool-output/261124-1214-wi077-demo2/`, driver `demo2.mjs`, results in `scenario-summary.json`.

| Scenario | Exit | Bundle | Quality for a repair agent |
| --- | --- | --- | --- |
| 01 clean | 0 | none | ✅ Correct |
| 02 unknown event, normal export | 0 | warning | ✅ Raw record has the exact event at line 633 |
| 03 same, `--verify --strict` | 2 | failure | ✅ Same, report stored once |
| 04 assistant paragraph deleted from archive | 2 | failure | ⚠️ Exact text, but the only locator is "request 1" in a 213-turn chat |
| 05 unclosed fence before `## Tool Usage` | 2 | failure | ✅ Names the opener at line 129 and excerpts each swallowed marker |
| 06 linked companion deleted | 0 | none | ❌ Verify passes. See G24 |
| 07 tool result references an unrecorded image asset | 0 | warning | ✅ `line 20 ... binaryResultsForLlm[1]`, asset `demo-asset-lost` |
| 08 truncated JSON at event 201 | 1 | exception | ⚠️ Stage and frames are right. No excerpt of the bad record |
| 09 selector typo | 1 | exception | ❌ Noise. See G22 |

### Gaps found by the demo

| # | Gap | Evidence |
| --- | --- | --- |
| G20 | A load exception names the bad record number but keeps no clipped excerpt of it. The task also asks for a "source fix" when the input is corrupt | `08-load-exception` task file |
| G21 | SDK content findings locate only by request. An SDK chat often has one request, so an agent must grep for the text. No event line and no expected archive position | `04-content-loss` manifest `samples.content.groups[0]` |
| G22 | Every load error writes a bundle, including "No ... session matching" user errors. This predates the fixes | `09-not-found`, `src/cli.ts` load catch |
| G23 | Saved-file verify needs `--keep-source` at export time. A copied archive gives "snapshot unavailable" with exit 1 and no bundle. This is correct, but it's easy to miss when building fixtures | demo run log |
| G24 | 🐛 Verify didn't notice a deleted `detailed-result-0ef30c20.txt` companion from this real chat. Layer D still counted all 82 tool outputs as present. **Narrowed later on 261124:** the committed demo deletes a synthetic text companion and an image companion, and both fail as expected. The deleted text doesn't appear anywhere else in the real archive, so a duplicate match doesn't explain it. The cause is unknown | `06-companion-loss.console.txt`, then `pnpm run demo:diagnostics` scenarios 06 and 11 |

**Not done:** G20-G24 aren't approved scope. They're in the Inbox for a decision.

### Blind-agent eval 2 261124

Same 5 fault types as the baseline, from the real-CLI demo. **Stricter than the baseline:** each case had only the task, manifest and raw records. No archive, assets or capture. The answer key was written first. Folder: `temp-tool-output/261124-1220-wi077-blind-eval2/`.

| Case | Baseline (with archive) | Eval 2 (bundle only) | What decided it |
| --- | --- | --- | --- |
| schema | ✅ Full, from `archive.md` | ✅ Full | Raw record gave the exact type, line 633 and fields. It named `HANDLED` in `sdk-session.ts` |
| content | ⚠️ Partial | ❌ Miss | 🐛 It proposed weakening `sdk-loss-account.ts`. Nothing in the bundle says the archive changed after export |
| parser | ⚠️ Partial | ⚠️ Partial | It found the line 129 opener from the parser excerpts, but blamed the renderer for the same reason |
| image | ✅ Full, from assets folder | ✅ Full | Image locator gave line 20, the JSON path and the lost asset. It called it an input-data problem |
| exception | ✅ Full, low confidence | ✅ Full, low confidence | Stage and frames named the loader. Record 201 itself was missing (G20) |

**Result:** 3 full, 1 partial, 1 miss, all without the archive. The baseline was 3 full, 2 partial with the archive. Schema, image and exception now work from the bundle alone. Parser moved from a guess to the exact line.

| # | Gap | Evidence |
| --- | --- | --- |
| G25 | 🐛 The bundle doesn't say whether the archive still matches the export. The receipt already stores `outputSha256` from export time, so the check is one hash compare. Without it, an agent can't tell a hand-edited archive from a renderer bug, and may weaken the verifier | cases 2 and 3, `src/session/source-snapshot.ts:346` |
| G26 | Raw records cover only schema records. Image and content findings have none, so agents couldn't see the line 20 record or the record behind the absent text | cases 2 and 4 |

### Committed diagnostics demo 261124

The demo2 driver used a frozen slice of a real chat, so it couldn't be committed. `pnpm run demo:diagnostics` reruns its scenarios on synthetic events built inside the script. Anyone can run it on a fresh clone.

- **Shared sandbox:** `scripts/lib/cli-sandbox.mjs` holds the sandbox setup that `failure-demo.mjs` had inline. Both demos use it. `pnpm run demo:failure` gave the same summary fields for all 5 cases before and after the move.
- **Index keys:** a `copilotcli:/<id>` index key needs no `session.db`. Only `agent-host-copilotcli:/<id>` does. This comes from `src/session/provider-sources.ts`. An earlier note here said `session.db` was always needed.
- **Scenarios:** demo2's 9 scenarios plus 2 more:

  | Added scenario | Why |
  | --- | --- |
  | Local content loss | The first Local bundle run through the real CLI |
  | Image companion deletion | Splits G24 by companion type |

- **Results:** all 11 match their expectations. G22 (typo writes a bundle) is still marked as a known gap.
- **Limits:**
  - The demo isn't a test and doesn't run in `pnpm run verify`.
  - It checks exit codes, categories and counts, not the quality of the task text.
  - Synthetic chats are small, so the demo can't reproduce real-chat effects such as the G24 pass.

How to run it is in the [README](../README.md#cli-sandbox).

## Work tree

Progress as of 261124: 0 of 1 done

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-079](../work-log.md#wi-079) Diagnostic bundle coverage and robustness | [build] | M | - |

## Non-goals

- Automatically sending data to a remote AI service
- Automatically editing code or tests
- Claiming that a redacted structure contains no secret
- Replacing frozen source captures with only summaries
- Treating successful reproduction as proof that every source variant is covered

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Raw records expose credentials or private text | Generate only for warning/failure runs and show prominent warnings |
| Redaction changes the bug-inducing structure | Keep field paths and types even when values are masked |
| Hundreds of warnings create a huge report | Group by stable structure and report the exact omitted count |
| A small cap hides a rare variant | Record exact totals, distinct signature count and omitted-sample count |
| The AI sees a summary but no reproduction | Add source hash, versions, command and capture status |
| The diagnostic disagrees with the console | Both consume the shared structured report |
| Failure logs and diagnostics duplicate private data | Let the diagnostics reference the existing failure log and capture |
| Local and SDK evidence differs | Keep provider-specific sections with common result fields |
| Selected evidence is not enough for repair | Keep every failed locator, one exact record per signature and a clear full-capture link |
| The diagnostic writer fails on the original failure path | Report the original failure first and make bundle-write failure a second visible error |
| The agent treats a recorded tool failure as an exporter bug | Label source outcome separately from exporter verification outcome |
| The task file sends the agent toward weak tests | State the failed invariant and forbid changing tests to force a pass |

## Approved decision

The dev chose exact and unredacted selected evidence when values are part of a failed fidelity invariant. Schema drift samples keep field structure and safe discriminators but redact private values. Clean verification doesn't create the bundle. The CLI must never upload or pass this file to a remote service.

On 261123 the dev expanded the trigger to include exporter and verifier exceptions. A normal failed shell command or tool call doesn't trigger a bundle. A clean verification keeps that rule.

On 261123 the dev asked for a mix of a linked full capture and self-triage evidence. The agent recommends a Markdown task plus JSON manifest. Exact selected records go in the JSON or a collision-safe evidence folder. The full frozen capture remains linked but isn't required for the first diagnosis.

On 261123 the dev asked whether schema samples need exact event payloads for offline repair. The agent recommends one to three structurally redacted samples per distinct field-path and value-type signature, plus all locators and counts. Exact fidelity pieces remain separate. This should produce a usable fixture without copying private prompts, outputs or identifiers.

On 261123 the dev approved Phase 1 only. The model and collectors are implemented. No output writer or CLI behavior changed.

On 261123 the dev approved Phase 2. The writer and CLI integration are implemented. Clean verification behavior stays unchanged. Warnings, failures and exporter exceptions now create local diagnostic bundles.

Each run keeps a timestamped, collision-safe pair. It doesn't replace older evidence. The console prints:

- the report paths
- the bundle path and evidence count
- the sensitive-pattern result
- a manual-review warning
- the rule that no common match doesn't prove privacy

## Evidence

- `src/session/sdk-events.ts` keeps complete raw event objects and original lines.
- `src/verify/loss-account.ts` keeps every failed item and a source sample.
- `src/verify/json-report.ts` intentionally removes recorded text and samples from ordinary machine output.
- `src/verify/export-failure.ts` writes redacted failure logs with source hash, capture path, runtime and version details.
- `src/session/sdk-session.ts` renders unknown event payloads, but the census itself keeps only type counts.
- The failed WI-073 export `output1.txt` shows why aggregate counts alone are insufficient for an automated reproduction.
- Playwright Trace Viewer: https://playwright.dev/docs/trace-viewer
- Playwright tracing options: https://playwright.dev/docs/api/class-tracing
- Node.js test runner and reporters: https://nodejs.org/api/test.html
- pytest stdout and stderr capture: https://doc.pytest.org/en/stable/how-to/capture-stdout-stderr.html
- GitHub Actions debug logging: https://docs.github.com/en/actions/how-tos/monitor-workflows/enable-debug-logging
- npm logging and sensitive-information limits: https://docs.npmjs.com/cli/v11/using-npm/logging/

## Resume point 261124

The approved fixes are implemented. `pnpm run verify` passes. The real-CLI demo and blind eval 2 are recorded above. A committed version of the demo now runs on synthetic chats with `pnpm run demo:diagnostics`. The item waits for dev acceptance.

Next:

1. Decide on G20-G26 (Inbox). G25 (archive changed since export) is the cheapest and fixes the harmful case 2 answer. G24 needs a cause first, because synthetic companion deletions fail as expected.
2. Accept the fixes or request changes.
3. Start [WI-079](../work-log.md#wi-079) when approved. Use `scripts/lib/cli-sandbox.mjs` for its end-to-end tests.

## Resume point 261123

Paused 261123 after the real-chat demo. Phases 1 and 2 pass full verification and wait for dev review.

Next:

1. Open the real-chat demo README.
2. Compare the clean tool-failure case, schema warning and content-loss case.
3. Inspect the strict-failure manifest for offline usefulness.
4. Accept the implementation or request changes.

The CLI now creates diagnostics for verification warnings, verification failures and exporter exceptions. Clean runs remain unchanged.
