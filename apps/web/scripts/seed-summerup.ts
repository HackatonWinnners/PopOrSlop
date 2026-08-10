import "dotenv/config";
import { pool } from "../src/server/db/client";
import {
  SUMMERUP_MARKET_SLUG,
  SUMMERUP_TEAMS as TEAMS,
} from "../src/lib/summerup-teams";
import { createMarket } from "../src/server/services/markets";

/**
 * List the flagship SummerUp market: one categorical outcome per team, in
 * roster order. The roster itself lives in src/lib/summerup-teams.ts so the
 * event page and this script can never disagree about who is in the field.
 *
 * The roster is reproduced in criteriaMd and hashed at listing, which is the
 * point: who was eligible is frozen with the question, so a team added to the
 * hub afterwards cannot retroactively become a valid answer.
 *
 * Close time defaults to the evening of the final day; override with
 * SUMMERUP_CLOSE_AT (any Date-parseable string, e.g. "2026-08-10T18:00+02:00").
 */

const CLOSE_AT = new Date(process.env.SUMMERUP_CLOSE_AT ?? "2026-08-14T16:00:00+02:00");

function criteria(): string {
  const roster = TEAMS.map(
    (t) => `- **${t.name}**${t.description ? ` — ${t.description}` : ""}`,
  ).join("\n");
  return [
    "Resolves to the team announced by the SummerUp organizers as the overall winner.",
    "",
    "The organizers' decision is final and there is no dispute window — this is an",
    "event market on a judged outcome, not a public-record market.",
    "",
    `Eligible teams (${TEAMS.length}), frozen at listing:`,
    "",
    roster,
    "",
    "If the organizers announce a winner that is not on this list, or announce no",
    "winner at all, the market is voided and every position is refunded at cost.",
  ].join("\n");
}

async function main() {
  if (Number.isNaN(CLOSE_AT.getTime())) throw new Error("SUMMERUP_CLOSE_AT is not a valid date");
  const names = TEAMS.map((t) => t.name);
  if (new Set(names).size !== names.length) throw new Error("duplicate team names in roster");

  const market = await createMarket({
    slug: SUMMERUP_MARKET_SLUG,
    title: "Which team wins SummerUp?",
    type: "EVENT_DEMO",
    outcomes: names,
    criteriaMd: criteria(),
    bPoints: 1000,
    closeAt: CLOSE_AT,
    positionCapPoints: 300,
    // Uniform prior: 113 teams we know nothing about, and one we're biased on.
    // Being honest about the bias is cheaper than pricing it in.
    mClass: 2,
  });
  console.log(`listed ${market.slug}: ${names.length} teams, closes ${CLOSE_AT.toISOString()}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
