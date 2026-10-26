// ---------- Carpetas colaborativas: cx = carpeta compartida abierta (null = mis archivos) ----------
let cx=null,shared=new Set();
const LVL={read:0,write:1,create:2,delete:3,full:3},ROLE_TXT={read:'Solo lectura',write:'Lectura y edición',create:'Edición y creación',full:'Permisos totales'};
const can=p=>!cx||LVL[cx.role]>=LVL[p];
const cq=()=>cx?'&collab='+cx.id:'';
const _api=api;api=(url,body,method)=>{ // dentro de una carpeta compartida, las acciones de archivos llevan su id
  if(cx&&/^\/api\/(list|mkdir|create-file|edit|rename|move|delete|copy|file-content|compress|extract)\b/.test(url)){
    if(body&&!(body instanceof FormData))body={...body,collab:cx.id};else if(!body)url+=(url.includes('?')?'&':'?')+'collab='+cx.id}
  return _api(url,body,method)};
let favs=new Set(),viewTitle='Resultados',sel=new Set(),selMode=false,searching=false,cwd='',items=[],me=null,list=localStorage.fcList==='1';
const OFFICE=new Set('.doc .docx .xls .xlsx .ppt .pptx .odt .ods .odp .rtf'.split(' '));
const EDIT=new Set('.txt .md .markdown .js .mjs .cjs .jsx .ts .tsx .json .jsonc .html .htm .vue .css .scss .less .csv .tsv .log .xml .py .rb .java .cs .kt .swift .c .cpp .cc .hpp .h .php .go .rs .sh .bash .zsh .sql .yml .yaml .toml .conf .cfg .env .ini .properties'.split(' '));
const ext=n=>n.includes('.')?n.slice(n.lastIndexOf('.')).toLowerCase():'';
const join=n=>cwd?cwd+'/'+n:n;
const KIND={image:'.png .jpg .jpeg .gif .webp .svg .bmp .ico',video:'.mp4 .webm .mov .mkv',audio:'.mp3 .wav .flac .m4a .aac .ogg',doc:'.pdf .doc .docx .txt .md .odt .csv .xls .xlsx .ppt .pptx .rtf .ods .odp',code:'.js .mjs .cjs .jsx .ts .tsx .json .jsonc .html .htm .vue .css .scss .less .xml .py .rb .java .cs .kt .swift .c .cpp .cc .hpp .h .php .go .rs .sh .bash .zsh .sql .yml .yaml .toml .conf .cfg .env .ini'};
const icon=i=>{if(i.isDir)return ic(!cx&&shared.has(i.path||join(i.name))?'users':'folder');const e=ext(i.name);return ic(Object.keys(KIND).find(k=>KIND[k].split(' ').includes(e))||'file')};

async function load(){
  searching=false;sel.clear();
  try{const d=await api('/api/list?path='+encodeURIComponent(cwd));items=d.items;favs=new Set(d.favs||[]);shared=new Set(d.shared||[]);
    if(d.collab){cx={...cx,role:d.collab.role,owner:d.collab.owner,name:d.collab.name};
      $('#space').textContent=`${ROLE_TXT[cx.role]} · de ${cx.owner}`;$('#pct').textContent='';$('#bar').hidden=true;return render()}
    $('#bar').hidden=false;
    const max=d.maxMB<0?Infinity:d.maxMB*1048576,p=max===Infinity?0:Math.min(100,d.usedBytes/max*100);
    $('#space').textContent=`${fmt(d.usedBytes)} / ${max===Infinity?'∞':fmt(max)}`;$('#pct').textContent=max===Infinity?'':Math.round(p)+'%';
    $('#bar i').style.width=p+'%';$('#bar').className='bar'+(p>=100?' full':p>=90?' hi':'');render()}catch(e){toast(e.message,1);if(cwd){cwd='';load()}else if(cx)leaveCx(true)}}

function gate(){ // muestra solo lo que el rol permite (el servidor lo vuelve a comprobar)
  const vis=(s,v)=>$$(s).forEach(x=>x.hidden=!v);
  vis('[data-a=newFile],[data-a=newDir]',can('create'));$('#up').parentElement.hidden=$('#upd').parentElement.hidden=!can('create');
  vis('[data-a=favview],[data-a=recent]',!cx);vis('[data-b=cp]',can('create'));vis('[data-b=cz]',can('create'));vis('[data-b=mv]',can('write'));vis('[data-b=del]',can('delete'));
  $('#filter').placeholder=cx?'Filtrar esta carpeta…':'Filtrar… (Enter = buscar en todo)'}
