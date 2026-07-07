---
name: Bug report
about: Report a reproducible CSPR402 defect
title: 'bug: '
labels: bug
assignees: ''
---

## Summary

<!-- What broke? Keep it short and concrete. -->

## Area

<!-- backend, sdk, web, docs, examples, or infra. -->

## Reproduction Steps

1.
2.
3.

## Expected Behavior

<!-- What should have happened? -->

## Actual Behavior

<!-- What happened instead? Include sanitized logs if useful. -->

## Payment Context

<!-- If relevant, identify the rail without leaking secrets. -->

- Asset: Casper mainnet CSPR / mockUSDC CEP-18 / not payment-related
- Order status:
- Public deploy hash, if already on chain:
- Transfer id, if safe to share:

## Environment

<!-- OS, browser, Node version, package version, or commit SHA. -->

## Verification Attempted

<!-- Commands, tests, or smoke checks you already ran. -->

## Safety Checklist

- [ ] I did not include API keys, private keys, mnemonics, bearer tokens, webhook secrets, or wallet files.
- [ ] I did not include `.env` contents, local databases, faucet credentials, or provider RPC credentials.
- [ ] I did not include simulated virtual card PAN, CVV, expiry, or full sensitive API responses.
- [ ] I used precise MVP language: simulated virtual card, Casper mainnet CSPR, and mockUSDC CEP-18 only when it is clearly mock/test.
