"use client";
import { useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
} from "wagmi";
import { formatEther, keccak256, parseAbi, type Address, type Hex } from "viem";
import { ShieldCheck, ExternalLink } from "lucide-react";
const safeAbi = parseAbi([
  "function getOwners() view returns(address[])",
  "function getThreshold() view returns(uint256)",
]);
export default function Governance() {
  const [proposal, setProposal] = useState<any>(null),
    [accepted, setAccepted] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [hash, setHash] = useState<Hex>();
  const { address } = useAccount(),
    client = usePublicClient({ chainId: 4663 }),
    { sendTransactionAsync } = useSendTransaction(),
    { switchChainAsync } = useSwitchChain();
  useEffect(() => {
    fetch("/api/governance/proposal")
      .then((r) => r.json())
      .then(setProposal)
      .catch(() => setMessage("Unable to load the unsigned proposal."));
  }, []);
  async function deploy() {
    try {
      if (!proposal || !client || !address || !accepted) return;
      if (address.toLowerCase() !== proposal.transaction.from.toLowerCase())
        throw Error("Connect the designated deployment wallet.");
      setBusy(true);
      await switchChainAsync({ chainId: 4663 });
      for (const entry of Object.values(
        proposal.officialRuntimeContracts,
      ) as any[]) {
        const code = await client.getCode({ address: entry.address });
        if (!code || keccak256(code) !== entry.codeHash)
          throw Error("Official Safe runtime verification failed.");
      }
      const existing = await client.getCode({
        address: proposal.predictedSafeAddress,
      });
      if (existing && existing !== "0x")
        throw Error(
          "A contract already exists at the proposed address. Inspect it before proceeding.",
        );
      const call = await client.call({
        account: address,
        to: proposal.transaction.to,
        data: proposal.transaction.data,
        value: 0n,
      });
      if (
        !call.data ||
        ("0x" + call.data.slice(-40)).toLowerCase() !==
          proposal.predictedSafeAddress.toLowerCase()
      )
        throw Error("Safe address simulation mismatch.");
      setMessage("Review deployment and current gas estimate in your wallet.");
      const tx = await sendTransactionAsync({
        chainId: 4663,
        to: proposal.transaction.to as Address,
        data: proposal.transaction.data as Hex,
        value: 0n,
      });
      setHash(tx);
      setMessage("Transaction submitted; awaiting receipt.");
      const receipt = await client.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== "success")
        throw Error("Safe deployment reverted.");
      const [owners, threshold] = await Promise.all([
        client.readContract({
          address: proposal.predictedSafeAddress,
          abi: safeAbi,
          functionName: "getOwners",
        }),
        client.readContract({
          address: proposal.predictedSafeAddress,
          abi: safeAbi,
          functionName: "getThreshold",
        }),
      ]);
      if (
        threshold !== 2n ||
        owners.length !== 2 ||
        !proposal.owners.every((o: string) =>
          owners.some((a) => a.toLowerCase() === o.toLowerCase()),
        )
      )
        throw Error(
          "Receipt succeeded but owner/threshold verification failed.",
        );
      setMessage(
        "Governance Safe deployed and owners/threshold verified. Stock approvals have not been submitted. Save this receipt for Stovia deployment configuration.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Deployment failed.");
    } finally {
      setBusy(false);
    }
  }
  if (proposal?.confirmation?.status === "confirmed")
    return (
      <section className="subpage">
        <div className="eyebrow">GOVERNANCE / CONFIRMED</div>
        <h1>Governance wallet deployed.</h1>
        <div className="create-layout">
          <div className="panel">
            <ShieldCheck />
            <h2>Confirmed on Robinhood Chain</h2>
            <p className="muted">
              The creation receipt succeeded. Both owners, the 2-of-2 threshold
              and the Safe singleton were verified onchain. No additional Safe
              deployment is needed.
            </p>
            <h3>Governance Safe</h3>
            <p
              style={{
                wordBreak: "break-all",
                fontFamily: "var(--mono)",
                fontSize: 12,
              }}
            >
              {proposal.confirmation.address}
            </p>
            <dl>
              <dt>Network</dt>
              <dd>Robinhood Chain · 4663</dd>
              <dt>Threshold at verification</dt>
              <dd>2 of 2</dd>
              <dt>Safe version</dt>
              <dd>{proposal.confirmation.version}</dd>
              <dt>Deployment block</dt>
              <dd>{proposal.confirmation.blockNumber}</dd>
            </dl>
            <h3>Verified owners</h3>
            {proposal.confirmation.owners.map((owner: string) => (
              <p
                key={owner}
                style={{
                  wordBreak: "break-all",
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                }}
              >
                {owner}
              </p>
            ))}
            <p className="muted">
              Verified{" "}
              {new Date(proposal.confirmation.verifiedAt).toLocaleString()}.
              This records the confirmed deployment and configuration at
              verification time.
            </p>
            <a
              className="primary"
              href={
                "https://robinhoodchain.blockscout.com/tx/" +
                proposal.confirmation.transactionHash
              }
              target="_blank"
              rel="noreferrer"
            >
              View confirmed transaction <ExternalLink size={14} />
            </a>
          </div>
          <aside className="panel summary">
            <h2>Next: the protocol registry</h2>
            <p className="muted">
              The governance wallet is ready to be configured as Stovia’s
              administrator. Stovia’s registry, protocol contracts and asset
              approvals have not been deployed or executed.
            </p>
            <div className="callout">
              Stock approvals remain pending. Each asset still requires verified
              oracle, issuer/eligibility settings and protocol security review
              before governance approval transactions can be prepared.
            </div>
          </aside>
        </div>
      </section>
    );
  return (
    <section className="subpage">
      <div className="eyebrow">GOVERNANCE / SETUP</div>
      <h1>Prepare the keys to Stovia.</h1>
      <p className="muted">
        Deploy a two-owner Safe on Robinhood Chain. This step creates the
        governance wallet; it does not deploy Stovia or approve stocks.
      </p>
      {!proposal ? (
        <div className="panel">{message || "Loading verified proposal…"}</div>
      ) : (
        <div className="create-layout">
          <div className="panel">
            <h2>2-of-2 governance wallet</h2>
            <p className="muted">
              Both owners must sign future governance actions. Losing either
              owner’s access can block administration.
            </p>
            <dl>
              <dt>Network</dt>
              <dd>Robinhood Chain · 4663</dd>
              <dt>Safe version</dt>
              <dd>{proposal.safeVersion}</dd>
              <dt>Signing threshold</dt>
              <dd>2 of 2</dd>
              <dt>Transaction value</dt>
              <dd>0 ETH + network gas</dd>
              <dt>Earlier gas estimate</dt>
              <dd>
                {proposal.estimatedMaxGasCostWei
                  ? formatEther(BigInt(proposal.estimatedMaxGasCostWei)) +
                    " ETH"
                  : "Unavailable"}
              </dd>
            </dl>
            <h3>Proposed owners</h3>
            {proposal.owners.map((o: string) => (
              <p
                key={o}
                style={{
                  wordBreak: "break-all",
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                }}
              >
                {o}
              </p>
            ))}
            <h3>Predicted Safe address</h3>
            <p
              style={{
                wordBreak: "break-all",
                fontFamily: "var(--mono)",
                fontSize: 11,
              }}
            >
              {proposal.predictedSafeAddress}
            </p>
            <p className="muted">
              Predicted address is not evidence of deployment. The wallet will
              estimate current gas before you sign.
            </p>
            <label
              style={{
                display: "flex",
                gap: 10,
                fontSize: 12,
                lineHeight: 1.8,
                margin: "20px 0",
              }}
            >
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              I reviewed both owner addresses and the 2-of-2 threshold. I
              understand this deploys only the governance Safe and spends
              network gas.
            </label>
            <button
              className="primary"
              disabled={
                !accepted ||
                busy ||
                !address ||
                address.toLowerCase() !==
                  proposal.transaction.from.toLowerCase()
              }
              onClick={deploy}
            >
              {busy
                ? "Waiting for wallet/receipt…"
                : !address
                  ? "Connect deployment wallet above"
                  : "Review and deploy Safe in wallet"}
            </button>
            {message && (
              <p
                className="muted"
                role="status"
                style={{ wordBreak: "break-word" }}
              >
                {message}
              </p>
            )}
            {hash && (
              <a
                className="text-link"
                target="_blank"
                rel="noreferrer"
                href={"https://robinhoodchain.blockscout.com/tx/" + hash}
              >
                View transaction <ExternalLink size={12} />
              </a>
            )}
          </div>
          <aside className="panel summary">
            <ShieldCheck />
            <h2>Verified preparation</h2>
            <p className="muted">
              Official Safe deployment records list Robinhood Chain. The
              singleton, factory and fallback-handler runtime hashes were
              checked against those records. The exact deployment call was
              simulated.
            </p>
            <p className="muted">
              No modules, no setup delegatecall, no payment to a third party.
              The transaction value is zero; network gas is separate.
            </p>
            <div className="callout">
              All 195 stock candidates still require registry, oracle and
              eligibility review. Creating this wallet does not approve them.
            </div>
            <a
              className="text-link"
              href="/api/governance/proposal"
              target="_blank"
            >
              Inspect unsigned transaction JSON <ExternalLink size={12} />
            </a>
          </aside>
        </div>
      )}
    </section>
  );
}
