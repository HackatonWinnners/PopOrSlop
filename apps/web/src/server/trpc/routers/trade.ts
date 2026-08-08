import { sharesForBudget, tradeCost } from "@poporslop/lmsr";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { lmsrState, markets } from "../../db/schema";
import { executeTrade } from "../../services/trade";
import { authedProcedure, publicProcedure, router } from "../trpc";

const bigintFromString = z
  .union([z.bigint(), z.string().regex(/^-?\d+$/)])
  .transform((v) => (typeof v === "bigint" ? v : BigInt(v)));

export const tradeRouter = router({
  /** Preview only — the execute call re-derives everything server-side. */
  quote: publicProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        outcomeIdx: z.number().int().min(0),
        budget: bigintFromString.optional(),
        deltaShares: bigintFromString.optional(),
      }),
    )
    .query(async ({ input }) => {
      const [market] = await db.select().from(markets).where(eq(markets.id, input.marketId));
      const [state] = await db.select().from(lmsrState).where(eq(lmsrState.marketId, input.marketId));
      if (!market || !state) return null;
      const engine = { q: state.q, b: market.b };
      if (input.budget !== undefined) {
        const delta = sharesForBudget(engine, input.outcomeIdx, input.budget);
        return { deltaShares: delta, cost: tradeCost(engine, input.outcomeIdx, delta) };
      }
      if (input.deltaShares !== undefined) {
        return {
          deltaShares: input.deltaShares,
          cost: tradeCost(engine, input.outcomeIdx, input.deltaShares),
        };
      }
      return null;
    }),

  execute: authedProcedure
    .input(
      z.object({
        marketId: z.string().uuid(),
        outcomeIdx: z.number().int().min(0),
        deltaShares: bigintFromString.optional(),
        budget: bigintFromString.optional(),
        maxCost: bigintFromString.optional(),
        selfFlagged: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return executeTrade({
        userId: ctx.user.id,
        marketId: input.marketId,
        outcomeIdx: input.outcomeIdx,
        deltaShares: input.deltaShares,
        budget: input.budget,
        maxCost: input.maxCost,
        selfFlagged: input.selfFlagged,
      });
    }),
});
