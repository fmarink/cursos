import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { sesionActual } from '@/lib/auth'
import { armarExpediente } from '@/lib/expediente'
import { formatearRut } from '@/lib/rut'

export const dynamic = 'force-dynamic'

/**
 * Exportación a Excel del expediente.
 *
 * Reemplaza la transcripción manual del libro de papel a planilla que hoy hace
 * operaciones después de cada curso.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await sesionActual()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const d = await armarExpediente(id)
  if (!d) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })

  if (usuario.rol === 'PROFESOR' && d.sesion.profesorId !== usuario.profesorId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const libro = new ExcelJS.Workbook()
  libro.creator = 'Uppercap'
  libro.created = new Date()

  // --- Hoja 1: datos de la actividad ---
  const hActividad = libro.addWorksheet('Actividad')
  hActividad.columns = [
    { header: 'Campo', key: 'campo', width: 32 },
    { header: 'Valor', key: 'valor', width: 52 },
  ]
  const datosActividad: [string, string][] = [
    ['Organismo capacitador', 'Uppercap'],
    ['Código de curso', d.curso.codigo],
    ['Nombre actividad', d.curso.nombreActividad],
    ['Tipo de curso', d.tipoCurso.nombre],
    ['Cliente', d.cliente.razonSocial],
    ['Fecha jornada', d.sesion.fecha],
    ['Horario', `${d.sesion.horaInicio} a ${d.sesion.horaFin}`],
    ['Horas totales del curso', String(d.curso.horas)],
    ['Lugar de ejecución', d.lugarNombre],
    ['Relator', d.profesor?.nombre ?? 'No asignado'],
    ['Nómina esperada', String(d.curso.nominaEsperada)],
    ['Participantes registrados', String(d.vigentes.length)],
    ['Con firma', String(d.resumen.conFirma)],
    ['Evaluados', String(d.resumen.evaluados)],
    ['Aprobados', String(d.resumen.aprobados)],
  ]
  datosActividad.forEach(([campo, valor]) => hActividad.addRow({ campo, valor }))

  // --- Hoja 2: asistencia y antecedentes ---
  const hAsistencia = libro.addWorksheet('Asistencia')
  hAsistencia.columns = [
    { header: 'N°', key: 'n', width: 5 },
    { header: 'Nombre completo', key: 'nombre', width: 34 },
    { header: 'RUT', key: 'rut', width: 14 },
    { header: 'Empresa', key: 'empresa', width: 24 },
    { header: 'Cargo', key: 'cargo', width: 22 },
    { header: 'Nivel escolaridad', key: 'escolaridad', width: 22 },
    { header: 'Hora registro', key: 'hora', width: 14 },
    { header: 'Origen', key: 'origen', width: 12 },
    { header: 'Firmó', key: 'firmo', width: 8 },
    { header: 'Nota', key: 'nota', width: 8 },
    { header: 'Resultado', key: 'resultado', width: 12 },
    { header: 'Observación', key: 'observacion', width: 30 },
  ]
  d.vigentes.forEach((r, i) =>
    hAsistencia.addRow({
      n: i + 1,
      nombre: r.nombre,
      rut: formatearRut(r.rut),
      empresa: r.empresa ?? '',
      cargo: r.cargo ?? '',
      escolaridad: r.nivelEscolaridad ?? '',
      hora: r.registradoEn
        ? new Date(r.registradoEn).toLocaleTimeString('es-CL', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'America/Santiago',
          })
        : '',
      origen: r.origen,
      firmo: r.tieneFirma ? 'Sí' : 'No',
      nota: r.nota ? Number(r.nota) : '',
      resultado: r.aprobado === null ? '' : r.aprobado ? 'Aprobado' : 'Reprobado',
      observacion: r.estadoValidacion === 'OK' ? '' : (r.notaRevision ?? r.estadoValidacion),
    }),
  )

  // --- Hoja 3: contenidos ---
  const hContenidos = libro.addWorksheet('Contenidos')
  hContenidos.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Tema', key: 'tema', width: 46 },
    { header: 'Actividades', key: 'actividades', width: 46 },
    { header: 'Inicio', key: 'inicio', width: 9 },
    { header: 'Término', key: 'fin', width: 9 },
    { header: 'Observaciones', key: 'observaciones', width: 34 },
  ]
  d.contenidos.forEach((c) =>
    hContenidos.addRow({
      fecha: d.sesion.fecha,
      tema: c.tema,
      actividades: c.actividades ?? '',
      inicio: c.horaInicio,
      fin: c.horaFin,
      observaciones: c.observaciones ?? '',
    }),
  )

  // --- Hoja 4: encuesta ---
  if (d.resumenEncuesta.length > 0) {
    const hEncuesta = libro.addWorksheet('Encuesta')
    hEncuesta.columns = [
      { header: 'Aspecto evaluado', key: 'aspecto', width: 56 },
      { header: 'Promedio', key: 'promedio', width: 12 },
      { header: 'Respuestas', key: 'respuestas', width: 12 },
    ]
    d.resumenEncuesta.forEach((p) =>
      hEncuesta.addRow({
        aspecto: p.enunciado,
        promedio: p.promedio === null ? '' : Number(p.promedio.toFixed(2)),
        respuestas: p.respuestas,
      }),
    )
    if (d.comentarios.length > 0) {
      hEncuesta.addRow({})
      hEncuesta.addRow({ aspecto: 'COMENTARIOS' })
      d.comentarios.forEach((c) => hEncuesta.addRow({ aspecto: c }))
    }
  }

  // Encabezados en negrita y con filtro, en todas las hojas.
  libro.eachSheet((hoja) => {
    hoja.getRow(1).font = { bold: true }
    hoja.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    }
    hoja.views = [{ state: 'frozen', ySplit: 1 }]
  })

  const buffer = await libro.xlsx.writeBuffer()

  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Expediente-${d.curso.codigo}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
