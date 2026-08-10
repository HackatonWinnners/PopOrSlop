ALTER TABLE "markets" DROP CONSTRAINT "outcomes_card";--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "outcomes_card" CHECK (cardinality("markets"."outcomes") BETWEEN 2 AND 256);