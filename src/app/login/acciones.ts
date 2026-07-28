'use server'

import { redirect } from 'next/navigation'
import { auditar } from '@/lib/audit'
import { cerrarSesion, crearSesion, ipCliente, verificarCredenciales } from '@/lib/auth'

export async function iniciarSesion(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { error: 'Ingrese su correo y contraseña.' }
  }

  const usuario = await verificarCredenciales(email, password)
  if (!usuario) {
    return { error: 'Correo o contraseña incorrectos.' }
  }

  await crearSesion(usuario)
  await auditar({
    entidad: 'usuario',
    entidadId: usuario.id,
    accion: 'inicio_sesion',
    usuarioId: usuario.id,
    ip: await ipCliente(),
  })
  redirect('/')
}

export async function salir() {
  await cerrarSesion()
  redirect('/login')
}
