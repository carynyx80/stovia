"use client";
import { useState, useEffect, useRef } from "react";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import {
  parseAbi,
  formatUnits,
  parseUnits,
  isAddress,
  type Address,
} from "viem";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  type UTCTimestamp,
} from "lightweight-charts";
import { ArrowUpRight, ShieldCheck, ExternalLink } from "lucide-react";
const marketAbi = parseAbi([
  "function quoteBuy(uint256 gross) view returns(uint256 out,uint256 fee)",
  "function quoteSell(uint256 input) view returns(uint256 net,uint256 fee)",
  "function buy(uint256 gross,uint256 minOut,uint256 deadline) returns(uint256)",
  "function sell(uint256 input,uint256 minOut,uint256 deadline) returns(uint256)",
  "function realQuote() view returns(uint256)",
  "function graduated() view returns(bool)",
]);
const erc20 = parseAbi([
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
]);
export default function Trade({ address: token }: { address: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [side, setSide] = useState<"buy" | "sell">("buy"),
    [amount, setAmount] = useState(""),
    [slippage, setSlippage] = useState("1"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const { address, chainId } = useAccount(),
    client = usePublicClient({ chainId: 4663 }),
    { writeContractAsync } = useWriteContract(),
    { switchChainAsync } = useSwitchChain();
  const chartEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false;
    const run = () =>
      fetch("/api/markets/" + token)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw Error(d.error);
          if (!dead) setData(d);
        })
        .catch((e) => !dead && setError(e.message));
    run();
    const timer = setInterval(run, 15000);
    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, [token]);
  const market = data?.launch?.market as Address | undefined,
    stock = data?.launch?.quote as Address | undefined;
  const inputToken = side === "buy" ? stock : (token as Address);
  const { data: decimals } = useReadContract({
    address: inputToken,
    abi: erc20,
    functionName: "decimals",
    chainId: 4663,
    query: { enabled: !!market },
  });
  const { data: symbol } = useReadContract({
    address: inputToken,
    abi: erc20,
    functionName: "symbol",
    chainId: 4663,
    query: { enabled: !!market },
  });
  const { data: balance } = useReadContract({
    address: inputToken,
    abi: erc20,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: 4663,
    query: { enabled: !!market && !!address },
  });
  let input = 0n;
  try {
    input = parseUnits(amount || "0", decimals ?? 18);
  } catch {}
  const { data: quote } = useReadContract({
    address: market,
    abi: marketAbi,
    functionName: side === "buy" ? "quoteBuy" : "quoteSell",
    args: [input],
    chainId: 4663,
    query: { enabled: !!market && input > 0n, refetchInterval: 10000 },
  });
  const { data: reserve } = useReadContract({
    address: market,
    abi: marketAbi,
    functionName: "realQuote",
    chainId: 4663,
    query: { enabled: !!market },
  });
  useEffect(() => {
    if (!chartEl.current || !data?.candles?.length) return;
    const c = createChart(chartEl.current, {
      height: 340,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#646777",
      },
      grid: {
        vertLines: { color: "#e6e4df" },
        horzLines: { color: "#e6e4df" },
      },
    });
    const series = c.addSeries(CandlestickSeries, {
      upColor: "#3159d8",
      downColor: "#cf4b31",
      wickUpColor: "#3159d8",
      wickDownColor: "#cf4b31",
      borderUpColor: "#3159d8",
      borderDownColor: "#cf4b31",
      borderVisible: false,
    });
    series.setData(
      data.candles.map((v: any) => ({
        time: Math.floor(
          new Date(v.timestamp).getTime() / 1000,
        ) as UTCTimestamp,
        open: Number(v.open),
        high: Number(v.high),
        low: Number(v.low),
        close: Number(v.close),
      })),
    );
    c.timeScale().fitContent();
    return () => c.remove();
  }, [data]);
  async function trade() {
    if (!client || !address || !market || !inputToken || !quote || input <= 0n)
      return;
    try {
      setBusy(true);
      if (!data.transactionUI)
        throw Error(
          "Transactions disabled pending production readiness approval",
        );
      const bps = Number(slippage) * 100;
      if (!Number.isInteger(bps) || bps < 0 || bps > 5000)
        throw Error("Slippage must be between 0 and 50 percent");
      if (chainId !== 4663) await switchChainAsync({ chainId: 4663 });
      const allowance = await client.readContract({
        address: inputToken,
        abi: erc20,
        functionName: "allowance",
        args: [address, market],
      });
      if (allowance < input) {
        if (allowance > 0n) {
          setMessage("Confirm allowance reset");
          await client.waitForTransactionReceipt({
            hash: await writeContractAsync({
              address: inputToken,
              abi: erc20,
              functionName: "approve",
              args: [market, 0n],
              chainId: 4663,
            }),
          });
        }
        setMessage("Confirm exact-amount approval");
        const a = await writeContractAsync({
          address: inputToken,
          abi: erc20,
          functionName: "approve",
          args: [market, input],
          chainId: 4663,
        });
        const receipt = await client.waitForTransactionReceipt({ hash: a });
        if (receipt.status !== "success") throw Error("Approval reverted");
      }
      const min = (quote[0] * BigInt(10000 - bps)) / 10000n;
      const args = [
        input,
        min,
        BigInt(Math.floor(Date.now() / 1000) + 300),
      ] as const;
      await client.simulateContract({
        address: market,
        abi: marketAbi,
        functionName: side,
        args,
        account: address,
      });
      setMessage("Confirm trade in your wallet");
      const hash = await writeContractAsync({
        address: market,
        abi: marketAbi,
        functionName: side,
        args,
        chainId: 4663,
      });
      setMessage("Submitted: " + hash);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw Error("Transaction reverted");
      setMessage("Confirmed onchain: " + hash);
      setAmount("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="subpage">
        <h1>Market terminal.</h1>
        <div className="panel">
          <h2>{error || "Loading verified market…"}</h2>
          <p className="muted">
            No chart or price is shown without indexed transactions.
          </p>
        </div>
      </section>
    );
  return (
    <section className="subpage">
      <div className="eyebrow">VERIFIED ONCHAIN MARKET</div>
      <h1>{data.launch.token.slice(0, 10)}…</h1>
      <p className="muted">
        Stock-backed quote: {stock} · Permanent creator fee:{" "}
        {data.launch.feePercent}%
      </p>
      <div className="create-layout">
        <div>
          <div className="panel">
            <h2>Price history</h2>
            <small>
              Stock raw units / launch-token raw unit · 1 minute candles
            </small>
            <div ref={chartEl} />
            {!data.candles.length && (
              <p className="muted">
                No indexed trades yet. Candles will appear after confirmed
                activity.
              </p>
            )}
          </div>
          <div className="panel" style={{ marginTop: 20 }}>
            <h2>Recent trades</h2>
            {data.trades.map((t: any) => (
              <div className="trade-row" key={t.id}>
                <span>{t.side}</span>
                <code>{t.trader.slice(0, 10)}…</code>
                <span>{formatUnits(BigInt(t.tokenAmount), 18)} tokens</span>
              </div>
            ))}
          </div>
          <div className="panel" style={{ marginTop: 20 }}>
            <h2>Top holders</h2>
            {data.holders?.map((h: any) => (
              <div className="trade-row" key={h.wallet}>
                <code>{h.wallet}</code>
                <span>{formatUnits(BigInt(h.balance), 18)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel summary">
          <div className="tabs">
            {(["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                className={side === s ? "selected" : ""}
                onClick={() => setSide(s)}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="muted">
            Pay with {symbol || "stock token"} · ETH route unavailable
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              trade();
            }}
          >
            <label>
              Amount
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <div className="tabs">
              {[25, 50, 75, 100].map((p) => (
                <button
                  type="button"
                  key={p}
                  disabled={balance === undefined}
                  onClick={() =>
                    setAmount(
                      formatUnits(
                        ((balance || 0n) * BigInt(p)) / 100n,
                        decimals ?? 18,
                      ),
                    )
                  }
                >
                  {p}%
                </button>
              ))}
            </div>
            <label>
              Slippage %
              <input
                type="number"
                min="0"
                max="50"
                step="0.1"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
              />
            </label>
            <p className="muted">
              Creator fee: {data.launch.feePercent}% · 90/10 split
              <br />
              Estimated output:{" "}
              {quote
                ? formatUnits(quote[0], side === "buy" ? 18 : (decimals ?? 18))
                : "—"}
              <br />
              Network gas: estimated by wallet before signing
              <br />
              Real quote reserves: {reserve?.toString() || "—"} raw units
            </p>
            <button
              className="primary"
              disabled={
                busy || !address || !data.transactionUI || !quote || input <= 0n
              }
            >
              {!address
                ? "Connect wallet to trade"
                : !data.transactionUI
                  ? "Awaiting release approval"
                  : busy
                    ? "Confirming…"
                    : side === "buy"
                      ? "Buy token"
                      : "Sell token"}
              <ArrowUpRight size={15} />
            </button>
          </form>
          {message && (
            <p
              role="status"
              className="muted"
              style={{ wordBreak: "break-word" }}
            >
              {message}
            </p>
          )}
          <a
            className="text-link"
            href={"https://robinhoodchain.blockscout.com/address/" + market}
            target="_blank"
            rel="noreferrer"
          >
            View market contract <ExternalLink size={14} />
          </a>
        </div>
      </div>
      <div className="callout">
        <ShieldCheck size={18} /> Launch tokens do not confer company equity.
        Issuer eligibility, oracle, liquidity and smart contract risks apply.
      </div>
    </section>
  );
}
