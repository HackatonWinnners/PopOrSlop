import "dotenv/config";
import { pricesMicro } from "@poporslop/lmsr";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/server/db/client";
import { lmsrState, markets, oddsSnapshots } from "../src/server/db/schema";

/**
 * Hourly cron: freeze current prices for every market still trading or
 * awaiting resolution. odds_snapshots is the future data product (spec §14)
 * and the input to the §17 Brier-vs-prior thesis test.
 */
async function main() {
  const rows = await db
    .select({ id: markets.id, b: markets.b, q: lmsrState.q })
    .from(markets)
    .innerJoin(lmsrState, eq(lmsrState.marketId, markets.id))
    .where(inArray(markets.status, ["OPEN", "LOCKED", "PROPOSED", "DISPUTE_WINDOW", "ESCALATED"]));

  const ts = new Date();
  if (rows.length) {
    await db.insert(oddsSnapshots).values(
      rows.map((r) => ({ marketId: r.id, ts, prices: pricesMicro({ q: r.q, b: r.b }) })),
    );
  }
  console.log(`snapshotted ${rows.length} markets at ${ts.toISOString()}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