function render(){
  const parts=cwd?cwd.split('/'):[];
  $('#crumbs').innerHTML=searching?`<button data-p="${esc(cwd)}">${ic('back')} Volver</button> ${esc(viewTitle)}`:(cx?`<button data-leave>${ic('back')} Mis archivos</button>›<button data-p="">${ic('users')} ${esc(cx.name)} <small>(de ${esc(cx.owner)})</small></button>`:`<button data-p="">${ic('home')} Inicio</button>`)+parts.map((p,i)=>`›<button data-p="${esc(parts.slice(0,i+1).join('/'))}">${esc(p)}</button>`).join('');
  const f=$('#filter').value.toLowerCase(),s=$('#sort').value;
  const v=items.filter(i=>i.name.toLowerCase().includes(f)).sort((a,b)=>b.isDir-a.isDir||(s==='size'?b.size-a.size:s==='date'?b.mtime-a.mtime:a.name.localeCompare(b.name,undefined,{numeric:true})));
  const g=$('#grid');g.className='grid'+(list?' list':'');
  g.innerHTML=v.map(i=>`<div class="item${sel.has(i.name)?' picked':''}" data-n="${esc(i.name)}" data-d="${i.isDir?1:''}"${i.path?` data-pa="${esc(i.path)}"`:''}><div class="ico">${selMode&&!i.path?(sel.has(i.name)?ic('checksq'):ic('square')):icon(i)}</div><div class="meta"><b>${favs.has(i.path||join(i.name))?ic('star','fill')+' ':''}${esc(i.name)}</b><small>${i.isDir?'Carpeta':fmt(i.size)} · ${new Date(i.mtime).toLocaleDateString()}${i.path?' · '+esc(i.path):''}</small></div>${i.path?'':'<button class="more" data-m aria-label="Opciones">'+ic('more')+'</button>'}</div>`).join('')||`<p class="muted">${f?'Sin resultados.':'Carpeta vacía. Sube archivos o arrástralos aquí.'}</p>`;
  $('#bulk').hidden=!selMode;$('#bn').textContent=sel.size;gate();
}
$('#crumbs').onclick=e=>{if(e.target.closest('[data-leave]'))return leaveCx();const b=e.target.closest('[data-p]');if(b){cwd=b.dataset.p;load()}};
$('#filter').oninput=render;$('#sort').value=localStorage.fcSort||'name';$('#sort').onchange=()=>{localStorage.fcSort=$('#sort').value;render()};
$('#filter').onkeydown=async e=>{if(e.key!=='Enter'||cx)return;try{const d=await api('/api/search?q='+encodeURIComponent(e.target.value.trim()));items=d.items;searching=true;viewTitle='Resultados';selMode=false;sel.clear();render()}catch(x){toast(x.message,1)}};
$('#grid').onclick=e=>{const it=e.target.closest('.item');if(!it)return;const n=it.dataset.n,dir=!!it.dataset.d;
  if(e.target.closest('[data-m]'))return menu(n,dir);if(it.dataset.pa!==undefined){const p=it.dataset.pa.split('/');p.pop();cwd=dir?it.dataset.pa:p.join('/');$('#filter').value=dir?'':n;return load()}if(selMode){sel.has(n)?sel.delete(n):sel.add(n);return render()}if(dir){cwd=join(n);$('#filter').value='';load()}else preview(n)};

function menu(n,dir){const ed=!dir&&EDIT.has(ext(n))&&can('write'),acts=[[ic(dir?'folder':'eye')+(dir?' Abrir':' Ver'),'open'],!dir&&[ic('download')+' Descargar','dl'],[ic('info')+' Propiedades','info'],dir&&[ic('zip')+' Descargar ZIP','zip'],can('create')&&[ic('zip')+' Comprimir en ZIP','cz'],!dir&&ext(n)==='.zip'&&can('create')&&[ic('zip')+' Descomprimir aquí (nueva carpeta)','uz'],ed&&[ic('edit')+' Editar','edit'],!cx&&[ic('star')+(favs.has(join(n))?' Quitar de favoritos':' Añadir a favoritos'),'fav'],!cx&&[ic('link')+' Compartir','share'],dir&&!cx&&[ic('users')+' Colaboración','collab'],can('write')&&[ic('edit')+' Renombrar','ren'],can('create')&&[ic('copy')+' Duplicar','dup'],can('write')&&[ic('move')+' Mover a…','mv'],can('delete')&&[ic('trash')+' Eliminar','del']].filter(Boolean);
  const d=dialog(n,`<div class="menu">${acts.map(([l,k])=>`<button type="button" data-k="${k}">${l}</button>`).join('')}</div>`);
  d.onclick=async e=>{const k=e.target.dataset?.k;if(!k)return;d.close();({open:()=>dir?(cwd=join(n),load()):preview(n),dl:()=>location.href='/api/download?path='+encodeURIComponent(join(n))+cq(),collab:()=>collabDialog(n),edit:()=>editor(n),info:()=>props(n,dir),share:()=>share(n),ren:()=>rename(n),mv:()=>moveTo(n),dup:()=>act('/api/copy',{path:join(n)}),zip:()=>location.href='/api/zip?path='+encodeURIComponent(join(n))+cq(),cz:()=>compress([n]),uz:()=>unzip(n),fav:()=>act('/api/fav',{path:join(n)}),del:()=>del(n)})[k]()}}

