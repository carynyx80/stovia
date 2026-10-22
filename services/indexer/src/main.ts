import { PrismaClient, Prisma } from "@prisma/client";
import {
  createPublicClient,
  http,
  fallback,
  decodeEventLog,
  parseAbi,
  toHex,
  type Address,
} from "viem";
import {
  factoryAbi,
  marketAbi,
  vaultAbi,
  checkedAddress,
} from "../../../packages/sdk/index";
const db = new PrismaClient();
const rpc = process.env.RPC_URL;
if (!rpc || !process.env.DATABASE_URL)
  throw Error("RPC_URL and DATABASE_URL required");
const registry = checkedAddress(
  process.env.STOCK_REGISTRY_ADDRESS,
).toLowerCase() as Address;
const registryAbi = parseAbi([
  "event StockReviewed(address indexed asset,bytes32 evidenceHash,bool approved)",
  "event Suspension(address indexed asset,bool suspended)",
  "function assets(address stock) view returns(address oracle,address eligibility,uint64 maxAge,uint8 decimals,bool approved,bool suspended,bytes32 evidenceHash,uint256 minPrice,uint256 maxPrice)",
]);
const factory = checkedAddress(
  process.env.LAUNCH_FACTORY_ADDRESS,
).toLowerCase() as Address;
const vault = checkedAddress(
  process.env.FEE_VAULT_ADDRESS,
).toLowerCase() as Address;
const client = createPublicClient({
  transport: fallback([
    http(rpc),
    ...(process.env.RPC_FALLBACK_URL
      ? [http(process.env.RPC_FALLBACK_URL)]
      : []),
  ]),
});
const confirmations = BigInt(process.env.INDEXER_CONFIRMATIONS || "64");
const start = BigInt(process.env.DEPLOYMENT_BLOCK || "0");
if (start <= 0n)
  throw Error(
    "Exact DEPLOYMENT_BLOCK required; refusing accidental genesis scan",
  );
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));
const serial = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
async function rebuild(tx: Prisma.TransactionClient) {
  // Deterministic replay makes derived views reorg-safe. Large deployments should checkpoint/replay only the affected suffix.
  await tx.holder.deleteMany();
  await tx.approvedStock.deleteMany();
  await tx.walletActivity.deleteMany();
  await tx.graduation.deleteMany();
  await tx.feeClaim.deleteMany();
  await tx.creatorFee.deleteMany();
  await tx.candle.deleteMany();
  await tx.trade.deleteMany();
  await tx.pool.deleteMany();
  await tx.tradingPair.deleteMany();
  await tx.launch.deleteMany();
  const events = await tx.protocolEvent.findMany({
    orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }],
    include: { block: true },
  });
  for (const e of events) {
    const a = e.args as any;
    if (e.kind === "StockReviewed" || e.kind === "Suspension") {
      const v = a.snapshot;
      if (v)
        await tx.approvedStock.upsert({
          where: { address: a.asset.toLowerCase() },
          create: {
            address: a.asset.toLowerCase(),
            issuer: "Reviewed registry asset",
            evidenceHash: v[6],
            chainId: 4663,
            oracle: v[0],
            eligibility: v[1],
            decimals: Number(v[3]),
            approved: v[4],
            suspended: v[5],
          },
          update: {
            evidenceHash: v[6],
            oracle: v[0],
            eligibility: v[1],
            decimals: Number(v[3]),
            approved: v[4],
            suspended: v[5],
          },
        });
    }
    if (e.kind === "LaunchTokenTransfer") {
      const value = new Prisma.Decimal(a.value),
        token = e.address;
      for (const [wallet, change] of [
        [a.from.toLowerCase(), value.negated()],
        [a.to.toLowerCase(), value],
      ] as const) {
        if (wallet === "0x0000000000000000000000000000000000000000") continue;
        const row = await tx.holder.upsert({
          where: { token_wallet: { token, wallet } },
          create: { token, wallet, balance: change },
          update: { balance: { increment: change } },
        });
        if (row.balance.isNegative())
          throw Error("Incomplete token transfer history");
      }
    }
    if (e.kind === "LaunchCreated") {
      await tx.launch.create({
        data: {
          token: a.token.toLowerCase(),
          market: a.market.toLowerCase(),
          creator: a.creator.toLowerCase(),
          quote: a.quote.toLowerCase(),
          feePercent: Number(a.feePercent),
          supply: a.supply,
          metadataURI: a.metadataURI,
          blockNumber: e.blockNumber,
        },
      });
      await tx.pool.create({
        data: {
          market: a.market.toLowerCase(),
          tokenReserve: a.supply,
          quoteReserve: "0",
          graduated: false,
        },
      });
      await tx.tradingPair.create({
        data: {
          market: a.market.toLowerCase(),
          token: a.token.toLowerCase(),
          quote: a.quote.toLowerCase(),
        },
      });
    }
    if (e.kind === "Buy" || e.kind === "Sell") {
      const buy = e.kind === "Buy";
      await tx.pool.update({
        where: { market: e.address },
        data: {
          tokenReserve: {
            increment: buy
              ? new Prisma.Decimal(a.tokensOut).negated()
              : a.tokensIn,
          },
          quoteReserve: {
            increment: buy
              ? new Prisma.Decimal(a.grossQuote).minus(a.fee)
              : new Prisma.Decimal(a.netQuote).plus(a.fee).negated(),
          },
        },
      });
      await tx.trade.create({
        data: {
          id: e.id,
          logIndex: e.logIndex,
          market: e.address,
          trader: a.trader.toLowerCase(),
          side: e.kind.toLowerCase(),
          tokenAmount: a.tokensOut || a.tokensIn,
          quoteAmount: a.grossQuote || a.netQuote,
          fee: a.fee,
          blockNumber: e.blockNumber,
          timestamp: e.block.timestamp,
        },
      });
      await tx.walletActivity.create({
        data: {
          id: e.id,
          address: a.trader.toLowerCase(),
          transactionHash: e.transactionHash,
          blockNumber: e.blockNumber,
          kind: e.kind,
        },
      });
    }
    if (e.kind === "FeesAccrued") {
      await tx.creatorFee.upsert({
        where: { token: a.token.toLowerCase() },
        create: {
          token: a.token.toLowerCase(),
          generated: a.creatorAmount,
          protocol: a.protocolAmount,
        },
        update: {
          generated: { increment: a.creatorAmount },
          protocol: { increment: a.protocolAmount },
        },
      });
    }
    if (e.kind === "FeesClaimed")
      await tx.feeClaim.create({
        data: {
          id: e.id,
          token: a.token.toLowerCase(),
          creator: a.creator.toLowerCase(),
          amount: a.amount,
          blockNumber: e.blockNumber,
        },
      });
    if (e.kind === "Graduation") {
      await tx.pool.update({
        where: { market: e.address },
        data: {
          tokenReserve: a.tokenReserve,
          quoteReserve: a.quoteReserve,
          graduated: true,
        },
      });
      const l = await tx.launch.findUnique({ where: { market: e.address } });
      if (l)
        await tx.graduation.create({
          data: {
            token: l.token,
            market: e.address,
            quoteReserve: a.quoteReserve,
            tokenReserve: a.tokenReserve,
            blockNumber: e.blockNumber,
          },
        });
    }
  }
  // Candles are derived only from executed trades, using raw stock units per raw launch-token unit.
  const trades = await tx.trade.findMany({
    orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }],
  });
  for (const t of trades) {
    const timestamp = new Date(
      Math.floor(t.timestamp.getTime() / 60000) * 60000,
    );
    const token = new Prisma.Decimal(t.tokenAmount);
    if (token.isZero()) continue;
    const quote = new Prisma.Decimal(t.quoteAmount);
    const price = (
      t.side === "buy" ? quote.minus(t.fee) : quote.plus(t.fee)
    ).div(token);
    const id = t.market + ":60:" + timestamp.toISOString();
    const c = await tx.candle.findUnique({ where: { id } });
    if (!c)
      await tx.candle.create({
        data: {
          id,
          market: t.market,
          interval: 60,
          timestamp,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: t.quoteAmount,
        },
      });
    else
      await tx.candle.update({
        where: { id },
        data: {
          high: Prisma.Decimal.max(c.high, price),
          low: Prisma.Decimal.min(c.low, price),
          close: price,
          volume: { increment: t.quoteAmount },
        },
      });
  }
}
async function atomic<T>(
  tx: Prisma.TransactionClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: unknown,
) {
  return fn(tx);
}
async function sync(db: Prisma.TransactionClient) {
  if ((await client.getChainId()) !== 4663) throw Error("Wrong chain");
  const head = await client.getBlockNumber();
  if (head <= confirmations) return;
  const safe = head - confirmations;
  const cursor = await db.cursor.upsert({
    where: { id: "mainnet" },
    create: { id: "mainnet", nextBlock: start },
    update: {},
  });
  let next = cursor.nextBlock;
  // Check saved canonical tip and rewind until common ancestor. Cascading deletes remove orphaned raw events.
  let reorg = false;
  while (next > start) {
    const saved = await db.block.findUnique({ where: { number: next - 1n } });
    const canonical = await client.getBlock({ blockNumber: next - 1n });
    if (saved?.hash === canonical.hash) break;
    next--;
    reorg = true;
  }
  if (reorg)
    await atomic(
      db,
      async (tx) => {
        await tx.block.deleteMany({ where: { number: { gte: next } } });
        await tx.cursor.update({
          where: { id: "mainnet" },
          data: { nextBlock: next },
        });
        await rebuild(tx);
      },
      { timeout: 120000 },
    );
  const last = next + 9n < safe ? next + 9n : safe;
  for (let n = next; n <= last && !stopping; n++) {
    const block = await client.getBlock({ blockNumber: n });
    if (!block.hash) throw Error("Pending block");
    const previous = await db.block.findUnique({ where: { number: n - 1n } });
    if (previous && previous.hash !== block.parentHash)
      throw Error("Reorg during scan");
    // Query the whole block so markets created within this block are also discovered.
    const logs = await client.request({
      method: "eth_getLogs",
      params: [{ fromBlock: toHex(n), toBlock: toHex(n) }],
    });
    const markets = new Set(
      (await db.launch.findMany({ select: { market: true } })).map(
        (x) => x.market,
      ),
    );
    const tokens = new Set(
      (await db.launch.findMany({ select: { token: true } })).map(
        (x) => x.token,
      ),
    );
    for (const log of logs) {
      if (log.address.toLowerCase() === factory) {
        try {
          const e = decodeEventLog({
            abi: factoryAbi,
            data: log.data,
            topics: log.topics,
          });
          if (e.eventName === "LaunchCreated") {
            tokens.add(e.args.token.toLowerCase());
            markets.add(e.args.market.toLowerCase());
          }
        } catch {}
      }
    }
    const transferAbi = parseAbi([
      "event Transfer(address indexed from,address indexed to,uint256 value)",
    ]);
    const decoded: any[] = [];
    for (const log of logs) {
      try {
        const addr = log.address.toLowerCase();
        if (
          addr !== factory &&
          addr !== vault &&
          addr !== registry &&
          !markets.has(addr) &&
          !tokens.has(addr)
        )
          continue;
        const event = decodeEventLog({
          abi: [
            ...factoryAbi,
            ...vaultAbi,
            ...marketAbi,
            ...registryAbi,
            ...transferAbi,
          ],
          data: log.data,
          topics: log.topics,
        });
        if (event.eventName === "LaunchCreated")
          markets.add((event.args as any).market.toLowerCase());
        const args: any = serial(event.args);
        if (
          addr === registry &&
          (event.eventName === "StockReviewed" ||
            event.eventName === "Suspension")
        )
          args.snapshot = serial(
            await client.readContract({
              address: registry,
              abi: registryAbi,
              functionName: "assets",
              args: [args.asset],
              blockNumber: n,
            }),
          );
        decoded.push({
          id: `4663:${log.transactionHash}:${log.logIndex}`,
          blockNumber: n,
          address: addr,
          transactionHash: log.transactionHash!,
          logIndex: Number(log.logIndex),
          kind:
            event.eventName === "Transfer"
              ? "LaunchTokenTransfer"
              : event.eventName,
          args,
        });
      } catch {
        /* unrelated ABI event */
      }
    }
    const verify = await client.getBlock({ blockNumber: n });
    if (verify.hash !== block.hash) throw Error("Reorg during block fetch");
    await atomic(
      db,
      async (tx) => {
        await tx.block.create({
          data: {
            number: n,
            hash: block.hash!,
            parentHash: block.parentHash,
            timestamp: new Date(Number(block.timestamp) * 1000),
          },
        });
        await tx.protocolEvent.createMany({
          data: decoded,
          skipDuplicates: true,
        });
        await tx.cursor.update({
          where: { id: "mainnet" },
          data: { nextBlock: n + 1n },
        });
        if (decoded.length) await rebuild(tx);
      },
      { timeout: 120000 },
    );
  }
}
let failures = 0;
while (!stopping) {
  try {
    await db.$transaction(
      async (tx) => {
        const locks = await tx.$queryRaw<
          Array<{ locked: boolean }>
        >`SELECT pg_try_advisory_xact_lock(4663) AS locked`;
        if (locks[0]?.locked) await sync(tx);
      },
      { timeout: 120000 },
    );
    failures = 0;
  } catch (e) {
    failures++;
    console.error("Indexer sync failed", e instanceof Error ? e.message : e);
  }
  await new Promise((r) =>
    setTimeout(r, Math.min(60000, 2000 * 2 ** Math.min(failures, 5))),
  );
}
await db.$disconnect();
