//! Ventana de SynapseBox (egui). Cuatro páginas: Inicio, Sincronización, Actualizaciones y Cuenta, más el inicio de sesión.
//! Todo lo que hace la ventana también se puede hacer con sbox.exe. El trabajo de red va en hilos y avisa por un canal.
use crate::api::{self, Api, Fail, LoginRes, R};
use crate::config::{self, edit, Config, Status};
use crate::{cli, ops, runner, update};
use eframe::egui::{self, Color32, RichText};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};

type Session = (String, bool, i64, String, String);

enum Msg {
    Login(R<LoginRes>, String, String),
    Usage(Option<(i64, i64)>),
    Upload(R<ops::Summary>),
    Check(R<update::Check>),
    UpdLog(String),
    UpdDone(R<()>),
    Sessions(R<Vec<Session>>),
    Info(bool, String),
    SyncDone,
    Service(bool),
}

#[derive(PartialEq, Clone, Copy)]
enum Page { Home, Sync, Updates, Account }

struct Gui {
    cfg: Config, cfg_t: Instant, status: Status, status_t: Instant, page: Page,
    tx: mpsc::Sender<Msg>, rx: mpsc::Receiver<Msg>, stop: Arc<AtomicBool>, logo: Option<egui::TextureHandle>,
    // inicio de sesión
    srv: String, user: String, pass: String, pass2: String, code: String, registering: bool, ticket: Option<String>, login_msg: String, busy: bool, codes: Vec<String>,
    // inicio
    usage: Option<(i64, i64)>, usage_t: Option<Instant>, upl: Option<(bool, String)>, uploading: bool,
    // sincronización
    local_buf: String, remote_buf: String, sync_msg: String, svc_installed: bool, syncing_now: bool,
    // actualizaciones
    checking: bool, check: Option<Result<update::Check, String>>, upd_log: Vec<String>, installing: bool, installed_ok: bool,
    // cuenta
    sessions: Vec<Session>, acc_msg: Option<(bool, String)>, pw_cur: String, pw_new: String, pw_new2: String,
}

pub fn run() -> eframe::Result {
    let icon = load_icon();
    let mut vp = egui::ViewportBuilder::default().with_inner_size([980.0, 660.0]).with_min_inner_size([760.0, 500.0]).with_title("SynapseBox");
    if let Some(i) = icon { vp = vp.with_icon(i); }
    let opts = eframe::NativeOptions { viewport: vp, ..Default::default() };
    eframe::run_native("SynapseBox", opts, Box::new(|cc| {
        egui_extras::install_image_loaders(&cc.egui_ctx);
        Ok(Box::new(Gui::new()))
    }))
}

fn load_icon() -> Option<egui::IconData> {
    let bytes = include_bytes!("../assets/icon.png");
    let mut dec = png::Decoder::new(std::io::Cursor::new(&bytes[..]));
    dec.set_transformations(png::Transformations::EXPAND);
    let mut reader = dec.read_info().ok()?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).ok()?;
    buf.truncate(info.buffer_size());
    let rgba = match info.color_type {
        png::ColorType::Rgba => buf,
        png::ColorType::Rgb => buf.chunks(3).flat_map(|p| [p[0], p[1], p[2], 255]).collect(),
        png::ColorType::GrayscaleAlpha => buf.chunks(2).flat_map(|p| [p[0], p[0], p[0], p[1]]).collect(),
        png::ColorType::Grayscale => buf.iter().flat_map(|&g| [g, g, g, 255]).collect(),
        _ => return None,
    };
    Some(egui::IconData { rgba, width: info.width, height: info.height })
}

fn icon_src(name: &str) -> egui::ImageSource<'static> {
    match name {
        "home" => egui::include_image!("../assets/icons/home.svg"),
        "sync" => egui::include_image!("../assets/icons/sync.svg"),
        "update" => egui::include_image!("../assets/icons/update.svg"),
        "account" => egui::include_image!("../assets/icons/account.svg"),
        "upload" => egui::include_image!("../assets/icons/upload.svg"),
        "check" => egui::include_image!("../assets/icons/check.svg"),
        "warn" => egui::include_image!("../assets/icons/warn.svg"),
        "error" => egui::include_image!("../assets/icons/error.svg"),
        "dot-on" => egui::include_image!("../assets/icons/dot-on.svg"),
        "folder" => egui::include_image!("../assets/icons/folder.svg"),
        _ => egui::include_image!("../assets/icons/dot-off.svg"),
    }
}
const GREEN: Color32 = Color32::from_rgb(46, 160, 100);
const AMBER: Color32 = Color32::from_rgb(214, 140, 20);
const RED: Color32 = Color32::from_rgb(210, 70, 70);

