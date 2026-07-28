/**
 * Uppercap — Plataforma de registro digital de cursos
 * Modelo de datos alineado con el Libro de Control de Clases en papel.
 *
 * Mapeo con el libro físico:
 *   Portada / datos de actividad ..... cursos + tiposCurso + clientes + lugares
 *   "EVALUACIONES" ................... evaluaciones (nota final por participante)
 *   "CONTENIDOS DE ACTIVIDADES" ...... bloquesContenido (fecha, tema, actividad, horario, firma relator)
 *   "CONTROL DE ASISTENCIA" .......... participantes + asistencias + firmas (1 firma por jornada)
 *   "ANTECEDENTES PARTICIPANTES" ..... participantes (rut, escolaridad, empresa, cargo)
 *
 * SENCE: los campos normados existen pero son opcionales y no se validan.
 * Ver README, sección "Alcance y no-alcance".
 */
import { relations } from 'drizzle-orm'
import {
  boolean,
  date,
  integer,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { createId } from '@/lib/ids'

const id = () =>
  varchar('id', { length: 30 })
    .primaryKey()
    .$defaultFn(() => createId())

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const rolEnum = pgEnum('rol', ['ADMIN', 'OPERACIONES', 'PROFESOR'])

export const tipoLugarEnum = pgEnum('tipo_lugar', ['FAENA', 'HOTEL', 'OFICINA', 'OTRO'])

export const estadoCursoEnum = pgEnum('estado_curso', [
  'PROGRAMADO',
  'EN_CURSO',
  'CERRADO',
  'EXPEDIENTE_VALIDADO',
  'ENVIADO_AL_CLIENTE',
  'ANULADO',
])

export const modalidadEnum = pgEnum('modalidad_curso', [
  'PRESENCIAL_TEORICO',
  'PRESENCIAL_PRACTICO',
  'PRESENCIAL_MIXTO',
])

export const estadoSesionEnum = pgEnum('estado_sesion', [
  'PROGRAMADA',
  'ABIERTA',
  'CERRADA',
  'REABIERTA',
])

export const origenRegistroEnum = pgEnum('origen_registro', [
  'QR',
  'TABLET',
  'MANUAL',
  'PAPEL',
  'IMPORTADO',
])

export const estadoValidacionEnum = pgEnum('estado_validacion', [
  'OK',
  'DUPLICADO_SOSPECHOSO',
  'EXCEDE_NOMINA',
  'FUERA_DE_NOMINA',
  'RUT_INVALIDO',
  'SIN_FIRMA',
  'ANULADO',
])

export const tipoPreguntaEnum = pgEnum('tipo_pregunta', [
  'SELECCION_MULTIPLE',
  'VERDADERO_FALSO',
  'RESPUESTA_BREVE',
])

export const tipoPreguntaEncuestaEnum = pgEnum('tipo_pregunta_encuesta', [
  'ESCALA',
  'TEXTO',
  'SI_NO',
])

export const tipoAdjuntoEnum = pgEnum('tipo_adjunto', [
  'FOTO_GRUPAL',
  'FOTO_SALA',
  'LIBRO_PAPEL',
  'OTRO',
])

// ---------------------------------------------------------------------------
// Usuarios y acceso
// ---------------------------------------------------------------------------

export const usuarios = pgTable('usuarios', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nombre: text('nombre').notNull(),
  rol: rolEnum('rol').notNull(),
  activo: boolean('activo').notNull().default(true),
  ultimoAcceso: timestamp('ultimo_acceso', { withTimezone: true }),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  /** Un usuario con rol PROFESOR está vinculado a su ficha de profesor. */
  profesorId: varchar('profesor_id', { length: 30 }),
})

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

export const clientes = pgTable('clientes', {
  id: id(),
  razonSocial: text('razon_social').notNull(),
  rut: text('rut'),
  contactoNombre: text('contacto_nombre'),
  contactoEmail: text('contacto_email'),
  contactoTelefono: text('contacto_telefono'),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
})

