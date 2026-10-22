import { NextResponse } from "next/server";
import { stockRegistrySnapshot } from "../../../lib/stock-registry";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const snapshot = await stockRegistrySnapshot();
    return NextResponse.json(
      {
        ...snapshot,
        stocks: snapshot.assets
          .filter((a: any) => a.approved)
          .map((a: any) => ({ ...a, issuer: a.name })),
        observedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        stocks: [],
        assets: [],
        source: "onchain-registry",
        error: "Unable to verify stock registry approvals",
      },
      { status: 503 },
    );
  }
}
