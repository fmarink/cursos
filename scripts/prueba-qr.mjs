/**
 * Prueba de la proyección de los códigos QR.
 *
 * Verifica que el relator pueda proyectar los tres QR (asistencia, evaluación
 * y encuesta) y moverse entre ellos sin salir de la pantalla completa, y que
 * un QR de un propósito todavía deshabilitado se muestre tapado y se destape
 * solo cuando se habilita desde el panel.
 *
 *   node scripts/prueba-qr.mjs                    # primera sesión del tablero
 *   SID=xxxxxxxx node scripts/prueba-qr.mjs       # una sesión concreta
 */
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
const BASE='http://127.0.0.1:3100'
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
let fallos=0
const v=(n,ok,d='')=>{console.log(`${ok?'  ok  ':' FALLA'} ${n}${d?` — ${d}`:''}`); if(!ok)fallos++}
const nav=await chromium.launch({...(existsSync(CHROME)?{executablePath:CHROME}:{}),args:['--no-sandbox','--disable-dev-shm-usage']})
const p=await (await nav.newContext({viewport:{width:1440,height:1100}})).newPage()
await p.goto(`${BASE}/login`); await p.fill('#email','operaciones@uppercap.cl'); await p.fill('#password','uppercap2026')
await p.click('button[type=submit]'); await p.waitForURL(`${BASE}/`,{timeout:15000})

// La sesión a probar: la que se indique, o la primera del tablero.
let sid = process.env.SID
if (!sid) {
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const href = await p.locator('a[href*="/sesiones/"]').first().getAttribute('href')
  sid = href.split('/sesiones/')[1].split('/')[0]
}
await p.goto(`${BASE}/sesiones/${sid}`,{waitUntil:'networkidle'})

await p.waitForTimeout(2000)  // hidratación
for (let intento = 0; intento < 3; intento++) {
  if (!(await p.locator('button:has-text("Abrir sesión")').count())) break
  await p.locator('button:has-text("Abrir sesión")').click({ force: true })
  await p.waitForTimeout(2500)
}

// el botón dice qué proyecta y cambia con la pestaña
const btn = p.locator('a:has-text("Proyectar")').first()
v('El botón nombra la asistencia', (await btn.innerText()).toLowerCase().includes('asistencia'), await btn.innerText())
await p.locator('[data-testid=qr-tab-evaluacion]').click(); await p.waitForTimeout(400)
v('Al mirar la evaluación el botón cambia', (await btn.innerText()).toLowerCase().includes('evaluación'), await btn.innerText())
const url = await btn.getAttribute('href')
v('Y el enlace lleva tipo=evaluacion', url.includes('tipo=evaluacion'), url)
v('La tarjeta tiene su propio botón Proyectar', await p.locator('a:text-is("Proyectar")').count() > 0)
await p.screenshot({path:'/tmp/qr-panel.png',fullPage:true})

// la pantalla de proyección
for (const tipo of ['asistencia','evaluacion','encuesta']) {
  await p.goto(`${BASE}/sesiones/${sid}/qr?tipo=${tipo}`,{waitUntil:'networkidle'})
  await p.waitForTimeout(800)
  const txt = await p.locator('body').innerText()
  const esperado = {asistencia:'Registro de asistencia',evaluacion:'Evaluación del curso',encuesta:'Encuesta de satisfacción'}[tipo]
  v(`Proyección de ${tipo} muestra su título`, txt.includes(esperado))
  v(`Proyección de ${tipo} ofrece cambiar a los otros dos`,
     (await p.locator('nav a[href*="/qr?tipo="]').count()) === 3)
  const ruta = {asistencia:'/a/',evaluacion:'/e/',encuesta:'/s/'}[tipo]
  v(`Proyección de ${tipo} apunta a la ruta correcta`, txt.includes(ruta), txt.split('\n').find(l=>l.includes('http'))?.slice(0,70))
  await p.screenshot({path:`/tmp/qr-${tipo}.png`,fullPage:true})
}
// La proyección se destapa sola cuando el relator habilita el propósito.
// Primero se deja la encuesta deshabilitada, para que la prueba se pueda
// repetir tantas veces como haga falta y siempre parta del mismo estado.
const panel = await (await nav.newContext({storageState: await p.context().storageState()})).newPage()
await panel.goto(`${BASE}/sesiones/${sid}`,{waitUntil:'networkidle'}); await panel.waitForTimeout(2000)
const abierta = await panel.evaluate(async (id) => {
  const r = await fetch(`/api/sesiones/${id}/registros`, { cache: 'no-store' })
  return (await r.json()).encuestaAbierta
}, sid)
if (abierta) {
  await panel.locator('[data-testid=flujo-encuesta]').click({force:true}); await panel.waitForTimeout(1500)
}

await p.goto(`${BASE}/sesiones/${sid}/qr?tipo=encuesta`,{waitUntil:'networkidle'})
await p.waitForTimeout(1000)
v('La encuesta arranca tapada en la proyección', (await p.locator('body').innerText()).includes('Todavía no está habilitada'))
await panel.locator('[data-testid=flujo-encuesta]').click({force:true})
await panel.waitForTimeout(1000)
await p.waitForTimeout(5000)
const destapada = !(await p.locator('body').innerText()).includes('Todavía no está habilitada')
v('Al habilitarla en el panel, la proyección se destapa sola (sin recargar)', destapada)
await p.screenshot({path:'/tmp/qr-destapada.png',fullPage:true})

console.log(`\n${fallos===0?'Todo en orden.':fallos+' fallaron.'}`)
await nav.close(); process.exit(fallos?1:0)