export const lugares = pgTable('lugares', {
  id: id(),
  nombre: text('nombre').notNull(),
  tipo: tipoLugarEnum('tipo').notNull().default('OTRO'),
  direccion: text('direccion'),
  comuna: text('comuna'),
  activo: boolean('activo').notNull().default(true),
  clienteId: varchar('cliente_id', { length: 30 }).references(() => clientes.id),
})

export const tiposCurso = pgTable('tipos_curso', {
  id: id(),
  nombre: text('nombre').notNull(),
  codigoInterno: text('codigo_interno'),
  horasDefault: integer('horas_default').notNull().default(8),
  tieneComponentePractico: boolean('tiene_componente_practico').notNull().default(false),
  descripcion: text('descripcion'),
  activo: boolean('activo').notNull().default(true),
  /** Preparado para SENCE — no se usa en cursos no-SENCE. */
  codigoSence: text('codigo_sence'),
})

export const profesores = pgTable('profesores', {
  id: id(),
  nombre: text('nombre').notNull(),
  rut: text('rut'),
  telefono: text('telefono'),
  email: text('email'),
  direccion: text('direccion'),
  comuna: text('comuna'),
  notas: text('notas'),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
})

export const profesorMaterias = pgTable(
  'profesor_materias',
  {
    profesorId: varchar('profesor_id', { length: 30 })
      .notNull()
      .references(() => profesores.id, { onDelete: 'cascade' }),
    tipoCursoId: varchar('tipo_curso_id', { length: 30 })
      .notNull()
      .references(() => tiposCurso.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.profesorId, t.tipoCursoId] })],
)

// ---------------------------------------------------------------------------
// Cursos y sesiones
// ---------------------------------------------------------------------------

/**
 * Un Curso es una instancia dictada a un cliente. Puede tener N sesiones
 * (jornadas): un curso de 16 h se parte típicamente en dos días.
 */
export const cursos = pgTable('cursos', {
  id: id(),
  codigo: text('codigo').notNull().unique(),
  nombreActividad: text('nombre_actividad').notNull(),
  modalidad: modalidadEnum('modalidad').notNull().default('PRESENCIAL_TEORICO'),
  horas: integer('horas').notNull(),
  fechaInicio: date('fecha_inicio').notNull(),
  fechaTermino: date('fecha_termino').notNull(),
  nominaEsperada: integer('nomina_esperada').notNull().default(0),
  estado: estadoCursoEnum('estado').notNull().default('PROGRAMADO'),
  observaciones: text('observaciones'),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  /** Preparado para SENCE — no se exige ni valida en cursos no-SENCE. */
  esSence: boolean('es_sence').notNull().default(false),
  codigoSenceAutorizado: text('codigo_sence_autorizado'),
  clienteId: varchar('cliente_id', { length: 30 })
    .notNull()
    .references(() => clientes.id),
  tipoCursoId: varchar('tipo_curso_id', { length: 30 })
    .notNull()
    .references(() => tiposCurso.id),
  lugarId: varchar('lugar_id', { length: 30 }).references(() => lugares.id),
  /** Lugar escrito a mano cuando no está en el catálogo. */
  lugarLibre: text('lugar_libre'),
})

/**
 * Una Sesion es una jornada concreta: un curso, una fecha, un horario y un
 * profesor. Los QR se emiten a nivel de sesión.
 */
