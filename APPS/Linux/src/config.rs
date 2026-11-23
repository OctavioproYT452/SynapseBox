//! Ajustes, estado y bloqueo. Todo vive en ~/.config/synapsebox (ajustes, permisos 0600 porque contienen el token),
//! ~/.local/share/synapsebox (estado de la sincronización) y $XDG_RUNTIME_DIR (progreso en curso y bloqueo).
use serde::{Deserialize, Serialize};
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::{fs, time::{SystemTime, UNIX_EPOCH}};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub fn now_ms() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0) }
pub fn home() -> PathBuf { PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())) }
fn xdg(var: &str, fallback: &str) -> PathBuf {
    match std::env::var(var) { Ok(v) if !v.is_empty() => PathBuf::from(v), _ => home().join(fallback) }.join("synapsebox")
}
pub fn config_dir() -> PathBuf { xdg("XDG_CONFIG_HOME", ".config") }
pub fn data_dir() -> PathBuf { xdg("XDG_DATA_HOME", ".local/share") }
pub fn cache_dir() -> PathBuf { xdg("XDG_CACHE_HOME", ".cache") }
pub fn runtime_dir() -> PathBuf {
    match std::env::var("XDG_RUNTIME_DIR") { Ok(v) if !v.is_empty() => PathBuf::from(v).join("synapsebox"), _ => PathBuf::from(format!("/tmp/synapsebox-{}", std::env::var("USER").unwrap_or_default())) }
}
pub fn hostname() -> String { fs::read_to_string("/etc/hostname").map(|s| s.trim().to_string()).ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "Linux".into()) }

fn write_atomic(path: &PathBuf, text: &str, private: bool) {
    if let Some(p) = path.parent() { let _ = fs::create_dir_all(p); }
    let tmp = path.with_extension("tmp");
    if fs::write(&tmp, text).is_ok() {
        if private { let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600)); }
        let _ = fs::rename(&tmp, path);
    }
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
    pub fn load() -> Config { fs::read_to_string(Self::file()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default() }
    pub fn save(&self) { if let Ok(t) = serde_json::to_string_pretty(self) { write_atomic(&Self::file(), &t, true); } }
    /// Identifica la configuración de la copia inicial: si cambia (otra carpeta, otro servidor o estrategia) se vuelve a hacer.
    pub fn sync_key(&self) -> String { format!("{}|{}|{}|{}", self.server, self.local_path, self.remote_path, self.strategy) }
    pub fn initial_done(&self) -> bool { self.initial_key == self.sync_key() }
    pub fn logged(&self) -> bool { !self.token.is_empty() && !self.server.is_empty() }
    pub fn clear_session(&mut self) { self.token.clear(); self.expires_at = 0; }
}

/// Hash estable (FNV-1a) para nombrar el archivo de estado de cada configuración.
pub fn fnv(s: &str) -> u64 { let mut h = 0xcbf29ce484222325u64; for b in s.bytes() { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); } h }
pub fn state_file(key: &str) -> PathBuf { data_dir().join(format!("state-{:016x}.txt", fnv(key))) }
pub fn reset_state() { if let Ok(rd) = fs::read_dir(data_dir()) { for e in rd.flatten() { if e.file_name().to_string_lossy().starts_with("state-") { let _ = fs::remove_file(e.path()); } } } }

/// Último resultado (se guarda en disco) y progreso en curso (en el directorio de ejecución, para no desgastar el disco).
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
    pub fn save_final(&self) { if let Ok(t) = serde_json::to_string(self) { write_atomic(&Self::final_file(), &t, false); } let _ = fs::remove_file(Self::live_file()); }
    pub fn save_live(&self) { if let Ok(t) = serde_json::to_string(self) { write_atomic(&Self::live_file(), &t, false); } }
}

/// Bloqueo entre procesos (interfaz, servicio, línea de órdenes): solo una sincronización a la vez.
pub struct Lock(PathBuf);
impl Lock {
    fn file() -> PathBuf { runtime_dir().join("sync.lock") }
    pub fn held() -> bool {
        let f = Self::file();
        let Ok(t) = fs::read_to_string(&f) else { return false };
        let pid: u32 = t.trim().parse().unwrap_or(0);
        let fresh = fs::metadata(&f).and_then(|m| m.modified()).ok().and_then(|m| m.elapsed().ok()).map(|e| e.as_secs() < 6 * 3600).unwrap_or(false);
        pid != 0 && fresh && PathBuf::from(format!("/proc/{}", pid)).exists()
    }
    pub fn acquire() -> Option<Lock> {
        let f = Self::file(); let _ = fs::create_dir_all(f.parent()?);
        for _ in 0..2 {
            if let Ok(mut h) = fs::OpenOptions::new().write(true).create_new(true).open(&f) {
                use std::io::Write; let _ = write!(h, "{}", std::process::id()); return Some(Lock(f));
            }
            if Self::held() { return None }
            let _ = fs::remove_file(&f); // bloqueo huérfano
        }
        None
    }
}
impl Drop for Lock { fn drop(&mut self) { let _ = fs::remove_file(&self.0); } }
