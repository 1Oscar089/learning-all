/* =========================================================
   Tablas de Aprendizaje — Lógica Avanzada Completa (Responsiva + Reorden)
   ========================================================= */
let state = {
  themes: [],
  currentTheme: null,
  tables: [],
  demoMode: !CONFIG.APPS_SCRIPT_URL,
  lastFocusedInput: null,
  savedRowsStatus: {}, // Guarda el estado bloqueado/desbloqueado: { "tableId_rowIndex": true/false }
  currentVKLayout: 'japanese_hiragana',
  vkSearchQuery: ''
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showLoading(show) { $("#loading").hidden = !show; }

function toast(msg, type = "info") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast " + type;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 2500);
}

function openModal(id) { $("#" + id).hidden = false; }
function closeModal(id) { $("#" + id).hidden = true; }

function confirmAction(title, message, onAccept) {
  $("#confirmTitle").textContent = title;
  $("#confirmMessage").textContent = message;
  const btn = $("#confirmAccept");
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.addEventListener("click", () => { closeModal("modalConfirm"); onAccept(); });
  openModal("modalConfirm");
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* API Engine */
async function apiCall(action, payload = {}, method = "POST") {
  if (state.demoMode) return demoCall(action, payload);
  let url = CONFIG.APPS_SCRIPT_URL;
  const dataPayload = { action, token: CONFIG.TOKEN, ...payload };
  const options = { method, headers: { "Content-Type": "text/plain;charset=utf-8" } };
  
  if (method === "GET") {
    const params = new URLSearchParams(dataPayload).toString();
    url += `?${params}`;
  } else {
    options.body = JSON.stringify(dataPayload);
  }

  const res = await fetch(url, options);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Error desconocido");
  return data;
}

/* LocalStorage Fallback for Demo Mode */
async function demoCall(action, payload) {
  await new Promise((r) => setTimeout(r, 150));
  const db = JSON.parse(localStorage.getItem("studyTablesDemo") || "{}");
  db.themes = db.themes || []; db.tables = db.tables || {};
  const save = (d) => localStorage.setItem("studyTablesDemo", JSON.stringify(d));
  const findTable = (d, thId, tbId) => (d.tables[thId] || []).find((t) => t.id === tbId);

  switch (action) {
    case "listThemes": return { themes: db.themes };
    case "createTheme":
      const t = { id: "th_" + Date.now(), name: payload.name, emoji: payload.emoji || "📖" };
      db.themes.push(t); db.tables[t.id] = []; save(db); return { theme: t };
    case "deleteTheme":
      db.themes = db.themes.filter((th) => th.id !== payload.themeId);
      delete db.tables[payload.themeId]; save(db); return {};
    case "listTables": return { tables: db.tables[payload.themeId] || [] };
    case "createTable":
      const tbl = { id: "tb_" + Date.now(), title: payload.title, headers: payload.headers, rows: [] };
      db.tables[payload.themeId] = db.tables[payload.themeId] || [];
      db.tables[payload.themeId].push(tbl); save(db); return { table: tbl };
    case "deleteTable":
      db.tables[payload.themeId] = (db.tables[payload.themeId] || []).filter((tb) => tb.id !== payload.tableId);
      save(db); return {};
    case "updateCell":
      const tb1 = findTable(db, payload.themeId, payload.tableId);
      if (!tb1.rows[payload.rowIndex]) tb1.rows[payload.rowIndex] = [];
      tb1.rows[payload.rowIndex][payload.colIndex] = payload.value; save(db); return {};
    case "addRow":
      const tb2 = findTable(db, payload.themeId, payload.tableId);
      tb2.rows.push(new Array(tb2.headers.length).fill("")); save(db); return {};
    case "deleteRow":
      const tb3 = findTable(db, payload.themeId, payload.tableId);
      tb3.rows.splice(payload.rowIndex, 1); save(db); return {};
    case "moveRow":
      const tbMove = findTable(db, payload.themeId, payload.tableId);
      const rowToMove = tbMove.rows.splice(payload.rowIndex, 1)[0];
      tbMove.rows.splice(payload.newIndex, 0, rowToMove);
      save(db); return {};
    case "renameColumn":
      const tb4 = findTable(db, payload.themeId, payload.tableId);
      tb4.headers[payload.colIndex] = payload.name; save(db); return {};
    case "addColumn":
      const tb5 = findTable(db, payload.themeId, payload.tableId);
      tb5.headers.push(payload.name || "Nueva");
      tb5.rows.forEach(r => r.push("")); save(db); return {};
    case "deleteColumn":
      const tb6 = findTable(db, payload.themeId, payload.tableId);
      tb6.headers.splice(payload.colIndex, 1);
      tb6.rows.forEach(r => r.splice(payload.colIndex, 1)); save(db); return {};
  }
}

/* Temas core */
async function loadThemes() {
  showLoading(true);
  try {
    const data = await apiCall("listThemes", {}, "GET");
    state.themes = data.themes || [];
    renderThemes();
  } catch (e) { toast("Error: " + e.message, "error"); } 
  finally { showLoading(false); }
}

function renderThemes() {
  const grid = $("#themesGrid");
  const empty = $("#emptyState");
  if (state.themes.length === 0) {
    empty.style.display = "block"; grid.innerHTML = ""; return;
  }
  empty.style.display = "none";
  grid.innerHTML = [...state.themes]
    .sort((a,b) => a.name.localeCompare(b.name, "es", {sensitivity:"base"}))
    .map(t => `
      <div class="theme-card" onclick="openTheme('${t.id}','${escapeHtml(t.name)}','${escapeHtml(t.emoji)}')">
        <button class="delete-btn" title="Eliminar Tema" onclick="event.stopPropagation(); deleteTheme('${t.id}','${escapeHtml(t.name)}')"><span class="material-icons-round">delete</span></button>
        <div class="emoji">${escapeHtml(t.emoji || "📖")}</div>
        <div class="name">${escapeHtml(t.name)}</div>
      </div>
    `).join("");
}

async function openTheme(id, name, emoji) {
  state.currentTheme = { id, name, emoji };
  $("#themeName").textContent = name;
  $("#themeEmoji").textContent = emoji || "📖";
  $("#viewThemes").classList.remove("active");
  $("#viewTheme").classList.add("active");
  await loadTables();
}

function showThemes() {
  $("#viewTheme").classList.remove("active");
  $("#viewThemes").classList.add("active");
  state.currentTheme = null;
}

/* Tablas core */
async function loadTables() {
  if (!state.currentTheme) return;
  showLoading(true);
  try {
    const data = await apiCall("listTables", { themeId: state.currentTheme.id }, "GET");
    state.tables = data.tables || [];
    renderTables();
  } catch (e) { toast("Error: " + e.message, "error"); } 
  finally { showLoading(false); }
}

function renderTables() {
  const container = $("#tablesContainer");
  if (state.tables.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:2.5rem 1rem;"><h2>No hay tablas en este tema</h2><p>Crea una tabla con las columnas que necesites.</p></div>`;
    return;
  }
  container.innerHTML = [...state.tables]
    .sort((a,b) => a.title.localeCompare(b.title, "es", {sensitivity:"base"}))
    .map(renderTableCard).join("");
  attachCellListeners();
}

function renderTableCard(t) {
  const headers = t.headers || [];
  const rows = t.rows || [];
  
  // 1. GENERACIÓN DE ENCABEZADOS (Muestra los nombres reales de las columnas)
  // 1. GENERACIÓN DE ENCABEZADOS (Protegiendo la primera columna)
  const headersHtml = headers.map((h, i) => `
    <th>
      <div class="col-head">
        <span class="col-name" contenteditable="true" 
          onblur="renameColumn('${t.id}', ${i}, this.textContent)"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtml(h)}</span>
        
        ${i > 0 ? `
        <span class="col-actions">
          <button class="del material-icons-round" title="Eliminar columna" onclick="askDeleteColumn('${t.id}', ${i}, '${escapeHtml(h)}')">delete_outline</button>
        </span>
        ` : ''}

      </div>
    </th>
  `).join("") + `<th style="width:140px; text-align:center;">Acción</th>`;

  // 2. GENERACIÓN DE FILAS
  const bodyRows = rows.map((row, rIdx) => {
    const rowKey = `${t.id}_${rIdx}`;
    if (state.savedRowsStatus[rowKey] === undefined) {
      const hasContent = row.some(c => c && c.trim() !== "");
      state.savedRowsStatus[rowKey] = hasContent; 
    }
    const isSaved = state.savedRowsStatus[rowKey];

    const cellsHtml = headers.map((_, cIdx) => `
      <td>
        <textarea class="cell-input track-focus" rows="1" 
          data-tbl="${t.id}" data-row="${rIdx}" data-col="${cIdx}" 
          oninput="autoGrow(this)" ${isSaved ? 'disabled' : ''}>${escapeHtml(row[cIdx] || "")}</textarea>
      </td>
    `).join("");

    const actionButton = isSaved 
      ? `<button class="row-action-btn btn-row-edit material-icons-round" title="Editar Fila" onclick="toggleRowEdit('${t.id}', ${rIdx}, false)">edit</button>`
      : `<button class="row-action-btn btn-row-save material-icons-round" title="Guardar Fila" onclick="toggleRowEdit('${t.id}', ${rIdx}, true)">save</button>`;

    const isFirst = rIdx === 0;
    const isLast = rIdx === rows.length - 1;

    return `
      <tr class="${isSaved ? 'row-saved' : 'row-editing'}" data-row-index="${rIdx}">
        ${cellsHtml}
        <td class="row-actions-td">
          <div class="action-buttons-container">
            <button class="row-action-btn material-icons-round" title="Mover Arriba" onclick="moveRow('${t.id}', ${rIdx}, -1)" ${isFirst ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>arrow_upward</button>
            <button class="row-action-btn material-icons-round" title="Mover Abajo" onclick="moveRow('${t.id}', ${rIdx}, 1)" ${isLast ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>arrow_downward</button>
            ${actionButton}
            <button class="row-action-btn btn-row-delete material-icons-round" title="Eliminar fila" onclick="deleteRow('${t.id}', ${rIdx})">delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // 3. ESTRUCTURA FINAL (Aquí es donde va el título editable correctamente)
  return `
    <div class="table-card" data-tbl="${t.id}">
      <div class="table-card-head">
        <div class="title" style="cursor:pointer;" onclick="renameTablePrompt('${t.id}', '${escapeHtml(t.title)}')">
          <span class="material-icons-round" style="color:var(--primary)">table_chart</span> 
          ${escapeHtml(t.title)}
          <span class="material-icons-round" style="font-size: 1rem; color: var(--text-muted); margin-left: 5px;" title="Editar Título">edit</span>
        </div>
        <div class="table-card-actions">
          <button class="btn btn-ghost btn-sm" onclick="appendColumn('${t.id}')"><span class="material-icons-round">view_column</span> + Columna</button>
          <button class="btn btn-ghost btn-sm" onclick="addRow('${t.id}')"><span class="material-icons-round">table_rows</span> + Fila de Datos</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteTable('${t.id}', '${escapeHtml(t.title)}')"><span class="material-icons-round">delete_forever</span> Borrar Tabla</button>
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>${headersHtml}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      <div class="table-footer">
        <span>Estadísticas: ${rows.length} filas creadas • ${headers.length} columnas</span>
      </div>
    </div>
  `;
}

function autoGrow(el) { 
  el.style.height = "auto"; 
  el.style.height = el.scrollHeight + "px"; 
}

function attachCellListeners() {
  $$(".cell-input").forEach(el => {
    autoGrow(el);
    el.addEventListener("blur", async () => {
      if (!el.disabled) {
        const { tbl, row, col } = el.dataset;
        await updateCell(tbl, +row, +col, el.value);
      }
    });
    el.addEventListener("focus", () => {
      if(!el.disabled) state.lastFocusedInput = el;
    });
  });
}

/* Guardar / Editar Filas de manera explícita */
async function toggleRowEdit(tableId, rowIndex, shouldSave) {
  const rowKey = `${tableId}_${rowIndex}`;
  
  if (shouldSave) {
    showLoading(true);
    try {
      const inputs = Array.from($$(`.cell-input[data-tbl="${tableId}"][data-row="${rowIndex}"]`));
      for (let input of inputs) {
        const colIdx = +input.dataset.col;
        await updateCell(tableId, rowIndex, colIdx, input.value);
      }
      
      // NUEVO: Ordenar filas en el backend automáticamente tras guardar
      await apiCall("sortRows", { themeId: state.currentTheme.id, tableId });
      
      // NUEVO: Recargar las tablas para reflejar el nuevo orden alfabético
      await loadTables(); 
      
      toast("Fila guardada y tabla ordenada", "success");
    } catch(e) {
      toast("Error al guardar fila", "error");
    } finally {
      showLoading(false);
    }
  } else {
    state.savedRowsStatus[rowKey] = false;
    renderTables();
    setTimeout(() => {
      const dynamicInput = $(`.cell-input[data-tbl="${tableId}"][data-row="${rowIndex}"]`);
      if (dynamicInput) { dynamicInput.focus(); }
    }, 50);
  }
}
/* Mover filas arriba o abajo */
async function moveRow(tableId, rowIndex, direction) {
  const t = state.tables.find(x => x.id === tableId);
  if (!t) return;
  
  const newIndex = rowIndex + direction;
  if (newIndex < 0 || newIndex >= t.rows.length) return;

  showLoading(true);
  try {
    await apiCall("moveRow", { themeId: state.currentTheme.id, tableId, rowIndex, newIndex });

    // Intercambiar en el array local
    const tempRow = t.rows[rowIndex];
    t.rows[rowIndex] = t.rows[newIndex];
    t.rows[newIndex] = tempRow;

    // Intercambiar el estado de bloqueo
    const key1 = `${tableId}_${rowIndex}`;
    const key2 = `${tableId}_${newIndex}`;
    const tempStatus = state.savedRowsStatus[key1];
    state.savedRowsStatus[key1] = state.savedRowsStatus[key2];
    state.savedRowsStatus[key2] = tempStatus;

    // Ajustar los identificadores en el DOM (renderizado)
    renderTables();
  } catch(e) {
    toast("Error al mover la fila", "error");
  } finally {
    showLoading(false);
  }
}

/* Acciones Temas Modales */
function setupThemeModal() {
  $("#btnNewTheme").addEventListener("click", () => {
    $("#themeEmojiInput").value = ""; $("#themeNameInput").value = ""; openModal("modalTheme");
    setTimeout(() => $("#themeNameInput").focus(), 50);
  });
}
async function createTheme() {
  const name = $("#themeNameInput").value.trim();
  const emoji = $("#themeEmojiInput").value.trim() || "📖";
  if (!name) return toast("Escribe un nombre para el tema", "error");
  showLoading(true);
  try {
    const data = await apiCall("createTheme", { name, emoji });
    state.themes.push(data.theme); closeModal("modalTheme"); renderThemes(); toast("Tema creado con éxito", "success");
  } catch (e) { toast("Error: " + e.message, "error"); } finally { showLoading(false); }
}
function deleteTheme(id, name) {
  confirmAction("Eliminar tema permanente", `¿Deseas eliminar el tema "${name}"? Se borrarán todas las tablas asociadas en la nube.`, async () => {
    showLoading(true);
    try {
      await apiCall("deleteTheme", { themeId: id });
      state.themes = state.themes.filter(t => t.id !== id); renderThemes(); toast("Tema eliminado", "success");
    } catch(e){ toast("Error", "error"); } finally { showLoading(false); }
  });
}

/* Acciones Tablas Modales */
function setupTableModal() {
  $("#btnNewTable").addEventListener("click", () => {
    $("#tableTitleInput").value = ""; $("#tableColsInput").value = 3; renderHeaderInputs(3); openModal("modalTable");
  });
  $("#tableColsInput").addEventListener("input", (e) => {
    let val = parseInt(e.target.value) || 1;
    if(val < 1) val = 1; if(val > 10) val = 10;
    renderHeaderInputs(val);
  });
}
function renderHeaderInputs(n) {
  const existing = Array.from($$("#headersList input")).map(i => i.value);
  $("#headersList").innerHTML = Array.from({length:n}).map((_,i) => `
    <div class="header-input-row">
      <span class="idx">${i+1}:</span>
      <input type="text" placeholder="Ej: Encabezado ${i+1}" value="${escapeHtml(existing[i]||"")}" class="track-focus"/>
    </div>`).join("");
  $$("#headersList input.track-focus").forEach(el => el.addEventListener("focus", () => state.lastFocusedInput = el));
}

async function createTable() {
  const title = $("#tableTitleInput").value.trim();
  const headers = Array.from($$("#headersList input")).map(i => i.value.trim()).filter(h => h);
  if (!title || !headers.length) return toast("Falta rellenar el título o los encabezados", "error");
  showLoading(true);
  try {
    const data = await apiCall("createTable", { themeId: state.currentTheme.id, title, headers });
    state.tables.push(data.table); closeModal("modalTable"); renderTables(); toast("Tabla estructurada con éxito", "success");
  } catch(e){ toast("Error al crear tabla", "error"); } finally { showLoading(false); }
}
function deleteTable(id, title) {
  confirmAction("Eliminar Tabla", `¿Seguro que deseas eliminar la tabla "${title}" de manera permanente?`, async () => {
    showLoading(true);
    try {
      await apiCall("deleteTable", { themeId: state.currentTheme.id, tableId: id });
      state.tables = state.tables.filter(t => t.id !== id); renderTables(); toast("Tabla eliminada", "success");
    } catch(e){} finally { showLoading(false); }
  });
}

async function updateCell(tableId, row, col, value) {
  try {
    await apiCall("updateCell", { themeId: state.currentTheme.id, tableId, rowIndex: row, colIndex: col, value });
    const t = state.tables.find(x => x.id === tableId);
    if(t){ if(!t.rows[row]) t.rows[row]=[]; t.rows[row][col] = value; }
  } catch (e) { console.error(e); }
}

async function addRow(tableId) {
  showLoading(true);
  try {
    await apiCall("addRow", { themeId: state.currentTheme.id, tableId });
    const t = state.tables.find(x => x.id === tableId);
    if(t) {
      t.rows.push(new Array(t.headers.length).fill(""));
      const newRowIdx = t.rows.length - 1;
      state.savedRowsStatus[`${tableId}_${newRowIdx}`] = false;
    }
    renderTables();
    setTimeout(() => {
      const inputs = $$(`.cell-input[data-tbl="${tableId}"]`);
      if (inputs.length) inputs[inputs.length - t.headers.length].focus();
    }, 60);
  } catch(e){} finally { showLoading(false); }
}

async function deleteRow(tableId, rowIndex) {
  confirmAction("Eliminar Fila", "¿Eliminar este registro completo?", async () => {
    showLoading(true);
    try {
      await apiCall("deleteRow", { themeId: state.currentTheme.id, tableId, rowIndex });
      const t = state.tables.find(x => x.id === tableId);
      if(t) t.rows.splice(rowIndex, 1);
      
      const prefix = `${tableId}_`;
      const newStatus = {};
      Object.keys(state.savedRowsStatus).forEach(key => {
        if (key.startsWith(prefix)) {
          const idx = parseInt(key.split("_")[1]);
          if (idx < rowIndex) newStatus[key] = state.savedRowsStatus[key];
          else if (idx > rowIndex) newStatus[`${tableId}_${idx-1}`] = state.savedRowsStatus[key];
        } else {
          newStatus[key] = state.savedRowsStatus[key];
        }
      });
      state.savedRowsStatus = newStatus;
      renderTables();
      toast("Fila eliminada", "success");
    } catch(e){} finally { showLoading(false); }
  });
}

async function renameColumn(tableId, colIndex, newName) {
  const name = newName.trim(); if(!name) return renderTables();
  try {
    await apiCall("renameColumn", { themeId: state.currentTheme.id, tableId, colIndex, name });
    const t = state.tables.find(x => x.id === tableId);
    if(t) t.headers[colIndex] = name;
  } catch(e){}
}
async function appendColumn(tableId) {
  const t = state.tables.find(x => x.id === tableId);
  const name = prompt("Nombre de la nueva columna:", "Columna " + ((t?.headers.length||0)+1));
  if (!name || !name.trim()) return;
  showLoading(true);
  try {
    await apiCall("addColumn", { themeId: state.currentTheme.id, tableId, name: name.trim() });
    await loadTables();
  } catch(e){} finally { showLoading(false); }
}
function askDeleteColumn(tableId, colIndex, colName) {
  confirmAction("Eliminar columna", `¿Eliminar columna "${colName}"? Se perderán todos sus datos guardados en cada fila.`, async () => {
    showLoading(true);
    try {
      await apiCall("deleteColumn", { themeId: state.currentTheme.id, tableId, colIndex });
      await loadTables();
    } catch(e){} finally { showLoading(false); }
  });
}

/* =========================================================
   Banco de Datos del Teclado Internacional Multilenguaje
   ========================================================= */
const vkData = {
  japanese_hiragana: [
    ['あ','い','う','え','お','か','き','く','け','こ','さ','し','す','せ','そ'],
    ['た','ち','つ','て','と','な','に','ぬ','ね','の','⾘','ひ','ふ','へ','ほ'],
    ['ま','み','む','め','も','や','ゆ','よ','ら','り','る','れ','ろ','わ','を','ん'],
    ['が','ぎ','ぐ','げ','ご','ざ','じ','ず','ぜ','ぞ','だ','ぢ','づ','で','ど'],
    ['ば','び','ぶ','べ','ぼ','ぱ','ぴ','ぷ','ぺ','ぽ','っ','ゃ','ゅ','ょ','ー']
  ].flat(),
  japanese_katakana: [
    ['ア','イ','ウ','エ','オ','カ','キ','ク','ケ','コ','サ','シ','ス','セ','ソ'],
    ['タ','チ','ツ','テ','ト','ナ','ニ','ヌ','ネ','ノ','ハ','ヒ','フ','ヘ','ホ'],
    ['マ','ミ','ム','メ','モ','ヤ','ユ','ヨ','ラ','リ','ル','レ','ロ','ワ','ヲ','ン'],
    ['ガ','ギ','グ','ゲ','ゴ','ザ','ジ','ズ','ゼ','ぞ','ダ','ヂ','ヅ','デ','ド'],
    ['バ','ビ','ブ','ベ','ぼ','パ','ピ','プ','ペ','ポ','ッ','ャ','ュ','ョ','ヴ']
  ].flat(),
  chinese_common: [
    '一','二','三','四','五','六','七','八','九','十','百','千','万','人','子','女',
    '日','月','年','中','国','华','语','学','习','大','小','高','美','好','谢','欢',
    '迎','天','地','水','火','山','川','风','雨','客','家','看','听','写','说','读'
  ],
  korean_hangul: [
    'ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
    'ㄲ','ㄸ','ㅃ','ㅆ','ㅉ','ㄳ','ㄵ','ㄶ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅄ',
    'ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'
  ],
  arabic: [
    'أ','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي',
    'ء','آ','ى','ة','ـ','َ','ُ','ِ','ّ','ْ','ً','ٌ','ٍ','١','٢','٣','٤','٥','٦','٧','٨','٩','٠'
  ],
  greek: [
    'α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω',
    'Α','Β','Г','Δ','Ε','Ζ','Η','Θ','Ι','Κ','Λ','Μ','Ν','Ξ','Ο','Π','Ρ','Σ','Τ','Υ','Φ','Χ','Ψ','Ω'
  ],
  cyrillic: [
    'А','Б','В','Г','Д','Е','Ё','Ж','З','И','Й','К','Л','М','Н','О','П','Р','С','Т','У','Ф','Х','Ц','Ч','Ш','Щ','Ъ','Ы','Ь','Э','Ю','Я',
    'а','б','в','г','д','е','ё','ж','з','и','й','к','л','м','н','о','п','р','с','т','у','ф','х','ц','ч','ш','щ','ъ','ы','ь','э','ю','я'
  ],
  ipa: [
    'ə','æ','ʃ','ʒ','ʧ','ʤ','θ','ð','ŋ','j','w','ɪ','ʊ','ʌ','ɔ','ɑ','ɒ','ɜ','ɛ','ɡ','ɾ','ʔ','β','ç','ɟ','ɲ','卓越','ʎ','χ','ʁ','ħ','ʕ','ɦ',
    'ˈ','ˌ','ː','ˑ','▫','œ','ø','ɒ','产','ɯ','ɤ','ʌ','📍'
  ],
  math: [
    '∀','∃','∄','∅','∆','∇','∈','∉','∊','∋','∏','∑','−','∓','×','÷','⁄','∗','∘','∙','√','∛','∝','∞','∠','∧','∨','∩','∪','∫','∬','∭',
    '∴','∵','∶','∷','∼','≈','≃','≠','≡','≤','≥','⊂','⊃','⊆','⊇','⊕','⊗','⊥','⋅','π','θ','λ','μ','σ','Ω','τ','δ','ε','∂'
  ],
  accents: [
    'á','é','í','ó','ú','ñ','ü','ç','à','è','ì','ò','ù','â','ê','î','ô','û','ä','ë','ï','ö','ÿ','æ','œ','ß',
    'Á','É','Í','Ó','Ú','Ñ','Ü','Ç','À','È','Ì','Ò','Ù','Â','Ê','Î','Ô','Û','Ä','Ë','Ï','Ö','¿','¡'
  ]
};

const vkDescriptions = {
  'α': 'alfa alpha griego', 'β': 'beta griego', 'γ': 'gamma griego', 'δ': 'delta griego', 'ε': 'epsilon griego', 'π': 'pi314 matematica griego',
  'λ': 'lambda griego longitud', 'μ': 'mu micro griego', 'σ': 'sigma griego', 'Ω': 'omega griego ohmio', 'θ': 'theta zeta theta griego',
  '∑': 'sumatoria suma total matematica', '∏': 'productoria producto matematica', '∫': 'integral calculo matematica', '∞': 'infinito matematica',
  '≈': 'aproximado casi igual matematica', '≠': 'no es igual diferente distinto matematica', '≤': 'menor o igual matematica', '≥': 'mayor o igual matematica',
  '√': 'raiz cuadrada matematica', '±': 'mas menos matematica', '÷': 'division dividir matematica', '×': 'multiplicacion por matematica',
  'あ': 'a japanese hiragana japones', 'い': 'i japanese hiragana japones', 'う': 'u japanese hiragana japones', 'え': 'e japanese hiragana japones', 'お': 'o japanese hiragana japones',
  '一': 'uno 1 chino chinese', '二': 'dos 2 chino chinese', '三': 'tres 3 chino chinese', '人': 'persona humano chino chinese', '日': 'sol dia chino chinese', '月': 'luna mes chino chinese', '年': 'ano year chino chinese'
};

function toggleVirtualKeyboard() {
  const vk = $("#virtualKeyboard");
  vk.classList.toggle("hidden");
  if (!vk.classList.contains("hidden")) {
    renderVKLayout();
    $("#vkSearchInput").focus();
  }
}

function renderVKLayout() {
  const container = $("#vkKeysContainer");
  const layout = state.currentVKLayout;
  const search = state.vkSearchQuery.toLowerCase().trim();
  
  let chars = vkData[layout] || [];
  
  if (search) {
    chars = [];
    Object.keys(vkData).forEach(key => {
      vkData[key].forEach(char => {
        const desc = vkDescriptions[char] || '';
        if (char.toLowerCase().includes(search) || desc.includes(search)) {
          if (!chars.includes(char)) chars.push(char);
        }
      });
    });
  }

  if (chars.length === 0) {
    container.innerHTML = `<div class="vk-no-results">No se encontraron símbolos para "${escapeHtml(state.vkSearchQuery)}"</div>`;
    return;
  }

  container.innerHTML = chars.map(c => `<div class="vk-key" title="${escapeHtml(vkDescriptions[c] || 'Carácter')}" onclick="insertVKChar('${c}')">${c}</div>`).join("");
}

function insertVKChar(char) {
  const input = state.lastFocusedInput;
  if (!input) return toast("Por favor haz clic en una celda o campo de texto primero", "error");
  
  if (input.disabled) return toast("La fila seleccionada está bloqueada. Dale a 'Editar' primero.", "error");

  const start = input.selectionStart || 0;
  const end = input.selectionEnd || 0;
  const text = input.value || input.textContent || "";
  
  const newText = text.substring(0, start) + char + text.substring(end);
  
  if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
    input.value = newText;
    input.focus();
    const nextCursorPos = start + char.length;
    input.setSelectionRange(nextCursorPos, nextCursorPos);
    if(input.tagName === 'TEXTAREA') autoGrow(input);
  } else {
    input.textContent = newText;
  }
  
  if (input.dataset.tbl) {
    const { tbl, row, col } = input.dataset;
    const t = state.tables.find(x => x.id === tbl);
    if(t && t.rows[row]) t.rows[row][col] = input.value;
  }
}

/* Sistema Arrastrable (Draggable Widget) */
const setupDraggableKeyboard = () => {
  const el = $("#virtualKeyboard");
  const handle = $(".vk-header");
  let isDragging = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;
  
  handle.addEventListener("mousedown", dragStart);
  document.addEventListener("mouseup", dragEnd);
  document.addEventListener("mousemove", drag);
  
  handle.addEventListener("touchstart", (e) => dragStart(e.touches[0]), {passive: true});
  document.addEventListener("touchend", dragEnd);
  document.addEventListener("touchmove", (e) => drag(e.touches[0]));
  
  function dragStart(e) {
    if(e.target.closest('select') || e.target.closest('button') || e.target.closest('input')) return;
    initialX = e.clientX - xOffset; initialY = e.clientY - yOffset;
    isDragging = true;
  }
  function dragEnd() { isDragging = false; }
  function drag(e) {
    if (!isDragging) return;
    currentX = e.clientX - initialX; currentY = e.clientY - initialY;
    xOffset = currentX; yOffset = currentY;
    el.style.transform = `translate(${currentX}px, ${currentY}px)`;
  }
};

/* Document Ready initialization */
document.addEventListener("DOMContentLoaded", () => {
  setupThemeModal(); 
  setupTableModal();
  
  if (state.demoMode) {
    toast("Modo Offline Demo activado (datos en LocalStorage)", "info");
  }
  
  loadThemes();
  
  document.addEventListener("focusin", (e) => {
    if ((e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && !e.target.disabled) {
      state.lastFocusedInput = e.target;
    }
  });

  $("#btnToggleKeyboard").addEventListener("click", toggleVirtualKeyboard);
  $("#vkLayoutSelect").addEventListener("change", (e) => {
    state.currentVKLayout = e.target.value;
    renderVKLayout();
  });
  
  $("#vkSearchInput").addEventListener("input", (e) => {
    state.vkSearchQuery = e.target.value;
    renderVKLayout();
  });

  setupDraggableKeyboard();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $$(".modal-overlay").forEach((m) => (m.hidden = true));
    }
  });
});
/* =========================================================
   NUEVAS FUNCIONES DE EDICIÓN RÁPIDA (Temas y Tablas)
   ========================================================= */
async function editCurrentTheme() {
  const newName = prompt("Edita el nombre del tema:", state.currentTheme.name);
  if (!newName || newName.trim() === "") return;
  
  const newEmoji = prompt("Edita el emoji:", state.currentTheme.emoji);
  
  showLoading(true);
  try {
    await apiCall("editTheme", { 
      themeId: state.currentTheme.id, 
      name: newName.trim(), 
      emoji: newEmoji || "📖" 
    });
    
    // Actualizar estado local y UI
    state.currentTheme.name = newName.trim();
    state.currentTheme.emoji = newEmoji || "📖";
    $("#themeName").textContent = state.currentTheme.name;
    $("#themeEmoji").textContent = state.currentTheme.emoji;
    
    // Refrescar el listado general en background
    loadThemes(); 
    toast("Tema actualizado con éxito", "success");
  } catch(e) { 
    toast("Error al editar el tema: " + e.message, "error"); 
  } finally { 
    showLoading(false); 
  }
}

async function renameTablePrompt(tableId, currentTitle) {
  const newTitle = prompt("Nuevo título para la tabla:", currentTitle);
  if (!newTitle || newTitle.trim() === currentTitle) return;
  
  showLoading(true);
  try {
    await apiCall("renameTable", { 
      themeId: state.currentTheme.id, 
      tableId, 
      title: newTitle.trim() 
    });
    await loadTables();
    toast("Tabla renombrada", "success");
  } catch(e) { 
    toast("Error al renombrar: " + e.message, "error"); 
  } finally { 
    showLoading(false); 
  }
}