# Stock approval preparation — 2026-10-21

The owner designated `0xe02eb26737106e3e8386b8d620341dc1df25798c` as both protocol treasury and deployment wallet. A mainnet code read returned `0x`, so this address is not a deployed governance multisig or Stovia registry at the inspected block. At the start of preparation, no multisig existed according to the owner; its subsequent confirmed deployment is recorded below.

The read-only inventory script fetched the official issuer catalog and inspected every mainnet token at a pinned block. All 195 listed assets have deployed code and return 18 decimals. The exact block, hash, addresses and results are recorded in `stock-approval-inventory.json`.

**Zero approvals have been executed.** Contract presence and ERC-20 decimals do not establish issuer permission, investor eligibility, safe oracle configuration or protocol readiness.

Next required inputs/work:

1. Both owner addresses are now supplied. The 2-of-2 Safe was deployed and verified; see the confirmation below.
2. Per-asset verified oracle proxies, heartbeat and circuit-breaker settings, issuer-use evidence and eligibility integration.
3. Complete protocol/security readiness review. No audit or review completion is asserted.
4. Reviewable deployment and timelock approval transactions, followed by authorized wallet signatures and verified receipts.

`config/mainnet-proposal.json` records public deployment intent only. It contains no keys, no deployment receipts and no claim that contracts exist. The application continues showing pending status until genuine indexed registry approvals exist.

Regenerate the read-only inventory with:

```sh
node scripts/audit-stock-approvals.mjs
```

The script performs no signing or transaction submission.

## Prepared governance transaction

Owner 1: `0xe02eb26737106e3e8386b8d620341dc1df25798c`

Owner 2: `0xd2ace63a4936aa1f9a0d571d41e017aa1e430009`

Proposed threshold: **2 of 2**, to be reviewed before signing.

The unsigned proposal is in `governance-safe-proposal.json` and can be inspected at the local `/governance` page. Official Safe v1.4.1 factory, L2 singleton and fallback handler metadata were obtained from `@safe-global/safe-deployments` v1.37.64; the deployed runtime hashes on chain 4663 match those records. The creation call was simulated successfully. See [Safe deployment documentation](https://docs.safe.global/sdk/protocol-kit/guides/safe-deployment) and [official deployment records](https://github.com/safe-global/safe-deployments).

The transaction transfers zero native ETH as value; network gas is separate and is estimated again by the wallet. It creates no Stovia registry and approves no stock. The deployment wallet’s owner subsequently completed the signing step; see the confirmed receipt below. A predicted address is not a deployment receipt.

## Governance deployment confirmed

Transaction `0xfc90901e2f378b9e59b356110dc76e82949681aca3f5076d69fc0cd0ffbf9fef` succeeded at Robinhood mainnet block 94572706. The proxy-creation event, exact reviewed transaction calldata, sender, singleton, both owners, threshold 2 and Safe version 1.4.1 were verified. Governance address: `0xC22406198bF5296A02A4e2df10357401D3B921D5`. The earlier unsigned proposal is retained as the historical transaction specification. Current confirmation is in `config/governance-confirmation.json`. No registry or stock-approval deployment is included in this transaction.
