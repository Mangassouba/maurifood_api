ALTER TABLE "orders" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "code" varchar(12);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_phone" varchar(50);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_address" text;--> statement-breakpoint
UPDATE "orders" SET "code" = 'MF-' || upper(substr(md5(random()::text || "id"::text), 1, 6)) WHERE "code" IS NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_code_unique" UNIQUE("code");
