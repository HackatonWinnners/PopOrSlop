import { sql } from "drizzle-orm";
import { db } from "../src/server/db/client";
import { signup } from "../src/server/services/auth";
import { type CreateMarketInput, createMarket } from "../src/server/services/markets";

/** Wipe all data except the system accounts (they're re-zeroed). */
export async function resetDb(): Promise<void> {
  await db.execute(sql`
    TRUNCATE trades, positions, ledger, lmsr_state, resolution_proposals, disputes,
             odds_snapshots, event_company_matches, oracle_events, sessions,
             magic_link_tokens, waitlist_signups RESTART IDENTITY CASCADE
  `);
  await db.execute(sql`DELETE FROM markets`);
  await db.execute(sql`DELETE FROM companies`);
  await db.execute(sql`DELETE FROM cohorts`);
  await db.execute(sql`DELETE FROM users WHERE is_system = false`);
  await db.execute(sql`UPDATE users SET points_balance = 0 WHERE is_system = true`);
}

let userSeq = 0;
export async function makeUser(overrides?: { handle?: string }) {
  const { userId } = await signup({ handle: overrides?.handle ?? `trader${userSeq++}` });
  return userId;
}

let marketSeq = 0;
export async function makeMarket(overrides?: Partial<CreateMarketInput>) {
  const seq = marketSeq++;
  return createMarket({
    slug: `test-market-${seq}`,
    title: `Test market ${seq}`,
    type: "EVENT_DEMO",
    outcomes: ["YES", "NO"],
    criteriaMd: "Test criteria. Organizers' decision is final.",
    bPoints: 250,
    closeAt: new Date(Date.now() + 3600_000),
    ...overrides,
  });
}
