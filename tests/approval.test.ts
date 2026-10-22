import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalSummary, type RegistryAsset } from "../packages/sdk/approval";
const asset: RegistryAsset = [
  "0xoracle",
  "0xeligibility",
  3600n,
  18,
  true,
  false,
  "0xevidence",
  1n,
  100n,
];
test("missing registry reads never become approvals", () =>
  assert.deepEqual(approvalSummary(undefined, true), {
    approvalStatus: "unavailable",
    approved: false,
    oracleHealthy: null,
    canLaunch: false,
  }));
test("unapproved assets cannot launch even with a healthy oracle", () => {
  const x = [...asset] as unknown as any[];
  x[4] = false;
  const status = approvalSummary(x as unknown as RegistryAsset, true);
  assert.equal(status.approved, false);
  assert.equal(status.canLaunch, false);
});
test("suspended assets cannot launch", () => {
  const x = [...asset] as unknown as any[];
  x[5] = true;
  assert.equal(
    approvalSummary(x as unknown as RegistryAsset, true).approvalStatus,
    "suspended",
  );
  assert.equal(
    approvalSummary(x as unknown as RegistryAsset, true).canLaunch,
    false,
  );
});
test("oracle failure does not rewrite governance approval but blocks launch", () => {
  const status = approvalSummary(asset, false);
  assert.equal(status.approved, true);
  assert.equal(status.canLaunch, false);
});
test("launch readiness requires a confirmed approval and healthy oracle", () => {
  assert.equal(approvalSummary(asset, null).canLaunch, false);
  assert.equal(approvalSummary(asset, true).canLaunch, true);
});
