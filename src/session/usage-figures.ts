import type { UsageFigures } from '../types.ts';

export const USAGE_METRICS = ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens', 'nanoAiu', 'durationMs'] as const;

export function sumKnown (left: number | null, right: number | null): number | null {
  if (left === null || right === null)
    return null;
  const sum = left + right;
  return Number.isFinite(sum) ? sum : null;
}

export function sumUsageFigures (left: UsageFigures, right: UsageFigures): UsageFigures {
  const result = { ...left, calls: left.calls + right.calls };
  for (const key of USAGE_METRICS)
    result[key] = sumKnown(left[key], right[key]);
  return result;
}
