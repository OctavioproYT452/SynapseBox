// Agente de IA del panel (2.17.5): chat en streaming. Muestra el texto según llega y cada herramienta que usa (leer, crear, mover, organizar, temas…) como una tarjeta que se completa.
// Solo se crea si el servidor informa de que la IA está activa. Servidor: POST /api/ai/agent (una línea JSON por evento).
let aiHist=[],aiBusy=false,aiCtl=null,aiT=null,aiStick=true,aiLoadT=0,aiUsageData=null;
const AI_ICON={list_dir:'📂',tree:'🌳',read_file:'📖',read_files:'📖',file_info:'ℹ️',search_files:'🔎',grep_files:'🔎',create_folder:'📁',write_file:'✚',create_files:'✚',append_file:'✎',edit_file:'✎',move_item:'↗',move_items:'↗',copy_item:'⧉',delete_item:'🗑',delete_items:'🗑',organize_folder:'🧹',storage_report:'📊',find_duplicates:'👯',list_trash:'🗑',restore_trash:'♻️',list_favorites:'⭐',set_favorite:'⭐',list_themes:'🎨',save_theme:'🎨',apply_theme:'🎨'};
const AI_NAME={list_dir:'Listando',tree:'Viendo el árbol',read_file:'Leyendo',read_files:'Leyendo archivos',file_info:'Consultando',search_files:'Buscando archivos',grep_files:'Buscando en el contenido',create_folder:'Creando carpeta',write_file:'Escribiendo un archivo',create_files:'Escribiendo archivos',append_file:'Añadiendo texto',edit_file:'Editando',move_item:'Moviendo',move_items:'Moviendo',copy_item:'Copiando',delete_item:'Borrando',delete_items:'Borrando',organize_folder:'Organizando',storage_report:'Analizando el espacio',find_duplicates:'Buscando duplicados',list_trash:'Mirando la papelera',restore_trash:'Restaurando',list_favorites:'Mirando favoritos',set_favorite:'Cambiando favorito',list_themes:'Mirando tus temas',save_theme:'Creando un tema',apply_theme:'Aplicando un tema'};
const AI_SUG=[['📊','Resumen de mi espacio','Hazme un resumen de mi espacio: qué ocupa más y qué podría limpiar.'],['🧹','Organizar esta carpeta','Organiza los archivos sueltos de esta carpeta por tipo.'],['👯','Buscar duplicados','Busca archivos duplicados y dime cuánto espacio recuperaría (no borres nada todavía).'],['🎨','Crear un tema nuevo','Crea y aplica un tema oscuro azulado con bordes redondeados, bien legible, y guárdalo con un nombre bonito.'],['🔎','Encontrar archivos grandes','Muestra mis archivos de más de 50 MB o sin tocar desde hace más de un año.'],['♻️','Ver la papelera','Muestra qué hay en mi papelera.']];
function aiMd(src){const pre=[];let t=String(src).replace(/```[\w-]*\n?([\s\S]*?)(```|$)/g,(m,c)=>{pre.push(`<pre class="ai-pre"><code>${esc(c.replace(/\n$/,''))}</code></pre>`);return`\u0000${pre.length-1}\u0000`});
  const inl=s=>esc(s).replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?]|$)/g,'$1<i>$2</i>');
  const out=[];let list=null,para=[];const endP=()=>{if(para.length){out.push('<p>'+para.map(inl).join('<br>')+'</p>');para=[]}},endL=()=>{if(list){out.push(`<${list.k}>${list.i.map(x=>'<li>'+inl(x)+'</li>').join('')}</${list.k}>`);list=null}};
  for(const l of t.split('\n')){let m;if(/^\u0000\d+\u0000$/.test(l.trim())){endP();endL();out.push(l.trim());continue}
    if(m=/^\s*(?:[-*•]\s+)(.*)$/.exec(l)){endP();if(!list||list.k!=='ul'){endL();list={k:'ul',i:[]}}list.i.push(m[1]);continue}
    if(m=/^\s*\d+[.)]\s+(.*)$/.exec(l)){endP();if(!list||list.k!=='ol'){endL();list={k:'ol',i:[]}}list.i.push(m[1]);continue}
    if(m=/^#{1,4}\s+(.*)$/.exec(l)){endP();endL();out.push(`<p class="ai-hd">${inl(m[1])}</p>`);continue}
    if(!l.trim()){endP();endL();continue}endL();para.push(l)}
  endP();endL();return out.join('').replace(/\u0000(\d+)\u0000/g,(m,i)=>pre[i])}
