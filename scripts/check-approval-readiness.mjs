import fs from "node:fs/promises";
import { createRequire } from "node:module";
const { createPublicClient, http, parseAbi } = createRequire(
  new URL("../packages/sdk/package.json", import.meta.url),
)("viem");
const root = new URL("../", import.meta.url);
const config = JSON.parse(
  await fs.readFile(new URL("config/mainnet-proposal.json", root), "utf8"),
);
const catalog = JSON.parse(
  await fs.readFile(new URL("docs/stock-oracle-candidates.json", root), "utf8"),
);
const client = createPublicClient({
  transport: http(
    process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
    { batch: { batchSize: 20 }, retryCount: 1 },
  ),
});
if ((await client.getChainId()) !== 4663) throw Error("Wrong chain");
const block = await client.getBlock();
const oracleAbi = parseAbi([
  "function decimals() view returns(uint8)",
  "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)",
]);
const policyAbi = parseAbi([
  "function supportsAsset(address) view returns(bool)",
]);
const registryAbi = parseAbi([
  "function assets(address) view returns(address,address,uint64,uint8,bool,bool,bytes32,uint256,uint256)",
]);
const assets = [];
for (let start = 0; start < catalog.assets.length; start += 5) {
  const results = await Promise.all(
    catalog.assets.slice(start, start + 5).map(async (asset) => {
      const read = (address, abi, functionName, args = []) =>
        client.readContract({
          address,
          abi,
          functionName,
          args,
          blockNumber: block.number,
        });
      const [policy, state] = await Promise.all([
        read(config.eligibility, policyAbi, "supportsAsset", [asset.address]),
        read(config.stockRegistry, registryAbi, "assets", [asset.address]),
      ]);
      const oracles = [];
      for (const candidate of asset.oracleCandidates) {
        for (const address of [
          candidate.proxy,
          candidate.secondaryProxy,
        ].filter(Boolean)) {
          try {
            const [decimals, round] = await Promise.all([
              read(address, oracleAbi, "decimals"),
              read(address, oracleAbi, "latestRoundData"),
            ]);
            const age = block.timestamp - round[3];
            oracles.push({
              address,
              decimals,
              round: round[0].toString(),
              answer: round[1].toString(),
              updatedAt: round[3].toString(),
              ageSeconds: age.toString(),
              freshCompletePositive:
                round[1] > 0n &&
                round[3] > 0n &&
                age >= 0n &&
                age <= BigInt(candidate.heartbeat) &&
                round[4] >= round[0],
              catalogHeartbeat: candidate.heartbeat,
            });
          } catch (e) {
            oracles.push({
              address,
              readable: false,
              error: e.shortMessage || "Oracle read failed",
            });
          }
        }
      }
      return {
        symbol: asset.symbol,
        address: asset.address,
        registryApproved: state[4] && !state[5],
        eligibilityPolicyEnabled: policy,
        oracleChecks: oracles,
        readyForApproval: false,
        blockers: [
          ...(!asset.oracleCandidates.length
            ? ["No matched oracle candidate"]
            : [
                "Oracle candidate requires economic exposure and unit validation",
              ]),
          ...(!policy ? ["Eligibility policy has not been enabled"] : []),
          "External issuer/eligibility review evidence not recorded",
          "Reviewed freshness and min/max price bounds not recorded",
          "Independent security review outstanding",
        ],
      };
    }),
  );
  assets.push(...results);
}
const report = {
  chainId: 4663,
  checkedAt: new Date().toISOString(),
  blockNumber: block.number.toString(),
  blockHash: block.hash,
  registry: config.stockRegistry,
  eligibility: config.eligibility,
  assetCount: assets.length,
  approved: assets.filter((a) => a.registryApproved).length,
  eligibilityPoliciesEnabled: assets.filter((a) => a.eligibilityPolicyEnabled)
    .length,
  readyForApproval: assets.filter((a) => a.readyForApproval).length,
  assetsWithReadableFreshOracleCandidate: assets.filter((a) =>
    a.oracleChecks.some((o) => o.freshCompletePositive),
  ).length,
  transactionsSubmitted: 0,
  assets,
};
await fs.writeFile(
  new URL("docs/stock-approval-readiness.json", root),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ ...report, assets: undefined }, null, 2));
