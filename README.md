# Uppercap — Plataforma de registro digital de cursos

Reemplaza el Libro de Control de Clases en papel por un registro digital, y
genera el expediente del curso el mismo día en que termina.

**Métrica de éxito:** días entre el término del curso y el envío del expediente
al cliente. Objetivo: 0 días.

---

## El problema que resuelve

Hoy el relator toma asistencia en papel, operaciones transcribe los datos a
Excel y además escanea el libro porque los nombres y RUT manuscritos con
frecuencia no se leen. El expediente llega al cliente días después, y el ciclo
de cobro toma unos 60 días: ~30 para aprobar la orden de compra y ~30 para el
pago.

La plataforma elimina los dos pasos manuales. El participante escribe su propio
nombre y RUT en su celular, firma en pantalla, y el expediente sale tipografiado
y completo al cerrar la sesión.

---

## Cómo se mapea con el libro de papel

| Sección del libro | En la plataforma |
|---|---|
| Portada con datos de la actividad | `cursos` + `tipos_curso` + `clientes` + `lugares` |
| Control de asistencia de participantes | `participantes` + `asistencias` + `firmas` |
| Antecedentes participantes | `participantes` (RUT, escolaridad, empresa, cargo) |
| Contenidos de actividades de capacitación | `bloques_contenido` |
| Evaluaciones | `evaluaciones` + `plantillas_evaluacion` |
| Nómina enviada por el cliente | `nomina_items`, vinculada desde `participantes.nomina_item_id` |

Una fila del control de asistencia es un `participante`; cada par
FECHA + FIRMA es una `asistencia` con su `firma`. Por eso un curso de 16 horas
partido en dos días genera dos asistencias por persona, igual que en el papel.

---

## Puesta en marcha

Requisitos: Node 20+, PostgreSQL 14+, y Chrome o Chromium para generar los PDF.

```bash
./instalar.sh                 # verifica todo, levanta la base y carga datos
./iniciar.sh                  # arranca y muestra la dirección para los celulares
```

El instalador es idempotente: se puede volver a ejecutar sin perder nada.
Guía detallada en **[INSTALACION.md](INSTALACION.md)**.

Todo en contenedores, sin instalar nada en el equipo:

```bash
docker compose up -d --build
docker compose exec app npx tsx scripts/seed.ts
```

Instalación a mano, si prefiere controlar cada paso:

```bash
npm install
cp .env.example .env          # ajuste DATABASE_URL y SESSION_SECRET
npm run db:migrate            # crea el esquema
npm run db:seed               # datos de prueba del caso Anglo
npm run dev                   # http://localhost:3000
```

### Usuarios de prueba

| Correo | Rol | Contraseña |
|---|---|---|
| `admin@uppercap.cl` | Administración | `uppercap2026` |
| `operaciones@uppercap.cl` | Operaciones | `uppercap2026` |
| `carlos.fuentes@ejemplo.cl` | Relator | `uppercap2026` |

Los participantes **no** tienen cuenta: entran escaneando el QR de su sesión.

### Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión a PostgreSQL. |
| `SESSION_SECRET` | Sí | Mínimo 32 caracteres. Firma las cookies de sesión. |
| `APP_URL` | No | Solo para uso interno del servidor (generación del PDF). Por defecto `http://localhost:3000`. **No afecta a los códigos QR**: esos toman la dirección desde la que se abrió el panel. |
| `PUPPETEER_EXECUTABLE_PATH` | No | Ruta al binario de Chromium si no está en las ubicaciones habituales. |
| `CORREO_PROVEEDOR` | No | `consola` (por defecto) o `resend`. |
| `RESEND_API_KEY` | Si usa Resend | Clave del proveedor de correo. |
| `CORREO_REMITENTE` | No | Remitente de los envíos. Por defecto `Uppercap <no-reply@uppercap.cl>`. |

Con `CORREO_PROVEEDOR=consola` el envío se registra en el log y el expediente
queda marcado como enviado, sin salir a la red. Sirve para operar y probar el
sistema completo antes de contratar el proveedor.

---

## Comandos

