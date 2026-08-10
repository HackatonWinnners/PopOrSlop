# PopOrSlop — Product Requirements Document

**Version:** 1.0 · **Date:** 2026-08-09 · **Owner:** Lap · **Status:** W0–W3 shipped, W4 (launch) in preparation

---

## 1. Overview

PopOrSlop is a play-money prediction market on **publicly-resolvable startup outcomes** — funding rounds, survival, exits, and regulatory events. Every contract resolves against a public source of truth (SEC EDGAR, Companies House, German insolvency registers, on-chain data, or a frozen press tier-list). The aggregated prices form a forecasting signal that is sold to VCs and funds as a data product.

**One-liner:** betting markets on startup outcomes where every contract resolves against public records — and the odds are the product.

### Why now, why us
The "prediction market for startups" niche is empty for structural reasons, each of which is a design constraint we engineered around rather than a blocker:

| Structural problem | Product answer |
|---|---|
| Insiders (founders/VCs) know more | Insider-exposure rating per market; cohort aggregates as the default surface; position caps and self-disclosure rules on high-insider markets |
| Private metrics (ARR, users) are unverifiable | Only list contracts with a public oracle; never private metrics |
| Derivatives on private securities are regulated | Phase 0 is play money; revenue comes from selling the forecast data, not betting flow |
| Liquidity fragments across thousands of companies | Automated market maker (LMSR) that always quotes a price with bounded house subsidy; few flagship cohort indices instead of a long tail |
| Startup outcomes take 5–10 years | v1 lists only contracts resolving within ≤ 24 months |

**The core bet:** even a small pool of forecasters with skin-in-the-game points produces better-calibrated startup odds than base rates or hype — and that signal is worth money to funds long before betting flow is worth anything. The oracle pipelines, not the trading UI, are the moat.

---

## 2. Goals & success metrics

### Goals
1. **G1 — Launch attention:** ship a play-money market on the YC S26 batch timed to Demo Day (early Sep 2026).
2. **G2 — Forecast quality:** prove market prices beat base-rate priors.
3. **G3 — B2B demand:** validate that funds want the signal.
4. **G4 — Oracle infrastructure:** working ingestion pipelines from EDGAR, Companies House, and German insolvency registers (the moat).

### Success metrics (evaluate at day 90 post-launch)
| Metric | Target |
|---|---|
| Registered forecasters | ≥ 500 |
| Weekly active traders | ≥ 150 |
| Unique traders on flagship market | ≥ 100 |
| Median traders per market | ≥ 10 |
| Resolved markets | ≥ 50 |
| **Market Brier score vs. prior Brier score** (the thesis test) | market < prior |
| Qualified fund/angel waitlist signups | ≥ 20 |
| Discovery calls with funds | ≥ 3 |
| Unresolved disputes older than 7 days | 0 |

Instrumentation for the Brier test exists: priors are stored per market at listing and hourly odds snapshots run from listing day.

### Non-goals (v1)
- **No real money.** No deposits, withdrawals, purchasable points, or prizes with monetary value — this sentence is what keeps Phase 0 outside gambling law.
- No private-metric markets (ARR, users, churn).
- No order books (LMSR only), no user-created markets (listing is curated), no mobile apps (responsive web), no coverage breadth (one-two cohorts + curated singles).

---

## 3. Users

| Persona | Motivation | Primary surfaces |
|---|---|---|
| **Forecasters** — tech Twitter/HN, YC-adjacent operators, quant-curious devs, EA forecasting crowd | Status: leaderboard rank, public calibration record, being right in public | Market pages, portfolio, leaderboard, profile |
| **Data buyers (the actual customers)** — seed VCs, scouts, LPs, corp-dev | Market-implied batch rankings, odds API, movement alerts | Batch Odds page → paid waitlist |
| **Founders** — subjects of markets | Claim/disclose flow; later a customer segment (sponsored liquidity) | Market pages (self-flag), opt-out flow (post-v1) |
| **Admin/operator** (internal) | List markets fast, resolve fast, keep the ledger provably clean | Admin console |

---

## 4. Product requirements

Requirements are numbered FR-x (functional) and NFR-x (non-functional). Status reflects the current build.

### 4.1 Market mechanics

