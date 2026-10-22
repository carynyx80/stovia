"use client";
import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { parseAbi, encodeFunctionData, isAddress, type Address } from "viem";
import { Lock, ShieldCheck } from "lucide-react";
const safeAbi = parseAbi([
  "function isOwner(address owner) view returns(bool)",
  "function getThreshold() view returns(uint256)",
]);
const registryAbi = parseAbi([
  "function suspend(address stock,bool value)",
  "function review(address stock,(address oracle,address eligibility,uint64 maxAge,uint8 decimals,bool approved,bool suspended,bytes32 evidenceHash,uint256 minPrice,uint256 maxPrice) asset)",
]);
export default function Admin() {
  const { address } = useAccount();
  const [status, setStatus] = useState<any>(null),
    [stock, setStock] = useState(""),
    [action, setAction] = useState("suspend"),
    [params, setParams] = useState(
      '{"oracle":"","eligibility":"","maxAge":3600,"decimals":18,"approved":true,"suspended":false,"evidenceHash":"","minPrice":"","maxPrice":""}',
    ),
    [proposal, setProposal] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);
  const safe = status?.governance as Address | undefined;
  const { data: isOwner } = useReadContract({
    address: safe,
    abi: safeAbi,
    functionName: "isOwner",
    args: address ? [address] : undefined,
    chainId: 4663,
    query: { enabled: !!safe && !!address },
  });
  const { data: threshold } = useReadContract({
    address: safe,
    abi: safeAbi,
    functionName: "getThreshold",
    chainId: 4663,
    query: { enabled: !!safe },
  });
  function prepare() {
    try {
      if (!isOwner || !threshold || threshold < 2n)
        throw Error("Authorized multisig owner required");
      if (!isAddress(stock) || !isAddress(status?.contracts.registry))
        throw Error("Verified stock and registry addresses required");
      let data;
      if (action === "review") {
        const a = JSON.parse(params);
        if (
          !isAddress(a.oracle) ||
          !isAddress(a.eligibility) ||
          !/^0x[0-9a-fA-F]{64}$/.test(a.evidenceHash)
        )
          throw Error("Invalid oracle, eligibility or evidence hash");
        data = encodeFunctionData({
          abi: registryAbi,
          functionName: "review",
          args: [
            stock,
            {
              oracle: a.oracle,
              eligibility: a.eligibility,
              maxAge: BigInt(a.maxAge),
              decimals: Number(a.decimals),
              approved: !!a.approved,
              suspended: !!a.suspended,
              evidenceHash: a.evidenceHash,
              minPrice: BigInt(a.minPrice),
              maxPrice: BigInt(a.maxPrice),
            },
          ],
        });
      } else
        data = encodeFunctionData({
          abi: registryAbi,
          functionName: "suspend",
          args: [stock, action === "suspend"],
        });
      setProposal(
        JSON.stringify(
          {
            chainId: 4663,
            target: status.contracts.registry,
            value: "0",
            data,
            requires:
              "Submit through approved multisig and timelock. This is calldata only; nothing has been signed or sent.",
          },
          null,
          2,
        ),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Proposal invalid");
    }
  }
  return (
    <section className="subpage">
      <div className="eyebrow">AUTHORIZED GOVERNANCE</div>
      <h1>Protocol administration.</h1>
      {!isOwner ? (
        <div className="panel empty-market">
          <Lock size={32} />
          <h2>Authorized multisig owner required</h2>
          <p className="muted">
            Connect an owner of the configured governance multisig. Every
            administrative transaction is independently enforced by onchain
            roles and the timelock.
          </p>
          <p className="muted">
            {!safe
              ? "Governance multisig has not been configured."
              : "Wallet ownership has not been verified."}
          </p>
        </div>
      ) : (
        <div className="create-layout">
          <form
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              prepare();
            }}
          >
            <h2>Registry proposal</h2>
            <p className="muted">
              Multisig threshold: {threshold?.toString() || "Unavailable"}.
              Prepare reviewable calldata for the governance process.
            </p>
            <label>
              Action
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                <option value="suspend">Suspend asset markets</option>
                <option value="resume">Resume reviewed asset</option>
                <option value="review">Review approved asset</option>
              </select>
            </label>
            <label>
              Stock contract
              <input
                required
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="0x…"
              />
            </label>
            {action === "review" && (
              <label>
                Reviewed asset parameters
                <textarea
                  style={{ height: 220 }}
                  value={params}
                  onChange={(e) => setParams(e.target.value)}
                />
              </label>
            )}
            <button className="primary">Prepare governance calldata</button>
            {error && <p role="alert">{error}</p>}
          </form>
          <div className="panel">
            <h2>Proposal preview</h2>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                fontSize: 11,
                color: "#98a2b3",
              }}
            >
              {proposal || "No proposal prepared."}
            </pre>
          </div>
        </div>
      )}
      <div className="callout">
        <ShieldCheck size={16} /> Evidence must establish issuer authenticity,
        permitted pool use, oracle validity and investor eligibility. A frontend
        proposal never grants approval by itself.
      </div>
    </section>
  );
}
