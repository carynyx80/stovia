# Operations

## Web

Configure Vercel with root directory `apps/web`, framework Next.js and Node 22. Install from the workspace root using pnpm and generate Prisma Client before building. Export public chain/RPC and optional WalletConnect project ID only. Set DATABASE_URL and contract addresses on the server. Do not configure deployer keys in the web service. Keep ENABLE_TRANSACTION_UI=false pending approval. A deployment URL is not proof of protocol deployment.

## Database/indexer

Use managed PostgreSQL with encryption, backups and point-in-time recovery. Apply the committed migration with `prisma migrate deploy`; reserve db push for local experimentation. Run the indexer as a persistent container using repository root as Docker build context. Set exact DEPLOYMENT_BLOCK, contract addresses, provider/fallback RPC and confirmation depth. It validates chain ID 4663. Transactions use an advisory lock to serialize indexers, replay at most ten blocks per pass and roll back orphaned events/derived rows. Full deterministic replay is intentionally simple and will need checkpointed incremental materialization at scale. A 120-second transaction timeout bounds failed batches. Monitor cursor lag, RPC failures, database locks and replay duration. Verify finality expectations against current network documentation rather than treating 64 confirmations as a universal guarantee.

The read-only worker observes configured markets; it does not hold keys or automatically spend gas. Permissionless `graduate` and `claimFor` calls can be integrated with an independently authorized keeper after review.

## Deployment

Never run broadcast without explicit authorization and independent security/issuer clearance. The Foundry script requires mainnet chain ID, readiness flags, governance multisig, treasury and validated ETH oracle. It deploys a two-day TimelockController and hands vault administration to it. Use an encrypted Foundry keystore/hardware wallet; the script uses startBroadcast without reading or printing a private key. Record verified transaction receipts and deployment block; populate environment addresses only from receipts. `BONDING_CURVE_ADDRESS`, `GRADUATION_MANAGER_ADDRESS` and `STOCK_AMM_FACTORY_ADDRESS` are compatibility placeholders: this implementation combines curve/graduation/AMM in each StockMarket and factory. Do not fill them with invented global addresses.

## Source control

The owner supplied https://github.com/carynyx80/stovia.git and authorized pushing completed source. CI runs SDK tests, frontend typecheck/build, Solidity compilation and Foundry tests. Add database integration checks and staging credentials through repository secrets when infrastructure is provisioned. Local preview is the currently available deployment surface; no Sites or Vercel production publication is claimed.

## GitHub workflow authorization

The GitHub OAuth credential rejected the initial push because it lacks `workflow` scope. The source is pushed with the workflow template at `docs/ci/github-actions.yml`. An active copy is retained locally at `.github/workflows/ci.yml` and ignored by Git. The repository owner must activate the template at that path through GitHub or grant the required permission before CI can run. Remote CI is not claimed as passing.
