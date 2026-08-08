import { createHash } from "node:crypto";
import {
  pts,
  seedFromPriors,
  worstCaseLoss,
  worstCaseLossForPriors,
} from "@poporslop/lmsr";
import { db } from "../db/client";
import { lmsrState, markets } from "../db/schema";
import { SYSTEM, postEntries } from "./ledger";

export type MarketTypeName =
  | "COHORT_INDEX"
  | "SURVIVAL"
  | "REG_EVENT"
  | "EXIT"
  | "FUNDING_BINARY"
  | "FUNDING_BUCKET"
  | "INVESTOR_IN"
  | "MILESTONE_PUBLIC"
  | "EVENT_DEMO";

export interface CreateMarketInput {
  slug: string;
  title: string;
  type: MarketTypeName;
  outcomes: string[];
  criteriaMd: string;
  /** Liquidity in whole points (spec tiers: 100 | 250 | 1000). */
  bPoints: number;
  closeAt: Date;
  resolveBy?: Date;
  /** Opening probabilities; uniform if omitted. Normalized internally. */
  priors?: number[];
  iClass?: number;
  mClass?: number;
  /** Max cost basis per user per market, whole points (I3: 500, W0 event: 300). */
  positionCapPoints?: number;
  companyId?: string;
  cohortId?: string;
}

export function hashCriteria(criteriaMd: string): string {
  return createHash("sha256").update(criteriaMd, "utf8").digest("hex");
}

/**
 * List a market: freeze criteria (SHA-256), seed the AMM at the prior, and
 * post the SEED_SUBSIDY budget (treasury → amm_pool) so worst-case house
 * exposure is visible in the ledger from the moment of listing.
 */
export async function createMarket(input: CreateMarketInput) {
  const n = input.outcomes.length;
  if (n < 2 || n > 64) throw new Error(`outcomes must be 2..64, got ${n}`);
  if (input.priors && input.priors.length !== n) {
    throw new Error("priors length must match outcomes");
  }
  const b = pts(input.bPoints);
  const priors = input.priors ?? Array.from({ length: n }, () => 1 / n);
  const q0 = seedFromPriors(priors, b);
  const subsidy = input.priors ? worstCaseLossForPriors(priors, b) : worstCaseLoss(b, n);

  return db.transaction(async (tx) => {
    const [market] = await tx
      .insert(markets)
      .values({
        slug: input.slug,
        title: input.title,
        type: input.type,
        outcomes: input.outcomes,
        criteriaMd: input.criteriaMd,
        criteriaHash: hashCriteria(input.criteriaMd),
        b,
        closeAt: input.closeAt,
        resolveBy: input.resolveBy,
        iClass: input.iClass ?? 0,
        mClass: input.mClass ?? 0,
        positionCap: input.positionCapPoints !== undefined ? pts(input.positionCapPoints) : null,
        seedPriors: priors,
        companyId: input.companyId,
        cohortId: input.cohortId,
      })
      .returning();

    await tx.insert(lmsrState).values({ marketId: market!.id, q: q0, version: 0 });

    await postEntries(tx, [
      { userId: SYSTEM.houseTreasury, delta: -subsidy, reason: "SEED_SUBSIDY", refId: market!.id },
      { userId: SYSTEM.ammPool, delta: subsidy, reason: "SEED_SUBSIDY", refId: market!.id },
    ]);

    return market!;
  });
}