export const sesiones = pgTable(
  'sesiones',
  {
    id: id(),
    fecha: date('fecha').notNull(),
    horaInicio: text('hora_inicio').notNull(),
    horaFin: text('hora_fin').notNull(),
    estado: estadoSesionEnum('estado').notNull().default('PROGRAMADA'),
    cerradaEn: timestamp('cerrada_en', { withTimezone: true }),
    reabiertaEn: timestamp('reabierta_en', { withTimezone: true }),
    motivoReapertura: text('motivo_reapertura'),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    // Tokens opacos, uno por propósito. El profesor decide cuándo habilitar cada flujo.
    tokenAsistencia: text('token_asistencia').notNull().unique(),
    tokenEvaluacion: text('token_evaluacion').notNull().unique(),
    tokenEncuesta: text('token_encuesta').notNull().unique(),
    asistenciaAbierta: boolean('asistencia_abierta').notNull().default(false),
    evaluacionAbierta: boolean('evaluacion_abierta').notNull().default(false),
    encuestaAbierta: boolean('encuesta_abierta').notNull().default(false),
    cursoId: varchar('curso_id', { length: 30 })
      .notNull()
      .references(() => cursos.id, { onDelete: 'cascade' }),
    profesorId: varchar('profesor_id', { length: 30 }).references(() => profesores.id),
    plantillaEvaluacionId: varchar('plantilla_evaluacion_id', { length: 30 }),
    plantillaEncuestaId: varchar('plantilla_encuesta_id', { length: 30 }),
  },
  (t) => [index('sesiones_curso_idx').on(t.cursoId)],
)

/**
 * Nómina enviada por el cliente. Es referencia para conciliar, NUNCA lista
 * blanca: un registro fuera de nómina se acepta y se marca para revisión.
 */
export const nominaItems = pgTable(
  'nomina_items',
  {
    id: id(),
    nombre: text('nombre').notNull(),
    rut: text('rut'),
    empresa: text('empresa'),
    cargo: text('cargo'),
    cursoId: varchar('curso_id', { length: 30 })
      .notNull()
      .references(() => cursos.id, { onDelete: 'cascade' }),
  },
  (t) => [index('nomina_curso_idx').on(t.cursoId)],
)

// ---------------------------------------------------------------------------
// Participantes, asistencia y firmas
// ---------------------------------------------------------------------------

/**
 * Un Participante es una persona inscrita en un curso: una fila del
 * "Control de asistencia" y de "Antecedentes participantes".
 */
