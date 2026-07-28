/**
 * Datos de prueba.
 *
 * Reproduce el caso real del Libro de Control de Clases entregado por Uppercap:
 * "Manejo Gases Criogénicos", 17 de julio, Open Quillota, Anglo American.
 * Los nombres y RUT son ficticios — el libro original contiene datos personales
 * reales que no deben quedar en un repositorio.
 *
 *   npm run db:seed
 */
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../src/db/schema'
import { hashPasswordDirecto } from './utilidades'
import { createToken } from '../src/lib/ids'

const {
  clientes,
  cursos,
  lugares,
  nominaItems,
  plantillasEncuesta,
  plantillasEvaluacion,
  preguntas,
  preguntasEncuesta,
  profesorMaterias,
  profesores,
  sesiones,
  tiposCurso,
  usuarios,
} = schema

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool, { schema })

  console.log('Cargando datos de prueba...\n')

  // ---------------------------------------------------------------- Cliente
  const [anglo] = await db
    .insert(clientes)
    .values({
      razonSocial: 'Anglo American Sur S.A.',
      rut: '77762940-9',
      contactoNombre: 'Operaciones Capacitación',
      contactoEmail: 'capacitacion@ejemplo-anglo.cl',
      contactoTelefono: '+56 2 2230 0000',
    })
    .returning()
  console.log('  Cliente: Anglo American Sur S.A.')

  const [quillota, losBronces, elSoldado] = await db
    .insert(lugares)
    .values([
      { nombre: 'Open Quillota', tipo: 'HOTEL', comuna: 'Quillota', clienteId: null },
      { nombre: 'Faena Los Bronces', tipo: 'FAENA', comuna: 'Lo Barnechea', clienteId: anglo.id },
      { nombre: 'Faena El Soldado', tipo: 'FAENA', comuna: 'Nogales', clienteId: anglo.id },
    ])
    .returning()
  console.log('  Lugares: 3')

  // ---------------------------------------------------------- Tipos de curso
  const [criogenicos, altura, sustancias] = await db
    .insert(tiposCurso)
    .values([
      {
        nombre: 'Manejo de Gases Criogénicos',
        codigoInterno: 'CRIO',
        horasDefault: 8,
        tieneComponentePractico: false,
        descripcion:
          'Procedimiento de manejo de sustancias peligrosas, hojas de datos de seguridad y protocolo de uso de nitrógeno líquido.',
      },
      {
        nombre: 'Trabajo en Altura',
        codigoInterno: 'ALTURA',
        horasDefault: 8,
        tieneComponentePractico: true,
        descripcion: 'Trabajo en altura física con taller práctico.',
      },
      {
        nombre: 'Manejo de Sustancias Peligrosas',
        codigoInterno: 'SUSPEL',
        horasDefault: 16,
        tieneComponentePractico: true,
      },
    ])
    .returning()
  console.log('  Tipos de curso: 3')

  // ------------------------------------------------------------- Profesores
  const listaProfesores = await db
    .insert(profesores)
    .values([
      {
        nombre: 'Carlos Fuentes Alarcón',
        rut: '10456789-4',
        telefono: '+56 9 8765 4321',
        email: 'carlos.fuentes@ejemplo.cl',
        comuna: 'Viña del Mar',
      },
      {
        nombre: 'Patricia Rojas Miranda',
        rut: '12876543-3',
        telefono: '+56 9 7654 3210',
        email: 'patricia.rojas@ejemplo.cl',
        comuna: 'Quillota',
      },
      {
        nombre: 'Rodrigo Salinas Vera',
        rut: '9345678-5',
        telefono: '+56 9 6543 2109',
        email: 'rodrigo.salinas@ejemplo.cl',
        comuna: 'Santiago',
      },
    ])
    .returning()

  await db.insert(profesorMaterias).values([
    { profesorId: listaProfesores[0].id, tipoCursoId: criogenicos.id },
    { profesorId: listaProfesores[0].id, tipoCursoId: sustancias.id },
    { profesorId: listaProfesores[1].id, tipoCursoId: altura.id },
    { profesorId: listaProfesores[2].id, tipoCursoId: altura.id },
    { profesorId: listaProfesores[2].id, tipoCursoId: sustancias.id },
  ])
  console.log('  Profesores: 3')

  // ---------------------------------------------------------------- Usuarios
  const clave = await hashPasswordDirecto('uppercap2026')
  await db.insert(usuarios).values([
    {
      email: 'admin@uppercap.cl',
      passwordHash: clave,
      nombre: 'Administración Uppercap',
      rol: 'ADMIN',
    },
    {
      email: 'operaciones@uppercap.cl',
      passwordHash: clave,
      nombre: 'Operaciones Uppercap',
      rol: 'OPERACIONES',
    },
    {
      email: 'carlos.fuentes@ejemplo.cl',
      passwordHash: clave,
      nombre: 'Carlos Fuentes Alarcón',
      rol: 'PROFESOR',
      profesorId: listaProfesores[0].id,
    },
  ])
  console.log('  Usuarios: 3 (clave: uppercap2026)')

  // --------------------------------------------------- Plantilla evaluación
  const [plantillaCrio] = await db
    .insert(plantillasEvaluacion)
    .values({
      nombre: 'Evaluación Manejo de Gases Criogénicos',
      tipoCursoId: criogenicos.id,
      umbralAprobacion: '4.0',
      exigencia: 60,
    })
    .returning()

  await db.insert(preguntas).values([
    {
      plantillaId: plantillaCrio.id,
      orden: 1,
      enunciado:
        '¿Cuál es el principal riesgo asociado al contacto directo con nitrógeno líquido?',
      tipo: 'SELECCION_MULTIPLE',
      opciones: [
        'Quemadura por congelación (criogénica)',
        'Intoxicación por inhalación de vapores tóxicos',
        'Reacción explosiva con el oxígeno del aire',
        'Corrosión de la piel por acidez',
      ],
      respuestaCorrecta: '0',
      puntaje: 2,
    },
    {
      plantillaId: plantillaCrio.id,
      orden: 2,
      enunciado:
        'El nitrógeno líquido puede desplazar el oxígeno en espacios cerrados y provocar asfixia.',
      tipo: 'VERDADERO_FALSO',
      respuestaCorrecta: 'true',
      puntaje: 2,
    },
    {
      plantillaId: plantillaCrio.id,
      orden: 3,
      enunciado: '¿Qué documento entrega la información de seguridad de una sustancia peligrosa?',
      tipo: 'SELECCION_MULTIPLE',
      opciones: [
        'La orden de compra del proveedor',
        'La Hoja de Datos de Seguridad (HDS)',
        'El certificado de calidad del lote',
        'El manual de operación del equipo',
      ],
      respuestaCorrecta: '1',
      puntaje: 2,
    },
    {
      plantillaId: plantillaCrio.id,
      orden: 4,
      enunciado:
        'Es seguro transportar recipientes de nitrógeno líquido en ascensores ocupados por personas.',
      tipo: 'VERDADERO_FALSO',
      respuestaCorrecta: 'false',
      puntaje: 2,
    },
    {
      plantillaId: plantillaCrio.id,
      orden: 5,
      enunciado:
        '¿Qué elementos de protección personal son obligatorios al manipular gases criogénicos?',
      tipo: 'SELECCION_MULTIPLE',
      opciones: [
        'Solo guantes de cabritilla',
        'Antiparras y zapatos de seguridad únicamente',
        'Guantes criogénicos, protección facial, delantal y zapatos de seguridad',
        'No se requieren elementos especiales si la manipulación es breve',
      ],
      respuestaCorrecta: '2',
      puntaje: 2,
    },
    {
      plantillaId: plantillaCrio.id,
      orden: 6,
      enunciado:
        'Describa brevemente el procedimiento a seguir ante un derrame de nitrógeno líquido en un recinto cerrado.',
      tipo: 'RESPUESTA_BREVE',
      respuestaCorrecta: null,
      puntaje: 4,
    },
  ])
  console.log('  Plantilla de evaluación: 6 preguntas')

  // ----------------------------------------------------- Plantilla encuesta
  const [plantillaEncuesta] = await db
    .insert(plantillasEncuesta)
    .values({
      nombre: 'Encuesta de satisfacción Uppercap',
      escalaMin: 1,
      escalaMax: 7,
      anonima: true,
    })
    .returning()

  await db.insert(preguntasEncuesta).values([
    {
      plantillaId: plantillaEncuesta.id,
      orden: 1,
      enunciado: 'El relator dominaba los contenidos del curso.',
      tipo: 'ESCALA',
    },
    {
      plantillaId: plantillaEncuesta.id,
      orden: 2,
      enunciado: 'Los contenidos son aplicables a mi trabajo diario.',
      tipo: 'ESCALA',
    },
    {
      plantillaId: plantillaEncuesta.id,
      orden: 3,
      enunciado: 'El material entregado fue claro y suficiente.',
      tipo: 'ESCALA',
    },
    {
      plantillaId: plantillaEncuesta.id,
      orden: 4,
      enunciado: 'Las condiciones de la sala fueron adecuadas.',
      tipo: 'ESCALA',
    },
    {
      plantillaId: plantillaEncuesta.id,
      orden: 5,
      enunciado: 'Recomendaría este curso a un compañero de trabajo.',
      tipo: 'ESCALA',
    },
    {
      plantillaId: plantillaEncuesta.id,
      orden: 6,
      enunciado: '¿Qué mejoraría de este curso?',
      tipo: 'TEXTO',
    },
  ])
  console.log('  Plantilla de encuesta: 6 preguntas')

  // ------------------------------------------------------- Curso del caso real
  const hoy = new Date().toISOString().slice(0, 10)

  const [cursoCrio] = await db
    .insert(cursos)
    .values({
      codigo: `CRIO-${hoy.replace(/-/g, '')}-1`,
      nombreActividad: 'Manejo Gases Criogénicos',
      clienteId: anglo.id,
      tipoCursoId: criogenicos.id,
      lugarId: quillota.id,
      modalidad: 'PRESENCIAL_TEORICO',
      horas: 8,
      fechaInicio: hoy,
      fechaTermino: hoy,
      nominaEsperada: 10,
      observaciones:
        'Curso solicitado por Anglo American. Incluye alimentación. Perfil: mantenedores y operadores de planta.',
    })
    .returning()

  const [sesionCrio] = await db
    .insert(sesiones)
    .values({
      cursoId: cursoCrio.id,
      fecha: hoy,
      horaInicio: '08:00',
      horaFin: '18:00',
      profesorId: listaProfesores[0].id,
      plantillaEvaluacionId: plantillaCrio.id,
      plantillaEncuestaId: plantillaEncuesta.id,
      tokenAsistencia: createToken(),
      tokenEvaluacion: createToken(),
      tokenEncuesta: createToken(),
    })
    .returning()

  // Nómina ficticia equivalente a la del libro original (10 participantes).
  await db.insert(nominaItems).values(
    [
      ['Tomás Machuca Herrera', '15707103-3'],
      ['Daniel Pardo Rivera', '16460245-1'],
      ['Álvaro Díaz Vega', '17460290-5'],
      ['Arturo Alvarado Villar', '18209864-7'],
      ['David Quilpué González', '14257708-9'],
      ['Daniel Ruiz Gaete', '13577192-9'],
      ['Gerardo Cárcamo Órdenes', '19128576-K'],
      ['Ronny Maldonado Muñoz', '12282653-8'],
      ['Jordan Oñate Alfaro', '11688906-4'],
      ['Héctor Jofré Pardo', '20192043-4'],
    ].map(([nombre, rut]) => ({
      nombre,
      rut,
      empresa: 'Anglo American',
      cargo: 'Mantenedor',
      cursoId: cursoCrio.id,
    })),
  )
  console.log(`\n  Curso: ${cursoCrio.nombreActividad} (${cursoCrio.codigo})`)
  console.log(`  Nómina: 10 participantes`)

  // -------------------------------------------- Curso de 16 h en dos jornadas
  const manana = new Date()
  manana.setDate(manana.getDate() + 7)
  const pasado = new Date(manana)
  pasado.setDate(pasado.getDate() + 1)
  const f1 = manana.toISOString().slice(0, 10)
  const f2 = pasado.toISOString().slice(0, 10)

  const [cursoAltura] = await db
    .insert(cursos)
    .values({
      codigo: `ALTURA-${f1.replace(/-/g, '')}-1`,
      nombreActividad: 'Trabajo en Altura Física',
      clienteId: anglo.id,
      tipoCursoId: altura.id,
      lugarId: losBronces.id,
      modalidad: 'PRESENCIAL_MIXTO',
      horas: 16,
      fechaInicio: f1,
      fechaTermino: f2,
      nominaEsperada: 12,
      observaciones: '8 horas teóricas el primer día, 8 horas de taller práctico el segundo.',
    })
    .returning()

  await db.insert(sesiones).values([
    {
      cursoId: cursoAltura.id,
      fecha: f1,
      horaInicio: '08:00',
      horaFin: '17:00',
      profesorId: listaProfesores[1].id,
      plantillaEncuestaId: plantillaEncuesta.id,
      tokenAsistencia: createToken(),
      tokenEvaluacion: createToken(),
      tokenEncuesta: createToken(),
    },
    {
      cursoId: cursoAltura.id,
      fecha: f2,
      horaInicio: '08:00',
      horaFin: '17:00',
      profesorId: listaProfesores[1].id,
      plantillaEncuestaId: plantillaEncuesta.id,
      tokenAsistencia: createToken(),
      tokenEvaluacion: createToken(),
      tokenEncuesta: createToken(),
    },
  ])
  console.log(`  Curso: ${cursoAltura.nombreActividad} (2 jornadas)`)

  // Curso pasado en El Soldado, para que el tablero no salga vacío.
  const semanaPasada = new Date()
  semanaPasada.setDate(semanaPasada.getDate() - 10)
  const fp = semanaPasada.toISOString().slice(0, 10)

  const [cursoPasado] = await db
    .insert(cursos)
    .values({
      codigo: `SUSPEL-${fp.replace(/-/g, '')}-1`,
      nombreActividad: 'Manejo de Sustancias Peligrosas',
      clienteId: anglo.id,
      tipoCursoId: sustancias.id,
      lugarId: elSoldado.id,
      modalidad: 'PRESENCIAL_MIXTO',
      horas: 16,
      fechaInicio: fp,
      fechaTermino: fp,
      nominaEsperada: 8,
      estado: 'PROGRAMADO',
    })
    .returning()

  await db.insert(sesiones).values({
    cursoId: cursoPasado.id,
    fecha: fp,
    horaInicio: '08:00',
    horaFin: '17:00',
    profesorId: listaProfesores[2].id,
    tokenAsistencia: createToken(),
    tokenEvaluacion: createToken(),
    tokenEncuesta: createToken(),
  })

  console.log('\n--- Listo ---')
  console.log('\nIngrese en http://localhost:3000/login con:')
  console.log('  admin@uppercap.cl        / uppercap2026   (administración)')
  console.log('  operaciones@uppercap.cl  / uppercap2026   (operaciones)')
  console.log('  carlos.fuentes@ejemplo.cl / uppercap2026  (relator del curso de hoy)')
  console.log(`\nSesión del curso de hoy: /sesiones/${sesionCrio.id}`)
  console.log(`QR de asistencia:        /a/${sesionCrio.tokenAsistencia}\n`)

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
