//! Sincronización de una carpeta local con una carpeta de SynapseBox (mismo algoritmo que la app de Android).
//!
//! Se guarda una «foto» de lo sincronizado la última vez (tamaño y fecha de cada lado). En cada pasada se compara cada ruta con esa foto:
//!  · cambió un solo lado → se copia al otro;  · cambiaron los dos → conflicto: la copia local se conserva como «nombre (conflicto …)»;
//!  · desapareció de un lado y no cambió en el otro → se propaga el borrado (servidor: papelera; local: «.sync-trash», 30 días).
//! Estrategias: copia completa y luego cambios · solo copia inicial (la detiene el runner) · solo cambios desde ahora (primera pasada = línea base).
//! La copia inicial nunca borra. Con servidor 2.25+: subida reanudable, renombrados sin recopiar y borrado por lotes.
use crate::api::{Api, Fail, Remote, R};
use crate::timefmt::stamp;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const TOL: i64 = 2000;
const BIG: u64 = 8 * 1024 * 1024;
const TRASH: &str = ".sync-trash";

pub struct Opts { pub mode: String, pub strategy: String, pub initial_pass: bool, pub opt_new: bool, pub opt_mod: bool, pub opt_del: bool, pub opt_dirs: bool }

#[derive(Clone, Debug)]
struct L { dir: bool, size: i64, mtime: i64 }
/// ls/rs = -1 → en esa foto solo existía en el otro lado (línea base de «solo cambios»).
#[derive(Clone, Copy, Debug)]
struct S { dir: bool, ls: i64, lm: i64, rs: i64, rm: i64 }

#[derive(Default, Debug)]
pub struct Stats { pub up: u32, pub down: u32, pub del: u32, pub dirs: u32, pub moved: u32, pub conflicts: u32, pub errors: u32, pub last_error: Option<String>, pub baseline: bool }
impl Stats {
    pub fn summary(&self) -> String {
        if self.baseline { return "Línea base guardada: desde ahora se sincronizarán solo los cambios".into() }
        let mut s = format!("↑{} ↓{} 🗑{}", self.up, self.down, self.del);
        if self.moved > 0 { s += &format!(" ↔{}", self.moved); }
        if self.dirs > 0 { s += &format!(" 📁{}", self.dirs); }
        if self.conflicts > 0 { s += &format!(" ⚠{} conflictos", self.conflicts); }
        if self.errors > 0 { s += &format!(" · {} errores ({})", self.errors, self.last_error.clone().unwrap_or_default()); }
        s
    }
}

#[derive(Default)]
struct Cx { failed: HashSet<String>, deleted_remote: HashSet<String>, pending_del: Vec<String>, handled: HashSet<String>, local_dir_del: Vec<String>, remote_dir_del: Vec<String>, extra_uploads: Vec<String> }
impl Cx {
    fn fail(&mut self, st: &mut Stats, p: &str, e: Fail) { self.failed.insert(p.to_string()); st.errors += 1; st.last_error = Some(e.to_string().chars().take(80).collect()); }
}

fn retry<T>(mut f: impl FnMut() -> R<T>) -> R<T> {
    match f() { Err(Fail::Io(_)) => { std::thread::sleep(Duration::from_millis(1500)); f() } r => r }
}
fn changed(size: i64, mtime: i64, s0: i64, m0: i64) -> bool { size != s0 || (mtime - m0).abs() > TOL }
fn mtime_of(m: &fs::Metadata) -> i64 { m.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0) }
fn set_mtime(p: &Path, ms: i64) { if ms > 0 { if let Ok(f) = fs::OpenOptions::new().write(true).open(p) { let _ = f.set_modified(SystemTime::UNIX_EPOCH + Duration::from_millis(ms as u64)); } } }

pub struct Engine<'a> { pub api: &'a Api, pub root: PathBuf, pub remote_base: String, pub o: Opts, pub state_file: PathBuf }

