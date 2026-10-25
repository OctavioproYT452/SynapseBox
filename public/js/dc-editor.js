// Editor de comandos propios de Discord (SBScript): explorador de carpetas, propiedades, editor con resaltado, funciones, problemas y pruebas.
(()=>{
const S={list:{folders:[],commands:[],limits:{},types:[],access:[],match:[],bot:{}},docs:[],fn:new Set(),blk:new Set(),cur:null,dirty:false,open:new Set(['']),q:'',errs:[],tab:'prob',pmin:false,fnOpen:false,prevT:'slash',propsClosed:innerWidth<=900};
const side=$('#side'),work=$('#work'),scrim=$('#scrim');
const TT={slash:['/','','Slash'],prefijo:['!','p','Prefijo'],mensaje:['msg','m','Mensaje'],boton:['btn','b','Botón']};
const TPL={slash:'$title[¡Hola $nickname!]\n$description[Escribiste: $option[texto]]\n$color[#4f8cff]',prefijo:'Hola $nickname, usaste $prefix$commandName\n',mensaje:'¡Hola $mention!',boton:'$updateMessage\n$title[¡Botón pulsado!]\n$description[$mention pulsó «$buttonId».]\n$clearButtons'};
const newMeta=t=>({tipo:t,descripcion:t==='slash'?'Comando personalizado':'',acceso:'todos',activo:true,alias:[],opciones:[],disparador:t==='mensaje'?'hola bot':t==='boton'?'mi-boton':'',coincidencia:t==='boton'?'exacta':'contiene'});
const slug=s=>String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32);
const fslug=v=>String(v||'').split('/').map(slug).filter(Boolean).join('/');
const guard=async()=>!S.dirty||await yes('Cambios sin guardar','Perderás los cambios del comando actual. ¿Continuar?');
window.addEventListener('beforeunload',e=>{if(S.dirty){e.preventDefault();e.returnValue=''}});
const closeSide=()=>{side.classList.remove('dc-open');scrim.classList.remove('dc-open')};scrim.onclick=()=>{closeSide();setFn(false)};
function setFn(on){S.fnOpen=on;const r=$('#ref');if(r){r.hidden=!on;if(on)refList($('#rq').value)}scrim.classList.toggle('dc-open',on&&innerWidth<=900)}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.fnOpen&&document.activeElement?.id!=='code'){setFn(false);closeSide()}else if(e.key==='Escape'&&S.fnOpen&&document.querySelector('.dc-ac[style*=block]')==null&&document.activeElement?.id==='code'&&innerWidth<=900)setFn(false)});
const btn=(i,t,c='')=>`<button class="btn ${c}" ${''}>${ic(i)} ${t}</button>`;

async function load(keep){const[l,d]=await Promise.all([api('/api/admin/discord/cmds'),S.docs.length?S.docs:api('/api/admin/discord/script/docs')]);
  S.list=l;if(!S.docs.length){S.docs=d;S.fn=new Set(d.filter(x=>!x.blk).map(x=>x.n.toLowerCase()));S.blk=new Set(d.filter(x=>x.blk).map(x=>x.n.toLowerCase()))}
  tree();if(!keep)editor()}

// ---------------- explorador ----------------
function tree(){const l=S.list,q=S.q.toLowerCase(),b=l.bot||{};
  const root={k:{},c:[]},at=p=>p?p.split('/').reduce((n,s)=>n.k[s]??={k:{},c:[]},root):root;l.folders.forEach(at);l.commands.forEach(c=>{if(!q||c.name.includes(q)||c.descripcion.toLowerCase().includes(q))at(c.folder).c.push(c)});
  const cm=c=>`<div class="dc-cm ${S.cur?.id===c.id?'dc-on':''} ${c.activo?'':'dc-off'}" draggable="true" data-id="${esc(c.id)}"><span class="dc-tg ${TT[c.tipo][1]}">${TT[c.tipo][0]}</span><span class="dc-nm" title="${esc(c.id)}">${esc(c.name)}</span>${c.errores?'<span class="dc-err" title="Tiene errores"></span>':''}<span class="dc-ra"><button class="dc-ib" data-ca="dup" data-id="${esc(c.id)}" title="Duplicar">${ic('copy')}</button><button class="dc-ib dc-dng" data-ca="del" data-id="${esc(c.id)}" title="Borrar">${ic('trash')}</button></span></div>`;
  const rec=(n,p)=>Object.keys(n.k).sort().map(k=>{const fp=p?p+'/'+k:k,o=S.open.has(fp)||q;return`<div class="dc-fo" data-f="${esc(fp)}">${ic('folder')}<span class="dc-nm">${esc(k)}</span><span class="dc-ra"><button class="dc-ib" data-fa="rename" data-p="${esc(fp)}" title="Renombrar">${ic('edit')}</button><button class="dc-ib dc-dng" data-fa="delete" data-p="${esc(fp)}" title="Borrar carpeta">${ic('trash')}</button></span></div>${o?`<div class="dc-kids">${rec(n.k[k],fp)}${n.k[k].c.map(cm).join('')}</div>`:''}`}).join('');
  side.innerHTML=`<div class="dc-sh"><h4>Comandos</h4><div class="dc-row"><button class="btn sm" id="nc">${ic('plus')} Comando</button><button class="btn ghost sm" id="nf">${ic('folder')} Carpeta</button><button class="btn ghost sm" id="nai" title="Describe lo que quieres y la IA programa el comando leyendo la wiki">✨ IA</button><a class="btn ghost sm" href="/admin/discord-wiki.html" target="_blank" rel="noopener">${ic('info')} Wiki</a></div><input type="search" id="sq" placeholder="Buscar comando…" value="${esc(S.q)}"></div>
  <div class="dc-tree" id="tree">${rec(root,'')}${root.c.map(cm).join('')||(Object.keys(root.k).length?'':'<p class="muted" style="font-size:13px;padding:6px">Aún no hay comandos. Pulsa «+ Comando».</p>')}</div>
  <div class="dc-sf">${b.ready?'● Bot conectado':b.configured?'<span class="dc-warn">● Bot sin conectar</span>':'<span class="dc-warn">Falta DISCORD_TOKEN en .env</span>: puedes crear y probar, pero no se ejecutarán.'}
  ${b.ready&&!b.content&&l.commands.some(c=>c.activo&&(c.tipo==='prefijo'||c.tipo==='mensaje'))?'<br><span class="dc-warn">Activa «Message Content Intent» (Developer Portal → Bot) para los comandos de prefijo y de mensaje.</span>':''}<br>Comandos: <b>${l.commands.length}</b>/${l.limits.cmds||200}
  <div class="dc-pre"><span>Prefijo</span><input id="px" maxlength="3" value="${esc(l.prefix||'!')}"><button class="btn ghost sm" id="pxs">Guardar</button></div></div>`}
