Part of [WI-021](WI-021-source-aware-verification.md), found while reviewing WI-076's private v1-v4 samples.

# WI-078 Reusable verification report fixtures

## At a glance

- **Goal:** keep a small public fixture pair for the plain-English verification report.
- **Type:** [research]
- **Priority:** Medium
- **Why later:** WI-076 already has focused tests. The fixture set is useful for review and regression, but it doesn't block the feature.
- **Privacy:** inputs and expected reports must be invented. Don't copy real terminal output, prompts, failure logs or session identifiers.
- **Status 261123:** planned. No implementation is approved or started.
- **Next:** decide whether the fixtures should assert complete Markdown bytes or only reviewed sections.

## Original goal

WI-076 used large private samples to review wording. They helped, but they aren't suitable as normal public fixtures:

- they reproduce a private failed run
- they carry real-sized counts and timestamps
- they duplicate many passing categories
- they include review-only v1-v4 history
- their paths point into `temp-tool-output`

WI-078 should make a small, reusable set without replacing the existing focused tests.

## Proposed layout

```text
test/fixtures/verification-report/
  failed-input.json
  failed-terminal.txt
  failed-report.md
  warning-input.json
  warning-terminal.txt
  warning-report.md
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
- Terminal output and sidecar explain the same structured report.
- Full report ordering stays stable.
- The visible summary stays under a bounded word count.
- Full terminal details remain complete.
- The fixture can run without private user-data stores.
- Paths and dates stay deterministic.
- Expected reports don't contain secrets or real chat text.

## Proposed implementation

1. **Define a fixture input type.**
   - Use the public verification JSON format plus run metadata.
   - Keep one invented export summary and one count-only report.

2. **Add a deterministic generator.**
   - Render terminal output and sidecar from the same report.
   - Use fixed timestamps and relative paths.

3. **Choose the assertion level.**
   - Preferred first step: complete expected report bytes.
   - Keep terminal text as complete expected bytes too.
   - Add section-level semantic assertions only where they explain failures better.

4. **Add a review update script.**
   - Provide `--check` and `--update`.
   - Never rewrite expected files during ordinary tests.

5. **Link examples from the guide.**
   - Use one small public example in `docs/VERIFICATION.md`.
   - Keep v1-v4 private review files in `temp-tool-output`.

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

## Do after

- WI-076 must be accepted.
- The current feature commit should merge before fixture work starts.
