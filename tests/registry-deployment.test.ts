import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { keccak256, zeroHash, concat, getCreate2Address } = createRequire(
  new URL("../packages/sdk/package.json", import.meta.url),
)("viem");
import { verifyRegistryDeployment } from "../packages/sdk/verify-registry";
const addr = (n: number) =>
  ("0x" + n.toString(16).padStart(40, "0")) as `0x${string}`;
const hash = ("0x" + "11".repeat(32)) as `0x${string}`;
const data = "0x1234" as const;
const proposal = {
  chainId: 4663,
  transaction: { from: addr(1), data },
  initcodeHash: keccak256(data),
  governance: addr(2),
  owners: [addr(1), addr(3)],
  threshold: 2,
  delaySeconds: 172800,
};
function mock(overrides: any = {}) {
  return {
    getChainId: async () => 4663,
    getTransaction: async () => ({
      from: addr(1),
      to: null,
      value: 0n,
      input: data,
    }),
    getTransactionReceipt: async () => ({
      status: "success",
      contractAddress: addr(4),
      blockNumber: 100n,
    }),
    getCode: async () => "0x1234",
    readContract: async ({ functionName, args, address }: any) => {
      if (functionName === "getOwners") return proposal.owners;
      if (functionName === "getThreshold") return 2n;
      if (functionName === "getMinDelay") return 172800n;
      if (functionName === "hasRole")
        return !(args[0] === zeroHash && [addr(1), addr(4)].includes(args[1]));
      return (
        { timelock: addr(5), registry: addr(6), eligibility: addr(7) } as any
      )[functionName];
    },
    ...overrides,
  };
}
test("confirms exact zero-value deployment and verifies governance controls", async () => {
  const result = await verifyRegistryDeployment(mock(), proposal, hash);
  assert.equal(result.registry, addr(6));
  assert.equal(result.stockApprovalsExecuted, false);
});
test("rejects unrelated calldata and reverted receipts", async () => {
  await assert.rejects(
    verifyRegistryDeployment(
      mock({
        getTransaction: async () => ({
          from: addr(1),
          to: null,
          value: 0n,
          input: "0xabcd",
        }),
      }),
      proposal,
      hash,
    ),
  );
  await assert.rejects(
    verifyRegistryDeployment(
      mock({ getTransactionReceipt: async () => ({ status: "reverted" }) }),
      proposal,
      hash,
    ),
  );
});
test("rejects wrong chain, missing code and altered delay", async () => {
  await assert.rejects(
    verifyRegistryDeployment(
      mock({ getChainId: async () => 1 }),
      proposal,
      hash,
    ),
  );
  await assert.rejects(
    verifyRegistryDeployment(
      mock({ getCode: async () => "0x" }),
      proposal,
      hash,
    ),
  );
  const client = mock();
  const read = client.readContract;
  client.readContract = async (args: any) =>
    args.functionName === "getMinDelay" ? 0n : read(args);
  await assert.rejects(verifyRegistryDeployment(client, proposal, hash));
});

test("verifies factory deployment calldata, runtime and deterministic address", async () => {
  const factory = addr(10),
    salt = hash,
    runtime = "0x1234";
  const predictedBootstrap = getCreate2Address({
    from: factory,
    salt,
    bytecodeHash: proposal.initcodeHash,
  });
  const calldata = concat([salt, data]);
  const factoryProposal = {
    ...proposal,
    transaction: { ...proposal.transaction, to: factory, data: calldata },
    transactionDataHash: keccak256(calldata),
    factory: { address: factory, runtimeHash: keccak256(runtime) },
    salt,
    predictedBootstrap,
  };
  const client = mock({
    getTransaction: async () => ({
      from: addr(1),
      to: factory,
      value: 0n,
      input: calldata,
    }),
    getTransactionReceipt: async () => ({
      status: "success",
      contractAddress: null,
      blockNumber: 100n,
    }),
  });
  const read = client.readContract;
  client.readContract = async (args: any) =>
    args.functionName === "hasRole" &&
    args.args[0] === zeroHash &&
    args.args[1] === predictedBootstrap
      ? false
      : read(args);
  assert.equal(
    (await verifyRegistryDeployment(client, factoryProposal, hash)).bootstrap,
    predictedBootstrap,
  );
  await assert.rejects(
    verifyRegistryDeployment(
      client,
      { ...factoryProposal, predictedBootstrap: addr(99) },
      hash,
    ),
  );
  await assert.rejects(
    verifyRegistryDeployment(
      client,
      {
        ...factoryProposal,
        factory: { address: factory, runtimeHash: zeroHash },
      },
      hash,
    ),
  );
});