side.addEventListener('click',async e=>{const t=e.target;
  const ca=t.closest('[data-ca]');if(ca){e.stopPropagation();return ca.dataset.ca==='del'?delCmd(ca.dataset.id):dupCmd(ca.dataset.id)}
  const fa=t.closest('[data-fa]');if(fa){e.stopPropagation();return folderAct(fa.dataset.fa,fa.dataset.p)}
  if(t.closest('#nai'))return aiCmd();if(t.closest('#nc'))return newCmd();if(t.closest('#nf'))return newFolder();
  if(t.id==='pxs'){try{await api('/api/admin/discord/prefix',{prefix:$('#px').value});toast('Prefijo guardado');load(true)}catch(x){toast(x.message,1)}return}
  const f=t.closest('.dc-fo');if(f){const p=f.dataset.f;S.open.has(p)?S.open.delete(p):S.open.add(p);return tree()}
  const c=t.closest('.dc-cm');if(c&&await guard())open(c.dataset.id)});
side.addEventListener('input',e=>{if(e.target.id==='sq'){S.q=e.target.value;const p=e.target.selectionStart;tree();const i=$('#sq');i.focus();i.setSelectionRange(p,p)}});
side.addEventListener('dragstart',e=>{const c=e.target.closest('.dc-cm');if(c)e.dataTransfer.setData('text/plain',c.dataset.id)});
side.addEventListener('dragover',e=>{e.preventDefault();$$('.dc-over',side).forEach(x=>x.classList.remove('dc-over'));(e.target.closest('.dc-fo')||$('#tree'))?.classList.add('dc-over')});
side.addEventListener('drop',async e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain'),fo=e.target.closest('.dc-fo'),to=fo?fo.dataset.f:'';$$('.dc-over',side).forEach(x=>x.classList.remove('dc-over'));if(!id)return;
  try{if(S.cur?.id===id&&S.dirty)return toast('Guarda el comando antes de moverlo',1);const c=await api('/api/admin/discord/cmds/get?id='+encodeURIComponent(id));await api('/api/admin/discord/cmds/save',{id,folder:to,name:c.name,meta:c.meta,code:c.code});toast('Movido');if(S.cur?.id===id){S.cur.id=(to?to+'/':'')+c.name;S.cur.folder=to}S.open.add(to);await load(true);if(S.cur)editor()}catch(x){toast(x.message,1)}});

function newFolder(){dialog('Nueva carpeta',`<label class="fld"><span>Nombre (usa a/b para subcarpetas)</span><input id="fn" maxlength="70" placeholder="moderacion"></label>`,async d=>{const p=fslug($('#fn',d).value);if(!p)throw Error('Escribe un nombre');await api('/api/admin/discord/folders',{action:'create',path:p});S.open.add(p);await load(true)},'Crear')}
async function folderAct(a,p){
  if(a==='rename')dialog('Renombrar carpeta',`<label class="fld"><span>Nuevo nombre completo</span><input id="fn" value="${esc(p)}" maxlength="70"></label>`,async d=>{await api('/api/admin/discord/folders',{action:'rename',path:p,to:fslug($('#fn',d).value)});S.cur=null;S.dirty=false;await load()},'Renombrar');
  else if(await yes('Borrar carpeta',`Se borrará «${p}» con todos los comandos que contiene. No se puede deshacer.`)){try{await api('/api/admin/discord/folders',{action:'delete',path:p,force:true});if(S.cur&&(S.cur.folder===p||S.cur.folder.startsWith(p+'/')))S.cur=null,S.dirty=false;toast('Carpeta borrada');await load()}catch(x){toast(x.message,1)}}}
async function delCmd(id){if(!await yes('Borrar comando',`Se borrará «${id}». No se puede deshacer.`))return;
  try{await api('/api/admin/discord/cmds/delete',{id});if(S.cur?.id===id){S.cur=null;S.dirty=false}toast('Comando borrado');await load()}catch(x){toast(x.message,1)}}
