// Network label helpers. The backend /info `network` field reports the
// Casper chain name — 'casper' for mainnet, 'casper-test' for testnet —
// so the dashboard can label the live network without a separate env var.

export type NetworkInfo = { network?: string } | null | undefined;

// Full label for status indicators, e.g. "Casper mainnet" / "Casper testnet".
export function networkLabel(info?: NetworkInfo): string {
  if (info?.network === 'casper') return 'Casper mainnet';
  if (info?.network === 'casper-test') return 'Casper testnet';
  return 'Casper';
}

// Short word for inline copy: "mainnet" | "testnet" | "" (unknown).
export function networkWord(info?: NetworkInfo): string {
  if (info?.network === 'casper') return 'mainnet';
  if (info?.network === 'casper-test') return 'testnet';
  return '';
}

// CSPR balance for an agent, parsed from `agent_state_detail` which the
// backend funding poller (jobs.js) sets to `cspr=<motes/1e9>` when it
// flips the agent to `funded`. The old `walletBalances` map was never
// fetched (dead-coded to '0'), so this is the source of truth shown in
// the UI. Returns '0' before the first deposit is detected.
export function agentCsprBalance(detail?: string | null): string {
  if (!detail || !detail.startsWith('cspr=')) return '0';
  return detail.slice('cspr='.length);
}
