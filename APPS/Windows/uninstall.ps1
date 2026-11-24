# Desinstala SynapseBox. -Purge borra también los ajustes y el estado de sincronización (tus archivos no se tocan).
param([string]$Dir = (Join-Path $env:LOCALAPPDATA 'Programs\SynapseBox'), [switch]$Purge)
$ErrorActionPreference = 'Continue'
$sbox = Join-Path $Dir 'sbox.exe'; if (Test-Path $sbox) { & $sbox service off }
Get-Process synapsebox -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
Remove-Item -Recurse -Force $Dir -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path ([Environment]::GetFolderPath('Programs')) 'SynapseBox.lnk') -ErrorAction SilentlyContinue
$p = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($p) { [Environment]::SetEnvironmentVariable('Path', (($p -split ';' | Where-Object { $_ -and $_ -ne $Dir }) -join ';'), 'User') }
if ($Purge) { Remove-Item -Recurse -Force (Join-Path $env:APPDATA 'SynapseBox'), (Join-Path $env:LOCALAPPDATA 'SynapseBox') -ErrorAction SilentlyContinue }
Write-Host "SynapseBox desinstalado."
