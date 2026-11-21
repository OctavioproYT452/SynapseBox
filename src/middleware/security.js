// Cabeceras de seguridad, cuerpo de las peticiones y protección CSRF.
const express = require("express");

const headers = (req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN", "Referrer-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "same-origin", "X-Permitted-Cross-Domain-Policies": "none"
  });
  if (req.secure) res.set("Strict-Transport-Security", "max-age=31536000"); // solo tras HTTPS (con TRUST_PROXY=1 detrás de un proxy)
  if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store"); // las respuestas de la API nunca se guardan en cachés
  next();
};
// Orígenes de apps con WebView (Capacitor, Tauri, Electron…) que pueden llamar a la API con token Bearer. Variable CORS_ORIGINS, separados por comas.
// Ej.: CORS_ORIGINS=capacitor://localhost,https://tauri.localhost,http://localhost. Vacío (por defecto) = ninguno. Las apps nativas (sin WebView) no lo necesitan.
const ORIGINS = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
const cors = (req, res, next) => {
  const o = req.headers.origin;
  if (o && ORIGINS.includes(o) && req.path.startsWith("/api/")) {
    res.set({ "Access-Control-Allow-Origin": o, Vary: "Origin", "Access-Control-Allow-Headers": "Authorization, Content-Type, Upload-Offset", "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", "Access-Control-Max-Age": "600", "Access-Control-Expose-Headers": "Content-Disposition, Accept-Ranges, Content-Range" }); // sin Allow-Credentials: las cookies no viajan, solo el token
    if (req.method === "OPTIONS") return res.status(204).end();
  }
  next();
};
const body = [express.json({ limit: "3mb" }), express.urlencoded({ extended: false, limit: "10kb" })];
const csrf = (req, res, next) => { // protección CSRF: el origen debe coincidir con el host
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const o = req.headers.origin, authPath = /^\/api\/(login|login\/2fa|register|recover|recover\/check)$/.test(req.path);
    if (/^Bearer /i.test(String(req.headers.authorization || ""))) return next(); // con token Bearer no hay cookie de por medio: no hay CSRF
    if (o && ORIGINS.includes(o) && authPath) return next(); // app con WebView iniciando sesión
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) throw 0; }
      catch { return res.status(403).json({ error: "Origen no permitido" }); }
    } else if (req.headers["sec-fetch-site"] === "cross-site") return res.status(403).json({ error: "Origen no permitido" }); // sin Origin: el navegador dice que viene de otro sitio
  }
  next();
};

module.exports = { headers, cors, body, csrf };