/// Icono SVG (blanco en el archivo, teñido aquí con el color indicado o el del texto).
fn icon(ui: &mut egui::Ui, name: &str, tint: Option<Color32>) {
    let c = tint.unwrap_or_else(|| ui.visuals().text_color());
    ui.add(egui::Image::new(icon_src(name)).tint(c).fit_to_exact_size(egui::vec2(16.0, 16.0)));
}
/// Fila con icono y texto de color (estado correcto/aviso/error).
fn note(ui: &mut egui::Ui, kind: &str, text: &str) {
    let (ic, col) = match kind { "ok" => ("check", GREEN), "warn" => ("warn", AMBER), "err" => ("error", RED), "on" => ("dot-on", GREEN), _ => ("dot-off", ui.visuals().weak_text_color()) };
    ui.horizontal_wrapped(|ui| { icon(ui, ic, Some(col)); ui.label(RichText::new(text).color(col)); });
}
fn card(ui: &mut egui::Ui, title: &str, add: impl FnOnce(&mut egui::Ui)) {
    egui::Frame::group(ui.style()).inner_margin(14.0).show(ui, |ui| {
        ui.set_width(ui.available_width());
        if !title.is_empty() { ui.label(RichText::new(title).strong().size(15.0)); ui.add_space(6.0); }
        add(ui);
    });
    ui.add_space(10.0);
}
fn open(target: &str) { let _ = Command::new("explorer").arg(target).spawn(); }
fn fmt_bytes(b: i64) -> String {
    if b < 1024 { return format!("{} B", b) }
    let u = ["KB", "MB", "GB", "TB"]; let mut v = b as f64 / 1024.0; let mut i = 0;
    while v >= 1024.0 && i < u.len() - 1 { v /= 1024.0; i += 1; }
    format!("{:.1} {}", v, u[i])
}
fn ago(ms: i64) -> String { if ms <= 0 { return "nunca".into() } let s = (config::now_ms() - ms) / 1000; if s < 60 { "hace unos segundos".into() } else if s < 3600 { format!("hace {} min", s / 60) } else if s < 86400 { format!("hace {} h", s / 3600) } else { format!("hace {} días", s / 86400) } }

const MODES: [(&str, &str); 3] = [("two_way", "Bidireccional"), ("upload", "Solo subir (PC → nube)"), ("download", "Solo bajar (nube → PC)")];
const STRATS: [(&str, &str); 3] = [("full_then_changes", "Copiar todo lo actual y luego los cambios"), ("initial_only", "Solo copiar lo actual una vez y detenerse"), ("changes_only", "Solo los cambios desde ahora")];
const INTERVALS: [u32; 8] = [5, 15, 30, 60, 180, 360, 720, 1440];
fn label_of(list: &[(&str, &str)], v: &str) -> String { list.iter().find(|(k, _)| *k == v).map(|(_, l)| l.to_string()).unwrap_or_else(|| v.to_string()) }
fn interval_label(m: u32) -> String { if m < 60 { format!("Cada {} min", m) } else if m % 60 == 0 && m < 1440 { format!("Cada {} h", m / 60) } else if m == 1440 { "Cada día".into() } else { format!("Cada {} min", m) } }

