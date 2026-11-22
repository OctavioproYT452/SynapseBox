//! Actualizaciones: mira la carpeta APPS/Linux del repositorio de GitHub (rama main), elige el SynapseBox-vX.Y.Z.tar.gz de versión más alta,
//! lo descarga, lo descomprime y ejecuta su install.sh: así cada PC compila la versión nueva para sí misma.
use crate::api::{Fail, R};
use crate::config::{cache_dir, VERSION};
use reqwest::blocking::Client;
use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::time::Duration;

pub const REPO: &str = "OctavioproYT452/SynapseBox";
pub const PATH: &str = "APPS/Linux";
pub const BRANCH: &str = "main";
pub const FOLDER_PAGE: &str = "https://github.com/OctavioproYT452/SynapseBox/tree/main/APPS/Linux";

#[derive(Clone, Debug)]
pub struct Release { pub version: String, pub url: String, pub size: u64, pub name: String }
pub struct Check { pub installed: String, pub release: Release, pub newer: bool }

/// «SynapseBox-v1.2.3.tar.gz» (o «SynapseBox-Linux-v1.2.3.tar.gz») → «1.2.3»
pub fn parse_name(n: &str) -> Option<String> {
    let n = n.strip_prefix("SynapseBox")?; let n = n.strip_prefix("-Linux").unwrap_or(n);
    let v = n.strip_prefix("-v")?.strip_suffix(".tar.gz")?;
    if !v.is_empty() && v.split('.').all(|x| !x.is_empty() && x.chars().all(|c| c.is_ascii_digit())) { Some(v.to_string()) } else { None }
}
/// Compara versiones numéricas («1.10.0» > «1.9.2»).
pub fn compare(a: &str, b: &str) -> std::cmp::Ordering {
    let p = |s: &str| -> Vec<u64> { s.trim_start_matches('v').split('.').map(|x| x.chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0)).collect() };
    let (x, y) = (p(a), p(b));
    for i in 0..x.len().max(y.len()) { let o = x.get(i).unwrap_or(&0).cmp(y.get(i).unwrap_or(&0)); if o != std::cmp::Ordering::Equal { return o } }
    std::cmp::Ordering::Equal
}

fn http(secs: u64) -> Client {
    Client::builder().user_agent("SynapseBox-Linux").connect_timeout(Duration::from_secs(20)).timeout(Duration::from_secs(secs)).build().expect("cliente HTTP")
}

/// Bloqueante. Lanza un error legible si no hay conexión o no hay ningún paquete en la carpeta.
pub fn check() -> R<Check> {
    let r = http(30).get(format!("https://api.github.com/repos/{}/contents/{}?ref={}", REPO, PATH, BRANCH)).header("Accept", "application/vnd.github+json").send()?;
    match r.status().as_u16() {
        404 => return Err(Fail::Io(format!("No se encontró la carpeta {} en GitHub", PATH))),
        403 | 429 => return Err(Fail::Io("GitHub limitó las consultas; inténtalo más tarde".into())),
        c if !(200..300).contains(&c) => return Err(Fail::Io(format!("GitHub respondió {}", c))),
        _ => {}
    }
    let j: Value = serde_json::from_str(&r.text()?).map_err(|_| Fail::Io("Respuesta no válida de GitHub".into()))?;
    let mut best: Option<Release> = None;
    for a in j.as_array().cloned().unwrap_or_default() {
        if a["type"].as_str() != Some("file") { continue }
        let name = a["name"].as_str().unwrap_or("");
        let (Some(v), Some(url)) = (parse_name(name), a["download_url"].as_str()) else { continue };
        if best.as_ref().map_or(true, |b| compare(&v, &b.version) == std::cmp::Ordering::Greater) {
            best = Some(Release { version: v, url: url.to_string(), size: a["size"].as_u64().unwrap_or(0), name: name.to_string() });
        }
    }
    let release = best.ok_or_else(|| Fail::Io(format!("No hay ningún archivo SynapseBox-vX.Y.Z.tar.gz en {}", PATH)))?;
    let newer = compare(&release.version, VERSION) == std::cmp::Ordering::Greater;
    Ok(Check { installed: VERSION.to_string(), release, newer })
}

/// Descarga el código fuente, lo descomprime y lo compila e instala donde está instalada la app actual. `log` recibe cada línea de la salida.
pub fn install(rel: &Release, log: &mut dyn FnMut(&str)) -> R<()> {
    let dir = cache_dir().join("update");
    let _ = std::fs::remove_dir_all(&dir); std::fs::create_dir_all(&dir)?;
    let tgz = dir.join(&rel.name);
    log(&format!("Descargando {} …", rel.name));
    let mut r = http(900).get(&rel.url).send()?;
    if !r.status().is_success() { return Err(Fail::Io(format!("No se pudo descargar ({})", r.status().as_u16()))) }
    { let mut f = std::fs::File::create(&tgz)?; std::io::copy(&mut r, &mut f)?; }
    if rel.size > 0 && std::fs::metadata(&tgz)?.len() != rel.size { return Err(Fail::Io("La descarga quedó incompleta".into())) }
    log("Descomprimiendo …");
    let st = Command::new("tar").arg("-xzf").arg(&tgz).arg("-C").arg(&dir).status().map_err(|e| Fail::Io(format!("No se pudo ejecutar tar: {}", e)))?;
    if !st.success() { return Err(Fail::Io("No se pudo descomprimir el paquete".into())) }
    let src = std::fs::read_dir(&dir)?.flatten().map(|e| e.path()).find(|p| p.is_dir() && p.join("install.sh").exists()).ok_or_else(|| Fail::Io("El paquete no contiene install.sh".into()))?;
    // Se instala donde está la app actual: <prefijo>/bin/synapsebox-linux
    let exe = std::env::current_exe().map_err(|e| Fail::Io(e.to_string()))?;
    let prefix = exe.parent().and_then(|p| p.parent()).map(|p| p.to_path_buf()).unwrap_or_else(|| crate::config::home().join(".local"));
    let writable = std::fs::metadata(prefix.join("bin")).map(|m| !m.permissions().readonly()).unwrap_or(false) && std::fs::File::create(prefix.join("bin").join(".sbtest")).map(|_| { let _ = std::fs::remove_file(prefix.join("bin").join(".sbtest")); true }).unwrap_or(false);
    if !writable {
        return Err(Fail::Io(format!("La app está instalada en {0}, donde hace falta administrador. Ejecuta en una terminal:\n  cd '{1}' && sudo ./install.sh --prefix '{0}'", prefix.display(), src.display())));
    }
    log("Compilando para este equipo (puede tardar unos minutos) …");
    let mut child = Command::new("bash").arg("install.sh").arg("--prefix").arg(&prefix).arg("--update").current_dir(&src)
        .stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| Fail::Io(format!("No se pudo ejecutar install.sh: {}", e)))?;
    let err = child.stderr.take();
    let t = std::thread::spawn(move || { let mut v = Vec::new(); if let Some(e) = err { for l in BufReader::new(e).lines().flatten() { v.push(l); } } v });
    if let Some(o) = child.stdout.take() { for l in BufReader::new(o).lines().flatten() { log(&l); } }
    let status = child.wait()?;
    for l in t.join().unwrap_or_default() { log(&l); }
    if !status.success() { return Err(Fail::Io("La compilación falló (revisa el registro)".into())) }
    let _ = std::fs::remove_dir_all(&dir);
    Ok(())
}
