param(
  [string]$TaskName = 'ExtinCheck Local Server',
  [string]$NodePath = '',
  [switch]$Force,
  [switch]$ConfirmInstall
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmInstall) {
  throw 'Instalación cancelada. Revisa el script y vuelve a ejecutar con -ConfirmInstall.'
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = [Security.Principal.WindowsPrincipal]$identity
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Abre PowerShell como administrador para instalar la tarea de inicio.'
}
$serverRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath (Join-Path $serverRoot 'dist\index.js') -PathType Leaf)) {
  throw 'No existe dist\index.js. Ejecuta npm run build antes de instalar la tarea.'
}
if (-not (Test-Path -LiteralPath (Join-Path $serverRoot '.env') -PathType Leaf)) {
  throw 'No existe el archivo .env del servidor.'
}
if (-not $NodePath) {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    throw 'No se encontró node.exe. Instala Node.js o indica -NodePath.'
  }
  $NodePath = $nodeCommand.Source
}
$NodePath = [IO.Path]::GetFullPath($NodePath)
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
  throw "No se encontró node.exe en: $NodePath"
}
$launcher = Join-Path $PSScriptRoot 'start-server.ps1'
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing -and -not $Force) {
  $expectedArguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`" -NodePath `"$NodePath`""
  $alreadyValid = $existing.Principal.UserId -eq 'SYSTEM' `
    -and $existing.Settings.MultipleInstances -eq 'IgnoreNew' `
    -and $existing.Actions.Execute -eq 'powershell.exe' `
    -and $existing.Actions.Arguments -eq $expectedArguments
  if ($alreadyValid) {
    Write-Host "Tarea '$TaskName' ya instalada y verificada; no se creó otra instancia."
    exit 0
  }
  throw "La tarea '$TaskName' ya existe con otra configuración. Revísala y usa -Force solo para reemplazarla."
}
if ($existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`" -NodePath `"$NodePath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 2) `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal `
  -UserId 'SYSTEM' `
  -LogonType ServiceAccount `
  -RunLevel Highest

Register-ScheduledTask `
  -TaskName $TaskName `
  -Description 'Servidor local de ExtinCheck. Instalado explícitamente por el administrador.' `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -ErrorAction Stop | Out-Null

$registered = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
if ($registered.Principal.UserId -ne 'SYSTEM') {
  throw "La tarea '$TaskName' no quedó registrada con la cuenta SYSTEM."
}
if ($registered.Settings.MultipleInstances -ne 'IgnoreNew') {
  throw "La tarea '$TaskName' no quedó configurada para ignorar inicios duplicados."
}

Write-Host "Tarea '$TaskName' instalada y verificada. Revísala en el Programador de tareas antes de reiniciar."
