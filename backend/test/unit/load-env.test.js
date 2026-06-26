require('../helpers/env');

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadRuntimeEnv } = require('../../src/load-env');

describe('loadRuntimeEnv', () => {
  it('.env.local overrides .env while preserving unrelated values', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardcasper-load-env-'));
    fs.writeFileSync(path.join(tempDir, '.env.local'), 'A=local\nB=local\n');
    fs.writeFileSync(path.join(tempDir, '.env'), 'A=base\nC=base\n');

    const original = {
      A: process.env.A,
      B: process.env.B,
      C: process.env.C,
    };
    try {
      delete process.env.A;
      delete process.env.B;
      delete process.env.C;

      loadRuntimeEnv({ envDir: tempDir });

      assert.equal(process.env.A, 'local');
      assert.equal(process.env.B, 'local');
      assert.equal(process.env.C, 'base');
    } finally {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
