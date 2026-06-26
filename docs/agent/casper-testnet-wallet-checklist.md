# Casper Testnet Wallet Checklist

Last checked: 2026-06-24.

This checklist is for the current Day 2 flow:

- backend receives a Casper testnet CSPR payment
- backend verifies the deploy
- Node agent signs with a local PEM key file

Because the agent script uses `CASPER_AGENT_PRIVATE_KEY_PATH`, the safest and
most deterministic setup for this repo is a local keypair on disk, not a browser
wallet export.

## Official references

- Casper docs: https://docs.casper.network/1.5.X/concepts/accounts-and-keys
- Casper SDK client usage: https://docs.casper.network/developers/dapps/sdk/client-library-usage
- Casper testnet faucet: https://docs.casper.network/users/testnet-faucet

## What you need

- 1 treasury wallet for the backend to receive payments
- 1 agent wallet for the demo script to send payments
- testnet funds in the agent wallet
- the treasury public key in `backend/.env.local`
- the agent API key and PEM path in `examples/node-agent/.env.local`

## Recommended setup

Use Ed25519 keys for both wallets.

Why:

- our placeholder config already expects `ED25519`
- the public key format is standard for Casper testnet
- the agent script already loads PEM keys from disk

## Option A: Generate keys with `casper-client` if you have it

Casper docs recommend the CLI route for developers because it gives you the
`secret_key.pem` file directly.

Create treasury keys:

```powershell
mkdir D:\CasperCard402\keys\treasury
casper-client keygen D:\CasperCard402\keys\treasury
```

Create agent keys:

```powershell
mkdir D:\CasperCard402\keys\agent
casper-client keygen D:\CasperCard402\keys\agent
```

Expected files in each folder:

- `public_key.pem`
- `public_key_hex`
- `secret_key.pem`

## Option B: Generate keys with OpenSSL if you do not have `casper-client`

The Casper docs document OpenSSL generation for Ed25519 secret/public PEMs.

Treasury:

```powershell
mkdir D:\CasperCard402\keys\treasury
openssl genpkey -algorithm ed25519 -out D:\CasperCard402\keys\treasury\secret_key.pem
openssl pkey -in D:\CasperCard402\keys\treasury\secret_key.pem -pubout -out D:\CasperCard402\keys\treasury\public_key.pem
```

Agent:

```powershell
mkdir D:\CasperCard402\keys\agent
openssl genpkey -algorithm ed25519 -out D:\CasperCard402\keys\agent\secret_key.pem
openssl pkey -in D:\CasperCard402\keys\agent\secret_key.pem -pubout -out D:\CasperCard402\keys\agent\public_key.pem
```

Important:

- OpenSSL gives you PEM files
- for this repo you still need the public key in Casper hex format for env vars
- the easiest way to get that hex is with a small Node snippet below

## Convert PEM public key to Casper public key hex

Run this from `D:\CasperCard402`:

```powershell
node -e "const { PublicKey } = require('casper-js-sdk'); const fs = require('fs'); const pem = fs.readFileSync('D:/CasperCard402/keys/treasury/public_key.pem', 'utf8'); console.log(PublicKey.fromPem(pem).toHex())"
```

Agent public key hex:

```powershell
node -e "const { PublicKey } = require('casper-js-sdk'); const fs = require('fs'); const pem = fs.readFileSync('D:/CasperCard402/keys/agent/public_key.pem', 'utf8'); console.log(PublicKey.fromPem(pem).toHex())"
```

Save the output values. They should look like:

- Ed25519: starts with `01`
- Secp256k1: starts with `02`

## Fund the agent wallet on testnet

Official doc:

- https://docs.casper.network/users/testnet-faucet

Recommended path:

1. Open [testnet.cspr.live/tools/faucet](https://testnet.cspr.live/tools/faucet)
2. Connect or paste the agent wallet public key
3. Request testnet tokens
4. Wait for funds to land

Notes:

- fund the agent wallet, not the treasury wallet
- the treasury only receives payments in this demo

## Fill the local env files

Update `backend/.env.local`:

- `CASPER_TREASURY_PUBLIC_KEY=...`
- `VCC_CALLBACK_SECRET=...`
- `CARDS402_SECRET_BOX_KEY=...`

Update `examples/node-agent/.env.local`:

- `CARDS402_API_KEY=...`
- `CASPER_AGENT_PRIVATE_KEY_PATH=D:/CasperCard402/keys/agent/secret_key.pem`

## Generate the local secrets

PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use one output for:

- `CARDS402_SECRET_BOX_KEY`

Generate another value and use it for:

- `VCC_CALLBACK_SECRET`

For `VCC_CALLBACK_SECRET`, any strong 32+ character local secret is fine.

## Quick sanity checks

Check treasury public key shape:

```powershell
Get-Content D:\CasperCard402\backend\.env.local
```

Check agent PEM path exists:

```powershell
Test-Path D:\CasperCard402\keys\agent\secret_key.pem
```

Check the agent script parses:

```powershell
node --check D:\CasperCard402\examples\node-agent\index.mjs
```

## Do not do this

- do not put `secret_key.pem` contents directly into `.env.local`
- do not commit the `keys/` folder
- do not reuse a mainnet wallet
- do not share the secret key or seed phrase in chat, code, or screenshots

## Final values you will still need to supply manually

- real `CASPER_TREASURY_PUBLIC_KEY`
- real `CASPER_AGENT_PRIVATE_KEY_PATH`
- real `CARDS402_API_KEY`
- generated local secrets for `VCC_CALLBACK_SECRET`
- generated local secrets for `CARDS402_SECRET_BOX_KEY`
