//! Operaciones de archivos compartidas por la terminal (`sbox`) y la interfaz: subir, bajar, copiar rutas del servidor.
use crate::api::{Api, Entry, Fail, R};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/// Carpeta del servidor donde van las subidas si no se indica otra.
pub const UPLOAD_DIR: &str = "Subidas del PC";
const BIG: u64 = 8 * 1024 * 1024;

pub struct Summary { pub ok: u32, pub failed: Vec<String> }

pub fn join(a: &str, b: &str) -> String { let (a, b) = (a.trim_matches('/'), b.trim_matches('/')); if a.is_empty() { b.to_string() } else if b.is_empty() { a.to_string() } else { format!("{}/{}", a, b) } }
pub fn clean(p: &str) -> String { p.trim().trim_matches('/').to_string() }
pub fn parent(p: &str) -> String { let p = p.trim_matches('/'); p.rsplit_once('/').map(|x| x.0.to_string()).unwrap_or_default() }
pub fn base_name(p: &str) -> String { p.trim_matches('/').rsplit('/').next().unwrap_or("").to_string() }

/// Crea la carpeta remota y las que la contienen (ignora «ya existe»).
pub fn ensure_dir(api: &Api, path: &str) -> R<()> {
    let mut parent = String::new();
    for seg in path.split('/').filter(|s| !s.is_empty()) {
        match api.mkdir(&parent, seg) { Ok(()) | Err(Fail::Api(_, _)) => {} Err(e) => return Err(e) }
        parent = join(&parent, seg);
    }
    Ok(())
}

/// Busca un elemento del servidor por su ruta.
pub fn stat_remote(api: &Api, path: &str) -> R<Option<Entry>> {
    let p = clean(path); if p.is_empty() { return Ok(Some(Entry { name: String::new(), path: String::new(), is_dir: true, size: 0, mtime: 0 })) }
    let name = base_name(&p);
    Ok(api.list(&parent(&p)).map(|v| v.into_iter().find(|e| e.name == name)).or_else(|e| if let Fail::Api(..) = e { Ok(None) } else { Err(e) })?)
}

fn unique_name(name: &str, taken: &HashSet<String>) -> String {
    if !taken.contains(&name.to_lowercase()) { return name.to_string() }
    let (stem, ext) = match name.rfind('.') { Some(i) if i > 0 => (&name[..i], &name[i..]), _ => (name, "") };
    let mut n = 1; loop { let c = format!("{} ({}){}", stem, n, ext); if !taken.contains(&c.to_lowercase()) { return c } n += 1 }
}

fn put_file(api: &Api, remote: &str, file: &Path) -> R<()> {
    let mut last = None;
    for attempt in 0..3 {
        let size = fs::metadata(file)?.len();
        let r = if size > BIG && api.has("resumable-upload") { api.upload_resumable(remote, file).or_else(|e| if let Fail::Api(..) = e { api.upload(remote, file) } else { Err(e) }) } else { api.upload(remote, file) };
        match r { Ok(()) => return Ok(()), Err(Fail::Auth) => return Err(Fail::Auth), Err(Fail::Api(c, m)) => return Err(Fail::Api(c, m)), Err(e) => { last = Some(e); std::thread::sleep(std::time::Duration::from_secs(1 + attempt)); } }
    }
    Err(last.unwrap_or(Fail::Io("Error al subir".into())))
}

