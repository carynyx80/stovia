import { NextResponse } from "next/server";
import { database, json } from "../../../lib/database";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const stocks = await database().approvedStock.findMany({
      where: { approved: true, suspended: false, chainId: 4663 },
    });
    return NextResponse.json(json({ stocks }));
  } catch {
    return NextResponse.json(
      { stocks: [], error: "Approved asset index unavailable" },
      { status: 503 },
    );
  }
}
