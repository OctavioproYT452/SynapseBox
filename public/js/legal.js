const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
function go(){const h=(location.hash||'#privacidad').slice(1),ok=$$('[data-s]').some(a=>a.id===h),id=ok?h:'privacidad';
 $$('[data-s]').forEach(a=>a.hidden=a.id!==id);$$('#lnav a').forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+id));window.scrollTo(0,0)}
addEventListener('hashchange',go);go();
fetch('/api/legal').then(r=>r.json()).then(l=>{
 if(l.operator)$$('[data-op]').forEach(e=>e.textContent=l.operator);
 if(l.contact)$$('[data-contact]').forEach(e=>{e.textContent=l.contact;e.classList.remove('muted')});
 $$('[data-ver]').forEach(e=>e.textContent=l.version||'—');
 $$('[data-upd]').forEach(e=>e.textContent=l.updated||'');
}).catch(()=>{$$('[data-upd]').forEach(e=>e.textContent='2026-11-27')});
