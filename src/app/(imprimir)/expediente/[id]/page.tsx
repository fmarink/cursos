import { notFound, redirect } from 'next/navigation'
import { armarExpediente } from '@/lib/expediente'
import { sesionActual } from '@/lib/auth'
import { formatearNota } from '@/lib/notas'
import { formatearRut } from '@/lib/rut'
import { formatearFecha, formatearFechaHora } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * Plantilla del expediente del curso.
 *
 * Reproduce las secciones del libro de control de clases en papel, pero con
 * todo tipografiado: es exactamente el punto del proyecto — se acaba el
 * problema de nombres y RUT ilegibles en el escaneo.
 *
 * Esta misma ruta es la que Puppeteer imprime a PDF.
 */
export default async function Imprimir({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await sesionActual())) redirect('/login')

  const d = await armarExpediente(id)
  if (!d) notFound()

  const generadoEn = formatearFechaHora(new Date())

  return (
    <div className="mx-auto max-w-[820px] bg-white p-10 text-[11px] leading-snug text-slate-900 print:p-0">
      {/* =================== PORTADA =================== */}
      <header className="mb-6 border-b-4 border-slate-900 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">
              Uppercap · Soluciones de aprendizaje
            </p>
            <h1 className="mt-1 text-2xl font-bold uppercase tracking-tight">
              Expediente de actividad de capacitación
            </h1>
          </div>
          <div className="text-right text-[10px] text-slate-500">
            <p>Documento generado electrónicamente</p>
            <p>{generadoEn}</p>
            <p className="font-mono">{d.curso.codigo}</p>
          </div>
        </div>
      </header>

      <Seccion titulo="Antecedentes de la actividad">
        <table className="w-full border-collapse">
          <tbody>
            <Fila etiqueta="Organismo capacitador" valor="Uppercap — Soluciones de Aprendizaje" />
            <Fila etiqueta="Nombre actividad de capacitación" valor={d.curso.nombreActividad} />
            <Fila etiqueta="Tipo de curso" valor={d.tipoCurso.nombre} />
            <Fila
              etiqueta="Modalidad de capacitación"
              valor={ETIQUETA_MODALIDAD[d.curso.modalidad] ?? d.curso.modalidad}
            />
            <Fila etiqueta="Cliente" valor={d.cliente.razonSocial} />
            <Fila etiqueta="Fecha inicio" valor={formatearFecha(d.curso.fechaInicio)} />
            <Fila etiqueta="Fecha término" valor={formatearFecha(d.curso.fechaTermino)} />
            <Fila etiqueta="Jornada del expediente" valor={formatearFecha(d.sesion.fecha, true)} />
            <Fila etiqueta="Horario" valor={`${d.sesion.horaInicio} a ${d.sesion.horaFin}`} />
            <Fila etiqueta="Duración total" valor={`${d.curso.horas} horas cronológicas`} />
            <Fila etiqueta="Lugar de ejecución" valor={d.lugarNombre} />
            <Fila etiqueta="Relator" valor={d.profesor?.nombre ?? 'No asignado'} />
            {d.curso.esSence && d.curso.codigoSenceAutorizado && (
              <Fila etiqueta="Código SENCE autorizado" valor={d.curso.codigoSenceAutorizado} />
            )}
            <Fila
              etiqueta="Participantes registrados"
              valor={
                d.curso.nominaEsperada > 0
                  ? `${d.vigentes.length} de ${d.curso.nominaEsperada} esperados`
                  : String(d.vigentes.length)
              }
            />
          </tbody>
        </table>
      </Seccion>

      {/* =================== CONTROL DE ASISTENCIA =================== */}
      <Seccion titulo="Control de asistencia de participantes">
        {d.vigentes.length === 0 ? (
          <p className="italic text-slate-500">Sin participantes registrados en esta jornada.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <Th className="w-8">N°</Th>
                <Th>Nombre completo</Th>
                <Th className="w-28">RUT</Th>
                <Th className="w-20">Hora</Th>
                <Th className="w-40">Firma</Th>
              </tr>
            </thead>
            <tbody>
              {d.vigentes.map((r, i) => (
                <tr key={r.participanteId} className="evitar-corte">
                  <Td className="text-center tabular-nums">{i + 1}</Td>
                  <Td className="font-medium">{r.nombre}</Td>
                  <Td className="tabular-nums">{formatearRut(r.rut)}</Td>
                  <Td className="text-center tabular-nums">
                    {r.registradoEn
                      ? new Date(r.registradoEn).toLocaleTimeString('es-CL', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                          timeZone: 'America/Santiago',
                        })
                      : '—'}
                  </Td>
                  <Td className="p-0">
                    {r.firmaPng ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.firmaPng}
                        alt={`Firma de ${r.nombre}`}
                        className="mx-auto h-12 w-auto max-w-[150px] object-contain"
                      />
                    ) : (
                      <span className="block py-4 text-center text-[9px] italic text-red-600">
                        Sin firma
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-[9px] leading-relaxed text-slate-500">
          Las firmas fueron capturadas digitalmente y constituyen firma electrónica simple conforme
          a la Ley 19.799. Cada registro conserva su marca de tiempo del servidor, dirección IP y
          hash SHA-256 de verificación, disponibles en el registro de auditoría de la plataforma.
        </p>
      </Seccion>

      {/* =================== ANTECEDENTES =================== */}
      <Seccion titulo="Antecedentes de los participantes" saltoPagina>
        {d.vigentes.length === 0 ? (
          <p className="italic text-slate-500">Sin datos.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <Th className="w-8">N°</Th>
                <Th className="w-28">RUT</Th>
                <Th>Nombre</Th>
                <Th className="w-32">Nivel escolaridad</Th>
                <Th className="w-32">Empresa</Th>
                <Th className="w-28">Cargo</Th>
              </tr>
            </thead>
            <tbody>
              {d.vigentes.map((r, i) => (
                <tr key={r.participanteId}>
                  <Td className="text-center tabular-nums">{i + 1}</Td>
                  <Td className="tabular-nums">{formatearRut(r.rut)}</Td>
                  <Td className="font-medium">{r.nombre}</Td>
                  <Td>{r.nivelEscolaridad ?? '—'}</Td>
                  <Td>{r.empresa ?? '—'}</Td>
                  <Td>{r.cargo ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      {/* =================== CONTENIDOS =================== */}
      <Seccion titulo="Contenidos de actividades de capacitación">
        {d.contenidos.length === 0 ? (
          <p className="italic text-slate-500">No se registraron contenidos para esta jornada.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <Th className="w-20">Fecha</Th>
                <Th>Temas</Th>
                <Th>Actividades</Th>
                <Th className="w-16">Inicio</Th>
                <Th className="w-16">Término</Th>
              </tr>
            </thead>
            <tbody>
              {d.contenidos.map((c) => (
                <tr key={c.id} className="evitar-corte">
                  <Td className="tabular-nums">{formatearFecha(d.sesion.fecha)}</Td>
                  <Td className="font-medium">
                    {c.tema}
                    {c.observaciones && (
                      <span className="mt-0.5 block text-[9px] italic text-slate-500">
                        {c.observaciones}
                      </span>
                    )}
                  </Td>
                  <Td>{c.actividades ?? '—'}</Td>
                  <Td className="text-center tabular-nums">{c.horaInicio}</Td>
                  <Td className="text-center tabular-nums">{c.horaFin}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      {/* =================== EVALUACIONES =================== */}
      <Seccion titulo="Evaluaciones">
        {d.plantillaEval ? (
          <p className="mb-2 text-[10px] text-slate-600">
            Instrumento: <span className="font-semibold">{d.plantillaEval.nombre}</span> · Nota
            mínima de aprobación: {formatearNota(d.umbral)} · Exigencia:{' '}
            {d.plantillaEval.exigencia}%
          </p>
        ) : (
          <p className="mb-2 text-[10px] italic text-slate-500">
            No se aplicó evaluación en esta jornada.
          </p>
        )}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <Th className="w-8">N°</Th>
              <Th>Apellidos, nombre</Th>
              <Th className="w-28">RUT</Th>
              <Th className="w-24">Fecha eval.</Th>
              <Th className="w-20">Nota final</Th>
              <Th className="w-24">Resultado</Th>
            </tr>
          </thead>
          <tbody>
            {d.vigentes.map((r, i) => (
              <tr key={r.participanteId}>
                <Td className="text-center tabular-nums">{i + 1}</Td>
                <Td className="font-medium">{r.nombre}</Td>
                <Td className="tabular-nums">{formatearRut(r.rut)}</Td>
                <Td className="text-center tabular-nums">
                  {r.nota !== null ? formatearFecha(d.sesion.fecha) : '—'}
                </Td>
                <Td className="text-center text-sm font-bold tabular-nums">
                  {formatearNota(r.nota)}
                </Td>
                <Td className="text-center font-semibold">
                  {r.aprobado === null || r.aprobado === undefined
                    ? '—'
                    : r.aprobado
                      ? 'Aprobado'
                      : 'Reprobado'}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.resumen.evaluados > 0 && (
          <p className="mt-2 text-[10px] text-slate-600">
            Evaluados: {d.resumen.evaluados} · Aprobados: {d.resumen.aprobados} · Reprobados:{' '}
            {d.resumen.evaluados - d.resumen.aprobados}
          </p>
        )}
      </Seccion>

      {/* =================== ENCUESTA =================== */}
      {d.encuestas.length > 0 && (
        <Seccion titulo="Encuesta de satisfacción">
          <p className="mb-2 text-[10px] text-slate-600">
            {d.encuestas.length} respuestas recibidas
            {d.plantillaEnc && ` · escala ${d.plantillaEnc.escalaMin} a ${d.plantillaEnc.escalaMax}`}
            {d.plantillaEnc?.anonima && ' · respuestas anónimas'}
          </p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <Th>Aspecto evaluado</Th>
                <Th className="w-24">Promedio</Th>
                <Th className="w-24">Respuestas</Th>
              </tr>
            </thead>
            <tbody>
              {d.resumenEncuesta.map((p, i) => (
                <tr key={i}>
                  <Td>{p.enunciado}</Td>
                  <Td className="text-center font-bold tabular-nums">
                    {p.promedio === null ? '—' : p.promedio.toFixed(1)}
                  </Td>
                  <Td className="text-center tabular-nums">{p.respuestas}</Td>
                </tr>
              ))}
            </tbody>
          </table>

          {d.comentarios.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 font-semibold">Comentarios</p>
              <ul className="space-y-1">
                {d.comentarios.map((c, i) => (
                  <li key={i} className="border-l-2 border-slate-300 pl-2 italic text-slate-700">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Seccion>
      )}

      {/* =================== FOTO GRUPAL =================== */}
      {d.fotoGrupal && (
        <Seccion titulo="Registro fotográfico" saltoPagina>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={d.fotoGrupal.datos}
            alt="Foto grupal del curso"
            className="w-full rounded border border-slate-300"
          />
          <p className="mt-1 text-center text-[9px] text-slate-500">
            Foto grupal — {d.curso.nombreActividad} — {formatearFecha(d.sesion.fecha)}
          </p>
        </Seccion>
      )}

      {/* =================== ALERTAS =================== */}
      {d.alertas.length > 0 && (
        <Seccion titulo="Observaciones de validación">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <Th>Participante</Th>
                <Th className="w-28">RUT</Th>
                <Th className="w-32">Observación</Th>
                <Th>Detalle</Th>
              </tr>
            </thead>
            <tbody>
              {d.alertas.map((a) => (
                <tr key={a.participanteId}>
                  <Td>{a.nombre}</Td>
                  <Td className="tabular-nums">{formatearRut(a.rut)}</Td>
                  <Td>{ETIQUETA_ALERTA[a.estado] ?? a.estado}</Td>
                  <Td>{a.nota ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Seccion>
      )}

      {/* =================== FIRMA DEL RELATOR =================== */}
      <section className="evitar-corte mt-10 border-t-2 border-slate-900 pt-6">
        <div className="flex justify-between gap-12">
          <div className="flex-1 text-center">
            <div className="mb-1 h-12 border-b border-slate-400" />
            <p className="font-semibold">{d.profesor?.nombre ?? 'Relator'}</p>
            <p className="text-[9px] text-slate-500">Relator de la actividad</p>
          </div>
          <div className="flex-1 text-center">
            <div className="mb-1 h-12 border-b border-slate-400" />
            <p className="font-semibold">Uppercap</p>
            <p className="text-[9px] text-slate-500">Organismo capacitador</p>
          </div>
          <div className="flex-1 text-center">
            <div className="mb-1 h-12 border-b border-slate-400" />
            <p className="font-semibold">{d.cliente.razonSocial}</p>
            <p className="text-[9px] text-slate-500">Recepción conforme</p>
          </div>
        </div>

        <p className="mt-8 text-center text-[9px] leading-relaxed text-slate-400">
          Documento generado automáticamente por la plataforma Uppercap el {generadoEn}. Los datos
          de asistencia, firmas y evaluaciones provienen del registro digital de la sesión{' '}
          <span className="font-mono">{d.sesion.id}</span> y no fueron transcritos manualmente.
          Toda modificación posterior al cierre queda registrada en el log de auditoría.
        </p>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------

const ETIQUETA_MODALIDAD: Record<string, string> = {
  PRESENCIAL_TEORICO: 'Presencial (Teórico)',
  PRESENCIAL_PRACTICO: 'Presencial (Práctico)',
  PRESENCIAL_MIXTO: 'Presencial (Teórico y Práctico)',
}

const ETIQUETA_ALERTA: Record<string, string> = {
  DUPLICADO_SOSPECHOSO: 'Registro duplicado',
  EXCEDE_NOMINA: 'Excede la nómina',
  FUERA_DE_NOMINA: 'Fuera de nómina',
  RUT_INVALIDO: 'RUT inválido',
  SIN_FIRMA: 'Sin firma',
}

function Seccion({
  titulo,
  children,
  saltoPagina,
}: {
  titulo: string
  children: React.ReactNode
  saltoPagina?: boolean
}) {
  return (
    <section className={`mb-6 ${saltoPagina ? 'salto-pagina' : ''}`}>
      <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-xs font-bold uppercase tracking-wider">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <tr>
      <td className="w-56 border border-slate-300 bg-slate-50 px-2 py-1.5 font-semibold">
        {etiqueta}
      </td>
      <td className="border border-slate-300 px-2 py-1.5">{valor}</td>
    </tr>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`border border-slate-400 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide ${className}`}
    >
      {children}
    </th>
  )
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`border border-slate-300 px-2 py-1.5 align-middle ${className}`}>{children}</td>
}
