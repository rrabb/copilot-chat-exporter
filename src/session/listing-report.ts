import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

function errorCode (error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function twoDigits (value: number): string {
  return String(value).padStart(2, '0');
}

export function defaultListingHtmlPath (directory: string, generatedAt = new Date(), detailed = false): string {
  if (!Number.isFinite(generatedAt.getTime()))
    throw new Error('Listing report generatedAt must be a valid timestamp.');
  const stamp = `${twoDigits(generatedAt.getFullYear() % 100)}${twoDigits(generatedAt.getMonth() + 1)}${twoDigits(generatedAt.getDate())}_${twoDigits(generatedAt.getHours())}${twoDigits(generatedAt.getMinutes())}${twoDigits(generatedAt.getSeconds())}`;
  return path.resolve(directory, `copilot-chat-sessions-${detailed ? 'detailed-' : ''}listing-${stamp}.html`);
}

async function saveNewFile (filePath: string, content: string): Promise<void> {
  const handle = await fs.open(filePath, 'wx', 0o600);
  const errors: unknown[] = [];
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } catch (error) {
    errors.push(error);
  }
  try {
    await handle.close();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT')
        errors.push(error);
    }
    if (errors.length > 1)
      throw new AggregateError(errors, 'Listing HTML could not be written and cleanup was incomplete.');
    throw errors[0];
  }
}

/** Publishes a private local report without replacing existing content unless requested. */
export async function writeListingHtml (
  outputPath: string,
  content: string,
  overwrite = false,
): Promise<string> {
  const destination = path.resolve(outputPath);
  const directory = path.dirname(destination);
  await fs.mkdir(directory, { recursive: true });

  if (!overwrite) {
    try {
      await saveNewFile(destination, content);
      return destination;
    } catch (error) {
      if (errorCode(error) === 'EEXIST')
        throw new Error(`Listing HTML already exists: ${destination}. Choose another --html-output path or pass --overwrite.`);
      throw error;
    }
  }

  const stage = path.join(directory, `.copilot-listing-${randomUUID()}.tmp`);
  let staged = false;
  try {
    await saveNewFile(stage, content);
    staged = true;
    await fs.rename(stage, destination);
    staged = false;
    return destination;
  } catch (error) {
    if (staged) {
      try {
        await fs.unlink(stage);
      } catch (cleanupError) {
        if (errorCode(cleanupError) !== 'ENOENT')
          throw new AggregateError([error, cleanupError], 'Listing HTML publication failed and its staging file could not be removed.');
      }
    }
    throw error;
  }
}
