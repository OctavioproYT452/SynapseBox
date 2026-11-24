//! Una pasada de sincronización completa (renovar sesión, estrategia, estado, notificaciones) y el bucle del servicio en segundo plano.
use crate::api::{Api, Fail};
use crate::config::{now_ms, state_file, Config, Lock, Status};
use crate::sync::{Engine, Opts};
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// Notificación de Windows (toast) mediante PowerShell, sin abrir ventana de consola. El texto viaja en variables de entorno (sin problemas de comillas).
pub fn notify(title: &str, body: &str) {
    use std::os::windows::process::CommandExt;
    const PS: &str = "[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]; \
$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); \
$n = $t.GetElementsByTagName('text'); $n.Item(0).AppendChild($t.CreateTextNode($env:SB_TITLE)) | Out-Null; $n.Item(1).AppendChild($t.CreateTextNode($env:SB_BODY)) | Out-Null; \
$id = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'; \
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show([Windows.UI.Notifications.ToastNotification]::new($t))";
    let _ = Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", PS])
        .env("SB_TITLE", title).env("SB_BODY", body).creation_flags(0x0800_0000).spawn(); // CREATE_NO_WINDOW
}

/// Hace una pasada si hay sesión y carpeta configuradas y no hay otra en curso. Devuelve true si se ejecutó.
pub fn sync_once(cancel: &AtomicBool) -> bool {
    let cfg = Config::load();
    if !cfg.logged() || cfg.local_path.trim().is_empty() { return false }
    let Some(_lock) = Lock::acquire() else { return false }; // otra sincronización (la interfaz o el servicio) ya está en marcha
    let mut st = Status::load(); st.running = true; st.current = "Buscando cambios…".into(); st.done = 0; st.total = 0; st.save_live();
    let api = Api::new(&cfg.server, &cfg.token);
    let mut fin = Status { text: String::new(), last_sync: Status::load().last_sync, ..Default::default() };

    // renovar la sesión si le quedan menos de 2 días
    if cfg.expires_at > 0 && cfg.expires_at - now_ms() < 2 * 86_400_000 {
        match api.renew() { Ok(e) if e > 0 => { let mut c = Config::load(); c.expires_at = e; c.save(); } Err(Fail::Auth) => return auth_lost(fin), _ => {} }
    }
    let key = cfg.sync_key(); let initial = !cfg.initial_done();
    if cfg.strategy == "initial_only" && !initial {
        let mut c = Config::load(); c.sync_enabled = false; c.save();
        fin.text = "La copia inicial ya está hecha. Usa «Reiniciar» en Sincronización para repetirla.".into(); fin.save_final(); return true;
    }
    let eng = Engine { api: &api, root: PathBuf::from(if cfg.local_path.len() > 3 { cfg.local_path.trim_end_matches(['/', '\\']) } else { cfg.local_path.as_str() }), remote_base: cfg.remote_path.trim_matches('/').to_string(), state_file: state_file(&key),
        o: Opts { mode: cfg.mode.clone(), strategy: cfg.strategy.clone(), initial_pass: initial, opt_new: cfg.opt_new, opt_mod: cfg.opt_mod, opt_del: cfg.opt_del, opt_dirs: cfg.opt_dirs } };
    let mut last = std::time::Instant::now().checked_sub(Duration::from_secs(1)).unwrap_or_else(std::time::Instant::now);
    let live = std::cell::RefCell::new(st.clone());
    let res = eng.run(cancel,
        &mut |t| { let mut s = live.borrow_mut(); s.current = t.to_string(); if last.elapsed() > Duration::from_millis(300) { last = std::time::Instant::now(); s.save_live(); } },
        &mut |d, n| { let mut s = live.borrow_mut(); s.done = d as u64; s.total = n as u64; });
    match res {
        Ok(stats) => {
            fin.text = stats.summary(); fin.last_sync = now_ms();
            if initial && stats.errors == 0 {
                let mut c = Config::load(); c.initial_key = key;
                if c.strategy == "initial_only" { c.sync_enabled = false; fin.text = format!("Copia inicial completada ({}). Sincronización detenida.", stats.summary()); notify("SynapseBox", "Copia inicial completada. La sincronización se ha detenido."); }
                c.save();
            }
            fin.save_final(); true
        }
        Err(Fail::Auth) => auth_lost(fin),
        Err(e) => { fin.text = format!("Error: {}", e); fin.save_final(); true }
    }
}
fn auth_lost(mut fin: Status) -> bool {
    fin.text = "Sesión caducada: vuelve a iniciar sesión".into(); fin.save_final();
    notify("SynapseBox", "La sesión ha caducado. Abre SynapseBox para volver a entrar y seguir sincronizando."); true
}

/// Servicio: sincroniza cada `interval_min` minutos (y vuelve a leer los ajustes en cada vuelta) y avisa de actualizaciones una vez al día.
pub fn daemon(stop: &AtomicBool, heartbeat: bool) {
    if heartbeat { std::thread::spawn(|| loop { crate::config::touch_alive(); std::thread::sleep(Duration::from_secs(5)); }); }
    let mut next_sync = 0i64;
    while !stop.load(Ordering::Relaxed) {
        let cfg = Config::load();
        if cfg.sync_enabled && cfg.logged() && now_ms() >= next_sync {
            sync_once(stop);
            next_sync = now_ms() + cfg.interval_min.max(1) as i64 * 60_000;
        }
        if cfg.update_auto && now_ms() - cfg.update_checked > 86_400_000 { check_update_notify(); }
        for _ in 0..10 { if stop.load(Ordering::Relaxed) { if heartbeat { crate::config::clear_alive(); } return } std::thread::sleep(Duration::from_secs(1)); }
    }
}

/// Mira si hay versión nueva y, si es la primera vez que la ve, avisa con una notificación.
pub fn check_update_notify() {
    let mut c = Config::load(); c.update_checked = now_ms();
    if let Ok(ch) = crate::update::check() {
        if ch.newer && c.update_notified != ch.release.version {
            c.update_notified = ch.release.version.clone();
            notify("SynapseBox: actualización disponible", &format!("Versión {} (tienes la {}). Ábrela en SynapseBox → Actualizaciones.", ch.release.version, ch.installed));
        }
    }
    c.save();
}