// «Propiedades»: tamaño, fechas, ubicación y, en archivos, huella SHA-256 (se calcula al pulsar el botón)
async function props(n,dir){try{const q='/api/file-info?path='+encodeURIComponent(join(n))+cq(),i=await api(q),fd=t=>t?new Date(t).toLocaleString():'—',r=(k,v)=>`<tr><td class="muted">${k}</td><td>${v}</td></tr>`;
  const d=dialog('Propiedades',`<table class="props">${r('Nombre',esc(i.name||n))}${r('Tipo',dir?'Carpeta':esc((ext(n)||'archivo').replace('.','').toUpperCase()||'Archivo'))}${r('Tamaño',fmt(i.size)+(i.size>=1024?' <span class="muted">('+i.size.toLocaleString()+' bytes)</span>':''))}${dir?r('Contiene',i.files+' archivo(s) y '+i.dirs+' carpeta(s) aquí'):''}${r('Ubicación',esc('/'+cwd))}${r('Modificado',fd(i.mtime))}${r('Creado',fd(i.ctime))}${dir?'':r('SHA-256','<span data-h><button type="button" class="btn ghost sm" data-calc>Calcular</button></span>')}</table>`);
  const c=$('[data-calc]',d);if(c)c.onclick=async()=>{c.disabled=true;c.textContent='Calculando…';try{const h=(await api(q+'&hash=1')).sha256;$('[data-h]',d).innerHTML=`<code class="hash">${h}</code> <button type="button" class="btn ghost sm" data-cp>${ic('copy')} Copiar</button>`;$('[data-cp]',d).onclick=()=>navigator.clipboard?.writeText(h).then(()=>toast('Copiado'),()=>toast('No se pudo copiar',1))}catch(e){c.disabled=false;c.textContent='Calcular';toast(e.message,1)}}}catch(e){toast(e.message,1)}}
async function rename(n){const v=await ask('Renombrar','Nuevo nombre',n);if(v&&v!==n)act('/api/rename',{path:join(n),newName:v})}
async function moveTo(n){const v=await ask('Mover','Carpeta destino (vacío = inicio)','');if(v!==null)act('/api/move',{path:join(n),dest:v.replace(/^\/+/,'')})}
async function del(n){if(await yes('Eliminar',`¿Mover "${n}" a la papelera? Podrás restaurarlo desde "Papelera".`))act('/api/delete',{path:join(n)})}
async function act(url,body){try{await api(url,body);toast('Hecho');load()}catch(e){toast(e.message,1)}}

function preview(n){const p=join(n),u='/api/preview?path='+encodeURIComponent(p)+cq(),e=ext(n);let h;
  if('.png .jpg .jpeg .gif .webp .bmp .ico'.includes(e)&&e)h=`<img class="pv" src="${u}">`;
  else if('.mp4 .webm .ogg .mov'.includes(e)&&e)h=`<video class="pv" controls src="${u}"></video>`;
  else if('.mp3 .wav .flac .m4a .aac'.includes(e)&&e)h=`<audio controls style="width:100%" src="${u}"></audio>`;
  else if(e==='.pdf'||OFFICE.has(e)){const d=dialog(n,`<div class="vw"><p class="muted">Cargando…</p></div><div class="row" style="margin-top:12px"><a class="btn sm" href="/api/download?path=${encodeURIComponent(p)}${cq()}">${ic('download')} Descargar</a></div>`,null,'','wide');return openViewer($('.vw',d),e,p,cq())}
  else if(EDIT.has(e))return reader(n);
  else h=`<p class="muted">Sin vista previa para este tipo de archivo.</p>`;
  dialog(n,`<div class="center">${h}</div><div class="row" style="margin-top:12px"><a class="btn sm" href="/api/download?path=${encodeURIComponent(p)}${cq()}">${ic('download')} Descargar</a></div>`,null,'','wide')}

// «Ver»: lector con resaltado de sintaxis, sin campos de texto (en el móvil no sale el teclado). Desde ahí se puede pasar a editar.
async function reader(n){try{const{content}=await api('/api/file-content?path='+encodeURIComponent(join(n)));
  CV.read({name:n,content,dl:'/api/download?path='+encodeURIComponent(join(n))+cq(),onEdit:can('write')?()=>editor(n):null})}catch(e){toast(e.message,1)}}
// «Editar»: editor con resaltado, numeración, sangría automática, Ctrl+S y aviso si hay cambios sin guardar.
async function editor(n){if(!can('write'))return reader(n);try{const{content}=await api('/api/file-content?path='+encodeURIComponent(join(n)));
  CV.edit({name:n,content,onSave:async c=>{await api('/api/edit',{path:join(n),content:c});toast('Guardado');load()}})}catch(e){toast(e.message,1)}}
async function share(n){const d=dialog('Compartir "'+n+'"',`<label>Caducidad<select><option value="1">1 día</option><option value="7" selected>7 días</option><option value="30">30 días</option><option value="0">Sin caducidad</option></select></label><label>Contraseña (opcional)<input class="input" type="password" autocomplete="new-password"></label><p class="muted">Cualquiera con el enlace podrá verlo. Puedes revocarlo en "Enlaces".</p>`,async d=>{
  const r=await api('/api/share',{path:join(n),days:$('select',d).value,password:$('input',d).value});setTimeout(()=>showLink(r.url),50)},'Crear enlace')}
