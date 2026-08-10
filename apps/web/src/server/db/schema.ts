import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Units: every points/shares column is bigint µ-units (10⁻⁶ pts).
 * users.points_balance is a cache; the ledger is the source of truth.
 */

// drizzle has no built-in bigint[] / int[] column types — declare them.
const bigintArray = customType<{ data: bigint[]; driverData: string[] }>({
  dataType: () => "bigint[]",
  fromDriver: (v) => v.map(BigInt),
  toDriver: (v: bigint[]) => v.map(String),
});
const intArray = customType<{ data: number[] }>({ dataType: () => "integer[]" });
const byteaType = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const marketStatus = pgEnum("market_status", [
  "OPEN",
  "LOCKED",
  "PROPOSED",
  "DISPUTE_WINDOW",
  "RESOLVED",
  "ESCALATED",
  "NA_REFUNDED",
]);

export const marketType = pgEnum("market_type", [
  "COHORT_INDEX",
  "SURVIVAL",
  "REG_EVENT",
  "EXIT",
  "FUNDING_BINARY",
  "FUNDING_BUCKET",
  "INVESTOR_IN",
  "MILESTONE_PUBLIC",
  "EVENT_DEMO",
]);

export const ledgerReason = pgEnum("ledger_reason", [
  "SIGNUP_GRANT",
  "DAILY_DRIP",
  "REFERRAL",
  "TRADE",
  "PAYOUT",
  "NA_REFUND",
  "DISPUTE_STAKE",
  "DISPUTE_RETURN",
  "DISPUTE_BOUNTY",
  "DISPUTE_SLASH",
  "SEED_SUBSIDY",
  "RESOLUTION_SWEEP",
  "QUEST_REWARD",
  "TOKEN_TRADE",
  "TOKEN_LISTING_SUBSIDY",
  "ADMIN_ADJUST",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Verified address. Only ever written once ownership is proven by a link click. */
    email: text("email").unique(),
    /** Address claimed but not yet proven — deliberately NOT unique, so an
     *  unverified claim can never squat someone else's real address. */
    pendingEmail: text("pending_email"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    handle: text("handle").notNull().unique(),
    team: text("team"),
    deviceFp: text("device_fp"),
    pointsBalance: bigint("points_balance", { mode: "bigint" }).notNull().default(sql`0`),
    isSystem: boolean("is_system").notNull().default(false),
    flags: jsonb("flags").notNull().default({}),
    referredBy: uuid("referred_by"),
    lastDripOn: date("last_drip_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("points_balance_nonneg", sql`${t.pointsBalance} >= 0 OR ${t.isSystem}`)],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const cohorts = pgTable("cohorts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sourceUrl: text("source_url"),
  snapshot: jsonb("snapshot"),
  snapshotHash: text("snapshot_hash"),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
});

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").unique(),
    jurisdiction: text("jurisdiction"),
    cohortId: uuid("cohort_id").references(() => cohorts.id),
    extIds: jsonb("ext_ids").notNull().default({}),
    // Profile (startup-centered surface)
    logoUrl: text("logo_url"),
    description: text("description"),
    links: jsonb("links").notNull().default({}),
    // Listing: real money is an OFF-ledger fee recorded here; it only sets
    // the token launch price. Everything on-platform stays play-money points.
    listedAt: timestamp("listed_at", { withTimezone: true }),
    listingPaymentUsd: bigint("listing_payment_usd", { mode: "bigint" }),
    accountUserId: uuid("account_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("companies_cik_idx").on(sql`(${t.extIds} ->> 'cik')`),
    index("companies_ch_idx").on(sql`(${t.extIds} ->> 'ch')`),
  ],
);

/** Linear bonding curve per listed startup: price(s) = p0 + slope · s. */
export const tokenState = pgTable("token_state", {
  companyId: uuid("company_id")
    .primaryKey()
    .references(() => companies.id),
  supply: bigint("supply", { mode: "bigint" }).notNull().default(sql`0`),
  p0: bigint("p0", { mode: "bigint" }).notNull(),
  slope: bigint("slope", { mode: "bigint" }).notNull(),
  version: integer("version").notNull().default(0),
});

export const tokenTrades = pgTable(
  "token_trades",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    deltaTokens: bigint("delta_tokens", { mode: "bigint" }).notNull(),
    cost: bigint("cost", { mode: "bigint" }).notNull(),
    priceAfter: bigint("price_after", { mode: "bigint" }).notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("token_trades_tape").on(t.companyId, t.ts.desc())],
);

export const tokenPositions = pgTable(
  "token_positions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    tokens: bigint("tokens", { mode: "bigint" }).notNull().default(sql`0`),
    costBasis: bigint("cost_basis", { mode: "bigint" }).notNull().default(sql`0`),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.companyId] }),
    index("token_positions_company").on(t.companyId),
  ],
);

