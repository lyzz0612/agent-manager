#!/usr/bin/env node
// Thin launcher for the AgentOps Runner CLI.
// Prefers compiled output in ./dist; falls back to TypeScript source via Node's
// experimental type stripping (Node >=22.6) so the bin also works in a dev
// checkout that has not been built yet.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(here, '..', 'dist', 'cli.js');
const srcEntry = resolve(here, '..', 'src', 'cli.ts');

async function run() {
  let mod;
  if (existsSync(distEntry)) {
    mod = await import(pathToFileURL(distEntry).href);
  } else if (existsSync(srcEntry)) {
    mod = await import(pathToFileURL(srcEntry).href);
  } else {
    console.error('[agentops-runner] No build output found and no source entry available.');
    process.exit(2);
  }
  const code = await mod.main(process.argv.slice(2));
  if (typeof code === 'number') process.exit(code);
}

run().catch((err) => {
  console.error('[agentops-runner] fatal:', err && err.stack ? err.stack : err);
  process.exit(1);
});
