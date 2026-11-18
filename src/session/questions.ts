// Questions the agent asked the user, and the user's answers, parsed into `QuestionRecord`s.
//
// Every input here is a private, undocumented record format (see WI-068), so parsing is best-effort.
// Each record keeps the recorded payloads in `raw` and the recorded answer in `answerText`. When the
// answer doesn't match a known format, `parseWarning` is set and nothing is guessed, so a renderer
// can fall back to showing the raw data.

import type { QuestionAnswer, QuestionField, QuestionOption, QuestionOutcome, QuestionRecord, QuestionWarningDetail } from '../types.ts';

type Payload = Record<string, unknown>;

const isPayload = (value: unknown): value is Payload => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => typeof value === 'string' ? value : '';
const scalar = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
/** VS Code stores some text as `{ value }` Markdown strings. */
const markdown = (value: unknown): string => str(value) || (isPayload(value) ? str(value.value) : '');

/** VS Code replaces password answers with this mask (inferred from source, not seen here). */
const PASSWORD_MASK = '••••••••';

/** The `tool.execution_complete` facts `parseAskUser` needs. */
export interface AskUserResult {
  isComplete: boolean;
  success?: boolean;
  content: string;
  detailed: string;
  error?: string;
  /** The recorded result payload, kept for the fail-safe view. */
  raw?: unknown;
}

function withDefaults (options: QuestionOption[], defaults: unknown): QuestionOption[] {
  const marked = new Set((Array.isArray(defaults) ? defaults : [defaults]).map(scalar).filter(Boolean));
  return options.filter((option) => option.value).map((option) => marked.has(option.value) ? { ...option, isDefault: true } : option);
}

function schemaField (id: string, property: Payload): QuestionField {
  const list = isPayload(property.items) ? property.items : property;
  const listed = Array.isArray(list.oneOf) ? list.oneOf : Array.isArray(list.anyOf) ? list.anyOf : null;
  const names = Array.isArray(property.enumNames) ? property.enumNames : Array.isArray(list.enumNames) ? list.enumNames : [];
  let options: QuestionOption[] = [];
  if (listed)
    options = listed.filter(isPayload).map((option) => ({ value: scalar(option.const), label: str(option.title) || scalar(option.const) }));
  else if (Array.isArray(list.enum))
    options = list.enum.map((value, index) => ({ value: scalar(value), label: str(names[index]) || scalar(value) }));
  const type = str(property.type);
  if (type === 'boolean')
    options = [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];
  const kind: QuestionField['kind'] = type === 'array' ? 'multi' : type === 'boolean' ? 'boolean'
    : type === 'number' || type === 'integer' ? 'number' : options.length ? 'single' : 'text';
  const description = str(property.description);
  return {
    id, title: str(property.title) || id, ...(description ? { message: description } : {}), kind,
    options: withDefaults(options, property.default), allowFreeform: kind !== 'boolean',
  };
}

/** Matches a recorded value to the field's options. Values that match no option are freeform text. */
function answerFor (field: QuestionField, value: string): QuestionAnswer {
  if (field.kind === 'multi') {
    // Picks are joined with ", " and option text can itself contain ", ", so match whole options,
    // longest first, instead of splitting on commas.
    const selected: string[] = [];
    let rest = value;
    while (rest) {
      const match = field.options
        .flatMap((option) => [option.value, option.label].map((text) => ({ option, text })))
        .filter(({ text }) => text && (rest === text || rest.startsWith(`${text}, `)))
        .sort((a, b) => b.text.length - a.text.length)[0];
      if (!match)
        break;
      selected.push(match.option.value);
      rest = rest.slice(match.text.length).replace(/^, /u, '');
    }
    return rest ? { selected, freeform: rest } : { selected };
  }
  const option = field.options.find((item) => item.value === value) ?? field.options.find((item) => item.label === value);
  return option ? { selected: [option.value] } : { selected: [], freeform: value };
}

