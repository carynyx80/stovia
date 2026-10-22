# Stock approval preparation — 2026-10-21

The owner designated `0xe02eb26737106e3e8386b8d620341dc1df25798c` as both protocol treasury and deployment wallet. A mainnet code read returned `0x`, so this address is not a deployed governance multisig or Stovia registry at the inspected block. No multisig currently exists, according to the owner.

The read-only inventory script fetched the official issuer catalog and inspected every mainnet token at a pinned block. All 195 listed assets have deployed code and return 18 decimals. The exact block, hash, addresses and results are recorded in `stock-approval-inventory.json`.

**Zero approvals have been executed.** Contract presence and ERC-20 decimals do not establish issuer permission, investor eligibility, safe oracle configuration or protocol readiness.

Next required inputs/work:

1. Governance multisig owners and signing threshold; a second independently controlled owner is needed for a 2-of-2 arrangement.
2. Per-asset verified oracle proxies, heartbeat and circuit-breaker settings, issuer-use evidence and eligibility integration.
3. Complete protocol/security readiness review. No audit or review completion is asserted.
4. Reviewable deployment and timelock approval transactions, followed by authorized wallet signatures and verified receipts.

`config/mainnet-proposal.json` records public deployment intent only. It contains no keys, no deployment receipts and no claim that contracts exist. The application continues showing pending status until genuine indexed registry approvals exist.

Regenerate the read-only inventory with:

```sh
node scripts/audit-stock-approvals.mjs
```

The script performs no signing or transaction submission.
