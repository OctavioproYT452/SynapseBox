// Punto de arranque: crea la app de Express, monta middleware y rutas, y escucha en el puerto.
require("./lib/env"); // lee el archivo .env (PORT, DISCORD_TOKEN…) antes que nada
const express = require("express"), fs = require("fs"), path = require("path");
const { get, run, now } = require("./db");
const { PORT, HOSTING, TMP, PUBLIC } = require("./config");
const ver = require("./version");
const ai = require("./ai");
const security = require("./middleware/security");
const { session } = require("./middleware/auth");
const { purgeFails } = require("./services/auth");
const discord = require("./discord");

fs.mkdirSync(HOSTING, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });

const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", 1);

// ---------- middleware ----------
app.use(security.headers);
app.use("/dav", require("./routes/webdav").dav); // WebDAV antes del lector de cuerpos: los PUT llegan como flujo
app.use(security.body);
app.use(security.csrf); // protección CSRF: el origen debe coincidir con el host
app.use(session);
app.use(require("./discord/activity")); // registro de actividad hacia Discord (no hace nada si el bot no está configurado)
const plugins = require("./services/plugins");
app.use(plugins.assets);     // archivos de los plugins activos: /plugins/<id>/…
app.use(plugins.middleware); // rutas y middleware de los plugins: van ANTES que las rutas de SynapseBox para poder cambiarlas
ai.init(); // Agente de IA: la configuración se lee de la base de datos al iniciar (y cuando el admin la cambia)

// ---------- rutas de la API y páginas públicas ----------
app.use(require("./routes/plugins"));
app.use(require("./routes/auth"));
app.use(require("./routes/security"));
app.use(require("./routes/files"));
app.use(require("./routes/trash"));
app.use(require("./routes/cleanup"));
app.use(require("./routes/stats"));
app.use(require("./routes/shares"));
app.use(require("./routes/collab"));
app.use(require("./routes/share-page"));
app.use(require("./routes/admin"));
app.use(require("./routes/ai"));
app.use(require("./routes/discord"));
app.use(require("./routes/discord-custom"));
app.use(require("./routes/themes"));
app.use(require("./routes/tmedia"));
app.use(require("./routes/explore"));
app.use(require("./routes/webdav"));
app.use(require("./routes/office"));

// ---------- páginas estáticas protegidas ----------
app.get(["/", "/index.html"], (req, res, next) => req.user ? res.redirect("/panel.html") : next());
app.get(["/panel.html", "/themes.html"], (req, res, next) => req.user ? next() : res.redirect("/"));
app.use("/admin", (req, res, next) => req.user?.is_admin ? next() : res.redirect("/"));
app.use(plugins.html); // inyecta los plugins activos en las páginas HTML
app.get("/api/health", (req, res) => res.json({ ok: true })); // para comprobar desde un proxy, PM2 o un monitor que el servidor responde
app.use(express.static(PUBLIC, { setHeaders: (res, file) => { if (file.includes(path.sep + "vendor" + path.sep)) res.set("Cache-Control", "public, max-age=604800"); } })); // /vendor casi nunca cambia: caché de 7 días
app.use((err, req, res, next) => { console.error("Error en " + req.method + " " + req.path + ":", err?.message || err); if (res.headersSent) return next(err); res.status(500).json({ error: "Error interno" }); });

// Una promesa rechazada en un plugin o en el bot de Discord no debe tumbar todo el servidor: se avisa en la consola y sigue funcionando
process.on("unhandledRejection", e => console.error("Aviso (promesa sin gestionar):", e?.message || e));

// ---------- mantenimiento periódico ----------
setInterval(() => {
  run("DELETE FROM sessions WHERE expires_at<?", now());
  run("DELETE FROM shares WHERE expires_at IS NOT NULL AND expires_at<?", now());
  ai.purge();
  purgeFails();
  require("./services/twofa").purgeTickets();
  require("./services/trash").sweep().catch(() => { }); // vacía de la papelera lo que superó los días indicados
}, 36e5).unref();
setTimeout(() => require("./services/trash").sweep().catch(() => { }), 20000).unref();

if (!get("SELECT COUNT(*) n FROM users").n)
  console.warn("AVISO: no hay usuarios en la base de datos. Si vienes de la versión anterior, copia tu users.json a data/ y reinicia; o crea un usuario con: node tools/reset-password.js <usuario> <contraseña> --admin");
ver.start();
plugins.init(app).then(() => plugins.emit("server:start", {})); // carga los plugins activados
discord.start(); // bot de Discord opcional: solo arranca si hay DISCORD_TOKEN en .env
const server = app.listen(PORT, () => { console.log(`SynapseBox corriendo en http://localhost:${PORT}`); console.log("Agente de IA: " + ai.describe()); });
server.on("error", e => { console.error(e.code === "EADDRINUSE" ? `El puerto ${PORT} ya está en uso: cambia PORT en el .env o cierra la otra copia de SynapseBox.` : "No se pudo iniciar el servidor: " + e.message); process.exit(1); });
// Cierre ordenado (PM2, systemd, Ctrl+C): deja de aceptar conexiones y termina; si algo se queda colgado, sale a los 5 s
for (const sig of ["SIGTERM", "SIGINT"]) process.once(sig, () => { console.log("Cerrando SynapseBox…"); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
