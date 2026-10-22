import { NextResponse } from "next/server";
import { stockRegistrySnapshot } from "../../../lib/stock-registry";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const snapshot = await stockRegistrySnapshot();
    return NextResponse.json(
      {
        assets: snapshot.assets.map((a: any) => ({
          ...a,
          status: a.issuerStatus,
          approvedForStovia: a.approved,
        })),
        registry: snapshot.registry,
        approvalBlock: snapshot.blockNumber,
        source: "https://api.robinhood.com/rhj/assets",
        approvalSource: "onchain-registry",
        observedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        assets: [],
        error: "Issuer directory or registry verification unavailable",
      },
      { status: 503 },
    );
  }
}
