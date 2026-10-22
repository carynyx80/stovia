import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import {
  ownerSignatures,
  approvalPhase,
  safeScheduleArgs,
} from "../packages/sdk/stock-governance";
const { keccak256, stringToHex, decodeFunctionData, parseAbi, zeroAddress } =
  createRequire(new URL("../packages/sdk/package.json", import.meta.url))(
    "viem",
  );
const batch = JSON.parse(
  fs.readFileSync(
    new URL("../docs/stock-approval-batch.json", import.meta.url),
    "utf8",
  ),
);
test("approval evidence hash covers the exact recorded owner authorization and technical review", () => {
  const evidence = fs.readFileSync(
    new URL("../docs/stock-approval-evidence.json", import.meta.url),
    "utf8",
  );
  assert.equal(keccak256(stringToHex(evidence)), batch.evidenceHash);
  assert.equal(JSON.parse(evidence).assets.length, batch.assetCount);
});
test("batch enables scoped asset support before approving each exact registry asset; no attestations or transfers", () => {
  const abi = parseAbi([
    "function setAssetPolicy(address,bool,bytes32)",
    "function review(address,(address oracle,address eligibility,uint64 maxAge,uint8 decimals,bool approved,bool suspended,bytes32 evidenceHash,uint256 minPrice,uint256 maxPrice))",
  ]);
  assert.equal(batch.targets.length, batch.assetCount * 2);
  batch.assets.forEach((asset: any, i: number) => {
    const policy = decodeFunctionData({ abi, data: batch.payloads[i * 2] }),
      review = decodeFunctionData({ abi, data: batch.payloads[i * 2 + 1] });
    assert.equal(batch.targets[i * 2], batch.eligibility);
    assert.equal(batch.targets[i * 2 + 1], batch.registry);
    assert.equal(policy.functionName, "setAssetPolicy");
    assert.equal(review.functionName, "review");
    assert.equal(policy.args[0].toLowerCase(), asset.address.toLowerCase());
    assert.equal(policy.args[1], true);
    assert.equal(policy.args[2], batch.evidenceHash);
    assert.equal(review.args[0].toLowerCase(), asset.address.toLowerCase());
    const config = review.args[1];
    assert.equal(config.oracle.toLowerCase(), asset.oracle.toLowerCase());
    assert.equal(
      config.eligibility.toLowerCase(),
      batch.eligibility.toLowerCase(),
    );
    assert.equal(config.approved, true);
    assert.equal(config.suspended, false);
    assert.equal(config.evidenceHash, batch.evidenceHash);
    assert.equal(config.minPrice, BigInt(asset.minPrice));
    assert.equal(config.maxPrice, BigInt(asset.maxPrice));
    assert.equal(config.maxAge, BigInt(asset.maxAge));
    assert.equal(batch.values[i * 2], "0");
    assert.equal(batch.values[i * 2 + 1], "0");
  });
});
test("prevalidated Safe signatures contain both owner addresses in numeric order", () => {
  const signatures = ownerSignatures([...batch.owners].reverse()).slice(2);
  assert.equal(signatures.length, 260);
  [...batch.owners]
    .sort((a: string, b: string) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    )
    .forEach((owner: string, i: number) => {
      const signature = signatures.slice(i * 130, (i + 1) * 130);
      assert.equal(
        signature.slice(0, 64),
        "0".repeat(24) + owner.slice(2).toLowerCase(),
      );
      assert.equal(signature.slice(64, 128), "0".repeat(64));
      assert.equal(signature.slice(128), "01");
    });
});
test("Safe schedule is a zero-value CALL with no gas refund and nonce binding", () => {
  const args = safeScheduleArgs(batch, 7n);
  assert.equal(args[0], batch.timelock);
  assert.equal(args[1], 0n);
  assert.equal(args[2], batch.scheduleData);
  assert.equal(args[3], 0);
  assert.equal(args[6], 0n);
  assert.equal(args[7], zeroAddress);
  assert.equal(args[8], zeroAddress);
  assert.equal(args[9], 7n);
});
test("timelock phases distinguish missing, waiting, ready and done", () => {
  assert.equal(approvalPhase(0n, 100n), "not-scheduled");
  assert.equal(approvalPhase(1n, 100n), "executed");
  assert.equal(approvalPhase(101n, 100n), "waiting-for-timelock");
  assert.equal(approvalPhase(100n, 100n), "ready-to-execute");
});
