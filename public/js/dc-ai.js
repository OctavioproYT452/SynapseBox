// Agente de IA del editor de SBScript (2.17.0): panel de chat lateral con streaming en directo.
// Muestra el texto según llega y cada herramienta que usa (leer, crear, editar, revisar, probar…) como una tarjeta que se va completando.
// El servidor envía una línea JSON por evento (POST /api/admin/discord/cmds/agent). Los cambios se guardan en el servidor y se pueden deshacer.
(()=>{
const E=window.DCE,app=$('#app'),aip=$('#aip');if(!E||!aip)return;
const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch{return null}};
const SS=(k,v)=>{try{if(v===undefined)return sessionStorage.getItem(k);sessionStorage.setItem(k,v)}catch{return null}};
const A={on:false,busy:false,msgs:[],ctrl:null,ok:null,usage:null,turn:null,stick:true};
const NAMES={list_commands:'Listando comandos',read_commands:'Leyendo comandos',search_commands:'Buscando en los comandos',create_command:'Escribiendo un comando nuevo',write_command:'Reescribiendo un comando',edit_command:'Preparando una edición',move_command:'Moviendo un comando',delete_command:'Borrando un comando',check_syntax:'Revisando la sintaxis',test_command:'Preparando una prueba',search_docs:'Consultando la wiki'};
const ICON={list_commands:ic('folder'),read_commands:ic('book'),search_commands:ic('search'),create_command:ic('plus'),write_command:ic('edit'),edit_command:ic('edit'),move_command:ic('move'),delete_command:ic('trash'),check_syntax:ic('check'),test_command:ic('play'),search_docs:ic('book')};
const SUG=['Crea un comando /8ball con respuestas aleatorias y un cooldown','Revisa todos mis comandos y corrige los errores de sintaxis','Haz un panel con botones para dar roles y los comandos de botón que lo hacen funcionar','Explícame qué hace el comando que tengo abierto'];
const coarse=matchMedia('(pointer:coarse)').matches;

// ---------- markdown mínimo (seguro: todo se escapa antes) ----------
function md(src){
  const pre=[];let t=String(src).replace(/```[\w-]*\n?([\s\S]*?)(```|$)/g,(m,c)=>{pre.push(`<pre class="ai-pre"><code>${esc(c.replace(/\n$/,''))}</code></pre>`);return`\u0000${pre.length-1}\u0000`});
  const inl=s=>esc(s).replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?]|$)/g,'$1<i>$2</i>');
  const out=[];let list=null,para=[];
  const endP=()=>{if(para.length){out.push('<p>'+para.map(inl).join('<br>')+'</p>');para=[]}},endL=()=>{if(list){out.push(`<${list.k}>${list.i.map(x=>'<li>'+inl(x)+'</li>').join('')}</${list.k}>`);list=null}};
  for(const l of t.split('\n')){let m;
    if(/^\u0000\d+\u0000$/.test(l.trim())){endP();endL();out.push(l.trim());continue}
    if(m=/^\s*(?:[-*•]\s+)(.*)$/.exec(l)){endP();if(!list||list.k!=='ul'){endL();list={k:'ul',i:[]}}list.i.push(m[1]);continue}
    if(m=/^\s*\d+[.)]\s+(.*)$/.exec(l)){endP();if(!list||list.k!=='ol'){endL();list={k:'ol',i:[]}}list.i.push(m[1]);continue}
    if(m=/^#{1,4}\s+(.*)$/.exec(l)){endP();endL();out.push(`<p class="ai-hd">${inl(m[1])}</p>`);continue}
    if(!l.trim()){endP();endL();continue}
    endL();para.push(l)}
  endP();endL();return out.join('').replace(/\u0000(\d+)\u0000/g,(m,i)=>pre[i]);
}

// ---------- estructura ----------
aip.innerHTML=`<div class="ai-rs" id="ai-rs" title="Arrastra para cambiar el ancho"></div>
<header class="ai-h"><span class="ai-ti"><span class="ai-sp">${ic('bot')}</span><b>Agente SBScript</b></span><span class="dc-grow"></span><button class="dc-ib" id="ai-new" title="Nueva conversación" aria-label="Nueva conversación">${ic('plus')}</button><button class="dc-ib" id="ai-x" title="Cerrar" aria-label="Cerrar">${ic('x')}</button></header>
<div class="ai-body" id="ai-body" role="log" aria-live="polite"></div>
<button class="ai-down" id="ai-down" hidden title="Ir al final">↓</button>
<form class="ai-comp" id="ai-f"><div class="ai-ctx"><label class="ai-ck" title="Si está marcado, el agente sabe qué comando tienes abierto y lo que has escrito sin guardar"><input type="checkbox" id="ai-ctx" checked><span id="ai-cn"></span></label><span class="dc-grow"></span><span class="ai-us" id="ai-us"></span></div>
<div class="ai-in"><textarea id="ai-t" rows="1" maxlength="6000" placeholder="Escribe lo que quieres hacer…" aria-label="Mensaje para el agente"></textarea><button type="submit" class="ai-send" id="ai-s" title="Enviar (Enter)" aria-label="Enviar">${ic('send')}</button></div></form>`;
const body=$('#ai-body'),ta=$('#ai-t'),sb=$('#ai-s'),down=$('#ai-down');

