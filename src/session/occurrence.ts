import { createHash } from 'node:crypto';
import type { SourceProvenance } from './sources.ts';

export function occurrenceId (provenance: SourceProvenance, key: string) {
  return createHash('sha256')
    .update(JSON.stringify([provenance.userDataRoot, provenance.workspaceStoragePath, key]))
    .digest('hex');
}
