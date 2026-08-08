import { adminRouter, disputeRouter } from "./routers/admin";
import { marketRouter } from "./routers/market";
import { portfolioRouter } from "./routers/portfolio";
import { tradeRouter } from "./routers/trade";
import { waitlistRouter } from "./routers/waitlist";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  market: marketRouter,
  trade: tradeRouter,
  portfolio: portfolioRouter,
  admin: adminRouter,
  dispute: disputeRouter,
  waitlist: waitlistRouter,
  me: publicProcedure.query(({ ctx }) =>
    ctx.user
      ? {
          id: ctx.user.id,
          handle: ctx.user.handle,
          team: ctx.user.team,
          pointsBalance: ctx.user.pointsBalance,
          isAdmin: Boolean((ctx.user.flags as Record<string, unknown>).admin),
        }
      : null,
  ),
});

export type AppRouter = typeof appRouter;
