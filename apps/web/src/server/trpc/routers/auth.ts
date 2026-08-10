import { z } from "zod";
import { requestEmailVerification } from "../../services/auth";
import { DomainError } from "../../services/errors";
import { authedProcedure, router } from "../trpc";

/**
 * Modest per-user throttle on verification sends — the mailbox owner is the
 * only beneficiary, but an unthrottled resend button is a free spam cannon.
 */
const SENDS_PER_HOUR = 5;
const sends = new Map<string, { count: number; resetAt: number }>();
function throttled(userId: string): boolean {
  const now = Date.now();
  const s = sends.get(userId);
  if (!s || s.resetAt < now) {
    sends.set(userId, { count: 1, resetAt: now + 3600_000 });
    return false;
  }
  s.count++;
  return s.count > SENDS_PER_HOUR;
}

export const authRouter = router({
  /**
   * Claim an address (or re-send the link for one already claimed) and mail
   * the verification link. Nothing on the account changes until it's clicked.
   */
  requestEmailVerification: authedProcedure
    .input(z.object({ email: z.string().email().max(254).optional() }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email ?? ctx.user.pendingEmail ?? ctx.user.email;
      if (!email) throw new DomainError("BAD_STATE", "no address to verify");
      if (throttled(ctx.user.id)) {
        throw new DomainError("BAD_STATE", "too many verification emails — try again later");
      }
      await requestEmailVerification(ctx.user.id, email, ctx.origin);
      return { sent: true, email };
    }),
});