/** `detailedContent`: a `User responded:` line, then one `<title or key>: <value>` line per answered field. */
function detailedValues (detailed: string, fields: QuestionField[]): Map<string, string> | null {
  const lines = detailed.replace(/\r\n/gu, '\n').split('\n');
  if (!lines[0]?.startsWith('User responded:'))
    return null;
  const prefixes = fields
    .flatMap((field) => [...new Set([field.title, field.id])].map((label) => ({ id: field.id, prefix: `${label}: ` })))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  const values = new Map<string, string>();
  let current = '';
  for (const line of lines.slice(1)) {
    const match = prefixes.find(({ id, prefix }) => !values.has(id) && line.startsWith(prefix));
    if (match) {
      current = match.id;
      values.set(current, line.slice(match.prefix.length));
    } else if (current) {
      // Not seen in recorded data: a typed answer with line breaks continues the previous field.
      values.set(current, `${values.get(current)}\n${line}`);
    } else if (line.trim()) {
      return null;
    }
  }
  return values.size ? values : null;
}

/** `content`: `User responded: <value>` for one field, `key=value, key=value` for several. */
function contentValues (content: string, fields: QuestionField[]): Map<string, string> | null {
  const prefix = 'User responded: ';
  if (!content.startsWith(prefix))
    return null;
  const body = content.slice(prefix.length);
  if (fields.length === 1)
    return new Map([[fields[0].id, body]]);
  const starts = fields.flatMap((field) => {
    const at = [0, ...[...body.matchAll(/, /gu)].map((hit) => hit.index + 2)].find((index) => body.startsWith(`${field.id}=`, index));
    return at === undefined ? [] : [{ id: field.id, at, valueAt: at + field.id.length + 1 }];
  }).sort((a, b) => a.at - b.at);
  if (!starts.length)
    return null;
  return new Map(starts.map((start, index) => [start.id, body.slice(start.valueAt, index + 1 < starts.length ? starts[index + 1].at - 2 : undefined)]));
}

/**
 * Parses a Copilot CLI or Agent Host `ask_user` call. Two input styles were observed: `{ message,
 * requestedSchema }` and the older `{ question, choices, allow_freeform }`.
 */
export function parseAskUser (args: unknown, result: AskUserResult): QuestionRecord {
  const input = isPayload(args) ? args : {};
  const schema = isPayload(input.requestedSchema) ? input.requestedSchema : {};
  const properties = isPayload(schema.properties) ? schema.properties : {};
  const isChoiceStyle = !isPayload(input.requestedSchema) && 'question' in input;
  let fields: QuestionField[];
  if (isChoiceStyle) {
    const options = (Array.isArray(input.choices) ? input.choices : []).map(scalar).filter(Boolean).map((choice) => ({ value: choice, label: choice }));
    fields = [{ id: 'choice', title: '', kind: options.length ? 'single' : 'text', options, allowFreeform: input.allow_freeform !== false }];
  } else {
    fields = Object.entries(properties).flatMap(([id, property]) => isPayload(property) ? [schemaField(id, property)] : []);
    fields.length || (fields = [{ id: 'answer', title: '', kind: 'text', options: [], allowFreeform: true }]);
  }
  const record: QuestionRecord = {
    source: 'ask_user', message: str(input.message) || str(input.question), fields, outcome: 'unanswered', answerText: '',
    raw: { question: args ?? null, answer: result.isComplete ? result.raw ?? null : null },
  };
  if (!result.isComplete)
    return record;
  record.answerText = result.content || result.error || '';
  // The decline and cancel result texts aren't known (WI-068), so only the wording decides them.
  const ended: QuestionOutcome | null = /\bdeclin/iu.test(record.answerText) ? 'declined' : /\bcancel/iu.test(record.answerText) ? 'cancelled' : null;
  if (result.success === false || result.error) {
    record.outcome = ended ?? 'failed';
    return record;
  }
  const unrecognized = (warning: string): QuestionRecord =>
    ({ ...record, outcome: ended ?? 'unknown', parseWarning: ended ? `${warning} The outcome was inferred from its wording.` : warning });
  if (isChoiceStyle) {
    const match = /^User selected: ([\s\S]*)$/u.exec(result.content) ?? /^User responded: ([\s\S]*)$/u.exec(result.content);
    if (!match)
      return unrecognized('The answer text has no known prefix.');
    const answer = answerFor(fields[0], match[1]);
    if (result.content.startsWith('User selected: ') && !answer.selected.length)
      return unrecognized('The selected choice is not among the listed choices.');
    fields[0].answer = answer;
    record.outcome = 'answered';
    return record;
  }
  const values = detailedValues(result.detailed, fields) ?? contentValues(result.content, fields);
  if (!values)
    return unrecognized('The answer text did not match the known answer formats.');
  for (const field of fields) {
    const value = values.get(field.id);
    value && (field.answer = answerFor(field, value));
  }
  record.outcome = 'answered';
  return record;
}

