import { pts } from "@poporslop/lmsr";
import { and, eq, lte, sql } from "drizzle-orm";
import { type Tx, db } from "../db/client";
import { disputes, markets, positions, resolutionProposals } from "../db/schema";
import { DomainError } from "./errors";
import { type LedgerEntry, SYSTEM, postEntries } from "./ledger";
import { lockMarket } from "./locks";

export const DISPUTE_STAKE = pts(50);
export const DISPUTE_BOUNTY = pts(50);

/**
 * State machine (spec §7). All transitions run under the per-market advisory
 * lock with a status-guarded UPDATE, so cron re-entry and double-clicks
 * no-op instead of double-paying.
 *
 * OPEN → LOCKED → DISPUTE_WINDOW → RESOLVED
 *                       ├→ ESCALATED → RESOLVED
 * any pre-RESOLVED → NA_REFUNDED
 */

/** OPEN → LOCKED for every market past close_at. Cron: every minute. */
export async function lockDueMarkets(now = new Date()): Promise<string[]> {
  const rows = await db
    .update(markets)
    .set({ status: "LOCKED" })
    .where(and(eq(markets.status, "OPEN"), lte(markets.closeAt, now)))
    .returning({ id: markets.id });
  return rows.map((r) => r.id);
}

export interface EvidenceItem {
  source: string;
  externalRef?: string;
  url?: string;
  archivedUrl?: string;
  fetchedAt?: string;
  sha256?: string;
  summary: string;
}

/**
 * LOCKED → DISPUTE_WINDOW: post the proposed outcome with its evidence
 * bundle. disputeWindowHours = 0 is the W0 event mode (organizers final).
 */
export async function postResolution(opts: {
  marketId: string;
  outcomeIdx: number;
  evidence: EvidenceItem[];
  proposer: string;
  disputeWindowHours?: number;
  /** Promote an existing draft (auto_resolver) instead of inserting a new row. */
  fromProposalId?: string;
}): Promise<void> {
  const windowMs = (opts.disputeWindowHours ?? 48) * 3600 * 1000;
  await db.transaction(async (tx) => {
    await lockMarket(tx, opts.marketId);
    const [market] = await tx.select().from(markets).where(eq(markets.id, opts.marketId));
    if (!market) throw new DomainError("MARKET_NOT_FOUND");
    if (market.status !== "LOCKED") {
      throw new DomainError("BAD_STATE", `cannot propose on ${market.status} market`);
    }
    if (opts.outcomeIdx < 0 || opts.outcomeIdx >= market.outcomes.length) {
      throw new DomainError("BAD_STATE", "outcome out of range");
    }
    const now = new Date();
    if (opts.fromProposalId) {
      const updated = await tx
        .update(resolutionProposals)
        .set({ status: "posted" })
        .where(
          and(
            eq(resolutionProposals.id, opts.fromProposalId),
            eq(resolutionProposals.marketId, opts.marketId),
            eq(resolutionProposals.status, "draft"),
          ),
        )
        .returning({ id: resolutionProposals.id });
      if (updated.length !== 1) throw new DomainError("BAD_STATE", "draft not found or already posted");
    } else {
      await tx.insert(resolutionProposals).values({
        marketId: opts.marketId,
        outcomeIdx: opts.outcomeIdx,
        evidence: opts.evidence,
        proposer: opts.proposer,
        status: "posted",
      });
    }
    const updated = await tx
      .update(markets)
      .set({
        status: "DISPUTE_WINDOW",
        proposedAt: now,
        disputeDeadline: new Date(now.getTime() + windowMs),
        resolvedOutcome: opts.outcomeIdx,
      })
      .where(and(eq(markets.id, opts.marketId), eq(markets.status, "LOCKED")))
      .returning({ id: markets.id });
    if (updated.length !== 1) throw new DomainError("BAD_STATE", "status changed underneath");
  });
}

