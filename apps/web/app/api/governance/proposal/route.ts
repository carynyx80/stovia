import { NextResponse } from "next/server";
import proposal from "../../../../../../docs/governance-safe-proposal.json";
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json(proposal, {
    headers: { "Cache-Control": "no-store" },
  });
}
