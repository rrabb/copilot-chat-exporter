function isRecord (value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function assertLocalJournalSnapshot (record: unknown, sessionId: string) {
  if (!isRecord(record) || record.kind !== 0 || !isRecord(record.v)
    || record.v.version !== 3 || !Array.isArray(record.v.requests))
    throw new Error('Not a verified version 3 Local chat journal snapshot with a requests array.');
  if (record.v.sessionId !== undefined
    && (typeof record.v.sessionId !== 'string' || record.v.sessionId.toLowerCase() !== sessionId.toLowerCase()))
    throw new Error('Journal session identity does not match its filename.');
}

/** Reject unknown/malformed replay instructions before deriving export or empty-session claims. */
export function validateLocalJournalRecords (raw: string, sessionId: string) {
  let snapshots = 0;
  let lineNumber = 0;
  for (const line of raw.split(/\r?\n/)) {
    lineNumber += 1;
    if (!line.trim())
      continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error(`Journal line ${lineNumber} is not valid JSON.`);
    }
    if (!isRecord(record))
      throw new Error(`Journal line ${lineNumber} is not an object.`);
    if (record.kind === 0) {
      assertLocalJournalSnapshot(record, sessionId);
      snapshots += 1;
      continue;
    }
    if (!snapshots)
      throw new Error(`Journal line ${lineNumber} precedes the required snapshot.`);
    if (record.kind !== 1 && record.kind !== 2 && record.kind !== 3)
      throw new Error(`Journal line ${lineNumber} uses an unsupported operation kind.`);
    if (!Array.isArray(record.k) || record.k.length === 0 || record.k.some((part: unknown) =>
      (typeof part !== 'string' && (typeof part !== 'number' || !Number.isSafeInteger(part) || part < 0))
      || part === '__proto__' || part === 'constructor' || part === 'prototype'))
      throw new Error(`Journal line ${lineNumber} has an invalid mutation path.`);
    if (record.kind === 2 && record.i !== undefined
      && (typeof record.i !== 'number' || !Number.isSafeInteger(record.i) || record.i < 0))
      throw new Error(`Journal line ${lineNumber} has an invalid array resume length.`);
    if (record.k.length === 1 && (record.k[0] === 'version' || record.k[0] === 'sessionId'))
      throw new Error(`Journal line ${lineNumber} mutates format/session identity; backing needs re-verification.`);
    if (record.k.length === 1 && record.k[0] === 'requests'
      && (record.kind === 3 || (record.kind === 1 && !Array.isArray(record.v))))
      throw new Error(`Journal line ${lineNumber} removes the required requests array.`);
  }
  if (!snapshots)
    throw new Error('Journal contains no version 3 Local snapshot.');
}
