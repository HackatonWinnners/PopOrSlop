import { z } from "zod";
import { db } from "../../db/client";
import { waitlistSignups } from "../../db/schema";
import { publicProcedure, router } from "../trpc";

// Per-IP-agnostic naive throttle: one row per email regardless of retries.
export const waitlistRouter = router({
  join: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        fundName: z.string().max(200).optional(),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await db
        .insert(waitlistSignups)
        .values({ email: input.email.toLowerCase(), fundName: input.fundName, note: input.note })
        .onConflictDoNothing();
      return { ok: true };
    }),
});