/**
 * Pay out a market whose winning outcome is already fixed on the row.
 * Idempotent via the status guard. One balanced ledger group per market:
 * winners paid 1 µpt per µshare (pure bigint), positions zeroed, and the
 * market's residual AMM P&L swept pool → treasury so per-market subsidy
 * consumption is auditable.
 */
async function payoutLocked(tx: Tx, marketId: string, fromStatuses: ("DISPUTE_WINDOW" | "ESCALATED")[]): Promise<void> {
  const [market] = await tx.select().from(markets).where(eq(markets.id, marketId));
  if (!market) throw new DomainError("MARKET_NOT_FOUND");
  if (!fromStatuses.includes(market.status as never)) {
    throw new DomainError("BAD_STATE", `cannot pay out ${market.status} market`);
  }
  if (market.resolvedOutcome === null) throw new DomainError("BAD_STATE", "no outcome set");

  const winners = await tx
    .select()
    .from(positions)
    .where(and(eq(positions.marketId, marketId), eq(positions.outcomeIdx, market.resolvedOutcome)));

  const entries: LedgerEntry[] = [];
  let payoutTotal = 0n;
  for (const pos of winners) {
    if (pos.shares <= 0n) continue;
    // 1 µshare of the winner pays exactly 1 µpt.
    entries.push({ userId: pos.userId, delta: pos.shares, reason: "PAYOUT", refId: marketId });
    payoutTotal += pos.shares;
  }
  if (payoutTotal > 0n) {
    entries.push({ userId: SYSTEM.ammPool, delta: -payoutTotal, reason: "PAYOUT", refId: marketId });
  }
  if (entries.length > 0) await postEntries(tx, entries);

  await sweepMarketResidual(tx, marketId);
  await tx.delete(positions).where(eq(positions.marketId, marketId));

  const updated = await tx
    .update(markets)
    .set({ status: "RESOLVED", resolvedAt: new Date() })
    .where(and(eq(markets.id, marketId), sql`${markets.status} IN ('DISPUTE_WINDOW', 'ESCALATED')`))
    .returning({ id: markets.id });
  if (updated.length !== 1) throw new DomainError("BAD_STATE", "status changed underneath");
}

/**
 * Sweep this market's residual AMM P&L (seed subsidy + trade flow − payouts/
 * refunds already posted) from amm_pool back to house_treasury. After the
 * sweep the pool carries nothing for this market; the treasury's net loss on
 * the market is bounded by the seed subsidy — asserted here.
 */
async function sweepMarketResidual(tx: Tx, marketId: string): Promise<void> {
  const [flow] = await tx
    .select({
      residual: sql<bigint>`(
        COALESCE((SELECT SUM(t.cost) FROM trades t WHERE t.market_id = ${marketId}), 0)
        + COALESCE((SELECT SUM(l.delta) FROM ledger l
                    WHERE l.user_id = ${SYSTEM.ammPool}
                      AND l.ref_id = ${marketId}
                      AND l.reason IN ('SEED_SUBSIDY', 'PAYOUT', 'NA_REFUND', 'RESOLUTION_SWEEP')), 0)
      )::bigint`,
    })
    .from(sql`(SELECT 1) AS one`);

  const residual = flow?.residual ?? 0n;
  if (residual !== 0n) {
    await postEntries(tx, [
      { userId: SYSTEM.ammPool, delta: -residual, reason: "RESOLUTION_SWEEP", refId: marketId },
      { userId: SYSTEM.houseTreasury, delta: residual, reason: "RESOLUTION_SWEEP", refId: marketId },
    ]);
  }
  if (residual < 0n) {
    // House ate more than it collected on this market — must stay within the
    // seeded budget. Loud log either way; the demo dashboard reads this.
    console.warn(`[resolution] market ${marketId} residual sweep ${residual} µpts (house loss beyond flow)`);
  }
}