```bash
npm run dev                  # desarrollo
npm run build && npm start   # producción
npm run db:generate          # genera una migración tras cambiar el esquema
npm run db:migrate           # aplica migraciones pendientes
npm run db:seed              # carga datos de prueba
npm run db:reset             # vacía las tablas (conserva el esquema)
npm run typecheck            # verificación de tipos
node scripts/prueba-e2e.mjs  # prueba de aceptación end-to-end
node scripts/prueba-carga-archivo.mjs   # prueba de la carga de preguntas por archivo
node scripts/prueba-qr.mjs              # prueba de la proyección de los tres QR
```

### Proyectar los QR en sala

El botón de proyectar abre a pantalla completa el QR de la pestaña que el
relator esté mirando, y lo dice: *Proyectar asistencia*, *Proyectar
evaluación*, *Proyectar encuesta*. Ya proyectando, hay tres botones al pie para
cambiar entre los propósitos sin volver al panel — en sala se pasa de la
asistencia a la evaluación y de ahí a la encuesta con el proyector encendido.

Si el propósito todavía no está habilitado, el QR se proyecta en gris con el
aviso «Todavía no está habilitada». Al activarlo desde el panel, la proyección
se destapa sola en menos de tres segundos: nadie tiene que ir a recargar el
computador conectado al proyector.

### Cargar evaluaciones y encuestas desde un archivo

En **Plantillas**, cada evaluación y cada encuesta tiene el botón **Cargar
desde archivo**. Ahí se descarga una plantilla Excel con las columnas ya
armadas, validación desplegable en la columna *Tipo* y una hoja de
instrucciones. Se llena en Excel, se sube, y antes de guardar la pantalla
muestra pregunta por pregunta lo que el sistema entendió y qué filas tienen
problemas, con el número de fila real de la planilla. Nada se guarda hasta
confirmar. También acepta `.csv` (coma, punto y coma o tabulación).

Si la plantilla ya tiene preguntas, al confirmar se elige entre agregar las
nuevas al final o reemplazar las existentes.

### Importar la base de profesores desde Excel

```bash
npm run import:profesores -- ~/relatores.xlsx --dry-run   # revisar el mapeo
npm run import:profesores -- ~/relatores.xlsx             # importar
npm run import:profesores -- ~/relatores.xlsx --hoja "Relatores 2026"
```

El importador mapea columnas por nombre de encabezado y tolera acentos,
mayúsculas y variantes (`fono`/`teléfono`/`celular`, `correo`/`email`/`mail`).
Identifica a cada relator por RUT, o por nombre si el RUT falta, así que puede
correrse varias veces sin duplicar. Las columnas que no reconoce las lista al
final en vez de descartarlas en silencio.

**Pendiente:** falta el Excel real de Uppercap para confirmar el mapeo. Corra
primero con `--dry-run` y avise si aparecen columnas no mapeadas que deban
conservarse.

---

## Flujo de uso

### En sala — el relator

1. Abre la sesión desde su panel. Eso habilita el registro por QR.
2. Proyecta el QR (`Proyectar QR` abre la pantalla completa, con contador en vivo)
   o lo imprime.
3. Ve llegar los registros en tiempo real, con contador contra la nómina esperada.
4. Corrige RUT mal ingresados, agrega manualmente a quien no tenga celular,
   marca ausencias, resuelve alertas.
5. Pasa la tablet en `Modo tablet` a quien prefiera firmar con lápiz. La sesión
   del relator no se cierra entre participante y participante.
6. Registra los contenidos impartidos y sube la foto grupal.
7. Habilita la evaluación y la encuesta cuando corresponda (QR distintos).
8. Cierra la sesión.

### Después — operaciones

1. Revisa el expediente: alertas, registros sin firma, exceso sobre nómina.
2. Genera el PDF y lo previsualiza.
3. Lo marca como validado y lo envía al representante del cliente.
4. El tablero refleja el avance:
   `Programado → En curso → Cerrado → Expediente validado → Enviado al cliente`.

---

## Decisiones de diseño

**Un solo QR para toda la sala, y la lista dentro.** Al escanear, el
participante ve la lista del curso y toca su nombre: el RUT ya viene de la
nómina, así que no lo escribe nadie y no hay errores de tipeo que corregir
después. Quien no aparezca escribe sus datos y entra igual, marcado para
revisión. Así el vínculo entre "quién debía venir" y "quién firmó" queda hecho
en el momento, y el instructor solo resuelve las excepciones.

Al navegador viaja **solo el nombre**, nunca el RUT: cualquiera con el QR ve esa
lista, y el nombre basta para que una persona se reconozca.

