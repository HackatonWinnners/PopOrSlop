ALTER TYPE ledger_reason ADD VALUE IF NOT EXISTS 'QUEST_REWARD';

CREATE TABLE IF NOT EXISTS quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  url text,
  kind text NOT NULL CHECK (kind IN ('auto', 'code', 'manual')),
  rule text,
  code_hash text,
  reward bigint NOT NULL CHECK (reward > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quest_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL REFERENCES quests(id),
  user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  proof text,
  reviewed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE (quest_id, user_id)
);
