import { NextResponse } from "next/server";
import { database } from "../../../../lib/database";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
    const row = await database().tokenMetadata.findUnique({ where: { id } });
    if (!row) return new Response(null, { status: 404 });
    const origin = new URL(
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    ).origin;
    return NextResponse.json(
      {
        ...(row.document as object),
        ...(row.image ? { image: origin + "/api/media/" + row.id } : {}),
        owner: row.owner,
      },
      { headers: { "Cache-Control": "public,max-age=31536000,immutable" } },
    );
  } catch {
    return new Response(null, { status: 503 });
  }
}
