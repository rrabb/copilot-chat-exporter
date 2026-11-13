# Online research: chat-export Level-of-Detail (LOD) controls
Checked: 2026-11-13 (local, -05:00). Scope: public online primary sources only. No local repo/chat data sent anywhere.
Files: findings.json (structured: sources/types/controls/gaps), vscodeTypes-export-list.txt (raw symbol list), this report.md.

## Top-line finding (read this first)
As of the check date, VS Code's own docs describe a recent split into multiple "harnesses" selected by a
"Session Target": the historic **Local** harness (old ChatParticipant/ChatResponseStream model, now
deprecated for new work) and the **Copilot** harness, which "uses the Copilot SDK, the shared agent runtime
used by VS Code, GitHub Copilot CLI, and the GitHub Copilot app" (S17), plus separate **Claude** and **Codex**
session targets. This directly matches the task's "VS Code Local Copilot and Agent Host/CLI" phrasing and
should be treated as the top-level axis for any LOD model: the same chat UI now multiplexes genuinely
different backend type systems, and hooks/skills/confirmation behavior is explicitly documented as
non-portable between them (S19). Flag this as a likely mismatch versus older/cached mental models of a single
monolithic "GitHub Copilot Chat" VS Code extension.

A second structural finding: the previously-standalone **microsoft/vscode-copilot-chat** repository is now
**archived** (confirmed via repo metadata, S13). Its functional successor is vendored directly inside
**microsoft/vscode** at `extensions/copilot` (package `copilot-chat` v0.75.0, S4-S7), which itself declares a
component-manifest dependency on **openai/codex** (S6) -- i.e. the bundled "GitHub Copilot" extension's agent
runtime has a traceable link to OpenAI's Codex CLI project. This was not previously verified in this session
and is new, source-grounded information.

## What was verified by reading source, by family (see findings.json "types" for full detail + caveats)

- **Tools / MCP**: the MCP 2025-06-18 spec's `CallToolResult.content` item types -- text, image, audio,
  resource_link, embedded resource, plus `structuredContent` and `isError` -- were read in full from the
  canonical spec page (S1). On the VS Code side, `ChatToolInvocationPart`, `ChatMcpToolInvocationData`,
  `McpToolInvocationContentData` exist as real exported symbols (confirmed via the extension's own
  `vscodeTypes.ts`, S7) but their field-level shape was **not** read -- name-only/unverified. A sibling type,
  `ChatToolInvocationStreamData.partialInput`, confirms a "partial/streaming tool args" LOD is supported (S10).

- **Reasoning vs opaque**: `LanguageModelThinkingPart {value, id?, metadata?}` is the visible reasoning type
  (S9). `LanguageModelChatRequestOptions.includeEncryptedThinking: boolean` is an explicit, named opaque/
  encrypted-vs-plain LOD switch for replaying reasoning state across requests (S9) -- this is a strong, directly
  verified answer to "reasoning vs opaque." A second, separate streaming channel,
  `ChatResponseStream.thinkingProgress(thinkingDelta)` / `ChatResponseThinkingProgressPart`, also exists
  (confirmed by name in S7 and by method signature in S10) but its delta shape was not read.

- **Hooks**: fully read. `ChatHookType` enumerates 11 lifecycle events (SessionStart, SessionEnd,
  UserPromptSubmit, UserPromptTransformed, PreToolUse, PostToolUse, PreCompact, SubagentStart, SubagentStop,
  Stop, ErrorOccurred) (S8). `ChatHookResultKind` is a 3-tier success/error/warning outcome (S8). Cross-checked
  against GitHub's own public Copilot CLI/cloud hooks reference (S20), which uses matching event names
  (e.g. PostToolUse) and documents a 5-source config precedence (policy > repo > user > inline settings,
  including cross-tool `.claude/settings.json` > plugin). VS Code docs explicitly warn this VS Code proposed
  API, the GitHub CLI/cloud hooks, Claude hooks, and Codex hooks are 4 **separate, non-interchangeable**
  schemas despite overlapping terminology (S19) -- an important caveat for any LOD taxonomy.

- **Subagents**: two independent, corroborating signals. `ChatSubagentToolInvocationData
  {description?, agentName?, prompt?, result?, modelName?}` models a subagent run as a tool-invocation-shaped
  part (S10, partial read). Separately, `ChatRequest.subAgentInvocationId / subAgentName / parentRequestId`
  gives request-level parent/child correlation independent of the rendered part (S11). `ChatHookType` also has
  dedicated `SubagentStart`/`SubagentStop` events (S8), matching GitHub's own CLI concept of a subagent-scoped
  `Stop` hook aliased `agentStop` (S20) -- naming equivalence is inferred, not confirmed byte-for-byte identical.

