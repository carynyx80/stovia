import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { verifyRegistryDeployment } from "../packages/sdk/verify-registry";
const { createPublicClient, http, isHash } = createRequire(
  new URL("../packages/sdk/package.json", import.meta.url),
)("viem");
const hash = process.argv[2];
if (!isHash(hash || "")) throw Error("Transaction hash required");
const root = new URL("../", import.meta.url);
const client = createPublicClient({
  transport: http(
    process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  ),
});
const tx = await client.getTransaction({ hash });
const proposal = JSON.parse(
  await fs.readFile(
    new URL(
      tx.to
        ? "docs/registry-factory-proposal.json"
        : "docs/registry-deployment-proposal.json",
      root,
    ),
    "utf8",
  ),
);
const confirmation = await verifyRegistryDeployment(
  client,
  proposal,
  hash as `0x${string}`,
);
const path = new URL("config/mainnet-proposal.json", root),
  config = JSON.parse(await fs.readFile(path, "utf8"));
if (
  config.stockRegistry &&
  config.stockRegistry.toLowerCase() !== confirmation.registry.toLowerCase()
)
  throw Error("Existing registry conflict");
await fs.writeFile(
  new URL("config/registry-confirmation.json", root),
  JSON.stringify(confirmation, null, 2) + "\n",
);
Object.assign(config, {
  stockRegistry: confirmation.registry,
  timelock: confirmation.timelock,
  eligibility: confirmation.eligibility,
  registryDeploymentTransaction: hash,
  status: "registry-deployed-assets-pending",
  authorization:
    "User signed registry infrastructure deployment. Exact calldata, factory and governance controls verified. No stock approvals executed.",
});
await fs.writeFile(path, JSON.stringify(config, null, 2) + "\n");
console.log(JSON.stringify(confirmation, null, 2));
