import "dotenv/config";
import { pool } from "../src/server/db/client";
import { lockDueMarkets } from "../src/server/services/resolution";

// Cron target (every minute): OPEN → LOCKED at close_at.
lockDueMarkets()
  .then((ids) => {
    if (ids.length) console.log(`locked: ${ids.join(", ")}`);
    return pool.end();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
