param(
  [string]$TaskName = 'ExtinCheck Local Server',
  [switch]$Force,
  [switch]$ConfirmInstall
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmInstall) {
  throw 'Instalación cancelada. Revisa el script y vuelve a ejecutar con -ConfirmInstall.'
}
$launcher = Join-Path $PSScriptRoot 'start-server.ps1'
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing -and -not $Force) {
  throw "La tarea '$TaskName' ya existe. Usa -Force únicamente si deseas reemplazarla."
}
if ($existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 2) `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
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
  -Principal $principal | Out-Null

Write-Host "Tarea '$TaskName' instalada. Revísala en el Programador de tareas antes de reiniciar."
