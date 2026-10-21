import { createRequire } from 'node:module';

const metadata: { version: string } = createRequire(import.meta.url)('../package.json');
export const exporterVersion = metadata.version;

declare const __CCE_BUILD_COMMIT__: string;
export const exporterCommit = typeof __CCE_BUILD_COMMIT__ === 'undefined' ? 'source (not built)' : __CCE_BUILD_COMMIT__;