// ---------- ancho ajustable ----------
const W0=+LS('sbs-ai-w')||420;app.style.setProperty('--dc-aiw',Math.min(720,Math.max(320,W0))+'px');
$('#ai-rs').addEventListener('pointerdown',e=>{e.preventDefault();const x0=e.clientX,w0=aip.getBoundingClientRect().width,mv=ev=>{const w=Math.min(720,Math.max(320,w0+(x0-ev.clientX)));app.style.setProperty('--dc-aiw',w+'px')},up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);document.body.classList.remove('ai-drag');LS('sbs-ai-w',String(Math.round(aip.getBoundingClientRect().width)))};document.body.classList.add('ai-drag');addEventListener('pointermove',mv);addEventListener('pointerup',up)});

// ---------- scroll ----------
const near=()=>body.scrollHeight-body.scrollTop-body.clientHeight<90;
body.addEventListener('scroll',()=>{A.stick=near();down.hidden=A.stick||!A.busy&&body.scrollHeight<=body.clientHeight});
down.onclick=()=>{A.stick=true;toBottom();down.hidden=true};
const toBottom=()=>{if(A.stick)body.scrollTop=body.scrollHeight};

// ---------- abrir / cerrar ----------
function toggle(on){on=on===undefined?!A.on:!!on;A.on=on;aip.hidden=!on;app.classList.toggle('dc-ai-on',on);document.body.classList.toggle('ai-open',on);LS('sbs-ai-open',on?'1':'0');
  const b=$('#aib');if(b)b.classList.toggle('dc-act',on);if($('#nai'))$('#nai').classList.toggle('dc-act',on);
  if(on){E.closeSide();ctxLabel();if(A.ok===null)probe();if(!coarse)setTimeout(()=>ta.focus(),30);else toBottom()}}
function ctxLabel(){const c=E.current(),l=$('#ai-cn');if(!l)return;l.textContent=c?`Comando abierto: ${c.name||'sin nombre'}${c.dirty||!c.id?' (borrador)':''}`:'Sin comando abierto';$('#ai-ctx').disabled=!c;}
async function probe(){try{const r=await api('/api/ai/status');A.ok=true;usage(r.usage)}catch(x){A.ok=false}if(!A.ok&&!A.msgs.length)empty();setBtn()}
function usage(u){A.usage=u;const e=$('#ai-us');if(!u||!e)return;e.textContent=u.limit<0?'Usos ilimitados':`${u.used}/${u.limit} usos por ${u.period==='day'?'día':'hora'}`;e.classList.toggle('ai-warn',u.limit>=0&&u.used>=u.limit)}

// ---------- mensajes ----------
const el=(c,h)=>{const d=document.createElement('div');d.className=c;if(h!==undefined)d.innerHTML=h;return d};
function empty(){body.innerHTML='';const d=el('ai-empty');
  if(A.ok===false)d.innerHTML=`<div class="ai-big">${ic('bot')}</div><h3>El agente no está disponible</h3><p class="muted">La IA no está activada en este servidor. Configúrala en <a href="/admin/">Administración → IA</a>.</p>`;
  else d.innerHTML=`<div class="ai-big">${ic('bot')}</div><h3>Agente SBScript</h3><p class="muted">Ve tus comandos como archivos: puede <b>leer, crear, editar, probar y revisar</b> varios a la vez con un solo mensaje. Lo ves trabajar en directo y puedes deshacerlo todo.</p><div class="ai-sug">${SUG.map(s=>`<button type="button" class="ai-chipb">${esc(s)}</button>`).join('')}</div>`;
  body.append(d)}
const userMsg=t=>{body.querySelector('.ai-empty')?.remove();const m=el('ai-m u');m.append(el('ai-b'));m.firstChild.textContent=t;body.append(m);A.stick=true;toBottom()};
function newTurn(){body.querySelector('.ai-empty')?.remove();const m=el('ai-m a'),c=el('ai-c');m.append(el('ai-av',ic('bot')),c);const think=el('ai-think','<i></i><i></i><i></i>');c.append(think);body.append(m);
  A.turn={root:m,c,think,cur:null,tools:new Map(),texts:[],raw:'',changed:new Set(),runId:Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4),n:0,raf:0,notes:[]};A.stick=true;toBottom();return A.turn}
