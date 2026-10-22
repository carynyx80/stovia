import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { isAddress } from "viem";
import { database } from "../../../../lib/database";
export async function POST(request: Request) {
  try {
    const { address } = await request.json();
    if (typeof address !== "string" || !isAddress(address))
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    const db = database();
    const recent = await db.uploadChallenge.count({
      where: {
        address: address.toLowerCase(),
        createdAt: { gt: new Date(Date.now() - 60000) },
      },
    });
    if (recent >= 3)
      return NextResponse.json(
        { error: "Try again in one minute" },
        { status: 429 },
      );
    const nonce = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 300000);
    const origin = new URL(
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    ).origin;
    const message = `STOVIA metadata upload\nOrigin: ${origin}\nWallet: ${address.toLowerCase()}\nChain ID: 4663\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}\nThis authorizes one metadata upload, not a transaction.`;
    await db.uploadChallenge.create({
      data: { nonce, address: address.toLowerCase(), message, expiresAt },
    });
    return NextResponse.json({ nonce, message });
  } catch {
    return NextResponse.json(
      { error: "Metadata storage unavailable" },
      { status: 503 },
    );
  }
}
