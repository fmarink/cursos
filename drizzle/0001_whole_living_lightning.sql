ALTER TABLE "participantes" ADD COLUMN "nomina_item_id" varchar(30);--> statement-breakpoint
ALTER TABLE "participantes" ADD COLUMN "vinculado_por" text;--> statement-breakpoint
ALTER TABLE "participantes" ADD COLUMN "vinculado_en" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "participantes_nomina_item_uq" ON "participantes" USING btree ("nomina_item_id");