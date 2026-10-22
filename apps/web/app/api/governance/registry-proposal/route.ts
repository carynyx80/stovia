import { NextResponse } from "next/server";
import proposal from "../../../../../../docs/registry-factory-proposal.json";
export async function GET() {
  return NextResponse.json(proposal, {
    headers: { "Cache-Control": "no-store" },
  });
}
