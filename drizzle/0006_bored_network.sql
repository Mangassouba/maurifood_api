ALTER TABLE "activity_logs" ADD COLUMN "actor_email" varchar(255);--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN "actor_role" "user_role";