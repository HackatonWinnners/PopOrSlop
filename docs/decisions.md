# Decisions (ADR-lite)

1. **Float64 inside the LMSR cost function, house-favoring µpt rounding.** Full fixed-point exp/ln is a week of work for zero product value. Buys round up, sells round down, payouts are pure bigint (1 µshare of the winner pays exactly 1 µpt). The fast-check suite proves the invariants that matter: no-arb round trips, bounded loss b·ln(n).
2. **Drizzle over Prisma.** Need `bigint[]`, PG enums, CHECK constraints, raw `pg_advisory_xact_lock` in the trade path, plain-SQL migrations, no engine sidecar.
3. **Roll-own auth.** Sessions table + magic-link tokens + Resend. W0 already requires custom auth-lite.
4. **House accounts as user rows** (`is_system = true`): `house_treasury`, `amm_pool`, `dispute_escrow`. FK integrity + global zero-sum stays one query.
5. **No shorting in v1.** Sell only what you hold; LMSR still gives two-sided discovery via other outcomes.
6. **Payout precision:** payouts never touch float.
7. **Subsidy budget printed at seeding.** `SEED_SUBSIDY = ceil(b·ln n)` per market, treasury → amm_pool at listing.
8. **Evidence guarantee is `oracle_events.raw_content`** (gzipped fetch); archive.org SPN2 is best-effort with retry backfill.
9. **Fallback naming "S26 accelerator batch"** kept in copy constants from day one (YC trademark risk, spec §18).
10. **Scope contract:** anything not in the approved plan goes to `LATER.md`. W0 cutline is sacred.

## Adopted defaults for spec §15 blocking questions (overridable before W2 seeding)

- `FUNDING_BINARY`: any securities sale evidenced per spec §5.2 counts (SAFEs included); `FUNDING_BUCKET` uses disclosed amount, `undisclosed` is its own bucket.
- Cohort index: bucketed categorical — `<20% / 20–35 / 35–50 / 50+` for "Series A within 24 mo".
