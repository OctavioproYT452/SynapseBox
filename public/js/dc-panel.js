// Panel de Discord: una página propia con secciones (Estado, Actividad, Tickets, Bienvenidas, Comandos) en vez de una sola pantalla larga.
(()=>{
const fld=(l,hint,inner)=>`<label class="fld"><span>${l}</span>${inner}${hint?`<small>${hint}</small>`:''}</label>`;
const chk=(id,l,hint,on)=>`<label class="chk"><input type="checkbox" id="${id}" ${on?'checked':''}><span><b>${l}</b>${hint?`<small>${hint}</small>`:''}</span></label>`;
const hd=(t,d,act='')=>`<div class="dp-h"><div><h2>${t}</h2>${d?`<p>${d}</p>`:''}</div><span class="dp-sp"></span>${act}</div>`;
const card=(t,sub,inner)=>`<div class="dp-card">${t?`<h3>${t}</h3>`:''}${sub?`<p class="dp-sub">${sub}</p>`:''}${inner}</div>`;
const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch{return null}};
const nav=$('#dpnav'),body=$('#dpbody'),gbar=$('#dpguild');
let S=null,sec=(location.hash||'#estado').slice(1),gid=LS('dcpGuild');
const SECS=[['estado',ic('home'),'Estado'],['actividad',ic('radio'),'Actividad'],['tickets',ic('ticket'),'Tickets'],['bienvenidas',ic('hand'),'Bienvenidas'],['comandos',ic('zap'),'Comandos propios']];
const needsGuild=s=>s==='tickets'||s==='bienvenidas';
const guild=()=>S.guilds.find(g=>g.id===gid)||S.guilds[0];
const wait=async f=>{try{await f()}catch(e){toast(e.message,1)}};

function buildNav(){
  const open=S.guilds.reduce((n,g)=>n+(g.tickets?.open?.length||0),0);
  nav.innerHTML=SECS.map(([k,e,t])=>`<button data-s="${k}" class="${k===sec?'on':''}"><span class="dp-e">${e}</span>${t}${k==='tickets'&&open?`<small>${open}</small>`:''}</button>`).join('')+'<hr><button data-go="/admin/discord.html"><span class="dp-e">'+ic('edit')+'</span>Editor de comandos</button><button data-go="/admin/discord-wiki.html"><span class="dp-e">'+ic('book')+'</span>Wiki de SBScript</button>';
}
function buildGuild(){
  const show=needsGuild(sec)&&S.guilds.length>1;gbar.hidden=!show;if(!show)return;
  gbar.innerHTML=`<b>Servidor</b><select class="input" id="gsel">${S.guilds.map(g=>`<option value="${esc(g.id)}"${g.id===guild().id?' selected':''}>${esc(g.name)}</option>`).join('')}</select>`;
  $('#gsel').onchange=e=>{gid=e.target.value;LS('dcpGuild',gid);render()};
}
const noGuild=()=>`<div class="dp-card dp-empty">El bot todavía no está en ningún servidor.<br>${S.invite?`<a class="btn" style="margin-top:12px" href="${esc(S.invite)}" target="_blank" rel="noopener noreferrer">${ic('link')} Invitar el bot</a>`:'Configura el token en el archivo .env.'}</div>`;

// ---------- Estado ----------
function estado(){
  const s=S,dot=s.ready?'ok':s.error?'bad':'';
  const setup=`<ol class="muted" style="margin:0;padding-left:18px;line-height:1.8"><li>Crea una aplicación en <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer">discord.com/developers/applications</a>, entra en <b>Bot</b> y copia el token.</li><li>Pégalo en el archivo <code>.env</code>: <code>DISCORD_TOKEN=tu_token</code> (nunca se guarda en la base de datos).</li><li>En <b>Bot</b> activa <b>Server Members Intent</b> (bienvenidas) y <b>Message Content Intent</b> (comandos de prefijo y de mensaje).</li><li>Reinicia SynapseBox e invita al bot con el enlace que aparecerá aquí.</li><li>En Discord usa <code>/vincular</code> y después <code>/config registros</code>.</li></ol>${s.error?`<p class="dp-bad">${esc(s.error)}</p>`:''}`;
  const warns=[];
  if(s.ready&&!s.members_intent)warns.push('Falta <b>Server Members Intent</b> (Developer Portal → Bot): sin él no se pueden dar bienvenidas.');
  if(s.ready&&!s.content_intent)warns.push('Falta <b>Message Content Intent</b>: los comandos de prefijo y de mensaje no responderán (los slash y los botones sí).');
  S.guilds.forEach(g=>{if(g.tickets?.problem)warns.push(`<b>${esc(g.name)}</b>: ${esc(g.tickets.problem)}`)});
  const tickets=S.guilds.reduce((n,g)=>n+(g.tickets?.open?.length||0),0);
  return hd('Estado del bot','Resumen de la conexión y accesos rápidos.')+
   `<div class="dp-hero"><span class="dp-dot ${dot}"></span><div><h2>${s.ready?'Conectado como '+esc(s.tag||''):s.error?'Error de conexión':s.configured?'Conectando…':'Sin token'}</h2><small>${s.ready?'El bot está funcionando.':s.configured?'Espera unos segundos y recarga.':'Añade DISCORD_TOKEN al archivo .env.'}</small></div><span class="dp-sp" style="flex:1"></span>${s.invite?`<a class="btn ghost" href="${esc(s.invite)}" target="_blank" rel="noopener noreferrer">${ic('link')} Invitar a un servidor</a>`:''}${s.ready?`<button class="btn ghost" id="dptest">${ic('send')} Mensaje de prueba</button>`:''}</div>`+
   (!s.configured||s.error?card('Cómo activarlo','',setup):
   `<div class="dp-stats"><div class="dp-stat"><b>${s.guilds.length}</b><span>Servidores del bot</span></div><div class="dp-stat"><b>${s.linked}</b><span>Cuentas vinculadas</span></div><div class="dp-stat"><b>${tickets}</b><span>Tickets abiertos</span></div></div>`+
   warns.map(w=>`<div class="dp-warn">${ic('alert')} ${w}</div>`).join('')+
   `<div class="dp-links">${[['actividad',ic('radio'),'Actividad','Canales de registro y avisos de actualización'],['tickets',ic('ticket'),'Tickets','Soporte con botón, rol que reclama y cierra'],['bienvenidas',ic('hand'),'Bienvenidas','Mensaje y rol automático para quien entra'],['comandos',ic('zap'),'Comandos propios','SBScript, botones, captcha e IA']].map(([k,e,t,d])=>`<button class="dp-link" data-s="${k}"><span>${e}</span><b>${t}</b><small>${d}</small></button>`).join('')}</div>`);
}

// ---------- Actividad ----------
function actividad(){
  const s=S,opts=c=>s.guilds.map(g=>`<optgroup label="${esc(g.name)}">${g.channels.map(h=>`<option value="${h.id}"${c&&c.id===h.id?' selected':''}>#${esc(h.name)}</option>`).join('')}</optgroup>`).join('');
  const chan=(c,k,t,d)=>`<div class="srow" style="flex-wrap:wrap"><div class="grow"><b>${t}</b><small>${c?'#'+esc(c.name||'canal'):'No configurado'} · ${d}</small></div>${s.ready&&s.guilds.length?`<select data-chs="${k}" style="max-width:190px"><option value="">Elegir canal…</option>${opts(c)}</select><button class="btn sm ghost" data-chg="${k}">Guardar</button>`:''}${c?`<button class="btn sm ghost dng" data-clr="${k}">${ic('x')} Quitar</button>`:''}</div>`;
  return hd('Actividad','Qué se envía a Discord y qué pueden hacer tus usuarios.','<button class="btn" id="dpsave">Guardar cambios</button>')+
   `<div class="dp-grid">`+
   card('Canales','Nada se guarda en el servidor: los eventos van directos a Discord. También con <code>/config</code> en Discord.',chan(s.log_channel,'log','Registros de actividad','altas, enlaces, cambios de admin…')+chan(s.update_channel,'update','Avisos de actualización','cuando hay una versión nueva')+`<div class="srow" style="flex-wrap:wrap"><div class="grow"><b>Avisar de una actualización ahora</b><small>Consulta GitHub (versión, notas y archivos modificados) y lo publica en el canal de actualizaciones.</small></div><button class="btn sm" id="dpnotice"${s.ready&&s.update_channel?'':' disabled'}>Enviar aviso</button></div>`)+
   card('Qué se registra','Marca los eventos que quieres ver en el canal de registros.',`<div class="dp-ev">${s.events.map(e=>chk('dce-'+e.key,e.label,'',e.on)).join('')}</div>`)+
   card('Comandos de los usuarios','',chk('dcact','Permitir acciones sobre archivos desde Discord','Crear enlaces para compartir (/enlaces crear) y usar la IA (/ia). Si lo desactivas, el bot solo consulta.',s.actions))+
   `</div>`;
}

// ---------- Tickets ----------
function tickets(){
  if(!S.guilds.length)return hd('Tickets de soporte','')+noGuild();
  const g=guild(),t=g.tickets||{open:[]},id=g.id;
  const sel=(i,list,cur,none)=>`<select class="input" id="${i}"><option value="">${none}</option>${list.map(x=>`<option value="${esc(x.id)}"${x.id===cur?' selected':''}>${esc(x.name)}</option>`).join('')}</select>`;
  return hd('Tickets de soporte','Un botón abre un canal privado. Quien abre el ticket solo puede escribir; el rol de soporte puede reclamarlo y cerrarlo. También con <code>/tickets</code>.',t.configured?`<span class="badge pub">${t.open.length} abierto(s) · ${t.counter} creados</span>`:'<span class="badge">Sin configurar</span>')+
   (t.problem?`<div class="dp-warn">${ic('alert')} ${esc(t.problem)}</div>`:'')+(t.configured&&!t.role_ok?'<div class="dp-warn">'+ic('alert')+' El rol de soporte ya no existe: elige otro y guarda.</div>':'')+
   `<div class="dp-grid">`+
   card('Configuración','El rol del bot debe estar por encima del rol de soporte. Quien reclama un ticket es el único del rol que puede escribir en él.',
     fld('Rol de soporte','Ve, reclama y cierra los tickets.',sel('tkr',g.all_roles,t.role_id,'— Elige un rol —'))+fld('Categoría','Opcional: dónde se crean los canales.',sel('tkc',g.categories,t.category_id,'— Sin categoría —'))+fld('Canal de transcripciones','Opcional: al cerrar se envía aquí la transcripción.',sel('tkl',g.channels,t.log_id,'— Sin transcripciones —'))+fld('Tickets abiertos a la vez por persona','',`<input class="input" id="tkm" type="number" min="1" max="5" value="${t.max_open||1}">`)+
     `<div class="dp-row"><button class="btn" id="tksave">Guardar configuración</button>${t.configured?'<button class="btn ghost dng" id="tkoff">Desactivar</button>':''}</div>`)+
   (t.configured?card('Enviar el botón «Abrir ticket»','Publica el mensaje con el botón en el canal que elijas.',fld('Canal','',sel('tkpc',g.channels,'','— Elige un canal —'))+fld('Título','Opcional.','<input class="input" id="tkpt" maxlength="100" placeholder="🎫 Soporte">')+fld('Texto','Opcional.','<textarea class="input" id="tkpd" rows="3" maxlength="1000" placeholder="¿Necesitas ayuda? Pulsa el botón y se abrirá un canal privado con nuestro equipo."></textarea>')+`<div class="dp-row"><button class="btn" id="tkpanel">${ic('send')} Enviar panel</button></div>`)
    +card('Tickets abiertos',t.open.length?'':'Ahora mismo no hay ninguno.',t.open.length?`<div class="dp-list">${t.open.map(o=>`<div class="srow"><div class="grow"><b>#${String(o.number).padStart(4,'0')} · ${esc(o.user)}</b><small>${o.claimed_by?'Atiende: '+esc(o.claimed_by):'Sin reclamar'}${o.subject?' · '+esc(o.subject):''}</small></div></div>`).join('')}</div>`:''):'')+
   `</div>`;
}

// ---------- Bienvenidas ----------
const WS={username:'maria_lopez',nickname:'María',mention:'@María',tag:'@maria_lopez',id:'123456789012345678',created:'hace 3 años',date:new Date().toLocaleDateString()};
const wp=(tpl,g)=>{const v={...WS,members:String(g.members),humans:String(g.members),server:g.name};return esc(String(tpl||'').replace(/\{(\w+)\}/g,(m,k)=>v[k.toLowerCase()]??m)).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>')};
function bienvenidas(){
  if(!S.guilds.length)return hd('Bienvenidas','')+noGuild();
  const g=guild(),w=g.welcome,id=g.id;
  const vars=S.welcome_vars.map(([k,d])=>`<button type="button" class="btn ghost sm" data-ins="${esc(k)}" title="${esc(d)}">${esc(k)}</button>`).join('');
  return hd('Bienvenidas','Mensaje que se envía cuando alguien entra al servidor. También con <code>/bienvenida</code>.')+
   (S.members_intent?'':'<div class="dp-warn">'+ic('alert')+' Falta <b>Server Members Intent</b> (Developer Portal → Bot → Privileged Gateway Intents). Puedes preparar el mensaje, pero no se enviará hasta activarlo y reiniciar.</div>')+
   `<div class="dp-grid">`+
   card('Ajustes','',chk('wen','Dar la bienvenida a los miembros nuevos','',w.enabled)+fld('Canal','',`<select class="input" id="wch"><option value="">— Sin canal —</option>${g.channels.map(c=>`<option value="${esc(c.id)}"${c.id===w.channel_id?' selected':''}>#${esc(c.name)}</option>`).join('')}</select>`)+fld('Rol automático',g.can_roles?'Solo salen roles que el bot puede dar (por debajo del suyo).':'El bot no tiene «Gestionar roles» en este servidor.',`<select class="input" id="wro"><option value="">— Ninguno —</option>${g.roles.map(r=>`<option value="${esc(r.id)}"${r.id===w.role_id?' selected':''}>${esc(r.name)}</option>`).join('')}</select>`)+chk('wem','Enviar como tarjeta','Si lo desmarcas se envía como texto normal.',w.embed))+
   card('Mensaje','Pulsa un código para insertarlo donde tengas el cursor.',fld('Título','Opcional.',`<input class="input" id="wti" maxlength="${S.welcome_limits.title}" value="${esc(w.title)}">`)+fld('Texto','',`<textarea class="input" id="wms" rows="5" maxlength="${S.welcome_limits.message}">${esc(w.message)}</textarea>`)+`<div class="dp-vars">${vars}</div><div class="muted"><small>Así se vería:</small></div><div class="dp-prev"><b class="t" id="wpt"></b><div id="wpm"></div></div><div class="dp-row"><button class="btn" id="wsave">Guardar</button><button class="btn ghost" id="wtest">${ic('send')} Guardar y enviar prueba</button></div>`)+
   `</div>`;
}

// ---------- Comandos ----------
function comandos(){
  return hd('Comandos propios','Crea tus comandos con SBScript, un lenguaje sencillo parecido a BDScript. Prefijo actual: <b>'+esc(S.prefix||'!')+'</b>')+
   `<div class="dp-links">${[['/admin/discord.html',ic('edit'),'Abrir el editor','Carpetas, resaltado, pruebas y creación con IA ('+ic('bot')+')'],['/admin/discord-wiki.html',ic('book'),'Wiki de SBScript','Guías, recetas y todas las funciones']].map(([h,e,t,d])=>`<button class="dp-link" data-go="${h}"><span>${e}</span><b>${t}</b><small>${d}</small></button>`).join('')}</div>`+
   `<div class="dp-grid" style="margin-top:16px">${card('Tipos de comando','',`<ul class="muted" style="margin:0;padding-left:18px;line-height:1.8"><li><b>Slash</b> (/comando) con opciones</li><li><b>Prefijo</b> (${esc(S.prefix||'!')}comando)</li><li><b>Mensaje</b>: responde a un texto</li><li><b>Botón</b>: se ejecuta al pulsar un botón</li></ul>`)}${card('Ya incluido en el bot','',`<ul class="muted" style="margin:0;padding-left:18px;line-height:1.8"><li>Sistema de <b>tickets</b> con botón</li><li>Vinculación de cuentas, archivos, enlaces y /ia</li><li>Bienvenidas y registro de actividad</li></ul>`)}</div>`;
}

// ---------- cableado ----------
const VIEWS={estado,actividad,tickets,bienvenidas,comandos};
function wire(){
  $$('[data-s]',body).forEach(b=>b.onclick=()=>go(b.dataset.s));
  $$('[data-go]',body).forEach(b=>b.onclick=()=>location.href=b.dataset.go);
  const t=$('#dptest');if(t)t.onclick=()=>wait(async()=>{t.disabled=true;try{const r=await api('/api/admin/discord/test',{});toast('Mensaje enviado ('+r.sent.join(' y ')+')')}finally{t.disabled=false}});
  $$('[data-chg]',body).forEach(b=>b.onclick=()=>wait(async()=>{const k=b.dataset.chg,v=$(`[data-chs=${k}]`,body).value;if(!v)throw Error('Elige un canal');await api('/api/admin/discord/channel',{which:k,channel_id:v});toast('Canal configurado');await load()}));
  const nb=$('#dpnotice',body);if(nb)nb.onclick=async()=>{if(await yes('Enviar aviso','Se consultará GitHub y se publicará el aviso de actualización en el canal de actualizaciones.'))wait(async()=>{const o=await api('/api/admin/discord/update-notice',{});toast('Aviso enviado ('+o.version+')')})};
  $$('[data-clr]',body).forEach(b=>b.onclick=async()=>{if(await yes('Quitar canal','Dejará de enviarse información a ese canal.'))wait(async()=>{await api('/api/admin/discord/clear',{which:b.dataset.clr});toast('Canal quitado');await load()})});
  const sv=$('#dpsave');if(sv)sv.onclick=()=>wait(async()=>{const events={};S.events.forEach(e=>events[e.key]=$('#dce-'+e.key).checked);await api('/api/admin/discord',{events,actions:$('#dcact').checked});toast('Guardado')});
  // tickets
  const g=S.guilds.length?guild():null;
  const ts=$('#tksave');if(ts)ts.onclick=()=>wait(async()=>{await api('/api/admin/discord/tickets',{guild_id:g.id,role_id:$('#tkr').value,category_id:$('#tkc').value,log_id:$('#tkl').value,max_open:$('#tkm').value});toast('Tickets configurados');await load()});
  const to=$('#tkoff');if(to)to.onclick=async()=>{if(await yes('Desactivar tickets','Se borra la configuración. Los tickets abiertos seguirán funcionando hasta cerrarse, pero no se podrán abrir nuevos.'))wait(async()=>{await api('/api/admin/discord/tickets/reset',{guild_id:g.id});toast('Tickets desactivados');await load()})};
  const tp=$('#tkpanel');if(tp)tp.onclick=()=>wait(async()=>{const ch=$('#tkpc').value;if(!ch)throw Error('Elige un canal');await api('/api/admin/discord/tickets/panel',{guild_id:g.id,channel_id:ch,title:$('#tkpt').value,description:$('#tkpd').value});toast('Panel enviado')});
  // bienvenidas
  const ms=$('#wms'),ti=$('#wti');
  if(ms&&g){const upd=()=>{$('#wpt').innerHTML=wp(ti.value,g);$('#wpm').innerHTML=wp(ms.value,g)};ms.oninput=ti.oninput=upd;upd();
    $$('[data-ins]',body).forEach(b=>b.onclick=()=>{const t=document.activeElement===ti?ti:ms,a=t.selectionStart??t.value.length,e=t.selectionEnd??a;t.setRangeText(b.dataset.ins,a,e,'end');t.focus();upd()});
    const save=()=>api('/api/admin/discord/welcome',{guild_id:g.id,enabled:$('#wen').checked,channel_id:$('#wch').value,role_id:$('#wro').value,embed:$('#wem').checked,title:ti.value,message:ms.value});
    $('#wsave').onclick=()=>wait(async()=>{await save();toast('Bienvenida guardada');await load()});
    $('#wtest').onclick=()=>wait(async()=>{await save();await api('/api/admin/discord/welcome/test',{guild_id:g.id});toast('Prueba enviada al canal')})}
}
function render(){if(!VIEWS[sec])sec='estado';buildNav();buildGuild();body.innerHTML=VIEWS[sec]();wire()}
function go(k){sec=k;try{history.replaceState(null,'','#'+k)}catch{}render();scrollTo({top:0})}
nav.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.go)location.href=b.dataset.go;else if(b.dataset.s)go(b.dataset.s)});
async function load(){S=await api('/api/admin/discord');if(!S.guilds.some(g=>g.id===gid))gid=S.guilds[0]?.id||null;render()}
api('/api/session').then(s=>{if(!s.logged||!s.admin)location.href='/';else load().catch(e=>{body.innerHTML=`<p class="dp-bad">${esc(e.message)}</p>`})});
})();
