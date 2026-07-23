param(
  [int]$Port = 3001,
  [string]$RemoteAddress = 'LocalSubnet'
)
$ErrorActionPreference = 'Stop'
$name = "ExtinCheck Local Server TCP $Port"
if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) {
  throw "La regla '$name' ya existe. Revísala manualmente antes de reemplazarla."
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
