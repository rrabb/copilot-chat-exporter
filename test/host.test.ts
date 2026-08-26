import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { SessionLocation } from '../src/types.ts';
import {
  getWorkspaceRoot, resolveOutputDir, resolveOutputPath, resolveWorkspaceRoot, sessionDateStamp,
  setWorkspaceRoot, slugify, workspacePath, workspaceStorageRoots,
} from '../src/host.ts';

const NOV_14_2023 = 1_700_000_000_000;

async function tempDir () {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'cce-host-'));
}

const session = (over: Record<string, unknown> = {}) => ({
  customTitle: '',
  creationDate: null,
  turns: [{ ts: NOV_14_2023, prompt: 'first prompt text' }],
  ...over,
});

const location = (over: Partial<SessionLocation> = {}): SessionLocation => ({
  sessionId: 'abcdef12-3456-4789-a012-b3456789cdef',
  sessionPath: '',
  hashRoot: '',
  mtimeMs: 0,
  ...over,
});

test('slugify strips characters a filename cannot hold', () => {
  assert.equal(slugify('My Chat: Part 1'), 'My-Chat-Part-1');
  assert.equal(slugify('a/b\\c*d?e"f<g>h|i'), 'abcdefghi');
  assert.equal(slugify('  spaced   out  '), 'spaced-out');
  assert.equal(slugify('--edges--'), 'edges');
  assert.equal(slugify(null), '');
  assert.equal(slugify('x'.repeat(120)).length, 80);
});

test('sessionDateStamp walks its fallback chain', () => {
  assert.equal(sessionDateStamp(session(), location()), '231114');
  // No turn timestamp: fall back to the session creation date.
  assert.equal(
    sessionDateStamp(session({ turns: [{}], creationDate: NOV_14_2023 }), location()),
    '231114',
  );
  // Neither: fall back to the journal file's mtime.
  assert.equal(
    sessionDateStamp(session({ turns: [{}] }), location({ mtimeMs: NOV_14_2023 })),
    '231114',
  );
  assert.equal(sessionDateStamp(session({ turns: [{}] }), location({ mtimeMs: undefined })), '000000');
});

test('resolveOutputPath: an explicit argument wins outright', () => {
  const explicit = resolveOutputPath('out/here.md', session(), location(), '/ignored');
  assert.equal(explicit, path.resolve('out/here.md'));
});

test('resolveOutputPath: generated name is date + slug + id prefix', () => {
  const outDir = path.join(path.sep, 'exports');

  // Title preferred.
  assert.equal(
    resolveOutputPath(null, session({ customTitle: 'Fix the parser' }), location(), outDir),
    path.join(outDir, '231114_Fix-the-parser_abcdef12.md'),
  );

  // No title: fall back to the opening prompt, clipped.
  assert.equal(
    resolveOutputPath(null, session(), location(), outDir),
    path.join(outDir, '231114_first-prompt-text_abcdef12.md'),
  );

  // Neither: a fixed name rather than an empty slug.
  assert.equal(
    resolveOutputPath(null, session({ turns: [{ ts: NOV_14_2023, prompt: '' }] }), location(), outDir),
    path.join(outDir, '231114_copilot-chat_abcdef12.md'),
  );
});

test('resolveOutputPath: the same session always produces the same name', () => {
  // This is why re-exporting a growing conversation refreshes one archive instead of piling up
  // numbered copies.
  const outDir = path.join(path.sep, 'exports');
  const first = resolveOutputPath(null, session({ customTitle: 'Same' }), location(), outDir);
  const second = resolveOutputPath(null, session({ customTitle: 'Same' }), location(), outDir);
  assert.equal(first, second);
});

test('workspacePath is relative inside the root and absolute outside it', () => {
  const root = path.join(path.sep, 'proj');
  setWorkspaceRoot(root);
  assert.equal(getWorkspaceRoot(), root);

  assert.equal(workspacePath(path.join(root, 'src', 'a.ts')), 'src/a.ts');
  // A bare relative name - an untitled document - belongs to the workspace, not to the current
  // directory. Resolving against cwd was a real bug; this is the guard.
  assert.equal(workspacePath('untitled-1.md'), 'untitled-1.md');
  const outside = path.join(path.sep, 'elsewhere', 'b.ts');
  assert.equal(workspacePath(outside), path.resolve(root, outside).replaceAll('\\', '/'));
});

test('resolveWorkspaceRoot: an override beats everything', async () => {
  assert.equal(await resolveWorkspaceRoot('', 'some/dir'), path.resolve('some/dir'));
});

test('resolveWorkspaceRoot reads the folder VS Code recorded for the session', async () => {
  const hashRoot = await tempDir();
  await fs.writeFile(
    path.join(hashRoot, 'workspace.json'),
    JSON.stringify({ folder: 'file:///c%3A/tmp/proj' }),
  );
  assert.equal(await resolveWorkspaceRoot(hashRoot), path.normalize('c:/tmp/proj'));
});

test('resolveWorkspaceRoot handles a multi-root window', async () => {
  const hashRoot = await tempDir();
  // A multi-root window records the .code-workspace file, so the folder is its parent.
  await fs.writeFile(
    path.join(hashRoot, 'workspace.json'),
    JSON.stringify({ workspace: 'file:///c%3A/tmp/proj/team.code-workspace' }),
  );
  assert.equal(await resolveWorkspaceRoot(hashRoot), path.normalize('c:/tmp/proj'));
});

test('resolveOutputDir follows its precedence chain', async () => {
  const root = await tempDir();

  // 1. Explicit override.
  assert.equal(await resolveOutputDir(root, 'chosen'), path.resolve('chosen'));

  // 5. Nothing configured: a dedicated folder, never the project root itself.
  assert.equal(await resolveOutputDir(root), path.join(root, '.copilot-chat-history'));

  // 4. An existing docs/chat-exports is adopted.
  await fs.mkdir(path.join(root, 'docs', 'chat-exports'), { recursive: true });
  assert.equal(await resolveOutputDir(root), path.join(root, 'docs', 'chat-exports'));

  // 3. An rc file outranks the convention.
  await fs.writeFile(path.join(root, '.chatexportrc.json'), JSON.stringify({ outDir: 'from-rc' }));
  assert.equal(await resolveOutputDir(root), path.resolve(root, 'from-rc'));

  // 2. The host package.json outranks the rc file.
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ chatExport: { outDir: 'from-pkg' } }),
  );
  assert.equal(await resolveOutputDir(root), path.resolve(root, 'from-pkg'));
});

test('workspaceStorageRoots covers every VS Code channel', () => {
  const roots = workspaceStorageRoots();
  assert.equal(roots.length, 4, 'Code, Insiders, Exploration, VSCodium');
  for (const root of roots)
    assert.ok(root.endsWith(path.join('User', 'workspaceStorage')), root);
  assert.ok(roots.some((root) => root.includes('Insiders')));
});

test('exactly one module starts a subprocess', async () => {
  // The comment in host.ts claims this; a comment cannot enforce it, so the test does.
  const srcDir = path.resolve(import.meta.dirname, '..', 'src');
  const found: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts'))
        continue;
      const source = await fs.readFile(full, 'utf8');
      if (source.includes('child_process'))
        found.push(path.relative(srcDir, full).replaceAll('\\', '/'));
    }
  };
  await walk(srcDir);
  assert.deepEqual(found, ['host.ts']);
});
