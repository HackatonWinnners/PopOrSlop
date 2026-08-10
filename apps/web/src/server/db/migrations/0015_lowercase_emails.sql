-- Addresses written before verification existed kept their original case, but
-- every lookup now compares against a lowercased address. A legacy row like
-- "Someone@Gmail.com" would never match its owner, so signing in would create
-- a second account and orphan the first one's positions.
UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
UPDATE "users" SET "pending_email" = lower("pending_email") WHERE "pending_email" <> lower("pending_email");--> statement-breakpoint
-- Writes normalise already; this makes a case-variant duplicate impossible
-- even if some future path forgets to.
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));
