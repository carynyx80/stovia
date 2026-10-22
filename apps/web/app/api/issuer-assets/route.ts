import { NextResponse } from "next/server";
import { isAddress } from "viem";
export async function GET() {
  try {
    const r = await fetch("https://api.robinhood.com/rhj/assets", {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw Error("Issuer API unavailable");
    const d = await r.json();
    if (!Array.isArray(d.assets)) throw Error("Unexpected issuer schema");
    const assets = d.assets.flatMap((a: any) => {
      const deployment = a.deployments?.find(
        (x: any) => x.chainId === 4663 && isAddress(x.contractAddress),
      );
      return deployment
        ? [
            {
              symbol: a.tokenSymbol,
              name: a.tokenName,
              address: deployment.contractAddress,
              status: a.status,
              multiplier: a.currentMultiplier,
              capabilities: a.tradingCapabilities,
              approvedForStovia: false,
            },
          ]
        : [];
    });
    return NextResponse.json({
      assets,
      source: "https://api.robinhood.com/rhj/assets",
      observedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { assets: [], error: "Issuer directory unavailable" },
      { status: 503 },
    );
  }
}
