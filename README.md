# STOVIA

Stock-denominated token launchpad development monorepo. **Unaudited, undeployed, and not approved for real funds.** No deployment or real-money transaction was performed.

## Run locally

Requires Node 22+, pnpm 11+, PostgreSQL 17 and Foundry (Solidity 0.8.30).

```sh
pnpm install --ignore-scripts --config.strict-dep-builds=false
pnpm db:generate
pnpm dev
```

Open http://localhost:3000. The development preview connects to Robinhood mainnet for wallet reads, but trading stays disabled. Browser-injected EVM wallets are supported. WalletConnect/RainbowKit dependencies are included, but WalletConnect is not enabled without a project ID and completed connector integration.

For persistent indexing:

```sh
docker compose up -d
# Copy .env.example to .env locally, configure deployment addresses and exact deployment block.
pnpm exec prisma migrate deploy --schema prisma/schema.prisma
# Export the server environment securely before starting services.
pnpm --filter @stovia/indexer start
```

Next.js reads its environment from apps/web/.env.local or hosting environment variables. The worker/indexer read exported process environment. Never put deployer credentials in the web service environment. Prisma reads the root .env for CLI operations.

## Verify

```sh
pnpm test
pnpm typecheck
pnpm contracts:compile
forge test --root packages/contracts -vv
pnpm build
```

The Solidity tests use explicitly local mock stocks/oracles. No mock balances or trades are exposed as mainnet application data. Unit and fuzz tests cover launch fees, fee restrictions, buy/sell execution, solvency, oracle failure, suspensions, eligibility, graduation and AMM execution. Stateful invariants cover fixed supply, curve accounting and real reserve backing.

## Architecture

- `apps/web`: Next.js App Router application, live indexer APIs, injected wallet connection, trade approval/submission/receipt flow, chart from indexed transactions, creator claims, launch simulation and fee/gas review.
- `packages/contracts`: stock registry, immutable launch ERC-20, fee vault, combined curve/permanent market, launch factory, ETH routing boundary, oracle guard and gated deployment script.
- `packages/sdk`: ABIs and exact integer quote/slippage helpers.
- `prisma`: PostgreSQL schema and initial migration.
- `services/indexer`: confirmed-block replay, duplicate handling, canonical ancestry checks, transactional cursor, advisory lock, reorg rollback and deterministic reconstruction.
- `services/worker`: read-only operational observer; no unattended signer is enabled.

See [mainnet readiness](docs/MAINNET-READINESS.md), [economics](docs/ECONOMICS.md), [security](docs/SECURITY.md) and [operations](docs/OPERATIONS.md). These documents identify remaining work as well as external blockers. The requested full product is not complete.
