// Página del anuncio: abre el anuncio, espera el tiempo mínimo y da el crédito.
(() => {
  const b = document.getElementById("go"), m = document.getElementById("m"), t = document.body.dataset.token, min = +document.body.dataset.min || 15;
  if (!b) return;
  const say = s => { m.textContent = s; };
  b.onclick = async () => {
    b.disabled = true; say("Abriendo…");
    try {
      const r = await fetch("/ads/open/" + encodeURIComponent(t), { method: "POST" }), d = await r.json();
      if (!r.ok) throw Error(d.error || "Error");
      const w = window.open(d.url, "_blank", "noopener,noreferrer");
      if (!w) { b.disabled = false; return say("El navegador bloqueó la ventana: permítela e inténtalo de nuevo."); }
      if (d.direct) { // enlace directo: se espera aquí el tiempo mínimo
        let n = min; say(`Espera ${n} s…`);
        const i = setInterval(() => { n--; if (n <= 0) { clearInterval(i); location.href = "/ads/r/" + encodeURIComponent(t); } else say(`Espera ${n} s…`); }, 1000);
      } else { // acortador: al terminar vuelve a /ads/r/…; aquí se vigila
        say("Completa los pasos del anuncio. Esta página se actualizará sola.");
        const i = setInterval(async () => { try { const s = await (await fetch("/ads/state/" + encodeURIComponent(t))).json(); if (s.done) { clearInterval(i); say("✅ ¡Listo! Ya puedes volver."); } } catch { } }, 3000);
      }
    } catch (e) { b.disabled = false; say(e.message); }
  };
})();