function showLink(url){dialog('Enlace creado',`<input class="input" readonly value="${esc(url)}">`,async d=>{try{await navigator.clipboard.writeText(url);toast('Copiado')}catch{$('input',d).select();throw Error('Copia el enlace manualmente')}},'Copiar')}
async function cleanDlg(){const d=dialog('Limpieza','<p class="muted">Analizando tus archivos…</p>',null);let r;
  try{r=await api('/api/cleanup')}catch(e){d.close();return toast(e.message,1)}
  const ago=t=>new Date(t).toLocaleDateString(),row=(f,extra='')=>`<div class="item" style="cursor:default"><div class="meta"><b>${esc(f.name)}</b><small>/${esc(f.path)} · ${fmt(f.size)} · ${ago(f.mtime)}${extra}</small></div><button type="button" class="btn sm danger" data-x="${esc(f.path)}" title="Mover a la papelera">${ic('trash')}</button></div>`;
  const dup=r.dupes.length?r.dupes.map(g=>`<div class="card" style="margin:0 0 8px;padding:8px"><small class="muted">${g.files.length} copias de ${fmt(g.size)} · sobran ${fmt(g.size*(g.files.length-1))}</small><div class="menu">${g.files.map((f,i)=>row(f,i===0?' · el más antiguo':'')).join('')}</div></div>`).join(''):'<p class="muted">No hay archivos duplicados.</p>';
  const html=`<p class="muted" style="margin:0 0 8px">${r.scanned} archivos revisados${r.partial?' (análisis parcial: tienes muchos)':''}. Lo que elimines va a la papelera.</p><div class="row" style="gap:6px;margin-bottom:8px"><button type="button" class="btn sm" data-t="big">Más grandes</button><button type="button" class="btn sm ghost" data-t="dup">Duplicados${r.wasted?' · '+fmt(r.wasted):''}</button></div><div id="clb" style="max-height:52vh;overflow:auto"></div>`;
  d.close();const d2=dialog('Limpieza',html,null),box=d2.querySelector('#clb');let tab='big';
  const draw=()=>{box.innerHTML=tab==='big'?'<div class="menu">'+(r.big.map(f=>row(f)).join('')||'<p class="muted">No tienes archivos.</p>')+'</div>':dup;d2.querySelectorAll('[data-t]').forEach(b=>b.classList.toggle('ghost',b.dataset.t!==tab))};draw();
  d2.onclick=async e=>{const t=e.target.closest('[data-t]')?.dataset.t,x=e.target.closest('[data-x]')?.dataset.x;if(t){tab=t;return draw()}
   if(x){if(!await yes('Mover a la papelera',`¿Mover "/${x}" a la papelera?`))return;try{await api('/api/delete',{path:x});d2.close();load();cleanDlg()}catch(er){toast(er.message,1)}}}}
async function statsDlg(){const d=dialog('Estadísticas','<p class="muted">Analizando tus archivos…</p>',null);let r;
  try{r=await api('/api/stats')}catch(e){d.close();return toast(e.message,1)}
  const bar=(n,s,c,max)=>`<div style="margin:0 0 8px"><div class="row" style="justify-content:space-between;gap:8px"><b>${esc(n)}</b><small class="muted">${c} archivo(s) · ${fmt(s)} · ${r.total?Math.round(s*100/r.total):0}%</small></div><div style="height:8px;border-radius:4px;background:var(--border,#8884);overflow:hidden"><div style="height:100%;width:${max?Math.max(2,Math.round(s*100/max)):0}%;background:var(--accent,#4f8cff)"></div></div></div>`;
  const row=f=>`<div class="item" style="cursor:default"><div class="meta"><b>${esc(f.name)}</b><small>/${esc(f.path)} · ${fmt(f.size)} · ${new Date(f.mtime).toLocaleDateString()}</small></div><button type="button" class="btn sm danger" data-x="${esc(f.path)}" title="Mover a la papelera">${ic('trash')}</button></div>`;
  const html=`<p class="muted" style="margin:0 0 8px">${r.scanned} archivos · ${fmt(r.total)} en total${r.partial?' (análisis parcial: tienes muchos)':''}.</p><div class="row" style="gap:6px;margin-bottom:8px"><button type="button" class="btn sm" data-t="type">Por tipo</button><button type="button" class="btn sm ghost" data-t="dir">Carpetas</button><button type="button" class="btn sm ghost" data-t="old">Antiguos${r.oldCount?' · '+fmt(r.oldBytes):''}</button></div><div id="stb" style="max-height:52vh;overflow:auto"></div>`;
  d.close();const d2=dialog('Estadísticas',html,null),box=d2.querySelector('#stb');let tab='type';
  const draw=()=>{box.innerHTML=tab==='type'?(r.types.map(t=>bar(t.type,t.bytes,t.count,r.types[0]?.bytes)).join('')||'<p class="muted">No tienes archivos.</p>'):tab==='dir'?(r.dirs.map(t=>bar(t.name,t.bytes,t.count,r.dirs[0]?.bytes)).join('')||'<p class="muted">No tienes archivos.</p>'):`<p class="muted" style="margin:0 0 8px">${r.oldCount} archivo(s) sin modificar desde hace más de ${r.oldDays} días. Se muestran los 25 más pesados.</p><div class="menu">${r.old.map(row).join('')||'<p class="muted">No hay archivos antiguos.</p>'}</div>`;d2.querySelectorAll('[data-t]').forEach(b=>b.classList.toggle('ghost',b.dataset.t!==tab))};draw();
  d2.onclick=async e=>{const t=e.target.closest('[data-t]')?.dataset.t,x=e.target.closest('[data-x]')?.dataset.x;if(t){tab=t;return draw()}
   if(x){if(!await yes('Mover a la papelera',`¿Mover "/${x}" a la papelera?`))return;try{await api('/api/delete',{path:x});d2.close();load();statsDlg()}catch(er){toast(er.message,1)}}}}