export const participantes = pgTable(
  'participantes',
  {
    id: id(),
    nombre: text('nombre').notNull(),
    /** RUT normalizado sin puntos y con guion: "12345678-9" */
    rut: text('rut').notNull(),
    email: text('email'),
    telefono: text('telefono'),
    // Sección "Antecedentes participantes" del libro
    empresa: text('empresa'),
    cargo: text('cargo'),
    nivelEscolaridad: text('nivel_escolaridad'),
    origen: origenRegistroEnum('origen').notNull().default('QR'),
    estadoValidacion: estadoValidacionEnum('estado_validacion').notNull().default('OK'),
    notaRevision: text('nota_revision'),
    anulado: boolean('anulado').notNull().default(false),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
    cursoId: varchar('curso_id', { length: 30 })
      .notNull()
      .references(() => cursos.id, { onDelete: 'cascade' }),
    /**
     * Alumno de la nómina enviada por el cliente al que corresponde este
     * registro. Se llena solo cuando la persona elige su nombre de la lista,
     * y a mano cuando el instructor concilia los que no calzaron.
     * Null = registro sin conciliar todavía.
     */
    nominaItemId: varchar('nomina_item_id', { length: 30 }),
    /** Quién hizo el vínculo: la propia persona, o el instructor. */
    vinculadoPor: text('vinculado_por'),
    vinculadoEn: timestamp('vinculado_en', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('participantes_curso_rut_uq').on(t.cursoId, t.rut),
    index('participantes_curso_idx').on(t.cursoId),
    // Un alumno de la nómina no puede quedar vinculado a dos registros.
    uniqueIndex('participantes_nomina_item_uq').on(t.nominaItemId),
  ],
)

/**
 * Presencia de un participante en una jornada concreta.
 * Equivale a una celda FECHA+FIRMA del control de asistencia en papel.
 */
export const asistencias = pgTable(
  'asistencias',
  {
    id: id(),
    registradoEn: timestamp('registrado_en', { withTimezone: true }).notNull().defaultNow(),
    presente: boolean('presente').notNull().default(true),
    origen: origenRegistroEnum('origen').notNull().default('QR'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    dispositivo: text('dispositivo'),
    participanteId: varchar('participante_id', { length: 30 })
      .notNull()
      .references(() => participantes.id, { onDelete: 'cascade' }),
    sesionId: varchar('sesion_id', { length: 30 })
      .notNull()
      .references(() => sesiones.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('asistencias_participante_sesion_uq').on(t.participanteId, t.sesionId),
    index('asistencias_sesion_idx').on(t.sesionId),
  ],
)

/**
 * Firma electrónica simple (Ley 19.799). Se guarda la imagen, los trazos
 * vectoriales y un hash del registro para trazabilidad.
 */
export const firmas = pgTable('firmas', {
  id: id(),
  /** PNG en base64 (data URL completa). Fondo transparente. */
  imagenPng: text('imagen_png').notNull(),
  /** Trazos vectoriales para re-render y peritaje. */
  trazosJson: jsonb('trazos_json'),
  /** SHA-256 de (rut|nombre|sesionId|timestamp|imagen) */
  hash: text('hash').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  firmadoEn: timestamp('firmado_en', { withTimezone: true }).notNull().defaultNow(),
  asistenciaId: varchar('asistencia_id', { length: 30 })
    .notNull()
    .unique()
    .references(() => asistencias.id, { onDelete: 'cascade' }),
})

// ---------------------------------------------------------------------------
// Evaluación
// ---------------------------------------------------------------------------

export const plantillasEvaluacion = pgTable('plantillas_evaluacion', {
  id: id(),
  nombre: text('nombre').notNull(),
  /** Nota mínima de aprobación en escala 1.0–7.0 */
  umbralAprobacion: numeric('umbral_aprobacion', { precision: 2, scale: 1 })
    .notNull()
    .default('4.0'),
  /** Porcentaje de logro exigido para la nota mínima (escala chilena) */
  exigencia: integer('exigencia').notNull().default(60),
  activa: boolean('activa').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  tipoCursoId: varchar('tipo_curso_id', { length: 30 }).references(() => tiposCurso.id),
  clienteId: varchar('cliente_id', { length: 30 }).references(() => clientes.id),
})

export const preguntas = pgTable(
  'preguntas',
  {
    id: id(),
    orden: integer('orden').notNull(),
    enunciado: text('enunciado').notNull(),
    tipo: tipoPreguntaEnum('tipo').notNull(),
    /** ["opción a", "opción b", ...] para selección múltiple */
    opciones: jsonb('opciones').$type<string[] | null>(),
    /** Índice de la opción correcta, "true"/"false", o texto esperado. */
    respuestaCorrecta: text('respuesta_correcta'),
    puntaje: integer('puntaje').notNull().default(1),
    plantillaId: varchar('plantilla_id', { length: 30 })
      .notNull()
      .references(() => plantillasEvaluacion.id, { onDelete: 'cascade' }),
  },
  (t) => [index('preguntas_plantilla_idx').on(t.plantillaId)],
)

export const evaluaciones = pgTable(
  'evaluaciones',
  {
    id: id(),
    /** { preguntaId: respuesta } */
    respuestas: jsonb('respuestas').notNull().$type<Record<string, string>>(),
    /** { preguntaId: puntajeObtenido } — permite corrección manual de abiertas */
    puntajes: jsonb('puntajes').$type<Record<string, number> | null>(),
    puntajeTotal: integer('puntaje_total').notNull().default(0),
    puntajeMaximo: integer('puntaje_maximo').notNull().default(0),
    nota: numeric('nota', { precision: 2, scale: 1 }),
    aprobado: boolean('aprobado'),
    requiereCorreccionManual: boolean('requiere_correccion_manual').notNull().default(false),
    corregidaPor: text('corregida_por'),
    corregidaEn: timestamp('corregida_en', { withTimezone: true }),
    completadaEn: timestamp('completada_en', { withTimezone: true }).notNull().defaultNow(),
    participanteId: varchar('participante_id', { length: 30 })
      .notNull()
      .references(() => participantes.id, { onDelete: 'cascade' }),
    sesionId: varchar('sesion_id', { length: 30 })
      .notNull()
      .references(() => sesiones.id, { onDelete: 'cascade' }),
    plantillaId: varchar('plantilla_id', { length: 30 })
      .notNull()
      .references(() => plantillasEvaluacion.id),
  },
  (t) => [uniqueIndex('evaluaciones_participante_sesion_uq').on(t.participanteId, t.sesionId)],
)

// ---------------------------------------------------------------------------
// Encuesta de satisfacción
// ---------------------------------------------------------------------------

export const plantillasEncuesta = pgTable('plantillas_encuesta', {
  id: id(),
  nombre: text('nombre').notNull(),
  escalaMin: integer('escala_min').notNull().default(1),
  escalaMax: integer('escala_max').notNull().default(7),
  /** Si es anónima no se vincula el participante a su respuesta. */
  anonima: boolean('anonima').notNull().default(true),
  activa: boolean('activa').notNull().default(true),
})

export const preguntasEncuesta = pgTable(
  'preguntas_encuesta',
  {
    id: id(),
    orden: integer('orden').notNull(),
    enunciado: text('enunciado').notNull(),
    tipo: tipoPreguntaEncuestaEnum('tipo').notNull().default('ESCALA'),
    plantillaId: varchar('plantilla_id', { length: 30 })
      .notNull()
      .references(() => plantillasEncuesta.id, { onDelete: 'cascade' }),
  },
  (t) => [index('preguntas_encuesta_plantilla_idx').on(t.plantillaId)],
)

export const respuestasEncuesta = pgTable(
  'respuestas_encuesta',
  {
    id: id(),
    respuestas: jsonb('respuestas').notNull().$type<Record<string, string | number>>(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    plantillaId: varchar('plantilla_id', { length: 30 })
      .notNull()
      .references(() => plantillasEncuesta.id),
    sesionId: varchar('sesion_id', { length: 30 })
      .notNull()
      .references(() => sesiones.id, { onDelete: 'cascade' }),
    /** Null cuando la encuesta es anónima. */
    participanteId: varchar('participante_id', { length: 30 }).references(() => participantes.id),
  },
  (t) => [index('respuestas_encuesta_sesion_idx').on(t.sesionId)],
)

// ---------------------------------------------------------------------------
// Contenidos, adjuntos y expediente
// ---------------------------------------------------------------------------

/** Una fila de "CONTENIDOS DE ACTIVIDADES DE CAPACITACIÓN". */
export const bloquesContenido = pgTable(
  'bloques_contenido',
  {
    id: id(),
    orden: integer('orden').notNull().default(0),
    tema: text('tema').notNull(),
    actividades: text('actividades'),
    horaInicio: text('hora_inicio').notNull(),
    horaFin: text('hora_fin').notNull(),
    observaciones: text('observaciones'),
    /** Firma del relator para ese bloque (PNG base64). */
    firmaRelatorPng: text('firma_relator_png'),
    sesionId: varchar('sesion_id', { length: 30 })
      .notNull()
      .references(() => sesiones.id, { onDelete: 'cascade' }),
  },
  (t) => [index('bloques_sesion_idx').on(t.sesionId)],
)

export const adjuntos = pgTable(
  'adjuntos',
  {
    id: id(),
    tipo: tipoAdjuntoEnum('tipo').notNull().default('OTRO'),
    nombre: text('nombre').notNull(),
    mime: text('mime').notNull(),
    /** Contenido en base64. Sustituible por object storage — ver README. */
    datos: text('datos').notNull(),
    bytes: integer('bytes').notNull().default(0),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    sesionId: varchar('sesion_id', { length: 30 })
      .notNull()
      .references(() => sesiones.id, { onDelete: 'cascade' }),
  },
  (t) => [index('adjuntos_sesion_idx').on(t.sesionId)],
)

export const expedientes = pgTable(
  'expedientes',
  {
    id: id(),
    version: integer('version').notNull().default(1),
    /** PDF en base64. */
    pdfBase64: text('pdf_base64'),
    bytes: integer('bytes').notNull().default(0),
    generadoEn: timestamp('generado_en', { withTimezone: true }).notNull().defaultNow(),
    generadoPor: text('generado_por'),
    validadoEn: timestamp('validado_en', { withTimezone: true }),
    validadoPor: text('validado_por'),
    enviadoA: text('enviado_a'),
    enviadoCc: text('enviado_cc'),
    enviadoEn: timestamp('enviado_en', { withTimezone: true }),
    enviadoPor: text('enviado_por'),
    asuntoEnvio: text('asunto_envio'),
    sesionId: varchar('sesion_id', { length: 30 })
      .notNull()
      .references(() => sesiones.id, { onDelete: 'cascade' }),
  },
  (t) => [index('expedientes_sesion_idx').on(t.sesionId)],
)

// ---------------------------------------------------------------------------
// Auditoría — nada se elimina físicamente, todo queda trazado.
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    entidad: text('entidad').notNull(),
    entidadId: text('entidad_id').notNull(),
    accion: text('accion').notNull(),
    valorAnterior: jsonb('valor_anterior'),
    valorNuevo: jsonb('valor_nuevo'),
    ip: text('ip'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    usuarioId: varchar('usuario_id', { length: 30 }).references(() => usuarios.id),
    /** Cuando la acción la ejecuta un participante sin cuenta. */
    actorAnonimo: text('actor_anonimo'),
  },
  (t) => [
    index('audit_entidad_idx').on(t.entidad, t.entidadId),
    index('audit_timestamp_idx').on(t.timestamp),
  ],
)

// ---------------------------------------------------------------------------
// Relaciones
// ---------------------------------------------------------------------------

export const usuariosRel = relations(usuarios, ({ one }) => ({
  profesor: one(profesores, { fields: [usuarios.profesorId], references: [profesores.id] }),
}))

export const clientesRel = relations(clientes, ({ many }) => ({
  lugares: many(lugares),
  cursos: many(cursos),
}))

export const lugaresRel = relations(lugares, ({ one, many }) => ({
  cliente: one(clientes, { fields: [lugares.clienteId], references: [clientes.id] }),
  cursos: many(cursos),
}))

export const tiposCursoRel = relations(tiposCurso, ({ many }) => ({
  cursos: many(cursos),
  materias: many(profesorMaterias),
}))

export const profesoresRel = relations(profesores, ({ many }) => ({
  materias: many(profesorMaterias),
  sesiones: many(sesiones),
}))

export const profesorMateriasRel = relations(profesorMaterias, ({ one }) => ({
  profesor: one(profesores, {
    fields: [profesorMaterias.profesorId],
    references: [profesores.id],
  }),
  tipoCurso: one(tiposCurso, {
    fields: [profesorMaterias.tipoCursoId],
    references: [tiposCurso.id],
  }),
}))

export const cursosRel = relations(cursos, ({ one, many }) => ({
  cliente: one(clientes, { fields: [cursos.clienteId], references: [clientes.id] }),
  tipoCurso: one(tiposCurso, { fields: [cursos.tipoCursoId], references: [tiposCurso.id] }),
  lugar: one(lugares, { fields: [cursos.lugarId], references: [lugares.id] }),
  sesiones: many(sesiones),
  participantes: many(participantes),
  nomina: many(nominaItems),
}))

export const sesionesRel = relations(sesiones, ({ one, many }) => ({
  curso: one(cursos, { fields: [sesiones.cursoId], references: [cursos.id] }),
  profesor: one(profesores, { fields: [sesiones.profesorId], references: [profesores.id] }),
  asistencias: many(asistencias),
  contenidos: many(bloquesContenido),
  evaluaciones: many(evaluaciones),
  encuestas: many(respuestasEncuesta),
  adjuntos: many(adjuntos),
  expedientes: many(expedientes),
}))

export const nominaItemsRel = relations(nominaItems, ({ one }) => ({
  curso: one(cursos, { fields: [nominaItems.cursoId], references: [cursos.id] }),
}))

export const participantesRel = relations(participantes, ({ one, many }) => ({
  curso: one(cursos, { fields: [participantes.cursoId], references: [cursos.id] }),
  nominaItem: one(nominaItems, {
    fields: [participantes.nominaItemId],
    references: [nominaItems.id],
  }),
  asistencias: many(asistencias),
  evaluaciones: many(evaluaciones),
}))

export const asistenciasRel = relations(asistencias, ({ one }) => ({
  participante: one(participantes, {
    fields: [asistencias.participanteId],
    references: [participantes.id],
  }),
  sesion: one(sesiones, { fields: [asistencias.sesionId], references: [sesiones.id] }),
  firma: one(firmas, { fields: [asistencias.id], references: [firmas.asistenciaId] }),
}))

export const firmasRel = relations(firmas, ({ one }) => ({
  asistencia: one(asistencias, {
    fields: [firmas.asistenciaId],
    references: [asistencias.id],
  }),
}))

export const plantillasEvaluacionRel = relations(plantillasEvaluacion, ({ many }) => ({
  preguntas: many(preguntas),
  evaluaciones: many(evaluaciones),
}))

export const preguntasRel = relations(preguntas, ({ one }) => ({
  plantilla: one(plantillasEvaluacion, {
    fields: [preguntas.plantillaId],
    references: [plantillasEvaluacion.id],
  }),
}))

export const evaluacionesRel = relations(evaluaciones, ({ one }) => ({
  participante: one(participantes, {
    fields: [evaluaciones.participanteId],
    references: [participantes.id],
  }),
  sesion: one(sesiones, { fields: [evaluaciones.sesionId], references: [sesiones.id] }),
  plantilla: one(plantillasEvaluacion, {
    fields: [evaluaciones.plantillaId],
    references: [plantillasEvaluacion.id],
  }),
}))

export const plantillasEncuestaRel = relations(plantillasEncuesta, ({ many }) => ({
  preguntas: many(preguntasEncuesta),
  respuestas: many(respuestasEncuesta),
}))

export const preguntasEncuestaRel = relations(preguntasEncuesta, ({ one }) => ({
  plantilla: one(plantillasEncuesta, {
    fields: [preguntasEncuesta.plantillaId],
    references: [plantillasEncuesta.id],
  }),
}))

export const respuestasEncuestaRel = relations(respuestasEncuesta, ({ one }) => ({
  plantilla: one(plantillasEncuesta, {
    fields: [respuestasEncuesta.plantillaId],
    references: [plantillasEncuesta.id],
  }),
  sesion: one(sesiones, { fields: [respuestasEncuesta.sesionId], references: [sesiones.id] }),
}))

export const bloquesContenidoRel = relations(bloquesContenido, ({ one }) => ({
  sesion: one(sesiones, { fields: [bloquesContenido.sesionId], references: [sesiones.id] }),
}))

export const adjuntosRel = relations(adjuntos, ({ one }) => ({
  sesion: one(sesiones, { fields: [adjuntos.sesionId], references: [sesiones.id] }),
}))

export const expedientesRel = relations(expedientes, ({ one }) => ({
  sesion: one(sesiones, { fields: [expedientes.sesionId], references: [sesiones.id] }),
}))
