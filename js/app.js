/* ═══════════════════════════════════════════════════════════════════
   APRENDIZAJE INFINITO — SPA v7
   Un solo index.html (VACÍO) + este app.js generan TODO el interfaz.
   ───────────────────────────────────────────────────────────────────
   VISTAS (según la URL, sin archivos duplicados):
     index.html                → índice de temas (biblioteca)
     index.html?tema=<hoja>    → página del tema (tablas de SU hoja)
     index.html?id=<moduleId>  → compatibilidad: redirige a ?tema=…
   La hoja del tema se lee de la URL; el backend v6 hace el resto.

   BACKEND v6 (contrato intacto):
     GET  action=ping  → {ok, version, rev, hojas}
     GET  action=all   → {ok, rev, modules}        (solo hoja Index)
     GET  action=theme&sheet=X → {ok, rev, module, tables}
     POST module.create/update/delete · category.rename ·
          table.create/meta/delete · row.add/update/delete ·
          col.add/delete   → {ok, rev, …}

   REGLAS DE ORO:
     · SIN recargas periódicas: una verificación al abrir, pospuesta
       si estás escribiendo u hay guardados pendientes.
     · Lo escrito NUNCA se borra: local-first + captureEdits.
     · Nada editable hasta cargar: overlay #boot en los temas.
     · El badge "Guardando…" siempre se apaga solo (watchdog).

   CONFIGURACIÓN:
     window.AI_CONFIG.API_URL lo define config.js, que NO se sube a
     GitHub: en el deploy lo genera el workflow con el secret API_URL;
     en local lo genera «node crear-config.mjs» leyendo .env.local.
     Sin config.js el índice funciona en modo demostración.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ═══ 1 · Tema visual ANTES del primer pintado (sin destellos) ═══ */
document.documentElement.dataset.theme =
  localStorage.getItem('ai_theme') ||
  (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

/* <head> generado por JS: fuentes + favicon (el HTML no lleva nada) */
(function headInject(){
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&family=Space+Grotesk:wght@400..700&display=swap';
  const p1 = document.createElement('link'); p1.rel = 'preconnect'; p1.href = 'https://fonts.googleapis.com';
  const p2 = document.createElement('link'); p2.rel = 'preconnect'; p2.href = 'https://fonts.gstatic.com'; p2.crossOrigin = '';
  const fav = document.createElement('link');
  fav.rel = 'icon';
  fav.href = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><path d="M25,50 C25,20 75,20 100,50 C125,80 175,80 175,50 C175,20 125,20 100,50 C75,80 25,80 25,50 Z" fill="none" stroke="#a34a1d" stroke-width="13" stroke-linecap="round"/></svg>');
  document.head.append(p1, p2, css, fav);
})();

/* ═══ 2 · Configuración y ruta actual ═══ */
const API_URL  = (window.AI_CONFIG && window.AI_CONFIG.API_URL) || '';
const demoMode = !/^https?:\/\//i.test(API_URL);
const BASE     = location.pathname;   /* termina en "/" o en "index.html" */
const PARAMS   = new URLSearchParams(location.search);

console.info('[Aprendizaje Infinito] SPA v7 · ' +
  (demoMode ? 'modo demostración (falta config.js)' : 'API conectada'));

/* ═══ 3 · Utilidades ═══ */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad   = n => String(n).padStart(2,'0');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const isDark    = () => document.documentElement.dataset.theme === 'dark';
const isMobile  = () => window.innerWidth < 720;
/* Ids de fila generados EN EL CLIENTE → el backend los respeta:
   añadir filas nunca exige re-sincronizar ni re-renderizar. */
const newRowId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* Normalización de categorías: sin acentos, minúsculas, Ñ→n */
const ACC = {'á':'a','à':'a','ä':'a','â':'a','ã':'a','é':'e','è':'e','ë':'e','ê':'e',
  'í':'i','ì':'i','ï':'i','î':'i','ó':'o','ò':'o','ö':'o','ô':'o','õ':'o',
  'ú':'u','ù':'u','ü':'u','û':'u','ç':'c','Á':'a','À':'a','Ä':'a','Â':'a','Ã':'a',
  'É':'e','È':'e','Ë':'e','Ê':'e','Í':'i','Ì':'i','Ï':'i','Î':'i',
  'Ó':'o','Ò':'o','Ö':'o','Ô':'o','Õ':'o','Ú':'u','Ù':'u','Ü':'u','Û':'u','Ç':'c'};
function normCat(s){
  s = String(s == null ? '' : s).trim().replace(/\s+/g,' ');
  let out = '';
  for(const ch of s) out += ACC.hasOwnProperty(ch) ? ACC[ch] : ch;
  return out.toLowerCase();
}
/* Igual que slugSheet_ del backend: "Biología Celular" → biologia-celular */
function slugify(name){
  const s = String(name || '').trim().toLowerCase();
  let out = '';
  for(const ch of s){
    if(ch === 'ñ') out += 'n';
    else if(ACC.hasOwnProperty(ch)) out += ACC[ch];
    else out += ch;
  }
  return out.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'tema';
}
function prettyName(sheet){
  return (sheet || '').replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase());
}

const PALETTE = ['#a34a1d','#3f6f4e','#8a3a52','#b08a2e','#56652a','#2f6076','#7d4a6f','#4d4a42'];
const ICON_FALLBACK = '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>';

/* Icono del tema: SVG inline (sanitizado), URL de imagen, emoji o iniciales */
function renderIcon(raw){
  const s = String(raw || '').trim();
  if(/^<svg/i.test(s)){
    const clean = s
      .replace(/<script[\s\S]*?<\/script>/gi,'')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'');
    return `<span class="mod-icon">${clean}</span>`;
  }
  if(/^https?:\/\//i.test(s)){
    return `<span class="mod-icon"><img src="${esc(s)}" alt="" loading="lazy"
      onerror="this.parentElement.innerHTML='${ICON_FALLBACK.replace(/'/g,'&#39;')}'"></span>`;
  }
  if(s){
    if(/\p{Extended_Pictographic}/u.test(s))
      return `<span class="mod-icon">${esc([...s].slice(0,3).join(''))}</span>`;
    const ini = s.split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase();
    return `<span class="mod-icon">${esc(ini)}</span>`;
  }
  return `<span class="mod-icon">${ICON_FALLBACK}</span>`;
}

/* ═══ 4 · Red con TIMEOUT: ninguna petición queda colgada ═══ */
const FETCH_TIMEOUT = 30000;
function fetchWithTimeout(url, opts, ms = FETCH_TIMEOUT){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, Object.assign({}, opts, { signal: ctrl.signal }))
    .finally(() => clearTimeout(t));
}
async function apiGet(params){
  const r = await fetchWithTimeout(`${API_URL}?${params}`);
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
/* text/plain → evita el preflight CORS de Apps Script */
async function apiPost(action, payload){
  const r = await fetchWithTimeout(API_URL, {
    method: 'POST',
    headers: {'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify(Object.assign({ action }, payload))
  });
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
function abortMsg(err){
  return err && err.name === 'AbortError'
    ? 'tiempo de espera agotado (el cambio pudo guardarse; recarga para verificar)'
    : (err && err.message) || 'error de red';
}

/* ═══ 5 · Badge "Guardando…" con autolimpieza garantizada ═══
   Cada operación lleva su watchdog: pase lo que pase (respuesta,
   error o red colgada) el badge se apaga solo. */
const pendingOps = new Map();
let opSeq = 0;
const BADGE_DELAY = 350;    /* no parpadear en operaciones rápidas */
const BADGE_MAX   = 45000;  /* autolimpieza máxima de seguridad */

function refreshSavingBadge(){
  const el = document.getElementById('saving');
  if(!el) return;
  const n = pendingOps.size;
  el.hidden = n === 0;
  if(n > 0){
    const label = el.querySelector('span');
    if(label) label.textContent = n > 1 ? `Guardando… (${n})` : 'Guardando…';
  }
}
function opStart(){
  const id = ++opSeq;
  const info = { showT: null, maxT: null };
  info.showT = setTimeout(refreshSavingBadge, BADGE_DELAY);
  info.maxT  = setTimeout(() => opEnd(id), BADGE_MAX);
  pendingOps.set(id, info);
  return id;
}
function opEnd(id){
  const info = pendingOps.get(id);
  if(!info) return;
  clearTimeout(info.showT);
  clearTimeout(info.maxT);
  pendingOps.delete(id);
  refreshSavingBadge();
}
/* Indicador discreto "Actualizando…" (índice) */
function setSyncing(on){
  const el = document.getElementById('syncing');
  if(el) el.hidden = !on;
}

/* ═══ 6 · Toasts y confirmación ═══ */
function toast(msg, tone = 'ok'){
  const box = document.getElementById('toasts');
  if(!box) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.setProperty('--dot',
    tone === 'err' ? '#e0705a' : tone === 'warn' ? '#d9a441' : 'var(--accent)');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 3400);
}
function confirmDialog(title, body, okLabel = 'Eliminar'){
  return new Promise(res => {
    const titleEl = document.getElementById('c-title');
    const bodyEl  = document.getElementById('c-body');
    const d  = document.getElementById('dlg-confirm');
    if(!titleEl || !bodyEl || !d){ res(false); return; }
    titleEl.textContent = title;
    bodyEl.textContent  = body;
    const ok = document.getElementById('c-ok'), cancel = document.getElementById('c-cancel');
    ok.textContent = okLabel;
    const done = v => { ok.onclick = cancel.onclick = d.onclose = null; d.close(); res(v); };
    ok.onclick     = () => done(true);
    cancel.onclick = () => done(false);
    d.onclose      = () => { ok.onclick = cancel.onclick = d.onclose = null; res(false); };
    d.showModal();
  });
}

/* ═══ 7 · Overlay de carga (#boot) y pantalla de error ═══ */
let booted = false;
function hideBoot(){
  if(booted) return; booted = true;
  const b = document.getElementById('boot');
  if(b){ b.classList.add('off'); setTimeout(() => b.remove(), 350); }
}
function bootSvg(){
  return `<svg class="boot-inf" viewBox="0 0 200 100" aria-hidden="true">
    <path d="M25,50 C25,20 75,20 100,50 C125,80 175,80 175,50 C175,20 125,20 100,50 C75,80 25,80 25,50 Z"/>
  </svg>`;
}
function showBootError(title, detail){
  const b = document.getElementById('boot');
  if(!b) return;
  b.classList.remove('off');
  b.innerHTML = `${bootSvg()}
    <p style="font-size:15px;font-weight:600;color:var(--ink)">${esc(title)}</p>
    <p style="max-width:46ch;text-align:center;line-height:1.6">${esc(detail)}</p>
    <button class="btn" onclick="location.reload()">Reintentar</button>`;
}

/* ═══ 8 · CodeMirror 5.65.16 (doble CDN + degradación total) ═══
   NOTA: el addon "meta" (findModeByName / modeInfo) vive en mode/meta.min.js,
   NO en addon/mode/ (404 en ambos CDN → sin resaltado en el v5).
   El fallback jsdelivr quita ".min" porque el npm solo trae los .js. */
const CM_V = '5.65.16';
const CM_BASES = [
  f => `https://cdnjs.cloudflare.com/ajax/libs/codemirror/${CM_V}/${f}`,
  f => {
    let p = f;
    if(f === 'codemirror.min.js' || f === 'codemirror.min.css') p = 'lib/' + f;
    else if(f.endsWith('.min.js')) p = f.replace(/\.min\.js$/, '.js');
    else if(f.endsWith('.min.css')) p = f.replace(/\.min\.css$/, '.css');
    return `https://cdn.jsdelivr.net/npm/codemirror@${CM_V}/${p}`;
  }
];
let HAS_CM = false;

function loadScript(src, ms = 8000){
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    const t = setTimeout(() => { s.remove(); rej(new Error('timeout')); }, ms);
    s.src = src; s.async = false;
    s.onload  = () => { clearTimeout(t); res(); };
    s.onerror = () => { clearTimeout(t); s.remove(); rej(new Error('fallo')); };
    document.head.appendChild(s);
  });
}
async function bootCM(){
  ['codemirror.min.css','theme/material-darker.min.css','addon/hint/show-hint.min.css']
    .forEach(f => {
      const a = document.createElement('link');
      a.rel = 'stylesheet'; a.href = CM_BASES[0](f);
      a.onerror = () => { a.remove();
        const b = document.createElement('link'); b.rel='stylesheet'; b.href = CM_BASES[1](f);
        document.head.appendChild(b); };
      document.head.appendChild(a);
    });
  const files = ['codemirror.min.js','addon/runmode/runmode.min.js','mode/meta.min.js',
                 'addon/hint/show-hint.min.js','addon/hint/anyword-hint.min.js',
                 'addon/edit/matchbrackets.min.js','addon/edit/closebrackets.min.js'];
  let lastOk = 0;
  for(const f of files){
    let ok = false;
    for(let i = 0; i < CM_BASES.length; i++){
      try{ await loadScript(CM_BASES[i](f)); ok = true; lastOk = i; break; }
      catch(_){ }
    }
    if(!ok) return false;
    if(f === 'codemirror.min.js')
      CodeMirror.modeURL = CM_BASES[lastOk]('mode/%N/%N.min.js');
  }
  return !!window.CodeMirror;
}

const FALLBACK_LANGS = ['Python','JavaScript','TypeScript','HTML','XML','CSS','SCSS','JSON','SQL',
  'Java','C','C++','C#','Go','Rust','PHP','Ruby','Swift','Kotlin','Dart','Shell','Bash','PowerShell',
  'YAML','TOML','Markdown','R','MATLAB','Lua','Perl','Scala','Haskell','Elixir','Dockerfile','Nginx'];
