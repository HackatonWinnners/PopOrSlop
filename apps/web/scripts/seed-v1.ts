import "dotenv/config";
import { pts, toPts, worstCaseLoss, worstCaseLossForPriors } from "@poporslop/lmsr";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/server/db/client";
import { cohorts, companies } from "../src/server/db/schema";
import { createMarket } from "../src/server/services/markets";

/**
 * W2 seed: 25–35 real markets on the frozen cohort (spec §11 P0).
 * Composition per plan: 1 flagship COHORT_INDEX, ~8 SURVIVAL, ~4 EXIT,
 * ~10 capped FUNDING_BINARY (I3), 3 fast-resolving (<60 days).
 *
 * Company picks are deterministic (alphabetical slices) — editorial
 * curation can replace them before launch; N/A refund covers delistings.
 *
 * Usage: pnpm tsx scripts/seed-v1.ts "Summer 2026"
 */

const COHORT_NAME = process.argv[2] ?? "Summer 2026";
// Trademark-safe naming (spec §18): nominative "S26 accelerator batch".
const BATCH_LABEL = "S26 accelerator batch";

const PRESS2 =
  "Press-2 fallback: coverage by ≥ 2 independent outlets from the frozen tier list " +
  "(TechCrunch, Bloomberg, Reuters, FT, WSJ, Axios, The Information, Sifted, Handelsblatt) " +
  "or an official company announcement.";

function fundingCriteria(name: string, byDate: string): string {
  return `Resolves YES if ${name} (${BATCH_LABEL}) raises ≥ $5,000,000 in any securities sale ` +
    `(priced round or SAFE — any sale evidenced per the listing policy counts), evidenced by a ` +
    `Form D visible on SEC EDGAR, an equivalent register entry visible in its home jurisdiction, ` +
    `or the press-2 rule, with the evidence VISIBLE on or before ${byDate} (UTC). ` +
    `Register/filing lag counts against the deadline — "visible by" is the test. ${PRESS2}`;
}

function survivalCriteria(name: string, onDate: string): string {
  return `Resolves YES if ${name} (${BATCH_LABEL}) is still operating on ${onDate}: no insolvency ` +
    `or dissolution filing visible in the relevant public register (EDGAR, Handelsregister/` +
    `Insolvenzbekanntmachungen, Companies House) on that date, and no official shutdown ` +
    `announcement. Product-alive heuristics may support but not replace register evidence. ` +
    `Ambiguity → N/A refund path.`;
}

function exitCriteria(name: string, byDate: string): string {
  return `Resolves YES if, on or before ${byDate}, ${name} (${BATCH_LABEL}) is acquired ` +
    `(definitive agreement announced), files an S-1 with the SEC, or launches a liquid token — ` +
    `evidenced by EDGAR, on-chain data, or the press-2 rule. ${PRESS2}`;
}

