# HTML report design guide

This is the shared design reference for the exporter's HTML listings: what goes where, how information is abbreviated, and why. It describes the implemented design as of October 13, 2026, rather than every renderer detail or every private VS Code field. Update it when a deliberate layout or convention changes.

For commands and technical contracts, use [SPEC.md](SPEC.md). For storage interpretation, use [CHAT-SESSION-LOCATIONS.md](CHAT-SESSION-LOCATIONS.md). For recorded title sources, use [CHAT-SESSION-TITLES.md](CHAT-SESSION-TITLES.md). The [work log](../work-log.md) tracks decisions, implementation and validation.

## Purpose and principles

The reports help a person find a remembered chat, distinguish conversations from workspace references, and inspect supporting artifacts without deleting or repairing anything.

| Principle | Design consequence | Reason |
| --- | --- | --- |
| Recognize first, investigate second | Show title, project, dates, turns and meaningful chips before paths and hashes | Most users identify a chat by its content and context, not its storage key |
| Overview first, detail on demand | Collapsed cards, concise summaries, nested evidence disclosures | Keep large inventories scannable without discarding forensic details |
| Evidence before inference | Label recorded relationships separately from best-effort hints | Similar titles, paths or prompts do not establish identity or redundancy |
| Unknown is not zero | Distinct question-mark indicators; preserve unavailable and unreadable states | Missing evidence must not resemble a successful empty result |
| Short display, recoverable detail | Narrow typography, path prefixes, tooltips and full-value copying | Save space while preserving exact values needed for comparison |
| One home for each detailed fact | Combine repeated titles; consolidate source/audit/artifact sections | Repetition makes differences harder to notice and increases report size |
| Color has meaning | Match card borders/titles to type; separate status and warning tones | Help recognition without requiring every chip to be read |
| Color is not the only signal | Pair colors with labels, icons and tooltips | Preserve meaning across themes and for users who cannot distinguish colors |
| Read-only, offline and portable | Self-contained HTML, no automatically opened browser, native disclosures | Remains useful without JS; filters/copy are enhancements |
| No cleanup verdicts from size alone | Qualified removal impacts; explicit sharing and measurement limits | Large files and multiple references are not proof of safely removable data |

## Two report levels

| Report | Main presentation | Intended use |
| --- | --- | --- |
| Basic listing | Compact table with creation/activity, prompt count, type, selector, title, status and full-width Why/source panels | Quick inventory and Local export selection |
| Detailed listing (`--detailed`) | TOC, filters/charts, collapsed conversation cards, ordered prompts, relationships and enriched evidence | Remembering a chat and investigating its content, identity and storage |

The two reports share discovery and grouping, but not every presentation rule. In particular, compact UUID selectors belong to the basic/console listing; the detailed card's identity chips intentionally retain full identifiers. Detailed turn counts and SDK activity dates use rich scope evidence and may differ from compact inventory metrics.

## Detailed page outline

The page is one `<main>`, rendered in this order. A [draw.io wireframe](diagrams/html-report-wireframe.drawio) shows the same layout visually.

```text
+--------------------------------------------------------------------------------+
| <header>                                                                       |
|   caption: Offline · read-only · detailed identification report                |
|   <h1> VS Code chat session listing                                            |
|   Generated <datetime> for <user-data root>. Dates use the generator's clock.  |
|   <nav> 📚 Session TOC · 🤖 Models used · 🗂️ Storage/IDs/statuses · 📦 IDs/sizes |
|         · ℹ️ How to use · 🔎 Audit legend · 🙈 Ignored (N)                     |
|   .warning  privacy notice (prompt text and local paths; best-effort redaction)|
+--------------------------------------------------------------------------------+
| .metrics   [N grouped conversations][N workspace occurrences][N main candidates]|
|            [N initially shown][N ignored groups][N answering model IDs]        |
+--------------------------------------------------------------------------------+
| .grid  (three .panel charts, bars = share of all groups; not additive)         |
|   [Backing status]       [Chat types]            [Answering models (top 8)]    |
+--------------------------------------------------------------------------------+
| #project-chart  Chats per project                                              |
|   multiple projects ████░░  n | no recorded project ██░░ n | top 12 projects…  |
|   "All N projects" disclosure; each name is a project-filter button            |
+--------------------------------------------------------------------------------+
| #needs-attention  🛎️ Needs attention · N conditions  [❓ n][⛔ n][🟠 n][🔎 n]  |
|   collapsed; expands to Condition | Chats | What it means | [Show]             |
|   "none detected" one-liner when clean; link to Ignored sessions               |
+--------------------------------------------------------------------------------+
| <details #conversation-index> 📚 Session TOC (N)  -- all groups, one per line  |
|   ordered list; 2 lines per item (see TOC item)                                |
+--------------------------------------------------------------------------------+
| .panel  Find the chat you remember                                             |
|   [search box ..............................]                                  |
|   Type ▾  Backing ▾  Project ▾  Model ▾                                        |
|   quick chips: [🙈 …][edits][errors]…  (AND semantics, aria-pressed)          |
|   <details> Date / numeric ranges                                              |
|   View ▾  Detail ▾  Sort ▾  [⬇️ Descending]  [Reset filters] [Show all]        |
|   #row-count "X of Y grouped conversations shown"   #action-status (live)     |
+--------------------------------------------------------------------------------+
| #comparison  (hidden until a chat is pinned)  2 side-by-side summaries         |
+--------------------------------------------------------------------------------+
| #grouped-view   <details.session-card> × N  (see Conversation card)            |
| #occurrence-view (hidden) table: one row per workspace reference               |
+--------------------------------------------------------------------------------+
| <details> Models used | Storage guide | IDs/sizes | How to use | Audit legend   |
| <details #ignored-sessions> Ignored sessions (N): links or full cards          |
| <footer> Generated locally ... no external scripts, fonts, images or requests  |
+--------------------------------------------------------------------------------+
```

