CREATE TABLE "quest_starts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quest_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"payload" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_starts_once" UNIQUE("quest_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "requires_start" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quest_starts" ADD CONSTRAINT "quest_starts_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_starts" ADD CONSTRAINT "quest_starts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;