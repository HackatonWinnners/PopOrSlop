import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/server/db/client";
import { signup } from "../src/server/services/auth";
import { createMarket } from "../src/server/services/markets";

/**
 * W0 SummerUp demo seed (spec §12.1). The flagship winner market is created
 * live via the admin team-import flow the moment the team list drops — this
 * seeds the ambient markets plus an admin account.
 */
async function main() {
  const eventEnd = process.env.DEMO_CLOSE_AT
    ? new Date(process.env.DEMO_CLOSE_AT)
    : new Date(Date.now() + 7 * 24 * 3600 * 1000);

  // Admin account (idempotent-ish: fails if handle exists — fine for a seed).
  const admin = await signup({ handle: "admin" }).catch(() => null);
  if (admin) {
    await db.execute(sql`UPDATE users SET flags = flags || '{"admin": true}' WHERE id = ${admin.userId}`);
    console.log(`admin user created — session token (set as pos_session cookie):\n  ${admin.token}`);
  } else {
    console.log("admin user already exists, skipping");
  }

  const mk = (m: Parameters<typeof createMarket>[0]) =>
    createMarket(m).then(
      (r) => console.log(`listed: ${r.slug}`),
      (e: Error) => console.log(`skip ${m.slug}: ${e.message.slice(0, 60)}`),
    );

  await mk({
    slug: "submissions-over-20",
    title: "≥ 20 project submissions before the deadline?",
    type: "EVENT_DEMO",
    outcomes: ["YES", "NO"],
    criteriaMd:
      "Resolves YES if the official submission count at the deadline is ≥ 20. Organizers' count is final; no dispute window.",
    bPoints: 250,
    closeAt: eventEnd,
    positionCapPoints: 300,
  });

  await mk({
    slug: "judging-overtime",
    title: "Does judging run overtime?",
    type: "EVENT_DEMO",
    outcomes: ["YES", "NO"],
    criteriaMd:
      "Resolves YES if winners are announced later than the scheduled ceremony start + 30 minutes. Organizers' schedule is the reference; their decision is final.",
    bPoints: 250,
    closeAt: eventEnd,
    positionCapPoints: 300,
  });

  await mk({
    slug: "this-project-wins",
    title: "Will PopOrSlop itself win SummerUp?",
    type: "EVENT_DEMO",
    outcomes: ["YES", "NO"],
    criteriaMd:
      "Resolves YES if this project (PopOrSlop) is announced as the overall winner. We trade this market ourselves, self-flagged — watch for the insider badge. Organizers' decision is final.",
    bPoints: 250,
    closeAt: eventEnd,
    // Cheeky honest prior: most projects don't win.
    priors: [0.1, 0.9],
    positionCapPoints: 300,
  });

  console.log("demo seed complete");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
