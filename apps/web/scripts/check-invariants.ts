import "dotenv/config";
import { pool } from "../src/server/db/client";
import { checkInvariants } from "../src/server/services/invariants";

async function main() {
  const violations = await checkInvariants();
  if (violations.length === 0) {
    console.log("✓ all invariants hold (ledger zero-sum, group balance, balance cache, positions recompute)");
  } else {
    for (const v of violations) console.error(`✗ ${v.invariant}: ${v.detail}`);
    process.exitCode = 1;
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
