// Read-only census of question mechanisms across agent session logs and Local chat journals.
// Counts mechanisms and answer outcomes; records record keys and short sanitized samples only.
import { createReadStream, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2];
const agentRoot = join(homedir(), '.copilot', 'session-state');
const codeUser = join(process.env.APPDATA, 'Code', 'User');

const stats = {
  agentFiles: 0, localFiles: 0, skippedHuge: 0,
  agentEventTypes: {}, askUserCalls: 0, askUserCompletions: 0,
  askUserActions: {}, askUserFieldCounts: {}, askUserFieldTypes: {}, askUserResultPrefixes: {},
  askUserInputKeys: {}, askUserSchemaPropertyCounts: {}, askUserSuccess: {},
  localKinds: {}, localAskQuestionsCalls: 0, localCarouselKeys: {}, localQuestionKeys: {}, localAskInputKeys: {},
  localElicitationKeys: {}, sessionsWithQuestions: { agent: 0, local: 0 },
};
const samples = { askUserResult: [], carousel: [], elicitation: [], otherAgentEvents: [] };
const bump = (map, key) => { map[key] = (map[key] ?? 0) + 1; };
const short = (text) => String(text).replace(/\s+/gu, ' ').slice(0, 160);

async function lines (file, onLine) {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) if (line) onLine(line);
}

async function scanAgent () {
  if (!existsSync(agentRoot))
    return;
  for (const dir of readdirSync(agentRoot)) {
    const file = join(agentRoot, dir, 'events.jsonl');
    if (!existsSync(file))
      continue;
    stats.agentFiles++;
    const askIds = new Set();
    let had = false;
    await lines(file, (line) => {
      let event;
      try { event = JSON.parse(line); } catch { return; }
      const type = event.type ?? 'unknown';
      if (/input|elicit|question|ask/iu.test(type)) {
        bump(stats.agentEventTypes, type);
        if (samples.otherAgentEvents.length < 6 && !/^tool\./u.test(type))
          samples.otherAgentEvents.push({ type, keys: Object.keys(event.data ?? {}) });
      }
      const data = event.data ?? {};
      if (type === 'tool.execution_start' && data.toolName === 'ask_user') {
        had = true;
        stats.askUserCalls++;
        askIds.add(data.toolCallId);
        const args = data.arguments ?? {};
        bump(stats.askUserInputKeys, Object.keys(args).sort().join(','));
        bump(stats.askUserSchemaPropertyCounts, String(Object.keys(args.requestedSchema?.properties ?? {}).length));
      }
      if (type === 'tool.execution_complete' && askIds.has(data.toolCallId)) {
        stats.askUserCompletions++;
        bump(stats.askUserSuccess, String(data.success));
        const props = data.toolTelemetry?.properties ?? {};
        bump(stats.askUserActions, props.elicitation_action ?? '(none)');
        bump(stats.askUserFieldTypes, props.elicitation_field_types ?? '(none)');
        bump(stats.askUserFieldCounts, String(data.toolTelemetry?.metrics?.elicitation_field_count ?? '(none)'));
        const content = data.result?.content ?? data.error?.message ?? '';
        bump(stats.askUserResultPrefixes, short(content).split(/[:\n]/u)[0].slice(0, 40));
        if (samples.askUserResult.length < 8)
          samples.askUserResult.push({ action: props.elicitation_action, resultKeys: Object.keys(data.result ?? {}), prefix: short(content).slice(0, 60) });
      }
    });
    if (had)
      stats.sessionsWithQuestions.agent++;
  }
}

function walkJournal (value, onNode) {
  if (Array.isArray(value)) {
    for (const item of value) walkJournal(item, onNode);
  } else if (value && typeof value === 'object') {
    onNode(value);
    for (const child of Object.values(value)) walkJournal(child, onNode);
  }
}

function localJournalFiles () {
  const files = [];
  const roots = [join(codeUser, 'workspaceStorage'), join(codeUser, 'globalStorage')];
  for (const root of roots) {
    if (!existsSync(root))
      continue;
    for (const entry of readdirSync(root)) {
      for (const sub of ['chatSessions', 'emptyWindowChatSessions']) {
        const dir = join(root, entry, sub);
        if (existsSync(dir))
          for (const name of readdirSync(dir)) if (name.endsWith('.jsonl')) files.push(join(dir, name));
      }
    }
    for (const sub of ['emptyWindowChatSessions']) {
      const dir = join(root, sub);
      if (existsSync(dir))
        for (const name of readdirSync(dir)) if (name.endsWith('.jsonl')) files.push(join(dir, name));
    }
  }
  return files;
}

async function scanLocal () {
  for (const file of localJournalFiles()) {
    if (statSync(file).size > 400 * 1024 * 1024) {
      stats.skippedHuge++;
      continue;
    }
    stats.localFiles++;
    let had = false;
    await lines(file, (line) => {
      if (!/questionCarousel|askQuestions|elicitation/u.test(line))
        return;
      let record;
      try { record = JSON.parse(line); } catch { return; }
      walkJournal(record, (node) => {
        const kind = node.kind;
        if (typeof kind === 'string' && /question|elicit/iu.test(kind)) {
          had = true;
          bump(stats.localKinds, kind);
          if (kind === 'questionCarousel') {
            bump(stats.localCarouselKeys, Object.keys(node).sort().join(','));
            for (const q of node.questions ?? []) bump(stats.localQuestionKeys, Object.keys(q).sort().join(','));
            if (samples.carousel.length < 4)
              samples.carousel.push({ keys: Object.keys(node), questionCount: node.questions?.length, answerType: typeof node.data, dataKeys: node.data && typeof node.data === 'object' ? Object.keys(node.data).slice(0, 5) : null, isUsed: node.isUsed });
          } else {
            bump(stats.localElicitationKeys, `${kind}:${Object.keys(node).sort().join(',')}`);
            if (samples.elicitation.length < 4)
              samples.elicitation.push({ kind, keys: Object.keys(node), state: node.state });
          }
        }
        if (node.toolId === 'vscode_askQuestions' && node.kind === 'toolInvocationSerialized') {
          had = true;
          stats.localAskQuestionsCalls++;
          const raw = node.toolSpecificData?.rawInput;
          if (raw)
            bump(stats.localAskInputKeys, Object.keys(raw).sort().join(','));
        }
      });
    });
    if (had)
      stats.sessionsWithQuestions.local++;
  }
}

await scanAgent();
await scanLocal();
writeFileSync(out, JSON.stringify({ scannedAt: new Date().toISOString(), stats, samples }, null, 2));
console.log(JSON.stringify(stats, null, 2));