function populateLangList(){
  const el = document.getElementById('lang-list');
  if(!el) return;
  let names = FALLBACK_LANGS;
  if(HAS_CM && Array.isArray(window.CodeMirror && CodeMirror.modeInfo))
    names = CodeMirror.modeInfo.map(i => i.name).sort((a,b) => a.localeCompare(b,'es'));
  el.innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
}

/* Carga perezosa de modos según la columna */
const loadedModes = new Set(['null']);
function findMode(lang){
  if(!HAS_CM || !window.CodeMirror || !CodeMirror.findModeByName) return null;
  try{ return CodeMirror.findModeByName(lang || 'Plain Text') || null; }
  catch(_){ return null; }
}
function loadMode(lang, cb){
  const info = findMode(lang);
  if(!info || !info.mode || info.mode === 'null' ||
     !CodeMirror.modeURL || loadedModes.has(info.mode)){ cb && cb(info); return; }
  const s = document.createElement('script');
  s.src = CodeMirror.modeURL.replace(/%N/g, info.mode);
  s.onload  = () => { loadedModes.add(info.mode); cb && cb(info); };
  s.onerror = () => cb && cb(info);
  document.head.appendChild(s);
}
function cmModeOf(lang){
  const info = findMode(lang);
  return info ? (info.mime || info.mode) : 'null';
}
const CM_THEME = () => isDark() ? 'material-darker' : 'default';

