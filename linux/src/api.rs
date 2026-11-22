//! Cliente de la API de SynapseBox (bloqueante: llamar desde hilos de fondo).
use reqwest::blocking::{Body, Client, RequestBuilder, Response};
use reqwest::Method;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug)]
pub enum Fail { Auth, Api(u16, String), Io(String) }
impl std::fmt::Display for Fail {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self { Fail::Auth => write!(f, "La sesión ha caducado"), Fail::Api(_, m) => write!(f, "{}", m), Fail::Io(m) => write!(f, "{}", m) }
    }
}
impl From<std::io::Error> for Fail { fn from(e: std::io::Error) -> Self { Fail::Io(e.to_string()) } }
impl From<reqwest::Error> for Fail {
    fn from(e: reqwest::Error) -> Self {
        if e.is_connect() { Fail::Io("No se pudo conectar con el servidor".into()) } else if e.is_timeout() { Fail::Io("El servidor tardó demasiado en responder".into()) } else { Fail::Io(e.to_string()) }
    }
}
pub type R<T> = Result<T, Fail>;

#[derive(Clone, Debug)]
pub struct Remote { pub is_dir: bool, pub size: i64, pub mtime: i64 }
#[derive(Clone, Default, Debug)]
pub struct ServerInfo { pub version: String, pub api: i64, pub features: Vec<String> }
#[derive(Debug, Default)]
pub struct LoginRes { pub need2fa: bool, pub ticket: Option<String>, pub token: Option<String>, pub expires_at: i64, pub codes: Vec<String> }

pub struct Api { server: String, token: String, http: Client, ngrok: bool, info: Mutex<Option<(Instant, ServerInfo)>> }

/// Añade https:// o http:// si falta (http para IP y nombres de red local) y quita la barra final.
pub fn normalize(s: &str) -> Option<String> {
    let mut t = s.trim().trim_end_matches('/').to_string();
    if t.is_empty() { return None }
    if !t.contains("://") {
        let host = t.split(['/', ':']).next().unwrap_or("");
        let local = host == "localhost" || host.ends_with(".local") || host.parse::<std::net::Ipv4Addr>().is_ok() || !host.contains('.');
        t = format!("{}://{}", if local { "http" } else { "https" }, t);
    }
    if t.starts_with("http://") || t.starts_with("https://") { Some(t) } else { None }
}
pub fn is_ngrok(url: &str) -> bool { url.to_lowercase().contains("ngrok") }

fn client(ngrok: bool) -> Client {
    let ua = if ngrok { format!("SynapseBoxLinux/{} (desktop)", crate::config::VERSION) } else { format!("Mozilla/5.0 (X11; Linux) SynapseBoxLinux/{}", crate::config::VERSION) };
    Client::builder().user_agent(ua).connect_timeout(Duration::from_secs(20)).timeout(None::<Duration>).build().expect("cliente HTTP")
}

/// ¿Hay un SynapseBox en esta dirección? Devuelve su versión.
pub fn probe(server: &str) -> Option<String> {
    let ng = is_ngrok(server);
    let c = Client::builder().user_agent("SynapseBoxLinux").connect_timeout(Duration::from_secs(6)).timeout(Duration::from_secs(8)).build().ok()?;
    let mut rb = c.get(format!("{}/api/health", server.trim_end_matches('/')));
    if ng { rb = rb.header("ngrok-skip-browser-warning", "true"); }
    let j: Value = serde_json::from_str(&rb.send().ok()?.text().ok()?).ok()?;
    if j["app"].as_str() == Some("SynapseBox") { Some(j["version"].as_str().unwrap_or("?").to_string()) } else if j["ok"].as_bool() == Some(true) { Some("?".into()) } else { None }
}

