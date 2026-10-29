// Asistente de IA del panel. Solo se crea (botón y chat) si el servidor informa de que la IA está activa.
let aiHist=[],aiBusy=false;
function aiInit(){
  if($('#aiBtn'))return;
  const b=document.createElement('button');b.className='btn ghost sm';b.id='aiBtn';b.innerHTML=ic('bot')+' Asistente IA';
  $('#nav').insertBefore(b,$('#nav').firstChild);
  const p=document.createElement('aside');p.className='aip card';p.id='aip';p.hidden=true;
  p.innerHTML=`<div class="row"><b class="grow">${ic('bot')} Asistente IA</b><small id="aiUse" class="muted"></small><button class="more" id="aiNew" title="Nueva conversación" aria-label="Nueva conversación">${ic('refresh')}</button><button class="more" id="aiX" aria-label="Cerrar">${ic('x')}</button></div>
  <div class="ailog" id="ailog" aria-live="polite"></div>
  <form class="aiform" id="aiForm"><textarea class="input" id="aiIn" rows="1" maxlength="4000" placeholder="Ej: crea una carpeta «Fotos 2026» y mueve ahí las imágenes"></textarea><button class="btn" aria-label="Enviar">${ic('send')}</button></form>
  <small class="muted">Solo actúa dentro de tu carpeta y no ejecuta archivos.</small>`;
  document.body.append(p);
  b.onclick=()=>{p.hidden=!p.hidden;if(!p.hidden){aiStatus();$('#aiIn').focus()}document.getElementById('nav')?.classList.remove('open')};
  $('#aiX').onclick=()=>p.hidden=true;
  $('#aiNew').onclick=()=>{if(aiBusy)return;aiHist=[];$('#ailog').innerHTML='';aiMsg('bot','Hola, dime qué quieres hacer con tus archivos: crear carpetas o archivos, mover, copiar, borrar…')};
  $('#aiForm').onsubmit=e=>{e.preventDefault();aiSend()};
  $('#aiIn').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();aiSend()}};
  aiMsg('bot','Hola, dime qué quieres hacer con tus archivos: crear carpetas o archivos, mover, copiar, borrar…');
}
function aiMsg(who,text,actions){const d=document.createElement('div');d.className='aim '+who;d.textContent=text;
  if(actions&&actions.length){const u=document.createElement('ul');u.className='aia';for(const a of actions){const li=document.createElement('li');li.className=a.ok?'ok':'bad';li.textContent=(a.ok?'✓ ':'✗ ')+a.text+(a.error?' — '+a.error:'');u.append(li)}d.append(u)}
  const l=$('#ailog');l.append(d);l.scrollTop=l.scrollHeight;return d}
function aiUsage(u){if(!u)return;$('#aiUse').textContent=u.limit<0?'Sin límite':u.limit===0?'Sin acceso':`${u.used}/${u.limit} por ${u.period==='day'?'día':'hora'}`}
async function aiStatus(){try{aiUsage((await api('/api/ai/status')).usage)}catch{}}
async function aiSend(){const i=$('#aiIn'),t=i.value.trim();if(!t||aiBusy)return;
  aiBusy=true;i.value='';aiMsg('me',t);aiHist.push({role:'user',content:t});
  const w=aiMsg('bot','Pensando…');w.classList.add('wait');$('#aiForm button').disabled=true;
  try{const r=await api('/api/ai/chat',{messages:aiHist});w.remove();aiHist.push({role:'assistant',content:r.reply});aiMsg('bot',r.reply,r.actions);aiUsage(r.usage);
    if(r.actions.some(a=>a.ok&&a.mutates))load()}
  catch(e){w.remove();aiHist.pop();aiMsg('bot',e.message);aiStatus()}
  aiBusy=false;$('#aiForm button').disabled=false;i.focus()}
