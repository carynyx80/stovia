import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../packages/sdk/package.json", import.meta.url),
);
const {
  createPublicClient,
  http,
  encodeDeployData,
  parseAbi,
  keccak256,
} = require("viem");
const root = new URL("../", import.meta.url);
const config = JSON.parse(
  await fs.readFile(new URL("config/mainnet-proposal.json", root), "utf8"),
);
if (config.stockRegistry)
  throw Error("Registry already configured; refusing duplicate proposal");
const artifact = JSON.parse(
  await fs.readFile(
    new URL("packages/contracts/artifacts/RegistryBootstrap.json", root),
    "utf8",
  ),
);
const client = createPublicClient({
  transport: http(
    process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  ),
});
if ((await client.getChainId()) !== 4663) throw Error("Wrong chain");
const abi = parseAbi([
  "function getOwners() view returns(address[])",
  "function getThreshold() view returns(uint256)",
]);
const [owners, threshold] = await Promise.all(
  ["getOwners", "getThreshold"].map((functionName) =>
    client.readContract({
      address: config.governanceMultisig,
      abi,
      functionName,
    }),
  ),
);
if (
  threshold !== 2n ||
  owners.length !== 2 ||
  !config.proposedGovernance.owners.every((o) =>
    owners.some((a) => a.toLowerCase() === o.toLowerCase()),
  )
)
  throw Error("Governance configuration mismatch");
const data = encodeDeployData({
  abi: artifact.abi,
  bytecode: "0x" + artifact.evm.bytecode.object,
  args: [config.governanceMultisig],
});
if ((data.length - 2) / 2 > 49152) throw Error("Initcode too large");
await client.call({ account: config.deploymentWallet, data, value: 0n });
const gas = await client.estimateGas({
  account: config.deploymentWallet,
  data,
  value: 0n,
});
const proposal = {
  chainId: 4663,
  status: "unsigned",
  preparedAt: new Date().toISOString(),
  governance: config.governanceMultisig,
  owners,
  threshold: Number(threshold),
  delaySeconds: 172800,
  transaction: { from: config.deploymentWallet, data, value: "0" },
  initcodeHash: keccak256(data),
  estimatedGas: gas.toString(),
  auditStatus: "not-independently-audited",
  scope:
    "Deploy TimelockController, StockRegistry and ReviewedEligibility. Approves zero assets. No factory or trading deployment.",
  remainingRequirements: [
    "Independent contract security review",
    "Per-asset verified oracle integration and price bounds",
    "Issuer/compliance evidence and scoped eligibility attestations",
    "Both governance signatures to schedule approvals",
    "Two-day timelock before approval execution",
  ],
};
await fs.writeFile(
  new URL("docs/registry-deployment-proposal.json", root),
  JSON.stringify(proposal, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: proposal.status,
    estimatedGas: proposal.estimatedGas,
    initcodeHash: proposal.initcodeHash,
    initcodeBytes: (data.length - 2) / 2,
  }),
);
