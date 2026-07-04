/* =========================================================
   Tablas de Aprendizaje — Lógica principal (VanillaJS)
   - Temas (con emoji) → Google Sheets = 1 hoja por tema
   - Tablas con título, headers editables y filas editables
   - Orden alfabético por título de tabla
   - Borrado de columna pide confirmación
   - Si APPS_SCRIPT_URL está vacío, usa localStorage (modo demo)
   ========================================================= */

// ---------- Estado global ----------
let state = {
  themes: [],          // [{ id, name, emoji }]
  currentTheme: null,  // tema activo
  tables: [],          // tablas del tema actual: [{ id, title, headers: [], rows: [[...]] }]
  demoMode: !CONFIG.APPS_SCRIPT_URL,
};

// ---------- Utilidades UI ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showLoading(show) {
  $("#loading").hidden = !show;
}

function toast(msg, type = "info") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast " + type;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 2600);
}

function openModal(id) {
  $("#" + id).hidden = false;
}
function closeModal(id) {
  $("#" + id).hidden = true;
}

function confirmAction(title, message, onAccept) {
  $("#confirmTitle").textContent = title;
  $("#confirmMessage").textContent = message;
  const btn = $("#confirmAccept");
  // clonar para remover listeners previos
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.addEventListener("click", () => {
    closeModal("modalConfirm");
    onAccept();
  });
  openModal("modalConfirm");
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- Capa de datos (API o localStorage demo) ----------
async function apiCall(action, payload = {}, method = "POST") {
  if (state.demoMode) {
    return demoCall(action, payload);
  }
  
  let url = CONFIG.APPS_SCRIPT_URL;
  const dataPayload = { action, token: CONFIG.TOKEN, ...payload };
  
  const options = {
    method,
    headers: { "Content-Type": "text/plain;charset=utf-8" }
  };

  if (method === "GET") {
    // Si es GET, enviamos los datos en la URL
    const params = new URLSearchParams(dataPayload).toString();
    url += `?${params}`;
  } else {
    // Si es POST, enviamos los datos en el body
    options.body = JSON.stringify(dataPayload);
  }

  const res = await fetch(url, options);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Error desconocido");
  return data;
}

// Modo demo (localStorage) — replica el comportamiento de la API
async function demoCall(action, payload) {
  await new Promise((r) => setTimeout(r, 200));
  const db = JSON.parse(localStorage.getItem("studyTablesDemo") || "{}");
  db.themes = db.themes || [];
  db.tables = db.tables || {};

  switch (action) {
    case "listThemes":
      return { themes: db.themes };
    case "createTheme": {
      const t = { id: "th_" + Date.now(), name: payload.name, emoji: payload.emoji || "📖" };
      db.themes.push(t);
      db.tables[t.id] = [];
      save(db);
      return { theme: t };
    }
    case "deleteTheme": {
      db.themes = db.themes.filter((t) => t.id !== payload.themeId);
      delete db.tables[payload.themeId];
      save(db);
      return {};
    }
    case "listTables":
      return { tables: db.tables[payload.themeId] || [] };
    case "createTable": {
      const tbl = {
        id: "tb_" + Date.now(),
        title: payload.title,
        headers: payload.headers,
        rows: [],
      };
      db.tables[payload.themeId] = db.tables[payload.themeId] || [];
      db.tables[payload.themeId].push(tbl);
      save(db);
      return { table: tbl };
    }
    case "deleteTable": {
      db.tables[payload.themeId] = (db.tables[payload.themeId] || []).filter(
        (t) => t.id !== payload.tableId
      );
      save(db);
      return {};
    }
    case "updateCell": {
      const tbl = findTable(db, payload.themeId, payload.tableId);
      if (!tbl.rows[payload.rowIndex]) tbl.rows[payload.rowIndex] = [];
      tbl.rows[payload.rowIndex][payload.colIndex] = payload.value;
      save(db);
      return {};
    }
    case "addRow": {
      const tbl = findTable(db, payload.themeId, payload.tableId);
      tbl.rows.push(new Array(tbl.headers.length).fill(""));
      save(db);
      return {};
    }
    case "deleteRow": {
      const tbl = findTable(db, payload.themeId, payload.tableId);
      tbl.rows.splice(payload.rowIndex, 1);
      save(db);
      return {};
    }
    case "renameColumn": {
      const tbl = findTable(db, payload.themeId, payload.tableId);
      tbl.headers[payload.colIndex] = payload.name;
      save(db);
      return {};
    }
    case "addColumn": {
      const tbl = findTable(db, payload.themeId, payload.tableId);
      tbl.headers.push(payload.name || "Columna " + (tbl.headers.length + 1));
      tbl.rows.forEach((r) => r.push(""));
      save(db);
      return {};
    }
    case "deleteColumn": {
      const tbl = findTable(db, payload.themeId, payload.tableId);
      tbl.headers.splice(payload.colIndex, 1);
      tbl.rows.forEach((r) => r.splice(payload.colIndex, 1));
      save(db);
      return {};
    }
  }
  function save(d) {
    localStorage.setItem("studyTablesDemo", JSON.stringify(d));
  }
  function findTable(d, themeId, tableId) {
    return (d.tables[themeId] || []).find((t) => t.id === tableId);
  }
}

// ---------- Renderizado: lista de temas ----------
async function loadThemes() {
  showLoading(true);
  try {
    const data = await apiCall("listThemes", {}, "GET");
    state.themes = data.themes || [];
    renderThemes();
  } catch (e) {
    toast("Error cargando temas: " + e.message, "error");
  } finally {
    showLoading(false);
  }
}

function renderThemes() {
  const grid = $("#themesGrid");
  const empty = $("#emptyState");

  if (state.themes.length === 0) {
    empty.style.display = "block";
    grid.innerHTML = "";
    return;
  }
  empty.style.display = "none";

  // Orden alfabético por nombre
  const sorted = [...state.themes].sort((a, b) =>
    a.name.localeCompare(b.name, "es", { sensitivity: "base" })
  );

  grid.innerHTML = sorted
    .map(
      (t) => `
    <div class="theme-card" onclick="openTheme('${t.id}','${escapeHtml(t.name)}','${escapeHtml(t.emoji)}')">
      <button class="delete-btn" title="Eliminar tema" onclick="event.stopPropagation(); deleteTheme('${t.id}','${escapeHtml(t.name)}')">×</button>
      <div class="emoji">${escapeHtml(t.emoji || "📖")}</div>
      <div class="name">${escapeHtml(t.name)}</div>
      <div class="meta">Toca para ver tablas</div>
    </div>
  `
    )
    .join("");
}

// ---------- Renderizado: tablas de un tema ----------
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
  } catch (e) {
    toast("Error cargando tablas: " + e.message, "error");
    state.tables = [];
    renderTables();
  } finally {
    showLoading(false);
  }
}