/** DISPUTE_WINDOW → RESOLVED for every market past its deadline with no open dispute. Cron. */
export async function finalizeDueMarkets(now = new Date()): Promise<string[]> {
  const due = await db
    .select({ id: markets.id })
    .from(markets)
    .where(and(eq(markets.status, "DISPUTE_WINDOW"), lte(markets.disputeDeadline, now)));

  const done: string[] = [];
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      await lockMarket(tx, id);
      const [open] = await tx
        .select({ id: disputes.id })
        .from(disputes)
        .where(and(eq(disputes.marketId, id), eq(disputes.status, "open")));
      if (open) return; // escalation is handling it
      const [m] = await tx.select().from(markets).where(eq(markets.id, id));
      if (m?.status !== "DISPUTE_WINDOW") return; // already handled
      await payoutLocked(tx, id, ["DISPUTE_WINDOW"]);
      done.push(id);
    });
  }
  return done;
}

/** Immediate resolve for the W0 demo (window = 0): propose then finalize in one call. */
export async function resolveNow(opts: {
  marketId: string;
  outcomeIdx: number;
  evidence: EvidenceItem[];
  proposer: string;
}): Promise<void> {
  await postResolution({ ...opts, disputeWindowHours: 0 });
  await db.transaction(async (tx) => {
    await lockMarket(tx, opts.marketId);
    await payoutLocked(tx, opts.marketId, ["DISPUTE_WINDOW"]);
  });
}

/**
 * N/A path: criteria turned out ambiguous/unresolvable. Refund every user's
 * positive cost basis, zero positions, sweep the (house-eaten) residual, log it.
 */
export async function naRefund(marketId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockMarket(tx, marketId);
    const [market] = await tx.select().from(markets).where(eq(markets.id, marketId));
    if (!market) throw new DomainError("MARKET_NOT_FOUND");
    if (market.status === "RESOLVED" || market.status === "NA_REFUNDED") {
      throw new DomainError("BAD_STATE", `cannot NA-refund ${market.status} market`);
    }

    const rows = await tx
      .select({
        userId: positions.userId,
        basis: sql<bigint>`SUM(${positions.costBasis})::bigint`,
      })
      .from(positions)
      .where(eq(positions.marketId, marketId))
      .groupBy(positions.userId);

    const entries: LedgerEntry[] = [];
    let refundTotal = 0n;
    for (const row of rows) {
      if (row.basis <= 0n) continue; // net sellers keep proceeds
      entries.push({ userId: row.userId, delta: row.basis, reason: "NA_REFUND", refId: marketId });
      refundTotal += row.basis;
    }
    if (refundTotal > 0n) {
      entries.push({ userId: SYSTEM.ammPool, delta: -refundTotal, reason: "NA_REFUND", refId: marketId });
      await postEntries(tx, entries);
    }

    await sweepMarketResidual(tx, marketId);
    await tx.delete(positions).where(eq(positions.marketId, marketId));

    const updated = await tx
      .update(markets)
      .set({ status: "NA_REFUNDED", resolvedAt: new Date() })
      .where(and(eq(markets.id, marketId), sql`${markets.status} NOT IN ('RESOLVED', 'NA_REFUNDED')`))
      .returning({ id: markets.id });
    if (updated.length !== 1) throw new DomainError("BAD_STATE", "status changed underneath");
    console.warn(`[resolution] market ${marketId} N/A-refunded (${refundTotal} µpts returned at cost basis)`);
  });
}

