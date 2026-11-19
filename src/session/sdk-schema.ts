export interface SdkSchemaDrift {
  unhandledEvents: Array<[string, number]>;
  unsupportedPayloads: Array<[string, number]>;
}

const UNSUPPORTED_SUFFIX = ':unsupported';

export function splitSdkSchemaDrift (entries: ReadonlyArray<readonly [string, number]>): SdkSchemaDrift {
  const result: SdkSchemaDrift = { unhandledEvents: [], unsupportedPayloads: [] };
  for (const [kind, count] of entries) {
    if (kind.endsWith(UNSUPPORTED_SUFFIX))
      result.unsupportedPayloads.push([kind.slice(0, -UNSUPPORTED_SUFFIX.length), count]);
    else
      result.unhandledEvents.push([kind, count]);
  }
  return result;
}
