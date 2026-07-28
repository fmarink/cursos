import puppeteer, { type Browser } from 'puppeteer-core'

/**
 * Rutas donde buscar un navegador basado en Chromium, en orden de preferencia.
 *
 * PUPPETEER_EXECUTABLE_PATH manda por sobre todas. Si no está definido se
 * buscan las ubicaciones habituales de macOS y Linux: en una instalación local
 * basta con tener Chrome, Edge o Brave ya instalados — no hace falta descargar
 * nada aparte. Cualquiera de ellos sirve, todos comparten el motor.
 */
const CANDIDATOS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,

  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',

  // Linux
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/microsoft-edge',
  '/snap/bin/chromium',

  // Contenedor de este repositorio
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean) as string[]

async function rutaChromium(): Promise<string> {
  const { access } = await import('node:fs/promises')

  // El directorio personal se resuelve en caliente: en macOS Chrome también
  // puede estar instalado solo para el usuario.
  const { homedir } = await import('node:os')
  const candidatos = [
    ...CANDIDATOS,
    `${homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    `${homedir()}/Applications/Chromium.app/Contents/MacOS/Chromium`,
  ]

  for (const ruta of candidatos) {
    try {
      await access(ruta)
      return ruta
    } catch {
      continue
    }
  }

  throw new Error(
    'No se encontró un navegador para generar el PDF.\n' +
      'Instale Google Chrome, o defina PUPPETEER_EXECUTABLE_PATH apuntando al binario.\n' +
      'En macOS la ruta habitual es:\n' +
      '  /Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  )
}

let navegador: Browser | null = null

/**
 * Reutiliza una sola instancia de Chromium entre solicitudes: levantar el
 * navegador cuesta ~1 s, y en un día de cursos se generan varios expedientes.
 */
async function obtenerNavegador(): Promise<Browser> {
  if (navegador?.connected) return navegador
  navegador = await puppeteer.launch({
    executablePath: await rutaChromium(),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  })
  return navegador
}

/**
 * Imprime una URL de la propia aplicación a PDF.
 *
 * Se pasa la cookie de sesión para que la ruta protegida responda: el
 * navegador headless actúa en nombre del usuario que pidió el expediente.
 */
export async function generarPdfDesdeUrl(
  url: string,
  cookieSesion: { name: string; value: string; domain: string },
): Promise<Buffer> {
  const nav = await obtenerNavegador()
  const pagina = await nav.newPage()

  try {
    await pagina.setCookie({
      name: cookieSesion.name,
      value: cookieSesion.value,
      domain: cookieSesion.domain,
      path: '/',
      httpOnly: true,
    })

    await pagina.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 })

    // Las firmas y la foto grupal van en base64: hay que esperar el decode.
    await pagina.evaluate(async () => {
      await Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise((resolve) => {
                img.onload = resolve
                img.onerror = resolve
              }),
          ),
      )
      await document.fonts.ready
    })

    const pdf = await pagina.pdf({
      format: 'letter',
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '16mm', left: '12mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width:100%;font-size:8px;color:#94a3b8;padding:0 12mm;
                    display:flex;justify-content:space-between;font-family:sans-serif">
          <span>Uppercap — Expediente de actividad de capacitación</span>
          <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>`,
    })

    return Buffer.from(pdf)
  } finally {
    await pagina.close()
  }
}

export async function cerrarNavegador() {
  await navegador?.close()
  navegador = null
}