The comparison, occurrence view and filtered-out cards are in the HTML but hidden until JavaScript or a link reveals them.

The TOC uses a bold snapshot number and narrow title text. Its second line carries project/workspace, latest activity (`MMDD-HH:mm`), turns/reference context and an edit chip when available. Entries wrap rather than overlap. Following an internal link reveals the target and resets filters when necessary.

Project filtering is inclusive: a multi-project conversation matches each associated project. Project-chart bars therefore are not additive. Multiple projects and no recorded project have explicit categories. Equal project names are disambiguated with more path context.

### Conversation card

Each card is a native `<details class="session-card chat-<type>">`. The type class sets `--type-color`, used by the border, title and type chip.

```text
COLLAPSED (<summary class="session-summary">)
+-[type color border]----------------------------------------------------------+
| (7) [💬 Local] **Title in type color**  [↳ 2 subagents] [🌿 Forked]            |
|     [2 w/s refs · 1 conv] [⑂? Likely fork]                        <- title-line |
| **12 turns** 📁 project  🌅 261002_15:24  🔄 261007_19:09  [GPT 5 +2]          |
|     [✏️ 3 files +40 -7] [💳 43c] [⬆️~15.4M ⬇️~730k]               <- subtitle   |
| [✅ verified] [MD export supported] [🙈 Ignored: …] [🚨 1 error] [🔎 2 audit]   |
|     wsID: <code>  sID|agentID: <code>                              <- status-line |
+-------------------------------------------------------------------------------+

EXPANDED (<div class="session-body">, in this order)
+-------------------------------------------------------------------------------+
| 🏷️ Titles at each storage level            [📌 Compare] [🔗 Link] [🔝 TOC] ->  |
|   <source label> · <source label>   title text    (one row per distinct title)  |
| .card-notes   usage-unavailable / no-model notes (only when missing)            |
| 💳 Usage disclosure (only when usage exists)                                    |
| 🗨️ Ordered prompts / delegated tasks (N)  ▸                                     |
|     1. [👤] date [model][Auto][effort][💳][✏️ files +x -y]  prompt preview      |
|        ▸ Full prompt (only if clipped or derived)                               |
| 🌳 Family / relationships   (disclosure, or "none recorded")                    |
| 🤖 Model-switch timeline    (disclosure, or one-line field)                     |
| 📊 Conversation / workspace / outcomes + first/last previews  ▸                 |
|     [Conversation][Workspace / project][Changes / outcomes] evidence cards      |
| [🕒 Dates and provenance]   [📝 Editing history / injected prompts]            |
| 🗂️ Why / source · N refs  ▸                                                     |
|     Binding status -> Health checks -> Where referenced -> Chain at a glance    |
|     -> Detailed lineage (conditional) -> Storage summary                        |
|     -> Unified evidence table (artifact composition, technical identity)        |
| 📋 Export selector / command   [📋 Copy selector] [💻 Copy command]             |
+-------------------------------------------------------------------------------+
```

The first and second summary lines contain only the information a user needs to recognize the chat. Missing usage and model chips are omitted; the notes appear after expansion. Empty or single-line sections use `icon label: value` instead of an empty disclosure. Multiple meaningful entries justify a disclosure. Health warnings stay visible inside the open Why/source section, before its evidence table.

### TOC item

Each TOC entry is a list item with two flowing lines. Entries cover every grouped conversation, including ignored and newest-25-limited ones, in report order (most recently active first; `#N` is that report-local rank).

```text
**#54** Title in Arial Narrow (link)  [💬 Local]  **12 turns**
  📁 project (+1 if multi-project) · 🔄 1007-19:09 · [3 w/s refs] · [✏️ 5 files +40 -7]
```

Missing values use `?`/`??`/`???` with tooltips. The refs and edit chips appear only when applicable. The link reveals the card.

### Why/source wireframe

```text
🗂️ Why / source · 3 refs
+-- Binding / content status (one line: verified | unsupported | unverified) ---+
+-- Health checks (visible; warnings first, "none" when clean) -----------------+
+-- Where it is referenced -----------------------------------------------------+
|  W1  project A   Persisted index entry        cwd match                       |
|  W2  project B   Derived through parent       additional workspace reference  |
+-- Chain at a glance:  W1/W2 -> SDK backing -> events.jsonl  (recorded route) --+
+-- Detailed lineage (only for multiple refs / derivation / unresolved) ---------+
+-- Storage summary: scope, artifacts, sizes (not additive)                      |
+-- ▸ Unified evidence table                                                    |
|   Artifact | Value (prefixed, copy) | Size / state | Tied to | Purpose |        |
|   Potential impact if removed                                                  |
|   ▸ composition (SQLite keys, JSONL kinds, directory children)               |
|   ▸ Technical identity: field + value + references that carry it             |
+------------------------------------------------------------------------------+
```

