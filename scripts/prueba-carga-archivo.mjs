/**
 * Prueba de la carga de preguntas desde archivo.
 *
 * Recorre lo mismo que hará el usuario: descarga la plantilla desde la propia
 * aplicación, la sube, revisa la vista previa y confirma. Después verifica en
 * la pantalla que las preguntas quedaron guardadas.
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:3100'
const TMP = '/tmp/carga-archivo'
mkdirSync(TMP, { recursive: true })

let fallos = 0
function verificar(nombre, ok, detalle = '') {
  console.log(`${ok ? '  ok  ' : ' FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  if (!ok) fallos++
}

// En el contenedor de desarrollo Chromium vive en una ruta fija; en un Mac
// deja que Playwright use el que instaló él mismo.
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const navegador = await chromium.launch({
  ...(existsSync(CHROME) ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
try {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1200 } })
  const p = await ctx.newPage()

  await p.goto(`${BASE}/login`)
  await p.fill('#email', 'operaciones@uppercap.cl')
  await p.fill('#password', 'uppercap2026')
  await p.click('button[type=submit]')
  await p.waitForURL(`${BASE}/`, { timeout: 15000 })

  await p.goto(`${BASE}/plantillas`)
  await p.waitForLoadState('networkidle')

  // --- 1. Descarga de la plantilla ---
  const tarjeta = p.locator('h3').first()
  await tarjeta.waitFor({ timeout: 10000 })

  await p.locator('button:has-text("Cargar desde archivo")').first().click()
  const [descarga] = await Promise.all([
    p.waitForEvent('download', { timeout: 15000 }),
    p.locator('a:has-text("Descargar plantilla Excel")').first().click(),
  ])
  const rutaPlantilla = `${TMP}/plantilla-evaluacion.xlsx`
  await descarga.saveAs(rutaPlantilla)
  verificar('La plantilla de evaluación se descarga', descarga.suggestedFilename().endsWith('.xlsx'),
    descarga.suggestedFilename())

  // --- 2. Un CSV con errores a propósito ---
  const csv = [
    'Enunciado;Tipo;Opción A;Opción B;Opción C;Opción D;Opción E;Opción F;Respuesta correcta;Puntaje',
    '¿Desde qué altura se exige arnés según el estándar?;Selección múltiple;1,8 metros;3 metros;5 metros;;;;A;2',
    'El arnés se inspecciona antes de cada uso.;Verdadero o falso;;;;;;;Verdadero;2',
    'Describa el rescate de un trabajador suspendido.;Respuesta breve;;;;;;;;4',
    'Esta fila tiene un tipo inventado;Bailando cueca;;;;;;;;1',
    'Esta otra no marca la respuesta correcta;Selección múltiple;uno;dos;;;;;;1',
  ].join('\n')
  const rutaCsv = `${TMP}/preguntas.csv`
  writeFileSync(rutaCsv, csv, 'utf8')

  await p.setInputFiles('input[type=file]', rutaCsv)

  await p.waitForSelector('text=/3 preguntas listas para cargar/', { timeout: 15000 })
  verificar('La vista previa muestra las 3 preguntas válidas', true)

  const aviso = await p.locator('text=/2 filas con problemas/').count()
  verificar('Las 2 filas malas se informan como problemas', aviso > 0)

  const textoProblemas = await p.locator('li:has-text("Fila 5")').first().textContent()
  verificar('El problema apunta a la fila real de la planilla',
    !!textoProblemas && textoProblemas.includes('Fila 5'), textoProblemas?.trim())

  // Nada guardado todavía
  await p.screenshot({ path: `${TMP}/01-vista-previa.png`, fullPage: true })

  // --- 3. Confirmar ---
  const antes = await p.locator('h3').first().textContent()
  await p.locator('button:has-text("Cargar 3 pregunta")').click()
  await p.waitForSelector('button:has-text("Cargar desde archivo")', { timeout: 15000 })
  await p.waitForLoadState('networkidle')

  const cuerpo = await p.locator('body').innerText()
  verificar('La pregunta de selección múltiple quedó guardada',
    cuerpo.includes('¿Desde qué altura se exige arnés según el estándar?'))
  verificar('La de verdadero o falso quedó guardada',
    cuerpo.includes('El arnés se inspecciona antes de cada uso.'))
  verificar('La de respuesta breve quedó guardada',
    cuerpo.includes('Describa el rescate de un trabajador suspendido.'))
  verificar('La fila con tipo inventado NO se guardó',
    !cuerpo.includes('Esta fila tiene un tipo inventado'))
  verificar('La fila sin respuesta correcta NO se guardó',
    !cuerpo.includes('Esta otra no marca la respuesta correcta'))
  verificar('La alternativa correcta quedó marcada', cuerpo.includes('1,8 metros ✓'))

  await p.screenshot({ path: `${TMP}/02-guardadas.png`, fullPage: true })

  // --- 4. La plantilla descargada se puede volver a subir ---
  await p.locator('button:has-text("Cargar desde archivo")').first().click()
  await p.setInputFiles('input[type=file]', rutaPlantilla)
  await p.waitForSelector('text=/3 preguntas listas para cargar/', { timeout: 15000 })
  verificar('La plantilla descargada se relee sin problemas',
    (await p.locator('text=/filas? con problemas/').count()) === 0)

  // El selector de modo aparece porque ya hay preguntas
  verificar('Ofrece reemplazar o agregar porque ya hay preguntas',
    (await p.locator('text=/Borrarlas y dejar solo las del archivo/').count()) > 0)
  await p.screenshot({ path: `${TMP}/03-plantilla-releida.png`, fullPage: true })

  // --- 5. Encuesta ---
  await p.goto(`${BASE}/plantillas`)
  await p.waitForLoadState('networkidle')
  const botones = p.locator('button:has-text("Cargar desde archivo")')
  const total = await botones.count()
  if (total >= 2) {
    await botones.nth(total - 1).click()
    const [d2] = await Promise.all([
      p.waitForEvent('download', { timeout: 15000 }),
      p.locator('a:has-text("Descargar plantilla Excel")').last().click(),
    ])
    const rutaEnc = `${TMP}/plantilla-encuesta.xlsx`
    await d2.saveAs(rutaEnc)
    await p.locator('input[type=file]').last().setInputFiles(rutaEnc)
    await p.waitForSelector('text=/6 preguntas listas para cargar/', { timeout: 15000 })
    verificar('La plantilla de encuesta trae las 6 preguntas habituales', true)
    await p.screenshot({ path: `${TMP}/04-encuesta.png`, fullPage: true })
  } else {
    verificar('Hay una encuesta donde probar la carga', false, 'no existe ninguna encuesta')
  }

  console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} verificación(es) fallaron.`}`)
  console.log(`Capturas en ${TMP}`)
} finally {
  await navegador.close()
}
process.exit(fallos === 0 ? 0 : 1)
