# VS Code Copilot Chat Exporter - Specification

Authoritative spec for `tools/copilot-chat-exporter`, the exporter that turns a VS Code
Copilot chat session into a single human-readable Markdown archive with visual aids.

This document is the contract. When you change the script, keep this spec and the on-disk output
in agreement, then follow the Verification section before considering the change done.

## Project goal and scope

Capture every Copilot chat session, whatever its type or location, and export each to a rich review artifact (Markdown first, HTML later) that preserves as much of what the chat shows as the stored data allows: prompts, readable reasoning, tool calls with inputs and outputs, file changes, models, credits, tokens, timing and code blocks. The purpose is review and playback of why and how something was done, including the human's and the model's reasoning, and confidence before a chat is deleted. Section 1 below is the contract for the single-session Markdown file.

| Stage | Role | State |
| --- | --- | --- |
| Listing (`--list`, basic and detailed HTML) | Identify every session, its type, project, backing and storage artifacts; never export | Implemented for the stores the tool reads |
| Export | Turn one session into the review artifact with a reported loss account | Local chats and the main conversation of Agent Host and Copilot CLI chats; the Local fidelity gaps are in progress |

Source capability matrix (examples of counts come from one development machine and are not guarantees):

| Source | Listed | Exportable | Reasoning in the stored data | Notes |
| --- | --- | --- | --- | --- |
| Local journal (`chatSessions`, including empty-window chats) | Yes | Yes, with known fidelity gaps | Readable `thinking` blocks | Journal replay is authoritative |
| Agent Host (SDK events, main and sub-agent scopes) | Yes | Main conversation and sub-agent conversations (nested inline at the delegation point): yes | Mixed: in one 10,436-message corpus 37% of assistant messages carry readable reasoning (`reasoningText`, plus `reasoningBlocks` thinking for Claude models) and the rest carry only an encrypted continuation token or none. GPT models mostly give a model-written summary, Claude models give thinking text | Per-call usage ledger in `~/.copilot/session-store.db` for some sessions |
| Copilot CLI (SDK events) | Yes | Main conversation: yes | Same as Agent Host | Same store layout |
| Claude (`claude-code:/`, `agent-host-claude:/`) and Codex | As unsupported | No, out of scope for now | Unknown | Not planned; no local transcript was found |
| Cloud sessions | No local transcript | No | Not applicable | Needs network and authentication, which this tool does not use |

Non-goals: the tool never deletes, moves or modifies anything related to sessions and does not recommend deletion; Claude and Codex provider chats are out of scope for now; cloud sessions; fetching remote data; decrypting or inferring opaque reasoning; converting tokens to credits; and any write to native storage. A verbatim raw-source bundle and HTML playback are possible later phases that need separate approval.

Fidelity principles: every omission is reported with a reason and a count, unknown is never zero, text redaction is best effort, and "near-lossless" never means the Markdown is the only copy: the raw source remains the lossless record.

### Local journal selection and unknown response items

Local ID and prefix lookup searches both `User/workspaceStorage` and `User/globalStorage/emptyWindowChatSessions` under the selected user-data root. A unique UUID or prefix resolves directly. If one ID occurs in multiple journal files, the CLI lists every path and requires an exact `.jsonl` path. An ambiguous prefix can use a longer unique prefix or an exact path. A missing ID gives `--list`, `--user-data-root` and exact-path guidance; the CLI never guesses another chat.

An unreviewed Local response kind is rendered as a collapsed, redacted JSON block only; its `content.value` is never inlined, even when it looks like a standard Markdown string. If the kind interrupts an open code fence, the block is held and written after the text run that closes the fence, so the code stays continuous. A payload over 300 lines OR over 15 KiB moves to a companion file with a 10-line preview inline. Each JSON fence is longer than the longest backtick run in its content (`fenceFor`). The census reports the kind, ordinary export warns, and `--verify --strict` fails until the kind has a semantic renderer, is reviewed and added to `GENERIC_RESPONSE_KINDS`, or is deliberately ignored after confirming it carries no needed content. Layer C checks that every unknown-response block appears once, in order, and that its inline JSON parses back to the redacted payload.

`markdownVuln` (checked against VS Code 1.141.2, commit 16507d91) has a semantic handler. When `content.value` is a string and `vulnerabilities` is an array of `{title, description}` strings, the value is merged into the surrounding text run as VS Code does, and each warning follows the run, labeled as recorded by the chat source and not validated by the exporter. `supportThemeIcons`, `supportHtml` and `uris` are counted as omitted display metadata. Any other shape falls back to the unknown-kind JSON block and fails strict.

Fence repair: a fence still open at the end of a turn is closed there and counted as a representation change. A non-text node no longer closes a fence in the middle of a turn. If a fence is ever closed before the end of a turn, the export reports the turn and interrupting kind, and `--strict` fails. A turn-end close does not fail `--strict`. Fence tracking recognizes both backtick and `~~~` fences (CommonMark rules: a closer uses the same character and is at least as long as the opener; a backtick opener whose info string contains a backtick is not a fence). Layer C's fence stripping uses the same rules. The edit-preview strips stay backtick-only, because the exporter writes those fences itself. Real data (83 Local journals): one early close before this rule (a `markdownVuln`), none after, and no turn-end closes.


### Agent chat export policy (approved October 14)

Verification applies the same fence-repair rules to SDK and Local exports: early closes fail strict verification, while turn-end closes and HTML escapes are recorded without failing strict. The independent `markdown-it` check is loaded only for verification and tests. An unavailable parser fails `--verify --strict`.

The exporter keeps tool calls that VS Code hides (`presentation: 'hidden'`). A later copy of the same tool-call ID that adds no rendered content becomes a one-line "continued from turn N" note. Terminal updates with new content get that note plus a delta: unchanged text and metadata are not repeated, appended terminal output emits its suffix, and non-prefix replacement output stays in full. New commands, errors, images, metadata and status remain visible. The comparison uses the latest earlier turn with the same ID, never another call with similar text. Persisted resources already linked for that ID are not repeated. Other tool updates remain in full. Parsed records are unchanged.

Layer D independently reads raw terminal IDs and output across requests. It checks newly appended output separately, including mid-line suffixes. It never combines different IDs or same-request snapshots into a cross-turn delta. Repeated-content and ordering checks for other categories remain unchanged.

For Local tool records, an explicit missing-data representation is allowed only after checking the complete record against the reviewed metadata fields. It renders the tool name once and "No message, input or output was recorded." The census reports these under `representationCounts.tool-no-content`, separately from Layer D content pieces. Unfamiliar fields fall back to JSON and fail strict rather than claiming no content.

Container fence repairs repeat list indentation and blockquote prefixes. Fence whitespace excludes BOM characters. Outside code, unclosed comments and `script`, `style`, `textarea` and `pre` tags are escaped and recorded as representation changes.

Agent Host and Copilot CLI chats are read from `~/.copilot/session-state/<backing id>/events.jsonl`. The export is selected like a Local chat (`copilot-chat-export <id>`), by the chat UUID, the backing ID, a unique prefix of at least 8 hex characters, or the exact qualified chat key shown by `--list`. The main conversation is exported, and each sub-agent conversation is nested inline at the delegation point (collapsed, always labelled as a sub-agent with its title, a summary line and a collapsible full conversation). Nesting is followed up to 8 levels; child events with no matching delegation in the conversation are counted under "Left out of this export". Usage is exported as AI credits (see "Agent usage and credits" below); where none was recorded it shows "not recorded", never zero.

| Record | Decision | Where it appears |
| --- | --- | --- |
| User prompts and attachment names (`user.message`) | Keep | Turn prompt; attachments in Turn info |
| Injected context (`transformedContent` when it differs from what was typed) | Keep, collapsed | "Injected context" under Turn info |
| Assistant text, readable reasoning (`reasoningText`, falling back to thinking or summary blocks), one-line tool intent | Keep | Reasoning block, assistant text, "Intent" line in the tool call |
| Reasoning recorded only as an encrypted token | Count, never reconstruct | Turn info and the closing "Left out" section |
| Tool calls with arguments (shown as readable lines, not escaped JSON), output, errors, exit codes, duration and detailed results such as diffs | Keep | Tool call blocks |
| Compaction summaries, model and effort changes, Auto model choice, mode changes, plan changes, resume markers, task-complete summary, aborts, errors, notifications | Keep | Notes in the turn |
| Turn and model-call boundary records | Used only for turn timing | Turn info elapsed time |
| System prompts | Keep each distinct version once | Companion file `system-prompt-<n>-<hash>.md`, with a note at the turn where it changed |
| Skill files | Keep once per distinct text | Companion file `skill-<name>-<hash>.md`, linked from a "Skill used" note in the turn |
| Images | Keep | Exact recorded bytes in a companion file, deduplicated by SHA-256, linked at the recorded position with size and short hash |
| Other binary attachments | Left out | A one-line note with type, MIME type and size |
| Permission prompts and results, permission-change records | Left out, counted | "Left out of this export" |
| Hook records | Left out, counted | Same |
| Model request/response snapshots and copies | Left out, counted | Same |
| External-tool request duplicates | Left out, counted | Same |
| Usage and cache checkpoints | Left out, counted; the last running total is shown in the Cost section | Same |

An event type outside both the kept and the left-out lists is reported as schema drift and fails `--verify --strict`, so a new SDK record cannot be dropped in silence. Nothing here deletes or modifies session data.
### Recorded image policy

Local prompt attachments and tool results use the same companion-file helper as SDK image assets. The exporter decodes recorded direct Base64 strings, `$base64` objects, byte arrays and numeric-keyed byte objects. It writes exact decoded bytes without resizing, re-encoding or an exporter size cap. It never opens a recorded image path or fetches a URL. Archives with image companions warn that images bypass text redaction and may contain private information.

One file per unique SHA-256 is saved in the approved timestamped sibling folder. Every recorded position links to it with byte size and a 12-character SHA-256 label. Local prompt images appear in their prompt block. Tool images appear in their tool block, replacing raw encoded payloads. When only result metadata survives, a labeled image note follows that request's response. Draft `inputState.attachments` and `pendingRequests` copies are not extra submitted prompt positions; verification counts these draft records as `excludedNotSubmitted`. A matching submitted copy is still exported and hash-verified. This field counts excluded draft entries, not images that never appear in submitted requests.

The recorded MIME type selects the extension. Missing or unsupported MIME types use `.bin` and a representation-change note. Recorded paths without bytes remain reference-only links. An image record with neither usable bytes nor a location gets an unresolved note and count. SDK `assetId` descriptors resolve against recorded binary assets and are not separate missing images. Image MIME telemetry without a payload is not an image record.

All images remain companions in this pass, including unknown-origin terminal results and screenshot tools. `--inline-images` is deferred. Remote URLs are image references only when the record has an image type/MIME or the target has an image extension. Image URLs already inside exported text need no additional link. Non-image binaries and opaque reasoning remain metadata-only. Images bypass text redaction and can contain private information.

Independent image verification reads final replayed Local requests and kept SDK image events with its own decoder, not the export helper. Every unique expected byte hash must match a linked companion. For an existing Local export, verification reads only its linked sibling companions, not recorded source-image paths. Missing, unlinked or corrupted companions fail verification, including without `--strict`. The text categories are unchanged: Base64 image fields were not counted as tool-output text before this check.

### Agent usage and credits (approved October 14)

GitHub documents the per-call `assistant.usage` event as ephemeral and not replayed on resume, so the event log carries no per-call usage. Three recorded sources are used, most detailed first; the first one with rows wins and they are never added together.

| Source | What it gives | Limits |
| --- | --- | --- |
| `~/.copilot/session-store.db`, table `assistant_usage_events` (read-only) | One row per model call: time, agent id, model, input, cache read and write, output and reasoning tokens, nano-AIU, duration | Private, version-dependent CLI database; present for 11 of the 26 sessions on the development machine, and for some only a fraction of the calls |
| `model.model_call_success` events in the log (`copilot_usage.total_nano_aiu`) | The same per call, in the log itself | Present in only a few logs; also includes helper calls such as permission checks that are not assistant replies |
| Last `totalNanoAiu` on `session.shutdown` or `session.usage_checkpoint` | A running total for the whole event log | Not additive across resumes; covers every conversation in the log, not only the exported one |

**Unit.** credits = nano-AIU / 1,000,000,000. Verified on 247 of 247 real logged calls: the recorded token counts times the recorded per-batch rates equal the recorded nano-AIU, and the implied per-million-token prices equal GitHub's published rates (GPT-6 Luna $0.10 / $0.01 / $0.125 / $0.50, GPT-6 Astra $10 / $1 / $12.50 / $50, GPT-5.5 $5 / $0.50 / $30 for input / cached input / cache write / output); GitHub defines 1 AI credit = $0.01. Credits are never derived from token counts.

**Attribution.** A call belongs to the turn whose prompt is the last one at or before the call's time, and to a delegated agent by its agent id (checked: the stored parent tool call id equals the delegation's tool call id for every delegated row on the development machine). Calls that fit neither are shown as "Not matched to a turn or agent of this conversation", with their credits. A turn's credits are its own calls plus the calls of the agents it delegated to, shown split.