### Why/source responsibilities

| Area | Contains | Does not imply |
| --- | --- | --- |
| Where referenced | W labels, project/workspace, reference basis and context | Primary ownership, origin or safe deletion |
| Chain at a glance | Compact route from a reference to its recorded backing evidence | A mandatory sequence of VS Code database accesses |
| Detailed lineage | Per-reference routes when multiple references, derivation or unresolved mappings add information | Guessed database hops based on file existence |
| Storage summary | Conversation scope and related-storage context | An additive disk-usage or reclaimable-space total |
| Unified evidence | Artifact, value (location), size/state, sharing, purpose and qualified removal impact | Exclusive ownership by this chat |
| Technical identity | Field/value/reference tuples, including differing child IDs and title/date sources | That all references contain identical values |

There are no separate duplicate "Shared artifacts", "All unique values" and "Technical identity" tables. Their roles are integrated into the unified evidence disclosure. Prompt text stays in Ordered prompts; per-event timestamps stay in Dates and provenance.

## Component reference

The sections below describe what each part of the detailed report contains and why. Section titles follow the on-page wording.

### Collapsed header

| Line | Contents, left to right |
| --- | --- |
| Title line | Report-local number circle, type chip, type-colored title, then optional chips: `↳ N subagents`, `🌿 N forks`, `🌿 Forked`, `N w/s refs · 1 conv` (magenta), `⑂? Likely fork` or `⑂? Likely copy` |
| Subtitle | Bold turns, `📁` project, `🌅` created, `🔄` updated (omitted when the same displayed minute), models chip, credits chip, tokens chip, edits chip |
| Status line | Backing status (`✅ verified`, `⛔ unsupported`, `❓ unresolved`), export-support chip, `🙈 Ignored: reason`, ambiguous child scopes, `🟠 Ambiguous mapping`, `🚨` errors, `🚫` canceled, `🔎` audit notes, `wsID:`, then `sID:` (or `agentID:` for a sub-agent) |

Usage and model chips are left out when unavailable; the expanded card says so. Collapsed header chips never replace the full evidence in the body.

### Find panel and quick chips

Quick-filter chips (all active chips must match): Local, Verified, Unresolved, Has children, Sub-agent, Recorded fork, Tentative hints, Multiple models, Auto, Files changed, Editing history, Artifacts, Request errors, Canceled, No response evidence, Metadata only, Audit notes. Their meaning is the same as the matching header chip; `Metadata only` means detailed content was not read.

### Associated project

- A project is a distinct recorded workspace identity URI (`folder` or `workspace` kind). Two storage folders pointing at one URI are one project.
- A chat uses its own references' identities. If it has none (for example a sub-agent with no index row), it inherits its recorded parent's. If none exists, the `cwd`/git root/working directory context is used for the displayed name only; with nothing, the project is `??` (not recorded).
- The `agent-sessions.code-workspace` identity is ignored when another identity exists, so agent chats show the real project.
- A chat saved by a window with no folder open (global storage) shows `(empty window)` instead of a project. It stays under "No recorded project" in the filter and chart because no workspace identity was recorded.
- The header shows `📁` and the last path segment; the tooltip has the full URI (and notes inheritance). Colliding names are disambiguated with the parent folder, more segments, then `#ordinal`.
- A multi-project chat appears under every project in the filter and chart. The TOC shows `📁 name +N`.

### Titles at each storage level

The first expanded section lists each distinct title value once, with every storage level that recorded it joined by `·` (for example the index title, journal custom title, derived first question, SDK workspace metadata, delegation arguments). Compare/Link/TOC controls sit at the top right of this section. The header title is chosen by the child-title preference in the text conventions below; differences between references stay in the technical identity table (`Listing title`, `Title: <source>`). The titles are not shown as a table because they can be long.

### Ordered prompts / turns

```text
1. [👤] 261002_15:24 [GPT 5] [Auto] [🧠 Effort: high] [💳 4c] [⬆️…] [🚫] [🚨] [✏️ 2 +10 -3]
   prompt preview (first 50 + last 20 words past 70)
   ▸ Full prompt · 120 words · middle clipped (only when clipped or derived)
   ▸ ✏️ Files changed by this turn
```

- Each turn is a rounded bordered card with an anchor (`#session-N-turn-M`) used by the model-switch timeline.
- The role chip is `👤` for a human prompt, `↳ delegated` for a sub-agent's initial task from its parent, and `💬 follow-up` for later sub-agent prompts.
- Turn dates drop the year when it matches the creation year. Credits and tokens use the same chip format as the header, from that turn's counters only. Unavailable chips are omitted.
- If the conversation could not be read the section shows a warning that unknown is not empty.

### Credits and tokens

