/* inicio.js — APRENDIZAJE INFINITO · Vista índice (SPA)
   ─────────────────────────────────────────────────────────────────────
   · Pinta al instante desde la caché (ai_cache_v1) y verifica en 2.º plano.
   · Tarjetas / lista, orden por categoría y nombre, buscador y chips
     de categoría con conteos.
   · Temas: crear / editar / eliminar (icono = emoji, nombre de la
     colección interna o URL; color con paleta; categoría con reglas).
   · Categorías: renombrar propagando a todos los temas.
   · El servidor NUNCA interrumpe la edición: local-first, POST en
     segundo plano, revert solo si el POST falla.
   ───────────────────────────────────────────────────────────────────── */
window.InicioView = (function(){
  'use strict';
  var AI = window.AI;
  var CACHE_KEY = 'ai_cache_v1';
  var VIEW_KEY = 'ai_view';
  var CAT_DFL = 'general';
  var SWATCHES = ['#a34a1d','#2f6f4f','#1d5fa8','#7a3fa0','#b02a37','#8a6d1d','#0f766e','#4a4a4a'];

  var S = {
    modulos: [], rev: 0, q: '', cat: '',
    view: 'cards', ready: false, editingId: null
  };

  /* ═══ Derivados ═══ */
  function catOf(m){
    return AI.norm(m && m.categoria) || CAT_DFL;
  }
  function colorOf(m){
    var c = String((m && m.color) || '').trim();
    return /^#[0-9a-f]{3,8}$/i.test(c) ? c : '#a34a1d';
  }
  function sheetOf(m){
    var s = String((m && m.sheet) || '').trim();
    return s || AI.slugify(m && m.nombre);
  }
  function tabsOf(m){
    var n = parseInt(m && m.tablas, 10);
    return isFinite(n) && n > 0 ? n : 0;
  }
  function catsOf(mods){
    var counts = {};
    (mods || []).forEach(function(m){
      var c = catOf(m);
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.keys(counts).sort(AI.cmpEs).map(function(c){
      return { name: c, count: counts[c] };
    });
  }
  function saveCache(){
    AI.cacheSet(CACHE_KEY, { rev: S.rev, modulos: S.modulos, ts: Date.now() });
  }
  function themeHref(m){
    return '#/tema/' + encodeURIComponent(sheetOf(m));
  }
  /* Regla anti-similares: «ciencias» bloquea «ciencias naturales» y viceversa */
  function catError(newCat){
    var c = AI.norm(newCat);
    if (!c) return '';
    var cats = catsOf(S.modulos);
    for (var i = 0; i < cats.length; i++){
      var ex = cats[i].name;
      if (c === ex) return '';
      if (c.indexOf(ex) === 0 || ex.indexOf(c) === 0){
        return '«' + c + '» es muy parecida a la categoría existente «' + ex + '». Elige un nombre más distinto.';
      }
    }
    return '';
  }

  /* ═══ Esqueleto de la vista ═══ */
  function render(){
    S.ready = false;
    try{ S.view = localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards'; }catch(e){ S.view = 'cards'; }

    var app = AI.$('#app');
    app.innerHTML = '';
    var root = document.createElement('div');
    root.id = 'i-view';
    root.innerHTML =
      '<header class="brand wrap">' +
        AI.logoSVG('') +
        '<div class="brand-txt"><h1>Aprendizaje Infinito</h1><p>El conocimiento que nunca se termina</p></div>' +
        '<div class="brand-side">' + AI.themeToggleHTML() + '</div>' +
      '</header>' +
      '<div class="toolbar wrap">' +
        '<input id="i-search" class="input" type="search" placeholder="Buscar tema, descripción o categoría…" value="' + AI.esc(S.q) + '">' +
        '<div class="seg">' +
          '<button id="i-v-cards" class="btn icon" title="Vista tarjetas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg></button>' +
          '<button id="i-v-list" class="btn icon" title="Vista lista"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg></button>' +
        '</div>' +
        '<button id="i-cats" class="btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>Categorías</button>' +
        '<button id="i-new" class="btn primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>Nuevo tema</button>' +
      '</div>' +
      '<div class="chips wrap" id="i-chips"></div>' +
      '<main class="wrap" id="i-content">' +
        '<div class="panel"><h3>Cargando…</h3><p>Conectando con tu hoja de cálculo.</p></div>' +
      '</main>' +
      '<footer>' + AI.logoSVG('') + '<span>Aprendizaje Infinito · tus datos viven en tu Google Sheets</span></footer>' +
      dialogsHTML();
    app.appendChild(root);
    bind(root);

    /* Caché local → pinta al instante, sin esperar la red */
    var c = AI.cacheGet(CACHE_KEY);
    if (c && c.modulos && typeof c.modulos === 'object'){
      S.modulos = Array.isArray(c.modulos) ? c.modulos : [];
      S.rev = c.rev || 0;
      paint();
      S.ready = true;
    }
    AI.bindThemeToggle(root);
    load();
  }

  function dialogsHTML(){
    var sw = SWATCHES.map(function(c, i){
      return '<button type="button" class="swatch' + (i === 0 ? ' on' : '') + '" data-color="' + c + '" style="background:' + c + '"></button>';
    }).join('');
    return '' +
    '<dialog id="dlg-tema">' +
      '<div class="dlg-body">' +
        '<h3 id="dlg-tema-title">Nuevo tema</h3>' +
        '<label class="fld">Nombre del tema<input id="t-nombre" class="input" maxlength="80" placeholder="Python, Historia Universal…"></label>' +
        '<div class="fld">Icono — acepta cualquier emoji, un nombre de la colección interna o una URL de imagen</div>' +
        '<div class="dlg-row" style="margin-bottom:12px">' +
          '<input id="t-icono" class="input" placeholder="🐍 · book-open · https://…" style="flex:1">' +
          '<button id="t-pick" class="btn icon-pick-btn" type="button"><span class="prev" id="t-icprev">✨</span>Elegir…</button>' +
        '</div>' +
        '<label class="fld">Descripción<textarea id="t-descripcion" class="input" rows="2" maxlength="300" placeholder="¿Qué vas a aprender aquí?"></textarea></label>' +
        '<div class="fld">Color</div>' +
        '<div class="color-row" id="t-colorrow">' +
          '<input type="color" id="t-color" value="#a34a1d">' + sw +
        '</div>' +
        '<label class="fld" style="margin-top:12px">Categoría<input id="t-categoria" class="input" list="dl-cats" placeholder="general"><datalist id="dl-cats"></datalist>' +
          '<div class="hint">Se normaliza a minúsculas y sin acentos. Ojo: «ciencias» bloquea «ciencias naturales» por ser demasiado parecidas.</div>' +
        '</label>' +
        '<div class="err-line" id="t-err"></div>' +
      '</div>' +
      '<div class="dlg-actions">' +
        '<button class="btn" id="t-cancel" type="button">Cancelar</button>' +
        '<span class="flex1"></span>' +
        '<button class="btn primary" id="t-save" type="button">Crear tema</button>' +
      '</div>' +
    '</dialog>' +
    '<dialog id="dlg-icons">' +
      '<div class="dlg-body">' +
        '<h3>Elegir icono</h3>' +
        '<input id="ic-search" class="input" type="search" placeholder="Buscar icono… casa, código, libro, flecha…">' +
        '<div class="grid-icons" id="ic-grid"></div>' +
        '<div class="hint" id="ic-more" style="margin-top:8px"></div>' +
      '</div>' +
      '<div class="dlg-actions"><span class="flex1"></span>' +
        '<button class="btn" id="ic-close" type="button">Cerrar</button>' +
      '</div>' +
    '</dialog>' +
    '<dialog id="dlg-cats">' +
      '<div class="dlg-body">' +
        '<h3>Categorías</h3>' +
        '<p class="hint" style="margin-bottom:12px">Renombra una categoría y el cambio se propagará a todos sus temas.</p>' +
        '<div id="cats-list"></div>' +
        '<div class="err-line" id="cats-err"></div>' +
      '</div>' +
      '<div class="dlg-actions"><span class="flex1"></span>' +
        '<button class="btn" id="cats-cancel" type="button">Cancelar</button>' +
        '<button class="btn primary" id="cats-save" type="button">Guardar cambios</button>' +
      '</div>' +
    '</dialog>';
  }

  /* ═══ Eventos ═══ */
  function bind(root){
    var search = AI.$('#i-search', root);
    if (search) search.addEventListener('input', AI.debounce(function(){
      S.q = search.value;
      paintContent();
    }, 160));

    var vC = AI.$('#i-v-cards', root), vL = AI.$('#i-v-list', root);
    function setView(v){
      S.view = v;
      try{ localStorage.setItem(VIEW_KEY, v); }catch(e){}
      vC.classList.toggle('on', v === 'cards');
      vL.classList.toggle('on', v === 'list');
      paintContent();
    }
    if (vC) vC.addEventListener('click', function(){ setView('cards'); });
    if (vL) vL.addEventListener('click', function(){ setView('list'); });
    if (vC) vC.classList.toggle('on', S.view === 'cards');
    if (vL) vL.classList.toggle('on', S.view === 'list');

    var newBtn = AI.$('#i-new', root);
    if (newBtn) newBtn.addEventListener('click', function(){ openTemaDialog(null); });
    var catBtn = AI.$('#i-cats', root);
    if (catBtn) catBtn.addEventListener('click', openCatsDialog);

    var chips = AI.$('#i-chips', root);
    if (chips) chips.addEventListener('click', function(ev){
      var b = ev.target.closest('[data-cat]');
      if (!b) return;
      S.cat = (b.getAttribute('data-cat') === S.cat) ? '' : b.getAttribute('data-cat');
      paintChips();
      paintContent();
    });

    var content = AI.$('#i-content', root);
    if (content) content.addEventListener('click', function(ev){
      var act = ev.target.closest('[data-act]');
      if (act){
        var cardEl = act.closest('[data-mid]');
        var m = byId(cardEl ? cardEl.getAttribute('data-mid') : '');
        if (!m) return;
        var a = act.getAttribute('data-act');
        if (a === 'edit') openTemaDialog(m);
        else if (a === 'del') delTema(m);
        return;
      }
      var card = ev.target.closest('[data-href]');
      if (card) location.hash = card.getAttribute('data-href');
    });

    bindTemaDialog(root);
    bindIconsDialog(root);
    bindCatsDialog(root);
  }

  function byId(id){
    for (var i = 0; i < S.modulos.length; i++){
      if (String(S.modulos[i].id) === String(id)) return S.modulos[i];
    }
    return null;
  }

  /* ═══ Pintado ═══ */
  function paint(){
    paintChips();
    paintContent();
  }

  function paintChips(){
    var box = AI.$('#i-chips');
    if (!box) return;
    var cats = catsOf(S.modulos);
    var html = '<button class="chip' + (S.cat ? '' : ' on') + '" data-cat="">Todas <b>· ' + S.modulos.length + '</b></button>';
    cats.forEach(function(c){
      html += '<button class="chip' + (S.cat === c.name ? ' on' : '') + '" data-cat="' + AI.esc(c.name) + '">' +
        AI.esc(c.name) + ' <b>· ' + c.count + '</b></button>';
    });
    box.innerHTML = html;
  }

  function filtered(){
    var q = AI.norm(S.q);
    var cat = S.cat;
    var list = S.modulos.filter(function(m){
      if (cat && catOf(m) !== cat) return false;
      if (!q) return true;
      var hay = AI.norm(m.nombre) + ' ' + AI.norm(m.descripcion) + ' ' + catOf(m);
      return hay.indexOf(q) >= 0;
    });
    list.sort(function(a, b){
      var d = AI.cmpEs(catOf(a), catOf(b));
      if (d !== 0) return d;
      return AI.cmpEs(a.nombre, b.nombre);
    });
    return list;
  }

  function cardHTML(m){
    var t = tabsOf(m);
    return '<article class="card" data-mid="' + AI.esc(m.id) + '" data-href="' + AI.esc(themeHref(m)) + '" style="--c:' + AI.esc(colorOf(m)) + '">' +
      '<div class="card-top">' +
        '<span class="card-ic">' + AI.iconHTML(m.icono) + '</span>' +
        '<span class="card-cat">' + AI.esc(catOf(m)) + '</span>' +
      '</div>' +
      '<h3 class="card-name">' + AI.esc(m.nombre || '(sin nombre)') + '</h3>' +
      '<p class="card-desc">' + AI.esc(m.descripcion || '') + '</p>' +
      '<div class="card-meta"><span class="dot"></span><span>' + t + (t === 1 ? ' tabla' : ' tablas') + '</span>' +
        '<span class="card-acts">' +
          '<button class="btn icon" data-act="edit" title="Editar tema"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.399 16.61a2 2 0 0 0-.5.9l-1.19 4.744a.5.5 0 0 0 .62.62l4.745-1.19a2 2 0 0 0 .9-.5Z"/></svg></button>' +
          '<button class="btn icon" data-act="del" title="Eliminar tema"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
        '</span>' +
      '</div>' +
    '</article>';
  }

  function rowHTML(m, n){
    var t = tabsOf(m);
    return '<div class="row-item" data-mid="' + AI.esc(m.id) + '" data-href="' + AI.esc(themeHref(m)) + '" style="--c:' + AI.esc(colorOf(m)) + '">' +
      '<span class="card-ic">' + AI.iconHTML(m.icono) + '</span>' +
      '<span class="row-num">' + n + '.</span>' +
      '<h3 class="card-name">' + AI.esc(m.nombre || '(sin nombre)') + '</h3>' +
      '<span class="card-desc">' + AI.esc(m.descripcion || '') + '</span>' +
      '<span class="card-cat">' + AI.esc(catOf(m)) + '</span>' +
      '<span class="card-meta"><span class="dot"></span><span>' + t + (t === 1 ? ' tabla' : ' tablas') + '</span></span>' +
      '<span class="card-acts">' +
        '<button class="btn icon" data-act="edit" title="Editar tema"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.399 16.61a2 2 0 0 0-.5.9l-1.19 4.744a.5.5 0 0 0 .62.62l4.745-1.19a2 2 0 0 0 .9-.5Z"/></svg></button>' +
        '<button class="btn icon" data-act="del" title="Eliminar tema"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
      '</span>' +
    '</div>';
  }

  function paintContent(){
    var box = AI.$('#i-content');
    if (!box) return;
    if (!AI.apiUrl()){ box.innerHTML = setupHTML(); bindSetup(box); return; }

    if (!S.modulos.length){
      box.innerHTML = '<div class="panel"><h3>Aún no hay temas</h3>' +
        '<p>Crea tu primer tema y tendrá su propia hoja en tu hoja de cálculo, con sus tablas y su teoría.</p>' +
        '<div class="acts"><button class="btn primary" id="i-empty-new">Crear el primer tema</button></div></div>';
      var b = AI.$('#i-empty-new', box);
      if (b) b.addEventListener('click', function(){ openTemaDialog(null); });
      return;
    }

    var list = filtered();
    if (!list.length){
      box.innerHTML = '<div class="panel"><h3>Sin resultados</h3><p>Ningún tema coincide con la búsqueda.</p></div>';
      return;
    }

    var html = '';
    if (!S.cat && !AI.norm(S.q)){
      /* Agrupado por categoría */
      var cur = null, n = 0;
      list.forEach(function(m){
        n++;
        var c = catOf(m);
        if (c !== cur){
          if (cur !== null) html += '</div>';
          html += '<div class="group-title">' + AI.esc(c) + '</div><div class="' + (S.view === 'cards' ? 'grid' : 'rows') + '">';
          cur = c;
        }
        html += S.view === 'cards' ? cardHTML(m) : rowHTML(m, n);
      });
      html += '</div>';
    } else {
      html = '<div class="' + (S.view === 'cards' ? 'grid' : 'rows') + '">';
      var nn = 0;
      list.forEach(function(m){ nn++; html += S.view === 'cards' ? cardHTML(m) : rowHTML(m, nn); });
      html += '</div>';
    }
    box.innerHTML = html;
  }

  /* ═══ Carga desde el servidor ═══ */
  function load(){
    if (!AI.apiUrl()){
      var box = AI.$('#i-content');
      if (box){ box.innerHTML = setupHTML(); bindSetup(box); }
      AI.bootDone();
      return;
    }
    AI.syncing(true);
    AI.apiGet({ action: 'all' })
      .then(function(d){
        AI.syncing(false);
        var mods = Array.isArray(d.modulos) ? d.modulos : [];
        var rev = d.rev || 0;
        var changed = !S.ready || rev !== S.rev;
        S.modulos = mods;
        S.rev = rev;
        saveCache();
        if (!S.ready){
          paint();
          S.ready = true;
        } else if (changed && !AI.isEditing() && AI.opsPending() === 0){
          paint();
        }
      })
      .catch(function(err){
        AI.syncing(false);
        if (!S.ready) errorScreen(err);
        else AI.toast('Sin conexión · se muestra la última versión guardada', 'warn');
      })
      .then(function(){ AI.bootDone(); });
  }

  function refresh(){
    return AI.apiGet({ action: 'all' }).then(function(d){
      S.modulos = Array.isArray(d.modulos) ? d.modulos : [];
      S.rev = d.rev || 0;
      saveCache();
      paint();
    });
  }

  function setupHTML(){
    return '<div class="panel"><h3>Falta conectar tu hoja de cálculo</h3>' +
      '<p>Esta app usa un Google Apps Script como puente hacia tu Google Sheets. Pon la URL de tu Web App (termina en <code>/exec</code>) en el archivo <code>config.js</code>, o pégala aquí para este dispositivo:</p>' +
      '<input id="s-url" class="input" placeholder="https://script.google.com/macros/s/…/exec">' +
      '<div class="acts"><button class="btn primary" id="s-save">Guardar y conectar</button></div>' +
      '<p style="margin-top:14px">Para GitHub: guarda esa URL en los Secrets del repositorio (ver <code>.env.ejemplo</code> y <code>README.md</code>).</p></div>';
  }
  function bindSetup(box){
    var b = AI.$('#s-save', box);
    if (b) b.addEventListener('click', function(){
      var inp = AI.$('#s-url', box);
      var v = inp ? inp.value.trim() : '';
      if (!/^https?:\/\/.+/i.test(v)){ AI.toast('Esa URL no parece válida', 'err'); return; }
      AI.saveApiUrl(v);
      AI.toast('Conexión guardada en este dispositivo', 'ok');
      S.ready = false;
      var p = AI.$('#i-content');
      if (p) p.innerHTML = '<div class="panel"><h3>Cargando…</h3><p>Conectando con tu hoja de cálculo.</p></div>';
      load();
    });
  }

  function errorScreen(err){
    var msg = (err && err.message === 'sin-url') ? 'No hay URL de conexión configurada.'
      : 'No se pudo conectar: ' + ((err && err.message) || 'error de red') + '.';
    var box = AI.$('#i-content');
    if (!box) return;
    box.innerHTML = '<div class="panel"><h3>No se pudo cargar</h3><p>' + AI.esc(msg) + '</p>' +
      '<p>Si el problema persiste, revisa que el Apps Script esté desplegado como Web App con acceso «Cualquiera» y vuelve a desplegarlo con <b>Editar → Nueva versión</b>.</p>' +
      '<div class="acts"><button class="btn primary" id="i-retry">Reintentar</button></div></div>';
    var r = AI.$('#i-retry', box);
    if (r) r.addEventListener('click', function(){
      var p = AI.$('#i-content');
      if (p) p.innerHTML = '<div class="panel"><h3>Cargando…</h3><p>Conectando con tu hoja de cálculo.</p></div>';
      load();
    });
  }

  /* ═══ Diálogo crear/editar tema ═══ */
  function bindTemaDialog(root){
    var dlg = AI.$('#dlg-tema', root);
    if (!dlg) return;

    var icono = AI.$('#t-icono', dlg);
    var prev = AI.$('#t-icprev', dlg);
    function updPrev(){
      if (prev) prev.innerHTML = AI.iconHTML(icono ? icono.value : '');
    }
    if (icono) icono.addEventListener('input', updPrev);

    var colorIn = AI.$('#t-color', dlg);
    var row = AI.$('#t-colorrow', dlg);
    function updSwatches(){
      if (!row) return;
      AI.$$('.swatch', row).forEach(function(s){
        s.classList.toggle('on', s.getAttribute('data-color') === (colorIn ? colorIn.value : ''));
      });
    }
    if (colorIn) colorIn.addEventListener('input', updSwatches);
    if (row) row.addEventListener('click', function(ev){
      var s = ev.target.closest('.swatch');
      if (!s) return;
      if (colorIn) colorIn.value = s.getAttribute('data-color');
      updSwatches();
    });

    var pick = AI.$('#t-pick', dlg);
    if (pick) pick.addEventListener('click', function(){ openIconsDialog(); });

    var cancel = AI.$('#t-cancel', dlg);
    if (cancel) cancel.addEventListener('click', function(){ if (dlg.open) dlg.close(); });

    var save = AI.$('#t-save', dlg);
    if (save) save.addEventListener('click', saveTemaForm);

    dlg.addEventListener('cancel', function(ev){ ev.preventDefault(); dlg.close(); });
  }

  function openTemaDialog(m){
    var dlg = AI.$('#dlg-tema');
    if (!dlg) return;
    S.editingId = m ? String(m.id) : null;
    var title = AI.$('#dlg-tema-title', dlg);
    var saveBtn = AI.$('#t-save', dlg);
    if (title) title.textContent = m ? 'Editar tema' : 'Nuevo tema';
    if (saveBtn) saveBtn.textContent = m ? 'Guardar cambios' : 'Crear tema';
    var f = {
      nombre: AI.$('#t-nombre', dlg), icono: AI.$('#t-icono', dlg),
      desc: AI.$('#t-descripcion', dlg), color: AI.$('#t-color', dlg),
      cat: AI.$('#t-categoria', dlg), err: AI.$('#t-err', dlg)
    };
    if (f.nombre) f.nombre.value = m ? (m.nombre || '') : '';
    if (f.icono) f.icono.value = m ? (m.icono || '') : '';
    if (f.desc) f.desc.value = m ? (m.descripcion || '') : '';
    if (f.color) f.color.value = m ? colorOf(m) : '#a34a1d';
    if (f.cat) f.cat.value = m ? (m.categoria || '') : '';
    if (f.err) f.err.textContent = '';
    var prev = AI.$('#t-icprev', dlg);
    if (prev) prev.innerHTML = AI.iconHTML(f.icono ? f.icono.value : '');
    AI.$$('.swatch', dlg).forEach(function(s){
      s.classList.toggle('on', s.getAttribute('data-color') === (f.color ? f.color.value : ''));
    });
    var dl = AI.$('#dl-cats', dlg);
    if (dl) dl.innerHTML = catsOf(S.modulos).map(function(c){
      return '<option value="' + AI.esc(c.name) + '">';
    }).join('');
    dlg.showModal();
    if (f.nombre) f.nombre.focus();
  }

  function readTemaForm(dlg){
    var err = AI.$('#t-err', dlg);
    function fail(msg){
      if (err) err.textContent = msg;
      return null;
    }
    var nombre = (AI.$('#t-nombre', dlg) || {}).value || '';
    nombre = nombre.trim();
    if (!nombre) return fail('El nombre del tema es obligatorio.');
    var icono = ((AI.$('#t-icono', dlg) || {}).value || '').trim() || 'sparkles';
    var descripcion = ((AI.$('#t-descripcion', dlg) || {}).value || '').trim();
    var color = ((AI.$('#t-color', dlg) || {}).value || '#a34a1d');
    var categoria = AI.norm((AI.$('#t-categoria', dlg) || {}).value || '') || CAT_DFL;
    var cErr = catError(categoria);
    if (cErr) return fail(cErr);
    if (err) err.textContent = '';
    return { nombre: nombre, icono: icono, descripcion: descripcion, color: color, categoria: categoria };
  }

  function saveTemaForm(){
    var dlg = AI.$('#dlg-tema');
    if (!dlg || !dlg.open) return;
    var data = readTemaForm(dlg);
    if (!data) return;

    if (S.editingId){
      var m = byId(S.editingId);
      if (!m) return;
      var snap = JSON.stringify(m);
      m.nombre = data.nombre; m.icono = data.icono; m.descripcion = data.descripcion;
      m.color = data.color; m.categoria = data.categoria;
      dlg.close();
      paint();
      saveCache();
      AI.opStart('tema-update');
      AI.apiPost('module.update', { id: m.id, nombre: data.nombre, icono: data.icono,
        descripcion: data.descripcion, color: data.color, categoria: data.categoria })
        .then(function(resp){
          AI.opEnd('tema-update');
          if (resp && resp.rev) { S.rev = resp.rev; saveCache(); }
          AI.toast('Tema actualizado', 'ok');
        })
        .catch(function(err){
          AI.opEnd('tema-update');
          var i = S.modulos.indexOf(m);
          if (i >= 0){
            try{ S.modulos[i] = JSON.parse(snap); }catch(e){}
            paint();
          }
          AI.toast('No se pudo guardar el cambio: ' + err.message, 'err');
        });
    } else {
      AI.opStart('tema-create');
      AI.apiPost('module.create', data)
        .then(function(resp){
          AI.opEnd('tema-create');
          if (resp && resp.rev) S.rev = resp.rev;
          var m2 = resp && resp.modulo && typeof resp.modulo === 'object' ? resp.modulo : null;
          if (m2 && m2.sheet){
            S.modulos.push(m2);
            saveCache();
            dlg.close();
            paint();
            AI.toast('Tema creado · ya tiene su propia hoja', 'ok');
          } else {
            /* El backend no devolvió el módulo completo: reconciliar */
            dlg.close();
            paint();
            return refresh().then(function(){ AI.toast('Tema creado', 'ok'); });
          }
        })
        .catch(function(err){
          AI.opEnd('tema-create');
          AI.toast('No se pudo crear el tema: ' + err.message, 'err');
        });
    }
  }

  function delTema(m){
    var nombre = m.nombre || 'este tema';
    AI.confirmDlg('Eliminar tema',
      'Se eliminará «' + nombre + '» junto con su hoja de cálculo y TODAS sus tablas. Esta acción no se puede deshacer.',
      'Eliminar').then(function(ok){
        if (!ok) return;
        var idx = S.modulos.indexOf(m);
        var snap = JSON.stringify(m);
        S.modulos.splice(idx, 1);
        AI.cacheDel('ai_sheet_v1_' + sheetOf(m));
        saveCache();
        paint();
        AI.opStart('tema-delete');
        AI.apiPost('module.delete', { id: m.id })
          .then(function(resp){
            AI.opEnd('tema-delete');
            if (resp && resp.rev){ S.rev = resp.rev; saveCache(); }
            AI.toast('Tema eliminado', 'ok');
          })
          .catch(function(err){
            AI.opEnd('tema-delete');
            S.modulos.splice(idx, 0, JSON.parse(snap));
            saveCache();
            paint();
            AI.toast('No se pudo eliminar: ' + err.message, 'err');
          });
      });
  }

  /* ═══ Selector de iconos ═══ */
  var POPULAR = ['book-open','code','file-code','database','server','cloud','globe','terminal','cpu','bot',
    'brain','atom','flask-conical','calculator','shapes','leaf','sprout','tree-pine','paw-print','rocket',
    'orbit','moon','sun','lightbulb','palette','music','camera','image','video','film','mic','headphones',
    'gamepad','puzzle','gift','star','heart','flag','map','compass','plane','car','bike','train','ship',
    'house','building','briefcase','banknote','coins','wallet','credit-card','shopping-cart','store',
    'utensils','coffee','dumbbell','trophy','award','users','user','message-square','mail','phone',
    'smartphone','monitor','laptop','keyboard','printer','clock','calendar','history','search','settings',
    'wrench','key','lock','shield','eye','bell','bookmark','folder','file-text','download','upload',
    'share','link','wifi','infinity','graduation-cap','school','presentation','languages','scroll-text',
    'library','notebook-pen','pencil','pen-tool','clipboard-list','list-checks','chart-bar','trending-up',
    'target','zap','flame','droplets','wind','activity','microscope','telescope','scale','landmark'];
  var searchIndex = null;
  function buildIndex(){
    searchIndex = [];
    var ICONS = window.AI_ICONS || {};
    var ES = window.AI_ICON_ES || {};
    Object.keys(ICONS).forEach(function(n){
      var hay = n + ' ' + n.replace(/-/g, ' ');
      var es = ES[n];
      if (es && es.length) hay += ' ' + es.join(' ');
      searchIndex.push({ n: n, s: hay });
    });
  }
  function iconSearch(q, limit){
    if (!window.AI_ICONS) return [];
    if (!searchIndex) buildIndex();
    var nq = AI.norm(q);
    if (!nq){
      var pop = [];
      for (var i = 0; i < POPULAR.length; i++){
        if (Object.prototype.hasOwnProperty.call(window.AI_ICONS, POPULAR[i])) pop.push(POPULAR[i]);
      }
      return pop;
    }
    var hits = [];
    for (var j = 0; j < searchIndex.length && hits.length < limit; j++){
      if (searchIndex[j].s.indexOf(nq) >= 0) hits.push(searchIndex[j].n);
    }
    return hits;
  }
  var ICON_LIMIT = 150;
  function openIconsDialog(){
    var dlg = AI.$('#dlg-icons');
    if (!dlg) return;
    paintIcons('');
    dlg.showModal();
    var s = AI.$('#ic-search', dlg);
    if (s) s.focus();
  }
  function paintIcons(q){
    var grid = AI.$('#ic-grid'), more = AI.$('#ic-more');
    if (!grid) return;
    var names = iconSearch(q, ICON_LIMIT);
    grid.innerHTML = names.map(function(n){
      return '<button type="button" data-icon="' + AI.esc(n) + '" title="' + AI.esc(n) + '">' +
        AI.iconHTML(n) + '</button>';
    }).join('');
    if (more){
      var total = searchIndex ? searchIndex.length : 0;
      more.textContent = names.length
        ? (names.length >= ICON_LIMIT && q ? 'Mostrando los primeros ' + ICON_LIMIT + ' de más de ' + total + ' iconos · sigue escribiendo para filtrar' : '')
        : 'Sin resultados. También puedes escribir un emoji o pegar una URL directamente en el campo Icono.';
    }
  }
  function bindIconsDialog(root){
    var dlg = AI.$('#dlg-icons', root);
    if (!dlg) return;
    var search = AI.$('#ic-search', dlg);
    if (search) search.addEventListener('input', AI.debounce(function(){
      paintIcons(search.value);
    }, 120));
    var grid = AI.$('#ic-grid', dlg);
    if (grid) grid.addEventListener('click', function(ev){
      var b = ev.target.closest('[data-icon]');
      if (!b) return;
      var inp = AI.$('#t-icono');
      if (inp){
        inp.value = b.getAttribute('data-icon');
        var prev = AI.$('#t-icprev');
        if (prev) prev.innerHTML = AI.iconHTML(inp.value);
      }
      if (dlg.open) dlg.close();
    });
    var close = AI.$('#ic-close', dlg);
    if (close) close.addEventListener('click', function(){ if (dlg.open) dlg.close(); });
    dlg.addEventListener('cancel', function(ev){ ev.preventDefault(); dlg.close(); });
  }

  /* ═══ Renombrar categorías ═══ */
  function openCatsDialog(){
    var dlg = AI.$('#dlg-cats');
    if (!dlg) return;
    var list = AI.$('#cats-list', dlg);
    var err = AI.$('#cats-err', dlg);
    if (err) err.textContent = '';
    var cats = catsOf(S.modulos);
    if (list){
      list.innerHTML = cats.length ? cats.map(function(c){
        return '<div class="cats-row">' +
          '<div class="old" title="' + AI.esc(c.name) + '">' + AI.esc(c.name) + ' <b>· ' + c.count + '</b></div>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px;flex:none;color:var(--muted)"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>' +
          '<input class="input" data-old="' + AI.esc(c.name) + '" value="' + AI.esc(c.name) + '" placeholder="nuevo nombre">' +
        '</div>';
      }).join('') : '<p class="hint">Aún no hay categorías. Se crean al añadir temas.</p>';
    }
    dlg.showModal();
  }
  function bindCatsDialog(root){
    var dlg = AI.$('#dlg-cats', root);
    if (!dlg) return;
    var cancel = AI.$('#cats-cancel', dlg);
    if (cancel) cancel.addEventListener('click', function(){ if (dlg.open) dlg.close(); });
    var save = AI.$('#cats-save', dlg);
    if (save) save.addEventListener('click', saveCats);
    dlg.addEventListener('cancel', function(ev){ ev.preventDefault(); dlg.close(); });
  }
  function saveCats(){
    var dlg = AI.$('#dlg-cats');
    if (!dlg || !dlg.open) return;
    var err = AI.$('#cats-err', dlg);
    var inputs = AI.$$('input[data-old]', dlg);
    var changes = [];
    for (var i = 0; i < inputs.length; i++){
      var oldC = inputs[i].getAttribute('data-old');
      var newC = AI.norm(inputs[i].value);
      if (!newC || newC === oldC) continue;
      changes.push({ old: oldC, new: newC });
    }
    /* Validación: sin conflictos de prefijo ni duplicados entre los nuevos */
    var targets = {};
    for (var c = 0; c < changes.length; c++){
      var nn = changes[c].new;
      if (targets[nn]){ if (err) err.textContent = 'Dos categorías quedarían con el mismo nombre: «' + nn + '».'; return; }
      targets[nn] = true;
      var others = catsOf(S.modulos).map(function(x){ return x.name; }).filter(function(x){
        return x !== changes[c].old;
      });
      for (var k = 0; k < others.length; k++){
        var ex = others[k];
        var blockedByRename = changes.some(function(ch){ return ch.old === ex && ch.new === nn; });
        if (blockedByRename) continue;
        if (nn === ex) continue; /* fusionar en la existente está permitido */
        if (nn.indexOf(ex) === 0 || ex.indexOf(nn) === 0){
          if (err) err.textContent = '«' + nn + '» es muy parecida a «' + ex + '». Elige otro nombre.';
          return;
        }
      }
    }
    if (!changes.length){ dlg.close(); return; }
    if (err) err.textContent = '';

    var dlgEl = dlg;
    function applyLocal(list){
      list.forEach(function(ch){
        S.modulos.forEach(function(m){
          if (catOf(m) === ch.old) m.categoria = ch.new;
        });
      });
      saveCache();
      paintChips();
      paintContent();
    }
    function postChain(i){
      if (i >= changes.length){
        AI.opEnd('cats-rename');
        if (dlgEl.open) dlgEl.close();
        AI.toast('Categorías actualizadas', 'ok');
        return;
      }
      var ch = changes[i];
      AI.apiPost('category.rename', { old: ch.old, new: ch.new })
        .then(function(resp){
          if (resp && resp.rev) S.rev = resp.rev;
          postChain(i + 1);
        })
        .catch(function(e){
          AI.opEnd('cats-rename');
          if (dlgEl.open) dlgEl.close();
          AI.toast('Error renombrando «' + ch.old + '»: ' + e.message, 'err');
          refresh(); /* reconciliar con el servidor */
        });
    }
    AI.opStart('cats-rename');
    applyLocal(changes);
    postChain(0);
  }

  return { render: render };
})();