function carouselAnswer (field: QuestionField, value: unknown): QuestionAnswer | 'unrecognized' | undefined {
  if (value === undefined || value === null || value === '')
    return undefined;
  if (typeof value === 'string') {
    if (value === PASSWORD_MASK)
      return { selected: [], freeform: value, masked: true };
    return answerFor({ ...field, kind: field.kind === 'multi' ? 'single' : field.kind }, value);
  }
  if (!isPayload(value))
    return 'unrecognized';
  const many = Array.isArray(value.selectedValues) ? value.selectedValues.map(scalar).filter(Boolean) : null;
  const one = scalar(value.selectedValue);
  const freeform = str(value.freeformValue);
  if (!many && !one && !('freeformValue' in value))
    return 'unrecognized';
  const selected = many ?? (one ? [one] : []);
  if (!selected.length && !freeform)
    return undefined;
  return freeform ? { selected, freeform } : { selected };
}

/**
 * Parses a Local `questionCarousel` response part. `vscode_askQuestions` writes one with a
 * `resolveId` equal to its `toolCallId`. MCP forms write one without a `resolveId` (inferred from
 * VS Code source, not seen here).
 */
export function parseCarousel (part: unknown): QuestionRecord {
  const input = isPayload(part) ? part : {};
  const data = isPayload(input.data) ? input.data : {};
  const resolveId = str(input.resolveId);
  const { data: _data, ...question } = input;
  let unrecognized = 0;
  const fields = (Array.isArray(input.questions) ? input.questions : []).filter(isPayload).map((item, index): QuestionField => {
    const id = str(item.id);
    const type = str(item.type);
    const options = (Array.isArray(item.options) ? item.options : []).filter(isPayload)
      .map((option) => ({ id: scalar(option.id), value: scalar(option.value) || markdown(option.label), label: markdown(option.label) || scalar(option.value) }));
    const defaults = (Array.isArray(item.defaultValue) ? item.defaultValue : [item.defaultValue]).map(scalar).filter(Boolean);
    const message = [...new Set([markdown(item.message), markdown(item.detailedMessage)].filter(Boolean))].join('\n\n');
    const field: QuestionField = {
      id: id || `${resolveId}:${index}`, title: markdown(item.title), ...(message ? { message } : {}),
      kind: type === 'multiSelect' ? 'multi' : type === 'singleSelect' ? 'single' : 'text',
      options: options.map(({ id: optionId, ...option }) =>
        defaults.includes(option.value) || (optionId && defaults.includes(optionId)) ? { ...option, isDefault: true } : option),
      allowFreeform: item.allowFreeformInput === true,
    };
    const answer = carouselAnswer(field, data[field.id] ?? data[`${resolveId}:${index}`]);
    if (answer === 'unrecognized')
      unrecognized += 1;
    else
      answer && (field.answer = answer);
    return field;
  });
  const source = isPayload(input.source) ? input.source : {};
  // The MCP source label field names are inferred from VS Code source and not seen here.
  const server = str(input.source) || str(source.label) || str(source.serverLabel) || str(source.name);
  const answered = fields.some((field) => field.answer);
  const outcome: QuestionOutcome = answered ? 'answered' : unrecognized ? 'unknown' : 'unanswered';
  return {
    source: resolveId ? 'vscode_askQuestions' : 'mcp-form', message: markdown(input.message), fields, outcome, answerText: '',
    ...(unrecognized ? { parseWarning: `${unrecognized} answer value(s) had an unknown format.` } : {}),
    ...(server ? { server } : {}),
    raw: { question, answer: input.data ?? null },
  };
}

/**
 * Parses a Local `elicitationSerialized` part: an MCP confirmation or URL request. VS Code keeps only
 * accepted or rejected, and saves a still-pending request as rejected (inferred from source, not
 * seen here), so `rejected` can also mean "never answered".
 */
