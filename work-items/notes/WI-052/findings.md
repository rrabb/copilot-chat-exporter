# Findings and interpretation

Preserved 261113 from the WI-052 research. This is a synthesis, not a fresh source or runtime check.

## Main findings

| finding | evidence | implication | source |
| --- | --- | --- | --- |
| Input, result and attachment detail need separate controls | SDK documentation describes result.content, detailedContent and contents, while MCP supports text/image/audio/resource/resource_link plus structuredContent. | A tool's concise model-facing text is not necessarily its full display result. A no-results choice must also govern newly generated result companions. | https://github.com/github/copilot-sdk/blob/ed814e4134fdba86e2e88b82dcac85b1c125ed8a/docs/features/streaming-events.md |
| Ephemeral is an availability boundary, not a way to restore past output | The SDK reference marks live-only event families, including user-input/elicitation and shell-output channels. | An offline export can select only what was recorded. Do not promise complete historical questions, live deltas or per-call usage merely because the live API defines them. | https://github.com/github/copilot-sdk/blob/ed814e4134fdba86e2e88b82dcac85b1c125ed8a/docs/features/streaming-events.md |
| Question/answer output deserves a semantic category | Local questionCarousel state, agent-native user_input events, MCP elicitation and tool-based ask_user use different records. The Local stress example has an unmatched recorded answer string despite a general verification pass. | Short form should keep title plus recorded outcome. Show skipped/cancelled/unavailable separately. A string nonmatch is a warning, not conclusive proof of why content is missing. | observed-inventory.json |
| Memory is a documented feature, but not one export format | GitHub documents repository memories and user preferences. The SDK reference separately describes memory-related permission data. | Distinguish a memory operation from loaded instructions, graph queries and compaction. Historical content must come from recorded evidence, not today's memory state. | https://docs.github.com/en/copilot/concepts/prompting-and-context/copilot-memory |
| A top-level type union does not prove which content is absent | The checked VS Code SerializedChatResponsePart union includes a generic serialized-progress wrapper whose member definitions were not all opened. | The nine top-level members are not nine total persisted kinds. Do not infer that tools, confirmations or warnings cannot persist. The Local survey directly encounters multiple such kinds. | source-research.json |
| Public documentation and sampled private events have different coverage | The survey sees Fusion, usage_record, skill reference, model snapshot and hook events beyond the verified public event subset. Public Auto routing is not evidence that Fusion is model ensembling. | Keep unfamiliar event reporting independent of content filters. The report inventories observed names without inventing undocumented semantics. | observed-inventory.json |
| Dependency inventories do not establish which runtime executed a chat | The online pass records a Codex component entry and a changing VS Code extension layout. | These are background source observations. They neither broaden this exporter's provider scope nor establish Copilot runtime behavior. Claude/Codex sessions remain out of scope. | source-research.json |

## Recommended first implementation proposal

- Keep the current detailed default byte-stable where existing deterministic rules apply.
- Offer independent tool-input and tool-result detail, with exact per-tool overrides.
- Treat MCP as an origin selector inside tools, not a second output category.
- Add recorded readable reasoning on/off and a dedicated question/answer representation.
- Keep errors/status, source warnings and intentional-exclusion accounting intelligible.
- Defer shell-based file-read inference, a full rule language, extra media decoding and reopened hook/permission policy.

## Important limits

- Source declarations, persisted variants and actually encountered records are different inventories.
- Nine top-level members of a union with a generic wrapper are not nine total persisted kinds.
- Ephemeral is an availability boundary, not an export option that restores missing history.
- A cgmanifest component entry does not prove which runtime executed a chat.
- Auto routing does not establish Fusion semantics. The dedicated Fusion work belongs to [WI-053](../../WI-053-agent-host-fusion-export-compatibility.md).
- The repository schema guide contains older SDK-support and clipping statements. Use current README/SPEC and measured exports when checking actual behavior.
- Research verification passed five saved files and failed one. A passing result did not establish complete question-answer rendering.
- The original repository verify run hit a pre-existing privacy-test failure in a dashboard link. A separate golden check passed. These historical results are not validation of a future implementation.
