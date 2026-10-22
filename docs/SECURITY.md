# Security posture

Contracts are unaudited. Automated testing is not a security audit. No mainnet funds should be used.

SafeERC20, ReentrancyGuard, role-restricted review, fixed creator destinations, immutable fees/supply, deadlines, minimum output, real reserve checks and balance-delta validation protect the implemented flows. Fee-on-transfer quote assets are rejected on incoming balances. Issuer-specific outgoing-transfer behavior still requires review. The registry delegates eligibility to an explicitly configured adapter; an evidence hash is not proof that issuer authenticity or legal approval has been established.

Governance should be the deployment script's two-day timelock, controlled by an approved multisig. No protocol upgrades or emergency withdrawals exist. An approved guardian multisig can suspend immediately; resumption remains with the timelocked reviewer. Suspending a quote stops its markets; it may prevent holders exiting, which must be reviewed with issuer requirements. Fee claims transfer only to the immutable registered creator, even when triggered by another caller.

The optional oracle wrapper enforces sequencer recovery and issuer oraclePaused state. Production must use verified feed proxies, appropriate heartbeat ages and review circuit-breaker ranges. Availability outside issuer publication windows is intentionally fail-closed. Sequencer and corporate-action checks have local tests; production constructor settings and real-feed behavior still need review.

ETH routing trusts only governance-approved adapters, checks caller/router eligibility, measures actual quote output, resets spending approval and uses a minimum token output/deadline. No conversion venue is approved. All venue-specific methods, allowances, refunds, pricing, route fees and compliance behavior require independent verification. No synthetic substitute exists.

Frontend transaction gating is a product-release guard, not contract access control. Never rely on ENABLE_TRANSACTION_UI for authorization. Privileged keys belong only in an isolated authorized deployment runner. Never set them in Next.js environment or public variables. API routes expose only public indexed data and issuer metadata; they do not sign transactions.

Indexer trust is limited to its verified RPC and configured deployment addresses. Confirmed blocks, ancestry checks, atomic cursor updates, uniqueness constraints and deterministic replay are implemented. Live database reorg/fault validation remains outstanding. The database is never the balance/reserve authority.

Report vulnerabilities privately to the project owner; no security contact or bounty program has been configured.
