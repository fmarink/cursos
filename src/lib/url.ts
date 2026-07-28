import { headers } from 'next/headers'

/**
 * Resolución de URLs. Hay dos, y confundirlas rompe cosas distintas.
 *
 * `urlPublica()` — la que se incrusta en los códigos QR. Tiene que ser
 *   alcanzable desde el celular del participante. En una instalación local eso
 *   significa la IP de la red (`http://192.168.1.42:3000`), no `localhost`:
 *   un QR con localhost apunta al propio teléfono y no abre nada. Por eso se
 *   deriva del encabezado Host de la petición — el relator abre el panel desde
 *   la dirección que los celulares también pueden usar, y el QR hereda esa
 *   misma dirección automáticamente.
 *
 * `urlInterna()` — la que usa Puppeteer para imprimir el expediente. Es una
 *   petición del servidor a sí mismo, así que `localhost` es correcto y además
 *   más rápido y más robusto que salir a la red.
 */

/** Base pública, derivada de la petición en curso. Para los QR. */
export async function urlPublica(): Promise<string> {
  const h = await headers()

  // Detrás de un proxy o túnel (ngrok, Cloudflare) mandan los X-Forwarded-*.
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (host) {
    const protocolo =
      h.get('x-forwarded-proto') ?? (esHostLocal(host) ? 'http' : 'https')
    return `${protocolo}://${host}`
  }

  // Sin encabezado Host, lo configurado explícitamente.
  return urlInterna()
}

/** Base interna, para peticiones del servidor a sí mismo. Para el PDF. */
export function urlInterna(): string {
  return process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`
}

function esHostLocal(host: string): boolean {
  const nombre = host.split(':')[0]
  return (
    nombre === 'localhost' ||
    nombre === '127.0.0.1' ||
    nombre.endsWith('.local') ||
    /^10\./.test(nombre) ||
    /^192\.168\./.test(nombre) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(nombre)
  )
}

/**
 * Advertencia para la interfaz: si el relator abrió el panel desde localhost,
 * el QR que se genere no servirá para ningún celular.
 */
export function qrEsAlcanzableDesdeCelular(base: string): boolean {
  const host = base.replace(/^https?:\/\//, '').split(':')[0]
  return host !== 'localhost' && host !== '127.0.0.1'
}