async function dupCmd(id){if(!await guard())return;try{const c=await api('/api/admin/discord/cmds/get?id='+encodeURIComponent(id));S.cur={id:null,folder:c.folder,name:slug(c.name+'-copia'),meta:JSON.parse(JSON.stringify(c.meta)),code:c.code};S.dirty=true;S.errs=[];editor();tree();closeSide()}catch(x){toast(x.message,1)}}
async function aiCmd(){if(!await guard())return;
  const cur=S.cur&&S.cur.id?S.cur:null;
  dialog('✨ Programar con IA',`<p class="muted" style="margin-top:0">La IA lee toda la wiki de SBScript, escribe el comando y lo comprueba. <b>No se guarda nada</b>: lo verás en el editor para revisarlo, probarlo y guardarlo tú.</p><label class="dc-w">¿Qué debe hacer?<textarea id="ai-i" rows="6" maxlength="4000" placeholder="Ej.: un comando /captcha que envíe un captcha con imagen, y otro /verificar que compruebe el código y dé el rol Verificado…"></textarea></label><div class="dc-form"><label>Tipo<select id="ai-t"><option value="">Que decida la IA</option><option value="slash">Slash (/comando)</option><option value="prefijo">Prefijo (!comando)</option><option value="mensaje">Mensaje</option></select></label>${cur?`<label class="dc-ck"><input type="checkbox" id="ai-m" checked> Modificar «${esc(cur.name)}» (abierto)</label>`:''}</div><p class="muted" style="font-size:12px">Gasta un uso de tu límite de IA y puede tardar hasta un minuto. Revisa siempre el código antes de guardar.</p>`,async d=>{
    const ins=$('#ai-i',d).value.trim();if(ins.length<8)throw Error('Describe con más detalle qué debe hacer el comando');
    const btn=$('button[value=ok]',d);btn.disabled=true;btn.textContent='Pensando…';
    try{const mod=cur&&$('#ai-m',d)?.checked,r=await api('/api/admin/discord/cmds/ai',{instructions:ins,tipo:$('#ai-t',d).value,current:mod?{name:cur.name,meta:S.cur.meta,code:S.cur.code}:null});
      S.cur=mod?{...S.cur,meta:r.meta,code:r.code}:{id:null,folder:'',name:r.name,meta:r.meta,code:r.code};S.prevT=r.meta.tipo;S.dirty=true;S.errs=r.errors||[];editor();tree();closeSide();
      if(r.notes)setTimeout(()=>dialog('Notas de la IA',`<p style="white-space:pre-wrap">${esc(r.notes)}</p><p class="muted">El comando está en el editor sin guardar. Pulsa <b>Probar</b> y luego <b>Guardar</b>.</p>`),200)}
    finally{btn.disabled=false;btn.textContent='Generar'}},'Generar')}
async function newCmd(){if(!await guard())return;
  const fo=['',...S.list.folders].map(f=>`<option value="${esc(f)}">${f?esc(f):'(sin carpeta)'}</option>`).join('');
  dialog('Nuevo comando',`<div class="dc-form"><label class="dc-w">Nombre<input id="nn" maxlength="32" placeholder="saludo"></label><label>Tipo<select id="nt"><option value="slash">Slash (/comando)</option><option value="prefijo">Prefijo (!comando)</option><option value="mensaje">Mensaje (responde a un texto)</option><option value="boton">Botón (responde a un botón)</option></select></label><label>Carpeta<select id="nfo">${fo}</select></label></div>`,d=>{const name=slug($('#nn',d).value),t=$('#nt',d).value;if(!name)throw Error('Escribe un nombre');
    S.cur={id:null,folder:$('#nfo',d).value,name,meta:newMeta(t),code:TPL[t]};S.prevT=t;S.dirty=true;S.errs=[];editor();tree();closeSide()},'Crear')}
async function open(id){try{S.cur=await api('/api/admin/discord/cmds/get?id='+encodeURIComponent(id));S.dirty=false;S.errs=S.cur.errors||[];S.prevT=S.cur.meta.tipo;editor();tree();closeSide()}catch(x){toast(x.message,1)}}

// ---------------- editor ----------------
function emptyView(){work.innerHTML=`<div class="dc-empty"><h3>Comandos propios del bot</h3><p class="muted">Crea comandos con <b>SBScript</b>, un lenguaje sencillo parecido a BDScript. Elige uno de la lista o crea uno nuevo.</p><div class="dc-tin" style="justify-content:center"><button class="btn dc-onlym" id="mside">${ic('menu')} Ver comandos</button><button class="btn" id="mnew">${ic('plus')} Nuevo comando</button><a class="btn ghost" href="/admin/discord-wiki.html" target="_blank" rel="noopener">${ic('info')} Abrir la wiki</a></div></div>`;
  $('#mside').onclick=()=>{side.classList.add('dc-open');scrim.classList.add('dc-open')};$('#mnew').onclick=newCmd}