async function trashDlg(){const t=await api('/api/trash'),left=x=>Math.max(0,Math.ceil((x-Date.now())/864e5));
  const body=!t.enabled&&!t.items.length?'<p class="muted">La papelera está desactivada: al borrar, los archivos se eliminan definitivamente.</p>':
   (t.items.length?`<p class="muted" style="margin:0 0 8px">${t.count} elemento(s) · ${fmt(t.bytes)}. Se vacía sola a los ${t.days} días.</p><div class="menu" style="max-height:50vh;overflow:auto">${t.items.map(i=>`<div class="item" style="cursor:default"><div class="meta"><b>${esc(i.name)}${i.isDir?'/':''}</b><small>${esc(i.path)} · ${fmt(i.size)} · quedan ${left(i.expires_at)} d${i.deleted_by?' · '+esc(i.deleted_by):''}</small></div><button type="button" class="btn sm ghost" data-r="${i.id}">Restaurar</button><button type="button" class="btn sm danger" data-d="${i.id}" title="Eliminar definitivamente">${ic('x')}</button></div>`).join('')}</div><div class="row" style="margin-top:10px"><button type="button" class="btn sm danger" data-e="1">Vaciar papelera</button></div>`:'<p class="muted">La papelera está vacía.</p>');
  const d=dialog('Papelera',body,null);
  d.onclick=async e=>{const r=e.target.closest('[data-r]')?.dataset.r,x=e.target.closest('[data-d]')?.dataset.d,em=e.target.closest('[data-e]');
   try{if(r){const o=await api('/api/trash/restore',{id:r});toast('Restaurado en '+o.path)}else if(x){if(!await yes('Eliminar definitivamente','Se borrará para siempre.'))return;await api('/api/trash/delete',{id:x})}else if(em){if(!await yes('Vaciar papelera','Se borrará todo para siempre.'))return;await api('/api/trash/empty',{})}else return;
    d.close();load();trashDlg()}catch(er){toast(er.message,1)}}}
async function shares(){const{shares}=await api('/api/shares');
  const d=dialog('Mis enlaces',shares.length?`<div class="menu">${shares.map(s=>`<div class="item" style="cursor:default"><div class="meta"><b>${esc(s.path)}</b><small>${s.expires_at?'Caduca '+new Date(s.expires_at).toLocaleDateString():'Sin caducidad'}</small></div><button type="button" class="btn sm ghost" data-c="${s.token}">Copiar</button><button type="button" class="btn sm danger" data-r="${s.token}">${ic('x')}</button></div>`).join('')}</div>`:'<p class="muted">No tienes enlaces activos.</p>',null);
  d.onclick=async e=>{const c=e.target.dataset?.c,r=e.target.dataset?.r;if(c){await navigator.clipboard?.writeText(location.origin+'/s/'+c);toast('Copiado')}if(r){await api('/api/share/revoke',{token:r});d.close();shares_()}}}
const shares_=shares;

