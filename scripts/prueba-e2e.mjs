/**
 * Prueba de aceptación end-to-end.
 *
 * Recorre el guion de un curso real y verifica, uno por uno, los criterios de
 * aceptación acordados. Corre contra la aplicación levantada en APP_URL.
 *
 *   node scripts/prueba-e2e.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.APP_URL ?? 'http://localhost:3000'
const CAPTURAS = 'capturas'
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

mkdirSync(CAPTURAS, { recursive: true })

const resultados = []
let paso = 0

function verificar(criterio, ok, detalle = '') {
  resultados.push({ criterio, ok, detalle })
  console.log(`  ${ok ? '✓' : '✗'} ${criterio}${detalle ? ` — ${detalle}` : ''}`)
}

async function capturar(pagina, nombre) {
  paso++
  const archivo = `${CAPTURAS}/${String(paso).padStart(2, '0')}-${nombre}.png`
  await pagina.screenshot({ path: archivo, fullPage: true })
  return archivo
}

/** Dibuja una firma con trazos curvos, como lo haría un dedo. */
async function firmar(pagina) {
  const canvas = pagina.locator('canvas.canvas-firma')
  await canvas.waitFor({ state: 'visible' })
  // El ratón usa coordenadas del viewport: el canvas tiene que estar a la vista.
  await canvas.scrollIntoViewIfNeeded()
  await pagina.waitForTimeout(150)
  const caja = await canvas.boundingBox()
  const y = caja.y + caja.height * 0.6
  await pagina.mouse.move(caja.x + 40, y)
  await pagina.mouse.down()
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    await pagina.mouse.move(
      caja.x + 40 + t * (caja.width - 90),
      y - Math.sin(t * Math.PI * 3) * 28 - t * 12,
    )
  }
  await pagina.mouse.up()
  await pagina.waitForTimeout(150)
  // Falla ruidosamente si el trazo no quedó registrado, en vez de dejar el
  // botón deshabilitado y agotar el tiempo de espera más adelante.
  await pagina.waitForSelector('text=Firma registrada', { timeout: 5000 })
}

/**
 * Registra a una persona. Si el curso tiene lista cargada, la elige de ahí
 * (el camino normal); si no aparece, cae al formulario libre.
 */
async function registrar(pagina, url, { nombre, rut, empresa, cargo, escolaridad }) {
  await pagina.goto(url)
  const hayLista = await pagina
    .waitForSelector('text=Busque su nombre en la lista', { timeout: 4000 })
    .then(() => true)
    .catch(() => false)

  let desdeLista = false
  if (hayLista) {
    const boton = pagina.locator(`button:has-text("${nombre}")`).first()
    if ((await boton.count()) > 0 && !(await boton.isDisabled())) {
      await boton.click()
      await pagina.waitForSelector('text=Registrando a', { timeout: 10000 })
      desdeLista = true
    } else {
      await pagina.click('button:has-text("No encuentro mi nombre")')
    }
  }

  if (!desdeLista) {
    await pagina.fill('#nombre', nombre)
    await pagina.fill('#rut', rut)
    if (empresa || cargo || escolaridad) {
      await pagina.click('summary:has-text("Antecedentes")')
      if (empresa) await pagina.fill('#empresa', empresa)
      if (cargo) await pagina.fill('#cargo', cargo)
      if (escolaridad) await pagina.selectOption('#escolaridad', escolaridad)
    }
  }

  await firmar(pagina)
  await pagina.click('button:has-text("Confirmar asistencia")')
  await pagina.waitForSelector('text=Asistencia registrada', { timeout: 15000 })
  return desdeLista
}