function editor(){const c=S.cur;if(!c)return emptyView();
  const m=c.meta,fo=['',...S.list.folders].map(f=>`<option value="${esc(f)}" ${f===c.folder?'selected':''}>${f?esc(f):'(sin carpeta)'}</option>`).join('');
  const sel=(id,arr,v,lab)=>`<select id="${id}">${arr.map(x=>`<option value="${x}" ${x===v?'selected':''}>${lab?.[x]||x}</option>`).join('')}</select>`;
  work.innerHTML=`<div class="dc-tabbar"><button class="btn ghost sm dc-onlym" id="mside">${ic('menu')}</button>
    <div class="dc-tab"><span class="dc-tg ${TT[m.tipo][1]}">${TT[m.tipo][0]}</span><span id="ttl">${esc(c.name)}</span><small class="muted">${c.id?esc(c.folder||'raíz'):'nuevo'}</small><i class="dc-dot" id="dty" title="Sin guardar"></i></div><span class="dc-grow"></span>
    <button class="btn" id="sv" title="Guardar (Ctrl+S)">${ic('check')} Guardar</button><button class="btn ghost sm" id="tst" title="Probar (Ctrl+Enter)">${ic('send')}<span class="dc-bl">Probar</span></button><button class="btn ghost sm" id="rf">${ic('code')}<span class="dc-bl">Funciones</span></button><a class="btn ghost sm" href="/admin/discord-wiki.html" target="_blank" rel="noopener">${ic('info')}<span class="dc-bl">Wiki</span></a>${c.id?`<button class="btn ghost sm dng" id="del">${ic('trash')}<span class="dc-bl">Borrar</span></button>`:''}</div>
  <details class="dc-props" ${S.propsClosed?'':'open'}><summary>Propiedades del comando</summary><div class="dc-pb"><div class="dc-form"><label>Nombre<input id="fname" maxlength="32" value="${esc(c.name)}"></label><label>Carpeta<select id="ffo">${fo}</select></label>
  <label>Tipo${sel('ftipo',['slash','prefijo','mensaje','boton'],m.tipo,{slash:'Slash (/comando)',prefijo:'Prefijo (!comando)',mensaje:'Mensaje',boton:'Botón (al pulsarlo)'})}</label>
  <label>Quién puede usarlo${sel('facc',S.list.access,m.acceso,{todos:'Todos',vinculados:'Cuentas vinculadas',admin:'Admins de SynapseBox',gestores:'Admins y gestores del servidor'})}</label><label class="dc-ck"><input type="checkbox" id="fact" ${m.activo?'checked':''}> Comando activo</label>
  ${m.tipo==='slash'?`<label class="dc-w">Descripción (la ve Discord, máx. 100)<input id="fdes" maxlength="100" value="${esc(m.descripcion)}"></label>`:''}
  ${m.tipo==='prefijo'?`<label class="dc-w">Otros nombres (separados por comas)<input id="fal" value="${esc(m.alias.join(', '))}" placeholder="hola, hi"></label>`:''}
  ${m.tipo==='boton'?`<label class="dc-w">Id del botón que lo activa (el que pones en $addButton)<input id="fdi" maxlength="80" value="${esc(m.disparador)}" placeholder="mi-boton"></label><label>Coincidencia${sel('fco',['exacta','empieza'],m.coincidencia==='contiene'?'exacta':m.coincidencia,{exacta:'El id es exactamente ese',empieza:'El id empieza así (ej. rol: para rol:123)'})}</label>`:''}${m.tipo==='mensaje'?`<label class="dc-w">Texto que lo activa<input id="fdi" maxlength="100" value="${esc(m.disparador)}"></label><label>Coincidencia${sel('fco',S.list.match,m.coincidencia,{exacta:'El mensaje es exactamente eso',contiene:'El mensaje contiene eso',empieza:'El mensaje empieza así'})}</label>`:''}</div>
  ${m.tipo==='slash'?`<div class="dc-opts" id="opts">${m.opciones.map((o,i)=>`<div class="dc-opt"><input data-k="name" value="${esc(o.name)}" placeholder="nombre" maxlength="32"><select data-k="type">${S.list.types.map(t=>`<option ${t===o.type?'selected':''}>${t}</option>`).join('')}</select><select data-k="required"><option value="0">Opcional</option><option value="1" ${o.required?'selected':''}>Obligatoria</option></select><input data-k="desc" value="${esc(o.desc)}" placeholder="descripción" maxlength="100"><button class="dc-ib dc-dng" data-rm="${i}" title="Quitar">${ic('x')}</button></div>`).join('')}</div><button class="btn ghost sm" id="ao" style="margin-top:8px" ${m.opciones.length>=25?'disabled':''}>${ic('plus')} Añadir opción</button>`:''}</div></details>
  <div class="dc-split"><div class="dc-edwrap"><div class="dc-ed"><div class="dc-gut" id="gut"></div><div class="dc-box"><div class="dc-cl" id="cl"></div><pre id="hl" aria-hidden="true"></pre><textarea id="code" spellcheck="false" wrap="off" autocapitalize="off" autocomplete="off" aria-label="Código del comando"></textarea><div class="dc-ac" id="ac"></div></div></div><div class="dc-status"><span id="pos">Ln 1, Col 1</span><span id="cnt"></span><span class="dc-grow"></span><span>SBScript</span><span>Ctrl+S guarda</span></div></div>
    <aside class="dc-fnp" id="ref" ${S.fnOpen?'':'hidden'}><div class="dc-fh" style="display:flex;gap:6px;align-items:center"><input type="search" id="rq" placeholder="Buscar función…"><button class="dc-ib" id="rclose" title="Cerrar (Esc)">${ic('x')}</button></div><div class="dc-fnl" id="rl"></div></aside></div>
  <div class="dc-panel ${S.pmin?'dc-min':''}" id="pn"><div class="dc-pt"><button data-pt="prob">Problemas<span class="dc-cnt" id="pc" hidden></span></button><button data-pt="test">Prueba</button><span class="dc-grow"></span><button id="pmin" title="Mostrar u ocultar">${S.pmin?'▲':'▼'}</button></div><div class="dc-pc" id="pcont"></div></div>`;
  $('#code').value=c.code;paint();wireForm();panel();if(S.fnOpen)refList('');checkSoon(0);showDirty()}
