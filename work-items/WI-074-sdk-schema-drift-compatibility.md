Part of [WI-019](WI-019-agent-chat-export.md).

# WI-074 SDK schema drift compatibility

## At a glance

- **Goal:** inspect new SDK event variants without losing useful fields, then add a safe way to teach the exporter.
- **Current source:** the frozen WI-073 capture of the 261118 `3eba66e9` export.
- **Observed count:** six distinct census labels represent seven records.
- **Finding:** four `:unsupported` labels describe unknown fields in events whose main payload already rendered.
- **Finding:** two labels are unfamiliar event types whose records weren't rendered.
- **Finding:** the archive footer currently groups all six labels as missing content. That wording is too broad.
- **Decision 261119:** use a private inventory plus small synthetic event-family fixtures.
- **Research 261119:** four unknown fields are present in the current public SDK generated types.
- **Decision 261119:** `model.telemetry` gets a compact note and a complete collapsed redacted payload.
- **Result 261119:** the bounded implementation passes focused tests, full verification and strict replay of the 16,509-record source.
- **Status 261119:** accepted and done.
- **Next:** WI-075 owns broader event and tool coverage.

## Observed variants

The frozen capture is source evidence. It stays read-only under the existing cache capture.

| Variant | Records | Current behavior | Meaning found | Proposed disposition |
| --- | ---: | --- | --- | --- |
| `instruction.update` with `postInitial` | 1 | Main note renders. Unknown boolean creates `:unsupported` | Marks a later instruction update as post-initial | Teach the boolean and show it as metadata |
| `instruction.update_delivery` | 1 | Event is unhandled and omitted | Records delivery identity, first/latest update identity, count, request generation, outcome, capability and reason | Render a compact delivery note and keep cross-reference IDs |
| `session.usage_record` with `instructionUpdateDeliveryId` and `instructionUpdateLatestEventId` | 1 | Usage is counted. Two unknown fields create `:unsupported` | Connects the call's usage receipt to an instruction delivery and latest update event | Teach the string fields as provenance, not billing values |
| `assistant.fusion_phase_completed` with `endedWithBackgroundWork` | 1 | Phase output renders. Unknown boolean creates `:unsupported` | Marks whether the completed phase left background work running | Teach the boolean and show it in the phase note |
| `session.fusion_completed` with `awaitingBackgroundWork` | 1 | Completion note renders. Unknown boolean creates `:unsupported` | Marks whether Fusion completion still awaits background work | Teach the boolean and show it in the completion note |
| `model.telemetry` | 2 | Event is unhandled and omitted | Records WebSocket attempt properties and transport metrics | Add a compact note plus the full redacted payload, collapsed by default |

The six labels represent:

- Two unhandled event types with three records.
- Four known event types with one unsupported field or field pair each.
- One useful usage relationship across `instruction.update`, `instruction.update_delivery` and `session.usage_record`.

## Upstream research 261119

The frozen producer is Copilot Agent `1.0.103-unstable.r41379698026.g3219c66`. Current public source is newer. It can explain a field without proving older runtime behavior.

