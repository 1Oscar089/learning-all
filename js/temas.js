/* temas.js — APRENDIZAJE INFINITO · Vista de tema (SPA)
   ─────────────────────────────────────────────────────────────────────
   Lee y escribe SOLO la hoja del tema elegido (action=theme&sheet=X).
   · Tablas ordenadas por título; filas SIEMPRE por la 1.ª columna.
   · Edición local-first: el servidor nunca interrumpe, nunca borra
     lo escrito; los POST van en 2.º plano y solo avisan si fallan.
   · Celdas multilínea (Enter=salto, Ctrl+Enter=guardar, Esc=cancelar).
   · Columnas de tipo Código con CodeMirror (doble CDN, carga perezosa
     de modos, degradación total a textarea si no hay red).
   · Anchos de columna arrastrables, guardados por dispositivo.
   · Móvil: colgroup porcentual, 1.ª columna y ops fijas.
   ───────────────────────────────────────────────────────────────────── */
window.TemaView = (function(){
  'use strict';
  var AI = window.AI;

  var S = {
    sheet: '', meta: null, tables: [], rev: 0,
    ready: false, q: '', widths: {},
    curTid: null, curColIdx: -1
  };
  function sheetKey(){ return 'ai_sheet_v1_' + S.sheet; }
  function widthKey(){ return 'ai_widths_v1_' + S.sheet; }
  var MOBILE_Q = window.matchMedia ? window.matchMedia('(max-width:719.9px)') : null;
  function isMobile(){ return !!(MOBILE_Q && MOBILE_Q.matches); }

  /* ═══════════════ CodeMirror (cargador propio, doble CDN) ═══════════════ */
  var CM = (function(){
    var state = 0;            // 0 en reposo · 1 cargando · 2 listo · 3 falló
    var cbs = [];
    var BASE = '';
    var CDNS = [
      'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/',
      'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/'
    ];
    var FILES = [
      'codemirror.min.css', 'codemirror.min.js', 'mode/meta.min.js',
      'addon/mode/loadmode.min.js', 'addon/edit/closebrackets.min.js',
      'addon/edit/matchbrackets.min.js', 'addon/hint/show-hint.css',
      'addon/hint/show-hint.min.js', 'addon/hint/anyword-hint.min.js'
    ];
    var FALLBACK_LANGS = ['JavaScript','TypeScript','Python','Java','C','C++','C#','Go','Rust',
      'PHP','Ruby','Swift','Kotlin','Dart','Scala','Perl','Lua','R','SQL','Shell','Bash','HTML',
      'XML','CSS','SCSS','JSON','YAML','Markdown','LaTeX','MATLAB','Haskell','Elixir','Clojure',
      'Objective-C','VBScript','Julia','Groovy','F#','Assembly'];
    var FBMAP = {
      'javascript':'javascript','js':'javascript','typescript':'javascript','ts':'javascript',
      'python':'python','py':'python','html':'xml','xml':'xml','svg':'xml','css':'css',
      'scss':'css','less':'css','shell':'shell','bash':'shell','sh':'shell','java':'clike',
      'c':'clike','c++':'clike','cpp':'clike','c#':'clike','csharp':'clike','go':'go',
      'rust':'rust','php':'php','ruby':'ruby','swift':'swift','kotlin':'clike','dart':'dart',
      'scala':'clike','perl':'perl','lua':'lua','r':'r','sql':'sql','json':{name:'javascript',json:true},
      'yaml':'yaml','markdown':'markdown','latex':'stex','matlab':'octave','haskell':'haskell',
      'elixir':'elixir','clojure':'clojure','objective-c':'clike','vbscript':'vbscript',
      'julia':'julia','groovy':'groovy','f#':'mllike','assembly':'gas'
    };

    function loadCss(url, cb){
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = url;
      var done = false;
      var t = setTimeout(function(){ if (!done){ done = true; cb(false); } }, 8000);
      l.onload = function(){ if (!done){ done = true; clearTimeout(t); cb(true); } };
      l.onerror = function(){ if (!done){ done = true; clearTimeout(t); cb(false); } };
      document.head.appendChild(l);
    }
    function loadJs(url, cb){
      var s = document.createElement('script');
      s.src = url; s.async = false;
      var done = false;
      var t = setTimeout(function(){ if (!done){ done = true; cb(false); } }, 8000);
      s.onload = function(){ if (!done){ done = true; clearTimeout(t); cb(true); } };
      s.onerror = function(){ if (!done){ done = true; clearTimeout(t); cb(false); } };
      document.head.appendChild(s);
    }
    function loadOne(url, cb){
      if (/\.css$/.test(url)) loadCss(url, cb); else loadJs(url, cb);
    }

    function ensure(cb){
      if (state === 2){ if (cb) cb(true); return; }
      if (state === 3){ if (cb) cb(false); return; }
      if (cb) cbs.push(cb);
      if (state === 1) return;
      state = 1;
      BASE = CDNS[0];
      var i = 0;
      function next(){
        if (i >= FILES.length){ finish(true); return; }
        var f = FILES[i];
        i++;
        loadOne(BASE + f, function(ok){
          if (ok) { next(); return; }
          var idx = CDNS.indexOf(BASE);
          if (idx >= 0 && idx < CDNS.length - 1){ BASE = CDNS[idx + 1]; i = 0; next(); }
          else finish(false);
        });
      }
      function finish(ok){
        state = ok ? 2 : 3;
        if (ok && window.CodeMirror){
          try{ window.CodeMirror.modeURL = BASE + 'mode/%N/%N.min.js'; }catch(e){}
        }
        var list = cbs; cbs = [];
        for (var k = 0; k < list.length; k++){ try{ list[k](ok); }catch(e){} }
      }
      next();
    }

    function resolveModeKey(lang){
      var name = String(lang || '').trim().toLowerCase();
      if (!name) return null;
      try{
        if (window.CodeMirror && window.CodeMirror.modeInfo && window.CodeMirror.modeInfo.length){
          var mi = window.CodeMirror.modeInfo;
          for (var i = 0; i < mi.length; i++){
            var m = mi[i];
            var n = String(m.name || '').toLowerCase();
            if (n === name || String(m.mode || '').toLowerCase() === name){
              return String(m.mode || '').toLowerCase() || null;
            }
          }
        }
      }catch(e){}
      var f = FBMAP[name];
      if (f) return (typeof f === 'string') ? f : (f && f.name) || null;
      return name;
    }

    function ensureMode(lang, cb){
      if (!window.CodeMirror){ cb(false); return; }
      var mode = resolveModeKey(lang);
      if (!mode){ cb(true); return; }
      try{
        if (window.CodeMirror.modes && window.CodeMirror.modes[mode]){ cb(true); return; }
      }catch(e){}
      loadJs(BASE + 'mode/' + mode + '/' + mode + '.min.js', function(ok){ cb(!!ok); });
    }

    /* Convierte un textarea en editor CM; el textarea sigue siendo la
       fuente de verdad (sync bidireccional) para que guardar nunca pierda
       lo escrito, incluso si CM se carga tarde o falla. */
    function wrap(ta, lang, onSave, onCancel){
      if (!window.CodeMirror || !window.CodeMirror.fromTextArea) return null;
      try{
        var cm = window.CodeMirror.fromTextArea(ta, {
          mode: resolveModeKey(lang) || 'text/plain',
          lineWrapping: true, indentUnit: 2, tabSize: 2, smartIndent: true,
          autoCloseBrackets: true, matchBrackets: true,
          extraKeys: {
            'Ctrl-Enter': function(){ if (onSave) onSave(); },
            'Cmd-Enter': function(){ if (onSave) onSave(); },
            'Esc': function(){ if (onCancel) onCancel(); },
            'Ctrl-Space': function(cm2){ try{ cm2.showHint({ hint: window.CodeMirror.hint.anyword, completeSingle: false }); }catch(e){} }
          }
        });
        cm.on('change', function(){ ta.value = cm.getValue(); });
        cm.on('inputRead', function(cm2, ch){
          try{
            var txt = ch && ch.text && ch.text[0] ? ch.text[0] : '';
            if (/[A-Za-z_.'":]/.test(txt)){
              cm2.showHint({ hint: window.CodeMirror.hint.anyword, completeSingle: false });
            }
          }catch(e){}
        });
        try{ cm.setSize('100%', 'auto'); }catch(e){}
        return cm;
      }catch(e){ return null; }
    }

    return {
      ensure: ensure, ensureMode: ensureMode, wrap: wrap,
      langList: function(){
        try{
          if (window.CodeMirror && window.CodeMirror.modeInfo && window.CodeMirror.modeInfo.length){
            return window.CodeMirror.modeInfo.map(function(m){ return m.name; }).sort(AI.cmpEs);
          }
        }catch(e){}
        return FALLBACK_LANGS.slice();
      },
      ready: function(){ return state === 2; }
    };
  })();

  /* ═══════════════ Utilidades de datos ═══════════════ */
  function saveSheetCache(){
    AI.cacheSet(sheetKey(), { rev: S.rev, tables: S.tables, ts: Date.now() });
  }
  function saveWidths(){
    AI.cacheSet(widthKey(), S.widths);
  }
  function tableById(tid){
    for (var i = 0; i < S.tables.length; i++){
      if (String(S.tables[i].tableId) === String(tid)) return S.tables[i];
    }
    return null;
  }
  function rowById(t, rid){
    if (!t) return null;
    for (var i = 0; i < t.rows.length; i++){
      if (String(t.rows[i].rowId) === String(rid)) return t.rows[i];
    }
    return null;
  }
  function sortRows(t){
    if (!t || !Array.isArray(t.rows)) return;
    t.rows.sort(function(a, b){
      return AI.cmpEs((a.values && a.values[0]) || '', (b.values && b.values[0]) || '');
    });
  }
  function sortTables(){
    S.tables.sort(function(a, b){ return AI.cmpEs(a.titulo, b.titulo); });
  }
  function normalizeTables(arr){
    var out = [];
    for (var i = 0; i < arr.length; i++){
      var t = arr[i];
      if (!t || typeof t !== 'object') continue;
      var tt = {
        tableId: String(t.tableId || ('t' + Date.now().toString(36) + i)),
        titulo: String(t.titulo == null ? '' : t.titulo).trim() || 'Sin título',
        texto: String(t.texto == null ? '' : t.texto),
        headers: [], rows: [],
        creado: t.creado || ''
      };
      var hs = Array.isArray(t.headers) ? t.headers : [];
      for (var h = 0; h < hs.length; h++){
        var raw = hs[h];
        var o = (raw && typeof raw === 'object') ? raw : { name: String(raw == null ? '' : raw) };
        tt.headers.push({
          name: String(o.name == null ? '' : o.name).trim() || ('Columna ' + (h + 1)),
          type: o.type === 'code' ? 'code' : 'text',
          lang: String(o.lang == null ? '' : o.lang).trim()
        });
      }
      if (!tt.headers.length) tt.headers = [{ name: 'Nombre', type: 'text', lang: '' }];
      var rs = Array.isArray(t.rows) ? t.rows : [];
      for (var r = 0; r < rs.length; r++){
        var rr = rs[r];
        if (!rr || typeof rr !== 'object') continue;
        var vals = Array.isArray(rr.values) ? rr.values : [];
        var vv = [];
        for (var v = 0; v < tt.headers.length; v++){
          vv.push(String(vals[v] == null ? '' : vals[v]));
        }
        tt.rows.push({
          rowId: String(rr.rowId || AI.clientRowId()),
          locked: rr.locked === undefined ? true : !!rr.locked,
          values: vv
        });
      }
      sortRows(tt);
      out.push(tt);
    }
    return out;
  }
  function findMeta(sheet){
    var c = AI.cacheGet('ai_cache_v1');
    var mods = (c && Array.isArray(c.modulos)) ? c.modulos : null;
    if (mods){
      for (var i = 0; i < mods.length; i++){
        var m = mods[i];
        var sh = String((m && m.sheet) || '').trim() || AI.slugify(m && m.nombre);
        if (sh === sheet) return m;
      }
    }
    return null;
  }
  function prettySheet(sheet){
    return String(sheet || '').replace(/-/g, ' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  }
  function colorOf(){
    var c = S.meta ? String(S.meta.color || '') : '';
    return /^#[0-9a-f]{3,8}$/i.test(c) ? c : 'var(--accent)';
  }
  function tableCount(){
    return S.tables.length;
  }

  /* ═══════════════ Vista ═══════════════ */
  function render(sheet){
    S.sheet = AI.slugify(sheet);
    S.ready = false; S.q = ''; S.tables = []; S.rev = 0;
    S.curTid = null; S.curColIdx = -1;
    var w = AI.cacheGet(widthKey());
    S.widths = (w && typeof w === 'object') ? w : {};

    var app = AI.$('#app');
    app.innerHTML = '';
    var root = document.createElement('div');
    root.id = 't-view';
    root.innerHTML = skeletonHTML();
    app.appendChild(root);
    bind(root);

    var meta = findMeta(S.sheet);
    if (meta){ S.meta = meta; }

    var c = AI.cacheGet(sheetKey());
    var hadCache = !!(c && Array.isArray(c.tables));
    if (hadCache){
      S.tables = normalizeTables(c.tables);
      S.rev = c.rev || 0;
      paintAll();
      S.ready = true;
    }
    updateHeader();
    AI.bootDone();

    /* Red de seguridad: aunque la red se cuelgue, la página nunca se queda en blanco */
    setTimeout(function(){
      if (!S.ready){
        paintAll();
        S.ready = true;
        AI.bootDone();
      }
    }, 20000);

    load();
    CM.ensure(function(){ fillLangs(); });
  }

  function skeletonHTML(){
    var ic = S.meta ? AI.iconHTML(S.meta.icono) : AI.iconHTML('');
    return '' +
    '<header class="brand wrap" style="--c:' + AI.esc(colorOf()) + '">' +
      '<a class="btn icon" href="#/" title="Volver al índice" aria-label="Volver al índice">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg></a>' +
      '<span class="theme-ic" id="t-icon">' + ic + '</span>' +
      '<div class="brand-txt"><h2 id="t-title">Cargando…</h2><p id="t-sub">Tema</p></div>' +
      '<div class="brand-side">' + AI.themeToggleHTML() + '</div>' +
    '</header>' +
    '<div class="toolbar wrap">' +
      '<input id="t-search" class="input" type="search" placeholder="Buscar tabla por título…">' +
      '<button id="t-new" class="btn primary">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>Nueva tabla</button>' +
    '</div>' +
    '<main class="wrap" id="t-tables">' +
      '<div class="panel"><h3>Cargando…</h3><p>Leyendo la hoja «' + AI.esc(S.sheet) + '» de tu hoja de cálculo.</p></div>' +
    '</main>' +
    '<footer>' + AI.logoSVG('') + '<span>Aprendizaje Infinito · tus datos viven en tu Google Sheets</span></footer>' +
    '<datalist id="dl-langs"></datalist>' +
    dialogsHTML();
  }

  function dialogsHTML(){
    return '' +
    '<dialog id="dlg-newtable" class="wide">' +
      '<div class="dlg-body">' +
        '<h3>Nueva tabla</h3>' +
        '<label class="fld">Título<input id="nt-title" class="input" maxlength="120" placeholder="Ej.: Sintaxis básica"></label>' +
        '<label class="fld">Teoría (opcional · se muestra sobre la tabla)<textarea id="nt-text" class="input" rows="3" placeholder="Apuntes, fórmulas, reglas…"></textarea></label>' +
        '<div class="dlg-row">' +
          '<label class="fld" style="flex:0 0 120px">Filas vacías<input id="nt-rows" class="input" type="number" min="0" max="50" value="3"></label>' +
          '<label class="fld" style="flex:0 0 120px">Columnas<input id="nt-cols" class="input" type="number" min="2" max="30" value="3"></label>' +
        '</div>' +
        '<div class="fld">Cabeceras (la primera columna es el nombre de la fila y siempre ordena la tabla)</div>' +
        '<div id="nt-coldefs"></div>' +
        '<div class="err-line" id="nt-err"></div>' +
      '</div>' +
      '<div class="dlg-actions"><span class="flex1"></span>' +
        '<button class="btn" id="nt-cancel" type="button">Cancelar</button>' +
        '<button class="btn primary" id="nt-save" type="button">Crear tabla</button>' +
      '</div>' +
    '</dialog>' +
    '<dialog id="dlg-col">' +
      '<div class="dlg-body">' +
        '<h3 id="col-title">Columna</h3>' +
        '<label class="fld">Nombre<input id="col-name" class="input" maxlength="60"></label>' +
        '<label class="fld">Tipo<select id="col-type" class="input"><option value="text">Texto</option><option value="code">Código</option></select></label>' +
        '<label class="fld" id="col-lang-row">Lenguaje<input id="col-lang" class="input" list="dl-langs" placeholder="JavaScript, Python, HTML…"></label>' +
        '<div class="hint">El lenguaje activa el resaltado, la indentación y el autocompletado en las celdas de esta columna.</div>' +
        '<div class="err-line" id="col-err"></div>' +
      '</div>' +
      '<div class="dlg-actions">' +
        '<button class="btn danger" id="col-del" type="button">Eliminar columna</button>' +
        '<span class="flex1"></span>' +
        '<button class="btn" id="col-cancel" type="button">Cancelar</button>' +
        '<button class="btn primary" id="col-save" type="button">Guardar</button>' +
      '</div>' +
    '</dialog>';
  }

  function fillLangs(){
    var dl = AI.$('#dl-langs');
    if (!dl) return;
    var langs = CM.langList();
    dl.innerHTML = langs.map(function(l){ return '<option value="' + AI.esc(l) + '">'; }).join('');
  }

  function updateHeader(){
    var tEl = AI.$('#t-title'), sEl = AI.$('#t-sub'), icEl = AI.$('#t-icon');
    var header = AI.$('header.brand');
    if (header) header.style.setProperty('--c', colorOf());
    var name = S.meta ? (S.meta.nombre || prettySheet(S.sheet)) : prettySheet(S.sheet);
    if (tEl) tEl.textContent = name;
    document.title = (name || 'Tema') + ' — Aprendizaje Infinito';
    if (sEl){
      var bits = [];
      if (S.meta && S.meta.categoria) bits.push(String(S.meta.categoria));
      bits.push(tableCount() + (tableCount() === 1 ? ' tabla' : ' tablas'));
      sEl.textContent = bits.join(' · ');
    }
    if (icEl){
      icEl.innerHTML = S.meta ? AI.iconHTML(S.meta.icono) : AI.iconHTML('');
      icEl.style.color = colorOf();
    }
  }

  /* ═══════════════ Pintado de tablas ═══════════════ */
  function paintAll(){
    var box = AI.$('#t-tables');
    if (!box) return;
    if (!S.tables.length){
      box.innerHTML = '<div class="panel"><h3>Este tema aún no tiene tablas</h3>' +
        '<p>Crea tu primera tabla: pondrá su título, su teoría y tantas filas y columnas como quieras. Todo se guarda en la hoja «' + AI.esc(S.sheet) + '».</p>' +
        '<div class="acts"><button class="btn primary" id="t-empty-new">Crear la primera tabla</button>' +
        '<a class="btn" href="#/">Volver al índice</a></div></div>';
      var b = AI.$('#t-empty-new', box);
      if (b) b.addEventListener('click', openNewTableDialog);
      return;
    }
    var q = AI.norm(S.q);
    sortTables();
    var html = '';
    for (var i = 0; i < S.tables.length; i++){
      html += tableCardHTML(S.tables[i], q);
    }
    box.innerHTML = html;
    updateScrollHints();
  }

  function colgroupHTML(t){
    var out = '';
    if (isMobile()){
      out += '<col style="width:34%">';
      var rest = t.headers.length - 1;
      var each = rest > 0 ? ((66 - (52 / 10)) / rest).toFixed(1) + '%' : '0%';
      for (var i = 1; i < t.headers.length; i++) out += '<col style="width:' + each + '">';
      out += '<col style="width:52px">';
    } else {
      var w = S.widths[t.tableId];
      for (var j = 0; j < t.headers.length; j++){
        var px = (w && typeof w === 'object' && w[j]) ? parseInt(w[j], 10) : 0;
        out += px > 40 ? '<col style="width:' + px + 'px">' : '<col>';
      }
      out += '<col style="width:1%">';
    }
    return '<colgroup>' + out + '</colgroup>';
  }

  function headHTML(t){
    var html = '<thead><tr>';
    for (var i = 0; i < t.headers.length; i++){
      var h = t.headers[i];
      var chip = h.type === 'code'
        ? '<span class="code-chip">{ } ' + AI.esc(h.lang || 'código') + '</span>' : '';
      html += '<th data-col="' + i + '"' + (i === 0 ? ' class="ai-name"' : '') + '>' +
        '<span class="h-label">' + AI.esc(h.name) + '</span>' + chip +
        '<div class="grip" data-col="' + i + '" title="Arrastrar para cambiar el ancho"></div></th>';
    }
    html += '<th class="ai-ops"></th></tr></thead>';
    return html;
  }

  function cellInnerHTML(t, r, i){
    var v = r.values[i] || '';
    var h = t.headers[i];
    if (h && h.type === 'code'){
      return '<pre>' + AI.esc(v) + '</pre>';
    }
    return AI.esc(v);
  }

  function bodyHTML(t){
    var html = '<tbody>';
    for (var k = 0; k < t.rows.length; k++){
      var r = t.rows[k];
      html += '<tr data-rid="' + AI.esc(r.rowId) + '">';
      for (var i = 0; i < t.headers.length; i++){
        var cls = (i === 0 ? 'ai-name ' : '') + (t.headers[i].type === 'code' ? 'cell-code' : 'cell-txt');
        html += '<td class="' + cls + '" data-col="' + i + '">' + cellInnerHTML(t, r, i) + '</td>';
      }
      html += '<td class="ai-ops"><span class="ops">' +
        '<button class="btn" data-act="edit-row" title="Editar fila">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.399 16.61a2 2 0 0 0-.5.9l-1.19 4.744a.5.5 0 0 0 .62.62l4.745-1.19a2 2 0 0 0 .9-.5Z"/></svg></button>' +
        '<button class="btn" data-act="del-row" title="Eliminar fila">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
        '</span></td>';
      html += '</tr>';
    }
    html += '</tbody>';
    return html;
  }

  function tableCardHTML(t, q){
    var hide = q && AI.norm(t.titulo).indexOf(q) < 0;
    var teoria = t.texto ? '<div class="teoria" data-act="edit-teoria" title="Clic para editar la teoría">' + AI.esc(t.texto) + '</div>' : '';
    return '<section class="tbl-card" data-tid="' + AI.esc(t.tableId) + '"' + (hide ? ' hidden' : '') + '>' +
      '<div class="tbl-head">' +
        '<h3 class="tbl-title" data-act="edit-title" title="Clic para editar el título">' + AI.esc(t.titulo) + '</h3>' +
        '<span class="tbl-count">' + t.rows.length + (t.rows.length === 1 ? ' fila' : ' filas') + '</span>' +
        '<span class="flex1"></span>' +
        '<button class="btn" data-act="add-row" title="Añadir una fila (aparece arriba)">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>Fila</button>' +
        '<button class="btn" data-act="add-col" title="Añadir columna">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M12 5v14"/></svg>Columna</button>' +
        '<button class="btn icon" data-act="del-table" title="Eliminar tabla">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
      '</div>' +
      teoria +
      '<div class="tbl-scroll"><table class="ai">' +
        colgroupHTML(t) + headHTML(t) + bodyHTML(t) +
      '</table></div>' +
    '</section>';
  }

  /* Re-render de UNA tarjeta (nunca de toda la vista si hay editores abiertos) */
  function renderTable(card){
    if (!card) return;
    var t = tableById(card.getAttribute('data-tid'));
    if (!t) return;
    sortRows(t); /* las filas se muestran SIEMPRE por la 1.ª columna */
    var tmp = document.createElement('div');
    tmp.innerHTML = tableCardHTML(t, '');
    var fresh = tmp.firstElementChild;
    if (fresh && card.parentNode) card.parentNode.replaceChild(fresh, card);
    updateScrollHints();
  }

  function updateScrollHints(){
    AI.$$('.tbl-scroll').forEach(function(sc){
      var l = sc.scrollLeft > 2;
      var r = sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 2;
      sc.classList.toggle('scroll-l', l);
      sc.classList.toggle('scroll-r', r);
    });
  }

  /* ═══════════════ Carga desde el servidor ═══════════════ */
  function load(){
    if (!AI.apiUrl()){ fail(new Error('sin-url')); return; }
    AI.syncing(true);
    AI.apiGet({ action: 'theme', sheet: S.sheet })
      .then(function(d){
        AI.syncing(false);
        var tables = normalizeTables(Array.isArray(d.tables) ? d.tables : []);
        var rev = d.rev || 0;
        var changed = !S.ready || rev !== S.rev;
        S.tables = tables;
        S.rev = rev;
        if (d.module && typeof d.module === 'object' && !S.meta){
          S.meta = {
            nombre: d.module.nombre || prettySheet(S.sheet),
            icono: d.module.icono || '',
            color: d.module.color || '',
            categoria: d.module.categoria || ''
          };
          updateHeader();
        }
        saveSheetCache();
        updateHeader(); /* refresca contador de tablas y subtítulo */
        if (!S.ready){ paintAll(); S.ready = true; }
        else if (changed && !AI.isEditing() && AI.opsPending() === 0){ paintAll(); }
      })
      .catch(fail)
      .then(function(){ AI.bootDone(); });
  }

  function fail(err){
    AI.syncing(false);
    var msg = (err && err.message) || 'error de red';
    if (!S.ready){
      var box = AI.$('#t-tables');
      if (box){
        var extra = msg === 'sin-url'
          ? 'Falta la URL del Apps Script en <code>config.js</code>.'
          : 'No se pudo leer la hoja «' + AI.esc(S.sheet) + '»: ' + AI.esc(msg) + '.';
        box.innerHTML = '<div class="panel"><h3>No se pudo cargar el tema</h3><p>' + extra + '</p>' +
          '<p>Si el error persiste, vuelve a desplegar el Apps Script con <b>Editar → Nueva versión</b>.</p>' +
          '<div class="acts"><button class="btn primary" id="t-retry">Reintentar</button><a class="btn" href="#/">Volver al índice</a></div></div>';
        var r = AI.$('#t-retry', box);
        if (r) r.addEventListener('click', function(){
          var p = AI.$('#t-tables');
          if (p) p.innerHTML = '<div class="panel"><h3>Cargando…</h3><p>Leyendo la hoja «' + AI.esc(S.sheet) + '».</p></div>';
          load();
        });
      }
      AI.bootDone();
    } else {
      AI.toast('Sin conexión · se muestran los datos guardados de este tema', 'warn');
    }
  }

  /* ═══════════════ Eventos ═══════════════ */
  function bind(root){
    AI.bindThemeToggle(root);

    var search = AI.$('#t-search', root);
    if (search) search.addEventListener('input', AI.debounce(function(){
      S.q = search.value;
      var q = AI.norm(S.q);
      sortTables();
      AI.$$('.tbl-card', AI.$('#t-tables') || document).forEach(function(card){
        var t = tableById(card.getAttribute('data-tid'));
        var hide = q && t && AI.norm(t.titulo).indexOf(q) < 0;
        if (hide) card.setAttribute('hidden', ''); else card.removeAttribute('hidden');
      });
    }, 140));

    var newBtn = AI.$('#t-new', root);
    if (newBtn) newBtn.addEventListener('click', openNewTableDialog);

    var box = AI.$('#t-tables', root);
    if (box){
      box.addEventListener('click', onBoxClick);
      box.addEventListener('mousedown', onGripDown);
      box.addEventListener('scroll', function(){ updateScrollHints(); }, true);
    }

    bindNewTableDialog(root);
    bindColDialog(root);

    /* Teclas globales de edición de fila */
    document.addEventListener('keydown', onDocKey);
  }

  function onDocKey(ev){
    if (ev.key !== 'Enter' && ev.key !== 'Escape') return;
    var ta = document.activeElement;
    if (!ta || ta.tagName !== 'TEXTAREA' || !ta.closest) return;
    var td = ta.closest('td');
    if (!td) return;
    var tr = td.closest('tr');
    if (!tr) return;
    if (ev.key === 'Escape'){
      ev.preventDefault();
      if (tr.dataset.mode === 'new') cancelRow(tr);
      else if (tr.dataset.mode === 'row') cancelRow(tr);
      else commitCell(ta, td);
      return;
    }
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)){
      ev.preventDefault();
      if (tr.dataset.mode === 'new' || tr.dataset.mode === 'row') saveRow(tr);
      else commitCell(ta, td);
    }
    /* Enter sin Ctrl dentro de textarea = salto de línea (comportamiento nativo) */
  }

  function onBoxClick(ev){
    /* 1) botones data-act */
    var act = ev.target.closest('[data-act]');
    if (act){
      var card = act.closest('.tbl-card');
      var t = card ? tableById(card.getAttribute('data-tid')) : null;
      var a = act.getAttribute('data-act');
      if (!t) return;
      if (a === 'add-row') addRow(card, t);
      else if (a === 'add-col') addCol(card, t);
      else if (a === 'del-table') delTable(card, t);
      else if (a === 'edit-title') startTitleEdit(card, t);
      else if (a === 'edit-teoria') startTeoriaEdit(card, t);
      else if (a === 'edit-row'){
        var trE = act.closest('tr');
        if (trE) startRowEdit(card, trE);
      }
      else if (a === 'del-row'){
        var trD = act.closest('tr');
        if (trD) delRow(card, trD);
      }
      else if (a === 'save-row'){
        var trS = act.closest('tr');
        if (trS) saveRow(trS);
      }
      else if (a === 'cancel-row'){
        var trC = act.closest('tr');
        if (trC) cancelRow(trC);
      }
      return;
    }
    /* 2) cabecera → diálogo de columna */
    var th = ev.target.closest('thead th');
    if (th && !ev.target.closest('.grip')){
      var card2 = th.closest('.tbl-card');
      var t2 = card2 ? tableById(card2.getAttribute('data-tid')) : null;
      if (t2){
        var idx = parseInt(th.getAttribute('data-col'), 10);
        if (isFinite(idx)) openColDialog(t2, idx);
      }
      return;
    }
    /* 3) celda → edición rápida */
    var td = ev.target.closest('td.cell-txt, td.cell-code');
    if (td){
      var tr3 = td.closest('tr');
      if (tr3 && !tr3.dataset.mode) startCellEdit(td);
    }
  }

  /* ═══════════════ Edición de celdas ═══════════════ */
  function buildEditor(t, r, i, val){
    var h = t.headers[i];
    var wrap = document.createElement('div');
    wrap.className = 'cell-edit' + (h && h.type === 'code' ? ' code' : '');
    var ta = document.createElement('textarea');
    ta.value = val;
    ta.setAttribute('data-ek', 'c:' + t.tableId + ':' + r.rowId + ':' + i);
    if (h && h.type === 'code'){
      ta.setAttribute('data-cm-lang', h.lang || '');
      ta.placeholder = 'Código…';
    } else {
      ta.placeholder = 'Escribe…';
    }
    wrap.appendChild(ta);
    var hint = document.createElement('div');
    hint.className = 'cell-hint';
    hint.textContent = h && h.type === 'code'
      ? 'Resaltado al cargar · Enter = salto · Ctrl+Enter = guardar · Esc = cancelar'
      : 'Enter = salto de línea · Ctrl+Enter = guardar · Esc = cancelar';
    wrap.appendChild(hint);
    return wrap;
  }

  function editorValue(td){
    var ta = td.querySelector('textarea');
    return ta ? ta.value : null;
  }

  function startCellEdit(td){
    var tr = td.closest('tr'); var card = td.closest('.tbl-card');
    if (!tr || !card) return;
    var t = tableById(card.getAttribute('data-tid'));
    if (!t) return;
    var r = rowById(t, tr.getAttribute('data-rid'));
    if (!r) return;
    var i = parseInt(td.getAttribute('data-col'), 10);
    if (!isFinite(i) || !t.headers[i]) return;
    tr.dataset.mode = 'cell';
    td.dataset.editing = '1';
    var val = r.values[i] || '';
    td.innerHTML = '';
    td.appendChild(buildEditor(t, r, i, val));
    var ta = td.querySelector('textarea');
    if (ta){
      ta.focus();
      try{ ta.setSelectionRange(ta.value.length, ta.value.length); }catch(e){}
      if (ta.hasAttribute('data-cm-lang')){
        attachCodeMirror(ta, null, null);
      } else {
        ta.addEventListener('blur', function(){
          /* guardar al salir (red de seguridad: nunca se pierde texto) */
          if (tr.dataset.mode === 'cell') commitCell(ta, td);
        });
      }
    }
  }

  function attachCodeMirror(ta, onSave, onCancel){
    var lang = ta.getAttribute('data-cm-lang') || '';
    CM.ensure(function(ok){
      if (!ok || !ta.parentNode){ return; }
      CM.ensureMode(lang, function(ok2){
        if (!ta.parentNode) return;
        var cm = CM.wrap(ta, ok2 ? lang : '', onSave, onCancel);
        if (cm){
          ta.setAttribute('data-cm-done', '1');
          try{ cm.refresh(); cm.focus(); }catch(e){}
        }
      });
    });
  }

  function commitCell(ta, td){
    var tr = td.closest('tr'); var card = td.closest('.tbl-card');
    if (!tr || !card) return;
    var t = tableById(card.getAttribute('data-tid'));
    if (!t) return;
    var r = rowById(t, tr.getAttribute('data-rid'));
    if (!r) return;
    var i = parseInt(td.getAttribute('data-col'), 10);
    if (!isFinite(i)) return;
    var nv = ta ? ta.value : (r.values[i] || '');
    if (nv === (r.values[i] || '')){
      exitCellEdit(td, t, r, i);
      return;
    }
    r.values[i] = nv;
    saveSheetCache();
    exitCellEdit(td, t, r, i);
    postRow(t, r, tr);
  }

  function exitCellEdit(td, t, r, i){
    delete td.dataset.editing;
    var tr = td.closest('tr');
    if (tr && tr.dataset.mode === 'cell') delete tr.dataset.mode;
    /* siempre restaura el contenido de la celda; si es el nombre (col 0),
       además reordena solo esa fila en el DOM */
    td.innerHTML = cellInnerHTML(t, r, i);
    if (i === 0) resortRowDom(t, tr);
  }

  /* Reordena UNA fila en el tbody tras cambiar su nombre, sin re-render completo */
  function resortRowDom(t, tr){
    if (!tr || !tr.parentNode) return;
    sortRows(t);
    var tbody = tr.parentNode;
    var order = {};
    for (var k = 0; k < t.rows.length; k++) order[String(t.rows[k].rowId)] = k;
    var myIdx = order[String(tr.getAttribute('data-rid'))];
    if (myIdx === undefined) return;
    tbody.removeChild(tr);
    var siblings = tbody.querySelectorAll('tr[data-rid]');
    var inserted = false;
    for (var s = 0; s < siblings.length; s++){
      var oi = order[String(siblings[s].getAttribute('data-rid'))];
      if (oi !== undefined && oi > myIdx){
        tbody.insertBefore(tr, siblings[s]);
        inserted = true;
        break;
      }
    }
    if (!inserted) tbody.appendChild(tr);
  }

  function postRow(t, r, tr){
    AI.opStart('row:' + t.tableId);
    AI.apiPost('row.update', { sheet: S.sheet, tableId: t.tableId, rowId: r.rowId, values: r.values })
      .then(function(){
        AI.opEnd('row:' + t.tableId);
        saveSheetCache();
      })
      .catch(function(err){
        AI.opEnd('row:' + t.tableId);
        AI.toast('No se pudo guardar la fila (quedará al recargar): ' + err.message, 'err');
        saveSheetCache();
      });
    if (tr) tr.dataset.saved = '1';
  }

  /* ═══════════════ Edición de fila completa (lápiz) ═══════════════ */
  function startRowEdit(card, tr){
    var t = tableById(card.getAttribute('data-tid'));
    if (!t) return;
    var r = rowById(t, tr.getAttribute('data-rid'));
    if (!r) return;
    tr.dataset.mode = 'row';
    tr.classList.add('row-editing');
    for (var i = 0; i < t.headers.length; i++){
      var td = tr.children[i];
      if (!td) continue;
      td.innerHTML = '';
      td.appendChild(buildEditor(t, r, i, r.values[i] || ''));
      var ta = td.querySelector('textarea');
      if (ta && ta.hasAttribute('data-cm-lang')) attachCodeMirror(ta, null, null);
    }
    var ops = tr.querySelector('td.ai-ops .ops');
    if (ops) ops.innerHTML =
      '<button class="btn" data-act="save-row" title="Guardar fila (Ctrl+Enter)">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></button>' +
      '<button class="btn" data-act="cancel-row" title="Cancelar (Esc)">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>';
    var first = tr.querySelector('textarea');
    if (first){ first.focus(); }
  }

  function saveRow(tr){
    var card = tr.closest('.tbl-card');
    var t = card ? tableById(card.getAttribute('data-tid')) : null;
    if (!t) return;
    var r = rowById(t, tr.getAttribute('data-rid'));
    if (!r) return;
    var vals = [];
    for (var i = 0; i < t.headers.length; i++){
      var td = tr.children[i];
      var v = td ? editorValue(td) : null;
      vals.push(v == null ? (r.values[i] || '') : v);
    }
    if (!String(vals[0] || '').trim()){
      AI.toast('La primera columna (nombre) no puede quedar vacía', 'err');
      var t0 = tr.children[0] && tr.children[0].querySelector('textarea');
      if (t0) t0.focus();
      return;
    }
    var isNew = tr.dataset.mode === 'new';
    r.values = vals;
    r.locked = true;
    delete tr.dataset.mode;
    delete tr.dataset.saved;
    saveSheetCache();
    renderTable(card); /* reordena y pinta la fila guardada */
    if (isNew){
      AI.opStart('rowadd:' + t.tableId);
      AI.apiPost('row.add', { sheet: S.sheet, tableId: t.tableId, rowId: r.rowId, values: r.values })
        .then(function(resp){
          AI.opEnd('rowadd:' + t.tableId);
          var realId = resp && resp.rowId ? String(resp.rowId) : r.rowId;
          if (realId !== r.rowId){
            var cardNow = AI.$('[data-tid="' + t.tableId + '"]');
            var trNow = cardNow ? cardNow.querySelector('tr[data-rid="' + r.rowId + '"]') : null;
            if (trNow) trNow.setAttribute('data-rid', realId);
            r.rowId = realId;
          }
          saveSheetCache();
        })
        .catch(function(err){
          AI.opEnd('rowadd:' + t.tableId);
          AI.toast('No se pudo guardar la fila nueva: ' + err.message, 'err');
          saveSheetCache();
        });
    } else {
      postRow(t, r, null);
    }
  }

  function cancelRow(tr){
    var card = tr.closest('.tbl-card');
    var t = card ? tableById(card.getAttribute('data-tid')) : null;
    if (!t) return;
    var wasNew = tr.dataset.mode === 'new';
    if (wasNew){
      var r = rowById(t, tr.getAttribute('data-rid'));
      if (r){
        var idx = t.rows.indexOf(r);
        if (idx >= 0) t.rows.splice(idx, 1);
        saveSheetCache();
      }
      if (tr.parentNode) tr.parentNode.removeChild(tr);
      updateHeader();
      return;
    }
    renderTable(card); /* vuelve a pintar con los valores sin tocar */
  }

  function delRow(card, tr){
    var t = card ? tableById(card.getAttribute('data-tid')) : null;
    if (!t) return;
    var r = rowById(t, tr.getAttribute('data-rid'));
    if (!r) return;
    var name = (r.values && r.values[0]) || '(sin nombre)';
    AI.confirmDlg('Eliminar fila', '¿Eliminar la fila «' + name + '» de «' + t.titulo + '»?', 'Eliminar')
      .then(function(ok){
        if (!ok) return;
        var idx = t.rows.indexOf(r);
        if (idx >= 0) t.rows.splice(idx, 1);
        saveSheetCache();
        if (tr.parentNode) tr.parentNode.removeChild(tr);
        updateHeader();
        AI.opStart('rowdel:' + t.tableId);
        AI.apiPost('row.delete', { sheet: S.sheet, tableId: t.tableId, rowId: r.rowId })
          .then(function(){ AI.opEnd('rowdel:' + t.tableId); saveSheetCache(); })
          .catch(function(err){
            AI.opEnd('rowdel:' + t.tableId);
            AI.toast('No se pudo eliminar en el servidor: ' + err.message, 'err');
          });
      });
  }

  function addRow(card, t){
    var r = { rowId: AI.clientRowId(), locked: false, values: [] };
    for (var i = 0; i < t.headers.length; i++) r.values.push('');
    t.rows.push(r);
    saveSheetCache();
    var tbody = card.querySelector('tbody');
    if (!tbody){ renderTable(card); tbody = card.querySelector('tbody'); }
    var tr = document.createElement('tr');
    tr.setAttribute('data-rid', r.rowId);
    tr.dataset.mode = 'new';
    tr.classList.add('row-editing');
    for (var j = 0; j < t.headers.length; j++){
      var td = document.createElement('td');
      td.className = (j === 0 ? 'ai-name ' : '') + (t.headers[j].type === 'code' ? 'cell-code' : 'cell-txt');
      td.setAttribute('data-col', j);
      td.appendChild(buildEditor(t, r, j, ''));
      tr.appendChild(td);
    }
    var ops = document.createElement('td');
    ops.className = 'ai-ops';
    ops.innerHTML = '<span class="ops">' +
      '<button class="btn" data-act="save-row" title="Guardar fila (Ctrl+Enter)">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></button>' +
      '<button class="btn" data-act="cancel-row" title="Cancelar (Esc)">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
      '</span>';
    tr.appendChild(ops);
    tbody.insertBefore(tr, tbody.firstChild);
    var first = tr.querySelector('textarea');
    if (first){
      first.focus();
      if (first.hasAttribute('data-cm-lang')) attachCodeMirror(first, null, null);
    }
    var cnt = card.querySelector('.tbl-count');
    if (cnt) cnt.textContent = t.rows.length + (t.rows.length === 1 ? ' fila' : ' filas');
    updateHeader();
  }

  /* ═══════════════ Columnas ═══════════════ */
  function addCol(card, t){
    var h = { name: 'Columna ' + (t.headers.length + 1), type: 'text', lang: '' };
    t.headers.push(h);
    t.rows.forEach(function(r){ r.values.push(''); });
    saveSheetCache();
    renderTable(card);
    updateHeader();
    AI.opStart('coladd:' + t.tableId);
    AI.apiPost('col.add', { sheet: S.sheet, tableId: t.tableId, header: h })
      .then(function(){ AI.opEnd('coladd:' + t.tableId); saveSheetCache(); })
      .catch(function(err){
        AI.opEnd('coladd:' + t.tableId);
        AI.toast('La columna se creó aquí pero no se pudo guardar: ' + err.message, 'warn');
      });
  }

  function delCol(card, t, idx){
    if (idx <= 0){
      AI.toast('La primera columna (nombre) no se puede eliminar', 'err');
      return;
    }
    var h = t.headers[idx];
    AI.confirmDlg('Eliminar columna',
      '¿Eliminar la columna «' + (h.name || ('Columna ' + (idx + 1))) + '» y los datos que contiene en todas las filas?', 'Eliminar')
      .then(function(ok){
        if (!ok) return;
        t.headers.splice(idx, 1);
        t.rows.forEach(function(r){ r.values.splice(idx, 1); });
        var w = S.widths[t.tableId];
        if (w && typeof w === 'object'){ delete w[idx]; saveWidths(); }
        saveSheetCache();
        renderTable(card);
        AI.opStart('coldel:' + t.tableId);
        AI.apiPost('col.delete', { sheet: S.sheet, tableId: t.tableId, index: idx })
          .then(function(){ AI.opEnd('coldel:' + t.tableId); saveSheetCache(); })
          .catch(function(err){
            AI.opEnd('coldel:' + t.tableId);
            AI.toast('La columna se quitó aquí pero no se pudo guardar: ' + err.message, 'warn');
          });
      });
  }

  /* ═══════════════ Título y teoría de la tabla ═══════════════ */
  function startTitleEdit(card, t){
    var h3 = card.querySelector('.tbl-title');
    if (!h3 || h3.querySelector('input')) return;
    var inp = document.createElement('input');
    inp.className = 'input';
    inp.value = t.titulo;
    inp.maxLength = 120;
    h3.innerHTML = '';
    h3.appendChild(inp);
    inp.focus();
    try{ inp.select(); }catch(e){}
    function commit(){
      var nv = inp.value.trim() || t.titulo;
      if (nv !== t.titulo){
        t.titulo = nv;
        saveSheetCache();
        AI.opStart('meta:' + t.tableId);
        AI.apiPost('table.meta', { sheet: S.sheet, tableId: t.tableId, titulo: nv })
          .then(function(){ AI.opEnd('meta:' + t.tableId); saveSheetCache(); })
          .catch(function(err){
            AI.opEnd('meta:' + t.tableId);
            AI.toast('El título se cambió aquí pero no se pudo guardar: ' + err.message, 'warn');
          });
        /* Reordena las tarjetas si nadie está editando */
        if (!AI.isEditing()) paintAll();
      } else {
        h3.textContent = t.titulo;
      }
    }
    inp.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter'){ ev.preventDefault(); commit(); }
      if (ev.key === 'Escape'){ ev.preventDefault(); h3.textContent = t.titulo; }
    });
    inp.addEventListener('blur', commit);
  }

  function startTeoriaEdit(card, t){
    var el = card.querySelector('.teoria');
    if (!el || el.querySelector('textarea')){
      /* no hay teoría aún: créala */
      if (!el){
        el = document.createElement('div');
        el.className = 'teoria';
        el.setAttribute('data-act', 'edit-teoria');
        var head = card.querySelector('.tbl-head');
        if (head && head.parentNode) head.parentNode.insertBefore(el, head.nextSibling);
      }
    }
    if (el.querySelector('textarea')) return;
    el.classList.add('editing');
    var ta = document.createElement('textarea');
    ta.className = 'input';
    ta.rows = 3;
    ta.value = t.texto || '';
    ta.placeholder = 'Teoría, apuntes, reglas… (se muestra sobre la tabla)';
    ta.setAttribute('data-ek', 'x:' + t.tableId);
    el.innerHTML = '';
    el.appendChild(ta);
    ta.focus();
    var saved = false;
    function commit(){
      if (saved) return;
      saved = true;
      var nv = ta.value.trim();
      t.texto = nv;
      saveSheetCache();
      el.classList.remove('editing');
      if (nv){
        el.textContent = nv;
        el.setAttribute('data-act', 'edit-teoria');
      } else {
        if (el.parentNode) el.parentNode.removeChild(el);
      }
      AI.opStart('meta:' + t.tableId);
      AI.apiPost('table.meta', { sheet: S.sheet, tableId: t.tableId, texto: nv })
        .then(function(){ AI.opEnd('meta:' + t.tableId); saveSheetCache(); })
        .catch(function(err){
          AI.opEnd('meta:' + t.tableId);
          AI.toast('La teoría se guardó aquí pero no se pudo enviar: ' + err.message, 'warn');
        });
    }
    ta.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)){ ev.preventDefault(); commit(); }
      if (ev.key === 'Escape'){
        ev.preventDefault();
        saved = true;
        el.classList.remove('editing');
        if (t.texto) el.textContent = t.texto;
        else if (el.parentNode) el.parentNode.removeChild(el);
      }
    });
    ta.addEventListener('blur', commit);
  }

  /* ═══════════════ Eliminar tabla ═══════════════ */
  function delTable(card, t){
    AI.confirmDlg('Eliminar tabla',
      '¿Eliminar «' + t.titulo + '» con todas sus filas? Esta acción no se puede deshacer.', 'Eliminar')
      .then(function(ok){
        if (!ok) return;
        var idx = S.tables.indexOf(t);
        if (idx >= 0) S.tables.splice(idx, 1);
        saveSheetCache();
        if (card.parentNode) card.parentNode.removeChild(card);
        updateHeader();
        if (!S.tables.length) paintAll();
        AI.opStart('tdel:' + t.tableId);
        AI.apiPost('table.delete', { sheet: S.sheet, tableId: t.tableId })
          .then(function(){ AI.opEnd('tdel:' + t.tableId); saveSheetCache(); })
          .catch(function(err){
            AI.opEnd('tdel:' + t.tableId);
            AI.toast('La tabla se eliminó aquí pero no se pudo guardar: ' + err.message, 'warn');
          });
      });
  }

  /* ═══════════════ Diálogo: nueva tabla ═══════════════ */
  function bindNewTableDialog(root){
    var dlg = AI.$('#dlg-newtable', root);
    if (!dlg) return;
    var colsIn = AI.$('#nt-cols', dlg);
    if (colsIn) colsIn.addEventListener('input', function(){
      renderColDefs(dlg, AI.clampInt(colsIn.value, 2, 30, 3));
    });
    var cancel = AI.$('#nt-cancel', dlg);
    if (cancel) cancel.addEventListener('click', function(){ if (dlg.open) dlg.close(); });
    var save = AI.$('#nt-save', dlg);
    if (save) save.addEventListener('click', function(){ createTable(dlg); });
    dlg.addEventListener('cancel', function(ev){ ev.preventDefault(); dlg.close(); });
  }

  function renderColDefs(dlg, n){
    var box = AI.$('#nt-coldefs', dlg);
    if (!box) return;
    var prev = [];
    AI.$$('.nt-col', box).forEach(function(row, i){
      prev.push({
        name: (AI.$('.nt-name', row) || {}).value || '',
        type: (AI.$('.nt-type', row) || {}).value || 'text',
        lang: (AI.$('.nt-lang', row) || {}).value || ''
      });
    });
    var html = '';
    for (var i = 0; i < n; i++){
      var d = prev[i] || { name: i === 0 ? 'Nombre' : ('Columna ' + (i + 1)), type: 'text', lang: '' };
      html += '<div class="dlg-row nt-col" data-i="' + i + '" style="margin-bottom:8px">' +
        '<input class="input nt-name" style="flex:1.2" maxlength="60" placeholder="Nombre de la columna" value="' + AI.esc(d.name) + '">' +
        '<select class="input nt-type" style="flex:0 0 118px"><option value="text"' + (d.type === 'text' ? ' selected' : '') + '>Texto</option><option value="code"' + (d.type === 'code' ? ' selected' : '') + '>Código</option></select>' +
        '<input class="input nt-lang" style="flex:0 0 150px' + (d.type === 'code' ? '' : ';display:none') + '" list="dl-langs" placeholder="Lenguaje" value="' + AI.esc(d.lang) + '">' +
      '</div>';
    }
    box.innerHTML = html;
  }

  function openNewTableDialog(){
    var dlg = AI.$('#dlg-newtable');
    if (!dlg) return;
    var ti = AI.$('#nt-title', dlg), te = AI.$('#nt-text', dlg);
    var ro = AI.$('#nt-rows', dlg), co = AI.$('#nt-cols', dlg);
    var err = AI.$('#nt-err', dlg);
    if (ti) ti.value = '';
    if (te) te.value = '';
    if (ro) ro.value = '3';
    if (co) co.value = '3';
    if (err) err.textContent = '';
    fillLangs();
    renderColDefs(dlg, 3);
    dlg.showModal();
    if (ti) ti.focus();
  }

  function createTable(dlg){
    var err = AI.$('#nt-err', dlg);
    var title = ((AI.$('#nt-title', dlg) || {}).value || '').trim();
    if (!title){ if (err) err.textContent = 'La tabla necesita un título.'; return; }
    var texto = ((AI.$('#nt-text', dlg) || {}).value || '').trim();
    var nRows = AI.clampInt((AI.$('#nt-rows', dlg) || {}).value, 0, 50, 3);
    var nCols = AI.clampInt((AI.$('#nt-cols', dlg) || {}).value, 2, 30, 3);
    var headers = [];
    var defs = AI.$$('.nt-col', dlg);
    for (var i = 0; i < nCols; i++){
      var row = defs[i];
      var name = row ? ((AI.$('.nt-name', row) || {}).value || '').trim() : '';
      var type = row ? ((AI.$('.nt-type', row) || {}).value || 'text') : 'text';
      var lang = row ? ((AI.$('.nt-lang', row) || {}).value || '').trim() : '';
      if (!name){ if (err) err.textContent = 'La columna ' + (i + 1) + ' necesita un nombre.'; return; }
      headers.push({ name: name, type: type === 'code' ? 'code' : 'text', lang: type === 'code' ? lang : '' });
    }
    if (err) err.textContent = '';

    var rows = [];
    for (var f = 0; f < nRows; f++){
      var vals = [];
      for (var c = 0; c < headers.length; c++) vals.push('');
      rows.push({ rowId: AI.clientRowId(), locked: false, values: vals });
    }
    var t = {
      tableId: 'tmp' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      titulo: title, texto: texto, headers: headers, rows: rows, creado: ''
    };
    S.tables.push(t);
    sortTables();
    saveSheetCache();
    dlg.close();
    paintAll();
    updateHeader();
    AI.toast('Tabla creada', 'ok');

    AI.opStart('tcreate:' + t.tableId);
    AI.apiPost('table.create', {
      sheet: S.sheet, titulo: t.titulo, texto: t.texto, headers: t.headers,
      rows: rows.map(function(r){ return { rowId: r.rowId, values: r.values }; })
    })
      .then(function(resp){
        AI.opEnd('tcreate:' + t.tableId);
        var realTid = resp && resp.tableId ? String(resp.tableId) : null;
        if (realTid && realTid !== t.tableId){
          var oldW = S.widths[t.tableId];
          if (oldW){ S.widths[realTid] = oldW; delete S.widths[t.tableId]; saveWidths(); }
          var card = AI.$('[data-tid="' + t.tableId + '"]');
          if (card) card.setAttribute('data-tid', realTid);
          t.tableId = realTid;
        }
        if (resp && Array.isArray(resp.rowIds)){
          for (var k = 0; k < resp.rowIds.length && k < t.rows.length; k++){
            var oldRid = String(t.rows[k].rowId);
            var newRid = String(resp.rowIds[k] || oldRid);
            if (newRid !== oldRid){
              var cardNow = AI.$('[data-tid="' + t.tableId + '"]');
              var trNow = cardNow ? cardNow.querySelector('tr[data-rid="' + oldRid + '"]') : null;
              if (trNow) trNow.setAttribute('data-rid', newRid);
              t.rows[k].rowId = newRid;
            }
          }
        }
        saveSheetCache();
      })
      .catch(function(err2){
        AI.opEnd('tcreate:' + t.tableId);
        AI.toast('La tabla se creó aquí pero no se pudo guardar: ' + err2.message, 'warn');
        saveSheetCache();
      });
  }

  /* ═══════════════ Diálogo: columna ═══════════════ */
  function bindColDialog(root){
    var dlg = AI.$('#dlg-col', root);
    if (!dlg) return;
    var typeIn = AI.$('#col-type', dlg);
    if (typeIn) typeIn.addEventListener('change', function(){
      var lr = AI.$('#col-lang-row', dlg);
      if (lr) lr.style.display = typeIn.value === 'code' ? '' : 'none';
    });
    var cancel = AI.$('#col-cancel', dlg);
    if (cancel) cancel.addEventListener('click', function(){ if (dlg.open) dlg.close(); });
    var del = AI.$('#col-del', dlg);
    if (del) del.addEventListener('click', function(){
      var dlg2 = AI.$('#dlg-col');
      if (!dlg2 || !dlg2.open) return;
      var t = tableById(S.curTid);
      var card = AI.$('[data-tid="' + S.curTid + '"]');
      var idx = S.curColIdx;
      dlg2.close();
      if (t && card && isFinite(idx)) delCol(card, t, idx);
    });
    var save = AI.$('#col-save', dlg);
    if (save) save.addEventListener('click', saveColDialog);
    dlg.addEventListener('cancel', function(ev){ ev.preventDefault(); dlg.close(); });
  }

  function openColDialog(t, idx){
    var dlg = AI.$('#dlg-col');
    if (!dlg) return;
    S.curTid = t.tableId;
    S.curColIdx = idx;
    var h = t.headers[idx] || { name: '', type: 'text', lang: '' };
    var title = AI.$('#col-title', dlg);
    if (title) title.textContent = 'Columna · ' + t.titulo;
    var name = AI.$('#col-name', dlg);
    if (name) name.value = h.name;
    var type = AI.$('#col-type', dlg);
    if (type) type.value = h.type;
    var lang = AI.$('#col-lang', dlg);
    if (lang) lang.value = h.lang || '';
    var lr = AI.$('#col-lang-row', dlg);
    if (lr) lr.style.display = h.type === 'code' ? '' : 'none';
    var del = AI.$('#col-del', dlg);
    if (del) del.hidden = idx === 0;
    var err = AI.$('#col-err', dlg);
    if (err) err.textContent = '';
    fillLangs();
    dlg.showModal();
    if (name) name.focus();
  }

  function saveColDialog(){
    var dlg = AI.$('#dlg-col');
    if (!dlg || !dlg.open) return;
    var t = tableById(S.curTid);
    if (!t){ dlg.close(); return; }
    var card = AI.$('[data-tid="' + t.tableId + '"]');
    var idx = S.curColIdx;
    var err = AI.$('#col-err', dlg);
    var name = ((AI.$('#col-name', dlg) || {}).value || '').trim();
    if (!name){ if (err) err.textContent = 'La columna necesita un nombre.'; return; }
    var type = ((AI.$('#col-type', dlg) || {}).value || 'text');
    var lang = ((AI.$('#col-lang', dlg) || {}).value || '').trim();
    var h = t.headers[idx];
    if (!h){ dlg.close(); return; }
    h.name = name;
    h.type = type === 'code' ? 'code' : 'text';
    h.lang = h.type === 'code' ? lang : '';
    saveSheetCache();
    if (card) renderTable(card);
    dlg.close();
    AI.opStart('meta:' + t.tableId);
    AI.apiPost('table.meta', { sheet: S.sheet, tableId: t.tableId, headers: t.headers })
      .then(function(){ AI.opEnd('meta:' + t.tableId); saveSheetCache(); })
      .catch(function(e){
        AI.opEnd('meta:' + t.tableId);
        AI.toast('La columna se cambió aquí pero no se pudo guardar: ' + e.message, 'warn');
      });
  }

  /* ═══════════════ Arrastre de anchos ═══════════════ */
  function onGripDown(ev){
    var grip = ev.target.closest('.grip');
    if (!grip) return;
    ev.preventDefault();
    var th = grip.closest('th');
    var card = grip.closest('.tbl-card');
    if (!th || !card) return;
    var t = tableById(card.getAttribute('data-tid'));
    var idx = parseInt(grip.getAttribute('data-col'), 10);
    if (!t || !isFinite(idx)) return;
    var startX = ev.clientX;
    var startW = th.getBoundingClientRect().width;
    var table = card.querySelector('table.ai');
    if (table) table.style.tableLayout = 'fixed';
    function move(e2){
      var w = Math.max(60, Math.round(startW + e2.clientX - startX));
      var col = card.querySelectorAll('colgroup col')[idx];
      if (col) col.style.width = w + 'px';
      th.style.width = w + 'px';
      grip.dataset.w = String(w);
    }
    function up(){
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      var w = parseInt(grip.dataset.w, 10);
      if (isFinite(w) && w > 40){
        if (typeof S.widths[t.tableId] !== 'object' || !S.widths[t.tableId]) S.widths[t.tableId] = {};
        S.widths[t.tableId][idx] = w;
        saveWidths();
      }
      delete grip.dataset.w;
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  /* ═══════════════ API pública ═══════════════ */
  return { render: render };
})();
