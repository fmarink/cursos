# Instalación local

Guía para dejar la plataforma corriendo en tu Mac y probarla con celulares
reales. Toma unos 10 minutos la primera vez.

---

## Camino corto

Abre la Terminal, ve a la carpeta del proyecto y ejecuta:

```bash
./instalar.sh
./iniciar.sh
```

El instalador verifica lo que falta, levanta PostgreSQL, genera la
configuración, crea el esquema y carga los datos de prueba. Si algo falta te
dice exactamente qué instalar.

Al terminar, `./iniciar.sh` muestra dos direcciones:

```
  En este equipo:
      http://localhost:3000

  Desde los celulares en la misma red Wi-Fi:
      http://192.168.1.42:3000
```

**Usa siempre la segunda.** Es la parte que más se equivoca, y la explico abajo.

---

## Lo único que hay que entender: la dirección

Los códigos QR heredan la dirección desde la que abriste el panel del relator.

- Si entras por `http://localhost:3000`, el QR dice "localhost". Cuando un
  participante lo escanea, su teléfono busca *en sí mismo* y no encuentra nada.
- Si entras por `http://192.168.1.42:3000`, el QR dice esa dirección, y
  cualquier celular en la misma Wi-Fi la alcanza sin problema.

No hay que configurar nada: la aplicación detecta sola la dirección que estás
usando. Solo hay que entrar por la correcta. Si te equivocas, el panel te avisa
con un mensaje sobre el código QR antes de que lo proyectes en sala.

La IP cambia cuando te cambias de red Wi-Fi. Por eso `./iniciar.sh` la vuelve a
detectar cada vez que arranca.

---

## Requisitos

