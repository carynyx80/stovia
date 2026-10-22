# Economics

All curve/AMM arithmetic uses raw ERC-20 units. The launch token has 18 decimals. Only registry-approved quote assets enter official factories. No claim is made about preventing third-party listings.

Let supply S and initial virtual token reserve x0=S. The launch permits up to 80% of S to leave the curve. Given a reserve target Q in stock units, choose y0=ceil(Q/4). Ignoring integer rounding, after receiving Q=4y0 net quote, x=S/5 and y=5y0. This distributes 80% through the curve.

The opening permanent liquidity allocation is floor(realQuote*x/y), matching the terminal marginal price y/x up to rounding. At Q=4y0 this is 16% of S. The original 20% reserved allocation therefore supplies 16% to liquidity; the remaining 4%, together with any other unsold inventory at earlier graduation, is sent irreversibly to the dead address. There is no new mint. Transfers to the dead address do not reduce ERC-20 totalSupply; the UI must distinguish inaccessible inventory from burned total supply.

A single market switches atomically into permanent AMM mode. This avoids transferring assets into a second factory/pool during graduation. The launch factory is also the official market factory. There are no external LP deposit or withdrawal rights; reserves are permanently locked except for swaps. This is an intentional alternative to separate graduation-manager and AMM-factory deployments.

Fees: fee=floor(grossQuote*chosenPercent/100), protocol=floor(fee/10), creator=fee-protocol. Dust favors the creator by at most one raw unit. Fees are accrued once per Stovia trade, in quote asset units. Buys apply fees before pricing; sells apply fees to gross quote output. Router execution/venue costs and gas are separate.

Creation cost is ceil(0.25e18*1e18/ETH_USD_18), paid in native ETH. This is independent of network gas. Oracle freshness/round checks reject invalid prices. The launch factory refunds native overpayment atomically; failure reverts the launch.

Rounding increases the virtual constant product. Exact-input trades that exceed the 80% allocation cap revert; clients must size them accordingly. Quote price movement can delay/prevent USD graduation at the cap. This unresolved liveness issue is a production blocker.