function readForm(){const c=S.cur,m=c.meta;c.name=slug($('#fname').value);c.folder=$('#ffo').value;m.acceso=$('#facc').value;m.activo=$('#fact').checked;
  if($('#fdes'))m.descripcion=$('#fdes').value;if($('#fal'))m.alias=$('#fal').value.split(',').map(slug).filter(Boolean);if($('#fdi'))m.disparador=$('#fdi').value;if($('#fco'))m.coincidencia=$('#fco').value;
  if($('#opts'))m.opciones=$$('.dc-opt').map(r=>({name:$('[data-k=name]',r).value,type:$('[data-k=type]',r).value,required:$('[data-k=required]',r).value==='1',desc:$('[data-k=desc]',r).value}));c.code=$('#code').value}
const showDirty=()=>{const d=$('#dty');if(d)d.classList.toggle('dc-show',S.dirty)};
const mark=()=>{S.dirty=true;showDirty()};
work.addEventListener('input',e=>{if(S.cur&&!e.target.closest('#pn,#rq'))mark()});
work.addEventListener('change',e=>{if(!S.cur||e.target.closest('#pn,#rq'))return;mark();if(e.target.id==='ftipo'){const c=S.cur;readForm();const old=S.prevT,t=e.target.value;c.meta.tipo=t;if(c.code.trim()===TPL[old].trim())c.code=TPL[t];if(t==='slash'&&!c.meta.descripcion)c.meta.descripcion='Comando personalizado';if(t==='mensaje'&&!c.meta.disparador)c.meta.disparador='hola bot';if(t==='boton'){if(!c.meta.disparador||old==='mensaje')c.meta.disparador='mi-boton';c.meta.coincidencia='exacta'}S.prevT=t;editor();tree()}});
work.addEventListener('toggle',e=>{if(e.target.classList?.contains('dc-props'))S.propsClosed=!e.target.open},true);
function wireForm(){const c=S.cur;
  $('#sv').onclick=save;$('#mside').onclick=()=>{side.classList.add('dc-open');scrim.classList.add('dc-open')};
  $('#rf').onclick=()=>setFn(!S.fnOpen);$('#rclose').onclick=()=>setFn(false);
  $('#tst').onclick=()=>{S.tab='test';S.pmin=false;panel()};
  const dl=$('#del');if(dl)dl.onclick=()=>delCmd(c.id);
  const ao=$('#ao');if(ao)ao.onclick=()=>{readForm();c.meta.opciones.push({name:'texto',type:'string',required:false,desc:'Opción'});mark();editor()};
  $$('[data-rm]').forEach(b=>b.onclick=()=>{readForm();c.meta.opciones.splice(+b.dataset.rm,1);mark();editor()});
  $('#rq').oninput=e=>refList(e.target.value);wireCode();symBar();
  $$('[data-pt]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.pt;S.pmin=false;panel()});$('#pmin').onclick=()=>{S.pmin=!S.pmin;panel()}}
async function save(){try{readForm();const c=S.cur;if(!c.name)throw Error('Escribe un nombre');const r=await api('/api/admin/discord/cmds/save',{id:c.id,folder:c.folder,name:c.name,meta:c.meta,code:c.code});
  c.id=r.id;S.dirty=false;S.errs=r.errors;if(c.folder)S.open.add(c.folder);toast(r.errors.length?'Guardado, pero con errores en el código':'Comando guardado');await load(true);editor()}catch(x){toast(x.message,1)}}

// ---------------- panel inferior ----------------
function panel(){const p=$('#pn');if(!p)return;p.classList.toggle('dc-min',S.pmin);$('#pmin').textContent=S.pmin?'▲':'▼';$$('[data-pt]').forEach(b=>b.classList.toggle('dc-act',b.dataset.pt===S.tab));
  const pc=$('#pc');pc.hidden=!S.errs.length;pc.textContent=S.errs.length;
  if(S.tab==='prob')showErrs();else testForm()}
function showErrs(){const e=$('#pcont');if(!e||S.tab!=='prob')return;const pc=$('#pc');if(pc){pc.hidden=!S.errs.length;pc.textContent=S.errs.length}
  e.innerHTML=S.errs.length?`<div class="dc-errs">${S.errs.map((x,i)=>`<button data-go="${i}">Línea ${x.line}, col. ${x.col}: ${esc(x.msg)}</button>`).join('')}</div>`:'<span class="dc-ok">✓ Sin errores de sintaxis.</span>'}
$('#work').addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b)go(+b.dataset.go)});
function go(i){const x=S.errs[i],ta=$('#code'),ls=ta.value.split('\n');let p=0;for(let k=0;k<x.line-1;k++)p+=ls[k].length+1;ta.focus();ta.setSelectionRange(p+x.col-1,p+x.col-1);ta.scrollTop=Math.max(0,(x.line-4)*LH())}