/* ═══ 9 · Estilos: una sola hoja para las dos vistas ═══ */
(function injectStyles(){
  const st = document.createElement('style');
  st.textContent = `
/* ═══ Base ═══ */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
/* OBLIGATORIA: sin esto, los badges y paneles hidden quedan visibles */
[hidden]{display:none!important}
[data-theme="light"]{
  --bg:#f4f1e9; --surface:#fdfbf5; --surface2:#eae5d8; --ink:#1d1a14;
  --muted:#7b7462; --line:#ddd6c3; --accent:#a34a1d;
  --shadow:0 14px 34px rgba(30,25,12,.10); --row-hover:#efe9da; --editing:#f6eedd;
}
[data-theme="dark"]{
  --bg:#15130d; --surface:#1e1b13; --surface2:#2a261a; --ink:#ece6d6;
  --muted:#9c947d; --line:#332e20; --accent:#dd8143;
  --shadow:0 14px 34px rgba(0,0,0,.45); --row-hover:#242015; --editing:#272115;
}
html{-webkit-text-size-adjust:100%}
body{
  font-family:'Space Grotesk',sans-serif;background:var(--bg);color:var(--ink);
  min-height:100dvh;display:flex;flex-direction:column;-webkit-font-smoothing:antialiased;
  transition:background .25s,color .25s;
}
/* El índice se muestra en MAYÚSCULAS (solo visual, los datos no cambian) */
body.v-index{text-transform:uppercase}
body.v-index code,body.v-index .file-path,body.v-index input,body.v-index textarea{text-transform:none}
button{font:inherit;color:inherit;background:none;border:none;cursor:pointer}
a{color:inherit;text-decoration:none}
svg{display:block}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
.wrap{width:100%;max-width:1800px;margin-inline:auto;padding-inline:clamp(10px,1.8vw,22px)}
main{flex:1}
body.v-index main{padding-block:22px 40px}
body.v-theme main{padding-block:8px 46px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}

/* ═══ Overlay de carga (bloquea todo hasta que haya datos) ═══ */
#boot{
  position:fixed;inset:0;z-index:200;background:var(--bg);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
  color:var(--muted);font-size:13px;letter-spacing:.05em;transition:opacity .3s;
}
#boot.off{opacity:0;pointer-events:none}
#boot .boot-inf{width:96px;height:48px;color:var(--accent);overflow:visible}
#boot .boot-inf path{
  stroke:currentColor;stroke-width:9;stroke-linecap:round;fill:none;
  stroke-dasharray:460 460;animation:bootdraw 1.5s linear infinite;
}
@keyframes bootdraw{to{stroke-dashoffset:-920}}

/* ═══ Badges no bloqueantes ═══ */
#saving,#syncing{
  position:fixed;z-index:150;display:flex;align-items:center;gap:8px;
  background:var(--ink);color:var(--bg);font-size:12.5px;
  padding:8px 14px;border-radius:12px;box-shadow:var(--shadow);
}
#saving{right:16px;bottom:16px}
#syncing{left:16px;bottom:16px;font-size:12px}
#saving .mini-spin,#syncing .mini-spin{width:14px;height:14px;animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* ═══ Cabecera ═══ */
.top{
  position:sticky;top:0;z-index:40;
  background:color-mix(in srgb,var(--bg) 82%,transparent);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border-bottom:1px solid var(--line);
}
.top-in{display:flex;align-items:center;justify-content:space-between;gap:10px;height:58px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand .inf{width:38px;height:19px;color:var(--accent);flex:none;overflow:visible}
.brand .inf-path{
  stroke-dasharray:460;stroke:currentColor;stroke-width:13;stroke-linecap:round;fill:none;
}
.brand:hover .inf-path{animation:draw 1.4s cubic-bezier(.55,0,.25,1) forwards}
@keyframes draw{from{stroke-dashoffset:460}to{stroke-dashoffset:0}}
.brand-name{font-size:15px;font-weight:600;white-space:nowrap}
.brand-name em{font-family:'Fraunces',serif;font-style:italic;font-weight:500;color:var(--accent)}
.actions{display:flex;align-items:center;gap:8px}
.btn{
  display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);
  background:var(--surface);border-radius:10px;padding:8px 14px;font-size:13.5px;
  font-weight:500;transition:transform .15s,border-color .15s,opacity .15s,background .15s;
}
.btn:hover{border-color:var(--muted)}
.btn:active{transform:scale(.97)}
.btn.primary{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.btn.primary:hover{opacity:.9}
.btn.icon{padding:8px;border-radius:10px}
.btn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.btn.danger{color:#c04a35;border-color:color-mix(in srgb,#c04a35 40%,var(--line))}
.btn.danger:hover{border-color:#c04a35;background:color-mix(in srgb,#c04a35 10%,var(--surface))}
body.v-index .btn{font-size:12.5px;font-weight:600;letter-spacing:.05em}
.seg{display:flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface)}
.seg button{padding:8px 10px;color:var(--muted);transition:background .15s,color .15s}
.seg button.on{background:var(--ink);color:var(--bg)}
.seg button svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.8}
[data-theme="light"] .ico-moon{display:none}
[data-theme="dark"]  .ico-sun{display:none}

/* ═══ Aviso demo (índice) ═══ */
#demo-banner{
  border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--accent) 12%,var(--bg));
  color:var(--ink);font-size:12.5px;padding:8px clamp(10px,1.8vw,22px);
}
#demo-banner code{font-size:11.5px;background:var(--surface2);padding:1px 6px;border-radius:5px}

/* ═══ Índice: cabecera de página, búsqueda y chips ═══ */
.page-head{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:14px}
.page-head h1{font-family:'Fraunces',serif;font-weight:600;font-size:clamp(26px,3.4vw,36px);letter-spacing:.01em}
.page-head p{font-size:12.5px;color:var(--muted);letter-spacing:.04em}
.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px}
.search{
  display:flex;align-items:center;gap:8px;background:var(--surface);
  border:1px solid var(--line);border-radius:999px;padding:8px 14px;min-width:min(320px,100%);
}
.search svg{width:15px;height:15px;stroke:var(--muted);fill:none;stroke-width:1.8;flex:none}
.search input{border:none;background:none;outline:none;font:inherit;font-size:13.5px;color:inherit;width:100%}
.t-count{font-size:12.5px;color:var(--muted);white-space:nowrap}
.chips{display:flex;gap:7px;flex-wrap:wrap}
.chip{
  font-size:11.5px;font-weight:500;letter-spacing:.04em;padding:5px 12px;
  border:1px solid var(--line);border-radius:999px;color:var(--muted);
  transition:all .15s;white-space:nowrap;
}
.chip:hover{border-color:var(--muted);color:var(--ink)}
.chip.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.chip b{font-weight:600;opacity:.65;margin-left:3px}

/* ═══ Índice: grupos por categoría ═══ */
.group{margin-bottom:30px}
.group-head{display:flex;align-items:center;gap:12px;margin-bottom:13px}
.g-num{font-size:11.5px;font-weight:600;letter-spacing:.1em;color:var(--muted)}
.group-head h2{font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:clamp(20px,2.4vw,25px);letter-spacing:.02em}
.g-line{flex:1;height:1px;background:var(--line)}
.g-count{font-size:11.5px;color:var(--muted);white-space:nowrap;letter-spacing:.04em}

/* ═══ Índice: icono de tema (base) ═══ */
.mod-icon{
  width:44px;height:44px;border-radius:12px;flex:none;
  display:flex;align-items:center;justify-content:center;overflow:hidden;
  background:color-mix(in srgb,var(--c,#a34a1d) 14%,transparent);
  color:var(--c,var(--accent));font-size:20px;line-height:1;
}
.mod-icon svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.mod-icon img{width:26px;height:26px;object-fit:contain;border-radius:6px}

/* ═══ Índice: vista tarjetas ═══ */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,255px),1fr));gap:13px}
.card{
  position:relative;background:var(--surface);border:1px solid var(--line);
  border-radius:16px;padding:18px 16px 14px;cursor:pointer;display:flex;flex-direction:column;gap:10px;
  transition:transform .18s,box-shadow .18s,border-color .18s;
}
.card::before{content:'';position:absolute;inset:0 0 auto;height:3px;border-radius:16px 16px 0 0;background:var(--c,var(--muted));opacity:.9}
.card:hover{transform:translateY(-3px);box-shadow:var(--shadow);border-color:color-mix(in srgb,var(--c,var(--muted)) 45%,var(--line))}
.card h3{font-family:'Fraunces',serif;font-weight:600;font-size:18px;letter-spacing:.02em;line-height:1.2}
.card p{
  font-size:12px;color:var(--muted);line-height:1.55;flex:1;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
}
.card-meta{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted);letter-spacing:.03em}
.card-meta .cat{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:3px 10px}
.card-meta .cat::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--c,var(--muted))}
.card-edit{
  position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:9px;
  display:flex;align-items:center;justify-content:center;color:var(--muted);
  background:var(--surface2);opacity:0;transition:opacity .15s,color .15s;
}
.card:hover .card-edit{opacity:1}
.card-edit:hover{color:var(--ink)}
@media (hover:none){.card-edit{opacity:1}}
.card-edit svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

/* ═══ Índice: vista lista ═══ */
.rows{border-top:1px solid var(--line)}
.row-item{
  display:grid;grid-template-columns:2.4rem 2.4rem 1fr auto auto;align-items:center;gap:13px;
  padding:11px 6px;border-bottom:1px solid var(--line);cursor:pointer;transition:background .15s;
}
.row-item:hover{background:var(--surface)}
.row-item .idx{font-family:'Fraunces',serif;font-style:italic;color:var(--muted);font-size:15px}
.row-item .mod-icon{width:36px;height:36px;font-size:16px;border-radius:10px}
.row-item .mod-icon svg{width:18px;height:18px}
.row-item .mod-icon img{width:20px;height:20px}
.row-item .r-name{font-weight:600;font-size:13.5px;letter-spacing:.03em;line-height:1.25}
.row-item .r-desc{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row-item .cat{font-size:11px;color:var(--muted);display:flex;align-items:center;gap:6px;white-space:nowrap}
.row-item .cat::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--c,var(--muted))}
.row-item .chev{width:15px;height:15px;stroke:var(--muted);fill:none;stroke-width:1.8}
.row-edit{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.row-edit:hover{color:var(--ink);background:var(--surface2)}
.row-edit svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

/* ═══ Índice: estado vacío / carga ═══ */
.hero{display:flex;flex-direction:column;align-items:center;text-align:center;gap:18px;padding:9vh 0 6vh}
.hero .inf{width:150px;height:75px;color:var(--accent);overflow:visible}
.hero .inf-path{
  stroke:currentColor;stroke-width:8;stroke-linecap:round;fill:none;
  stroke-dasharray:460;stroke-dashoffset:460;animation:draw 2.1s .15s cubic-bezier(.6,0,.2,1) forwards;
}
.hero h1{font-family:'Fraunces',serif;font-weight:600;font-size:clamp(32px,6vw,52px);letter-spacing:.02em}
.hero h1 em{font-style:italic;color:var(--accent)}
.hero p{color:var(--muted);font-size:13.5px;max-width:440px;line-height:1.6}
.empty-note{color:var(--muted);font-size:13px;padding:34px 0;text-align:center}
.skel{height:150px;border-radius:16px;background:var(--surface2);animation:pulse 1.3s ease-in-out infinite}
@keyframes pulse{50%{opacity:.45}}

/* ═══ Tema: héroe ═══ */
.hero-theme{display:flex;gap:18px;align-items:flex-start;padding:26px 0 20px;border-bottom:1px solid var(--line);margin-bottom:18px}
.hero-theme .mod-icon{width:58px;height:58px;border-radius:16px;font-size:26px}
.hero-theme .mod-icon svg{width:28px;height:28px}
.hero-theme .mod-icon img{width:34px;height:34px}
.hero-main{min-width:0;flex:1}
.meta-line{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-bottom:6px}
.back{display:inline-flex;align-items:center;gap:5px;font-weight:500;color:var(--muted);transition:color .15s}
.back:hover{color:var(--ink)}
.cat-pill{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:999px;padding:3px 11px}
.cat-pill i{width:7px;height:7px;border-radius:50%;background:var(--c,var(--accent))}
.hero-theme h1{font-family:'Fraunces',serif;font-weight:600;font-size:clamp(28px,4vw,42px);letter-spacing:-.02em;line-height:1.1}
.hero-desc{color:var(--muted);font-size:14px;line-height:1.6;max-width:75ch;margin-top:8px}

/* ═══ Tema: bloques de tabla ═══ */
.tblock{
  background:var(--surface);border:1px solid var(--line);border-radius:18px;
  padding:20px 20px 14px;margin-bottom:22px;
}
.tb-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.tb-num{font-family:'Fraunces',serif;font-style:italic;color:var(--muted);font-size:15px;flex:none}
.t-title{
  font-family:'Fraunces',serif;font-weight:600;font-size:clamp(19px,2.2vw,23px);
  letter-spacing:-.01em;cursor:text;border-bottom:1px dashed transparent;min-width:40px;
}
.t-title:hover{border-bottom-color:var(--line)}
.tb-actions{margin-left:auto;display:flex;gap:4px}
.t-theory{font-size:13.5px;color:var(--muted);line-height:1.65;margin-top:8px;max-width:100ch;cursor:text;border-bottom:1px dashed transparent;white-space:pre-wrap}
.t-theory:hover{border-bottom-color:var(--line)}
.t-theory.empty{color:var(--muted);opacity:.65;font-style:italic}
.tb-stats{margin-left:auto;font-size:12px;color:var(--muted)}
.tb-tools{display:flex;align-items:center;gap:8px;margin-top:14px;flex-wrap:wrap}
.tb-tools .tb-stats{margin-left:auto}

/* ═══ Tema: tabla ═══ */
.tbl-wrap{
  overflow-x:auto;border:1px solid var(--line);border-radius:12px;margin-top:8px;background:var(--surface);
  overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;
}
.tbl-wrap.sc-left{box-shadow:inset 14px 0 12px -12px rgba(0,0,0,.30)}
.tbl-wrap.sc-right{box-shadow:inset -14px 0 12px -12px rgba(0,0,0,.30)}
.tbl-wrap.sc-left.sc-right{box-shadow:inset 14px 0 12px -12px rgba(0,0,0,.30),inset -14px 0 12px -12px rgba(0,0,0,.30)}
table{border-collapse:collapse;width:100%;min-width:560px;table-layout:fixed}
thead th{
  position:relative;background:var(--surface2);font-weight:600;font-size:11.5px;
  letter-spacing:.05em;text-transform:uppercase;text-align:left;
  padding:10px 26px 10px 12px;border-bottom:1px solid var(--line);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;cursor:text;user-select:none;
}
thead th.lock{cursor:text}
thead th.ops{cursor:default}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;font-size:13.5px}
tbody tr:last-child td{border-bottom:none}
tbody tr:not(.editing) td{background:var(--surface)}
tbody tr:not(.editing):hover td{background:var(--row-hover)}
tbody tr.editing td{background:var(--editing)}
td{vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
td.ops,th.ops{position:sticky;right:0;text-align:right;white-space:nowrap;width:76px;min-width:76px;padding:9px 8px}
th.ops{z-index:3}
td.ops{border-left:1px solid var(--line);z-index:2}
.h-label{pointer-events:none}
.col-x{
  position:absolute;right:20px;top:50%;transform:translateY(-50%);
  width:18px;height:18px;border-radius:5px;display:flex;align-items:center;justify-content:center;
  color:var(--muted);opacity:0;transition:opacity .12s;pointer-events:auto;
}
thead th:hover .col-x{opacity:1}
.col-x:hover{color:#c04a35;background:var(--surface)}
.col-x svg{width:10px;height:10px;stroke:currentColor;stroke-width:2.2;fill:none;stroke-linecap:round}
@media (hover:none){.col-x{opacity:.5}}
.col-grip{
  position:absolute;top:0;right:0;width:9px;height:100%;
  cursor:col-resize;touch-action:none;pointer-events:auto;
}
.col-grip::after{
  content:'';position:absolute;top:20%;bottom:20%;right:3px;width:2px;
  border-radius:2px;background:transparent;transition:background .15s;
}
th:hover .col-grip::after{background:var(--line)}
.col-badge{
  position:absolute;left:12px;bottom:2px;font-size:8px;letter-spacing:.08em;
  color:var(--accent);pointer-events:none;text-transform:uppercase;
}
.nul{color:var(--muted);opacity:.55}
.op{
  width:27px;height:27px;border-radius:8px;display:inline-flex;align-items:center;
  justify-content:center;color:var(--muted);transition:color .12s,background .12s;
}
.op:hover{color:var(--ink);background:var(--surface2)}
.op.save:hover{color:var(--accent)}
.op.del:hover{color:#c04a35}
.op svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.mini-btn{
  display:inline-flex;align-items:center;gap:6px;border:1px dashed var(--line);
  border-radius:9px;padding:6px 12px;font-size:12.5px;color:var(--muted);transition:all .15s;
}
.mini-btn:hover{color:var(--ink);border-color:var(--muted)}
.mini-btn svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}

/* Columna del nombre FIJA al hacer scroll horizontal */
thead th:first-child{position:sticky;left:0;z-index:3;background:var(--surface2)}
tbody td:first-child{position:sticky;left:0;z-index:2}
tbody tr:not(.editing) td:first-child{background:var(--surface)}
tbody tr:not(.editing):hover td:first-child{background:var(--row-hover)}
tbody tr.editing td:first-child{background:var(--editing)}
thead th:first-child,tbody td:first-child{box-shadow:2px 0 0 var(--line)}

/* ═══ Tema: celdas multilínea y código ═══ */
.cell-input{
  width:100%;background:transparent;border:none;outline:none;
  font:inherit;color:inherit;resize:none;overflow:hidden;display:block;
  border-bottom:1px dashed transparent;padding:1px 0;min-height:1.4em;
}
.cell-input:focus{border-bottom-color:var(--accent)}
.codeview{
  margin:0;white-space:pre-wrap;overflow-wrap:anywhere;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:12.5px;line-height:1.55;padding:1px 0;
}
.CodeMirror{
  height:auto;background:transparent;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:12.5px;line-height:1.55;
}
.CodeMirror-scroll{min-height:1.4em}
.CodeMirror-sizer{min-height:1.4em}
tr.editing .CodeMirror{background:transparent}
.cm-s-material-darker.CodeMirror{background:transparent;color:#ece6d6}

/* ═══ Tema: edición en línea (título / teoría / cabecera) ═══ */
.inline-input{
  width:100%;font:inherit;font-size:14px;color:inherit;background:var(--surface2);
  border:1px solid var(--accent);border-radius:8px;padding:6px 10px;outline:none;
}
textarea.inline-input{min-height:92px;resize:vertical;line-height:1.6}
.edit-hint{display:block;font-size:10.5px;color:var(--muted);margin-top:5px;pointer-events:none}

/* ═══ Vacíos / errores ═══ */
.empty-tables{
  display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;
  border:1px dashed var(--line);border-radius:18px;padding:9vh 20px;color:var(--muted);
}
.empty-tables p{font-size:14.5px}
.file-path{
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;
  background:var(--surface2);padding:2px 7px;border-radius:6px;color:var(--ink);
}

/* ═══ Diálogos ═══ */
dialog{
  border:none;border-radius:18px;background:var(--surface);color:var(--ink);
  width:min(560px,calc(100vw - 20px));padding:0;margin:auto;
}
dialog::backdrop{background:rgba(12,9,4,.55);backdrop-filter:blur(3px)}
dialog[open]{animation:pop .22s cubic-bezier(.2,.9,.3,1.15)}
@keyframes pop{from{opacity:0;transform:translateY(16px) scale(.98)}}
.dlg-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 0}
.dlg-head h3{font-family:'Fraunces',serif;font-weight:600;font-size:20px;letter-spacing:.02em}
.dlg-x{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.dlg-x:hover{background:var(--surface2);color:var(--ink)}
.dlg-x svg{width:15px;height:15px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round}
.dlg-body{padding:16px 20px;display:flex;flex-direction:column;gap:14px;max-height:64vh;overflow-y:auto}
.dlg-foot{display:flex;align-items:center;gap:9px;padding:14px 20px;border-top:1px solid var(--line)}
.dlg-foot .grow{flex:1}
.field label{
  display:block;font-size:10px;font-weight:600;letter-spacing:.09em;
  text-transform:uppercase;color:var(--muted);margin-bottom:6px;
}
input[type=text],input:not([type]),input[type=number],textarea,select{
  font:inherit;font-size:14px;color:inherit;width:100%;
  background:var(--surface2);border:1px solid transparent;border-radius:10px;
  padding:9px 12px;outline:none;transition:border-color .15s;resize:vertical;
}
input:focus,textarea:focus,select:focus{border-color:var(--accent)}
.num-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.hint{font-size:11.5px;color:var(--muted);margin-top:5px}
.hint.ok{color:color-mix(in srgb,var(--accent) 70%,var(--ink))}
.hint.err{color:#c04a35;font-weight:500}
[data-theme="dark"] .hint.err{color:#e0705a}
.h-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.field-row{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start}
.icon-input{display:flex;gap:9px;align-items:center}
.icon-preview{
  width:40px;height:40px;border-radius:11px;flex:none;
  display:flex;align-items:center;justify-content:center;overflow:hidden;
  background:color-mix(in srgb,var(--pc,#a34a1d) 14%,transparent);color:var(--pc,#a34a1d);font-size:18px;
}
.icon-preview svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.icon-preview img{width:22px;height:22px;object-fit:contain}
.color-side{display:flex;flex-direction:column;gap:8px;align-items:center}
input[type=color]{
  width:44px;height:44px;padding:0;border-radius:12px;border:1px solid var(--line);
  background:none;cursor:pointer;appearance:none;-webkit-appearance:none;
}
input[type=color]::-webkit-color-swatch-wrapper{padding:3px}
input[type=color]::-webkit-color-swatch{border:none;border-radius:9px}
.swatches{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.swatches button{width:17px;height:17px;border-radius:50%;border:2px solid transparent;transition:transform .12s}
.swatches button:hover{transform:scale(1.2)}
.swatches button.on{border-color:var(--ink)}
.cat-wrap{position:relative}
.cat-list{
  position:absolute;top:calc(100% + 5px);left:0;right:0;z-index:10;
  background:var(--surface);border:1px solid var(--line);border-radius:12px;
  box-shadow:var(--shadow);max-height:190px;overflow-y:auto;display:none;padding:5px;
}
.cat-list.open{display:block}
.cat-list button{
  display:flex;justify-content:space-between;align-items:center;width:100%;
  text-align:left;padding:8px 11px;border-radius:8px;font-size:13px;
}
.cat-list button:hover{background:var(--surface2)}
.cat-list button span{color:var(--muted);font-size:11px}
.cat-row{display:flex;gap:9px;align-items:center}
.cat-row input{flex:1}
.cat-row .use{font-size:11px;color:var(--muted);white-space:nowrap}
.cat-row .save{width:34px;height:34px;flex:none;border-radius:9px;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--muted)}
.cat-row .save:hover{color:var(--ink);border-color:var(--muted)}
.cat-row .save svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.cat-row input.bad{border-color:#c04a35}
.cats-note{font-size:12px;color:var(--muted)}

/* ═══ Toasts ═══ */
#toasts{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:100;display:flex;flex-direction:column;gap:8px;align-items:center;width:max-content;max-width:calc(100vw - 24px)}
.toast{
  display:flex;align-items:center;gap:9px;background:var(--ink);color:var(--bg);
  font-size:13px;padding:10px 16px;border-radius:12px;box-shadow:var(--shadow);
  animation:tin .25s cubic-bezier(.2,.9,.3,1.2);
}
.toast.out{opacity:0;transform:translateY(8px);transition:all .3s}
.toast::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--dot,var(--accent));flex:none}
@keyframes tin{from{opacity:0;transform:translateY(12px)}}

/* ═══ Pie ═══ */
.foot{
  border-top:1px solid var(--line);padding-block:16px;display:flex;
  justify-content:space-between;gap:10px;font-size:12px;color:var(--muted);flex-wrap:wrap;
}
.foot em{font-family:'Fraunces',serif}

/* ═══ MÓVIL: tablas completas, sin recortes (<720 px) ═══ */
@media (max-width:720px){
  table{min-width:0}
  th,td{padding:8px 9px;font-size:13px}
  thead th{padding:9px 24px 9px 9px;font-size:10.5px}
  td.ops,th.ops{width:52px;min-width:52px;padding:6px 3px}
  td.ops{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:2px}
  .tbl-wrap col.opscol{width:52px!important}
  .op{width:24px;height:24px}
  .op svg{width:12px;height:12px}
  .col-grip{display:none}
  .cell-input,.codeview{font-size:12px}
  .CodeMirror{font-size:12px}
  .tb-tools{gap:6px;margin-top:12px}
  .mini-btn{padding:5px 10px;font-size:12px}
  .tblock{padding:16px 12px 12px}
  .hero-theme{padding:20px 0 16px}
}
@media (max-width:640px){
  .row-item{grid-template-columns:1.8rem 2.2rem 1fr auto}
  .row-item .cat,.row-item .chev{display:none}
}
@media (max-width:560px){
  .btn.primary span{display:none}
  .btn.primary{padding:8px 11px}
  .brand-name span{display:none}
  .tb-stats{display:none}
  .field-row{grid-template-columns:1fr}
}
`;
  document.head.appendChild(st);
})();