- Header: `💳 43c` and `⬆️~15.4M ⬇️~730k`, each only when recorded. The expanded card has one disclosure, `💳 Credits / 🔢 tokens`, with the same chips and a table: recorded metric, counted-turn sum and coverage (`recorded/total counted turns`) with the source field (`request.copilotCredits`, `request.promptTokens`, `request.completionTokens`).
- With none recorded there is no disclosure; the notes area shows a neutral `Usage unavailable` chip.
- Sums cover counted Local requests, once per conversation (not per reference). For Local chats there is no conversion between tokens and credits and no parent-to-child attribution.
- **Agent chats (Agent Host and Copilot CLI)** use the same chips, with credits taken from recorded nano-AIU / 1,000,000,000 (1 credit = $0.01), never from tokens. Per turn: the per-call rows (the Copilot CLI store `~/.copilot/session-store.db`, else `model.model_call_success` events) where they cover about every assistant reply of the chat; otherwise the difference between the log's running totals (`session.usage_checkpoint` / `session.shutdown`). The turn chip says which: a `from totals` chip for running-total turns, a `turns a-b` chip when one checkpoint covers several turns (the credits sit on the last of them), a `partial rows` chip when only incomplete per-call rows exist (a lower bound). A turn with nothing recorded shows no chip. Tokens exist only where per-call rows exist (input includes cache reads and writes). The header chip is the sum of the turns with `~` when some turns have none; its tooltip adds the log's last total for the whole file.
- The agent disclosure table lists: credits shown, credits added before the first prompt, the last logged total for the whole log (with the shutdown count), per-call rows against assistant replies and their source, credits not matched to a turn, token rows, and a by-model table. A delegated-agent entry shows only that agent's own recorded calls matched by agent ID (agents it started itself are not included).

### Dates

- Header dates are `🌅` created and `🔄` updated in `YYMMDD_HH:mm`, both bold. For SDK chats they come from the minimum and maximum scoped event timestamps; otherwise from the grouped inventory dates.
- `Dates and provenance` lists each non-prompt date with its source label and the recorded value in a tooltip. Prompt or event timestamps are in a collapsed disclosure with their count (or one field line if there is a single one), so they are not repeated in the technical identity table.
- Exact epoch values for created and activity timestamps appear in the technical identity table.

### Family / relationships and sub-agents

| Relationship | Evidence | Display |
| --- | --- | --- |
| Parent / child | Persisted parent tool-call and agent binding | `Parent` or `Child` entries, breadcrumb trail (`A → B → C`), indented tree |
| Recorded fork | Persisted fork metadata | `Recorded fork from` / `Forked child` and `🌿` chips |
| Peer | Distinct verified main chats under the same exact Agent Host session key | Listed as `peer`; not a fork or delegation |
| Likely fork | Title starts `Forked:` and all prompts match a strict prefix of the unique shortest longer chat | `⑂? Likely fork` with `BEST-EFFORT` explanation |
| Likely copy | Same title, every prompt, prompt count and scoped bytes | `⑂? Likely copy` with `BEST-EFFORT` explanation |

- Targets outside the inventory, or not uniquely identified, are labeled that way instead of linked. The tree stops at 32 levels or a cycle.
- Hints are never used for grouping, export selection or deletion advice.
- A sub-agent is an ordinary conversation card typed `↳ Sub-agent`. Its parent carries `↳ N subagents`. A child shares its parent's SDK backing, so its Why/source says `Shared parent backing · scoped child` and its bytes are the scoped slice, not a separate file. Child project and fallback title come from the recorded parent, and its header ID is the exact `agentID`.

### Ignored sessions

| Reason | Meaning |
| --- | --- |
| `new-chat-unknown` | A `New Chat` placeholder whose created date and prompt count are both unknown; not proven empty |
| `confirmed-empty` | A Local journal with no requests, pending requests or pending edits, or a provider source whose resolver confirmed it is empty |
| `fix` | A `/fix` command session |
| `ambiguous` | The exporter could not choose one provider backing or child scope safely |

`superseded-placeholder` is declared in the visibility type but nothing currently assigns it.

Ignored groups show `🙈 Ignored: reason` in the header and technical identity, and appear in the TOC. Without `--show-ignored` the `Ignored sessions` section holds their full cards, independent of main filters and the newest-25 limit. With `--show-ignored` they appear among the main cards and the section only links to them. A link from either place reveals the card without changing its identity.

### Needs attention panel and orphan-like conditions

The report does not classify "orphans" and does not judge importance or deletability. The page-level `Needs attention` panel (after the project chart) lists evidence-based conditions only, and each row's Show button filters the cards to exactly the counted chats (it is a condition filter that Reset filters clears, separate from the quick chips). Counts cover the chats listed in the report; groups hidden by default rules are pointed to through `Ignored sessions` instead of counted. One chat can match several rows.

| Condition (flag) | Meaning | Also visible in the card as |
| --- | --- | --- |
| ❓ Unresolved backing (`unresolved`) | A reference exists but no readable conversation content was verified | Status chip, health check, `Unresolved backing` in the chain |
| ⛔ Unsupported provider key (`unsupported`) | The index uses a provider key the exporter cannot resolve | Status chip |
| 🟠 Ambiguous mapping or child scope (`ambiguous`) | Identity or child-scope evidence fits more than one candidate | `🟠 Ambiguous mapping` / `❓ N ambiguous child scope` chips |
| 🧾 Journal without index entry (`journal-only`) | A Local journal exists but no persisted index entry names it | Reference basis `Journal without index entry` |
| 🚨 Unreadable or changed source (`unreadable`) | Reading failed, or the file changed during the run | Danger health check |
| 🔗 Parent or fork source outside this inventory (`dangling-link`) | A recorded parent or fork origin is not among the listed chats | Family link labeled as outside the inventory |
| 🔎 Audit notes (`audit`) | Parser or audit flags such as partial edit evidence | `🔎 N audit notes` chip |

