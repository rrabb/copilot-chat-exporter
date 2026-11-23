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

export interface ExportSummaryOptions {
  sessionId: string;
  session: ParsedSession;
  resourceCount: number;
  outputPath: string;
  outputSize: number;
  verificationFailed?: boolean;
}

export interface ExportSummary {
  sessionId: string;
  title: string;
  customTitle: string | null;
  defaultTitle: string | null;
  firstPrompt: string;
  lastPrompt: string;
  startedAt: string;
  endedAt: string;
  turns: number;
  toolCalls: number;
  reasoningThoughts: number;
  resources: number;
  outputPath: string;
  outputBytes: number;
  verificationFailed: boolean;
}

export function buildExportSummary (options: ExportSummaryOptions): ExportSummary {
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
  const firstPromptDefault = defaultSessionTitle(firstPrompt);
  const customTitle = session.customTitle && session.customTitle !== title ? session.customTitle : null;
  const defaultTitle = session.defaultTitle
    && session.defaultTitle !== title
    && session.defaultTitle !== session.customTitle
    && session.defaultTitle !== firstPromptDefault
    ? session.defaultTitle : null;
  return {
    sessionId, title, customTitle, defaultTitle,
    firstPrompt: promptPreview(firstPrompt), lastPrompt: promptPreview(lastPrompt),
    startedAt: localCompactTimestamp(firstTimestamp), endedAt: localCompactTimestamp(lastTimestamp),
    turns: session.turns.length, toolCalls: toolCallCount, reasoningThoughts: thoughtCount,
    resources: resourceCount, outputPath, outputBytes: outputSize,
    verificationFailed: options.verificationFailed === true,
  };
}

export function formatExportSummary (options: ExportSummaryOptions) {
  const summary = buildExportSummary(options);
  const { sessionId, title, customTitle, defaultTitle, firstPrompt, lastPrompt } = summary;
  const lines = [
    summary.verificationFailed ? `Export failed verification; written as ${summary.outputPath}` : `Exported session ${sessionId}:`,
    `Title: ${title}`,
  ];
  customTitle && lines.push(`Custom Title: ${customTitle}`);
  defaultTitle && lines.push(`Default Title: ${defaultTitle}`);

  lines.push(
    `First Prompt: ${firstPrompt}`,
    `Last Prompt: ${lastPrompt}`,
    `Session from ${summary.startedAt} to ${summary.endedAt}`,
    `Turns: ${summary.turns}; tool calls: ${summary.toolCalls}; reasoning thoughts: ${summary.reasoningThoughts}; resources: ${summary.resources}.`,
    `Output: ${summary.outputPath} (${thousands(summary.outputBytes)} bytes)`,
  );

  return lines;
}