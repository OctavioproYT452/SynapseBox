// Wiki de SBScript: guías, recetas y referencia de funciones con buscador, filtros por categoría, "nuevo en esta versión" y resaltado de la sección actual.
(()=>{
const nav=$('#wnav'),body=$('#wbody');
const md=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/`([^`]+)`/g,'<code>$1</code>');
const sig=d=>'$'+d.n+(d.a?'['+d.a+']':'');
const slug=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-');
let W=null,NEW=new Set(),cat='',q='';
const GICON={inicio:ic('rocket'),sintaxis:ic('edit'),condiciones:ic('branch'),variables:ic('save'),respuestas:ic('palette'),captcha:ic('lock'),ia:ic('robot'),http:ic('globe'),opciones:ic('sliders'),permisos:ic('shield'),limites:ic('ruler'),faq:ic('wrench'),otros:ic('users'),botones:ic('radiobtn'),tickets:ic('ticket'),recetas:ic('utensils')};
const EMBED=`<div class="dc-anat"><div class="dc-anat-card"><div class="dc-a-row"><i>1</i><span class="dc-a-av"></span><b>Autor</b></div><div class="dc-a-row"><i>2</i><b class="dc-a-t">Título del mensaje</b></div><div class="dc-a-cols"><div><div class="dc-a-row"><i>3</i>Texto principal de la tarjeta, puede ocupar varias líneas.</div><div class="dc-a-fields"><div><i>5</i><b>Campo</b><br>valor</div><div><b>Campo</b><br>valor</div></div></div><div class="dc-a-th"><i>4</i></div></div><div class="dc-a-img"><i>6</i>Imagen grande</div><div class="dc-a-row dc-a-foot"><i>7</i><span class="dc-a-av sm"></span>Pie · hora</div></div></div>`;
function blockHtml(b){
  if(b.t==='p')return`<p>${md(b.v)}</p>`;
  if(b.t==='ul')return`<ul>${b.v.map(x=>`<li>${md(x)}</li>`).join('')}</ul>`;
  if(b.t==='tip')return`<div class="dc-tip">${ic('bulb')} <div>${md(b.v)}</div></div>`;
  if(b.t==='embed')return EMBED;
  if(b.t==='table')return`<div class="dc-tbl"><table><thead><tr>${b.h.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${b.r.map(r=>`<tr>${r.map(x=>`<td>${md(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return`<pre><button class="btn ghost sm dc-cp" data-cp>Copiar</button><code>${esc(b.v)}</code></pre>`}
const guideHtml=(g,n)=>`<section class="dc-sec" id="g-${g.id}"><h2><span class="dc-num">${GICON[g.id]||n}</span>${esc(g.title)}</h2>${g.b.map(blockHtml).join('')}</section>`;
function args(d){if(!d.a)return'';return`<span class="dc-args">${d.a.split(';').map(x=>{const opt=/^\[.*\]$/.test(x);return`<span class="dc-arg${opt?' opt':''}" title="${opt?'opcional':'obligatorio'}">${esc(x.replace(/^\[|\]$/g,''))}</span>`}).join('')}</span>`}
function fnHtml(d){const ex=d.ex||[d.a?sig(d):'$'+d.n,''],id='f-'+slug(d.n);
  return`<article class="dc-fcard" id="${id}"><header><h4><span class="dc-dl">$</span>${esc(d.n)}</h4>${args(d)}${NEW.has(d.n)?`<span class="dc-new">Nuevo</span>`:''}<button class="btn ghost sm dc-link" data-link="${id}" title="Copiar enlace a esta función">${ic('link')}</button></header><p>${esc(d.d)}</p><pre><button class="btn ghost sm dc-cp" data-cp>Copiar</button><code>${esc(ex[0])}</code></pre>${ex[1]?`<div class="dc-res">${esc(ex[1])}</div>`:''}</article>`}
function hero(){
  const news=W.functions.filter(d=>NEW.has(d.n));
  return`<section class="dc-hero"><h1>Wiki de SBScript</h1><p>Escribe texto normal y usa funciones que empiezan por <code>$</code> donde quieras algo dinámico. Aquí tienes guías, recetas para copiar y las <b>${W.functions.length} funciones</b> con ejemplo.</p>
  <div class="dc-start">${[['inicio',ic('rocket'),'Empieza aquí','Tu primer comando en 5 minutos'],['respuestas',ic('palette'),'Tarjetas','Título, imágenes, iconos y campos'],['captcha',ic('lock'),'Captcha','Verificación con imagen paso a paso'],['ia',ic('robot'),'IA','Resumir, traducir y clasificar'],['recetas',ic('utensils'),'Recetas','Ejemplos listos para copiar'],['faq',ic('wrench'),'Problemas','Soluciones a errores típicos']].map(([id,i,t,s])=>`<a class="dc-sc" href="#g-${id}"><span>${i}</span><b>${t}</b><small>${s}</small></a>`).join('')}</div>
  ${news.length?`<div class="dc-newbox"><b>${ic('bot')} Nuevo en la versión ${esc(W.version||'')}</b> <span class="muted">(${news.length} funciones)</span><div class="dc-chips">${news.map(d=>`<a href="#f-${slug(d.n)}">$${esc(d.n)}</a>`).join('')}</div></div>`:''}</section>`}
function render(){
  const ql=q.toLowerCase().trim(),searching=!!ql||!!cat;
  const gs=cat?[]:W.guides.filter(g=>!ql||g.title.toLowerCase().includes(ql)||g.b.some(b=>JSON.stringify(b.v||b.r||'').toLowerCase().includes(ql)));
  const fs=W.functions.filter(d=>(!cat||d.c===cat)&&(!ql||d.n.toLowerCase().includes(ql)||d.d.toLowerCase().includes(ql)||d.c.toLowerCase().includes(ql)));
  const by={};fs.forEach(d=>(by[d.c]??=[]).push(d));
  let h=searching?`<p class="dc-count">${gs.length} guía(s) y ${fs.length} función(es)${cat?` en <b>${esc(cat)}</b>`:''}${ql?` para «<b>${esc(q)}</b>»`:''} · <a href="#" data-clear>Quitar filtros</a></p>`:hero();
  h+=gs.map((g,i)=>guideHtml(g,i+1)).join('');
  h+=Object.entries(by).map(([c,l])=>{const ci=W.cats?.[c]||['',''];return`<section class="dc-sec" id="c-${slug(c)}"><h2><span class="dc-num">${ci[0]||'ƒ'}</span>Funciones: ${esc(c)} <small>${l.length}</small></h2>${ci[1]?`<p class="muted dc-cd">${esc(ci[1])}</p>`:''}${l.map(fnHtml).join('')}</section>`}).join('');
  body.innerHTML=h||'<p class="muted">No hay resultados. Prueba con otra palabra.</p>';spy()}
function buildNav(){
  const cats=[...new Set(W.functions.map(d=>d.c))],cnt=c=>W.functions.filter(d=>d.c===c).length;
  nav.innerHTML=`<input type="search" id="wq" placeholder="Buscar función o guía…" aria-label="Buscar" value="${esc(q)}"><div class="dc-cat">Aprende</div>${W.guides.map(g=>`<a href="#g-${g.id}" data-s="g-${g.id}"><span>${GICON[g.id]||'•'}</span>${esc(g.title)}</a>`).join('')}<div class="dc-cat">Funciones <small>${W.functions.length}</small></div>${cats.map(c=>`<a href="#c-${slug(c)}" data-s="c-${slug(c)}" data-cat="${esc(c)}"><span>${W.cats?.[c]?.[0]||'ƒ'}</span>${esc(c)}<small>${cnt(c)}</small></a>`).join('')}<div class="dc-cat">Filtrar funciones</div><div class="dc-chips dc-fl"><button class="${cat?'':'on'}" data-f="">Todas</button>${cats.map(c=>`<button class="${cat===c?'on':''}" data-f="${esc(c)}">${W.cats?.[c]?.[0]||''} ${esc(c)}</button>`).join('')}</div>`}
let io=null;
function spy(){io?.disconnect();if(!('IntersectionObserver'in window))return;io=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){nav.querySelectorAll('a.on').forEach(a=>a.classList.remove('on'));const a=nav.querySelector(`a[data-s="${e.target.id}"]`);if(a){a.classList.add('on');a.scrollIntoView({block:'nearest'})}}},{rootMargin:'-70px 0px -70% 0px'});body.querySelectorAll('.dc-sec').forEach(s=>io.observe(s))}
let tm;
nav.addEventListener('input',e=>{if(e.target.id!=='wq')return;q=e.target.value;clearTimeout(tm);tm=setTimeout(()=>{render();buildNav();const i=$('#wq');i.focus();i.setSelectionRange(q.length,q.length)},120)});
nav.addEventListener('click',e=>{const f=e.target.closest('[data-f]');if(f){cat=f.dataset.f;render();buildNav();scrollTo({top:0})}else if(e.target.closest('a[href^="#"]'))nav.classList.remove('open')});
body.addEventListener('click',async e=>{
  if(e.target.closest('[data-clear]')){e.preventDefault();q='';cat='';render();buildNav();return}
  const l=e.target.closest('[data-link]');if(l){try{await navigator.clipboard.writeText(location.origin+location.pathname+'#'+l.dataset.link);l.textContent='✓'}catch{l.textContent='✗'}setTimeout(()=>l.textContent=ic('link'),1200);return}
  const b=e.target.closest('[data-cp]');if(!b)return;const t=b.parentElement.querySelector('code').textContent;try{await navigator.clipboard.writeText(t);b.textContent='¡Copiado!'}catch{b.textContent='No se pudo'}setTimeout(()=>b.textContent='Copiar',1400)});
const tg=document.createElement('button');tg.className='btn ghost sm dc-ntg';tg.textContent='☰ Índice';tg.onclick=()=>nav.classList.toggle('open');body.before(tg);
const x=document.createElement('button');x.className='btn dc-wclose';x.id='wclose';x.textContent='✕ Cerrar wiki';
x.onclick=()=>{window.close();setTimeout(()=>{location.href='/admin/discord.html'},200)};document.body.append(x);
addEventListener('keydown',e=>{if(e.key==='/'&&!/input|textarea/i.test(e.target.tagName)){e.preventDefault();$('#wq')?.focus()}});
api('/api/admin/discord/script/wiki').then(w=>{W=w;NEW=new Set(w.news||[]);buildNav();render();if(location.hash)setTimeout(()=>document.getElementById(location.hash.slice(1))?.scrollIntoView(),50)}).catch(x=>{body.innerHTML=`<p style="color:var(--danger)">${esc(x.message)}</p>`});
})();
