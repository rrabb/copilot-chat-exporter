# WI-067 Exporter level-of-detail config

Related: [WI-052](WI-052-markdown-level-of-detail-research.md) (LOD research) and [WI-058](../work-log.md#wi-058) (the format workbench). Not a child of either: WI-052 is research only, and this item is the possible build that follows it.

## At a glance

- **Goal:** let the exporter produce short, medium or full Markdown per tool or event category. A config file sets the levels, and the WI-058 workbench can produce it. Later, maybe a local app to pick chats and export them.
- **Decision (261117):** offer optional named CLI presets alongside individual controls. Apply the preset first, then individual overrides. Without either, keep current output unchanged.
- **Still open:** slots, free templates or the middle ground. The dev wants to use the workbench more before choosing.
- **Next step:** the dev edits formats in the workbench. Then we count which edits only drop or keep fields and which rewrite wording. That count picks the model.
- **Prior art:** no tool found offers per-category levels for Copilot chats. See [Related research](../docs/RELATED-RESEARCH.md).

## Original goal

From the dev, 261117: the workbench could give the exporter advanced options for short, medium and full formats. Eventually it could grow into a GUI or web app that lists all chat sessions. You would select one or more, set advanced options or pick a default, and click Export.

## Done when

1. The dev has chosen a format model (slots, templates or the middle ground).
2. The dev has approved a phase plan.
3. Each approved phase has its own WI row.

## Current understanding

### What the workbench gives us (observed here)

| Strength | Why it matters |
| --- | --- |
| Based on real data | The 700 names come from recorded chats on this machine, not guesses. |
| JSON save and load already exist | The config format has a starting point. |
| The detailed listing report (WI-016) already lists chats | It's a read-only start on an app's chat picker. |
| One place to define formats | The design view and the exporter config could share one data model. |

### Counter-arguments and risks

| # | Risk | What happens if we ignore it | Mitigation |
| --- | --- | --- | --- |
| 1 | **Too many settings.** About 700 per-kind settings is too much for almost anyone. | The config becomes the product. Users give up and use the defaults. | Offer optional named presets as starting points, with individual controls for exceptions. Per-kind overrides remain a proposal. |
| 2 | **Free-text formats need a template language.** | Escaping, conditions and clipping rules, plus golden tests for every combination. Large and fragile. | Use fixed slots, or the middle ground (see below). |
| 3 | **Tool and event names change.** VS Code's storage format is private, and the catalogue is a frozen scan of one machine. | The config silently stops matching new or renamed tools. | Unknown kinds fall back to their category or preset default. The export reports config keys that matched nothing. |
| 4 | **Config versioning.** It has already happened once: saved choices use catalogue ID `791301b4`, and the current catalogue is `6547acfe` (observed here). | Old configs break or get misapplied without warning. | Add a schema version. Key settings by name, not catalogue ID. Warn instead of failing. |
| 5 | **Privacy.** The workbench page embeds private recorded examples. | Shipping the workbench as the config UI would leak chat content. | Split a public catalogue (names, fields, categories, synthetic examples) from private evidence that stays local. |
| 6 | **Lossy output conflicts with the project goal.** The goal is near-lossless export, and every omission must be counted. | Short exports could hide content with no trace. | Every short or medium setting still records what it left out, with counts. |
| 7 | **A local web app needs a server that reads chat stores.** A malicious website can use DNS rebinding to reach a local server that accepts any `Host` header and has no authentication (documented by OWASP). | Another site or process could read every chat. | Bind to `127.0.0.1`, check `Host` and `Origin`, require a per-run token, keep chat stores read-only. Or avoid the server (phase 3 below). |
| 8 | **Others may have built it.** | We rebuild an existing tool. | Checked 261117: no existing tool covers this. See [Related research](../docs/RELATED-RESEARCH.md). |

### Format model: three choices

All three answer the same question: how should a short or medium `run_in_terminal` call look? They differ in **who decides the layout**. The rendered examples below are invented, not exporter output.

#### Choice A: fixed slots

The exporter has one built-in layout for each kind of tool. You only switch parts on or off, or set limits.

```json
"run_in_terminal": {
  "medium": {
    "inputs": ["command"],
    "output": "first-lines",
    "outputLines": 3,
    "status": true,
    "duration": true
  }
}
```

Rendered:

> ▶ `pnpm test` ✅ 12.4s
> ```
> > node --test
> ✔ args (3 tests)
> ✔ journal (41 tests)
> … 38 more lines omitted
> ```

#### Choice B: free templates

You write text with placeholders, and the exporter fills them in. This is close to what the workbench text boxes hold today.

```json
"run_in_terminal": {
  "medium": "**Ran** `{{input.command}}` → {{status}} in {{duration}}\n{{output | lines:3}}"
}
```

#### Choice C: middle ground, slots plus a label template

Slots decide which parts appear and their limits. Each kind can add one optional label line with placeholders. The label can't contain block content such as output or code.

```json
"run_in_terminal": {
  "medium": {
    "label": "Ran {{command}}",
    "output": "first-lines",
    "outputLines": 3,
    "status": true,
    "duration": true
  }
}
```

Rendered:

> ▶ Ran `pnpm test` ✅ 12.4s
> ```
> > node --test
> ✔ args (3 tests)
> ✔ journal (41 tests)
> … 38 more lines omitted
> ```

#### Comparison

| | A: Fixed slots | B: Free templates | C: Middle ground |
| --- | --- | --- | --- |
| What you control | Which parts appear and their limits | Exact wording, order and Markdown | Parts and limits, plus the wording of one label line |
| Effort to build | M. Settings plus existing renderers. | L. Needs a template language with filters, conditions and escaping. | M. Slots plus a small placeholder fill for one line. |
| Risk of broken Markdown | ✅ Low. The exporter escapes. | ❌ High. A command with backticks or `\|` can break a table or code block. | ⚠️ Low to medium. Only one inline line, which the exporter escapes. |
| Testing | Few combinations, easy golden tests | Almost unlimited combinations | Few combinations plus label cases |
| Omission counting (a project rule) | ✅ Automatic. The exporter knows what it hid. | ❌ Hard. If a template skips `{{output}}`, the exporter must still count it as omitted. | ✅ Automatic. Output stays in slots. |
| When a tool changes its fields | Missing slots are skipped with a warning | Templates show blank or `{{undefined}}` text | Slots are skipped. The label falls back to the tool name. |
| Expressiveness | Limited to the options we offer | Anything you can write | Custom wording where it's read most, layout fixed |
| Prior art (261117) | The norm: depth ladders and on/off toggles | None of the tools checked documents user templates | Not seen as such |

#### Arguments for each

- **For A:** smallest risk, simplest tests, and every other tool uses this model. It fits a zero-dependency exporter.
- **Against A:** if the dev mostly wants to change how lines read, A feels restrictive. New wording needs code changes.
- **For B:** matches how the workbench text boxes work today. It needs no code change to try a new layout.
- **Against B:** it moves escaping, omission counting and missing-field handling into user text. A bad template can silently drop content, which breaks the project goal. It's also the most work to build and test.
- **For C:** custom wording for the line readers scan most. Output and omission counting stay in the exporter. It costs little more than A.
- **Against C:** two concepts to learn (slots and a label). It also means a small placeholder engine that we have to maintain. If nobody customizes labels, it's extra work for nothing.

**Agent recommendation:** C, or A if workbench edits show labels rarely change. **Not decided.** The dev chose on 261117 to evaluate the workbench first.

**How to decide with evidence:** after the dev saves formats, sort the edits into two groups. Edits that only drop or keep fields point to A. Edits that rewrite wording point to C or B.

### CLI decision, 261117

The dev approved named presets **alongside**, not instead of, individual controls.

| Rule | Reason |
| --- | --- |
| A preset is optional and supplies starting settings. | Common workflows need fewer flags. |
| Individual controls override the preset, regardless of argument order. | Users can keep a preset and change only its exceptions. |
| With neither a preset nor individual controls, keep current output unchanged. | Existing commands keep their behavior. |
| Slots versus templates remains undecided. | The CLI choice doesn't decide how formats are defined. |

These commands illustrate the decision. Flag spelling, preset names and preset contents are **proposed, not implemented**.

```powershell
# Keep today's output
copilot-chat-export <chat>

# Choose a starting point
copilot-chat-export <chat> --preset review

# Override two parts of that starting point
copilot-chat-export <chat> --preset review --reasoning full --shell short

# Use individual controls without a preset
copilot-chat-export <chat> --reasoning full --shell short
```

In the third example, reasoning is full and shell calls are short. Other categories follow the proposed `review` preset.
In the fourth example, other categories keep their current behavior.

**Tradeoff:** presets save typing but can hide which settings an export uses. A resolved-settings preview is worth considering, not approved.
How config-file settings combine with presets and CLI overrides remains undecided.

**Earlier decision clarified:** on 261113 the dev chose individual switches rather than named whole-export levels.
The agent later overstated this as rejecting optional presets too. The recorded wording didn't establish that.
The 261117 decision allows both and keeps the original default-output constraint.

### Phase plan (proposed, not approved)

| Phase | What | Effort | Why this order |
| --- | --- | --- | --- |
| 0 | Accept WI-052 research. Choose the format model. | S | Everything else depends on it. |
| 1 | Category switches plus optional named presets. Individual controls override preset values. No config file. | M | Follows the 261117 CLI decision. Default output stays unchanged. |
| 2 | `--lod-config <file.json>` with a versioned layered config and an unmatched-key report. The workbench gains "Export as exporter config". | M-L | Advanced control. The workbench becomes the editor. |
| 3 | Add checkboxes, preset and switch pickers to the listing HTML. It generates the CLI command for you to copy. | S-M | Avoids adding a server that can run exports. |
| 4 | Full local app: a server that runs the export on click. | L | Only if phase 3 feels too clunky. Study copilot-session-tools' viewer first. |

### Unknown

- How many of the 700 names need their own format, and how many a category rule covers. A count from the catalogue would answer this.
- Whether a VS Code extension webview suits the dev better than a browser app. Not checked.

## References

- [Related research: existing chat export tools](../docs/RELATED-RESEARCH.md)
- [WI-052 topic](WI-052-markdown-level-of-detail-research.md) and [workbench notes](notes/WI-052/README.md#lod-format-workbench)
- [OWASP DNS rebinding test guide](https://owasp.github.io/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side/21-DNS_Rebinding)