export const markets = pgTable(
  "markets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    type: marketType("type").notNull(),
    companyId: uuid("company_id").references(() => companies.id),
    cohortId: uuid("cohort_id").references(() => cohorts.id),
    criteriaMd: text("criteria_md").notNull(),
    criteriaHash: text("criteria_hash").notNull(),
    outcomes: text("outcomes").array().notNull(),
    b: bigint("b", { mode: "bigint" }).notNull(),
    closeAt: timestamp("close_at", { withTimezone: true }).notNull(),
    resolveBy: timestamp("resolve_by", { withTimezone: true }),
    status: marketStatus("status").notNull().default("OPEN"),
    iClass: smallint("i_class").notNull().default(0),
    mClass: smallint("m_class").notNull().default(0),
    positionCap: bigint("position_cap", { mode: "bigint" }),
    seedPriors: jsonb("seed_priors"),
    /** Auto-resolver rule, e.g. {"rule":"funding_gte","amount_usd":5e6} or {"rule":"survival"}. */
    resolverConfig: jsonb("resolver_config"),
    proposedAt: timestamp("proposed_at", { withTimezone: true }),
    disputeDeadline: timestamp("dispute_deadline", { withTimezone: true }),
    resolvedOutcome: smallint("resolved_outcome"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("outcomes_card", sql`cardinality(${t.outcomes}) BETWEEN 2 AND 64`),
    check("i_class_range", sql`${t.iClass} BETWEEN 0 AND 3`),
    check("m_class_range", sql`${t.mClass} BETWEEN 0 AND 2`),
    index("markets_lock_idx").on(t.status, t.closeAt),
    index("markets_finalize_idx").on(t.status, t.disputeDeadline),
  ],
);

export const lmsrState = pgTable("lmsr_state", {
  marketId: uuid("market_id")
    .primaryKey()
    .references(() => markets.id),
  q: bigintArray("q").notNull(),
  version: integer("version").notNull().default(0),
});

export const trades = pgTable(
  "trades",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id),
    outcomeIdx: smallint("outcome_idx").notNull(),
    deltaShares: bigint("delta_shares", { mode: "bigint" }).notNull(),
    cost: bigint("cost", { mode: "bigint" }).notNull(),
    pBefore: intArray("p_before").notNull(),
    pAfter: intArray("p_after").notNull(),
    selfFlagged: boolean("self_flagged").notNull().default(false),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trades_tape_idx").on(t.marketId, t.ts.desc()),
    index("trades_user_idx").on(t.userId, t.ts.desc()),
  ],
);

export const positions = pgTable(
  "positions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id),
    outcomeIdx: smallint("outcome_idx").notNull(),
    shares: bigint("shares", { mode: "bigint" }).notNull().default(sql`0`),
    costBasis: bigint("cost_basis", { mode: "bigint" }).notNull().default(sql`0`),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.marketId, t.outcomeIdx] }),
    index("positions_market_idx").on(t.marketId),
  ],
);

export const ledger = pgTable(
  "ledger",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    entryGroup: uuid("entry_group").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    delta: bigint("delta", { mode: "bigint" }).notNull(),
    reason: ledgerReason("reason").notNull(),
    refId: text("ref_id"),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ledger_user_idx").on(t.userId, t.ts),
    index("ledger_group_idx").on(t.entryGroup),
    index("ledger_reason_ref_idx").on(t.reason, t.refId),
  ],
);

export const oracleEvents = pgTable(
  "oracle_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    externalRef: text("external_ref").notNull(),
    rawUrl: text("raw_url"),
    archivedUrl: text("archived_url"),
    rawContent: byteaType("raw_content"),
    parsed: jsonb("parsed").notNull().default({}),
    eventTs: timestamp("event_ts", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    hash: text("hash"),
  },
  (t) => [unique("oracle_events_source_ref").on(t.source, t.externalRef)],
);

export const eventCompanyMatches = pgTable(
  "event_company_matches",
  {
    oracleEventId: uuid("oracle_event_id")
      .notNull()
      .references(() => oracleEvents.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    confidence: real("confidence").notNull(),
    method: text("method").notNull(),
    status: text("status").notNull().default("pending"),
  },
  (t) => [primaryKey({ columns: [t.oracleEventId, t.companyId] })],
);

export const resolutionProposals = pgTable("resolution_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketId: uuid("market_id")
    .notNull()
    .references(() => markets.id),
  outcomeIdx: smallint("outcome_idx").notNull(),
  evidence: jsonb("evidence").notNull().default([]),
  proposer: text("proposer").notNull(),
  status: text("status").notNull().default("draft"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
});

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketId: uuid("market_id")
    .notNull()
    .references(() => markets.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  stake: bigint("stake", { mode: "bigint" }).notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const oddsSnapshots = pgTable(
  "odds_snapshots",
  {
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    prices: intArray("prices").notNull(),
  },
  (t) => [primaryKey({ columns: [t.marketId, t.ts] })],
);

export const waitlistSignups = pgTable(
  "waitlist_signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    fundName: text("fund_name"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("waitlist_email_unique").on(t.email)],
);

export const quests = pgTable("quests", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  url: text("url"),
  /** auto = internal fact check; code = redemption code; manual = proof + admin review. */
  kind: text("kind").notNull(),
  /** auto quests: which internal rule verifies completion (first_trade | email_verified | traded_3_markets). */
  rule: text("rule"),
  codeHash: text("code_hash"),
  reward: bigint("reward", { mode: "bigint" }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questCompletions = pgTable(
  "quest_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questId: uuid("quest_id")
      .notNull()
      .references(() => quests.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("pending"),
    proof: text("proof"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [unique("quest_completions_once").on(t.questId, t.userId)],
);

// P2 architectural insurance — schema reserved, unused in v1.
export const apiClients = pgTable("api_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  keyHash: text("key_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