function addBlock(x){const T=A.turn;if(T.think.parentNode===T.c)T.c.insertBefore(x,T.think);else T.c.append(x);toBottom()}
function onText(t){const T=A.turn;if(!T.cur){const b=el('ai-tx');T.cur={b,raw:''};T.texts.push(T.cur);addBlock(b)}T.cur.raw+=t;if(!T.raf)T.raf=requestAnimationFrame(()=>{T.raf=0;for(const x of T.texts)if(x.dirty!==x.raw){x.b.innerHTML=md(x.raw);x.dirty=x.raw}toBottom()})}
function flush(){const T=A.turn;if(!T)return;cancelAnimationFrame(T.raf);T.raf=0;for(const x of T.texts){x.b.innerHTML=md(x.raw);x.dirty=x.raw}}
function card(key,name){const T=A.turn;let k=T.tools.get(key);if(k)return k;T.cur=null;
  const d=document.createElement('details');d.className='ai-tool';d.dataset.st='prep';d.innerHTML=`<summary><span class="ai-ic">${ICON[name]||'•'}</span><span class="ai-lb"></span><span class="ai-sm"></span><span class="ai-chs"></span><span class="ai-st"></span></summary><div class="ai-tb"></div>`;
  k={d,lb:$('.ai-lb',d),sm:$('.ai-sm',d),chs:$('.ai-chs',d),tb:$('.ai-tb',d),name};k.lb.textContent=(NAMES[name]||name)+'…';T.tools.set(key,k);addBlock(d);return k}
const kfmt=n=>n>=1000?(n/1000).toFixed(1).replace('.0','')+'k':String(n);
function diffHtml(df){if(!df)return'';let h=`<div class="ai-df"><span class="ai-add">+${df.add}</span> <span class="ai-rem">−${df.rem}</span> líneas</div>`;
  for(const e of df.edits||[]){h+=`<pre class="ai-dp">${e.old.split('\n').map(l=>`<span class="ai-dl r">- ${esc(l)}</span>`).join('')}${e.new.split('\n').map(l=>`<span class="ai-dl a">+ ${esc(l)}</span>`).join('')}</pre>`}return h}
function onEvent(e){const T=A.turn;if(!T)return;
  if(e.type==='text')onText(e.t);
  else if(e.type==='tool_prep')card(e.key,e.name);
  else if(e.type==='tool_prog'){const k=T.tools.get(e.key);if(k)k.sm.textContent=kfmt(e.chars)+' caracteres'}
  else if(e.type==='tool_start'){const k=card(e.key,e.name);k.d.dataset.st='run';k.lb.textContent=e.label;k.sm.textContent=''}
  else if(e.type==='tool_end'){const k=card(e.key,'');k.d.dataset.st=e.ok?(e.errors?'warn':'ok'):'err';k.lb.textContent=e.label;k.sm.textContent=e.sum||'';T.n++;
    let h='';if(!e.ok)h=`<pre class="ai-er">${esc(e.detail||'Error')}</pre>`;else{h=diffHtml(e.diff);if(e.detail)h+=`<pre class="${e.errors?'ai-er':'ai-ok'}">${esc(e.detail)}</pre>`}
    k.tb.innerHTML=h;if(!h)k.d.classList.add('ai-nobody');if(!e.ok||e.errors)k.d.open=true;
    if(e.ids?.length&&e.mut&&!e.gone)k.chs.innerHTML=e.ids.slice(0,2).map(i=>`<button type="button" class="ai-chip" data-open="${esc(i)}" title="Abrir en el editor">${esc(i.split('/').pop())}</button>`).join('');
    T.notes.push(e)}
  else if(e.type==='changed'){(e.ids||[]).forEach(i=>T.changed.add(i));E.changed(e.ids||[],e.gone)}
  else if(e.type==='done'){T.runId=e.runId||T.runId;T.changes=e.changes||0;if(e.usage)usage(e.usage)}
  else if(e.type==='error')T.error=e.message;
  toBottom()}
function finishTurn(aborted){const T=A.turn;if(!T)return;flush();T.think.remove();
  const doneTools=[...T.tools.values()];doneTools.forEach(k=>{if(k.d.dataset.st==='run'||k.d.dataset.st==='prep'){k.d.dataset.st='err';k.sm.textContent='interrumpido'}});
  if(T.error)addBlock(el('ai-err',''+ic('alert')+' '+esc(T.error)));
  else if(aborted)addBlock(el('ai-stop','Detenido.'));
  const nch=T.changes||T.changed.size;
  if(nch){const f=el('ai-foot',`<span>${ic('check')} ${T.changed.size||nch} comando${(T.changed.size||nch)===1?'':'s'} modificado${(T.changed.size||nch)===1?'':'s'}</span><button type="button" class="ai-undo" data-undo="${esc(T.runId)}">↩ Deshacer</button>`);addBlock(f)}
  // memoria de la conversación: solo texto (los resultados de las herramientas no se reenvían, para gastar menos)
  const txt=T.texts.map(x=>x.raw).join('\n').trim(),acts=T.notes.filter(n=>n.mut).map(n=>n.label).join('; ');
  if(txt||acts)A.msgs.push({role:'assistant',content:(txt||'(sin texto)')+(acts?`\n[Acciones hechas: ${acts}]`:'')});
  A.turn=null;save();toBottom()}

