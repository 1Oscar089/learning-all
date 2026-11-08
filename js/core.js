/* core.js — APRENDIZAJE INFINITO (compartido por inicio.js y temas.js)
   ─────────────────────────────────────────────────────────────────────
   · Resolución de la URL de la API (config.js → localStorage → pantalla
     de configuración; NUNCA hace fetch de .env.local).
   · API GET/POST con AbortController (30 s) y errores claros.
   · Caché localStorage (ai_cache_v1, ai_sheet_v1_<hoja>, ai_widths_v1_<hoja>).
   · Píldoras de estado con retardo 350 ms + watchdog 45 s.
   · Toasts, confirmación, slugify, norm, iconos, tema claro/oscuro.
   ───────────────────────────────────────────────────────────────────── */
window.AI = (function(){
  'use strict';

  /* ── Helpers DOM ── */
  function $(sel, root){ return (root || document).querySelector(sel); }
  function $$(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Categorías: minúsculas, sin acentos, CONSERVA ñ, espacios colapsados */
  function norm(s){
    return String(s == null ? '' : s).trim().toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, function(m){ return m === '\u0303' ? m : ''; })
      .normalize('NFC')
      .replace(/\s+/g, ' ');
  }

  /* Nombre de hoja: minúsculas, sin acentos, ñ→n, solo [a-z0-9-], máx 90 */
  function slugify(s){
    return String(s == null ? '' : s).trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
  }

  function clampInt(v, lo, hi, dflt){
    var n = parseInt(v, 10);
    if (!isFinite(n)) n = dflt;
    return Math.min(hi, Math.max(lo, n));
  }

  function clientRowId(){
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function debounce(fn, ms){
    var t = null;
    return function(){
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function(){ t = null; fn.apply(self, args); }, ms);
    };
  }

  /* ── URL de la API ── */
  function apiUrl(){
    try{
      var c = window.APP_CONFIG || null;
      if (c && typeof c === 'object' && c.API_URL && /^https?:\/\/.+/i.test(String(c.API_URL))){
        return String(c.API_URL).trim();
      }
    }catch(e){}
    try{
      var v = localStorage.getItem('ai_api_url');
      if (v && /^https?:\/\/.+/i.test(v)) return v.trim();
    }catch(e){}
    return '';
  }

  function saveApiUrl(url){
    try{ localStorage.setItem('ai_api_url', String(url || '').trim()); }catch(e){}
  }

  /* ── Red ── */
  function fetchWithTimeout(url, opts, ms){
    ms = ms || 30000;
    var ctl = new AbortController();
    var t = setTimeout(function(){ try{ ctl.abort(); }catch(e){} }, ms);
    var merged = {};
    var src = opts || {};
    for (var k in src){ if (Object.prototype.hasOwnProperty.call(src, k)) merged[k] = src[k]; }
    merged.signal = ctl.signal;
    return fetch(url, merged).then(
      function(r){ clearTimeout(t); return r; },
      function(err){ clearTimeout(t); throw err; }
    );
  }

  function apiGet(params){
    var base = apiUrl();
    if (!base) return Promise.reject(new Error('sin-url'));
    var qs = Object.keys(params || {}).map(function(k){
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k] == null ? '' : params[k]);
    }).join('&');
    var url = base + (base.indexOf('?') >= 0 ? '&' : '?') + qs;
    return fetchWithTimeout(url, { method:'GET', redirect:'follow' })
      .then(function(r){
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(d){
        if (!d || typeof d !== 'object') throw new Error('Respuesta no válida del servidor');
        if (d.ok === false) throw new Error(d.error || 'Error del servidor');
        return d;
      });
  }

  function apiPost(action, payload){
    var base = apiUrl();
    if (!base) return Promise.reject(new Error('sin-url'));
    var body = JSON.stringify({ action: action, payload: payload || {} });
    return fetchWithTimeout(base, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    }).then(function(r){
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(d){
        if (!d || typeof d !== 'object') throw new Error('Respuesta no válida del servidor');
        if (d.ok === false) throw new Error(d.error || 'Error del servidor');
        return d;
      });
  }

  /* ── Caché ── */
  function cacheGet(key){
    try{
      var v = localStorage.getItem(key);
      if (!v) return null;
      var d = JSON.parse(v);
      return (d && typeof d === 'object') ? d : null;
    }catch(e){ return null; }
  }
  function cacheSet(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){}
  }
  function cacheDel(key){ try{ localStorage.removeItem(key); }catch(e){} }

  /* ── Píldora "Guardando…" (ops POST) ──
     Retardo 350 ms para no parpadear + watchdog 45 s de autolimpieza. */
  var pending = {};   // key → timestamp
  var showTimer = null;
  var WD_MS = 45000;

  function refreshBadge(){
    if (showTimer) clearTimeout(showTimer);
    showTimer = setTimeout(function(){
      showTimer = null;
      var el = $('#saving');
      if (!el) return;
      var n = 0;
      for (var k in pending){ if (Object.prototype.hasOwnProperty.call(pending, k)) n++; }
      el.hidden = (n === 0);
    }, 350);
  }
  function opStart(key){
    pending[key] = Date.now();
    refreshBadge();
  }
  function opEnd(key){
    if (Object.prototype.hasOwnProperty.call(pending, key)) delete pending[key];
    refreshBadge();
  }
  function opsPending(){
    var n = 0;
    for (var k in pending){ if (Object.prototype.hasOwnProperty.call(pending, k)) n++; }
    return n;
  }
  setInterval(function(){
    var now = Date.now(), stuck = [];
    for (var k in pending){
      if (Object.prototype.hasOwnProperty.call(pending, k) && now - pending[k] > WD_MS) stuck.push(k);
    }
    for (var i = 0; i < stuck.length; i++) delete pending[stuck[i]];
    if (stuck.length) refreshBadge();
  }, 2000);

  /* ── Píldora "Sincronizando…" (lecturas) ── */
  function syncing(on){
    var el = $('#syncing');
    if (el) el.hidden = !on;
  }

  /* ── Toasts ── */
  function toast(msg, kind){
    var box = $('#toasts');
    if (!box) return;
    var d = document.createElement('div');
    d.className = 'toast' + (kind ? ' ' + kind : '');
    d.textContent = String(msg == null ? '' : msg);
    box.appendChild(d);
    requestAnimationFrame(function(){ d.classList.add('on'); });
    setTimeout(function(){
      d.classList.remove('on');
      setTimeout(function(){ if (d.parentNode) d.parentNode.removeChild(d); }, 300);
    }, 3800);
  }

  /* ── Confirmación compartida ── */
  function confirmDlg(title, msg, okLabel){
    return new Promise(function(resolve){
      var dlg = $('#dlg-confirm');
      if (!dlg){ resolve(window.confirm(msg || title)); return; }
      var tEl = $('#dlg-confirm-title'), mEl = $('#dlg-confirm-msg');
      var yes = $('#dlg-confirm-yes'), no = $('#dlg-confirm-no');
      if (tEl) tEl.textContent = title || 'Confirmar';
      if (mEl) mEl.textContent = msg || '';
      if (yes) yes.textContent = okLabel || 'Eliminar';
      if (!dlg.showModal){ resolve(window.confirm(msg || '')); return; }
      dlg.showModal();
      function finish(v){
        yes.removeEventListener('click', onYes);
        no.removeEventListener('click', onNo);
        dlg.removeEventListener('cancel', onCancel);
        if (dlg.open) dlg.close();
        resolve(v);
      }
      function onYes(){ finish(true); }
      function onNo(){ finish(false); }
      function onCancel(ev){ ev.preventDefault(); finish(false); }
      yes.addEventListener('click', onYes);
      no.addEventListener('click', onNo);
      dlg.addEventListener('cancel', onCancel);
    });
  }

  /* ── Boot overlay ── */
  var bootDoneFlag = false;
  function bootDone(){
    if (bootDoneFlag) return;
    bootDoneFlag = true;
    var b = $('#boot');
    if (!b) return;
    b.classList.add('off');
    setTimeout(function(){ b.hidden = true; }, 450);
  }
  function bootStatus(txt){
    var b = $('#boot');
    if (!b) return;
    var s = b.querySelector('.boot-status');
    if (s) s.textContent = txt || '';
  }

  /* ── Tema claro / oscuro ── */
  function applyTheme(t){
    document.documentElement.dataset.theme = (t === 'light') ? 'light' : 'dark';
    try{ localStorage.setItem('ai_theme', document.documentElement.dataset.theme); }catch(e){}
  }
  function toggleTheme(){
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  }
  function themeToggleHTML(){
    return '<button class="btn icon" data-act="ai-theme" title="Cambiar tema claro/oscuro" aria-label="Cambiar tema">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg></button>';
  }
  function bindThemeToggle(root){
    var btn = $('[data-act="ai-theme"]', root || document);
    if (btn) btn.addEventListener('click', toggleTheme);
  }

  /* ── Logo infinito ── */
  var LOGO_PATH = 'M25,50 C25,20 75,20 100,50 C125,80 175,80 175,50 C175,20 125,20 100,50 C75,80 25,80 25,50 Z';
  function logoSVG(cls, animated){
    return '<svg class="ai-logo ' + (cls || '') + '" viewBox="0 0 200 100" fill="none" aria-hidden="true">' +
      '<path d="' + LOGO_PATH + '" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"' +
      (animated ? ' class="logo-anim"' : '') + '/></svg>';
  }

  /* ── Iconos: emoji · URL · colección interna ── */
  var EMOJI_RE = /^[^a-zA-Z0-9]+$/;
  function iconHTML(value, cls){
    var v = String(value == null ? '' : value).trim();
    if (!v) v = 'sparkles';
    if (/^https?:\/\/.+/i.test(v)){
      return '<img class="ic-img ' + (cls || '') + '" src="' + esc(v) + '" alt="" loading="lazy">';
    }
    if (EMOJI_RE.test(v)) return '<span class="' + (cls || '') + '">' + esc(v) + '</span>';
    var name = v.toLowerCase();
    if (window.AI_ICON_ALIAS && Object.prototype.hasOwnProperty.call(window.AI_ICON_ALIAS, name)){
      name = window.AI_ICON_ALIAS[name];
    }
    if (window.AI_ICONS && Object.prototype.hasOwnProperty.call(window.AI_ICONS, name)){
      return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        window.AI_ICONS[name] + '</svg>';
    }
    return '<span class="' + (cls || '') + '">' + esc(v.charAt(0).toUpperCase()) + '</span>';
  }

  /* ── Red de seguridad para ediciones (capture/restore) ── */
  function captureEdits(root){
    var map = {};
    $$('[data-ek]', root || document).forEach(function(el){
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT'){
        map[el.getAttribute('data-ek')] = el.value;
      }
    });
    return map;
  }
  function restoreEdits(map, root){
    if (!map) return;
    $$('[data-ek]', root || document).forEach(function(el){
      var k = el.getAttribute('data-ek');
      if (Object.prototype.hasOwnProperty.call(map, k) &&
          (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')){
        el.value = map[k];
      }
    });
  }

  /* ¿El usuario está escribiendo? (nunca interrumpir) */
  function isEditing(){
    var a = document.activeElement;
    if (a){
      var tag = a.tagName;
      if (tag === 'TEXTAREA') return true;
      if (tag === 'INPUT' && a.type !== 'button' && a.type !== 'submit' && a.type !== 'color') return true;
      if (a.isContentEditable) return true;
    }
    if ($('.CodeMirror-focused')) return true;
    if ($('.row-editing, .cell-editing, .editing')) return true;
    return false;
  }

  /* ── Orden natural en español ── */
  function cmpEs(a, b){
    return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'es', { sensitivity: 'base' });
  }

  return {
    $: $, $$: $$, esc: esc, norm: norm, slugify: slugify, clampInt: clampInt,
    clientRowId: clientRowId, debounce: debounce,
    apiUrl: apiUrl, saveApiUrl: saveApiUrl,
    fetchWithTimeout: fetchWithTimeout, apiGet: apiGet, apiPost: apiPost,
    cacheGet: cacheGet, cacheSet: cacheSet, cacheDel: cacheDel,
    opStart: opStart, opEnd: opEnd, opsPending: opsPending, syncing: syncing,
    toast: toast, confirmDlg: confirmDlg,
    bootDone: bootDone, bootStatus: bootStatus,
    applyTheme: applyTheme, toggleTheme: toggleTheme,
    themeToggleHTML: themeToggleHTML, bindThemeToggle: bindThemeToggle,
    logoSVG: logoSVG, iconHTML: iconHTML,
    captureEdits: captureEdits, restoreEdits: restoreEdits, isEditing: isEditing,
    cmpEs: cmpEs
  };
})();
