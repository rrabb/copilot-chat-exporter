Part of [WI-021](WI-021-source-aware-verification.md), found while accepting WI-071's real export review.

# WI-073 Layer D partial verification failures

## At a glance

- **Goal:** explain each real Layer D `partial` result and decide whether the renderer, verifier or source interpretation is wrong.
- **Scope:** the final WI-071 Agent Host export and its frozen source pair from 261118.
- **Current count before the fix:** 22 partials, 0 absences.
- **Current count after both fixes:** 0 partials, 0 absences, 0 missing repetitions.
- **Breakdown:** 8 compaction summaries, 12 system prompts, 1 tool input and 1 tool output.
- **Not in scope:** the 852 tool-intent absences found during the WI-071 review. WI-071 fixed them. The final report has 1,737 tool intents present and 0 absent.
- **Not in scope:** the separate `withLinkedCompanions` stack overflow in the 261118 Inbox item.
- **Policy:** WI-021 rejects blanket partial-match exceptions. Every result needs a piece-level cause and evidence.
- **Next:** none. Track the separate companion-scanning stack overflow through its Inbox item.
- **Result 261119:** the implementation fixed the 22 partials and the 14 repetitions. It passes the focused suite, full verification and a fresh frozen-source render.
- **Status 261119:** accepted and done.

## Original goal

WI-071's final real export failed Layer D with 22 partial pieces. The user wants these failures investigated before deciding whether to change the renderer or verifier.

The investigation must distinguish:

| Case | What it means |
| --- | --- |
| Export loss | The renderer dropped or changed source text |
| Companion issue | The archive wrote the right text to a linked companion, but Layer D didn't account for it |
| Scoring false positive | The expected text is present, but matching, location or redaction rules report partial |
| Source ambiguity | The same source text appears in several events or a source record differs from the normalized parsed model |

## Done when

- Every one of the 22 current partial locations has a documented category, request, source event line and cause hypothesis.
- At least one item in each category is reproduced with a minimal synthetic control.
- The investigation names whether the renderer or verifier owns each result.
- Any approved renderer fix has focused tests and a rerun of the frozen real-source pair.
- Any verifier fix keeps order and multiplicity checks intact.
- No blanket exception is added without evidence for every affected piece.
- The remaining 22 partials either pass, have exact approved exceptions, or remain open with named blockers.
- The dev accepts the findings and approves any separate implementation WI.

## Frozen evidence

**Observed here, 261118:** the final completion-order export checked 7,641 SDK text pieces. Source-order text checks found no out-of-order items.

| Category | Present | Partial | Absent |
| --- | ---: | ---: | ---: |
| `assistant-text` | 325 | 0 | 0 |
| `compaction-summary` | 9 | 8 | 0 |
| `fusion-phase` | 23 | 0 | 0 |
| `instruction-update` | 1 | 0 | 0 |
| `prompt` | 64 | 0 | 0 |
| `reasoning` | 694 | 0 | 0 |
| `skill-file` | 3 | 0 | 0 |
| `system-prompt` | 6 | 12 | 0 |
| `tool-detail` | 1,036 | 0 | 0 |
| `tool-error` | 21 | 0 | 0 |
| `tool-input` | 1,814 | 1 | 0 |
| `tool-intent` | 1,737 | 0 | 0 |
| `tool-output` | 1,886 | 1 | 0 |

The 22 failed locations are:

| Category | Requests |
| --- | --- |
| `compaction-summary` | 2, 3, 3, 3, 22, 22, 27, 47 |
| `system-prompt` | 1, 3, 16, 23, 28, 1, 48, 50, 1, 52, 54, 59 |
| `tool-input` | 50 |
| `tool-output` | 1 |

The final private failure pair is:

- [Failed final review export](../temp-tool-output/261118-EXPORTS/wi071-final-review.verify-failed.md)
- [Console receipt](../temp-tool-output/261118-EXPORTS/output1.txt) for the earlier 852-intent regression. Use its category split only, not its final totals.

