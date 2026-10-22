import { NextResponse } from "next/server";
import { stockRegistrySnapshot } from "../../../lib/stock-registry";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await stockRegistrySnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { assets: [], error: "Registry verification unavailable" },
      { status: 503 },
    );
  }
}
