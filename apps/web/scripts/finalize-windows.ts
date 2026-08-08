import "dotenv/config";
import { pool } from "../src/server/db/client";
import { finalizeDueMarkets } from "../src/server/services/resolution";

// Cron target (every few minutes): DISPUTE_WINDOW → RESOLVED + payout once
// the window passes with no open dispute.
finalizeDueMarkets()
  .then((ids) => {
    if (ids.length) console.log(`finalized: ${ids.join(", ")}`);
    return pool.end();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
