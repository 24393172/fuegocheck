param(
  [int]$Port = 3001,
  [string]$RemoteAddress = 'LocalSubnet',
  [switch]$ConfirmInstall
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmInstall) {
  throw 'Instalación cancelada. Vuelve a ejecutar con -ConfirmInstall.'
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = [Security.Principal.WindowsPrincipal]$identity
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Abre PowerShell como administrador para configurar el firewall.'
}
$activeProfiles = Get-NetConnectionProfile | Where-Object {
  $_.IPv4Connectivity -ne 'Disconnected'
}
if (-not ($activeProfiles | Where-Object { $_.NetworkCategory -eq 'Private' })) {
  throw 'La red activa no está marcada como Privada. Cámbiala a Privada en Windows antes de crear esta regla.'
}

$name = "ExtinCheck Local Server TCP $Port"
$existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
if ($existing) {
  $portFilter = $existing | Get-NetFirewallPortFilter
  $addressFilter = $existing | Get-NetFirewallAddressFilter
  $valid = $existing.Enabled -eq 'True' `
    -and $existing.Action -eq 'Allow' `
    -and $existing.Direction -eq 'Inbound' `
    -and [string]$existing.Profile -match 'Private' `
    -and $portFilter.Protocol -eq 'TCP' `
    -and [string]$portFilter.LocalPort -eq [string]$Port `
    -and $addressFilter.RemoteAddress -contains $RemoteAddress
  if (-not $valid) {
    throw "La regla '$name' ya existe pero no coincide con la configuración segura esperada. Revísala manualmente."
  }
  Write-Host "Regla verificada para TCP $Port, perfil Private, origen $RemoteAddress."
  exit 0
}

New-NetFirewallRule `
  -DisplayName $name `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $Port `
  -RemoteAddress $RemoteAddress `
  -Profile Private | Out-Null
Write-Host "Regla creada para TCP $Port, perfil Private, origen $RemoteAddress."
