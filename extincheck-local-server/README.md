# ExtinCheck Local Server

Servidor autónomo para recibir inspecciones de Extintores dentro de una red local.
No importa archivos ni dependencias de la aplicación móvil, por lo que esta carpeta
puede moverse posteriormente a otro repositorio o computadora.

## Requisitos

- Node.js 22.5 o posterior.
- La computadora y el teléfono conectados a la misma red Wi-Fi.

## Instalación y arranque

```powershell
cd extincheck-local-server
Copy-Item .env.example .env
npm install
npm run install:admin
npm run build
npm run seed
npm run dev
```

El servidor escucha en `0.0.0.0:3001`. La base se crea en
`data/extincheck-local.sqlite`.

La plantilla maestra de Extintores está en
`templates/FORMATOS P.R. CANCUN.xlsx`. Se abre únicamente como origen y cada
sincronización genera una copia en `generated-reports/`.

La plantilla fue convertida y normalizada una sola vez desde el formato XLS. La
generación cotidiana usa JSZip para modificar exclusivamente los valores XML de
las celdas autorizadas; no necesita Microsoft Excel instalado y no reserializa
imágenes, estilos, combinaciones ni configuración de impresión.

## Red local

Ejecuta `ipconfig` y localiza la dirección IPv4 del adaptador Wi-Fi, por ejemplo
`192.168.1.50`. Desde el navegador del teléfono visita:

```text
http://192.168.1.50:3001/api/health
```

Si Windows pregunta por el firewall, permite Node.js solamente en redes privadas.
También puedes crear una regla de entrada TCP para el puerto 3001 limitada al
perfil Privado.

Desde PowerShell ejecutado como administrador:

```powershell
New-NetFirewallRule -DisplayName "ExtinCheck Local Server" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Private
```

En la carpeta de la aplicación móvil configura una sola dirección en `.env.local`:

```text
EXPO_PUBLIC_LOCAL_SERVER_URL=http://IP_DE_LA_PC:3001
```

Después de cambiarla, reinicia Expo con `npx expo start --clear`.

Para compilar e iniciar sin el observador de desarrollo:

```powershell
npm run build
npm start
```

## Verificar datos

```powershell
npm run inspect
```

El comando muestra el total de inspecciones, extintores y las últimas inspecciones
recibidas, además de los reportes generados, sin modificar la base de datos.

## Reportes de Extintores

La sincronización normal continúa usando:

```text
POST /api/inspections/extinguishers
```

Después de guardar la inspección, la respuesta incluye `report.id`, `filename`,
`generatedAt` y `downloadUrl`. Para consultar los reportes registrados:

```text
GET /api/reports
```

Para descargar uno, usa exclusivamente la URL devuelta por el servidor:

```text
GET /api/reports/{id}/download
```

El servidor busca primero el UUID en SQLite y verifica que el archivo resuelto
pertenezca a `generated-reports`; el endpoint no acepta rutas de archivos.

La tabla `generated_reports` conserva una sola fila por inspección y formato. Si
se sincroniza de nuevo, el XLSX se regenera y el registro existente se actualiza.
Si la generación falla, la inspección y sus extintores permanecen guardados y el
registro del reporte cambia a estado `error` con el mensaje correspondiente.

## Panel administrativo local

El panel web vive en `admin-web/`, separado de Expo, pero usa el mismo proceso
Node.js y la misma base SQLite. Después de compilarlo se abre en:

```text
http://localhost:3001/admin
http://IP_DE_LA_PC:3001/admin
```

El seed es opcional e idempotente. Crea `Bodega Caribe`, tres ubicaciones de
Extintores y dos de Hidrantes; puede ejecutarse más de una vez sin duplicarlas:

```powershell
npm run seed
```

En **Empresas**, usa `Nueva empresa`, completa el nombre y, opcionalmente, la
razón social. Desde `Ver detalle` puedes agregar sucursales y ubicaciones. La
sucursal no es obligatoria: una ubicación puede depender directamente de la
empresa. Extintores e Hidrantes se administran en apartados independientes y
pueden buscarse o filtrarse por sucursal y estado.

En **Reportes**, filtra por empresa, fecha, estado o formato. `Descargar` usa el
UUID del reporte mediante `/api/reports/:id/download`; el navegador nunca recibe
la ruta interna del archivo. Los reportes con error muestran el mensaje guardado.

### Catálogo y endpoints administrativos

El catálogo de solo lectura para una futura integración móvil está disponible en:

```text
GET /api/mobile/catalog
```

Solo devuelve empresas, sucursales y ubicaciones activas. La app Expo todavía no
descarga este catálogo.

Endpoints del panel:

- `GET|POST /api/companies`
- `GET|PUT /api/companies/:id`
- `PATCH /api/companies/:id/status`
- `GET|POST /api/companies/:id/branches`
- `PUT /api/branches/:id`
- `PATCH /api/branches/:id/status`
- `GET|POST /api/companies/:id/locations`
- `PUT /api/locations/:id`
- `PATCH /api/locations/:id/status`

`GET /api/companies/:id/locations` acepta `equipmentType`, `branchId`, `active`
y `search`.

Las tablas `companies`, `branches` y `equipment_locations` usan UUID, consultas
preparadas y desactivación lógica mediante `active`. No existe eliminación física
desde esta fase. El middleware central de administración está preparado en
`src/admin-auth.ts` para incorporar autenticación posteriormente sin dispersarla
por todas las rutas.

## Pruebas

```powershell
npm run build
npm test
```

Las pruebas cubren el flujo Excel existente, descarga por UUID, error de
generación, CRUD y estado del catálogo, filtros, persistencia SQLite, exclusión de
datos inactivos, reintentos sin duplicados y seed idempotente.