// ---------------- resaltado ----------------
const RE=/(^[ \t]*\/\/[^\n]*)|(\\[\\$;\[\]])|(\$[A-Za-z_]\w*)|(\[)|(\])|(;)|(\d+(?:\.\d+)?)|([^$\\\[\];\d\/\n]+|[\s\S])/gm;
function hl(src){let d=0,o='';RE.lastIndex=0;let m;
  while((m=RE.exec(src))&&m[0]!==''){const t=m[0];
    if(m[1])o+=`<span class="dc-c">${esc(t)}</span>`;else if(m[2])o+=`<span class="dc-e">${esc(t)}</span>`;
    else if(m[3]){const n=t.slice(1).toLowerCase();o+=`<span class="${S.blk.has(n)?'dc-k':S.fn.has(n)?'dc-f':'dc-u'}">${esc(t)}</span>`}
    else if(m[4]){o+=`<span class="dc-d${d%4}">[</span>`;d++}else if(m[5]){d=Math.max(0,d-1);o+=`<span class="dc-d${d%4}">]</span>`}
    else if(m[6])o+='<span class="dc-s">;</span>';else if(m[7])o+=`<span class="dc-n">${t}</span>`;else o+=esc(t)}
  return o+'\n '}
let raf=0;function paint(){const ta=$('#code');if(!ta)return;$('#hl').innerHTML=hl(ta.value);gutter();status()}
function gutter(){const ta=$('#code'),n=ta.value.split('\n').length,bad=new Set(S.errs.map(e=>e.line)),cur=lineNo(ta);lastCur=cur;$('#gut').innerHTML=Array.from({length:n},(_,i)=>bad.has(i+1)?`<span class="dc-gl">${i+1}</span>`:i+1===cur?`<span class="dc-gc">${i+1}</span>`:i+1).join('\n');syncScroll()}
function syncScroll(){const ta=$('#code');if(!ta)return;$('#hl').scrollTop=ta.scrollTop;$('#hl').scrollLeft=ta.scrollLeft;$('#gut').scrollTop=ta.scrollTop}
function status(){const ta=$('#code');if(!ta)return;curLine();const b=ta.value.slice(0,ta.selectionStart).split('\n');$('#pos').textContent=`Ln ${b.length}, Col ${b.at(-1).length+1}`;$('#cnt').textContent=`${ta.value.split('\n').length} líneas · ${ta.value.length}/${S.list.limits.code||20000} caracteres`}
let ct=0;function checkSoon(ms=600){clearTimeout(ct);ct=setTimeout(async()=>{if(!S.cur||!$('#code'))return;try{readForm();S.errs=(await api('/api/admin/discord/cmds/check',{code:S.cur.code,meta:S.cur.meta})).errors;showErrs();gutter()}catch{}},ms)}

// ---------------- teclado y autocompletado ----------------
const acEl=()=>$('#ac');let acList=[],acI=0,acFrom=0;
const SNIP={if:['$if[]\n  \n$endif',4],for:['$for[i;1;5]\n  \n$endfor',5],while:['$while[]\n  \n$endwhile',7]};
const LH=()=>{const t=$('#code');return t?parseFloat(getComputedStyle(t).lineHeight)||21:21};
const lineNo=ta=>ta.value.slice(0,ta.selectionStart).split('\n').length;let lastCur=0;
function curLine(){const ta=$('#code'),cl=$('#cl');if(!ta||!cl)return;const n=lineNo(ta),lh=LH(),pad=parseFloat(getComputedStyle(ta).paddingTop)||12;
  cl.style.height=lh+'px';cl.style.transform='translateY('+(pad+(n-1)*lh-ta.scrollTop)+'px)';cl.style.display=document.activeElement===ta&&ta.selectionStart===ta.selectionEnd?'block':'none';
  if(n!==lastCur)gutter()}
const lineBounds=(v,s,e)=>{const a=v.lastIndexOf('\n',s-1)+1;let b=v.indexOf('\n',e>s&&v[e-1]==='\n'?e-1:e);if(b<0)b=v.length;return[a,b]};
function tabKey(e,ta){e.preventDefault();const s=ta.selectionStart,en=ta.selectionEnd;if(s===en&&!e.shiftKey)return insert(ta,'  ');
  const[a,b]=lineBounds(ta.value,s,en),old=ta.value.slice(a,b),out=old.split('\n').map(l=>e.shiftKey?l.replace(/^ {1,2}|^\t/,''):'  '+l).join('\n');
  ta.setRangeText(out,a,b,'select');if(s===en){const p=Math.max(a,s-(old.length-out.length));ta.setSelectionRange(p,p)}else ta.setSelectionRange(a,a+out.length);input()}
function enterKey(e,ta){const v=ta.value,s=ta.selectionStart;if(s!==ta.selectionEnd)return false;
  const line=v.slice(v.lastIndexOf('\n',s-1)+1,s),ind=/^[ \t]*/.exec(line)[0],opens=/^\s*\$(if|elseif|else|for|while)\b/i.test(line)&&!/\$end(if|for|while)\b/i.test(line);
  if(!ind&&!opens)return false;e.preventDefault();insert(ta,'\n'+ind+(opens?'  ':''));return true}
