export interface PromptPreview {
  text: string;
  wordCount: number;
  clipped: boolean;
}

export function listingModelLabel (id: string): string {
  const name = id.split('/').at(-1) ?? id;
  const claude = /^claude-(opus|sonnet|haiku)-(\d+)(?:[.-](\d+))?(?:-\d{8})?$/iu.exec(name);
  if (claude)
    return `${claude[1][0].toUpperCase()}${claude[1].slice(1)} ${claude[2]}${claude[3] ? `.${claude[3]}` : ''}`;
  if (/^gpt-/iu.test(name))
    return name.replace(/-\d{4}-\d{2}-\d{2}$/u, '').replace(/^gpt/iu, 'GPT');
  return /^auto$/iu.test(name) ? 'Auto' : name;
}

export function previewListingPrompt (prompt: string): PromptPreview {
  const words = prompt.trim().split(/\s+/u).filter(Boolean);
  const clipped = words.length > 70;
  return {
    text: clipped ? `${words.slice(0, 50).join(' ')} . . . . . ${words.slice(-20).join(' ')}` : words.join(' '),
    wordCount: words.length,
    clipped,
  };
}

/** A derived SDK overview only; callers keep full recorded text in its own disclosure. */
export function sdkListingPromptOverview (prompt: string): string {
  let overview = prompt;
  for (const name of ['reminder', 'system_reminder', 'system-reminder', 'attachments', 'context', 'current_datetime'])
    overview = overview.replace(new RegExp(`<${name}>[\\s\\S]*?</${name}>\\s*`, 'gu'), '');
  const requests = [...overview.matchAll(/<(userRequest|user_query)>([\s\S]*?)<\/\1>/gu)];
  if (!requests.length)
    return overview.trim() || prompt.trim();
  const outside = overview.replace(/<(userRequest|user_query)>[\s\S]*?<\/\1>/gu, '').trim();
  return outside || requests.map((match) => match[2].trim()).join('\n\n') || prompt.trim();
}

function validDate (timestamp: number | null | undefined): Date | null {
  if (timestamp == null || !Number.isFinite(timestamp))
    return null;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatLocalListingDate (timestamp: number | null | undefined): string {
  const date = validDate(timestamp);
  if (!date)
    return 'unknown';
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(date.getFullYear() % 100)}${two(date.getMonth() + 1)}${two(date.getDate())}_${two(date.getHours())}:${two(date.getMinutes())}`;
}

export function formatListingTurnDate (
  timestamp: number | null | undefined,
  createdTimestamp: number | null | undefined,
): string {
  const date = validDate(timestamp);
  const created = validDate(createdTimestamp);
  const full = formatLocalListingDate(timestamp);
  return date && created && date.getFullYear() === created.getFullYear() ? full.slice(2) : full;
}
