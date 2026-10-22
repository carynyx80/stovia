import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../packages/sdk/package.json", import.meta.url),
);
const {
  createPublicClient,
  http,
  encodeFunctionData,
  parseAbi,
  getAddress,
  keccak256,
  zeroAddress,
} = require("viem");
const root = new URL("../", import.meta.url);
const config = JSON.parse(
  await fs.readFile(new URL("config/mainnet-proposal.json", root), "utf8"),
);
const records = JSON.parse(
  await fs.readFile(
    new URL("config/safe-deployment-records.json", root),
    "utf8",
  ),
);
const client = createPublicClient({
  transport: http(
    process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  ),
});
if ((await client.getChainId()) !== 4663) throw Error("Wrong chain");
const owners = config.proposedGovernance.owners.map((a) => getAddress(a)),
  threshold = config.proposedGovernance.threshold;
if (
  new Set(owners).size !== owners.length ||
  threshold < 2 ||
  threshold > owners.length
)
  throw Error("Invalid multisig owners/threshold");
const verified = {};
for (const [name, entry] of Object.entries(records.contracts)) {
  const code = await client.getCode({ address: entry.address });
  if (!code || keccak256(code) !== entry.codeHash)
    throw Error("Official runtime code mismatch: " + name);
  verified[name] = { ...entry, verified: true };
}
const setupAbi = parseAbi([
  "function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)",
]);
const initializer = encodeFunctionData({
  abi: setupAbi,
  functionName: "setup",
  args: [
    owners,
    BigInt(threshold),
    zeroAddress,
    "0x",
    verified.compatibility_fallback_handler.address,
    zeroAddress,
    0n,
    zeroAddress,
  ],
});
const abi = parseAbi([
  "function createProxyWithNonce(address singleton,bytes initializer,uint256 saltNonce) returns(address proxy)",
]);
const factory = verified.safe_proxy_factory.address,
  singleton = verified.safe_l2.address,
  saltNonce = BigInt(config.proposedGovernance.saltNonce);
const args = [singleton, initializer, saltNonce];
const data = encodeFunctionData({
  abi,
  functionName: "createProxyWithNonce",
  args,
});
const simulation = await client.simulateContract({
  address: factory,
  abi,
  functionName: "createProxyWithNonce",
  args,
  account: config.deploymentWallet,
});
const predicted = simulation.result;
const existing = await client.getCode({ address: predicted });
if (existing && existing !== "0x")
  throw Error(
    "Predicted Safe already deployed; inspect it instead of submitting",
  );
let gas = null,
  maxFeePerGas = null,
  estimateError = null;
try {
  gas = await client.estimateContractGas({
    address: factory,
    abi,
    functionName: "createProxyWithNonce",
    args,
    account: config.deploymentWallet,
  });
  const fees = await client.estimateFeesPerGas();
  maxFeePerGas = fees.maxFeePerGas ?? fees.gasPrice;
} catch (e) {
  estimateError = e.shortMessage || e.message;
}
const output = {
  status: "unsigned-not-deployed",
  chainId: 4663,
  preparedAt: new Date().toISOString(),
  owners,
  threshold,
  safeVersion: records.safeVersion,
  officialRuntimeContracts: verified,
  predictedSafeAddress: predicted,
  transaction: {
    from: getAddress(config.deploymentWallet),
    to: factory,
    value: "0",
    data,
  },
  estimatedGas: gas?.toString() ?? null,
  maxFeePerGas: maxFeePerGas?.toString() ?? null,
  estimatedMaxGasCostWei:
    gas && maxFeePerGas ? (gas * maxFeePerGas).toString() : null,
  estimateError,
  disclosure:
    "Deploys a 2-of-2 Safe with no modules, no setup delegatecall and no payment. Does not deploy Stovia or approve any stocks. Wallet signing is required. Prediction and simulation are not a deployment receipt.",
};
await fs.writeFile(
  new URL("docs/governance-safe-proposal.json", root),
  JSON.stringify(output, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: output.status,
    predictedSafeAddress: predicted,
    threshold,
    estimatedGas: output.estimatedGas,
    estimateError,
  }),
);
