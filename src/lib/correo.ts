/**
 * Envío de correo transaccional.
 *
 * Implementación conmutable por variable de entorno. Por defecto usa el
 * transporte `consola`, que registra el envío sin salir a la red — así el
 * sistema es operable de punta a punta antes de contratar el proveedor.
 *
 * Para producción: definir CORREO_PROVEEDOR=resend y RESEND_API_KEY.
 * Cualquier otro proveedor se agrega implementando una función con esta misma
 * firma; el resto de la aplicación no cambia.
 */

export type Adjunto = { nombre: string; contenidoBase64: string; mime: string }

export type ResultadoEnvio =
  | { ok: true; id: string; proveedor: string }
  | { ok: false; error: string }

export async function enviarCorreo(opciones: {
  para: string[]
  cc?: string[]
  asunto: string
  html: string
  adjuntos?: Adjunto[]
}): Promise<ResultadoEnvio> {
  const proveedor = process.env.CORREO_PROVEEDOR ?? 'consola'

  if (proveedor === 'resend') return enviarConResend(opciones)
  return enviarPorConsola(opciones)
}

async function enviarPorConsola(opciones: {
  para: string[]
  cc?: string[]
  asunto: string
  adjuntos?: Adjunto[]
}): Promise<ResultadoEnvio> {
  console.info('[correo] envío simulado', {
    para: opciones.para,
    cc: opciones.cc,
    asunto: opciones.asunto,
    adjuntos: opciones.adjuntos?.map((a) => ({
      nombre: a.nombre,
      kb: Math.round((a.contenidoBase64.length * 3) / 4 / 1024),
    })),
  })
  return { ok: true, id: `consola-${Date.now()}`, proveedor: 'consola' }
}

async function enviarConResend(opciones: {
  para: string[]
  cc?: string[]
  asunto: string
  html: string
  adjuntos?: Adjunto[]
}): Promise<ResultadoEnvio> {
  const apiKey = process.env.RESEND_API_KEY
  const remitente = process.env.CORREO_REMITENTE ?? 'Uppercap <no-reply@uppercap.cl>'
  if (!apiKey) return { ok: false, error: 'Falta RESEND_API_KEY.' }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: remitente,
        to: opciones.para,
        cc: opciones.cc,
        subject: opciones.asunto,
        html: opciones.html,
        attachments: opciones.adjuntos?.map((a) => ({
          filename: a.nombre,
          content: a.contenidoBase64,
        })),
      }),
    })

    if (!r.ok) {
      const texto = await r.text()
      return { ok: false, error: `Resend respondió ${r.status}: ${texto.slice(0, 300)}` }
    }
    const data = (await r.json()) as { id: string }
    return { ok: true, id: data.id, proveedor: 'resend' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de red al enviar el correo.' }
  }
}

/** Cuerpo del correo con que se entrega el expediente al cliente. */
export function plantillaCorreoExpediente(datos: {
  cliente: string
  curso: string
  fecha: string
  lugar: string
  relator: string
  participantes: number
  aprobados: number | null
}) {
  return `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:600px;color:#0f172a">
  <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#1f47d8;margin:0 0 4px">
    Uppercap
  </p>
  <h1 style="font-size:20px;margin:0 0 16px">Expediente del curso</h1>

  <p>Estimados,</p>
  <p>
    Adjuntamos el expediente del curso <strong>${escapar(datos.curso)}</strong> dictado el
    <strong>${escapar(datos.fecha)}</strong> en ${escapar(datos.lugar)}.
  </p>

  <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:4px 16px 4px 0;color:#64748b">Cliente</td><td><strong>${escapar(datos.cliente)}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b">Relator</td><td>${escapar(datos.relator)}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b">Participantes</td><td>${datos.participantes}</td></tr>
    ${
      datos.aprobados !== null
        ? `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Aprobados</td><td>${datos.aprobados}</td></tr>`
        : ''
    }
  </table>

  <p>
    El expediente contiene la lista de asistencia con nombre, RUT y firma de cada participante,
    los contenidos impartidos, los resultados de la evaluación y el resumen de la encuesta de
    satisfacción. Los datos provienen del registro digital tomado en sala: no hubo transcripción
    manual ni escaneo.
  </p>

  <p>Quedamos atentos a sus comentarios para avanzar con la orden de compra.</p>
  <p style="margin-top:24px">Saludos cordiales,<br><strong>Uppercap — Soluciones de Aprendizaje</strong></p>
</div>`.trim()
}

function escapar(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
