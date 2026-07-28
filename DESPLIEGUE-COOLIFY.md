# Despliegue en Coolify

Guía para publicar la plataforma en tu servidor Coolify, con tu dominio y HTTPS.

Coolify corre contenedores Docker en un servidor real, así que la aplicación
funciona igual que en tu Mac: el PDF se genera con el Chromium que va dentro de
la imagen y PostgreSQL es un servicio de la misma plataforma. No hay que
reescribir nada.

---

## Antes de empezar

Necesitas tres cosas:

- Un servidor con Coolify instalado y accesible.
- Tu dominio con el DNS apuntando a la IP de ese servidor (un registro `A`).
- El código en un repositorio Git al que Coolify pueda acceder.

---

## 1. Subir el código a un repositorio

Si el proyecto todavía no está en Git, desde la carpeta del proyecto:

```bash
cd "$(find ~ -maxdepth 6 -type d -name uppercap 2>/dev/null | head -1)" && \
git init -b main && \
git add . && \
git commit -m "Plataforma de registro digital de cursos Uppercap" && \
git log --oneline -1
```

El `.gitignore` ya excluye `.env`, `node_modules` y las capturas, así que no se
sube ningún secreto.

Luego crea el repositorio en GitHub (privado) y súbelo. Reemplaza la URL por la
que te entregue GitHub al crear el repositorio:

```bash
git remote add origin git@github.com:TU-USUARIO/uppercap.git
git push -u origin main
```

---

## 2. Crear la base de datos en Coolify

En el panel de Coolify:

1. Entra al proyecto donde vivirá la aplicación (o crea uno: **Uppercap**).
2. **+ New** → **Database** → **PostgreSQL**.
3. Versión **16**. Nombre: `uppercap-db`.
4. **Deploy**.

Cuando termine, abre la base y copia la **Postgres URL interna** — la que empieza
con `postgresql://` y usa el nombre del servicio como host, no `localhost`. Esa
es la que va en la aplicación: el tráfico entre ambos contenedores no sale a
internet.

> No expongas el puerto de la base al exterior. La aplicación la alcanza por la
> red interna de Coolify, y dejarla pública es un riesgo innecesario.

---

## 3. Crear la aplicación

1. **+ New** → **Application** → **Public Repository** o **GitHub App**, según
   cómo hayas subido el código.
2. Rama: `main`.
3. **Build Pack: Dockerfile**. Coolify detecta el `Dockerfile` de la raíz.
   No uses Nixpacks: la imagen incluye Chromium a propósito.
4. **Port**: `3000`.
5. **Health check path**: `/api/salud`.

### Variables de entorno

En la pestaña **Environment Variables** de la aplicación:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La URL interna que copiaste en el paso 2 |
| `SESSION_SECRET` | Un valor aleatorio largo — genéralo con el comando de abajo |
| `APP_URL` | `http://localhost:3000` |
| `CORREO_PROVEEDOR` | `consola` al principio; `resend` cuando configures el correo |

Genera el secreto en tu Mac y pégalo:

```bash
openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48
```

Dos aclaraciones que evitan errores:

**`APP_URL` se queda en `localhost`.** Solo la usa el servidor para imprimirse a
sí mismo el PDF. La dirección de los códigos QR se deduce del dominio por el que
entra el relator, así que funciona sola en cualquier dominio sin configurar nada.

**`SESSION_SECRET` no se cambia después.** Si lo cambias, todas las sesiones
abiertas se invalidan y hay que volver a iniciar sesión.

---

## 4. Dominio y HTTPS

1. En la aplicación, pestaña **Domains**, escribe tu dominio completo con
   `https://`, por ejemplo `https://cursos.tudominio.cl`.
2. Verifica que el DNS de ese subdominio apunte por registro `A` a la IP del
   servidor. Compruébalo desde tu Mac:

```bash
dig +short cursos.tudominio.cl
```

3. **Deploy**. Coolify pide el certificado a Let's Encrypt y lo renueva solo.

Una vez con HTTPS, la cookie de sesión se emite como `secure` automáticamente:
la aplicación mira el protocolo real de cada petición, no una variable de
configuración.

---

## 5. Primer arranque

Las migraciones se aplican solas al arrancar el contenedor — está en el `CMD`
del `Dockerfile`. Si el esquema falla, el contenedor no arranca, que es
preferible a servir la aplicación contra una base desalineada.