/** DISPUTE_WINDOW → ESCALATED: any user stakes 50 pts to dispute. */
export async function fileDispute(opts: {
  marketId: string;
  userId: string;
  reason: string;
}): Promise<string> {
  return db.transaction(async (tx) => {
    await lockMarket(tx, opts.marketId);
    const [market] = await tx.select().from(markets).where(eq(markets.id, opts.marketId));
    if (!market) throw new DomainError("MARKET_NOT_FOUND");
    if (market.status !== "DISPUTE_WINDOW") {
      throw new DomainError("BAD_STATE", "market is not in its dispute window");
    }
    if (market.disputeDeadline && market.disputeDeadline.getTime() <= Date.now()) {
      throw new DomainError("BAD_STATE", "dispute window has closed");
    }

    const [dispute] = await tx
      .insert(disputes)
      .values({ marketId: opts.marketId, userId: opts.userId, stake: DISPUTE_STAKE, reason: opts.reason })
      .returning({ id: disputes.id });

    await postEntries(tx, [
      { userId: opts.userId, delta: -DISPUTE_STAKE, reason: "DISPUTE_STAKE", refId: dispute!.id },
      { userId: SYSTEM.disputeEscrow, delta: DISPUTE_STAKE, reason: "DISPUTE_STAKE", refId: dispute!.id },
    ]);

    const updated = await tx
      .update(markets)
      .set({ status: "ESCALATED" })
      .where(and(eq(markets.id, opts.marketId), eq(markets.status, "DISPUTE_WINDOW")))
      .returning({ id: markets.id });
    if (updated.length !== 1) throw new DomainError("BAD_STATE", "status changed underneath");
    return dispute!.id;
  });
}

/**
 * Council verdict on an escalated market. Overturned: disputer's stake back
 * + bounty, outcome corrected. Upheld: stake slashed to treasury. Either way
 * the market pays out and lands RESOLVED.
 */
export async function resolveDispute(opts: {
  disputeId: string;
  upheld: boolean;
  /** Required when overturned: the corrected outcome index. */
  correctedOutcomeIdx?: number;
  councilUserId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [dispute] = await tx.select().from(disputes).where(eq(disputes.id, opts.disputeId));
    if (!dispute) throw new DomainError("BAD_STATE", "dispute not found");
    if (dispute.status !== "open") throw new DomainError("BAD_STATE", "dispute already resolved");

    await lockMarket(tx, dispute.marketId);
    const [market] = await tx.select().from(markets).where(eq(markets.id, dispute.marketId));
    if (market?.status !== "ESCALATED") throw new DomainError("BAD_STATE", "market not escalated");

    if (opts.upheld) {
      // Frivolous dispute: stake slashed to treasury.
      await postEntries(tx, [
        { userId: SYSTEM.disputeEscrow, delta: -dispute.stake, reason: "DISPUTE_SLASH", refId: dispute.id },
        { userId: SYSTEM.houseTreasury, delta: dispute.stake, reason: "DISPUTE_SLASH", refId: dispute.id },
      ]);
    } else {
      if (opts.correctedOutcomeIdx === undefined) {
        throw new DomainError("BAD_STATE", "overturned dispute needs correctedOutcomeIdx");
      }
      if (opts.correctedOutcomeIdx < 0 || opts.correctedOutcomeIdx >= market.outcomes.length) {
        throw new DomainError("BAD_STATE", "corrected outcome out of range");
      }
      await tx
        .update(markets)
        .set({ resolvedOutcome: opts.correctedOutcomeIdx })
        .where(eq(markets.id, dispute.marketId));
      await postEntries(tx, [
        { userId: SYSTEM.disputeEscrow, delta: -dispute.stake, reason: "DISPUTE_RETURN", refId: dispute.id },
        { userId: dispute.userId, delta: dispute.stake, reason: "DISPUTE_RETURN", refId: dispute.id },
      ]);
      await postEntries(tx, [
        { userId: SYSTEM.houseTreasury, delta: -DISPUTE_BOUNTY, reason: "DISPUTE_BOUNTY", refId: dispute.id },
        { userId: dispute.userId, delta: DISPUTE_BOUNTY, reason: "DISPUTE_BOUNTY", refId: dispute.id },
      ]);
    }

    await tx
      .update(disputes)
      .set({
        status: opts.upheld ? "upheld" : "overturned",
        resolvedBy: opts.councilUserId,
        resolvedAt: new Date(),
      })
      .where(eq(disputes.id, dispute.id));

    await payoutLocked(tx, dispute.marketId, ["ESCALATED"]);
  });
}
