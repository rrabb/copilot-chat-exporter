import { thousands } from '../text.ts';
import type { LossAccount } from './loss-account.ts';

/** Console summary of a Layer D account; see loss-account.ts for its limits. */
export function printLossAccount (account: LossAccount, source: string): void {
  console.log(`Layer D - recorded content vs ${source} (independent of the parser and renderer)`);
  console.log(`- Content pieces checked: ${thousands(account.checked)} (prompts, answers, reasoning, tool input/output, errors)`);
  for (const [category, row] of Object.entries(account.totals).sort(([left], [right]) => left.localeCompare(right)))
    console.log(`  - ${category}: ${thousands(row.present)} present, ${thousands(row.partial)} partial, ${thousands(row.absent)} absent`);
  const absent = account.unaccounted.filter((item) => item.status === 'absent');
  const partial = account.unaccounted.length - absent.length;
  if (absent.length)
    console.log(`- NOT IN THE EXPORT: ${absent.length} piece(s), e.g. ${absent.slice(0, 3).map((item) => `request ${item.request} ${item.category}`).join('; ')}`);
  if (partial)
    console.log(`- Only partly in the export: ${partial} piece(s). No proven accepted cause; strict verification fails.`);
  if (!account.unaccounted.length)
    console.log('- Every checked piece of recorded content appears in the export.');
  console.log(`- Source-ordered message text: ${thousands(account.order.checked)} piece(s) checked, ${thousands(account.order.outOfOrder)} out of order`);
  console.log(`- Repeated source-distinct message text: ${thousands(account.multiplicity.checked)} group(s) checked, ${thousands(account.multiplicity.missing)} occurrence(s) missing`);
  console.log('  Local order checks prompts/prose; SDK order checks prompts, reasoning, prose and tool intent per agent scope. Other text is checked for presence; non-text content such as images is not checked.');
}
