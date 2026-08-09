-- Startup-centered refactor: profiles + points-denominated bonding-curve tokens.

ALTER TYPE ledger_reason ADD VALUE IF NOT EXISTS 'TOKEN_TRADE';
ALTER TYPE ledger_reason ADD VALUE IF NOT EXISTS 'TOKEN_LISTING_SUBSIDY';

-- Profile fields on companies + a URL slug.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '{}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS listed_at timestamptz;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS listing_payment_usd bigint;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS account_user_id uuid REFERENCES users(id);

-- Backfill slugs from names (dedupe with a numeric suffix).
UPDATE companies SET slug = sub.slug FROM (
  SELECT id,
         CASE WHEN rn = 1 THEN base ELSE base || '-' || rn::text END AS slug
  FROM (
    SELECT id,
           regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g') AS base,
           row_number() OVER (
             PARTITION BY regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')
             ORDER BY created_at
           ) AS rn
    FROM companies
  ) t
) sub
WHERE companies.id = sub.id AND companies.slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_unique ON companies (slug);

-- Linear bonding curve state per listed startup: price(s) = p0 + slope · s.
CREATE TABLE IF NOT EXISTS token_state (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  supply bigint NOT NULL DEFAULT 0,          -- µtokens outstanding
  p0 bigint NOT NULL,                        -- launch price, µpts per token
  slope bigint NOT NULL,                     -- µpts per token, per whole token of supply
  version integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS token_trades (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  company_id uuid NOT NULL REFERENCES companies(id),
  delta_tokens bigint NOT NULL,              -- µtokens, signed
  cost bigint NOT NULL,                      -- µpts, signed (+ = user paid)
  price_after bigint NOT NULL,               -- µpts per token
  ts timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS token_trades_tape ON token_trades (company_id, ts DESC);

CREATE TABLE IF NOT EXISTS token_positions (
  user_id uuid NOT NULL REFERENCES users(id),
  company_id uuid NOT NULL REFERENCES companies(id),
  tokens bigint NOT NULL DEFAULT 0,          -- µtokens
  cost_basis bigint NOT NULL DEFAULT 0,      -- µpts
  PRIMARY KEY (user_id, company_id)
);
CREATE INDEX IF NOT EXISTS token_positions_company ON token_positions (company_id);

-- Dedicated pool account so token flows audit separately from market AMM flows.
INSERT INTO users (id, handle, is_system, points_balance, flags)
VALUES ('00000000-0000-0000-0000-000000000004', 'token_pool', true, 0, '{}')
ON CONFLICT (id) DO NOTHING;