The final failure log and capture receipt stay under the ignored `temp-tool-output\261118-EXPORTS\` evidence. The tracked topic doesn't copy the real session identifier.

The final log records a frozen source hash of `519b9da41b733df54b95f8dceb0b9a857349e17d6c84619f5d4fbd1bfec5d2ab`. The capture receipt ties the failed Markdown to that exact copy. Don't replace it with a new live-chat export during root-cause work.

### Earlier findings that narrow the scope

- **Observed 261118:** WI-071's semantic Intent deduplication caused 852 false absences. Exact normalized header matching restored all 1,737 intents. This isn't one of the 22 current partials.
- **Observed 261118:** splitting stored reasoning summaries into separate thoughts increased the reasoning census from 581 to 694. All 694 final reasoning pieces are present.
- **Observed 261118:** the final export records completion-order grouping, but Layer D uses the same selected mode for tool-intent ordering. Source-ordered message text has no ordering failures.
- **Observed 261118:** all 13 images are found.
- **Existing limit from WI-021:** Layer D can match text elsewhere in the export. A `present` result isn't proof of placement. A `partial` needs comparison with the expected source fragment and the nearest rendered/companion text.
- **Existing policy from WI-021:** no category-wide exception exists for clipping or command echo.

### Initial root-cause finding 261119

**Observed here:** all 22 failures reproduce from the frozen 261118 source and final review export without reading live chat data.

The inline-code mask in `withLinkedCompanions` pairs backticks across a large share of the Markdown. A table row with many separate code spans starts one recorded match near the Tool Usage table. That match continues for about 297 KB and blanks a later system-prompt link. The same failure hides compaction, terminal-output and other companion links.

The four representative cases classify as follows:

| Category | Representative result | Cause found |
| --- | --- | --- |
| `compaction-summary` | 24,615 source bytes equal the linked note after normalization | Verifier didn't expand the live link |
| `system-prompt` | 79,423 source bytes equal the linked prompt after normalization | Verifier didn't expand the live link |
| `tool-output` | 15,867 source bytes equal the terminal companion after normalization | Verifier didn't expand the live link |
| `tool-input` | 9 of 10 meaningful lines found without companion expansion | The missing agent name appears in linked prompt evidence after live-link expansion |

A read-only probe replaced the global mask with line-aware inline-code detection. It expanded 43 text companions and left no partials in the four categories. This established the verifier false-positive root cause and supported the approved fix below.

**Caveat:** Layer D checks text presence. It doesn't prove that the missing `question-records-research` token appears at the exact sub-agent position. The new control keeps the renderer's Intent behavior visible, but placement remains outside this text-presence claim.

## Plan

1. ✅ **Freeze the input.** Read only the failed export receipt, source snapshot and failure log.
2. ✅ **Extract 22 evidence rows.** Record each category, request and representative source/output text.
3. ✅ **Classify one control per category.** Compare tool input, tool output, compaction summary and system prompt.
4. ✅ **Check companion accounting.** Confirm the source text exists in linked companion bytes.
5. ✅ **Check renderer transformations.** Compare normalized and redacted text.
6. ✅ **Check scoring.** Reproduce the false positives and add normal/inline-code controls.
7. ✅ **Review the remaining multiplicity failures.** Keep them separate from resolved partials and fix the question-Intent case.

### Implemented verifier fix 261119

1. Replace the global backtick regex with a line-aware inline-code mask.
2. Keep fenced-code masking unchanged.
3. Never expand an image link or a link inside a same-line code span.
4. Added a regression that places paired table code spans before a live companion link.
5. Added a control for a companion link inside inline code. It doesn't expand.
6. Frozen rerun confirms 0 partials and 0 absences for these four categories.

Effort estimate: S, about 2-4 hours for a focused test, helper change, frozen rerun and full verification.

**Observed here:** the fix expanded 43 text companions in the frozen archive. The real result is:

- 7,641 pieces checked.
- 0 partial.
- 0 absent.
- 0 out-of-order pieces.
- 14 missing repeated occurrences.

The 14 repetitions are a separate multiplicity finding. Further frozen analysis found one repeated text. Thirty-two question tool intents say "Waiting for response", while the pre-fix saved export contains 18 occurrences. The renderer incorrectly applied ordinary invocation deduplication to question calls. A narrow follow-up keeps those question Intents in the collapsed recorded section.

A fresh in-memory render from the same frozen source now passes Layer D. It checks 7,641 pieces with 0 unaccounted, 0 out-of-order and 0 missing repetitions. The old saved review file stays as historical evidence because it was produced before this final renderer fix.

## Completion 261119

The implementation, focused controls, full verification and frozen-source check are complete. The dev accepted the item on 261119.

The separate companion-scanning stack overflow stays open through its Inbox item. It wasn't part of WI-073's approval.

**Final evidence:** `pnpm run verify` passes all 821 tests, both typechecks and the build. The local golden matches 1,066 normalized lines. The fresh frozen render checks 7,641 pieces with no partials, absences, order errors or missing repeats.

## Risks and limits

| Risk | Mitigation |
| --- | --- |
| The frozen source and log contain private text | Keep evidence in ignored `temp-tool-output/`. Track only categories, request positions, hashes and short redacted conclusions |
| A broad exception hides real loss | Refuse category-wide exceptions. Require an exact piece-level cause |
| One matching string occurs in unrelated output | Compare surrounding source and rendered positions, not only substring presence |
| Companion text differs from inline text by redaction | Score both the linked bytes and redaction rules separately |
| Large source scans repeat the earlier stack overflow | Don't rerun the full recursive flow first. Start from the saved receipt and targeted event lines. Keep stack overflow as a separate Inbox item |
| A renderer fix changes many exports | Require synthetic controls, focused tests and a frozen-source rerun before touching goldens |

## References

- [WI-021](WI-021-source-aware-verification.md): parent verification policy and scorer limits.
- [WI-071](WI-071-copilot-gui-markdown-presentation.md): review that found the current failures and fixed the Intent regression.
- [WI-023](WI-023-failed-export-handling.md): kept failed export, source capture and receipt behavior.
- [sdk-loss-account.ts](../src/verify/sdk-loss-account.ts): Agent Host content extraction and companion expansion.
- [loss-account.ts](../src/verify/loss-account.ts): shared partial/present/absent scoring.
- [SPEC 9.1](../docs/SPEC.md#91-audit-architecture-independence-model): approved audit layers and limits.
