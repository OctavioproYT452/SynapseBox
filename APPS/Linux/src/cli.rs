//! Línea de órdenes `sbox`: todas las funciones de la app (sesión, ajustes, sincronización, archivos, cuenta, servicio y actualizaciones)
//! sin abrir la interfaz. Usa la misma configuración (~/.config/synapsebox) que la interfaz y el servicio, así que se pueden mezclar.
use crate::api::{self, Api, Fail, R};
use crate::config::{self, Config, Lock, Status, VERSION};
use crate::{ops, runner, serverinst, update};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, IsTerminal, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};

const HELP: &str = "sbox · SynapseBox para Linux

USO: sbox <orden> [opciones]        (sin interfaz; «sbox gui» abre la ventana)

CUENTA
  login [-s servidor] [-u usuario] [-p clave|--password-stdin] [--code 2FA]   inicia sesión
  register [-s servidor] [-u usuario]     crea una cuenta (si el servidor lo permite)
  logout                                  cierra la sesión
  server [url] [--force]                  muestra o cambia el servidor
  status | whoami                         sesión, servidor, uso y estado de la sincronización
  usage                                   espacio usado
  sessions [revoke ID | revoke-others]    sesiones abiertas de tu cuenta
  passwd                                  cambia tu contraseña

ARCHIVOS EN SYNAPSEBOX
  ls [ruta] [-l] [--json]                 lista una carpeta
  upload <archivos/carpetas…> [-d destino] [--overwrite]   sube (por defecto a «Subidas del PC», sin pisar nada)
  download <ruta> [-o destino]            baja un archivo o carpeta
  mkdir <ruta>…      rm <ruta>… [-y]      crea carpetas / borra (a la papelera del servidor)
  mv <origen> <destino>   cp <origen> <carpeta>     mueve, renombra o copia
  share <ruta> [--days N] [--password P]  crea un enlace público
  search <texto>                          busca por nombre
  trash [restore ID | empty [-y]]         papelera del servidor

ADMINISTRADORES (solo cuentas de administrador; leer, descargar y borrar; no crea ni modifica)
  admin users [--json]                    usuarios y espacio usado
  admin ls <usuario> [ruta] [-l]          lista los archivos de un usuario
  admin get <usuario> <ruta> [-o destino] descarga un archivo de un usuario
  admin rm <usuario> <ruta>… [-y]         borra a la papelera de ese usuario

EXPLORAR (servidor 2.26 o superior para type y empty-folders)
  recent [-l] [--json]                    archivos modificados hace poco
  type <images|video|audio|docs|archives> [-l] [--json]   tus archivos de un tipo
  empty-folders [--json]                  carpetas vacías

