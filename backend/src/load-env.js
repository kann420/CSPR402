// @ts-check
// Load local runtime env files with .env.local overriding .env.

const path = require('path');
const dotenv = require('dotenv');

/**
 * @param {{ envDir?: string }} [opts]
 */
function loadRuntimeEnv(opts = {}) {
  const envDir = opts.envDir || path.join(__dirname, '..');
  return dotenv.config({
    path: [path.join(envDir, '.env.local'), path.join(envDir, '.env')],
    quiet: true,
  });
}

module.exports = {
  loadRuntimeEnv,
};
