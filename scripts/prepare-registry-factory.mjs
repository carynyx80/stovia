import fs from "node:fs/promises";
import { createRequire } from "node:module";
const {
  createPublicClient,
  http,
  keccak256,
  stringToHex,
  concat,
  getCreate2Address,
} = createRequire(new URL("../packages/sdk/package.json", import.meta.url))(
  "viem",
);
const root = new URL("../", import.meta.url);
const original = JSON.parse(
  await fs.readFile(
    new URL("docs/registry-deployment-proposal.json", root),
    "utf8",
  ),
);
const factory = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
// Canonical Arachnid deterministic-deployment-proxy runtime, checked byte-for-byte.
const runtime =
  "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";
const client = createPublicClient({
  transport: http(
    process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  ),
});
if ((await client.getChainId()) !== 4663) throw Error("Wrong chain");
if ((await client.getCode({ address: factory })) !== runtime)
  throw Error("Factory runtime mismatch");
const salt = keccak256(
  stringToHex(
    "STOVIA_REGISTRY_4663_" +
      original.transaction.from.toLowerCase() +
      "_" +
      original.initcodeHash,
  ),
);
const data = concat([salt, original.transaction.data]);
const predictedBootstrap = getCreate2Address({
  from: factory,
  salt,
  bytecodeHash: original.initcodeHash,
});
const existing = await client.getCode({ address: predictedBootstrap });
if (existing && existing !== "0x")
  throw Error(
    "Registry infrastructure already deployed at " + predictedBootstrap,
  );
const request = {
  account: original.transaction.from,
  to: factory,
  data,
  value: 0n,
};
const result = await client.call(request);
if (result.data?.toLowerCase() !== predictedBootstrap.toLowerCase())
  throw Error("Factory returned unexpected address");
const gas = await client.estimateGas(request);
const proposal = {
  ...original,
  preparedAt: new Date().toISOString(),
  deploymentMode: "verified-create2-factory",
  factory: {
    address: factory,
    runtimeHash: keccak256(runtime),
    source: "https://github.com/Arachnid/deterministic-deployment-proxy",
  },
  salt,
  predictedBootstrap,
  transaction: { ...original.transaction, to: factory, data },
  transactionDataHash: keccak256(data),
  estimatedGas: gas.toString(),
};
await fs.writeFile(
  new URL("docs/registry-factory-proposal.json", root),
  JSON.stringify(proposal, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    factory,
    predictedBootstrap,
    estimatedGas: gas.toString(),
    simulation: "passed",
  }),
);