Los datos de prueba **no** se cargan solos. Para el primer usuario tienes dos
caminos.

**Opción A — cargar los datos de prueba** (útil para mostrar el sistema
funcionando antes de cargar los reales). Desde el terminal de la aplicación en
Coolify (**Terminal** en el menú lateral):

```bash
npx tsx scripts/seed.ts
```

Entra con `admin@uppercap.cl` / `uppercap2026` y **cambia esa contraseña de
inmediato**.

**Opción B — empezar limpio, solo con un administrador.** En el mismo terminal:

```bash
npx tsx scripts/crear-admin.ts
```

Te pide correo, nombre y contraseña, y crea únicamente ese usuario.

---

## 6. Verificar que quedó bien

```bash
curl -s https://cursos.tudominio.cl/api/salud
```

Debe responder `{"estado":"ok","baseDeDatos":"ok","ms":...}`.

Después, en el navegador:

1. Inicia sesión.
2. Crea un cliente, un tipo de curso y un relator.
3. Crea un curso, pega la nómina y abre la sesión.
4. Escanea el QR con tu teléfono **usando datos móviles, no Wi-Fi** — así
   compruebas que funciona desde fuera de tu red.
5. Genera el expediente en PDF. Si sale con las firmas dentro, Chromium está
   funcionando en el servidor.

---

## Actualizaciones

Cada `git push` a `main` dispara un nuevo despliegue si dejaste el webhook
activo. Si prefieres controlarlo, desactiva **Auto Deploy** y usa el botón
**Deploy** cuando corresponda.

```bash
git add . && git commit -m "descripción del cambio" && git push
```

Las migraciones nuevas se aplican solas en el arranque siguiente.

---

## Respaldos

En la base de datos, pestaña **Backups**, activa el respaldo automático diario.
Es importante de verdad: ahí viven las firmas de los participantes y los
expedientes generados, y son el respaldo legal de los cursos dictados.

Configura además un destino externo (S3 o compatible) si Coolify te lo permite:
un respaldo en el mismo servidor no protege contra la pérdida del servidor.

---

## Correo al cliente

Mientras `CORREO_PROVEEDOR` sea `consola`, el envío se registra en los logs y el
expediente queda marcado como enviado, pero no sale ningún correo. Sirve para
operar el sistema completo antes de contratar el proveedor.

Para enviar de verdad, crea una cuenta en Resend, verifica tu dominio y agrega:

| Variable | Valor |
|---|---|
| `CORREO_PROVEEDOR` | `resend` |
| `RESEND_API_KEY` | La clave de Resend |
| `CORREO_REMITENTE` | `Uppercap <no-reply@tudominio.cl>` |

El remitente tiene que estar en un dominio verificado o los correos se irán a
spam.

---

## Recursos del servidor

Para el volumen previsto —decenas de cursos al mes, hasta 20 personas por
curso— basta con poco:

| Recurso | Mínimo | Cómodo |
|---|---|---|
| RAM | 2 GB | 4 GB |
| CPU | 1 núcleo | 2 núcleos |
| Disco | 20 GB | 40 GB |

El PDF es lo único que consume memoria de golpe: Chromium levanta unos 300 MB
mientras imprime, y se reutiliza entre expedientes. Con 2 GB alcanza, pero si el
servidor comparte otras aplicaciones, 4 GB deja margen.

---

## Si algo falla

**El build se cae instalando Chromium**

El servidor se quedó sin espacio o sin memoria. La imagen final pesa alrededor
de 1,5 GB por Chromium. Libera espacio con `docker system prune -a` en el
servidor.

**La aplicación arranca y se cae sola**

Casi siempre es `DATABASE_URL`. Revisa los logs en Coolify: si dice
`ECONNREFUSED`, la URL apunta a `localhost` en vez de al nombre del servicio de
la base. Usa la URL **interna** que entrega Coolify.

**"No se pudo generar el PDF"**

Chromium no está en la imagen. Verifica que el Build Pack sea **Dockerfile** y
no Nixpacks — Nixpacks arma su propia imagen e ignora el `Dockerfile`.

**Los QR apuntan al dominio equivocado**

Ocurre si entras por la URL temporal de Coolify en vez de por tu dominio. El QR
copia el dominio que uses en el navegador. Entra siempre por el tuyo.

**El certificado HTTPS no se emite**

El DNS todavía no propaga o apunta a otra IP. Verifica con
`dig +short tudominio.cl` y espera unos minutos antes de reintentar.
