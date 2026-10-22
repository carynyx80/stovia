"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  usePublicClient,
} from "wagmi";
import { parseAbi, formatUnits, type Address } from "viem";
import { ShieldCheck, ArrowUpRight, Wallet } from "lucide-react";
const tokenAbi = parseAbi([
  "function name() view returns(string)",
  "function symbol() view returns(string)",
  "function balanceOf(address) view returns(uint256)",
  "function decimals() view returns(uint8)",
]);
const vaultAbi = parseAbi([
  "function getClaimableFees(address creator,address token) view returns(uint256)",
  "function claimFees(address token)",
  "function claimMultiple(address[] tokens)",
]);
function Record({
  launch,
  vault,
  mode,
  transactions,
}: {
  launch: any;
  vault?: Address;
  mode: string;
  transactions: boolean;
}) {
  const { address } = useAccount(),
    client = usePublicClient({ chainId: 4663 }),
    { writeContractAsync } = useWriteContract();
  const [message, setMessage] = useState("");
  const { data: name } = useReadContract({
    address: launch.token,
    abi: tokenAbi,
    functionName: "name",
    chainId: 4663,
  });
  const { data: symbol } = useReadContract({
    address: launch.token,
    abi: tokenAbi,
    functionName: "symbol",
    chainId: 4663,
  });
  const { data: balance } = useReadContract({
    address: launch.token,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: 4663,
    query: { enabled: !!address },
  });
  const { data: decimals } = useReadContract({
    address: launch.quote,
    abi: tokenAbi,
    functionName: "decimals",
    chainId: 4663,
  });
  const { data: quoteSymbol } = useReadContract({
    address: launch.quote,
    abi: tokenAbi,
    functionName: "symbol",
    chainId: 4663,
  });
  const { data: claimable, refetch } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "getClaimableFees",
    args: address ? [address, launch.token] : undefined,
    chainId: 4663,
    query: { enabled: !!vault && !!address && mode === "creators" },
  });
  async function claim() {
    try {
      if (!vault || !client || !transactions)
        throw Error("Claims unavailable until release approval");
      const hash = await writeContractAsync({
        address: vault,
        abi: vaultAbi,
        functionName: "claimFees",
        args: [launch.token],
        chainId: 4663,
      });
      setMessage("Submitted: " + hash);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw Error("Claim reverted");
      setMessage("Claim confirmed: " + hash);
      refetch();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Claim failed");
    }
  }
  return (
    <article className="market-card">
      <div className="eyebrow">
        {symbol || launch.token.slice(0, 10)} / {quoteSymbol || "STOCK"}
      </div>
      <h2>{name || "Onchain token"}</h2>
      <p className="muted">
        Creator fee {launch.feePercent}% · Permanently locked
      </p>
      <code>
        {launch.token.slice(0, 10)}…{launch.token.slice(-6)}
      </code>
      {mode === "portfolio" && (
        <p>
          Wallet balance:{" "}
          {balance === undefined ? "Unavailable" : formatUnits(balance, 18)}{" "}
          {symbol}
        </p>
      )}
      {mode === "creators" && (
        <>
          <p>
            Claimable:{" "}
            {claimable === undefined
              ? "Unavailable"
              : formatUnits(claimable, decimals ?? 18)}{" "}
            {quoteSymbol}
          </p>
          <button
            className="secondary"
            disabled={!transactions || !claimable}
            onClick={claim}
          >
            Claim fees
          </button>
        </>
      )}
      <Link className="text-link" href={"/token/" + launch.token}>
        View market <ArrowUpRight size={14} />
      </Link>
      {message && (
        <p role="status" style={{ wordBreak: "break-word" }}>
          {message}
        </p>
      )}
    </article>
  );
}
export default function Records({
  mode,
  filter = "",
  query = "",
}: {
  mode: string;
  filter?: string;
  query?: string;
}) {
  const { address } = useAccount();
  const [data, setData] = useState<any>(null),
    [status, setStatus] = useState<any>(null);
  useEffect(() => {
    let dead = false;
    const load = () =>
      Promise.all([
        fetch(
          "/api/markets" +
            (mode === "creators" && address ? "?creator=" + address : ""),
        ).then((r) => r.json()),
        fetch("/api/status").then((r) => r.json()),
      ]).then(([d, s]) => {
        if (!dead) {
          setData(d);
          setStatus(s);
        }
      });
    load().catch(() => {});
    const timer = setInterval(load, 15000);
    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, [mode, address]);
  if (!data?.launches?.length) return null;
  if ((mode === "creators" || mode === "portfolio") && !address) return null;
  let launches = data.launches.filter(
    (l: any) =>
      l.token.toLowerCase().includes(query.toLowerCase()) ||
      l.creator.toLowerCase().includes(query.toLowerCase()),
  );
  if (mode === "graduated" || filter === "Recently graduated")
    launches = launches.filter((l: any) =>
      data.graduations.some((g: any) => g.token === l.token),
    );
  if (
    mode === "leaderboard" ||
    filter === "Highest volume" ||
    filter === "Top gainers" ||
    filter === "Trending" ||
    filter === "Near graduation"
  )
    return (
      <div className="callout">
        Ranking requires verified historical USD prices or live reserve
        snapshots. Indexed launches are available under New launches.
      </div>
    );
  if (false) {
    const volumes = new Map<string, bigint>();
    for (const t of data.trades)
      volumes.set(
        t.market,
        (volumes.get(t.market) || 0n) + BigInt(t.quoteAmount),
      );
    launches.sort((a: any, b: any) =>
      Number((volumes.get(b.market) || 0n) - (volumes.get(a.market) || 0n)),
    );
  }
  return (
    <div className="records-grid">
      {launches.map((l: any) => (
        <Record
          key={l.token}
          launch={l}
          mode={mode}
          vault={status?.contracts.vault}
          transactions={status?.transactionUI}
        />
      ))}
    </div>
  );
}
