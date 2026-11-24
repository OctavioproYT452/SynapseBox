@echo off
rem Instala SynapseBox para tu usuario (sin administrador). Opciones: -Service (sincronizar en segundo plano), -Dir "C:\ruta"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
pause