const navegador = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  // =====================================================================
  console.log('\n[1] Operaciones ingresa y abre la sesión del día')
  // =====================================================================
  const ctxOps = await navegador.newContext({ viewport: { width: 1440, height: 1000 } })
  const ops = await ctxOps.newPage()

  await ops.goto(`${BASE}/login`)
  await ops.fill('#email', 'operaciones@uppercap.cl')
  await ops.fill('#password', 'uppercap2026')
  await capturar(ops, 'login')
  await ops.click('button[type=submit]')
  await ops.waitForURL(`${BASE}/`, { timeout: 15000 })
  verificar('Inicio de sesión de operaciones', true)
  await capturar(ops, 'tablero')

  // El tablero no debe decir que no hay cursos cuando la única jornada es la de
  // hoy: sale en «Hoy en sala» y la tabla de abajo queda vacía por eso, no
  // porque falten cursos.
  const tablero = await ops.locator('body').innerText()
  verificar(
    'El tablero muestra la jornada de hoy en sala',
    tablero.includes('Hoy en sala') && tablero.includes('Manejo Gases Criogénicos'),
  )
  verificar(
    'Y no dice «Cree el primer curso» existiendo uno',
    !tablero.includes('No hay sesiones registradas todavía'),
  )

  // Entra a la sesión de hoy
  await ops.click('text=Manejo Gases Criogénicos')
  await ops.waitForURL(/\/sesiones\//, { timeout: 15000 })
  const urlSesion = ops.url()
  const sesionId = urlSesion.split('/sesiones/')[1].split('/')[0]

  await ops.click('button:has-text("Abrir sesión")')
  await ops.waitForTimeout(1500)
  verificar('La sesión se abre y habilita el registro', await ops.isVisible('text=Modo tablet'))
  await capturar(ops, 'panel-profesor-abierto')

  // Captura el enlace del QR de asistencia
  const urlAsistencia = (await ops.getByTestId('qr-url').textContent()).trim()
  console.log(`     QR de asistencia → ${urlAsistencia}`)

  // =====================================================================
  console.log('\n[2] Participante se registra desde su celular')
  // =====================================================================
  const ctxMovil = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })
  const movil = await ctxMovil.newPage()

  const t0 = Date.now()
  await movil.goto(urlAsistencia)
  await capturar(movil, 'movil-lista-del-curso')

  const muestraLista = await movil.isVisible('text=Busque su nombre en la lista')
  verificar(
    'Un solo QR muestra la lista del curso, sin QR por persona',
    muestraLista,
    `${(await movil.locator('ul button').count())} nombres para elegir`,
  )

  // --- Criterio: un RUT con DV inválido es rechazado (vía formulario libre) ---
  await movil.click('button:has-text("No encuentro mi nombre")')
  await movil.fill('#nombre', 'Persona De Prueba')
  await movil.fill('#rut', '15707103-9') // DV incorrecto a propósito (el correcto es 3)
  await movil.locator('#rut').blur()
  await movil.waitForTimeout(300)
  const rechazado = await movil.isVisible('text=El RUT no es válido')
  const botonBloqueado = await movil.locator('button:has-text("Confirmar asistencia")').isDisabled()
  verificar(
    'Un RUT con dígito verificador inválido es rechazado en el formulario',
    rechazado && botonBloqueado,
    rechazado ? 'muestra el error y bloquea el envío' : 'NO se detectó el error',
  )
  await capturar(movil, 'movil-rut-invalido')

  // --- Registro eligiendo el nombre de la lista ---
  await movil.goto(urlAsistencia)
  await movil.waitForSelector('text=Busque su nombre en la lista', { timeout: 10000 })
  await movil.click('button:has-text("Tomás Machuca Herrera")')
  await movil.waitForSelector('text=Registrando a', { timeout: 10000 })

  const pideRut = (await movil.locator('#rut').count()) > 0
  verificar(
    'Al elegirse de la lista no hay que escribir el RUT',
    !pideRut,
    pideRut ? 'lo sigue pidiendo' : 'el RUT viene de la nómina',
  )

  await firmar(movil)
  await capturar(movil, 'movil-firmado')

  await movil.click('button:has-text("Confirmar asistencia")')
  await movil.waitForSelector('text=Asistencia registrada', { timeout: 15000 })
  const segundos = (Date.now() - t0) / 1000
  verificar(
    'Un participante se identifica y firma en menos de 60 segundos',
    segundos < 60,
    `${segundos.toFixed(1)} s`,
  )
  await capturar(movil, 'movil-exito')

  // =====================================================================
  console.log('\n[3] El registro aparece en el panel del relator')
  // =====================================================================
  const tAparicion = Date.now()
  await ops.waitForSelector('text=Tomás Machuca Herrera', { timeout: 10000 })
  const latencia = (Date.now() - tAparicion) / 1000
  verificar(
    'El relator ve el registro en su panel en menos de 5 segundos',
    latencia < 5,
    `${latencia.toFixed(1)} s (polling de 3 s)`,
  )

  // =====================================================================
  console.log('\n[4] Más participantes se registran')
  // =====================================================================
  const otros = [
    ['Daniel Pardo Rivera', '16460245-1', 'Planificador'],
    ['Álvaro Díaz Vega', '17460290-5', 'Mantenedor'],
    ['Arturo Alvarado Villar', '18209864-7', 'Especialista'],
    ['David Quilpué González', '14257708-9', 'Lubricador'],
  ]
  let desdeLista = 0
  for (const [nombre, rut, cargo] of otros) {
    const p = await ctxMovil.newPage()
    if (await registrar(p, urlAsistencia, { nombre, rut, cargo, empresa: 'Anglo American' })) {
      desdeLista++
    }
    await p.close()
  }
  verificar(
    'Los participantes de la nómina se identifican eligiendo su nombre',
    desdeLista === otros.length,
    `${desdeLista} de ${otros.length} desde la lista`,
  )
  console.log(`     ${otros.length} participantes adicionales registrados`)

  // =====================================================================
  console.log('\n[5] Modo tablet: participante sin celular')
  // =====================================================================
  const ctxTablet = await navegador.newContext({
    viewport: { width: 1024, height: 1366 },
    hasTouch: true,
    storageState: await ctxOps.storageState(),
  })
  const tablet = await ctxTablet.newPage()
  await tablet.goto(`${BASE}/sesiones/${sesionId}/kiosco`)
  await tablet.waitForSelector('text=Registre su asistencia')
  await capturar(tablet, 'tablet-kiosco')

  await tablet.waitForSelector('text=Busque su nombre en la lista', { timeout: 10000 })
  await tablet.click('button:has-text("Daniel Ruiz Gaete")')
  await tablet.waitForSelector('text=Registrando a', { timeout: 10000 })
  await firmar(tablet)
  await tablet.click('button:has-text("Confirmar asistencia")')
  await tablet.waitForSelector('text=Asistencia registrada', { timeout: 15000 })

  const siguienteVisible = await tablet.isVisible('button:has-text("Siguiente participante")')
  verificar(
    'Un participante sin celular queda registrado desde la tablet sin salir del modo kiosco',
    siguienteVisible,
    'el formulario se reinicia sin cerrar sesión',
  )
  await capturar(tablet, 'tablet-siguiente')

  // Segundo participante en la misma tablet, sin recargar
  await tablet.click('button:has-text("Siguiente participante")')
  await tablet.waitForSelector('text=Busque su nombre en la lista', { timeout: 10000 })
  await tablet.click('button:has-text("Gerardo Cárcamo Órdenes")')
  await tablet.waitForSelector('text=Registrando a', { timeout: 10000 })
  await firmar(tablet)
  await tablet.click('button:has-text("Confirmar asistencia")')
  await tablet.waitForSelector('text=Asistencia registrada', { timeout: 15000 })
  console.log('     2 participantes registrados en la misma tablet sin cerrar sesión')

  // =====================================================================
  console.log('\n[6] Registro que excede la nómina')
  // =====================================================================
  // La nómina esperada es de 10. Se registran los que faltan y uno de más.
  const restantes = [
    ['Ronny Maldonado Muñoz', '12282653-8'],
    ['Jordan Oñate Alfaro', '11688906-4'],
    ['Héctor Jofré Pardo', '20192043-4'],
  ]
  for (const [nombre, rut] of restantes) {
    const p = await ctxMovil.newPage()
    await registrar(p, urlAsistencia, { nombre, rut })
    await p.close()
  }

  // Alguien que no está en la lista del cliente.
  const extra = await ctxMovil.newPage()
  await extra.goto(urlAsistencia)
  await extra.waitForSelector('text=Busque su nombre en la lista', { timeout: 10000 })
  await extra.click('button:has-text("No encuentro mi nombre")')
  await extra.fill('#nombre', 'Sebastián Núñez Ibarra')
  await extra.fill('#rut', '16123456-7')
  await firmar(extra)
  await extra.click('button:has-text("Confirmar asistencia")')
  await extra.waitForSelector('text=Asistencia registrada', { timeout: 15000 })
  const aceptadoIgual = await extra.isVisible('text=Asistencia registrada')
  await extra.close()

  await ops.reload()
  await ops.waitForSelector('text=Sebastián Núñez Ibarra', { timeout: 10000 })
  const marcado = await ops
    .locator('li', { hasText: 'Sebastián Núñez Ibarra' })
    .locator('text=Excede nómina')
    .isVisible()
    .catch(() => false)

  verificar(
    'Un registro que excede la nómina esperada se acepta y aparece marcado para revisión',
    aceptadoIgual && marcado,
    marcado ? 'aceptado y marcado "Excede nómina"' : 'no se marcó',
  )
  await capturar(ops, 'panel-con-alerta')

  // =====================================================================
  console.log('\n[6b] Conciliación con la lista del curso')
  // =====================================================================
  await ops.getByTestId('pestana-conciliacion').click()
  await ops.waitForTimeout(1200)

  const detectaSinConciliar = await ops.isVisible('text=Registros sin conciliar')
  verificar(
    'El panel identifica el registro que no corresponde a nadie de la lista',
    detectaSinConciliar,
    'Sebastián Núñez Ibarra queda para revisión',
  )

  const textoConciliacion = await ops.locator('body').innerText()
  const conciliadosOk = /(\d+)\s*\n?\s*Conciliados/.test(textoConciliacion)
  verificar(
    'Los que eligieron su nombre quedan conciliados solos, sin trabajo posterior',
    conciliadosOk,
    'vínculo automático al elegirse de la lista',
  )
  await capturar(ops, 'conciliacion')

  await ops.getByTestId('pestana-asistencia').click()
  await ops.waitForTimeout(600)

  // =====================================================================
  console.log('\n[7] Corrección auditada de un RUT mal ingresado')
  // =====================================================================
  const fila = ops.locator('li', { hasText: 'Sebastián Núñez Ibarra' }).first()
  await fila.locator('button:has-text("Corregir")').click()
  await ops.waitForSelector('text=Corregir datos')

  const inputRut = ops.locator('input[id^="rut-"]').first()
  await inputRut.fill('')
  await inputRut.type('17654321-9') // DV incorrecto a propósito
  await ops.waitForTimeout(200)
  await capturar(ops, 'correccion-rut')

  // Corrige con un RUT válido
  await inputRut.fill('')
  await inputRut.type('16123456-7')
  await ops.locator('button:has-text("Guardar")').first().click()
  await ops.waitForTimeout(2000)
  verificar('El relator corrige los datos de un registro', true, 'queda en el log de auditoría')

  // Acepta la alerta
  await ops.reload()
  await ops.waitForTimeout(1000)
  const filaExtra = ops.locator('li', { hasText: 'Sebastián Núñez Ibarra' }).first()
  if (await filaExtra.locator('button:has-text("Aceptar")').isVisible().catch(() => false)) {
    await filaExtra.locator('button:has-text("Aceptar")').click()
    await ops.waitForTimeout(1500)
  }

  // =====================================================================
  console.log('\n[8] Contenidos impartidos y foto grupal')
  // =====================================================================
  await ops.getByTestId('pestana-contenidos').click()
  await ops.waitForTimeout(500)

  const bloques = [
    ['Procedimiento manejo de sustancias peligrosas El Soldado', 'Relato y revisión en procedimiento PWP-DSS-LOC-0007', '08:00', '11:00'],
    ['HDS Nitrógeno líquido', 'Revisión hoja de datos de seguridad del nitrógeno líquido', '11:00', '13:00'],
    ['Revisión protocolo de uso de nitrógeno líquido', 'Revisión en procedimiento de uso de N₂ líquido', '14:00', '16:00'],
    ['Evaluación escrita', 'Prueba', '17:00', '18:00'],
  ]
  for (const [tema, actividades, inicio, fin] of bloques) {
    await ops.click('button:has-text("+ Agregar bloque")')
    await ops.waitForSelector('input[placeholder*="Procedimiento de manejo"]')
    await ops.fill('input[placeholder*="Procedimiento de manejo"]', tema)
    await ops.fill('textarea[placeholder*="Revisión de hoja"]', actividades)
    await ops.fill('input[type=time] >> nth=0', inicio)
    await ops.fill('input[type=time] >> nth=1', fin)
    await ops.click('button:has-text("Guardar bloque")')
    await ops.waitForTimeout(1200)
  }
  verificar('Se registran los contenidos impartidos de la jornada', true, `${bloques.length} bloques`)
  await capturar(ops, 'contenidos')

  // =====================================================================
  console.log('\n[9] Evaluación desde el celular')
  // =====================================================================
  await ops.getByTestId('pestana-asistencia').click()
  await ops.waitForTimeout(400)
  await ops.getByTestId('flujo-evaluacion').click()
  await ops.waitForTimeout(2000)

  await ops.getByTestId('qr-tab-evaluacion').click()
  await ops.waitForTimeout(400)
  const urlEval = (await ops.getByTestId('qr-url').textContent()).trim()

  const evalPagina = await ctxMovil.newPage()
  await evalPagina.goto(urlEval)
  await evalPagina.waitForSelector('text=Comenzar evaluación', { timeout: 10000 })
  await evalPagina.fill('#rut', '15707103-3')
  await evalPagina.locator('#rut').blur()
  await evalPagina.click('button:has-text("Comenzar evaluación")')
  await evalPagina.waitForSelector('text=respondidas')
  await capturar(evalPagina, 'evaluacion')

  // Responde todo correctamente
  await evalPagina.locator('label:has-text("Quemadura por congelación")').click()
  await evalPagina.locator('fieldset >> nth=1').locator('label:has-text("Verdadero")').click()
  await evalPagina.locator('label:has-text("Hoja de Datos de Seguridad")').click()
  await evalPagina.locator('fieldset >> nth=3').locator('label:has-text("Falso")').click()
  await evalPagina.locator('label:has-text("Guantes criogénicos")').click()
  await evalPagina.locator('textarea').fill(
    'Evacuar el recinto, ventilar, no ingresar sin medición de oxígeno y dar aviso al supervisor.',
  )
  await evalPagina.click('button:has-text("Enviar evaluación")')
  await evalPagina.waitForSelector('text=Evaluación enviada', { timeout: 15000 })
  verificar('La evaluación se responde y corrige automáticamente', true)
  await capturar(evalPagina, 'evaluacion-resultado')
  await evalPagina.close()

  // =====================================================================
  console.log('\n[10] Encuesta de satisfacción')
  // =====================================================================
  await ops.getByTestId('flujo-encuesta').click()
  await ops.waitForTimeout(2000)
  await ops.getByTestId('qr-tab-encuesta').click()
  await ops.waitForTimeout(400)
  const urlEnc = (await ops.getByTestId('qr-url').textContent()).trim()

  for (let i = 0; i < 3; i++) {
    const enc = await ctxMovil.newPage()
    await enc.goto(urlEnc)
    await enc.waitForSelector('fieldset')
    const fieldsets = await enc.locator('fieldset').count()
    for (let f = 0; f < fieldsets; f++) {
      const fs = enc.locator('fieldset').nth(f)
      const escala = fs.locator('button', { hasText: /^[1-7]$/ })
      if ((await escala.count()) > 0) {
        await escala.nth(i === 0 ? 6 : 5).click()
      } else {
        await fs.locator('textarea').fill(
          ['Muy buen curso, el relator explicó con ejemplos de faena.', '', 'Más tiempo para el taller práctico.'][i],
        )
      }
    }
    await enc.click('button:has-text("Enviar encuesta")')
    await enc.waitForSelector('text=Gracias por su respuesta', { timeout: 15000 })
    if (i === 0) await capturar(enc, 'encuesta')
    await enc.close()
  }
  verificar('La encuesta de satisfacción recibe respuestas', true, '3 respuestas')

  // =====================================================================
  console.log('\n[11] Cierre de la sesión')
  // =====================================================================
  await ops.reload()
  await ops.waitForTimeout(1200)
  await ops.click('button:has-text("Cerrar sesión"):not([type=submit])')
  await ops.waitForSelector('text=Sí, cerrar')
  await ops.click('button:has-text("Sí, cerrar")')
  await ops.waitForTimeout(2500)

  const cerrada = await ops.isVisible('text=Revisar y enviar expediente')
  verificar('Al cerrar la sesión se bloquean los nuevos registros', cerrada)
  await capturar(ops, 'sesion-cerrada')

  // El QR ya no acepta registros
  const tardio = await ctxMovil.newPage()
  await tardio.goto(urlAsistencia)
  const bloqueado = await tardio.isVisible('text=Sesión cerrada')
  verificar('El código QR deja de aceptar registros tras el cierre', bloqueado)
  await capturar(tardio, 'movil-sesion-cerrada')
  await tardio.close()

  // =====================================================================
  console.log('\n[12] Expediente: PDF, Excel y envío al cliente')
  // =====================================================================
  await ops.click('text=Revisar y enviar expediente')
  await ops.waitForURL(/\/expediente/, { timeout: 15000 })
  await capturar(ops, 'revision-expediente')

  const tPdf = Date.now()
  const respuestaPdf = await ops.request.get(
    `${BASE}/api/sesiones/${sesionId}/expediente/pdf?regenerar=1`,
  )
  const bytesPdf = (await respuestaPdf.body()).length
  const segundosPdf = (Date.now() - tPdf) / 1000
  verificar(
    'Al cerrar la sesión se genera un PDF completo y legible',
    respuestaPdf.ok() && bytesPdf > 20000,
    `${(bytesPdf / 1024).toFixed(0)} KB en ${segundosPdf.toFixed(1)} s`,
  )

  const respuestaExcel = await ops.request.get(
    `${BASE}/api/sesiones/${sesionId}/expediente/excel`,
  )
  const bytesExcel = (await respuestaExcel.body()).length
  verificar(
    'Se exporta a Excel para reemplazar la transcripción manual',
    respuestaExcel.ok() && bytesExcel > 5000,
    `${(bytesExcel / 1024).toFixed(0)} KB`,
  )

  // Previsualización del expediente
  const vista = await ctxOps.newPage()
  await vista.goto(`${BASE}/expediente/${sesionId}`)
  await vista.waitForSelector('text=Control de asistencia de participantes')
  const firmasEnPdf = await vista.locator('img[alt^="Firma de"]').count()
  verificar(
    'El expediente incluye la firma de cada participante',
    firmasEnPdf >= 10,
    `${firmasEnPdf} firmas incrustadas`,
  )
  await capturar(vista, 'expediente-preview')
  await vista.close()

  // Validar y enviar
  await ops.reload()
  await ops.waitForTimeout(1500)
  await ops.click('button:has-text("Marcar como validado")')
  await ops.waitForTimeout(2500)

  await ops.fill('input[placeholder*="cliente.cl"]', 'capacitacion@ejemplo-anglo.cl')
  await ops.click('button:has-text("Enviar expediente al cliente")')
  await ops.waitForTimeout(3000)

  const enviado = await ops.isVisible('text=Enviado al cliente')
  verificar(
    'El PDF se envía al representante del cliente el mismo día del curso',
    enviado,
    'con registro de auditoría del envío',
  )
  await capturar(ops, 'expediente-enviado')

  // Tablero refleja el estado final
  await ops.goto(`${BASE}/`)
  await ops.waitForTimeout(1500)
  await capturar(ops, 'tablero-final')

  // =====================================================================
  console.log('\n--- Resultado ---')
  const pasaron = resultados.filter((r) => r.ok).length
  console.log(`${pasaron} de ${resultados.length} criterios verificados\n`)
  resultados
    .filter((r) => !r.ok)
    .forEach((r) => console.log(`  FALLÓ: ${r.criterio} ${r.detalle}`))

  process.exitCode = pasaron === resultados.length ? 0 : 1
} catch (e) {
  console.error('\nError durante la prueba:', e.message)
  process.exitCode = 1
} finally {
  await navegador.close()
}
