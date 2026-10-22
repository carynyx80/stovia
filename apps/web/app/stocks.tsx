"use client";
import { useState, useEffect } from "react";
import { Search, ExternalLink } from "lucide-react";
export default function Stocks() {
  const [data, setData] = useState<any>(null),
    [q, setQ] = useState("");
  useEffect(() => {
    fetch("/api/issuer-assets")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ error: "Issuer data unavailable", assets: [] }));
  }, []);
  return (
    <section className="panel" style={{ marginTop: 30 }}>
      <h2>Issuer asset directory</h2>
      <p className="muted">
        Read-only metadata from Robinhood’s official API. Directory inclusion
        does not mean approval for Stovia markets. These instruments provide
        economic exposure; they do not confer ownership of the underlying
        company.
      </p>
      <label className="directory-search">
        <Search size={16} />
        <input
          aria-label="Search issuer assets"
          placeholder="Search issuer assets"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {!data ? (
        <p className="muted">Loading issuer directory…</p>
      ) : data.error ? (
        <p role="status">{data.error}</p>
      ) : (
        <>
          <p className="muted">
            {data.assets.length} mainnet deployments observed ·{" "}
            {new Date(data.observedAt).toLocaleString()}
          </p>
          <div className="asset-directory">
            {data.assets
              .filter((a: any) =>
                (a.name + " " + a.symbol)
                  .toLowerCase()
                  .includes(q.toLowerCase()),
              )
              .slice(0, 60)
              .map((a: any) => (
                <a
                  className="asset-directory-row"
                  key={a.address}
                  target="_blank"
                  rel="noreferrer"
                  href={
                    "https://robinhoodchain.blockscout.com/address/" + a.address
                  }
                >
                  <b>{a.symbol}</b>
                  <span>{a.name}</span>
                  <small>Not approved for Stovia</small>
                  <ExternalLink size={12} />
                </a>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
