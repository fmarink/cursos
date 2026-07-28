import { randomBytes } from 'node:crypto'

const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** ID corto, ordenable por tiempo, seguro para URLs. */
export function createId(): string {
  const tiempo = Date.now().toString(36).padStart(9, '0')
  const azar = aleatorio(12)
  return `c${tiempo}${azar}`
}

/**
 * Token opaco para los QR. 32 caracteres de entropía criptográfica:
 * no adivinable por fuerza bruta y sin información del curso incrustada.
 */
export function createToken(): string {
  return aleatorio(32)
}

function aleatorio(largo: number): string {
  const bytes = randomBytes(largo)
  let salida = ''
  for (let i = 0; i < largo; i++) {
    salida += ALFABETO[bytes[i] % ALFABETO.length]
  }
  return salida
}
