import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const openapiPackageJson = require.resolve('openapi-typescript/package.json');
const cliPath = path.join(path.dirname(openapiPackageJson), 'bin', 'cli.js');
const tmpDir = mkdtempSync(path.join(tmpdir(), 'cards402-openapi-'));
const specs = [
  ['contract/api/agent-api.openapi.yaml', 'agent-api.d.ts'],
  ['contract/api/vcc-internal.openapi.yaml', 'vcc-internal.d.ts'],
];

try {
  for (const [inputPath, outputName] of specs) {
    const outputPath = path.join(tmpDir, outputName);
    const result = spawnSync(process.execPath, [cliPath, inputPath, '-o', outputPath], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
} finally {
  rmSync(tmpDir, { force: true, recursive: true });
}
