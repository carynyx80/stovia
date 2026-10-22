import fs from "node:fs/promises";
import { createRequire } from "node:module";
const {
  createPublicClient,
  http,
  parseAbi,
  encodeFunctionData,
  keccak256,
  stringToHex,
  encodeAbiParameters,
  parseAbiParameters,
  zeroHash,
} = createRequire(new URL("../packages/sdk/package.json", import.meta.url))(
  "viem",
);
const root = new URL("../", import.meta.url),
  readJSON = async (path) =>
    JSON.parse(await fs.readFile(new URL(path, root), "utf8"));
const config = await readJSON("config/mainnet-proposal.json"),
  catalog = await readJSON("docs/stock-oracle-candidates.json");
try {
  await fs.access(new URL("docs/stock-approval-batch.json", root));
  throw Error(
    "Existing approval batch is immutable. Archive explicitly before preparing a replacement.",
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const client = createPublicClient({
  transport: http(
    process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
    { batch: true },
  ),
});
if ((await client.getChainId()) !== 4663) throw Error("Wrong chain");
const block = await client.getBlock();
const response = await fetch("https://api.robinhood.com/rhj/assets");
if (!response.ok) throw Error("Issuer unavailable");
const issuer = await response.json();
const feedResponse = await fetch(catalog.source);
if (!feedResponse.ok) throw Error("Feed catalog unavailable");
const feeds = await feedResponse.json();
const oracleAbi = parseAbi([
  "function decimals() view returns(uint8)",
  "function description() view returns(string)",
  "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)",
]);
const tokenAbi = parseAbi(["function decimals() view returns(uint8)"]);
const eligibilityAbi = parseAbi([
  "function setAssetPolicy(address asset,bool supported,bytes32 evidenceHash)",
]);
const registryAbi = parseAbi([
  "function review(address stock,(address oracle,address eligibility,uint64 maxAge,uint8 decimals,bool approved,bool suspended,bytes32 evidenceHash,uint256 minPrice,uint256 maxPrice) a)",
]);
const timelockAbi = parseAbi([
  "function getMinDelay() view returns(uint256)",
  "function scheduleBatch(address[] targets,uint256[] values,bytes[] payloads,bytes32 predecessor,bytes32 salt,uint256 delay)",
  "function executeBatch(address[] targets,uint256[] values,bytes[] payloads,bytes32 predecessor,bytes32 salt) payable",
]);
const assets = [],
  excluded = [];
for (const asset of catalog.assets) {
  if (!asset.oracleCandidates.length) {
    excluded.push({
      address: asset.address,
      symbol: asset.symbol,
      reason: "No verified catalog feed match",
    });
    continue;
  }
  const token = issuer.assets.find(
    (a) =>
      a.tokenSymbol === asset.symbol &&
      a.deployments.some(
        (d) =>
          d.chainId === 4663 &&
          d.contractAddress.toLowerCase() === asset.address.toLowerCase(),
      ),
  );
  if (!token || token.status !== "ASSET_STATUS_ACTIVE") {
    excluded.push({ ...asset, reason: "Issuer listing inactive or changed" });
    continue;
  }
  const candidate = asset.oracleCandidates[0];
  const entry = feeds.find(
    (f) => f.proxyAddress?.toLowerCase() === candidate.proxy.toLowerCase(),
  );
  if (
    !entry ||
    entry.name !== candidate.name ||
    entry.heartbeat !== candidate.heartbeat
  )
    throw Error("Feed catalog mapping changed: " + asset.symbol);
  const oracle = candidate.proxy;
  const read = (address, abi, functionName) =>
    client.readContract({
      address,
      abi,
      functionName,
      blockNumber: block.number,
    });
  const [decimals, feedDecimals, description, round, code] = await Promise.all([
    read(asset.address, tokenAbi, "decimals"),
    read(oracle, oracleAbi, "decimals"),
    read(oracle, oracleAbi, "description"),
    read(oracle, oracleAbi, "latestRoundData"),
    client.getCode({ address: oracle, blockNumber: block.number }),
  ]);
  const maxAge = candidate.heartbeat;
  if (
    !code ||
    code === "0x" ||
    decimals !== 18 ||
    feedDecimals !== candidate.decimals ||
    maxAge <= 0 ||
    maxAge > 86400 ||
    round[1] <= 0n ||
    round[3] === 0n ||
    round[3] > block.timestamp ||
    block.timestamp - round[3] > BigInt(maxAge) ||
    round[4] < round[0]
  )
    throw Error("Oracle/token validation failed: " + asset.symbol);
  const price = round[1] * 10n ** BigInt(18 - feedDecimals);
  assets.push({
    address: asset.address,
    symbol: asset.symbol,
    oracle,
    feedDescription: description,
    decimals,
    maxAge,
    feedDecimals,
    observedPrice18: price.toString(),
    minPrice: (price / 2n).toString(),
    maxPrice: (price * 2n).toString(),
    updatedAt: round[3].toString(),
    round: round[0].toString(),
    oracleRuntimeHash: keccak256(code),
  });
}
const evidence = {
  schema: 1,
  chainId: 4663,
  blockNumber: block.number.toString(),
  blockHash: block.hash,
  preparedAt: new Date().toISOString(),
  authorization:
    "Project owner explicitly requested stock approvals in this chat. Governance approval is subject to both Safe owners signing this exact batch.",
  issuerSource: "https://api.robinhood.com/rhj/assets",
  oracleSource: catalog.source,
  pricingSemanticsSource:
    "https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood",
  policy: {
    freshness: "Official catalog heartbeat, capped at one day",
    priceBounds:
      "50% to 200% of preparation-block total-return token price; normalized to 18 decimals; fixed until governance changes them",
    eligibility:
      "Enable asset support only. No wallet attestations. All wallets remain ineligible until separately attested.",
    scope:
      "Project governance technical integration approval. Not issuer endorsement, external legal certification or an independent security audit.",
  },
  assets,
  excluded,
};
const evidenceText = JSON.stringify(evidence, null, 2) + "\n",
  evidenceHash = keccak256(stringToHex(evidenceText));
const targets = [],
  values = [],
  payloads = [];
for (const asset of assets) {
  targets.push(config.eligibility, config.stockRegistry);
  values.push(0n, 0n);
  payloads.push(
    encodeFunctionData({
      abi: eligibilityAbi,
      functionName: "setAssetPolicy",
      args: [asset.address, true, evidenceHash],
    }),
    encodeFunctionData({
      abi: registryAbi,
      functionName: "review",
      args: [
        asset.address,
        {
          oracle: asset.oracle,
          eligibility: config.eligibility,
          maxAge: BigInt(asset.maxAge),
          decimals: asset.decimals,
          approved: true,
          suspended: false,
          evidenceHash,
          minPrice: BigInt(asset.minPrice),
          maxPrice: BigInt(asset.maxPrice),
        },
      ],
    }),
  );
}
if (!assets.length) throw Error("No validated feeds");
const delay = await client.readContract({
  address: config.timelock,
  abi: timelockAbi,
  functionName: "getMinDelay",
});
const salt = keccak256(stringToHex("STOVIA_STOCK_APPROVALS_" + evidenceHash));
const args = [targets, values, payloads, zeroHash, salt];
const operationId = keccak256(
  encodeAbiParameters(
    parseAbiParameters("address[],uint256[],bytes[],bytes32,bytes32"),
    args,
  ),
);
const scheduleData = encodeFunctionData({
  abi: timelockAbi,
  functionName: "scheduleBatch",
  args: [...args, delay],
});
await client.call({
  account: config.governanceMultisig,
  to: config.timelock,
  data: scheduleData,
});
const estimatedScheduleGas = await client.estimateGas({
  account: config.governanceMultisig,
  to: config.timelock,
  data: scheduleData,
});
const batch = {
  chainId: 4663,
  status: "awaiting-both-governance-owners",
  governance: config.governanceMultisig,
  timelock: config.timelock,
  registry: config.stockRegistry,
  eligibility: config.eligibility,
  owners: config.proposedGovernance.owners,
  threshold: 2,
  delaySeconds: Number(delay),
  assetCount: assets.length,
  excludedCount: excluded.length,
  evidenceHash,
  operationId,
  salt,
  predecessor: zeroHash,
  targets,
  values: values.map(String),
  payloads,
  scheduleData,
  executeData: encodeFunctionData({
    abi: timelockAbi,
    functionName: "executeBatch",
    args,
  }),
  estimatedScheduleGas: estimatedScheduleGas.toString(),
  assets: assets.map((a) => ({
    symbol: a.symbol,
    address: a.address,
    oracle: a.oracle,
    minPrice: a.minPrice,
    maxPrice: a.maxPrice,
    maxAge: a.maxAge,
  })),
  transactionsSubmitted: 0,
};
await fs.writeFile(
  new URL("docs/stock-approval-evidence.json", root),
  evidenceText,
);
await fs.writeFile(
  new URL("docs/stock-approval-batch.json", root),
  JSON.stringify(batch, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      assetCount: assets.length,
      excluded: excluded.length,
      operationId,
      evidenceHash,
      scheduleSimulation: "passed",
    },
    null,
    2,
  ),
);
