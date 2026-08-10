-- 0006 created this as a unique INDEX, while the schema declares it as a
-- table constraint — so the generated DROP CONSTRAINT finds nothing. Drop
-- whichever form exists.
DROP INDEX IF EXISTS "waitlist_email_unique";--> statement-breakpoint
ALTER TABLE "waitlist_signups" DROP CONSTRAINT IF EXISTS "waitlist_email_unique";--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD COLUMN "kind" text DEFAULT 'vc' NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD CONSTRAINT "waitlist_email_unique" UNIQUE("email","kind");
