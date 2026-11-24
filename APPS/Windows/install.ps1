# Instala SynapseBox para tu usuario (no necesita administrador).
#   .\install.ps1                 instala en %LOCALAPPDATA%\Programs\SynapseBox, acceso directo en el menú Inicio y «sbox» en el PATH
#   .\install.ps1 -Service        además activa la sincronización en segundo plano al iniciar sesión
#   .\install.ps1 -Dir C:\Apps\SynapseBox
param([string]$Dir = (Join-Path $env:LOCALAPPDATA 'Programs\SynapseBox'), [switch]$Service)
$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
foreach ($f in 'synapsebox.exe', 'sbox.exe') { if (-not (Test-Path (Join-Path $src $f))) { throw "Falta $f junto a install.ps1" } }

Write-Host "Instalando en $Dir ..."
Get-Process synapsebox -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
New-Item -ItemType Directory -Force $Dir | Out-Null
Copy-Item (Join-Path $src 'synapsebox.exe'), (Join-Path $src 'sbox.exe') $Dir -Force

# «sbox» disponible en cualquier terminal nueva
$p = [Environment]::GetEnvironmentVariable('Path', 'User'); if (-not $p) { $p = '' }
if (($p -split ';') -notcontains $Dir) { [Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';') + ';' + $Dir).TrimStart(';'), 'User') }

# acceso directo en el menú Inicio
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'SynapseBox.lnk'))
$lnk.TargetPath = Join-Path $Dir 'synapsebox.exe'; $lnk.WorkingDirectory = $Dir; $lnk.Description = 'SynapseBox'; $lnk.Save()

if ($Service) { & (Join-Path $Dir 'sbox.exe') service on }
Write-Host ""
Write-Host "Listo. Abre «SynapseBox» desde el menú Inicio, o en una terminal NUEVA escribe:  sbox help"
if (-not $Service) { Write-Host "Para sincronizar con la ventana cerrada:  sbox service on" }