Other related, deliberately not flagged: a sub-agent with no own index row (`Derived through parent`) is normal, so it only gets an info health check; `No recorded index entry` is a reference basis, not a problem by itself. Rows appear only when their count is above zero. With nothing to report the panel is a single `none detected in the checks performed` line. The panel carries no cleanup advice; the unified evidence table's `Potential impact if removed` column stays qualified.

### Why/source contents

**Status line:** `Verified <kind> binding at inventory time` or `Backing unresolved`, `Content: <state>`, and `Shared parent backing · scoped child` for sub-agents.

**Health checks · Audit flags / diagnostics:** visible, one card per distinct note, toned 🚨 danger (unverified backing, content not read), ⚠️ warning (diagnostics, audit flags, identity and scope warnings) or ℹ️ info (no own index entry). A clean card shows `none detected in the checks performed`.

**Where it is referenced (N):** table columns are `Ref` (the W chip), `Project / workspace` (links to the workspace line), `Reference basis` and `Context` (`cwd matches` and `Additional workspace reference`). Reference basis values: `Persisted index entry`, `Derived through parent`, `Journal without index entry`, `No recorded index entry`.

**Chain at a glance:** the first reference's route as nodes joined by arrows: W chip and workspace name, reference basis, optional `Parent identity + verified child scope`, identity-evidence database names, then the backing file (`shared with parent` for children) or `Unresolved backing`. With several references, derivation or an unresolved backing, a `Detailed lineage map` disclosure shows one route per reference. It is a recorded evidence route, not a VS Code lookup order.

**Storage summary:** scoped payload with exact and abbreviated size and what the scope measures, the checked Local journal and sibling total where available, and the non-additive size caveat.

**Unified evidence table** (one disclosure; opens above its nested technical identity):

| Column | Contents |
| --- | --- |
| Artifact | Kind: workspace.json, state.vscdb (and `-wal`/`-shm`/backup sidecars), journal or events file, agent-host.db, session.db, workspace.yaml, chatEditingSessions, transcripts, debug-logs, other. Empty-window references omit workspace.json and use the global `state.vscdb` |
| Value | Prefixed path (`‹.copilot›`, `‹WS›`, `‹Global›`, `‹Agent›`, `‹Code›`; the tooltip shows the base) with `↗` open and `📋` copy of the full path, then a `Composition / what uses the bytes` disclosure (SQLite keys, JSONL kinds, directory children) |
| Size / state | Bold abbreviated size and small exact bytes, measurement state, modified date, file count |
| Tied to | W chips for the references that use it, `N report chats / M refs` sharing counts, `Global database` pill for agent-host.db |
| Purpose | Plain-language role of the artifact |
| Potential impact if removed | Qualified informational consequence; never an instruction |

There is one row per unique artifact path across the card's references. Above the table are the W labels with their workspace names. Rows are not exclusive ownership.

**Technical identity / all unique values and reference differences:** a Field / Unique value / Seen in table with one row per distinct field and value, so identical values across references are merged and differing ones show which W labels carry each. Fields include full and native session IDs, occurrence and parent IDs, title and activity evidence, listing title, timestamps, visibility, provider, user-data root, workspace name/identity/storage/ID, index key, backing session ID/path/provenance, schema version, inventory SHA-256, producer, chat identity, scope, identity evidence and warnings, context fields (such as `cwd`), per-source titles and non-prompt dates, content state and scoped bytes. Values over about 30 characters get a copy button. Prompt text and per-event timestamps are not repeated here.

## Vocabulary, abbreviations and IDs

| Display | Meaning / convention |
| --- | --- |
| `MD` | Markdown; use in compact chips instead of spelling out the word |
| `TOC` | Table of contents |
| `ref` / `refs` | Reference(s), not copies |
| `3 w/s refs · 1 conv` | One grouped conversation referenced from three distinct workspace stores |
| `W1`, `W2`, `W3` | Reference labels local to this card/report snapshot; not global IDs or priority rankings |
| `#54` | Position in the generated report, not a persistent session identifier |
| `wsID` | Workspace storage directory name; do not diagnose corruption from its length |
| `sID` | Detailed header session identifier; provider/native key remains available in evidence |
| `agentID` | Exact verified child-scope agent ID; not the parent's SDK session ID |
| Occurrence ID | Exporter identifier for one discovered reference |
| Backing session ID | Identity of the SDK backing session or Local journal, distinct from a workspace occurrence |
| `cwd` | Recorded working directory, which can differ from the workspace identity |
| `k` / `M` | Compact token counts; not exact counters |

**UUID shortening:** console/basic listings remove UUID hyphens and show a hexadecimal prefix of at least eight characters. The prefix grows until it distinguishes different UUIDs in the inventory; it has no ellipsis. `--full-ids` requests complete IDs in those listings. Non-UUID provider/native keys are not shortened by this rule. A prefix is not universally unique outside that inventory.

