# Recuperación operativa de ExtinCheck

Esta guía cubre el servidor local. Los respaldos incluyen SQLite, plantillas,
reportes, firmas y evidencias; excluyen sesiones administrativas activas,
credenciales, archivos `.env`, logs y temporales.

## Estrategia elegida

SQLite se copia con `VACUUM INTO` mientras las escrituras pasan por el coordinador
de mantenimiento. La copia se valida con `integrity_check`,
`foreign_key_check`, versión de esquema, conteos, tamaños y SHA-256. El respaldo
se construye en `<fecha>.pending`; solo después de validarlo se renombra al
directorio final. Un `.pending` nunca se considera recuperable.

El destino configurado es `BACKUP_DIRECTORY`. Si está en el mismo volumen que el
servidor, el panel muestra una advertencia: esa copia protege contra errores
lógicos, pero no contra la pérdida del disco. Copie respaldos ya verificados a
una unidad externa mediante su procedimiento organizacional.

Ejemplo abreviado de `manifest.json`:

```json
{
  "backupVersion": 1,
  "id": "20260723T153000000Z-antes-de-actualizar",
  "createdAt": "2026-07-23T15:30:00.000Z",
  "applicationVersion": "0.1.0",
  "gitCommit": "abcdef123456",
  "schemaVersion": 2,
  "sourcePlatform": "win32-x64",
  "nodeVersion": "v22.x",
  "backupMode": "vacuum-into",
  "status": "valid",
  "databaseIntegrity": {
    "integrityCheck": "ok",
    "foreignKeyCheck": "ok"
  },
  "counts": {
    "inspections": 0,
    "reports": 0,
    "companies": 0,
    "branches": 0,
    "locations": 0,
    "signatures": 0,
    "evidence": 0,
    "thumbnails": 0
  },
  "totalFiles": 2,
  "totalSizeBytes": 123456,
  "files": [
    {
      "relativePath": "data/extincheck-local.sqlite",
      "sizeBytes": 120000,
      "sha256": "<sha256>",
      "category": "database"
    }
  ]
}
```

El manifiesto no contiene rutas absolutas, cookies, sesiones activas ni valores
del `.env`.

## Crear y verificar

Desde `C:\ExtinCheck\extincheck-local-server`:

```powershell
npm run backup
npm run backup -- --label antes-de-actualizar
npm run backup -- --output E:\ExtinCheck-Backups
npm run backup:verify -- --backup E:\ExtinCheck-Backups\20260723T180000Z
```

También puede crear respaldos desde **Panel > Mantenimiento**. Esa pantalla no
permite restaurar ni borrar.

## Simular una restauración

La restauración es deliberadamente solo por consola y siempre es simulación si
no se proporciona `--apply`:

```powershell
npm run restore -- --backup E:\ExtinCheck-Backups\20260723T180000Z
```

Revise el manifiesto, el ID, la versión y el plan. Detenga el servidor antes de
la ejecución real. Luego use exactamente el ID mostrado:

```powershell
npm run restore -- --backup E:\ExtinCheck-Backups\20260723T180000Z --apply --confirm 20260723T180000Z
```

Antes del intercambio se crea un respaldo preventivo. La base restaurada se
valida, las sesiones administrativas se revocan y se requiere reiniciar el
servidor. Si falla el intercambio de SQLite, se repone el archivo anterior.
Después, inicie el servidor, abra `/api/health`, inicie sesión de nuevo y genere
un reporte piloto.

## Inventario y limpieza

```powershell
npm run storage:report
npm run storage:report -- --json
npm run storage:audit
npm run storage:cleanup
npm run storage:cleanup -- --apply --confirm CLEANUP
npm run logs:report
npm run logs:cleanup
```

La limpieza solo elimina temporales vencidos, respaldos `.pending` y logs
vencidos encontrados por la auditoría. No elimina reportes, firmas, evidencias,
plantillas ni respaldos terminados.

## Inicio automático en Windows

