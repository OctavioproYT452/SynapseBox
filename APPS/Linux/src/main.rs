//! SynapseBox para Linux: cliente de escritorio (GTK4) con sincronización de carpetas.
//! Sin argumentos abre la interfaz. Como «sbox» (enlace a este programa) o con una orden (p. ej. «synapsebox-linux ls») es la línea de órdenes. Opciones: --daemon, --sync-once, --check-update, --update, --version.
mod api; mod cli; mod config; mod icons; mod ops; mod runner; mod serverinst; mod sync; mod timefmt; mod ui; mod update;
use std::sync::atomic::AtomicBool;

fn help() {
    println!("SynapseBox para Linux {}\n\nUso: synapsebox-linux [opción]   (para la terminal usa el comando «sbox»: sbox help)\n  (sin opción)    abre la interfaz\n  --daemon        sincroniza en segundo plano (lo usa el servicio de usuario)\n  --sync-once     hace una sincronización y termina\n  --check-update  busca una versión nueva\n  --update        busca, compila e instala la versión nueva\n  --version       muestra la versión", config::VERSION);
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    // invocado como «sbox» (enlace al mismo binario) → línea de órdenes; «synapsebox-linux» sin argumentos → interfaz
    let exe0 = std::env::args().next().unwrap_or_default();
    if std::path::Path::new(&exe0).file_name().map_or(false, |n| n == "sbox") { std::process::exit(cli::run(args)); }
    if let Some(first) = args.first() { if !first.starts_with("--") && first != "-V" && first != "-h" { std::process::exit(cli::run(args)); } }
    match args.first().map(|s| s.as_str()) {
        Some("--version") | Some("-V") => println!("synapsebox-linux {}", config::VERSION),
        Some("--help") | Some("-h") => help(),
        Some("--daemon") => { let stop = AtomicBool::new(false); runner::daemon(&stop); }
        Some("--sync-once") => {
            let c = AtomicBool::new(false);
            if runner::sync_once(&c) { println!("{}", config::Status::load().text); } else { println!("No se sincronizó: falta iniciar sesión o elegir carpeta, o ya hay otra sincronización en curso."); std::process::exit(1); }
        }
        Some("--check-update") => match update::check() {
            Ok(c) if c.newer => println!("Hay una versión nueva: {} (tienes la {})", c.release.version, c.installed),
            Ok(c) => println!("Tienes la última versión ({}).", c.installed),
            Err(e) => { eprintln!("No se pudo comprobar: {}", e); std::process::exit(1); }
        },
        Some("--update") => match update::check() {
            Ok(c) if c.newer => match update::install(&c.release, &mut |l| println!("{}", l)) {
                Ok(()) => println!("Actualizado a la versión {}. Vuelve a abrir la app.", c.release.version),
                Err(e) => { eprintln!("{}", e); std::process::exit(1); }
            },
            Ok(c) => println!("Ya tienes la última versión ({}).", c.installed),
            Err(e) => { eprintln!("No se pudo comprobar: {}", e); std::process::exit(1); }
        },
        _ => ui::run(),
    }
}
