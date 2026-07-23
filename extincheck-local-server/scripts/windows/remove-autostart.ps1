param([string]$TaskName = 'ExtinCheck Local Server')
$ErrorActionPreference = 'Stop'
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) {
  Write-Host "La tarea '$TaskName' no existe."
  exit 0
}
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Tarea '$TaskName' eliminada. Los datos y respaldos no fueron modificados."
