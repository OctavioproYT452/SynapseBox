// Resaltador de sintaxis LOCAL (sin librerías ni CDN) + lector de solo lectura + editor de código para los archivos del usuario.
// API: CV.hl(texto, lenguaje) · CV.langOf(nombre) · CV.read({...}) · CV.edit({...})
(() => {
'use strict';
const E = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const kw = s => new RegExp('\\b(?:' + s.trim().split(/\s+/).join('|') + ')\\b');
const END = '(?![\\s\\S])'; // fin real del texto (con la bandera m, $ sería fin de línea)

/* ---------- piezas comunes ---------- */
const DQ = /"(?:[^"\\\n]|\\.)*"?/, SQ = /'(?:[^'\\\n]|\\.)*'?/, TPL = /`(?:[^`\\]|\\[\s\S])*`?/;
const NUM = /\b(?:0[xX][\da-fA-F_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?)\b/;
const BLK = new RegExp('/\\*[\\s\\S]*?(?:\\*/|' + END + ')'), LN = /\/\/[^\n]*/, HASH = /#[^\n]*/;
const FN = /\b[A-Za-z_$][\w$]*(?=\s*\()/, TYPE = /\b[A-Z][A-Za-z0-9_]*\b/;
const CONST = /\b(?:true|false|null|undefined|NaN|Infinity|None|True|False|nil|NULL)\b/;

const KW = {
  js: 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await from as get set interface type enum implements public private protected readonly declare namespace abstract',
  java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record string using namespace async await get set',
  c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while class namespace template typename public private protected virtual override new delete using bool try catch throw',
  php: 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty extends final finally fn for foreach function global if implements include include_once instanceof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield',
  py: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case',
  go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
  rs: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while',
  sh: 'if then else elif fi for while until do done case esac function in select time echo exit return export local readonly source alias unset cd test',
  sql: 'select from where insert into values update set delete create table alter drop index view join inner left right outer full on group by order having limit offset union all distinct as and or not null is in between like exists case when then else end primary key foreign references default unique check constraint database begin commit rollback',
};

/* ---------- lenguajes: lista de [clase, expresión]; las expresiones no pueden tener grupos de captura ---------- */
const L = {};
const clike = (k, extra = []) => [['c', BLK], ['c', LN], ['s', TPL], ['s', DQ], ['s', SQ], ...extra, ['n', NUM], ['b', CONST], ['k', kw(KW[k])], ['f', FN], ['t', TYPE]];
L.js = clike('js'); L.java = clike('java'); L.go = clike('go'); L.rs = clike('rs');
L.c = clike('c', [['k', /^[ \t]*#[ \t]*[a-z]+/]]);
L.php = clike('php', [['c', HASH], ['a', /\$[A-Za-z_]\w*/], ['k', /<\?php|<\?=|\?>/]]);
L.py = [['s', new RegExp('"""[\\s\\S]*?(?:"""|' + END + ")|'''[\\s\\S]*?(?:'''|" + END + ')')], ['c', HASH], ['s', DQ], ['s', SQ], ['a', /^[ \t]*@[\w.]+/], ['n', NUM], ['b', CONST], ['k', kw(KW.py)], ['f', FN], ['t', TYPE]];
L.sh = [['c', /(?:^|[ \t])#[^\n]*/], ['s', DQ], ['s', SQ], ['a', /\$(?:\{[^}\n]*\}|\w+|[#?@*!$0-9])/], ['n', NUM], ['k', kw(KW.sh)]];
L.json = [['p', /"(?:[^"\\\n]|\\.)*"(?=\s*:)/], ['s', DQ], ['n', /-?\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/], ['b', /\b(?:true|false|null)\b/], ['c', LN], ['c', BLK]];
L.yaml = [['c', /(?:^|[ \t])#[^\n]*/], ['p', /^[ \t-]*(?:"[^"\n]*"|'[^'\n]*'|[^\s:#'"][^:#\n]*?)(?=:(?:[ \t]|$))/], ['s', DQ], ['s', SQ], ['a', /[&*][\w-]+/], ['n', NUM], ['b', /\b(?:[Tt]rue|[Ff]alse|[Nn]ull|[Yy]es|[Nn]o|TRUE|FALSE|NULL)\b|~/]];
L.ini = [['c', /^[ \t]*[;#][^\n]*/], ['h', /^[ \t]*\[[^\]\n]*\]/], ['p', /^[ \t]*[\w.\-@/]+(?=[ \t]*=)/], ['s', DQ], ['s', SQ], ['n', NUM], ['b', /\b(?:[Tt]rue|[Ff]alse|[Yy]es|[Nn]o|on|off)\b/], ['a', /\$\{?\w+\}?/]];
const attrStr = m => { const i = m.search(/["']/); return E(m.slice(0, i)) + '<span class="tk-s">' + E(m.slice(i)) + '</span>'; };
L.html = [['c', new RegExp('<!--[\\s\\S]*?(?:-->|' + END + ')')], ['c', new RegExp('<![A-Za-z][^>]*>|<\\?[\\s\\S]*?(?:\\?>|' + END + ')')], ['t', /<\/?[A-Za-z][\w:.-]*/], ['t', /\/?>/], [attrStr, /=\s*(?:"[^"]*"?|'[^']*'?)/], ['a', /[A-Za-z_:][\w:.-]*(?=\s*=)/], ['n', /&#?\w+;/]];
const numWord = m => /^-?(?:\d+\.?\d*|\.\d+)(?:[a-zA-Z]+|%)?$/.test(m) ? '<span class="tk-n">' + E(m) + '</span>' : E(m);
const cssRules = (lineComments) => [['c', BLK], ...(lineComments ? [['c', LN]] : []), ['s', DQ], ['s', SQ], ['k', /@[\w-]+/], ['a', /--[\w-]+|\$[\w-]+/], ['n', /#[\da-fA-F]{3,8}\b/], ['p', /[\w-]+(?=\s*:[^{}\n]{0,200}[;}])/], ['t', /[.#][A-Za-z_][\w-]*/], ['f', /[\w-]+(?=\()/], [numWord, /-?[\w.%-]*\d[\w.%-]*/], ['k', /!important/]];
L.css = cssRules(false); L.scss = cssRules(true);
L.md = [['s', new RegExp('^(?:```|~~~)[\\s\\S]*?(?:^(?:```|~~~)|' + END + ')')], ['h', /^#{1,6}[^\n]*/], ['c', /^>[^\n]*/], ['s', /`[^`\n]+`/], ['k', /\*\*[^*\n]+\*\*|__[^_\n]+__/], ['f', /!?\[[^\]\n]*\]\([^)\n]*\)/], ['k', /^[ \t]*(?:[-*+]|\d+\.)(?=[ \t])/], ['c', /^(?:-{3,}|\*{3,})$/]];
L.csv = [['s', DQ], ['n', /-?\b\d+(?:[.,]\d+)?\b/], ['o', /[,;\t|]/]];
L.log = [['n', /\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d+)?Z?|\b\d\d:\d\d:\d\d(?:[.,]\d+)?\b/], ['e', /\b(?:ERROR|FATAL|SEVERE|CRITICAL|Error|Exception)\b/], ['w', /\b(?:WARN|WARNING|Warning)\b/], ['k', /\b(?:INFO|DEBUG|TRACE|NOTICE)\b/], ['s', DQ], ['a', /\[[^\]\n]{1,40}\]/]];
L.sql = [['c', /--[^\n]*/], ['c', BLK], ['s', SQ], ['s', DQ], ['n', NUM], ['b', CONST], ['k', kw(KW.sql)], ['f', FN]]; L.sql.ci = true;

/* extensión → [lenguaje, etiqueta] */
const X = {};
const def = (lang, label, exts) => exts.split(' ').forEach(e => X['.' + e] = [lang, label]);
def('js', 'JavaScript', 'js mjs cjs jsx'); def('js', 'TypeScript', 'ts tsx'); def('json', 'JSON', 'json jsonc map webmanifest'); def('html', 'HTML', 'html htm vue'); def('html', 'XML', 'xml svg xsl rss');
def('css', 'CSS', 'css'); def('scss', 'SCSS', 'scss less'); def('py', 'Python', 'py rb'); def('java', 'Java', 'java cs kt swift'); def('c', 'C / C++', 'c h cpp hpp cc');
def('php', 'PHP', 'php'); def('go', 'Go', 'go'); def('rs', 'Rust', 'rs'); def('sh', 'Shell', 'sh bash zsh'); def('yaml', 'YAML', 'yml yaml');
def('ini', 'INI / Config', 'ini toml conf cfg env properties'); def('md', 'Markdown', 'md markdown'); def('csv', 'CSV', 'csv tsv'); def('log', 'Registro', 'log'); def('sql', 'SQL', 'sql'); def('txt', 'Texto', 'txt');
const langOf = name => { const i = String(name).lastIndexOf('.'); return (i >= 0 && X[name.slice(i).toLowerCase()]) || ['txt', 'Texto']; };

/* ---------- el resaltador ---------- */
const MAXHL = 300000, cache = {};
function compile(lang) {
  if (cache[lang]) return cache[lang];
  const rules = L[lang];
  return cache[lang] = { rules, re: new RegExp(rules.map(r => '(' + r[1].source + ')').join('|'), 'gm' + (rules.ci ? 'i' : '')) };
}
// Cada trozo se cierra al final de línea para que se pueda partir el resultado por «\n» sin dejar etiquetas abiertas.
const span = (cls, t) => {
  if (typeof cls === 'function') { if (t.indexOf('\n') < 0) return cls(t); cls = 's'; }
  return t.indexOf('\n') < 0 ? '<span class="tk-' + cls + '">' + E(t) + '</span>' : t.split('\n').map(p => p ? '<span class="tk-' + cls + '">' + E(p) + '</span>' : '').join('\n');
};
function hl(src, lang) {
  src = String(src);
  if (!L[lang] || src.length > MAXHL) return E(src);
  const { rules, re } = compile(lang); re.lastIndex = 0;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    let g = 1; while (g < m.length && m[g] === undefined) g++;
    out += E(src.slice(last, m.index)) + span(rules[g - 1][0], m[0]);
    last = m.index + m[0].length;
  }
  return out + E(src.slice(last));
}

/* ---------- utilidades de interfaz ---------- */
const $ = (s, r = document) => r.querySelector(s);
const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const icon = n => typeof ic === 'function' ? ic(n) : '';
const say = (m, bad) => typeof toast === 'function' ? toast(m, bad) : 0;
function copyText(t) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
  return new Promise((ok, ko) => { const a = document.createElement('textarea'); a.value = t; a.readOnly = true; a.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.append(a); a.select(); try { document.execCommand('copy') ? ok() : ko(); } catch (e) { ko(e); } a.remove(); });
}
function shell(cls) {
  const d = document.createElement('dialog'); d.className = 'wide cvd ' + (cls || '');
  document.body.append(d); d.addEventListener('close', () => d.remove());
  return d;
}
const jsonInfo = t => { try { const v = JSON.parse(t); return { ok: true, v }; } catch (e) { return { ok: false, msg: String(e.message || e).replace(/^JSON\.parse: /, '') }; } };
const MAXROWS = 5000;

/* ---------- LECTOR (solo lectura, sin teclado) ---------- */
function read({ name, content, dl, onEdit }) {
  const [lang, label] = langOf(name); let text = String(content).replace(/\r\n?/g, '\n'), wrap = innerWidth < 700, pretty = false, info = null;
  if (lang === 'json') { info = jsonInfo(text); if (info.ok && text.length > 200 && text.split('\n').length <= 3) pretty = true; }
  const d = shell('cv-read');
  d.innerHTML = `<div class="cv-top"><span class="cv-fi">${icon('code')}</span><b class="cv-name" title="${E(name)}">${E(name)}</b><span class="cv-badge">${E(label)}</span><span class="cv-badge cv-ro">Solo lectura</span><span class="cv-grow"></span>
    <button type="button" class="cv-b" data-copy>${icon('copy')}<span>Copiar</span></button><button type="button" class="cv-b" data-wrap>Ajustar</button>${lang === 'json' ? `<button type="button" class="cv-b" data-pretty>Formatear</button>` : ''}${onEdit ? `<button type="button" class="cv-b cv-pri" data-edit>${icon('edit')}<span>Editar</span></button>` : ''}${dl ? `<a class="cv-b" href="${E(dl)}">${icon('download')}<span>Descargar</span></a>` : ''}<button type="button" class="cv-b cv-x" data-x aria-label="Cerrar">${icon('x')}</button></div>
  <div class="cv-view" tabindex="0"><div class="cv-rows"></div></div><div class="cv-status"><span data-st></span><span class="cv-grow"></span><span data-js></span></div>`;
  const rows = $('.cv-rows', d), view = $('.cv-view', d);
  const draw = () => {
    let shown = text;
    if (pretty && info && info.ok) shown = JSON.stringify(info.v, null, 2);
    const lines = hl(shown, lang).split('\n'), n = lines.length, cut = n > MAXROWS;
    view.classList.toggle('cv-wrap', wrap);
    rows.style.setProperty('--gw', String(n).length + 'ch');
    rows.innerHTML = lines.slice(0, MAXROWS).map((h, i) => `<div class="cv-r"><span class="cv-n">${i + 1}</span><span class="cv-t">${h || ' '}</span></div>`).join('') + (cut ? `<div class="cv-more">Se muestran las primeras ${MAXROWS} líneas de ${n}. Descarga el archivo para verlo completo.</div>` : '');
    $('[data-st]', d).textContent = n + ' líneas · ' + fmtSize(new Blob([text]).size) + ' · UTF-8';
    $('[data-js]', d).innerHTML = info ? (info.ok ? '<span class="cv-ok">JSON válido' + (pretty ? ' · vista formateada' : '') + '</span>' : '<span class="cv-bad" title="' + E(info.msg) + '">JSON no válido: ' + E(info.msg.slice(0, 80)) + '</span>') : '';
    $('[data-wrap]', d).classList.toggle('on', wrap);
    const pb = $('[data-pretty]', d); if (pb) { pb.classList.toggle('on', pretty); pb.disabled = !(info && info.ok); }
  };
  d.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.x !== undefined) d.close();
    else if (b.dataset.wrap !== undefined) { wrap = !wrap; draw(); }
    else if (b.dataset.pretty !== undefined) { pretty = !pretty; draw(); }
    else if (b.dataset.edit !== undefined) { d.close(); onEdit(); }
    else if (b.dataset.copy !== undefined) copyText(pretty && info && info.ok ? JSON.stringify(info.v, null, 2) : text).then(() => say('Copiado'), () => say('No se pudo copiar', 1));
  });
  draw(); d.showModal(); view.focus({ preventScroll: true }); // se enfoca el contenedor, no hay ningún campo de texto: no sale el teclado
  return d;
}

/* ---------- EDITOR ---------- */
const COMMENT = { js: '//', java: '//', c: '//', php: '//', go: '//', rs: '//', scss: '//', py: '#', sh: '#', yaml: '#', ini: '#', sql: '--' };
const CODE = new Set('js java c php go rs scss css json html py sh yaml ini sql'.split(' '));
const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };

function edit({ name, content, onSave }) {
  const [lang, label] = langOf(name), unit = lang === 'py' ? '    ' : '  ', code = CODE.has(lang);
  let orig = String(content).replace(/\r\n?/g, '\n'), dirty = false, raf = 0, saving = false, lastN = 0;
  const d = shell('cv-edit');
  d.innerHTML = `<div class="cv-top"><span class="cv-fi">${icon('code')}</span><b class="cv-name" title="${E(name)}">${E(name)}</b><span class="cv-dot" data-dot title="Cambios sin guardar"></span><span class="cv-badge">${E(label)}</span><span class="cv-grow"></span>
    <button type="button" class="cv-b cv-pri" data-save disabled>${icon('check')}<span>Guardar</span></button><button type="button" class="cv-b cv-x" data-x aria-label="Cerrar">${icon('x')}</button></div>
  <div class="cv-ed"><div class="cv-gut"><div data-gut></div></div><div class="cv-box"><div class="cv-cl" data-cl></div><pre data-pre aria-hidden="true"></pre><textarea data-ta spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="Contenido de ${E(name)}"></textarea></div></div>
  <div class="cv-status"><span data-pos></span><span data-sel></span><span class="cv-grow"></span><span data-js></span><span class="cv-hint">Ctrl+S guardar${COMMENT[lang] || lang === 'html' || lang === 'css' ? ' · Ctrl+/ comentar' : ''} · Tab sangrar</span><span>${E(label)}</span></div>`;
  const ta = $('[data-ta]', d), pre = $('[data-pre]', d), gut = $('[data-gut]', d), cl = $('[data-cl]', d), sv = $('[data-save]', d);
  ta.value = orig;
  const lh = () => parseFloat(getComputedStyle(ta).lineHeight) || 21, pad = () => parseFloat(getComputedStyle(ta).paddingTop) || 12;
  const lineNo = () => ta.value.slice(0, ta.selectionStart).split('\n').length;

  function sync() { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; gut.style.transform = 'translateY(' + (-ta.scrollTop) + 'px)'; mark(); }
  function mark() {
    const n = lineNo(); cl.style.height = lh() + 'px'; cl.style.transform = 'translateY(' + (pad() + (n - 1) * lh() - ta.scrollTop) + 'px)';
    cl.style.display = document.activeElement === ta && ta.selectionStart === ta.selectionEnd ? 'block' : 'none';
    const col = ta.selectionStart - ta.value.lastIndexOf('\n', ta.selectionStart - 1);
    $('[data-pos]', d).textContent = 'Ln ' + n + ', Col ' + col;
    const sl = Math.abs(ta.selectionEnd - ta.selectionStart); $('[data-sel]', d).textContent = sl ? sl + ' seleccionados' : '';
  }
  function paint() {
    raf = 0; const v = ta.value, n = v.split('\n').length;
    pre.innerHTML = hl(v, lang) + '\n';
    if (n !== lastN) { gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); lastN = n; d.style.setProperty('--gw', Math.max(3, String(n).length) + 'ch'); }
    dirty = v !== orig; sv.disabled = !dirty || saving; $('[data-dot]', d).classList.toggle('on', dirty);
    const js = $('[data-js]', d);
    if (lang === 'json') { if (v.trim() === '') js.textContent = ''; else { const i = jsonInfo(v); js.innerHTML = i.ok ? '<span class="cv-ok">JSON válido</span>' : '<span class="cv-bad" title="' + E(i.msg) + '">' + E(i.msg.slice(0, 70)) + '</span>'; } }
    sync();
  }
  const later = () => { if (!raf) raf = requestAnimationFrame(paint); };

  // inserta texto conservando el historial de deshacer del navegador
  function put(text, from, to) {
    ta.focus(); if (from !== undefined) ta.setSelectionRange(from, to === undefined ? from : to);
    if (!document.execCommand || !document.execCommand('insertText', false, text)) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
  }
  const bounds = () => { const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd, a = v.lastIndexOf('\n', s - 1) + 1; let b = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e); if (b < 0) b = v.length; return [a, b]; };
  function tab(e) {
    e.preventDefault(); const s = ta.selectionStart, en = ta.selectionEnd;
    if (s === en && !e.shiftKey) return put(unit);
    const [a, b] = bounds(), old = ta.value.slice(a, b), out = old.split('\n').map(l => e.shiftKey ? l.replace(new RegExp('^(?: {1,' + unit.length + '}|\\t)'), '') : unit + l).join('\n');
    put(out, a, b); if (s === en) { const p = Math.max(a, s - (old.length - out.length)); ta.setSelectionRange(p, p); } else ta.setSelectionRange(a, a + out.length);
  }
  function enter(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || ta.selectionStart !== ta.selectionEnd) return;
    const v = ta.value, s = ta.selectionStart, line = v.slice(v.lastIndexOf('\n', s - 1) + 1, s), ind = /^[ \t]*/.exec(line)[0], prev = v[s - 1], next = v[s];
    const open = code && (/[{[(]$/.test(line.trimEnd()) || ((lang === 'py' || lang === 'yaml') && /:\s*$/.test(line)));
    if (!ind && !open) return;
    e.preventDefault();
    if (open && prev && PAIRS[prev] && next === PAIRS[prev] && prev !== next) { put('\n' + ind + unit + '\n' + ind); const p = s + 1 + ind.length + unit.length; ta.setSelectionRange(p, p); }
    else put('\n' + ind + (open ? unit : ''));
  }
  function comment() {
    const [a, b] = bounds(), ls = ta.value.slice(a, b).split('\n'), p = COMMENT[lang];
    let out;
    if (p) { const all = ls.every(l => !l.trim() || l.trimStart().startsWith(p)); out = ls.map(l => !l.trim() ? l : all ? l.replace(p + ' ', '').replace(p, '') : l.replace(/^(\s*)/, '$1' + p + ' ')).join('\n'); }
    else if (lang === 'html') { const all = ls.every(l => !l.trim() || /^\s*<!--.*-->\s*$/.test(l)); out = ls.map(l => !l.trim() ? l : all ? l.replace(/<!-- ?/, '').replace(/ ?-->/, '') : l.replace(/^(\s*)(.*?)(\s*)$/, '$1<!-- $2 -->$3')).join('\n'); }
    else if (lang === 'css') { const all = ls.every(l => !l.trim() || /^\s*\/\*.*\*\/\s*$/.test(l)); out = ls.map(l => !l.trim() ? l : all ? l.replace(/\/\* ?/, '').replace(/ ?\*\//, '') : l.replace(/^(\s*)(.*?)(\s*)$/, '$1/* $2 */$3')).join('\n'); }
    else return;
    put(out, a, b); ta.setSelectionRange(a, a + out.length);
  }
  function pair(e) {
    if (!code || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key, v = ta.value, s = ta.selectionStart, en = ta.selectionEnd, next = v[s] || '', prev = v[s - 1] || '';
    if (s !== en && PAIRS[k]) { e.preventDefault(); const sel = v.slice(s, en); put(k + sel + PAIRS[k]); ta.setSelectionRange(s + 1, s + 1 + sel.length); return; }
    if (s !== en) return;
    if (Object.values(PAIRS).includes(k) && next === k && (k !== '"' && k !== "'" && k !== '`' || prev !== '\\')) { e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); return; }
    if (!PAIRS[k]) return;
    const quote = k === PAIRS[k];
    if (quote && (/\w/.test(prev) || /\w/.test(next) || prev === '\\')) return;
    if (!quote && next && !/[\s)\]}.,;:]/.test(next)) return;
    e.preventDefault(); put(k + PAIRS[k]); ta.setSelectionRange(s + 1, s + 1);
  }
  function back(e) {
    if (!code || ta.selectionStart !== ta.selectionEnd || e.ctrlKey || e.metaKey || e.altKey) return;
    const s = ta.selectionStart, a = ta.value[s - 1], b = ta.value[s]; if (a && PAIRS[a] === b) { e.preventDefault(); ta.setSelectionRange(s - 1, s + 1); if (!document.execCommand || !document.execCommand('delete')) { ta.setRangeText('', s - 1, s + 1, 'end'); ta.dispatchEvent(new Event('input')); } }
  }
  async function save() {
    if (!dirty || saving) return; saving = true; sv.disabled = true; const v = ta.value;
    try { await onSave(v); orig = v; } catch (x) { say(x.message || 'No se pudo guardar', 1); } finally { saving = false; paint(); }
  }
  function close() { if (dirty && !confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return; d.close(); }

  ta.addEventListener('input', later); ta.addEventListener('scroll', sync);
  ['keyup', 'click', 'select', 'focus', 'blur'].forEach(v => ta.addEventListener(v, mark));
  ta.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); return save(); }
    if (mod && e.key === '/') { e.preventDefault(); return comment(); }
    if (e.key === 'Tab') return tab(e);
    if (e.key === 'Enter') return enter(e);
    if (e.key === 'Backspace') return back(e);
    if (e.key.length === 1) pair(e);
  });
  d.addEventListener('cancel', e => { if (dirty && !confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) e.preventDefault(); });
  d.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.x !== undefined) close(); else if (b.dataset.save !== undefined) save(); });
  addEventListener('resize', sync); d.addEventListener('close', () => removeEventListener('resize', sync));
  d.showModal(); paint(); ta.focus({ preventScroll: true }); ta.setSelectionRange(0, 0); mark();
  return d;
}

window.CV = { hl, langOf, read, edit };
})();
