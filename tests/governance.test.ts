import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const sdkRequire = createRequire(
  new URL("../packages/sdk/package.json", import.meta.url),
);
const { decodeFunctionData, parseAbi, zeroAddress } = sdkRequire("viem");
const proposal = JSON.parse(
  readFileSync(
    new URL("../docs/governance-safe-proposal.json", import.meta.url),
    "utf8",
  ),
);
test("unsigned governance proposal uses verified Safe factory and charges no native payment", () => {
  assert.equal(proposal.chainId, 4663);
  assert.equal(proposal.status, "unsigned-not-deployed");
  assert.equal(proposal.transaction.value, "0");
  assert.equal(
    proposal.transaction.to.toLowerCase(),
    proposal.officialRuntimeContracts.safe_proxy_factory.address.toLowerCase(),
  );
});
test("Safe initializer has exactly the requested owners, 2-of-2 threshold, and no setup delegatecall or payment", () => {
  const factory = decodeFunctionData({
    abi: parseAbi([
      "function createProxyWithNonce(address singleton,bytes initializer,uint256 saltNonce) returns(address proxy)",
    ]),
    data: proposal.transaction.data,
  });
  assert.equal(factory.functionName, "createProxyWithNonce");
  assert.equal(
    factory.args[0].toLowerCase(),
    proposal.officialRuntimeContracts.safe_l2.address.toLowerCase(),
  );
  const setup = decodeFunctionData({
    abi: parseAbi([
      "function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)",
    ]),
    data: factory.args[1],
  });
  const [
    owners,
    threshold,
    to,
    data,
    fallback,
    paymentToken,
    payment,
    paymentReceiver,
  ] = setup.args;
  assert.deepEqual(
    owners.map((a: string) => a.toLowerCase()),
    proposal.owners.map((a: string) => a.toLowerCase()),
  );
  assert.equal(new Set(owners).size, 2);
  assert.equal(threshold, 2n);
  assert.equal(to, zeroAddress);
  assert.equal(data, "0x");
  assert.equal(
    fallback.toLowerCase(),
    proposal.officialRuntimeContracts.compatibility_fallback_handler.address.toLowerCase(),
  );
  assert.equal(paymentToken, zeroAddress);
  assert.equal(payment, 0n);
  assert.equal(paymentReceiver, zeroAddress);
});