const aiEl=(c,h)=>{const d=document.createElement('div');d.className=c;if(h!==undefined)d.innerHTML=h;return d};
const aiCwd=()=>typeof cx!=='undefined'&&cx?null:cwd;
function aiCtx(){const c={},cw=aiCwd();if($('#aiCk')?.checked){if(cw!==null)c.cwd=cw;if(typeof sel!=='undefined'&&sel.size&&cw!==null)c.selected=[...sel].map(n=>(cw?cw+'/':'')+n)}return c}
function aiCtxLabel(){const l=$('#aiCn');if(!l)return;const cw=aiCwd(),n=typeof sel!=='undefined'?sel.size:0;
  if(cw===null){l.textContent='Carpeta compartida: el agente solo ve tus archivos';$('#aiCk').disabled=true;return}
  $('#aiCk').disabled=false;l.textContent='Carpeta: /'+cw+(n?` · ${n} seleccionado${n===1?'':'s'}`:'')}
function aiInit(){
  if($('#aiBtn'))return;
  const b=document.createElement('button');b.className='btn ghost sm';b.id='aiBtn';b.innerHTML=ic('bot')+' Asistente IA';b.title='Asistente IA (Ctrl+Mayús+I)';
  $('#nav').insertBefore(b,$('#nav').firstChild);
  const p=document.createElement('aside');p.className='aip card';p.id='aip';p.hidden=true;
  p.innerHTML=`<div class="ai-h"><b class="grow">${ic('bot')} Agente de archivos</b><small id="aiUse" class="muted"></small><button class="more" id="aiNew" title="Nueva conversación" aria-label="Nueva conversación">${ic('refresh')}</button><button class="more" id="aiX" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="ailog" id="ailog" role="log" aria-live="polite"></div><button class="ai-down" id="aiDown" hidden title="Ir al final">↓</button>
  <form class="aiform" id="aiForm"><label class="ai-ck" title="Si está marcado, el agente sabe qué carpeta tienes abierta y qué has seleccionado"><input type="checkbox" id="aiCk" checked><span id="aiCn"></span></label>
  <div class="ai-in"><textarea class="input" id="aiIn" rows="1" maxlength="4000" placeholder="Pídeme lo que quieras: organizar, buscar, crear, cambiar tu tema…" aria-label="Mensaje para el agente"></textarea><button class="btn" id="aiSend" aria-label="Enviar">${ic('send')}</button></div></form>
  <small class="muted ai-foot">Solo actúa en tu carpeta y tu apariencia. No ejecuta archivos y lo que borra va a la papelera.</small>`;
  document.body.append(p);
  const bar=$('#bulk');if(bar){const x=document.createElement('button');x.className='btn sm ghost';x.id='aiBulk';x.dataset.ai='1';x.innerHTML=ic('bot')+' Preguntar a la IA';bar.insertBefore(x,bar.querySelector('[data-b=del]'));x.onclick=()=>aiOpen(true)}
  b.onclick=()=>aiOpen();$('#aiX').onclick=()=>aiOpen(false);
  $('#aiNew').onclick=()=>{if(aiBusy)return;aiHist=[];aiEmpty()};
  $('#aiForm').onsubmit=e=>{e.preventDefault();aiBusy?aiStop():aiSend($('#aiIn').value)};
  $('#aiIn').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!matchMedia('(pointer:coarse)').matches){e.preventDefault();if(!aiBusy)aiSend($('#aiIn').value)}};
  const log=$('#ailog');log.onscroll=()=>{aiStick=log.scrollHeight-log.scrollTop-log.clientHeight<90;$('#aiDown').hidden=aiStick};$('#aiDown').onclick=()=>{aiStick=true;aiBottom();$('#aiDown').hidden=true};
  addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='i'){e.preventDefault();aiOpen()}if(e.key==='Escape'&&!p.hidden&&!document.querySelector('dialog[open]')&&document.activeElement===$('#aiIn'))aiOpen(false)});
  aiEmpty();
}
function aiOpen(on){const p=$('#aip');on=on===undefined?p.hidden:!!on;p.hidden=!on;document.body.classList.toggle('ai-open',on);if(on){aiCtxLabel();aiStatus();document.getElementById('nav')?.classList.remove('open');if(!matchMedia('(pointer:coarse)').matches)setTimeout(()=>$('#aiIn').focus(),30)}}
const aiBottom=()=>{if(aiStick){const l=$('#ailog');l.scrollTop=l.scrollHeight}};
function aiEmpty(){const l=$('#ailog');l.innerHTML='';const d=aiEl('ai-empty',`<div class="ai-big">✨</div><h3>¿Qué hacemos con tus archivos?</h3><p class="muted">Puedo <b>buscar, crear varios archivos, editar, mover, organizar y limpiar</b>, ver tu espacio y duplicados, usar la papelera y favoritos, y <b>crear o cambiar tu tema</b> guardándolo en «Mis temas». Con un solo mensaje.</p>`);
  const g=aiEl('ai-sug');for(const [i,t,q] of AI_SUG){const b=document.createElement('button');b.type='button';b.className='ai-chip';b.innerHTML=`<span>${i}</span> ${esc(t)}`;b.onclick=()=>aiSend(q);g.append(b)}d.append(g);l.append(d)}
