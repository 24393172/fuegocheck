param(
  [Parameter(Mandatory = $true)]
  [string]$NodePath
)

$ErrorActionPreference = 'Stop'
$serverRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $serverRoot

if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
  throw "No se encontró Node.js en la ruta configurada: $NodePath"
}
if (-not (Test-Path -LiteralPath (Join-Path $serverRoot 'dist\index.js'))) {
  throw 'No existe dist\index.js. Ejecuta npm run build antes de iniciar el servicio.'
}
if (-not (Test-Path -LiteralPath (Join-Path $serverRoot '.env') -PathType Leaf)) {
  throw 'No existe el archivo .env del servidor.'
}

$env:NODE_ENV = if ($env:NODE_ENV) { $env:NODE_ENV } else { 'local-production' }
& $NodePath (Join-Path $serverRoot 'dist\index.js')
exit $LASTEXITCODE