impl Gui {
    fn new() -> Gui {
        let (tx, rx) = mpsc::channel();
        let cfg = Config::load();
        let stop = Arc::new(AtomicBool::new(false));
        // Con la ventana abierta sincroniza solo, salvo que ya lo haga el servicio en segundo plano.
        if !config::service_alive() { let s = stop.clone(); std::thread::spawn(move || runner::daemon(&s, false)); }
        Gui {
            srv: cfg.server.clone(), user: cfg.username.clone(), local_buf: cfg.local_path.clone(), remote_buf: cfg.remote_path.clone(),
            cfg, cfg_t: Instant::now(), status: Status::load(), status_t: Instant::now(), page: Page::Home, tx, rx, stop, logo: None,
            pass: String::new(), pass2: String::new(), code: String::new(), registering: false, ticket: None, login_msg: String::new(), busy: false, codes: vec![],
            usage: None, usage_t: None, upl: None, uploading: false,
            sync_msg: String::new(), svc_installed: false, syncing_now: false,
            checking: false, check: None, upd_log: vec![], installing: false, installed_ok: false,
            sessions: vec![], acc_msg: None, pw_cur: String::new(), pw_new: String::new(), pw_new2: String::new(),
        }
    }
    fn reload(&mut self) { self.cfg = Config::load(); self.cfg_t = Instant::now(); }
    fn spawn<T: Send + 'static>(&self, ctx: &egui::Context, work: impl FnOnce() -> T + Send + 'static, wrap: impl FnOnce(T) -> Msg + Send + 'static) {
        let (tx, ctx) = (self.tx.clone(), ctx.clone());
        std::thread::spawn(move || { let r = work(); let _ = tx.send(wrap(r)); ctx.request_repaint(); });
    }
    fn api(&self) -> Api { Api::new(&self.cfg.server, &self.cfg.token) }

    fn pump(&mut self) {
        while let Ok(m) = self.rx.try_recv() {
            match m {
                Msg::Login(res, srv, user) => {
                    self.busy = false;
                    match res {
                        Err(Fail::Api(401, m)) if self.ticket.is_some() && m.contains("caduc") => { self.ticket = None; self.login_msg = m; }
                        Err(e) => self.login_msg = e.to_string(),
                        Ok(r) if r.need2fa && r.ticket.is_some() => { self.ticket = r.ticket; self.login_msg = "Introduce el código de tu app de autenticación (o un código de recuperación)".into(); }
                        Ok(r) => match r.token {
                            Some(t) => {
                                let exp = if r.expires_at > 0 { r.expires_at } else { config::now_ms() + 7 * 86_400_000 };
                                edit(|c| { c.server = srv; c.username = user; c.token = t; c.expires_at = exp; });
                                self.pass.clear(); self.pass2.clear(); self.code.clear(); self.ticket = None; self.login_msg.clear(); self.usage_t = None;
                                self.codes = r.codes; self.reload(); self.local_buf = self.cfg.local_path.clone(); self.remote_buf = self.cfg.remote_path.clone();
                            }
                            None => self.login_msg = "Respuesta inesperada del servidor. ¿Es la dirección correcta y tiene la versión 2.23 o superior?".into(),
                        },
                    }
                }
                Msg::Usage(u) => self.usage = u,
                Msg::Upload(r) => {
                    self.uploading = false;
                    self.upl = Some(match r {
                        Ok(s) if s.failed.is_empty() => (true, format!("Subidos {} archivo(s) a «{}»", s.ok, ops::UPLOAD_DIR)),
                        Ok(s) => (false, format!("Subidos {}; fallaron: {}", s.ok, s.failed.join(", "))),
                        Err(e) => (false, format!("No se pudo subir: {}", e)),
                    });
                    self.usage_t = None;
                }
                Msg::Check(r) => { self.checking = false; self.check = Some(r.map_err(|e| e.to_string())); }
                Msg::UpdLog(l) => self.upd_log.push(l),
                Msg::UpdDone(r) => { self.installing = false; match r { Ok(()) => { self.installed_ok = true; self.upd_log.push("Listo. Reinicia SynapseBox para usar la versión nueva.".into()); } Err(e) => self.upd_log.push(format!("Error: {}", e)) } }
                Msg::Sessions(r) => match r { Ok(v) => self.sessions = v, Err(e) => self.acc_msg = Some((false, e.to_string())) },
                Msg::Info(ok, t) => self.acc_msg = Some((ok, t)),
                Msg::SyncDone => { self.syncing_now = false; self.status = Status::load(); }
                Msg::Service(on) => { self.svc_installed = cli::service_installed(); if on && !self.svc_installed { self.sync_msg = "No se pudo crear la tarea programada".into(); } }
            }
        }
    }

    // ---------- Inicio de sesión ----------
    fn login_ui(&mut self, ui: &mut egui::Ui, ctx: &egui::Context) {
        ui.vertical_centered(|ui| {
            ui.add_space(30.0);
            if let Some(t) = &self.logo { ui.add(egui::Image::new(t).fit_to_exact_size(egui::vec2(72.0, 72.0))); }
            ui.heading("SynapseBox");
            ui.label(if self.registering { "Crear una cuenta" } else { "Inicia sesión en tu servidor" });
            ui.add_space(14.0);
            ui.set_max_width(420.0);
            let w = 380.0;
            ui.add(egui::TextEdit::singleline(&mut self.srv).hint_text("Servidor (https://nube.ejemplo.com, 192.168.1.20:3001…)").desired_width(w));
            ui.add(egui::TextEdit::singleline(&mut self.user).hint_text("Usuario").desired_width(w));
            let r = ui.add(egui::TextEdit::singleline(&mut self.pass).password(true).hint_text("Contraseña").desired_width(w));
            let mut enter = r.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
            if self.registering { ui.add(egui::TextEdit::singleline(&mut self.pass2).password(true).hint_text("Repite la contraseña").desired_width(w)); }
            if self.ticket.is_some() {
                let r = ui.add(egui::TextEdit::singleline(&mut self.code).hint_text("Código de verificación (2FA)").desired_width(w));
                if r.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) { enter = true; }
            }
            ui.add_space(8.0);
            let label = if self.registering { "Crear cuenta" } else if self.ticket.is_some() { "Verificar" } else { "Entrar" };
            if (ui.add_enabled(!self.busy, egui::Button::new(label).min_size(egui::vec2(w, 32.0))).clicked() || enter) && !self.busy { self.submit_login(ctx); }
            if !self.login_msg.is_empty() { ui.add_space(6.0); ui.label(RichText::new(&self.login_msg).color(AMBER)); }
            ui.add_space(8.0);
            if ui.link(if self.registering { "Ya tengo cuenta" } else { "Crear una cuenta" }).clicked() { self.registering = !self.registering; self.ticket = None; self.login_msg.clear(); }
        });
    }
    fn submit_login(&mut self, ctx: &egui::Context) {
        let Some(srv) = api::normalize(&self.srv) else { self.login_msg = "La dirección del servidor no es válida".into(); return };
        let (u, p, p2, tk, cd, reg) = (self.user.trim().to_string(), self.pass.clone(), self.pass2.clone(), self.ticket.clone(), self.code.trim().to_string(), self.registering);
        if tk.is_none() && (u.is_empty() || p.is_empty()) { self.login_msg = "Escribe usuario y contraseña".into(); return }
        if reg && p != p2 { self.login_msg = "Las contraseñas no coinciden".into(); return }
        self.busy = true; self.login_msg.clear();
        let (s2, u2) = (srv.clone(), u.clone());
        self.spawn(ctx, move || {
            if api::probe(&srv).is_none() { return Err(Fail::Io("No se encontró SynapseBox en esa dirección".into())) }
            let a = Api::new(&srv, "");
            if reg { a.register(&u, &p, &p2) } else if let Some(t) = tk { a.login2fa(&t, &cd) } else { a.login(&u, &p) }
        }, move |r| Msg::Login(r, s2, u2));
    }
    fn codes_ui(&mut self, ui: &mut egui::Ui) {
        ui.vertical_centered(|ui| {
            ui.add_space(30.0); ui.heading("Códigos de recuperación");
            ui.label("Guárdalos en un lugar seguro: sirven si pierdes tu app de autenticación y no se vuelven a mostrar.");
            ui.add_space(10.0);
            for c in &self.codes { ui.label(RichText::new(c).monospace().size(18.0)); }
            ui.add_space(12.0);
            if ui.button("Copiar").clicked() { ui.ctx().copy_text(self.codes.join("\n")); }
            if ui.button("Ya los guardé").clicked() { self.codes.clear(); }
        });
    }

    // ---------- Inicio ----------
    fn home_ui(&mut self, ui: &mut egui::Ui, ctx: &egui::Context) {
        ui.heading("Inicio"); ui.add_space(8.0);
        if self.usage_t.map_or(true, |t| t.elapsed() > Duration::from_secs(60)) {
            self.usage_t = Some(Instant::now());
            let a = self.api(); self.spawn(ctx, move || a.usage().ok(), Msg::Usage);
        }
        let usage = self.usage;
        let (server, user) = (self.cfg.server.clone(), self.cfg.username.clone());
        card(ui, "Tu espacio", |ui| {
            match usage {
                Some((u, m)) if m > 0 => { let total = m * 1024 * 1024; ui.label(format!("{} de {}", fmt_bytes(u), fmt_bytes(total))); ui.add(egui::ProgressBar::new((u as f32 / total as f32).clamp(0.0, 1.0))); }
                Some((u, _)) => { ui.label(format!("{} usados (sin límite)", fmt_bytes(u))); }
                None => { ui.weak("Consultando…"); }
            }
            ui.add_space(6.0);
            ui.horizontal(|ui| {
                if ui.button("Abrir el panel web").clicked() { open(&format!("{}/panel.html", server)); }
                ui.weak(format!("{} · {}", user, server));
            });
        });
        card(ui, "Subir archivos", |ui| {
            ui.weak(format!("Van a la carpeta «{}» del servidor y nunca pisan archivos con el mismo nombre.", ops::UPLOAD_DIR));
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                if ui.add_enabled(!self.uploading, egui::Button::new("Subir archivos…")).clicked() {
                    if let Some(files) = rfd::FileDialog::new().set_title("Elegir archivos para subir").pick_files() { self.start_upload(ctx, files); }
                }
                if ui.add_enabled(!self.uploading, egui::Button::new("Subir carpeta…")).clicked() {
                    if let Some(d) = rfd::FileDialog::new().set_title("Elegir carpeta para subir").pick_folder() { self.start_upload(ctx, vec![d]); }
                }
            });
            if self.uploading { ui.add_space(4.0); ui.horizontal(|ui| { ui.spinner(); ui.label("Subiendo…"); }); }
            if let Some((ok, t)) = &self.upl { ui.add_space(4.0); note(ui, if *ok { "ok" } else { "err" }, t); }
        });
        let c = self.cfg.clone(); let st = self.status.clone();
        card(ui, "Sincronización", |ui| {
            if c.sync_enabled { note(ui, "on", &format!("Activa · {}", label_of(&MODES, &c.mode))); } else { note(ui, "off", "Desactivada"); }
            ui.label(if st.running { if st.total > 0 { format!("{} ({}/{})", st.current, st.done, st.total) } else { st.current.clone() } }
                else if st.text.is_empty() { "Aún no se ha sincronizado.".to_string() } else { format!("{} — {}", st.text, ago(st.last_sync)) });
            if st.running && st.total > 0 { ui.add(egui::ProgressBar::new((st.done as f32 / st.total as f32).clamp(0.0, 1.0))); }
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                if ui.add_enabled(!st.running && !self.syncing_now, egui::Button::new("Sincronizar ahora")).clicked() { self.sync_now(ctx); }
                if ui.button("Ajustes de sincronización").clicked() { self.page = Page::Sync; }
            });
        });
    }
    fn start_upload(&mut self, ctx: &egui::Context, files: Vec<std::path::PathBuf>) {
        self.uploading = true; self.upl = None;
        let a = self.api();
        self.spawn(ctx, move || ops::upload_paths(&a, &files, ops::UPLOAD_DIR, false, &mut |_| {}), Msg::Upload);
    }
    fn sync_now(&mut self, ctx: &egui::Context) {
        if !self.cfg.logged() || self.cfg.local_path.trim().is_empty() { self.sync_msg = "Elige primero la carpeta a sincronizar".into(); return }
        self.syncing_now = true;
        self.spawn(ctx, || { runner::sync_once(&AtomicBool::new(false)); }, |_| Msg::SyncDone);
    }

    // ---------- Sincronización ----------
    fn sync_ui(&mut self, ui: &mut egui::Ui, ctx: &egui::Context) {
        ui.heading("Sincronización"); ui.add_space(8.0);
        let c = self.cfg.clone();
        card(ui, "Carpetas", |ui| {
            ui.label("Carpeta de este PC");
            ui.horizontal(|ui| {
                let r = ui.add(egui::TextEdit::singleline(&mut self.local_buf).desired_width(ui.available_width() - 110.0).hint_text(r"C:\Users\tú\SynapseBox"));
                let mut path = None;
                if ui.button("Elegir…").clicked() { path = rfd::FileDialog::new().set_title("Carpeta a sincronizar").pick_folder().map(|p| config::plain_path(&p)); }
                if r.lost_focus() { path = Some(self.local_buf.trim().to_string()); }
                if let Some(p) = path {
                    if p.is_empty() || std::path::Path::new(&p).is_dir() { self.local_buf = p.clone(); edit(|x| { x.local_path = p; if x.local_path.is_empty() { x.sync_enabled = false; } }); self.reload(); self.sync_msg.clear(); }
                    else { self.sync_msg = "Esa carpeta no existe".into(); }
                }
            });
            ui.add_space(4.0); ui.label("Carpeta en SynapseBox (vacío = todo tu espacio)");
            let r = ui.add(egui::TextEdit::singleline(&mut self.remote_buf).desired_width(f32::INFINITY).hint_text("Documentos/Nube"));
            if r.lost_focus() { let v = ops::clean(&self.remote_buf); self.remote_buf = v.clone(); edit(|x| x.remote_path = v); self.reload(); }
            if !self.sync_msg.is_empty() { note(ui, "warn", &self.sync_msg.clone()); }
        });
        card(ui, "Qué sincronizar", |ui| {
            let (mut mode, mut strat) = (c.mode.clone(), c.strategy.clone());
            ui.horizontal(|ui| { ui.label("Dirección:"); egui::ComboBox::from_id_salt("mode").selected_text(label_of(&MODES, &mode)).show_ui(ui, |ui| { for (k, l) in MODES { ui.selectable_value(&mut mode, k.to_string(), l); } }); });
            ui.horizontal(|ui| { ui.label("Estrategia:"); egui::ComboBox::from_id_salt("strat").selected_text(label_of(&STRATS, &strat)).show_ui(ui, |ui| { for (k, l) in STRATS { ui.selectable_value(&mut strat, k.to_string(), l); } }); });
            if mode != c.mode { edit(|x| x.mode = mode); self.reload(); }
            if strat != c.strategy { edit(|x| x.strategy = strat); self.reload(); }
            let (mut n, mut m, mut d, mut dr) = (c.opt_new, c.opt_mod, c.opt_del, c.opt_dirs);
            ui.separator();
            ui.checkbox(&mut n, "Archivos nuevos"); ui.checkbox(&mut m, "Archivos modificados"); ui.checkbox(&mut d, "Archivos borrados"); ui.checkbox(&mut dr, "Carpetas (crear y borrar)");
            if (n, m, d, dr) != (c.opt_new, c.opt_mod, c.opt_del, c.opt_dirs) { edit(|x| { x.opt_new = n; x.opt_mod = m; x.opt_del = d; x.opt_dirs = dr; }); self.reload(); }
            ui.weak("La copia inicial nunca borra. Lo que la sincronización borre en el PC se guarda 30 días en la carpeta oculta «.sync-trash».");
        });
        card(ui, "Cuándo", |ui| {
            let mut en = c.sync_enabled; let mut iv = c.interval_min;
            if ui.checkbox(&mut en, "Sincronizar automáticamente").changed() {
                if en && c.local_path.trim().is_empty() { self.sync_msg = "Elige primero la carpeta del PC".into(); } else { edit(|x| x.sync_enabled = en); self.reload(); }
            }
            ui.horizontal(|ui| { ui.label("Frecuencia:"); egui::ComboBox::from_id_salt("iv").selected_text(interval_label(iv)).show_ui(ui, |ui| { for m in INTERVALS { ui.selectable_value(&mut iv, m, interval_label(m)); } }); });
            if iv != c.interval_min { edit(|x| x.interval_min = iv); self.reload(); }
            ui.add_space(6.0);
            ui.horizontal(|ui| {
                let st = self.status.running;
                if ui.add_enabled(!st && !self.syncing_now, egui::Button::new("Sincronizar ahora")).clicked() { self.sync_now(ctx); }
                if ui.button("Reiniciar (repetir la copia inicial)").clicked() {
                    config::reset_state(); edit(|x| x.initial_key.clear()); let mut s = Status::load(); s.text = "Reiniciada: la próxima sincronización hará la copia inicial".into(); s.save_final(); self.status = Status::load(); self.reload();
                }
            });
        });
        card(ui, "Segundo plano", |ui| {
            ui.weak("Con la ventana abierta sincroniza sola. Para que siga con la ventana cerrada, activa el servicio (una tarea programada de tu usuario que se inicia con Windows).");
            ui.horizontal(|ui| {
                if self.svc_installed { note(ui, "ok", if config::service_alive() { "Servicio instalado · en marcha" } else { "Servicio instalado" }); } else { note(ui, "off", "Servicio no instalado"); }
            });
            ui.horizontal(|ui| {
                if ui.button("Activar servicio").clicked() { self.spawn(ctx, || cli::service_set(true), Msg::Service); }
                if ui.button("Desactivar servicio").clicked() { self.spawn(ctx, || cli::service_set(false), |_| Msg::Service(false)); }
            });
        });
        let st = self.status.clone();
        card(ui, "Estado", |ui| {
            if st.running { ui.label(if st.total > 0 { format!("{} ({}/{})", st.current, st.done, st.total) } else { st.current.clone() }); if st.total > 0 { ui.add(egui::ProgressBar::new((st.done as f32 / st.total as f32).clamp(0.0, 1.0))); } }
            else if st.text.is_empty() { ui.weak("Aún no se ha sincronizado."); } else { ui.label(format!("{} — {}", st.text, ago(st.last_sync))); }
            if c.initial_done() { ui.weak("Copia inicial: hecha"); }
            if !c.local_path.is_empty() && ui.button("Abrir la carpeta sincronizada").clicked() { open(&c.local_path); }
        });
    }

    // ---------- Actualizaciones ----------
    fn updates_ui(&mut self, ui: &mut egui::Ui, ctx: &egui::Context) {
        ui.heading("Actualizaciones"); ui.add_space(8.0);
        card(ui, "Versión instalada", |ui| {
            ui.label(format!("SynapseBox para Windows {}", config::VERSION));
            let mut auto = self.cfg.update_auto;
            if ui.checkbox(&mut auto, "Avisarme cuando haya una versión nueva").changed() { edit(|x| x.update_auto = auto); self.reload(); }
            ui.add_space(4.0);
            if ui.add_enabled(!self.checking && !self.installing, egui::Button::new("Buscar actualizaciones")).clicked() { self.start_check(ctx); }
            if self.checking { ui.horizontal(|ui| { ui.spinner(); ui.label("Buscando…"); }); }
            let chk: Option<Result<(String, String, bool), String>> = self.check.as_ref().map(|r| r.as_ref().map(|c| (c.release.version.clone(), c.installed.clone(), c.newer)).map_err(|e| e.clone()));
            match chk {
                Some(Ok((v, inst, true))) => {
                    note(ui, "warn", &format!("Hay una versión nueva: {} (tienes la {})", v, inst));
                    if !self.installed_ok && ui.add_enabled(!self.installing, egui::Button::new("Descargar e instalar")).clicked() { self.start_install(ctx); }
                }
                Some(Ok((_, inst, false))) => note(ui, "ok", &format!("Tienes la última versión ({})", inst)),
                Some(Err(e)) => note(ui, "err", &e),
                None => {}
            }
            if self.installed_ok && ui.button("Reiniciar ahora").clicked() {
                if let Ok(exe) = std::env::current_exe() { let _ = Command::new(exe).spawn(); }
                self.stop.store(true, Ordering::Relaxed); std::process::exit(0);
            }
        });
        if !self.upd_log.is_empty() { card(ui, "Registro", |ui| { for l in &self.upd_log { ui.label(RichText::new(l).monospace().size(12.0)); } }); }
        ui.weak(format!("Origen: {}", update::FOLDER_PAGE));
    }
    fn start_check(&mut self, ctx: &egui::Context) { self.checking = true; self.check = None; self.spawn(ctx, update::check, Msg::Check); }
    fn start_install(&mut self, ctx: &egui::Context) {
        let Some(Ok(c)) = &self.check else { return };
        let rel = c.release.clone(); self.installing = true; self.upd_log.clear();
        let (tx, cx) = (self.tx.clone(), ctx.clone());
        std::thread::spawn(move || {
            let (tx2, cx2) = (tx.clone(), cx.clone());
            let r = update::install(&rel, &mut |l| { let _ = tx2.send(Msg::UpdLog(l.to_string())); cx2.request_repaint(); });
            let _ = tx.send(Msg::UpdDone(r)); cx.request_repaint();
        });
    }

    // ---------- Cuenta ----------
    fn account_ui(&mut self, ui: &mut egui::Ui, ctx: &egui::Context) {
        ui.heading("Cuenta"); ui.add_space(8.0);
        let c = self.cfg.clone();
        card(ui, "Sesión", |ui| {
            ui.label(format!("Usuario: {}", c.username)); ui.label(format!("Servidor: {}", c.server));
            ui.horizontal(|ui| {
                if ui.button("Abrir el panel web").clicked() { open(&format!("{}/panel.html", c.server)); }
                if ui.button("Cerrar sesión").clicked() { self.logout(false); }
                if ui.button("Cambiar de servidor").clicked() { self.logout(true); }
            });
        });
        card(ui, "Sesiones abiertas", |ui| {
            if ui.button("Ver sesiones de mi cuenta").clicked() { let a = self.api(); self.spawn(ctx, move || a.sessions(), Msg::Sessions); }
            let mut revoke: Option<String> = None; let mut others = false;
            for (id, cur, _, ip, ua) in &self.sessions {
                ui.horizontal_wrapped(|ui| {
                    if *cur { icon(ui, "dot-on", Some(GREEN)); } else { icon(ui, "dot-off", None); }
                    ui.label(format!("{} · {}", ip, ua.chars().take(60).collect::<String>()));
                    if *cur { ui.weak("(esta)"); } else if ui.small_button("Cerrar").clicked() { revoke = Some(id.clone()); }
                });
            }
            if self.sessions.len() > 1 && ui.button("Cerrar todas las demás").clicked() { others = true; }
            if let Some(id) = revoke { let a = self.api(); self.sessions.retain(|s| s.0 != id); self.spawn(ctx, move || a.revoke_session(&id), |r| match r { Ok(()) => Msg::Info(true, "Sesión cerrada".into()), Err(e) => Msg::Info(false, e.to_string()) }); }
            if others { let a = self.api(); self.sessions.retain(|s| s.1); self.spawn(ctx, move || a.revoke_others(), |r| match r { Ok(()) => Msg::Info(true, "Las demás sesiones se cerraron".into()), Err(e) => Msg::Info(false, e.to_string()) }); }
        });
        card(ui, "Cambiar contraseña", |ui| {
            ui.add(egui::TextEdit::singleline(&mut self.pw_cur).password(true).hint_text("Contraseña actual"));
            ui.add(egui::TextEdit::singleline(&mut self.pw_new).password(true).hint_text("Nueva contraseña"));
            ui.add(egui::TextEdit::singleline(&mut self.pw_new2).password(true).hint_text("Repite la nueva"));
            if ui.button("Cambiar contraseña").clicked() {
                if self.pw_new != self.pw_new2 { self.acc_msg = Some((false, "Las contraseñas nuevas no coinciden".into())); }
                else { let (a, cur, n, n2) = (self.api(), self.pw_cur.clone(), self.pw_new.clone(), self.pw_new2.clone()); self.pw_cur.clear(); self.pw_new.clear(); self.pw_new2.clear();
                    self.spawn(ctx, move || a.change_password(&cur, &n, &n2), |r| match r { Ok(()) => Msg::Info(true, "Contraseña cambiada; las demás sesiones se cerraron".into()), Err(e) => Msg::Info(false, e.to_string()) }); }
            }
        });
        if let Some((ok, t)) = &self.acc_msg { note(ui, if *ok { "ok" } else { "err" }, t); }
    }
    fn logout(&mut self, clear_server: bool) {
        let a = self.api(); std::thread::spawn(move || { let _ = a.logout(); });
        edit(|c| { c.clear_session(); c.sync_enabled = false; if clear_server { c.server.clear(); } });
        self.reload(); self.srv = self.cfg.server.clone(); self.ticket = None; self.sessions.clear(); self.acc_msg = None; self.usage = None; self.usage_t = None;
    }
}

