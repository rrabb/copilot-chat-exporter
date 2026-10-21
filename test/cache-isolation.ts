import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after } from 'node:test';

if (!process.env.CCE_CACHE_DIR)
  throw new Error('Tests require an isolated CCE_CACHE_DIR. Use npm test or scripts/test.mjs.');
const directory = await fs.mkdtemp(path.join(process.env.CCE_CACHE_DIR, 'worker-'));
process.env.CCE_CACHE_DIR = directory;
after(() => fs.rm(directory, { recursive: true, force: true }));
