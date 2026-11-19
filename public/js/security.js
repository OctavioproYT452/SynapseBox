// Ajustes de seguridad de la cuenta: 2FA (TOTP) y códigos de recuperación.
function showCodes(list,title='Códigos de recuperación'){
  const d=dialog(title,`<p class="muted" style="margin-top:0">Guárdalos ahora: <b>no volverán a mostrarse</b>. Cada código sirve una sola vez para recuperar tu cuenta si olvidas tu usuario o contraseña.</p><div class="codes">${list.map((c,i)=>`<code style="--d:${i}">${esc(c)}</code>`).join('')}</div><div class="row" style="margin-top:12px"><button type="button" class="btn ghost sm" data-cp>${ic('copy')} Copiar</button><button type="button" class="btn ghost sm" data-dl>${ic('download')} Descargar .txt</button></div>`);
  $('[data-cp]',d).onclick=async()=>{try{await navigator.clipboard.writeText(list.join('\n'));toast('Códigos copiados')}catch{toast('No se pudo copiar',1)}};
  $('[data-dl]',d).onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['SynapseBox - códigos de recuperación (un solo uso cada uno)\n\n'+list.join('\n')+'\n'],{type:'text/plain'}));a.download='synapsebox-codigos-recuperacion.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}}

async function security(){
  const s=await api('/api/security'),ss=(await api('/api/sessions').catch(()=>({sessions:[]}))).sessions;
  const d=dialog('Seguridad de la cuenta',`
  <h4 style="margin:0 0 6px">Verificación en dos pasos (2FA) ${s.totp?'<span class="badge ad">Activada</span>':'<span class="badge">Desactivada</span>'}</h4>
  <small>${s.totp?'Al iniciar sesión se pedirá un código de tu app de autenticación (Google Authenticator, Aegis, Authy, 1Password…).':'Añade una capa extra: además de la contraseña, se pedirá un código temporal de tu app de autenticación.'}</small>
  <div class="row" style="margin:10px 0 18px">${s.totp?`<button type="button" class="btn danger sm" data-off>${ic('lock')} Desactivar 2FA</button>`:`<button type="button" class="btn sm" data-on>${ic('shield')} Activar 2FA</button>`}</div>
  <h4 style="margin:0 0 6px">Códigos de recuperación <span class="badge ${s.codes?'':'bad'}">${s.codes} disponible${s.codes===1?'':'s'}</span></h4>
  <small>Sirven para volver a entrar si olvidas tu usuario o contraseña${s.totp?', o si pierdes tu app de autenticación':''}. Cada código se usa una sola vez.</small>
  <div class="row" style="margin-top:10px"><button type="button" class="btn ghost sm" data-gen>${ic('key')} ${s.codes?'Generar códigos nuevos':'Crear mis códigos'}</button></div>
  ${s.codes?'<small>Generar códigos nuevos invalida los anteriores.</small>':'<small class="muted">Aún no tienes códigos: sin ellos no podrás recuperar la cuenta si olvidas la contraseña.</small>'}
  <h4 style="margin:18px 0 6px">Mis sesiones abiertas <span class="badge">${ss.length}</span></h4><small>Si no reconoces alguna, ciérrala y cambia tu contraseña.</small>
  <div data-ss>${ss.map(x=>`<div class="row" style="margin-top:8px"><span class="grow"><b>${x.current?'Esta sesión':esc((x.ua||'Dispositivo').slice(0,48))}</b><br><small>${esc(x.ip||'')} · ${new Date(x.created_at).toLocaleString()}</small></span>${x.current?'':`<button type="button" class="btn ghost sm" data-rv="${esc(x.id)}">Cerrar</button>`}</div>`).join('')}</div>${ss.length>1?`<div class="row" style="margin-top:10px"><button type="button" class="btn ghost sm" data-rvall>Cerrar todas las demás</button></div>`:''}`);
  d.addEventListener('click',async e=>{const b=e.target.closest('[data-rv],[data-rvall]');if(!b)return;try{await api('/api/sessions/revoke',b.dataset.rv?{id:b.dataset.rv}:{others:true});toast('Sesión cerrada');d.close();security()}catch(x){toast(x.message,1)}});
  $('[data-gen]',d).onclick=async()=>{const p=await ask('Confirma tu contraseña','Contraseña actual','','password');if(!p)return;
    try{const r=await api('/api/recovery/regenerate',{password:p});d.close();showCodes(r.codes)}catch(x){toast(x.message,1)}};
  const on=$('[data-on]',d);if(on)on.onclick=async()=>{const p=await ask('Confirma tu contraseña','Contraseña actual','','password');if(!p)return;
    let r;try{r=await api('/api/2fa/setup',{password:p})}catch(x){return toast(x.message,1)}
    d.close();
    const e=dialog('Activar 2FA',`<ol style="margin:0 0 10px;padding-left:18px"><li>Abre tu app de autenticación y añade una cuenta nueva con la <b>clave manual</b> (tipo: basada en tiempo).</li><li>Introduce el código de 6 dígitos que muestre.</li></ol>
      <label>Clave secreta<div class="code" style="font-weight:700;letter-spacing:.08em;user-select:all;word-break:break-all">${esc(r.secret)}</div></label>
      <div class="row"><button type="button" class="btn ghost sm" data-cs>${ic('copy')} Copiar clave</button><a class="btn ghost sm" href="${esc(r.uri)}">${ic('link')} Abrir en mi app (móvil)</a></div>
      <label>Código de 6 dígitos<input class="input" inputmode="numeric" maxlength="7" autocomplete="one-time-code" placeholder="000 000"></label>`,
      async dd=>{const x=await api('/api/2fa/enable',{code:$('input',dd).value});toast('2FA activado');if(x.codes)setTimeout(()=>showCodes(x.codes),60)},'Activar');
    $('[data-cs]',e).onclick=async()=>{try{await navigator.clipboard.writeText(r.secret.replace(/ /g,''));toast('Clave copiada')}catch{toast('No se pudo copiar',1)}}};
  const off=$('[data-off]',d);if(off)off.onclick=()=>{d.close();
    dialog('Desactivar 2FA',`<p style="margin-top:0">Para desactivarlo confirma tu contraseña y un código actual de tu app (o un código de recuperación).</p><label>Contraseña<input class="input" type="password" autocomplete="current-password"></label><label>Código 2FA o de recuperación<input class="input" autocomplete="one-time-code" maxlength="14"></label>`,
      async dd=>{const i=$$('input',dd);await api('/api/2fa/disable',{password:i[0].value,code:i[1].value});toast('2FA desactivado')},'Desactivar')}}
