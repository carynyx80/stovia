import { NextResponse } from "next/server";
import { database, json } from "../../../lib/database";
export const dynamic = "force-dynamic";
export async function GET() {
  let stats = null;
  let dbReady = false;
  try {
    const db = database();
    const [launches, graduated, fees] = await Promise.all([
      db.launch.count(),
      db.graduation.count(),
      db.creatorFee.findMany(),
    ]);
    dbReady = true;
    stats = { launches, graduated, active: launches, creatorFeesByToken: fees };
  } catch {}
  const contracts = {
    factory: process.env.LAUNCH_FACTORY_ADDRESS || null,
    vault: process.env.FEE_VAULT_ADDRESS || null,
    registry: process.env.STOCK_REGISTRY_ADDRESS || null,
    router: process.env.PAYMENT_ROUTER_ADDRESS || null,
  };
  return NextResponse.json(
    json({
      chainId: 4663,
      configured: dbReady && !!contracts.factory,
      transactionUI:
        process.env.ENABLE_TRANSACTION_UI === "true" &&
        dbReady &&
        !!contracts.factory,
      contracts,
      governance: process.env.GOVERNANCE_MULTISIG || null,
      stats,
      timestamp: new Date().toISOString(),
    }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