**El registro es abierto, la validación es posterior.** No se bloquea a nadie
por conciliación. Si en un curso de 10 personas se registran 11, el registro
sobrante se acepta y queda marcado `EXCEDE_NOMINA` para que el relator decida.
Lo mismo con RUT repetidos o gente fuera de nómina. Solo se rechaza lo que
impide construir el expediente: RUT con dígito verificador inválido, falta de
firma, o sesión ya cerrada.

**La nómina del cliente es referencia, no lista blanca.** Se usa para conciliar
y para alertar, nunca para impedir un registro.

**Un QR por sesión y propósito, no por persona.** Se evaluó generar un QR por
participante y se descartó: complica la operación en sala sin aportar
seguridad real. Los tokens son opacos, de 32 caracteres de entropía
criptográfica, y se invalidan al cerrar la sesión.

**Tiempo real por polling de 3 segundos, no websockets.** Con ~20 personas por
sala el polling corto cumple el requisito de "aparece en menos de 5 segundos",
sobrevive mejor a redes intermitentes y a los proxies corporativos de faena, y
no agrega infraestructura.

**La dirección de los QR se deduce de la petición, no se configura.** Un QR
que diga `localhost` no lo puede abrir ningún celular: en el teléfono apunta al
propio teléfono. En vez de pedir que alguien mantenga una variable con la IP
correcta — que cambia con cada red Wi-Fi — el QR hereda el host desde el que el
relator abrió el panel. Si abrió por `http://192.168.1.42:3000`, el QR dice eso.
Si abrió por localhost, el panel lo avisa antes de que proyecte nada.

**La cookie de sesión se marca `secure` según el protocolo real, no según
NODE_ENV.** Una instalación local corre compilada en modo producción pero se
sirve por HTTP en la red interna; una cookie `secure` sobre HTTP no se guarda, y
el relator no podría iniciar sesión desde ningún equipo que no sea localhost.
Se mira el protocolo de la petición (contemplando proxies inversos), así que
detrás de HTTPS la cookie sigue siendo `secure`.

**Nada se elimina.** Baja lógica en todas las entidades y un `audit_log` que
guarda autor, valor anterior, valor nuevo, IP y timestamp. Reabrir una sesión
cerrada exige un motivo y queda registrado.

**Firmas y adjuntos en base de datos.** Las firmas pesan 10–30 KB y hay ≤20 por
curso; los PDF, unos 200 KB. Guardarlos en PostgreSQL evita montar object
storage para el piloto. Al crecer el volumen, reemplace las columnas
`firmas.imagen_png`, `adjuntos.datos` y `expedientes.pdf_base64` por URLs
firmadas — el resto del código no cambia.

---

## Marco legal

Las firmas capturadas constituyen **firma electrónica simple** conforme a la
**Ley 19.799**. Cada una guarda su imagen PNG, los trazos vectoriales con
presión y tiempo, un hash SHA-256 del registro, la IP y el timestamp del
servidor.

El tratamiento de nombre, RUT y firma se rige por la **Ley 19.628** y la
**Ley 21.719**. La pantalla de registro muestra el aviso de tratamiento de
datos. Falta definir con el cliente la política de retención.

⚠️ **Antes de eliminar el respaldo en papel**, valide con asesoría legal y con
el cliente si la firma electrónica simple es suficiente o si exigen firma
avanzada. Durante la marcha blanca puede fotografiar el libro de papel y
adjuntarlo a la sesión como respaldo (`Foto y cierre → Respaldo del libro en
papel`).

---

## Alcance

### Incluido

- Gestión de clientes, lugares, tipos de curso, profesores y cursos.
- Cursos con N jornadas (un curso de 16 h se parte en dos días, cada uno con su QR).
- Carga de nómina pegada desde Excel o correo.
- Registro por QR desde el celular eligiendo el nombre de la lista del curso.
- Conciliación automática con la nómina, y panel para emparejar a mano lo que
  no calzó.
- Modo kiosco en tablet con lápiz óptico, sin cerrar sesión entre participantes.
- Panel del relator en tiempo real con correcciones auditadas y alta manual.
- Contenidos impartidos y foto grupal.
- Evaluación con corrección automática de preguntas cerradas y manual de abiertas.
- Encuesta de satisfacción con escala configurable y resultados agregados.
- Expediente en PDF tipografiado con firmas incrustadas, y exportación a Excel.
- Envío al cliente con registro de auditoría.
- Tablero de estados y métrica de días entre cierre y envío.
- Importador de la base de profesores desde Excel.

