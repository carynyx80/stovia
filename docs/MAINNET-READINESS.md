# Mainnet readiness — 2026-10-21

**Status: development implementation. NOT production ready.**

## Verified external information

Official [connection documentation](https://docs.robinhood.com/chain/connecting/) lists chain ID 4663, native ETH, the public RPC https://rpc.mainnet.chain.robinhood.com and [Blockscout](https://robinhoodchain.blockscout.com). The public RPC is rate-limited; configure a production provider. [Deployment requirements](https://docs.robinhood.com/chain/deploy-smart-contracts/) describe EVM deployment and ETH gas.

Robinhood describes [Stock Tokens](https://docs.robinhood.com/chain/stock-tokens/) as issuer debt instruments with jurisdiction restrictions, rather than underlying company shares. [Integration documentation](https://docs.robinhood.com/chain/building-with-stock-tokens/) discusses secondary-market liquidity and standard ERC-20 composition. This does not establish Stovia-specific eligibility or permission. [Issuer metadata](https://docs.robinhood.com/chain/stock-token-apis/) is exposed through the read-only directory; no observed token is automatically approved in Stovia.

[Oracle guidance](https://docs.robinhood.com/chain/oracles-and-price-feeds/) requires attention to stale data, sequencer recovery, and corporate-action pauses. Stock feeds include the corporate-action multiplier; do not apply it again to value raw balances. Feed proxy addresses and heartbeat values must be independently verified from the current Chainlink directory.

## Implemented and checked

Next.js frontend and routes; injected wallet connector; mainnet configuration; authentic empty/unavailable states; real issuer-directory API; database-backed launch/trade APIs; integer quotes; stock registry and immutable token; ETH creation fee; fee accrual and claims; curve and permanent market; permissionless graduation; conversion adapter interface; Foundry unit/fuzz/invariant tests; PostgreSQL schema; event replay indexer; CI and gated deployment source.

## External blockers

1. No approved issuer asset, eligibility/compliance provider, treasury, multisig or oracle proxy has been supplied or verified for this protocol. No approvals have been entered in the registry.
2. No executed, issuer-permitted ETH/stock liquidity route has been validated. ETH checkout is disabled. Conversion adapter implementations must be reviewed against their actual venue contracts; reverse ETH routing is not implemented.
3. No independent security audit, issuer/legal sign-off, production database, persistent worker host, production RPC contract, or monitoring service is connected.
4. No protocol deployment exists. No real-money action has been submitted. Deployment requires explicit human authorization plus independent readiness review. A script boolean is an operational guard, not evidence of approval.
5. GitHub destination is https://github.com/carynyx80/stovia.git. Vercel project credentials are not configured; no hosted production deployment is claimed.

## Remaining implementation and validation

- Admin registry proposal generation verifies connected-wallet multisig ownership. Expanded market/oracle/reserve monitoring and failed-transaction/compliance investigation remain. Calldata is prepared for the multisig/timelock process; no privileged signature or broadcast occurs in the web server.
- Signed single-use upload challenges and durable PostgreSQL metadata/image storage are implemented. They require a running database. Upload abuse limits, EIP-1271 support, malware scanning and live database replay tests need production review.
- Verified historical USD valuation, P&L/cost-basis reconstruction and richer analytics remain. Holder transfer ledgers, per-quote volume/fee rankings, trade counts, launch counts and graduations are indexed. Missing valuations and top-performance rankings remain unavailable; unlike quote assets are never compared by raw amounts.
- Stock selector operational review must cross-check database entries against onchain registry and current issuer session eligibility. Onchain launch/trade paths remain the enforcement boundary.
- Database/indexer end-to-end tests with a live PostgreSQL instance and simulated reorgs, provider outages and restarts; database schema generation alone does not prove this.
- WalletConnect/RainbowKit presentation; full mobile wallet testing; complete browser-based trade/launch/claim acceptance tests against a local deployment.
- Local mock ETH conversion success, refund, slippage and deadline tests and sequencer/corporate-action wrapper checks are included. Adversarial adapter coverage, nonstandard stock behavior and independent deployment-script review remain.
- Curve milestone liveness when the stock price changes materially after launch. The current 80% allocation cap is immutable and can prevent reaching the USD milestone after price decline. Review/calibrate this before release.
- Recovery from suspended issuer assets and accidental token/native transfers; define policy without violating locked liquidity or creator ownership.
- External LP deposits/withdrawals deliberately excluded: the permanent pool has protocol-locked reserves, no LP shares, no administrator withdrawal, no separate LP fee. Do not market this as supporting external LPs.

## Release sequence

Complete the implementation gaps, replay production issuer behavior in local/fork tests, obtain independent audit and eligibility approval, configure approved multisig/timelock and treasury, verify every dependency address, provision database/worker/RPC and monitoring, record authorization, simulate deployment, then request explicit authorization for a broadcast. Keep ENABLE_TRANSACTION_UI=false until readiness and deployment receipts are independently verified.

GitHub CI activation is also blocked by the connected OAuth app's missing `workflow` scope. See `docs/ci/github-actions.yml` and the operations guide. Local checks were run; remote GitHub Actions checks have not run.
