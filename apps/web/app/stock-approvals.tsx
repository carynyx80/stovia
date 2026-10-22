"use client";
import { useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
} from "wagmi";
export default function StockApprovals() {
  const [state, setState] = useState<any>(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState(false);
  const { address, chainId } = useAccount(),
    client = usePublicClient({ chainId: 4663 }),
    { switchChainAsync } = useSwitchChain(),
    { sendTransactionAsync } = useSendTransaction();
  async function load(action = "") {
    const r = await fetch(
      "/api/governance/stock-approvals" +
        (action ? "?preflight=" + action : ""),
      { cache: "no-store" },
    );
    const data = await r.json();
    if (!r.ok)
      throw Error(data.error + (data.details ? " — " + data.details : ""));
    setState(data);
    return data;
  }
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
    const interval = setInterval(() => load().catch(() => {}), 30000);
    return () => clearInterval(interval);
  }, []);
  async function submit(action: "approve" | "schedule" | "execute") {
    setBusy(true);
    try {
      if (!address || !client || !accepted)
        throw Error("Connect your owner wallet and review the batch");
      if (chainId !== 4663) await switchChainAsync({ chainId: 4663 });
      const fresh = await load(action === "approve" ? "" : action);
      const owner = fresh.ownerApprovals.find(
        (a: any) => a.owner.toLowerCase() === address.toLowerCase(),
      );
      if (action !== "execute" && !owner)
        throw Error("Connect one of the two governance owner wallets");
      if (
        action === "approve" &&
        (owner.approved || fresh.phase !== "not-scheduled")
      )
        throw Error(
          "This approval is already recorded or the operation is scheduled",
        );
      if (
        state &&
        fresh.safeTxHash !== state.safeTxHash &&
        action !== "execute"
      )
        throw Error(
          "Safe nonce changed. Review the refreshed batch and try again.",
        );
      const to = action === "execute" ? fresh.timelock : fresh.governance,
        data =
          action === "approve"
            ? owner.transactionData
            : action === "schedule"
              ? fresh.scheduleExecutionData
              : fresh.executeData;
      await client.call({ account: address, to, data, value: 0n });
      const estimate = await client.estimateGas({
        account: address,
        to,
        data,
        value: 0n,
      });
      const hash = await sendTransactionAsync({
        chainId: 4663,
        to,
        data,
        value: 0n,
        gas: (estimate * 120n) / 100n,
      });
      setMessage("Submitted " + hash + "; waiting for receipt.");
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw Error("Governance transaction reverted");
      await load();
      setMessage(
        action === "approve"
          ? "Owner approval recorded. The other owner must approve the same Safe transaction."
          : action === "schedule"
            ? "Stock approval batch scheduled. Execution becomes available after the two-day timelock."
            : "Stock approval batch executed. Refresh Stocks to read the registry results.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Wallet request failed");
    } finally {
      setBusy(false);
    }
  }
  const owner = state?.ownerApprovals.find(
    (a: any) => a.owner.toLowerCase() === address?.toLowerCase(),
  );
  return (
    <section className="panel">
      <h2>Approve stocks · governance batch</h2>
      <p className="muted">
        {state
          ? `${state.assetCount} supported stocks with validated catalog feeds.`
          : "Loading live governance state…"}
      </p>
      <p className="muted">
        Project approval only. No wallet receives an eligibility attestation.
        Price bounds are fixed at 50%–200% of the preparation price; freshness
        uses the official heartbeat up to one day. These contracts remain
        unaudited. No launch factory is enabled.
      </p>
      {state && (
        <>
          <p>
            Status: <b>{state.phase.replaceAll("-", " ")}</b>
            {state.readyAt
              ? " · " + new Date(state.readyAt).toLocaleString()
              : ""}
          </p>
          <div>
            {state.ownerApprovals.map((a: any) => (
              <p
                key={a.owner}
                className="muted"
                style={{ wordBreak: "break-all" }}
              >
                {a.owner}:{" "}
                {state.phase !== "not-scheduled"
                  ? "Batch already scheduled"
                  : a.approved
                    ? "Schedule authorized"
                    : "Owner authorization needed"}
              </p>
            ))}
          </div>
          <details>
            <summary>
              Review {state.assetCount} stocks and oracle settings
            </summary>
            {state.assets.map((a: any) => (
              <p
                key={a.address}
                className="muted"
                style={{ wordBreak: "break-all" }}
              >
                {a.symbol} · {a.address}
                <br />
                Oracle: {a.oracle} · max age {a.maxAge}s<br />
                USD bounds: {(Number(a.minPrice) / 1e18).toFixed(2)}–
                {(Number(a.maxPrice) / 1e18).toFixed(2)}
              </p>
            ))}
          </details>
          <p className="muted" style={{ wordBreak: "break-all" }}>
            Safe scheduling hash (current nonce): {state.safeTxHash}
            <br />
            Timelock operation: {state.operationId}
          </p>
          <label
            style={{ display: "flex", gap: 10, margin: "20px 0", fontSize: 12 }}
          >
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            I reviewed the stock list, feeds, price limits, evidence and two-day
            delay. My wallet will spend network gas.
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              className="primary"
              disabled={
                !accepted ||
                busy ||
                !owner ||
                owner.approved ||
                state.phase !== "not-scheduled"
              }
              onClick={() => submit("approve")}
            >
              Authorize schedule with this owner
            </button>
            <button
              className="secondary"
              disabled={
                !accepted ||
                busy ||
                !owner ||
                !state.ownerApprovals.every((a: any) => a.approved) ||
                state.phase !== "not-scheduled"
              }
              onClick={() => submit("schedule")}
            >
              Schedule approved batch
            </button>
            <button
              className="primary"
              disabled={
                !accepted ||
                busy ||
                !address ||
                state.phase !== "ready-to-execute"
              }
              onClick={() => submit("execute")}
            >
              Execute stock approvals
            </button>
          </div>
          <p className="muted">
            Each owner first records authorization onchain. After both
            authorizations, either owner can schedule this exact batch. Wait two
            days, then execute. Execution checks current feed validity and price
            bounds again and reverts the entire batch if any check fails.
          </p>
          <a
            className="text-link"
            href="/api/governance/stock-approvals"
            target="_blank"
            rel="noreferrer"
          >
            Inspect exact governance transactions
          </a>
        </>
      )}
      {message && (
        <p className="muted" role="status" style={{ wordBreak: "break-word" }}>
          {message}
        </p>
      )}
    </section>
  );
}
