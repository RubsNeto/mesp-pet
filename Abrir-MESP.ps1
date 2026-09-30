$ErrorActionPreference = 'Stop'
$dockRoot = $PSScriptRoot
$dockElectron = Join-Path $dockRoot 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $dockElectron)) { throw 'O runtime do MESP não foi encontrado.' }
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Remove-Item Env:\MESP_DOCK_DATA_DIR -ErrorAction SilentlyContinue
Start-Process -FilePath $dockElectron -ArgumentList ('"' + $dockRoot + '"') -WorkingDirectory $dockRoot -WindowStyle Hidden