/* ═══ 10 · Shells: TODO el interfaz se construye aquí ═══ */

const SVG_MODE = `
  <svg class="ico-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
  <svg class="ico-moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`;

const SVG_PLUS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const SVG_TRASH = `<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>`;
const SVG_PENCIL = `<svg viewBox="0 0 24 24"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
const SVG_X = `<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const SVG_CHECK = `<svg viewBox="0 0 24 24"><path d="m4 12 5 5L20 7"/></svg>`;
const SVG_SPIN = `<svg class="mini-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="40 18"/></svg>`;
const SVG_SEARCH = `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
const SVG_CHEV = `<svg class="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>`;

function brandHTML(){
  return `
    <a class="brand" href="${esc(BASE)}" aria-label="Aprendizaje Infinito — inicio">
      <svg class="inf" viewBox="0 0 200 100" aria-hidden="true">
        <path class="inf-path" d="M25,50 C25,20 75,20 100,50 C125,80 175,80 175,50 C175,20 125,20 100,50 C75,80 25,80 25,50 Z"/>
      </svg>
      <span class="brand-name"><span>Aprendizaje&nbsp;</span><em>Infinito</em></span>
    </a>`;
}

function footerHTML(){
  return `
    <span>Aprendizaje <em>Infinito</em></span>
    <span>El conocimiento que nunca se termina.</span>`;
}

function confirmDialogHTML(){
  return `
  <dialog id="dlg-confirm">
    <div class="dlg-head"><h3 id="c-title"></h3></div>
    <div class="dlg-body"><p id="c-body" style="font-size:14px;color:var(--muted);line-height:1.55"></p></div>
    <div class="dlg-foot">
      <span class="grow"></span>
      <button type="button" class="btn" id="c-cancel">Cancelar</button>
      <button type="button" class="btn danger" id="c-ok">Eliminar</button>
    </div>
  </dialog>`;
}

function wireModeButton(extra){
  const b = document.getElementById('btn-mode');
  if(b) b.onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('ai_theme', next);
    if(typeof extra === 'function') extra();
  };
}
function wireCloseButtons(){
  $$('[data-close]').forEach(b => b.addEventListener('click', () => {
    const d = document.getElementById(b.dataset.close);
    if(d) d.close();
  }));
}

/* ─────────── Shell del ÍNDICE (biblioteca) ─────────── */
function buildIndexShell(){
  document.body.className = 'v-index';
  document.body.innerHTML = `
<header class="top">
  <div class="top-in wrap">
    ${brandHTML()}
    <div class="actions">
      <div class="seg" role="group" aria-label="Modo de vista">
        <button id="v-cards" title="Vista tarjetas" aria-label="Vista tarjetas">
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>
        </button>
        <button id="v-list" title="Vista lista" aria-label="Vista lista">
          <svg viewBox="0 0 24 24"><path d="M8.5 6h12M8.5 12h12M8.5 18h12M3.5 6h.5M3.5 12h.5M3.5 18h.5"/></svg>
        </button>
      </div>
      <button class="btn icon" id="btn-cats" title="Editar categorías" aria-label="Editar categorías">
        <svg viewBox="0 0 24 24"><path d="M12.6 2.6 21.4 11.4a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6Z"/><circle cx="7.5" cy="7.5" r="1"/></svg>
      </button>
      <button class="btn icon" id="btn-mode" title="Modo claro / oscuro" aria-label="Cambiar modo">${SVG_MODE}</button>
      <button class="btn primary" id="btn-new">${SVG_PLUS}<span>Nuevo tema</span></button>
    </div>
  </div>
</header>

<div id="demo-banner" hidden>
  Modo demostración con datos de ejemplo — crea <code>config.js</code> con la URL de tu Apps Script
  (<code>node crear-config.mjs</code> leyendo <code>.env.local</code>) o configura el secret
  <code>API_URL</code> en GitHub.
</div>

<div id="syncing" hidden>${SVG_SPIN}<span>Actualizando…</span></div>

<main class="wrap" id="main">
  <div id="app">
    <div class="page-head" id="page-head">
      <h1>Biblioteca</h1><p id="stats"></p>
    </div>
    <div class="toolbar" id="toolbar">
      <div class="search">
        ${SVG_SEARCH}
        <input id="q" type="text" placeholder="Buscar temas…" autocomplete="off">
      </div>
      <div class="chips" id="chips"></div>
    </div>
    <div id="content"></div>
  </div>
</main>

<footer class="foot wrap">${footerHTML()}</footer>

<!-- ═══ Diálogo: nuevo / editar tema ═══ -->
<dialog id="dlg-module">
  <form id="form-module" novalidate>
    <div class="dlg-head">
      <h3 id="m-title">Nuevo tema</h3>
      <button type="button" class="dlg-x" data-close="dlg-module" aria-label="Cerrar">${SVG_X}</button>
    </div>
    <div class="dlg-body">
      <div class="field">
        <label for="f-nombre">Nombre del tema</label>
        <input id="f-nombre" maxlength="60" placeholder="p. ej. Biología celular" required>
        <p class="hint" id="f-file-hint"></p>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-icono">Icono</label>
          <div class="icon-input">
            <span class="icon-preview" id="f-icono-preview"></span>
            <input id="f-icono" placeholder="Emoji, URL de imagen o <svg>…" autocomplete="off">
          </div>
          <p class="hint">Acepta un emoji, la URL de una imagen o el código completo de un SVG.</p>
        </div>
        <div class="field color-side">
          <label for="f-color">Color</label>
          <input type="color" id="f-color" value="#a34a1d">
          <div class="swatches" id="f-swatches"></div>
        </div>
      </div>
      <div class="field">
        <label for="f-cat">Categoría</label>
        <div class="cat-wrap">
          <input id="f-cat" placeholder="Escribe una nueva o elige una existente…" autocomplete="off">
          <div class="cat-list" id="f-cat-list"></div>
        </div>
        <p class="hint" id="f-cat-hint"></p>
      </div>
      <div class="field">
        <label for="f-desc">Descripción</label>
        <textarea id="f-desc" rows="3" maxlength="220" placeholder="De qué trata este tema…"></textarea>
      </div>
    </div>
    <div class="dlg-foot">
      <button type="button" class="btn danger" id="f-delete" hidden>${SVG_TRASH} Eliminar</button>
      <span class="grow"></span>
      <button type="button" class="btn" data-close="dlg-module">Cancelar</button>
      <button type="submit" class="btn primary" id="f-save">Guardar</button>
    </div>
  </form>
</dialog>

<!-- ═══ Diálogo: categorías ═══ -->
<dialog id="dlg-cats">
  <div class="dlg-head">
    <h3>Categorías</h3>
    <button type="button" class="dlg-x" data-close="dlg-cats" aria-label="Cerrar">${SVG_X}</button>
  </div>
  <div class="dlg-body" id="cats-list"></div>
  <div class="dlg-foot">
    <span class="cats-note">Renombrar una categoría la actualiza en todos los temas que la usan.</span>
    <span class="grow"></span>
    <button type="button" class="btn primary" data-close="dlg-cats">Listo</button>
  </div>
</dialog>

${confirmDialogHTML()}
<div id="toasts"></div>`;
}

/* ─────────── Shell del TEMA (tablas) ─────────── */
function buildThemeShell(){
  document.body.className = 'v-theme';
  document.body.innerHTML = `
<div id="boot">
  ${bootSvg()}
  <p>Cargando…</p>
</div>

<div id="saving" hidden>${SVG_SPIN}<span>Guardando…</span></div>

<header class="top">
  <div class="top-in wrap">
    ${brandHTML()}
    <div class="actions">
      <button class="btn icon" id="btn-mode" title="Modo claro / oscuro" aria-label="Cambiar modo">${SVG_MODE}</button>
      <button class="btn primary" id="btn-new-table">${SVG_PLUS}<span>Nueva tabla</span></button>
    </div>
  </div>
</header>

<main class="wrap">
  <section id="hero"></section>
  <div class="toolbar" id="toolbar" hidden>
    <div class="search">
      ${SVG_SEARCH}
      <input id="q" type="text" placeholder="Buscar tablas por título…" autocomplete="off">
    </div>
    <p class="t-count" id="t-count"></p>
  </div>
  <div id="content"></div>
</main>

<footer class="foot wrap">${footerHTML()}</footer>

<!-- ═══ Diálogo: crear tabla ═══ -->
<dialog id="dlg-table">
  <form id="form-table" novalidate>
    <div class="dlg-head">
      <h3>Nueva tabla</h3>
      <button type="button" class="dlg-x" data-close="dlg-table" aria-label="Cerrar">${SVG_X}</button>
    </div>
    <div class="dlg-body">
      <div class="field">
        <label for="f-titulo">Título de la tabla</label>
        <input id="f-titulo" maxlength="90" placeholder="p. ej. Métodos de array" required>
      </div>
      <div class="field">
        <label for="f-texto">Teoría / descripción</label>
        <textarea id="f-texto" rows="3" placeholder="Explicación, contexto o notas sobre esta tabla…"></textarea>
      </div>
      <div class="num-row">
        <div class="field">
          <label for="f-rows">Filas iniciales</label>
          <input id="f-rows" type="number" min="0" max="50" value="3">
        </div>
        <div class="field">
          <label for="f-cols">Columnas (cabeceras)</label>
          <input id="f-cols" type="number" min="1" max="12" value="3">
        </div>
      </div>
      <div class="field">
        <label>Cabeceras — primera fila</label>
        <div class="h-grid" id="h-grid"></div>
        <p class="hint">La primera columna es el nombre: ordena las filas y no se puede eliminar.
        Después, haz clic en cualquier cabecera para renombrarla o convertirla en columna de código.</p>
      </div>
    </div>
    <div class="dlg-foot">
      <span class="grow"></span>
      <button type="button" class="btn" data-close="dlg-table">Cancelar</button>
      <button type="submit" class="btn primary">Crear tabla</button>
    </div>
  </form>
</dialog>

<!-- ═══ Diálogo: editar columna ═══ -->
<dialog id="dlg-col">
  <div class="dlg-head">
    <h3>Columna</h3>
    <button type="button" class="dlg-x" data-close="dlg-col" aria-label="Cerrar">${SVG_X}</button>
  </div>
  <div class="dlg-body">
    <div class="field">
      <label for="c-name">Nombre de la cabecera</label>
      <input id="c-name" maxlength="60" autocomplete="off">
    </div>
    <div class="num-row">
      <div class="field">
        <label for="c-type">Tipo de contenido</label>
        <select id="c-type">
          <option value="text">Texto</option>
          <option value="code">Código (resaltado)</option>
        </select>
      </div>
      <div class="field" id="c-lang-field" hidden>
        <label for="c-lang">Lenguaje</label>
        <input id="c-lang" list="lang-list" placeholder="Escribe para buscar…" autocomplete="off">
        <datalist id="lang-list"></datalist>
      </div>
    </div>
    <p class="hint" id="c-hint" hidden>Las columnas de código se editan con resaltado, indentación y
    autocompletado (sugerencias al escribir o Ctrl+Espacio) en cualquier lenguaje.</p>
  </div>
  <div class="dlg-foot">
    <span class="grow"></span>
    <button type="button" class="btn" data-close="dlg-col">Cancelar</button>
    <button type="button" class="btn primary" id="col-save">${SVG_CHECK} Guardar columna</button>
  </div>
</dialog>

${confirmDialogHTML()}
<div id="toasts"></div>`;
}

/* ═══════════════════════════════════════════════════════════════════
   ═══ VISTA ÍNDICE — biblioteca de temas                            ═══
   ═══════════════════════════════════════════════════════════════════ */