function renderTables() {
  const container = $("#tablesContainer");

  // Orden alfabético por título
  const sorted = [...state.tables].sort((a, b) =>
    a.title.localeCompare(b.title, "es", { sensitivity: "base" })
  );

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:2.5rem 1rem;">
        <div class="empty-emoji">📋</div>
        <h2 style="font-size:1.15rem;">Aún no hay tablas</h2>
        <p>Crea tu primera tabla para empezar a aprender.</p>
        <button class="btn btn-primary" onclick="document.getElementById('btnNewTable').click()">+ Nueva tabla</button>
      </div>`;
    return;
  }

  container.innerHTML = sorted.map(renderTableCard).join("");

  // Re-attach listeners para inputs editables
  attachCellListeners();
}

function renderTableCard(t) {
  const headers = t.headers || [];
  const rows = t.rows || [];

  const headersHtml = headers
    .map(
      (h, i) => `
      <th>
        <div class="col-head">
          <span class="col-name" contenteditable="true"
            onblur="renameColumn('${t.id}', ${i}, this.textContent)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${escapeHtml(h)}</span>
          <span class="col-actions">
            <button title="Insertar columna a la derecha" onclick="addColumn('${t.id}', ${i})">+</button>
            <button class="del" title="Eliminar columna" onclick="askDeleteColumn('${t.id}', ${i}, '${escapeHtml(h)}')">×</button>
          </span>
        </div>
      </th>
    `
    )
    .join("");

  // +1 columna extra para botones de fila
  const bodyRows = rows
    .map(
      (row, rIdx) => `
      <tr>
        ${headers
          .map(
            (_, cIdx) => `
          <td>
            <textarea class="cell-input" rows="1"
              data-tbl="${t.id}" data-row="${rIdx}" data-col="${cIdx}"
              oninput="autoGrow(this)"
            >${escapeHtml(row[cIdx] || "")}</textarea>
          </td>
        `
          )
          .join("")}
      </tr>
    `
    )
    .join("");

  const actionsRow = `
    <tr class="row-actions">
      ${headers
        .map(
          (_, cIdx) =>
            `<td>${cIdx === 0 ? `<button class="add" onclick="addRow('${t.id}')">+ fila</button>` : ""}</td>`
        )
        .join("")}
    </tr>
  `;

  // última fila: eliminar filas
  const deleteRowHtml = rows
    .map(
      (_, rIdx) => `
      <tr class="row-actions">
        ${headers
          .map(
            (_, cIdx) =>
              `<td>${
                cIdx === 0
                  ? `<button onclick="deleteRow('${t.id}', ${rIdx})">✕ eliminar fila ${rIdx + 1}</button>`
                  : ""
              }</td>`
          )
          .join("")}
      </tr>
    `
    )
    .join("");

  return `
    <div class="table-card" data-tbl="${t.id}">
      <div class="table-card-head">
        <div class="title">📋 ${escapeHtml(t.title)}</div>
        <div class="table-card-actions">
          <button class="icon-btn" title="Añadir columna al final" onclick="appendColumn('${t.id}')">+ Columna</button>
          <button class="icon-btn" title="Añadir fila" onclick="addRow('${t.id}')">+ Fila</button>
          <button class="icon-btn danger" title="Eliminar tabla" onclick="deleteTable('${t.id}', '${escapeHtml(t.title)}')">🗑</button>
        </div>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>${headersHtml}</tr></thead>
          <tbody>
            ${bodyRows}
            ${actionsRow}
            ${rows.length > 0 ? deleteRowHtml : ""}
          </tbody>
        </table>
      </div>
      <div style="padding:.5rem 1rem; font-size:.75rem; color:var(--text-muted);">
        ${rows.length} fila(s) · ${headers.length} columna(s)
      </div>
    </div>
  `;
}

function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function attachCellListeners() {
  // Guardar celda al perder foco
  $$(".cell-input").forEach((el) => {
    autoGrow(el);
    el.addEventListener("blur", async () => {
      const { tbl, row, col } = el.dataset;
      await updateCell(tbl, +row, +col, el.value);
    });
  });
}

// ---------- Acciones: Temas ----------
function setupThemeModal() {
  $("#btnNewTheme").addEventListener("click", () => {
    $("#themeEmojiInput").value = "";
    $("#themeNameInput").value = "";
    openModal("modalTheme");
    setTimeout(() => $("#themeNameInput").focus(), 50);
  });
}

async function createTheme() {
  const name = $("#themeNameInput").value.trim();
  const emoji = $("#themeEmojiInput").value.trim() || "📖";
  if (!name) {
    toast("Escribe un nombre para el tema", "error");
    return;
  }
  showLoading(true);
  try {
    const data = await apiCall("createTheme", { name, emoji });
    state.themes.push(data.theme);
    closeModal("modalTheme");
    renderThemes();
    toast("Tema creado", "success");
  } catch (e) {
    toast("Error: " + e.message, "error");
  } finally {
    showLoading(false);
  }
}

function deleteTheme(id, name) {
  confirmAction(
    "Eliminar tema",
    `¿Eliminar el tema "${name}" y todas sus tablas? Esta acción no se puede deshacer.`,
    async () => {
      showLoading(true);
      try {
        await apiCall("deleteTheme", { themeId: id });
        state.themes = state.themes.filter((t) => t.id !== id);
        renderThemes();
        toast("Tema eliminado", "success");
      } catch (e) {
        toast("Error: " + e.message, "error");
      } finally {
        showLoading(false);
      }
    }
  );
}

// ---------- Acciones: Tablas ----------
function setupTableModal() {
  $("#btnNewTable").addEventListener("click", () => {
    $("#tableTitleInput").value = "";
    $("#tableColsInput").value = 3;
    // Limpiar inputs de headers existentes antes de re-renderizar
    $$("#headersList input").forEach((i) => (i.value = ""));
    renderHeaderInputs(3);
    openModal("modalTable");
    setTimeout(() => $("#tableTitleInput").focus(), 50);
  });

  $("#tableColsInput").addEventListener("input", (e) => {
    const n = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
    renderHeaderInputs(n);
  });
}

function renderHeaderInputs(n) {
  const existing = Array.from($$("#headersList input")).map((i) => i.value);
  const list = $("#headersList");
  list.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.className = "header-input-row";
    row.innerHTML = `
      <span class="idx">${i + 1}.</span>
      <input type="text" placeholder="Encabezado de columna ${i + 1}" value="${escapeHtml(
        existing[i] || ""
      )}" />
    `;
    list.appendChild(row);
  }
}

async function createTable() {
  const title = $("#tableTitleInput").value.trim();
  if (!title) {
    toast("Escribe un título para la tabla", "error");
    return;
  }
  const headers = Array.from($$("#headersList input"))
    .map((i) => i.value.trim())
    .filter((h) => h !== "");
  if (headers.length === 0) {
    toast("Añade al menos un encabezado", "error");
    return;
  }
  showLoading(true);
  try {
    const data = await apiCall("createTable", {
      themeId: state.currentTheme.id,
      title,
      headers,
    });
    state.tables.push(data.table);
    closeModal("modalTable");
    renderTables();
    toast("Tabla creada", "success");
  } catch (e) {
    toast("Error: " + e.message, "error");
  } finally {
    showLoading(false);
  }
}

function deleteTable(id, title) {
  confirmAction(
    "Eliminar tabla",
    `¿Eliminar la tabla "${title}"? Esta acción no se puede deshacer.`,
    async () => {
      showLoading(true);
      try {
        await apiCall("deleteTable", { themeId: state.currentTheme.id, tableId: id });
        state.tables = state.tables.filter((t) => t.id !== id);
        renderTables();
        toast("Tabla eliminada", "success");
      } catch (e) {
        toast("Error: " + e.message, "error");
      } finally {
        showLoading(false);
      }
    }
  );
}

// ---------- Acciones: Celdas, filas, columnas ----------
async function updateCell(tableId, row, col, value) {
  try {
    await apiCall("updateCell", {
      themeId: state.currentTheme.id,
      tableId,
      rowIndex: row,
      colIndex: col,
      value,
    });
    // Actualizar estado local sin re-render (más fluido)
    const t = state.tables.find((x) => x.id === tableId);
    if (t) {
      if (!t.rows[row]) t.rows[row] = [];
      t.rows[row][col] = value;
    }
  } catch (e) {
    toast("Error guardando celda: " + e.message, "error");
  }
}

async function addRow(tableId) {
  showLoading(true);
  try {
    await apiCall("addRow", { themeId: state.currentTheme.id, tableId });
    const t = state.tables.find((x) => x.id === tableId);
    if (t) t.rows.push(new Array(t.headers.length).fill(""));
    renderTables();
  } catch (e) {
    toast("Error: " + e.message, "error");
  } finally {
    showLoading(false);
  }
}

async function deleteRow(tableId, rowIndex) {
  confirmAction(
    "Eliminar fila",
    `¿Eliminar la fila ${rowIndex + 1}?`,
    async () => {
      showLoading(true);
      try {
        await apiCall("deleteRow", {
          themeId: state.currentTheme.id,
          tableId,
          rowIndex,
        });
        const t = state.tables.find((x) => x.id === tableId);
        if (t) t.rows.splice(rowIndex, 1);
        renderTables();
        toast("Fila eliminada", "success");
      } catch (e) {
        toast("Error: " + e.message, "error");
      } finally {
        showLoading(false);
      }
    }
  );
}

async function renameColumn(tableId, colIndex, newName) {
  const name = newName.trim();
  if (!name) {
    toast("El encabezado no puede estar vacío", "error");
    renderTables();
    return;
  }
  try {
    await apiCall("renameColumn", {
      themeId: state.currentTheme.id,
      tableId,
      colIndex,
      name,
    });
    const t = state.tables.find((x) => x.id === tableId);
    if (t) t.headers[colIndex] = name;
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function addColumn(tableId, afterIndex) {
  const name = prompt("Nombre del nuevo encabezado:", "Nueva columna");
  if (name === null) return;
  showLoading(true);
  try {
    await apiCall("addColumn", {
      themeId: state.currentTheme.id,
      tableId,
      name: name.trim() || "Columna",
      afterIndex,
    });
    await loadTables();
    toast("Columna añadida", "success");
  } catch (e) {
    toast("Error: " + e.message, "error");
  } finally {
    showLoading(false);
  }
}

async function appendColumn(tableId) {
  const name = prompt("Nombre del nuevo encabezado:", "Columna " + (((state.tables.find(t=>t.id===tableId))?.headers.length||0)+1));
  if (name === null) return;
  showLoading(true);
  try {
    await apiCall("addColumn", {
      themeId: state.currentTheme.id,
      tableId,
      name: name.trim() || "Columna",
    });
    await loadTables();
    toast("Columna añadida", "success");
  } catch (e) {
    toast("Error: " + e.message, "error");
  } finally {
    showLoading(false);
  }
}

function askDeleteColumn(tableId, colIndex, colName) {
  confirmAction(
    "Eliminar columna",
    `¿Eliminar la columna "${colName}"?\n\nSe borrará COMPLETA, incluyendo todos sus datos en cada fila. Esta acción no se puede deshacer.`,
    async () => {
      showLoading(true);
      try {
        await apiCall("deleteColumn", {
          themeId: state.currentTheme.id,
          tableId,
          colIndex,
        });
        await loadTables();
        toast("Columna eliminada", "success");
      } catch (e) {
        toast("Error: " + e.message, "error");
      } finally {
        showLoading(false);
      }
    }
  );
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  setupThemeModal();
  setupTableModal();

  if (state.demoMode) {
    toast("Modo demo (localStorage). Pega tu URL de Apps Script en config.js para usar Sheets.", "info");
  }

  loadThemes();

  // Cerrar modal con Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $$(".modal-overlay").forEach((m) => (m.hidden = true));
    }
  });
});
