import {
  keccak256,
  parseAbi,
  stringToHex,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
const getters = parseAbi([
  "function timelock() view returns(address)",
  "function registry() view returns(address)",
  "function eligibility() view returns(address)",
  "function getMinDelay() view returns(uint256)",
  "function hasRole(bytes32,address) view returns(bool)",
  "function getThreshold() view returns(uint256)",
  "function getOwners() view returns(address[])",
]);
export async function verifyRegistryDeployment(
  client: any,
  proposal: any,
  hash: Hex,
) {
  if ((await client.getChainId()) !== proposal.chainId)
    throw Error("Wrong chain");
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
  ]);
  if (
    receipt.status !== "success" ||
    !receipt.contractAddress ||
    tx.to ||
    tx.value !== 0n ||
    tx.from.toLowerCase() !== proposal.transaction.from.toLowerCase() ||
    tx.input !== proposal.transaction.data ||
    keccak256(tx.input) !== proposal.initcodeHash
  )
    throw Error("Receipt does not match the proposed registry deployment");
  const bootstrap = receipt.contractAddress as Address;
  const read = (address: Address, functionName: string, args: any[] = []) =>
    client.readContract({ address, abi: getters, functionName, args });
  const [timelock, registry, eligibility] = (await Promise.all(
    ["timelock", "registry", "eligibility"].map((name) =>
      read(bootstrap, name),
    ),
  )) as Address[];
  for (const address of [bootstrap, timelock, registry, eligibility]) {
    const code = await client.getCode({ address });
    if (!code || code === "0x") throw Error("Deployed contract code missing");
  }
  if ((await read(timelock, "getMinDelay")) !== BigInt(proposal.delaySeconds))
    throw Error("Timelock delay mismatch");
  const [owners, threshold] = await Promise.all([
    read(proposal.governance, "getOwners"),
    read(proposal.governance, "getThreshold"),
  ]);
  if (
    threshold !== BigInt(proposal.threshold) ||
    owners.length !== proposal.owners.length ||
    !proposal.owners.every((a: string) =>
      owners.some((b: string) => a.toLowerCase() === b.toLowerCase()),
    )
  )
    throw Error("Safe owner configuration changed");
  const role = (name: string) =>
    name ? keccak256(stringToHex(name)) : zeroHash;
  const required: [Address, string, Address][] = [
    [timelock, "", timelock],
    [timelock, "PROPOSER_ROLE", proposal.governance],
    [timelock, "EXECUTOR_ROLE", zeroAddress],
    [registry, "", timelock],
    [registry, "REVIEWER_ROLE", timelock],
    [registry, "PAUSER_ROLE", proposal.governance],
    [eligibility, "", timelock],
    [eligibility, "COMPLIANCE_ROLE", timelock],
  ];
  for (const [contract, name, account] of required)
    if (!(await read(contract, "hasRole", [role(name), account])))
      throw Error("Governance role verification failed: " + name);
  for (const contract of [timelock, registry, eligibility])
    if (
      (await read(contract, "hasRole", [
        zeroHash,
        proposal.transaction.from,
      ])) ||
      (await read(contract, "hasRole", [zeroHash, bootstrap]))
    )
      throw Error("Unexpected deployment admin role");
  return {
    status: "confirmed",
    chainId: proposal.chainId,
    transactionHash: hash,
    blockNumber: receipt.blockNumber.toString(),
    bootstrap,
    timelock,
    registry,
    eligibility,
    governance: proposal.governance,
    delaySeconds: proposal.delaySeconds,
    verifiedAt: new Date().toISOString(),
    stockApprovalsExecuted: false,
  };
}
