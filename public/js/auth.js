let mode='login',ticket=null,useRec=false,rCode='',pend=null,codes=[];
const card=$('#card'),panes=$$('.pane');
const sub=$('#sub');
const setBusy=(b,on)=>{b.disabled=on;b.classList.toggle('busy',on)};
const fail=(el,msg)=>{el.textContent=msg;card.classList.remove('shake');void card.offsetWidth;card.classList.add('shake')};
function show(name){const cur=panes.find(p=>!p.hidden),nx=panes.find(p=>p.dataset.pane===name);if(cur===nx)return;
  const go=()=>{panes.forEach(p=>{p.hidden=p!==nx;p.classList.remove('out')});nx.style.animation='none';void nx.offsetWidth;nx.style.animation='';
    $$('.a',nx).forEach(a=>{a.style.animation='none';void a.offsetWidth;a.style.animation=''});
    $$('.err').forEach(e=>e.textContent='');$('input:not([type=checkbox])',nx)?.focus({preventScroll:true})};
  if(cur){cur.classList.add('out');setTimeout(go,200)}else go()}
const tabs=$('#tabs');
function setMode(m){mode=m;const reg=m==='register';$$('.tab').forEach(t=>t.classList.toggle('on',t.dataset.m===m));
  tabs.style.setProperty('--x',reg?'100%':'0');
  $('#go .lbl').textContent=reg?'Crear cuenta':'Entrar';$('#p').autocomplete=reg?'new-password':'current-password';
  $('#p').placeholder=reg?'Mínimo 8 caracteres':'';$('#l2').hidden=!reg;$('#accept').hidden=!reg;$('#meter').hidden=!reg;$('#forgot').parentElement.hidden=reg;$('#e').textContent='';
  sub.textContent=reg?'Crea tu cuenta en segundos.':'Tus archivos, en tu propio servidor.'}
$$('.tab').forEach(t=>t.onclick=()=>setMode(t.dataset.m));
api('/api/session').then(s=>{if(!s.registration){$('#regTab').hidden=true;tabs.classList.add('one');tabs.style.display='none'}});

// mostrar / ocultar contraseña
document.addEventListener('click',e=>{const b=e.target.closest('[data-eye]');if(b){const i=$('input',b.parentElement),v=i.type==='password';i.type=v?'text':'password';$('use',b).setAttribute('href','/icons.svg#'+(v?'eyeoff':'eye'))}
  const g=e.target.closest('.go');if(g&&!g.disabled){const r=g.getBoundingClientRect(),s=Math.max(r.width,r.height),x=document.createElement('i');x.className='rip';
    x.style.cssText=`width:${s}px;height:${s}px;left:${e.clientX-r.left-s/2}px;top:${e.clientY-r.top-s/2}px`;g.append(x);setTimeout(()=>x.remove(),650)}
  if(e.target.closest('[data-back]')){e.preventDefault();ticket=null;show('main')}});

// medidor de seguridad + coincidencia de contraseñas
function score(p){let s=0;if(p.length>=8)s++;if(p.length>=12)s++;if(/[a-z]/.test(p)&&/[A-Z]/.test(p))s++;if(/\d/.test(p))s++;if(/[^\w\s]/.test(p))s++;return Math.min(4,Math.max(p?1:0,s-(p.length<8?1:0)))}
const L=[['',''],['Débil','var(--danger)'],['Regular','var(--warn)'],['Buena','var(--ok)'],['Fuerte','var(--ok)']];
function check(){const p=$('#p').value,q=$('#p2').value,s=score(p),m=$('#meter');m.style.setProperty('--s',s/4);m.style.setProperty('--c',L[s][1]);$('#mt').textContent=L[s][0];
  const h=$('#match');h.className='hint';h.textContent='';if(q){const ok=p===q;h.classList.add(ok?'ok':'bad');h.textContent=ok?'Las contraseñas coinciden':'Las contraseñas no coinciden'}}
$('#p').addEventListener('input',()=>mode==='register'&&check());$('#p2').addEventListener('input',check);

