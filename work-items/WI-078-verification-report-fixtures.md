Part of [WI-021](WI-021-source-aware-verification.md), found while reviewing WI-076's private v1-v4 samples.

# WI-078 Reusable verification report fixtures

## At a glance

- **Goal:** keep a small public fixture pair for the plain-English verification report.
- **Type:** [research]
- **Priority:** Medium
- **Why later:** WI-076 already has focused tests. The fixture set is useful for review and regression, but it doesn't block the feature.
- **Privacy:** inputs and expected reports must be invented. Don't copy real terminal output, prompts, failure logs or session identifiers.
- **Status 261124:** plan revised after WI-076 acceptance and WI-079's demo work. No implementation is approved or started.
- **Next:** keep this in the backlog. Build only if committed public examples or exact report regressions justify the files. If approved, use the scope below.

## Original goal

WI-076 used large private samples to review wording. They helped, but they aren't suitable as normal public fixtures:

- they reproduce a private failed run
- they carry real-sized counts and timestamps
- they duplicate many passing categories
- they include review-only v1-v4 history
- their paths point into `temp-tool-output`

WI-078 should make a small, reusable set without replacing the existing focused tests.

## Recommended layout

```text
test/fixtures/verification-report/
  failed-input.json
  failed-report.md
  warning-input.json
  warning-report.md
  update.ts
```

## Required cases

### Failed verification

Cover:

- one partial tool input
- one absent tool intent
- one missing repeated occurrence
- one schema drift warning
- one source warning
- all content checks in small numbers
- a failure log link
- a kept frozen-source path
- an affected location
- a `.verify-failed.md` archive

### Passed with warnings

Cover:

- clean Layer D
- clean images
- clean Markdown parser
- one unknown event type
- one supported event with changed fields
- one usage warning
- one turn-end fence repair
- one HTML escape
- `Failed checks: none`

## Test goals

- Report input stays synthetic and small.
- The expected sidecar comes from one production renderer call.
- Full report ordering stays stable.
- The visible summary stays under a bounded word count.
- Collapsed details stay complete.
- The fixture can run without private user-data stores.
- Paths and dates stay deterministic.
- Expected reports don't contain secrets or real chat text.

## Revised recommendation 261124

Build this only as a review fixture. Existing WI-076 tests already cover renderer branches, Local/SDK checks, exceptions and sidecar lifecycle. A second broad test harness would duplicate that work.

The smallest useful plan is:

1. **Keep two complete byte fixtures.**
   - One failed report.
   - One passed-with-warnings report.
   - One small synthetic `VerificationExplanationInput` JSON input for each.
2. **Render through production code.**
   - Call `renderVerificationExplanation`.
   - Don't rebuild verification report logic in the test.
3. **Add only semantic checks for the contract.**
   - Verdict and next action.
   - Failure or warning separation.
   - The effect of each warning.
   - Limits on what passing proves.
4. **Drop exact terminal-output files from the first slice.**
   - WI-076 already tests CLI wiring and structured console output.
   - Coupling terminal bytes to sidecar bytes doubles every wording migration without doubling confidence.
5. **Reuse the SDK golden update pattern.**
   - Add `--check` and a deliberate `--update`.
   - Normal tests never rewrite expected files.
6. **Keep the fixture data synthetic and boring.**
   - Fixed date, relative paths and made-up IDs.
   - A test rejects absolute native paths.
   - The existing redaction test remains responsible for raw-data safety.
7. **Link from the guide, not the sample into generated reports.**
   - Add one compact excerpt to `docs/VERIFICATION.md`.
   - Generated sidecars stay self-contained.

### Reuse from WI-079

Don't move WI-079's sandbox into this item. WI-078 renders a structured result and needs no user-data root or source capture. The reusable ideas are:

- invented synthetic scenarios with expected output
- one summary that tells the reviewer which case ran
- a deliberate mismatch exit
- shared fixture values where they represent project rules

Reuse `scripts/lib/cli-sandbox.mjs` only if WI-078 later gains one CLI smoke test. The first slice shouldn't.

### Build or defer

**Recommendation: defer.**

The report is accepted, its focused tests pass, and the public guide already explains it. The fixture's main value is reviewable checked-in output. It adds little behavioral confidence beyond the existing unit tests.

Build WI-078 when one of these becomes true:

| Trigger | Why the fixture then pays off |
| --- | --- |
| The project wants a public example for reviewers outside the repository runtime | The sidecar becomes a stable, readable artifact |
| Report wording changes start breaking review expectations without test failures | Exact bytes catch a review regression, not just a code regression |
| A contributor wants to work on report layout without private fixtures | Two small synthetic inputs remove that setup cost |

Don't build it only to raise test count. Don't add terminal goldens unless CLI output and report output must prove they came from one run.

### What not to build

| Idea | Why not now |
| --- | --- |
| One fixture for every check family | WI-076's focused tests already do branch coverage |
| Exact console and sidecar bytes together | High churn for one product renderer question |
| Full v1-v4 review history in Git | Private review history, not a regression contract |
| A general fixture framework | Two cases don't justify another tool |

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| The fixture duplicates the renderer test | Keep the fixture short and review-oriented. Unit tests keep edge behavior |
| Expected Markdown becomes hard to update | Use a dedicated updater and small inputs |
| Fixture data looks like real user evidence | Prefix titles and values with invented or synthetic labels |
| Full report bytes create noisy diffs | Keep one failed and one warning case only |
| Private paths enter expected files | Use fixed relative paths and reject absolute native paths |

## Evidence

- WI-076's focused tests already cover renderer branches and CLI wiring.
- The v4 private bundle proved the desired failed and warning layout.
- `temp-tool-output/261119-173552-wi076-start/generate-v4.mts` is useful as a design reference, not as a public fixture generator.
- `docs/VERIFICATION.md` is the public terminology source.

## Ready when

- WI-076 is accepted and committed.
- The dev approves the reduced, sidecar-only scope.