**Export selection:** a short prefix can select a Local journal only when it resolves uniquely in the selected root. The same UUID in multiple workspace stores requires an exact journal path. A short selector is not proof that two references share the same content. Detailed card headers do not apply this prefix rule; full provider/native, backing and occurrence identities remain in technical evidence.

## Icons, colors and chips

| Type / signal | Convention | Why |
| --- | --- | --- |
| Local | 💬 Blue | Editor conversation |
| Agent Host | 🤖 Purple | Agent-hosted conversation |
| Sub-agent | ↳ Amber/brown | Delegation, not an unrelated main chat |
| Copilot CLI | 💻 Teal/green | CLI agent conversation |
| External | 🌐 Pink | Other provider |
| Other | 📦 Neutral | Unclassified type, not automatically an error |
| Human prompt | 👤 with `human` tooltip | Distinguish from delegated/follow-up tasks |
| Created / updated | 🌅 / 🔄; bold dates | Save chip space while retaining tooltip explanations |
| Edits | ✏️, file count, green additions and red removals | Recognizable change summary |
| Workspace references | Bold magenta text and border | Distinct from amber relationship hints |
| Tentative fork/copy | `⑂?` with best-effort explanation | Unproven relationship, never grouping identity |
| Recorded fork | 🌿 | Separate from tentative hints |
| Usage | 💳 credits; ⬆️ input / ⬇️ output tokens | Distinguish credit and token measures |
| Actions | 📌 Compare, 🔗 Link, 🔝 TOC, 📋 Copy | Small, recognizable controls |

Type color belongs to the rounded card border, title and type chip. Status colors have separate meanings: success/verified, warning/ambiguous and danger/error. Verification is a backing-identity claim, not an export-support or completeness guarantee. Light/dark palettes preserve the same semantic categories rather than identical color values.

Models share one Arial Narrow chip. Show up to three answering-model labels in compact headers; use a model count beyond that. Short display labels retain raw IDs in tooltips and detailed evidence. Auto, selected model and reasoning effort are separate facts; selection alone does not prove which model answered. The reused 🤖 model/type icon is an existing convention with a distinct-model-icon decision still deferred.

## Dates, usage and uncertainty

| Item | Convention |
| --- | --- |
| Main dates | `YYMMDD_HH:mm`, generator-local time |
| TOC activity | `MMDD-HH:mm`; full evidence is available elsewhere |
| Turn dates | Omit the year only when turn and creation share a known generator-local year |
| Equal created/updated | Omit updated when the formatted values fall in the same displayed minute |
| `?` | Missing minor detail |
| `??` | Missing headline value after evidence was read |
| `???` | Source could not be read or verified |
| `~` | Partial recorded usage total, not a guessed counter |
| Credits | Round up to whole credits; preserve provenance/coverage in expanded details |
| Token chips | For example `⬆️~15.4M ⬇️~730k`; compact rounded counts |
| Unavailable usage/model | Omit collapsed/per-turn chips; state unavailability inside the expanded card |

Unknown values are never converted to zero. A tooltip explains missing evidence. Local usage coverage is assessed independently for credits, input tokens and output tokens. SDK usage correlation remains deferred; do not assign parent usage to a child or convert tokens into credits.

## Text, paths, sizes and typography

- Use readable `rem` sizing. The detailed report currently uses a 125% root scale; Arial Narrow is a density aid for titles, metadata, controls and long evidence values, not a reason to make everything tiny.
- Project names are bold orange monospace with full paths/URIs in tooltips. Card controls align at the expanded card's top right; unavailable-usage notes remain in normal left-aligned flow.
- Long prompt previews show the first 50 and last 20 words above 70 words, separated by `. . . . .`. Retain one full-text disclosure when clipped or materially derived; do not repeat a complete prompt merely because whitespace differs.
- Identical title values share one row with their source labels. Keep per-reference differences in technical identity. A child heading prefers recorded titles/delegation evidence before `Subagent (parent title)` fallback.
- Exact bytes use commas, regular weight and small Arial Narrow. The binary-scaled abbreviated value uses bold normal-font text: **18.7 MB** `19,606,580 bytes`. MB/KB here use powers of 1024; logical, scoped and physical bytes remain distinct.
- Paths can use `‹Code›`, `‹WS›`, `‹Global›`, `‹Agent›` and `‹.copilot›`. Hover exposes the base; a file link opens the full location and a copy control copies the full value subject to redaction.
- W badges identify references, not exclusive artifact ownership. Report-sharing counts include inventoried hidden occurrences. Directory totals overlap descendant-file rows; SQLite logical values overlap database pages; child scope bytes overlap shared SDK files.
- Tables scroll within their own wrappers on narrow screens. The page itself should not overflow horizontally. Keep long values wrap-friendly.

## Rebuilding the report

This section is the checklist for another engineer or AI to rebuild the detailed report. Use it with the wireframes above, the [draw.io wireframe](diagrams/html-report-wireframe.drawio) and the linked source. The design is the contract; exact markup, class names and palettes live in the source.

### Inputs

