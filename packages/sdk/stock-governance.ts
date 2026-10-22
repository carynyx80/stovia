import {
  parseAbi,
  concat,
  pad,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
export const safeApprovalAbi = parseAbi([
  "function nonce() view returns(uint256)",
  "function getOwners() view returns(address[])",
  "function getThreshold() view returns(uint256)",
  "function approvedHashes(address owner,bytes32 hash) view returns(uint256)",
  "function approveHash(bytes32 hashToApprove)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns(bytes32)",
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns(bool success)",
]);
export const approvalTimelockAbi = parseAbi([
  "function getTimestamp(bytes32 id) view returns(uint256)",
  "function getMinDelay() view returns(uint256)",
  "function hasRole(bytes32 role,address account) view returns(bool)",
]);
export function safeScheduleArgs(batch: any, nonce: bigint) {
  return [
    batch.timelock as Address,
    0n,
    batch.scheduleData as Hex,
    0,
    0n,
    0n,
    0n,
    zeroAddress,
    zeroAddress,
    nonce,
  ] as const;
}
export function ownerSignatures(owners: readonly string[]) {
  return concat(
    [...owners]
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map((owner) =>
        concat([
          pad(owner as Address, { size: 32 }),
          pad("0x00", { size: 32 }),
          toHex(1, { size: 1 }),
        ]),
      ),
  );
}
export function approvalPhase(timestamp: bigint, now: bigint) {
  return timestamp === 0n
    ? "not-scheduled"
    : timestamp === 1n
      ? "executed"
      : timestamp > now
        ? "waiting-for-timelock"
        : "ready-to-execute";
}
