// Single source of truth for the runner version reported in protocol payloads.
// Kept in TypeScript (instead of reading package.json at runtime) to avoid
// hitting the npm package path issue during `node --experimental-strip-types`.
export const RUNNER_VERSION = '0.1.0-dev';
