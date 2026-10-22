import { NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  keccak256,
  parseAbi,
  formatEther,
  type Address,
  type Hex,
} from "viem";
import proposal from "../../../../../../docs/registry-deployment-proposal.json";
export const dynamic = "force-dynamic";
export async function GET() {
  let stage = "RPC connection";
  try {
    const client = createPublicClient({
      transport: http(
        process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
        { timeout: 20000, retryCount: 1 },
      ),
    });
    if ((await client.getChainId()) !== 4663) throw Error("Wrong RPC chain");
    if (keccak256(proposal.transaction.data as Hex) !== proposal.initcodeHash)
      throw Error("Proposal integrity mismatch");
    stage = "governance verification";
    const abi = parseAbi([
      "function getOwners() view returns(address[])",
      "function getThreshold() view returns(uint256)",
    ]);
    const [owners, threshold] = await Promise.all([
      client.readContract({
        address: proposal.governance as Address,
        abi,
        functionName: "getOwners",
      }),
      client.readContract({
        address: proposal.governance as Address,
        abi,
        functionName: "getThreshold",
      }),
    ]);
    if (
      threshold !== BigInt(proposal.threshold) ||
      owners.length !== proposal.owners.length ||
      !proposal.owners.every((a) =>
        owners.some((b) => a.toLowerCase() === b.toLowerCase()),
      )
    )
      throw Error("Safe configuration changed");
    const request = {
      account: proposal.transaction.from as Address,
      data: proposal.transaction.data as Hex,
      value: 0n,
    };
    stage = "contract creation simulation";
    await client.call(request);
    stage = "gas estimation";
    const [estimate, gasPrice, balance] = await Promise.all([
      client.estimateGas(request),
      client.getGasPrice(),
      client.getBalance({ address: request.account }),
    ]);
    const gas = (estimate * 120n) / 100n,
      cost = gas * gasPrice;
    if (balance < cost)
      throw Error(
        `Deployment wallet needs approximately ${formatEther(cost)} ETH for gas; current balance is ${formatEther(balance)} ETH. Fund it on Robinhood Chain and retry.`,
      );
    return NextResponse.json(
      {
        chainId: 4663,
        initcodeHash: proposal.initcodeHash,
        gas: gas.toString(),
        gasPrice: gasPrice.toString(),
        estimatedMaxGasCostWei: cost.toString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const error = e as any;
    return NextResponse.json(
      {
        stage,
        error: error.shortMessage || error.message || "RPC request failed",
        details: error.details || undefined,
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
}
