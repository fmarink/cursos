import Link from 'next/link'

const ESTILOS_ESTADO: Record<string, string> = {
  PROGRAMADO: 'bg-slate-100 text-slate-700 ring-slate-200',
  EN_CURSO: 'bg-blue-50 text-blue-700 ring-blue-200',
  CERRADO: 'bg-amber-50 text-amber-800 ring-amber-200',
  EXPEDIENTE_VALIDADO: 'bg-violet-50 text-violet-700 ring-violet-200',
  ENVIADO_AL_CLIENTE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ANULADO: 'bg-slate-100 text-slate-400 ring-slate-200',
  PROGRAMADA: 'bg-slate-100 text-slate-700 ring-slate-200',
  ABIERTA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CERRADA: 'bg-amber-50 text-amber-800 ring-amber-200',
  REABIERTA: 'bg-orange-50 text-orange-700 ring-orange-200',
  OK: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DUPLICADO_SOSPECHOSO: 'bg-red-50 text-red-700 ring-red-200',
  EXCEDE_NOMINA: 'bg-amber-50 text-amber-800 ring-amber-200',
  FUERA_DE_NOMINA: 'bg-amber-50 text-amber-800 ring-amber-200',
  RUT_INVALIDO: 'bg-red-50 text-red-700 ring-red-200',
  SIN_FIRMA: 'bg-red-50 text-red-700 ring-red-200',
}

export const ETIQUETA_ESTADO: Record<string, string> = {
  PROGRAMADO: 'Programado',
  EN_CURSO: 'En curso',
  CERRADO: 'Cerrado',
  EXPEDIENTE_VALIDADO: 'Expediente validado',
  ENVIADO_AL_CLIENTE: 'Enviado al cliente',
  ANULADO: 'Anulado',
  PROGRAMADA: 'Programada',
  ABIERTA: 'Abierta',
  CERRADA: 'Cerrada',
  REABIERTA: 'Reabierta',
  OK: 'Conforme',
  DUPLICADO_SOSPECHOSO: 'Duplicado',
  EXCEDE_NOMINA: 'Excede nómina',
  FUERA_DE_NOMINA: 'Fuera de nómina',
  RUT_INVALIDO: 'RUT inválido',
  SIN_FIRMA: 'Sin firma',
  ANULADO_P: 'Anulado',
}

export function Estado({ valor }: { valor: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        ESTILOS_ESTADO[valor] ?? 'bg-slate-100 text-slate-600 ring-slate-200'
      }`}
    >
      {ETIQUETA_ESTADO[valor] ?? valor}
    </span>
  )
}

export function Tarjeta({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>
      {children}
    </div>
  )
}

export function TituloSeccion({
  children,
  accion,
}: {
  children: React.ReactNode
  accion?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-lg font-bold text-slate-900">{children}</h2>
      {accion}
    </div>
  )
}

export function BotonPrimario({
  children,
  href,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: string }) {
  const clase =
    'inline-flex items-center justify-center rounded-xl bg-marca-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-marca-700 disabled:cursor-not-allowed disabled:bg-slate-300'
  if (href)
    return (
      <Link href={href} className={clase}>
        {children}
      </Link>
    )
  return (
    <button className={clase} {...props}>
      {children}
    </button>
  )
}

export function BotonSecundario({
  children,
  href,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: string }) {
  const clase = `inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 ${className}`
  if (href)
    return (
      <Link href={href} className={clase}>
        {children}
      </Link>
    )
  return (
    <button className={clase} {...props}>
      {children}
    </button>
  )
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}

export function formatearFecha(fecha: string | Date, conDia = false) {
  const d = typeof fecha === 'string' ? new Date(`${fecha}T12:00:00`) : fecha
  return d.toLocaleDateString('es-CL', {
    weekday: conDia ? 'long' : undefined,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatearFechaHora(fecha: Date | string | null) {
  if (!fecha) return '—'
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  return d.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Santiago',
  })
}
