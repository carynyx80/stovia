import { createPublicClient, http } from "viem";
import { checkedAddress, marketAbi } from "../../../packages/sdk/index";
// Read-only keeper. Writes require an external authorized signer and explicit deployment approval.
const rpc = process.env.RPC_URL;
if (!rpc) throw Error("RPC_URL required");
const client = createPublicClient({ transport: http(rpc) });
const market = checkedAddress(process.env.KEEPER_MARKET_ADDRESS);
let stop = false;
process.on("SIGTERM", () => (stop = true));
while (!stop) {
  try {
    if ((await client.getChainId()) !== 4663) throw Error("Wrong chain");
    const graduated = await client.readContract({
      address: market,
      abi: marketAbi,
      functionName: "graduated",
    });
    console.log(
      JSON.stringify({
        market,
        graduated,
        observedAt: new Date().toISOString(),
      }),
    );
  } catch (e) {
    console.error(
      "Keeper observation failed",
      e instanceof Error ? e.message : e,
    );
  }
  await new Promise((r) => setTimeout(r, 30000));
}
