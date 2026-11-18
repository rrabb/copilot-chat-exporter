import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
const user = join(process.env.APPDATA, 'Code', 'User');
const files = [];
for (const base of ['workspaceStorage', 'globalStorage']) {
  const r = join(user, base); if (!existsSync(r)) continue;
  for (const e of readdirSync(r)) for (const s of ['chatSessions', 'emptyWindowChatSessions']) { const d = join(r, e, s); if (existsSync(d)) for (const n of readdirSync(d)) if (n.endsWith('.jsonl')) files.push(join(d, n)); }
}
const walk = (v, f, path = []) => { if (Array.isArray(v)) v.forEach((x, i) => walk(x, f, [...path, i])); else if (v && typeof v === 'object') { f(v, path); for (const [k, x] of Object.entries(v)) walk(x, f, [...path, k]); } };
const totals = { carousels: 0, uniqueResolve: 0, withDataUnique: 0, emptyData: 0, noResolveId: 0, pairedWithTool: 0, keyPrefixIsResolve: 0, keyPrefixIsTool: 0, toolBefore: 0, answerShapes: {}, questionTypes: {}, recordKinds: {} };
for (const file of files) {
  const byResolve = new Map(); const toolIds = new Map(); let lineNo = 0;
  for await (const line of createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })) {
    lineNo++;
    if (!/questionCarousel|vscode_askQuestions/.test(line)) continue;
    let rec; try { rec = JSON.parse(line); } catch { continue; }
    totals.recordKinds[String(rec.kind)] = (totals.recordKinds[String(rec.kind)] ?? 0) + 1;
    walk(rec, (n) => {
      if (n.kind === 'toolInvocationSerialized' && n.toolId === 'vscode_askQuestions' && !toolIds.has(n.toolCallId)) toolIds.set(n.toolCallId, lineNo);
      if (n.kind === 'questionCarousel') {
        totals.carousels++;
        if (!n.resolveId) totals.noResolveId++;
        const prev = byResolve.get(n.resolveId);
        const hasData = n.data && Object.keys(n.data).length > 0;
        if (!prev || (hasData && !prev.hasData)) byResolve.set(n.resolveId, { hasData, data: n.data, line: lineNo, questions: n.questions });
      }
    });
  }
  for (const [rid, c] of byResolve) {
    totals.uniqueResolve++;
    if (c.hasData) totals.withDataUnique++; else totals.emptyData++;
    if (toolIds.has(rid)) { totals.pairedWithTool++; if (toolIds.get(rid) <= c.line) totals.toolBefore++; }
    for (const k of Object.keys(c.data ?? {})) { const p = k.split(':')[0]; if (p === rid) totals.keyPrefixIsResolve++; if (toolIds.has(p)) totals.keyPrefixIsTool++; }
    for (const v of Object.values(c.data ?? {})) { const s = typeof v === 'string' ? 'string' : v && typeof v === 'object' ? Object.keys(v).sort().join('+') : typeof v; totals.answerShapes[s] = (totals.answerShapes[s] ?? 0) + 1; }
    for (const q of c.questions ?? []) totals.questionTypes[String(q.type)] = (totals.questionTypes[String(q.type)] ?? 0) + 1;
  }
}
console.log(JSON.stringify(totals, null, 2));