| Source | Finding | Limit |
| --- | --- | --- |
| [Copilot SDK streaming guide](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/streaming-events) | Persisted events replay from the on-disk log. Every event has a type, data, ID, timestamp and `parentId` chain. | The guide describes the public stream. It doesn't make every producer-only event public |
| [Copilot SDK generated event types](https://github.com/microsoft/copilot-sdk/blob/bc4f9a19d190021c27554d3c1d95121ab61e8d43/nodejs/src/generated/session-events.ts) | `postInitial`, `instructionUpdateDeliveryId`, `instructionUpdateLatestEventId`, `endedWithBackgroundWork` and `awaitingBackgroundWork` are defined fields | The first three are `@internal`. The background fields are experimental |
| Same SDK generated union | `instruction.update_delivery` and `model.telemetry` aren't event variants in the public union | Absence from the generated public union doesn't prove the producer can't emit internal events |
| [VS Code Fusion test-data helper](https://github.com/microsoft/vscode/blob/87579102e5ee0a10731745f64163cfe7b4384c38/src/vs/platform/agentHost/test/node/copilotFusionTestEvents.ts) | VS Code uses small typed event factories and payload objects with invented values | Its canonical sample doesn't include the two background fields |
| [VS Code history replay tests](https://github.com/microsoft/vscode/blob/87579102e5ee0a10731745f64163cfe7b4384c38/src/vs/platform/agentHost/test/node/mapSessionEvents.test.ts) | Tests cover delayed routing, interruption, cancellation and correlation | They test UI replay. They don't prove archive fidelity |
| [VS Code Fusion progress renderer](https://github.com/microsoft/vscode/blob/87579102e5ee0a10731745f64163cfe7b4384c38/src/vs/platform/agentHost/node/copilot/copilotFusionProgress.ts) | The UI keeps phase state and progress milestones. Its own comment says it never copies phase content, prompts or tool arguments | The exporter has a broader replay goal than the UI |

The public type comments establish these meanings:

- `postInitial`: the update was recorded after the initial user message.
- `instructionUpdateDeliveryId`: the qualifying instruction-update delivery used for that model request.
- `instructionUpdateLatestEventId`: the latest canonical update included in that request.
- `endedWithBackgroundWork`: the first phase ended with background work outstanding.
- `awaitingBackgroundWork`: the committed first pass has background work whose notifications continue the conversation.

These comments support direct field handling. The `instruction.update_delivery` event still needs a project-owned interpretation. Its record links the update event to later usage fields. Its outcome and capability vocabulary aren't documented in the public union.

The `model.telemetry` records contain WebSocket attempt properties and metrics. They aren't text or billing calls. They can still explain transport duration, frames, bytes and completion state.

## Current failure mode

The parser counts drift correctly. The footer says all six kinds are unhandled and their content is missing.

That claim is too broad for `:unsupported` records. Their reviewed fields and main text are still present. Only the new field is unknown.

The new reporting should separate:

| Class | Meaning | Strict result |
| --- | --- | --- |
| Intentional omission | A reviewed category is counted but excluded by policy | Passes |
| Unsupported field | A known event rendered, but some field or value is unknown | Fails |
| Unhandled event | No reviewed event adapter exists | Fails |
| Invalid value | A known field violates its reviewed type or range | Fails |

Non-strict export can still succeed for unreviewed records. It must keep the warning and exact counts.

## Recommended design

Use a private inventory and a synthetic compatibility corpus. Don't rely on either one alone.

| Artifact | Purpose | What it contains | Where it lives |
| --- | --- | --- | --- |
| Private inventory | Discover changing native formats | Event type, field paths, value types, counts, source hashes and reviewed status | Ignored `temp-tool-output/` only |
| Synthetic fixtures | Prove reviewed behavior stays stable | Invented IDs and prose with the same field types and relationships | Committed tests and fixtures |
| Private frozen capture | Prove the real record still reproduces the decision | Original source hash and selected byte ranges | Existing cache or retention folder |

Don't create one large synthetic chat containing every event ever seen. That chat would mix incompatible versions and contradictory lifecycle states.

Use small event-family fixtures. A few compatible events can share one synthetic stream. A separate stream should cover each unsupported, defensive or impossible case.

### Teaching loop

1. Inventory an unknown event or field without copying conversation bodies.
2. Review the record in the frozen source.
3. Decide keep, aggregate, omit by policy or keep as an unknown diagnostic.
4. Add a typed adapter or reviewed omission rule.
5. Add invented synthetic coverage for the valid variant and nearby invalid variants.
6. Make Layer D and the schema census understand the decision.
7. Update SPEC and rerun strict export.

Do not add automatic schema acceptance. One field occurrence isn't enough to bless it. Teaching must stay reviewable and test-backed.

### Unknown-event fallback

The proposed normal-export fallback is:

- Show a collapsed `Unreviewed SDK event: <type>` note at its recorded position.
- Apply the normal redaction path.
- Keep type, timestamp, agent scope, field names and safe scalar values.
- Put large payloads in a redacted companion.
- Count the event under schema drift.
- Keep `--strict` failing until a handler or deliberate omission is approved.

Binary payloads and unknown records that match a reviewed noise family may instead use a counted diagnostic-only representation. This part needs developer approval.

## Decisions needed

1. ✅ Keep `model.telemetry` as a compact transport note and a collapsed redacted payload.
2. ✅ Keep unknown events as collapsed redacted payloads at their recorded positions.
3. ✅ Use safe scalar fields in the compact summary and keep nested data only in the collapsed payload.

Recommended answers:

For `model.telemetry`, the compact note should show event, model, outcome, disposition and numeric metrics. The collapsed payload keeps nested properties and correlation data under the normal redaction rules.

For other unknown events, keep collapsed payloads in the archive. They must keep strict failure and clear redaction limits.

Start with shallow safe scalars. Require review before exposing arrays, nested records or long bodies in the compact summary.

The full collapsed payload still uses the existing long-text companion rule. A large unknown record must not create a large inline JSON block.

## Done when

- Every current variant has a reviewed disposition and synthetic test.
- A private inventory reports field paths, value types and counts without raw conversation bodies.
- The console and archive separate intentional omission, unsupported fields and unhandled events.
- Unknown records don't disappear silently in non-strict exports.
- `--strict` still fails for unreviewed fields and event types.
- Redaction and companion limits apply to diagnostic payloads.
- Layer D checks the recognized text and relationship fields.
- SPEC and the changelog describe the approved behavior.
- The developer reviews the result before the item closes.

## Implementation 261119

The bounded slice is complete:

- The exporter teaches `postInitial`, `endedWithBackgroundWork`, `awaitingBackgroundWork`, `instructionUpdateDeliveryId` and `instructionUpdateLatestEventId`.
- `instruction.update_delivery` renders a compact correlation note and the complete redacted event.
- `model.telemetry` renders a compact transport note and the complete redacted event.
- Future unknown SDK event types render as collapsed redacted records at their recorded positions.
- Unsupported usage receipts show one representative raw record per diagnostic signature.
- Large diagnostic records use the 300-line OR 15-KiB companion rule.
- The console and archive separate unhandled event types from unsupported fields in known types.
- Layer D checks delivery values, telemetry strings and usage-correlation IDs.
- Unsupported usage diagnostics no longer count one record twice in the scoped-event census.

The private [schema inventory](../temp-tool-output/261119-wi074-schema-inventory/summary.json) contains paths, types, event counts and line numbers. It doesn't contain values or bodies.

Regenerate it with:

```powershell
node scripts\sdk-schema-inventory.ts --events-file <events.jsonl> --output <new-private.json> --event-type <type>
```

Repeat `--event-type` for each family. The command refuses an existing output path. The output stays private.

### Validation

- The original frozen source has 16,509 physical events.
- Strict in-memory replay reports 0 unhandled types and 0 unsupported payload variants.
- Layer D checks 7,666 pieces with 0 partials, absences, order failures or missing repetitions.
- Delivery values, telemetry strings and usage correlation add 25 checked pieces.
- `pnpm run verify` passes 828 tests, generated checks, both typechecks and both goldens.
- `pnpm run build` rebuilds the CLI, library and declarations.
- The SDK golden candidate was reviewed and advanced to generation `a02076a76987f3084350f624e0287e96ac0dab147243b905f39fda945a6f1eb1`.

## Evidence and limits

- The frozen capture warning appears at source line 7179 for the usage fields.
- The delivery record is at line 7178.
- The unsupported instruction field is at line 7175.
- The background-work fields are at lines 10321 and 10331.
- The two telemetry records are at lines 7398 and 8772.
- Unfamiliar SDK types now render as collapsed redacted diagnostics in [sdk-session.ts](../src/session/sdk-session.ts).
- Known unsupported fields are collected by [EventFields](../src/session/sdk-event-fields.ts).
- Usage receipt compatibility is checked by [sdk-usage-record.ts](../src/session/sdk-usage-record.ts).
- Existing private inventory and synthetic-fixture patterns are documented in [WI-054](WI-054-fusion-census-and-golden-fixtures.md).
- Current public definitions and VS Code test patterns are linked in [Upstream research](#upstream-research-261119).

This inspection proves the seven records and fields above. It doesn't prove that these variants cover every current Copilot producer or future SDK version.

The broader all-event and all-tool coverage question is tracked separately in [WI-075](WI-075-sdk-event-tool-coverage.md). It will reuse the WI-052 catalogue and casebook research before running a new native inventory.

## Acceptance 261119

The developer accepted the implementation and requested the commit review. The review confirmed the compact telemetry summary, collapsed payload and separated schema-drift wording.