impl eframe::App for Gui {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.pump();
        if self.logo.is_none() { if let Some(i) = load_icon() { self.logo = Some(ctx.load_texture("logo", egui::ColorImage::from_rgba_unmultiplied([i.width as usize, i.height as usize], &i.rgba), egui::TextureOptions::LINEAR)); } }
        if self.cfg_t.elapsed() > Duration::from_secs(2) { self.reload(); }
        if self.status_t.elapsed() > Duration::from_millis(700) { self.status = Status::load(); self.status_t = Instant::now(); }
        ctx.request_repaint_after(Duration::from_millis(700));
        // al arrancar con sesión: comprobar actualizaciones una vez al día
        if self.cfg.logged() && self.cfg.update_auto && config::now_ms() - self.cfg.update_checked > 86_400_000 && !self.checking && self.check.is_none() {
            edit(|c| c.update_checked = config::now_ms()); self.start_check(ctx);
        }
        if !self.cfg.logged() {
            egui::CentralPanel::default().show(ctx, |ui| { if self.codes.is_empty() { self.login_ui(ui, ctx); } else { self.codes_ui(ui); } });
            return;
        }
        if !self.codes.is_empty() { egui::CentralPanel::default().show(ctx, |ui| self.codes_ui(ui)); return; }
        egui::SidePanel::left("nav").exact_width(190.0).show(ctx, |ui| {
            ui.add_space(12.0);
            ui.horizontal(|ui| { if let Some(t) = &self.logo { ui.add(egui::Image::new(t).fit_to_exact_size(egui::vec2(28.0, 28.0))); } ui.label(RichText::new("SynapseBox").strong().size(18.0)); });
            ui.add_space(14.0);
            for (p, ic, t) in [(Page::Home, "home", "Inicio"), (Page::Sync, "sync", "Sincronización"), (Page::Updates, "update", "Actualizaciones"), (Page::Account, "account", "Cuenta")] {
                ui.horizontal(|ui| {
                    icon(ui, ic, None);
                    if ui.selectable_label(self.page == p, t).clicked() { self.page = p; if p == Page::Sync { self.svc_installed = cli::service_installed(); } }
                });
                ui.add_space(2.0);
            }
        });
        egui::CentralPanel::default().show(ctx, |ui| {
            egui::ScrollArea::vertical().show(ui, |ui| match self.page {
                Page::Home => self.home_ui(ui, ctx),
                Page::Sync => self.sync_ui(ui, ctx),
                Page::Updates => self.updates_ui(ui, ctx),
                Page::Account => self.account_ui(ui, ctx),
            });
        });
    }
    fn on_exit(&mut self, _gl: Option<&eframe::glow::Context>) { self.stop.store(true, Ordering::Relaxed); }
}
