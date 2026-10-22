import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({
    service: "stovia-web",
    status: "ok",
    chainId: 4663,
  });
}
