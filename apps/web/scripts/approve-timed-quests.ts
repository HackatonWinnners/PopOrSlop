import "dotenv/config";
import { pool } from "../src/server/db/client";
import { sweepTimedQuestApprovals } from "../src/server/services/quests";

/**
 * Settle timed quest claims that have come due (cron: every minute).
 *
 * The page-load sweep in quest.list already settles whoever is looking, so
 * this only matters for people who claim and never come back — but they've
 * still earned the points, and the leaderboard should say so.
 *
 * Idempotent: the sweep only grants for rows it actually flips out of
 * 'pending', so overlapping runs can't double-pay.
 */
async function main() {
  const n = await sweepTimedQuestApprovals();
  if (n > 0) console.log(`approved ${n} timed quest claim(s)`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
