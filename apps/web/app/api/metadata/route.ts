import { NextResponse } from "next/server";
import { verifyMessage, isHex, isAddress } from "viem";
import { database } from "../../../lib/database";
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 2200000)
      return NextResponse.json({ error: "Upload too large" }, { status: 413 });
    const form = await request.formData(),
      nonce = String(form.get("nonce") || ""),
      signature = String(form.get("signature") || ""),
      owner = String(form.get("owner") || "").toLowerCase();
    if (!isAddress(owner) || !isHex(signature))
      return NextResponse.json(
        { error: "Invalid signature input" },
        { status: 400 },
      );
    const db = database(),
      challenge = await db.uploadChallenge.findUnique({ where: { nonce } });
    if (
      !challenge ||
      challenge.address !== owner ||
      challenge.usedAt ||
      challenge.expiresAt.getTime() < Date.now()
    )
      return NextResponse.json(
        { error: "Challenge expired or consumed" },
        { status: 401 },
      );
    if (
      !(await verifyMessage({
        address: owner,
        message: challenge.message,
        signature,
      }))
    )
      return NextResponse.json(
        { error: "Signature does not match" },
        { status: 401 },
      );
    const raw = String(form.get("document") || "");
    if (raw.length > 6000)
      return NextResponse.json(
        { error: "Metadata too large" },
        { status: 413 },
      );
    const input = JSON.parse(raw);
    if (
      typeof input.name !== "string" ||
      input.name.length > 48 ||
      typeof input.ticker !== "string" ||
      !/^[A-Z0-9]{2,10}$/.test(input.ticker) ||
      typeof input.description !== "string" ||
      input.description.length > 1000
    )
      return NextResponse.json({ error: "Invalid metadata" }, { status: 400 });
    const document = {
      name: input.name,
      ticker: input.ticker,
      description: input.description,
      website: String(input.website || "").slice(0, 300),
      x: String(input.x || "").slice(0, 300),
      telegram: String(input.telegram || "").slice(0, 300),
    };
    const file = form.get("image");
    let image: Buffer | undefined, mime: string | undefined;
    if (file instanceof File && file.size) {
      if (file.size > 2000000) throw Error("Image exceeds 2 MB");
      image = Buffer.from(await file.arrayBuffer());
      const png = image
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        jpeg = image[0] === 255 && image[1] === 216 && image[2] === 255,
        webp =
          image.subarray(0, 4).toString() === "RIFF" &&
          image.subarray(8, 12).toString() === "WEBP";
      mime = png
        ? "image/png"
        : jpeg
          ? "image/jpeg"
          : webp
            ? "image/webp"
            : undefined;
      if (!mime)
        return NextResponse.json(
          { error: "Image format unsupported" },
          { status: 400 },
        );
    }
    const record = await db.$transaction(async (tx) => {
      const consumed = await tx.uploadChallenge.updateMany({
        where: { nonce, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw Error("Challenge replay");
      return tx.tokenMetadata.create({
        data: {
          owner,
          document,
          image: image ? new Uint8Array(image) : undefined,
          mime,
        },
      });
    });
    const origin = new URL(
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    ).origin;
    return NextResponse.json(
      { uri: origin + "/api/metadata/" + record.id },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "Metadata could not be stored" },
      { status: 503 },
    );
  }
}
