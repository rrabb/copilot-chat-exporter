import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { captureCensus, replayCensus } from './fusion-census-files.ts';
import { object, WINDOW_END, WINDOW_START } from './fusion-census.ts';

const help = [
  'WI-054 private Fusion census. No exporter behavior or native source writes.',
  '',
  'Capture: node scripts\\fusion-census-cli.ts --source-root <session-state-dir> --output-dir <new-private-dir> [--inventory-only]',
  '         Repeat --source-root for additional known SDK roots. All creation dates are scanned.',
  '         Or use --copilot-home <home> to scan its session-state directory.',
  '         --inventory-only keeps private inventory, manifests and hashes, but NO event bytes. It cannot be replayed.',
  '         Without that flag, selected, review and unstable sources are frozen for replay.',
  '         Inventory data stays in RAM. Inventory-only reports use chunked gzip JSON and a slim manifest.',
  'Replay:  node scripts\\fusion-census-cli.ts --frozen-input <prior-private-dir> --output-dir <new-private-dir>',
  '',
  'Output must be a NEW directory under temp-tool-output\\261114-0030-fusion-census.',
  'Existing outputs are never replaced. Raw reports and frozen inputs are PRIVATE.',
  `Window: ${WINDOW_START} through ${WINDOW_END}, both endpoints included.`,
  'Only immediate session directories containing events.jsonl are scanned. No recursive backup/Local search.',
  'Exit 0: complete field census. Exit 2: partial report saved. Exit 1: command/output failure.',
  'Complete means raw field coverage for selected parsed records, not complete semantic understanding.',
].join('\n');

export async function main (args: string[]): Promise<number> {
  const { values } = parseArgs({
    args, strict: true, allowPositionals: false,
    options: {
      'source-root': { type: 'string', multiple: true },
      'copilot-home': { type: 'string' },
      'frozen-input': { type: 'string' },
      'output-dir': { type: 'string' },
      'inventory-only': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(help);
    return 0;
  }
  if (!values['output-dir']?.trim())
    throw new Error('Supply --output-dir.');
  const roots = [...(values['source-root'] ?? [])];
  if (values['copilot-home'] !== undefined) {
    if (!values['copilot-home'].trim())
      throw new Error('Supply a nonempty --copilot-home.');
    roots.push(path.join(values['copilot-home'], 'session-state'));
  }
  const frozen = values['frozen-input'];
  if (frozen !== undefined && values['inventory-only'])
    throw new Error('--inventory-only is capture-only and cannot be combined with --frozen-input.');
  if (frozen !== undefined && (!frozen.trim() || roots.length))
    throw new Error('Use either --frozen-input or source roots, not both.');
  if (frozen === undefined && !roots.length)
    throw new Error('Supply --source-root or --copilot-home. No implicit whole-disk discovery.');
  const report = frozen === undefined
    ? await captureCensus({ sourceRoots: roots, outputDirectory: values['output-dir'], inventoryOnly: values['inventory-only'] })
    : await replayCensus({ frozenDirectory: frozen, outputDirectory: values['output-dir'] });
  console.log(JSON.stringify({ status: report.status, inventoryStatus: report.inventoryStatus, retention: report.retention, ...report.summary }));
  return report.status === 'partial' ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    const code = object(error) && typeof error.code === 'string' ? error.code : 'command-failed';
    // Error messages from filesystem/JSON parsers can contain private paths or source text.
    console.error(`Fusion census failed (${code}). No existing output was replaced. Use --help to check arguments.`);
    process.exitCode = 1;
  }
}
