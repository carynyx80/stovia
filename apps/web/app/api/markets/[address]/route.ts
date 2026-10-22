import { NextResponse } from "next/server";
import { database, json } from "../../../../lib/database";
export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address))
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  try {
    const db = database();
    const launch = await db.launch.findUnique({
      where: { token: address.toLowerCase() },
    });
    if (!launch)
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    const [trades, candles, holders] = await Promise.all([
      db.trade.findMany({
        where: { market: launch.market },
        orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
        take: 100,
      }),
      db.candle.findMany({
        where: { market: launch.market, interval: 60 },
        orderBy: { timestamp: "desc" },
        take: 500,
      }),
      db.holder.findMany({
        where: { token: address.toLowerCase(), balance: { gt: 0 } },
        orderBy: { balance: "desc" },
        take: 100,
      }),
    ]);
    return NextResponse.json(
      json({
        launch,
        trades,
        holders,
        candles: candles.reverse(),
        transactionUI: process.env.ENABLE_TRANSACTION_UI === "true",
      }),
    );
  } catch {
    return NextResponse.json({ error: "Indexer unavailable" }, { status: 503 });
  }
}
