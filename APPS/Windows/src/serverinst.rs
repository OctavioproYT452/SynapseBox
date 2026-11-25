//! Instalar SynapseBox (el servidor) en este mismo equipo ejecutando el instalador oficial en PowerShell.
//! Se abre una ventana de PowerShell visible (así winget/UAC pueden pedir permisos) y también se usa desde `sbox install-server`.
use std::process::Command;

pub const URL: &str = "https://raw.githubusercontent.com/OctavioproYT452/SynapseBox/HEAD/get.ps1";
/// Dirección del servidor recién instalado (puerto por defecto).
pub const LOCAL: &str = "http://localhost:3001";

/// Orden de PowerShell. Con `start`, al terminar arranca el servidor (queda funcionando en esa ventana).
pub fn command(start: bool) -> String {
    let mut c = format!("irm {} | iex", URL);
    if start {
        c.push_str("; $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User'); $d = Join-Path $env:USERPROFILE 'SynapseBox'; if (Test-Path $d) { Set-Location $d; npm start }");
    }
    c
}

/// Abre una ventana nueva de PowerShell que ejecuta el instalador y se queda abierta.
pub fn launch() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    Command::new("powershell").args(["-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"]).arg(command(true))
        .creation_flags(0x0000_0010) // CREATE_NEW_CONSOLE
        .spawn().map(|_| ()).map_err(|e| format!("No se pudo abrir PowerShell: {}", e))
}