fn json_of(r: Response) -> R<Value> {
    let t = r.text()?;
    serde_json::from_str(&t).map_err(|_| Fail::Io("Respuesta no válida del servidor (¿es la dirección correcta?)".into()))
}
fn parse_login(j: &Value) -> LoginRes {
    LoginRes {
        need2fa: j["need2fa"].as_bool().unwrap_or(false), ticket: j["ticket"].as_str().map(String::from), token: j["token"].as_str().map(String::from),
        expires_at: j["expires_at"].as_i64().unwrap_or(0),
        codes: j["codes"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default(),
    }
}

impl Api {
    pub fn new(server: &str, token: &str) -> Api {
        let ngrok = is_ngrok(server);
        Api { server: server.trim_end_matches('/').to_string(), token: token.to_string(), http: client(ngrok), ngrok, info: Mutex::new(None) }
    }
    fn rb(&self, m: Method, path: &str, auth: bool) -> RequestBuilder {
        let mut b = self.http.request(m, format!("{}/{}", self.server, path.trim_start_matches('/')));
        if auth && !self.token.is_empty() { b = b.header("Authorization", format!("Bearer {}", self.token)); }
        if self.ngrok { b = b.header("ngrok-skip-browser-warning", "true"); }
        b
    }
    fn check(&self, r: Response, auth: bool) -> R<Response> {
        let st = r.status();
        if st.as_u16() == 401 && auth { return Err(Fail::Auth) }
        if !st.is_success() {
            let t = r.text().unwrap_or_default();
            let m = serde_json::from_str::<Value>(&t).ok().and_then(|v| v["error"].as_str().map(String::from)).unwrap_or_else(|| format!("Error {}", st.as_u16()));
            return Err(Fail::Api(st.as_u16(), m));
        }
        Ok(r)
    }
    fn send(&self, b: RequestBuilder, auth: bool) -> R<Response> { let r = b.send()?; self.check(r, auth) }
    fn post(&self, path: &str, body: &Value, auth: bool) -> R<Value> {
        json_of(self.send(self.rb(Method::POST, path, auth).header("Content-Type", "application/json").body(body.to_string()), auth)?)
    }

    // ---------- Cuenta ----------
    pub fn registration_open(&self) -> Option<bool> { json_of(self.send(self.rb(Method::GET, "api/session", false), false).ok()?).ok()?["registration"].as_bool() }
    pub fn login(&self, user: &str, pass: &str) -> R<LoginRes> {
        Ok(parse_login(&self.post("api/login", &json!({"username": user, "password": pass, "client": "linux", "device": crate::config::hostname()}), false)?))
    }
    pub fn login2fa(&self, ticket: &str, code: &str) -> R<LoginRes> {
        Ok(parse_login(&self.post("api/login/2fa", &json!({"ticket": ticket, "code": code, "client": "linux", "device": crate::config::hostname()}), false)?))
    }
    pub fn register(&self, user: &str, pass: &str, pass2: &str) -> R<LoginRes> {
        Ok(parse_login(&self.post("api/register", &json!({"username": user, "password": pass, "password2": pass2, "client": "linux", "device": crate::config::hostname()}), false)?))
    }
    pub fn renew(&self) -> R<i64> { Ok(self.post("api/session/renew", &json!({}), true)?["expires_at"].as_i64().unwrap_or(0)) }
    pub fn logout(&self) { let _ = self.post("api/logout", &json!({}), true); }
    /// (bytes usados, máximo en MB; -1 = sin límite)
    pub fn usage(&self) -> R<(i64, i64)> {
        let j = json_of(self.send(self.rb(Method::GET, "api/list", true).query(&[("path", "")]), true)?)?;
        Ok((j["usedBytes"].as_i64().unwrap_or(0), j["maxMB"].as_i64().unwrap_or(-1)))
    }

    // ---------- Funciones del servidor (2.25+) ----------
    pub fn server_info(&self) -> ServerInfo {
        if let Some((t, i)) = self.info.lock().unwrap().as_ref() { if t.elapsed() < Duration::from_secs(600) { return i.clone() } }
        let i = match self.send(self.rb(Method::GET, "api/client/info", !self.token.is_empty()), true).and_then(json_of) {
            Ok(j) => ServerInfo { version: j["version"].as_str().unwrap_or("").into(), api: j["api"].as_i64().unwrap_or(0),
                features: j["features"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default() },
            Err(_) => ServerInfo::default(), // servidor antiguo o sin conexión: sin funciones extra
        };
        *self.info.lock().unwrap() = Some((Instant::now(), i.clone())); i
    }
    pub fn has(&self, feature: &str) -> bool { self.server_info().features.iter().any(|f| f == feature) }

    // ---------- Archivos ----------
    pub fn tree(&self, remote: &str) -> R<HashMap<String, Remote>> {
        let j = json_of(self.send(self.rb(Method::GET, "api/sync/tree", true).query(&[("path", remote)]), true)?)?;
        let mut out = HashMap::new();
        for o in j["items"].as_array().cloned().unwrap_or_default() {
            if let Some(p) = o["path"].as_str() { out.insert(p.to_string(), Remote { is_dir: o["isDir"].as_bool().unwrap_or(false), size: o["size"].as_i64().unwrap_or(0), mtime: o["mtime"].as_i64().unwrap_or(0) }); }
        }
        Ok(out)
    }
    pub fn mkdir(&self, parent: &str, name: &str) -> R<()> { self.post("api/mkdir", &json!({"path": parent, "name": name}), true).map(|_| ()) }
    pub fn delete(&self, path: &str) -> R<()> { self.post("api/delete", &json!({"path": path}), true).map(|_| ()) }
    pub fn mv(&self, from: &str, to: &str) -> R<()> { self.post("api/sync/move", &json!({"from": from, "to": to}), true).map(|_| ()) }
    /// Borra varias rutas a la papelera en una llamada; devuelve las que fallaron (ruta → motivo).
    pub fn delete_batch(&self, paths: &[String]) -> R<HashMap<String, String>> {
        let j = self.post("api/sync/delete-batch", &json!({"paths": paths}), true)?;
        let mut bad = HashMap::new();
        for o in j["results"].as_array().cloned().unwrap_or_default() {
            if o["ok"].as_bool() != Some(true) { bad.insert(o["path"].as_str().unwrap_or("").to_string(), o["error"].as_str().unwrap_or("error").to_string()); }
        }
        Ok(bad)
    }

    /// Descarga a `dest`. Con `resume` y un servidor con `download-range`, continúa un archivo parcial existente.
    pub fn download(&self, remote: &str, dest: &Path, resume: bool) -> R<()> {
        let have = if resume && dest.exists() && self.has("download-range") { fs::metadata(dest)?.len() } else { 0 };
        let mut rb = self.rb(Method::GET, "api/download", true).query(&[("path", remote)]);
        if have > 0 { rb = rb.header("Range", format!("bytes={}-", have)); }
        let mut r = self.send(rb, true)?;
        let append = have > 0 && r.status().as_u16() == 206;
        let mut o = OpenOptions::new(); o.create(true).write(true); if append { o.append(true); } else { o.truncate(true); }
        let mut f = o.open(dest)?;
        std::io::copy(&mut r, &mut f)?;
        Ok(())
    }

    fn mtime_ms(f: &Path) -> i64 { fs::metadata(f).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0) }

    /// Subida simple: el cuerpo es el archivo; el servidor sobrescribe y fija la fecha.
    pub fn upload(&self, remote: &str, file: &Path) -> R<()> {
        let f = File::open(file)?; let len = f.metadata()?.len();
        let mt = Self::mtime_ms(file).to_string();
        let rb = self.rb(Method::PUT, "api/sync/file", true).query(&[("path", remote), ("mtime", mt.as_str())])
            .header("Content-Type", "application/octet-stream").body(Body::sized(f, len));
        self.send(rb, true).map(|_| ())
    }

    /// Subida por trozos que continúa si la conexión se corta; al final el servidor comprueba el SHA-256.
    pub fn upload_resumable(&self, remote: &str, file: &Path) -> R<()> {
        let size = fs::metadata(file)?.len();
        let init = self.post("api/sync/upload", &json!({"path": remote, "size": size, "mtime": Self::mtime_ms(file)}), true)?;
        let id = init["id"].as_str().ok_or_else(|| Fail::Io("Respuesta no válida del servidor".into()))?.to_string();
        let chunk = init["chunkMax"].as_u64().unwrap_or(4 << 20).min(4 << 20).max(64 * 1024);
        let (mut offset, mut fails) = (0u64, 0u32);
        while offset < size {
            let len = chunk.min(size - offset);
            let attempt = (|| -> R<u64> {
                let mut f = File::open(file)?; f.seek(SeekFrom::Start(offset))?;
                let rb = self.rb(Method::PATCH, &format!("api/sync/upload/{}", id), true).header("Upload-Offset", offset.to_string())
                    .header("Content-Type", "application/offset+octet-stream").body(Body::sized(f.take(len), len));
                Ok(json_of(self.send(rb, true)?)?["offset"].as_u64().unwrap_or(offset))
            })();
            match attempt {
                Ok(o) => { offset = o; fails = 0; }
                Err(Fail::Auth) => return Err(Fail::Auth),
                Err(e) => {
                    if let Fail::Api(c, _) = e { if (400..500).contains(&c) && c != 409 { return Err(e) } }
                    fails += 1; if fails > 5 { return Err(e) }
                    std::thread::sleep(Duration::from_millis(1500 * fails as u64));
                    // el servidor sabe cuánto recibió de verdad
                    if let Ok(r) = self.send(self.rb(Method::GET, &format!("api/sync/upload/{}", id), true), true).and_then(json_of) { offset = r["offset"].as_u64().unwrap_or(offset); }
                }
            }
        }
        let mut h = Sha256::new(); let mut f = File::open(file)?; let mut buf = vec![0u8; 64 * 1024];
        loop { let n = f.read(&mut buf)?; if n == 0 { break } h.update(&buf[..n]); }
        let sha: String = h.finalize().iter().map(|b| format!("{:02x}", b)).collect();
        self.post(&format!("api/sync/upload/{}/commit", id), &json!({"sha256": sha}), true).map(|_| ())
    }
}
