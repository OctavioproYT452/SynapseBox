//! Actualizaciones: mira la carpeta APPS/Windows/dist del repositorio de GitHub (rama main), elige el SynapseBox-Windows-vX.Y.Z.zip de versión más alta,
//! lo descarga y sustituye los programas instalados (compilados antes desde Debian con build-windows.sh).
use crate::api::{Fail, R};
use crate::config::{cache_dir, VERSION};
use reqwest::blocking::Client;
use serde_json::Value;
use std::process::Command;
use std::time::Duration;

pub const REPO: &str = "OctavioproYT452/SynapseBox";
pub const PATH: &str = "APPS/Windows/dist";
pub const BRANCH: &str = "main";
pub const FOLDER_PAGE: &str = "https://github.com/OctavioproYT452/SynapseBox/tree/main/APPS/Windows/dist";

#[derive(Clone, Debug)]
pub struct Release { pub version: String, pub url: String, pub size: u64, pub name: String }
pub struct Check { pub installed: String, pub release: Release, pub newer: bool }

/// «SynapseBox-Windows-v1.2.3.zip» → «1.2.3»
pub fn parse_name(n: &str) -> Option<String> {
    let n = n.strip_prefix("SynapseBox-Windows")?;
    let v = n.strip_prefix("-v")?.strip_suffix(".zip")?;
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
    Client::builder().user_agent("SynapseBox-Windows").connect_timeout(Duration::from_secs(20)).timeout(Duration::from_secs(secs)).build().expect("cliente HTTP")
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
    let release = best.ok_or_else(|| Fail::Io(format!("No hay ningún archivo SynapseBox-Windows-vX.Y.Z.zip en {}", PATH)))?;
    let newer = compare(&release.version, VERSION) == std::cmp::Ordering::Greater;
    Ok(Check { installed: VERSION.to_string(), release, newer })
}

/// Descarga el paquete .zip, lo descomprime y sustituye los programas instalados (synapsebox.exe y sbox.exe) por los nuevos.
/// Windows no deja sobrescribir un .exe en uso, pero sí renombrarlo: el antiguo pasa a «.old» y se borra en el siguiente arranque.
pub fn install(rel: &Release, log: &mut dyn FnMut(&str)) -> R<()> {
    use std::os::windows::process::CommandExt;
    let dir = cache_dir().join("update");
    let _ = std::fs::remove_dir_all(&dir); std::fs::create_dir_all(&dir)?;
    let zip = dir.join(&rel.name);
    log(&format!("Descargando {} …", rel.name));
    let mut r = http(900).get(&rel.url).send()?;
    if !r.status().is_success() { return Err(Fail::Io(format!("No se pudo descargar ({})", r.status().as_u16()))) }
    { let mut f = std::fs::File::create(&zip)?; std::io::copy(&mut r, &mut f)?; }
    if rel.size > 0 && std::fs::metadata(&zip)?.len() != rel.size { return Err(Fail::Io("La descarga quedó incompleta".into())) }
    log("Descomprimiendo …");
    let out = dir.join("x"); std::fs::create_dir_all(&out)?;
    // tar.exe (bsdtar) viene con Windows 10 (1803) y 11 y también abre .zip
    let st = Command::new("tar").arg("-xf").arg(&zip).arg("-C").arg(&out).creation_flags(0x0800_0000).status().map_err(|e| Fail::Io(format!("No se pudo ejecutar tar: {}", e)))?;
    if !st.success() { return Err(Fail::Io("No se pudo descomprimir el paquete".into())) }
    let found = |name: &str| -> Option<std::path::PathBuf> {
        let mut stack = vec![out.clone()];
        while let Some(d) = stack.pop() { if let Ok(rd) = std::fs::read_dir(&d) { for e in rd.flatten() { let p = e.path(); if p.is_dir() { stack.push(p); } else if p.file_name().map_or(false, |n| n.eq_ignore_ascii_case(name)) { return Some(p) } } } }
        None
    };
    let me = std::env::current_exe().map_err(|e| Fail::Io(e.to_string()))?;
    let folder = me.parent().ok_or_else(|| Fail::Io("No se encontró la carpeta de instalación".into()))?.to_path_buf();
    let mut replaced = 0;
    for name in ["synapsebox.exe", "sbox.exe"] {
        let Some(new) = found(name) else { continue };
        let target = folder.join(name);
        let old = folder.join(format!("{}.old", name));
        let _ = std::fs::remove_file(&old);
        if target.exists() { std::fs::rename(&target, &old).map_err(|e| Fail::Io(format!("No se pudo reemplazar {} (¿está instalada en una carpeta protegida?): {}", name, e)))?; }
        if let Err(e) = std::fs::copy(&new, &target) { let _ = std::fs::rename(&old, &target); return Err(Fail::Io(format!("No se pudo copiar {}: {}", name, e))) }
        log(&format!("Actualizado {}", name)); replaced += 1;
    }
    if replaced == 0 { return Err(Fail::Io("El paquete no contiene synapsebox.exe ni sbox.exe".into())) }
    let _ = std::fs::remove_dir_all(&dir);
    Ok(())
}

/// Borra los «.old» que dejó una actualización anterior (llamar al arrancar).
pub fn cleanup() {
    if let Some(folder) = std::env::current_exe().ok().and_then(|p| p.parent().map(|x| x.to_path_buf())) {
        for n in ["synapsebox.exe.old", "sbox.exe.old"] { let _ = std::fs::remove_file(folder.join(n)); }
    }
}
