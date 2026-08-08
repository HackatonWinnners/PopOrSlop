-- House accounts as system user rows: FK integrity everywhere, and the global
-- zero-sum invariant (SUM(ledger.delta) = 0) stays a single query.
-- Fixed UUIDs so services can reference them as constants.
INSERT INTO users (id, handle, is_system, points_balance, flags)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'house_treasury', true, 0, '{}'),
  ('00000000-0000-0000-0000-000000000002', 'amm_pool',       true, 0, '{}'),
  ('00000000-0000-0000-0000-000000000003', 'dispute_escrow', true, 0, '{}')
ON CONFLICT (id) DO NOTHING;
