import { NextResponse } from "next/server";
import proposal from "../../../../../../docs/registry-factory-proposal.json";
import confirmation from "../../../../../../config/registry-confirmation.json";
export async function GET() {
  return NextResponse.json(
    { ...proposal, confirmation, status: "deployed-confirmed" },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
