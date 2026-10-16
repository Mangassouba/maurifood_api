ALTER TABLE "restaurants" ADD COLUMN "offers_delivery" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "vehicle" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
-- Les restaurants qui ont déjà configuré une zone de livraison continuent de livrer
UPDATE "restaurants" SET "offers_delivery" = true WHERE EXISTS (SELECT 1 FROM "delivery_zones" WHERE "delivery_zones"."restaurant_id" = "restaurants"."id");