### Fuera de alcance

- **SENCE.** Los cursos objetivo (caso Anglo) no son SENCE, así que no se
  implementan los controles normados: registro de asistencia con formato SENCE,
  control de horas, hora de inicio obligatoria ni huella digital. El modelo de
  datos **ya reserva** los campos (`cursos.es_sence`,
  `cursos.codigo_sence_autorizado`, `tipos_curso.codigo_sence`) para
  incorporarlos sin migración destructiva.
- **Cotización, facturación y órdenes de compra**, incluidas las órdenes NFQ de
  OTIC. El sistema entrega los insumos para ese proceso; no lo ejecuta.
- **Gestión de contenidos y presentaciones** del curso.
- **App móvil nativa.** El participante usa el navegador de su celular.
- **Portal del cliente.** El expediente se envía por correo. Un enlace de acceso
  directo está previsto para la Fase 3.
- **Operación sin conexión.** Se confirmó que los cursos se dictan en lugares con
  red (hotel u oficina), así que el diseño es en línea con reintentos. Si más
  adelante se dictan cursos en faena sin cobertura, la ruta es convertir
  `/a/[token]` en PWA con service worker y cola local de sincronización; el
  modelo de datos ya lo soporta porque cada registro trae su propio timestamp.
- **Edición de plantillas de evaluación desde la interfaz.** Se cargan por seed
  o directamente en la base. Previsto para la Fase 3.

---

## Verificación

`node scripts/prueba-e2e.mjs` recorre un curso completo en un navegador real y
verifica los criterios de aceptación. Última corrida: **22 de 22**.

| Criterio | Medido |
|---|---|
| Un solo QR muestra la lista del curso | 10 nombres para elegir |
| Al elegirse de la lista no se escribe el RUT | viene de la nómina |
| Registro completo en menos de 60 s | 2,4 s |
| El relator ve el registro en menos de 5 s | 2,3 s |
| RUT con dígito verificador inválido rechazado | Bloquea el envío |
| Registro sobre la nómina aceptado y marcado | `EXCEDE_NOMINA` |
| Corrección de RUT auditada | Con valor anterior y autor |
| Participante sin celular registrado desde la tablet | Sin salir del kiosco |
| PDF completo al cerrar la sesión | 219 KB, 4 páginas, 11 firmas |
| Exportación a Excel | 4 hojas |
| Conciliación automática al elegirse de la lista | Sin trabajo posterior |
| Registro fuera de lista detectado para revisión | Panel de conciliación |
| Envío al cliente el mismo día | Con auditoría |

Las capturas de cada paso quedan en `capturas/`.

---

## Guion de prueba en sala (piloto)

**Antes del curso**

1. Operaciones crea el curso, carga la nómina y asigna al relator.
2. Verifique que el relator pueda entrar con su cuenta desde su celular.
3. Imprima el QR de asistencia como respaldo, por si falla el proyector.
4. Lleve el libro de papel: durante la marcha blanca se usa en paralelo.

**En sala**

5. El relator abre la sesión y proyecta el QR.
6. Indique en voz alta: *"abran la cámara del celular, apunten al código,
   escriban su nombre y RUT, y firmen con el dedo"*.
7. Ofrezca la tablet a quien no tenga celular o prefiera lápiz.
8. Verifique el contador contra la lista antes de continuar con la clase.
9. Registre los contenidos a medida que avanza, no al final.
10. Tome la foto grupal antes de que la gente se retire.
11. Habilite la evaluación y luego la encuesta.
12. Cierre la sesión antes de salir de la sala.

**Después**

13. Operaciones revisa el expediente, resuelve alertas y lo envía **el mismo día**.
14. Compare el PDF con el libro de papel: deben coincidir persona por persona.
15. Registre cuánto demoró el ciclo completo, para medir contra los 60 días actuales.

**Qué observar en el piloto**

- ¿Cuántos no logran escanear el QR y por qué?
- ¿Cuánto demora realmente la persona más lenta?
- ¿La firma con el dedo satisface al cliente, o piden lápiz?
- ¿Aparecen campos que el cliente exige y no estamos capturando?