impl<'a> Engine<'a> {
    fn rp(&self, rel: &str) -> String { if self.remote_base.is_empty() { rel.to_string() } else { format!("{}/{}", self.remote_base, rel) } }
    fn up(&self) -> bool { self.o.mode != "download" }
    fn down(&self) -> bool { self.o.mode != "upload" }
    fn allow_new(&self) -> bool { self.o.initial_pass || self.o.opt_new }
    fn allow_mod(&self) -> bool { self.o.initial_pass || self.o.opt_mod }
    fn allow_dirs(&self) -> bool { self.o.initial_pass || self.o.opt_dirs }
    fn allow_del(&self) -> bool { !self.o.initial_pass && self.o.opt_del }

    fn scan_local(&self) -> HashMap<String, L> {
        fn walk(d: &Path, rel: &str, out: &mut HashMap<String, L>) {
            let Ok(rd) = fs::read_dir(d) else { return };
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().to_string();
                if (rel.is_empty() && n == TRASH) || n.ends_with(".sbpart") { continue }
                let Ok(md) = fs::symlink_metadata(e.path()) else { continue };
                if md.file_type().is_symlink() { continue }
                let r = if rel.is_empty() { n } else { format!("{}/{}", rel, n) };
                if md.is_dir() { out.insert(r.clone(), L { dir: true, size: 0, mtime: mtime_of(&md) }); walk(&e.path(), &r, out); }
                else if md.is_file() { out.insert(r, L { dir: false, size: md.len() as i64, mtime: mtime_of(&md) }); }
            }
        }
        let mut out = HashMap::new(); walk(&self.root, "", &mut out); out
    }

    // Formato del estado: una línea por ruta: «dir ls lm rs rm ruta»
    fn load(&self) -> HashMap<String, S> {
        let mut m = HashMap::new();
        let Ok(t) = fs::read_to_string(&self.state_file) else { return m };
        for line in t.lines() {
            let mut it = line.splitn(6, ' ');
            let (Some(d), Some(a), Some(b), Some(c), Some(e), Some(p)) = (it.next(), it.next(), it.next(), it.next(), it.next(), it.next()) else { continue };
            if let (Ok(a), Ok(b), Ok(c), Ok(e)) = (a.parse(), b.parse(), c.parse(), e.parse()) { m.insert(p.to_string(), S { dir: d == "1", ls: a, lm: b, rs: c, rm: e }); }
        }
        m
    }
    fn save(&self, m: &HashMap<String, S>) {
        let mut t = String::new();
        for (p, s) in m { if p.contains('\n') { continue } t += &format!("{} {} {} {} {} {}\n", if s.dir { 1 } else { 0 }, s.ls, s.lm, s.rs, s.rm, p); }
        if let Some(d) = self.state_file.parent() { let _ = fs::create_dir_all(d); }
        let tmp = self.state_file.with_extension("tmp");
        if fs::write(&tmp, t).is_ok() { let _ = fs::rename(&tmp, &self.state_file); }
    }

    fn trash_local(&self, rel: &str) -> R<()> {
        let f = self.root.join(rel); let d = self.root.join(TRASH).join(stamp(false)).join(rel);
        if let Some(p) = d.parent() { fs::create_dir_all(p)?; }
        if fs::rename(&f, &d).is_err() { fs::copy(&f, &d)?; fs::remove_file(&f)?; }
        Ok(())
    }
    fn purge_trash(&self) {
        let limit = Duration::from_secs(30 * 24 * 3600);
        if let Ok(rd) = fs::read_dir(self.root.join(TRASH)) {
            for e in rd.flatten() { if e.metadata().and_then(|m| m.modified()).ok().and_then(|m| m.elapsed().ok()).map(|a| a > limit).unwrap_or(false) { let _ = fs::remove_dir_all(e.path()); } }
        }
    }
    fn conflict_copy(&self, rel: &str) -> R<String> {
        let f = self.root.join(rel); let name = f.file_name().unwrap_or_default().to_string_lossy().to_string(); let tag = format!(" (conflicto {})", stamp(true));
        let new_name = match name.rfind('.') { Some(i) if i > 0 => format!("{}{}{}", &name[..i], tag, &name[i..]), _ => format!("{}{}", name, tag) };
        fs::rename(&f, f.with_file_name(&new_name))?;
        Ok(match rel.rfind('/') { Some(i) => format!("{}/{}", &rel[..i], new_name), None => new_name })
    }

    fn ensure_remote_base(&self) -> R<()> {
        let mut parent = String::new();
        for seg in self.remote_base.split('/').filter(|s| !s.is_empty()) {
            match self.api.mkdir(&parent, seg) { Err(Fail::Auth) => return Err(Fail::Auth), _ => {} } // si ya existe, da error y se ignora
            parent = if parent.is_empty() { seg.to_string() } else { format!("{}/{}", parent, seg) };
        }
        Ok(())
    }

    fn upload(&self, p: &str, st: &mut Stats, progress: &mut dyn FnMut(&str)) -> R<()> {
        progress(&format!("↑ {}", p));
        let f = self.root.join(p); let len = fs::metadata(&f)?.len();
        if len > BIG && self.api.has("resumable-upload") { // archivos grandes: por trozos y reanudable
            match self.api.upload_resumable(&self.rp(p), &f) { Ok(()) => { st.up += 1; return Ok(()) } Err(Fail::Api(..)) => {} Err(e) => return Err(e) } // si el servidor la rechaza, se prueba la simple
        }
        retry(|| self.api.upload(&self.rp(p), &f))?; st.up += 1; Ok(())
    }
    fn download(&self, p: &str, r: &Remote, st: &mut Stats, progress: &mut dyn FnMut(&str)) -> R<()> {
        progress(&format!("↓ {}", p));
        let dest = self.root.join(p); if let Some(par) = dest.parent() { fs::create_dir_all(par)?; }
        let tmp = PathBuf::from(format!("{}.sbpart", dest.display()));
        let _ = fs::remove_file(&tmp); // un parcial viejo podría ser de otra versión: solo se reanuda dentro de esta misma descarga
        if let Err(e) = retry(|| self.api.download(&self.rp(p), &tmp, true)) { let _ = fs::remove_file(&tmp); return Err(e) }
        if dest.is_file() { fs::remove_file(&dest)?; }
        fs::rename(&tmp, &dest)?; set_mtime(&dest, r.mtime); st.down += 1; Ok(())
    }
    fn mkdir_remote(&self, p: &str, st: &mut Stats, progress: &mut dyn FnMut(&str)) -> R<()> {
        progress(&format!("📁 {}", p));
        let (parent, name) = match p.rfind('/') { Some(i) => (&p[..i], &p[i + 1..]), None => ("", p) };
        retry(|| self.api.mkdir(&self.rp(parent).trim_matches('/').to_string(), name))?; st.dirs += 1; Ok(())
    }

    /// Renombrados: un archivo que «desaparece» de un lado y aparece con el mismo tamaño y fecha en otro sitio se mueve en el otro lado en vez de borrar y recopiar (servidor 2.25+).
    fn detect_renames(&self, local: &HashMap<String, L>, remote: &HashMap<String, Remote>, snap: &HashMap<String, S>, cx: &mut Cx, st: &mut Stats, progress: &mut dyn FnMut(&str)) {
        if self.o.initial_pass || !self.allow_new() || !self.allow_del() || !self.api.has("sync-move") { return }
        let near = |a: i64, b: i64| (a - b).abs() <= TOL;
        if self.up() {
            let fresh: Vec<(&String, &L)> = local.iter().filter(|(p, l)| !l.dir && l.size > 0 && !snap.contains_key(*p) && !remote.contains_key(*p)).collect();
            for (p, s) in snap {
                if s.dir || s.ls < 0 || s.rs < 0 || local.contains_key(p) || cx.handled.contains(p) { continue }
                let Some(r) = remote.get(p) else { continue };
                if changed(r.size, r.mtime, s.rs, s.rm) { continue }
                let Some((np, _)) = fresh.iter().find(|(k, l)| !cx.handled.contains(*k) && l.size == s.ls && near(l.mtime, s.lm)) else { continue };
                progress(&format!("↔ {} → {}", p, np));
                match retry(|| self.api.mv(&self.rp(p), &self.rp(np))) { Ok(()) => { cx.handled.insert(p.clone()); cx.handled.insert((*np).clone()); st.moved += 1; } _ => {} }
            }
        }
        if self.down() {
            let fresh: Vec<(&String, &Remote)> = remote.iter().filter(|(p, r)| !r.is_dir && r.size > 0 && !snap.contains_key(*p) && !local.contains_key(*p)).collect();
            for (p, s) in snap {
                if s.dir || s.ls < 0 || s.rs < 0 || remote.contains_key(p) || cx.handled.contains(p) { continue }
                let Some(l) = local.get(p) else { continue };
                if changed(l.size, l.mtime, s.ls, s.lm) { continue }
                let Some((np, _)) = fresh.iter().find(|(k, r)| !cx.handled.contains(*k) && r.size == s.rs && near(r.mtime, s.rm)) else { continue };
                let to = self.root.join(np.as_str()); if let Some(par) = to.parent() { let _ = fs::create_dir_all(par); }
                if fs::rename(self.root.join(p), &to).is_ok() { progress(&format!("↔ {} → {}", p, np)); cx.handled.insert(p.clone()); cx.handled.insert((*np).clone()); st.moved += 1; }
            }
        }
    }

    /// Borra en el servidor lo acumulado: por lotes (a la papelera) si el servidor lo permite; si no, uno a uno.
    fn flush_deletes(&self, cx: &mut Cx, st: &mut Stats, progress: &mut dyn FnMut(&str)) -> R<()> {
        let paths = std::mem::take(&mut cx.pending_del);
        if paths.is_empty() { return Ok(()) }
        if self.api.has("sync-delete-batch") {
            for chunk in paths.chunks(200) {
                progress(&format!("🗑 {} elementos", chunk.len()));
                let full: Vec<String> = chunk.iter().map(|p| self.rp(p)).collect();
                match retry(|| self.api.delete_batch(&full)) {
                    Ok(bad) => for p in chunk { match bad.get(&self.rp(p)) { None => { cx.deleted_remote.insert(p.clone()); st.del += 1; } Some(e) => cx.fail(st, p, Fail::Io(e.clone())) } },
                    Err(Fail::Auth) => return Err(Fail::Auth),
                    Err(e) => { let m = e.to_string(); for p in chunk { cx.fail(st, p, Fail::Io(m.clone())); } }
                }
            }
        } else {
            for p in &paths {
                progress(&format!("🗑 {}", p));
                match retry(|| self.api.delete(&self.rp(p))) { Ok(()) => { cx.deleted_remote.insert(p.clone()); st.del += 1; } Err(Fail::Auth) => return Err(Fail::Auth), Err(e) => cx.fail(st, p, e) }
            }
        }
        Ok(())
    }

    /// Decide y hace lo que corresponde con una ruta.
    fn one(&self, p: &str, l: Option<&L>, r: Option<&Remote>, s: Option<&S>, cx: &mut Cx, st: &mut Stats, progress: &mut dyn FnMut(&str)) -> R<()> {
        match (l, r) {
            (Some(l), Some(r)) => {
                if l.dir != r.is_dir { return Err(Fail::Io(format!("tipo distinto (archivo/carpeta) en {}", p))) }
                if l.dir { return Ok(()) }
                if l.size == r.size && (l.mtime - r.mtime).abs() <= TOL { return Ok(()) }
                let known = s.map_or(false, |s| !s.dir && s.ls >= 0 && s.rs >= 0);
                let (lc, rc) = match s { Some(s) if known => (changed(l.size, l.mtime, s.ls, s.lm), changed(r.size, r.mtime, s.rs, s.rm)), _ => (true, true) };
                if lc && !rc { if self.up() && self.allow_mod() { self.upload(p, st, progress)?; } }
                else if !lc && rc { if self.down() && self.allow_mod() { self.download(p, r, st, progress)?; } }
                else if known && !self.allow_mod() { /* modificados desactivado */ }
                else { // cambiaron los dos lados
                    match self.o.mode.as_str() {
                        "upload" => self.upload(p, st, progress)?,
                        "download" => { self.conflict_copy(p)?; self.download(p, r, st, progress)?; st.conflicts += 1; }
                        _ => { let c = self.conflict_copy(p)?; self.download(p, r, st, progress)?; cx.extra_uploads.push(c); st.conflicts += 1; }
                    }
                }
            }
            (Some(l), None) => { // solo existe en el PC
                if l.dir {
                    match s {
                        None => { if self.up() && self.allow_dirs() { self.mkdir_remote(p, st, progress)?; } }
                        Some(s) if s.rs < 0 => {} // ya existía al guardar la línea base: se ignora
                        Some(_) => { if self.allow_del() && self.allow_dirs() && self.down() { cx.local_dir_del.push(p.to_string()); } }
                    }
                } else if let Some(s) = s.filter(|s| !s.dir && s.rs < 0) { // existía solo aquí en la línea base: solo cuenta si se modificó
                    if changed(l.size, l.mtime, s.ls, s.lm) && self.up() && self.allow_mod() { self.upload(p, st, progress)?; }
                } else {
                    let known = s.map_or(false, |s| !s.dir);
                    if known && !changed(l.size, l.mtime, s.unwrap().ls, s.unwrap().lm) && self.allow_del() && self.down() { self.trash_local(p)?; st.del += 1; }
                    else if self.up() && self.allow_new() { self.upload(p, st, progress)?; }
                }
            }
            (None, Some(r)) => { // solo existe en el servidor
                if r.is_dir {
                    match s {
                        None => { if self.down() && self.allow_dirs() { if fs::create_dir_all(self.root.join(p)).is_ok() { st.dirs += 1; } } }
                        Some(s) if s.ls < 0 => {}
                        Some(_) => {
                            if self.allow_del() && self.allow_dirs() && self.up() { cx.remote_dir_del.push(p.to_string()); }
                            else if self.down() && self.allow_dirs() { if fs::create_dir_all(self.root.join(p)).is_ok() { st.dirs += 1; } }
                        }
                    }
                } else if let Some(s) = s.filter(|s| !s.dir && s.ls < 0) {
                    if changed(r.size, r.mtime, s.rs, s.rm) && self.down() && self.allow_mod() { self.download(p, r, st, progress)?; }
                } else {
                    let known = s.map_or(false, |s| !s.dir);
                    if known && !changed(r.size, r.mtime, s.unwrap().rs, s.unwrap().rm) && self.allow_del() && self.up() { cx.pending_del.push(p.to_string()); }
                    else if self.down() && self.allow_new() { self.download(p, r, st, progress)?; }
                }
            }
            (None, None) => {}
        }
        Ok(())
    }

    pub fn run(&self, cancel: &AtomicBool, progress: &mut dyn FnMut(&str), step: &mut dyn FnMut(usize, usize)) -> R<Stats> {
        let mut st = Stats::default();
        fs::create_dir_all(&self.root)?;
        let writable = fs::metadata(&self.root).map(|m| m.is_dir() && !m.permissions().readonly()).unwrap_or(false);
        if !writable { return Err(Fail::Io("No se puede escribir en la carpeta local".into())) }
        self.purge_trash(); self.ensure_remote_base()?;
        let remote = self.api.tree(&self.remote_base)?;
        let local = self.scan_local();
        let snap = self.load();
        if snap.len() > 10 && local.is_empty() { return Err(Fail::Io("La carpeta local aparece vacía (¿disco sin montar?): sincronización cancelada por seguridad".into())) }
        if snap.len() > 10 && remote.is_empty() { return Err(Fail::Io("La carpeta remota aparece vacía: sincronización cancelada por seguridad".into())) }

        // «Solo cambios desde ahora»: la primera pasada solo guarda la línea base y no copia nada
        if self.o.strategy == "changes_only" && self.o.initial_pass {
            let mut ns = HashMap::new();
            for p in local.keys().chain(remote.keys()) {
                let (l, r) = (local.get(p), remote.get(p));
                ns.insert(p.clone(), S { dir: l.map(|l| l.dir).or(r.map(|r| r.is_dir)).unwrap_or(false), ls: l.map_or(-1, |l| l.size), lm: l.map_or(-1, |l| l.mtime), rs: r.map_or(-1, |r| r.size), rm: r.map_or(-1, |r| r.mtime) });
            }
            self.save(&ns); st.baseline = true; return Ok(st);
        }

        let mut cx = Cx::default();
        self.detect_renames(&local, &remote, &snap, &mut cx, &mut st, progress);
        let all: BTreeSet<&String> = local.keys().chain(remote.keys()).collect();
        let n = all.len();
        for (i, p) in all.iter().enumerate() {
            if cancel.load(Ordering::Relaxed) { return Err(Fail::Io("Sincronización cancelada".into())) }
            step(i, n);
            if cx.handled.contains(*p) { continue }
            match self.one(p, local.get(*p), remote.get(*p), snap.get(*p), &mut cx, &mut st, progress) {
                Ok(()) => {}
                Err(Fail::Auth) => return Err(Fail::Auth),
                Err(e) => cx.fail(&mut st, p, e),
            }
        }
        if cancel.load(Ordering::Relaxed) { return Err(Fail::Io("Sincronización cancelada".into())) }
        self.flush_deletes(&mut cx, &mut st, progress)?;
        for c in std::mem::take(&mut cx.extra_uploads) { match self.upload(&c, &mut st, progress) { Ok(()) => {} Err(Fail::Auth) => return Err(Fail::Auth), Err(e) => cx.fail(&mut st, &c, e) } }
        let mut ld = std::mem::take(&mut cx.local_dir_del); ld.sort_by_key(|d| std::cmp::Reverse(d.len()));
        for d in ld { if fs::remove_dir(self.root.join(&d)).is_ok() { st.dirs += 1; } } // solo si ya está vacía
        let mut rd = std::mem::take(&mut cx.remote_dir_del); rd.sort_by_key(|d| std::cmp::Reverse(d.len()));
        for d in rd {
            let busy = remote.keys().any(|k| k.starts_with(&format!("{}/", d)) && !cx.deleted_remote.contains(k)); // nunca borra una carpeta que aún tenga algo
            if busy { continue }
            match retry(|| self.api.delete(&self.rp(&d))) { Ok(()) => { cx.deleted_remote.insert(d.clone()); st.dirs += 1; } Err(Fail::Auth) => return Err(Fail::Auth), Err(e) => cx.fail(&mut st, &d, e) }
        }

        // Nueva foto: lo que existe en los dos lados y no falló, más las entradas de línea base que siguen sin tocarse
        let remote2 = self.api.tree(&self.remote_base)?; let local2 = self.scan_local(); let mut ns: HashMap<String, S> = HashMap::new();
        for p in local2.keys().chain(remote2.keys()) {
            if cx.failed.contains(p) { continue }
            match (local2.get(p), remote2.get(p)) {
                (Some(l), Some(r)) => { if l.dir == r.is_dir { ns.insert(p.clone(), S { dir: l.dir, ls: l.size, lm: l.mtime, rs: r.size, rm: r.mtime }); } }
                (l, r) => { if let Some(old) = snap.get(p) { if (l.is_some() && old.rs < 0) || (r.is_some() && old.ls < 0) { ns.insert(p.clone(), *old); } } }
            }
        }
        self.save(&ns);
        Ok(st)
    }
}
