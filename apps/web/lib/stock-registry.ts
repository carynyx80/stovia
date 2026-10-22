import {
  createPublicClient,
  http,
  isAddress,
  parseAbi,
  type Address,
} from "viem";
import stockBatch from "../../../docs/stock-approval-batch.json";
import deployment from "../../../config/mainnet-proposal.json";
import {
  approvalSummary,
  type RegistryAsset,
} from "../../../packages/sdk/approval";
const supportedAddresses = new Set(
  stockBatch.assets.map((asset) => asset.address.toLowerCase()),
);
const abi = parseAbi([
  "function assets(address stock) view returns(address oracle,address eligibility,uint64 maxAge,uint8 decimals,bool approved,bool suspended,bytes32 evidenceHash,uint256 minPrice,uint256 maxPrice)",
  "function price(address stock) view returns(uint256,uint8)",
]);
let cached: { key: string; expires: number; value: any } | undefined;
export async function stockRegistrySnapshot() {
  const registry =
    process.env.STOCK_REGISTRY_ADDRESS || deployment.stockRegistry;
  const response = await fetch("https://api.robinhood.com/rhj/assets", {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error("Issuer asset directory unavailable");
  const catalog = await response.json();
  if (!Array.isArray(catalog.assets)) throw Error("Invalid issuer response");
  const candidates = catalog.assets.flatMap((a: any) => {
    const d = a.deployments?.find(
      (d: any) => d.chainId === 4663 && isAddress(d.contractAddress),
    );
    return d && supportedAddresses.has(d.contractAddress.toLowerCase())
      ? [
          {
            address: d.contractAddress as Address,
            symbol: a.tokenSymbol,
            name: a.tokenName,
            issuerStatus: a.status,
            multiplier: a.currentMultiplier,
            capabilities: a.tradingCapabilities,
          },
        ]
      : [];
  });
  if (!registry || !isAddress(registry))
    return {
      registry: null,
      source: "onchain-registry",
      blockNumber: null,
      assets: candidates.map((a: any) => ({
        ...a,
        ...approvalSummary(undefined, null),
        reason: "Stovia registry has not been deployed or configured",
      })),
    };
  const key = registry.toLowerCase();
  if (cached?.key === key && cached.expires > Date.now()) return cached.value;
  const client = createPublicClient({
    transport: http(
      process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
      { batch: true, retryCount: 1 },
    ),
  });
  if ((await client.getChainId()) !== 4663) throw Error("Wrong registry chain");
  const blockNumber = await client.getBlockNumber();
  const code = await client.getCode({ address: registry, blockNumber });
  if (!code || code === "0x")
    throw Error("Configured registry has no deployed code");
  const assets: any[] = [];
  for (let offset = 0; offset < candidates.length; offset += 10) {
    assets.push(
      ...(await Promise.all(
        candidates.slice(offset, offset + 10).map(async (a: any) => {
          try {
            const state = (await client.readContract({
              address: registry,
              abi,
              functionName: "assets",
              args: [a.address],
              blockNumber,
            })) as RegistryAsset;
            let oracleHealthy: boolean | null = null;
            if (state[4] && !state[5]) {
              try {
                await client.readContract({
                  address: registry,
                  abi,
                  functionName: "price",
                  args: [a.address],
                  blockNumber,
                });
                oracleHealthy = true;
              } catch {
                oracleHealthy = false;
              }
            }
            return {
              ...a,
              ...approvalSummary(state, oracleHealthy),
              oracle: state[0],
              eligibility: state[1],
              decimals: state[3],
              evidenceHash: state[6],
            };
          } catch {
            return {
              ...a,
              ...approvalSummary(undefined, null),
              reason: "Registry read failed",
            };
          }
        }),
      )),
    );
  }
  const value = {
    registry,
    source: "onchain-registry",
    blockNumber: blockNumber.toString(),
    assets,
  };
  cached = { key, expires: Date.now() + 15000, value };
  return value;
}