async function main() {
  const [cohort] = await db.select().from(cohorts).where(eq(cohorts.name, COHORT_NAME));
  if (!cohort) throw new Error(`cohort "${COHORT_NAME}" not found — run snapshot-cohort.ts first`);
  const members = await db
    .select()
    .from(companies)
    .where(eq(companies.cohortId, cohort.id))
    .orderBy(companies.name);
  if (members.length < 25) throw new Error(`only ${members.length} companies in cohort`);

  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

  let listed = 0;
  let subsidyPts = 0;
  const mk = async (input: Parameters<typeof createMarket>[0]) => {
    try {
      await createMarket(input);
      listed++;
      // Prior-seeded markets budget b·ln(1/min prior), not b·ln(n) (plan §3).
      const b = pts(input.bPoints);
      subsidyPts += toPts(
        input.priors ? worstCaseLossForPriors(input.priors, b) : worstCaseLoss(b, input.outcomes.length),
      );
      console.log(`listed: ${input.slug}`);
    } catch (e) {
      console.log(`skip ${input.slug}: ${(e as Error).message.slice(0, 80)}`);
    }
  };

  // ── Flagship cohort index (adopted §15 default: bucketed categorical) ──
  await mk({
    slug: "s26-series-a-within-24mo",
    title: `What share of the ${BATCH_LABEL} raises a priced Series A within 24 months?`,
    type: "COHORT_INDEX",
    outcomes: ["<20%", "20–35%", "35–50%", "50%+"],
    criteriaMd:
      `Share of the frozen ${BATCH_LABEL} cohort (snapshot sha256 ${cohort.snapshotHash}, ` +
      `${members.length} companies) that closes a PRICED Series A (SAFEs and bridges do not count ` +
      `for this index) with evidence visible by 2028-08-31: Form D or register entry naming a ` +
      `priced equity round of Series A designation, or the press-2 rule. Resolves to the bucket ` +
      `containing the final share. Cohort membership is frozen at listing; later additions or ` +
      `removals do not change the denominator.`,
    bPoints: 1000,
    closeAt: new Date("2028-06-30T00:00:00Z"),
    resolveBy: new Date("2028-09-30T00:00:00Z"),
    // YC historicals: ~45% reach Series A → mass on the middle buckets.
    priors: [0.15, 0.3, 0.4, 0.15],
    iClass: 0,
    mClass: 0,
    cohortId: cohort.id,
  });

  // ── Singles: deterministic alphabetical slices ──
  const fundingPicks = members.slice(0, 10);
  const survivalPicks = members.slice(10, 18);
  const exitPicks = members.slice(18, 22);

  for (const c of fundingPicks) {
    await mk({
      slug: `${slugify(c.name)}-raise-5m`,
      title: `${c.name} raises ≥ $5M by mid-2027?`,
      type: "FUNDING_BINARY",
      outcomes: ["YES", "NO"],
      criteriaMd: fundingCriteria(c.name, "2027-06-30"),
      bPoints: 100,
      closeAt: new Date("2027-06-23T00:00:00Z"),
      resolveBy: new Date("2027-07-15T00:00:00Z"),
      priors: [0.45, 0.55],
      iClass: 3,
      mClass: 0,
      positionCapPoints: 500, // I3 cap, spec §8
      companyId: c.id,
      resolverConfig: { rule: "funding_gte", amount_usd: 5_000_000 },
    });
  }

  for (const c of survivalPicks) {
    await mk({
      slug: `${slugify(c.name)}-operating-2027`,
      title: `${c.name} still operating on Sep 1, 2027?`,
      type: "SURVIVAL",
      outcomes: ["YES", "NO"],
      criteriaMd: survivalCriteria(c.name, "2027-09-01"),
      bPoints: 250,
      closeAt: new Date("2027-08-25T00:00:00Z"),
      resolveBy: new Date("2027-09-15T00:00:00Z"),
      priors: [0.88, 0.12], // first-year survival is high; deaths mostly show later
      iClass: 1,
      mClass: 0,
      companyId: c.id,
      resolverConfig: { rule: "survival" },
    });
  }

  for (const c of exitPicks) {
    await mk({
      slug: `${slugify(c.name)}-exit-2027`,
      title: `${c.name} acquired or files S-1 by Aug 31, 2027?`,
      type: "EXIT",
      outcomes: ["YES", "NO"],
      criteriaMd: exitCriteria(c.name, "2027-08-31"),
      bPoints: 100,
      closeAt: new Date("2027-08-24T00:00:00Z"),
      resolveBy: new Date("2027-09-15T00:00:00Z"),
      priors: [0.04, 0.96],
      iClass: 2,
      mClass: 0,
      companyId: c.id,
    });
  }

  // ── Fast-resolving (<60 days): exercise the resolution loop early (spec §11) ──
  await mk({
    slug: "s26-any-formd-5m-by-oct1",
    title: `Any ${BATCH_LABEL} company shows a Form D ≥ $5M by Oct 1?`,
    type: "FUNDING_BINARY",
    outcomes: ["YES", "NO"],
    criteriaMd:
      `Resolves YES if any company in the frozen ${BATCH_LABEL} cohort has a Form D filing with ` +
      `total amount sold or offered ≥ $5,000,000 VISIBLE on SEC EDGAR on or before 2026-10-01 ` +
      `(UTC), matched to the cohort by CIK or confirmed name match. Filing date may be earlier; ` +
      `visibility by the deadline is the test.`,
    bPoints: 250,
    closeAt: new Date("2026-09-28T00:00:00Z"),
    resolveBy: new Date("2026-10-05T00:00:00Z"),
    priors: [0.55, 0.45],
    iClass: 2,
    mClass: 0,
    positionCapPoints: 500,
    cohortId: cohort.id,
  });
  await mk({
    slug: "s26-five-formd-by-oct1",
    title: `≥ 5 ${BATCH_LABEL} companies show any Form D by Oct 1?`,
    type: "FUNDING_BINARY",
    outcomes: ["YES", "NO"],
    criteriaMd:
      `Resolves YES if at least 5 distinct companies in the frozen ${BATCH_LABEL} cohort have any ` +
      `Form D filing visible on SEC EDGAR on or before 2026-10-01 (UTC), matched by CIK or ` +
      `confirmed name match.`,
    bPoints: 250,
    closeAt: new Date("2026-09-28T00:00:00Z"),
    resolveBy: new Date("2026-10-05T00:00:00Z"),
    priors: [0.35, 0.65],
    iClass: 2,
    mClass: 0,
    positionCapPoints: 500,
    cohortId: cohort.id,
  });
  const fastPick = members[22]!;
  await mk({
    slug: `${slugify(fastPick.name)}-formd-by-oct1`,
    title: `${fastPick.name} shows any Form D by Oct 1?`,
    type: "FUNDING_BINARY",
    outcomes: ["YES", "NO"],
    criteriaMd:
      `Resolves YES if ${fastPick.name} (${BATCH_LABEL}) has any Form D filing visible on SEC ` +
      `EDGAR on or before 2026-10-01 (UTC), matched by CIK or confirmed name match.`,
    bPoints: 100,
    closeAt: new Date("2026-09-28T00:00:00Z"),
    resolveBy: new Date("2026-10-05T00:00:00Z"),
    priors: [0.15, 0.85],
    iClass: 3,
    mClass: 0,
    positionCapPoints: 500,
    companyId: fastPick.id,
    resolverConfig: { rule: "funding_gte", amount_usd: 1 },
  });

  // Spec plan decision #7: the treasury exposure is a printed number, not a surprise.
  console.log(`\n✓ ${listed} markets listed; worst-case treasury subsidy ≈ ${Math.ceil(subsidyPts).toLocaleString()} pts`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
