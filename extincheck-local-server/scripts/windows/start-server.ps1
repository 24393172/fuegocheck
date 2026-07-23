$ErrorActionPreference = 'Stop'
$serverRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $serverRoot

if (-not (Test-Path -LiteralPath (Join-Path $serverRoot 'dist\index.js'))) {
  throw 'No existe dist\index.js. Ejecuta npm run build antes de iniciar el servicio.'
}

$env:NODE_ENV = if ($env:NODE_ENV) { $env:NODE_ENV } else { 'local-production' }
& node (Join-Path $serverRoot 'dist\index.js')
exit $LASTEXITCODE