- **Question / user answers**: `ChatQuestion {id, type: ChatQuestionType('Text'|'SingleSelect'|'MultiSelect'),
  title, message?, options?}` and `ChatResponseQuestionCarouselPart {questions, allowSkip}` were read in full
  (S10) -- a genuinely structured, typed answer-shape, distinct from MCP's own `elicitation/create` (flat
  primitive JSON-Schema only, accept/decline/cancel actions) (S3).

- **Citations/references**: `ChatResponseCodeCitationPart {value:Uri, license, snippet}` read in full (S10).
  `ChatResponseReferencePart`/`ChatResponseReferencePart2` confirmed to exist by name plus one doc-comment
  fragment ("reference target") but not fully read -- flagged partial.

- **Confirmation**: `ChatResponseConfirmationPart {title, message, data}` confirmed via the extension-host
  runtime class (S12); full class body (e.g. button/choice options) not read. A separate, documented
  autoApprove/autopilot tool-permission spectrum controls how often confirmation is even shown (S11, partial
  enum).

- **Edits / progress / warnings**: `ChatResponseTextEditPart` read with an "Auto routing tier" attribution
  field (name truncated in the captured fragment) (S10) -- i.e. edits can be tagged with which auto-routed
  model/tier produced them, tying into the "fusion" family below. `ChatResponseVoiceProgressPart
  {id, value}` is a distinct narration/voice-mode progress channel (S11). `ChatResponseWarningPart`,
  `ChatResponseInfoPart`, `ChatErrorLevel`, `ChatResponseProgressPart2` exist by name only (S7) -- not verified.

- **Fusion / model auto-routing (closest public analogue found)**: `ChatAutoModeTier =
  'efficiency'|'balance'|'intelligence'|'fast'` and `ChatResponseAutoModeResolutionPart
  {resolvedModel:{id,name}|undefined}` were read in full, with a doc comment noting "Auto may route several
  times in a turn; each route gets its own row" (S10). This is model **auto-routing/selection** transparency,
  not multi-model **ensembling**. No ensembling/voting/fusion-of-multiple-outputs mechanism was found anywhere
  in the sources checked -- call this a gap, not a confirmed absence.

- **Instructions / skills / custom agents / memory (new VS Code "Agent Customizations" system)**: current VS
  Code docs describe an open **Agent Plugins 1.0** standard (agent-plugins.org) with two *portable* component
  types -- **Skills** (`SKILL.md`, "instructions, scripts, and resources that load on-demand") and **MCP
  servers** -- plus Copilot-specific non-portable components under a `com.github.copilot/` namespace: custom
  **agents** (`.agent.md`), **hooks** (`hooks.json`), commands, rules (S18, S16). **Custom instructions**
  (always-on, as opposed to Skills' on-demand loading) were referenced but their page was not fetched (gap).
  **No dedicated public "memory" feature/type was found** in any source read in this pass -- flagged as an
  explicit gap requiring a follow-up search, not a confirmed absence.

- **Models / usage**: `LanguageModelChat.countTokens(...)` confirmed (S9) as the one usage-adjacent API
  verified; no per-response usage/cost object was located (gap -- `ChatResult`'s own declaration was not
  opened, only referenced).

- **MCP capability support matrix** (S17): VS Code's Copilot harness documents Sampling and Roots as
  "deprecated in MCP" yet still supported with caveats, Elicitation as host-rendered, MCP Apps as
  Experimental, and Prompts as partially supported -- useful for flagging current-vs-spec version mismatches
  in any exporter LOD design.

## Public API vs inferred-internal vs unknown -- quick legend used in findings.json
- **Public API**: MCP spec pages (S1-S3) and any VS Code `vscode.proposed.*.d.ts` file opened and read in full
  for the cited symbol.
- **Inferred internal / partial**: symbol name confirmed via `vscodeTypes.ts` re-export or a text-search
  fragment, but full class/interface body not read -- marked PARTIAL or NAME-ONLY in `caveat` fields.
  Do not treat these as verified shapes.
- **Unknown / gap**: explicitly listed in findings.json `gaps` (9 entries) -- includes Memory, full ChatResult
  shape, SKILL.md/`.agent.md` frontmatter schemas, and any multi-model fusion/ensembling mechanism.

## Current upstream vs installed-version mismatch notes
- All VS Code source citations are pinned to `microsoft/vscode` commit `52a9a2e5fbb169879b43a716c5b39e789c370ae0`
  (= repo HEAD at check time, 2026-11-13T16:59:51Z). The `.d.ts` proposal files were originally located via
  GitHub code search at index ref `944d79c5b914eea991cc9a92c5e08053e565f983`; `vscode.proposed.chatHooks.d.ts`
  was spot-re-fetched at current HEAD and found byte-identical (same blob SHA) -- the other proposal files were
  not individually re-verified at HEAD, so a small residual risk of index-lag exists for S9-S11.
  This project's own installed VS Code / Copilot Chat extension version was **not** inspected (out of scope:
  no local files/chats were read per instructions), so no installed-vs-upstream diff could be produced --
  only "current public upstream" is reported here.
