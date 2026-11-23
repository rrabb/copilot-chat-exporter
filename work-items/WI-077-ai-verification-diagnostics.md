Part of [WI-021](WI-021-source-aware-verification.md), found while planning the WI-076 verification explanation.

# WI-077 AI verification diagnostics

## At a glance

- **Goal:** make warnings and failures easy to hand to an AI coding agent as a reproducible bug report.
- **Main output:** a versioned diagnostic bundle, plus a short agent-ready task file.
- **Shared model:** use the same structured verification result planned for WI-076.
- **Privacy:** the dev prefers exact local capture with manual review. Automatic upload is out of scope.
- **Failure evidence:** keep source captures and exact records only within the selected diagnostic policy.
- **Status 261119:** research plan recorded. No implementation is approved or started.
- **Trigger:** any `--verify` warning or failure creates the exact bundle. A clean `--verify` doesn't.

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

## Feasibility

This is possible for the current code:

- SDK events keep the complete `raw` object and original JSON line.
- Layer D keeps every missing or partial item, including request, category, status, character count and a source sample.
- Local unknown items can keep a redacted raw representation.
- Question warnings already record turn, title, summary and top-level argument names.
- SDK schema warnings have event type, line information and unsupported-field reasons in several paths.
- Failure runs keep a frozen source capture.
- Verification already exposes a versioned JSON report.

The missing work is a diagnostic collector. It must gather samples while parsing, normalizing and verifying. The final console census currently aggregates many useful details away.

## Recommended outputs

### Human report

WI-076 owns the plain-English `*.verification.md` sidecar.

### AI task file

WI-077 proposes a sibling `*.diagnostics.md`:

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
source
runtime
command
archive
checks
warnings
failures
samples
captures
redaction
```

`samples` should group identical structures by a stable signature. This avoids hundreds of copies of the same event structure.

## Suggested sample record

```text
type
category
count
firstLine
firstTurn
eventOrToolIds
fieldStructure
acceptedPaths
unsupportedPaths
issues
redactedValue
rawValueOptIn
sourceHash
sampleHash
```

The diagnostic file should record type and structure, not only text. For example, it should show that `usage.tokens.input` is an array when a counter was expected.

## Privacy modes

| Mode | Content | Risk | Proposed use |
| --- | --- | --- | --- |
| `counts` | Names, counts, versions and check results | Low | Shared corpus output |
| `redacted` | The above plus field structure, path, type and redacted bounded samples | Medium | Recommended default for diagnostic files |
| `exact` | The above plus exact selected source records and text | High | Selected for warning/failure bundles |

The dev prefers exact local capture with manual review. Exact mode must not promise that every secret is removed. It should carry a prominent warning and remain suitable only for a trusted local agent.

Add a best-effort sensitive-data scan to exact mode without changing its contents:

1. Scan a copy of the report and count recognizable patterns.
2. Never print matched values.
3. If patterns are found, show a hard console warning and `[!CAUTION]` report block.
4. If none are found, say that no common patterns were found. State that this is not a clean bill of health.
5. If the scan fails, use the hard warning.
6. Keep the exact mode and scanner result in the manifest.

The existing redaction detector is useful prior art, but it recognizes only bearer credentials and several assignment names. WI-077 needs the design decision on whether to expand it into a separate diagnostic scanner.

## Capture policy

Failed verification already keeps a source capture. A warning-only successful export normally discards its temporary capture.

The diagnostic feature should:

- keep the complete frozen source capture for warning or failure bundles
- link diagnostics to the source hash, not only a temporary path
- keep failure evidence without replacing older failure captures
- include all records selected as relevant in the JSON bundle
- report when a frozen source wasn't available

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

## Plan

1. **Approve the privacy and retention model.**
2. **Define stable diagnostic types.**
3. **Collect details at the point they are known.**
4. **Group repeated structures by signature.**
5. **Render JSON and agent-ready Markdown from the same object.**
6. **Wire the files into WI-076 verification and `--verify` failure flow.**
7. **Add Local and SDK synthetic fixtures.**
8. **Replay the failed real export using frozen, private evidence.**
9. **Document safe sharing and raw-mode risks.**
10. **Ask for acceptance before implementing broader automated fixer behavior.**

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

## Approved decision

The dev chose exact and unredacted output for every `--verify` run that reports a warning or failure. Clean verification doesn't create the bundle. Exact output may include private prompts, tool arguments, tool output and source records. The CLI must never upload or pass this file to a remote service.

Each run keeps a timestamped, collision-safe pair. It doesn't replace older evidence. The console prints:

- the report paths
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
