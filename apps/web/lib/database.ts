import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { stoviaDB?: PrismaClient };
export function database() {
  if (!process.env.DATABASE_URL) throw Error("Database not configured");
  return g.stoviaDB ?? (g.stoviaDB = new PrismaClient());
}
export function json(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}
