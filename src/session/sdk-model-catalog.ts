import type { EventFields } from './sdk-event-fields.ts';

type Labels = ReadonlyArray<readonly [string, string]>;
type CatalogSection = (fields: EventFields) => string[];

function scalars (fields: EventFields, type: 'string' | 'number' | 'boolean', labels: Labels): string[] {
  const lines: string[] = [];
  for (const [key, label] of labels) {
    const value = type === 'string' ? fields.string(key) : type === 'number' ? fields.number(key) : fields.flag(key);
    value !== undefined && lines.push(`${label}: ${value}`);
  }
  return lines;
}

function list (fields: EventFields, key: string, label: string): string[] {
  const list = fields.stringList(key);
  if (list === undefined)
    return [];
  if (list.values.length)
    return [`${label}:\n${list.values.map(value => `- ${value}`).join('\n')}`];
  return [`${label}: ${list.empty ? '[]' : '(no valid string members)'}`];
}

function emptyObject (fields: EventFields): string {
  return fields.isEmpty() ? '(empty object)' : '(no valid supported fields)';
}

function object (fields: EventFields, key: string, label: string, render: CatalogSection): string[] {
  const nested = fields.record(key);
  if (!nested)
    return [];
  const lines = render(nested);
  nested.finish();
  return [`${label}:\n${lines.length ? lines.join('\n') : emptyObject(nested)}`];
}

function group (label: string, lines: string[]): string[] {
  return lines.length ? [`${label}:\n${lines.join('\n')}`] : [];
}

const prices: CatalogSection = fields => scalars(fields, 'number', [
  ['cache_read_price', 'Cache read price'], ['cache_write_price', 'Cache write price'],
  ['input_price', 'Input price'], ['max_prompt_tokens', 'Max prompt tokens'], ['output_price', 'Output price'],
]);

/** Keep the reviewed catalog fields as configuration, not usage or producer identity. */
export function modelCatalog (fields: EventFields): string[] {
  const identity = [
    ...scalars(fields, 'string', [
      ['id', 'Catalog model ID'], ['name', 'Catalog model name'], ['object', 'Catalog object'],
      ['vendor', 'Catalog vendor'], ['version', 'Catalog model version'], ['modelProviderId', 'Catalog provider ID'],
    ]),
    ...scalars(fields, 'number', [['modelProviderOrdering', 'Catalog provider ordering']]),
    ...object(fields, 'provider', 'Provider', provider => scalars(provider, 'string', [
      ['id', 'ID'], ['kind', 'Kind'], ['label', 'Label'],
    ])),
  ];
  const availability = [
    ...scalars(fields, 'boolean', [['is_chat_default', 'Chat default'], ['is_chat_fallback', 'Chat fallback']]),
    ...scalars(fields, 'string', [['model_picker_category', 'Model picker category']]),
    ...scalars(fields, 'boolean', [['model_picker_enabled', 'Model picker enabled']]),
    ...scalars(fields, 'string', [['model_picker_price_category', 'Model picker price category']]),
    ...scalars(fields, 'boolean', [['preview', 'Preview']]),
    ...list(fields, 'supported_endpoints', 'Supported endpoints'),
  ];
  const capabilities = object(fields, 'capabilities', 'Capabilities', capability => [
    ...scalars(capability, 'string', [
      ['family', 'Family'], ['object', 'Object'], ['tokenizer', 'Tokenizer'], ['type', 'Type'],
    ]),
    ...object(capability, 'limits', 'Limits', limits => [
      ...scalars(limits, 'number', [
        ['max_context_window_tokens', 'Max context window tokens'], ['max_output_tokens', 'Max output tokens'],
        ['max_prompt_tokens', 'Max prompt tokens'],
      ]),
      ...object(limits, 'vision', 'Vision', vision => [
        ...scalars(vision, 'number', [['max_prompt_image_size', 'Max prompt image size'], ['max_prompt_images', 'Max prompt images']]),
        ...list(vision, 'supported_media_types', 'Supported media types'),
      ]),
    ]),
    ...object(capability, 'supports', 'Supports', supports => [
      ...scalars(supports, 'boolean', [
        ['parallel_tool_calls', 'Parallel tool calls'], ['streaming', 'Streaming'],
        ['structured_outputs', 'Structured outputs'], ['tool_calls', 'Tool calls'], ['vision', 'Vision'],
      ]),
      ...list(supports, 'reasoning_effort', 'Reasoning effort'),
      ...scalars(supports, 'string', [['adaptive_thinking', 'Adaptive thinking']]),
    ]),
  ]);
  const billing = object(fields, 'billing', 'Configured billing (not charges)', billing => [
    ...scalars(billing, 'number', [['auto_discount', 'Auto discount']]),
    ...list(billing, 'restricted_to', 'Restricted to'),
    ...object(billing, 'token_prices', 'Token prices (configuration, currency not inferred)', tokens => [
      ...scalars(tokens, 'number', [['batch_size', 'Batch size']]),
      ...object(tokens, 'default', 'Default', prices),
      ...object(tokens, 'long_context', 'Long context', prices),
    ]),
  ]);
  fields.finish();
  const sections = [...group('Identity and provider', identity), ...group('Availability and endpoints', availability), ...capabilities, ...billing];
  return sections.length ? sections : [emptyObject(fields)];
}
