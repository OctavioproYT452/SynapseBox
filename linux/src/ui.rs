//! Interfaz de escritorio (GTK4): barra lateral con Inicio, Sincronización, Actualizaciones y Cuenta.
use crate::api::{self, Api};
use crate::config::{self, Config, Status, VERSION};
use crate::{runner, update};
use gtk4 as gtk;
use gtk::glib;
use gtk::gio::prelude::FileExt;
use gtk::prelude::*;
use std::cell::{Cell, RefCell};
use std::process::Command;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

static CANCEL: AtomicBool = AtomicBool::new(false);
static STOP: AtomicBool = AtomicBool::new(false);

const CSS: &str = "
.hero { background-image: linear-gradient(135deg, #6d7cff, #3f4dd1); padding: 22px 28px; border-radius: 0 0 22px 22px; }
.hero .h1 { font-size: 26px; font-weight: 800; color: white; }
.hero .sub { color: rgba(255,255,255,0.85); }
.card { background-color: alpha(@theme_fg_color, 0.05); border: 1px solid alpha(@theme_fg_color, 0.12); border-radius: 16px; padding: 16px 18px; }
.card-title { font-weight: 700; font-size: 15px; }
.sidebar { background-color: alpha(@theme_fg_color, 0.04); padding: 14px 10px; min-width: 190px; }
.brand { font-weight: 800; font-size: 17px; padding: 4px 10px 14px 10px; }
.nav { border-radius: 10px; padding: 9px 12px; }
.nav.active { background-color: alpha(#6d7cff, 0.25); font-weight: 700; }
.dim { opacity: 0.65; }
.err { color: #d93025; }
.pill { border-radius: 20px; padding: 4px 12px; font-size: 13px; }
.pill-ok { background-color: #d7f5dc; color: #1b5e20; }
.pill-off { background-color: #ffe8c7; color: #8a4b00; }
.login-box { min-width: 380px; }
";

// ---------- ayudas ----------
fn lbl(t: &str) -> gtk::Label { gtk::Label::builder().label(t).xalign(0.0).wrap(true).halign(gtk::Align::Start).build() }
fn dim(t: &str) -> gtk::Label { let l = lbl(t); l.add_css_class("dim"); l }
fn btn(t: &str, style: &str) -> gtk::Button { let b = gtk::Button::with_label(t); if !style.is_empty() { b.add_css_class(style); } b }
fn vbox(spacing: i32) -> gtk::Box { gtk::Box::new(gtk::Orientation::Vertical, spacing) }
fn hbox(spacing: i32) -> gtk::Box { gtk::Box::new(gtk::Orientation::Horizontal, spacing) }
fn card(title: Option<&str>) -> gtk::Box {
    let b = vbox(10); b.add_css_class("card");
    if let Some(t) = title { let l = lbl(t); l.add_css_class("card-title"); b.append(&l); }
    b
}
fn hero(title: &str, sub: &str) -> (gtk::Box, gtk::Label, gtk::Label) {
    let b = vbox(2); b.add_css_class("hero");
    let t = lbl(title); t.add_css_class("h1"); let s = lbl(sub); s.add_css_class("sub");
    b.append(&t); b.append(&s); (b, t, s)
}
/// Título + explicación a la izquierda y un control a la derecha.
fn row(title: &str, sub: &str, w: &impl IsA<gtk::Widget>) -> gtk::Box {
    let r = hbox(12); let c = vbox(0); c.set_hexpand(true); c.append(&lbl(title)); if !sub.is_empty() { c.append(&dim(sub)); }
    w.set_valign(gtk::Align::Center); r.append(&c); r.append(w); r
}
fn page(h: &gtk::Box, body: &gtk::Box) -> gtk::Widget {
    body.set_margin_top(16); body.set_margin_bottom(24); body.set_margin_start(20); body.set_margin_end(20);
    let sw = gtk::ScrolledWindow::builder().child(body).vexpand(true).hscrollbar_policy(gtk::PolicyType::Never).build();
    let p = vbox(0); p.append(h); p.append(&sw); p.upcast()
}
fn edit(f: impl FnOnce(&mut Config)) { let mut c = Config::load(); f(&mut c); c.save(); } // sin copia en memoria: el servicio también modifica los ajustes
fn open(what: &str) { let _ = Command::new("xdg-open").arg(what).spawn(); }
fn fmt_bytes(b: i64) -> String {
    if b < 1024 { return format!("{} B", b) }
    let u = ["KB", "MB", "GB", "TB"]; let mut v = b as f64 / 1024.0; let mut i = 0;
    while v >= 1024.0 && i < u.len() - 1 { v /= 1024.0; i += 1; }
    format!("{:.1} {}", v, u[i])
}
fn when(ms: i64) -> String { if ms <= 0 { return "nunca".into() } let ago = (config::now_ms() - ms) / 1000; if ago < 60 { "hace unos segundos".into() } else if ago < 3600 { format!("hace {} min", ago / 60) } else if ago < 86400 { format!("hace {} h", ago / 3600) } else { format!("hace {} días", ago / 86400) } }

/// Ejecuta `work` en un hilo y entrega el resultado a `done` en el hilo de la interfaz.
fn bg<T: Send + 'static>(work: impl FnOnce() -> T + Send + 'static, done: impl FnOnce(T) + 'static) {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || { let _ = tx.send(work()); });
    let mut done = Some(done);
    glib::timeout_add_local(Duration::from_millis(100), move || match rx.try_recv() {
        Ok(v) => { if let Some(d) = done.take() { d(v); } glib::ControlFlow::Break }
        Err(std::sync::mpsc::TryRecvError::Empty) => glib::ControlFlow::Continue,
        Err(_) => glib::ControlFlow::Break,
    });
}

pub fn run() {
    let app = gtk::Application::builder().application_id("app.synapsebox.linux").build();
    app.connect_activate(build);
    app.connect_shutdown(|_| STOP.store(true, Ordering::Relaxed));
    app.run_with_args(&["synapsebox-linux"]);
}

fn build(app: &gtk::Application) {
    let prov = gtk::CssProvider::new(); prov.load_from_data(CSS);
    if let Some(d) = gtk::gdk::Display::default() { gtk::style_context_add_provider_for_display(&d, &prov, gtk::STYLE_PROVIDER_PRIORITY_APPLICATION); }
    let win = gtk::ApplicationWindow::builder().application(app).title("SynapseBox").default_width(1000).default_height(700).build();
    let root = gtk::Stack::new(); root.set_transition_type(gtk::StackTransitionType::Crossfade);
    win.set_child(Some(&root));

    let refreshers: Rc<RefCell<Vec<Box<dyn Fn()>>>> = Rc::new(RefCell::new(Vec::new()));
    let main_page = build_main(&win, &root, &refreshers);
    root.add_named(&main_page, Some("main"));
    let codes_lbl = lbl(""); codes_lbl.set_selectable(true);
    let login = build_login(&root, &codes_lbl);
    root.add_named(&login, Some("login"));
    root.add_named(&build_codes(&root, &codes_lbl), Some("codes"));
    root.set_visible_child_name(if Config::load().logged() { "main" } else { "login" });

    // refresco del estado cada segundo
    let r2 = refreshers.clone();
    glib::timeout_add_local(Duration::from_millis(1000), move || { for f in r2.borrow().iter() { f(); } glib::ControlFlow::Continue });
    for f in refreshers.borrow().iter() { f(); }

    // La interfaz también sincroniza mientras está abierta; para seguir con ella cerrada, activa el servicio en segundo plano (Sincronización)
    STOP.store(false, Ordering::Relaxed);
    std::thread::spawn(|| runner::daemon(&STOP));
    win.present();
}

// ---------- Inicio de sesión / registro ----------
fn build_codes(root: &gtk::Stack, codes: &gtk::Label) -> gtk::Widget {
    let (h, _, _) = hero("Guarda tus códigos de recuperación", "Sirven para recuperar la cuenta si olvidas la contraseña. Se muestran solo ahora.");
    let body = vbox(12); let c = card(None); c.append(codes);
    let copy = btn("Copiar", ""); let cc = codes.clone(); copy.connect_clicked(move |b| { b.display().clipboard().set_text(&cc.text()); });
    let go = btn("Los he guardado, continuar", "suggested-action"); let r = root.clone(); go.connect_clicked(move |_| r.set_visible_child_name("main"));
    c.append(&copy); c.append(&go); body.append(&c); page(&h, &body)
}

fn build_login(root: &gtk::Stack, codes_lbl: &gtk::Label) -> gtk::Widget {
    let cfg = Config::load();
    let (h, _, _) = hero("SynapseBox", "Tu nube, en tu escritorio");
    let body = vbox(12); body.set_halign(gtk::Align::Center);
    let c = card(Some("Iniciar sesión")); c.add_css_class("login-box"); body.append(&c);
    let title = c.first_child().and_downcast::<gtk::Label>();
    let server = gtk::Entry::builder().placeholder_text("Servidor (https://nube.ejemplo.com o 192.168.1.20:3001)").text(cfg.server.as_str()).build();
    let user = gtk::Entry::builder().placeholder_text("Usuario").text(cfg.username.as_str()).build();
    let pass = gtk::PasswordEntry::builder().placeholder_text("Contraseña").show_peek_icon(true).build();
    let pass2 = gtk::PasswordEntry::builder().placeholder_text("Repite la contraseña").show_peek_icon(true).visible(false).build();
    let code = gtk::Entry::builder().placeholder_text("Código de verificación (2FA)").visible(false).build();
    let msg = lbl(""); msg.add_css_class("err");
    let go = btn("Entrar", "suggested-action");
    let switch = btn("¿No tienes cuenta? Crear una", "flat"); switch.set_visible(false);
    let check = btn("Comprobar servidor", "flat");
    for w in [server.clone().upcast::<gtk::Widget>(), user.clone().upcast(), pass.clone().upcast(), pass2.clone().upcast(), code.clone().upcast(), msg.clone().upcast(), go.clone().upcast(), switch.clone().upcast(), check.clone().upcast()] { c.append(&w); }

    let registering = Rc::new(Cell::new(false)); let ticket: Rc<RefCell<Option<String>>> = Rc::new(RefCell::new(None));

    // ¿el servidor permite registrarse?
    let (sv, sw2, msg2) = (server.clone(), switch.clone(), msg.clone());
    let probe_server = Rc::new(move || {
        let Some(srv) = api::normalize(&sv.text()) else { msg2.set_text("La dirección del servidor no es válida"); return };
        msg2.set_text("Comprobando…"); let (sw3, m3) = (sw2.clone(), msg2.clone());
        bg(move || api::probe(&srv).map(|v| (v, Api::new(&srv, "").registration_open().unwrap_or(false))),
           move |r| match r { Some((v, reg)) => { m3.set_text(&format!("✓ SynapseBox v{} encontrado", v)); sw3.set_visible(reg); } None => { m3.set_text("No se encontró SynapseBox en esa dirección. Revisa la dirección y el puerto."); } });
    });
    { let p = probe_server.clone(); check.connect_clicked(move |_| p()); }
    if cfg.server.is_empty() == false { let p = probe_server.clone(); glib::idle_add_local_once(move || p()); }

    // alternar iniciar sesión / crear cuenta
    { let (reg, p2, g, s, t, cd, tk, m) = (registering.clone(), pass2.clone(), go.clone(), switch.clone(), title.clone(), code.clone(), ticket.clone(), msg.clone());
      switch.connect_clicked(move |_| {
        let on = !reg.get(); reg.set(on); *tk.borrow_mut() = None; cd.set_visible(false); m.set_text("");
        p2.set_visible(on); g.set_label(if on { "Crear cuenta" } else { "Entrar" }); s.set_label(if on { "¿Ya tienes cuenta? Iniciar sesión" } else { "¿No tienes cuenta? Crear una" });
        if let Some(t) = &t { t.set_label(if on { "Crear cuenta" } else { "Iniciar sesión" }); }
      }); }

    // enviar
    let submit = {
        let (server, user, pass, pass2, code, msg, go, reg, ticket, root, codes_lbl) = (server.clone(), user.clone(), pass.clone(), pass2.clone(), code.clone(), msg.clone(), go.clone(), registering.clone(), ticket.clone(), root.clone(), codes_lbl.clone());
        Rc::new(move || {
            let Some(srv) = api::normalize(&server.text()) else { msg.set_text("La dirección del servidor no es válida"); return };
            let (u, p, p2, tk) = (user.text().trim().to_string(), pass.text().to_string(), pass2.text().to_string(), ticket.borrow().clone());
            if tk.is_none() && (u.is_empty() || p.is_empty()) { msg.set_text("Escribe usuario y contraseña"); return }
            if reg.get() && p != p2 { msg.set_text("Las contraseñas no coinciden"); return }
            let cd = code.text().trim().to_string(); let registering_now = reg.get();
            msg.set_text(""); go.set_sensitive(false);
            let (msg, go, code, ticket, root, codes_lbl, pass) = (msg.clone(), go.clone(), code.clone(), ticket.clone(), root.clone(), codes_lbl.clone(), pass.clone());
            let (srv2, u2) = (srv.clone(), u.clone());
            bg(move || {
                    if api::probe(&srv).is_none() { return Err(api::Fail::Io("No se encontró SynapseBox en esa dirección".into())) }
                    let a = Api::new(&srv, "");
                    if registering_now { a.register(&u, &p, &p2) } else if let Some(t) = tk { a.login2fa(&t, &cd) } else { a.login(&u, &p) }
                },
                move |res| {
                    go.set_sensitive(true);
                    match res {
                        Err(api::Fail::Api(401, m)) if ticket.borrow().is_some() && m.contains("caduc") => { *ticket.borrow_mut() = None; code.set_visible(false); msg.set_text(&m); }
                        Err(e) => msg.set_text(&e.to_string()),
                        Ok(r) if r.need2fa && r.ticket.is_some() => { *ticket.borrow_mut() = r.ticket; code.set_visible(true); code.grab_focus(); msg.set_text("Introduce el código de tu app de autenticación (o un código de recuperación)"); }
                        Ok(r) => match r.token {
                            Some(t) => {
                                let exp = if r.expires_at > 0 { r.expires_at } else { config::now_ms() + 7 * 86_400_000 };
                                edit(|c| { c.server = srv2; c.username = u2; c.token = t; c.expires_at = exp; });
                                pass.set_text(""); *ticket.borrow_mut() = None; code.set_visible(false);
                                if r.codes.is_empty() { root.set_visible_child_name("main"); } else { codes_lbl.set_text(&r.codes.join("\n")); root.set_visible_child_name("codes"); }
                            }
                            None => msg.set_text("Respuesta inesperada del servidor. ¿Es la dirección correcta y tiene la versión 2.23 o superior?"),
                        },
                    }
                });
        })
    };
    { let s = submit.clone(); go.connect_clicked(move |_| s()); }
    for e in [&server, &user, &code] { let s = submit.clone(); e.connect_activate(move |_| s()); }
    { let s = submit.clone(); pass.connect_activate(move |_| s()); }
    { let s = submit.clone(); pass2.connect_activate(move |_| s()); }
    page(&h, &body)
}

// ---------- Pantalla principal ----------
fn build_main(win: &gtk::ApplicationWindow, root: &gtk::Stack, refreshers: &Rc<RefCell<Vec<Box<dyn Fn()>>>>) -> gtk::Widget {
    let inner = gtk::Stack::new(); inner.set_hexpand(true); inner.set_transition_type(gtk::StackTransitionType::Crossfade);
    let side = vbox(4); side.add_css_class("sidebar");
    let brand = lbl("SynapseBox"); brand.add_css_class("brand"); side.append(&brand);
    let navs: Rc<RefCell<Vec<(String, gtk::Button)>>> = Rc::new(RefCell::new(Vec::new()));
    let pages: Vec<(&str, &str, gtk::Widget)> = vec![
        ("home", "🏠  Inicio", build_home(win, refreshers)),
        ("sync", "🔄  Sincronización", build_sync(win, refreshers)),
        ("updates", "⬆️  Actualizaciones", build_updates(refreshers)),
        ("account", "👤  Cuenta", build_account(root, refreshers)),
    ];
    for (name, title, w) in pages {
        inner.add_named(&w, Some(name));
        let b = btn(title, "flat"); b.add_css_class("nav"); if let Some(l) = b.child().and_downcast::<gtk::Label>() { l.set_xalign(0.0); }
        let (inner2, navs2, n) = (inner.clone(), navs.clone(), name.to_string());
        b.connect_clicked(move |_| { inner2.set_visible_child_name(&n); for (k, bt) in navs2.borrow().iter() { if *k == n { bt.add_css_class("active") } else { bt.remove_css_class("active") } } });
        side.append(&b); navs.borrow_mut().push((name.to_string(), b));
    }
    if let Some((_, b)) = navs.borrow().first() { b.add_css_class("active"); }
    let ver = dim(&format!("v{}", VERSION)); ver.set_vexpand(true); ver.set_valign(gtk::Align::End); ver.set_margin_start(10); side.append(&ver);
    let m = hbox(0); m.append(&side); m.append(&inner); m.upcast()
}

fn build_home(_win: &gtk::ApplicationWindow, refreshers: &Rc<RefCell<Vec<Box<dyn Fn()>>>>) -> gtk::Widget {
    let (h, title, sub) = hero("Hola", "");
    let body = vbox(0);
    let c1 = card(Some("Mi espacio")); c1.set_margin_bottom(12);
    let usage = lbl("Calculando…"); let bar = gtk::ProgressBar::new(); bar.set_visible(false);
    let open_web = btn("Abrir mis archivos en el navegador", ""); open_web.connect_clicked(|_| { let c = Config::load(); open(&format!("{}/panel.html", c.server)); });
    c1.append(&usage); c1.append(&bar); c1.append(&open_web); body.append(&c1);

    let c2 = card(Some("Sincronización de carpeta")); c2.set_margin_bottom(12);
    let pill = lbl(""); pill.add_css_class("pill"); pill.set_halign(gtk::Align::Start);
    let status = lbl(""); let prog = gtk::ProgressBar::new(); prog.set_show_text(false); prog.set_visible(false);
    let now = btn("Sincronizar ahora", "suggested-action"); let cancel = btn("Cancelar", "flat"); cancel.set_visible(false);
    let br = hbox(8); br.append(&now); br.append(&cancel);
    c2.append(&pill); c2.append(&status); c2.append(&prog); c2.append(&br); body.append(&c2);
    now.connect_clicked(|_| sync_now());
    cancel.connect_clicked(|_| CANCEL.store(true, Ordering::Relaxed));

    let c3 = card(Some("Servidor")); let srv = dim(""); c3.append(&srv); body.append(&c3);

    let tick = Rc::new(Cell::new(0u32));
    let last_usage = Rc::new(Cell::new(false));
    let f = move || {
        let c = Config::load(); let s = Status::load();
        title.set_label(&format!("Hola, {}", if c.username.is_empty() { "bienvenido" } else { c.username.as_str() })); sub.set_label(c.server.trim_start_matches("https://").trim_start_matches("http://"));
        pill.set_label(&if c.sync_enabled { format!("● Activa · {}", match c.mode.as_str() { "upload" => "solo subir", "download" => "solo bajar", _ => "bidireccional" }) } else { "○ Desactivada".into() });
        pill.remove_css_class("pill-ok"); pill.remove_css_class("pill-off"); pill.add_css_class(if c.sync_enabled { "pill-ok" } else { "pill-off" });
        let folder = if c.local_path.is_empty() { "Aún no has elegido una carpeta.".to_string() } else { c.local_path.clone() };
        if s.running { status.set_label(&format!("{}\nSincronizando: {}", folder, s.current)); prog.set_visible(true); if s.total > 0 { prog.set_fraction(s.done as f64 / s.total as f64); } else { prog.pulse(); } }
        else { status.set_label(&format!("{}\n{}\nÚltima vez: {}", folder, s.text, when(s.last_sync))); prog.set_visible(false); }
        now.set_sensitive(!s.running); cancel.set_visible(s.running);
        // espacio usado: al entrar y cada minuto
        let t = tick.get(); tick.set(t + 1);
        if c.logged() && (t % 60 == 0 || !last_usage.get()) {
            last_usage.set(true);
            let (srv_url, tok) = (c.server.clone(), c.token.clone()); let (usage, bar, srv) = (usage.clone(), bar.clone(), srv.clone());
            bg(move || { let a = Api::new(&srv_url, &tok); (a.usage(), a.server_info()) }, move |(u, info)| {
                match u {
                    Ok((used, max)) if max > 0 => { usage.set_label(&format!("{} de {}", fmt_bytes(used), fmt_bytes(max * 1024 * 1024))); bar.set_visible(true); bar.set_fraction((used as f64 / (max * 1024 * 1024) as f64).min(1.0)); }
                    Ok((used, _)) => { usage.set_label(&format!("{} usados (sin límite)", fmt_bytes(used))); bar.set_visible(false); }
                    Err(e) => usage.set_label(&format!("Sin datos: {}", e)),
                }
                srv.set_label(&if info.version.is_empty() { "Servidor antiguo (sin funciones avanzadas): actualiza SynapseBox a la 2.25 para subidas reanudables y más.".to_string() } else { format!("Servidor SynapseBox v{} · API {}{}", info.version, info.api, if info.features.len() >= 5 { " · funciones avanzadas de sincronización activas" } else { "" }) });
            });
        }
        if !c.logged() { last_usage.set(false); }
    };
    refreshers.borrow_mut().push(Box::new(f));
    page(&h, &body)
}

fn sync_now() {
    if Status::load().running { return }
    CANCEL.store(false, Ordering::Relaxed);
    std::thread::spawn(|| { runner::sync_once(&CANCEL); });
}

// ---------- Sincronización ----------
fn build_sync(win: &gtk::ApplicationWindow, refreshers: &Rc<RefCell<Vec<Box<dyn Fn()>>>>) -> gtk::Widget {
    let cfg = Config::load();
    let (h, _, _) = hero("Sincronización", "Tu carpeta del PC, igual que tu SynapseBox");
    let body = vbox(0);
    let keep: Rc<RefCell<Vec<gtk::FileChooserNative>>> = Rc::new(RefCell::new(Vec::new()));
    let guard = Rc::new(Cell::new(true)); // true mientras se construye o se corrige el interruptor a mano

    // Estado + interruptor
    let c0 = card(None); c0.set_margin_bottom(12);
    let enabled = gtk::Switch::new(); enabled.set_active(cfg.sync_enabled);
    c0.append(&row("Sincronizar automáticamente", "Se ejecuta con la app abierta; con el servicio en segundo plano, también cerrada", &enabled));
    let status = dim(""); c0.append(&status);
    let now = btn("Sincronizar ahora", "suggested-action"); now.connect_clicked(|_| { if Config::load().local_path.trim().is_empty() { return } edit(|c| c.sync_enabled = true); sync_now(); }); c0.append(&now);
    body.append(&c0);

    // Carpetas
    let c1 = card(Some("Carpetas")); c1.set_margin_bottom(12);
    let local = gtk::Entry::builder().placeholder_text("Carpeta del PC (ej.: /home/tu_usuario/SynapseBox)").text(cfg.local_path.as_str()).hexpand(true).build();
    let pick = btn("Elegir…", ""); let rl = hbox(8); rl.append(&local); rl.append(&pick); c1.append(&rl);
    let remote = gtk::Entry::builder().placeholder_text("Carpeta en SynapseBox (vacío = todo tu espacio)").text(cfg.remote_path.as_str()).build(); c1.append(&remote);
    local.connect_changed(|e| { let v = e.text().trim().trim_end_matches('/').to_string(); edit(|c| c.local_path = v); });
    remote.connect_changed(|e| { let v = e.text().trim().trim_matches('/').to_string(); edit(|c| c.remote_path = v); });
    { let (w, k, l) = (win.clone(), keep.clone(), local.clone());
      pick.connect_clicked(move |_| {
        #[allow(deprecated)]
        let d = gtk::FileChooserNative::new(Some("Elegir carpeta"), Some(&w), gtk::FileChooserAction::SelectFolder, Some("Elegir"), Some("Cancelar"));
        let l2 = l.clone();
        #[allow(deprecated)]
        d.connect_response(move |d, r| { if r == gtk::ResponseType::Accept { if let Some(p) = d.file().and_then(|f| f.path()) { l2.set_text(&p.to_string_lossy()); } } });
        #[allow(deprecated)]
        d.show();
        k.borrow_mut().push(d);
      }); }
    body.append(&c1);

    // Dirección
    let c2 = card(Some("Dirección")); c2.set_margin_bottom(12);
    let modes = ["two_way", "upload", "download"];
    let dd_mode = gtk::DropDown::from_strings(&["Bidireccional (recomendado)", "Solo subir (copia de seguridad del PC)", "Solo bajar (espejo del servidor)"]);
    dd_mode.set_selected(modes.iter().position(|m| *m == cfg.mode).unwrap_or(0) as u32);
    dd_mode.connect_selected_notify(move |d| { let m = modes[d.selected() as usize % 3].to_string(); edit(|c| c.mode = m); });
    c2.append(&dd_mode); body.append(&c2);

    // Qué sincronizar
    let c3 = card(Some("Qué sincronizar")); c3.set_margin_bottom(12);
    let strategies = ["full_then_changes", "initial_only", "changes_only"];
    let dd_str = gtk::DropDown::from_strings(&["Copiar todo lo actual y después sincronizar los cambios", "Solo copiar lo actual una vez y detenerse", "Solo los cambios a partir de ahora (ignora lo que ya existe)"]);
    dd_str.set_selected(strategies.iter().position(|m| *m == cfg.strategy).unwrap_or(0) as u32);
    dd_str.connect_selected_notify(move |d| { let m = strategies[d.selected() as usize % 3].to_string(); edit(|c| c.strategy = m); });
    c3.append(&dd_str);
    let t = lbl("Tipos de cambio a sincronizar"); t.add_css_class("card-title"); c3.append(&t);
    for (title, sub, on, set) in [
        ("Archivos nuevos", "Los que se creen o aparezcan después", cfg.opt_new, (|c: &mut Config, v: bool| c.opt_new = v) as fn(&mut Config, bool)),
        ("Archivos modificados", "Cuando cambie su contenido", cfg.opt_mod, |c: &mut Config, v: bool| c.opt_mod = v),
        ("Archivos borrados", "Lo que borres en un lado se borra en el otro (va a la papelera)", cfg.opt_del, |c: &mut Config, v: bool| c.opt_del = v),
        ("Carpetas", "Crear y borrar carpetas (también las vacías)", cfg.opt_dirs, |c: &mut Config, v: bool| c.opt_dirs = v),
    ] {
        let sw = gtk::Switch::new(); sw.set_active(on); sw.connect_active_notify(move |s| { let v = s.is_active(); edit(|c| set(c, v)); }); c3.append(&row(title, sub, &sw));
    }
    c3.append(&dim("La copia inicial nunca borra nada. Lo que la sincronización borre en el PC se guarda 30 días en la carpeta oculta «.sync-trash»."));
    let reset = btn("Reiniciar sincronización (repetir la copia inicial)", ""); reset.connect_clicked(|_| { config::reset_state(); edit(|c| c.initial_key.clear()); let mut s = Status::load(); s.text = "Reiniciada: la próxima sincronización hará la copia inicial".into(); s.save_final(); }); c3.append(&reset);
    body.append(&c3);

    // Cuándo
    let c4 = card(Some("Cuándo")); c4.set_margin_bottom(12);
    let ivs = [5u32, 15, 30, 60, 180, 360, 720, 1440];
    let dd_iv = gtk::DropDown::from_strings(&["Cada 5 minutos", "Cada 15 minutos", "Cada 30 minutos", "Cada hora", "Cada 3 horas", "Cada 6 horas", "Cada 12 horas", "Una vez al día"]);
    dd_iv.set_selected(ivs.iter().position(|m| *m == cfg.interval_min).unwrap_or(1) as u32);
    dd_iv.connect_selected_notify(move |d| { let m = ivs[d.selected() as usize % 8]; edit(|c| c.interval_min = m); });
    c4.append(&dd_iv); body.append(&c4);

    // Servicio en segundo plano
    let c5 = card(Some("Servicio en segundo plano")); c5.set_margin_bottom(12);
    c5.append(&dim("Un servicio de usuario (systemd) que sincroniza aunque cierres la ventana y se inicia con tu sesión."));
    let svc = lbl(""); let on = btn("Activar servicio", ""); let off = btn("Desactivar servicio", "flat");
    let br = hbox(8); br.append(&on); br.append(&off); c5.append(&svc); c5.append(&br);
    let systemctl = |args: &[&str]| -> bool { Command::new("systemctl").arg("--user").args(args).output().map(|o| o.status.success()).unwrap_or(false) };
    { let svc = svc.clone(); on.connect_clicked(move |_| { let ok = systemctl(&["enable", "--now", "synapsebox-sync.service"]); svc.set_label(if ok { "✅ Servicio activo" } else { "No se pudo activar. ¿Instalaste con install.sh (usuario)? Revisa: systemctl --user status synapsebox-sync" }); }); }
    { let svc = svc.clone(); off.connect_clicked(move |_| { systemctl(&["disable", "--now", "synapsebox-sync.service"]); svc.set_label("Servicio desactivado"); }); }
    body.append(&c5);
    let svc2 = svc.clone(); glib::idle_add_local_once(move || svc2.set_label(if Command::new("systemctl").args(["--user", "is-active", "--quiet", "synapsebox-sync.service"]).status().map(|s| s.success()).unwrap_or(false) { "✅ Servicio activo" } else { "Servicio desactivado" }));

    // interruptor principal (necesita carpeta)
    { let (g, l) = (guard.clone(), local.clone());
      enabled.connect_active_notify(move |s| {
        if g.get() { return }
        if s.is_active() && l.text().trim().is_empty() { g.set(true); s.set_active(false); g.set(false); return }
        let v = s.is_active(); edit(|c| c.sync_enabled = v);
      }); }
    guard.set(false);

    // el estado y el interruptor siguen a lo que haga el servicio (p. ej. «solo copia inicial» lo apaga al terminar)
    let (en2, g2) = (enabled.clone(), guard.clone());
    refreshers.borrow_mut().push(Box::new(move || {
        let c = Config::load(); let s = Status::load();
        if en2.is_active() != c.sync_enabled { g2.set(true); en2.set_active(c.sync_enabled); g2.set(false); }
        status.set_label(&if s.running { format!("Sincronizando: {}", s.current) } else { format!("{}\nÚltima vez: {}{}", s.text, when(s.last_sync), if c.initial_done() { "\n✓ Copia inicial hecha" } else if c.strategy == "changes_only" { "\nPrimera pasada: guardará la línea base sin copiar nada" } else { "\nCopia inicial pendiente" }) });
        now.set_sensitive(!s.running);
    }));
    page(&h, &body)
}

// ---------- Actualizaciones ----------
fn build_updates(refreshers: &Rc<RefCell<Vec<Box<dyn Fn()>>>>) -> gtk::Widget {
    let _ = refreshers;
    let (h, _, _) = hero("Actualizaciones", &format!("Versión instalada: v{}", VERSION));
    let body = vbox(0);
    let c = card(None); c.set_margin_bottom(12);
    let status = lbl("Pulsa «Buscar actualizaciones»."); let check = btn("Buscar actualizaciones", "suggested-action"); let install = btn("Descargar, compilar e instalar", ""); install.set_visible(false);
    c.append(&status); c.append(&check); c.append(&install);
    c.append(&dim("Cada actualización se descarga como código fuente y se compila en este equipo, optimizada para tu procesador. Necesita Rust (cargo) y las librerías de GTK 4 (las mismas de la instalación) y puede tardar unos minutos."));
    let tv = gtk::TextView::builder().editable(false).monospace(true).wrap_mode(gtk::WrapMode::WordChar).build();
    let sw = gtk::ScrolledWindow::builder().child(&tv).min_content_height(220).build(); sw.set_visible(false); c.append(&sw);
    body.append(&c);
    let c2 = card(None);
    let auto = gtk::Switch::new(); auto.set_active(Config::load().update_auto); auto.connect_active_notify(|s| { let v = s.is_active(); edit(|c| c.update_auto = v); });
    c2.append(&row("Avisarme de nuevas versiones", "Comprueba GitHub una vez al día y manda una notificación", &auto));
    let folder = btn("Ver la carpeta de paquetes en GitHub", "flat"); folder.connect_clicked(|_| open(update::FOLDER_PAGE)); c2.append(&folder);
    body.append(&c2);

    let found: Rc<RefCell<Option<update::Release>>> = Rc::new(RefCell::new(None));
    let do_check = {
        let (status, check, install, found) = (status.clone(), check.clone(), install.clone(), found.clone());
        Rc::new(move || {
            check.set_sensitive(false); install.set_visible(false); status.set_label("Buscando…");
            let (status, check, install, found) = (status.clone(), check.clone(), install.clone(), found.clone());
            bg(update::check, move |r| {
                match r {
                    Ok(c) if c.newer => { status.set_label(&format!("Hay una versión nueva: v{}  (tienes la v{}){}", c.release.version, c.installed, if c.release.size > 0 { format!("\nTamaño del paquete: {}", fmt_bytes(c.release.size as i64)) } else { String::new() })); *found.borrow_mut() = Some(c.release); install.set_visible(true); }
                    Ok(c) => status.set_label(&format!("✓ Tienes la última versión (v{}).", c.installed)),
                    Err(e) => status.set_label(&format!("No se pudo comprobar: {}", e)),
                }
                check.set_sensitive(true);
            });
        })
    };
    { let d = do_check.clone(); check.connect_clicked(move |_| d()); }
    { let d = do_check.clone(); glib::idle_add_local_once(move || d()); }

    { let (status, check, install2, found, tv, sw) = (status.clone(), check.clone(), install.clone(), found.clone(), tv.clone(), sw.clone());
      install.connect_clicked(move |_| {
        let Some(rel) = found.borrow().clone() else { return };
        install2.set_sensitive(false); check.set_sensitive(false); sw.set_visible(true); tv.buffer().set_text(""); status.set_label(&format!("Instalando v{}… no cierres la app hasta que termine.", rel.version));
        let log = Arc::new(Mutex::new(String::new())); let finished = Arc::new(AtomicBool::new(false));
        let (log2, fin2) = (log.clone(), finished.clone());
        let (tv2, fin3, log3) = (tv.clone(), finished.clone(), log.clone()); let shown = Cell::new(0usize);
        glib::timeout_add_local(Duration::from_millis(300), move || {
            let t = log3.lock().unwrap().clone();
            if t.len() > shown.get() { let b = tv2.buffer(); b.insert(&mut b.end_iter(), &t[shown.get()..]); shown.set(t.len()); let mark = b.create_mark(None, &b.end_iter(), false); tv2.scroll_mark_onscreen(&mark); }
            if fin3.load(Ordering::Relaxed) && t.len() == shown.get() { glib::ControlFlow::Break } else { glib::ControlFlow::Continue }
        });
        let (status, check, install2, ver) = (status.clone(), check.clone(), install2.clone(), rel.version.clone());
        bg(move || { let r = update::install(&rel, &mut |l| { let mut g = log2.lock().unwrap(); g.push_str(l); g.push('\n'); }); fin2.store(true, Ordering::Relaxed); r },
           move |r| { match r { Ok(()) => status.set_label(&format!("✅ Versión {} instalada. Cierra y vuelve a abrir SynapseBox para usarla.", ver)), Err(e) => status.set_label(&format!("Error: {}", e)) } install2.set_sensitive(true); check.set_sensitive(true); });
      }); }
    page(&h, &body)
}

// ---------- Cuenta ----------
fn build_account(root: &gtk::Stack, refreshers: &Rc<RefCell<Vec<Box<dyn Fn()>>>>) -> gtk::Widget {
    let (h, _, _) = hero("Cuenta", "");
    let body = vbox(0);
    let c = card(None); c.set_margin_bottom(12);
    let who = lbl(""); c.append(&who);
    let web = btn("Abrir el panel web", ""); web.connect_clicked(|_| open(&format!("{}/panel.html", Config::load().server))); c.append(&web);
    let folder = btn("Abrir la carpeta sincronizada", ""); folder.connect_clicked(|_| { let p = Config::load().local_path; if !p.is_empty() { open(&p); } }); c.append(&folder);
    body.append(&c);
    let c2 = card(Some("Sesión"));
    let out = btn("Cerrar sesión", ""); let change = btn("Cambiar de servidor", "flat");
    for (b, srv) in [(&out, false), (&change, true)] {
        let r = root.clone();
        b.connect_clicked(move |_| {
            let c = Config::load(); let (s, t) = (c.server.clone(), c.token.clone());
            bg(move || Api::new(&s, &t).logout(), move |_| {});
            edit(|c| { c.clear_session(); c.sync_enabled = false; if srv { c.server.clear(); } });
            r.set_visible_child_name("login");
        });
    }
    c2.append(&out); c2.append(&change); body.append(&c2);
    refreshers.borrow_mut().push(Box::new(move || { let c = Config::load(); who.set_label(&format!("Usuario: {}\nServidor: {}", c.username, c.server)); }));
    page(&h, &body)
}