function toggleComment(ta){const[a,b]=lineBounds(ta.value,ta.selectionStart,ta.selectionEnd),ls=ta.value.slice(a,b).split('\n'),all=ls.every(l=>!l.trim()||/^\s*\/\//.test(l));
  const out=ls.map(l=>!l.trim()?l:all?l.replace(/^(\s*)\/\/ ?/,'$1'):l.replace(/^(\s*)/,'$1// ')).join('\n');ta.setRangeText(out,a,b,'select');input()}
function runNow(){S.tab='test';S.pmin=false;panel();$('#run')?.click()}
function symBar(){const w=$('.dc-edwrap');if(!w||$('#sym'))return;const d=document.createElement('div');d.className='dc-sym';d.id='sym';
  d.innerHTML=['$','[',']',';','\\','{','}','"','(',')','Tab'].map(s=>'<button type="button" data-s="'+esc(s)+'">'+esc(s)+'</button>').join('');w.insertBefore(d,$('.dc-status'));
  d.addEventListener('pointerdown',e=>e.preventDefault());d.addEventListener('mousedown',e=>e.preventDefault());
  d.addEventListener('click',e=>{const b=e.target.closest('[data-s]');if(!b)return;const ta=$('#code');ta.focus();const s=b.dataset.s;if(s==='Tab')return insert(ta,'  ');if(s==='[')return insert(ta,'[]',1);insert(ta,s)})}
function insert(ta,text,caret){const s=ta.selectionStart,e=ta.selectionEnd;ta.setRangeText(text,s,e,'end');if(caret!=null)ta.setSelectionRange(s+caret,s+caret);input()}
function acClose(){const a=acEl();if(a)a.style.display='none';acList=[]}
function acOpen(){const ta=$('#code'),pos=ta.selectionStart,m=/\$([A-Za-z_]\w*)$/.exec(ta.value.slice(0,pos));if(!m)return acClose();
  const q=m[1].toLowerCase();acFrom=pos-m[0].length;acList=S.docs.filter(d=>d.n.toLowerCase().startsWith(q)&&d.n.toLowerCase()!==q).slice(0,12);if(!acList.length)return acClose();acI=0;
  const ls=ta.value.slice(0,pos).split('\n'),a=acEl();a.style.display='block';
  acDraw();const lh=LH(),cy=ls.length*lh+lh/2-ta.scrollTop,ph=Math.min(a.offsetHeight,220);a.style.top=Math.max(4,cy+ph>ta.clientHeight-4?cy-lh-ph:cy)+'px';a.style.left=Math.min(Math.max(0,ta.clientWidth-280),14+ls.at(-1).length*charW()-ta.scrollLeft)+'px';acDraw()}
function acDraw(){acEl().innerHTML=acList.map((d,i)=>`<div class="${i===acI?'dc-sel':''}" data-i="${i}"><b>$${esc(d.n)}${d.a?`[${esc(d.a)}]`:''}</b><small>${esc(d.d)}</small></div>`).join('')}
function acPick(i){const d=acList[i],ta=$('#code');if(!d)return;ta.setSelectionRange(acFrom,ta.selectionStart);const k=d.n.toLowerCase();acClose();
  if(SNIP[k])return insert(ta,...SNIP[k]);const t='$'+d.n+(d.a&&!d.a.startsWith('[')?'[]':'');insert(ta,t,t.endsWith(']')?t.length-1:t.length)}
let cwv=0;const charW=()=>cwv||(cwv=(()=>{const c=document.createElement('canvas').getContext('2d');const cs=getComputedStyle($('#code'));c.font=cs.fontSize+' '+cs.fontFamily;return c.measureText('MMMMMMMMMM').width/10})());
function input(){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{paint();acOpen()});mark();checkSoon()}
function wireCode(){const ta=$('#code');
  ta.addEventListener('input',input);ta.addEventListener('scroll',()=>{syncScroll();curLine();acClose()});ta.addEventListener('blur',()=>setTimeout(acClose,150));['keyup','click'].forEach(v=>ta.addEventListener(v,status));['focus','blur'].forEach(v=>ta.addEventListener(v,curLine));
  ta.addEventListener('keydown',e=>{const open=acEl().style.display==='block';
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();return save()}
    if(open){if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();acI=(acI+(e.key==='ArrowDown'?1:-1)+acList.length)%acList.length;return acDraw()}if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();return acPick(acI)}if(e.key==='Escape')return acClose()}
    if(e.key==='Tab')return tabKey(e,ta);if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&enterKey(e,ta))return;if((e.ctrlKey||e.metaKey)&&e.key==='/'){e.preventDefault();return toggleComment(ta)}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();return runNow()}
    if(e.key==='['&&!e.ctrlKey&&!e.metaKey&&ta.value[ta.selectionStart-1]!=='\\'){e.preventDefault();return insert(ta,'[]',1)}
    if(e.key===']'&&ta.value[ta.selectionStart]===']'&&ta.value[ta.selectionStart-1]!=='\\'&&ta.selectionStart===ta.selectionEnd){e.preventDefault();return ta.setSelectionRange(ta.selectionStart+1,ta.selectionStart+1)}
    if(e.key==='Backspace'&&ta.selectionStart===ta.selectionEnd&&ta.value.slice(ta.selectionStart-1,ta.selectionStart+1)==='[]'){e.preventDefault();ta.setRangeText('',ta.selectionStart-1,ta.selectionStart+1,'end');return input()}});
  acEl().addEventListener('mousedown',e=>{const d=e.target.closest('[data-i]');if(d){e.preventDefault();acPick(+d.dataset.i)}})}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&S.cur&&document.activeElement?.id!=='code'){e.preventDefault();save()}});

