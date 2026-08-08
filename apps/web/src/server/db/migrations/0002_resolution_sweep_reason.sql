-- Per-market residual sweep amm_pool → house_treasury at resolution/refund,
-- so subsidy consumption is auditable per market.
ALTER TYPE ledger_reason ADD VALUE IF NOT EXISTS 'RESOLUTION_SWEEP';
