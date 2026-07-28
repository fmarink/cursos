/**
 * Las cargas por archivo de cada entidad.
 *
 * Cada una define tres cosas y nada más: qué encabezados reconoce, cómo valida
 * una fila, y qué trae la plantilla descargable. Todo lo demás —leer .xlsx o
 * .csv, ubicar los encabezados, numerar las filas— lo pone `carga-archivo.ts`.
 */
import {
  type Analisis,
  type Mapeo,
  type Problema,
  PIE_INSTRUCCIONES,
  generarPlantilla,
  leerMatriz,
  mapearColumnas,
  normalizar,
  recorrer,
} from './carga-archivo'
import { normalizarRut, validarRut } from './rut'

// ---------------------------------------------------------------------------
// Utilidades compartidas
// ---------------------------------------------------------------------------

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** "8:30", "08:30", "0830" u "8.30" → "08:30". Devuelve null si no se entiende. */
function normalizarHora(v: string): string | null {
  const t = v.trim()
  if (t === '') return null
  const m = t.match(/^(\d{1,2})[:.h]?(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Relatores
// ---------------------------------------------------------------------------

export type RelatorLeido = {
  fila: number
  nombre: string
  rut: string
  telefono: string
  email: string
  direccion: string
  comuna: string
  materias: string[]
  notas: string
}

const MAPEO_RELATORES: Mapeo = {
  nombre: ['nombre', 'nombre completo', 'relator', 'profesor', 'nombres y apellidos', 'nombres'],
  rut: ['rut', 'r.u.t', 'run', 'rut relator', 'cedula'],
  telefono: ['telefono', 'fono', 'celular', 'movil', 'contacto', 'telefono contacto'],
  email: ['email', 'correo', 'mail', 'correo electronico', 'e-mail'],
  direccion: ['direccion', 'domicilio', 'direccion particular'],
  comuna: ['comuna', 'ciudad', 'localidad'],
  materias: [
    'materias',
    'materia',
    'cursos',
    'cursos que imparte',
    'especialidad',
    'especialidades',
    'areas',
    'area',
    'temas',
  ],
  notas: ['notas', 'observaciones', 'comentarios'],
}

export async function analizarRelatores(
  buffer: Buffer,
  nombreArchivo: string,
): Promise<Analisis<RelatorLeido>> {
  const matriz = await leerMatriz(buffer, nombreArchivo)
  const columnas = mapearColumnas(matriz, MAPEO_RELATORES)
  const filas: RelatorLeido[] = []
  const problemas: Problema[] = []
  const vistos = new Map<string, number>()

  if (matriz.length === 0) {
    return { filas, problemas: [{ fila: 0, mensaje: 'El archivo está vacío.' }], columnasIgnoradas: [] }
  }
  if (columnas.indices.nombre === undefined) {
    return {
      filas,
      problemas: [
        {
          fila: 0,
          mensaje:
            'No se encontró la columna del nombre. Debe haber un encabezado «Nombre» (o Relator, Profesor).',
        },
      ],
      columnasIgnoradas: columnas.ignoradas,
    }
  }

  for (const r of recorrer(matriz, columnas)) {
    if (r.vacia) continue
    const nombre = r.campo('nombre')
    if (nombre === '') continue
    if (nombre.length < 3) {
      problemas.push({ fila: r.fila, mensaje: `Nombre demasiado corto: «${nombre}».` })
      continue
    }

    const rutCrudo = r.campo('rut')
    let rut = ''
    if (rutCrudo !== '') {
      const norm = normalizarRut(rutCrudo)
      if (norm === null || !validarRut(norm)) {
        problemas.push({
          fila: r.fila,
          mensaje: `El RUT «${rutCrudo}» tiene dígito verificador inválido.`,
        })
        continue
      }
      rut = norm
    }

    const email = r.campo('email')
    if (email !== '' && !RE_EMAIL.test(email)) {
      problemas.push({ fila: r.fila, mensaje: `El correo «${email}» no parece válido.` })
      continue
    }

    // Identidad dentro del propio archivo: por RUT, o por nombre si no hay RUT.
    const clave = rut !== '' ? `r:${rut}` : `n:${normalizar(nombre)}`
    const antes = vistos.get(clave)
    if (antes) {
      problemas.push({ fila: r.fila, mensaje: `Repetido: ya venía en la fila ${antes}.` })
      continue
    }
    vistos.set(clave, r.fila)

    filas.push({
      fila: r.fila,
      nombre,
      rut,
      telefono: r.campo('telefono'),
      email,
      direccion: r.campo('direccion'),
      comuna: r.campo('comuna'),
      materias: r
        .campo('materias')
        .split(/[;,/|]/)
        .map((m) => m.trim())
        .filter((m) => m !== ''),
      notas: r.campo('notas'),
    })
  }

  if (filas.length === 0 && problemas.length === 0) {
    problemas.push({ fila: 0, mensaje: 'No se encontró ningún relator en el archivo.' })
  }
  return { filas, problemas, columnasIgnoradas: columnas.ignoradas }
}

export function plantillaRelatores() {
  return generarPlantilla({
    hoja: 'Relatores',
    columnas: [
      { titulo: 'Nombre', ancho: 34 },
      { titulo: 'RUT', ancho: 16 },
      { titulo: 'Teléfono', ancho: 18 },
      { titulo: 'Email', ancho: 32 },
      { titulo: 'Dirección', ancho: 34 },
      { titulo: 'Comuna', ancho: 20 },
      { titulo: 'Materias', ancho: 40 },
      { titulo: 'Notas', ancho: 34 },
    ],
    ejemplos: [
      [
        'Carlos Fuentes Alarcón',
        '15.345.678-5',
        '+56 9 8765 4321',
        'carlos.fuentes@ejemplo.cl',
        'Av. Libertad 1234',
        'Quillota',
        'Trabajo en altura; Manejo de gases criogénicos',
        '',
      ],
      [
        'Marcela Ríos Peña',
        '12.987.654-3',
        '+56 9 5555 1234',
        'marcela.rios@ejemplo.cl',
        '',
        'Viña del Mar',
        'Trabajo en altura',
        'Disponible solo lunes y martes',
      ],
    ],
    instrucciones: [
      ['Cómo llenar esta plantilla', true],
      ['', false],
      ['1. Un relator por fila. Borre las filas de ejemplo en gris.', false],
      ['2. Solo el nombre es obligatorio; el resto ayuda pero puede ir vacío.', false],
      ['3. Cárguela desde Profesores → Cargar desde archivo.', false],
      ['', false],
      ['Columna "RUT"', true],
      ['   Con puntos o sin ellos, da lo mismo: 15.345.678-5 o 153456785.', false],
      ['   Se valida el dígito verificador. Si está malo, esa fila no se carga.', false],
      ['   Es lo que identifica al relator: cargar dos veces el mismo archivo', false],
      ['   actualiza sus datos, no lo duplica.', false],
      ['', false],
      ['Columna "Materias"', true],
      ['   Los tipos de curso que dicta, separados por punto y coma o coma.', false],
      ['   Deben existir en Tipos de curso; los que no existan se informan y', false],
      ['   el relator se carga igual, sin esa materia.', false],
      ...PIE_INSTRUCCIONES,
    ],
  })
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export type ClienteLeido = {
  fila: number
  razonSocial: string
  rut: string
  contactoNombre: string
  contactoEmail: string
  contactoTelefono: string
}

const MAPEO_CLIENTES: Mapeo = {
  razonSocial: [
    'razon social',
    'cliente',
    'empresa',
    'nombre',
    'nombre cliente',
    'mandante',
    'razon social cliente',
  ],
  rut: ['rut', 'r.u.t', 'rut empresa', 'rut cliente'],
  contactoNombre: ['contacto', 'nombre contacto', 'contacto principal', 'representante'],
  contactoEmail: ['email', 'correo', 'mail', 'email contacto', 'correo contacto', 'e-mail'],
  contactoTelefono: ['telefono', 'fono', 'celular', 'telefono contacto'],
}

export async function analizarClientes(
  buffer: Buffer,
  nombreArchivo: string,
): Promise<Analisis<ClienteLeido>> {
  const matriz = await leerMatriz(buffer, nombreArchivo, 'cliente')
  const columnas = mapearColumnas(matriz, MAPEO_CLIENTES)
  const filas: ClienteLeido[] = []
  const problemas: Problema[] = []
  const vistos = new Map<string, number>()

  if (matriz.length === 0) {
    return { filas, problemas: [{ fila: 0, mensaje: 'El archivo está vacío.' }], columnasIgnoradas: [] }
  }
  if (columnas.indices.razonSocial === undefined) {
    return {
      filas,
      problemas: [
        {
          fila: 0,
          mensaje:
            'No se encontró la columna del cliente. Debe haber un encabezado «Razón social» (o Cliente, Empresa).',
        },
      ],
      columnasIgnoradas: columnas.ignoradas,
    }
  }

  for (const r of recorrer(matriz, columnas)) {
    if (r.vacia) continue
    const razonSocial = r.campo('razonSocial')
    if (razonSocial === '') continue
    if (razonSocial.length < 3) {
      problemas.push({ fila: r.fila, mensaje: `Razón social demasiado corta: «${razonSocial}».` })
      continue
    }

    const rutCrudo = r.campo('rut')
    let rut = ''
    if (rutCrudo !== '') {
      const norm = normalizarRut(rutCrudo)
      if (norm === null || !validarRut(norm)) {
        problemas.push({
          fila: r.fila,
          mensaje: `El RUT «${rutCrudo}» tiene dígito verificador inválido.`,
        })
        continue
      }
      rut = norm
    }

    const contactoEmail = r.campo('contactoEmail')
    if (contactoEmail !== '' && !RE_EMAIL.test(contactoEmail)) {
      problemas.push({ fila: r.fila, mensaje: `El correo «${contactoEmail}» no parece válido.` })
      continue
    }

    const clave = normalizar(razonSocial)
    const antes = vistos.get(clave)
    if (antes) {
      problemas.push({ fila: r.fila, mensaje: `Repetido: ya venía en la fila ${antes}.` })
      continue
    }
    vistos.set(clave, r.fila)

    filas.push({
      fila: r.fila,
      razonSocial,
      rut,
      contactoNombre: r.campo('contactoNombre'),
      contactoEmail,
      contactoTelefono: r.campo('contactoTelefono'),
    })
  }

  if (filas.length === 0 && problemas.length === 0) {
    problemas.push({ fila: 0, mensaje: 'No se encontró ningún cliente en el archivo.' })
  }
  return { filas, problemas, columnasIgnoradas: columnas.ignoradas }
}

export function plantillaClientes() {
  return generarPlantilla({
    hoja: 'Clientes',
    columnas: [
      { titulo: 'Razón social', ancho: 38 },
      { titulo: 'RUT', ancho: 16 },
      { titulo: 'Contacto', ancho: 28 },
      { titulo: 'Email contacto', ancho: 32 },
      { titulo: 'Teléfono contacto', ancho: 20 },
    ],
    ejemplos: [
      [
        'Anglo American Sur S.A.',
        '77.762.940-9',
        'Patricia Soto',
        'patricia.soto@ejemplo.cl',
        '+56 2 2345 6789',
      ],
      ['Constructora del Valle Ltda.', '', 'Jorge Vera', 'jvera@ejemplo.cl', ''],
    ],
    instrucciones: [
      ['Cómo llenar esta plantilla', true],
      ['', false],
      ['1. Un cliente por fila. Borre las filas de ejemplo en gris.', false],
      ['2. Solo la razón social es obligatoria.', false],
      ['3. Cárguela desde Clientes y lugares → Cargar clientes desde archivo.', false],
      ['', false],
      ['Identificación', true],
      ['   El cliente se reconoce por su razón social. Volver a cargar el mismo', false],
      ['   archivo actualiza sus datos de contacto, no lo duplica.', false],
      ['', false],
      ['Las faenas, hoteles y oficinas van en su propia plantilla, la de Lugares.', false],
      ...PIE_INSTRUCCIONES,
    ],
  })
}

// ---------------------------------------------------------------------------
// Lugares
// ---------------------------------------------------------------------------

export type TipoLugar = 'FAENA' | 'HOTEL' | 'OFICINA' | 'OTRO'

export type LugarLeido = {
  fila: number
  nombre: string
  tipo: TipoLugar
  direccion: string
  comuna: string
  /** Razón social tal como venía en el archivo; se resuelve al guardar. */
  cliente: string
}

const MAPEO_LUGARES: Mapeo = {
  nombre: ['nombre', 'lugar', 'faena', 'nombre lugar', 'recinto', 'sede'],
  tipo: ['tipo', 'tipo lugar', 'tipo de lugar', 'categoria'],
  direccion: ['direccion', 'domicilio', 'ubicacion'],
  comuna: ['comuna', 'ciudad', 'localidad'],
  cliente: ['cliente', 'razon social', 'empresa', 'mandante'],
}

const TIPOS_LUGAR: [TipoLugar, string[]][] = [
  ['FAENA', ['faena', 'mina', 'planta', 'terreno']],
  ['HOTEL', ['hotel', 'hosteria', 'centro de eventos', 'salon']],
  ['OFICINA', ['oficina', 'sala', 'casa matriz', 'dependencias']],
  ['OTRO', ['otro', 'otros', 'varios']],
]

export async function analizarLugares(
  buffer: Buffer,
  nombreArchivo: string,
): Promise<Analisis<LugarLeido>> {
  const matriz = await leerMatriz(buffer, nombreArchivo, 'lugar')
  const columnas = mapearColumnas(matriz, MAPEO_LUGARES)
  const filas: LugarLeido[] = []
  const problemas: Problema[] = []
  const vistos = new Map<string, number>()

  if (matriz.length === 0) {
    return { filas, problemas: [{ fila: 0, mensaje: 'El archivo está vacío.' }], columnasIgnoradas: [] }
  }
  if (columnas.indices.nombre === undefined) {
    return {
      filas,
      problemas: [
        {
          fila: 0,
          mensaje:
            'No se encontró la columna del lugar. Debe haber un encabezado «Nombre» (o Lugar, Faena).',
        },
      ],
      columnasIgnoradas: columnas.ignoradas,
    }
  }

  for (const r of recorrer(matriz, columnas)) {
    if (r.vacia) continue
    const nombre = r.campo('nombre')
    if (nombre === '') continue
    if (nombre.length < 3) {
      problemas.push({ fila: r.fila, mensaje: `Nombre demasiado corto: «${nombre}».` })
      continue
    }

    const tipoCrudo = r.campo('tipo')
    let tipo: TipoLugar = 'OTRO'
    if (tipoCrudo !== '') {
      const n = normalizar(tipoCrudo)
      const hallado = TIPOS_LUGAR.find(([, alias]) => alias.some((a) => n === a || n.includes(a)))
      if (!hallado) {
        problemas.push({
          fila: r.fila,
          mensaje: `Tipo «${tipoCrudo}» no reconocido. Use: Faena, Hotel, Oficina u Otro.`,
        })
        continue
      }
      tipo = hallado[0]
    }

    const cliente = r.campo('cliente')
    const clave = `${normalizar(nombre)}|${normalizar(cliente)}`
    const antes = vistos.get(clave)
    if (antes) {
      problemas.push({ fila: r.fila, mensaje: `Repetido: ya venía en la fila ${antes}.` })
      continue
    }
    vistos.set(clave, r.fila)

    filas.push({
      fila: r.fila,
      nombre,
      tipo,
      direccion: r.campo('direccion'),
      comuna: r.campo('comuna'),
      cliente,
    })
  }

  if (filas.length === 0 && problemas.length === 0) {
    problemas.push({ fila: 0, mensaje: 'No se encontró ningún lugar en el archivo.' })
  }
  return { filas, problemas, columnasIgnoradas: columnas.ignoradas }
}

export function plantillaLugares() {
  return generarPlantilla({
    hoja: 'Lugares',
    columnas: [
      { titulo: 'Nombre', ancho: 34 },
      { titulo: 'Tipo', ancho: 16, opciones: ['Faena', 'Hotel', 'Oficina', 'Otro'] },
      { titulo: 'Dirección', ancho: 36 },
      { titulo: 'Comuna', ancho: 20 },
      { titulo: 'Cliente', ancho: 32 },
    ],
    ejemplos: [
      ['Faena Los Bronces', 'Faena', 'Camino a Farellones s/n', 'Lo Barnechea', 'Anglo American Sur S.A.'],
      ['Hotel Open Quillota', 'Hotel', 'O’Higgins 567', 'Quillota', ''],
    ],
    instrucciones: [
      ['Cómo llenar esta plantilla', true],
      ['', false],
      ['1. Un lugar por fila. Borre las filas de ejemplo en gris.', false],
      ['2. Solo el nombre es obligatorio.', false],
      ['3. Cárguela desde Clientes y lugares → Cargar lugares desde archivo.', false],
      ['', false],
      ['Columna "Cliente"', true],
      ['   La razón social del cliente dueño de esa faena, si corresponde.', false],
      ['   Déjela vacía para un lugar general, como un hotel que se usa con', false],
      ['   varios clientes.', false],
      ['   El cliente debe existir ya en la plataforma: si no calza, la fila se', false],
      ['   informa y no se carga. Cargue primero la plantilla de Clientes.', false],
      ['', false],
      ['Columna "Tipo"', true],
      ['   Faena, Hotel, Oficina u Otro. Si la deja vacía, se asume Otro.', false],
      ...PIE_INSTRUCCIONES,
    ],
  })
}

// ---------------------------------------------------------------------------
// Contenidos
// ---------------------------------------------------------------------------

export type ContenidoLeido = {
  fila: number
  tema: string
  actividades: string
  horaInicio: string
  horaFin: string
  observaciones: string
}

const MAPEO_CONTENIDOS: Mapeo = {
  tema: ['tema', 'contenido', 'materia', 'modulo', 'unidad', 'titulo', 'bloque'],
  actividades: ['actividades', 'actividad', 'detalle', 'descripcion', 'metodologia'],
  horaInicio: ['hora inicio', 'inicio', 'desde', 'hora de inicio', 'hora'],
  horaFin: ['hora fin', 'fin', 'hasta', 'termino', 'hora de termino', 'hora fin'],
  observaciones: ['observaciones', 'notas', 'comentarios'],
}

export async function analizarContenidos(
  buffer: Buffer,
  nombreArchivo: string,
): Promise<Analisis<ContenidoLeido>> {
  const matriz = await leerMatriz(buffer, nombreArchivo, 'contenido')
  const columnas = mapearColumnas(matriz, MAPEO_CONTENIDOS)
  const filas: ContenidoLeido[] = []
  const problemas: Problema[] = []

  if (matriz.length === 0) {
    return { filas, problemas: [{ fila: 0, mensaje: 'El archivo está vacío.' }], columnasIgnoradas: [] }
  }
  if (columnas.indices.tema === undefined) {
    return {
      filas,
      problemas: [
        {
          fila: 0,
          mensaje:
            'No se encontró la columna del tema. Debe haber un encabezado «Tema» (o Contenido, Módulo).',
        },
      ],
      columnasIgnoradas: columnas.ignoradas,
    }
  }

  for (const r of recorrer(matriz, columnas)) {
    if (r.vacia) continue
    const tema = r.campo('tema')
    if (tema === '') continue
    if (tema.length < 3) {
      problemas.push({ fila: r.fila, mensaje: `Tema demasiado corto: «${tema}».` })
      continue
    }

    const iCrudo = r.campo('horaInicio')
    const fCrudo = r.campo('horaFin')
    const horaInicio = normalizarHora(iCrudo)
    const horaFin = normalizarHora(fCrudo)

    if (iCrudo !== '' && horaInicio === null) {
      problemas.push({ fila: r.fila, mensaje: `Hora de inicio «${iCrudo}» no se entiende. Use 08:30.` })
      continue
    }
    if (fCrudo !== '' && horaFin === null) {
      problemas.push({ fila: r.fila, mensaje: `Hora de término «${fCrudo}» no se entiende. Use 10:00.` })
      continue
    }
    if (horaInicio && horaFin && horaFin <= horaInicio) {
      problemas.push({
        fila: r.fila,
        mensaje: `El bloque termina (${horaFin}) antes o al mismo tiempo que empieza (${horaInicio}).`,
      })
      continue
    }

    filas.push({
      fila: r.fila,
      tema,
      actividades: r.campo('actividades'),
      horaInicio: horaInicio ?? '',
      horaFin: horaFin ?? '',
      observaciones: r.campo('observaciones'),
    })
  }

  if (filas.length === 0 && problemas.length === 0) {
    problemas.push({ fila: 0, mensaje: 'No se encontró ningún bloque de contenido en el archivo.' })
  }
  return { filas, problemas, columnasIgnoradas: columnas.ignoradas }
}

export function plantillaContenidos() {
  return generarPlantilla({
    hoja: 'Contenidos',
    columnas: [
      { titulo: 'Tema', ancho: 44 },
      { titulo: 'Actividades', ancho: 44 },
      { titulo: 'Hora inicio', ancho: 14 },
      { titulo: 'Hora fin', ancho: 14 },
      { titulo: 'Observaciones', ancho: 34 },
    ],
    ejemplos: [
      [
        'Marco legal y normativa aplicable',
        'Exposición y preguntas dirigidas',
        '08:30',
        '10:00',
        '',
      ],
      [
        'Elementos de protección personal contra caídas',
        'Demostración con arnés y línea de vida',
        '10:15',
        '12:00',
        '',
      ],
      [
        'Taller práctico',
        'Ejercicio en estructura, en grupos de tres',
        '14:00',
        '17:00',
        'Requiere estructura de al menos 3 m',
      ],
    ],
    instrucciones: [
      ['Cómo llenar esta plantilla', true],
      ['', false],
      ['1. Un bloque de contenido por fila, en el orden en que se dicta.', false],
      ['2. Borre las tres filas de ejemplo en gris.', false],
      ['', false],
      ['Dónde se carga', true],
      ['   En Tipos de curso → Programa, para dejarlo cargado una sola vez y', false],
      ['   aplicarlo después en cada jornada con un botón.', false],
      ['   En el panel de la jornada → Contenidos, para una sesión puntual cuyo', false],
      ['   contenido fue distinto del programa estándar.', false],
      ['', false],
      ['Columnas "Hora inicio" y "Hora fin"', true],
      ['   Formato 24 horas: 08:30, 14:00. También se acepta 8:30 u 8.30.', false],
      ['   Puede dejarlas vacías si el horario cambia en cada jornada.', false],
      ...PIE_INSTRUCCIONES,
    ],
  })
}
