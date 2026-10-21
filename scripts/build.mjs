import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const require = createRequire(import.meta.url);
const commit = execFileSync('git', ['describe', '--always', '--dirty'], { cwd: root, encoding: 'utf8' }).trim();
if (!commit)
  throw new Error('git describe returned an empty exporter build identity.');
const define = { __CCE_BUILD_COMMIT__: JSON.stringify(commit) };

await import('./generate-brotli.mjs');
await rm(dist, { recursive: true, force: true });

await build({
  entryPoints: [path.join(root, 'src', 'cli.ts')],
  outfile: path.join(dist, 'cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22.18',
  packages: 'external',
  define,
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
  define,
  logLevel: 'info',
});

execFileSync(process.execPath, [
  require.resolve('typescript/bin/tsc'),
  '--project', path.join(root, 'tsconfig.json'),
  '--emitDeclarationOnly',
  '--outDir', dist,
], { stdio: 'inherit' });

console.log('Built dist/cli.js, dist/index.js, and TypeScript declarations.');
