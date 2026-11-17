// Replaces sensitive examples in the derived scan snapshot. Original chat journals remain read-only.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hasMilReference, privateFolder, replaceMilExample } from './common.mjs';

const file = path.join(privateFolder, 'scan.private.json');
const scan = JSON.parse(readFileSync(file, 'utf8'));
let replacements = 0;
for (const row of scan.rows) {
  row.examples = (row.examples ?? []).map(example => {
    const replacement = replaceMilExample(example, row.name);
    replacement !== example && replacements++;
    return replacement;
  });
}
if (hasMilReference(scan))
  throw new Error('Military domain references remain outside example payloads. The scan was not changed.');
replacements > 0 && writeFileSync(file, JSON.stringify(scan));
console.log(`Replaced ${replacements} examples in the derived scan. Original chats were not changed.`);
