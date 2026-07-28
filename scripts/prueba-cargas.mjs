/**
 * Prueba de aceptación de todas las cargas por archivo.
 *
 * Recorre lo que hará el usuario, en navegador real: descargar la plantilla
 * desde la propia aplicación, subir un archivo con errores a propósito, revisar
 * la vista previa, confirmar, y verificar contra la pantalla que se guardó lo
 * bueno y NO se guardó lo malo.
 *
 *   node scripts/prueba-cargas.mjs
 *   BASE=http://127.0.0.1:3000 node scripts/prueba-cargas.mjs
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:3100'
const EMAIL = process.env.EMAIL ?? 'operaciones@uppercap.cl'
const CLAVE = process.env.CLAVE ?? 'uppercap2026'
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const TMP = '/tmp/prueba-cargas'
mkdirSync(TMP, { recursive: true })

let fallos = 0
function v(nombre, ok, detalle = '') {
  console.log(`${ok ? '  ok  ' : ' FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  if (!ok) fallos++
}
function seccion(t) {
  console.log(`\n=== ${t} ===`)
}

function csv(lineas) {
  return lineas.join('\n')
}

const nav = await chromium.launch({
  ...(existsSync(CHROME) ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1200 } })
  const p = await ctx.newPage()

  await p.goto(`${BASE}/login`)
  await p.fill('#email', EMAIL)
  await p.fill('#password', CLAVE)
  await p.click('button[type=submit]')
  await p.waitForURL(`${BASE}/`, { timeout: 20000 })

  /** Abre el panel de carga cuyo botón dice `etiqueta`, sube `ruta` y espera la vista previa. */
  async function subir(etiqueta, ruta) {
    await p.locator(`button:has-text("${etiqueta}")`).first().click()
    const panel = p.locator('div:has(> div > h4)').filter({ has: p.locator('input[type=file]') }).last()
    await panel.locator('input[type=file]').setInputFiles(ruta)
    await p.waitForSelector('text=/para cargar:/', { timeout: 20000 })
    return panel
  }

  async function descargarPlantilla(etiqueta) {
    const [d] = await Promise.all([
      p.waitForEvent('download', { timeout: 20000 }),
      p.locator('a:has-text("Descargar plantilla Excel")').last().click(),
    ])
    const ruta = `${TMP}/${etiqueta}.xlsx`
    await d.saveAs(ruta)
    return ruta
  }

  // =====================================================================
  seccion('Clientes')
  // =====================================================================
  await p.goto(`${BASE}/clientes`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)

  await p.locator('button:has-text("Cargar clientes desde archivo")').first().click()
  const plantillaClientes = await descargarPlantilla('clientes')
  v('La plantilla de clientes se descarga', existsSync(plantillaClientes))

  const rutaClientes = `${TMP}/clientes.csv`
  writeFileSync(
    rutaClientes,
    csv([
      'Razón social;RUT;Contacto;Email contacto;Teléfono contacto',
      'Minera Los Pelambres S.A.;96.790.240-3;Ana Torres;ana.torres@ejemplo.cl;+56 2 2111 2222',
      'Constructora del Valle Ltda.;;Jorge Vera;jvera@ejemplo.cl;',
      'Empresa con RUT malo;11.111.111-2;;;',
      'Empresa con correo malo;;Pedro;esto-no-es-correo;',
      'Minera Los Pelambres S.A.;;;;',
    ]),
    'utf8',
  )
  await p.locator('input[type=file]').last().setInputFiles(rutaClientes)
  await p.waitForSelector('text=/2 clientes para cargar/', { timeout: 20000 })
  v('Detecta los 2 clientes buenos', true)

  const textoClientes = await p.locator('body').innerText()
  v('Rechaza el RUT con dígito verificador malo', textoClientes.includes('11.111.111-2'))
  v('Rechaza el correo inválido', textoClientes.includes('esto-no-es-correo'))
  v('Detecta el cliente repetido dentro del archivo', /Repetido: ya venía en la fila 2/.test(textoClientes))
  await p.screenshot({ path: `${TMP}/01-clientes-previa.png`, fullPage: true })

  await p.locator('button:has-text("Cargar 2 clientes")').click()
  await p.waitForTimeout(2500)
  await p.waitForLoadState('networkidle')
  const trasClientes = await p.locator('body').innerText()
  v('Se guardó Minera Los Pelambres', trasClientes.includes('Minera Los Pelambres'))
  v('Se guardó Constructora del Valle', trasClientes.includes('Constructora del Valle'))
  v('NO se guardó la del RUT malo', !trasClientes.includes('Empresa con RUT malo'))
  v('NO se guardó la del correo malo', !trasClientes.includes('Empresa con correo malo'))

  // Recargar el mismo archivo no debe duplicar
  await p.locator('button:has-text("Cargar clientes desde archivo")').first().click()
  await p.locator('input[type=file]').last().setInputFiles(rutaClientes)
  await p.waitForSelector('text=/2 clientes para cargar/', { timeout: 20000 })
  await p.locator('button:has-text("Cargar 2 clientes")').click()
  await p.waitForTimeout(2500)
  await p.waitForLoadState('networkidle')
  const cuenta = (await p.locator('body').innerText()).split('Minera Los Pelambres').length - 1
  v('Cargar dos veces el mismo archivo no duplica al cliente', cuenta === 1, `apariciones: ${cuenta}`)

  // =====================================================================
  seccion('Lugares')
  // =====================================================================
  const rutaLugares = `${TMP}/lugares.csv`
  writeFileSync(
    rutaLugares,
    csv([
      'Nombre;Tipo;Dirección;Comuna;Cliente',
      'Faena Pelambres Norte;Faena;Camino interior s/n;Salamanca;Minera Los Pelambres S.A.',
      'Hotel Plaza Illapel;Hotel;Constitución 120;Illapel;',
      'Lugar de cliente inexistente;Faena;;;Empresa Fantasma S.A.',
    ]),
    'utf8',
  )
  await p.locator('button:has-text("Cargar lugares desde archivo")').first().click()
  await p.locator('input[type=file]').last().setInputFiles(rutaLugares)
  await p.waitForSelector('text=/3 lugares para cargar/', { timeout: 20000 })
  v('Detecta los 3 lugares del archivo', true)
  await p.screenshot({ path: `${TMP}/02-lugares-previa.png`, fullPage: true })

  await p.locator('button:has-text("Cargar 3 lugares")').click()
  await p.waitForTimeout(2000)
  const errLugares = await p.locator('body').innerText()
  v(
    'Un cliente inexistente detiene la carga con un mensaje claro',
    errLugares.includes('Empresa Fantasma S.A.') && errLugares.includes('no existen todavía'),
  )

  // Sin la fila mala, la carga pasa
  writeFileSync(
    rutaLugares,
    csv([
      'Nombre;Tipo;Dirección;Comuna;Cliente',
      'Faena Pelambres Norte;Faena;Camino interior s/n;Salamanca;Minera Los Pelambres S.A.',
      'Hotel Plaza Illapel;Hotel;Constitución 120;Illapel;',
    ]),
    'utf8',
  )
  await p.locator('input[type=file]').last().setInputFiles(rutaLugares)
  await p.waitForSelector('text=/2 lugares para cargar/', { timeout: 20000 })
  await p.locator('button:has-text("Cargar 2 lugares")').click()
  await p.waitForTimeout(2500)
  await p.waitForLoadState('networkidle')
  const trasLugares = await p.locator('body').innerText()
  v('Se guardó la faena bajo su cliente', trasLugares.includes('Faena Pelambres Norte'))
  v('Se guardó el hotel como lugar general', trasLugares.includes('Hotel Plaza Illapel'))

  // =====================================================================
  seccion('Relatores')
  // =====================================================================
  await p.goto(`${BASE}/profesores`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)

  await p.locator('button:has-text("Cargar desde archivo")').first().click()
  const plantillaRelatores = await descargarPlantilla('relatores')
  v('La plantilla de relatores se descarga', existsSync(plantillaRelatores))

  // Encabezados en otro orden y con otros nombres: debe reconocerlos igual.
  const rutaRelatores = `${TMP}/relatores.csv`
  writeFileSync(
    rutaRelatores,
    csv([
      'Correo;Fono;Nombre completo;RUT;Especialidad;Ciudad',
      'r.munoz@ejemplo.cl;+56 9 1111 2222;Rodrigo Muñoz Silva;13.028.923-1;Trabajo en Altura;La Serena',
      'p.diaz@ejemplo.cl;;Paula Díaz Rojas;;Trabajo en Altura, Curso que no existe;Coquimbo',
      ';;Relator con RUT malo;9.999.999-9;;',
    ]),
    'utf8',
  )
  await p.locator('input[type=file]').last().setInputFiles(rutaRelatores)
  await p.waitForSelector('text=/2 relatores para cargar/', { timeout: 20000 })
  v('Reconoce encabezados en otro orden y con otros nombres', true)
  const previaRelatores = await p.locator('body').innerText()
  v('Rechaza el relator con RUT inválido', previaRelatores.includes('9.999.999-9'))
  await p.screenshot({ path: `${TMP}/03-relatores-previa.png`, fullPage: true })

  await p.locator('button:has-text("Cargar 2 relatores")').click()
  await p.waitForTimeout(2500)
  await p.waitForLoadState('networkidle')
  const trasRelatores = await p.locator('body').innerText()
  v('Se guardó Rodrigo Muñoz', trasRelatores.includes('Rodrigo Muñoz'))
  v('Se guardó Paula Díaz', trasRelatores.includes('Paula Díaz'))
  v('NO se guardó el del RUT malo', !trasRelatores.includes('Relator con RUT malo'))

  // =====================================================================
  seccion('Programa de contenidos del tipo de curso')
  // =====================================================================
  await p.goto(`${BASE}/tipos-curso`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)

  await p.locator('button:has-text("Programa de contenidos")').first().click()
  await p.waitForTimeout(600)
  await p.locator('button:has-text("Cargar programa desde archivo"), button:has-text("Cargar otro archivo")').first().click()
  const plantillaContenidos = await descargarPlantilla('contenidos')
  v('La plantilla de contenidos se descarga', existsSync(plantillaContenidos))

  const rutaPrograma = `${TMP}/programa.csv`
  writeFileSync(
    rutaPrograma,
    csv([
      'Tema;Actividades;Hora inicio;Hora fin;Observaciones',
      'Marco legal y normativa;Exposición;8:30;10:00;',
      'Elementos de protección personal;Demostración con arnés;10:15;12:00;',
      'Taller práctico;Ejercicio en estructura;14:00;17:00;Requiere estructura de 3 m',
      'Bloque con hora imposible;;25:99;26:00;',
      'Bloque que termina antes de empezar;;15:00;14:00;',
    ]),
    'utf8',
  )
  await p.locator('input[type=file]').last().setInputFiles(rutaPrograma)
  await p.waitForSelector('text=/3 bloques para cargar/', { timeout: 20000 })
  v('Acepta la hora escrita como 8:30 y la normaliza', (await p.locator('body').innerText()).includes('08:30–10:00'))
  const previaPrograma = await p.locator('body').innerText()
  v('Rechaza la hora imposible', previaPrograma.includes('25:99'))
  v('Rechaza el bloque que termina antes de empezar', previaPrograma.includes('antes o al mismo tiempo'))
  await p.screenshot({ path: `${TMP}/04-programa-previa.png`, fullPage: true })

  await p.locator('button:has-text("Cargar 3 bloques")').click()
  await p.waitForTimeout(2500)
  await p.waitForLoadState('networkidle')
  // El acordeón puede haber quedado abierto tras confirmar: solo se abre si
  // está cerrado, para no cerrarlo con el clic.
  if (!(await p.locator('body').innerText()).includes('Marco legal y normativa')) {
    await p.locator('button:has-text("Programa de contenidos")').first().click()
    await p.waitForTimeout(600)
  }
  const trasPrograma = await p.locator('body').innerText()
  v('El programa quedó guardado en el tipo de curso', trasPrograma.includes('Marco legal y normativa'))
  v('Y se ve el conteo de bloques', /3 bloques/.test(trasPrograma))

  // =====================================================================
  seccion('Contenidos de una jornada')
  // =====================================================================
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const href = await p.locator('a[href*="/sesiones/"]').first().getAttribute('href')
  const sid = href.split('/sesiones/')[1].split('/')[0]
  await p.goto(`${BASE}/sesiones/${sid}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2000)

  await p.locator('[data-testid=pestana-contenidos]').click()
  await p.waitForTimeout(800)

  const hayBoton = await p.locator('button:has-text("Aplicar el programa del curso")').count()
  v('Aparece el botón de aplicar el programa del curso', hayBoton > 0)

  if (hayBoton > 0) {
    await p.locator('button:has-text("Aplicar el programa del curso")').click()
    await p.waitForTimeout(3000)
    await p.waitForLoadState('networkidle')
    const trasAplicar = await p.locator('body').innerText()
    v('El programa se copió a la jornada', trasAplicar.includes('Marco legal y normativa'))
    v('Con su horario', trasAplicar.includes('08:30–10:00'))
    await p.screenshot({ path: `${TMP}/05-programa-aplicado.png`, fullPage: true })
  }

  const rutaJornada = `${TMP}/jornada.csv`
  writeFileSync(
    rutaJornada,
    csv([
      'Tema;Actividades;Hora inicio;Hora fin;Observaciones',
      'Repaso de incidentes de la faena;Análisis del caso del 12 de junio;17:00;18:00;Pedido por el agente de seguridad',
    ]),
    'utf8',
  )
  await p.locator('button:has-text("Cargar contenidos desde archivo")').first().click()
  await p.locator('input[type=file]').last().setInputFiles(rutaJornada)
  await p.waitForSelector('text=/1 bloque para cargar/', { timeout: 20000 })
  v('La jornada acepta su propio archivo de contenidos', true)
  v(
    'Y ofrece agregar o reemplazar porque ya hay bloques',
    (await p.locator('body').innerText()).includes('Borrarlos y dejar solo los del archivo'),
  )
  await p.locator('button:has-text("Cargar 1 bloque")').click()
  await p.waitForTimeout(3000)
  await p.waitForLoadState('networkidle')
  await p.locator('[data-testid=pestana-contenidos]').click()
  await p.waitForTimeout(800)
  const trasJornada = await p.locator('body').innerText()
  v('El bloque de la jornada quedó guardado', trasJornada.includes('Repaso de incidentes de la faena'))
  v('Y no borró los que ya estaban', trasJornada.includes('Marco legal y normativa'))
  await p.screenshot({ path: `${TMP}/06-jornada.png`, fullPage: true })

  console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} verificación(es) fallaron.`}`)
  console.log(`Capturas en ${TMP}`)
} finally {
  await nav.close()
}
process.exit(fallos === 0 ? 0 : 1)
