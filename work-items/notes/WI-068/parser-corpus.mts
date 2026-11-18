import { readdirSync, existsSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { parseAskUser, parseCarousel } from '../../../src/session/questions.ts';
const tally = (o, k) => (o[k] = (o[k] ?? 0) + 1);
const sdk = { outcomes: {}, warnings: {}, fieldsAnswered: 0, fieldsMissing: 0, freeform: 0 }; const odd = [];
const root = join(process.env.USERPROFILE, '.copilot', 'session-state');
for (const d of readdirSync(root)) { const f = join(root, d, 'events.jsonl'); if (!existsSync(f)) continue; const args = new Map();
  for await (const line of createInterface({ input: createReadStream(f, 'utf8'), crlfDelay: Infinity })) {
    if (!line.includes('ask_user') && !line.includes('User ')) continue; let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.type === 'tool.execution_start' && e.data?.toolName === 'ask_user') args.set(e.data.toolCallId, e.data.arguments);
    if (e.type !== 'tool.execution_complete' || !args.has(e.data?.toolCallId)) continue;
    const r = e.data.result ?? {}; const err = typeof e.data.error === 'object' ? e.data.error?.message : e.data.error;
    const q = parseAskUser(args.get(e.data.toolCallId), { isComplete: true, success: e.data.success, content: r.content ?? '', detailed: r.detailedContent ?? '', ...(err ? { error: err } : {}) });
    tally(sdk.outcomes, q.outcome); q.parseWarning && tally(sdk.warnings, q.parseWarning);
    if (q.outcome === 'answered') for (const fl of q.fields) { fl.answer ? sdk.fieldsAnswered++ : sdk.fieldsMissing++; fl.answer?.freeform && sdk.freeform++; fl.answer?.freeform?.includes('\n') && odd.push({ glued: JSON.stringify(fl.answer.freeform.slice(-40)), raw: JSON.stringify((r.detailedContent ?? '').slice(-60)) }); if (!fl.answer && odd.length < 5) odd.push({ missing: fl.id, title: fl.title, kind: fl.kind, keys: q.fields.map((x) => x.id), detailedLines: (r.detailedContent ?? '').split('\n').map((l) => l.split(': ')[0]), contentKeys: (r.content ?? '').match(/\w+=/g) }); }
    if (q.outcome !== 'answered' && odd.length < 6) odd.push({ outcome: q.outcome, warn: q.parseWarning, content: (r.content ?? '').slice(0, 60), detailed: (r.detailedContent ?? '').slice(0, 80), style: args.get(e.data.toolCallId)?.requestedSchema ? 'schema' : 'choices' });
  } }
const local = { outcomes: {}, warnings: {}, unique: 0 };
const user = join(process.env.APPDATA, 'Code', 'User');
const walk = (v, fn) => { if (Array.isArray(v)) v.forEach((x) => walk(x, fn)); else if (v && typeof v === 'object') { fn(v); for (const x of Object.values(v)) walk(x, fn); } };
for (const base of ['workspaceStorage', 'globalStorage']) { const r = join(user, base); if (!existsSync(r)) continue;
  for (const ws of readdirSync(r)) for (const s of ['chatSessions', 'emptyWindowChatSessions']) { const dir = join(r, ws, s); if (!existsSync(dir)) continue;
    for (const n of readdirSync(dir)) { if (!n.endsWith('.jsonl')) continue; const best = new Map();
      for await (const line of createInterface({ input: createReadStream(join(dir, n), 'utf8'), crlfDelay: Infinity })) {
        if (!line.includes('questionCarousel')) continue; let rec; try { rec = JSON.parse(line); } catch { continue; }
        walk(rec, (p) => { if (p.kind !== 'questionCarousel') return; const q = parseCarousel(p); const prev = best.get(p.resolveId); (!prev || prev.outcome === 'unanswered') && best.set(p.resolveId, q); }); }
      for (const q of best.values()) { local.unique++; tally(local.outcomes, q.outcome); q.parseWarning && tally(local.warnings, q.parseWarning); } } } }
console.log(JSON.stringify({ sdk, odd, local }, null, 1));