// ---------- envío ----------
function setBtn(){const b=A.busy;sb.innerHTML=b?'<span class="ai-sq"></span>':ic('send');sb.title=b?'Detener':'Enviar (Enter)';sb.classList.toggle('ai-stopb',b);sb.disabled=!b&&(A.ok===false);ta.disabled=A.ok===false;aip.classList.toggle('ai-busy',b)}
async function send(text){text=String(text??ta.value).trim();if(!text||A.busy||A.ok===false)return;
  A.msgs.push({role:'user',content:text});userMsg(text);ta.value='';size();A.busy=true;setBtn();const T=newTurn();
  let cur=null;if($('#ai-ctx').checked&&!$('#ai-ctx').disabled)cur=E.current();
  A.ctrl=new AbortController();let aborted=false;
  try{
    const r=await fetch('/api/admin/discord/cmds/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:A.msgs.slice(-14),current:cur,runId:T.runId}),signal:A.ctrl.signal});
    if(r.status===401){location.href='/';return}
    if(!r.ok){const d=await r.json().catch(()=>({}));if(r.status===404)A.ok=false;throw Error(d.error||'Error '+r.status)}
    const rd=r.body.getReader(),dec=new TextDecoder();let buf='';
    for(;;){const{done,value}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i).trim();buf=buf.slice(i+1);if(l){let ev;try{ev=JSON.parse(l)}catch{continue}onEvent(ev)}}}
  }catch(x){if(x.name==='AbortError')aborted=true;else A.turn.error=x.message||'Error de conexión'}
  finally{A.busy=false;A.ctrl=null;finishTurn(aborted);setBtn();ctxLabel();if(!coarse)ta.focus()}}
const stop=()=>A.ctrl?.abort();
function save(){SS('sbs-ai-msgs',JSON.stringify(A.msgs.slice(-14)))}
function restore(){try{const m=JSON.parse(SS('sbs-ai-msgs')||'[]');if(Array.isArray(m)&&m.length){A.msgs=m;body.innerHTML='';for(const x of m){if(x.role==='user')userMsg(x.content);else{const d=el('ai-m a'),c=el('ai-c');d.append(el('ai-av',ic('bot')),c);c.append(el('ai-tx',md(String(x.content).replace(/\n\[Acciones hechas:[^\n]*\]$/,''))));body.append(d)}}A.stick=true;toBottom();return true}}catch{}return false}
function reset(){if(A.busy)stop();A.msgs=[];save();A.turn=null;empty()}

// ---------- eventos ----------
function size(){ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,180)+'px'}
ta.addEventListener('input',size);
ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&(!coarse||e.ctrlKey||e.metaKey)){e.preventDefault();send()}else if(e.key==='Escape'&&A.busy)stop()});
$('#ai-f').addEventListener('submit',e=>{e.preventDefault();A.busy?stop():send()});
$('#ai-x').onclick=()=>toggle(false);
$('#ai-new').onclick=async()=>{if(A.msgs.length&&!A.busy&&!await yes('Nueva conversación','Se borrará esta conversación (los comandos no cambian).'))return;reset()};
aip.addEventListener('click',async e=>{const t=e.target;
  const s=t.closest('.ai-chipb');if(s){send(s.textContent);return}
  const o=t.closest('[data-open]');if(o){e.preventDefault();E.openCmd(o.dataset.open);return}
  const u=t.closest('[data-undo]');if(u&&!u.disabled){u.disabled=true;u.textContent='Deshaciendo…';
    try{const r=await api('/api/admin/discord/cmds/agent/undo',{runId:u.dataset.undo});u.textContent=r.failed?'Deshecho (con avisos)':'✓ Deshecho';toast(r.failed?'Algunos cambios no se pudieron revertir':'Cambios deshechos',!!r.failed);E.changed(r.ids,false,true)}catch(x){u.disabled=false;u.textContent='↩ Deshacer';toast(x.message,1)}}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='i'){e.preventDefault();toggle()}});
document.addEventListener('dce:open',ctxLabel);

window.DCAI={toggle,isOpen:()=>A.on,refreshCtx:ctxLabel};
restore()||empty();setBtn();if(LS('sbs-ai-open')==='1'&&innerWidth>900)toggle(true);else if(LS('sbs-ai-open')==='1')A.ok=null;
})();
