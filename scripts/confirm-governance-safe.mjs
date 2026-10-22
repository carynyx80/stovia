import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../packages/sdk/package.json", import.meta.url),
);
const { createPublicClient, http, parseAbi, decodeEventLog } = require("viem");
const hash = process.argv[2];
if (!/^0x[0-9a-fA-F]{64}$/.test(hash || ""))
  throw Error("Transaction hash required");
const root = new URL("../", import.meta.url),
  proposal = JSON.parse(
    await fs.readFile(
      new URL("docs/governance-safe-proposal.json", root),
      "utf8",
    ),
  );
const client = createPublicClient({
  transport: http(
    process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  ),
});
if ((await client.getChainId()) !== 4663) throw Error("Wrong chain");
const [receipt, tx] = await Promise.all([
  client.getTransactionReceipt({ hash }),
  client.getTransaction({ hash }),
]);
if (receipt.status !== "success") throw Error("Transaction not successful");
if (
  tx.from.toLowerCase() !== proposal.transaction.from.toLowerCase() ||
  tx.to?.toLowerCase() !== proposal.transaction.to.toLowerCase() ||
  tx.input.toLowerCase() !== proposal.transaction.data.toLowerCase() ||
  tx.value !== 0n
)
  throw Error("Transaction differs from reviewed proposal");
const eventAbi = parseAbi([
  "event ProxyCreation(address indexed proxy,address singleton)",
]);
let created = false;
for (const log of receipt.logs) {
  if (log.address.toLowerCase() !== proposal.transaction.to.toLowerCase())
    continue;
  try {
    const e = decodeEventLog({
      abi: eventAbi,
      data: log.data,
      topics: log.topics,
    });
    if (
      e.args.proxy.toLowerCase() ===
        proposal.predictedSafeAddress.toLowerCase() &&
      e.args.singleton.toLowerCase() ===
        proposal.officialRuntimeContracts.safe_l2.address.toLowerCase()
    )
      created = true;
  } catch {}
}
if (!created) throw Error("Matching Safe creation event missing");
const address = proposal.predictedSafeAddress,
  abi = parseAbi([
    "function getOwners() view returns(address[])",
    "function getThreshold() view returns(uint256)",
    "function masterCopy() view returns(address)",
    "function VERSION() view returns(string)",
  ]);
const [owners, threshold, singleton, version, code] = await Promise.all([
  client.readContract({ address, abi, functionName: "getOwners" }),
  client.readContract({ address, abi, functionName: "getThreshold" }),
  client.readContract({ address, abi, functionName: "masterCopy" }),
  client.readContract({ address, abi, functionName: "VERSION" }),
  client.getCode({ address }),
]);
if (
  !code ||
  code === "0x" ||
  threshold !== 2n ||
  owners.length !== 2 ||
  !proposal.owners.every((a) =>
    owners.some((b) => a.toLowerCase() === b.toLowerCase()),
  ) ||
  singleton.toLowerCase() !==
    proposal.officialRuntimeContracts.safe_l2.address.toLowerCase() ||
  version !== proposal.safeVersion
)
  throw Error("Safe configuration mismatch");
const verified = {
  chainId: 4663,
  address,
  transactionHash: hash,
  blockNumber: receipt.blockNumber.toString(),
  blockHash: receipt.blockHash,
  status: "confirmed",
  owners,
  threshold: Number(threshold),
  singleton,
  version,
  verifiedAt: new Date().toISOString(),
  stockApprovalsExecuted: 0,
};
await fs.writeFile(
  new URL("config/governance-confirmation.json", root),
  JSON.stringify(verified, null, 2) + "\n",
);
const configPath = new URL("config/mainnet-proposal.json", root),
  config = JSON.parse(await fs.readFile(configPath, "utf8"));
config.governanceMultisig = address;
config.status = "governance-deployed-protocol-pending";
config.authorization =
  "User signed the governance Safe creation transaction; receipt and onchain owners/threshold verified. No Stovia protocol or stock approval transaction has been confirmed.";
config.proposedGovernance.status = "deployed-confirmed";
config.governanceDeploymentTransaction = hash;
await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
console.log(JSON.stringify(verified, null, 2));
