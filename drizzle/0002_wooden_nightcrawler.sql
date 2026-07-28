CREATE TABLE "bloques_programa" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"tema" text NOT NULL,
	"actividades" text,
	"hora_inicio" text,
	"hora_fin" text,
	"observaciones" text,
	"tipo_curso_id" varchar(30) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bloques_programa" ADD CONSTRAINT "bloques_programa_tipo_curso_id_tipos_curso_id_fk" FOREIGN KEY ("tipo_curso_id") REFERENCES "public"."tipos_curso"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bloques_programa_tipo_idx" ON "bloques_programa" USING btree ("tipo_curso_id");