function account(){
  const d=dialog('Mi perfil',`
  <div class="phead"><span class="uav xl">${esc(ini(me.user))}</span><div class="grow" style="min-width:0"><h3 class="pname">${esc(me.user)} ${me.admin?'<span class="badge ad">ADMIN</span>':''}</h3><button type="button" class="idchip" data-id title="Copiar el ID permanente de la cuenta">${ic('copy')} ID ${esc(me.uuid.slice(0,8))}…</button></div></div>
  <section class="psec"><h4>Almacenamiento</h4><div class="row"><small class="grow" id="pspace"></small><small id="ppct"></small></div><div class="bar" id="pbar"><i></i></div>
    <details class="pdet"><summary>Ver uso por tipo de archivo</summary><div id="st" class="muted" style="margin-top:8px">Calculando uso…</div></details></section>
  <section class="psec"><h4>Datos de acceso</h4>
    <div class="srow"><span class="si">${ic('user')}</span><div class="grow"><b>Nombre de usuario</b><small>${esc(me.user)}</small></div><button type="button" class="btn ghost sm" data-rn>Cambiar</button></div>
    <div class="srow"><span class="si">${ic('lock')}</span><div class="grow"><b>Contraseña</b><small>Al cambiarla se cierran tus otras sesiones</small></div><button type="button" class="btn ghost sm" data-pw>Cambiar</button></div></section>
  <section class="psec"><h4>Seguridad</h4>
    <div class="srow"><span class="si">${ic('shield')}</span><div class="grow"><b>Verificación en dos pasos</b><small id="s2">Comprobando…</small></div><button type="button" class="btn ghost sm" data-sec>Gestionar</button></div>
    <div class="srow"><span class="si">${ic('users')}</span><div class="grow"><b>Otras sesiones</b><small>Cierra tu cuenta en el resto de dispositivos</small></div><button type="button" class="btn ghost sm" data-rv>Cerrar</button></div></section>
  <section class="psec" id="dcsec" hidden><h4>Discord</h4>
    <div class="srow"><span class="si">${ic('chat')}</span><div class="grow"><b>Cuenta de Discord</b><small id="dcs">Comprobando…</small></div><button type="button" class="btn ghost sm" data-dcu hidden>Desvincular</button></div></section>
  <div class="row end"><button type="button" class="btn danger sm" data-out>${ic('logout')} Cerrar sesión</button></div>`,null,'','pro');
  const sp=$('#space'),pc=$('#pct'),bar=$('#bar');$('#pspace',d).textContent=sp?.textContent||'';$('#ppct',d).textContent=pc?.textContent||'';
  if(bar){$('#pbar',d).className=bar.className;$('#pbar i',d).style.width=$('i',bar).style.width}
  $('[data-id]',d).onclick=async()=>{try{await navigator.clipboard.writeText(me.uuid);toast('ID copiado')}catch{toast(me.uuid)}};
  $('[data-out]',d).onclick=logout;$('[data-rn]',d).onclick=()=>renameUser(d);$('[data-pw]',d).onclick=changePw;
  $('[data-sec]',d).onclick=()=>{d.close();security().catch(x=>toast(x.message,1))};
  $('[data-rv]',d).onclick=async()=>{if(await yes('Cerrar otras sesiones','Se cerrará tu cuenta en todos los demás dispositivos. Esta sesión seguirá abierta.')){await api('/api/sessions/revoke-others',{});toast('Otras sesiones cerradas')}};
  api('/api/discord').then(r=>{if(!r.enabled&&!r.linked)return;const sec=$('#dcsec',d),t=$('#dcs',d),b=$('[data-dcu]',d);sec.hidden=false;
    if(r.linked){t.innerHTML=`Vinculada con <b>${esc(r.linked.name||'Discord')}</b>${r.linked.since?' · desde el '+new Date(r.linked.since).toLocaleDateString():''}`;b.hidden=false;
      b.onclick=async()=>{if(await yes('Desvincular Discord','Dejarás de poder usar tu cuenta desde el bot de Discord. Podrás vincularla de nuevo cuando quieras.')){try{await api('/api/discord/unlink',{});toast('Discord desvinculado');d.close();account()}catch(x){toast(x.message,1)}}}}
    else t.innerHTML='Sin vincular. En el servidor de Discord escribe <code>/vincular</code> e introduce tu usuario, contraseña y 2FA.'}).catch(()=>{});
  api('/api/security').then(s=>{$('#s2',d).innerHTML=(s.totp?'<span class="badge ad">Activada</span>':'<span class="badge bad">Desactivada</span>')+` · ${s.codes} código${s.codes===1?'':'s'} de recuperación`}).catch(()=>{$('#s2',d).textContent='No disponible'});
  api('/api/stats').then(({stats})=>{const t=Object.values(stats).reduce((a,b)=>a+b,0)||1;$('#st',d).innerHTML=Object.entries(stats).map(([k,v])=>`<div class="row"><span class="grow">${k}</span><small>${fmt(v)}</small></div><div class="bar"><i style="width:${v/t*100}%"></i></div>`).join('')}).catch(()=>{})}
function changePw(){dialog('Cambiar contraseña',`<label>Contraseña actual<input class="input" type="password" autocomplete="current-password"></label><label>Nueva contraseña (mín. 8)<input class="input" type="password" autocomplete="new-password"></label><label>Repite la nueva contraseña<input class="input" type="password" autocomplete="new-password"></label>`,
  async d=>{const i=$$('input',d);if(!i[0].value||!i[1].value)throw Error('Completa todos los campos');if(i[1].value!==i[2].value)throw Error('Las contraseñas nuevas no coinciden');
    await api('/api/password',{current:i[0].value,next:i[1].value,next2:i[2].value});toast('Contraseña actualizada; las demás sesiones se cerraron')},'Cambiar contraseña')}

async function newDir(){const n=await ask('Nueva carpeta','Nombre');if(n)act('/api/mkdir',{name:n,path:cwd})}
function newFile(){dialog('Nuevo archivo',`<label>Nombre<input class="input" placeholder="nota.txt"></label><textarea class="code" style="height:30vh" spellcheck="false"></textarea>`,async d=>{await api('/api/create-file',{name:$('input',d).value.trim(),content:$('textarea',d).value,path:cwd});toast('Creado');load()},'Crear')}