function showCodes(list,next){codes=list;$('#codes').innerHTML=list.map((c,i)=>`<code style="--d:${i}">${esc(c)}</code>`).join('');$('#cOk').checked=false;$('#cGo').disabled=true;pend=next;sub.textContent='Un último paso importante';show('codes')}
const leave=()=>{card.classList.add('leave');setTimeout(()=>location.href='/panel.html',420)};
$('#cOk').onchange=e=>$('#cGo').disabled=!e.target.checked;
$('#cGo').onclick=()=>pend&&pend();
$('#cCopy').onclick=async()=>{try{await navigator.clipboard.writeText(codes.join('\n'));toast('Códigos copiados')}catch{toast('No se pudo copiar',1)}};
$('#cDl').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['SynapseBox - códigos de recuperación (un solo uso cada uno)\n\n'+codes.join('\n')+'\n'],{type:'text/plain'}));a.download='synapsebox-codigos-recuperacion.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};

// inicio de sesión / registro
$('#f').onsubmit=async e=>{e.preventDefault();const b=$('#go'),err=$('#e');err.textContent='';
  const u=$('#u').value.trim(),p=$('#p').value,q=$('#p2').value;
  if(!u||!p)return fail(err,'Completa usuario y contraseña');
  if(mode==='register'&&p!==q)return fail(err,'Las contraseñas no coinciden');
  setBusy(b,true);
  try{const r=await api('/api/'+mode,mode==='register'?{username:u,password:p,password2:q}:{username:u,password:p});
    if(r.need2fa){ticket=r.ticket;useRec=false;setTwo();sub.textContent='Protegemos tu cuenta';show('twofa')}
    else if(r.codes)showCodes(r.codes,leave);else leave()}
  catch(x){fail(err,x.message)}setBusy(b,false)};

// segundo factor
function setTwo(){$('#tc').value='';$('#tc').maxLength=useRec?14:7;$('#tc').inputMode=useRec?'text':'numeric';$('#tc').placeholder=useRec?'XXXX-XXXX-XXXX':'000 000';
  $('#tfLbl').textContent=useRec?'Código de recuperación':'Código de 6 dígitos';$('#useRec').textContent=useRec?'Usar mi app de autenticación':'Usar un código de recuperación';
  $('#tfHelp').textContent=useRec?'Introduce uno de tus códigos de recuperación (se gastará).':'Introduce el código de 6 dígitos de tu app de autenticación.'}
$('#useRec').onclick=e=>{e.preventDefault();useRec=!useRec;setTwo();$('#tc').focus()};
$('#tc').addEventListener('input',e=>{if(!useRec){const v=e.target.value.replace(/\D/g,'').slice(0,6);e.target.value=v.length>3?v.slice(0,3)+' '+v.slice(3):v;if(v.length===6)$('#ft').requestSubmit()}});
$('#ft').onsubmit=async e=>{e.preventDefault();const b=$('#ft .go'),err=$('#e2');err.textContent='';const c=$('#tc').value.trim();if(!c)return fail(err,'Introduce el código');
  setBusy(b,true);try{await api('/api/login/2fa',{ticket,code:c});leave()}
  catch(x){fail(err,x.message);if(/caduc/.test(x.message)){ticket=null;setTimeout(()=>show('main'),1600)}}setBusy(b,false)};

// recuperación de cuenta
$('#forgot').onclick=e=>{e.preventDefault();rCode='';$('#r1').hidden=false;$('#r2').hidden=true;$('#rgo').textContent='Continuar';$('#rc').value='';sub.textContent='Recupera el acceso a tu cuenta';show('recover')};
$('#rc').addEventListener('input',e=>{let v=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12);e.target.value=(v.match(/.{1,4}/g)||[]).join('-')});
$('#fr').onsubmit=async e=>{e.preventDefault();const b=$('#fr .go'),err=$('#e3');err.textContent='';setBusy(b,true);
  try{if($('#r2').hidden){const r=await api('/api/recover/check',{code:$('#rc').value});rCode=$('#rc').value;$('#ru').textContent=r.username;$('#r1').hidden=true;$('#r2').hidden=false;$('#rgo').textContent='Cambiar contraseña';
      $$('#r2 .a').forEach(a=>{a.style.animation='none';void a.offsetWidth;a.style.animation=''});$('#rp').focus()}
    else{const r=await api('/api/recover',{code:rCode,password:$('#rp').value,password2:$('#rp2').value});
      $('#u').value=r.username;$('#p').value='';$('#rp').value=$('#rp2').value='';setMode('login');sub.textContent='Tus archivos, en tu propio servidor.';show('main');
      toast('Contraseña cambiada. Ya puedes iniciar sesión'+(r.codes<=2?' (te quedan pocos códigos: genera nuevos en Ajustes)':''))}}
  catch(x){fail(err,x.message)}setBusy(b,false)};