- **FR-1** Every market is an LMSR automated market maker: always quotable, price = probability, bounded worst-case house subsidy budgeted per market at listing. Liquidity tiers: 100 pts (long-tail), 250 (standard), 1,000 (flagship). ✅
- **FR-2** Opening prices equal informed base-rate priors, not uniform 50/50 (no "market says 50% because nobody traded"). ✅
- **FR-3** Trading: buy by points budget (system computes max shares) or sell held shares; server-side slippage bound; no shorting; winning share pays exactly 1 point. ✅
- **FR-4** All accounting is a double-entry ledger against house accounts. Invariants (global zero-sum, balanced entry groups, balance-cache consistency, positions ≡ trade history) are machine-checked and surfaced in the admin console. ✅
- **FR-5** Points economy: 1,000 pts signup grant; 25 pts daily active drip (claimed on first visit of each UTC day); 250 pts referral bonus paid to the referrer when the referee places their **first trade** (skin-in-the-game gate), denied when both accounts share a device fingerprint; no purchase path, no cash-value prizes, no sinks in v1. ✅
- **FR-5a** Quests: admin-curated tasks that pay point rewards, with three verification kinds — **auto** (internal fact checks: first trade, **verified** email, traded 3 markets), **code** (redemption code shown by an external app/partner after the task; hashed at rest, case-insensitive, wrong attempts don't burn the claim), **manual** (user submits proof, admin approves/rejects in the console; one shot per quest). Rewards are balanced treasury→user ledger groups, exactly-once per (quest, user). ✅

### 4.2 Contract taxonomy & listing policy

- **FR-6** Market types: `COHORT_INDEX`, `SURVIVAL`, `REG_EVENT`, `EXIT`, `FUNDING_BINARY`, `FUNDING_BUCKET`, `INVESTOR_IN`, `MILESTONE_PUBLIC` (+ `EVENT_DEMO` for live events). Each market carries an insider-exposure rating (I0–I3) and an oracle-manipulability rating (M0–M2), both shown in the UI. ✅
- **FR-7** Listing policy: default surface = cohort indices + survival + regulatory + exit markets. Funding markets (I3) only with a 500-pt position cap, a filing-disciplined jurisdiction (US/DE/UK), and the founder-disclosure rule. M2 markets labeled "manipulable — for fun" and excluded from reputation scoring. ✅
- **FR-8** Resolution criteria are frozen at listing: criteria text + SHA-256 hash stored; resolution may only apply the frozen text; hash displayed on the market page. Ambiguity discovered later → N/A refund path. ✅
- **FR-9** Cohort membership is frozen at listing (snapshot + hash); later directory changes never move an index. Adopted defaults: any evidenced securities sale (SAFEs included) counts for `FUNDING_BINARY`; cohort index is bucketed categorical (<20 / 20–35 / 35–50 / 50%+). ✅

### 4.3 Resolution & disputes

- **FR-10** Market lifecycle state machine: OPEN → LOCKED (at close time) → proposal posted → 48h DISPUTE_WINDOW → RESOLVED + payout; any user may dispute by staking 50 pts → ESCALATED → council (3 reviewers, majority) upholds (stake slashed) or overturns (stake returned + 50-pt bounty, corrected outcome pays). All transitions idempotent and crash-safe. ✅
- **FR-11** N/A path: unresolvable criteria → every trader refunded at cost basis; the house eats the pool imbalance; the event is logged. ✅
- **FR-12** Event mode (live demos): dispute window = 0, organizers' decision final, resolution on stage in ≤ 2 minutes, two-click confirm. ✅
- **FR-13** Every posted resolution carries an evidence bundle (source, external reference, link, archived copy, hash, summary) rendered on a public Evidence tab. ✅

### 4.4 Oracle pipelines (the moat)

- **FR-14** EDGAR Form D: daily index ingestion (every US private-raise filing), enrichment from the filing XML (issuer, CIK, amounts), gzipped raw copy stored as guaranteed evidence. ✅
- **FR-15** Companies House (UK): filing-history polling for tracked companies; SH01 allotments = funding evidence; strike-off/gazette notices = survival evidence. "Visible-by" phrasing in criteria because register entries lag reality. ✅ (needs API key)
- **FR-16** Insolvenzbekanntmachungen.de (DE): 2×/day name search within the portal's ~2-week search window; aged-out names flagged for manual search. ✅
- **FR-17** Matcher: filings link to tracked companies by exact registry ID (auto-confirm) or fuzzy name match (≥90 auto-confirm, 70–90 human review queue, below silent). Wrong links are worse than no links. ✅
- **FR-18** Auto-resolver: confirmed match × open market × per-market machine-readable rule (`funding_gte`, `survival`) → **draft** proposal with evidence. Drafts never move market state; a human posts them. ✅
- **FR-19** Evidence archiving: Wayback Machine snapshots backfilled in rate-limited batches; the locally stored raw copy is the guarantee, the archive link is best-effort. ✅
- **FR-20** All ingestion is idempotent (unique source + external-reference key); cron double-fires and backfills are harmless. No queues or Redis — cron + idempotent jobs. ✅

### 4.5 Integrity & anti-manipulation

- **FR-21** One account per **verified** email — an address claimed at signup sits in `pending_email` and only takes the unique account slot once its owner clicks the confirmation link, so nobody can squat a stranger's address; best-effort client device fingerprint (hashed browser signals) stored at signup and used for referral anti-abuse. Detection is best-effort by design — the public rules are the deterrent. ✅
- **FR-22** New accounts (< 7 days): tighter per-market exposure cap (default 250 pts, configurable; event mode raises it). ✅
- **FR-23** I3 (funding) markets: 500-pt cost-basis cap per user per market. Event markets: 300 pts. ✅
- **FR-24** Founder self-trading allowed **only self-flagged** (public insider badge on the trade tape). Unflagged insider trading → positions voided (forced zero-cost sale, publicly visible on the tape) + account ban. Deterrence is the public rule, not perfect detection. ✅
- **FR-25** Full public pseudonymous trade tape per market — sunlight over moderation. ✅
- **FR-26** Rate limits: signup per IP, trades per user per minute; no public trading API in v1. ✅

### 4.6 Identity & reputation

- **FR-27** Auth: magic-link email sign-in (no passwords). Event mode: handle + team pick only, email optional (a confirmation link goes out at signup); event accounts merge into full accounts when the email is later verified. Sign-in and verification are the same one-time-link primitive, so clicking either one proves the mailbox and stamps `email_verified_at`. Account-existence never leaks from auth endpoints. ✅
- **FR-28** Two leaderboards: realized P&L all-time and 90-day. ✅
- **FR-29** Public calibration profile per trader: share-weighted Brier score + 10-bucket calibration curve over buys on resolved markets; M2 markets excluded from scoring. ✅

### 4.7 Surfaces

- **FR-30** Market page (mobile-first): live outcome odds, price-history chart, trade panel with live quotes, frozen criteria + hash, evidence tab, public tape, dispute banner during windows. ✅
- **FR-31** Portfolio (balance, positions marked to market), market list, join flow. ✅
- **FR-32** `/live` big-screen mode for events: auto-rotating flagship odds / leaderboard, trade ticker, polling-only (venue-wifi resilient), survives the whole event without restart. ✅
- **FR-33** **Batch Odds** public page: flagship cohort index + live implied per-company rankings + VC waitlist form (email, fund) for the paid data tier. This page is the B2B funnel. ✅
- **FR-34** Admin console: create market; paste-a-team-list → live flagship market in **< 30 seconds**; lock/resolve (stage mode or 48h window)/N-A actions; auto-resolver draft review; oracle-event match review; dispute council screen; live invariants badge. ✅
- **FR-35** Hourly odds snapshots for every active market — the raw material of the future data product and the Brier evaluation. ✅

### 4.8 Non-functional requirements

- **NFR-1 Correctness of money.** The ledger must sum to zero at all times; every logical event is a balanced entry group; property-based tests prove the market maker admits no arbitrage round trips and bounded house loss. Verified continuously, displayed in admin, checked live on stage. ✅
- **NFR-2 Load.** Room-scale: 150 concurrent users, 30 trades/s sustained with 80% of flow on one market — zero failed trades, p95 trade latency < 300 ms. (Measured: 1,800/1,800 OK, p95 275 ms.) ✅
- **NFR-3 Resilience.** Every flow degrades to manual admin action; big-screen mode tolerates dropped polls; crons are idempotent; the whole stack runs from one `docker compose up` on any machine. ✅
- **NFR-4 Auditability.** Frozen criteria hashes, immutable cohort snapshots, evidence with local raw copies + archive links, public tape. ✅
- **NFR-5 Privacy/legal posture.** Company data = public registers + press (GDPR-safe basis); founder opt-out honored for profile pages, never for register facts. Play money only; no monetary value in or out until counsel review. Fallback naming ("S26 accelerator batch") ready if the accelerator objects to directory use. ✅

---

## 5. Business model & phasing

- **v1 (now): free.** Batch Odds public page + waitlist as the funnel.
- **Phase 1: B2B data subscriptions** — odds API, movement alerts, weekly implied-rankings brief; anchor $500–2,000/mo per seat. Selling aggregated forecasts is an information service, not a financial product (sanity-check with counsel).
- **Later: sponsored liquidity** — a fund pays to deepen liquidity on markets it wants forecast (subsidizes forecasters, doesn't bet).
- **Phase 2 (parked, not designed for): real money.** Deliberately out of scope; the data business must stand alone.
- Explicitly not v1: trading fees, ads, token.

---

## 6. Release plan & status

| Milestone | Scope | Status |
|---|---|---|
| **W0 — SummerUp demo** | Engine + ledger + trading UI + admin + `/live`, event markets, load test, full-stack Docker image | ✅ shipped |
| **W1** | Magic-link auth, EDGAR pipeline end-to-end, matcher + review queue, evidence tab, frozen S26 cohort (186 companies) | ✅ shipped |
| **W2** | CH + insolvency ingesters, auto-resolver, dispute UI + council, 26 real markets listed | ✅ shipped |
| **W3** | Batch Odds + waitlist, calibration profiles, integrity caps + enforcement tooling, snapshots, archive backfill | ✅ shipped |
| **W4 — launch** | Editorial pass on seeded markets (replace alphabetical picks with curated ones), OG cards, second load test at full market count, dispute-SLA dashboard, hosting decision, HN/X soft launch timed to YC Demo Day | ◻ open (drip + referral + fingerprinting shipped 2026-08-09) |

### Launch acceptance (event-mode checklist, already rehearsed)
- ≥ 50% of attendees who scan the QR place ≥ 1 trade
- Winner market resolved live ≤ 2 min after announcement
- Ledger sums to zero against the house account after payout (checked on stage)
- Big screen survives the whole event without a restart

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Cold start / dead markets | Prior-seeded prices (always sane), few flagship markets over long tail, launch on Demo Day attention |
| Resolution ambiguity blow-ups | Frozen hashed criteria, N/A refund path, fast-resolving markets listed first to debug the loop early |
| Insider farming on I3 markets | Caps + disclosure rule + public tape; accept residual leakage — it's play money and even leaked info improves the forecast |
| Incumbent (e.g. Manifold) adds the vertical | Moat = oracle pipelines + B2B data relationships, not the AMM; they're structurally a UGC platform, not a data vendor |
| Accelerator objects to directory use / trademark | Public data, nominative use, no logos; "S26 accelerator batch" fallback naming already in copy; comply fast if contacted |
| Gambling-law creep (prizes, paid boosts) | Hard rule: no monetary value in, none out, until counsel review |
| Demo-week failure modes (late team list, venue wifi, ceremony load spike) | < 30 s market listing, polling-only big screen, room-scale load test passed, every flow degrades to manual admin |
| Solo-dev scope blowout | This document's scope list is the contract; anything else waits |

---

## 8. Open questions

| Question | Blocking? | Current position |
|---|---|---|
| Hybrid B2B signal: raw market price vs. blend with top-decile-forecaster average | No | Decide when the first fund call happens |
| Founder-sponsored liquidity as a signaling product | No | Park until inbound interest |
| Daily drip & referral: exact anti-abuse rules | Resolved | Shipped: drip claimed once per UTC day on visit; referral pays on the referee's first trade and is denied on a device-fingerprint match |
| Name/domain | Before launch | Working title "PopOrSlop" |
| Hosting (EU residency per architecture notes) | Before launch (W4) | Everything is host-agnostic; decide at deploy time |
