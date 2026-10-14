export const detailedListingStyles = `
.why-source > div { display: grid; gap: .9rem; padding: .7rem; }
.why-source > div, .why-source > div > *, .why-source details { min-width: 0; max-width: 100%; }
.why-source .table-wrap { max-width: 100%; overflow-x: auto; }
.why-source h3 { margin: .2rem 0 .5rem; font-size: .9rem; }
.workspace-ref { display: inline-block; border-radius: .3rem; padding: .12rem .3rem; font-weight: bold; background: #dcecff; color: #154e86; }
.workspace-ref.ref-1 { background: #eae0ff; color: #644195; }
.workspace-ref.ref-2 { background: #d5f1e9; color: #176951; }
.workspace-ref.ref-3 { background: #ffead1; color: #8c4c06; }
.health-cards { display: flex; flex-wrap: wrap; gap: .4rem; }
.health-cards > div { flex: 1 1 14rem; border: 1px solid #d8a449; border-left: .22rem solid #b67d20; border-radius: .4rem; padding: .45rem; background: var(--soft); overflow-wrap: anywhere; font-size: .8rem; }
.health-cards > .health-danger { border-color: #cb5964; border-left-color: #c03245; }
.health-cards > .health-info { border-color: #6aa6d6; border-left-color: #287bb6; }
.source-chain, .source-lineage > div { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; margin: .4rem 0; }
.chain-node { background: var(--soft); border: 1px solid var(--line); border-radius: .4rem; padding: .3rem .5rem; font-size: .8rem; }
.chain-arrow { color: var(--accent); font-weight: bold; }
.source-path, .source-value { font-family: "Arial Narrow", Arial, sans-serif; font-size: .8rem; overflow-wrap: anywhere; }
.path-prefix { color: var(--accent); font-weight: bold; }
.source-copy { font-size: .7rem; padding: .1rem .25rem; }
.storage-size strong { font-family: Arial, sans-serif; font-weight: bold; white-space: nowrap; }
.exact-bytes { display: inline-block; font: normal .75rem "Arial Narrow", Arial, sans-serif; white-space: nowrap; color: var(--muted); }
.unified-evidence { font-size: .8rem; }
.unified-evidence td:first-child { min-width: 7rem; }
.unified-evidence td:nth-child(2) { min-width: 4rem; }
.unified-evidence td:nth-child(3) { min-width: 13rem; }
.unified-evidence td:nth-child(4) { min-width: 6.5rem; }
.unified-evidence td:nth-child(5) { min-width: 6rem; }
.unified-evidence td:nth-child(6), .unified-evidence td:nth-child(7) { min-width: 9rem; }
:root {
  color-scheme: light dark;
  --bg: #f1f5f9;
  --panel: #fff;
  --ink: #182536;
  --muted: #536678;
  --line: #d7e0e9;
  --accent: #075e9c;
  --soft: #eaf3fc;
  --chip: #eef4fb;
  --chip-line: #c9d9ea;
  --btn: #dbe9f8;
  --btn-line: #a9c3de;
  --btn-hover: #c8ddf3;
  --orange: #e29b00;
}
html {
  font-size: 125%;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 0.875rem Arial, sans-serif;
  line-height: 1;
}
main {
  max-width: 1600px;
  margin: auto;
  padding: 24px;
}
h1 {
  font-size: 1.875rem;
  margin: 8px 0;
}
h2 {
  font-size: 1.25rem;
}
h3 {
  font-size: 1.0625rem;
  margin: 8px 0;
}
h4 {
  margin: 6px 0;
}
h1,
h2,
h3,
p,
li,
a {
  overflow-wrap: anywhere;
}
a {
  color: var(--accent);
}
button,
input,
select {
  font: inherit;
  padding: 6px 9px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--panel);
  color: var(--ink);
}
button {
  cursor: pointer;
  background: var(--btn);
  border-color: var(--btn-line);
}
button:hover {
  background: var(--btn-hover);
}
.chips button {
  background: var(--chip);
  border-color: var(--chip-line);
  border-radius: 16px;
}
.chips button:hover {
  background: var(--btn);
}
button[aria-pressed="true"],
.selected,
.chips button[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}
button:focus-visible,
a:focus-visible {
  outline: 3px solid #eaa529;
}
header,
.panel,
.session-card,
.guide {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 16px;
  margin: 14px 0;
}
.muted,
.caption {
  color: var(--muted);
}
.caption {
  font-size: 0.75rem;
}
.datetime,
code,
.selector {
  font: 0.75rem "Arial Narrow", Arial, sans-serif;
  overflow-wrap: anywhere;
}
.datetime {
  white-space: nowrap;
  color: #247eaa;
}
.tag {
  display: inline-block;
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 2px 8px;
  font: 0.75rem "Arial Narrow", Arial, sans-serif;
  margin: 2px;
  background: var(--soft);
  font-weight: 500;
}
.chat-local,
.type-local {
  --type-color: #176ba1;
}
.chat-agent,
.type-agent {
  --type-color: #8050ad;
}
.chat-child,
.type-child {
  --type-color: #956114;
}
.chat-cli,
.type-cli {
  --type-color: #087967;
}
.chat-external,
.type-external {
  --type-color: #b34677;
}
.chat-other,
.type-other {
  --type-color: #637184;
}
[class*="type-"].tag {
  color: var(--type-color);
  border-color: var(--type-color);
  background: color-mix(in srgb, var(--type-color) 10%, var(--panel));
  font-weight: bold;
}
.tone-success,
.added {
  color: #087142;
}
.tone-success {
  background: #e6f7ed;
  border-color: #8fcbaa;
}
.tone-danger,
.removed {
  color: #b5273b;
}
.tone-danger {
  background: #fff0f2;
  border-color: #e2a0ac;
}
.tone-warning,
.tone-hint {
  color: #845411;
  background: #fff5dc;
  border-color: #dcb977;
}
.tone-child {
  color: #875813;
  background: #fff1d6;
  border-color: #d4af72;
}
.tone-fork {
  color: #16704c;
  background: #edf8e8;
  border-color: #99c293;
}
.tone-refs {
  color: #b00079;
  border-color: #c2188f;
  font-weight: 700;
}
.tone-model {
  color: #3d5ca0;
  background: #eef1ff;
  border-color: #b0bfe3;
}
.tone-auto {
  color: #8c4b99;
  background: #f7ecfb;
  border-color: #c9a6d6;
}
.tone-effort {
  color: #975426;
  background: #fff0e4;
  border-color: #d6b194;
}
.tone-credits {
  color: #057b82;
  background: #e1f6f5;
  border-color: #83c9cc;
}
.tone-human {
  color: #246e9f;
  background: #e3f3ff;
  border-color: #a3c9e4;
}
.warning {
  border-left: 4px solid #d8941c;
  padding: 8px;
  background: var(--soft);
}
.metrics,
.grid,
.source-grid,
.evidence-grid,
.compare-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
  gap: 12px;
  align-items: start;
}
.metrics {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}
.metric,
.source-card,
.evidence-card {
  padding: 12px;
  background: var(--soft);
  border-radius: 6px;
  min-width: 0;
}
.metric strong {
  display: block;
  font-size: 1.5625rem;
}
.chart-row {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) 2fr 45px;
  gap: 8px;
  margin: 7px 0;
  align-items: center;
}
.bar {
  height: 10px;
  background: var(--soft);
  border-radius: 6px;
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--accent);
}
.chart-row:nth-of-type(4n + 1) .bar i {
  background: #8050ad;
}
.chart-row:nth-of-type(4n + 2) .bar i {
  background: #139577;
}
.chart-row:nth-of-type(4n + 3) .bar i {
  background: #d49a34;
}
.chart-row:nth-of-type(4n) .bar i {
  background: #338ac1;
}
.chart-row .bar i.bar-verified {
  background: #139577;
}
.chart-row .bar i.bar-unresolved {
  background: #d49a34;
}
.chart-row .bar i.bar-unsupported,
.chart-row .bar i.bar-other {
  background: #637184;
}
.chart-row .bar i.bar-local {
  background: #176ba1;
}
.chart-row .bar i.bar-agent {
  background: #8050ad;
}
.chart-row .bar i.bar-child {
  background: #956114;
}
.chart-row .bar i.bar-cli {
  background: #087967;
}
.chart-row .bar i.bar-external {
  background: #b34677;
}
.guide code,
.callout code {
  font-size: 0.8125rem;
}
.controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.controls label {
  display: flex;
  gap: 5px;
  align-items: center;
}
.controls input[type="number"] {
  width: 95px;
}
.controls input[type="date"] {
  max-width: 160px;
}
#search {
  min-width: 240px;
  flex: 1;
}
.chips {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin: 12px 0;
}
summary {
  cursor: pointer;
  font-weight: 600;
  padding: 7px 0;
}
details > div {
  padding: 8px 0;
}
.source-fields,
dl {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) minmax(0, 2fr);
  gap: 6px 12px;
  margin: 8px 0;
}
dt {
  color: var(--muted);
  font-family: "Arial Narrow", Arial, sans-serif;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.titles-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2px 12px;
  flex-wrap: wrap;
}
.titles-head h3 {
  margin: 6px 0;
}
.card-actions {
  display: flex;
  gap: 4px 10px;
  align-items: center;
  flex-wrap: wrap;
  margin: 0;
  font: 0.6875rem "Arial Narrow", Arial, sans-serif;
}
.card-actions button {
  font: 0.6875rem "Arial Narrow", Arial, sans-serif;
  padding: 1px 8px;
  border-radius: 12px;
}
.card-actions a {
  font: 0.6875rem "Arial Narrow", Arial, sans-serif;
}
.card-notes {
  display: flex;
  gap: 4px 10px;
  align-items: center;
  flex-wrap: wrap;
  margin: 2px 0 8px;
}
.note {
  color: var(--muted);
  font: 0.75rem "Arial Narrow", Arial, sans-serif;
}
.glyph {
  font: 700 0.875rem "Segoe UI Symbol", "Arial Unicode MS", sans-serif;
  line-height: 1;
}
.session-card {
  border: 1px solid var(--type-color);
  border-left: 5px solid var(--type-color);
  scroll-margin-top: 18px;
  padding: 12px 16px;
  margin: 10px 0;
}
.session-card.target {
  outline: 3px solid #d8941c;
}
.session-summary {
  position: relative;
  display: block;
  padding: 0 0 0 19px;
}
.session-summary::before {
  content: "▶";
  position: absolute;
  left: 0;
  top: 5px;
  color: var(--type-color);
  font-size: 0.6875rem;
}
.session-card[open] > .session-summary::before {
  content: "▼";
}
.session-summary::-webkit-details-marker {
  display: none;
}
.title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 7px;
}
.session-title {
  color: var(--type-color);
  font: 700 0.9375rem "Arial Narrow", Arial, sans-serif;
  min-width: 0;
}
.index-circle {
  border-radius: 50%;
  min-width: 25px;
  padding: 2px 5px;
  text-align: center;
  background: color-mix(in srgb, var(--type-color) 12%, var(--panel));
  color: var(--type-color);
  font: 0.75rem "Arial Narrow", Arial, sans-serif;
}
.subtitle {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 5px;
  font: 0.75rem "Arial Narrow", Arial, sans-serif;
  font-weight: 400;
  color: var(--muted);
}
.subtitle strong {
  color: var(--ink);
  font-size: 0.75rem;
}
.subtitle .datetime {
  font-weight: 700;
}
.workspace-name {
  color: var(--orange);
  font-family: monospace;
  font-weight: 700;
}
.link-button {
  background: transparent;
  border: 0;
  padding: 0;
  color: var(--accent);
  text-decoration: underline;
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.link-button:hover {
  background: transparent;
}
#project {
  max-width: 16rem;
}
.chart-row .bar i.bar-project {
  background: #139577;
}
.chart-row .bar i.bar-multi {
  background: #b00079;
}
.chart-row .bar i.bar-unknown {
  background: #637184;
}
.status-line code {
  font-size: 0.6875rem;
}
.status-line > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.status-line .tag {
  font-size: 0.6875rem;
  padding: 1px 7px;
}
.session-body {
  border-top: 1px solid var(--line);
  margin-top: 10px !important;
  padding-top: 10px !important;
}
.title-provenance {
  margin: 0 0 8px;
}
.title-provenance h3 {
  font-size: 0.875rem;
}
.title-provenance ul {
  list-style: none;
  padding: 0;
  margin: 4px 0;
}
.title-provenance li {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) minmax(0, 3fr);
  gap: 4px 12px;
  margin: 3px 0;
  padding: 5px 8px;
  border-radius: 4px;
  background: var(--soft);
}
.evidence-label,
.date-provenance dt {
  font-family: consolas;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.dates-card {
  padding: 8px 10px;
}
.date-provenance {
  grid-template-columns: minmax(130px, 1fr) minmax(0, 1fr);
  gap: 2px 9px;
  margin: 4px 0;
  font-size: 0.75rem;
}
.dates-card details > div {
  padding: 0;
}
.dates-card summary {
  padding: 3px 0;
  font-size: 0.75rem;
}
.turns {
  padding-left: 28px;
}
.turns > li.turn-card {
  padding: 8px 10px;
  border: 1px solid #cadcee;
  border-radius: 8px;
  background: color-mix(in srgb, var(--soft) 45%, var(--panel));
  margin: 7px 0;
}
.turns > li::marker {
  font: 0.75rem "Arial Narrow", Arial, sans-serif;
  color: var(--muted);
}
.turn-meta {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  align-items: center;
}
.turn-meta .tag {
  padding: 1px 7px;
  font-size: 0.6875rem;
}
.prompt-preview {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 5px 0;
}
.full-prompt pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  margin: 4px 0;
}
.edit-chip {
  font-size: 0.75rem;
  color: var(--ink);
  background: var(--panel);
  font-weight: bold;
}
.turn-card summary {
  padding: 3px 0;
  font-size: 0.75rem;
}
.timeline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.timeline a {
  border: 1px solid var(--line);
  padding: 5px 9px;
  border-radius: 6px;
  font: 0.9375rem "Arial Narrow", Arial, sans-serif;
}
.field-line {
  padding: 7px 0 7px 1.15rem;
  font-size: 0.875rem;
}
.field-line > strong {
  font-weight: 600;
}
.field-line .timeline,
.field-line.compact {
  padding-top: 2px;
  padding-bottom: 2px;
}
.field-line a {
  font-family: "Arial Narrow", Arial, sans-serif;
}
.field-line button {
  font-size: 0.75rem;
  padding: 1px 8px;
}
.unknown {
  color: var(--muted);
  font-weight: 700;
  letter-spacing: 0.03em;
  cursor: help;
}
.table-wrap {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
}
th,
td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
th {
  color: var(--muted);
}
.diagram {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px;
}
.node {
  background: var(--soft);
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--line);
}
.node strong {
  display: block;
}
.tree {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--soft);
  padding: 12px;
  font: 0.8125rem monospace;
}
.guide-content {
  padding: 12px;
}
.callout {
  background: var(--soft);
  padding: 12px;
}
[hidden] {
  display: none !important;
}
.comprehensive .full-prompt {
  display: block;
}
.compact .supplemental {
  display: none;
}
.comprehensive .clipped-preview {
  display: none;
}
.enhanced-only {
  display: none;
}
.js .enhanced-only {
  display: inline-block;
}
.js .card-actions.enhanced-only {
  display: flex;
}
.compare-grid > section {
  min-width: 0;
  padding: 12px;
  background: var(--soft);
}
.compare-grid pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.family-list {
  padding-left: 20px;
}
.index-list {
  list-style: none;
  padding: 0;
  margin: 8px 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 430px), 1fr));
  gap: 0 28px;
}
.index-list li {
  display: block;
  min-width: 0;
  padding: 5px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
}
.toc-main,
.toc-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
}
.toc-sub {
  margin-top: 3px;
}
.toc-number {
  font-weight: 700;
}
.toc-sub .workspace-name {
  font-size: 0.8125rem;
}
.toc-sub .datetime {
  font-weight: 700;
}
.index-list .toc-main > a {
  min-width: 0;
  font: 0.9375rem "Arial Narrow", Arial, sans-serif;
}
.index-meta {
  font: 0.75rem "Arial Narrow", Arial, sans-serif;
  color: var(--muted);
  white-space: nowrap;
}
.index-meta strong {
  color: var(--ink);
}
.index-list .tag {
  margin: 0;
  font-size: 0.6875rem;
  padding: 0 7px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111923;
    --panel: #192636;
    --ink: #e4edf7;
    --muted: #acbfd1;
    --line: #35465b;
    --accent: #74bfff;
    --soft: #213449;
    --chip: #1f3248;
    --chip-line: #3b5572;
    --btn: #2c4766;
    --btn-line: #4a6a8e;
    --btn-hover: #385a80;
  }
  button[aria-pressed="true"] {
    color: #102033;
  }
  .chat-local,
  .type-local {
    --type-color: #71b9ec;
  }
  .chat-agent,
  .type-agent {
    --type-color: #c89cf0;
  }
  .chat-child,
  .type-child {
    --type-color: #e3b76e;
  }
  .chat-cli,
  .type-cli {
    --type-color: #70d3b8;
  }
  .chat-external,
  .type-external {
    --type-color: #f69bc4;
  }
  .chat-other,
  .type-other {
    --type-color: #adbdcf;
  }
  .datetime {
    color: #7dc6ec;
  }
  .tag[class*="tone-"] {
    background: var(--soft);
  }
  .tone-success,
  .added,
  .tone-fork {
    color: #7addae;
  }
  .tone-danger,
  .removed {
    color: #ff9dad;
  }
  .tone-warning,
  .tone-child,
  .tone-hint,
  .tone-effort {
    color: #ebbf7d;
  }
  .tone-refs {
    color: #ff91da;
    border-color: #ed66c0;
  }
  .chart-row .bar i.bar-verified {
    background: #7addae;
  }
  .chart-row .bar i.bar-unresolved {
    background: #ebbf7d;
  }
  .chart-row .bar i.bar-unsupported,
  .chart-row .bar i.bar-other {
    background: #adbdcf;
  }
  .chart-row .bar i.bar-local {
    background: #71b9ec;
  }
  .chart-row .bar i.bar-agent {
    background: #c89cf0;
  }
  .chart-row .bar i.bar-child {
    background: #e3b76e;
  }
  .chart-row .bar i.bar-cli {
    background: #70d3b8;
  }
  .chart-row .bar i.bar-external {
    background: #f69bc4;
  }
  .chart-row .bar i.bar-project {
    background: #7addae;
  }
  .chart-row .bar i.bar-multi {
    background: #ff91da;
  }
  .chart-row .bar i.bar-unknown {
    background: #adbdcf;
  }
  .tone-model,
  .tone-human {
    color: #a3c8ff;
  }
  .tone-auto {
    color: #d7b1ef;
  }
  .tone-credits {
    color: #7bdbdf;
  }
  .turns > li.turn-card {
    border-color: #405773;
  }
}
@media (max-width: 650px) {
  main {
    padding: 10px;
  }
  .session-card {
    padding: 10px;
  }
  .titles-head {
    align-items: flex-start;
  }
  dl,
  .source-fields,
  .title-provenance li {
    grid-template-columns: 1fr;
  }
  dt {
    font-weight: bold;
  }
  .controls {
    align-items: stretch;
  }
  .compare-grid {
    grid-template-columns: 1fr;
  }
  .session-title {
    font-size: 0.9375rem;
  }
  .date-provenance {
    grid-template-columns: minmax(100px, 1fr) minmax(0, 1fr);
  }
}
@media print {
  .controls,
  .chips,
  .card-actions,
  .enhanced-only {
    display: none !important;
  }
  body {
    background: white;
    color: black;
  }
  details {
    break-inside: avoid;
  }
  .session-card {
    break-before: auto;
  }
  .panel,
  .session-card {
    border: 1px solid #999;
  }
}
`;