/// Sube archivos y carpetas (recursivo) a `dest`. Sin `overwrite`, nunca pisa un archivo existente: añade «(1)», «(2)»…
pub fn upload_paths(api: &Api, paths: &[PathBuf], dest: &str, overwrite: bool, progress: &mut dyn FnMut(&str)) -> R<Summary> {
    let dest = clean(dest); ensure_dir(api, &dest)?;
    let mut names: HashMap<String, HashSet<String>> = HashMap::new(); // carpeta remota → nombres existentes (minúsculas)
    let mut sum = Summary { ok: 0, failed: vec![] };
    let mut jobs: Vec<(PathBuf, String)> = Vec::new(); // (local, carpeta remota destino)
    let mut dirs: Vec<String> = Vec::new();
    fn walk(d: &Path, remote: &str, jobs: &mut Vec<(PathBuf, String)>, dirs: &mut Vec<String>) {
        dirs.push(remote.to_string());
        let Ok(rd) = fs::read_dir(d) else { return };
        let mut v: Vec<_> = rd.flatten().collect(); v.sort_by_key(|e| e.file_name());
        for e in v {
            let p = e.path(); let n = e.file_name().to_string_lossy().to_string();
            let Ok(md) = fs::symlink_metadata(&p) else { continue };
            if md.file_type().is_symlink() { continue }
            if md.is_dir() { walk(&p, &join(remote, &n), jobs, dirs); } else if md.is_file() { jobs.push((p, remote.to_string())); }
        }
    }
    for p in paths {
        let md = match fs::symlink_metadata(p) { Ok(m) => m, Err(e) => { sum.failed.push(format!("{}: {}", p.display(), e)); continue } };
        if md.is_dir() {
            let n = p.canonicalize().ok().and_then(|c| c.file_name().map(|x| x.to_string_lossy().to_string())).unwrap_or_else(|| "carpeta".into());
            walk(p, &join(&dest, &n), &mut jobs, &mut dirs);
        } else if md.is_file() { jobs.push((p.clone(), dest.clone())); } else { sum.failed.push(format!("{}: no es un archivo", p.display())); }
    }
    for d in &dirs { ensure_dir(api, d)?; }
    for (file, rdir) in jobs {
        let name = file.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let taken = names.entry(rdir.clone()).or_insert_with(|| api.list(&rdir).map(|v| v.into_iter().filter(|e| !e.is_dir).map(|e| e.name.to_lowercase()).collect()).unwrap_or_default());
        let final_name = if overwrite { name.clone() } else { unique_name(&name, taken) };
        taken.insert(final_name.to_lowercase());
        progress(&format!("Subiendo {} → {}", file.display(), join(&rdir, &final_name)));
        match put_file(api, &join(&rdir, &final_name), &file) { Ok(()) => sum.ok += 1, Err(Fail::Auth) => return Err(Fail::Auth), Err(e) => sum.failed.push(format!("{}: {}", file.display(), e)) }
    }
    Ok(sum)
}

/// Descarga un archivo o una carpeta (recursivo). `dest`: carpeta existente (se crea dentro) o nombre del archivo/carpeta nuevo.
pub fn download_path(api: &Api, remote: &str, dest: &Path, progress: &mut dyn FnMut(&str)) -> R<Summary> {
    let remote = clean(remote);
    let ent = stat_remote(api, &remote)?.ok_or_else(|| Fail::Io(format!("No existe «{}» en el servidor", remote)))?;
    let name = if remote.is_empty() { "SynapseBox".to_string() } else { base_name(&remote) };
    let target = if dest.is_dir() { dest.join(&name) } else { dest.to_path_buf() };
    let mut sum = Summary { ok: 0, failed: vec![] };
    if !ent.is_dir {
        progress(&format!("Bajando {}", remote));
        if let Some(p) = target.parent() { let _ = fs::create_dir_all(p); }
        match api.download(&remote, &target, false) { Ok(()) => sum.ok += 1, Err(Fail::Auth) => return Err(Fail::Auth), Err(e) => sum.failed.push(format!("{}: {}", remote, e)) }
        return Ok(sum);
    }
    fs::create_dir_all(&target)?;
    let tree = api.tree(&remote)?;
    let mut keys: Vec<&String> = tree.keys().collect(); keys.sort();
    for k in keys {
        let r = &tree[k]; let local = target.join(k);
        if r.is_dir { let _ = fs::create_dir_all(&local); continue }
        if let Some(p) = local.parent() { let _ = fs::create_dir_all(p); }
        progress(&format!("Bajando {}", join(&remote, k)));
        match api.download(&join(&remote, k), &local, false) { Ok(()) => sum.ok += 1, Err(Fail::Auth) => return Err(Fail::Auth), Err(e) => sum.failed.push(format!("{}: {}", k, e)) }
    }
    Ok(sum)
}
