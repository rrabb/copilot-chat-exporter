export function cacheInventory(root: string): Promise<Record<string, string>>;
export function assertNoCacheWrites(before: Record<string, string>, after: Record<string, string>): void;