export function parseElicitation (part: unknown): QuestionRecord {
  const input = isPayload(part) ? part : {};
  const state = str(input.state);
  const outcome: QuestionOutcome = state === 'accepted' ? 'accepted' : state === 'rejected' ? 'rejected' : 'unknown';
  const server = markdown(input.subtitle).replace(/ \(MCP Server\)$/u, '');
  const title = markdown(input.title);
  return {
    source: 'mcp-confirmation', ...(title ? { title } : {}), message: markdown(input.message), fields: [], outcome, answerText: state,
    ...(outcome === 'unknown' ? { parseWarning: `Unknown elicitation state "${state}".` } : {}),
    ...(server ? { server } : {}),
    raw: { question: input, answer: input.acceptedResult ?? null },
  };
}

// --- Unrecognized question tools -------------------------------------------------------------

/** Tools with their own parser. Every other name is checked by `isQuestionLikeTool`. */
export const KNOWN_QUESTION_TOOLS = new Set(['ask_user', 'vscode_askQuestions']);

// Whole words only, so `task` or `mask` never match `ask`. `confirm` and `prompt` are left out on
// purpose: most tools with those words aren't questions to the user.
const QUESTION_WORDS = new Set(['ask', 'asks', 'question', 'questions', 'elicit', 'elicitation', 'choose', 'choice', 'choices', 'clarify', 'clarification', 'poll', 'survey']);

/** Splits `askUserQuestion`, `mcp_ask-user` and `user.input` into lowercase words. */
const toolWords = (name: string) => name.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);

/** True for a tool that isn't a known question tool but whose name says it asks the user something. */
export function isQuestionLikeTool (name: string): boolean {
  if (!name || KNOWN_QUESTION_TOOLS.has(name))
    return false;
  const words = toolWords(name);
  return words.some((word) => QUESTION_WORDS.has(word)) || words.join(' ').includes('user input');
}

const MESSAGE_KEYS = ['message', 'question', 'prompt', 'text', 'body', 'description', 'query'];
const TITLE_KEYS = ['title', 'header', 'heading', 'label', 'name'];
const OPTION_KEYS = ['choices', 'options', 'answers', 'buttons', 'items', 'enum', 'suggestions'];

const firstText = (input: Payload, keys: string[]) => keys.map((key) => markdown(input[key])).find(Boolean) ?? '';

function guessOptions (input: Payload): QuestionOption[] {
  const list = OPTION_KEYS.map((key) => input[key]).find(Array.isArray) ?? [];
  return list.flatMap((item): QuestionOption[] => {
    if (isPayload(item)) {
      const label = firstText(item, ['label', 'title', 'name', 'text', 'description']) || scalar(item.value) || scalar(item.const);
      const value = scalar(item.value) || scalar(item.const) || scalar(item.id) || label;
      return label ? [{
        value, label,
        ...(item.default === true || item.isDefault === true ? { isDefault: true } : {}),
        ...(item.recommended === true ? { isRecommended: true } : {}),
      }] : [];
    }
    const text = scalar(item);
    return text ? [{ value: text, label: text }] : [];
  });
}

function guessField (input: Payload, id: string, recordMessage: string): QuestionField {
  const options = guessOptions(input);
  const multi = input.multiSelect === true || input.multiple === true || input.allowMultiple === true || str(input.type).toLowerCase().includes('multi');
  const message = firstText(input, MESSAGE_KEYS);
  return {
    id, title: firstText(input, TITLE_KEYS), ...(message && message !== recordMessage ? { message } : {}),
    kind: options.length ? (multi ? 'multi' : 'single') : 'text', options,
    // An unknown tool can't promise typed answers, so only claim it when the tool says so.
    allowFreeform: !options.length || [input.allowFreeformInput, input.allow_freeform, input.allowFreeform, input.allowCustom].includes(true),
  };
}

/**
 * Builds a best-effort question from an unrecognized question tool by looking for common field
 * names: a message, a list of choices, nested `questions`, or a JSON `requestedSchema`. The answer is
 * the result text with a "User responded:" style prefix removed. Every record is marked `guessed`,
 * so the box says so and the census reports it for review.
 */
