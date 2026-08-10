import { DAILY_DRIP } from "../services/auth";
import { claimDailyDrip } from "../services/points";
import { adminRouter, disputeRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { marketRouter } from "./routers/market";
import { portfolioRouter } from "./routers/portfolio";
import { questRouter } from "./routers/quest";
import { startupRouter } from "./routers/startup";
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
  quest: questRouter,
  startup: startupRouter,
  auth: authRouter,
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    // Daily active drip (spec §6.2): opening the app with a live session
    // counts as active; the claim is once per UTC day and race-safe.
    const dripped = await claimDailyDrip(ctx.user.id);
    return {
      id: ctx.user.id,
      handle: ctx.user.handle,
      team: ctx.user.team,
      email: ctx.user.email,
      pendingEmail: ctx.user.pendingEmail,
      emailVerified: Boolean(ctx.user.emailVerifiedAt),
      pointsBalance: ctx.user.pointsBalance + (dripped ? DAILY_DRIP : 0n),
      isAdmin: Boolean((ctx.user.flags as Record<string, unknown>).admin),
    };
  }),
});

export type AppRouter = typeof appRouter;
