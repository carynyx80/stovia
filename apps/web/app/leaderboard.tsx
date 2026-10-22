"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export default function Leaderboard() {
  const [data, setData] = useState<any>(null),
    [tab, setTab] = useState("Most traded"),
    [quote, setQuote] = useState("");
  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then(setData)
      .catch(() =>
        setData({
          error: "Rankings unavailable",
          markets: [],
          creators: [],
          graduations: [],
        }),
      );
  }, []);
  const markets = data?.markets || [];
  const quotes = [...new Set<string>(markets.map((m: any) => m.quote))];
  let rows =
    tab === "Successful launches"
      ? data?.creators || []
      : tab === "Recently graduated"
        ? data?.graduations || []
        : markets;
  if (tab === "Trading volume" || tab === "Creator fees") {
    rows = rows.filter((m: any) => m.quote === (quote || quotes[0]));
    const key = tab === "Trading volume" ? "volume" : "earnings";
    rows = [...rows].sort((a: any, b: any) =>
      BigInt(a[key]) === BigInt(b[key])
        ? 0
        : BigInt(a[key]) > BigInt(b[key])
          ? -1
          : 1,
    );
  }
  return (
    <section className="subpage">
      <div className="eyebrow">VERIFIED ACTIVITY</div>
      <h1>Conviction, measured.</h1>
      <p className="muted">
        Rankings derive from confirmed indexed events. Fee and volume rankings
        compare one quote asset at a time. No volume-based rewards are offered.
      </p>
      <div className="tabs">
        {[
          "Most traded",
          "Successful launches",
          "Trading volume",
          "Creator fees",
          "Recently graduated",
          "Top performing",
        ].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab === t ? "selected" : ""}
          >
            {t}
          </button>
        ))}
      </div>
      {(tab === "Trading volume" || tab === "Creator fees") && (
        <label className="directory-search">
          Quote asset
          <select
            value={quote || quotes[0] || ""}
            onChange={(e) => setQuote(e.target.value)}
          >
            {quotes.map((q) => (
              <option value={q} key={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="panel" style={{ marginTop: 20 }}>
        {tab === "Top performing" ? (
          <p className="muted">
            Performance rankings require complete historical price coverage and
            a defined comparison window. This category is unavailable.
          </p>
        ) : !rows.length ? (
          <>
            <h2>{data?.error || "Awaiting indexed activity"}</h2>
            <p className="muted">
              No synthetic ranking or trading volume is displayed.
            </p>
          </>
        ) : (
          rows.map((m: any, i: number) => (
            <div className="trade-row" key={m.token || m.creator}>
              <span>#{i + 1}</span>
              <Link href={m.token ? "/token/" + m.token : "/creators"}>
                {(m.token || m.creator).slice(0, 12)}…
              </Link>
              <span>
                {tab === "Most traded"
                  ? m.trades + " trades"
                  : tab === "Successful launches"
                    ? m.graduated + " graduated / " + m.launches + " launches"
                    : tab === "Trading volume"
                      ? m.volume + " raw quote units"
                      : tab === "Creator fees"
                        ? m.earnings + " raw quote units"
                        : "Block " + m.blockNumber}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
