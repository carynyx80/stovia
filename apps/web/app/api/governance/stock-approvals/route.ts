import { NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  keccak256,
  toHex,
  stringToHex,
} from "viem";
import batch from "../../../../../../docs/stock-approval-batch.json";
import {
  safeApprovalAbi,
  approvalTimelockAbi,
  safeScheduleArgs,
  ownerSignatures,
  approvalPhase,
} from "../../../../../../packages/sdk/stock-governance";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const client = createPublicClient({
      transport: http(
        process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
        { batch: true, retryCount: 1 },
      ),
    });
    if ((await client.getChainId()) !== 4663) throw Error("Wrong chain");
    const safe = batch.governance as `0x${string}`,
      timelock = batch.timelock as `0x${string}`;
    const [nonce, owners, threshold, timestamp, delay, block, proposer] =
      await Promise.all([
        client.readContract({
          address: safe,
          abi: safeApprovalAbi,
          functionName: "nonce",
        }),
        client.readContract({
          address: safe,
          abi: safeApprovalAbi,
          functionName: "getOwners",
        }),
        client.readContract({
          address: safe,
          abi: safeApprovalAbi,
          functionName: "getThreshold",
        }),
        client.readContract({
          address: timelock,
          abi: approvalTimelockAbi,
          functionName: "getTimestamp",
          args: [batch.operationId as `0x${string}`],
        }),
        client.readContract({
          address: timelock,
          abi: approvalTimelockAbi,
          functionName: "getMinDelay",
        }),
        client.getBlock(),
        client.readContract({
          address: timelock,
          abi: approvalTimelockAbi,
          functionName: "hasRole",
          args: [keccak256(stringToHex("PROPOSER_ROLE")), safe],
        }),
      ]);
    if (
      threshold !== 2n ||
      owners.length !== 2 ||
      !batch.owners.every((a) =>
        owners.some((b) => a.toLowerCase() === b.toLowerCase()),
      ) ||
      delay !== BigInt(batch.delaySeconds) ||
      !proposer
    )
      throw Error("Governance controls changed");
    const scheduleArgs = safeScheduleArgs(batch, nonce);
    const safeTxHash = await client.readContract({
      address: safe,
      abi: safeApprovalAbi,
      functionName: "getTransactionHash",
      args: scheduleArgs,
    });
    const ownerApprovals = await Promise.all(
      owners.map(async (owner) => ({
        owner,
        approved:
          (await client.readContract({
            address: safe,
            abi: safeApprovalAbi,
            functionName: "approvedHashes",
            args: [owner, safeTxHash],
          })) !== 0n,
        transactionData: encodeFunctionData({
          abi: safeApprovalAbi,
          functionName: "approveHash",
          args: [safeTxHash],
        }),
      })),
    );
    const scheduleExecutionData = encodeFunctionData({
      abi: safeApprovalAbi,
      functionName: "execTransaction",
      args: [...scheduleArgs.slice(0, 9), ownerSignatures(owners)] as any,
    });
    const phase = approvalPhase(timestamp, block.timestamp);
    const action = new URL(request.url).searchParams.get("preflight");
    if (action === "schedule") {
      if (phase !== "not-scheduled" || !ownerApprovals.every((a) => a.approved))
        throw Error("Both owner approvals are required before scheduling");
      const result = await client.call({
        account: owners[0],
        to: safe,
        data: scheduleExecutionData,
      });
      if (result.data !== toHex(1n, { size: 32 }))
        throw Error("Safe scheduling simulation failed");
    }
    if (action === "execute") {
      if (phase !== "ready-to-execute") throw Error("Timelock is not ready");
      await client.call({
        account: owners[0],
        to: timelock,
        data: batch.executeData as `0x${string}`,
      });
    }
    return NextResponse.json(
      {
        ...batch,
        safeNonce: nonce.toString(),
        safeTxHash,
        ownerApprovals,
        scheduleExecutionData,
        phase,
        readyAt:
          timestamp > 1n
            ? new Date(Number(timestamp) * 1000).toISOString()
            : null,
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const error = e as any;
    return NextResponse.json(
      {
        error:
          error.shortMessage ||
          error.message ||
          "Governance RPC verification failed",
        details: error.details,
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
}
