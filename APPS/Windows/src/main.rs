//! synapsebox.exe: ventana de SynapseBox. Sin consola (subsistema «windows»).
//!   synapsebox.exe                 abre la ventana
//!   synapsebox.exe --daemon        sincroniza en segundo plano, sin ventana (lo lanza la tarea programada)
//!   synapsebox.exe --sync-once     una sincronización y termina
#![windows_subsystem = "windows"]
use synapsebox_core::{config, gui, runner, update};
use std::sync::atomic::AtomicBool;

fn main() {
    update::cleanup();
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(|s| s.as_str()) {
        Some("--daemon") => { let stop = AtomicBool::new(false); runner::daemon(&stop, true); }
        Some("--sync-once") => { runner::sync_once(&AtomicBool::new(false)); }
        Some("--version") | Some("-V") => { let _ = config::VERSION; }
        _ => { if let Err(e) = gui::run() { eprintln!("{}", e); } }
    }
}