Se eligió el Programador de tareas porque está incluido en Windows, puede
ejecutar al arrancar sin una sesión interactiva y permite reinicios. La tarea usa
la ruta absoluta de Node.js y la política `IgnoreNew`; además, el servidor conserva
su bloqueo de proceso, por lo que un segundo inicio no crea otra instancia. PM2
requiere un componente global adicional y su integración con Windows no es tan
directa. La instalación se realiza una sola vez con permisos de administrador.

Después de compilar, abra PowerShell como administrador:

```powershell
cd C:\ExtinCheck\extincheck-local-server
.\scripts\windows\install-autostart.ps1 -ConfirmInstall
Get-ScheduledTask -TaskName 'ExtinCheck Local Server'
Start-ScheduledTask -TaskName 'ExtinCheck Local Server'
.\scripts\windows\status-autostart.ps1
```

Para retirarlo sin borrar datos:

```powershell
.\scripts\windows\remove-autostart.ps1
```

Los logs estructurados se escriben en `LOG_DIRECTORY`; si no se puede escribir,
se envían a stderr. No incluyen cookies, contraseñas, claves, firmas ni payloads.

## Firewall e IP local

Compruebe la IP con `Get-NetIPAddress -AddressFamily IPv4` y configure la app con
`http://IP_DE_LA_PC:3001`. Prefiera una reserva DHCP en el router. Para habilitar
solo el perfil privado y la subred local, revise y ejecute como administrador:

```powershell
Get-NetConnectionProfile
# Si la red de oficina aparece como Public, cámbiela a Private antes de continuar:
Set-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -NetworkCategory Private
.\scripts\windows\New-ExtinCheckFirewallRule.ps1 -Port 3001 -RemoteAddress LocalSubnet -ConfirmInstall
```

No exponga el puerto a Internet ni use `Any` como origen sin una evaluación
adicional. Verifique que la red de Windows esté clasificada como **Privada**.
Pruebe desde otra computadora con `Test-NetConnection IP_DE_LA_PC -Port 3001`.
Para retirar la regla:

```powershell
Remove-NetFirewallRule -DisplayName 'ExtinCheck Local Server TCP 3001'
```

## Recuperar en otra computadora

1. Instale Node.js 22.5 o posterior y copie el código del servidor.
2. Ejecute `npm ci`, `npm run install:admin` y `npm run build`.
3. Cree un `.env` nuevo a partir de `.env.example`. Las credenciales pertenecen
   a la instalación nueva y no se extraen del respaldo.
4. Configure `BACKUP_DIRECTORY` apuntando a la USB o ubicación que contiene el
   respaldo y ejecute primero `npm run backup:verify`.
5. Ejecute `npm run restore` sin `--apply`, revise el plan y después confirme.
6. Ejecute `npm run storage:audit`, inicie el servidor, pruebe el panel, el
   teléfono y un Excel piloto.

Las rutas internas se guardan de forma relativa. Las rutas absolutas antiguas
conocidas se normalizan al abrir SQLite; las rutas desconocidas quedan
registradas como anomalías y no se remapean por suposición.

## Incidentes

- **SQLite no abre:** no borre WAL/SHM manualmente. Detenga el servidor, copie
  toda la carpeta como evidencia y valide el último respaldo. Restaure solo
  después de un `dry-run` correcto.
- **Falta una evidencia o firma:** ejecute `storage:audit`; no cree archivos
  vacíos. Conserve la fila y restaure desde una copia que tenga el hash esperado.
- **Falta la plantilla:** detenga la generación de reportes y reponga exactamente
  la plantilla activa desde un respaldo verificado.
- **La computadora dejó de funcionar:** use una instalación nueva, un `.env`
  nuevo y el respaldo externo más reciente. Las credenciales no viajan en la
  copia.
- **La IP cambió:** actualice manualmente la URL local de Expo después de
  confirmar la nueva IPv4. Priorice una reserva DHCP en el router.
