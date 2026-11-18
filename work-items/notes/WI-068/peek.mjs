import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
const root = join(homedir(), '.copilot', 'session-state');
const want = { multiField: 1, multi: 1, enumOdd: 2, choicesSelected: 1 };
for (const dir of readdirSync(root)) {
  const file = join(root, dir, 'events.jsonl');
  if (!existsSync(file)) continue;
  const calls = new Map();
  for await (const line of createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })) {
    if (!line.includes('ask_user') && !line.includes('tool.execution_complete')) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const d = e.data ?? {};
    if (e.type === 'tool.execution_start' && d.toolName === 'ask_user') calls.set(d.toolCallId, d.arguments ?? {});
    if (e.type !== 'tool.execution_complete' || !calls.has(d.toolCallId)) continue;
    const a = calls.get(d.toolCallId); const props = a.requestedSchema?.properties ?? {}; const keys = Object.keys(props);
    const c = String(d.result?.content ?? ''); const det = String(d.result?.detailedContent ?? '');
    const second = det.split('\n')[1] ?? '';
    let tag = null;
    if (keys.length > 2 && want.multiField) tag = 'multiField';
    else if (keys.some((k) => props[k].type === 'array') && want.multi) tag = 'multi';
    else if (keys.length === 1 && props[keys[0]].enum && second && !second.startsWith(keys[0] + ':') && want.enumOdd) tag = 'enumOdd';
    else if (!a.requestedSchema && c.startsWith('User selected') && det && want.choicesSelected) tag = 'choicesSelected';
    if (!tag) continue;
    want[tag]--;
    console.log('=== ' + tag + ' keys=' + keys.join(',') + ' choices=' + JSON.stringify(a.choices ?? null).slice(0, 150));
    console.log('content: ' + JSON.stringify(c.slice(0, 300)));
    console.log('detailed: ' + JSON.stringify(det.slice(0, 400)));
  }
}