- microsoft/vscode-copilot-chat is archived; if any cached/prior knowledge referenced that repo as the live
  source of truth, it is now stale -- the live source is `microsoft/vscode:extensions/copilot`.

## Overengineering warning (critical-collaborator note, as requested)
Several of the type families above (hooks, hook-result severity tiers, hook config-source precedence, subagent
IDs, autoApprove/autopilot tiers, auto-mode routing tiers) are all **proposed/unstable VS Code APIs** (literally
named `vscode.proposed.*.d.ts`), not stable public API, and two of the harnesses (Local vs Copilot) are
documented as having **non-interchangeable** hook/skill/instruction formats. A chat-export LOD design that
tries to unify all of these into one schema risks chasing an unstable, multi-harness moving target. Consider
scoping an initial LOD implementation to the parts with the strongest evidence (MCP content types, hooks
event+severity, reasoning/opaque-thinking flag, question/confirmation parts) and treating fusion/memory/
skills/subagent internals as a clearly-labeled "experimental/low-confidence" tier pending a dedicated follow-up
pass, rather than building full fidelity for every name seen in a single re-export file.


---

## Bounded follow-up (same task, additional pass) -- 2026-11-13

Three additional items checked per orchestrator request, adding S21-S24 and T43-T56 to findings.json (now 24
sources, 56 types, 18 controls, 10 gaps). All details below are cited inline; see findings.json for full
field-level structure.

### 1. GitHub Copilot Memory -- feature confirmed, correcting prior gap framing
The prior pass incorrectly implied no public Memory feature exists. Corrected: **GitHub Copilot Memory is a
publicly documented (public-preview) feature** (S21) storing two kinds of entries -- repository-level facts
(coding conventions, architectural decisions, build commands) and user-level personal preferences -- each
cited back to supporting code or quotes, with unused entries auto-expiring after 28 days. This is explicitly
distinct from a separate per-project "Memory" setting in the GitHub Copilot app.

On the schema side, the official copilot-sdk event reference (S22) documents the write/approval-side schema
for a memory action as one discriminated-union kind of its `permission.requested` event:
`kind:"memory" = {subject, fact, citations}` (T50) -- fields that line up with the docs' own description of
citations. **Remaining, narrower gap**: no separate persisted `memory.*` event family (e.g. a
`memory.created`/`memory.retired` pair analogous to `subagent.*` or `skill.invoked`) was found; only the
approval-flow event is documented at schema level, and the underlying storage/retrieval/matching mechanism
has no public schema.

### 2. github/copilot-sdk official event/schema reference (the most load-bearing new source)
Fetched and read in full: `github/copilot-sdk:docs/features/streaming-events.md` (blob sha
`e8242e075ce380179d99bca31b0c37ec4c5b7cc2`, at commit `ed814e4134fdba86e2e88b82dcac85b1c125ed8a` on `main`,
an auto-generated "Update SDK snapshot for Copilot CLI 1.0.111-0" commit -- i.e. this doc is kept in lockstep
with a specific Copilot CLI release). This single page answers nearly every remaining open item in the
original task list with field-level precision:

- **Envelope-level ephemeral/persisted flag** (T43) -- the clearest explicit LOD control found in this entire
  research effort: `ephemeral:true`/absent on every event, consistently governing whether data streams live
  only or is durable and replayed on session resume.
- **user.message / assistant.message / assistant.turn_start / assistant.turn_end / assistant.message_delta**
  (T44, T45) -- full field lists, confirmed as requested by name.
- **Reasoning vs opaque, CLI/SDK side** (T45, T46) -- `assistant.message` carries `reasoningOpaque` (Anthropic
  encrypted), `encryptedContent` (OpenAI encrypted), and `reasoningText` (readable) as three parallel fields on
  one message, plus a separate complete-block/delta pair (`assistant.reasoning`/`assistant.reasoning_delta`).
  This independently confirms the opaque-vs-readable reasoning split found earlier in VS Code's
  `includeEncryptedThinking` (S9) is a general, cross-harness, cross-provider pattern, not a VS Code-only idea.
- **tool.execution_start/execution_complete/shell_output/execution_progress** (T47) -- a documented 3-tier
  result LOD (`content` concise/truncated vs `detailedContent` full vs `contents` structured ContentBlock[])
  plus a 4th ephemeral append-only live-terminal channel (`tool.shell_output`) explicitly replacing a
  deprecated bounded-snapshot channel (`tool.execution_partial_result`).