---

## Pendientes con el cliente

1. **Formato del expediente:** ¿Anglo exige algún campo o formato específico para
   emitir la orden de compra?
2. **Nivel de firma:** ¿la firma electrónica simple basta para el área de
   operaciones del cliente, o exigen firma avanzada?
3. **Marcha blanca:** ¿cuánto tiempo se mantiene el papel en paralelo?
4. **Tablets:** ¿quién las provee y administra? ¿cuántas por relator?
5. **Retención de datos:** ¿cuánto tiempo deben conservarse los datos personales
   y las firmas?
6. **Instrumento de evaluación:** las preguntas del seed son un ejemplo. Falta el
   instrumento real y el umbral de aprobación por tipo de curso.
7. **Certificados:** ¿se requiere emitir un certificado por participante además
   del expediente?
8. **Excel de profesores:** falta el archivo real para confirmar el mapeo de columnas.
9. **SENCE:** ¿se integrará a futuro? Si es probable, conviene definir ahora el
   control de horas y la huella digital.

---

## Estructura del proyecto

```
instalar.sh                  Instalador local (macOS y Linux)
iniciar.sh                   Arranque, con detección de la IP de red
docker-compose.yml           Alternativa en contenedores
Dockerfile                   Imagen con Chromium incluido
INSTALACION.md               Guía de instalación local
DESPLIEGUE-COOLIFY.md        Guía de despliegue en Coolify con dominio propio
drizzle/                     Migraciones SQL versionadas
scripts/
  migrate.ts                 Aplica migraciones
  seed.ts                    Datos de prueba (caso Anglo)
  reset.ts                   Vacía las tablas
  import-profesores.ts       Importador del Excel de relatores
  prueba-e2e.mjs             Prueba de aceptación
src/
  db/schema.ts               Modelo de datos completo
  lib/
    rut.ts                   Validación y formateo de RUT (módulo 11)
    auth.ts                  Sesiones JWT y control de roles
    audit.ts                 Registro de auditoría
    notas.ts                 Escala 1.0–7.0 con exigencia configurable
    plantillas.ts            Resolución de plantillas y corrección automática
    expediente.ts            Armado del expediente
    pdf.ts                   Generación de PDF con Puppeteer
    correo.ts                Envío transaccional (conmutable por proveedor)
    url.ts                   URL pública (QR) frente a URL interna (PDF)
    conciliacion.ts          Vínculo entre la nómina y los registros recibidos
    nomina.ts                Interpretación de nóminas pegadas
  components/
    CanvasFirma.tsx          Firma con dedo, lápiz óptico o mouse
    CampoRut.tsx             Campo de RUT con validación en vivo
  app/
    a/[token]/               Registro de asistencia (público)
    e/[token]/               Evaluación (público)
    s/[token]/               Encuesta (público)
    (app)/                   Aplicación interna (requiere sesión)
      sesiones/[id]/         Panel del relator, QR, kiosco, expediente
      cursos/                Gestión de cursos
      profesores/            Base de relatores
      clientes/              Clientes y lugares
      plantillas/            Evaluaciones y encuestas
    (imprimir)/expediente/   Plantilla del expediente (la imprime Puppeteer)
    api/                     Tiempo real, PDF y Excel
```

---

## Despliegue

La guía completa está en **[DESPLIEGUE-COOLIFY.md](DESPLIEGUE-COOLIFY.md)**.

Resumen: Coolify corre la imagen del `Dockerfile`, que ya incluye Chromium para
generar los PDF. PostgreSQL es un servicio de la misma plataforma, el dominio y
el certificado HTTPS los gestiona Coolify, y las migraciones se aplican solas al
arrancar el contenedor.

La aplicación necesita un runtime Node con sistema de archivos: **no funciona en
edge runtime ni en plataformas puramente serverless** sin mover la generación
del PDF a otro servicio.

Antes de salir a producción:

- `SESSION_SECRET` largo y aleatorio, distinto por ambiente.
- Respaldos automáticos de PostgreSQL — ahí viven las firmas y los expedientes.
- Crear el administrador con `npx tsx scripts/crear-admin.ts` y no usar las
  contraseñas del seed.
- Configurar `CORREO_PROVEEDOR=resend` y verificar el dominio remitente.
