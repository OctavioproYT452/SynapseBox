//! Instalar SynapseBox (el servidor) en este mismo equipo ejecutando el instalador oficial en una terminal de verdad,
//! para que `sudo` pueda pedir la contraseña. También se usa desde la línea de órdenes (`sbox install-server`).
use std::process::Command;

pub const URL: &str = "https://raw.githubusercontent.com/OctavioproYT452/SynapseBox/HEAD/get.sh";
/// Dirección del servidor recién instalado (puerto por defecto).
pub const LOCAL: &str = "http://localhost:3001";

/// Orden que se ejecuta. Con `start`, el servidor se arranca al terminar (queda funcionando en esa terminal).
pub fn command(start: bool) -> String { format!("curl -fsSL {} | {}bash", URL, if start { "SYNAPSEBOX_START=1 " } else { "" }) }

fn has(bin: &str) -> bool { std::env::var_os("PATH").map(|p| std::env::split_paths(&p).any(|d| d.join(bin).is_file())).unwrap_or(false) }

/// Abre una ventana de terminal y ejecuta el instalador. Devuelve el nombre de la terminal usada.
pub fn launch_in_terminal() -> Result<String, String> {
    let script = format!("{}; echo; read -rp 'Pulsa Enter para cerrar esta ventana… ' _", command(true));
    let terms: [(&str, &[&str]); 7] = [("x-terminal-emulator", &["-e"]), ("gnome-terminal", &["--"]), ("konsole", &["-e"]), ("xfce4-terminal", &["-x"]), ("kitty", &[]), ("alacritty", &["-e"]), ("xterm", &["-e"])];
    for (t, pre) in terms {
        if has(t) && Command::new(t).args(pre).arg("bash").arg("-c").arg(&script).spawn().is_ok() { return Ok(t.to_string()); }
    }
    Err(format!("No encontré ninguna terminal. Abre una y ejecuta:\n{}", command(true)))
}
