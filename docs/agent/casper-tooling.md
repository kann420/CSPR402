# Casper Tooling Notes

Last checked: 2026-06-23.

## What was set up

- Cloned `https://github.com/CTX-com/Cards402.git` into `D:\CasperCard402`.
- Confirmed this repo is now a git checkout. It was clean after clone before
  the CSPR402 foundation files were added.
- Added this CSPR402 agent foundation in `AGENTS.md`.
- Added Casper env template in `backend/.env.casper.example`.
- Installed local npm dependencies for the root workspaces and backend. The
  `node_modules` directories are ignored by git.

## Skill/plugin discovery

Commands run:

```bash
npx skills find casper
npx skills find "casper blockchain"
npx skills find "casper devnet"
npx skills find "blockchain smart contract"
```

Result:

- No Casper blockchain-specific Codex skill was found.
- Results for `casper` were mostly unrelated skills from `casper-studios`.
- Generic blockchain skills exist, but they were not installed because they are
  not Casper-specific and would add noise.

Decision:

- Use official Casper docs, repo docs, and `casper-devnet` instead of installing
  unrelated third-party skills.

## Casper DevNet MCP

Desired tool:

- Repo: https://github.com/veles-labs/casper-devnet
- Install command: `cargo install casper-devnet --locked`
- MCP command after install:

```bash
codex mcp add casper-devnet -- casper-devnet mcp --transport stdio
```

What happened locally:

1. `cargo install casper-devnet --locked` initially failed because `link.exe`
   was not in PATH.
2. Visual Studio 2022 Community exists at:

```text
C:\Program Files\Microsoft Visual Studio\2022\Community
```

3. Retrying through `VsDevCmd.bat` found `link.exe`, but failed with:

```text
LINK : fatal error LNK1181: cannot open input file 'kernel32.lib'
```

Interpretation:

- The MSVC linker exists.
- The Windows SDK libraries needed by Rust/MSVC are missing or not discoverable.

Fix:

1. Install or repair Visual Studio components:
   - Desktop development with C++
   - MSVC v143 build tools
   - Windows 10 SDK or Windows 11 SDK
2. Open a fresh Developer PowerShell or run:

```powershell
& $env:ComSpec /c '"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat" -arch=x64 && cargo install casper-devnet --locked'
```

3. Verify:

```bash
casper-devnet --version
casper-devnet assets pull
casper-devnet start
```

## Codex MCP config status

Command run:

```bash
codex mcp list
```

Result:

```text
C:\Users\admin\.codex\config.toml:7:16: unknown variant `default`, expected `fast` or `flex`
```

Do not edit global Codex config casually. If MCP setup is needed, fix that
global `service_tier` value intentionally, then run the `codex mcp add`
command above.

## Recommended docs

- Casper docs: https://docs.casper.network/
- Casper GitHub: https://github.com/casper-network
- Casper AI page: https://www.casper.network/ai
- Casper DevNet: https://github.com/veles-labs/casper-devnet
- CSPR.cloud docs: https://docs.cspr.cloud/

## Current priority

Build the MVP on Casper testnet with native CSPR first. Treat mockUSDC CEP-18
and custom contracts as follow-up work after the backend can verify a native
CSPR payment and fulfill exactly one mock card per order.

## Verification status

Environment:

```text
node v24.12.0
npm 11.6.2
```

Commands that passed:

```bash
cd backend && npm test
cd backend && npm run typecheck -- --pretty false
cd backend && npm run lint
npm run typecheck -- --pretty false
npm run lint
```

Backend test result:

```text
1119 tests passed
0 failed
```

Current default root test status after Day-1 Casper SDK cleanup:

```bash
npm test
```

Result:

- `web` tests passed: 57 tests.
- `sdk` default tests passed: 84 tests.
- The SDK root export is now API/client-first, so importing `cards402` no
  longer loads the legacy Stellar OWS native package on Windows.
- Legacy Stellar/OWS files remain in the repo for reference and future cleanup.

NPM audit notes:

- Root install reported 17 vulnerabilities.
- Backend install reported 9 vulnerabilities.
- `npm audit fix` was not run because it can change dependency versions and is
  outside the Casper foundation task.
