// Turns one recorded example into a flat "template context" so one format template can render Local and SDK records.
// Used by the builder (to store contexts next to examples) and by the self-check. No chat text is kept here.

const stripLinks = text => text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

function markdownText(value) {
  const text = typeof value === 'string' ? value : value && typeof value.value === 'string' ? value.value : '';
  return stripLinks(text).replace(/`/g, '').trim();
}

function partText(part) {
  if (typeof part === 'string')
    return part;
  if (!part || typeof part !== 'object')
    return '';
  if (typeof part.value === 'string')
    return part.value;
  if (typeof part.text === 'string')
    return part.text;
  if (typeof part.data === 'string')
    return `<${part.mimeType ?? part.mime ?? 'binary'} data, ${part.data.length} chars>`;
  return '';
}

function resultText(result) {
  if (result === null || result === undefined)
    return undefined;
  if (typeof result === 'string')
    return result;
  const content = Array.isArray(result.content) ? result.content : typeof result.content === 'string' ? [result.content] : [];
  const text = content.map(partText).filter(Boolean).join('\n');
  return text || undefined;
}

function clean(object) {
  const output = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined && value !== null && value !== '')
      output[key] = value;
  }
  return output;
}

function errorText(error) {
  if (!error)
    return undefined;
  if (typeof error === 'string')
    return error;
  return error.message ?? JSON.stringify(error);
}

function seconds(from, to) {
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : undefined;
}

function sdkToolContext(value) {
  const start = value.start?.data ?? value;
  const complete = value.complete?.data;
  const result = complete?.result;
  const name = start.toolName ?? start.name;
  const input = start.arguments;
  const ctx = {
    source: 'sdk',
    name,
    title: start.toolTitle,
    intent: start.intentionSummary,
    input,
    ok: complete ? complete.success !== false : undefined,
    result: typeof result?.content === 'string' ? result.content : resultText(result),
    detail: result?.detailedContent,
    structured: result?.structuredContent,
    error: errorText(complete?.error),
    exitCode: complete?.shellExecution?.exitCode,
    durationMs: seconds(value.start?.timestamp, value.complete?.timestamp),
    mcpServer: start.mcpServerName,
    mcpTool: start.mcpToolName,
  };
  return clean({ ...ctx, ...askUserFields(name, input, ctx.result) });
}

function localToolContext(value) {
  const part = value.part ?? value;
  const call = value.recordedCall;
  const details = part.resultDetails && !Array.isArray(part.resultDetails) ? part.resultDetails : undefined;
  const data = part.toolSpecificData;
  const outputText = Array.isArray(details?.output) ? details.output.map(partText).filter(Boolean).join('\n') : undefined;
  const input = call?.arguments ?? (typeof details?.input === 'string' ? { input: details.input } : undefined);
  const result = resultText(value.recordedResult) ?? outputText;
  const failed = details?.isError === true;
  const ctx = {
    source: 'local',
    name: part.toolId,
    title: markdownText(part.pastTenseMessage) || markdownText(part.invocationMessage),
    invocation: markdownText(part.invocationMessage),
    calledAs: call?.name,
    input,
    command: data?.kind === 'terminal' ? data.commandLine?.original : undefined,
    language: data?.kind === 'terminal' ? data.language : undefined,
    ok: failed ? false : part.isComplete === false ? undefined : true,
    result,
    error: failed ? result : undefined,
    durationMs: typeof part.startedAt === 'number' && typeof part.completedAt === 'number' ? part.completedAt - part.startedAt : undefined,
    origin: part.source?.label ?? part.source?.serverLabel,
    toolData: data?.kind,
    todos: data?.kind === 'todoList' ? data.todoList : undefined,
  };
  return clean({ ...ctx, ...askUserFields(part.toolId, input, result) });
}

// ask_user (SDK) and vscode_askQuestions (Local) hold the question as tool input and the answer as tool output.
function askUserFields(name, input, result) {
  if (name !== 'ask_user' && name !== 'vscode_askQuestions')
    return {};
  const schema = input?.requestedSchema?.properties;
  const fieldChoices = schema ? Object.values(schema).flatMap(field => field?.enum ?? field?.oneOf?.map(option => option.title ?? option.const) ?? field?.items?.enum ?? []) : [];
  const localQuestions = Array.isArray(input?.questions) ? input.questions : [];
  return {
    question: input?.question ?? input?.message ?? localQuestions.map(item => item.question ?? item.header).join(' / '),
    choices: input?.choices ?? (fieldChoices.length ? fieldChoices : localQuestions.flatMap(item => (item.options ?? []).map(option => option.label ?? option))),
    freeform: input?.allow_freeform,
    answer: result,
  };
}

function sdkRequestContext(value) {
  return clean({
    source: 'sdk',
    name: value.name,
    title: value.toolTitle,
    intent: value.intentionSummary,
    input: value.arguments,
    ...askUserFields(value.name, value.arguments, undefined),
  });
}

function questionContext(value) {
  const question = value.question ?? {};
  const answer = value.answer;
  const answerText = answer === null || answer === undefined ? undefined : typeof answer === 'string' ? answer : answer.selectedValue ?? answer.freeformValue ?? answer.value ?? JSON.stringify(answer);
  return clean({
    source: 'local',
    name: question.type,
    question: question.title ?? question.message,
    message: question.message,
    detail: question.detailedMessage,
    choices: Array.isArray(question.options) ? question.options.map(option => option.label ?? option.value) : undefined,
    default: question.defaultValue,
    freeform: question.allowFreeformInput,
    answer: Array.isArray(answerText) ? answerText.join(', ') : answerText,
    answered: value.isUsed,
  });
}

function sdkEventContext(row, value) {
  return clean({ source: 'sdk', name: value.type ?? row.name, timestamp: value.timestamp, data: value.data });
}

// The whole recorded record is also reachable as {data}. It is non-enumerable so field chips don't list everything twice.
function withData(ctx, value) {
  if (!('data' in ctx))
    Object.defineProperty(ctx, 'data', { value, enumerable: false });
  return ctx;
}

function genericContext(row, value) {
  const base = value && typeof value === 'object' && !Array.isArray(value) ? value : { value };
  const kind = base.kind ?? base.type;
  const derived = {};
  if (row.key.startsWith('local-part:')) {
    const text = Array.isArray(base.value) ? base.value.join('') : typeof base.value === 'string' ? base.value : undefined;
    derived.text = text;
    derived.target = base.name ?? base.inlineReference?.fsPath ?? base.uri?.path ?? base.uri?.fsPath;
  }
  if (base.kind === 'questionCarousel' && Array.isArray(base.questions)) {
    derived.question = base.questions.map(item => item.title ?? item.message).filter(Boolean).join(' / ');
    derived.choices = base.questions.flatMap(item => (item.options ?? []).map(option => option.label ?? option.value));
    const answers = Object.values(base.data ?? {}).map(item => item?.selectedValue ?? item?.freeformValue ?? item?.value).filter(Boolean);
    derived.answer = answers.length ? answers.flat().join(', ') : undefined;
  }
  const ctx = clean({ source: row.key.startsWith('sdk') ? 'sdk' : 'local', name: typeof kind === 'string' ? kind : row.name, ...base, ...derived });
  return withData(ctx, value);
}

export function buildContext(row, example) {
  const value = example.value;
  if (!value || typeof value !== 'object')
    return { name: row.name, value };
  if (row.key.startsWith('tool:')) {
    if (example.family === 'local')
      return localToolContext(value);
    return example.slot === 'sdk:request' ? sdkRequestContext(value) : sdkToolContext(value);
  }
  if (row.key.startsWith('sdk-question:')) {
    return value.start ? sdkToolContext(value) : sdkRequestContext(value);
  }
  if (row.key.startsWith('local-question:'))
    return questionContext(value);
  if (row.key.startsWith('sdk-event:'))
    return sdkEventContext(row, value);
  return genericContext(row, value);
}
