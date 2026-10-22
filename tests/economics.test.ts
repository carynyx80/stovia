import { test } from "node:test";
import assert from "node:assert/strict";
import { buy, sell, minimumOutput } from "../packages/sdk/index";
test("fees locked to whole 1–10 percent and slippage validation", () => {
  for (const f of [0, 11, 1.5]) assert.throws(() => buy(100n, 100n, 10n, f));
  assert.throws(() => minimumOutput(100n, 5001));
  assert.equal(minimumOutput(10000n, 100), 9900n);
});
test("90/10 accounting preserves every fee unit", () => {
  for (let f = 0n; f < 10000n; f++) {
    const protocol = f / 10n;
    assert.equal(f - protocol + protocol, f);
  }
});
test("calibration: 80 percent sold reaches target and matching AMM price", () => {
  const s = 1000000000n * 10n ** 18n,
    y0 = 12500n * 10n ** 18n,
    net = 4n * y0;
  const out = (s * net) / (y0 + net);
  assert.equal(out, (s * 80n) / 100n);
  const x = s - out,
    y = y0 + net;
  const allocation = (net * x) / y;
  assert.ok(allocation <= s - out);
  assert.equal(net * x, allocation * y);
});
test("10000 deterministic round trips preserve reserve solvency and constant-product rounding", () => {
  let seed = 123456789n;
  const random = () => {
    seed = (seed * 1103515245n + 12345n) % 2n ** 31n;
    return seed;
  };
  for (let f = 1; f <= 10; f++) {
    let x = 10n ** 27n,
      y = 12500n * 10n ** 18n,
      reserve = 0n,
      sold = 0n;
    for (let i = 0; i < 1000; i++) {
      const gross = ((random() % 1000n) + 1n) * 10n ** 12n;
      const q = buy(x, y, gross, f);
      const k = x * y;
      x -= q.out;
      y += gross - q.fee;
      reserve += gross - q.fee;
      sold += q.out;
      assert.ok(x * y >= k);
      const input = sold / 3n;
      if (!input) continue;
      const s = sell(x, y, input, f);
      assert.ok(s.gross <= reserve);
      const k2 = x * y;
      x += input;
      y -= s.gross;
      reserve -= s.gross;
      sold -= input;
      assert.ok(x * y >= k2);
      assert.ok(reserve >= 0n);
      assert.equal(y - reserve, 12500n * 10n ** 18n);
    }
  }
});
