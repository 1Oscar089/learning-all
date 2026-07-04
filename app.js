/* =========================================================
   Tablas de Aprendizaje — Lógica Principal Mejorada
   ========================================================= */
let state = {
  themes: [],
  currentTheme: null,
  tables: [],
  demoMode: !CONFIG.APPS_SCRIPT_URL,
  lastFocusedInput: null // Para el teclado virtual
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
  t._timer = setTimeout(() => (t.hidden = true), 3000);
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

/* API Calls (Mismo que antes con fix de GET) */
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

async function demoCall(action, payload) {
  await new Promise((r) => setTimeout(r, 300));
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

/* UI Logic */
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
        <button class="delete-btn" title="Eliminar" onclick="event.stopPropagation(); deleteTheme('${t.id}','${escapeHtml(t.name)}')"><span class="material-icons-round">delete</span></button>
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
    container.innerHTML = `<div class="empty-state" style="padding:3rem 1rem;"><h2>Aún no hay tablas aquí</h2><p>Crea tu primera tabla para organizar tus datos.</p></div>`;
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
  const headersHtml = headers.map((h, i) => `
    <th>
      <div class="col-head">
        <span class="col-name" contenteditable="true" 
          onblur="renameColumn('${t.id}', ${i}, this.textContent)"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtml(h)}</span>
        <span class="col-actions">
          <button class="del material-icons-round" title="Eliminar columna" onclick="askDeleteColumn('${t.id}', ${i}, '${escapeHtml(h)}')">delete_outline</button>
        </span>
      </div>
    </th>
  `).join("") + `<th></th>`; // Extra column for row delete buttons

  const bodyRows = rows.map((row, rIdx) => `
    <tr>
      ${headers.map((_, cIdx) => `
        <td><textarea class="cell-input track-focus" rows="1" data-tbl="${t.id}" data-row="${rIdx}" data-col="${cIdx}" oninput="autoGrow(this)">${escapeHtml(row[cIdx] || "")}</textarea></td>
      `).join("")}
      <td class="row-actions-td">
        <button class="del-row-btn material-icons-round" title="Eliminar fila" onclick="deleteRow('${t.id}', ${rIdx})">remove_circle_outline</button>
      </td>
    </tr>
  `).join("");

  return `
    <div class="table-card" data-tbl="${t.id}">
      <div class="table-card-head">
        <div class="title"><span class="material-icons-round" style="color:var(--primary)">table_chart</span> ${escapeHtml(t.title)}</div>
        <div class="table-card-actions">
          <button class="btn btn-ghost btn-sm" onclick="appendColumn('${t.id}')"><span class="material-icons-round">view_column</span> + Columna</button>
          <button class="btn btn-ghost btn-sm" onclick="addRow('${t.id}')"><span class="material-icons-round">table_rows</span> + Fila</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteTable('${t.id}', '${escapeHtml(t.title)}')"><span class="material-icons-round">delete</span></button>
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>${headersHtml}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      <div class="table-footer">
        <span>${rows.length} filas, ${headers.length} columnas</span>
      </div>
    </div>
  `;
}

function autoGrow(el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }

function attachCellListeners() {
  $$(".cell-input").forEach(el => {
    autoGrow(el);
    el.addEventListener("blur", async () => {
      const { tbl, row, col } = el.dataset;
      await updateCell(tbl, +row, +col, el.value);
    });
    // Track focus for virtual keyboard
    el.addEventListener("focus", () => state.lastFocusedInput = el);
  });
}

// ... Funciones de Crear/Borrar son iguales a la logica previa pero adaptadas
function setupThemeModal() {
  $("#btnNewTheme").addEventListener("click", () => {
    $("#themeEmojiInput").value = ""; $("#themeNameInput").value = ""; openModal("modalTheme");
    setTimeout(() => $("#themeNameInput").focus(), 50);
  });
}
async function createTheme() {
  const name = $("#themeNameInput").value.trim();
  const emoji = $("#themeEmojiInput").value.trim() || "📖";
  if (!name) return toast("Escribe un nombre", "error");
  showLoading(true);
  try {
    const data = await apiCall("createTheme", { name, emoji });
    state.themes.push(data.theme); closeModal("modalTheme"); renderThemes(); toast("Tema creado", "success");
  } catch (e) { toast("Error: " + e.message, "error"); } finally { showLoading(false); }
}
function deleteTheme(id, name) {
  confirmAction("Eliminar tema", `¿Eliminar "${name}" y sus tablas?`, async () => {
    showLoading(true);
    try {
      await apiCall("deleteTheme", { themeId: id });
      state.themes = state.themes.filter(t => t.id !== id); renderThemes(); toast("Eliminado", "success");
    } catch(e){ toast("Error", "error"); } finally { showLoading(false); }
  });
}

function setupTableModal() {
  $("#btnNewTable").addEventListener("click", () => {
    $("#tableTitleInput").value = ""; $("#tableColsInput").value = 3; renderHeaderInputs(3); openModal("modalTable");
  });
  $("#tableColsInput").addEventListener("input", (e) => renderHeaderInputs(Math.max(1, Math.min(10, parseInt(e.target.value)||1))));
}
function renderHeaderInputs(n) {
  const existing = Array.from($$("#headersList input")).map(i => i.value);
  $("#headersList").innerHTML = Array.from({length:n}).map((_,i) => `
    <div class="header-input-row">
      <span class="idx">${i+1}.</span><input type="text" placeholder="Columna ${i+1}" value="${escapeHtml(existing[i]||"")}" class="track-focus"/>
    </div>`).join("");
  $$("#headersList input.track-focus").forEach(el => el.addEventListener("focus", () => state.lastFocusedInput = el));
}

async function createTable() {
  const title = $("#tableTitleInput").value.trim();
  const headers = Array.from($$("#headersList input")).map(i => i.value.trim()).filter(h => h);
  if (!title || !headers.length) return toast("Falta título o encabezados", "error");
  showLoading(true);
  try {
    const data = await apiCall("createTable", { themeId: state.currentTheme.id, title, headers });
    state.tables.push(data.table); closeModal("modalTable"); renderTables(); toast("Tabla creada", "success");
  } catch(e){ toast("Error", "error"); } finally { showLoading(false); }
}
function deleteTable(id, title) {
  confirmAction("Eliminar tabla", `¿Eliminar "${title}"?`, async () => {
    showLoading(true);
    try {
      await apiCall("deleteTable", { themeId: state.currentTheme.id, tableId: id });
      state.tables = state.tables.filter(t => t.id !== id); renderTables(); toast("Eliminada", "success");
    } catch(e){} finally { showLoading(false); }
  });
}

async function updateCell(tableId, row, col, value) {
  try {
    await apiCall("updateCell", { themeId: state.currentTheme.id, tableId, rowIndex: row, colIndex: col, value });
    const t = state.tables.find(x => x.id === tableId);
    if(t){ if(!t.rows[row]) t.rows[row]=[]; t.rows[row][col] = value; }
  } catch (e) { toast("Error guardando celda", "error"); }
}

async function addRow(tableId) {
  showLoading(true);
  try {
    await apiCall("addRow", { themeId: state.currentTheme.id, tableId });
    const t = state.tables.find(x => x.id === tableId);
    if(t) t.rows.push(new Array(t.headers.length).fill(""));
    renderTables();
  } catch(e){} finally { showLoading(false); }
}
async function deleteRow(tableId, rowIndex) {
  showLoading(true);
  try {
    await apiCall("deleteRow", { themeId: state.currentTheme.id, tableId, rowIndex });
    const t = state.tables.find(x => x.id === tableId);
    if(t) t.rows.splice(rowIndex, 1);
    renderTables();
  } catch(e){} finally { showLoading(false); }
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
  const name = prompt("Nombre columna:", "Col " + ((t?.headers.length||0)+1));
  if (!name) return;
  showLoading(true);
  try {
    await apiCall("addColumn", { themeId: state.currentTheme.id, tableId, name: name.trim() });
    await loadTables();
  } catch(e){} finally { showLoading(false); }
}
function askDeleteColumn(tableId, colIndex, colName) {
  confirmAction("Eliminar columna", `¿Eliminar columna "${colName}" completa?`, async () => {
    showLoading(true);
    try {
      await apiCall("deleteColumn", { themeId: state.currentTheme.id, tableId, colIndex });
      await loadTables();
    } catch(e){} finally { showLoading(false); }
  });
}

/* Virtual Keyboard Logic */
const vkData = {
  math: ['∀', '∃', '∅', '∇', '∈', '∉', '∑', '∏', '∫', '∝', '∞', '≈', '≠', '≤', '≥', '±', '×', '÷', '√', 'π', 'θ', 'λ', 'μ', 'σ', 'Δ', 'Ω', '°'],
  greek: ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','μ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω','Γ','Δ','Θ','Λ','Ξ','Π','Σ','Φ','Ψ','Ω'],
  ipa: ['ə','æ','ʃ','ʒ','ʧ','ʤ','θ','ð','ŋ','j','w','ɪ','ʊ','ʌ','ɔ','ɑ','ɒ','ɜ','ɛ','ɡ','ɾ','ʔ','ˈ','ˌ','ː'],
  cyrillic: ['А','Б','В','Г','Д','Е','Ё','Ж','З','И','Й','К','Л','М','Н','О','П','Р','С','Т','У','Ф','Х','Ц','Ч','Ш','Щ','Ъ','Ы','Ь','Э','Ю','Я', 'а','б','в','г','д','е','ё','ж','з','и','й','к','л','м','н','о','п','р','с','т','у','ф','х','ц','ч','ш','щ','ъ','ы','ь','э','ю','я'],
  accents: ['á','é','í','ó','ú','ñ','ü','Á','É','Í','Ó','Ú','Ñ','Ü','¿','¡','ç','Ç','à','è','ì','ò','ù','â','ê','î','ô','û','ä','ë','ï','ö']
};

function toggleVirtualKeyboard() {
  const vk = $("#virtualKeyboard");
  vk.classList.toggle("hidden");
  if (!vk.classList.contains("hidden")) renderVKLayout($("#vkLayoutSelect").value);
}

function renderVKLayout(layout) {
  const chars = vkData[layout] || [];
  $("#vkKeysContainer").innerHTML = chars.map(c => `<div class="vk-key" onclick="insertVKChar('${c}')">${c}</div>`).join("");
}

function insertVKChar(char) {
  const input = state.lastFocusedInput;
  if (!input) return toast("Selecciona una celda primero", "error");
  
  const start = input.selectionStart || 0;
  const end = input.selectionEnd || 0;
  const text = input.value || input.textContent || "";
  
  const newText = text.substring(0, start) + char + text.substring(end);
  
  if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
    input.value = newText;
    input.focus();
    input.setSelectionRange(start + char.length, start + char.length);
    if(input.tagName === 'TEXTAREA') autoGrow(input);
  } else {
    input.textContent = newText;
  }
}

// Draggable Keyboard
const dragVK = () => {
  const el = $("#virtualKeyboard");
  const handle = $(".vk-header");
  let isDragging = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;
  
  handle.addEventListener("mousedown", dragStart);
  document.addEventListener("mouseup", dragEnd);
  document.addEventListener("mousemove", drag);
  
  function dragStart(e) {
    if(e.target.closest('select') || e.target.closest('button')) return;
    initialX = e.clientX - xOffset; initialY = e.clientY - yOffset;
    isDragging = true;
  }
  function dragEnd() { isDragging = false; }
  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();
    currentX = e.clientX - initialX; currentY = e.clientY - initialY;
    xOffset = currentX; yOffset = currentY;
    el.style.transform = `translate(${currentX}px, ${currentY}px)`;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  setupThemeModal(); setupTableModal();
  if (state.demoMode) toast("Modo Demo local.", "info");
  loadThemes();
  
  // Track globally for text inputs
  document.addEventListener("focusin", (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      state.lastFocusedInput = e.target;
    }
  });

  $("#btnToggleKeyboard").addEventListener("click", toggleVirtualKeyboard);
  $("#vkLayoutSelect").addEventListener("change", (e) => renderVKLayout(e.target.value));
  dragVK();
});
