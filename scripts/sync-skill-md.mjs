// Sync the root `skill.md` (single source of truth) into
// `web/public/skill.md` (the file served at cspr402.xyz/skill.md).
//
// Run manually:  node scripts/sync-skill-md.mjs
// Run on web prebuild (wired in web/package.json) so the served file
// can never drift from the root doc.
//
// Exits non-zero if the root file is missing or the copy fails, so a
// broken sync aborts the build instead of shipping a stale file.
import { copyFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', 'skill.md');
const target = resolve(__dirname, '..', 'web', 'public', 'skill.md');

let rootStat;
try {
  rootStat = statSync(root);
} catch {
  console.error(`[sync-skill-md] root skill.md not found at ${root}`);
  process.exit(1);
}
if (!rootStat.isFile()) {
  console.error(`[sync-skill-md] root skill.md is not a regular file: ${root}`);
  process.exit(1);
}

try {
  copyFileSync(root, target);
} catch (err) {
  console.error(`[sync-skill-md] failed to copy ${root} -> ${target}: ${err.message}`);
  process.exit(1);
}

console.log(`[sync-skill-md] synced skill.md -> web/public/skill.md (${rootStat.size} bytes)`);
