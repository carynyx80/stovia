"use client";
import { useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
} from "wagmi";
import { keccak256, parseAbi, type Hex } from "viem";
export default function RegistryDeployment() {
  const [proposal, setProposal] = useState<any>(),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [hash, setHash] = useState(""),
    [confirmed, setConfirmed] = useState<any>();
  const { address } = useAccount(),
    client = usePublicClient({ chainId: 4663 }),
    { sendTransactionAsync } = useSendTransaction(),
    { switchChainAsync } = useSwitchChain();
  useEffect(() => {
    fetch("/api/governance/registry-proposal")
      .then((r) => r.json())
      .then(setProposal)
      .catch(() => setMessage("Unable to load deployment proposal"));
    setHash(localStorage.getItem("stovia-registry-transaction") || "");
  }, []);
  async function verify(value = hash) {
    setBusy(true);
    try {
      const r = await fetch(
        "/api/governance/registry-confirmation?hash=" +
          encodeURIComponent(value),
      );
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      setConfirmed(result);
      localStorage.setItem("stovia-registry-transaction", value);
      setMessage(
        "Registry deployment verified. No stock approvals have been executed. Save the confirmation and configure the registry address for this deployment.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }
  async function deploy() {
    setBusy(true);
    try {
      if (!proposal || !client || !address || !accepted)
        throw Error("Connect the deployment wallet and review the terms below");
      if (address.toLowerCase() !== proposal.transaction.from.toLowerCase())
        throw Error("Connect deployment wallet " + proposal.transaction.from);
      if (hash)
        throw Error(
          "A deployment transaction is already recorded. Verify it before sending another.",
        );
      if (keccak256(proposal.transaction.data) !== proposal.initcodeHash)
        throw Error("Deployment data integrity check failed");
      await switchChainAsync({ chainId: 4663 });
      const abi = parseAbi([
        "function getOwners() view returns(address[])",
        "function getThreshold() view returns(uint256)",
      ]);
      const [owners, threshold] = await Promise.all([
        client.readContract({
          address: proposal.governance,
          abi,
          functionName: "getOwners",
        }),
        client.readContract({
          address: proposal.governance,
          abi,
          functionName: "getThreshold",
        }),
      ]);
      if (
        threshold !== 2n ||
        owners.length !== 2 ||
        !proposal.owners.every((a: string) =>
          owners.some((b) => a.toLowerCase() === b.toLowerCase()),
        )
      )
        throw Error("Governance owners or threshold changed");
      await client.call({
        account: address,
        data: proposal.transaction.data,
        value: 0n,
      });
      const gas = await client.estimateGas({
        account: address,
        data: proposal.transaction.data,
        value: 0n,
      });
      setMessage(
        "Review the registry creation transaction and gas cost in your wallet.",
      );
      const tx = await sendTransactionAsync({
        chainId: 4663,
        data: proposal.transaction.data,
        value: 0n,
        gas: (gas * 120n) / 100n,
      });
      setHash(tx);
      localStorage.setItem("stovia-registry-transaction", tx);
      setMessage("Submitted. Waiting for confirmation…");
      const receipt = await client.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== "success")
        throw Error(
          "Deployment reverted. Inspect the receipt before retrying.",
        );
      await verify(tx);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Deployment failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <h2>Deploy the Stovia registry</h2>
      <p className="muted">
        Creates the stock registry, eligibility controls and a two-day
        governance timelock on Robinhood Chain. No assets are approved by this
        transaction.
      </p>
      <p className="muted">
        Value: 0 ETH plus network gas. Both Safe owners must authorize future
        approval scheduling. These custom contracts have not received an
        independent security audit.
      </p>
      {proposal && (
        <p className="muted" style={{ wordBreak: "break-all" }}>
          Deployment wallet: {proposal.transaction.from}
        </p>
      )}
      {!confirmed && (
        <>
          <label
            style={{ display: "flex", gap: 10, margin: "20px 0", fontSize: 12 }}
          >
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            I reviewed the unsigned transaction, unaudited contract status and
            two-day delay. This deploys infrastructure only and spends network
            gas.
          </label>
          <button
            className="primary"
            disabled={!proposal || !address || !accepted || busy || !!hash}
            onClick={deploy}
          >
            {busy
              ? "Waiting for wallet / verification…"
              : !address
                ? "Connect deployment wallet above"
                : hash
                  ? "Deployment submitted — verify below"
                  : "Review registry deployment in wallet"}
          </button>
        </>
      )}
      <label style={{ display: "block", marginTop: 20 }}>
        Deployment transaction hash
        <input
          aria-label="Registry deployment transaction hash"
          value={hash}
          onChange={(e) => {
            setHash(e.target.value);
            setConfirmed(undefined);
          }}
          placeholder="0x…"
          style={{ width: "100%" }}
        />
      </label>
      <button
        className="secondary"
        disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(hash)}
        onClick={() => verify()}
      >
        Verify deployment receipt
      </button>
      {message && (
        <p role="status" className="muted">
          {message}
        </p>
      )}
      {/^0x[0-9a-fA-F]{64}$/.test(hash) && (
        <a
          className="text-link"
          target="_blank"
          rel="noreferrer"
          href={"https://robinhoodchain.blockscout.com/tx/" + hash}
        >
          View transaction
        </a>
      )}
      {confirmed && (
        <>
          <h3>Verified registry</h3>
          <p style={{ wordBreak: "break-all" }}>{confirmed.registry}</p>
          <p className="muted">
            Set STOCK_REGISTRY_ADDRESS to this address in Vercel, then redeploy
            the app to enable registry reads. This does not enable trading or
            approve assets.
          </p>
          <a
            className="text-link"
            href={"/api/governance/registry-confirmation?hash=" + hash}
            target="_blank"
            rel="noreferrer"
          >
            Save verified deployment details
          </a>
        </>
      )}
      <a
        className="text-link"
        href="/api/governance/registry-proposal"
        target="_blank"
        rel="noreferrer"
      >
        Inspect unsigned transaction
      </a>
    </div>
  );
}
