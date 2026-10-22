"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Trade from "./trade";
import Records from "./records";
import Stocks from "./stocks";
import Admin from "./admin";
import Leaderboard from "./leaderboard";
import { usePathname } from "next/navigation";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useBalance,
  usePublicClient,
  useWriteContract,
  useSwitchChain,
  useSignMessage,
} from "wagmi";
import {
  parseAbi,
  parseEther,
  formatEther,
  isAddress,
  type Address,
} from "viem";
import {
  ArrowUpRight,
  ArrowRight,
  Activity,
  Plus,
  Search,
  SlidersHorizontal,
  ShieldCheck,
  ChevronDown,
  ExternalLink,
  Globe,
  Layers,
  Check,
  Wallet,
  X,
  BarChart3,
  Lock,
  Radio,
  RefreshCw,
} from "lucide-react";
const tabs = [
  "Trending",
  "New launches",
  "Near graduation",
  "Recently graduated",
  "Highest volume",
  "Top gainers",
];
const nav = [
  ["Explore", "/"],
  ["Launch", "/create"],
  ["Stocks", "/stocks"],
  ["Graduated", "/graduated"],
  ["Leaderboard", "/leaderboard"],
  ["Portfolio", "/portfolio"],
];
export default function Terminal() {
  const path = usePathname(),
    { address, isConnected } = useAccount(),
    { connect, connectors, error } = useConnect(),
    { disconnect } = useDisconnect(),
    { data: balance } = useBalance({ address, chainId: 4663 });
  const client = usePublicClient({ chainId: 4663 }),
    { writeContractAsync } = useWriteContract(),
    { switchChainAsync } = useSwitchChain(),
    { signMessageAsync } = useSignMessage();
  const [stocks, setStocks] = useState<any[]>([]),
    [pendingLaunch, setPendingLaunch] = useState<any>(null),
    [issuerStocks, setIssuerStocks] = useState<any[]>([]),
    [stockChoice, setStockChoice] = useState("");
  const [wallet, setWallet] = useState(false),
    [tab, setTab] = useState("Trending"),
    [search, setSearch] = useState(""),
    [fee, setFee] = useState(1),
    [name, setName] = useState(""),
    [ticker, setTicker] = useState(""),
    [notice, setNotice] = useState(""),
    [status, setStatus] = useState<any>(null),
    [refresh, setRefresh] = useState(0),
    [view, setView] = useState("grid");
  useEffect(() => {
    fetch("/api/stocks")
      .then((r) => r.json())
      .then((d) => setStocks(d.stocks || []))
      .catch(() => {});
    fetch("/api/issuer-assets")
      .then((r) => r.json())
      .then((d) => setIssuerStocks(d.assets || []))
      .catch(() => {});
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false }));
  }, [refresh]);

  useEffect(() => {
    if (path === "/create") {
      const requested = new URLSearchParams(window.location.search).get(
        "stock",
      );
      if (requested && isAddress(requested)) setStockChoice(requested);
    }
  }, [path]);
  const stockOptions = [
    ...issuerStocks.map((a) => ({
      ...a,
      approved: stocks.some(
        (s) => s.address.toLowerCase() === a.address.toLowerCase(),
      ),
    })),
    ...stocks
      .filter(
        (s) =>
          !issuerStocks.some(
            (a) => a.address.toLowerCase() === s.address.toLowerCase(),
          ),
      )
      .map((s) => ({ ...s, symbol: s.issuer, name: s.issuer, approved: true })),
  ].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const selectedStock = stockOptions.find((a) => a.address === stockChoice);
  const launchABI = parseAbi([
    "function creationFee() view returns(uint256)",
    "function launch(string name,string symbol,uint256 supply,address quote,uint8 fee,string metadataURI) payable returns(address token,address market)",
  ]);
  async function prepareLaunch(form: HTMLFormElement) {
    try {
      setPendingLaunch(null);
      const selected = new FormData(form).get("stock");
      if (
        !stocks.some(
          (s) => s.address.toLowerCase() === String(selected).toLowerCase(),
        )
      )
        throw Error(
          "This stock is available for launch setup but has not been approved by the onchain Stovia registry. Registry deployment, verified oracle and eligibility review are still required. No approval or launch transaction has been sent.",
        );
      if (!address) {
        setWallet(true);
        return;
      }
      if (
        !status?.transactionUI ||
        !status?.contracts.factory ||
        !stocks.length ||
        !client
      )
        throw Error(
          "Launch unavailable: approved stock asset, issuer eligibility, oracle, treasury and audited factory deployment are required.",
        );
      const fields = new FormData(form);
      const stock = String(fields.get("stock"));
      if (
        !stocks.some((s) => s.address.toLowerCase() === stock.toLowerCase()) ||
        !isAddress(stock)
      )
        throw Error("Select an approved stock asset");
      const image = fields.get("image") as File | null;
      const metadata = {
        name,
        ticker,
        description: String(fields.get("description")),
        website: String(fields.get("Website") || ""),
        x: String(fields.get("X account") || ""),
        telegram: String(fields.get("Telegram") || ""),
      };
      const challengeResponse = await fetch("/api/uploads/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) throw Error(challenge.error);
      const signature = await signMessageAsync({ message: challenge.message });
      const upload = new FormData();
      upload.set("nonce", challenge.nonce);
      upload.set("signature", signature);
      upload.set("owner", address);
      upload.set("document", JSON.stringify(metadata));
      if (image?.size) upload.set("image", image);
      const uploadResponse = await fetch("/api/metadata", {
        method: "POST",
        body: upload,
      });
      const stored = await uploadResponse.json();
      if (!uploadResponse.ok) throw Error(stored.error);
      const uri = stored.uri;
      const factory = status.contracts.factory as Address;
      const cost = await client.readContract({
        address: factory,
        abi: launchABI,
        functionName: "creationFee",
      });
      const args = [
        name,
        ticker,
        BigInt(String(fields.get("supply"))) * 10n ** 18n,
        stock,
        fee,
        uri,
      ] as const;
      const request = {
        address: factory,
        abi: launchABI,
        functionName: "launch" as const,
        args,
        account: address,
        value: cost,
        chainId: 4663 as const,
      };
      await client.simulateContract(request);
      const gas = await client.estimateContractGas(request);
      const prices = await client.estimateFeesPerGas();
      const gasETH = gas * (prices.maxFeePerGas || prices.gasPrice || 0n);
      const available = await client.getBalance({ address });
      if (available < cost + gasETH)
        throw Error("Insufficient ETH for creation fee and estimated gas");
      setPendingLaunch(request);
      setNotice(
        `Creation fee: $0.25 USD (${formatEther(cost)} ETH). Estimated network gas: ${formatEther(gasETH)} ETH. Estimated total: ${formatEther(cost + gasETH)} ETH. Wallet balance: ${formatEther(available)} ETH. Creator fee: ${fee}% permanently locked. Gas and oracle fee can change before execution.`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unable to prepare launch");
    }
  }
  async function confirmLaunch() {
    try {
      if (!pendingLaunch || !client) return;
      await switchChainAsync({ chainId: 4663 });
      const hash = await writeContractAsync(pendingLaunch);
      setPendingLaunch(null);
      setNotice("Submitted transaction: " + hash + " — waiting for receipt.");
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw Error("Launch transaction reverted");
      setNotice(
        "Launch confirmed onchain: " +
          hash +
          ". The indexed market will appear after confirmations.",
      );
    } catch (e) {
      setPendingLaunch(null);
      setNotice(e instanceof Error ? e.message : "Launch failed");
    }
  }
  const home = path === "/",
    create = path === "/create";
  return (
    <>
      <header>
        <Link className="brand" href="/">
          <span className="brand-icon">
            <svg viewBox="0 0 28 36" width="28" height="36" aria-hidden="true">
              <path
                d="M17 1 4 20h12L10 35l15-21H13l7-13Z"
                fill="currentColor"
              />
            </svg>
          </span>
          STOVIA<span className="brand-dot">®</span>
        </Link>
        <div className="sidebar-label">WORKSPACE / 01</div>
        <nav>
          {nav.map(([n, p], index) => (
            <Link key={p} className={path === p ? "active" : ""} href={p}>
              <span className="nav-index">0{index + 1}</span>
              {n}
              <ArrowUpRight size={13} />
            </Link>
          ))}
        </nav>
        <div className="header-right">
          <span className="network">
            <i />
            Robinhood Chain <ChevronDown size={12} />
          </span>
          <button className="wallet" onClick={() => setWallet(true)}>
            <Wallet size={15} />
            {isConnected
              ? `${address?.slice(0, 6)}…${address?.slice(-4)}`
              : "Connect wallet"}
          </button>
        </div>
      </header>
      <div className="network-strip">
        <span>
          <Radio size={12} /> ROBINHOOD CHAIN MAINNET
        </span>
        <span>Stock-backed pairs. Onchain possibilities.</span>
        <span className="strip-right">
          MAINNET CONFIGURED <i />
        </span>
      </div>
      <main>
        {path === "/leaderboard" ? (
          <Leaderboard />
        ) : path === "/admin" ? (
          <Admin />
        ) : path.startsWith("/token/") ? (
          <Trade address={path.split("/")[2]} />
        ) : home ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span /> INDEPENDENT MARKETS. REAL CONVICTION.
                </div>
                <h1>
                  A new market
                  <br />
                  <em>starts here.</em>
                </h1>
                <p>
                  Create and trade the next wave of tokens, paired with
                  <br className="desktop" /> verified tokenized stocks. Built on
                  Robinhood Chain.
                </p>
                <div className="hero-actions">
                  <Link className="primary" href="/create">
                    Launch a token <ArrowUpRight size={17} />
                  </Link>
                  <a className="secondary" href="#markets">
                    Explore markets <ArrowRight size={16} />
                  </a>
                </div>
                <div className="hero-foot">
                  <ShieldCheck size={14} /> Verified stock pairs <span>·</span>{" "}
                  Transparent creator fees <span>·</span> Fully onchain
                </div>
              </div>
              <div className="launch-blueprint">
                <div className="blueprint-head">
                  <span>THE STOVIA MODEL</span>
                  <span>01—03</span>
                </div>
                <div className="blueprint-title">
                  Real assets.
                  <br />
                  <em>New markets.</em>
                </div>
                <div className="blueprint-step">
                  <b>01</b>
                  <div>
                    Choose your stock pair
                    <small>
                      Issuer-listed assets. Registry-controlled access.
                    </small>
                  </div>
                  <ArrowUpRight size={19} />
                </div>
                <div className="blueprint-step">
                  <b>02</b>
                  <div>
                    Launch a fixed-supply token
                    <small>Your identity. Your permanently locked fee.</small>
                  </div>
                  <ArrowUpRight size={19} />
                </div>
                <div className="blueprint-step">
                  <b>03</b>
                  <div>
                    Build toward graduation
                    <small>Actual reserves. Permanent stock liquidity.</small>
                  </div>
                  <ArrowUpRight size={19} />
                </div>
                <div className="blueprint-foot">
                  <span>STOCK-DENOMINATED BY DESIGN</span>
                  <Layers size={25} />
                </div>
              </div>
            </section>
            <section className="stats">
              {[
                [
                  "Tokens launched",
                  status?.configured ? String(status.stats.launches) : "—",
                  "Across all stock pairs",
                ],
                [
                  "Total trading volume",
                  "—",
                  "Requires historical USD pricing",
                ],
                [
                  "Graduated tokens",
                  status?.configured ? String(status.stats.graduated) : "—",
                  "Built for the next chapter",
                ],
                [
                  "Active markets",
                  status?.configured ? String(status.stats.active) : "—",
                  "Verified stock pairs only",
                ],
                ["Creator earnings", "—", "View stock units in dashboard"],
              ].map(([l, v, s]) => (
                <div key={l}>
                  <span>
                    {l}
                    <ArrowUpRight size={13} />
                  </span>
                  <strong>{v}</strong>
                  <small>{s}</small>
                </div>
              ))}
            </section>
            <section className="markets" id="markets">
              <div className="section-head">
                <div>
                  <div className="eyebrow">MARKET EXPLORER</div>
                  <h2>
                    Find your next market<span>.</span>
                  </h2>
                </div>
                <Link href="/stocks" className="text-link">
                  Explore stock pairs <ArrowUpRight size={15} />
                </Link>
              </div>
              <div className="market-toolbar">
                <div className="tabs">
                  {tabs.map((t) => (
                    <button
                      onClick={() => setTab(t)}
                      className={tab === t ? "selected" : ""}
                      key={t}
                    >
                      {t === "Trending" && <Activity size={14} />} {t}
                    </button>
                  ))}
                </div>
                <div className="filters">
                  <label>
                    <Search size={15} />
                    <input
                      aria-label="Search markets"
                      placeholder="Search tokens…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <button
                    aria-label="Toggle market layout"
                    onClick={() => setView(view === "grid" ? "list" : "grid")}
                  >
                    <SlidersHorizontal size={16} />
                  </button>
                </div>
              </div>
              <Records mode="explore" filter={tab} query={search} />
              <div className={"empty-market " + view}>
                <div className="empty-symbol">
                  <BarChart3 size={26} />
                  <span>+</span>
                </div>
                <h3>
                  {search
                    ? `No results for “${search}”`
                    : "The next market starts with you."}
                </h3>
                <p>
                  {status?.configured
                    ? "No indexed markets are available."
                    : "Market indexing is awaiting verified protocol deployment."}
                  <br />
                  When approved markets go live, you’ll find them here.
                </p>
                <Link className="secondary small" href="/create">
                  Create the first launch <ArrowUpRight size={14} />
                </Link>
                <div className="empty-status">
                  <i /> No fabricated activity. Only verifiable onchain markets.
                </div>
              </div>
              <div className="table-foot">
                <span>
                  Showing {tab.toLowerCase()} markets · Data unavailable
                </span>
                <button onClick={() => setRefresh(refresh + 1)}>
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>
            </section>
            <section className="principles">
              <div>
                <ShieldCheck />
                <h3>Backed by a better pair.</h3>
                <p>
                  Every official market pairs a launch token with an approved,
                  issuer-backed stock asset.
                </p>
                <Link href="/stocks">
                  About verified assets <ArrowUpRight size={14} />
                </Link>
              </div>
              <div>
                <Layers />
                <h3>Launch. Grow. Graduate.</h3>
                <p>
                  Stock-denominated curves lead to permanent liquidity when
                  reserve conditions are met.
                </p>
                <Link href="/graduated">
                  How graduation works <ArrowUpRight size={14} />
                </Link>
              </div>
              <div>
                <Wallet />
                <h3>Your creation. Your upside.</h3>
                <p>
                  Set a transparent 1–10% trading fee. Creators receive 90% of
                  every collected fee.
                </p>
                <Link href="/creators">
                  Creator dashboard <ArrowUpRight size={14} />
                </Link>
              </div>
            </section>
          </>
        ) : create ? (
          <>
            <div className="page-heading">
              <div className="eyebrow">MAKE YOUR MARKET</div>
              <h1>
                Launch something
                <br />
                <em>worth believing in.</em>
              </h1>
              <p>Your token. A verified stock pair. A new beginning.</p>
            </div>
            <div className="create-layout">
              <form
                className="panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  prepareLaunch(e.currentTarget);
                }}
              >
                <h2>Token details</h2>
                <p className="muted">
                  Create a fixed-supply token with permanently locked fees.
                </p>
                <div className="form-grid">
                  <label>
                    Token name
                    <input
                      required
                      maxLength={48}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your token name"
                    />
                  </label>
                  <label>
                    Ticker
                    <input
                      required
                      pattern="[A-Z0-9]{2,10}"
                      value={ticker}
                      onChange={(e) => setTicker(e.target.value.toUpperCase())}
                      placeholder="TICKER"
                    />
                  </label>
                </div>
                <label>
                  Description
                  <textarea
                    name="description"
                    required
                    maxLength={1000}
                    placeholder="Tell the story behind your token"
                  />
                </label>
                <label>
                  Token image
                  <input
                    name="image"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      if (
                        e.target.files?.[0] &&
                        e.target.files[0].size > 2000000
                      ) {
                        setNotice("Choose an image under 2 MB.");
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
                <div className="form-grid">
                  {["Website", "X account", "Telegram"].map((n) => (
                    <label key={n}>
                      {n}
                      <input name={n} type="url" placeholder="https://" />
                    </label>
                  ))}
                </div>
                <label>
                  Total supply
                  <select name="supply" defaultValue="1000000000">
                    {[1000000, 10000000, 100000000, 1000000000].map((n) => (
                      <option value={n} key={n}>
                        {n.toLocaleString()} tokens
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Stock pair
                  <select
                    name="stock"
                    value={stockChoice}
                    onChange={(e) => setStockChoice(e.target.value)}
                    disabled={!stockOptions.length}
                    required
                  >
                    <option value="">
                      {stockOptions.length
                        ? `Choose from ${stockOptions.length} issuer-listed stocks`
                        : "Loading issuer stock directory…"}
                    </option>
                    {stockOptions.map((a) => (
                      <option key={a.address} value={a.address}>
                        {a.symbol} — {a.name}
                        {a.approved
                          ? " · Registry approved"
                          : " · Approval pending"}
                      </option>
                    ))}
                  </select>
                  <span className="field-note">
                    Every issuer-listed mainnet stock can be selected for setup.
                    Launching requires registry approval.
                  </span>
                  {selectedStock && (
                    <span
                      className={
                        "approval-label " +
                        (selectedStock.approved ? "approved" : "pending")
                      }
                    >
                      {selectedStock.approved
                        ? "Approved in Stovia registry"
                        : "Selected for setup · Onchain approval pending"}
                    </span>
                  )}
                </label>
                <label>
                  Creator trading fee <b>{fee}%</b>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={fee}
                    onChange={(e) => setFee(+e.target.value)}
                  />
                </label>
                <div className="callout">
                  <Lock size={16} /> This fee is permanent. 90% goes to you; 10%
                  to Stovia. Collected in the stock-backed quote asset.
                </div>
                <button className="primary" type="submit">
                  Review launch requirements <ArrowUpRight size={16} />
                </button>
              </form>
              <aside className="panel summary">
                <div className="eyebrow">LAUNCH PREVIEW</div>
                <div className="token-avatar">{ticker.slice(0, 2) || "ϟ"}</div>
                <h2>{name || "Your next big idea"}</h2>
                <p>
                  {ticker || "TICKER"} /{" "}
                  {selectedStock?.symbol || "Select a stock"}
                </p>
                <dl>
                  <dt>Creator fee</dt>
                  <dd>{fee}%</dd>
                  <dt>Creation fee</dt>
                  <dd>$0.25 USD</dd>
                  <dt>ETH equivalent</dt>
                  <dd>Oracle required</dd>
                  <dt>Network gas</dt>
                  <dd>Unavailable</dd>
                  <dt>Wallet balance</dt>
                  <dd>
                    {balance
                      ? Number(balance.formatted).toFixed(5) + " ETH"
                      : "Connect wallet"}
                  </dd>
                </dl>
                <div className="callout">
                  Launch tokens are speculative assets and do not confer company
                  shares or ownership.
                </div>
              </aside>
            </div>
          </>
        ) : (
          <section className="subpage">
            <div className="eyebrow">
              STOVIA / {path.split("/")[1]?.toUpperCase()}
            </div>
            <h1>
              {path === "/stocks"
                ? "A better foundation."
                : path === "/graduated"
                  ? "Built to go further."
                  : path === "/leaderboard"
                    ? "Conviction, measured."
                    : path === "/creators"
                      ? "Your creator dashboard."
                      : path === "/admin"
                        ? "Protocol administration."
                        : path.startsWith("/token/")
                          ? "Market terminal."
                          : "Your onchain portfolio."}
            </h1>
            <p className="muted">
              {path === "/stocks"
                ? "Only verified, issuer-backed stock tokens can become official quote assets."
                : path === "/graduated"
                  ? "Graduation requires real stock reserves, valid oracle pricing and atomic liquidity migration."
                  : path === "/leaderboard"
                    ? "Rankings are calculated from verified indexed activity."
                    : "Connect your wallet to access verified balances and activity."}
            </p>
            {path === "/stocks" && <Stocks />}
            <Records mode={path.slice(1)} />
            <div className="panel empty-market">
              <ShieldCheck size={36} />
              <h3>
                {path === "/stocks"
                  ? "No approved stock assets"
                  : path === "/admin"
                    ? "Authorized multisig required"
                    : path === "/leaderboard" || path === "/graduated"
                      ? "Awaiting indexed markets"
                      : path.startsWith("/token/")
                        ? "Market not found"
                        : "Connect to your onchain world"}
              </h3>
              <p>
                {path === "/stocks"
                  ? "Issuer permissions, transfer eligibility, oracle support and pool use must be reviewed before an asset is listed."
                  : "No deployed protocol contracts or indexed activity have been configured. Financial actions are unavailable."}
              </p>
              {["/portfolio", "/creators", "/admin"].includes(path) && (
                <button className="primary" onClick={() => setWallet(true)}>
                  Connect wallet <Wallet size={16} />
                </button>
              )}
              <Link className="text-link" href="/">
                Back to explore <ArrowRight size={15} />
              </Link>
            </div>
            <div className="callout">
              <ShieldCheck size={18} /> Production gate: issuer approvals,
              oracle verification, independent security audit and deployment
              authorization are required.
            </div>
          </section>
        )}
      </main>
      <footer>
        <Link className="brand" href="/">
          <span className="brand-icon">
            <svg viewBox="0 0 28 36" width="28" height="36" aria-hidden="true">
              <path
                d="M17 1 4 20h12L10 35l15-21H13l7-13Z"
                fill="currentColor"
              />
            </svg>
          </span>
          STOVIA
        </Link>
        <p>Real assets. New possibilities.</p>
        <div>
          <a
            href="https://docs.robinhood.com/chain/connecting/"
            target="_blank"
            rel="noreferrer"
          >
            Network docs <ExternalLink size={12} />
          </a>
          <Link href="/creators">For creators</Link>
          <button
            onClick={() =>
              setNotice(
                "Launch tokens do not represent equity. Stock token eligibility, issuer terms, liquidity, smart-contract and market risks apply. Contracts are unaudited and undeployed; real-money functionality is disabled.",
              )
            }
          >
            Risk disclosure
          </button>
          <span>© 2026 Stovia</span>
        </div>
      </footer>
      {wallet && (
        <div className="overlay" onClick={() => setWallet(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="close"
              onClick={() => setWallet(false)}
              aria-label="Close wallet dialog"
            >
              <X />
            </button>
            <Wallet size={30} />
            <h2>{isConnected ? "Wallet connected" : "Connect your wallet"}</h2>
            <p>Connect an EVM wallet to Robinhood Chain.</p>
            {isConnected ? (
              <>
                <code>{address}</code>
                <p>
                  {balance ? balance.formatted + " ETH" : "Balance unavailable"}
                </p>
                <button
                  className="secondary"
                  onClick={() => {
                    disconnect();
                    setWallet(false);
                  }}
                >
                  Disconnect
                </button>
              </>
            ) : (
              connectors.map((c) => (
                <button
                  className="primary"
                  key={c.uid}
                  onClick={() => connect({ connector: c })}
                >
                  {c.name}
                  <ArrowUpRight size={16} />
                </button>
              ))
            )}
            {error && <p role="alert">{error.message.slice(0, 180)}</p>}
            <small>Connecting never authorizes a transaction.</small>
          </div>
        </div>
      )}
      {notice && (
        <div className="overlay" onClick={() => setNotice("")}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <ShieldCheck size={30} />
            <h2>Before going onchain</h2>
            <p>{notice}</p>
            <button
              className="primary"
              onClick={() => (pendingLaunch ? confirmLaunch() : setNotice(""))}
            >
              {pendingLaunch ? "Confirm in wallet" : "Understood"}{" "}
              <Check size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