// ---------------- panel de funciones ----------------
function refList(q){q=q.toLowerCase();const by={};S.docs.filter(d=>!q||d.n.toLowerCase().includes(q)||d.d.toLowerCase().includes(q)).forEach(d=>(by[d.c]??=[]).push(d));
  $('#rl').innerHTML=Object.entries(by).map(([c,l])=>`<div class="dc-cat">${esc(c)}</div>`+l.map(d=>`<button class="dc-fn" data-n="${esc(d.n)}"><code>$${esc(d.n)}${d.a?`[${esc(d.a)}]`:''}</code><small>${esc(d.d)}</small></button>`).join('')).join('')||'<p class="muted">Nada coincide.</p>';
  $$('.dc-fn',$('#rl')).forEach(b=>b.onclick=()=>{const d=S.docs.find(x=>x.n===b.dataset.n),ta=$('#code'),k=d.n.toLowerCase();ta.focus();if(SNIP[k])return insert(ta,...SNIP[k]);const t='$'+d.n+(d.a&&!d.a.startsWith('[')?'[]':'');insert(ta,t,t.endsWith(']')?t.length-1:t.length)})}

// ---------------- pruebas ----------------
function testForm(){const m=S.cur.meta,e=$('#pcont');if(!e)return;
  const inp=m.tipo==='slash'?(m.opciones.map(o=>`<label>${esc(o.name)}${o.required?' *':''}<input data-o="${esc(o.name)}" placeholder="${esc(o.type)}"></label>`).join('')||'<span class="muted">Este comando no tiene opciones.</span>'):(m.tipo==='boton'?`<label>Id del botón pulsado<input id="targs" value="${esc(m.disparador)}" placeholder="rol:123"></label>`:`<label>Lo que escribe el usuario después del comando<input id="targs" placeholder="palabra1 palabra2"></label>`);
  e.innerHTML=`<div class="dc-tin">${inp}<button class="btn" id="run">${ic('send')} Ejecutar prueba</button></div><div id="tout"><p class="muted" style="margin:0">La prueba no envía nada a Discord: las acciones (roles, expulsiones, mensajes) solo se describen.</p></div>`;$('#run').onclick=runTest}
async function runTest(){readForm();const o={};$$('[data-o]').forEach(i=>{if(i.value)o[i.dataset.o]=i.value});const b=$('#run');b.disabled=true;
  try{const r=await api('/api/admin/discord/cmds/test',{code:S.cur.code,meta:S.cur.meta,args:$('#targs')?.value||'',options:o}),out=$('#tout');
    if(r.errors?.length){S.errs=r.errors;gutter();out.innerHTML='<p class="muted">Corrige primero los errores (pestaña Problemas).</p>';$('#pc').hidden=false;$('#pc').textContent=r.errors.length;return}
    if(r.error){out.innerHTML=`<p style="color:var(--danger);margin:0">⚠ ${esc(r.error)}</p>`;return}
    const m=r.message||{},e=m.embeds?.[0];
    out.innerHTML=`<div class="dc-prev">${m.content?esc(m.content):(e?'':'<i>(sin texto: en Discord se respondería con ✓)</i>')}${e?`<div class="dc-emb" style="border-color:#${(e.color??0x4f8cff).toString(16).padStart(6,'0')}">${e.author?`<small>${e.author.icon_url?`<img class="dc-ico" src="${esc(e.author.icon_url)}" alt="">`:''}${esc(e.author.name)}</small>`:''}${e.title?`<h5>${esc(e.title)}${e.url?' 🔗':''}</h5>`:''}${e.thumbnail?`<img class="dc-thumb" src="${esc(e.thumbnail.url)}" alt="">`:''}${esc(e.description||'')}${(e.fields||[]).map(f=>`<div class="dc-fld"><b>${esc(f.name)}</b>${esc(f.value)}</div>`).join('')}${e.image?`<img src="${esc(e.image.url)}" alt="">`:''}${e.footer?`<div><small>${e.footer.icon_url?`<img class="dc-ico" src="${esc(e.footer.icon_url)}" alt="">`:''}${esc(e.footer.text)}</small></div>`:''}</div>`:''}${(m.components||[]).map(rw=>`<div class="dc-brow">${rw.components.map(b=>`<span class="dc-bt s${b.style}">${b.emoji?esc(b.emoji.name||'')+' ':''}${esc(b.label||'')}${b.style===5?' ↗':''}</span>`).join('')}</div>`).join('')}${r.ephemeral||r.stopped?'<span class="dc-eph">Solo la ve quien usa el comando</span>':''}</div>${r.stopped?'<p class="muted">El comando se detuvo con $stop / $onlyIf.</p>':''}${r.simulated?.length?`<ul class="dc-sim">${r.simulated.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`:''}`}
  catch(x){toast(x.message,1)}finally{b.disabled=false}}

emptyView();load(true).then(()=>{}).catch(x=>toast(x.message,1));
})();
