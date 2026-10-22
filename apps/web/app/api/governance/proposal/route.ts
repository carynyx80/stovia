import { NextResponse } from "next/server";
import proposal from "../../../../../../docs/governance-safe-proposal.json";
import confirmation from "../../../../../../config/governance-confirmation.json";
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json(
    { ...proposal, status: "deployed-confirmed", confirmation },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
