#!/usr/bin/env node
// cspr402 CLI dispatcher.

async function main(): Promise<number> {
  const [, , cmd = 'mcp', ...rest] = process.argv;

  if (
    cmd !== 'version' &&
    cmd !== '--version' &&
    cmd !== '-v' &&
    cmd !== '-h' &&
    cmd !== '--help' &&
    cmd !== 'help'
  ) {
    try {
      const { checkForUpdates } = await import('./version-check');
      checkForUpdates();
    } catch {
      /* non-fatal */
    }
  }

  if (cmd === '-h' || cmd === '--help' || cmd === 'help') {
    process.stdout.write(`cspr402 - Casper testnet payment verification for AI agents

Usage:
  cspr402 onboard --claim <code>    Set up an agent from a dashboard claim code
  cspr402 purchase --amount <USD>   Create a native CSPR order
  cspr402 wallet address            Print this agent's Casper public key
  cspr402 wallet balance            Print this agent's testnet CSPR balance
  cspr402 mcp                       Start the MCP server over stdio (default)
  cspr402 version                   Print the SDK version
  cspr402 --help                    Show this message

Commands read ~/.cspr402/config.json (written by 'cspr402 onboard') so you
don't need to pass an api key.

Docs: https://cspr402.xyz/docs
Onboarding guide for agents: https://cspr402.xyz/skill.md
`);
    return 0;
  }

  if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../package.json') as { version: string };
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }

  if (cmd === 'onboard') {
    const { onboardCommand } = await import('./commands/onboard');
    return onboardCommand(rest);
  }

  if (cmd === 'purchase' || cmd === 'buy') {
    const { purchaseCommand } = await import('./commands/purchase');
    return purchaseCommand(rest);
  }

  if (cmd === 'wallet') {
    const { walletCommand } = await import('./commands/wallet');
    return walletCommand(rest);
  }

  if (cmd === 'mcp') {
    const { startMcpServer } = await import('./mcp');
    await startMcpServer();
    return 0;
  }

  process.stderr.write(`error: unknown command '${cmd}'\n`);
  process.stderr.write(`Run 'cspr402 --help' to see available commands.\n`);
  return 2;
}

main().then(
  (code) => {
    if (code !== 0) process.exit(code);
  },
  (err) => {
    process.stderr.write(
      `fatal: ${err instanceof Error ? err.stack || err.message : String(err)}\n`,
    );
    process.exit(1);
  },
);