SERVIDOR EN ESTE EQUIPO
  install-server [-y] [--no-start]        instala SynapseBox (el servidor) aquí con el instalador oficial y lo arranca
                                          (después: sbox server http://localhost:3001)

SINCRONIZACIÓN DE CARPETA
  sync [now]                              sincroniza ahora y muestra el progreso
  sync status | on | off | reset          estado, activar/desactivar, repetir la copia inicial
  sync folder <ruta-local> [ruta-remota]  elige las carpetas
  config list | get <clave> | set <clave> <valor> | reset     ajustes (ver «sbox config list»)
  service on | off | status               servicio en segundo plano (systemd de usuario)
  daemon                                  bucle de sincronización en primer plano

APP
  update [check | install] [auto on|off]  busca / instala actualizaciones
  gui                                     abre la interfaz gráfica
  completion bash|zsh                     genera el autocompletado
  version | help
";

// ---------- utilidades ----------
fn die(msg: &str) -> ! { eprintln!("sbox: {}", msg); std::process::exit(1) }
fn ok<T>(r: R<T>) -> T { match r { Ok(v) => v, Err(Fail::Auth) => die("la sesión ha caducado o no es válida. Vuelve a entrar con: sbox login"), Err(e) => die(&e.to_string()) } }
fn session() -> (Config, Api) {
    let c = Config::load();
    if !c.logged() { die("no has iniciado sesión. Usa: sbox login") }
    let a = Api::new(&c.server, &c.token); (c, a)
}
fn fmt_bytes(b: i64) -> String {
    if b < 1024 { return format!("{} B", b) }
    let u = ["KB", "MB", "GB", "TB"]; let mut v = b as f64 / 1024.0; let mut i = 0;
    while v >= 1024.0 && i < u.len() - 1 { v /= 1024.0; i += 1; }
    format!("{:.1} {}", v, u[i])
}
fn when(ms: i64) -> String { if ms <= 0 { return "nunca".into() } let ago = (config::now_ms() - ms) / 1000; if ago < 60 { "hace unos segundos".into() } else if ago < 3600 { format!("hace {} min", ago / 60) } else if ago < 86400 { format!("hace {} h", ago / 3600) } else { format!("hace {} días", ago / 86400) } }
fn date(ms: i64) -> String { // yyyy-mm-dd HH:MM (UTC)
    let s = ms / 1000; let days = s.div_euclid(86400); let t = s.rem_euclid(86400);
    let z = days + 719468; let era = z.div_euclid(146097); let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1; let m = if mp < 10 { mp + 3 } else { mp - 9 };
    format!("{:04}-{:02}-{:02} {:02}:{:02}", if m <= 2 { y + 1 } else { y }, m, d, t / 3600, (t % 3600) / 60)
}
fn ask(prompt: &str) -> String {
    eprint!("{}", prompt); let _ = std::io::stderr().flush();
    let mut s = String::new(); let _ = std::io::stdin().lock().read_line(&mut s); s.trim().to_string()
}
fn ask_secret(prompt: &str) -> String {
    if !std::io::stdin().is_terminal() { return ask("") }
    eprint!("{}", prompt); let _ = std::io::stderr().flush();
    let _ = Command::new("stty").arg("-echo").stdin(Stdio::inherit()).status();
    let mut s = String::new(); let _ = std::io::stdin().lock().read_line(&mut s);
    let _ = Command::new("stty").arg("echo").stdin(Stdio::inherit()).status(); eprintln!();
    s.trim_end_matches(['\r', '\n']).to_string()
}
fn confirm(q: &str, yes: bool) -> bool {
    if yes { return true }
    if !std::io::stdin().is_terminal() { die("hace falta confirmar: añade -y para continuar sin preguntar") }
    matches!(ask(&format!("{} [s/N] ", q)).to_lowercase().as_str(), "s" | "si" | "sí" | "y" | "yes")
}
fn json_out(v: &serde_json::Value) { println!("{}", serde_json::to_string_pretty(v).unwrap_or_default()); }

/// Argumentos: posicionales, opciones con valor (`-d dir`, `--days=3`) y opciones sueltas (`-l`, `--force`).
struct Args { pos: Vec<String>, val: HashMap<String, String>, flag: HashSet<String> }
impl Args {
    fn parse(args: &[String], valued: &[&str], short: &[(&str, &str)]) -> Args {
        let mut a = Args { pos: vec![], val: HashMap::new(), flag: HashSet::new() };
        let mut i = 0; let mut only_pos = false;
        while i < args.len() {
            let t = &args[i]; i += 1;
            if only_pos || t == "-" || !t.starts_with('-') { a.pos.push(t.clone()); continue }
            if t == "--" { only_pos = true; continue }
            let (name, inline) = if let Some(l) = t.strip_prefix("--") {
                match l.split_once('=') { Some((k, v)) => (k.to_string(), Some(v.to_string())), None => (l.to_string(), None) }
            } else { let c = &t[1..]; (short.iter().find(|(s, _)| *s == c).map(|(_, l)| l.to_string()).unwrap_or_else(|| c.to_string()), None) };
            if valued.contains(&name.as_str()) {
                let v = inline.or_else(|| { let n = args.get(i).cloned(); if n.is_some() { i += 1; } n });
                match v { Some(v) => { a.val.insert(name, v); } None => die(&format!("la opción --{} necesita un valor", name)) }
            } else { a.flag.insert(name); }
        }
        a
    }
    fn get(&self, k: &str) -> Option<&str> { self.val.get(k).map(|s| s.as_str()) }
    fn has(&self, k: &str) -> bool { self.flag.contains(k) }
}

// ---------- ajustes ----------
const KEYS: &[(&str, &str)] = &[
    ("server", "dirección del servidor"), ("user", "usuario"), ("local", "carpeta local a sincronizar"), ("remote", "carpeta en SynapseBox (vacío = todo)"),
    ("auto", "sincronizar automáticamente: on/off"), ("mode", "two_way | upload | download"), ("strategy", "full_then_changes | initial_only | changes_only"),
    ("interval", "minutos entre sincronizaciones (5, 15, 30, 60, 180, 360, 720, 1440)"), ("new", "propagar archivos nuevos: on/off"), ("modified", "propagar modificados: on/off"),
    ("delete", "propagar borrados: on/off"), ("dirs", "propagar carpetas: on/off"), ("update-auto", "avisar de actualizaciones: on/off"),
];
fn onoff(b: bool) -> &'static str { if b { "on" } else { "off" } }
fn parse_bool(v: &str) -> bool { match v.to_lowercase().as_str() { "on" | "si" | "sí" | "true" | "1" | "yes" | "s" => true, "off" | "no" | "false" | "0" | "n" => false, _ => die("valor no válido: usa on u off") } }
fn get_key(c: &Config, k: &str) -> Option<String> {
    Some(match k {
        "server" => c.server.clone(), "user" => c.username.clone(), "local" => c.local_path.clone(), "remote" => c.remote_path.clone(), "auto" => onoff(c.sync_enabled).into(),
        "mode" => c.mode.clone(), "strategy" => c.strategy.clone(), "interval" => c.interval_min.to_string(), "new" => onoff(c.opt_new).into(), "modified" => onoff(c.opt_mod).into(),
        "delete" => onoff(c.opt_del).into(), "dirs" => onoff(c.opt_dirs).into(), "update-auto" => onoff(c.update_auto).into(), _ => return None,
    })
}
fn set_key(k: &str, v: &str) {
    let mut c = Config::load();
    match k {
        "server" => { c.server = api::normalize(v).unwrap_or_else(|| die("dirección no válida")); c.clear_session(); c.sync_enabled = false; }
        "user" => c.username = v.trim().to_string(),
        "local" => { let p = PathBuf::from(shellexpand(v)); if !p.is_dir() { die(&format!("la carpeta «{}» no existe", p.display())) } c.local_path = p.canonicalize().unwrap_or(p).to_string_lossy().trim_end_matches('/').to_string(); }
        "remote" => c.remote_path = ops::clean(v),
        "auto" => { let on = parse_bool(v); if on && c.local_path.trim().is_empty() { die("primero elige la carpeta: sbox sync folder <ruta>") } c.sync_enabled = on; }
        "mode" => { if !["two_way", "upload", "download"].contains(&v) { die("mode debe ser two_way, upload o download") } c.mode = v.into(); }
        "strategy" => { if !["full_then_changes", "initial_only", "changes_only"].contains(&v) { die("strategy debe ser full_then_changes, initial_only o changes_only") } c.strategy = v.into(); }
        "interval" => { c.interval_min = v.parse::<u32>().ok().filter(|m| (1..=10080).contains(m)).unwrap_or_else(|| die("interval debe ser un número de minutos (1-10080)")); }
        "new" => c.opt_new = parse_bool(v), "modified" => c.opt_mod = parse_bool(v), "delete" => c.opt_del = parse_bool(v), "dirs" => c.opt_dirs = parse_bool(v),
        "update-auto" => c.update_auto = parse_bool(v),
        _ => die(&format!("clave desconocida «{}». Mira: sbox config list", k)),
    }
    c.save();
}
fn shellexpand(p: &str) -> String { if p == "~" { config::home().to_string_lossy().into() } else if let Some(r) = p.strip_prefix("~/") { config::home().join(r).to_string_lossy().into() } else { p.to_string() } }

// ---------- entrada principal ----------
pub fn run(argv: Vec<String>) -> i32 {
    let Some(cmd) = argv.first().map(|s| s.as_str()) else { print!("{}", HELP); return 0 };
    let rest = &argv[1..];
    match cmd {
        "help" | "ayuda" | "-h" | "--help" => print!("{}", HELP),
        "version" | "-V" | "--version" => println!("sbox (synapsebox-linux) {}", VERSION),
        "gui" | "abrir" => crate::ui::run(),
        "login" | "entrar" => login(rest, false),
        "register" | "registrar" => login(rest, true),
        "logout" | "salir" => logout(),
        "server" | "servidor" => server(rest),
        "status" | "estado" | "whoami" => status(rest),
        "usage" | "uso" => usage(),
        "sessions" | "sesiones" => sessions(rest),
        "passwd" | "contrasena" | "contraseña" => passwd(),
        "ls" | "list" | "listar" => ls(rest),
        "upload" | "subir" | "put" => upload(rest),
        "download" | "bajar" | "get" => download(rest),
        "mkdir" => mkdir(rest),
        "rm" | "borrar" | "delete" => rm(rest),
        "mv" | "mover" => mv(rest),
        "cp" | "copiar" => cp(rest),
        "share" | "compartir" => share(rest),
        "search" | "buscar" => search(rest),
        "trash" | "papelera" => trash(rest),
        "admin" => admin(rest),
        "recent" | "recientes" => recent(rest),
        "type" | "tipo" => by_type(rest),
        "empty-folders" | "vacias" => empty_folders(rest),
        "install-server" | "instalar-servidor" => install_server(rest),
        "sync" | "sincronizar" => sync(rest),
        "config" | "ajustes" => config_cmd(rest),
        "service" | "servicio" => service(rest),
        "daemon" => { let stop = std::sync::atomic::AtomicBool::new(false); runner::daemon(&stop); }
        "update" | "actualizar" => update_cmd(rest),
        "completion" => completion(rest),
        _ => { eprintln!("sbox: orden desconocida «{}». Prueba: sbox help", cmd); return 2 }
    }
    0
}

// ---------- cuenta ----------
fn login(args: &[String], register: bool) {
    let a = Args::parse(args, &["server", "user", "password", "code"], &[("s", "server"), ("u", "user"), ("p", "password")]);
    let c0 = Config::load();
    let srv_in = a.get("server").map(String::from).or_else(|| if c0.server.is_empty() { None } else { Some(c0.server.clone()) }).unwrap_or_else(|| ask("Servidor (https://nube.ejemplo.com o 192.168.1.20:3001): "));
    let srv = api::normalize(&srv_in).unwrap_or_else(|| die("la dirección del servidor no es válida"));
    let ver = api::probe(&srv).unwrap_or_else(|| die(&format!("no se encontró SynapseBox en {}", srv)));
    eprintln!("SynapseBox v{} en {}", ver, srv);
    let user = a.get("user").map(String::from).unwrap_or_else(|| { let d = if c0.server == srv { c0.username.clone() } else { String::new() }; let u = ask(&format!("Usuario{}: ", if d.is_empty() { String::new() } else { format!(" [{}]", d) })); if u.is_empty() { d } else { u } });
    if user.is_empty() { die("falta el usuario") }
    let pass = if a.has("password-stdin") { ask("") } else if let Some(p) = a.get("password") { eprintln!("aviso: una contraseña en la línea de órdenes queda en el historial; mejor usa --password-stdin o déjala sin escribir"); p.to_string() } else { ask_secret("Contraseña: ") };
    if pass.is_empty() { die("falta la contraseña") }
    let api = Api::new(&srv, "");
    let res = if register {
        let p2 = if a.has("password-stdin") || a.get("password").is_some() { pass.clone() } else { ask_secret("Repite la contraseña: ") };
        if p2 != pass { die("las contraseñas no coinciden") }
        ok(api.register(&user, &pass, &p2))
    } else {
        let r = ok(api.login(&user, &pass));
        if r.need2fa { let t = r.ticket.unwrap_or_else(|| die("respuesta inesperada del servidor")); let code = a.get("code").map(String::from).unwrap_or_else(|| ask("Código de verificación (2FA o de recuperación): ")); ok(api.login2fa(&t, &code)) } else { r }
    };
    let Some(token) = res.token else { die("respuesta inesperada del servidor (¿tiene la versión 2.23 o superior?)") };
    let mut c = Config::load(); c.server = srv; c.username = user.clone(); c.token = token;
    c.expires_at = if res.expires_at > 0 { res.expires_at } else { config::now_ms() + 7 * 86_400_000 }; c.save();
    println!("Sesión iniciada como {}.", user);
    if !res.codes.is_empty() { println!("\nGuarda tus códigos de recuperación (se muestran solo ahora):"); for c in &res.codes { println!("  {}", c); } }
}
fn logout() {
    let c = Config::load();
    if c.logged() { Api::new(&c.server, &c.token).logout(); }
    let mut c = Config::load(); c.clear_session(); c.sync_enabled = false; c.save();
    println!("Sesión cerrada. La sincronización automática queda desactivada.");
}
fn server(args: &[String]) {
    let a = Args::parse(args, &[], &[]);
    let Some(url) = a.pos.first() else { let c = Config::load(); println!("{}", if c.server.is_empty() { "(sin servidor)".to_string() } else { c.server }); return };
    let srv = api::normalize(url).unwrap_or_else(|| die("la dirección no es válida"));
    match api::probe(&srv) { Some(v) => eprintln!("SynapseBox v{} encontrado", v), None if a.has("force") => eprintln!("aviso: no se encontró SynapseBox, se guarda igualmente (--force)"), None => die("no se encontró SynapseBox en esa dirección (usa --force para guardarla igualmente)") }
    let mut c = Config::load();
    if c.server != srv { c.clear_session(); c.sync_enabled = false; }
    c.server = srv.clone(); c.save();
    println!("Servidor: {}{}", srv, if !c.logged() { "  (inicia sesión con: sbox login)" } else { "" });
}
fn status(args: &[String]) {
    let a = Args::parse(args, &[], &[]);
    let c = Config::load(); let s = Status::load();
    let svc_on = Command::new("systemctl").args(["--user", "is-active", "--quiet", "synapsebox-sync.service"]).status().map(|s| s.success()).unwrap_or(false);
    let mut info = None; let mut usage = None;
    if c.logged() { let api = Api::new(&c.server, &c.token); info = Some(api.server_info()); usage = api.usage().ok(); }
    if a.has("json") {
        json_out(&serde_json::json!({ "app": VERSION, "server": c.server, "user": c.username, "logged": c.logged(), "session_expires": c.expires_at,
            "server_version": info.as_ref().map(|i| i.version.clone()), "features": info.as_ref().map(|i| i.features.clone()),
            "used_bytes": usage.map(|u| u.0), "max_mb": usage.map(|u| u.1),
            "sync": { "enabled": c.sync_enabled, "mode": c.mode, "strategy": c.strategy, "local": c.local_path, "remote": c.remote_path, "interval_min": c.interval_min,
                "running": s.running, "last": s.last_sync, "text": s.text, "initial_done": c.initial_done() }, "service": svc_on }));
        return;
    }
    println!("SynapseBox para Linux {}", VERSION);
    println!("Servidor:  {}", if c.server.is_empty() { "(sin configurar)" } else { c.server.as_str() });
    if !c.logged() { println!("Sesión:    sin iniciar (usa: sbox login)"); }
    else {
        println!("Usuario:   {}", c.username);
        println!("Sesión:    caduca {}", if c.expires_at > 0 { date(c.expires_at) + " UTC" } else { "(sin fecha)".into() });
        if let Some(i) = &info { println!("Servidor:  SynapseBox v{} · API {}", if i.version.is_empty() { "antiguo".into() } else { i.version.clone() }, i.api); }
        match usage { Some((u, m)) if m > 0 => println!("Espacio:   {} de {}", fmt_bytes(u), fmt_bytes(m * 1024 * 1024)), Some((u, _)) => println!("Espacio:   {} usados (sin límite)", fmt_bytes(u)), None => {} }
    }
    println!("\nSincronización: {}", if c.sync_enabled { "activa" } else { "desactivada" });
    println!("  Carpeta local:  {}", if c.local_path.is_empty() { "(sin elegir)" } else { c.local_path.as_str() });
    println!("  Carpeta remota: {}", if c.remote_path.is_empty() { "(todo tu espacio)" } else { c.remote_path.as_str() });
    println!("  Modo: {} · estrategia: {} · cada {} min", c.mode, c.strategy, c.interval_min);
    if s.running { println!("  En curso: {}", s.current); } else if !s.text.is_empty() { println!("  Última vez: {} — {}", when(s.last_sync), s.text); }
    println!("Servicio en segundo plano: {}", if svc_on { "activo" } else { "desactivado" });
}
fn usage() {
    let (_, api) = session(); let (u, m) = ok(api.usage());
    if m > 0 { println!("{} de {} ({:.1} %)", fmt_bytes(u), fmt_bytes(m * 1024 * 1024), u as f64 * 100.0 / (m * 1024 * 1024) as f64) } else { println!("{} usados (sin límite)", fmt_bytes(u)) }
}
fn sessions(args: &[String]) {
    let (_, api) = session();
    match args.first().map(|s| s.as_str()) {
        None | Some("list") => {
            for (id, cur, created, ip, ua) in ok(api.sessions()) { println!("{}  {}  {}  {}  {}", id, if cur { "(esta)" } else { "      " }, date(created), ip, ua.chars().take(60).collect::<String>()); }
        }
        Some("revoke") => { let id = args.get(1).unwrap_or_else(|| die("uso: sbox sessions revoke <ID>")); ok(api.revoke_session(id)); println!("Sesión cerrada."); }
        Some("revoke-others") => { ok(api.revoke_others()); println!("Las demás sesiones se han cerrado."); }
        Some(x) => die(&format!("subcomando desconocido «{}»", x)),
    }
}
fn passwd() {
    let (_, api) = session();
    let cur = ask_secret("Contraseña actual: "); let n = ask_secret("Nueva contraseña: "); let n2 = ask_secret("Repite la nueva: ");
    if n != n2 { die("las contraseñas nuevas no coinciden") }
    ok(api.change_password(&cur, &n, &n2)); println!("Contraseña cambiada. Se cerraron las demás sesiones.");
}

// ---------- archivos ----------
fn ls(args: &[String]) {
    let a = Args::parse(args, &[], &[]); let (_, api) = session();
    let path = ops::clean(a.pos.first().map(|s| s.as_str()).unwrap_or(""));
    let mut v = ok(api.list(&path)); v.sort_by(|x, y| y.is_dir.cmp(&x.is_dir).then(x.name.to_lowercase().cmp(&y.name.to_lowercase())));
    if a.has("json") { json_out(&serde_json::Value::Array(v.iter().map(|e| serde_json::json!({"name": e.name, "isDir": e.is_dir, "size": e.size, "mtime": e.mtime})).collect())); return }
    for e in v {
        if a.has("l") { println!("{} {:>10}  {}  {}{}", if e.is_dir { "d" } else { "-" }, if e.is_dir { "-".to_string() } else { fmt_bytes(e.size) }, date(e.mtime), e.name, if e.is_dir { "/" } else { "" }); }
        else { println!("{}{}", e.name, if e.is_dir { "/" } else { "" }); }
    }
}
fn upload(args: &[String]) {
    let a = Args::parse(args, &["dest"], &[("d", "dest")]); let (_, api) = session();
    if a.pos.is_empty() { die("uso: sbox upload <archivos o carpetas…> [-d carpeta-destino] [--overwrite]") }
    let files: Vec<PathBuf> = a.pos.iter().map(|p| PathBuf::from(shellexpand(p))).collect();
    let dest = a.get("dest").unwrap_or(ops::UPLOAD_DIR);
    let s = ok(ops::upload_paths(&api, &files, dest, a.has("overwrite"), &mut |l| println!("{}", l)));
    println!("Subidos {} archivo(s) a «{}».", s.ok, ops::clean(dest));
    if !s.failed.is_empty() { for f in &s.failed { eprintln!("  falló: {}", f); } std::process::exit(1) }
}
fn download(args: &[String]) {
    let a = Args::parse(args, &["out"], &[("o", "out")]); let (_, api) = session();
    let Some(r) = a.pos.first() else { die("uso: sbox download <ruta> [-o destino]") };
    let dest = PathBuf::from(shellexpand(a.get("out").unwrap_or(".")));
    let s = ok(ops::download_path(&api, r, &dest, &mut |l| println!("{}", l)));
    println!("Descargados {} archivo(s).", s.ok);
    if !s.failed.is_empty() { for f in &s.failed { eprintln!("  falló: {}", f); } std::process::exit(1) }
}
fn admin(args: &[String]) {
    let a = Args::parse(args, &["out"], &[("o", "out"), ("y", "yes")]); let (_, api) = session();
    match a.pos.first().map(|s| s.as_str()) {
        None | Some("users") | Some("usuarios") => {
            let us = ok(api.admin_users());
            if a.has("json") { json_out(&serde_json::Value::Array(us.iter().map(|u| serde_json::json!({"username": u.0, "admin": u.1, "suspended": u.2, "usedBytes": u.3, "maxMB": u.4})).collect())); return }
            for (n, adm, susp, used, max) in us {
                let q = if max > 0.0 { format!("{} de {}", fmt_bytes(used), fmt_bytes((max * 1048576.0) as i64)) } else { format!("{} (sin límite)", fmt_bytes(used)) };
                println!("{:<24} {}{}{}", n, q, if adm { "  [admin]" } else { "" }, if susp { "  [suspendido]" } else { "" });
            }
        }
        Some("ls") | Some("list") => {
            let Some(u) = a.pos.get(1) else { die("uso: sbox admin ls <usuario> [ruta] [-l]") };
            let path = ops::clean(a.pos.get(2).map(|s| s.as_str()).unwrap_or(""));
            let mut v = ok(api.admin_list(u, &path)); v.sort_by(|x, y| y.is_dir.cmp(&x.is_dir).then(x.name.to_lowercase().cmp(&y.name.to_lowercase())));
            for e in v {
                if a.has("l") { println!("{} {:>10}  {}  {}{}", if e.is_dir { "d" } else { "-" }, if e.is_dir { "-".to_string() } else { fmt_bytes(e.size) }, date(e.mtime), e.name, if e.is_dir { "/" } else { "" }); }
                else { println!("{}{}", e.name, if e.is_dir { "/" } else { "" }); }
            }
        }
        Some("get") | Some("download") | Some("bajar") => {
            let (Some(u), Some(p)) = (a.pos.get(1), a.pos.get(2)) else { die("uso: sbox admin get <usuario> <ruta-del-archivo> [-o destino]") };
            let p = ops::clean(p); let out = PathBuf::from(shellexpand(a.get("out").unwrap_or(".")));
            let dest = if out.is_dir() { out.join(ops::base_name(&p)) } else { out };
            ok(api.admin_download(u, &p, &dest)); println!("Guardado en {}", dest.display());
        }
        Some("rm") | Some("borrar") | Some("delete") => {
            let Some(u) = a.pos.get(1) else { die("uso: sbox admin rm <usuario> <ruta>… [-y]") };
            if a.pos.len() < 3 { die("uso: sbox admin rm <usuario> <ruta>… [-y]") }
            if !confirm(&format!("¿Borrar {} elemento(s) de la cuenta «{}» (van a la papelera de ese usuario)?", a.pos.len() - 2, u), a.has("yes")) { println!("Cancelado."); return }
            for p in &a.pos[2..] { ok(api.admin_delete(u, &ops::clean(p))); println!("Borrado: {}/{}", u, ops::clean(p)); }
        }
        Some(x) => die(&format!("subcomando desconocido «{}». Usa: users, ls, get, rm", x)),
    }
}
fn install_server(args: &[String]) {
    let a = Args::parse(args, &[], &[("y", "yes")]);
    let start = !a.has("no-start");
    println!("Se ejecutará en esta terminal el instalador oficial de SynapseBox (servidor):\n  {}\n", serverinst::command(start));
    if start { println!("Al terminar, el servidor queda funcionando en esta terminal ({}); Ctrl+C lo detiene.", serverinst::LOCAL); }
    if !confirm("¿Instalar SynapseBox en este equipo?", a.has("yes")) { println!("Cancelado."); return }
    let st = Command::new("bash").arg("-c").arg(serverinst::command(start)).status();
    match st {
        Ok(s) if s.success() => println!("\nListo. Para usar este servidor desde esta app: sbox server {}", serverinst::LOCAL),
        Ok(s) => std::process::exit(s.code().unwrap_or(1)),
        Err(e) => die(&format!("no se pudo ejecutar: {}", e)),
    }
}
fn mkdir(args: &[String]) {
    let a = Args::parse(args, &[], &[]); let (_, api) = session();
    if a.pos.is_empty() { die("uso: sbox mkdir <ruta>…") }
    for p in &a.pos { ok(ops::ensure_dir(&api, &ops::clean(p))); println!("Carpeta «{}» lista.", ops::clean(p)); }
}
fn rm(args: &[String]) {
    let a = Args::parse(args, &[], &[("y", "yes")]); let (_, api) = session();
    if a.pos.is_empty() { die("uso: sbox rm <ruta>… [-y]") }
    if !confirm(&format!("¿Borrar {} elemento(s) del servidor (van a su papelera)?", a.pos.len()), a.has("yes")) { println!("Cancelado."); return }
    for p in &a.pos { ok(api.delete(&ops::clean(p))); println!("Borrado: {}", ops::clean(p)); }
}
fn mv(args: &[String]) {
    let a = Args::parse(args, &[], &[]); let (_, api) = session();
    let (Some(from), Some(to)) = (a.pos.first(), a.pos.get(1)) else { die("uso: sbox mv <origen> <destino>") };
    let (from, to) = (ops::clean(from), ops::clean(to));
    if from.is_empty() { die("origen no válido") }
    let dest_is_dir = matches!(ok(ops::stat_remote(&api, &to)), Some(e) if e.is_dir);
    if dest_is_dir { ok(api.move_to(&from, &to)); println!("{} → {}/{}", from, to, ops::base_name(&from)); }
    else if ops::parent(&from) == ops::parent(&to) { ok(api.rename(&from, &ops::base_name(&to))); println!("{} → {}", from, to); }
    else if api.has("sync-move") { ok(api.mv(&from, &to)); println!("{} → {}", from, to); }
    else { die("el destino no es una carpeta existente: mueve a una carpeta, o renombra dentro de la misma carpeta") }
}
fn cp(args: &[String]) {
    let a = Args::parse(args, &[], &[]); let (_, api) = session();
    let (Some(from), Some(to)) = (a.pos.first(), a.pos.get(1)) else { die("uso: sbox cp <origen> <carpeta-destino>") };
    ok(api.copy_to(&ops::clean(from), &ops::clean(to))); println!("Copiado a «{}».", ops::clean(to));
}
fn share(args: &[String]) {
    let a = Args::parse(args, &["days", "password"], &[]); let (_, api) = session();
    let Some(p) = a.pos.first() else { die("uso: sbox share <ruta> [--days N] [--password P]") };
    let days = a.get("days").map(|d| d.parse::<u32>().unwrap_or_else(|_| die("--days debe ser un número"))).unwrap_or(0);
    println!("{}", ok(api.share(&ops::clean(p), days, a.get("password").unwrap_or(""))));
}
/// Lista de resultados: `-l` añade tamaño y fecha. Con `--json`, una matriz con name, path, isDir, size, mtime.
fn show_items(v: Vec<api::Entry>, a: &Args) {
    if a.has("json") { json_out(&serde_json::Value::Array(v.iter().map(|e| serde_json::json!({"name": e.name, "path": e.path, "isDir": e.is_dir, "size": e.size, "mtime": e.mtime})).collect())); return }
    if v.is_empty() { println!("Sin resultados."); return }
    for e in v {
        if a.has("l") { println!("{:>10}  {}  {}{}", if e.is_dir { "-".to_string() } else { fmt_bytes(e.size) }, date(e.mtime), e.path, if e.is_dir { "/" } else { "" }); }
        else { println!("{}{}", e.path, if e.is_dir { "/" } else { "" }); }
    }
}
fn recent(args: &[String]) { let a = Args::parse(args, &[], &[]); let (_, api) = session(); show_items(ok(api.explore("api/recent", &[])), &a); }
fn by_type(args: &[String]) {
    let a = Args::parse(args, &[], &[]); let (_, api) = session();
    let Some(t) = a.pos.first() else { die("uso: sbox type <images|video|audio|docs|archives> [-l] [--json]") };
    show_items(ok(api.explore("api/by-type", &[("type", t.as_str())])), &a);
}
fn empty_folders(args: &[String]) { let a = Args::parse(args, &[], &[]); let (_, api) = session(); show_items(ok(api.explore("api/empty-folders", &[])), &a); }
fn search(args: &[String]) {
    let (_, api) = session();
    if args.is_empty() { die("uso: sbox search <texto>") }
    for e in ok(api.search(&args.join(" "))) { println!("{}{}", e.path, if e.is_dir { "/" } else { "" }); }
}
fn trash(args: &[String]) {
    let a = Args::parse(args, &[], &[("y", "yes")]); let (_, api) = session();
    match a.pos.first().map(|s| s.as_str()) {
        None | Some("list") => for (id, p, size) in ok(api.trash_list()) { println!("{}  {:>10}  {}", id, fmt_bytes(size), p); },
        Some("restore") => { let id = a.pos.get(1).unwrap_or_else(|| die("uso: sbox trash restore <ID>")); println!("Restaurado en: {}", ok(api.trash_restore(id))); }
        Some("empty") => { if !confirm("¿Vaciar la papelera del servidor definitivamente?", a.has("yes")) { println!("Cancelado."); return } println!("Eliminados {} elemento(s).", ok(api.trash_empty())); }
        Some(x) => die(&format!("subcomando desconocido «{}»", x)),
    }
}

// ---------- sincronización ----------
fn sync(args: &[String]) {
    match args.first().map(|s| s.as_str()) {
        None | Some("now") | Some("ahora") => sync_now(),
        Some("status") | Some("estado") => status(&[]),
        Some("on") => { set_key("auto", "on"); println!("Sincronización automática activada (el servicio o la interfaz la ejecutan; para que siga con todo cerrado: sbox service on)."); }
        Some("off") => { set_key("auto", "off"); println!("Sincronización automática desactivada."); }
        Some("reset") => { config::reset_state(); let mut c = Config::load(); c.initial_key.clear(); c.save(); let mut s = Status::load(); s.text = "Reiniciada: la próxima sincronización hará la copia inicial".into(); s.save_final(); println!("Reiniciada: la próxima sincronización repetirá la copia inicial."); }
        Some("folder") | Some("carpeta") => {
            let Some(l) = args.get(1) else { die("uso: sbox sync folder <ruta-local> [ruta-remota]") };
            set_key("local", l); if let Some(r) = args.get(2) { set_key("remote", r); }
            let c = Config::load(); println!("Carpeta local: {}\nCarpeta remota: {}", c.local_path, if c.remote_path.is_empty() { "(todo tu espacio)" } else { c.remote_path.as_str() });
        }
        Some(x) => die(&format!("subcomando desconocido «{}»", x)),
    }
}
fn sync_now() {
    let c = Config::load();
    if !c.logged() { die("no has iniciado sesión. Usa: sbox login") }
    if c.local_path.trim().is_empty() { die("no hay carpeta elegida: sbox sync folder <ruta-local> [ruta-remota]") }
    if Lock::held() { die("ya hay otra sincronización en curso (interfaz o servicio)") }
    let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let c2 = cancel.clone();
    let h = std::thread::spawn(move || runner::sync_once(&c2));
    let mut last = String::new();
    while !h.is_finished() {
        let s = Status::load();
        if s.running && s.current != last { last = s.current.clone(); if s.total > 0 { println!("[{}/{}] {}", s.done, s.total, s.current); } else { println!("{}", s.current); } }
        std::thread::sleep(std::time::Duration::from_millis(300));
    }
    let ran = h.join().unwrap_or(false);
    let s = Status::load();
    if !ran { die("no se pudo sincronizar (¿otra sincronización en curso?)") }
    println!("{}", s.text);
    if s.text.starts_with("Error") || s.text.starts_with("Sesión caducada") || s.text.contains(" errores (") { std::process::exit(1) }
}
fn config_cmd(args: &[String]) {
    let a = Args::parse(args, &[], &[]);
    match a.pos.first().map(|s| s.as_str()) {
        None | Some("list") => {
            let c = Config::load();
            if a.has("json") { json_out(&serde_json::Value::Object(KEYS.iter().map(|(k, _)| (k.to_string(), serde_json::Value::String(get_key(&c, k).unwrap_or_default()))).collect())); return }
            for (k, d) in KEYS { println!("{:<12} = {:<28} # {}", k, get_key(&c, k).unwrap_or_default(), d); }
        }
        Some("get") => { let k = a.pos.get(1).unwrap_or_else(|| die("uso: sbox config get <clave>")); println!("{}", get_key(&Config::load(), k).unwrap_or_else(|| die(&format!("clave desconocida «{}»", k)))); }
        Some("set") => { let (Some(k), Some(v)) = (a.pos.get(1), a.pos.get(2)) else { die("uso: sbox config set <clave> <valor>") }; set_key(k, v); println!("{} = {}", k, get_key(&Config::load(), k).unwrap_or_default()); }
        Some("reset") => {
            let c = Config::load(); let mut n = Config::default();
            n.server = c.server; n.username = c.username; n.token = c.token; n.expires_at = c.expires_at; n.save(); println!("Ajustes restablecidos (la sesión se mantiene).");
        }
        Some(x) => die(&format!("subcomando desconocido «{}»", x)),
    }
}
fn systemctl(args: &[&str]) -> bool { Command::new("systemctl").arg("--user").args(args).status().map(|s| s.success()).unwrap_or(false) }
fn service(args: &[String]) {
    match args.first().map(|s| s.as_str()) {
        Some("on") => { if systemctl(&["enable", "--now", "synapsebox-sync.service"]) { println!("Servicio activado: sincroniza en segundo plano y al iniciar sesión."); } else { die("no se pudo activar. ¿Instalaste con install.sh (usuario)? Revisa: systemctl --user status synapsebox-sync") } }
        Some("off") => { systemctl(&["disable", "--now", "synapsebox-sync.service"]); println!("Servicio desactivado."); }
        None | Some("status") => println!("Servicio: {}", if Command::new("systemctl").args(["--user", "is-active", "--quiet", "synapsebox-sync.service"]).status().map(|s| s.success()).unwrap_or(false) { "activo" } else { "desactivado" }),
        Some(x) => die(&format!("subcomando desconocido «{}»", x)),
    }
}

// ---------- actualizaciones y autocompletado ----------
fn update_cmd(args: &[String]) {
    match args.first().map(|s| s.as_str()) {
        None | Some("check") => match update::check() {
            Ok(c) if c.newer => println!("Hay una versión nueva: {} (tienes la {}). Instálala con: sbox update install", c.release.version, c.installed),
            Ok(c) => println!("Tienes la última versión ({}).", c.installed),
            Err(e) => die(&format!("no se pudo comprobar: {}", e)),
        },
        Some("install") => match update::check() {
            Ok(c) if c.newer => match update::install(&c.release, &mut |l| println!("{}", l)) { Ok(()) => println!("Actualizado a la versión {}.", c.release.version), Err(e) => die(&e.to_string()) },
            Ok(c) => println!("Ya tienes la última versión ({}).", c.installed),
            Err(e) => die(&format!("no se pudo comprobar: {}", e)),
        },
        Some("auto") => { let v = args.get(1).unwrap_or_else(|| die("uso: sbox update auto on|off")); set_key("update-auto", v); println!("Aviso de actualizaciones: {}", v); }
        Some(x) => die(&format!("subcomando desconocido «{}»", x)),
    }
}
const CMDS: &str = "login register logout server status whoami usage sessions passwd ls upload download mkdir rm mv cp share search trash admin recent type empty-folders install-server sync config service daemon update gui completion version help";
fn completion(args: &[String]) {
    match args.first().map(|s| s.as_str()) {
        Some("zsh") => println!("#compdef sbox\n_arguments '1: :({})' '*:file:_files'\ncompdef _sbox sbox", CMDS),
        _ => println!("_sbox() {{ local c=\"${{COMP_WORDS[COMP_CWORD]}}\"; if [ \"$COMP_CWORD\" -eq 1 ]; then COMPREPLY=($(compgen -W \"{}\" -- \"$c\")); else COMPREPLY=($(compgen -f -- \"$c\")); fi; }}\ncomplete -F _sbox sbox", CMDS),
    }
}
