import type { ListingTurnEvidence } from './listing-evidence-types.ts';

export interface ListingUsageMetric {
  total: number | null;
  recorded: number;
  turns: number;
}

const trimmed = (value: number) => value.toFixed(1).replace(/\.0$/u, '');

/** Compact chip text such as 730k or 15.4M, rounded to the nearest displayed unit. */
export function compactTokenCount (count: number): string {
  if (count >= 999_500)
    return `${trimmed(count / 1_000_000)}M`;
  if (count >= 9_950)
    return `${Math.round(count / 1_000)}k`;
  if (count >= 1_000)
    return `${trimmed(count / 1_000)}k`;
  return String(Math.round(count));
}

/** Sum each recorded metric independently; absent counters are never zero. */
export function listingUsage (turns: readonly ListingTurnEvidence[]) {
  const metric = (key: 'credits' | 'promptTokens' | 'completionTokens'): ListingUsageMetric => {
    const values = turns.map((turn) => turn[key]).filter((value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0
      && (key === 'credits' || Number.isSafeInteger(value)));
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      total: values.length && Number.isFinite(total) && (key === 'credits' || Number.isSafeInteger(total)) ? total : null,
      recorded: values.length, turns: turns.length,
    };
  };
  return { credits: metric('credits'), promptTokens: metric('promptTokens'), completionTokens: metric('completionTokens') };
}
