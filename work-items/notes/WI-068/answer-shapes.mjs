// Read-only: structure of ask_user answers with values masked. Keys and punctuation only.
import { createReadStream, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(homedir(), '.copilot', 'session-state');
const patterns = {};
const failures = [];
const mask = (line, keys) => {
  for (const key of keys) {
    if (line.startsWith(`${key}:`))
      return `${key}: <${line.slice(key.length + 1).trim().startsWith('[') ? 'array' : 'value'}>`;
  }
  return line.replace(/^(User (?:responded|selected)[^:]*:).*$/u, '$1 <value>').replace(/^(?!User ).+$/u, '<text>');
};
for (const dir of readdirSync(root)) {
  const file = join(root, dir, 'events.jsonl');
  if (!existsSync(file))
    continue;
  const calls = new Map();
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('ask_user') && !line.includes('tool.execution_complete'))
      continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const data = event.data ?? {};
    if (event.type === 'tool.execution_start' && data.toolName === 'ask_user')
      calls.set(data.toolCallId, data.arguments ?? {});
    if (event.type === 'tool.execution_complete' && calls.has(data.toolCallId)) {
      const args = calls.get(data.toolCallId);
      const style = args.requestedSchema ? 'schema' : 'choices';
      const props = args.requestedSchema?.properties ?? {};
      const keys = Object.keys(props);
      const types = keys.map((key) => props[key].type === 'array' ? 'multi' : props[key].enum ? 'enum' : props[key].type).join('+') || 'choices';
      const content = String(data.result?.content ?? '');
      const detailed = String(data.result?.detailedContent ?? '');
      const shape = (text) => text.split('\n').slice(0, 6).map((l) => mask(l, keys)).join(' | ');
      const key = `${style} [${types}] content=${shape(content)} || detailed=${shape(detailed)}`;
      patterns[key] = (patterns[key] ?? 0) + 1;
      if (data.success === false)
        failures.push({ resultType: data.result?.type, error: data.error ? Object.keys(data.error) : null, contentStart: content.slice(0, 40) });
    }
  }
}
const sorted = Object.entries(patterns).sort((a, b) => b[1] - a[1]);
writeFileSync(process.argv[2], JSON.stringify({ sorted, failures }, null, 2));
for (const [pattern, count] of sorted.slice(0, 25)) console.log(String(count).padStart(4), pattern.slice(0, 230));
console.log('failures', JSON.stringify(failures));