async function initView(){

  buildIndexShell();
  document.title = 'Aprendizaje Infinito';

  /* ── Estado y caché local ── */
  let state = { modules: [] };
  let cacheRev = null;
  let loading = true;
  const CACHE_KEY = 'ai_cache_v1';
  const ui = {
    view: localStorage.getItem('ai_view') || 'cards',
    q: '',
    cat: ''            /* '' = todas, '__none' = sin categoría */
  };

  function readCache(){
    try{ return JSON.parse(localStorage.getItem(CACHE_KEY)); }catch(_){ return null; }
  }
  function writeCache(modules, rev){
    try{ localStorage.setItem(CACHE_KEY, JSON.stringify({ rev, ts: Date.now(), data:{ modules } })); }catch(_){}
  }
  function persistCache(){ if(cacheRev != null) writeCache(state.modules, cacheRev); }

  /* Rápido: pinta la caché al instante y verifica en segundo plano */
  function stateFromCache(){
    const c = readCache();
    if(c && c.data && Array.isArray(c.data.modules)){
      state = c.data;
      cacheRev = String(c.rev ?? '');
      return true;
    }
    return false;
  }
  async function fetchAll(){
    const r = await apiGet('action=all');
    if(!r.ok) throw new Error(r.error || 'Error al leer la hoja');
    state = { modules: r.modules || [] };
    cacheRev = String(r.rev);
    writeCache(state.modules, cacheRev);
  }

  /* Una única comprobación al abrir (sin intervalos periódicos) */
  let checking = false;
  async function backgroundCheck(){
    if(demoMode || checking) return;
    checking = true; setSyncing(true);
    const safety = setTimeout(() => setSyncing(false), 45000); /* se apaga sola pase lo que pase */
    try{
      const r = await apiGet('action=ping');
      if(String(r.rev) === String(cacheRev)){
        persistCache();
      }else{
        await fetchAll();
        render();
      }
    }catch(_){ }
    clearTimeout(safety);
    checking = false; setSyncing(false);
  }

  /* Mutaciones con reversión si fallan (el índice no tiene edición continua) */
  async function mutate(action, payload, { apply=null, onOk=null, msg='Guardado' } = {}){
    const snap = JSON.stringify(state);
    if(apply) apply();
    render();
    if(demoMode){ toast('Modo demostración: el cambio no se guarda', 'warn'); return true; }
    try{
      const r = await apiPost(action, payload);
      if(!r.ok) throw new Error(r.error || 'Error del servidor');
      cacheRev = String(r.rev);
      try{ if(onOk) onOk(r); }catch(_){ }
      persistCache();
      render();
      toast(msg, 'ok');
      return true;
    }catch(err){
      state = JSON.parse(snap);
      render();
      toast('No se pudo guardar: ' + abortMsg(err), 'err');
      return false;
    }
  }

  /* ── Datos derivados ── */
  function getModule(id){ return state.modules.find(m => m.id === id) || null; }
  function existingCats(){
    const map = new Map();
    for(const m of state.modules){
      const c = m.categoria || '';
      if(!c) continue;
      const k = normCat(c);
      if(!map.has(k)) map.set(k, { name: c, norm: k, count: 0 });
      map.get(k).count++;
    }
    return [...map.values()].sort((a,b) => a.norm.localeCompare(b.norm, 'es'));
  }
  function visibleModules(){
    const q = ui.q.trim().toLowerCase();
    const list = state.modules.filter(m => {
      const okq = !q || (m.nombre + ' ' + (m.descripcion || '') + ' ' + (m.categoria || '')).toLowerCase().includes(q);
      const mc  = normCat(m.categoria || '');
      const okc = !ui.cat || (ui.cat === '__none' ? !mc : mc === ui.cat);
      return okq && okc;
    });
    list.sort((a,b) => {
      const ca = a.categoria || '\uffff', cb = b.categoria || '\uffff';
      return ca.localeCompare(cb, 'es') ||
             a.nombre.localeCompare(b.nombre, 'es', { sensitivity:'base' });
    });
    return list;
  }
  /* Cada tema abre SU hoja: index.html?tema=<sheet> */
  function themeHref(m){
    return BASE + '?tema=' + encodeURIComponent(m.sheet || slugify(m.nombre));
  }

  /* ── Render ── */
  function render(){
    if(loading){ renderSkeleton(); return; }
    renderChips();
    renderStats();
    const list = visibleModules();
    const hasAny = state.modules.length > 0;
    $('#page-head').hidden = !hasAny;
    $('#toolbar').hidden   = !hasAny;
    $('#demo-banner').hidden = !demoMode;

    const C = $('#content');
    if(!hasAny){
      C.innerHTML = `
        <div class="hero">
          <svg class="inf" viewBox="0 0 200 100" aria-hidden="true">
            <path class="inf-path" d="M25,50 C25,20 75,20 100,50 C125,80 175,80 175,50 C175,20 125,20 100,50 C75,80 25,80 25,50 Z"/>
          </svg>
          <h1>Aprendizaje <em>Infinito</em></h1>
          <p>Una biblioteca que crece contigo. Crea tu primer tema y empieza a construir conocimiento que nunca se termina.</p>
          <button class="btn primary" id="hero-new">
            ${SVG_PLUS} Crear el primer tema
          </button>
        </div>`;
      $('#hero-new').onclick = () => openModuleDialog(null);
      return;
    }
    if(!list.length){
      C.innerHTML = `<p class="empty-note">Ningún tema coincide con la búsqueda.</p>`;
      return;
    }
    let html = '', lastCat = null, gi = 0, nRow = 0, groupCount = 0;
    for(const m of list){
      const cat = m.categoria || '';
      if(cat !== lastCat){
        if(lastCat !== null) html += '</div></section>';
        gi++; nRow = 0;
        groupCount = list.filter(x => (x.categoria || '') === cat).length;
        html += `
          <section class="group">
            <div class="group-head">
              <span class="g-num">${pad(gi)}</span>
              <h2>${esc(cat || 'sin categoría')}</h2>
              <span class="g-line"></span>
              <span class="g-count">${groupCount} ${groupCount === 1 ? 'tema' : 'temas'}</span>
            </div>
            ${ui.view === 'cards' ? '<div class="grid">' : '<div class="rows">'}`
        lastCat = cat;
      }
      html += ui.view === 'cards' ? cardHTML(m) : rowHTML(m, nRow++);
    }
    if(lastCat !== null) html += '</div></section>';
    C.innerHTML = html;
  }

  function cardHTML(m){
    return `
    <article class="card" data-href="${esc(themeHref(m))}" tabindex="0" role="link"
             style="--c:${esc(m.color || PALETTE[0])}">
      ${renderIcon(m.icono)}
      <h3>${esc(m.nombre)}</h3>
      <p>${esc(m.descripcion || 'Sin descripción todavía.')}</p>
      <div class="card-meta">
        ${m.categoria ? `<span class="cat">${esc(m.categoria)}</span>` : '<span></span>'}
        <span>${m.tablas || 0} ${(m.tablas || 0) === 1 ? 'tabla' : 'tablas'}</span>
      </div>
      <button class="card-edit" data-edit="${esc(m.id)}" title="Editar tema" aria-label="Editar tema">${SVG_PENCIL}</button>
    </article>`;
  }

  function rowHTML(m, n){
    return `
    <div class="row-item" data-href="${esc(themeHref(m))}" tabindex="0" role="link"
         style="--c:${esc(m.color || PALETTE[0])}">
      <span class="idx">${pad(n + 1)}</span>
      ${renderIcon(m.icono)}
      <div style="min-width:0">
        <div class="r-name">${esc(m.nombre)}</div>
        <div class="r-desc">${esc(m.descripcion || '')}</div>
      </div>
      ${m.categoria ? `<span class="cat">${esc(m.categoria)}</span>` : '<span></span>'}
      <button class="row-edit" data-edit="${esc(m.id)}" title="Editar tema" aria-label="Editar tema">${SVG_PENCIL}</button>
    </div>`;
  }

  function renderChips(){
    const cats = existingCats();
    const sinCat = state.modules.filter(m => !normCat(m.categoria)).length;
    let html = `<button class="chip ${!ui.cat ? 'on' : ''}" data-cat="">Todas<b>${state.modules.length}</b></button>`;
    for(const c of cats)
      html += `<button class="chip ${ui.cat === c.norm ? 'on' : ''}" data-cat="${esc(c.norm)}">${esc(c.norm)}<b>${c.count}</b></button>`;
    if(sinCat)
      html += `<button class="chip ${ui.cat === '__none' ? 'on' : ''}" data-cat="__none">sin categoría<b>${sinCat}</b></button>`;
    $('#chips').innerHTML = html;
  }

  function renderStats(){
    const cats = existingCats().length;
    const n = state.modules.length;
    $('#stats').textContent = `${n} ${n === 1 ? 'tema' : 'temas'} · ${cats} ${cats === 1 ? 'categoría' : 'categorías'}`;
  }

  function renderSkeleton(){
    $('#page-head').hidden = true; $('#toolbar').hidden = true;
    $('#content').innerHTML =
      `<div class="grid">${'<div class="skel"></div>'.repeat(8)}</div>`;
  }

  /* ── Diálogo de tema ── */
  let editingId = null;
  const dlgModule = $('#dlg-module');

  /* Rechaza parecidos: "ciencias" ↔ "ciencias naturales" */
  function findCatConflict(value, pool, exclude){
    const v = normCat(value);
    if(!v) return null;
    const seen = new Set();
    for(const c of pool){
      const e = normCat(c);
      if(!e || seen.has(e)) continue;
      seen.add(e);
      if(exclude && e === normCat(exclude)) continue;
      if(v === e) return {type:'exact', cat:e};
      if(v.startsWith(e) || e.startsWith(v)) return {type:'similar', cat:e};
    }
    return null;
  }
  function catHint(value, exclude){
    const box = $('#f-cat-hint');
    const v = normCat(value);
    if(!v){
      box.textContent = 'Opcional — los temas sin categoría irán al final.';
      box.className = 'hint'; return true;
    }
    const pool = state.modules.map(m => m.categoria || '');
    const c = findCatConflict(value, pool, exclude);
    if(!c){ box.textContent = `Nueva categoría: «${v}».`; box.className = 'hint ok'; return true; }
    if(c.type === 'exact'){ box.textContent = 'Ya existe: los temas se agruparán juntos.'; box.className = 'hint ok'; return true; }
    box.textContent = `Demasiado parecida a «${c.cat}» — elige otro nombre.`;
    box.className = 'hint err'; return false;
  }
  /* La hoja se crea sola en el spreadsheet al guardar el tema */
  function updateFileHint(){
    const n = $('#f-nombre').value.trim();
    $('#f-file-hint').innerHTML = n
      ? `Hoja de cálculo: <span class="file-path">${esc(slugify(n))}</span> (se crea sola al guardar)`
      : '';
  }
  function refreshIconPreview(){
    const box = $('#f-icono-preview');
    box.innerHTML = renderIcon($('#f-icono').value)
      .replace('<span class="mod-icon">','').replace(/<\/span>$/,'');
    box.style.setProperty('--pc', $('#f-color').value);
  }
  function renderSwatches(){
    $('#f-swatches').innerHTML = PALETTE.map(c =>
      `<button type="button" data-c="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('');
    $$('#f-swatches button').forEach(b => {
      b.onclick = () => { $('#f-color').value = b.dataset.c; markSwatch(); refreshIconPreview(); };
    });
    markSwatch();
  }
  function markSwatch(){
    const cur = $('#f-color').value.toLowerCase();
    $$('#f-swatches button').forEach(b => b.classList.toggle('on', b.dataset.c.toLowerCase() === cur));
  }
  function openModuleDialog(id){
    editingId = id;
    const m = id ? getModule(id) : null;
    $('#m-title').textContent  = m ? 'Editar tema' : 'Nuevo tema';
    $('#f-nombre').value = m ? m.nombre : '';
    $('#f-icono').value  = m ? (m.icono || '') : '';
    $('#f-desc').value   = m ? (m.descripcion || '') : '';
    $('#f-color').value  = m ? (m.color || PALETTE[0]) : PALETTE[state.modules.length % PALETTE.length];
    $('#f-cat').value    = m ? (m.categoria || '') : (ui.cat && ui.cat !== '__none' ? ui.cat : '');
    $('#f-delete').hidden = !m;
    $('#f-cat-hint').textContent = '';
    $('#f-cat-hint').className = 'hint';
    renderSwatches();
    refreshIconPreview();
    updateFileHint();
    catHint($('#f-cat').value, m ? m.categoria : '');
    dlgModule.showModal();
    setTimeout(() => $('#f-nombre').focus(), 60);
  }

  /* Sugerencias de categoría (select + texto libre a la vez) */
  const catInput = $('#f-cat'), catList = $('#f-cat-list');
  function showCatList(){
    const q = normCat(catInput.value);
    const cats = existingCats().filter(c => !q || c.norm.includes(q));
    catList.innerHTML = cats.length
      ? cats.map(c => `<button type="button" data-v="${esc(c.name)}">${esc(c.name)}<span>${c.count} ${c.count === 1 ? 'tema' : 'temas'}</span></button>`).join('')
      : '';
    catList.classList.toggle('open', cats.length > 0);
    catList.querySelectorAll('button').forEach(b => {
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        catInput.value = b.dataset.v;
        catList.classList.remove('open');
        catHint(catInput.value, editingId ? (getModule(editingId)?.categoria || '') : '');
      });
    });
  }
  catInput.addEventListener('focus', showCatList);
  catInput.addEventListener('input', () => {
    showCatList();
    catHint(catInput.value, editingId ? (getModule(editingId)?.categoria || '') : '');
  });
  catInput.addEventListener('blur', () => setTimeout(() => catList.classList.remove('open'), 120));
  $('#f-nombre').addEventListener('input', updateFileHint);
  $('#f-icono').addEventListener('input', refreshIconPreview);
  $('#f-color').addEventListener('input', () => { markSwatch(); refreshIconPreview(); });

  $('#form-module').addEventListener('submit', async e => {
    e.preventDefault();
    const nombre = $('#f-nombre').value.trim();
    if(!nombre){ toast('Ponle un nombre al tema', 'warn'); return; }
    const exclude = editingId ? (getModule(editingId)?.categoria || '') : '';
    if(!catHint($('#f-cat').value, exclude)) return;   /* bloquea categorías similares */
    const payload = {
      nombre,
      icono:       $('#f-icono').value.trim(),
      descripcion: $('#f-desc').value.trim(),
      color:       $('#f-color').value,
      categoria:   normCat($('#f-cat').value)
    };
    if(editingId){
      await mutate('module.update', { id: editingId, ...payload }, {
        apply(){ Object.assign(getModule(editingId), payload); },
        msg: 'Tema actualizado'
      });
    }else{
      const tmp = 'tmp_' + Date.now();
      await mutate('module.create', payload, {
        apply(){ state.modules.push({ id: tmp, creado: new Date().toISOString(), tablas: 0, ...payload }); },
        onOk(r){
          const m = state.modules.find(x => x.id === tmp);
          if(m){ m.id = r.id; if(r.sheet) m.sheet = r.sheet; }
        },
        msg: 'Tema creado'
      });
    }
    dlgModule.close();
  });

  $('#f-delete').addEventListener('click', async () => {
    const m = getModule(editingId);
    if(!m) return;
    dlgModule.close();
    const ok = await confirmDialog(`Eliminar «${m.nombre}»`,
      `Se borrarán también sus ${m.tablas || 0} ${(m.tablas || 0) === 1 ? 'tabla' : 'tablas'}. Esta acción no se puede deshacer.`);
    if(!ok) return;
    await mutate('module.delete', { id: m.id }, {
      apply(){ state.modules = state.modules.filter(x => x.id !== m.id); },
      msg: 'Tema eliminado'
    });
  });

  /* ── Diálogo de categorías ── */
  const dlgCats = $('#dlg-cats');
  function openCatsDialog(){
    const cats = existingCats();
    $('#cats-list').innerHTML = cats.length ? cats.map(c => `
      <div class="cat-row" data-from="${esc(c.name)}">
        <input value="${esc(c.name)}" aria-label="Renombrar ${esc(c.name)}">
        <span class="use">${c.count} ${c.count === 1 ? 'tema' : 'temas'}</span>
        <button type="button" class="save" title="Guardar nombre" aria-label="Guardar nombre">${SVG_CHECK}</button>
      </div>`).join('')
      : '<p class="cats-note">Todavía no hay categorías en uso.</p>';
    $$('#cats-list .cat-row').forEach(row => {
      const input = row.querySelector('input');
      const from  = row.dataset.from;
      input.addEventListener('input', () => input.classList.remove('bad'));
      input.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); doRename(from, input); } });
      row.querySelector('.save').onclick = () => doRename(from, input);
    });
    dlgCats.showModal();
  }
  async function doRename(from, input){
    const to = normCat(input.value);
    const cur = normCat(from);
    if(!to || to === cur){ input.value = cur || from; return; }
    const conflict = findCatConflict(to, state.modules.map(m => m.categoria || ''), from);
    if(conflict && conflict.type === 'similar'){
      input.classList.add('bad');
      toast(`«${to}» se parece a «${conflict.cat}»`, 'err');
      return;
    }
    const done = await mutate('category.rename', { from: cur, to }, {
      apply(){ state.modules.forEach(m => { if(normCat(m.categoria || '') === cur) m.categoria = to; }); },
      msg: 'Categoría renombrada'
    });
    if(done){ renderChips(); openCatsDialog(); }
  }

  /* ── Interacción general ── */
  $('#content').addEventListener('click', e => {
    const btn = e.target.closest('[data-edit]');
    if(btn){ openModuleDialog(btn.dataset.edit); return; }
    const card = e.target.closest('[data-href]');
    if(card) location.href = card.dataset.href;
  });
  $('#content').addEventListener('keydown', e => {
    if(e.key === 'Enter' && e.target.closest('[data-href]'))
      location.href = e.target.closest('[data-href]').dataset.href;
  });
  $('#q').addEventListener('input', e => { ui.q = e.target.value; render(); });
  $('#chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if(chip){ ui.cat = chip.dataset.cat; render(); }
  });
  $('#btn-new').onclick  = () => openModuleDialog(null);
  $('#btn-cats').onclick = openCatsDialog;

  function setView(v){
    ui.view = v;
    localStorage.setItem('ai_view', v);
    $('#v-cards').classList.toggle('on', v === 'cards');
    $('#v-list').classList.toggle('on', v === 'list');
    render();
  }
  $('#v-cards').onclick = () => setView('cards');
  $('#v-list').onclick  = () => setView('list');
  wireModeButton();
  wireCloseButtons();

  /* ── Datos de demostración (solo si falta config.js) ── */
  const DEMO_MODULES = [
    { id:'d1', nombre:'Biología celular', color:'#3f6f4e', categoria:'ciencias', tablas:4,
      icono:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="10" cy="11" r="3.2"/><circle cx="16.5" cy="16" r="1.4"/><path d="M15 6.5c1.8.6 3 1.8 3.6 3.4"/></svg>',
      descripcion:'La unidad mínima de la vida: estructura, orgánulos y procesos fundamentales.' },
    { id:'d2', nombre:'Álgebra lineal', color:'#2f6076', categoria:'matematicas', tablas:2,
      icono:'<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.5 3.5v17M15.5 3.5v17M3.5 9.5h17M3.5 15.5h17"/></svg>',
      descripcion:'Vectores, matrices y transformaciones: el lenguaje de los datos.' }
  ];

  /* ── Arranque ──
     Con caché: pinta AL INSTANTE y verifica la hoja en segundo plano.
     Sin caché: skeleton breve + descarga (rápida: solo el Index). */
  setView(ui.view);
  $('#demo-banner').hidden = !demoMode;
  if(demoMode){
    state = { modules: DEMO_MODULES };
    loading = false; render();
    return;
  }
  if(stateFromCache()){
    loading = false;
    render();                  /* contenido visible de inmediato, cero espera */
    backgroundCheck();         /* verifica si la hoja cambió, sin molestar */
    return;
  }
  try{
    await fetchAll();
  }catch(err){
    loading = false;
    $('#content').innerHTML = `
      <div class="hero" style="padding-top:6vh">
        <h1 style="font-size:26px">No se pudo conectar con la hoja</h1>
        <p>${esc(abortMsg(err))} — revisa que la URL de la Web App sea correcta y que el acceso sea público.</p>
        <button class="btn primary" onclick="location.reload()">Reintentar</button>
      </div>`;
    return;
  }
  loading = false; render();
}

/* ═══════════════════════════════════════════════════════════════════
   ═══ VISTA TEMA — las tablas de SU propia hoja                      ═══
   ═══════════════════════════════════════════════════════════════════ */
async function themeView(SHEET_NAME){

  SHEET_NAME = String(SHEET_NAME || '').trim();
  buildThemeShell();

  /* ── Estado, caché y anchos ── */
  let state = { module: null, tables: [] };
  let cacheRev = null;
  let loading = true;
  let ui = { q: '' };
  const CACHE_KEY = 'ai_sheet_v1_' + SHEET_NAME.toLowerCase();
  const WKEY = 'ai_widths_v1_' + SHEET_NAME.toLowerCase();

  function readWidths(){ try{ return JSON.parse(localStorage.getItem(WKEY)) || {}; }catch(_){ return {}; } }
  let widths = readWidths();
  function saveWidths(){ try{ localStorage.setItem(WKEY, JSON.stringify(widths)); }catch(_){ } }

  function readCache(){ try{ return JSON.parse(localStorage.getItem(CACHE_KEY)); }catch(_){ return null; } }
  function writeCache(data, rev){
    try{ localStorage.setItem(CACHE_KEY, JSON.stringify({ rev, ts: Date.now(), data })); }catch(_){}
  }
  function persistCache(){ if(cacheRev != null) writeCache(state, cacheRev); }

  function normalizeTables(tables){
    (tables || []).forEach(t => {
      t.headers = (t.headers || []).map(h =>
        typeof h === 'string'
          ? { name: h, type: 'text', lang: '' }
          : { name: String(h.name || 'Columna'),
              type: h.type === 'code' ? 'code' : 'text',
              lang: String(h.lang || '') });
      t.rows = (t.rows || []).map(r => ({ id: r.id, values: r.values || [], locked: !!r.locked }));
    });
    return tables;
  }

  async function fetchTheme(){
    const r = await apiGet('action=theme&sheet=' + encodeURIComponent(SHEET_NAME));
    if(!r.ok) throw new Error(r.error || 'Error al cargar el tema');
    state = { module: r.module || null, tables: normalizeTables(r.tables || []) };
    cacheRev = String(r.rev);
    persistCache();
  }

  /* ── Sincronización: SOLO una comprobación tras abrir.
     Si estás escribiendo se pospone hasta tu próximo guardado.
     NO hay intervalos periódicos. ── */
  let pendingSync = false;
  function isEditing(){
    const ae = document.activeElement;
    return !!(ae && $('#content').contains(ae) &&
      (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.classList.contains('CodeMirror')));
  }
  function maybePendingSync(){
    if(!pendingSync) return;
    pendingSync = false;
    setTimeout(backgroundCheck, 1500);
  }
  async function backgroundCheck(){
    if(demoMode) return;
    try{
      const r = await apiGet('action=ping');
      if(String(r.rev) === String(cacheRev)){ persistCache(); return; }
      if(isEditing() || pendingOps.size > 0){ pendingSync = true; return; }
      const all = await apiGet('action=theme&sheet=' + encodeURIComponent(SHEET_NAME));
      if(all.ok && !isEditing() && pendingOps.size === 0){
        state = { module: all.module || null, tables: normalizeTables(all.tables || []) };
        cacheRev = String(all.rev);
        persistCache(); render();
        toast('Sincronizado con la hoja', 'ok');
      }else{
        pendingSync = true;
      }
    }catch(_){ }
  }

  /* ── Derivados ── */
  function getTable(id){ return state.tables.find(t => t.tableId === id) || null; }
  const byTitle = (a,b) => String(a.titulo).localeCompare(String(b.titulo),'es',{sensitivity:'base'});
  const sortedRows = t => [...t.rows].sort((a,b) =>
    String(a.values[0]||'').trim().localeCompare(String(b.values[0]||'').trim(),'es',{sensitivity:'base'}));

  /* ── Red de seguridad: conserva lo tecleado en renders ── */
  const skipRestore = new Set();
  function captureEdits(){
    const cap = { rows:{}, focus:null };
    const ae = document.activeElement;
    if(ae){
      const tr = ae.closest && ae.closest('#content tr.editing');
      const td = ae.closest && ae.closest('td[data-td]');
      if(tr && td) cap.focus = { rid: tr.dataset.rid, cell: td.dataset.td };
    }
    $$('#content tr.editing').forEach(tr => {
      if(skipRestore.has(tr.dataset.rid)) return;
      cap.rows[tr.dataset.rid] = [...tr.querySelectorAll('textarea')].map(t => t.value);
    });
    skipRestore.clear();
    return cap;
  }
  function restoreEdits(cap){
    if(!cap) return;
    for(const [rid, vals] of Object.entries(cap.rows)){
      const tr = document.querySelector(`#content tr[data-rid="${CSS.escape(rid)}"]`);
      if(!tr || !tr.classList.contains('editing')) continue;
      tr.querySelectorAll('textarea').forEach(t => {
        const v = vals[+t.dataset.cell];
        if(v != null) t.value = v;
      });
      tr.querySelectorAll('textarea.cell-input').forEach(autoGrow);
    }
    if(cap.focus){
      const tr = document.querySelector(`#content tr[data-rid="${CSS.escape(cap.focus.rid)}"]`);
      const td = tr && tr.querySelector(`td[data-td="${CSS.escape(cap.focus.cell)}"]`);
      if(td){
        const ta = td.querySelector('textarea');
        if(ta && !ta.hidden){ ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      }
    }
  }

  /* ── Render ── */
  function render(){
    if(loading) return;                    /* el overlay #boot sigue tapando */
    const cap = captureEdits();
    renderHero();
    renderTables();
    restoreEdits(cap);
    mountEditors();
    highlightCodeViews();
    hideBoot();
    requestAnimationFrame(updateScrollHints);
  }

  function renderHero(){
    const m = state.module;
    const name = (m && m.nombre) || prettyName(SHEET_NAME);
    document.title = name + ' — Aprendizaje Infinito';
    $('#hero').innerHTML = `
      <section class="hero-theme" style="--c:${esc((m && m.color) || 'var(--accent)')}">
        ${renderIcon(m && m.icono)}
        <div class="hero-main">
          <div class="meta-line">
            <a class="back" href="${esc(BASE)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m7-7-7 7 7 7"/></svg>
              Índice
            </a>
            ${m && m.categoria ? `<span class="cat-pill"><i></i>${esc(m.categoria)}</span>` : ''}
            <span>${state.tables.length} ${state.tables.length === 1 ? 'tabla' : 'tablas'}</span>
            <span class="file-path" title="Hoja de este tema en el spreadsheet">${esc(SHEET_NAME)}</span>
          </div>
          <h1>${esc(name)}</h1>
          ${m && m.descripcion ? `<p class="hero-desc">${esc(m.descripcion)}</p>` : ''}
        </div>
      </section>`;
  }

  function renderTables(){
    const total = state.tables.length;
    $('#toolbar').hidden = total === 0;
    const q = normCat(ui.q.trim());
    const list = state.tables
      .filter(t => !q || normCat(t.titulo).includes(q))
      .sort(byTitle);
    $('#t-count').textContent = !total ? '' :
      (q ? `${list.length} de ${total} ${total === 1 ? 'tabla' : 'tablas'}`
         : `${total} ${total === 1 ? 'tabla' : 'tablas'} · orden alfabético`);

    const C = $('#content');
    if(total === 0){
      C.innerHTML = `
        <div class="empty-tables">
          <p>Este tema todavía no tiene tablas.<br>Crea la primera para empezar a registrar conocimiento.</p>
          <button class="btn primary" id="empty-new">
            ${SVG_PLUS} Crear la primera tabla
          </button>
        </div>`;
      $('#empty-new').onclick = () => openTableDialog();
      return;
    }
    if(!list.length){
      C.innerHTML = `<p class="empty-note">Ninguna tabla coincide con «${esc(ui.q)}».</p>`;
      return;
    }
    C.innerHTML = list.map((t,i) => blockHTML(t,i)).join('');
  }

  /* colgroup: escritorio respeta anchos guardados (px);
     móvil usa proporciones (nombre ancho) → todo cabe en pantalla */
  function colsHTML(t){
    if(isMobile()){
      const n = t.headers.length;
      const OPS = 52;
      const first = n === 1 ? 1 : 0.34;
      const rest  = n > 1 ? ((1 - first) / (n - 1)) : 0;
      return t.headers.map((h,j) =>
        `<col style="width:calc((100% - ${OPS}px) * ${j === 0 ? first : rest})">`).join('')
        + `<col class="opscol" style="width:${OPS}px">`;
    }
    const w = widths[t.tableId] || {};
    return t.headers.map((h,j) =>
      `<col${w[j] ? ` style="width:${w[j]}px"` : ''}>`).join('') + '<col class="opscol" style="width:76px">';
  }

  function blockHTML(t, i){
    return `
    <section class="tblock" data-table="${esc(t.tableId)}">
      <div class="tb-head">
        <span class="tb-num">${pad(i+1)}</span>
        <h2 class="t-title" data-tid="${esc(t.tableId)}" title="Clic para editar el título">${esc(t.titulo)}</h2>
        <div class="tb-actions">
          <button class="op del" data-act="del-table" title="Eliminar tabla" aria-label="Eliminar tabla">${SVG_TRASH}</button>
        </div>
      </div>
      ${t.texto
        ? `<p class="t-theory" data-tid="${esc(t.tableId)}" title="Clic para editar">${esc(t.texto)}</p>`
        : `<p class="t-theory empty" data-tid="${esc(t.tableId)}" title="Clic para añadir">+ Añadir teoría o descripción…</p>`}
      <div class="tb-tools">
        <button class="mini-btn" data-act="add-row" title="Añadir fila: nace editable al instante">
          ${SVG_PLUS} Fila
        </button>
        <button class="mini-btn" data-act="add-col">
          ${SVG_PLUS} Columna
        </button>
        <span class="tb-stats">${t.rows.length} ${t.rows.length === 1 ? 'fila' : 'filas'} · ${t.headers.length} columnas</span>
      </div>
      <div class="tbl-wrap">
        <table>
          <colgroup>${colsHTML(t)}</colgroup>
          <thead><tr>
            ${t.headers.map((h,j) => `
              <th data-col="${j}" class="${j === 0 ? 'lock' : ''}"
                  title="${esc(h.name)} · Clic: editar cabecera (tipo/lenguaje)${j === 0 ? ' · Fija: ordena las filas' : ' · ×: eliminar columna'}">
                <span class="h-label">${esc(h.name)}</span>
                ${h.type === 'code' ? `<span class="col-badge" title="Columna de código: ${esc(h.lang || 'texto')}">‹› ${esc(h.lang || '')}</span>` : ''}
                ${j > 0 ? `<button class="col-x" data-act="del-col" data-col="${j}" title="Eliminar columna" aria-label="Eliminar columna">
                  <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>` : ''}
                <span class="col-grip" title="Arrastra para ajustar el ancho"></span>
              </th>`).join('')}
            <th class="ops"></th>
          </tr></thead>
          <tbody>
            ${sortedRows(t).map(r => rowHTML(t, r)).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
  }

  function displayCell(h, v){
    if(h.type === 'code'){
      return `<pre class="codeview ${isDark() ? 'cm-s-material-darker' : 'cm-s-default'}" data-lang="${esc(h.lang)}">${esc(v)}</pre>`;
    }
    return esc(v) || '<span class="nul">—</span>';
  }

  function rowHTML(t, row){
    const editable = !row.locked;
    return `
    <tr class="${editable ? 'editing' : ''}" data-rid="${esc(row.id)}">
      ${t.headers.map((h,j) => {
        const v = row.values[j] ?? '';
        if(!editable){
          return `<td data-td="${j}">${displayCell(h, v)}</td>`;
        }
        if(h.type === 'code'){
          return `<td data-td="${j}"><textarea class="code-editor" data-cell="${j}" data-lang="${esc(h.lang)}" hidden>${esc(v)}</textarea></td>`;
        }
        return `<td data-td="${j}"><textarea class="cell-input" data-cell="${j}" placeholder="${j === 0 ? 'Nombre…' : ''}">${esc(v)}</textarea></td>`;
      }).join('')}
      <td class="ops">
        ${editable
          ? `<button class="op save" data-act="save-row" title="Guardar fila (Ctrl+Enter)" aria-label="Guardar fila">
               <svg viewBox="0 0 24 24"><path d="m4 12 5 5L20 7"/></svg>
             </button>`
          : `<button class="op" data-act="edit-row" data-rid="${esc(row.id)}" title="Editar fila (instantáneo)" aria-label="Editar fila">
               ${SVG_PENCIL}
             </button>
             <button class="op del" data-act="del-row" data-rid="${esc(row.id)}" title="Eliminar fila" aria-label="Eliminar fila">
               ${SVG_TRASH}
             </button>`}
      </td>
    </tr>`;
  }

  /* ── Editores CodeMirror / textareas ── */
  function autoGrow(ta){ ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
  function mountEditors(){
    $$('#content tr.editing .cell-input').forEach(autoGrow);
    if(!HAS_CM){
      $$('#content .code-editor').forEach(ta => {
        ta.hidden = false;
        ta.className = 'cell-input mono';
        autoGrow(ta);
      });
      return;
    }
    $$('#content .code-editor').forEach(ta => {
      if(ta.dataset.mounted) return;
      const lang = ta.dataset.lang || 'Plain Text';
      loadMode(lang, () => {
        if(!ta.isConnected || ta.dataset.mounted) return;
        ta.dataset.mounted = '1';
        const cm = CodeMirror.fromTextArea(ta, {
          mode: cmModeOf(lang),
          theme: CM_THEME(),
          lineWrapping: true,
          viewportMargin: Infinity,
          matchBrackets: true,
          autoCloseBrackets: true,
          extraKeys: {
            'Ctrl-Space': cm2 => { if(CodeMirror.commands.autocomplete) cm2.execCommand('autocomplete'); },
            'Cmd-Space':  cm2 => { if(CodeMirror.commands.autocomplete) cm2.execCommand('autocomplete'); },
            'Ctrl-Enter': cm2 => saveRowFromTr(cm2.getWrapperElement().closest('tr')),
            'Cmd-Enter':  cm2 => saveRowFromTr(cm2.getWrapperElement().closest('tr')),
            'Esc': cm2 => {
              const tr = cm2.getWrapperElement().closest('tr');
              if(tr) skipRestore.add(tr.dataset.rid);
              render();
            }
          }
        });
        cm.setSize('100%', 'auto');
        /* Sincroniza CM → textarea oculto: captureEdits nunca pierde código */
        cm.on('change', () => { ta.value = cm.getValue(); });
        cm.on('inputRead', (inst, ch) => {
          if(!ch.text || !ch.text[0] || !/[\w$]/.test(ch.text[0])) return;
          if(inst.state.completionActive) return;
          if(typeof inst.showHint === 'function' && CodeMirror.hint && CodeMirror.hint.anyword)
            inst.showHint({ hint: CodeMirror.hint.anyword, completeSingle: false });
        });
      });
    });
  }

  function highlightCodeViews(){
    if(!HAS_CM || typeof CodeMirror.runMode !== 'function') return;
    $$('#content .codeview[data-lang]').forEach(pre => {
      if(pre.dataset.done || !pre.dataset.lang) return;
      loadMode(pre.dataset.lang, () => {
        try{ CodeMirror.runMode(pre.textContent, cmModeOf(pre.dataset.lang), pre); }catch(_){ }
        pre.dataset.done = '1';
      });
    });
  }

  /* ── Sombras de scroll (¿queda contenido a los lados?) ── */
  let hintRaf = false;
  function updateScrollHints(){
    $$('#content .tbl-wrap').forEach(w => {
      w.classList.toggle('sc-left',  w.scrollLeft > 4);
      w.classList.toggle('sc-right', w.scrollLeft + w.clientWidth < w.scrollWidth - 4);
    });
  }
  $('#content').addEventListener('scroll', e => {
    if(!e.target.classList || !e.target.classList.contains('tbl-wrap')) return;
    if(hintRaf) return;
    hintRaf = true;
    requestAnimationFrame(() => { hintRaf = false; updateScrollHints(); });
  }, true);

  /* Giro/redimensionado: re-render si cruza el breakpoint (nunca en edición) */
  let wasMobile = isMobile(), rzT = null;
  window.addEventListener('resize', () => {
    updateScrollHints();
    clearTimeout(rzT);
    rzT = setTimeout(() => {
      const m = isMobile();
      if(m !== wasMobile && !isEditing() && pendingOps.size === 0){
        wasMobile = m;
        render();
      }
    }, 250);
  });

  /* ── Guardar fila (POST en background, sin interrupciones) ── */
  async function saveRowFromTr(tr){
    if(!tr) return;
    const block = tr.closest('.tblock');
    if(!block) return;
    const tid = block.dataset.table;
    const t = getTable(tid); if(!t) return;
    const rid = tr.dataset.rid;
    const row = t.rows.find(x => x.id === rid); if(!row) return;
    const values = t.headers.map((h,j) => {
      const td = tr.querySelector(`td[data-td="${j}"]`);
      if(!td) return row.values[j] ?? '';
      if(h.type === 'code' && HAS_CM){
        const cm = td.querySelector('.CodeMirror');
        if(cm && cm.CodeMirror) return cm.CodeMirror.getValue();
      }
      const ta = td.querySelector('textarea');
      return ta ? ta.value : (row.values[j] ?? '');
    });
    if(!values[0] || !values[0].trim()){
      toast('La primera celda (nombre) no puede quedar vacía', 'warn');
      return;
    }
    await mutate('row.update', { tableId: tid, rowId: rid, values, locked: true },
      { apply(){ row.values = values; row.locked = true; }, msg: 'Fila guardada' });
  }

  /* ── Mutaciones: local → render → POST en background.
     SIN re-render posterior y SIN revertir: lo que escribes jamás
     se borra. Si el POST falla, solo se avisa con toast. ── */
  async function mutate(action, payload, { apply=null, onOk=null, msg='Guardado' } = {}){
    if(apply) apply();
    render();
    if(demoMode){ toast('Modo demostración: el cambio no se guarda', 'warn'); return true; }
    const op = opStart();
    try{
      const r = await apiPost(action, Object.assign({ sheet: SHEET_NAME }, payload));
      if(!r.ok) throw new Error(r.error || 'Error del servidor');
      cacheRev = String(r.rev);
      persistCache();
      if(onOk){ try{ onOk(r); }catch(_){ } }
      opEnd(op);
      if(msg) toast(msg, 'ok');
      maybePendingSync();
      return true;
    }catch(err){
      opEnd(op);
      toast('No se pudo guardar: ' + abortMsg(err), 'err');
      return false;
    }
  }

  /* Añadir fila: instantáneo + POST en background (id del cliente) */
  function addRow(tid){
    const t = getTable(tid); if(!t) return;
    const rid = newRowId();
    const row = { id: rid, values: Array(t.headers.length).fill(''), locked: false };
    t.rows.push(row);
    render();
    requestAnimationFrame(() => {
      const tr = document.querySelector(`#content tr[data-rid="${CSS.escape(rid)}"]`);
      const inp = tr && tr.querySelector('textarea.cell-input');
      if(inp){ inp.focus(); inp.scrollIntoView({ block:'nearest' }); }
      updateScrollHints();
    });
    if(demoMode) return;
    const op = opStart();
    apiPost('row.add', { sheet: SHEET_NAME, tableId: tid, rowId: rid, values: row.values })
      .then(r => {
        if(!r.ok) throw new Error(r.error || 'Error del servidor');
        cacheRev = String(r.rev); persistCache();
        opEnd(op); toast('Fila añadida', 'ok'); maybePendingSync();
      })
      .catch(err => {
        opEnd(op);
        toast('La fila no se pudo crear en la hoja: ' + abortMsg(err), 'err');
      });
  }

  /* ── Título y teoría: edición en línea ── */
  function startTitleEdit(el){
    const tid = el.dataset.tid;
    const t = getTable(tid); if(!t || el.dataset.busy) return;
    el.dataset.busy = '1';
    const inp = document.createElement('input');
    inp.className = 'inline-input'; inp.type = 'text';
    inp.value = t.titulo; inp.maxLength = 90;
    el.replaceWith(inp);
    inp.focus(); inp.select();
    let done = false;
    const finish = save => {
      if(done) return; done = true;
      const v = inp.value.trim();
      if(save && v && v !== t.titulo){
        mutate('table.meta', { tableId: tid, titulo: v },
          { apply(){ t.titulo = v; }, msg: 'Título guardado' });
      }else{
        render();
      }
    };
    inp.addEventListener('keydown', ev => {
      if(ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
      else if(ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
  }
  function startTheoryEdit(el){
    const tid = el.dataset.tid;
    const t = getTable(tid); if(!t || el.dataset.busy) return;
    el.dataset.busy = '1';
    const ta = document.createElement('textarea');
    ta.className = 'inline-input';
    ta.rows = clamp(Math.ceil(((t.texto || '').length / 80)) + 1, 3, 10);
    ta.value = t.texto || '';
    ta.placeholder = 'Explicación, contexto o notas sobre esta tabla…';
    el.replaceWith(ta);
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    const hint = document.createElement('span');
    hint.className = 'edit-hint';
    hint.textContent = 'Enter = salto de línea · Ctrl+Enter = guardar · Esc = cancelar';
    ta.after(hint);
    let done = false;
    const finish = save => {
      if(done) return; done = true;
      const v = ta.value.replace(/\s+$/,'');
      if(save && v !== (t.texto || '')){
        mutate('table.meta', { tableId: tid, texto: v },
          { apply(){ t.texto = v; }, msg: 'Teoría guardada' });
      }else{
        render();
      }
    };
    ta.addEventListener('keydown', ev => {
      if((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
      else if(ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
      /* Enter sin Ctrl = salto de línea (nativo) */
    });
    ta.addEventListener('blur', () => finish(true));
  }

  /* ── Columna: diálogo de cabecera (nombre / tipo / lenguaje) ── */
  let colCtx = null;
  function openColDialog(tid, j){
    const t = getTable(tid); if(!t) return;
    const h = t.headers[j]; if(!h) return;
    colCtx = { tid, j };
    populateLangList();
    $('#c-name').value = h.name;
    $('#c-type').value = h.type;
    $('#c-lang').value = h.lang || '';
    const code = h.type === 'code';
    $('#c-lang-field').hidden = !code;
    $('#c-hint').hidden = !code;
    $('#dlg-col').showModal();
    setTimeout(() => $('#c-name').select(), 60);
  }
  $('#c-type').addEventListener('change', () => {
    const code = $('#c-type').value === 'code';
    $('#c-lang-field').hidden = !code;
    $('#c-hint').hidden = !code;
    if(code) $('#c-lang').focus();
  });
  $('#col-save').addEventListener('click', () => {
    if(!colCtx) return;
    const t = getTable(colCtx.tid);
    if(!t){ colCtx = null; $('#dlg-col').close(); return; }
    const j = colCtx.j;
    const name = $('#c-name').value.trim() || t.headers[j].name;
    const type = $('#c-type').value === 'code' ? 'code' : 'text';
    const lang = type === 'code' ? $('#c-lang').value.trim() : '';
    const headers = t.headers.map((h,i) => i === j ? { name, type, lang } : h);
    const tid = colCtx.tid;
    colCtx = null;
    $('#dlg-col').close();
    mutate('table.meta', { tableId: tid, headers },
      { apply(){ t.headers = headers; }, msg: 'Columna actualizada' });
  });
  $('#dlg-col').addEventListener('close', () => { colCtx = null; });

  /* ── Añadir / eliminar columnas ── */
  function addCol(tid){
    const t = getTable(tid); if(!t) return;
    mutate('col.add', { tableId: tid, at: t.headers.length, col: 'Nueva columna' }, {
      apply(){
        t.headers.push({ name: 'Nueva columna', type: 'text', lang: '' });
        t.rows.forEach(r => r.values.push(''));
      },
      msg: 'Columna añadida'
    });
  }
  async function delCol(tid, j){
    const t = getTable(tid); if(!t) return;
    if(!j || !t.headers[j]) return;
    const h = t.headers[j];
    const ok = await confirmDialog('Eliminar columna',
      `Se eliminará «${h.name}» y el contenido de esa celda en todas las filas.`);
    if(!ok) return;
    mutate('col.delete', { tableId: tid, index: j }, {
      apply(){ t.headers.splice(j, 1); t.rows.forEach(r => r.values.splice(j, 1)); },
      msg: 'Columna eliminada'
    });
  }

  /* ── Filas: editar (desbloquear) y eliminar ── */
  function unlockRow(tid, rid){
    const t = getTable(tid); if(!t) return;
    const row = t.rows.find(x => x.id === rid); if(!row) return;
    mutate('row.update', { tableId: tid, rowId: rid, locked: false }, {
      apply(){ row.locked = false; },
      msg: ''
    });
    requestAnimationFrame(() => {
      const tr = document.querySelector(`#content tr[data-rid="${CSS.escape(rid)}"]`);
      const inp = tr && tr.querySelector('textarea.cell-input');
      if(inp){ inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    });
  }
  async function delRow(tid, rid){
    const t = getTable(tid); if(!t) return;
    const row = t.rows.find(x => x.id === rid); if(!row) return;
    const first = (row.values[0] || '').trim();
    const ok = await confirmDialog('Eliminar fila',
      first ? `Se eliminará «${first}».` : 'Se eliminará la fila. Esta acción no se puede deshacer.');
    if(!ok) return;
    mutate('row.delete', { tableId: tid, rowId: rid }, {
      apply(){ t.rows = t.rows.filter(x => x.id !== rid); },
      msg: 'Fila eliminada'
    });
  }

  /* ── Tabla: eliminar ── */
  async function delTable(tid){
    const t = getTable(tid); if(!t) return;
    const ok = await confirmDialog('Eliminar tabla',
      `Se eliminará «${t.titulo}» con sus ${t.rows.length} ${t.rows.length === 1 ? 'fila' : 'filas'}. Esta acción no se puede deshacer.`);
    if(!ok) return;
    mutate('table.delete', { tableId: tid }, {
      apply(){ state.tables = state.tables.filter(x => x.tableId !== tid); },
      msg: 'Tabla eliminada'
    });
  }

  /* ── Diálogo: nueva tabla ── */
  function renderHGrid(n, keep){
    n = clamp(n | 0, 1, 12);
    const prev = keep ? [...$('#h-grid').querySelectorAll('input')].map(i => i.value) : [];
    $('#h-grid').innerHTML = Array.from({length:n}, (_,j) =>
      `<input id="h-${j}" maxlength="40" autocomplete="off" placeholder="${j === 0 ? 'Nombre (ordena las filas)' : 'Columna ' + (j + 1)}" value="${esc(prev[j] || '')}">`
    ).join('');
  }
  function openTableDialog(){
    $('#f-titulo').value = '';
    $('#f-texto').value = '';
    $('#f-rows').value = '3';
    $('#f-cols').value = '3';
    renderHGrid(3, false);
    $('#dlg-table').showModal();
    setTimeout(() => $('#f-titulo').focus(), 60);
  }
  $('#f-cols').addEventListener('input', () => renderHGrid(Number($('#f-cols').value) || 1, true));

  $('#form-table').addEventListener('submit', e => {
    e.preventDefault();
    const titulo = $('#f-titulo').value.trim();
    if(!titulo){ toast('Ponle un título a la tabla', 'warn'); return; }
    const texto = $('#f-texto').value;
    const nCols = clamp(Number($('#f-cols').value) || 3, 1, 12);
    const headers = [];
    for(let j = 0; j < nCols; j++){
      const el = document.getElementById('h-' + j);
      const name = (el && el.value.trim()) || (j === 0 ? 'Nombre' : 'Columna ' + (j + 1));
      headers.push({ name, type: 'text', lang: '' });
    }
    const nRows = clamp(Number($('#f-rows').value) || 0, 0, 50);
    const rows = Array.from({length:nRows}, () =>
      ({ id: newRowId(), values: Array(nCols).fill(''), locked: false }));
    /* tableId provisional; el backend devuelve el definitivo y se
       remapea en silencio (sin re-render: no se borra nada escrito) */
    const tmpId = 'tmp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    $('#dlg-table').close();
    mutate('table.create',
      { titulo, texto, headers, rows: rows.map(r => ({ rowId: r.id, values: r.values })) },
      {
        apply(){
          state.tables.push({ tableId: tmpId, titulo, texto, headers, rows, creado: new Date().toISOString() });
        },
        onOk(r){
          const t = state.tables.find(x => x.tableId === tmpId);
          if(t && r.tableId){
            t.tableId = r.tableId;
            const sec = document.querySelector(`#content .tblock[data-table="${CSS.escape(tmpId)}"]`);
            if(sec) sec.dataset.table = r.tableId;
            persistCache();
          }
        },
        msg: 'Tabla creada'
      });
    requestAnimationFrame(() => {
      const sec = [...document.querySelectorAll('#content .tblock')]
        .find(b => b.querySelector('.t-title') && b.querySelector('.t-title').textContent === titulo);
      const ta = sec && sec.querySelector('tbody textarea.cell-input');
      if(ta) ta.focus();
    });
  });

  /* ── Clic general en #content ── */
  let gripDrag = false;
  $('#content').addEventListener('click', e => {
    const actEl = e.target.closest('[data-act]');
    if(actEl){
      const act = actEl.dataset.act;
      const block = actEl.closest('.tblock');
      if(!block) return;
      const tid = block.dataset.table;
      if(act === 'add-row')      addRow(tid);
      else if(act === 'add-col') addCol(tid);
      else if(act === 'del-table') delTable(tid);
      else if(act === 'del-col') delCol(tid, Number(actEl.dataset.col));
      else if(act === 'save-row') saveRowFromTr(actEl.closest('tr'));
      else if(act === 'edit-row') unlockRow(tid, actEl.dataset.rid);
      else if(act === 'del-row')  delRow(tid, actEl.dataset.rid);
      return;
    }
    const th = e.target.closest('thead th');
    if(th && !th.classList.contains('ops') && !gripDrag){
      const block = th.closest('.tblock');
      if(block) openColDialog(block.dataset.table, Number(th.dataset.col));
      return;
    }
    const title = e.target.closest('.t-title');
    if(title){ startTitleEdit(title); return; }
    const theory = e.target.closest('.t-theory');
    if(theory){ startTheoryEdit(theory); return; }
  });

  /* Teclado en celdas: Ctrl+Enter guarda, Esc cancela, Enter = salto */
  $('#content').addEventListener('keydown', e => {
    const ta = e.target;
    if(!ta || ta.tagName !== 'TEXTAREA' || !ta.classList.contains('cell-input')) return;
    const tr = ta.closest('tr.editing');
    if(!tr) return;
    if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){
      e.preventDefault();
      saveRowFromTr(tr);
    }else if(e.key === 'Escape'){
      e.preventDefault();
      skipRestore.add(tr.dataset.rid);
      render();
    }
  });

  /* Buscador de tablas por título */
  $('#q').addEventListener('input', e => { ui.q = e.target.value; render(); });

  /* ── Anchos de columna: arrastre en vivo, sin re-render ── */
  $('#content').addEventListener('pointerdown', e => {
    const grip = e.target.closest('.col-grip');
    if(!grip || isMobile()) return;
    const th = grip.closest('th');
    const block = grip.closest('.tblock');
    if(!th || !block) return;
    const tid = block.dataset.table;
    const j = Number(th.dataset.col);
    const table = th.closest('table');
    const colEl = table.querySelectorAll('colgroup col')[j];
    if(!colEl) return;
    const startX = e.clientX;
    const startW = th.getBoundingClientRect().width;
    gripDrag = true;
    const move = ev => {
      const w = clamp(startW + ev.clientX - startX, 60, 1200);
      colEl.style.width = w + 'px';
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      widths[tid] = widths[tid] || {};
      widths[tid][j] = Math.round(th.getBoundingClientRect().width);
      saveWidths();
      setTimeout(() => { gripDrag = false; }, 0);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    e.preventDefault();
  });

  /* ── Botones de cabecera ── */
  $('#btn-new-table').onclick = () => openTableDialog();
  wireModeButton(() => { if(!loading) render(); });
  wireCloseButtons();

  /* ── Arranque del tema ── */
  if(demoMode){
    showBootError('Falta la conexión con la hoja',
      'Este sitio necesita la URL del Apps Script en config.js. Copia .env.ejemplo a .env.local, pon tu URL y ejecuta «node crear-config.mjs» (en GitHub lo genera el deploy con el secret API_URL).');
    return;
  }
  const cmReady = bootCM();     /* CodeMirror carga en paralelo */

  let hadCache = false;
  try{
    const c = readCache();
    if(c && c.data && Array.isArray(c.data.tables)){
      state = { module: c.data.module || null, tables: normalizeTables(c.data.tables) };
      cacheRev = String(c.rev ?? '');
      hadCache = true;
    }
  }catch(_){ }
  if(hadCache){
    loading = false;
    render();
    backgroundCheck();
  }else{
    try{
      await fetchTheme();
    }catch(err){
      showBootError('No se pudo cargar «' + SHEET_NAME + '»',
        abortMsg(err) + ' — comprueba tu conexión y que la hoja exista en el Index.');
      return;
    }
    loading = false;
    render();
  }
  cmReady.then(ok => {
    HAS_CM = ok;
    if(ok) populateLangList();
    render();
  });
}

/* ═══════════════════════════════════════════════════════════════════
   ═══ ROUTER + ARRANQUE                                              ═══
   ═══════════════════════════════════════════════════════════════════ */

/* Compatibilidad con enlaces antiguos: index.html?id=<moduleId>
   resuelve la hoja del tema y redirige a index.html?tema=<hoja> */
async function resolveLegacy(id){
  document.body.className = 'v-theme';
  document.body.innerHTML = `<div id="boot">${bootSvg()}<p>Buscando el tema…</p></div>`;
  let sheet = null;
  try{
    const c = JSON.parse(localStorage.getItem('ai_cache_v1') || 'null');
    const m = c && c.data && c.data.modules && c.data.modules.find(x => x.id === id);
    if(m && m.sheet) sheet = m.sheet;
  }catch(_){ }
  if(!sheet && !demoMode){
    try{
      const r = await apiGet('action=all');
      const m = r.ok && (r.modules || []).find(x => x.id === id);
      if(m && m.sheet) sheet = m.sheet;
    }catch(_){ }
  }
  if(sheet){
    location.replace(BASE + '?tema=' + encodeURIComponent(sheet));
    return;
  }
  document.body.innerHTML = `
    <main class="wrap" style="min-height:100dvh;display:flex;align-items:center;justify-content:center">
      <div class="hero" style="padding:0">
        <h1 style="font-size:26px">Tema no encontrado</h1>
        <p>No hay ningún tema con el identificador «${esc(id)}» en el índice.</p>
        <a class="btn primary" href="${esc(BASE)}">Ir a la biblioteca</a>
      </div>
    </main>`;
}

function start(){
  const tema = (PARAMS.get('tema') || PARAMS.get('sheet') || '').trim();
  const legacyId = (PARAMS.get('id') || '').trim();
  if(tema){
    themeView(tema);
  }else if(legacyId){
    resolveLegacy(legacyId);
  }else{
    initView();
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', start);
}else{
  start();
}

})();
