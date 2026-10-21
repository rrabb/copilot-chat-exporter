import assert from 'node:assert/strict';
import test from 'node:test';
import { exportFailureFromReport, failureWarning } from '../src/verify/export-failure.ts';

test('failure warning limits missing locations to five without including source text', () => {
  const locations = Array.from({ length: 8 }, (_, index) => ({
    request: index + 1, category: 'prompt', status: 'absent' as const, chars: 20, sample: 'PRIVATE CONTENT',
  }));
  const failure = exportFailureFromReport({
    exitCode: 2, failureReasons: ['layer-d'],
    layerD: { totals: { prompt: { present: 0, partial: 0, absent: 8 } } },
    parser: { checks: [] },
  }, locations)!;
  const warning = failureWarning(failure, 'private-copy');
  assert.match(warning, /request 1 prompt/u);
  assert.match(warning, /request 5 prompt/u);
  assert.match(warning, /and 3 more/u);
  assert.doesNotMatch(warning, /request 6|PRIVATE CONTENT/u);
  assert.equal(failure.counts?.['layer-d'], 8);
});
