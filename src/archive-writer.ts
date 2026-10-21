import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PlannedArchive } from './export-policy.ts';
import { failedArchivePath, failureWarning, verificationException, writeFailureLog } from './verify/export-failure.ts';
import type { ExportFailure } from './verify/export-failure.ts';

export interface ArchiveWriteOptions {
  outputPath: string;
  generatedAt: string;
  overwrite?: boolean;
  /** Pure planner; collision retries may call it with a different sibling folder name. */
  plan: (assetsDirectory: string) => PlannedArchive;
  verification?: {
    check: (stagePath: string) => Promise<ExportFailure | null>;
    keep: () => Promise<void>;
    capture: string;
    sessionId: string;
    sourceHash: string;
  };
}

export interface WrittenArchive {
  outputPath: string;
  assetsPath: string | null;
  companionPaths: string[];
  markdownBytes: number;
  archive: PlannedArchive;
  verificationFailure: ExportFailure | null;
  failureLog: string | null;
  olderFailedArchive: string | null;
}

function code (error: unknown) {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

function assetBase (outputPath: string, generatedAt: string) {
  const date = new Date(generatedAt);
  if (!Number.isFinite(date.getTime()))
    throw new Error('Archive generatedAt must be a valid timestamp.');
  const stamp = date.toISOString().replace(/[-:]/g, '').slice(2, 15).replace('T', '_');
  const name = path.basename(outputPath, path.extname(outputPath));
  return `${name}_assets_${stamp}`;
}

function validatePlan (archive: PlannedArchive, folder: string) {
  const paths = new Set<string>();
  const ids = new Set<string>();
  for (const artifact of archive.companions) {
    const segments = artifact.relativePath.split('/');
    if (segments.length !== 2 || segments[0] !== folder
      || !segments[1] || segments[1] === '.' || segments[1] === '..'
      || /[\\<>:"|?*\u0000-\u001f]/u.test(artifact.relativePath)
      || /[. ]$/u.test(segments[1]) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segments[1]))
      throw new Error('Companion path must be a portable file directly inside the assigned assets folder.');
    const normalized = artifact.relativePath.toLowerCase();
    if (paths.has(normalized) || ids.has(artifact.id))
      throw new Error('Duplicate companion path or identity.');
    paths.add(normalized);
    ids.add(artifact.id);
  }
}

async function writeExclusive (file: string, bytes: Uint8Array, created: () => void) {
  const handle = await fs.open(file, 'wx', 0o600);
  created();
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Saves companions before publishing Markdown; failure never deletes a previous archive. */
export async function writeArchive (options: ArchiveWriteOptions): Promise<WrittenArchive> {
  let outputPath = path.resolve(options.outputPath);
  const directory = path.dirname(outputPath);
  const base = assetBase(outputPath, options.generatedAt);
  if (!options.overwrite) {
    try {
      await fs.lstat(outputPath);
      throw new Error(`Archive already exists: ${outputPath}. Use --overwrite to replace it.`);
    } catch (error) {
      if (code(error) !== 'ENOENT')
        throw error;
    }
  }
  await fs.mkdir(directory, { recursive: true });
  let assetsPath: string | null = null;
  let stage: string | null = null;
  let published = false;
  const ownedFiles: string[] = [];
  try {
    let archive: PlannedArchive;
    let folder = base;
    for (let suffix = 0; ; suffix += 1) {
      folder = suffix === 0 ? base : `${base}_${suffix}`;
      archive = options.plan(folder);
      validatePlan(archive, folder);
      if (!archive.companions.length)
        break;
      const candidate = path.join(directory, folder);
      try {
        await fs.mkdir(candidate, { mode: 0o700 });
        assetsPath = candidate;
        break;
      } catch (error) {
        if (code(error) !== 'EEXIST')
          throw error;
      }
    }
    for (const artifact of archive.companions) {
      const file = path.join(directory, ...artifact.relativePath.split('/'));
      await writeExclusive(file, artifact.bytes, () => { ownedFiles.push(file); });
      const saved = await fs.readFile(file);
      if (!saved.equals(Buffer.from(artifact.bytes)))
        throw new Error('Companion verification failed after write.');
    }
    const markdown = Buffer.from(archive.markdown, 'utf8');
    const stageCandidate = path.join(directory, `.chat-export-${randomUUID()}.tmp`);
    await writeExclusive(stageCandidate, markdown, () => { stage = stageCandidate; });
    if (stage === null)
      throw new Error('Markdown staging file was not created.');
    if (!(await fs.readFile(stage)).equals(markdown))
      throw new Error('Markdown verification failed before publication.');
    let failure: ExportFailure | null = null;
    let failureLog: string | null = null;
    if (options.verification) {
      try {
        failure = await options.verification.check(stage);
      } catch (error) {
        failure = verificationException(error);
      }
      if (failure) {
        await options.verification.keep();
        const warning = failureWarning(failure, options.verification.capture);
        await fs.writeFile(stage, `${warning}${archive.markdown}`, { mode: 0o600 });
        failureLog = await writeFailureLog(outputPath, options.verification.sessionId, failure,
          options.verification.capture, options.generatedAt, options.verification.sourceHash);
      }
    }
    let olderFailedArchive: string | null = null;
    if (!failure) {
      const failedName = path.basename(failedArchivePath(outputPath));
      const stem = failedName.slice(0, -3);
      const older = (await fs.readdir(directory)).find((name) => name === failedName
        || (name.startsWith(`${stem}-`) && /^\d+\.md$/u.test(name.slice(stem.length + 1))));
      olderFailedArchive = older ? path.join(directory, older) : null;
    }
    if (failure) {
      for (let suffix = 0; ; suffix++) {
        const candidate = failedArchivePath(options.outputPath, suffix);
        try {
          await fs.link(stage, candidate);
          outputPath = path.resolve(candidate);
          break;
        } catch (error) {
          if (code(error) !== 'EEXIST')
            throw error;
        }
      }
    } else if (options.overwrite) {
      // Do not unlink the old file: failed replacement must leave it intact.
      await fs.rename(stage, outputPath);
      stage = null;
    } else {
      // Exclusive publication closes the preflight-to-write race without replacing another file.
      await fs.link(stage, outputPath);
    }
    published = true;
    if (stage !== null) {
      await fs.unlink(stage);
      stage = null;
    }
    return {
      outputPath, assetsPath, companionPaths: [...ownedFiles],
      markdownBytes: (await fs.stat(outputPath)).size, archive, verificationFailure: failure, failureLog, olderFailedArchive,
    };
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    if (stage !== null) {
      try {
        await fs.unlink(stage);
      } catch (cleanupError) {
        code(cleanupError) !== 'ENOENT' && cleanupErrors.push(cleanupError);
      }
    }
    if (!published) {
      for (const file of ownedFiles) {
        try {
          await fs.unlink(file);
        } catch (cleanupError) {
          code(cleanupError) !== 'ENOENT' && cleanupErrors.push(cleanupError);
        }
      }
      if (assetsPath !== null) {
        try {
          await fs.rmdir(assetsPath);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
    }
    if (cleanupErrors.length)
      throw new AggregateError([error, ...cleanupErrors], 'Archive write failed; cleanup also failed.');
    throw error;
  }
}
