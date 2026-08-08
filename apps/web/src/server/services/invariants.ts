import { sql } from "drizzle-orm";
import { db } from "../db/client";

export interface InvariantViolation {
  invariant: string;
  detail: string;
}

/**
 * The three ledger invariants (plan §2) plus a positions↔trades recompute.
 * Run after every test suite, after load tests, from the admin panel live
 * on stage, and as a daily cron in prod-life.
 */
export async function checkInvariants(): Promise<InvariantViolation[]> {
  const violations: InvariantViolation[] = [];

  const global = await db.execute<{ sum: bigint | null }>(
    sql`SELECT COALESCE(SUM(delta), 0)::bigint AS sum FROM ledger`,
  );
  const globalSum = global.rows[0]?.sum ?? 0n;
  if (globalSum !== 0n) {
    violations.push({ invariant: "ledger-global-zero", detail: `SUM(delta) = ${globalSum}` });
  }

  const groups = await db.execute<{ entry_group: string; sum: bigint }>(
    sql`SELECT entry_group, SUM(delta)::bigint AS sum FROM ledger
        GROUP BY entry_group HAVING SUM(delta) <> 0 LIMIT 10`,
  );
  for (const g of groups.rows) {
    violations.push({
      invariant: "ledger-group-zero",
      detail: `entry_group ${g.entry_group} sums to ${g.sum}`,
    });
  }

  const balances = await db.execute<{ id: string; handle: string; cached: bigint; actual: bigint }>(
    sql`SELECT u.id, u.handle, u.points_balance AS cached, COALESCE(SUM(l.delta), 0)::bigint AS actual
        FROM users u LEFT JOIN ledger l ON l.user_id = u.id
        GROUP BY u.id, u.handle, u.points_balance
        HAVING u.points_balance <> COALESCE(SUM(l.delta), 0) LIMIT 10`,
  );
  for (const b of balances.rows) {
    violations.push({
      invariant: "balance-cache",
      detail: `${b.handle}: cached ${b.cached} ≠ ledger ${b.actual}`,
    });
  }

  // positions must equal the recompute from the trade tape (only for markets
  // still carrying positions — resolution deletes them).
  const positionsCheck = await db.execute<{ detail: string }>(
    sql`WITH recomputed AS (
          SELECT user_id, market_id, outcome_idx,
                 SUM(delta_shares)::bigint AS shares, SUM(cost)::bigint AS cost_basis
          FROM trades GROUP BY user_id, market_id, outcome_idx
        )
        SELECT COALESCE(p.user_id, r.user_id)::text || '/' || COALESCE(p.market_id, r.market_id)::text
               || ' outcome ' || COALESCE(p.outcome_idx, r.outcome_idx)::text AS detail
        FROM positions p
        FULL OUTER JOIN recomputed r
          ON p.user_id = r.user_id AND p.market_id = r.market_id AND p.outcome_idx = r.outcome_idx
        WHERE (p.market_id IS NOT NULL OR r.market_id IN (SELECT id FROM markets WHERE status IN ('OPEN','LOCKED','PROPOSED','DISPUTE_WINDOW','ESCALATED')))
          AND (COALESCE(p.shares, 0) <> COALESCE(r.shares, 0)
           OR COALESCE(p.cost_basis, 0) <> COALESCE(r.cost_basis, 0))
        LIMIT 10`,
  );
  for (const p of positionsCheck.rows) {
    violations.push({ invariant: "positions-recompute", detail: p.detail });
  }

  return violations;
}
