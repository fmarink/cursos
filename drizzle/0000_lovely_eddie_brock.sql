CREATE TYPE "public"."estado_curso" AS ENUM('PROGRAMADO', 'EN_CURSO', 'CERRADO', 'EXPEDIENTE_VALIDADO', 'ENVIADO_AL_CLIENTE', 'ANULADO');--> statement-breakpoint
CREATE TYPE "public"."estado_sesion" AS ENUM('PROGRAMADA', 'ABIERTA', 'CERRADA', 'REABIERTA');--> statement-breakpoint
CREATE TYPE "public"."estado_validacion" AS ENUM('OK', 'DUPLICADO_SOSPECHOSO', 'EXCEDE_NOMINA', 'FUERA_DE_NOMINA', 'RUT_INVALIDO', 'SIN_FIRMA', 'ANULADO');--> statement-breakpoint
CREATE TYPE "public"."modalidad_curso" AS ENUM('PRESENCIAL_TEORICO', 'PRESENCIAL_PRACTICO', 'PRESENCIAL_MIXTO');--> statement-breakpoint
CREATE TYPE "public"."origen_registro" AS ENUM('QR', 'TABLET', 'MANUAL', 'PAPEL', 'IMPORTADO');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('ADMIN', 'OPERACIONES', 'PROFESOR');--> statement-breakpoint
CREATE TYPE "public"."tipo_adjunto" AS ENUM('FOTO_GRUPAL', 'FOTO_SALA', 'LIBRO_PAPEL', 'OTRO');--> statement-breakpoint
CREATE TYPE "public"."tipo_lugar" AS ENUM('FAENA', 'HOTEL', 'OFICINA', 'OTRO');--> statement-breakpoint
CREATE TYPE "public"."tipo_pregunta_encuesta" AS ENUM('ESCALA', 'TEXTO', 'SI_NO');--> statement-breakpoint
CREATE TYPE "public"."tipo_pregunta" AS ENUM('SELECCION_MULTIPLE', 'VERDADERO_FALSO', 'RESPUESTA_BREVE');--> statement-breakpoint
CREATE TABLE "adjuntos" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"tipo" "tipo_adjunto" DEFAULT 'OTRO' NOT NULL,
	"nombre" text NOT NULL,
	"mime" text NOT NULL,
	"datos" text NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"sesion_id" varchar(30) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asistencias" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"registrado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"presente" boolean DEFAULT true NOT NULL,
	"origen" "origen_registro" DEFAULT 'QR' NOT NULL,
	"ip" text,
	"user_agent" text,
	"dispositivo" text,
	"participante_id" varchar(30) NOT NULL,
	"sesion_id" varchar(30) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" text NOT NULL,
	"accion" text NOT NULL,
	"valor_anterior" jsonb,
	"valor_nuevo" jsonb,
	"ip" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" varchar(30),
	"actor_anonimo" text
);
--> statement-breakpoint
CREATE TABLE "bloques_contenido" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"tema" text NOT NULL,
	"actividades" text,
	"hora_inicio" text NOT NULL,
	"hora_fin" text NOT NULL,
	"observaciones" text,
	"firma_relator_png" text,
	"sesion_id" varchar(30) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"razon_social" text NOT NULL,
	"rut" text,
	"contacto_nombre" text,
	"contacto_email" text,
	"contacto_telefono" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cursos" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre_actividad" text NOT NULL,
	"modalidad" "modalidad_curso" DEFAULT 'PRESENCIAL_TEORICO' NOT NULL,
	"horas" integer NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_termino" date NOT NULL,
	"nomina_esperada" integer DEFAULT 0 NOT NULL,
	"estado" "estado_curso" DEFAULT 'PROGRAMADO' NOT NULL,
	"observaciones" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"es_sence" boolean DEFAULT false NOT NULL,
	"codigo_sence_autorizado" text,
	"cliente_id" varchar(30) NOT NULL,
	"tipo_curso_id" varchar(30) NOT NULL,
	"lugar_id" varchar(30),
	"lugar_libre" text,
	CONSTRAINT "cursos_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "evaluaciones" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"respuestas" jsonb NOT NULL,
	"puntajes" jsonb,
	"puntaje_total" integer DEFAULT 0 NOT NULL,
	"puntaje_maximo" integer DEFAULT 0 NOT NULL,
	"nota" numeric(2, 1),
	"aprobado" boolean,
	"requiere_correccion_manual" boolean DEFAULT false NOT NULL,
	"corregida_por" text,
	"corregida_en" timestamp with time zone,
	"completada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"participante_id" varchar(30) NOT NULL,
	"sesion_id" varchar(30) NOT NULL,
	"plantilla_id" varchar(30) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expedientes" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"pdf_base64" text,
	"bytes" integer DEFAULT 0 NOT NULL,
	"generado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"generado_por" text,
	"validado_en" timestamp with time zone,
	"validado_por" text,
	"enviado_a" text,
	"enviado_cc" text,
	"enviado_en" timestamp with time zone,
	"enviado_por" text,
	"asunto_envio" text,
	"sesion_id" varchar(30) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "firmas" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"imagen_png" text NOT NULL,
	"trazos_json" jsonb,
	"hash" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"firmado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"asistencia_id" varchar(30) NOT NULL,
	CONSTRAINT "firmas_asistencia_id_unique" UNIQUE("asistencia_id")
);
--> statement-breakpoint
CREATE TABLE "lugares" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_lugar" DEFAULT 'OTRO' NOT NULL,
	"direccion" text,
	"comuna" text,
	"activo" boolean DEFAULT true NOT NULL,
	"cliente_id" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "nomina_items" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"rut" text,
	"empresa" text,
	"cargo" text,
	"curso_id" varchar(30) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participantes" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"rut" text NOT NULL,
	"email" text,
	"telefono" text,
	"empresa" text,
	"cargo" text,
	"nivel_escolaridad" text,
	"origen" "origen_registro" DEFAULT 'QR' NOT NULL,
	"estado_validacion" "estado_validacion" DEFAULT 'OK' NOT NULL,
	"nota_revision" text,
	"anulado" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"curso_id" varchar(30) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plantillas_encuesta" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"escala_min" integer DEFAULT 1 NOT NULL,
	"escala_max" integer DEFAULT 7 NOT NULL,
	"anonima" boolean DEFAULT true NOT NULL,
	"activa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plantillas_evaluacion" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"umbral_aprobacion" numeric(2, 1) DEFAULT '4.0' NOT NULL,
	"exigencia" integer DEFAULT 60 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"tipo_curso_id" varchar(30),
	"cliente_id" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "preguntas" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"orden" integer NOT NULL,
	"enunciado" text NOT NULL,
	"tipo" "tipo_pregunta" NOT NULL,
	"opciones" jsonb,
	"respuesta_correcta" text,
	"puntaje" integer DEFAULT 1 NOT NULL,
	"plantilla_id" varchar(30) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preguntas_encuesta" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"orden" integer NOT NULL,
	"enunciado" text NOT NULL,
	"tipo" "tipo_pregunta_encuesta" DEFAULT 'ESCALA' NOT NULL,
	"plantilla_id" varchar(30) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profesor_materias" (
	"profesor_id" varchar(30) NOT NULL,
	"tipo_curso_id" varchar(30) NOT NULL,
	CONSTRAINT "profesor_materias_profesor_id_tipo_curso_id_pk" PRIMARY KEY("profesor_id","tipo_curso_id")
);
--> statement-breakpoint
CREATE TABLE "profesores" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"rut" text,
	"telefono" text,
	"email" text,
	"direccion" text,
	"comuna" text,
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "respuestas_encuesta" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"respuestas" jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"plantilla_id" varchar(30) NOT NULL,
	"sesion_id" varchar(30) NOT NULL,
	"participante_id" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"hora_inicio" text NOT NULL,
	"hora_fin" text NOT NULL,
	"estado" "estado_sesion" DEFAULT 'PROGRAMADA' NOT NULL,
	"cerrada_en" timestamp with time zone,
	"reabierta_en" timestamp with time zone,
	"motivo_reapertura" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"token_asistencia" text NOT NULL,
	"token_evaluacion" text NOT NULL,
	"token_encuesta" text NOT NULL,
	"asistencia_abierta" boolean DEFAULT false NOT NULL,
	"evaluacion_abierta" boolean DEFAULT false NOT NULL,
	"encuesta_abierta" boolean DEFAULT false NOT NULL,
	"curso_id" varchar(30) NOT NULL,
	"profesor_id" varchar(30),
	"plantilla_evaluacion_id" varchar(30),
	"plantilla_encuesta_id" varchar(30),
	CONSTRAINT "sesiones_token_asistencia_unique" UNIQUE("token_asistencia"),
	CONSTRAINT "sesiones_token_evaluacion_unique" UNIQUE("token_evaluacion"),
	CONSTRAINT "sesiones_token_encuesta_unique" UNIQUE("token_encuesta")
);
--> statement-breakpoint
CREATE TABLE "tipos_curso" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"codigo_interno" text,
	"horas_default" integer DEFAULT 8 NOT NULL,
	"tiene_componente_practico" boolean DEFAULT false NOT NULL,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"codigo_sence" text
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"nombre" text NOT NULL,
	"rol" "rol" NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_acceso" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"profesor_id" varchar(30),
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_sesion_id_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_participante_id_participantes_id_fk" FOREIGN KEY ("participante_id") REFERENCES "public"."participantes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_sesion_id_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloques_contenido" ADD CONSTRAINT "bloques_contenido_sesion_id_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cursos" ADD CONSTRAINT "cursos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cursos" ADD CONSTRAINT "cursos_tipo_curso_id_tipos_curso_id_fk" FOREIGN KEY ("tipo_curso_id") REFERENCES "public"."tipos_curso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cursos" ADD CONSTRAINT "cursos_lugar_id_lugares_id_fk" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluaciones" ADD CONSTRAINT "evaluaciones_participante_id_participantes_id_fk" FOREIGN KEY ("participante_id") REFERENCES "public"."participantes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluaciones" ADD CONSTRAINT "evaluaciones_sesion_id_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluaciones" ADD CONSTRAINT "evaluaciones_plantilla_id_plantillas_evaluacion_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantillas_evaluacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_sesion_id_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_asistencia_id_asistencias_id_fk" FOREIGN KEY ("asistencia_id") REFERENCES "public"."asistencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lugares" ADD CONSTRAINT "lugares_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nomina_items" ADD CONSTRAINT "nomina_items_curso_id_cursos_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."cursos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participantes" ADD CONSTRAINT "participantes_curso_id_cursos_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."cursos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas_evaluacion" ADD CONSTRAINT "plantillas_evaluacion_tipo_curso_id_tipos_curso_id_fk" FOREIGN KEY ("tipo_curso_id") REFERENCES "public"."tipos_curso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas_evaluacion" ADD CONSTRAINT "plantillas_evaluacion_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preguntas" ADD CONSTRAINT "preguntas_plantilla_id_plantillas_evaluacion_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantillas_evaluacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preguntas_encuesta" ADD CONSTRAINT "preguntas_encuesta_plantilla_id_plantillas_encuesta_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantillas_encuesta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profesor_materias" ADD CONSTRAINT "profesor_materias_profesor_id_profesores_id_fk" FOREIGN KEY ("profesor_id") REFERENCES "public"."profesores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profesor_materias" ADD CONSTRAINT "profesor_materias_tipo_curso_id_tipos_curso_id_fk" FOREIGN KEY ("tipo_curso_id") REFERENCES "public"."tipos_curso"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "respuestas_encuesta" ADD CONSTRAINT "respuestas_encuesta_plantilla_id_plantillas_encuesta_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantillas_encuesta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "respuestas_encuesta" ADD CONSTRAINT "respuestas_encuesta_sesion_id_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "respuestas_encuesta" ADD CONSTRAINT "respuestas_encuesta_participante_id_participantes_id_fk" FOREIGN KEY ("participante_id") REFERENCES "public"."participantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_curso_id_cursos_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."cursos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_profesor_id_profesores_id_fk" FOREIGN KEY ("profesor_id") REFERENCES "public"."profesores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adjuntos_sesion_idx" ON "adjuntos" USING btree ("sesion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asistencias_participante_sesion_uq" ON "asistencias" USING btree ("participante_id","sesion_id");--> statement-breakpoint
CREATE INDEX "asistencias_sesion_idx" ON "asistencias" USING btree ("sesion_id");--> statement-breakpoint
CREATE INDEX "audit_entidad_idx" ON "audit_log" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "audit_timestamp_idx" ON "audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "bloques_sesion_idx" ON "bloques_contenido" USING btree ("sesion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluaciones_participante_sesion_uq" ON "evaluaciones" USING btree ("participante_id","sesion_id");--> statement-breakpoint
CREATE INDEX "expedientes_sesion_idx" ON "expedientes" USING btree ("sesion_id");--> statement-breakpoint
CREATE INDEX "nomina_curso_idx" ON "nomina_items" USING btree ("curso_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participantes_curso_rut_uq" ON "participantes" USING btree ("curso_id","rut");--> statement-breakpoint
CREATE INDEX "participantes_curso_idx" ON "participantes" USING btree ("curso_id");--> statement-breakpoint
CREATE INDEX "preguntas_plantilla_idx" ON "preguntas" USING btree ("plantilla_id");--> statement-breakpoint
CREATE INDEX "preguntas_encuesta_plantilla_idx" ON "preguntas_encuesta" USING btree ("plantilla_id");--> statement-breakpoint
CREATE INDEX "respuestas_encuesta_sesion_idx" ON "respuestas_encuesta" USING btree ("sesion_id");--> statement-breakpoint
CREATE INDEX "sesiones_curso_idx" ON "sesiones" USING btree ("curso_id");