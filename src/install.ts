import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface InstalledAgentFile {
  destination: string;
  replaced: boolean;
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function destinationWithin (targetRoot: string, ...parts: string[]): string {
  const destination = path.resolve(targetRoot, ...parts);
  const relative = path.relative(targetRoot, destination);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`Refusing to write outside target root: ${destination}`);
  return destination;
}

async function installFile (source: string, destination: string): Promise<InstalledAgentFile> {
  const replaced = await fs.access(destination).then(() => true, () => false);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  return { destination, replaced };
}

export async function installAgentFiles (
  target: string,
  sourceRoot = packageRoot,
): Promise<InstalledAgentFile[]> {
  const targetRoot = path.resolve(target);
  const targetStat = await fs.stat(targetRoot).catch(() => null);
  if (!targetStat?.isDirectory())
    throw new Error(`Target root is not a directory: ${targetRoot}`);

  return await Promise.all([
    installFile(
      path.join(sourceRoot, 'skill', 'SKILL.md'),
      destinationWithin(targetRoot, '.github', 'skills', 'export-chat', 'SKILL.md'),
    ),
    installFile(
      path.join(sourceRoot, 'skill', 'export-chat.prompt.md'),
      destinationWithin(targetRoot, '.github', 'prompts', 'export-chat.prompt.md'),
    ),
  ]);
}
