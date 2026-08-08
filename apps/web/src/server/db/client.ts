import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.TEST === "1"
    ? (process.env.TEST_DATABASE_URL ?? "postgres://poporslop:poporslop@localhost:5433/poporslop_test")
    : (process.env.DATABASE_URL ?? "postgres://poporslop:poporslop@localhost:5433/poporslop");

// bigint columns come back as JS bigint, not string.
pg.types.setTypeParser(20, BigInt);

const globalForDb = globalThis as unknown as { pgPool?: pg.Pool };

export const pool =
  globalForDb.pgPool ??
  new pg.Pool({
    connectionString,
    max: 10,
  });
if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