function upload(files){if(!files.length)return;if(!can('create'))return toast('Tu rol en esta carpeta no permite subir archivos',1);const f=new FormData();[...files].forEach(x=>{f.append('files',x);f.append('paths',x.webkitRelativePath||'')});f.append('destPath',cwd);
  const x=new XMLHttpRequest(),P=$('#prog');P.style.display='block';$('#progT').textContent=`Subiendo ${files.length} archivo(s)…`;
  x.upload.onprogress=e=>{if(e.lengthComputable)$('#progB').style.width=e.loaded/e.total*100+'%'};
  x.onload=()=>{P.style.display='none';$('#progB').style.width='0';let r={};try{r=JSON.parse(x.responseText)}catch{}x.status<300?toast('Subida completa'):toast(r.error||'Error al subir',1);load()};
  x.onerror=()=>{P.style.display='none';toast('Error de red',1)};x.open('POST','/api/upload'+(cx?'?collab='+cx.id:''));x.send(f)}
$('#up').onchange=$('#upd').onchange=e=>{upload(e.target.files);e.target.value=''};
let dc=0;addEventListener('dragenter',e=>{e.preventDefault();dc++;$('#drop').classList.add('on')});addEventListener('dragleave',()=>{if(--dc<=0){dc=0;$('#drop').classList.remove('on')}});
addEventListener('dragover',e=>e.preventDefault());addEventListener('drop',e=>{e.preventDefault();dc=0;$('#drop').classList.remove('on');upload(e.dataTransfer.files)});

document.addEventListener('click',e=>{const a=e.target.closest('[data-a]')?.dataset.a;if(!a)return;
  ({clean:cleanDlg,stats:statsDlg,trash:trashDlg,shares,account,newDir,newFile,favview:()=>showList('/api/favs','Favoritos'),recent:()=>showList('/api/recent','Recientes'),theme:appearance,select:()=>{selMode=!selMode;sel.clear();render()},view:()=>{list=!list;localStorage.fcList=list?'1':'0';render()}})[a]()});
api('/api/session').then(s=>{if(!s.logged)return location.href='/';me=s;$('#me').textContent=s.user;userUI();$('#adminLink').hidden=!s.admin;if(s.ai)aiInit();load();loadCollabs();updateNotice(s);
  if(s.announcement&&localStorage.fcAnn!==s.announcement){const a=$('#ann');a.hidden=false;a.innerHTML=`${ic('info')}<span class="grow">${esc(s.announcement)}</span><button class="more" aria-label="Cerrar">${ic('x')}</button>`;$('button',a).onclick=()=>{localStorage.fcAnn=s.announcement;a.hidden=true}}});

async function compress(ns){const t=toast;try{toast('Comprimiendo…');const r=await api('/api/compress',{paths:ns.map(join)});toast('Creado '+r.name+' ('+fmt(r.size)+')');load()}catch(e){toast(e.message,1)}}
async function unzip(n){try{toast('Descomprimiendo…');const r=await api('/api/extract',{path:join(n)});toast('Descomprimido en la carpeta «'+r.name+'»');load()}catch(e){toast(e.message,1)}}
async function bulk(k){const ns=[...sel];if(!ns.length)return;let dest;
  if(k==='cz'){selMode=false;return compress(ns)}
  if(k==='zip'){location.href='/api/zip?'+ns.map(n=>'path='+encodeURIComponent(join(n))).join('&')+cq();return}
  if(k==='del'&&!await yes('Eliminar',`¿Mover ${ns.length} elemento(s) a la papelera? Podrás restaurarlos.`))return;
  if(k!=='del'){dest=await ask(k==='mv'?'Mover':'Copiar','Carpeta destino (vacío = inicio)','');if(dest===null)return;dest=dest.replace(/^\/+/,'')}
  for(const n of ns)try{await api({del:'/api/delete',mv:'/api/move',cp:'/api/copy'}[k],{path:join(n),dest})}catch(e){toast(n+': '+e.message,1)}
  selMode=false;load()}
document.addEventListener('click',e=>{const b=e.target.closest('[data-b]')?.dataset.b;if(b)bulk(b)});
addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;
  if(e.key==='/'){e.preventDefault();$('#filter').focus()}if(e.key==='Escape'&&selMode){selMode=false;sel.clear();render()}
  if(selMode&&e.key==='Delete')bulk('del');if(selMode&&e.ctrlKey&&e.key==='a'){e.preventDefault();items.forEach(i=>sel.add(i.name));render()}});
async function showList(url,title){try{const d=await api(url);items=d.items;searching=true;viewTitle=title;selMode=false;sel.clear();$('#filter').value='';render()}catch(e){toast(e.message,1)}}

async function renameUser(d){const n=await ask('Cambiar nombre de usuario','Nuevo nombre (3-32: letras, números, _ . -)',me.user);if(!n||n===me.user)return;
  const p=await ask('Confirma tu contraseña','Contraseña actual','','password');if(!p)return;
  try{const r=await api('/api/username',{username:n,password:p});me.user=r.user;$('#me').textContent=r.user;userUI();d.close();toast('Ahora te llamas '+r.user)}catch(e){toast(e.message,1)}}

