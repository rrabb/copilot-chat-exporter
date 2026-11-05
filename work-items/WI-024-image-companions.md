# WI-024: Image companions

Canonical entry: [WI-024](../work-log.md#wi-024). The dashboard owns status and next actions.

## At a glance

- Goal: keep available Local and SDK image bytes as linked companions.
- Saved image bytes aren't resized, re-encoded or subject to an exporter size cap.
- The shared helper deduplicates images by SHA-256 within a companion sink.
- Local prompt and tool images use the helper. SDK binary assets use it for nonempty string payloads.
- Independent verification compares unique recorded hashes with linked companion bytes.
- Reference-only and unresolved images are counted separately. Unresolved alone doesn't fail the image check.
- Images bypass text redaction and may contain private information.
- A synthetic SDK archive lacked the image-specific privacy warning. The shared renderer now shows it for linked SDK image notes and omits it when no image companion exists. The dev accepted [WI-037](../work-log.md#wi-037) on 261104. The pinned old log reports 124 unique SDK image hashes in real archives (historical, not rerun), so real SDK archives with images likely exist. Whether any were shared is unknown.
- Two synthetic prompt entries with the same bytes produced one image link. [WI-038](../work-log.md#wi-038) tracks the position question.
- A synthetic reused image file got an incorrect MIME-extension note. [WI-039](../work-log.md#wi-039) tracks it.
- Real-chat frequency and the meaning of repeated entries weren't checked.
- Rejected resizing, re-encoding and a size cap because they would change or drop recorded bytes.
- Rejected opening recorded paths or fetching URLs to replace missing bytes: those aren't the recorded payload.
- Rejected copying other binary or opaque payloads; the approved policy keeps their metadata and omission reasons.
- Rejected treating text redaction as image sanitization because it doesn't inspect image content.
- The separate `--inline-images` proposal remains deferred. Current Markdown image links can still display inline in a viewer.
- Work tree: 1 of 3 children done. Estimates need the dev's confirmation.

## Original goal

Keep all available recorded images for Local and SDK chats without altering their bytes. Link the saved files from the conversation, account for missing data, and warn that image content isn't sanitized by text redaction. Non-image binaries and opaque reasoning remain metadata-only. The [pinned image decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L460) and [archive loss register](../work-log-archive.md#loss-register-and-decisions-still-required) describe the approved scope.

## Done when

These criteria describe the delivered byte-companion slice. The warning, repeated-position and MIME-note gaps found below are separate follow-ups.

- Save decodable recorded image bytes as linked companions without an exporter size cap or byte transformation.
- Keep prompt and tool context, and deduplicate saved files by image hash.
- Independently check unique expected image hashes against linked companion bytes.
- Report reference-only and unresolved records without inventing image bytes.
- Keep the image-redaction limit and the non-image binary exclusion visible.

## Work tree

Progress as of 261104: 1 of 3 children done.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-037 SDK image privacy warning](../work-log.md#wi-037) | [build] | S | - |
| 2 | [WI-038 Repeated image positions](../work-log.md#wi-038) | [research] | M | - |
| 3 | [WI-039 Image MIME reuse note](../work-log.md#wi-039) | [build] | S | - |

The unfinished children's who and size are proposed estimates for the dev to confirm. The build item doesn't approve implementation.

**Related, not a child:** [WI-014](../work-log.md#wi-014) covers the separate inline-display proposal.

## Current understanding

**Inferred from source at `306498246c6714f6d496e6a045991889dbf79ad0`:**

| Area | Behavior and limit |
| --- | --- |
| Local records | [Journal replay](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/journal.ts#L316) matches tool images by call ID. Images without a surviving tool node get a note after the request. Prompt images come from [final request variables](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/journal.ts#L368). |
| Byte formats | [The shared decoder](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/images.ts#L15) accepts Base64 strings, `$base64` objects, byte arrays and numeric-keyed byte objects. The SDK binary-asset branch first requires a nonempty string; see [SDK representations](#sdk-representations). |
| Files | [The companion helper](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/images.ts#L69) hashes and deduplicates bytes within its sink. A new file with unknown MIME uses `.bin`; reuse can make the representation note inaccurate. [The writer](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/archive-writer.ts#L79) writes and checks companions before publishing Markdown. |
| Missing data | [Collection](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/images.ts#L39) doesn't open recorded paths or URLs. With a companion sink, [rendering](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/markdown.ts#L48) links a recorded location as reference-only, or reports an unresolved image. Without a sink it reports an unresolved destination. |
| Image check | [The independent decoder and inventory](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/verify/images.ts#L26) inspect final Local requests and kept SDK events. [The account](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/verify/images.ts#L110) checks unique hashes, not every recorded position. Missing expected hashes fail with or without strict mode. Unresolved and reference-only counts alone don't fail it. |
| Existing archives | [The linked-companion reader](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/verify/images.ts#L158) limits reads to sibling archive folders and skips links inside code fences. It doesn't read recorded source-image paths. |
| Display and privacy | [The renderer](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/markdown.ts#L61) uses Markdown image links for saved bytes. Viewers may display those links inline. Text redaction doesn't sanitize image files. The shared renderer shows the privacy warning for linked SDK image notes; the synthetic checks are recorded below. |

**Historical receipt, not rerun here:** the [pinned image pass](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L196) reported 114 of 114 Local and 124 of 124 SDK unique hashes found. Its 11 excluded draft entries weren't 11 distinct, never-submitted images. This migration didn't reopen that corpus.

## Decisions and tradeoffs

| Decision | Rejected alternative and reason |
| --- | --- |
| Save recorded image bytes as companions | Don't resize, re-encode or cap them; those changes could alter or drop available bytes. |
| Use recorded data, not a replacement | Don't open source-image paths, fetch remote URLs or reconstruct missing originals. A location isn't proof of the recorded bytes. |
| Keep non-image binaries and opaque reasoning as metadata | Don't copy or interpret those payloads as readable content. The approved image exception doesn't include them. |
| Treat images as potentially private | Don't claim text redaction sanitizes images; it can't inspect their pixels. |
| Keep image display choices separate | The `--inline-images` proposal is deferred, not rejected. Existing Markdown image links can still display inline. |

The [pinned decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L461) records these choices. [SPEC](../docs/SPEC.md#recorded-image-policy) owns the current product policy. The SDK warning gap below records the implementation difference and its fix.

## Findings and outcomes

### SDK image privacy warning

**Observed here:** a synthetic SDK `session.binary_asset` with Base64 bytes produced one saved, byte-identical image companion. Before the fix, the saved Markdown lacked the image-specific warning, while the independent image hash check passed. The shared renderer now shows the warning for linked SDK image notes. Focused synthetic tests confirm the warning appears when an image companion exists and stays absent without one.

The pinned old log reports 124 unique SDK image hashes in real archives (historical, not rerun), so real SDK archives with images likely exist. Whether any were shared is unknown. The dev accepted [WI-037](../work-log.md#wi-037) on 261104. No real chat data was read for that fix.

### Repeated image positions

**Observed here:** two synthetic Local prompt image entries had different names and identical bytes. Journal parsing kept both entries. Markdown linked the first once and omitted the second name. One companion was saved, and the unique-hash image check passed. A control with different bytes produced two links and two companions.

[Rendering](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/markdown.ts#L48) deduplicates within one image block by hash. [Verification](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/verify/images.ts#L110) counts unique hashes. The probe doesn't establish whether actual submitted prompts contain this case. [WI-038](../work-log.md#wi-038) researches distinct positions without double-counting duplicated tool metadata.

### MIME note after deduplication

**Observed here:** when a synthetic PNG record was saved first, a same-byte record with missing MIME reused the `.png` file but claimed the bytes were saved as `.bin`. In the opposite order, the PNG record reused a `.bin` file without a representation note. The [helper](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/images.ts#L77) chooses a reused path before returning the note.

The probe didn't lose bytes or check real mixed-MIME records. [WI-039](../work-log.md#wi-039) tracks the inaccurate note.

### SDK representations

**Observed here:** the shared helper decoded all four synthetic byte representations. For SDK `session.binary_asset` events, a Base64 string was saved, while the object and array variants weren't saved and the image check reported a missing hash. The [SDK branch](https://github.com/rrabb/copilot-chat-exporter/blob/306498246c6714f6d496e6a045991889dbf79ad0/src/session/sdk-session.ts#L441) requires a string before calling the helper.

**Unknown:** whether an SDK producer records those non-string variants. The probe doesn't establish a real-chat defect, so this remains an evidence limit rather than a new job.

**Return to goal:** the byte-companion slice has separate checks and evidence. The three follow-ups address warning, position and MIME-note gaps without reopening the delivered slice.

## References

- [Pinned old root log: image results](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L196) and [image decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L461).
- [Archive: loss register](../work-log-archive.md#loss-register-and-decisions-still-required) and [approved sequence](../work-log-archive.md#revised-approval-scope-implementation-sequence).
- [Image policy](../docs/SPEC.md#recorded-image-policy) and [storage evidence](../docs/CHAT-SESSION-SCHEMA.md).

## Notes

### 261103 - Synthetic image checks

Focused image, SDK and writer tests passed. Synthetic probes checked byte forms, deduplication, positions, MIME notes, missing data and a saved SDK archive. The bytes weren't decoded as a real image, and no real chats were read. Local-only receipts: [focused tests](../temp-tool-output/261103-1443-wi-024/focused-tests.log), [image probe](../temp-tool-output/261103-1443-wi-024/image-probe.mts), [results](../temp-tool-output/261103-1443-wi-024/image-probe.log), [SDK archive probe](../temp-tool-output/261103-1443-wi-024/sdk-archive-probe.mts), [results](../temp-tool-output/261103-1443-wi-024/sdk-archive-probe.log), [MIME probe](../temp-tool-output/261103-1443-wi-024/mime-probe.mts) and [results](../temp-tool-output/261103-1443-wi-024/mime-probe.log).