| Input | Source type | Provides |
| --- | --- | --- |
| Occurrences | `SessionOccurrence[]` in [sources.ts](../src/session/sources.ts) | One row per discovered workspace/provider reference: title, provider, workspace identity, backing status, diagnostics |
| Conversation groups | `ConversationGroup` in [listing-model.ts](../src/session/listing-model.ts) | One conversation per verified identity, with its occurrences, timestamps, prompt count, visibility |
| Evidence | `ListingEvidence` in [listing-evidence-types.ts](../src/session/listing-evidence-types.ts) | Titles, turns, models, usage, files, dates, history, artifacts, context, flags, storage |
| Storage | `StorageArtifact[]` from [listing-storage.ts](../src/session/listing-storage.ts) | Read-only artifact sizes, composition and report-local sharing |
| Options | `SessionListingOptions` | `showIgnored`, `last25`, `fullIds`, diagnostics |
| Generation time | ISO string | Header date, generator-local formatting |

### Page behavior

| Behavior | Rule |
| --- | --- |
| Selection | The main candidates are groups whose visibility is included (sub-agents are ordinary groups); `--show-ignored` adds ignored groups; `--last25` limits the initially shown set to the newest 25. Ignored groups also get their own section, independent of the main filters |
| Card data | Each card carries title, type, status, project keys (JSON), models (JSON), chip flags, turns, bytes, created/updated timestamps and generator-local days as `data-*` attributes. `data-search` is omitted unless required values are absent from designated rendered text, such as exact model IDs behind friendly names or aggregate file paths without rendered turn rows |
| Search cache | At initialization, a text-node walker indexes prompt previews/full disclosures, turn metadata/file rows, scoped technical values, artifact values/composition and diagnostic cards, adding exact `data-copy` paths and supplemental values. Fragments are separated by spaces and normalized once. Headings, controls, captions, uncertainty placeholders and unrelated family labels are excluded; tooltips are not indiscriminately indexed. Shared conversation fragments are reused by occurrence indexes; `data-search-refs` associates technical/artifact/diagnostic content with the appropriate 1-based workspace references. Occurrence rows use short `data-conversation`/`data-reference` associations and do not require `data-search` |
| Filters | Case-insensitive substring search words are ANDed across cached identifying/investigative fragments. Full collapsed prompts remain searchable. Grouped search includes all its references; occurrence search includes only its own workspace/source metadata plus shared conversation content. The ignored section remains outside main filters unless `--show-ignored` includes it. Type, backing and model are exact matches; model `?` means no answering model recorded. Project filter is inclusive; `__multi` means two or more projects, `__unknown` means none. Active quick chips are ANDed. A Needs attention Show button sets one extra condition (ANDed with the rest) after clearing the others; Reset filters clears it. Date and numeric ranges never match unknown values |
| Tooltip content | Generation omits titles that repeat the complete normalized visible label/value. Informative explanations, uncertainty reasons, exact IDs behind friendly labels and full paths behind abbreviations remain. Accessible labels are independent; copy controls retain their exact redacted values and accessible names |
| Sorting | Updated, created, turns, bytes or title; unknown values sort last; ties break by card ID; the direction toggle reverses it |
| Views | Grouped conversations or workspace occurrences; the count line reports shown/total for the active view |
| Density | Collapsed (default), compact, or comprehensive (opens every card and inner disclosure) |
| Link reveal | Any `#anchor` click resets filters, shows the grouped view, lifts the newest-25 limit for the target, opens every ancestor `details`, highlights the card briefly and focuses the target |
| Comparison | At most two cards can be pinned; each shows a clone of the card's summary panels; a third pin is refused with a message |
| Copy | Copy buttons carry the exact value in `data-copy`; failures are stated, never silent |
| No JavaScript | All main cards and detailed evidence remain readable. Filters, sort, pinning and copy are unavailable. |

### Chip catalog

| Chip / element | Shown when | Text and tooltip |
| --- | --- | --- |
| Type | Always | Icon and label from `detailedTypeOf`; type color class |
| Subagent count | Recorded immediate children exist | `↳ N subagents` |
| Fork / forked | Persisted fork metadata | `🌿 N forks`, `🌿 Forked` |
| Workspace references | More than one distinct workspace storage folder | `N w/s refs · 1 conv`, bold magenta text and border |
| Likely fork / copy | Content-based hint exists | `⑂? Likely fork` or `⑂? Likely copy`, never used for grouping |
| Turns | Always | Bold count, `??` or `???` when missing; tooltip explains what is counted |
| Project | Always | 📁 and the last path segment; the full URI in the tooltip; inherited from the parent for sub-agents |
| Created / updated | Created always (`??`/`???` if missing); updated only if it differs by displayed minute | 🌅 / 🔄, bold, `YYMMDD_HH:mm` |
| Models | Answering models recorded | One Arial Narrow chip, `🤖 A · B · C`; more than three labels collapse to `🤖 N models` in the header; raw IDs in the tooltip |
| Edits | Files changed | ✏️, unique file count, `+added`/`-removed` |
| Credits | Credits recorded | `💳 43c`, rounded up, `~` when partial; tooltip shows coverage |
| Tokens | Token counters recorded | `⬆️~15.4M ⬇️~730k`; no prefix icon; tooltip explains coverage and repeated context |
| Backing status | Always | ✅ verified, ⛔ unsupported, ❓ otherwise |
| Export support | Always | `Local MD export supported`, `Local export: exact path required`, `Verified SDK source; MD export not implemented`, `No verified export backing`, or a refresh warning |
| Ignored / ambiguous / errors / canceled / audit | Matching evidence | 🙈, 🟠/❓, 🚨, 🚫, 🔎, in warning or danger tone |
| IDs | Always | `wsID:` workspace storage folder(s) and `sID:` or `agentID:` in code style |

