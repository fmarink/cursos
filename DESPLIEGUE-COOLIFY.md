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

## 2. Crear la aplicación como Docker Compose

Todo va en un solo stack: la base de datos y la aplicación juntas, desplegadas
con `docker-compose.coolify.yaml`. No hay que crear servicios por separado ni
copiar cadenas de conexión a mano.

En el panel de Coolify:

1. Entra al proyecto donde vivirá la aplicación (o crea uno: **Uppercap**).
2. **+ New** → **Application**.
3. Origen: **Private Repository (with GitHub App)** si el repositorio es
   privado, o **Public Repository** con la URL si lo hiciste público.
4. Rama: `main`.
5. **Build Pack: Docker Compose**.
6. **Docker Compose Location**: `/docker-compose.coolify.yaml`

Coolify lee el archivo, detecta los dos servicios y arma el stack.

### Los secretos se generan solos

El archivo no contiene ninguna contraseña. Usa las variables mágicas de
Coolify, que se generan una vez y se reutilizan donde aparezcan:

| Variable | Para qué |
|---|---|
| `SERVICE_FQDN_APP_3000` | Dominio público y ruteo hacia el puerto 3000 |
| `SERVICE_PASSWORD_DB` | Contraseña de PostgreSQL |
| `SERVICE_BASE64_64_SESION` | Secreto de firma de las cookies de sesión |

Al desplegar por primera vez las verás aparecer con valores ya asignados en la
pestaña **Environment Variables**. No las edites después: cambiar
`SERVICE_BASE64_64_SESION` invalida todas las sesiones abiertas, y cambiar
`SERVICE_PASSWORD_DB` deja la aplicación sin poder conectarse a su propia base.

### Lo único que quizás quieras ajustar

`CORREO_PROVEEDOR` viene en `consola`: el envío al cliente se registra en los
logs y el expediente queda marcado como enviado, pero no sale ningún correo.
Sirve para operar el sistema completo antes de contratar el proveedor. Ver la
sección "Correo al cliente" más abajo.

## 3. La base de datos

No hay que crearla: el propio stack levanta PostgreSQL 16 con un volumen
llamado `datos-uppercap`, que **sobrevive a cada nuevo despliegue**. Ahí viven
las firmas de los participantes y los expedientes generados.

La aplicación espera a que la base responda antes de arrancar, y aplica las
migraciones pendientes automáticamente. Si una migración falla, el contenedor
no arranca — es preferible a servir la aplicación contra un esquema desalineado.

El puerto de la base no se expone al exterior: el tráfico entre los dos
contenedores va por la red interna del stack.

## 4. Dominio y HTTPS

1. En la aplicación, pestaña **Domains**, busca el servicio `app` y escribe tu
   dominio completo con `https://`, por ejemplo `https://cursos.tudominio.cl`.
   Coolify lo asigna a la variable `SERVICE_FQDN_APP_3000` y configura el proxy.
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

En el servicio `db` del stack, pestaña **Backups**, activa el respaldo
automático diario.
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

**Coolify no encuentra el archivo de compose**

La ruta va con barra inicial: `/docker-compose.coolify.yaml`. Y el Build Pack
tiene que ser **Docker Compose**, no Dockerfile ni Nixpacks.

**El build se cae instalando Chromium**

El servidor se quedó sin espacio o sin memoria. La imagen final pesa alrededor
de 1,5 GB por Chromium. Libera espacio con `docker system prune -a` en el
servidor.

**La aplicación arranca y se cae sola**

Mira los logs del servicio `app`. Si dice `ECONNREFUSED`, la base todavía no
estaba lista: el compose ya espera con `condition: service_healthy`, así que
esto solo pasa si el volumen quedó corrupto. Revisa los logs del servicio `db`.

Si dice `password authentication failed`, alguien editó `SERVICE_PASSWORD_DB`
después del primer despliegue. El volumen conserva la contraseña original: hay
que devolver la variable a su valor anterior.

**"No se pudo generar el PDF"**

Chromium no está en la imagen. El servicio `app` del compose construye desde el
`Dockerfile` del repositorio, que sí lo incluye. Si Coolify quedó configurado
con Nixpacks, arma su propia imagen e ignora ese `Dockerfile`.

**Los QR apuntan al dominio equivocado**

Ocurre si entras por la URL temporal de Coolify en vez de por tu dominio. El QR
copia el dominio que uses en el navegador. Entra siempre por el tuyo.

**El certificado HTTPS no se emite**

El DNS todavía no propaga o apunta a otra IP. Verifica con
`dig +short tudominio.cl` y espera unos minutos antes de reintentar.
