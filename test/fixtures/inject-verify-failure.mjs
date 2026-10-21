import { promises as fs, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = process.env.CCE_FAILURE_DIRECTORY;
const stagePrefix = process.env.CCE_FAILURE_STAGE_PREFIX;
const mode = process.env.CCE_FAILURE_MODE;
const counter = process.env.CCE_FAILURE_COUNTER;
const modes = ['missing-text', 'partial-text', 'missing-image', 'missing-companion', 'read-error'];
if (!directory || !path.isAbsolute(directory) || !stagePrefix || !counter || !modes.includes(mode))
  throw new Error('Verification fault injection requires an absolute CCE_FAILURE_DIRECTORY, CCE_FAILURE_STAGE_PREFIX, CCE_FAILURE_COUNTER and a supported CCE_FAILURE_MODE.');
const target = path.resolve(directory);
const text = process.env.CCE_FAILURE_TEXT ?? 'Question';
if (!text)
  throw new Error('CCE_FAILURE_TEXT must not be empty.');
let injections = 0;
let stagedRead = false;
const original = fs.readFile;

function replace (bytes, replacement) {
  const value = typeof bytes === 'string' ? bytes : bytes.toString('utf8');
  const matches = value.split(text).length - 1;
  injections += matches;
  const changed = value.replaceAll(text, replacement);
  return typeof bytes === 'string' ? changed : Buffer.from(changed);
}

fs.readFile = async function (file, ...args) {
  const filePath = path.resolve(file instanceof URL ? fileURLToPath(file) : String(file));
  const relative = path.relative(target, filePath);
  const inside = relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  const stage = path.dirname(filePath) === target && path.basename(filePath).startsWith(stagePrefix) && args[0] === 'utf8';
  if (stage) {
    stagedRead = true;
    if (mode === 'read-error') {
      injections++;
      throw new Error('Synthetic saved-file read failure');
    }
  }
  const bytes = await original.call(this, file, ...args);
  if (stage && mode === 'missing-text')
    return replace(bytes, 'Removed!');
  if (stage && mode === 'partial-text')
    return replace(bytes, text.slice(0, 140));
  if (stagedRead && inside && relative.includes('_assets_')) {
    if (mode === 'missing-companion' && path.basename(filePath).startsWith('system-prompt-'))
      return replace(bytes, 'Removed companion text');
    if (mode === 'missing-image' && /\.(?:png|jpe?g|gif|webp|bin)$/iu.test(filePath) && Buffer.isBuffer(bytes) && bytes.length) {
      const corrupted = Buffer.from(bytes);
      corrupted[0] ^= 0xff;
      injections++;
      return corrupted;
    }
  }
  return bytes;
};

process.on('exit', () => {
  writeFileSync(counter, `${JSON.stringify({ mode, directory: target, injections }, null, 2)}\n`);
  if (!injections) {
    process.stderr.write(`No verification fault was injected: mode=${mode}, staged directory=${target}.\n`);
    process.exitCode = 86;
  }
});
