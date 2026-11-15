import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertFilesEqual, DIRECTORY, filesFor, generationHash, readExpected, readFiles, renderAll, sha256 } from './support.ts';

const args = process.argv.slice(2);
assert.ok(args.length <= 1 && (!args.length || args[0] === '--check' || args[0] === '--update'),
  'Use --check (default) or deliberate --update after reviewing the semantic changes.');
const outputs = renderAll();
const files = filesFor(outputs);

if (args[0] !== '--update') {
  assertFilesEqual(files, readExpected());
  console.log(`SDK golden check: ${outputs.size} archives and exact companion bytes match.`);
} else {
  // Retained generations are immutable. Only the active selector changes on an approved update.
  const generation = generationHash(files);
  const directory = path.join(DIRECTORY, 'expected', generation);
  if (fs.existsSync(directory)) {
    assertFilesEqual(files, readFiles(directory));
  } else {
    for (const [key, bytes] of files) {
      const destination = path.join(directory, ...key.split('/'));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, bytes, { flag: 'wx' });
    }
    assertFilesEqual(files, readFiles(directory));
  }
  const manifest = JSON.stringify({
    format: 1, generation,
    files: [...files].sort(([left], [right]) => left.localeCompare(right, 'en')).map(([file, bytes]) =>
      ({ file, bytes: bytes.length, sha256: sha256(bytes) })),
  }, null, 2) + '\n';
  const active = path.join(DIRECTORY, 'active.json');
  if (!fs.existsSync(active) || fs.readFileSync(active, 'utf8') !== manifest)
    fs.writeFileSync(active, manifest);
  assertFilesEqual(files, readExpected());
  console.log(`SDK golden candidate: ${outputs.size} archives, generation ${generation}. Review every changed archive and companion before acceptance.`);
}
