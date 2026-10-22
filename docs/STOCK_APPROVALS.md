# Stock approval state

The confirmed Safe transaction creates governance only. No Stovia registry has been deployed, and no stocks are approved. An issuer listing is not a Stovia approval.

The web application reads registry approval and oracle health directly at one pinned chain block. Database rows cannot enable a launch. Missing configuration, RPC failures, suspension and stale prices fail closed. An approved asset also requires account eligibility and a configured, reviewed factory before a launch can succeed.

## Prepared infrastructure

`RegistryBootstrap.sol` atomically creates an OpenZeppelin TimelockController, StockRegistry and ReviewedEligibility. The verified 2-of-2 Safe is the timelock proposer and registry guardian. The timelock controls registry reviews and eligibility policies. Approval operations require both Safe signatures and a two-day delay; the deployer receives no admin role. Deployment approves zero assets.

`docs/registry-deployment-proposal.json` contains a zero-value unsigned contract creation transaction, simulated on Robinhood Chain. Run `node scripts/compile-contracts.mjs` and `node scripts/prepare-registry.mjs` to reproduce it. Gas estimates are snapshots. The custom contracts have not received an independent security audit; the proposal is for review, not a readiness certification. No transaction has been broadcast by these scripts.

## Asset integration requirements

`stock-oracle-candidates.json` records conservative matches between the official issuer catalog and Chainlink's Robinhood feed catalog. There are 195 issuer assets and 35 assets with catalog candidates. These matches are not verification or approval. The other 160 assets lack a match under this rule. Never substitute a similarly named feed without validating the token's economic exposure, multiplier, redemption semantics and the oracle's actual units.

For each asset, review the issuer's permitted usage, eligibility requirements, feed address and interface, decimals, heartbeat, market hours, freshness and sensible price bounds. Record external evidence. Enable the asset's eligibility policy and record scoped, expiring attestations for eligible accounts. Registry.review checks the policy supports the asset and validates the current oracle price when approving it. Governance then schedules and executes the reviewed approval after the timelock delay.

A hash records evidence; it does not establish issuer permission or legal eligibility by itself. Assets without a verified integration remain unavailable. Trading and factory deployment retain their existing security readiness gates.

## Verification

71 Foundry test executions pass, including rejection of stale prices during approval, policy access controls, scoped and expiring eligibility, revocation, timelock roles and delay. SDK tests cover unavailable registry, suspension, approval and stale-oracle launch blocking. These checks do not certify every real issuer integration or substitute for an independent audit.