function aiUsage(u){if(!u)return;aiUsageData=u;$('#aiUse').textContent=u.limit<0?'Sin límite':u.limit===0?'Sin acceso':`${u.used}/${u.limit} por ${u.period==='day'?'día':'hora'}`}
async function aiStatus(){try{aiUsage((await api('/api/ai/status')).usage)}catch{}}
function aiUser(t){$('#ailog .ai-empty')?.remove();const m=aiEl('ai-m u'),b=aiEl('ai-b');b.textContent=t;m.append(b);$('#ailog').append(m);aiStick=true;aiBottom()}
function aiNewTurn(){$('#ailog .ai-empty')?.remove();const m=aiEl('ai-m a'),c=aiEl('ai-c'),think=aiEl('ai-think','<i></i><i></i><i></i>');m.append(aiEl('ai-av','✨'),c);c.append(think);$('#ailog').append(m);
  aiT={m,c,think,cur:null,tools:new Map(),texts:[],raw:'',labels:[],raf:0,muts:0};aiStick=true;aiBottom();return aiT}
function aiBlock(x){const T=aiT;T.think.parentNode===T.c?T.c.insertBefore(x,T.think):T.c.append(x);aiBottom()}
function aiText(t){const T=aiT;if(!T.cur){const b=aiEl('ai-tx');T.cur={b,raw:''};T.texts.push(T.cur);aiBlock(b)}T.cur.raw+=t;T.raw+=t;
  if(!T.raf)T.raf=requestAnimationFrame(()=>{T.raf=0;for(const x of T.texts)if(x.d!==x.raw){x.b.innerHTML=aiMd(x.raw);x.d=x.raw}aiBottom()})}
function aiFlush(){const T=aiT;if(!T)return;cancelAnimationFrame(T.raf);T.raf=0;for(const x of T.texts){x.b.innerHTML=aiMd(x.raw);x.d=x.raw}}
function aiCard(key,name){const T=aiT;let k=T.tools.get(key);if(k)return k;T.cur=null;const d=document.createElement('details');d.className='ai-tool';d.dataset.st='prep';
  d.innerHTML=`<summary><span class="ai-ic">${AI_ICON[name]||'•'}</span><span class="ai-lb"></span><span class="ai-sm"></span><span class="ai-st"></span></summary><pre class="ai-tb"></pre>`;
  k={d,lb:d.querySelector('.ai-lb'),sm:d.querySelector('.ai-sm'),tb:d.querySelector('.ai-tb')};k.lb.textContent=(AI_NAME[name]||name)+'…';T.tools.set(key,k);aiBlock(d);return k}
