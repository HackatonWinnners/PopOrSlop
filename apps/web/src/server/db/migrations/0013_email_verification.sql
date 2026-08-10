-- Email ownership must be proven before it occupies the unique users.email slot.
ALTER TABLE "users" ADD COLUMN "pending_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
-- Pre-existing addresses were never proven: they keep the slot (so magic-link
-- sign-in still finds them) but stay unverified until the first link click.
UPDATE "quests" SET "rule" = 'email_verified' WHERE "rule" = 'email_set';
