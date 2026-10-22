import { NextResponse } from "next/server";
import { database, json } from "../../../lib/database";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const db = database();
    const [markets, creators, graduations] = await Promise.all([
      db.$queryRaw`SELECT l.token,l.market,l.quote,l.creator,COUNT(t.id)::int AS trades,COALESCE(SUM(CASE WHEN t.side='sell' THEN t."quoteAmount"+t.fee ELSE t."quoteAmount" END),0)::text AS volume,COALESCE(f.generated,0)::text AS earnings FROM "Launch" l LEFT JOIN "Trade" t ON t.market=l.market LEFT JOIN "CreatorFee" f ON f.token=l.token GROUP BY l.token,l.market,l.quote,l.creator,f.generated ORDER BY COUNT(t.id) DESC LIMIT 100`,
      db.$queryRaw`SELECT l.creator,COUNT(*)::int AS launches,COUNT(g.token)::int AS graduated FROM "Launch" l LEFT JOIN "Graduation" g ON g.token=l.token GROUP BY l.creator ORDER BY COUNT(g.token) DESC,COUNT(*) DESC LIMIT 100`,
      db.graduation.findMany({ orderBy: { blockNumber: "desc" }, take: 100 }),
    ]);
    return NextResponse.json(json({ markets, creators, graduations }));
  } catch {
    return NextResponse.json(
      {
        markets: [],
        creators: [],
        graduations: [],
        error: "Rankings unavailable until indexed activity exists",
      },
      { status: 503 },
    );
  }
}