const aiK=n=>n>=1000?(n/1000).toFixed(1).replace('.0','')+'k':String(n);
function aiEvent(e){const T=aiT;if(!T)return;
  if(e.type==='text')aiText(e.t);
  else if(e.type==='tool_prep')aiCard(e.key,e.name);
  else if(e.type==='tool_prog'){const k=T.tools.get(e.key);if(k)k.sm.textContent=aiK(e.chars)+' car.'}
  else if(e.type==='tool_start'){const k=aiCard(e.key,e.name);k.d.dataset.st='run';k.lb.textContent=e.label;k.sm.textContent=''}
  else if(e.type==='tool_end'){const k=aiCard(e.key,e.name);k.d.dataset.st=e.ok?'ok':'err';k.lb.textContent=e.label;k.sm.textContent=e.ok&&e.sum&&e.sum.length<60?e.sum:'';k.tb.textContent=e.detail||'';T.labels.push((e.ok?'':'FALLÓ: ')+e.label);if(e.mutates)T.muts++;if(!e.detail)k.d.classList.add('nobody')}
  else if(e.type==='changed'){clearTimeout(aiLoadT);aiLoadT=setTimeout(()=>{if(typeof load==='function')load()},500)}
  else if(e.type==='theme'){try{applyTheme(e.theme||{})}catch{}}
  else if(e.type==='done'){aiUsage(e.usage);if(e.themed)toast('Tema actualizado · lo tienes en Apariencia → Mis temas')}
  else if(e.type==='error'){aiFlush();aiBlock(aiEl('ai-err',esc(e.message)));T.err=true}
  aiBottom()}
function aiStop(){aiCtl?.abort()}
function aiSetBusy(b){aiBusy=b;const s=$('#aiSend');s.innerHTML=b?'<span class="ai-sq"></span>':ic('send');s.setAttribute('aria-label',b?'Detener':'Enviar');s.classList.toggle('danger',b);$('#aip').classList.toggle('ai-busy',b);$('#aiNew').disabled=b}
async function aiSend(text){text=String(text||'').trim();if(!text||aiBusy)return;const i=$('#aiIn');i.value='';
  aiSetBusy(true);aiUser(text);aiHist.push({role:'user',content:text});const T=aiNewTurn();aiCtl=new AbortController();let stopped=false;
  try{
    const r=await fetch('/api/ai/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:aiHist,context:aiCtx()}),signal:aiCtl.signal});
    if(r.status===401){location.href='/';return}
    if(!r.ok||!r.body){const d=await r.json().catch(()=>({}));throw Error(d.error||'Error '+r.status)}
    const rd=r.body.getReader(),dec=new TextDecoder();let buf='';
    for(;;){const{value,done}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let nl;while((nl=buf.indexOf('\n'))>=0){const ln=buf.slice(0,nl).trim();buf=buf.slice(nl+1);if(!ln)continue;try{aiEvent(JSON.parse(ln))}catch{}}}
  }catch(e){if(e.name==='AbortError')stopped=true;else aiEvent({type:'error',message:e.message})}
  aiFlush();T.think.remove();
  if(stopped)aiBlock(aiEl('ai-stop','Detenido. Lo que ya se hizo se mantiene (lo borrado está en la papelera).'));
  for(const k of T.tools.values())if(k.d.dataset.st==='prep'||k.d.dataset.st==='run')k.d.dataset.st='err';
  const note=T.labels.length?'\n[Acciones realizadas: '+T.labels.slice(0,12).join('; ').slice(0,700)+']':'';
  if(T.raw.trim()||T.labels.length)aiHist.push({role:'assistant',content:(T.raw.trim()||'(sin texto)')+note});else aiHist.pop();
  if(T.err&&!T.raw.trim()&&!T.labels.length)aiStatus();
  aiSetBusy(false);aiCtl=null;aiT=null;aiCtxLabel();if(!matchMedia('(pointer:coarse)').matches)i.focus()}
// El texto de contexto se actualiza al cambiar de carpeta o de selección
setInterval(()=>{if(!$('#aip')?.hidden&&!aiBusy)aiCtxLabel()},1200);