**Credits by turn from running totals.** Every log with checkpoints also gets credits per turn: each `session.usage_checkpoint` or `session.shutdown` total minus the previous total goes to the turn that holds it. Not every turn writes a checkpoint, so one difference can cover several turns; it is then shown on the last of them with the range ("covers turns 24-25, which the log did not separate"), never split. A difference includes delegated agents. Credits written before the first prompt are reported separately. This is shown next to per-call figures (Turn info) and alone where there are none (turn line, Cost section: the five most expensive turns and a collapsible table of all turns). Checked on the chats where the CLI store has every call: identical per turn when each turn wrote a checkpoint (4 chats), within 4-9% in the two largest, and visibly different where the store holds only some calls. Tokens: the log has no per-turn input tokens; only some logs carry `outputTokens` on assistant messages (3 of 27), shown as "from message records". Shutdown `tokenDetails` and `modelMetrics` are not used: they stopped updating while the credit total kept growing.

**Honesty rules.** Where a source has no rows, the turn, agent or chat shows "not recorded", never zero. The Cost section states the source, the number of usage rows against the assistant replies in the log, and the last logged total with the share the rows add up to (it can exceed 100%: the logged total is written at shutdown, before later calls). Real data (24 agent chats): 9 use the CLI store (5 of them cover about 100% of the replies, one covers 7%), 4 use log events, 11 show only the logged total.

## Approved upgrade: staged implementation

The approved upgrade is tracked in [the work log](../work-log.md). Root-scoped journal/index inventory now supplies CLI listing, with explicit source/current selection and no newest fallback in the library or CLI. Offline HTML listing is implemented and tested; SDK backing identity and child-scope verification are implemented and the main conversation of an Agent Host or Copilot CLI chat can be exported with its sub-agents nested inline (see "Agent chat export policy" below); usage and credits are exported for agent chats; full fidelity/artifact policy integration remains pending. Existing renderer behavior described below remains the baseline until each surface is wired and tested. Do not claim that fidelity flags or SDK export are available merely because backing identities can be verified.

| Contract | Approved behavior |
| --- | --- |
| Sources and scope | Local journal and SDK event formats have independent versions/identities. Keep workspace occurrences separate and verify SDK main/child bindings with persisted evidence. Unknown/unreadable/index-only rows remain explicit, not empty. |
| Substantive text | In both modes, retain full recorded prompts, answers and readable reasoning. Tool text up to 10 lines is inline, longer text is collapsed, and text over 300 lines AND over 15 KiB (`COMPANION_MIN_LINES`, `COMPANION_MIN_BYTES`) is previewed by 10 lines and linked to complete companion text. Many short file views stay inline; a few very wide lines also stay inline. A terminating CR/LF/CRLF ends a line without creating another empty line. |
| Extra fields | `--high-fidelity` preserves extra fields as collapsed JSON; over the same 300-line and 15 KiB threshold uses a 10-line preview and complete JSON companion. Default mode reports omissions with a linked introductory notice and end paragraph/table. |
| Redaction | Default redaction covers every textual artifact with category/count/location accounting. `--no-redact` disables it everywhere. Diagnostics never reveal secret values; regex detection does not guarantee comprehensive protection. |
| Images and opaque data | Preserve all available original images in both modes without an exporter size cap or resizing; text redaction does not sanitize images. Other binary/encrypted/opaque payloads are metadata-only with exclusion reasons. Do not fetch remote originals or infer decrypted reasoning. |
| Planned artifacts | `PlannedArchive` contains Markdown, pending `CompanionArtifact` byte payloads, diagnostics and policy. Render-only callers receive a plan, not proof of persistence. A later writer must ensure relative links target saved files before reporting success. |
| Companions and collisions | One timestamped sibling assets folder per archive, created only if needed. Existing explicit Markdown/HTML files require `--overwrite`; assets folders never overwrite. Keep archive and assets together. |
| Staged writer | Save/verify companion bytes and staged Markdown before publication. Exclusive ordinary publication must not overwrite a concurrent destination. `--overwrite` uses replacement without first deleting the old Markdown. If replacement fails, keep the old archive unchanged and clean only attempt-owned artifacts. Filesystem restrictions fail explicitly, with no weaker fallback. This is not an atomic multi-file/power-loss guarantee. |
| Root resolution API | Explicit valid root wins without prompting; single discovered root auto-selects; multiple roots require a host chooser or explicit error with candidates. Missing candidates skip; other read errors surface. |
| Agent Host identity | Exact central `session_chats.provider_data` takes precedence; otherwise exact chat/default legacy metadata. Default-only provider-ID fallback requires an existing local session database and matching SDK header, with console warning and retained Markdown notice data. Never fall back from corrupt metadata or guess a peer. |
| SDK scope | One version 1 header, matching backing ID, stable strict UTF-8 read and preserved raw records. Child tool/agent mapping must be unique. Ambiguous children remain unresolved with `🟠 ❓` UI indicators; an independently verified main remains usable with warnings. Missing/cyclic parent evidence omits the relationship, never invents one. |

- Script: `tools/copilot-chat-exporter/src/cli.ts`
- npm entry: `npm run ai:export:chat`
- Run prompt (invoke the exporter): `.github/prompts/export-chat.prompt.md`
- Run skill (agent parity): `tools/copilot-chat-exporter/skill/SKILL.md`, surfaced to this repo through `.github/skills/export-chat/SKILL.md`
- Build prompt (recreate the exporter from this spec): `tools/copilot-chat-exporter/docs/BUILD-PROMPT.md`
- Reference output: `docs/chat-exports/reference-live-session-export.md`, regenerated from the frozen live-session fixture with `npm run ai:export:chat:reference`

### Listing report module boundary

Inventory grouping and selector rules are shared by [listing-model.ts](../src/session/listing-model.ts). [console-listing.ts](../src/session/console-listing.ts) owns terminal presentation, [basic-listing.ts](../src/session/basic-listing.ts) owns basic offline HTML, and [listing.ts](../src/session/listing.ts) preserves existing renderer imports. [listing-preview.ts](../src/session/listing-preview.ts) owns local date formatting and the planned detailed turn preview: up to 70 whitespace-delimited words remain complete; longer prompts display the first 50 and last 20 separated by `. . . . .`. Turn dates omit the two-digit year only when creation and turn timestamps have the same known local year.

`--detailed` is listing-only and selects detailed HTML instead of basic HTML, with unchanged compact console output. With `--detailed --no-html`, HTML is suppressed and console listing retained, accompanied by an explicit warning about the conflicting flags rather than a fatal usage error. Explicit `--html-output` and overwrite safety are shared; default detailed names are distinct from basic names.

`--compression gzip|brotli` is an opt-in encoding for detailed HTML only: it requires `--detailed`, is listing-only and rejects `--no-html`. `--compressed` remains an alias for gzip; combining it with Brotli is rejected, while combining it with explicit gzip is allowed. Unknown codecs and duplicate value options fail explicitly; no automatic selection is performed. The filename and overwrite rules are unchanged. [compressed-listing.ts](../src/session/compressed-listing.ts) packages the conventional renderer output, preserving the complete Session TOC and all preceding overview sections as static HTML (plus the filter controls). Everything from the grouped-card section through the footer is one embedded base64 payload. There is no iframe, network request, alternate evidence renderer, lazy-card model or batching protocol. The library exports `compressDetailedListingHtml(html, codec = 'gzip')` and the `ReportCompression` type for conventional detailed HTML produced by the matching renderer version.

The shared loader waits for first contentful paint when Paint Timing is available, otherwise two animation frames and a timer, before decoding in the same document. Gzip uses level 9 and completely consumes native gzip decoding, including CRC32/ISIZE validation. Brotli uses quality 8/window 24 and an embedded build-only `brotli-dec-wasm@2.3.2` decoder with its MIT license and upstream notices. Its streaming API requires a successful final result, complete input consumption and matching decoded length; truncated streams, trailing bytes and output exceeding the declared length fail. A separate embedded CRC32 of decoded evidence detects accidental same-length corruption because Brotli has no gzip-equivalent checksum. Both codecs validate the expected byte count and strictly decode UTF-8 before inserting evidence. Checksums are not authentication. SHA-256/Web Crypto is not a runtime requirement. A CSP hash authorizes the combined loader/controller; only Brotli adds `wasm-unsafe-eval`, never general JavaScript `unsafe-eval`. No runtime npm dependency is added.

Compressed output adds a deterministic CSP nonce to `script-src` and every inline script, retaining loader/controller hashes. Its exact derivation is base64 SHA-256 of `compressed-listing-v1\0`, codec, NUL, complete conventional HTML, NUL and executable loader. This binds both shell/evidence and code while preserving byte-reproducibility for identical input, codec and toolchain. It is predictable and must not be reused as an unpredictable security nonce for a web application; its purpose here is re-save resilience, not authenticity or protection against an attacker who can edit the report. Executable loader/decoder scripts are ASCII-only minified single lines; shell text uses numeric HTML entities and style raw text uses CSS Unicode escapes. Payload and WASM base64 decoding explicitly ignores whitespace in both native and fallback paths. Format-only CRLF conversion, trailing-whitespace trimming, Windows-1252 re-saving and base64 wrapping must preserve content and load without CSP violations.

Generation and decoding first reject the case-insensitive literal pattern `<script[\s/>]`. Rendered prompt text is escaped (`&lt;script&gt;`), so this does not reject literal script examples. Before live insertion, decoding also parses the HTML into an inert `template`, traverses all elements and nested template contents, and rejects any element with local name `script` or attribute with local name starting `on` (case-insensitive). URL attributes (`href`, `src`, `action`, `formaction`, `poster`, `background`, `data`, `cite`, `longdesc`, `usemap`, `profile`, `codebase`, `manifest`, including namespaced `href`) must not start with `javascript:` after removing U+0000-U+0020 and U+007F-U+009F. Browser parsing decodes character references before validation. Non-URL text such as `title` and `data-copy` is not treated as a URL. The temporary content is cleared, then the original validated HTML is assigned to the target's `innerHTML`. Invalid payloads show the error state without inserting cards. These targeted checks do not constitute a general-purpose sanitizer for arbitrary untrusted HTML.

When explicitly selected Brotli produces a larger full HTML file than gzip, the CLI calculates and warns with both byte counts and suggests gzip without changing the selection. Library calls do not print warnings. `verify:generated` regenerates in memory, checks the exact decoder version and pinned WASM SHA-256, and fails on stale/modified embedded assets without rewriting them. `verify` runs this check before typechecks and tests; build regeneration is not a substitute for verification.

While loading, native shell disclosures work; inputs retain their latest values, project/attention/chip actions update pending filters, and hash links are applied after initialization. Sort, view, density and removal of the newest-25 limit are retained. Link navigation keeps its existing precedence: revealing a hash target resets filters. On decode or initialization failure, a visible alert explains regeneration without `--compressed` and disables enhancement controls. With JS disabled, only the static shell is readable; a `noscript` notice explicitly states that detailed evidence needs JS. The default conventional output retains its complete no-JS reading contract. Browser Find over cards, copying, comparison and print of detailed evidence are available only after readiness.

Detailed Why/source separates health/audit notes, factual workspace-reference bases, recorded identity routes, scoped/whole-storage measurements and a collapsed unified evidence table with per-reference technical identity. Field/value/reference tuples must retain differences between encoded child IDs, title/date provenance and derived references with no own index entry. No primary/copy ownership is inferred. Potential removal impact is qualified, not a deletion instruction.

Storage collection is detailed-only, cached by artifact path and read-only. SQLite stored values are measured with `length(CAST(value AS BLOB))`; page/free-page counts and logical value bytes are distinct from physical main-file length. JSONL categories count original bytes including line separators, not reserialized JSON. Directory lengths count regular files without following links. Changes detected during file/WAL analysis invalidate composition and produce diagnostics; live directory enumeration is not atomic. Shared artifacts and scoped bytes must not be presented as additional copies or reclaimable space. Exact byte counts are regular small Arial Narrow; abbreviated sizes are bold normal-font.

### Detailed evidence and presentation contract

`collectListingEvidence(occurrences)` returns typed evidence keyed by exact occurrence ID. It reads native storage without writing it, rechecks SHA-256 and stable file stats, validates child scope against recorded tool/agent bindings, and reports changed/unavailable/optional unreadable records explicitly. It never changes backing verification, visibility, grouping or export selection. `formatDetailedSessionListingHtml(occurrences, evidence, options, generatedAt)` renders the supplied snapshot without storage/network reads. These APIs are exported by the library.

