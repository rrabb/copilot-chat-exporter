# WI-015: Discovery and selection

Canonical entry: [WI-015](../work-log.md#wi-015). Code links use commit `cba16b37b7e31de73530b355e9200edefa82b04c`. Historical links use `180a06ce10eace027c8937c6c20331e5f3b524b0`.

## At a glance

- Goal: find chats in supported stores and select the intended root and source without guessing.
- An explicit root wins. One discovered root is selected automatically. Multiple roots need a terminal choice or an explicit flag.
- No-argument CLI runs list chats. Local exports need an ID, prefix, journal path or verified `--current`; SDK main chats also accept qualified keys.
- Inventory includes workspace and empty-window journals, indexes and provider references. Other profiles and remote stores aren't established as covered.
- Rejected: defaulting to the newest chat or first root, grouping by title or UUID alone, and discovering nested backups or transferred copies as separate chats.
- A synthetic check found that an SDK chat can win over a colliding Local selector. [WI-044](../work-log.md#wi-044) tracks that risk.
- Another check found that unreadable stores can hide duplicates or disappear from inventory diagnostics. [WI-045](../work-log.md#wi-045) tracks that risk.
- Work tree: 0 of 2 children done. Exact Local journal paths worked as a workaround in the collision probe.
- [WI-003](WI-003-remaining-manual-acceptance.md) records later chooser acceptance. [WI-007](../work-log.md#wi-007) keeps separate inventory evidence questions.

## Original goal

Compare the incomplete listing and unexpected default export with the sister tool. Discover journals, index-only entries and provider references in the selected root, keep their provenance, and select the intended chat without guessing. The [old backlog](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L342) covers research, roots, CLI selection, inventory and the additional global stores.

## Done when

These are the original criteria for the accepted work. The later findings below record exceptions without reopening the product item.

- Discover the supported workspace and empty-window stores, keep index-only and provider references, and report unavailable or unresolved sources.
- Choose an explicit root, select the single discovered root, or ask on a terminal when several roots exist. Fail instead of guessing in non-interactive use.
- List by default. Require an explicit source or verified current-session evidence for export. Report ambiguous Local IDs and accept exact journal paths.
- Exclude the agreed backup and temporary-copy stores from discovery. Keep valid explicit journal paths usable.
- Validate the supported cases with synthetic checks and record the required interactive acceptance separately.

## Work tree

Progress as of 261104: 0 of 2 children done.

| # | Item | Type | Size | Do after |
| --- | --- | --- | --- | --- |
| 1 | [WI-044 Cross-provider selector collisions](../work-log.md#wi-044) | [build] | M | - |
| 2 | [WI-045 Unreadable discovery sources](../work-log.md#wi-045) | [build] | M | - |

## Current understanding

| Area | Evidence and limit |
| --- | --- |
| Roots | **Inferred from source:** [root discovery](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/host.ts#L32) supplies Code, Insiders, Exploration and VSCodium candidates. [Resolution](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/roots.ts#L45) honors an explicit root, handles one or several candidates, and reports cancellation or invalid choices. The [CLI](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/cli.ts#L292) supplies a chooser only when stdin and stdout are terminals. |
| Stores | **Inferred from source:** [inventory](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/inventory.ts#L98) reads immediate workspace stores and the empty-window journal/index store. `no-workspace` is an ordinary workspace-store directory. It keeps index-only and unsupported provider entries instead of inventing exportable content. The [synthetic test](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/test/inventory.test.ts#L188) covers the legacy folder and excludes transferred chats. |
| Local selection | **Inferred from source:** [Local lookup](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/locate.ts#L219) accepts a UUID, a hexadecimal prefix or an exact `.jsonl` path. When it sees multiple matching journal paths, it requires the exact path. `--current` checks the Local environment identity and selected workspace root. The unreadable-store and cross-provider exceptions are below. |
| SDK selection | **Inferred from source:** [SDK lookup](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/sdk-export.ts#L96) accepts a verified main chat's qualified key, native ID, backing ID or prefix. Repeated references to the same backing and chat identity count once. Subagent conversations render inline in the parent; [WI-019](WI-019-agent-chat-export.md) owns that later decision. |
| Grouping | **Inferred from source:** [grouping](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-model.ts#L27) uses the Local ID and byte digest, or provider identity, backing ID and scope. It doesn't group by title. Grouping doesn't make duplicate Local paths safe to select by ID. |
| Coverage limits | **Documented:** the [old scope](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L903) doesn't promise a scan of every profile, remote store or unreferenced Copilot session. [WI-007](../work-log.md#wi-007) still needs evidence for placeholder and child-chat cases. Historical counts describe past captures, not current coverage. |
| Acceptance | **Documented:** the old log still listed interactive acceptance as outstanding. [WI-003](WI-003-remaining-manual-acceptance.md#at-a-glance) records the later Code and Insiders chooser checks and Code listing review on 261103. |

## Decisions and tradeoffs

| Decision or rejected approach | Reason and evidence |
| --- | --- |
| Reject an implicit newest-chat export | It can export the wrong conversation. The dev chose listing by default and explicit source or verified `--current` for both CLI and library callers. See the [decisions](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L441) and [library decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L449). |
| Reject choosing the first root or silently combining roots | Multiple installations can contain different chats. The [root decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L432) requires a terminal choice or explicit flag when there are several. |
| Reject grouping by title or UUID alone | Similar names and copied IDs don't prove identical conversations. The [decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L435) requires verified provider identity or matching Local ID and raw-byte digest. |
| Reject discovering nested `bkup2` journals as extra chats | The dev excluded backups to avoid duplicated inventory. A valid journal can still be selected by exact path. See the [decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L397) and the synthetic check below. |
| Reject discovering `transferredChatSessions` as extra chats | The [old log](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L363) described these as temporary VS Code copies. The current inventory excludes them. The current VS Code writer and retention period weren't rechecked. |
| Reject a guessed SDK backing for peers, corrupt mappings or a missing local database | The approved default-chat fallback requires an existing session database and a matching SDK header, with a warning. See the [decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L433) and [resolver](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/provider-sources.ts#L89). |
| Reject treating every unknown placeholder as empty | The [decision](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L439) hides only `New Chat` with both creation date and prompt count unknown. The filter doesn't prove the chat is empty. |

## Findings and outcomes

### Cross-provider selector collisions

**Observed here:** a synthetic Local journal and SDK chat had different IDs sharing the displayed eight-character Local prefix. The CLI exported the SDK chat when given that prefix. A second case used the same complete UUID for both sources; the CLI again exported the SDK chat. Supplying the Local journal's exact path exported the Local chat in both cases. These checks used synthetic content, not the dev's chats.

**Inferred from source:** [short ID generation](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/listing-model.ts#L42) compares the Local ID with the qualified provider key, not the SDK's selectable native or backing ID. The [CLI](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/cli.ts#L340) tries [SDK selection](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/sdk-cli.ts#L62) before Local lookup. SDK selection doesn't compare its match with Local journals. This can export a different chat than the Local selector suggests. [WI-044](../work-log.md#wi-044) covers the collision and listing-selector checks.

**Owner question:** When a selector matches both a Local and an SDK chat, should the CLI error, prefer one, or require a qualified key? The dev decides before any build.

### Unreadable discovery sources

**Observed here:** two synthetic workspaces contained the same Local ID. Normal lookup reported both paths. After an injected `EACCES` on one workspace's journal directory, lookup returned the other path as unique. Inventory reported that unreadable workspace directory. A separate injected `EACCES` on both global-store existence checks caused an existing empty-window journal to disappear without a global-store diagnostic.

**Inferred from source:** [Local enumeration](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/locate.ts#L137) skips directory-read errors before [resolving IDs](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/locate.ts#L240). [Global-store detection](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/inventory.ts#L120) treats any `stat` error as absence. [WI-045](../work-log.md#wi-045) covers incomplete discovery and safe selection. The checks injected errors; they didn't change filesystem permissions or establish how often this happens.

### Historical corrections

**Documented:** the archive's [October 17 gap](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L602) said Local ID lookup missed empty-window journals. The [October 19 follow-up](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L5) records the correction. Current [lookup code](https://github.com/rrabb/copilot-chat-exporter/blob/cba16b37b7e31de73530b355e9200edefa82b04c/src/session/locate.ts#L175) and the focused synthetic test agree. The earlier exact-path check used an empty journal, so it wasn't evidence of nonempty-content fidelity.

## Validation and limits

- **Observed here:** `node --test temp-tool-output\wi-015-selection-261104-1315.mts` ran six isolated probes. They reproduced both selector collisions, the two unreadable-store cases, the filename mismatch filed in the Inbox, and the `bkup2` exclusion with exact-path lookup. Passing probes describe current behavior, including bugs; they aren't approval of that behavior.
- Focused synthetic tests covered roots, Local lookup, inventory, provider lookup and CLI dispatch. All 27 selected tests passed. The first attempt failed before tests ran because Node rejected a Windows path as an import specifier; the retry used a file URL. The [rerun script](../temp-tool-output/wi-015-261104-1315/run-focused.ps1) records the selected tests and isolates the test cache.
- The [probe](../temp-tool-output/wi-015-selection-261104-1315.mts) and [logs](../temp-tool-output/wi-015-261104-1315/) are Git-ignored local evidence and may be absent from another checkout. Fixtures were generated for the checks and cleaned up by the tests. No real session data was read for these checks.
- Full verification and a build weren't run, as requested. The graph reported changed file metadata, so claims above use direct source reads. The cited source matched the clean code at the named commit.

## References

- [Pinned original backlog](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L336), [decisions](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log.md#L427), and [archive research](https://github.com/rrabb/copilot-chat-exporter/blob/180a06ce10eace027c8937c6c20331e5f3b524b0/work-log-archive.md#L657).
- [WI-003 manual acceptance](WI-003-remaining-manual-acceptance.md), [WI-007 inventory evidence](../work-log.md#wi-007), and [WI-019 agent export](WI-019-agent-chat-export.md).