### Styling tokens

- Light and dark themes share semantic variables: `--type-color` per type, plus success, warning, danger and neutral tones for status chips. Exact values are in [detailed-listing-styles.ts](../src/session/detailed-listing-styles.ts); do not invent new ones.
- Root font size is 125% with `rem` sizes elsewhere. Arial Narrow is used for dense titles, models, exact bytes, field labels, paths and small controls; body text uses the page's system font.
- Required responsive behavior: no page-level horizontal scroll; tables scroll inside `.table-wrap`; grids collapse with `min-width: 0` constraints.
- Content Security Policy permits only the hash-authorized inline script and inline styles; no external resources.

### Rebuild checklist

1. Group occurrences and compute the shown set, type and status counts, project and model counts, and relationships.
2. Render the header, metrics, three charts, project chart, Needs attention panel and TOC.
3. Render the Find panel from the real option sets, with `data-filter` and `data-chip` attributes.
4. Render one card per group using the card wireframe, omitting empty or unavailable sections as described above.
5. Render Why/source from the source module, preserving per-reference attribution and the non-additive size rules.
6. Add the occurrence view, guides, ignored section and footer.
7. Add the hash-authorized controller and CSP.
8. Verify with `npm run verify`, then check both themes, a narrow viewport and the no-JavaScript reading. The acceptance script and screenshots are in the work log and the local reference archive.

Sample fixtures and golden renders are in the repository tests; see [detailed-listing.test.ts](../test/detailed-listing.test.ts) and [detailed-listing-rules.test.ts](../test/detailed-listing-rules.test.ts). A rebuild is faithful when those assertions and the acceptance checks pass, not when the markup matches byte for byte.

## Interaction and maintenance

In conventional output, native `details`/`summary` provides collapsed reading without JavaScript. Filtering, copying, comparison and enhanced navigation require JavaScript. Copy failure must be stated explicitly with manual-copy guidance. Comprehensive density opens cards/inner sections; balanced reading starts compact. Preserve exact target identities when revealing linked ignored/limited cards.

Reports are identification aids, not near-lossless exports or atomic backups. Preserve redaction, HTML escaping and offline security policy. Do not imply global-store coverage that discovery does not implement. No warning means only that the checks performed found none.

Known limitations: the report is large because each card carries its own Why/source evidence (a show-ignored sample with 277 cards was about 21 MB; the work log has a size audit and options), so very large inventories can be slow to open; there is no automatic orphan classification beyond the evidence-based Needs attention conditions; the Peer relationship exists in the model but is rare in real data.

Before changing the design, check the basic/detailed distinction, density at desktop and narrow widths, both themes, native reading, per-reference attribution, unknown/partial states and duplication. Keep related rendering tests and browser acceptance checks aligned with intentional changes. Archive generated comparisons under ignored `temp-tool-output`; historical screenshots and sizes are examples, not authoritative current evidence.

### Implementation references

- [listing-model.ts](../src/session/listing-model.ts): grouping and compact UUID selectors.
- [basic-listing.ts](../src/session/basic-listing.ts): basic table and source-panel layout.
- [detailed-listing.ts](../src/session/detailed-listing.ts): page/card composition.
- [detailed-listing-presentation.ts](../src/session/detailed-listing-presentation.ts) and [listing-preview.ts](../src/session/listing-preview.ts): types, titles, projects, previews, dates and model labels.
- [detailed-source.ts](../src/session/detailed-source.ts): consolidated source presentation and size formatting.
- [detailed-listing-styles.ts](../src/session/detailed-listing-styles.ts) and [detailed-listing-controller.ts](../src/session/detailed-listing-controller.ts): themes, typography and interactions.

Recorded design and validation history is in the [work log](../work-log.md). The local [reference archive index](../temp-tool-output/reference-archive-261013_1844/index.html) is an optional ignored comparison collection, not a shipped dependency.

Optional detailed report packaging: `--detailed --compressed` uses gzip level 9 with native `DecompressionStream`, no network, iframe or runtime dependency. Conventional HTML remains the default and retains detailed no-JS reading. The complete overview/TOC and controls remain static; decoding starts after first paint where supported. Cards use same-document `innerHTML`; pending filters, attention actions and links apply after initialization. Unsupported/corrupt output shows an explicit regeneration message. Compression reduces file bytes, not expanded DOM. See [the work log](work-log.md) for acceptance and measurement context.

Brotli extension: `--detailed --compression gzip|brotli` selects a codec; `--compressed` stays a gzip alias and conflicts with explicit Brotli. Brotli quality 8/window 24 embeds the pinned build-only `brotli-dec-wasm@2.3.2` decoder, WASM, MIT license and upstream notices. Only Brotli permits CSP `wasm-unsafe-eval`; there is no general JavaScript eval or runtime npm dependency. The streaming decoder requires successful completion, full input consumption, expected output length, CRC32 and strict UTF-8. Checksums are not authentication. Fixed decoder overhead can make small reports larger; no automatic codec selection occurs. `scripts/generate-brotli.mjs` checks the pinned WASM hash and generates the assets; build regenerates them. Keep the generator, generated assets, notices and lockfile together.
