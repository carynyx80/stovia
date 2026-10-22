import { NextResponse } from "next/server";
import { createPublicClient, http, isHash } from "viem";
import proposal from "../../../../../../docs/registry-deployment-proposal.json";
import { verifyRegistryDeployment } from "../../../../../../packages/sdk/verify-registry";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const hash = new URL(request.url).searchParams.get("hash");
  if (!hash || !isHash(hash))
    return NextResponse.json(
      { error: "Valid transaction hash required" },
      { status: 400 },
    );
  try {
    const client = createPublicClient({
      transport: http(
        process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
        { retryCount: 1 },
      ),
    });
    return NextResponse.json(
      await verifyRegistryDeployment(client, proposal, hash),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Deployment not confirmed or contract verification failed. Check the transaction on the explorer.",
      },
      { status: 422 },
    );
  }
}
