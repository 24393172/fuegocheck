# ExtinCheck Local Server

Servidor autónomo para recibir inspecciones desde la app móvil y administrar
catálogos y reportes dentro de una red local. No depende de archivos de código de
Expo, por lo que esta carpeta puede moverse posteriormente a otro repositorio o
equipo.

## Requisitos

- Node.js 22.5 o posterior.
- La computadora y el teléfono conectados a la misma red privada.
- La plantilla oficial en `templates/FORMATOS P.R. CANCUN.xlsx`.

## Configuración segura

En PowerShell:

```powershell
cd C:\ExtinCheck\extincheck-local-server
Copy-Item .env.example .env
npm install
npm run install:admin
```

Genera cada credencial por separado. Los comandos solo imprimen el valor y el
nombre de la variable donde debe copiarse; no modifican `.env`.

```powershell
npm run admin:hash-password -- "Escribe aquí una contraseña robusta"
npm run security:generate-secret
npm run security:generate-api-key
```

Edita `.env` y configura:

- `ADMIN_USERNAME`: usuario único del panel.
- `ADMIN_PASSWORD_HASH`: resultado de `admin:hash-password`.
- `SESSION_SECRET`: resultado de `security:generate-secret`.
- `SESSION_MAX_AGE_HOURS`: duración de la sesión, 12 horas por defecto.
- `LOCAL_API_KEY`: resultado de `security:generate-api-key`.
- `ALLOWED_ADMIN_ORIGINS`: únicamente orígenes adicionales autorizados, por
  ejemplo `http://localhost:5173` para Vite.
- `TRUST_PROXY`: normalmente `false`; cámbialo solo si existe un proxy confiable.

En `production` y `local-production` el proceso se niega a iniciar si falta una
credencial, el hash no es bcrypt o se detecta un valor débil/de ejemplo. El
arranque no imprime secretos, rutas de SQLite, rutas de plantillas ni nombres de
archivos internos.

## Configurar la app Expo

Copia el mismo `LOCAL_API_KEY` en el archivo local de la app:

```text
EXPO_PUBLIC_LOCAL_SERVER_URL=http://IP_DE_LA_PC:3001
EXPO_PUBLIC_LOCAL_API_KEY=EL_MISMO_VALOR_DE_LOCAL_API_KEY
```

Después reinicia Expo:

```powershell
cd C:\ExtinCheck
npx expo start --clear
```

Las variables `EXPO_PUBLIC_` quedan incluidas en el JavaScript compilado. Por
ello, esta clave ofrece una barrera básica para un servidor dentro de una red
local; no equivale a credenciales individuales ni debe reutilizarse en servicios
públicos.

## Compilar e iniciar

```powershell
cd C:\ExtinCheck\extincheck-local-server
npm run build
npm start
```

Para desarrollo:

```powershell
npm run dev
```

El servidor mantiene `HOST=0.0.0.0` para aceptar al teléfono. Desde el navegador
abre:

```text
http://localhost:3001/admin
http://IP_DE_LA_PC:3001/admin
```

La pantalla de login se sirve sin autenticación para que el usuario pueda
iniciar sesión. Empresas, sucursales, ubicaciones, reportes, firmas y evidencias
solo se consultan después de validar la cookie de sesión.

Para cerrar sesión usa `Cerrar sesión` dentro del panel. Esto revoca la fila
correspondiente en SQLite. Para cambiar las credenciales, genera nuevos valores,
actualiza `.env` y reinicia el servidor. Rotar `SESSION_SECRET` invalida todas las
sesiones existentes; cambiar solo la contraseña no revoca sesiones que todavía
estén vigentes.

## Modelo de seguridad

### Sesiones administrativas

`POST /api/admin/auth/login` valida usuario y bcrypt, genera un token aleatorio y
envía una cookie `HttpOnly`, `SameSite=Strict`, con vencimiento configurable.
`Secure` se activa cuando Express identifica una conexión HTTPS, incluido un
proxy configurado mediante `TRUST_PROXY`.

SQLite conserva únicamente un HMAC-SHA-256 del token en `admin_sessions`:

- `id`
- `session_token_hash`
- `username`
- `created_at`
- `expires_at`
- `last_seen_at`
- `revoked_at`

`GET /api/admin/auth/session` restaura la sesión y
`POST /api/admin/auth/logout` la revoca.

Las operaciones administrativas que modifican estado requieren además
`X-ExtinCheck-CSRF`, derivado de la sesión mediante HMAC, y un `Origin` o
`Referer` same-origin o incluido explícitamente en `ALLOWED_ADMIN_ORIGINS`.
El token CSRF vive únicamente en memoria de React; la sesión no usa
`localStorage`.

### Token móvil

La app envía:

```text
Authorization: Bearer <LOCAL_API_KEY>
```

