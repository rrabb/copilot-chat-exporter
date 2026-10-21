import type { ParsedSession } from './types.ts';
import { clip, thousands } from './text.ts';
import { defaultSessionTitle } from './session/journal.ts';

const promptPreview = (prompt: string) => clip(prompt, 100) || '(none)';

export function localCompactTimestamp (value: number | null | undefined) {
  if (!value || !Number.isFinite(value))
    return 'unavailable';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getFullYear() % 100)}${pad(date.getMonth() + 1)}${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatExportSummary (options: {
  sessionId: string;
  session: ParsedSession;
  resourceCount: number;
  outputPath: string;
  outputSize: number;
  verificationFailed?: boolean;
}) {
  const { sessionId, session, resourceCount, outputPath, outputSize } = options;
  const firstPrompt = session.turns[0]?.prompt ?? '';
  const lastPrompt = session.turns.at(-1)?.prompt ?? '';
  const firstTimestamp = session.turns[0]?.ts ?? session.creationDate;
  const lastTimestamp = session.turns.reduce(
    (latest, turn) => Math.max(latest, turn.scalar.responseTimestamp ?? turn.ts ?? 0),
    0,
  ) || firstTimestamp;
  const toolCallCount = session.turns.reduce((sum, turn) => sum + turn.toolNodes.length, 0);
  const thoughtCount = session.turns.reduce((sum, turn) => sum + turn.reasoning.length, 0);
  const title = session.title || '(untitled)';
  const lines = [
    options.verificationFailed ? `Export failed verification; written as ${outputPath}` : `Exported session ${sessionId}:`,
    `Title: ${title}`,
  ];

  if (session.customTitle && session.customTitle !== title)
    lines.push(`Custom Title: ${session.customTitle}`);

  // VS Code's default title normally repeats the first prompt's first 200 characters. Surface
  // it only if a future or imported session supplies a genuinely different value.
  const firstPromptDefault = defaultSessionTitle(firstPrompt);
  if (
    session.defaultTitle
    && session.defaultTitle !== title
    && session.defaultTitle !== session.customTitle
    && session.defaultTitle !== firstPromptDefault
  )
    lines.push(`Default Title: ${session.defaultTitle}`);

  lines.push(
    `First Prompt: ${promptPreview(firstPrompt)}`,
    `Last Prompt: ${promptPreview(lastPrompt)}`,
    `Session from ${localCompactTimestamp(firstTimestamp)} to ${localCompactTimestamp(lastTimestamp)}`,
    `Turns: ${session.turns.length}; tool calls: ${toolCallCount}; reasoning thoughts: ${thoughtCount}; resources: ${resourceCount}.`,
    `Output: ${outputPath} (${thousands(outputSize)} bytes)`,
  );

  return lines;
}