| Qué | Para qué | Si falta |
|---|---|---|
| **Node.js 20+** | Ejecutar la aplicación | `brew install node` o [nodejs.org](https://nodejs.org) |
| **PostgreSQL 14+** | Guardar los datos | El instalador lo resuelve (ver abajo) |
| **Google Chrome** | Generar el PDF del expediente | [google.com/chrome](https://google.com/chrome) |

Para PostgreSQL, el instalador prueba en este orden y usa el primero que
encuentre:

1. **Un PostgreSQL que ya esté corriendo** en tu equipo.
2. **Docker**, si lo tienes instalado. Crea un contenedor `uppercap-db` y no
   toca nada más del sistema. Es la opción más limpia.
3. **Homebrew**, si lo tienes. Te pregunta antes de instalar `postgresql@16`.

Si no encuentra ninguno, te ofrece las tres alternativas con sus enlaces. La
más simple es [Docker Desktop](https://docker.com/products/docker-desktop);
también sirve [Postgres.app](https://postgresapp.com), que es PostgreSQL nativo
para macOS con interfaz gráfica.

Chrome no es obligatorio para que arranque: todo funciona salvo la generación
del PDF. Si lo instalas después, vuelve a correr `./instalar.sh` para que quede
registrado en la configuración.

---

## Camino alternativo: todo en Docker

Si prefieres no instalar Node ni PostgreSQL en el Mac, un solo comando levanta
la base de datos y la aplicación en contenedores, con Chromium ya incluido:

```bash
docker compose up -d --build
docker compose exec app npx tsx scripts/seed.ts   # solo la primera vez
```

Queda en `http://localhost:3000`.

Para que los celulares lleguen, entra por la IP de tu Mac (la ves con
`ipconfig getifaddr en0`).

```bash
docker compose logs -f app    # ver los registros
docker compose down           # detener, conservando los datos
docker compose down -v        # detener y borrar todo
```

Antes de usarlo con datos reales, cambia `SESSION_SECRET` en
`docker-compose.yml` por un valor aleatorio.

---

## Primera prueba, en 5 minutos

1. `./iniciar.sh` y anota la dirección de red.
2. En el navegador del Mac, entra por **esa** dirección (no localhost).
3. Ingresa como `operaciones@uppercap.cl` / `uppercap2026`.
4. En el tablero verás el curso **Manejo Gases Criogénicos** programado para hoy.
   Ábrelo.
5. Pulsa **Abrir sesión**. Aparece el código QR.
6. Toma tu teléfono, conéctalo a la misma Wi-Fi y escanea el QR con la cámara.
7. Escribe un nombre, un RUT válido, firma con el dedo y confirma.
8. Mira el Mac: el registro aparece en unos segundos, sin recargar.
9. Pulsa **Cerrar sesión** → **Revisar y enviar expediente** → **Generar PDF**.

Si el PDF sale con tu firma dentro, está todo funcionando.

Para probar el modo tablet, abre **Modo tablet** en un iPad conectado a la misma
red y firma con el Apple Pencil.

### RUT válidos para probar

La aplicación valida el dígito verificador de verdad, así que un RUT inventado
al azar será rechazado. Estos sirven:

```
15.707.103-3      16.460.245-1      17.460.290-5
18.209.864-7      14.257.708-9      13.577.192-9
```

Son los mismos de la nómina de prueba. Para probar el aviso de "excede nómina",
usa uno que no esté en la lista, por ejemplo `16.123.456-7`.

---

## Comandos útiles

```bash
./iniciar.sh              # iniciar (producción, rápido)
./iniciar.sh --dev        # iniciar con recarga automática, para desarrollar

npm run db:seed           # recargar los datos de prueba
npm run db:reset          # vaciar todo
npm run db:reset && npm run db:seed    # empezar de cero

node scripts/prueba-e2e.mjs            # prueba automatizada completa
```

Para importar tu Excel real de relatores:

```bash
npm run import:profesores -- ~/Downloads/relatores.xlsx --dry-run
npm run import:profesores -- ~/Downloads/relatores.xlsx
```

---

## Si algo falla

**El celular no abre la página al escanear el QR**

Casi siempre es la dirección. Revisa que en el navegador del Mac la barra diga
`http://192.168.x.x:3000` y no `localhost`. Si dice localhost, el propio panel
te muestra un aviso amarillo sobre el QR.

Si la dirección es correcta y aun así no carga, comprueba que el teléfono esté
en la misma red Wi-Fi (no en datos móviles, y no en una red de invitados —
muchas aíslan los dispositivos entre sí).

**"No se pudo generar el PDF"**

Falta Chrome. Instálalo y vuelve a correr `./instalar.sh`, o agrega la ruta a
mano en el archivo `.env`:

```
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

**"ECONNREFUSED" o error de conexión a la base**

PostgreSQL no está corriendo.

```bash
docker start uppercap-db          # si usas Docker
brew services start postgresql@16 # si usas Homebrew
```

**El puerto 3000 está ocupado**

```bash
PORT=3100 ./iniciar.sh
```

**macOS pregunta si permitir conexiones entrantes**

Di que sí. Es el firewall: sin eso los celulares no llegan.

**Quiero empezar de cero**

```bash
npm run db:reset && npm run db:seed
```

Y si quieres borrar también la configuración: `rm .env && ./instalar.sh`

---

## Salir de la red local

Para una demo con alguien que no está en tu Wi-Fi, un túnel expone tu instancia
local en una URL pública temporal. Los QR heredan esa URL automáticamente:

```bash
npx localtunnel --port 3000
# o
ngrok http 3000
```

Sirve para mostrar el sistema a distancia. **No lo uses con datos reales de
participantes**: el túnel es público mientras esté abierto.

Para el piloto real conviene un servidor propio — el README tiene la sección de
despliegue.

---

## Qué pasa con tus datos

Todo queda en PostgreSQL, en tu equipo: los nombres, los RUT, las firmas y los
PDF generados. Nada sale a internet, salvo el correo al cliente cuando
configures un proveedor real (por defecto está en modo simulación y solo
registra el envío en la consola).

Si vas a probar con datos de personas reales, ten presente que se aplican la
Ley 19.628 y la Ley 21.719 igual que en producción. Para las pruebas internas,
usa los datos ficticios del seed.