// ---------- Carpetas compartidas conmigo ----------
async function loadCollabs(){
  const box=$('#collabs');
  try{const{folders}=await api('/api/collab/shared');box.hidden=!folders.length;
    box.innerHTML=folders.length?`<div class="row"><b class="grow">${ic('users')} Compartidas conmigo</b><small class="muted">${folders.length} carpeta(s)</small></div>
    <div class="grid">${folders.map(f=>`<div class="item" data-c="${f.id}" data-cn="${esc(f.name)}" data-co="${esc(f.owner)}" data-cr="${f.role}"><div class="ico">${ic('users')}</div><div class="meta"><b>${esc(f.name)}</b><small>Dueño: <span style="font-weight:700;display:inline">${esc(f.owner)}</span> · ${esc(ROLE_TXT[f.role]||f.role)}</small></div><button class="more" data-leavecollab aria-label="Dejar de colaborar">${ic('logout')}</button></div>`).join('')}</div>`:''}
  catch{box.hidden=true}}
$('#collabs').onclick=async e=>{const it=e.target.closest('[data-c]');if(!it)return;
  if(e.target.closest('[data-leavecollab]')){if(await yes('Dejar de colaborar',`¿Salir de «${it.dataset.cn}» (de ${it.dataset.co})? Perderás el acceso; el dueño puede volver a añadirte.`)){try{await api('/api/collab/remove',{id:+it.dataset.c});toast('Has salido de la carpeta');loadCollabs()}catch(x){toast(x.message,1)}}return}
  cx={id:+it.dataset.c,name:it.dataset.cn,owner:it.dataset.co,role:it.dataset.cr};cwd='';searching=false;selMode=false;sel.clear();$('#filter').value='';load();$('#crumbs').scrollIntoView({behavior:'smooth',block:'nearest'})};
function leaveCx(gone){cx=null;cwd='';searching=false;selMode=false;sel.clear();$('#filter').value='';if(gone)toast('Esta carpeta compartida ya no está disponible',1);load();loadCollabs()}

// ---------- Colaboración (dueño): añadir usuarios por UUID y asignar roles ----------
async function collabDialog(n){
  const rel=join(n);let roles=[],list=[];
  const opts=sel=>roles.map(r=>`<option value="${r.id}"${r.id===sel?' selected':''}>${esc(r.label)}</option>`).join('');
  const d=dialog('Colaboración: '+n,'<p class="muted">Cargando…</p>',null,'','wide');
  const draw=()=>{$('form>div',d).innerHTML=`<p class="muted">Los usuarios que añadas verán esta carpeta en su panel, en «Compartidas conmigo», con tu nombre como dueño. Los archivos siguen en tu cuenta y usan tu espacio. Cada usuario encuentra su UUID en <b>Mi cuenta</b>.</p>
    <h4>Colaboradores</h4>
    ${list.length?list.map(c=>`<div class="cl"><div class="grow"><b>${esc(c.username)}</b><br><small class="muted"><code>${esc(c.uuid)}</code></small></div><select data-role="${c.id}" aria-label="Rol de ${esc(c.username)}">${opts(c.role)}</select><button type="button" class="btn sm danger" data-rm="${c.id}" aria-label="Quitar a ${esc(c.username)}">${ic('trash')}</button></div>`).join(''):'<p class="muted">Todavía no hay colaboradores.</p>'}
    <h4>Añadir colaborador</h4>
    <div class="row"><input class="input grow" id="cuuid" placeholder="UUID del usuario" autocomplete="off" spellcheck="false"><select id="crole" aria-label="Rol">${opts('read')}</select><button type="button" class="btn" data-add>${ic('plus')} Añadir</button></div>`};
  const refresh=async()=>{list=(await api('/api/collab/folder?path='+encodeURIComponent(rel))).collaborators;draw()};
  try{roles=(await api('/api/collab/roles')).roles;await refresh()}catch(x){d.close();return toast(x.message,1)}
  d.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
    try{
      if('add'in b.dataset){const uuid=$('#cuuid',d).value.trim();if(!uuid)return toast('Introduce el UUID del usuario',1);
        const r=await api('/api/collab/add',{path:rel,uuid,role:$('#crole',d).value});await refresh();toast(r.username+' añadido')}
      else if(b.dataset.rm){const c=list.find(x=>x.id==b.dataset.rm);if(await yes('Quitar colaborador',`¿Quitar a ${c.username} de «${n}»? Dejará de ver la carpeta.`)){await api('/api/collab/remove',{id:+b.dataset.rm});await refresh()}}
    }catch(x){toast(x.message,1)}});
  d.addEventListener('change',async e=>{const s=e.target.closest('[data-role]');if(!s)return;
    try{await api('/api/collab/role',{id:+s.dataset.role,role:s.value});toast('Rol actualizado')}catch(x){toast(x.message,1);refresh()}});
  d.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='cuuid'){e.preventDefault();$('[data-add]',d).click()}});
  d.addEventListener('close',load)}
