# Validation — 2026-10-21

- Next.js optimized production build: PASS, including route generation and frontend type validation.
- Frontend and service TypeScript checks: PASS.
- Solidity 0.8.30 compilation: PASS. Largest deployed runtime is LaunchFactory at 14,544 bytes, below the 24,576-byte EIP-170 limit.
- Foundry: 45 passing executions across two suites, zero failures. This includes 21 distinct scenario tests (inherited and executed again by the invariant suite), one randomized round-trip scenario at 1,000 runs per suite, and three stateful invariants at 256 runs / 128 calls each. Inherited test duplication is included in the 45 execution total.
- SDK: 4 tests pass, including 10,000 deterministic randomized round trips and integer calibration/distribution checks.
- Prisma Client generation and initial PostgreSQL migration generation: PASS. No live PostgreSQL server was available; live database persistence, upload, reorg and restart tests were not executed.
- Browser: responsive layout, navigation, launch-form name/ticker/description changes, fee selection through 10%, disconnected wallet dialog and issuer directory checked. No wallet transaction or mainnet deployment was attempted.

The initial build found an unused connector import pulling in missing Coinbase optional packages. Importing the injected connector from @wagmi/core fixed the production build. Two initial contract test failures were corrected: a prank consumed by an earlier oracle read and an overshooting fee-inversion input at the curve allocation boundary. A concurrent standalone TypeScript check raced a Next build deleting generated route types; the build type check passed and the standalone check was rerun after generation finished.

Passing local tests do not establish production readiness. See MAINNET-READINESS.md for remaining work and external blockers.
