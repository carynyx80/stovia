import { NextResponse } from "next/server";
import { database, json } from "../../../lib/database";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const u = new URL(request.url),
      creator = u.searchParams.get("creator");
    if (creator && !/^0x[a-fA-F0-9]{40}$/.test(creator))
      return NextResponse.json({ error: "Invalid creator" }, { status: 400 });
    const db = database();
    const launches = await db.launch.findMany({
      where: creator ? { creator: creator.toLowerCase() } : {},
      orderBy: { blockNumber: "desc" },
      take: 100,
    });
    const [trades, graduations, fees] = await Promise.all([
      db.trade.findMany({
        where: { market: { in: launches.map((l) => l.market) } },
        orderBy: { blockNumber: "desc" },
        take: 1000,
      }),
      db.graduation.findMany(),
      db.creatorFee.findMany(),
    ]);
    return NextResponse.json(
      json({
        launches,
        trades,
        graduations,
        fees,
        source: "canonical-indexer",
        observedAt: new Date().toISOString(),
      }),
    );
  } catch {
    return NextResponse.json(
      {
        error: "Indexed data unavailable",
        launches: [],
        trades: [],
        graduations: [],
        fees: [],
      },
      { status: 503 },
    );
  }
}
