import { spawn } from 'node:child_process';
import { createReadStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defaultSourceCacheRoot, legacySourceCacheRoots } from '../src/session/cache-paths.ts';

export async function cacheInventory (root) {
  const result = {};
  async function walk (directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT')
        return;
      throw error;
    }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory())
        await walk(file);
      else if (entry.isFile()) {
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(file))
          hash.update(chunk);
        result[file] = hash.digest('hex');
      } else
        result[file] = 'non-file';
    }
    result[directory] = 'directory';
  }
  await walk(root);
  return result;
}

export function assertNoCacheWrites (before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  if ([...keys].some((key) => before[key] !== after[key]))
    throw new Error('Test run changed the real exporter cache or receipt store.');
}

async function realCaches () {
  const roots = [defaultSourceCacheRoot(), ...legacySourceCacheRoots()];
  for (const entry of await fs.readdir(os.tmpdir(), { withFileTypes: true }))
    if (entry.isDirectory() && /^cce-(?:local-source-|sources-|export-snapshots$)/u.test(entry.name))
      roots.push(path.join(os.tmpdir(), entry.name));
  return Object.assign({}, ...await Promise.all(roots.map(cacheInventory)));
}

async function main () {
  const before = await realCaches();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-test-run-'));
  try {
    const args = process.argv.slice(2);
    const command = args[0] === '--command';
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, command ? args.slice(1) : ['--import', './test/cache-isolation.ts', '--test',
        ...(args.length ? args : ['test/*.test.ts'])], {
        stdio: 'inherit', env: { ...process.env, CCE_CACHE_DIR: root },
      });
      child.once('error', reject);
      child.once('exit', (status) => resolve(status ?? 1));
    });
    process.exitCode = code;
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    assertNoCacheWrites(before, await realCaches());
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
