/* SDK de plugins (cliente). Los plugins activos lo reciben antes que su propio client.js.
   window.SynapseBox = { page, ready(fn), api(url, body, method), css(texto), html(selector, html), toast(msg), on(evento, fn), emit(evento, datos), session(), admin({id,title,render(el,helpers)}) } */
(() => {
  const ev = {};
  const SB = window.SynapseBox = {
    page: location.pathname.replace(/^\/|\.html$/g, "") || "index",
    ready: fn => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn) : fn(),
    async api(url, body, method) {
      const o = { method: method || (body ? "POST" : "GET"), headers: {} };
      if (body instanceof FormData) o.body = body; else if (body) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
      const r = await fetch(url, o), d = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(d.error || "Error " + r.status);
      return d;
    },
    css(text, id) { const s = document.createElement("style"); if (id) s.id = id; s.textContent = text; document.head.append(s); return s; },
    html(sel, h) { const e = document.querySelector(sel); if (e) e.innerHTML = h; return e; },
    toast(m, err) { const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 3500); },
    on(n, fn) { (ev[n] ||= []).push(fn); },
    emit(n, d) { (ev[n] || []).forEach(f => { try { f(d); } catch (e) { console.warn(e); } }); },
    session: () => SB.api("/api/session"),
    // Registra una sección de configuración en Administración → Extensiones (solo en la página de administración).
    adminSections: [],
    admin(def) {
      if (!def || !def.id || typeof def.render !== "function" || !SB.page.startsWith("admin")) return; // «admin», «admin/» y «admin/index»
      if (SB.adminSections.some(x => x.id === def.id)) return;
      SB.adminSections.push({ title: def.id, ...def });
      SB.adminSections.sort((a, b) => String(a.title).localeCompare(b.title));
      SB.ready(() => { const t = document.getElementById("extTab"); if (t) { t.hidden = false; t.style.display = ""; } });
    },
  };
  SB.ready(() => SB.emit("ready", SB.page));
})();
