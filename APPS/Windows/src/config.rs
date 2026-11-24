//! Ajustes, estado y bloqueo en Windows:
//!   %APPDATA%\SynapseBox\config.json          ajustes y token de sesión (carpeta privada de tu usuario)
//!   %LOCALAPPDATA%\SynapseBox\                estado de la sincronización, caché, progreso y bloqueo
use serde::{Deserialize, Serialize};
use std::os::windows::fs::OpenOptionsExt;
use std::path::PathBuf;
use std::{fs, time::{SystemTime, UNIX_EPOCH}};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub fn now_ms() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0) }
fn env_dir(var: &str) -> Option<PathBuf> { std::env::var_os(var).filter(|v| !v.is_empty()).map(PathBuf::from) }
pub fn home() -> PathBuf { env_dir("USERPROFILE").unwrap_or_else(|| PathBuf::from("C:\\")) }
pub fn config_dir() -> PathBuf { env_dir("APPDATA").unwrap_or_else(|| home().join("AppData\\Roaming")).join("SynapseBox") }
pub fn data_dir() -> PathBuf { env_dir("LOCALAPPDATA").unwrap_or_else(|| home().join("AppData\\Local")).join("SynapseBox").join("data") }
pub fn cache_dir() -> PathBuf { env_dir("LOCALAPPDATA").unwrap_or_else(|| home().join("AppData\\Local")).join("SynapseBox").join("cache") }
pub fn runtime_dir() -> PathBuf { env_dir("LOCALAPPDATA").unwrap_or_else(|| home().join("AppData\\Local")).join("SynapseBox").join("run") }
pub fn hostname() -> String { std::env::var("COMPUTERNAME").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "Windows".into()) }

/// Quita el prefijo «\\?\» que añade canonicalize() en Windows.
pub fn plain_path(p: &std::path::Path) -> String { let s = p.to_string_lossy().to_string(); s.strip_prefix("\\\\?\\").map(|x| x.to_string()).unwrap_or(s) }

fn write_atomic(path: &PathBuf, text: &str) {
    if let Some(p) = path.parent() { let _ = fs::create_dir_all(p); }
    let tmp = path.with_extension("tmp");
    if fs::write(&tmp, text).is_ok() { let _ = fs::rename(&tmp, path); } // rename sustituye el destino en Windows
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Config {
    pub server: String, pub username: String, pub token: String, pub expires_at: i64,
    pub sync_enabled: bool, pub local_path: String, pub remote_path: String,
    pub mode: String,      // two_way | upload | download
    pub strategy: String,  // full_then_changes | initial_only | changes_only
    pub interval_min: u32,
    pub opt_new: bool, pub opt_mod: bool, pub opt_del: bool, pub opt_dirs: bool,
    pub initial_key: String,
    pub update_auto: bool, pub update_notified: String, pub update_checked: i64,
}
impl Default for Config {
    fn default() -> Self {
        Config { server: String::new(), username: String::new(), token: String::new(), expires_at: 0, sync_enabled: false,
            local_path: String::new(), remote_path: String::new(), mode: "two_way".into(), strategy: "full_then_changes".into(), interval_min: 15,
            opt_new: true, opt_mod: true, opt_del: true, opt_dirs: true, initial_key: String::new(),
            update_auto: true, update_notified: String::new(), update_checked: 0 }
    }
}
impl Config {
    fn file() -> PathBuf { config_dir().join("config.json") }
    pub fn load() -> Config { fs::read_to_string(Self::file()).ok().and_then(|t| serde_json::from_str(t.trim_start_matches('\u{feff}')).ok()).unwrap_or_default() }
    pub fn save(&self) { if let Ok(t) = serde_json::to_string_pretty(self) { write_atomic(&Self::file(), &t); } }
    /// Identifica la configuración de la copia inicial: si cambia (otra carpeta, otro servidor o estrategia) se vuelve a hacer.
    pub fn sync_key(&self) -> String { format!("{}|{}|{}|{}", self.server, self.local_path, self.remote_path, self.strategy) }
    pub fn initial_done(&self) -> bool { self.initial_key == self.sync_key() }
    pub fn logged(&self) -> bool { !self.token.is_empty() && !self.server.is_empty() }
    pub fn clear_session(&mut self) { self.token.clear(); self.expires_at = 0; }
}
/// Carga, aplica el cambio y guarda (así no se pisan cambios hechos a la vez por el servicio o la línea de órdenes).
pub fn edit(f: impl FnOnce(&mut Config)) { let mut c = Config::load(); f(&mut c); c.save(); }

/// Hash estable (FNV-1a) para nombrar el archivo de estado de cada configuración.
pub fn fnv(s: &str) -> u64 { let mut h = 0xcbf29ce484222325u64; for b in s.bytes() { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); } h }
pub fn state_file(key: &str) -> PathBuf { data_dir().join(format!("state-{:016x}.txt", fnv(key))) }
pub fn reset_state() { if let Ok(rd) = fs::read_dir(data_dir()) { for e in rd.flatten() { if e.file_name().to_string_lossy().starts_with("state-") { let _ = fs::remove_file(e.path()); } } } }

