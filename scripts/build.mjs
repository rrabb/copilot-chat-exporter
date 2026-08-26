import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const require = createRequire(import.meta.url);

await rm(dist, { recursive: true, force: true });

await build({
  entryPoints: [path.join(root, 'src', 'cli.ts')],
  outfile: path.join(dist, 'cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22.18',
  packages: 'external',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});

await build({
  entryPoints: [path.join(root, 'src', 'index.ts')],
  outfile: path.join(dist, 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22.18',
  packages: 'external',
  logLevel: 'info',
});

execFileSync(process.execPath, [
  require.resolve('typescript/bin/tsc'),
  '--project', path.join(root, 'tsconfig.json'),
  '--emitDeclarationOnly',
  '--outDir', dist,
], { stdio: 'inherit' });

console.log('Built dist/cli.js, dist/index.js, and TypeScript declarations.');