El servidor compara el valor de forma segura. La sesión del panel y la clave
móvil son mecanismos independientes.

Rutas móviles protegidas:

- `GET /api/mobile/catalog`
- `POST /api/inspections/extinguishers`
- `POST /api/inspections/hydrants`
- `POST /api/inspections/sync`
- `POST /api/inspections/:inspectionId/evidence`
- `DELETE /api/inspections/:inspectionId/evidence/:evidenceId`
- `POST /api/inspections/:inspectionId/evidence/finalize`
- `GET /api/mobile/inspections/:inspectionId/reports/:id/download`

La descarga móvil valida simultáneamente el UUID del reporte y la inspección a
la que pertenece. No acepta rutas de archivos.

Rutas administrativas protegidas:

- CRUD bajo `/api/companies`, `/api/branches` y `/api/locations`.
- `GET /api/admin/reports`
- `GET /api/admin/reports/:reportId/evidence`
- `GET /api/admin/evidence/:id/file`
- `GET /api/admin/evidence/:id/thumbnail`
- `GET /api/admin/reports/:id/download`
- `GET /api/admin/health`

Los alias históricos de reportes y evidencias también requieren sesión; ya no
existe una descarga pública.

`GET /api/health` permanece público y solo devuelve `ok`, `service`, `version` y
`timestamp`.

### CORS, cabeceras y límites

CORS permite únicamente same-origin o los valores exactos de
`ALLOWED_ADMIN_ORIGINS`. No autoriza automáticamente direcciones `10.*`,
`172.16-31.*` ni `192.168.*`.

Helmet añade CSP, bloqueo de frames, `nosniff` y una política de referencia
restrictiva sin impedir XLSX ni imágenes same-origin.

Valores predeterminados:

- Login: 5 intentos cada 15 minutos por IP.
- Sincronización móvil: 120 solicitudes por minuto.
- Evidencias: 300 solicitudes por minuto.
- Descargas: 120 solicitudes por minuto.
- API administrativa: 600 solicitudes por minuto.

Todos pueden ajustarse con las variables `*_RATE_LIMIT_*` de `.env.example`.

## Catálogo de ejemplo

El seed es opcional e idempotente:

```powershell
npm run seed
```

Crea datos de ejemplo sin duplicarlos. Como el comando abre la misma SQLite,
también requiere la configuración segura completa de `.env`.

## Diagnóstico

- `401 Autenticación requerida`: confirma la sesión del panel o que
  `EXPO_PUBLIC_LOCAL_API_KEY` coincida exactamente con `LOCAL_API_KEY`, y
  reinicia Expo después de cambiarla.
- `403 Solicitud administrativa no permitida`: revisa `Origin`,
  `ALLOWED_ADMIN_ORIGINS`, la cookie y el token CSRF. No agregues comodines.
- `429 Demasiadas solicitudes`: espera la ventana indicada por `Retry-After` o
  ajusta el límite correspondiente sin desactivar autenticación.
- El panel vuelve al login: la sesión venció, fue revocada o cambió la
  configuración del servidor.
- El teléfono no conecta: usa la IPv4 de la computadora, verifica que ambos
  equipos estén en la misma red y permite el puerto 3001 solo en el perfil
  Privado de Windows.

## Pruebas

```powershell
npm run build
npm test
```

La suite conserva todas las pruebas funcionales anteriores y añade cobertura para
configuración, login, cookie HTTP-only, persistencia, expiración, logout, CSRF,
CORS, rate limit, catálogo/sincronización/evidencias móviles y descarga XLSX con
Bearer.

## Operación, respaldos y recuperación

La sección **Mantenimiento** del panel muestra el estado de SQLite, espacio
disponible, anomalías y respaldos terminados. Crear un respaldo desde el panel
requiere sesión, origen autorizado y CSRF. La restauración no está expuesta en
la interfaz web.

Variables operativas: `BACKUP_DIRECTORY`, `LOG_DIRECTORY`, `LOG_LEVEL`,
`LOG_RETENTION_DAYS`, `BACKUP_RETENTION_DAYS`, `MIN_FREE_DISK_MB`,
`TEMP_FILE_MAX_AGE_HOURS`, `TEMP_DIRECTORY` y `WINDOWS_AUTOSTART_MODE`.

```powershell
npm run backup
npm run backup:verify -- --backup C:\ruta\al\respaldo
npm run restore -- --backup C:\ruta\al\respaldo
npm run storage:report
npm run storage:audit
npm run storage:cleanup
npm run logs:report
npm run logs:cleanup
```

`restore` es una simulación por defecto. La aplicación real exige `--apply`,
`--confirm <ID>` y que el servidor esté detenido. Consulta
[`docs/RECUPERACION.md`](../docs/RECUPERACION.md) para restauración, respaldo
externo, inicio automático, firewall e IP local.