/// Último resultado (se guarda en disco) y progreso en curso.
#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(default)]
pub struct Status { pub text: String, pub last_sync: i64, pub running: bool, pub current: String, pub done: u64, pub total: u64 }
impl Status {
    fn final_file() -> PathBuf { data_dir().join("status.json") }
    fn live_file() -> PathBuf { runtime_dir().join("progress.json") }
    pub fn load() -> Status {
        let mut s: Status = fs::read_to_string(Self::final_file()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        s.running = false; s.current.clear(); s.done = 0; s.total = 0;
        if let Some(l) = fs::read_to_string(Self::live_file()).ok().and_then(|t| serde_json::from_str::<Status>(&t).ok()) {
            if l.running && Lock::held() { s.running = true; s.current = l.current; s.done = l.done; s.total = l.total; }
        }
        s
    }
    pub fn save_final(&self) { if let Ok(t) = serde_json::to_string(self) { write_atomic(&Self::final_file(), &t); } let _ = fs::remove_file(Self::live_file()); }
    pub fn save_live(&self) { if let Ok(t) = serde_json::to_string(self) { write_atomic(&Self::live_file(), &t); } }
}

/// Bloqueo entre procesos (ventana, servicio, línea de órdenes): solo una sincronización a la vez.
/// Se basa en abrir un archivo sin compartirlo: si el proceso muere, Windows lo libera solo (no quedan bloqueos huérfanos).
pub struct Lock { file: Option<fs::File>, path: PathBuf }
impl Lock {
    fn file() -> PathBuf { runtime_dir().join("sync.lock") }
    fn open(path: &PathBuf) -> std::io::Result<fs::File> { fs::OpenOptions::new().write(true).create(true).share_mode(0).open(path) }
    pub fn held() -> bool {
        let f = Self::file(); if !f.exists() { return false }
        Self::open(&f).is_err() // si no se puede abrir en exclusiva, alguien la tiene
    }
    pub fn acquire() -> Option<Lock> {
        let f = Self::file(); let _ = fs::create_dir_all(f.parent()?);
        let h = Self::open(&f).ok()?;
        Some(Lock { file: Some(h), path: f })
    }
}
impl Drop for Lock { fn drop(&mut self) { self.file.take(); let _ = fs::remove_file(&self.path); } }

/// Latido del servicio en segundo plano (--daemon): lo escribe cada pocos segundos mientras funciona.
fn alive_file() -> PathBuf { runtime_dir().join("daemon.alive") }
pub fn touch_alive() { let _ = fs::create_dir_all(runtime_dir()); let _ = fs::write(alive_file(), now_ms().to_string()); }
pub fn clear_alive() { let _ = fs::remove_file(alive_file()); }
pub fn service_alive() -> bool {
    fs::metadata(alive_file()).and_then(|m| m.modified()).ok().and_then(|m| m.elapsed().ok()).map(|e| e.as_secs() < 25).unwrap_or(false)
}