| Evidence / feature | Contract |
| --- | --- |
| Local prompts and titles | Reuse journal replay and parsed turn order; retain index titles, final replayed title/date fields and first-prompt-derived title with provenance. Never infer a title's authority from its text. |
| Models | Retain selected model separately from answering models in tool-call rounds/resolved metadata or exact-scope SDK assistant messages. Auto is selection mode. SDK effort/selection settings are sampled at prompt boundaries; answering intervals end at the next scoped prompt. No child answering models are attributed to main prompts. Raw IDs are not merged by display labels. |
| Child tasks | Read exact scoped child messages, label recorded delegated instructions and later follow-ups, or recover the task from the unique persisted parent tool call. Missing delegation text gets a flag; it is not synthesized from a title. Main injected/non-user SDK messages are excluded from human prompt text/counts. |
| Child headings / credits | Prefer a meaningful recorded title across verified workspace references, then the exact unique delegation description/name or scoped start display name. Fallback is `Subagent (parent title)`; no identity/grouping changes. |
| Credits / tokens | Local finite nonnegative numeric `copilotCredits` and nonnegative safe-integer `promptTokens`/`completionTokens` appear per turn and as counted-turn sums in the header and a credits/tokens disclosure after the titles when any counters are recorded. Credits and detailed token totals round up to whole units; the token chip shows `⬆️` prompt (input) and `⬇️` completion (output) counts with no prefix icon, `k`/`M` rounded to the nearest unit (`⬆️~15.4M ⬇️~730k`), and partial session metrics use a leading `~`. If no counter is available, omit usage chips from the header and turns, omit the disclosure, and show one `Usage unavailable` chip in its place in the expanded card, left-aligned in normal flow with any missing-model note. Coverage is independent for each metric; missing values are unknown, not zero. Group references never multiply a sum. SDK usage correlation is a separate follow-up (todo #20); child completion totals, model-call usage and cumulative quota checkpoints are not interchangeable per-turn counters. |
| Compact typography / icons | Font sizes are `rem` values on a single `html{font-size:125%}` root, so the whole report scales from the browser's default font size (about two zoom steps larger than a 14px page). Header, type/status/edit/model chips and titles use Arial Narrow with Arial fallback; TOC titles and model-switch links also use Arial Narrow; header created/updated dates are bold. Each answering-model list uses one chip, retaining raw model IDs in its tooltip. Missing answering-model evidence has no chip and is stated inside the expanded card. Compare/Link/TOC are small Arial Narrow controls at the top right of the expanded card, in the titles-heading row, and the TOC action uses 🔝. Buttons and filter chips have themed light-blue backgrounds (dark variants in dark mode). Created/updated icons have explicit labels/tooltips; the updated chip is omitted when it matches created to the minute. Chips say `MD`, not `Markdown`. The `N w/s refs · 1 conv` chip is bold magenta text and border. Tentative fork/copy hints use `⑂?` in the amber hint tone; editing history, no-response evidence, cancellation and children use distinct labelled icons, with `↳` for children/subagents and 🌿 for recorded forks. Symbol glyphs use a symbol font. Singular/plural labels are exact. The summary charts use status/type colors matching the cards and the same display labels. A per-turn `Selected` model chip appears only when it differs from the answering model. |
| Unknown values | Value slots show question marks instead of the word unknown, with the reason in the `title`: `?` a minor detail was not recorded (detail grids and tables), `??` a headline value (turn count, created/updated date, workspace, first/last prompt) could not be established from a read source, `???` the same headline value when the source could not be read or verified at all (unresolved, unsupported or changed backing). Unknown is never zero. Prose explanations and filter controls keep the word. |
| Field lines | A section with nothing or one line to show is rendered as `icon label: value` with the same icon and bold label as expandable sections, not as a disclosure: audit flags/diagnostics (`none`), family (`none recorded`), model-switch timeline with at most one entry, a single prompt timestamp, and the export selector with its copy buttons (the command is in the tooltip). Audit flags and diagnostics are counted together when expandable. |
| Edits | Reuse patch parsing; count create/replace/multi-replace text, with bounded LCS and explicit estimates beyond the bound. Deduplicate available tool-call IDs. Prefer tool evidence per file; fall back to labelled text-edit markers for uncovered files. Normalize Windows path/serialized URI identities without lowercasing case-sensitive POSIX paths. Missing arguments/counts remain partial/unknown; deletion without saved removed text has an unknown removed-line count. |
| Editing history | Read supported `chatEditingSessions/<id>/state.json` timeline operations and count distinct matching request IDs only. Distinguish recorded, supported empty, missing and unreadable/unsupported states. Do not reconstruct pruned history or read current source files. |
| Titles / dates / context | Retain source-labelled index/journal/request/SDK metadata and workspace scalar evidence, prompt timestamps and whole-backing filesystem dates. These dates are distinct; filesystem birthtime is not promoted to chat creation. Read simple supported `workspace.yaml` scalar fields with duplicate/identity diagnostics, not an unrestricted YAML implementation. |
| Bytes / artifacts | Local journal bytes, five checked artifact-location states and individual resource-file stats remain distinct. The Local audited payload includes present journal/editing/transcript/debug/resource locations once per occurrence; it is not additional to journal bytes or unique global disk usage. Unreadable trees or links make the audited total unknown. SDK bytes count exact scope's original UTF-8 record text without line separators. Artifacts are not opened as transcript content. |
| Outcomes | Local recorded request errors/cancellations are separate. SDK indicators count recognized session-error/abort events, not every tool failure or unknown outcome variant. Response-presence evidence is distinguished from backing verification. |
| Relationships | Persisted inventory parents, distinct same-host peers and metadata forks are navigable. Missing/non-unique targets are explicit. BEST-EFFORT copy/fork hints require actual prompt evidence; tied nearest fork sources and redacted prompt candidates are excluded. Hints never group or select content. |
| Browser behavior | Cached, case-insensitive substring search with AND across whitespace-separated words: titles/identifiers, complete prompts (including collapsed text), models/effort, changed files, artifacts, scoped workspace/source/context values and diagnostics. Generic headings, controls, static disclaimers and unrelated relationship labels are excluded. Grouped search combines its recorded references; occurrence search shares conversation prompts but only uses that reference's workspace/source evidence. `data-search` is supplemental-only (for example exact model IDs behind friendly names); short `data-conversation`/`data-reference` and `data-search-refs` associate rows and evidence, independently of optional search attributes. All-active-chip matching, model/type/backing/date/numeric known/unknown filters, unknown-last sorting, grouped/occurrence views, reset/target reveal, compact/comprehensive mode and at most two pinned summaries remain. Family navigation opens ancestor disclosures and reveals ignored/limited targets without altering identity. |
| Tooltip redundancy | Omit generated tooltips whose normalized complete text equals the displayed label/value. Preserve additional explanations, uncertainty reasons, exact identifiers behind friendly labels, full paths behind abbreviated values and accessible names. This is a deterministic content rule, not a browser clipping detector. |
| Compact presentation | Native collapsed type-colored cards have a title/tag line plus two metadata lines. Title variants immediately follow the header when opened; equal title values share source labels. Prompt/request dates collapse separately from other date evidence. Complete short prompts have no redundant full-text disclosure, including prompts that differ only by whitespace; derived/clipped previews retain full text. The TOC includes all groups, abbreviated as `N turns · N refs`; `--show-ignored` renders each complete card only once. Artifact locations are collapsed by default. Bytes use comma-separated counts and binary-scaled MB. |
| Rich metrics | Detailed headers/TOC/occurrence rows, initial ordering/newest-25 selection and browser filters/sorting share recorded turn/task-entry counts and first/last valid exact-scope SDK event timestamps. Incomplete prompt evidence has an unknown total. Filesystem timestamps never replace these SDK dates. Console inventory policy stays unchanged and its narrower prompt count is separately labelled in comparison summaries. |
| Offline safety | Escape recorded text/attributes; keep conversation data outside executable script. Hash-authorize the static controller with CSP, disallow network content and retain native disclosure/no-JavaScript readability. Clipboard failure is explicitly reported and does not pretend success. |
| Redaction / limits | Apply existing best-effort text redaction before new prompt/title rendering and similarity hints. Full preview text remains redacted. This is not complete sanitization or full semantic fidelity; private reports must stay private. |

SDK main-chat overviews may omit recognized context/reminder wrappers as a labelled derived presentation. Full redacted recorded prompts remain in disclosures and the DOM-backed search cache, not duplicated search attributes; delegated child task text is not stripped this way. Child model/effort selection is labelled as inherited session setting, not a claim that the child chose that model or effort. Scope-wide recorded SDK answering-model/response evidence remains available even when there are no counted human prompts.

## 1. Goal

Produce ONE Markdown file that a human can read top-to-bottom or navigate like a tree:
metadata -> cost -> summaries -> per-turn transcript with reasoning, tool calls, code, and cost.
Layout and formatting are first-class requirements, not cosmetic. Fidelity to the visual design
system below is part of "correct output."

Design priorities, in order:

1. Faithful to what actually happened (exact chat order, real values, no fabrication).
2. Human-readable and scannable (collapsible detail, emoji signposts, deep links).
3. Renders well in the VS Code Markdown preview first, GitHub second (inline styles degrade
   gracefully - GitHub strips them but still shows text/markdown).

## 2. Data sources (single-source-of-truth model)

The native chat journal is definitive. Everything else only enriches it.

| Source | Path (under the workspace-storage hash root) | Provides |
|---|---|---|
| Chat journal (DEFINITIVE) | `chatSessions/<sessionId>.jsonl` | prompts, reasoning, tool calls, assistant text, edits, per-turn scalars (tokens, credits, timing, model), **terminal output** |
| Raw tool outputs | `GitHub.copilot-chat/chat-session-resources/<sessionId>/call_*` or `toolu_*` | large tool-output bodies (`content.txt`), correlated by `toolCallId`. VS Code rotates/clears this store, so treat it as a bonus, not a dependency |
| Tool arguments (optional) | `GitHub.copilot-chat/transcripts/<sessionId>.jsonl` | `session.start`, `user.message`, `assistant.message`, `tool.execution_start` (toolCallId, toolName, **arguments**), `tool.execution_complete` (toolCallId, success). Supplies V4A `apply_patch` bodies when retained. NOT the same schema as the journal and holds NO output bodies |
| Model catalog | `GitHub.copilot-chat/debug-logs/<sessionId>/models.json` | model id -> friendly name (e.g. `claude-opus-4.8` -> "Claude Opus 4.8") |
| On-disk memory | `memory-tool/memories/<base64(sessionId)>/` and `repo/`, user scope | session/repo/user memory + plan files |
| Versions | product/version metadata for Copilot + VS Code | metadata block |

Storage root on Windows: `%APPDATA%/Code/User/workspaceStorage/<hash>/`.

### 2.1 Journal format (`chatSessions/<id>.jsonl`)

A delta journal, one JSON record per line:

- `kind:0` `{ v: {...} }` - full snapshot (usually the first line). `v.requests[]` holds the turns.
- `kind:1` `{ k: [path...], v }` - SET value at path `k`.
- `kind:2` `{ k: [path...], v?, i? }` - truncate the target array to length `i` when present,
  then append values from `v` when present. Without `i`, this is an ordinary append.
- `kind:3` `{ k: [path...] }` - DELETE the property at path `k`.

Turn (request) fields used: `requestId`, `message` (prompt), `response[]` (stream),
`timestamp`, `modelId`, `promptTokens`, `completionTokens`, `copilotCredits`, `elapsedMs`,
`promptTokenDetails` (category/label/percentage breakdown; older data may contain cache fields), `responseId`, `responseTimestamp`, `followups`,
`contentReferences`, `codeCitations`, `agent`, `modeInfo`, `isCanceled`.

`response[]` item kinds: `thinking` (reasoning), `toolInvocationSerialized` (tool call),
`textEditGroup` (file edit), `inlineReference`, and plain `{ value: "text" }` assistant text.

### 2.2 Critical parsing rules (do not regress these)

- **Recursive flattening.** Delta payloads and `response[]` items are frequently nested arrays or
  numeric-keyed splice objects like `{"0":..,"1":..}`. Flatten recursively before classifying
  (`flattenItems` / `spliceValues`). Skipping this drops the majority of tool calls (regression seen:
  72 vs 400+ tool calls).
- **Deep reasoning walk.** Reasoning can be nested below the node level; walk deeply
  (`collectThinking`) and de-duplicate. Also collapse prefix-duplicate thoughts
  (`collapsePrefixes`) so streamed partials do not repeat.
- **Index attribution.** Attribute nodes/scalars by request index, then map index -> `requestId`.
- **Chat-order preservation.** Keep `response[]` order so text, tools, and edits interleave exactly
  as they happened. Do NOT bucket all tools to the end of a turn.
- **Deduplicate tool calls by `toolCallId`.** The journal re-emits the same invocation as it
  progresses (queued -> running -> complete with output); a single call can appear up to 4 times and
  a later copy can land 150+ stream positions away, i.e. in a different turn. Keep the **first**
  occurrence (that is the chat display order) and **merge** later field updates into it
  (`pastTenseMessage`, `generatedTitle`, `isComplete`, `toolSpecificData`, terminal output, exit
  code, duration, `resultDetails`). Appending every occurrence both duplicates entries and scrambles
  the visible sequence.

## 3. Document layout (section order is part of the contract)

Top-to-bottom. Each `##` section ends with a right-aligned "Back to Contents" link.

1. `<a id="top"></a>` + `# Copilot Chat Export: <title>` + one-line intro blockquote.
2. `## Session Metadata` - bullet list: Session ID, Title, Session started, Export covers through,
   Export generated, Copilot version, VS Code version, Responder, User requests, Assistant reasoning
   turns, Tool calls, Persisted result resources, Models used, and a **Total cost** line
   (`⏱️ <elapsed> · 🔢 <completion> completion tokens · 💳 <credits> credits · 🤖 <n> model(s)`).
3. `<a id="contents"></a> ## Contents` - numbered links to the 9 sections below.
4. `## User Questions and Requests` - numbered list, one line per turn:
   `N. 🔷 [Q<N>: <clipped prompt, brackets escaped>](#user-message-N) - YYYY-MM-DD`.
5. `## Cost and Timing Summary` - table `Model | Turns | Prompt tokens | Completion tokens | Credits |
   Elapsed`, right-aligned numerics, a **Total** row, and a note that prompt tokens are per-request
   context sizes (not additive), while completion tokens and credits are the per-turn increment.
6. `## Executive Summary` - 2 short paragraphs (what/when + tool/reasoning/model/cost totals).
7. `## Important Outputs` - "Recorded Resources" list + "Recorded Output Limitation" `> [!NOTE]`.
8. `## Files Modified` - Files Edited in This Session; Chat Export Artifact (output path);
   Current Worktree Snapshot (`git status --short` in a ```text fence).
9. `## Tool Usage` - table `Tool | Calls | Persisted outputs`, sorted by tool name.
10. `## Conversation Transcript` - `> [!TIP]` visual-guide legend, then one block per turn (section 4 below).
11. `## Memory and Plan Artifacts` - on-disk memory/plan files, each as a bordered Markdown box
    inside a `<details>`.
12. `## Export Provenance` - source-journal path, resource root, single-source statement, redaction
    note, rendering note (inline styles preview-only).

## 4. Per-turn transcript block (the heart of the layout)

For each turn, in order:

1. `---` separator.
2. `<a id="user-message-N"></a>` anchor.
3. Styled header (HTML so the badge/timestamp render in preview):
   `<h3>🔷 Request N&nbsp; <span style="{PROMPT_BADGE}">{clipped prompt}</span>
   <span style="{MUTED}">{YY-MM-DD HH:MM}</span></h3>`
   - `PROMPT_BADGE` = `background:#1f6feb;color:#fff;padding:2px 8px;border-radius:4px;font-weight:600` (blue pill).
   - `MUTED` = `float:right;color:#8b949e;font-weight:400` (right-aligned grey timestamp).
4. `> [!NOTE]` callout containing **USER QUESTION / REQUEST** and the full verbatim prompt.
5. Reasoning is **not** hoisted into a single per-turn block. Each run of `thinking` nodes is emitted
   at its recorded stream position as `<details class="agent-reasoning"><summary>🧠 Agent reasoning
   (N thought(s))</summary>` with one `💡` per thought, grey and indented (`margin-top:8px` so the
   text never touches the summary line above it). Multiple thoughts in one block are joined with
   `<br>`, not blank lines - each still starts on its own line, but a multi-thought turn does not
   accumulate a full paragraph gap between every thought. This matches the chat, where thoughts
   appear between tool calls.
6. `#### 💬 Assistant Response` - walk the ordered turn body and **interleave**:
   - Assistant text/inline refs accumulate into a run and flush as live Markdown inside an
     `ASSISTANT_BOX` accent block (section 6.0) before the next tool/edit.
   - Tool call rendering (section 5).
   - File edit marker: `> 📄 Edited \`<relative path>\``. Strip the bare ``` fences VS Code wraps
     around edit previews (a trailing fence on the run before the edit, a leading fence on the run
     after) so the edit note does not render inside an empty code box.
  - After the body: a `**📄 Files touched (n):**` digest with operation icon, output-relative file link, and transcript-backed `+added` / `-deleted` operation counts. Each recorded patch is available in a collapsible, redacted `~~~diff` block. If patch evidence is absent, show `change details unavailable`; never substitute the current file's total line count.
     and a `🗒️ Todo list at this turn (n)` collapsible when present.
   - If no assistant text was recorded: `_No assistant text was recorded for this turn._`.
7. `<details><summary>ℹ️ Turn info</summary>` - table of Model, Mode, Agent, Response ID, prompt/
   completion tokens, prompt detail categories or legacy cache fields, Credits, Elapsed, Sources,
   Code citations, Followups, Requested, Responded, Canceled.
8. Cost footer: `<sub>⏱️ <elapsed> · 🔢 <prompt> prompt + <completion> completion (=<total>) ·
   💳 <credits> credits · 🤖 <model name></sub>`.
9. Right-aligned "Back to questions" link.

## 5. Tool call rendering rules

- **Header/summary.** `🛠️ <code><toolFriendly(toolId)></code>: <summary>`, wrapped in the muted
  treatment of section 6.0. Summary = the terminal command or the tool's past-tense/invocation
  message, run through `renderToolText()` (section 6.0a): a `[label](file:///...)` link becomes a
  real clickable relative link when the target is inside the workspace, or a colored (`FILE_LINK_COLOR`)
  but non-clickable span when it is not; a `` `backtick span` `` (a search tool's regex/glob) gets the
  same `COMMAND_CODE` styling as a terminal command. Falls back to the friendly tool id when there is
  no message at all.
- **Summaries wrap, they do not truncate.** A long summary flows onto the next line. Only a
  pathological one-liner is cut, at `MAX_SUMMARY_CHARS` (1000), because a multi-KB generated command
  would bury the rows around it. For terminal tools the untruncated command is always available in
  the `**Command:**` fence inside the collapsible, so the cap never loses information.
- **Status icons mark exceptions only.** A completed call carries no icon - the absence of a warning
  is the success signal. `⏳` marks a call still running; `⚠️` marks a non-zero terminal exit. Emoji
  cannot be muted by CSS, so a per-row ✅ would out-shout the assistant prose beside it.
- **No expandable content = plain line, no arrow.** If a tool has no terminal command, no persisted
  output resource, and no extra `toolSpecificData` details, render a single list line:
  `- 🛠️ <code>readFile</code>: Read <file>`. Do NOT emit an empty `<details>` whose only body is
  "Output: not persisted...".
- **Expandable tools** use `<details>` and may contain, in order:
  - `**Command:**` + fenced command (terminal tools).
  - `📝 Subagent prompt` collapsible from `toolSpecificData.prompt` (the instructions given to the
    subagent), rendered as a plain text fence directly under the tool header - the readable
    counterpart to `**Command:**` for a call that delegates instead of executing.
  - `⌨️ Tool input` before any output. Submitted source from `resultDetails.input` uses the recorded
    `resultDetails.inputLanguage` as its fence language. Generic `toolSpecificData.rawInput` uses a
    JSON fence and is removed from the later details block to avoid duplication. Terminal
    `resultDetails.input` is also suppressed because the dedicated `Command` block already shows it.
  - `📟 Terminal output (exit N · <duration> · N lines)` collapsible with the captured output in a
    ```text fence. Source: `toolSpecificData.terminalCommandOutput.text`, with status from
    `toolSpecificData.terminalCommandState` (`exitCode`, `duration`). Strip ANSI/VT escape sequences
    (SGR colors, cursor moves, OSC title writes), normalize CRLF, and drop the leading fragment of
    the shell's own command echo. Over 300 lines and 15 KiB, show the first 10 lines and link a companion file with the full text (nothing is clipped). Badge ⚠️ on
    a non-zero exit, nothing on exit 0.
  - `📦 Tool result` collapsible from `resultDetails.output[]` entries where `isText` is true (MCP
    tools and some terminal calls carry the model-facing result here). A subagent call has no
    `resultDetails.output`; its report is the plain string `toolSpecificData.result`, so it is routed
    into this same slot instead of being left to the generic JSON dump below.
  - `📦 Tool result details` JSON collapsible for the unconsumed remainder of `resultDetails`.
    This preserves URI/location arrays, binary or non-text embeds, references, `isError: true`,
    MCP metadata, serialized `{type: 'data', mimeType, base64Data}` output, malformed values, and
    future fields. Input and text output already rendered above are removed to avoid duplication.
    Apply normal redaction and the same 300-line and 15 KiB companion rule.
  - `**Persisted output:**` line plus one `📦 Output body` collapsible per persisted resource.
  - `Tool details` collapsible with pretty-printed `toolSpecificData` JSON for non-terminal,
    non-todoList tools. For a `subagent` call this JSON has `prompt` and `result` removed - they
    already render above as readable text, so keeping them here too would show the same content
    twice, once legible and once as an escaped one-line JSON string.
  - Only when none of the above exist, `**Output:** not persisted as a separate resource (returned
    inline).`
- Insert a small explicit spacer between an expandable tool's summary and its body so nested input
  or output sections do not visually collide with the tool title in VS Code's Markdown renderer.
- Todo-list tools are summarized once per turn as the `🗒️ Todo list` digest, not as raw JSON.
- `toolId` is open-ended. Any `toolInvocationSerialized` item is rendered as a tool call regardless
  of whether its built-in, extension, MCP, user, external, or agent-host tool name has been seen
  before. Specialized presentation is selected by payload shape, not by a closed tool-name list.

## 6. Formatting and visual design system

### 6.0 Reading hierarchy: answer loud, machinery quiet

The export must reproduce the *weighting* of the live chat window, not just its content. In the chat,
assistant prose is full-size and full-contrast while tool rows are small and grey, so a reader skims
the narrative and dives into the machinery only on demand. An export that renders both at equal
weight forces the reader to parse every row to find the answer.

Two mechanisms, chosen so the hierarchy survives both renderers:

| Element | Treatment | Constant |
|---|---|---|
| Assistant prose run | left accent bar + `font-size:1.06em` + breathing margin | `ASSISTANT_BOX` |
| Every meta summary (tool call, terminal output, tool result, output body, tool details, reasoning, todos, turn info, copy source) | wrapped in `<sub>` **and** a grey span | `MUTED_SUMMARY` via `mutedSummary()` |
| The `<code>` tool-name badge inside a summary | golden-brown, transparent background, set **on the element** | `MUTED_CODE` (`#d0b682`) |
| A terminal command, or a search tool's regex/glob backtick span | small monospace with a cool tint - "this text is the machine-facing part" | `COMMAND_CODE` (`#928363`) |
| A filename inside a tool summary that resolves to a workspace file | real `[label](relative/path)` markdown link, no extra color needed - the link itself is the affordance | n/a - see 6.0a |
| A filename inside a tool summary that does **not** resolve to a workspace file (AppData/workspaceStorage internals) | colored but inert span, so it still reads as "this is a filename" | `FILE_LINK_COLOR` (`#c8937c`) |

> [!IMPORTANT]
> GitHub strips inline `style` but preserves `<sub>`. That split is deliberate: in the VS Code preview
> the reader gets colour plus size, and on GitHub the size difference alone still separates answer
> from machinery. A colour-only approach would render as a flat, undifferentiated wall on GitHub.

> [!WARNING]
> Muting a `<code>` badge by setting colour on an ancestor **does not work**. The preview stylesheet
> sets `code { color: var(--vscode-textPreformat-foreground) }` explicitly, and an explicit rule on
> the element beats an inherited value from a parent. The badge must be styled directly or it stays
> bright orange inside a wrapper that claims to mute it. Emoji are immune to CSS colour entirely -
> the only way to quiet one is to not emit it (hence the icon policy in section 5).

`ASSISTANT_BOX` deliberately sets **no `color`**. A hardcoded foreground colour looks wrong in
whichever preview theme the reader is not using; contrast comes from the muted surroundings instead.

### 6.0a File links and command styling inside a tool summary (`renderToolText`)

A tool's past-tense/invocation message is not shown verbatim - it is run through `renderToolText()`,
a small tokenizer that finds two things and swaps them for styled markup while leaving everything
else as plain escaped text:

1. `[label](file:///...)` - a file reference (often with an empty `label`, e.g. `[](file:///...)`).
   The URI is decoded, any `?query` or `#fragment` suffix is stripped, and the result is resolved
   with `workspacePath()`:
   - **Inside the workspace** -> a real `[display](relative/path)` markdown link (clickable in both
     the VS Code preview and GitHub).
   - **Outside the workspace** (e.g. an AppData/workspaceStorage internal path) -> a
     `<span style="color:${FILE_LINK_COLOR}">display</span>` - still visually called out as a
     filename, just not clickable, since a link to it would not resolve for a reader.
   - `display` prefers the link's own label (e.g. `jimu-framework-apis`) and falls back to
     `path.basename()` of the decoded path.
2. `` `backtick span` `` - typically a search tool's regex or glob (`Searched for regex `X` (`Y`),
   N results`). Rendered as `<code style="${COMMAND_CODE}">` - the same treatment a terminal command
   gets, since both are "the machine-facing part of the summary."

**Why a placeholder pass, not a single regex-and-escape:** the function first replaces every match
with a `\u0000<index>\u0000` marker, HTML-escapes the *whole remaining string* with `esc()` (so plain
prose around the matches is safe even if it contains stray `<`/`>`/`&`), then substitutes the markers
back with the pre-built (already-escaped-internally) replacement HTML. Escaping before generating the
markup would double-escape the tags; escaping only the matched fragments would leave the surrounding
prose unescaped. The marker round-trip is what makes both safe at once.

**Length cap happens before styling, not after.** `MAX_SUMMARY_CHARS` (see section 5) is measured
against the *plain* text (`stripMarkdown()` output), and only when it fits does the raw text get
passed to `renderToolText()`. Clipping the markup-laden HTML directly would risk cutting a summary
off mid-tag; clipping the plain text first and skipping styling entirely for the rare pathological
case is always safe, if slightly less pretty.

**Line-range fragments are intentionally dropped, not turned into anchors.** A file link's `#1-1`
style suffix is VS Code's own internal anchor, not a dependable "start-end" line range - it has been
observed reading `#1-1` on a link whose accompanying text says "lines 1 to 420". Building a
`#L<start>-L<end>` anchor from it would show a confidently wrong range, which is worse than no range
at all. The fragment is stripped before both the link target and the basename fallback are computed.

> [!NOTE]
> A session used to **build or debug this exporter** can end up searching a prior export of itself
> (e.g. grepping the previous archive for `<code>` tags to verify an earlier fix). When that happens,
> the raw regex/summary text legitimately contains literal HTML-looking substrings as *search-target
> data*, not as markup that leaked through. `esc()` still escapes it correctly - the row just reads
> oddly (a mix of styled and plain fragments, or visible `&lt;code&gt;` text) because VS Code's own
> message template only wraps *part* of a multi-clause regex in backticks. Confirmed by direct test:
> feeding the tokenizer nasty multi-span and raw-HTML inputs still produces balanced, fully-escaped
> output every time - this is a faithful render of an unusual input, not a tokenizer defect. Do not
> "fix" it by hiding or reformatting the literal text.

### 6.1 Emoji legend (stable meanings)

🔷 user request · 💬 assistant answer · 🧠 reasoning · 💡 thought · 🛠️ tool call · 📟 terminal output ·
📦 tool output/result · 📄 edited file · 📋 copy source · ℹ️ turn info · ⏱️ elapsed · 🔢 tokens ·
💳 credits · 🤖 model · 🗒️ todos · 🆕 created · ✏️ modified · ⬆️ back-to-nav.

Status icons are exception-only: `⏳` a call still running, `⚠️` a non-zero exit. A clean, completed
call carries no status icon (section 5).

### 6.2 Numbers, models, timestamps

- **Credits always 2 decimals** (`fmtCredits`, `.toFixed(2)`), everywhere they render.
- **Model names are friendly**, resolved via `models.json` (`modelName`); `auto` -> "Auto".
- **Token counts** use thousands separators.
- **Timestamps:** metadata uses ISO (`YYYY-MM-DD HH:MM:SSZ`); the turn header uses compact
  `YY-MM-DD HH:MM`; the TOC uses `YYYY-MM-DD`.

### 6.3 Safe fences

Use `fenceFor(content, lang)` for every embedded code/text block: it picks a backtick run longer
than any run inside the content, so embedded ``` never breaks the wrapper. This matters because the
archive can embed prior chat content that itself contains code fences.

### 6.3a Indented collapsible bodies (and the HTML-block rule)

Collapsible bodies are wrapped in `<div style="margin-left:...">` so content reads as a child of its
summary: `BODY_INDENT` (2em) for a tool/todo/turn-info body, `NESTED_INDENT` (1em) for blocks nested
inside one (terminal output, tool result, resource body, tool details). Stop at two levels - deeper
nesting squeezes wide code and terminal output. Agent reasoning uses the same 2em plus grey text.

> [!WARNING]
> A `<div>` must be followed by a **blank line**, and `</div>` preceded by one. Without them
> CommonMark treats the run as a raw HTML block and stops parsing Markdown until the next blank
> line, so fences, links and inline code render literally. This has bitten the export twice: a
> prompt rendered as a literal `> How do I...` with a visible `>`, and the first reasoning thought
> lost its inline code while later ones kept it. Never indent with leading spaces instead - 4+
> spaces would create an unintended code block.

### 6.4 Markdown artifacts: render only when safe

Embedded Markdown files (memory/plan files, persisted `*.md` outputs) are rendered **live inside a
bordered box only when they are safe to render**. Live rendering of arbitrary Markdown corrupts the
page: a `<Select>`/`<Option>` in a doc becomes a real dropdown, `<img>` fetches, and embedded
headings hijack the document outline.

Classify each artifact with a risk scan that ignores fenced regions (inside a fence content is
already inert) and flags:

| Risk | Why it breaks rendering |
|---|---|
| raw HTML/XML tag (`<[A-Za-z]...>`) | renders as live elements (dropdowns, inputs, layout) |
| HTML comments (`<!--`) | can swallow following content |
| ATX headings (`# ...`) | pollute the document outline / TOC navigation |
| anchors (`<a id=...>`) | duplicate ids collide with the export's own anchors |
| unclosed code fence | breaks the wrapper and everything after it |

- **No risks** -> bordered box (`✅ rendered`) plus a `📋 Copy source` collapsible.
- **Any risk** -> plain fenced ```markdown source (`⚠️ shown as source (<reasons>)`).

Either way prefix a `<sub>` stats line (`N lines · N bytes · mode`) and, where known, a
`- Source: <path>` line. Showing *why* it fell back keeps the output honest and debuggable.

Note the risk scan must ignore inline code spans when auditing output: `` `<script>` `` in prose is
literal text, not live HTML.

### 6.5 Bordered box (safe Markdown only)

`<div style="border:1px solid #d0d7de;border-radius:6px;padding:2px 16px;margin:8px 0"> ... </div>`.
The border shows in the VS Code preview; GitHub strips the style but still renders the Markdown.
Large resources (> `MAX_EMBEDDED_RESOURCE_BYTES`, 96 KiB) are still clipped to first+last 48 KiB in a fence, with the path of the full resource; moving them to companions is open (work log).

### 6.6 Copy affordances

Clipboard access requires JavaScript, which every Markdown renderer strips, so the export cannot
ship a scripted copy button. The **fenced code block is the copyable unit**: GitHub and the VS Code
Markdown preview both attach a native hover copy button to code fences. Therefore:

- Terminal commands and non-Markdown tool outputs already live in fences and are copyable for free.
- Content that renders live (bordered Markdown boxes, file lists) has no copy affordance, so it is
  **paired** with a `<details><summary>📋 Copy source</summary>` collapsible holding the same content
  inside a fence. The reader gets the pretty rendering by default and the raw, copyable text on demand.
- Per-turn file digests get `📋 Copy these paths`; the Files Modified section gets
  `📋 Copy all edited paths` (newline-separated, `text` fence, ready to paste).
- Copy blocks are skipped when the content exceeds `MAX_COPY_SOURCE_BYTES` (32 KiB) to avoid
  doubling the document size.
- 📋 is reserved for copy affordances in the legend, and the transcript carries a `> [!TIP]`
  explaining the convention.

### 6.7 Structural HTML neutralization (required for correctness)

Embedded content routinely quotes `<details>` / `<summary>` / `<div>` markup - memory and plan files
document it, assistant prose explains it, and reasoning notes discuss it. Rendered live, an unmatched
`<details>` opens a collapsible that never closes and **swallows the rest of the document**.

Escape these tags to `&lt;...` **outside fenced code** (inside a fence they are already inert, and
escaping there would corrupt the code display). Apply to: bordered Markdown box content, assistant
text runs, user prompt blockquotes, and recovered reasoning notes. Do NOT apply to the fenced copy
source - it must stay verbatim and copyable.

### 6.8 Navigation and safety

- Every `##` section and every turn provides a right-aligned back-to-nav link; sections use HTML
  `<a id="...">` anchors for deep linking.
- **Redaction** masks common `authorization: bearer`, api-key/token/password/client-secret
  assignment forms in all embedded text.
- Never fabricate content; render only what the local journals contain. Where data is missing, say
  so (e.g. "not persisted", "No assistant text was recorded").

## 7. CLI contract

HTML source details expand in a dedicated row spanning all seven table columns, not inside the status cell. Responsive cards separate conversation identity, workspace/project, and files/locations; each grouped occurrence retains its own cards and source issues. Session/detail row pairs move together when sorted and hide together when filtered. Buttons expose expanded state and panel identity; closing returns focus to the originating button. Main-table filtering does not alter ignored-table panels. Without JavaScript, native full-width `details` disclosures remain available.

HTML listing dates use the generator's local timezone in `YYMMDD_HH:MM` format, with smaller Arial Narrow dates/selectors and bold prompt counts. Date sorting uses numeric timestamps rather than displayed two-digit years. Row details include full session and occurrence IDs, backing IDs and JSONL links when verified, workspace storage hashes and path links, index provenance, diagnostics, and folder/workspace identities read from `workspace.json`. Workspace/project display labels are explicitly URI basenames, not reconstructed custom names; multi-root folder names remain unknown. Links to expected metadata/index locations do not imply file existence. A collapsed bottom section retains every ignored grouped session even without `--show-ignored` and regardless of `--last25`; `--show-ignored` additionally includes ignored rows in the main table and console. The main-table search/filter controls do not hide rows in that bottom section.

- `npm run ai:export:chat` - list occurrences from one resolved VS Code user-data root; never implicitly export.
- `npm run ai:export:chat -- --current [outputPath.md]` - explicitly request the Local session identified by `VSCODE_TARGET_SESSION_LOG`; validate its workspace/root/journal identity, with no fallback.
- `npm run ai:export:chat -- --user-data-root <path>` - explicitly select the root for listing or UUID/current selection. Multiple discovered roots require interactive selection or fail non-interactively with candidates.
- `npm run ai:export:chat -- <sessionId> [outputPath]` - a specific session by id.
- `npm run ai:export:chat -- <chatSessions/...jsonl> [outputPath]` - a specific journal file.
- `npm run ai:export:chat -- <source> [outputPath] --overwrite` - deliberately replace an existing Markdown archive after staged content is saved and verified. Without this flag, existing destinations are refused. Golden scratch output has a dedicated internal overwrite allowance so regression checking remains repeatable.
- `npm run ai:export:chat -- --list` - show grouped conversations with creation/activity dates, scoped prompt counts, chat type, selector ID/prefix, backing status and an `X of Y` summary. `/fix`, confirmed-empty, ambiguous, and exact `New Chat` + unknown-created-date + unknown-prompt-count entries are hidden by default; `--show-ignored` restores them and `--last25` limits output to the newest 25. Other unresolved/index-only entries remain visible. UUIDs are shown as copyable unique hexadecimal prefixes (at least 8 characters, no ellipsis); listing-only `--full-ids` prints complete IDs. A prefix selects a Local journal only when exactly one journal matches in the selected root; duplicate IDs across workspaces require an exact `.jsonl` path. `verified` means backing identity was checked, `unresolved` means no backing was verified, and `ambiguous` means identity/scope could not be safely resolved. A verified SDK backing does not by itself imply Markdown export support. By default, listing also creates a self-contained offline HTML report in the invoking directory; `--no-html` disables it, `--html-output <path>` chooses a destination, and `--overwrite` is required to replace an existing report. It is never opened automatically and stays readable without JavaScript. SDK Markdown rendering and complete sister-filter parity remain pending.
- `npm run ai:export:chat -- --verify <sessionId|chatSessions/...jsonl>` - run source-side machine verification (Layers A + B) without writing an export file.
- `npm run ai:export:chat -- --verify <sessionId> <outputFile>` - additionally run Layer C against an existing rendered file.
- `npm run ai:export:chat -- --audit ...` - alias for `--verify`.
- `npm run ai:export:chat -- --golden check` - diff the golden fixture's digest
  against the committed baseline.
- `npm run ai:export:chat -- --golden update` - recompute and overwrite the committed digest.
- `npm run ai:export:chat -- --snapshot update <sessionId>` - record a digest of one of your own
  sessions under `test/snapshots/` (gitignored). See 9.7.
- `npm run ai:export:chat -- --snapshot check <sessionId>` - recompute and diff against it.

Markdown is the only output format. `sessionToJson` in `src/index.ts` returns the parsed model as
data for a caller that wants it, but it is deliberately not exposed as a flag: it is untruncated,
so a long session runs to tens of MB, and no consumer has asked for it.

A normal export also runs a **driftless Layer C self-check** on the content it just rendered
(reported as `Layer C self-check: all N render checks pass.`), and exits non-zero if any render
check fails.

**Output path resolution when no path is given:**

1. Directory, first match wins: `--out-dir <path>`, then `chatExport.outDir` in the workspace's
   `package.json`, then `outDir` in `.chatexportrc.json`, then `docs/chat-exports/` when it already
   exists, and finally `.copilot-chat-history/`. All are resolved against the workspace root.
   The workspace root itself is never used, so exports cannot scatter through a consumer's project.
2. Filename: `YYMMDD_slug_<idPrefix>.md` - a UTC datestamp of the session's **first turn** (not the
   export), the session title slugified (spaces to dashes, `\ / : * ? " < > |` stripped so it is a
   valid Windows filename, collapsed dashes, capped at 80 chars), and the first 8 characters of the
   session id. Falls back to the first prompt, then `copilot-chat`, for an untitled session.
3. Collision: none by construction. The name identifies the session, so a repeat export refreshes
   that archive in place.

> [!IMPORTANT]
> Dating the conversation rather than the export is what makes the name stable: re-exporting a
> growing session keeps writing to the same file instead of spawning a copy per run. This matches
> the one-file-per-session convention used by the `.chat-history/` exporter in this repo.

Prints one summary line: `Turns: N; tool calls: N; reasoning thoughts: N; resources: N` and the
`Output:` path.

> [!WARNING]
> The source argument must be a **session id** or a **`chatSessions/<id>.jsonl`** path. Do NOT pass a
> `transcripts/<id>.jsonl` path - that is a different schema and yields 0 turns (it will silently
> overwrite a good output file with an almost-empty one).

## 8. Acceptance criteria - what must be captured

This section defines **completeness**: section 9 checks that the output is well-formed, this one
checks that nothing the chat recorded was silently lost.

The governing rule: **present-or-stated**. If the journal recorded an element, the export must show
it. If it did not, the export must say so in words. Silently omitting an element is a defect,
because a reader cannot tell "the agent did not do this" from "the exporter dropped it".

### 8.1 Per user turn (question)

Every turn must carry each element below whenever the journal holds it.

| # | Element | Journal source | Rendered as | When absent |
|---|---|---|---|---|
| A1 | User prompt, verbatim and complete | `message.text` / `message.parts[].text` | `> [!NOTE]` callout + prompt box. The `<h3>` badge holds a clipped copy for scanning **only** - it never replaces the full text | never absent |
| A2 | Agent thinking | `response[].kind === 'thinking'` | `🧠 Agent reasoning (N thought(s))` collapsible **at its stream position**, one `💡` per thought, prefix-duplicates collapsed | no reasoning block for that turn |
| A3 | Assistant prose | `response[]` plain `{value}` items + `inlineReference` | accent block, live Markdown, in chat order | `_No assistant text was recorded for this turn._` |
| A4 | Tool call identity + intent | `toolId`, `pastTenseMessage` / `invocationMessage` / `generatedTitle` | muted `🛠️ <code>toolId</code>: summary`, wrapped not truncated, with file references linked/colored and regex-or-glob spans command-styled (section 6.0a) | falls back to the friendly tool id |
| A5 | Terminal command | `toolSpecificData.commandLine.original` | `**Command:**` + `powershell` fence, always full text | n/a |
| A6 | Terminal output + exit status | `terminalCommandOutput.text`, `terminalCommandState.exitCode` / `.duration` | `📟 Terminal output (exit N · duration · N lines)` collapsible, ANSI stripped, command echo trimmed | n/a |
| A7 | Model-facing tool result | `resultDetails.output[]` where `isText`, or `toolSpecificData.result` for a subagent call | `📦 Tool result (N lines)` collapsible | `**Output:** not persisted as a separate resource (returned inline).` |
| A8 | Persisted output bodies | `chat-session-resources/<toolCallId>/` | `**Persisted output:**` line + one `📦 Output body` collapsible per resource | omitted - the store rotates, so absence is normal and is covered by the Recorded Output Limitation note |
| A9 | Remaining tool payload | `toolSpecificData` (non-terminal, non-todoList) | `⚙️ Tool details` JSON collapsible | n/a |
| A10 | Unconsumed tool result structure | complete `resultDetails` envelope after readable input/text output fields are removed | `📦 Tool result details` redacted JSON collapsible (over 300 lines and 15 KiB: 10-line preview plus companion) | omitted when no remainder exists |
| A11 | Files changed | `textEditGroup.uri` + create/edit tool URIs, optionally enriched by transcript V4A patches matched on `toolCallId` | three places: inline `> 📄 Edited <path>` marker at the point of edit, per-turn linked `📄 Files touched (n)` digest with operation counts and collapsible diffs, and the session-level `## Files Modified` roll-up | paths remain visible and counts say unavailable when patch evidence is absent; digest omitted only when no file is known |
| A12 | Todo state | `toolSpecificData.kind === 'todoList'` | `🗒️ Todo list at this turn (n)` with `[x]` / `[~]` / `[ ]` | omitted |
| A13 | Cost and timing | `promptTokens`, `completionTokens`, `copilotCredits`, `elapsedMs`, `promptTokenDetails` | `ℹ️ Turn info` table + `<sub>` cost footer; credits always 2dp | zeros or `n/a`, never blank |
| A14 | Model, mode, agent | `modelId` (friendly via `models.json`), `modeInfo`, `agent` | Turn info table + 🤖 in the footer | `unknown` |
| A15 | Chat ordering | `response[]` index | A2-A7 and A11 interleaved in recorded order, never bucketed by type | n/a |

### 8.2 Session level

| # | Element | Rendered as |
|---|---|---|
| B1 | Every user turn, none dropped | `## User Questions and Requests` count == turn blocks == `Q<N>` anchors |
| B2 | Session identity and provenance | `## Session Metadata` + `## Export Provenance` with the source journal path |
| B3 | Aggregate cost | `## Cost and Timing Summary` per-model table + Total row |
| B4 | Tool inventory | `## Tool Usage` table, counts equal distinct `toolCallId`s |
| B5 | All files touched across the session | `## Files Modified` + `📋 Copy all edited paths` |
| B6 | Memory and plan artifacts on disk | `## Memory and Plan Artifacts`, each rendered or shown as source per section 6.4 |
| B7 | Reading legend | `> [!TIP]` visual guide + copy-convention tip in the transcript header |

### 8.3 Presentation criteria

| # | Criterion |
|---|---|
| C1 | Assistant prose is visibly more prominent than the tool/meta rows around it, in **both** the VS Code preview and on GitHub (section 6.0) |
| C2 | No meta summary renders at full size or full contrast - including the `<code>` tool-name badge |
| C3 | Long summaries wrap; nothing is truncated except at `MAX_SUMMARY_CHARS`, and only where the full text remains available elsewhere |
| C4 | Status icons appear only for exceptions (`⏳`, `⚠️`) |
| C5 | Collapsible bodies are indented at most two levels (`BODY_INDENT`, then `NESTED_INDENT`) |
| C6 | Every embedded artifact is labelled `✅ rendered` or `⚠️ shown as source (<reasons>)` |
| C7 | A file reference inside a tool summary is a real link when the target is inside the workspace, or a colored (`FILE_LINK_COLOR`) non-link when it is not - never a plain unstyled filename |

### 8.4 Anti-criteria (an export failing any of these is wrong even if it looks fine)

- Reasoning hoisted to the top of a turn instead of sitting where it happened.
- Tool calls bucketed at the end of a turn instead of interleaved.
- A tool call appearing more than once because progress updates were not deduped by `toolCallId`.
- Terminal output missing because only `chat-session-resources` was consulted.
- An element quietly dropped rather than reported as absent.

## 9. Verification (run this every time the script changes)

Correctness = the output still matches this spec AND the numbers/order match reality. Use a known
session with rich content (e.g. `reference-live-session-export.md`) as the baseline.

### 9.1 Audit architecture (independence model)

Governing principle: **a check is only as strong as its independence from what it checks.** Two
derivations that share code share bugs, so they validate each other into a false sense of safety.
Design every verification layer to be as independent as practical from the stage it audits.

The export pipeline has three stages where a defect can hide, and three matching verification layers:

```
raw jsonl lines
  |  (A) delta replay: setAtPath / pushAtPath / deleteAtPath
   v
state.requests[]              <- reconstructed final request objects
   |  (B) shared primitives: flattenItems, classifyNode, collectThinking, mergeToolNode
   v
turns[]  +  rawRequests       <- BOTH branch off the same state.requests[]
   |  (C) renderTurnBody / renderToolNode / section assembly
   v
the .md file
```

| Bug location | Example | Caught by current `--verify`? | Why |
|---|---|---|---|
| A. Delta replay | `pushAtPath` ignores `i` and retains a superseded request | No | Both sides read the already-replayed `state.requests[]`; the loss is baked in first |
| B. Shared primitive | `flattenItems` skips a nested splice object; `classifyNode` misreads a kind | No | Both sides call the same function, so both lose the same node identically |
| B'. Turn construction only | empty-prompt turn filtering, dedup application | **Yes** | The turn-builder does this; the raw summary does not, so they diverge |
| C. Rendering | assistant text dropped, wrong escaping, compact placed under wrong heading | No | The verifier never opens the `.md` |
| Ordering within a turn | tools/thoughts same count but wrong sequence | **Yes** | Per-turn `toolIdSeq`/`thoughtSeq` order compare in `buildVerificationReport`, gated on equal counts |
| Cross-turn `toolCallId` reuse | same id genuinely invoked again in a later turn | **Yes** (reported, non-failing) | `crossTurnDuplicates` in `buildVerificationReport`; confirmed benign per-turn-scoped case, see the note below |

**Confirmed finding (2026-08-22): within-turn `toolCallId` reuse was a real defect, now fixed.**
Investigating the cross-turn-duplicate report surfaced a case where the SAME `toolCallId` appeared
twice within one turn's own raw response (an identical terminal command run twice back-to-back).
The original merge rule (`if (existing) mergeToolNode(...)`) folded the second, genuinely new
invocation into the first node unconditionally, silently hiding it and overwriting the first node's
output with the second call's result. Fixed by gating the merge on `!existing.isComplete`: a further
same-id node only merges while the tracked entry hasn't completed yet; once complete, a repeat id
starts a new node. Applied identically in `parseChatSession` and `summarizeRequestForVerify` so
Layer B stays in sync. Cross-turn reuse (different turns, same id) remains benign and unfixed, since
dedup is intentionally scoped per turn.

**Layer A - raw-delta cross-check (IMPLEMENTED, `buildJournalCrossCheck`).** Re-derives tool-call identity
straight from the journal with a generic object walk keyed on `kind`, deliberately NOT reusing
`flattenItems`/`classifyNode`, so a silent-drop bug in those shared primitives cannot hide behind an
identical derivation. A plain walk never descends into string values, so tool ids embedded in quoted
prior exports or subagent result blobs are excluded for free. It reports distinct journal tool ids vs
parsed tool ids and fails on any `dropped` (in journal, absent from turns) or `invented` (the reverse).

**Layer B - parse-vs-turns (IMPLEMENTED, `buildVerificationReport`).** Compares the replayed-requests
summary against the final parsed-turns summary. Its scope covers turn construction (row B') plus
per-turn tool-call and thought **order** (compares
`toolIdSeq`/`thoughtSeq` when counts already match) and session-level cross-turn `toolCallId`
multiplicity. Remaining future upgrade: assert the full response-text sequence rather than only the
first.

**Layer C - turns-vs-rendered-file (IMPLEMENTED, `buildRenderReport`).** Re-reads the `.md` and
asserts the artifact reflects the parsed turns: `user-message-N` anchor count == turns and sequential,
section-scoped TOC count == turns, `<h3>` request headers == turns, `#### 💬 Assistant Response`
sections == turns, tool badges == tool nodes, `<details>` balance, and `Compacted conversation.` under
its `/compact` turn when that confirmation was recorded; response-less `/compact` turns are reported
as having no recorded confirmation. All counts run against **scaffold-only** text (`scaffoldText`): fenced regions
AND blockquote lines are removed, and every marker is anchored to line-start generated markup, because
a self-referential transcript quotes these markers in both fenced tool results and blockquoted user
pastes. Catches stage C regressions (escaping, placement, mislabeling, dropped prose); misses upstream
correctness (garbage in, faithfully-rendered garbage out).

**Layer D - recorded-content-vs-rendered-text (IMPLEMENTED, `buildLossAccount`, `src/verify/loss-account.ts`).** The first layer
that does not share code with the parser or renderer. It reads the RAW replayed requests, picks out every piece of
recorded content by its own small taxonomy (prompt, request error, assistant text, reasoning, tool input, tool output,
terminal output, tool error, sub-agent prompt and result, and the text of any response kind it has no taxonomy for),
undoes the Markdown wrapping (escapes, entities, blockquotes, whitespace) and asks whether that text is in the
rendered Markdown, after applying the same best-effort redaction. Each piece is `present`, `partial` (only the start or
end, or some of its lines, appear) or `absent`. Multi-line categories are scored per line, so a trimmed command echo or a
clipped middle shows as "N of M lines". Short fragments that sit next to code (for example a lone `{` merged from a `markdownVuln` item) are also checked as `assistant-text-joined`: adjacent text fragments, including `markdownVuln` content, are joined in source order, split into lines and scored as whole lines. The short-fragment rule for standalone pieces is unchanged. Order and exact-repeat checks apply only to source-distinct message text whose
rendered sequence is preserved: Local prompts/prose across final replayed requests, and SDK prompts, reasoning, prose
and tool intent within each `agentId` scope. Local reasoning snapshots, tool progress/results, notes and companion text
still receive presence accounting but are not assumed to be separate inline messages for order or multiplicity.
`--verify` prints the totals and fails when text is partial or absent, eligible message text is out of order, or an identical eligible occurrence is missing, with or without `--strict`. No partial-cause exception is currently approved or implemented. A future exception must identify the cause and evidence for that exact piece; historical clipping, legacy byte caps and command-echo differences aren't category-wide exemptions.

Layer D does not infer that adjacent text needs a separator: VS Code 1.141.2's version-matched
[`chatModel.ts`](https://github.com/microsoft/vscode/blob/16507d91be0dc1ce4f94c04d4d0430210b8685d9/src/vs/workbench/contrib/chat/common/model/chatModel.ts)
joins Markdown response parts with an empty separator. Persisted records do not retain enough provenance to decide
whether any particular boundary needs a separator. This text check cannot verify opaque data. Images now have a separate independent hash check in [images.ts](../src/verify/images.ts); earlier Layer D results did not cover images. A distinct block whose text is a prefix of another remains ambiguous. Treat `absent` as proof of loss and
`present` as necessary, not sufficient. Real-data baseline for the Local export, before the companion rule (82 journals,
26,258 pieces on one development machine): assistant text and reasoning 100% present; 54 absent (request-error messages
30, warnings 1, a few single huge output lines) and 141 partial (clipped tool and terminal output and 9 prompts). After
the rule at its first 100-line setting and again at 300 lines AND 15 KiB (83 journals, 26,255 pieces; same result both
times): 50 absent (request errors 30, `confirmation` text 13, "Healed error" tool errors 3, tool inputs 3, warning 1) and
43 partial (tool inputs whose command echo is shown differently). The committed golden session shows two known absent
pieces, the text of a `confirmation` response item that `IGNORED_RESPONSE_KINDS` still drops by policy.

**Corpus inputs.** `scripts/verify-corpus.mjs` snapshots the supported inventory stores and session sources before discovering jobs. It uses SQLite backup for databases, not filesystem database copies. Report version 7 includes per-copy sizes, SHA-256 hashes and a stable `sourceId` beside each run-local label. The identifier is the first 12 hexadecimal SHA-256 characters of the original resolved source path, with forward separators and Windows case normalization. It doesn't hash a temporary capture location. Source growth doesn't change it; moving the original path does. Changes to live originals are reported without excluding frozen results. `--live` keeps the previous exclusion behavior. `--snapshot-dir` keeps inputs for repeatable comparisons. Copies are consistent per file, not one atomic snapshot across stores.

**Active-chat inputs.** Local and SDK single-chat paths use the shared snapshot helper. It reads a fixed source length, so appends cannot extend the copy indefinitely. An incomplete final record without a terminating newline is omitted with a notice. Invalid preceding records and complete-but-invalid final records still fail. The trimmed log is the only stored log. The manifest records untrimmed size/SHA-256 and replay size/SHA-256 when trimming occurs; no `.recorded` duplicate is kept. A source change during capture is reported in the header with local copy time and UTC offset.

SDK selector discovery reads live indexes/catalog mappings without parsing changing logs. Only the selected event log, selected index/identity metadata and selected-session usage rows are captured. Header/version identity is validated on the fixed log, not an obsolete live hash. The usage database is a small SQLite file populated by one read-only transaction selecting all matching backing-session rows, including child agents. It excludes unrelated sessions and tables. Event and database captures are separate instants, not a globally atomic snapshot.

**Capture retention and cleanup.** `CCE_CACHE_DIR` overrides the shared root. Windows defaults to `%LOCALAPPDATA%\copilot-chat-exporter\cache`, macOS to `~/Library/Caches/copilot-chat-exporter/cache`, and Linux to `$XDG_CACHE_HOME/copilot-chat-exporter/cache` or `~/.cache/copilot-chat-exporter/cache`. Captures, output-path-keyed receipts and corpus snapshot registrations use this root. Native source paths aren't valid cache destinations. Normal export verifies persisted staged Markdown and linked companions against its capture before publishing the normal destination. It removes the capture on success unless `--keep-source` was set. A small not-kept receipt lets later file verification explain the missing source and suggest re-exporting with `--keep-source`. Kept-file verification uses the same selector and captured inputs without native-store discovery. Missing/changed captures fail without substituting live sources.

Failed export verification always exits nonzero, independent of `--strict` and `--keep-source`. It keeps its capture, receipt and companions, and publishes `<name>.verify-failed.md` with a top warning containing failure reasons, category counts and the capture path. It never replaces an earlier normal archive on failed verification, including with `--overwrite`. Failure-name collisions use `.verify-failed-1.md` and increasing suffixes. A later success reports older failed archives without removing them. Only skipping an incomplete final record isn't a failure. Failure logs beside the Markdown use `failed-<sessionid>-YYMMDD_HHMMSS.log` with collision suffixes, local timestamps, UTC offset, counts/check results, exception information, runtime/command details and captured source hash/location. Logs use best-effort credential redaction and remain private. A failed receipt records the failure without claiming a saved-file hash. The capture is kept and protected as an active producer before failure publication. Standalone verification doesn't rename a supplied archive; it keeps its failed source capture and logs under the configured cache's `failures` directory.

Re-exporting an output removes its old capture and receipt before installing the new receipt. `--cache` reports sizes, age, in-use state, affected exports and old temporary cache/receipt folders. Legacy folders are report-only. `--clean` lists targets first and deletes nothing without `--yes` or interactive confirmation, default No. No terminal means no deletion without `--yes`. `--dry-run` is listing-only even with `--yes`. Corpus snapshots require `--include-corpus`; the default skips them. `--older-than N` means creation age in days. After approval, cleanup limits deletion to listed ownership IDs and rechecks ownership and active readers. Captures and linked receipts share deletion. Symlinks/junctions and unregistered directories aren't followed or removed. Single-chat cleanup never deletes a borrowed corpus snapshot. Native payloads never become Markdown companions.

Tests, golden checks and baselines use isolated `CCE_CACHE_DIR` roots and clean them up. The test runner fingerprints the real cache and legacy temp capture/receipt roots before and after each run and fails on any change.

SDK shell calls render their command separately and keep every remaining argument in the input block, including shell IDs, descriptions and execution mode. Pending calls don't rely on a later tool result repeating those fields.

SDK verification with an output path scores the saved Markdown and its linked sibling companions against the captured events. It doesn't substitute a new rendering or regenerate missing companions. Verification without an output path checks the in-memory rendering.

**Historical verification limitations.** Earlier saved-file SDK verification regenerated the export instead of checking the supplied file. Its success did not prove that the saved Markdown or companions were intact. Layer D before October 20, 2026 did not cover images. Those historical results must not be read as image-preservation evidence. Current image coverage requires the independent recorded-byte hash check.

Local single-chat captures include selected index metadata instead of a whole `state.vscdb`, supplementary resources, transcript, model catalog, workspace metadata and the Markdown memory files the renderer reads. Other memory subdirectories aren't copied. Replay verifies captured hashes before reading them. Provenance names original paths while content comes from copies. Corpus exports use selected inputs from the retained inventory snapshot.

**CLI mapping.** `--verify <sessionId>` runs Layers A/B (source-side truth) and Layer D against the Markdown this
build would write. `--verify <sessionId> <outputFile>` additionally runs Layer C against that file and runs Layer D against
it too, and a normal export checks its saved file and companions against the same capture before releasing it. The output file is optional; the
layers are complementary.

**Export-bound Layer C.** The export's in-process self-check uses the parse that produced the file. Later `--verify <id> <file>` uses the captured inputs associated with that output and selector, not the current journal. New live tool calls therefore don't create a stale badge/anchor deficit. If that capture is unavailable, file verification fails and asks for a new export rather than substituting live data.

### 9.2 Fast automated gate

1. **Types and syntax:** `npm run typecheck -w copilot-chat-exporter` (must report zero).
2. **Lint/type errors:** check the file has no problems (editor diagnostics / `get_errors`).
   `npm run typecheck -w copilot-chat-exporter` is the eventual gate; it stays red until the
   annotation pass lands.
3. **Run the verifier first** from a session id (never a transcripts path):
   `npm run ai:export:chat -- --verify <sessionId>`. Add `--strict` to fail on schema drift.
4. **Regenerate the baseline** from a session id:
   `npm run ai:export:chat:reference`.
5. **Counts sanity:** the printed `Turns / tool calls / reasoning thoughts / resources` should be
   non-zero and within a small delta of the last known-good run. A sudden drop (e.g. tool calls
   falling by hundreds, or turns -> 0) means a parsing regression - stop and investigate.

`--verify` / `--audit` exit code contract:
- `0` = no mismatches detected.
- `2` = at least one mismatch or request/turn count mismatch.

### 9.3 Verifier report expectations

`--verify` prints a deterministic summary that must be reviewed before a release:
- Layer B: request count from replayed journal and parsed turn count; mismatch counts for prompts,
  first response text, thought counts, tool-call counts, terminal output line totals, tool-call order,
  and thought order; missing and extra turns by `requestId`; per-`/compact` checks; cross-turn
  `toolCallId` duplicates (reported with per-occurrence turn/tool
  context, non-failing - legitimate when the same command runs again in a later turn).
- Layer A cross-check: distinct journal tool ids vs parsed tool ids, streamed-thinking count, and any
  `dropped`/`invented` tool ids (a non-empty list fails the run).
- Layer C (when an output file is passed): one PASS/FAIL line per render check (anchors, TOC, headers,
  assistant sections, tool badges, `<details>` balance, compact placement).

### 9.4 Journal shape catalogue (evidence for the golden fixture)

Surveyed all 45 local `chatSessions/*.jsonl` files to confirm which tricky shapes the parser must
handle are real (not just theoretical) before committing them to a golden fixture (9.5).

| Shape | Status | Evidence |
|---|---|---|
| Indexed request replacement (`kind: 2` with `i`) | **Real** | A persisted session appended a request, then truncated and replaced that slot; ignoring `i` retained 28 exported turns while VS Code showed 27 |
| Re-emitted/deduped `toolCallId` (same call appended 2-4x as it progresses) | **Real, common** | 151 in the working session; 3,849 in another - the dominant shape, not an edge case |
| Same completed `toolCallId` reused for a new invocation within one turn | **Real** | identical terminal commands were invoked twice in the working session; merge must stop after `isComplete: true` |
| Prefix-duplicate streamed thought (a later thought is a longer version starting with an earlier one's text) | **Real** | e.g. two `thinking` appends both starting `"No screenshot actually came through, just the file, but I ca…"`, one a strict extension of the other |
| `/compact` confirmation as a standalone response append | **Real** | Exact replay places all four confirmations in the committed live fixture on their recorded `/compact` requests; no prompt-specific remapping is needed |
| Response-less `/compact` turn | **Real** | the current chat session contained a final `/compact` request with no recorded assistant response while export ran; Layer C must not invent or require a confirmation |
| Terminal tool output with raw ANSI escapes + a captured exit code | **Real** | `toolSpecificData.terminalCommandOutput.text` containing `\u001b[...m` sequences alongside `terminalCommandState.exitCode` |
| `textEditGroup` (file edit marker) | **Real, common** | 54 occurrences in one session |
| `inlineReference` (file/symbol reference) | **Real, common** | 51 occurrences in one session |
| `todoList` tool payload, including an empty list | **Real, common** | dozens of occurrences, counts ranging from 0 to several |
| Subagent tool call with both `toolSpecificData.prompt` and a populated `toolSpecificData.result` | **Real** | found in a different session (prompt 1,721 chars, result 8,187 chars); the working session only had one subagent call and it was still in-progress (`prompt` set, `result` not yet populated) - both states are real |
| `request.confirmation` field (e.g. `"Try Again"`) alongside `message.text` | **Real, but redundant** | always accompanied a non-empty `message.text` in every case found (e.g. `message.text: "@agent Try Again"`); not a distinct content carrier, so the parser's `messageText()` does not need to special-case it |
| `contentReferences`, prompt-token detail categories | **Real** | `promptTokenDetails` contains System/User Context category rows in the working session |
| Numeric-keyed splice object as a delta value (e.g. `{"0": {...}, "1": {...}}` instead of an array) | **Not found in corpus (0 of 45 sessions)** | `flattenItems` handles this defensively per the historical "72 vs 400+ tool calls" regression note, but no live example exists locally; must be hand-constructed (synthetic) for the fixture and labelled as such |
| `isCanceled: true` on a request | **Not found in corpus (0 of 45 sessions)** | rendered today (`renderTurnInfo`'s `Canceled` row) but never exercised by a real session on this machine; synthetic for the fixture |
| `codeCitations` / `followups` populated with entries | **Not found populated** (fields exist but empty in surveyed sessions) | lower priority; not included in the first fixture cut |

**Conclusion:** the fixture can be built almost entirely from real, observed shapes. Two cases (splice-object delta, `isCanceled: true`) have no local precedent and must be synthetic - labelled `"synthetic": true` per case in the fixture so the digest and any future contributor knows those two are constructed defenses, not reproductions.

### 9.5 Golden baseline (IMPLEMENTED)

Closes item 10 from the audit-limitations review: every Layer A/B/C check today is internal-consistency
(the export compared against itself), so a systematic drift that shifts both sides of a comparison the
same way passes everywhere. A golden baseline adds an externally-committed answer key for one frozen
input, so a systematic drift shows up even when it is self-consistent.

**Fixture.** A small, hand-assembled journal at
`tools/copilot-chat-exporter/test/fixtures/golden/00000000-0000-4000-8000-000000000000.jsonl`, covering one of each selected shape in
the 9.4 catalogue (including indexed request replacement, completed-ID reuse, response-less compact,
and cross-turn reuse, and marking the two synthetic cases). It is kept intentionally small so it stays reviewable in
a PR diff.

**Digest AND a normalized render.** A raw `.md` byte-diff is too brittle on its own: it embeds
`Export generated: <now>`, a live `git status` snapshot, and its own output
path, so it would fail on every run regardless of correctness. Both committed artifacts therefore go
through `src/verify/golden.ts`, which masks exactly those four things:

- `tools/copilot-chat-exporter/test/fixtures/golden/golden-session.digest.json`, a normalized,
  deterministic digest computed purely from the parse (`parseChatSession` + `buildRenderReport`) -
  no timestamps, no absolute paths, no `models.json`, no resource store.
- `tools/copilot-chat-exporter/test/fixtures/golden/golden-session.expected.md` (~27 KB), the
  normalized render itself. The digest answers "which field drifted"; the render answers "what does
  the page now look like", and turns a rendering change into a reviewable markdown diff in a PR.

`--golden check` compares both and fails on either. The digest alone is insufficient: a one-character
heading change passes the digest and fails the render.

Generated renders are written to `test/baseline/` (gitignored); `test/fixtures/` holds only the saved
artifacts a check compares against.

Digest shape:
```json
{
  "schema": 2,
  "turns": 6,
  "toolCalls": { "total": 9, "distinct": 8 },
  "thoughts": 5,
  "perTurn": [
    { "n": 1, "requestId": "req_a", "promptSha": "ab12…", "thoughts": 1, "thoughtShas": ["cd34…"],
      "tools": 2, "toolIds": ["call_a", "call_b"], "termLines": 3,
      "files": ["src/x.ts"], "compact": false }
  ],
  "render": { "anchors": 6, "toc": 6, "headers": 6, "assistant": 6, "badges": 9, "detailsBalanced": true },
  "census": { "seen": { "thinking": 4 }, "dropped": {}, "toolData": { "terminal": 5 },
               "unhandled": [], "unrecognizedToolData": [] },
  "notes": []
}
```
SHA-256 of normalized prompt/assistant text keeps the digest small while still detecting content
changes. `toolIds` and `thoughtShas` recorded in order also give the per-turn tool-call and thought
**order** and **multiplicity** checks on this fixture, at no extra cost. The census is in the digest
so that adding a handler for a new kind registers as a change, not only as one turn's text moving.
`notes` is supplied by the caller: the golden fixture passes the two synthetic-case labels, a
snapshot passes none.

**CLI.** `--golden check` parses the fixture, recomputes the digest, and diffs it against the committed
file (exit 2 with a field-level diff on mismatch). `--golden update` recomputes and overwrites the
committed digest - a deliberate, reviewed action gated by the PR diff, the same way a snapshot-test
update is.

**Why it catches what A/B/C miss.** A `flattenItems` change that silently drops a nested tool call
still makes Layer A and Layer B agree with each other (both derive from the same, now-wrong, parse of
the live session). The committed digest, taken from the old and correct parse of the same frozen fixture
bytes, does not move - so it mismatches and the run fails. That is the systematic-drift signal nothing
else provides.

**Limits.** Only proves no regression against the frozen fixture; a real session using an input shape
the fixture does not cover can still regress silently. Two mitigations: add a fixture case whenever a
new bug class is found, so the fixture becomes the regression corpus over time; and see 9.7 for
pointing the same comparison at an arbitrary session. Item 11 (Layer A's cross-check
sharing the parser's `JSON.parse`-skip-on-error behavior) is a separate gap this does not close; that
needs its own malformed-line fixture case.

### 9.7 Session snapshots (IMPLEMENTED)

The same digest, recorded for any session the user has, rather than for the committed fixture. It
exists because of the limit stated directly above: the two committed checks cover two conversations,
and the session that motivates a change is almost never one of them.

- `--snapshot update <sessionId>` renders in memory, builds the digest, and writes
  `test/snapshots/<sessionId>.digest.json`.
- `--snapshot check <sessionId>` recomputes and diffs, exit 2 with a field-level diff on mismatch.

**Digest only, no render.** Contents are reduced to hashes, so size is bounded by turn and tool
counts rather than by payloads: a 9-turn session is about 4.6 KB. A full render would be megabytes
per session and is what `--golden` already provides for the one session small enough to review.

**Gitignored.** A snapshot names a session that exists only in one machine's VS Code storage, so it
is meaningless in another checkout. `test/snapshots/` is ignored for that reason, not because it is
disposable.

**What it is for.** Adding a handler for a new node kind should move `census.unhandled` and the
specific turns that gained content, and a snapshot shows exactly that. `docs/UPGRADING.md` folds it
into the procedure: record before changing anything, check after implementing, re-record last.

### 9.6 Structural checks on the generated file

- **`<details>` balance:** count `<details` opens vs `</details>` closes. They should match, EXCEPT
  for literal occurrences embedded inside fenced code blocks (the archive can quote its own tags).
  When counting, ignore matches inside ``` fences - and use a **fence-length-aware** scanner, because
  `fenceFor` emits 4+ backtick wrappers around content that itself contains ``` lines. Also track
  running depth: it must never go negative and must end at 0.
- **Copy affordances:** `📋 Copy source` / `📋 Copy these paths` / `📋 Copy all edited paths`
  collapsibles are present and each wraps a fenced block.
- **No live HTML leaks:** strip fenced regions AND inline code spans, then confirm no
  `<select|option|input|button|iframe|script|style|form` tags remain. Any hit means embedded content
  is rendering as real UI.
- **Markdown artifacts labelled:** each embedded `.md` artifact shows either `✅ rendered` or
  `⚠️ shown as source (<reasons>)`.
- **No duplicate tool calls:** the reported tool-call count should equal the number of distinct
  `toolCallId`s in the journal, not the number of `toolInvocationSerialized` nodes (the latter is
  inflated by progress updates). Spot-check a turn against the live chat: the order and the set of
  tool entries must match one-for-one.
- **Terminal output present:** `📟 Terminal output` blocks appear for terminal calls, contain no raw
  `\u001b[` escape sequences, and show a plausible exit code and duration.
- **No orphan edit fences:** no bare ``` line immediately above a `> 📄 Edited` line (outside quoted
  content). This is the "empty text box around an edit" bug.
- **No-output tools are plain lines:** tools with no command/resource/details render as `- 🛠️ ...`,
  not as a `<details>` whose only body is the "not persisted" line.
- **Every meta summary is muted:** using the same fence-aware scanner, `<summary><sub>` should equal
  the `<details` count minus the document-level Memory-artifact summaries (2 when both memory groups
  are present). Any other bare `<summary>` in transcript output is a miss.
- **Tool-name badges are muted at the element:** every `<code` inside a summary carries its own
  `style=` with a colour. An inherited colour on a wrapper is not sufficient (section 6.0).
- **No stray success icons:** the transcript contains no `🛠️ ✅`; the only status icons present are
  `⏳` and `⚠️`.
- **Summaries wrap rather than truncate:** ellipsis-terminated summaries (`…</span>`) should be rare
  and each one should exceed `MAX_SUMMARY_CHARS`. A crop at ~120 chars means the old clip is back.

> [!WARNING]
> Every check in this section must **ignore fenced regions**, not just the `<details>` balance check.
> An export of a session that built the exporter embeds *earlier exports* inside tool results, so a
> naive scan reports the old format's `🛠️ ✅` rows and bare `<summary>` tags as live defects. Measured
> naively this export showed 85 stray ticks and 58 bare summaries; fence-aware, the true counts are 0
> and 2.
- **Credits are 2dp:** every rendered `💳 <n> credits` matches `\d+\.\d{2}`.
- **Model names are friendly:** the metadata "Models used" and per-turn footers show names, not raw
  ids (unless `models.json` was unavailable).
- **Bordered md boxes:** the Memory and Plan Artifacts section uses the `border:1px solid` div.
- **Required sections present:** all 12 `##` sections from section 3 exist and in order.

### 9.7 Spot-check one rich turn by eye

Open the file in the **VS Code Markdown preview** (not just the raw text) and confirm on a known turn:

- The blue prompt badge and right-aligned timestamp render.
- Assistant text and tool calls appear in the **same order as the live chat** (tools interleaved,
  not lumped at the end).
- Filenames appear in read/edit summaries (not blank).
- An edit renders as a clean `> 📄 Edited ...` blockquote (no wrapping code box).
- A markdown artifact renders inside a visible border.
- **Squint test (criterion C1):** defocus and scroll a tool-heavy turn. The assistant prose should
  read as the dominant band and the tool rows as grey texture. If a green tick, an orange badge, or
  a tool row is the first thing the eye lands on, the hierarchy is inverted - fix it before shipping.
- Repeat the squint test on GitHub (or any renderer that strips inline styles) to confirm the `<sub>`
  fallback alone still separates answer from machinery.

### 9.8 When you change parsing

If you touch `parseChatSession`, `flattenItems`, `spliceValues`, `collectThinking`, or
`classifyNode`, re-run 9.2-9.7 against at least two different sessions (one large, one small) via
`--list`, because delta shapes vary between sessions.

## 10. Known pitfalls (learned the hard way)

- Passing a `transcripts/<id>.jsonl` path -> 0 turns and overwrites the good file. Use the session id.
- Forgetting recursive flattening -> most tool calls vanish.
- Treating kind 2 as append-only -> superseded requests survive, the export gains extra questions,
  and every later numeric request path can update the wrong turn. Honor `i` before interpreting any
  request or `/compact` behavior; do not add prompt-specific index remapping.
- Counting rendered markers on a self-referential export without excluding BOTH fenced regions and blockquote lines -> false positives, because the transcript quotes its own markers in fenced tool results (`🛠️ <code>`, `<details>`) and in blockquoted user pastes (`> ... </details>` copied from a prior verification run). Layer C uses `scaffoldText` (drop fences + blockquotes) and anchors every count to line-start generated markup.
- Verifying a rendered file written by an earlier export against the current journal -> a badge/anchor deficit equal to the tool calls made since. Use the driftless in-process self-check, not a stale file.
- Rendering md outputs as raw fences instead of a bordered box -> looks like code, not a document.
- Leaving VS Code's edit-preview ``` fences in -> empty box around `> 📄 Edited`.
- Using raw `copilotCredits` -> long decimals; always `fmtCredits`.
- Counting `<details>` without excluding fenced/embedded copies -> false imbalance alarms. A naive
  fence tracker that toggles on any ``` line also miscounts, because 4-backtick wrappers legitimately
  contain ``` lines; match the closing run length against the opening one.
- Rendering embedded `<details>`/`<summary>` markup live -> a collapsible opens and never closes,
  hiding everything after it. Always neutralize structural HTML outside fences (section 6.7).
- Rendering an arbitrary `.md` artifact live in the bordered box -> docs that *document* HTML render
  it as real UI (a `<Select>` became an actual dropdown). Run the risk scan (section 6.4) and fall
  back to fenced source; do not try to escape your way out of arbitrary HTML.
- Auditing for live tags without stripping inline code spans -> false positives, since `` `<script>` ``
  in prose is literal text.
- Treating every `toolInvocationSerialized` node as a separate tool call -> duplicated entries and a
  scrambled sequence, because the journal re-emits each call as its status changes. Dedupe by
  `toolCallId` (section 2.2).
- Merging every same-`toolCallId` node unconditionally -> a genuinely NEW invocation silently
  disappears. VS Code can reuse the exact same `toolCallId` when the identical command/tool+args runs
  again later (confirmed via the Layer B cross-turn-duplicate audit, spec 9.1 item 4: the same
  terminal command's `toolCallId` recurred within one turn and again in the next). Only fold a
  same-id node into the tracked entry while that entry is still `isComplete: false`; once complete,
  a further same-id node is a fresh call and must start a new entry, or its real output gets
  overwritten onto the wrong badge's position.
- Assuming terminal output is only in `chat-session-resources` -> it is usually inline in the journal
  at `toolSpecificData.terminalCommandOutput.text`. The resources store is frequently empty because
  VS Code rotates it, so an export that relies on it alone will show no outputs at all.
- Hoisting reasoning into one per-turn block -> the export no longer matches the chat, where thoughts
  are interleaved between tool calls. Render `thinking` nodes where they occur (section 4).
- Resolving a file link to `basename` without stripping the `#L10-L20` fragment -> summaries read
  `export-copilot-chat.mjs#508-508, lines 508 to 560`.
- Muting a summary by putting the colour on a wrapping `<span>` -> the `<code>` tool-name badge stays
  bright, because the preview stylesheet sets `code { color: ... }` explicitly and an explicit rule
  on the element beats an inherited one. Style the `code` element itself.
- Trying to tone down a status emoji with CSS -> emoji ignore `color` entirely. The only lever is
  whether you emit it, which is why a completed call carries no icon.
- Clipping tool summaries to a fixed width -> the informative half of a search pattern or a long
  command is replaced by `…`. Let summaries wrap; cap only pathological lengths.
- Setting an explicit text colour on the assistant block -> unreadable in whichever preview theme the
  reader is not using. Derive prominence from the muted surroundings instead.
- Leaving a subagent's `result`/`prompt` only in the raw `toolSpecificData` JSON dump -> the report
  renders as an escaped one-line string (literal `\n`s, no real line breaks) and, worse, the tool
  still prints "not persisted as a separate resource" even though the result is sitting right there
  in the JSON. Route `toolSpecificData.result` into the same `resultText` slot other tools use, and
  `toolSpecificData.prompt` into its own `📝 Subagent prompt` fence, then strip both from the JSON dump.
- Joining multiple reasoning thoughts with blank lines -> each becomes its own paragraph, so a
  5-thought turn accumulates five paragraph gaps. Join with `<br>` instead: still one thought per
  line, without the compounding vertical space.
- Escaping a tool summary's plain text and *then* inserting generated markup (a file link, a
  command `<code>` span) -> the markup's own `<`/`>` get escaped too, showing literal `&lt;code&gt;`
  instead of a styled element. Tokenize first (placeholder markers), escape the whole string once,
  then substitute the pre-escaped replacements back in (section 6.0a).
- Reading a confusing-looking tool summary from a self-referential test session (one used to build
  or debug this exporter, which ends up searching its own prior exports) as a rendering bug ->
  verify with a direct, isolated repro of the tokenizer first. It has been faithfully correct in
  every case tested; the confusing part is almost always that VS Code's own message only wrapped
  *part* of a multi-clause regex in backticks (section 6.0a).