export function parseGuessedQuestion (toolName: string, args: unknown, result: AskUserResult): QuestionRecord {
  const input = isPayload(args) ? args : {};
  const message = firstText(input, MESSAGE_KEYS);
  const schema = isPayload(input.requestedSchema) ? input.requestedSchema : isPayload(input.schema) ? input.schema : null;
  const properties = schema && isPayload(schema.properties) ? schema.properties : null;
  const nested = Array.isArray(input.questions) ? input.questions.filter(isPayload) : [];
  let fields: QuestionField[];
  if (properties)
    fields = Object.entries(properties).flatMap(([id, property]) => isPayload(property) ? [schemaField(id, property)] : []);
  else if (nested.length)
    fields = nested.map((question, index) => guessField(question, scalar(question.id) || String(index), message));
  else
    fields = [guessField(input, 'answer', message)];
  fields = fields.filter((field) => field.title || field.message || field.options.length || fields.length === 1);
  const title = firstText(input, TITLE_KEYS);
  const record: QuestionRecord = {
    source: 'guessed', toolName, ...(title && fields.length !== 1 ? { title } : {}), message, fields, outcome: 'unanswered', answerText: '',
    raw: { question: args ?? null, answer: result.isComplete ? result.raw ?? (result.content || result.error || null) : null },
  };
  if (!result.isComplete)
    return record;
  record.answerText = result.content || result.error || '';
  const ended: QuestionOutcome | null = /\bdeclin/iu.test(record.answerText) ? 'declined' : /\bcancel/iu.test(record.answerText) ? 'cancelled' : null;
  if (result.success === false || result.error) {
    record.outcome = ended ?? 'failed';
    return record;
  }
  const answer = record.answerText.replace(/^\s*(?:the\s+)?user\s+(?:responded|selected|answered|chose|picked|replied|said)\s*(?:with)?\s*:?\s*/iu, '').trim();
  if (!answer) {
    record.outcome = ended ?? 'unanswered';
    return record;
  }
  record.outcome = ended ?? 'answered';
  // Only a single field can take the answer directly. Several fields keep it as text for the box.
  fields.length === 1 && !ended && (fields[0] = { ...fields[0], answer: answerFor(fields[0], answer) });
  record.answerText = answer;
  return record;
}

interface QuestionScope { body: readonly unknown[]; }

/** Counts questions that weren't fully read, for the census: `<source>:parse-warning` and `guessed:<tool>`. */
export function questionCensus (turns: readonly QuestionScope[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const { key } of questionWarningDetails(turns))
    counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1]);
}

/** Lists each question that wasn't fully read, with its turn, title and what was read or guessed. */
export function questionWarningDetails (turns: readonly QuestionScope[]): QuestionWarningDetail[] {
  const details: QuestionWarningDetail[] = [];
  const walk = (scopes: readonly QuestionScope[], parentTurn: number | null) => {
    scopes.forEach((scope, index) => {
      const turn = parentTurn ?? index + 1;
      for (const node of scope.body) {
        if (!isPayload(node))
          continue;
        const question = node.question as QuestionRecord | undefined;
        if (question) {
          const keys = [
            ...(question.source === 'guessed' ? [`guessed:${question.toolName ?? '?'}`] : []),
            ...(question.parseWarning ? [`${question.source}:parse-warning`] : []),
          ];
          for (const key of keys)
            details.push({ key, turn, title: clipTitle(question), summary: summarize(question), argumentKeys: isPayload(question.raw.question) ? Object.keys(question.raw.question) : [] });
        }
        isPayload(node.subagent) && Array.isArray(node.subagent.turns) && walk(node.subagent.turns as QuestionScope[], turn);
      }
    });
  };
  walk(turns, null);
  return details;
}

function clipTitle (question: QuestionRecord): string {
  const text = (question.title || question.fields[0]?.title || question.message || '(no question text)').split('\n')[0].trim();
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function summarize (question: QuestionRecord): string {
  const options = question.fields.reduce((total, field) => total + field.options.length, 0);
  const parts = [`${question.fields.length} field(s)`, `${options} option(s)`, question.outcome];
  question.parseWarning && parts.push(`warning: ${question.parseWarning}`);
  return parts.join(', ');
}

/**
 * Report lines for questions that weren't fully read: one line per question, with its turn, title,
 * what was read and, for guessed tools, the argument names. Lists at most `limit` questions.
 */
export function questionWarningLines (details: readonly QuestionWarningDetail[], limit = 20): string[] {
  const lines = details.slice(0, limit).map((detail) => {
    const keys = detail.argumentKeys.length ? `. Arguments: ${detail.argumentKeys.join(', ')}` : '';
    return `${detail.key} · turn ${detail.turn} · "${detail.title}" · ${detail.summary}${keys}`;
  });
  details.length > limit && lines.push(`...and ${details.length - limit} more`);
  return lines;
}
