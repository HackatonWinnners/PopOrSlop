import { z } from "zod";
import { db } from "../../db/client";
import { waitlistSignups } from "../../db/schema";
import { publicProcedure, router } from "../trpc";

// Naive throttle: one row per (email, kind) regardless of retries.
export const waitlistRouter = router({
  join: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        /** "vc" wants the odds API; "startup" wants to be listed. */
        kind: z.enum(["vc", "startup"]).default("vc"),
        /** Fund name for vc, company name for startup. */
        fundName: z.string().max(200).optional(),
        link: z.string().max(500).optional(),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await db
        .insert(waitlistSignups)
        .values({
          email: input.email.toLowerCase(),
          kind: input.kind,
          fundName: input.fundName,
          link: input.link,
          note: input.note,
        })
        .onConflictDoNothing();
      return { ok: true };
    }),
});
