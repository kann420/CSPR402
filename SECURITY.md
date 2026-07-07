# Security Policy

CSPR402 is a hackathon MVP for Casper mainnet CSPR payment verification and
simulated virtual card fulfillment. The simulated virtual card returned by the
API is not a real Visa card, not a production card, and not a spendable payment
instrument.

## Supported Versions

Security fixes are currently handled on the default branch of this repository.
For submission review, test against the latest commit on that branch unless a
maintainer has named a different branch or tag.

## Reporting A Vulnerability

Use GitHub private vulnerability reporting if it is enabled for this repository.
If private reporting is not available, open a minimal public issue that asks a
maintainer to enable a private channel, but do not include vulnerability details
or exploit steps in the public issue.

Do not include any of the following in a public report:

- API keys, bearer tokens, webhook secrets, mnemonics, private keys, or wallet
  key files.
- `.env` contents, local databases, faucet credentials, or provider RPC
  credentials.
- Full API responses that include sensitive values.
- Simulated virtual card PAN, CVV, or expiry values returned by a real backend.

Useful non-sensitive details include affected route names, package versions,
commit SHA, sanitized logs, Casper deploy hash when it is already public on
chain, and a short impact summary.

## Security Scope

Reports are in scope when they affect:

- API authentication, authorization, rate limiting, or key handling.
- Casper deploy verification for Casper mainnet CSPR transfers.
- mockUSDC CEP-18 verification when it is clearly configured as a mock/test
  token rail.
- Order state transitions, idempotency, duplicate fulfillment, or payment
  replay prevention.
- Storage or redaction of simulated virtual card data.
- Web dashboard access control, session handling, or operator-only actions.

Reports are out of scope when they are only:

- Claims that simulated virtual cards are not spendable. That is expected MVP
  behavior.
- Missing production issuer integration. This repository does not currently
  claim production Visa issuance.
- Vulnerabilities in third-party services without a CSPR402-specific impact.

## Maintainer Handling

Maintainers should acknowledge valid private reports, reproduce the issue with
sanitized data, patch on a private branch when needed, and publish only the
details that are safe to disclose after the fix is available.
