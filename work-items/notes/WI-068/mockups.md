# ask_user rendering mockups (261117-1743)

Open this file in Markdown preview (`Ctrl+Shift+V`). Each mockup renders the same synthetic question. Sample tool lines sit above and below each one so you can judge contrast.

---

## Mockup A: alert callout card

Uses a GitHub alert (`> [!IMPORTANT]`). GitHub renders a colored border and icon. Unknown whether your VS Code preview renders it as an alert or as a plain quote.

- 🛠️ `view`: view the file at C:\_DEV\copilot-chat-exporter\work-log.md
- 🛠️ `rg`: heading "^#{1,3} "

> [!IMPORTANT]
> ### ❓ Agent asked: Presentation approach
>
> I recommend an interactive offline casebook. Proposed layout:
>
> | Section | Contents |
> | --- | --- |
> | Scenario gallery | Exact request, code review, failure investigation |
> | Tool gallery | Short / medium / full examples per tool |
> | Evidence drawer | Sources and coverage limits |
>
> The **strongest case against** it: dozens of controls could become another config maze.
>
> **Which version should I build?**
>
> - [ ] Interactive offline casebook with synthetic examples *(recommended, default)*
> - [ ] Static side-by-side casebook with synthetic examples
> - [ ] Different scope or format - describe it
>
> #### 💬 You answered (freeform, not a listed option)
>
> option 1 with real examples mined from the temp tool output folders from past 2 days. If you can't find certain examples, use synthetic.
>
> <details><summary>🧾 Raw question and answer JSON</summary>
>
> ```json
> { "message": "…", "requestedSchema": { "properties": { "presentation": { "enum": ["…"] } } } }
> ```
>
> </details>

- 🛠️ `sql`: Plan LOD casebook work
- 🛠️ `powershell`: Get-ChildItem ...

---

## Mockup B: heading + rules (shows in the outline)

Uses a real heading, so every decision appears in the preview outline. Horizontal rules frame it. The answer gets a quote bar.

- 🛠️ `view`: view the file at C:\_DEV\copilot-chat-exporter\work-log.md

---

#### ❓ Decision 3 · Presentation approach

I recommend an interactive offline casebook. Proposed layout:

| Section | Contents |
| --- | --- |
| Scenario gallery | Exact request, code review, failure investigation |
| Tool gallery | Short / medium / full examples per tool |

**Which version should I build?**

| | Option |
| :---: | --- |
| ⭐ | Interactive offline casebook with synthetic examples *(recommended)* |
| | Static side-by-side casebook with synthetic examples |
| ✍️ | Different scope or format - describe it |

> ## ✅ Answer
> **Freeform** (not one of the listed options): option 1 with real examples mined from the temp tool output folders from past 2 days. If you can't find certain examples, use synthetic.

<details><summary>🧾 Raw question and answer JSON</summary>

```json
{ "message": "…", "requestedSchema": { "…": "…" } }
```

</details>

---

- 🛠️ `sql`: Plan LOD casebook work

---

## Mockup C: styled HTML box (VS Code preview only)

Uses an HTML `<div>` with inline style: thick colored left bar, tinted background and a border. VS Code preview keeps inline styles (the exporter already relies on them for muted tool lines). GitHub strips them, so there it degrades to plain text without the box.

- 🛠️ `view`: view the file at C:\_DEV\copilot-chat-exporter\work-log.md

<div style="border:1px solid #d29922;border-left:8px solid #d29922;border-radius:6px;padding:4px 16px;margin:12px 0;background:rgba(210,153,34,0.08)">

### ❓ Agent asked · Presentation approach

I recommend an interactive offline casebook.

| Section | Contents |
| --- | --- |
| Scenario gallery | Exact request, code review, failure investigation |
| Tool gallery | Short / medium / full examples per tool |

**Which version should I build?**

1. ⭐ Interactive offline casebook with synthetic examples *(recommended)*
2. Static side-by-side casebook with synthetic examples
3. Different scope or format - describe it

<div style="border-left:6px solid #3fb950;padding:2px 12px;background:rgba(63,185,80,0.10)">

**✅ You answered (freeform):** option 1 with real examples mined from the temp tool output folders from past 2 days. If you can't find certain examples, use synthetic.

</div>

<details><summary>🧾 Raw question and answer JSON</summary>

```json
{ "message": "…" }
```

</details>

</div>

- 🛠️ `sql`: Plan LOD casebook work

---

## Answer variants (Mockup A style)

### Picked a listed option

> [!IMPORTANT]
> ### ❓ Agent asked: Database engine
> **What database should I use?**
>
> - [ ] MySQL
> - [x] **PostgreSQL** ⭐ *(recommended)* ← **chosen**
> - [ ] SQLite

### Multi-field form

> [!IMPORTANT]
> ### ❓ Agent asked: Export settings (3 fields)
>
> | Field | Your answer | Suggested default |
> | --- | --- | --- |
> | Output format | **HTML** | Markdown |
> | Include reasoning | ✅ Yes | ✅ Yes |
> | Max lines | **500** | 300 |

### Declined, cancelled or never answered

> [!WARNING]
> ### ❓ Agent asked: Run migrations?
> **Should I run the database migrations now?**
>
> 🚫 **Declined** - you closed the form without answering. The agent continued on its own.

### Decision index at the top of the export (optional extra)

| # | Turn | Question | Answer |
| ---: | ---: | --- | --- |
| 1 | 4 | [Presentation approach](#) | Freeform: option 1 with real examples… |
| 2 | 9 | [Database engine](#) | PostgreSQL |
| 3 | 15 | [Run migrations?](#) | 🚫 Declined |
