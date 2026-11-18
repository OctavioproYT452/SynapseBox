// Anuncios para usar la IA: páginas públicas del anuncio (/ads/…) y configuración del administrador.
const router = require("express").Router();
const { wrap, esc } = require("../lib/utils");
const { need, needAdmin } = require("../middleware/auth");
const ads = require("../services/ads");

const hits = new Map(); // límite sencillo por IP (30 peticiones/min) para no poder spamear acortadores
const rate = (req, res, next) => {
  const t = Date.now(), a = (hits.get(req.ip) || []).filter(x => x > t - 6e4);
  if (a.length >= 30) return res.status(429).json({ error: "Demasiadas peticiones. Espera un minuto." });
  a.push(t); hits.set(req.ip, a); if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(x => x > t - 6e4)) hits.delete(k);
  next();
};
const page = (title, body, attrs = "") => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title><style>
:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#f4f5f8;color:#1b1d24}
@media(prefers-color-scheme:dark){body{background:#14161c;color:#e8eaf0}.c{background:#1d2028!important}}
.c{max-width:420px;margin:16px;padding:28px;border-radius:16px;background:#fff;box-shadow:0 8px 30px #0002;text-align:center}
h1{font-size:1.25rem;margin:0 0 8px}p{margin:8px 0;opacity:.85}.b{display:inline-block;margin-top:14px;padding:11px 22px;border:0;border-radius:10px;background:#5b6cff;color:#fff;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
.b[disabled]{opacity:.5;cursor:default}#m{min-height:1.5em;font-size:.9rem}</style></head><body ${attrs}><div class="c">${body}</div><script src="/js/ads.js" defer></script></body></html>`;
const noStore = (req, res, next) => { res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); next(); };

// El usuario del panel pide un anuncio: se crea la sesión y se le lleva a la página
router.get("/ads/go", need, rate, noStore, (req, res) => {
  try { res.redirect(ads.start(req.query.scope === "discord" ? "discord" : "panel", { u: req.user }, req)); }
  catch (e) { res.status(400).send(page("Anuncio", `<h1>No disponible</h1><p>${esc(e.message)}</p><a class="b" href="/panel.html">Volver</a>`)); }
});
router.get("/ads/w/:token", rate, noStore, (req, res) => {
  const s = ads.session(req.params.token), c = ads.cfg();
  if (!s) return res.status(404).send(page("Anuncio", `<h1>Enlace caducado</h1><p>Este anuncio ya se usó o caducó. Pide uno nuevo desde la IA.</p>`));
  const sc = c.scopes[s.scope], gives = sc.mode === "timed" ? `acceso a la IA durante ${sc.minutes >= 60 && sc.minutes % 60 === 0 ? sc.minutes / 60 + " h" : sc.minutes + " min"}` : `${sc.uses} uso${sc.uses === 1 ? "" : "s"} de la IA`;
  res.send(page("Ver anuncio", `<h1>Apoya el servidor</h1><p>Mira el anuncio al menos <b>${c.min_seconds} s</b> y recibirás <b>${esc(gives)}</b>.</p><button class="b" id="go">Ver anuncio</button><p id="m"></p>`, `data-token="${esc(req.params.token)}" data-min="${c.min_seconds}"`));
});
router.post("/ads/open/:token", rate, noStore, wrap(async (req, res) => res.json(await ads.open(req.params.token, req))));
router.get("/ads/state/:token", rate, noStore, (req, res) => res.json({ done: ads.done(req.params.token) }));
// Destino al terminar el anuncio (lo abre el acortador o el temporizador de la página): da el crédito
router.get("/ads/r/:token", rate, noStore, (req, res) => {
  try {
    const r = ads.claim(req.params.token);
    res.send(page("¡Listo!", `<h1>¡Gracias! ✅</h1><p>${r.mode === "timed" ? `Ya puedes usar la IA durante ${r.minutes} min.` : `Has recibido ${r.uses} uso${r.uses === 1 ? "" : "s"} de IA.`}</p><p>Puedes cerrar esta pestaña y volver a lo que estabas haciendo.</p><a class="b" href="/panel.html">Ir al panel</a>`));
  } catch (e) { res.status(400).send(page("Anuncio", `<h1>No se pudo validar</h1><p>${esc(e.message)}</p>`)); }
});
router.get("/api/ads/status", need, (req, res) => res.json(ads.mine(req.user)));

// Administración
router.get("/api/admin/ads", needAdmin, (req, res) => res.json(ads.publicConfig()));
router.post("/api/admin/ads", needAdmin, wrap(async (req, res) => { ads.save(req.body || {}); res.json({ success: true, ...ads.publicConfig() }); }));
router.post("/api/admin/ads/test", needAdmin, wrap(async (req, res) => res.json({ ok: true, result: await ads.test() })));
module.exports = router;
