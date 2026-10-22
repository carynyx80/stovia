import { database } from "../../../../lib/database";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
    const row = await database().tokenMetadata.findUnique({
      where: { id },
      select: { image: true, mime: true },
    });
    if (!row?.image || !row.mime) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(row.image), {
      headers: {
        "Content-Type": row.mime,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
        "Cache-Control": "public,max-age=31536000,immutable",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