- **subagent.started/completed/failed/selected/deselected** (T48) -- a materially fuller subagent lifecycle
  than VS Code's name-only `ChatSubagentToolInvocationData`, including duration/token/tool-call counts and an
  explicit "deselected, empty payload" terminal state.
- **session.compaction_start/compaction_complete, session.usage_info vs session.usage_checkpoint,
  session.shutdown** (T52) -- directly answers the task's "session.compaction" and "usage persisted vs
  ephemeral" questions: usage_info is an ephemeral per-snapshot view, usage_checkpoint is explicitly "durable"
  and resume-reconstructable, and a third, richer per-call `assistant.usage` event (T53) carries cost, token
  breakdowns (incl. reasoningTokens/cache tokens), latency, and API-endpoint attribution.
- **permission.requested/completed** (T50) -- a discriminated union by `kind` (shell/write/read/mcp/url/
  memory/custom-tool), with 5 named approval/denial outcomes -- finer-grained than the hooks' 3-tier
  success/error/warning result kind found earlier.
- **skill.invoked** (T49) -- confirms Skills are injected as full text (`content` field holds the entire
  SKILL.md body), with an explicit note that the SDK does NOT auto-approve `allowedTools` itself; that
  decision stays with the host's permission handler (the Copilot CLI auto-approves while a skill is active;
  other hosts may not).

**Honest limitation**: this page is an official, hand-maintained *reference* page, not the generated
SessionEvent union/type source itself. The page states outright that it does not cover every event type and
that each SDK's generated union (e.g. TypeScript's `SessionEvent` union) is the authoritative exhaustive list.
That generated schema file was not opened in this bounded pass -- flagged as a residual gap.

### 3. VS Code internal pinned-source spot read (chatModel.ts, languageModelToolsService.ts)
Two internal (non-exported, not part of `vscode.d.ts` public API) workbench files were read directly, cheaply
confirming concrete internal shapes rather than adding more exported-but-unread names:

- `src/vs/workbench/contrib/chat/common/model/chatModel.ts:2227` (blob sha
  `c38cfc03910bc3ee15eb082b78733ce098fa8228`) -- the actual **persisted-history part union**,
  `SerializedChatResponsePart`, has only 9 named members (markdown, file-tree, inline-reference,
  markdown-with-vulnerability, thinking, a generic serialized-progress-content wrapper, question-carousel,
  plan-review, disabled-Claude-hooks) (T54) -- visibly narrower than the full live `ChatResponseStream` part
  surface, a concrete content-vs-persisted-history LOD narrowing point.
- `src/vs/workbench/contrib/chat/common/tools/languageModelToolsService.ts:183-370` (blob sha
  `ebbe93af9fd7d72119c5360971dd3c981d145bce`) -- `IToolInvocation` (T55) carries `preToolUseResult` (ties
  directly to the earlier-found `ChatHookType.PreToolUse`), `preApproved:ConfirmedReason` (a documented
  confirmation-bypass for out-of-band/server-side approval decisions), and `traceparent`/`tracestate`
  (W3C trace-context fields explicitly forwarded to MCP tools as `_meta.traceparent` per **MCP SEP-414** -- a
  concrete, named MCP-spec cross-reference not previously found). `IToolResult` (T56) has only a 3-kind
  content union (`promptTsx`/`text`/`data`), narrower than and differently shaped from MCP's public 5-type
  content union -- image/audio/binary are folded generically into `kind:'data'` by `mimeType`. Separately,
  `toolResultDetails.mcpOutput` is documented as preserving the raw upstream MCP `CallToolResult` verbatim
  alongside the lossier internal summary -- a documented full-fidelity escape hatch.

These are explicitly labeled **INFERRED INTERNAL SOURCE** in findings.json (not public API) -- useful for
understanding current behavior, but unprotected by any public deprecation/stability guarantee.

### Corrections applied to existing entries (per explicit instruction)
- S6 (cgmanifest.json openai/codex entry): reframed from implying a runtime conclusion to stating plainly that
  it is a dependency/license-inventory record only -- it does not establish which runtime executes Copilot
  turns or the extension's full successor history.
- S7 evidence text: corrected to reference the actual file created in this folder,
  `vscodeTypes-export-list.txt` (the earlier text incorrectly said `types-raw.txt`).
- Memory gap: corrected from "no feature found" to reflect the publicly documented feature plus the partial
  SDK schema, with a narrower, honestly-scoped residual gap (see item 1 above).
- All prior NAME-ONLY/PARTIAL caveats (ChatToolInvocationPart, ChatMcpToolInvocationData, ChatResponseReferencePart,
  etc.) were left untouched, as instructed.

findings.json is saved UTF-8 without a BOM (verified via byte inspection: first bytes are `7B 0A 20`, i.e. `{`
with no `EF BB BF` preamble).

Tracking: no change
Evidence: sources/tools
