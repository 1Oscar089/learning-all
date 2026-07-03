/* =========================================================
   Tablas de Aprendizaje — Backend Apps Script
   =========================================================
   Cómo usar:
   1. Abre tu Google Sheet > Extensiones > Apps Script
   2. Pega TODO este archivo en Code.gs (reemplaza el contenido)
   3. Cambia TOKEN por una cadena secreta cualquiera
   4. Implementar > Nueva implementación > Aplicación web
      - Descripción: "Tablas API v1"
      - Ejecutar como: Tú mismo
      - Quién puede acceder: Cualquiera
   5. Copia la URL que termina en /exec y pégala en config.js
   =========================================================

   ARQUITECTURA
   - Cada TEMA = una hoja (pestaña) visible en el spreadsheet
   - Las TABLAS se guardan en DocumentProperties como JSON
     (fuente de verdad) Y se "dibujan" en la hoja visible
     para que el usuario las vea como tablas reales.
   - Cada cambio actualiza ambas cosas.

   FORMATO VISUAL EN CADA HOJA (tema):
   Fila 1:  [emoji] Nombre del tema
   Fila 2:  (vacía)
   Fila 3:  ### TÍTULO_TABLA_1
   Fila 4:  header1 | header2 | header3
   Fila 5:  val1   | val2   | val3
   ...
   (fila vacía)
   ### TÍTULO_TABLA_2
   ...
   ========================================================= */

var TOKEN = "MI_TOKEN_SECRETO_2024"; // <-- DEBE coincidir con config.js

// Prefijos de propiedades
var PFX_THEME = "theme_";      // theme_{id} = { id, name, emoji }
var PFX_TABLES = "tables_";    // tables_{themeId} = [{ id, title, headers, rows }]

// =========================================================
// Punto de entrada (GET y POST)
// =========================================================
function doGet(e) {
  return handle(e, "GET");
}
function doPost(e) {
  return handle(e, "POST");
}

function handle(e, method) {
  try {
    var params = method === "GET" ? (e.parameter || {}) : JSON.parse(e.postData.contents);
    if (params.token !== TOKEN) {
      return json({ ok: false, error: "Token inválido" });
    }
    var action = params.action;
    var out;

    switch (action) {
      case "listThemes":
        out = { ok: true, themes: listThemes() };
        break;
      case "createTheme":
        out = { ok: true, theme: createTheme(params.name, params.emoji) };
        break;
      case "deleteTheme":
        deleteTheme(params.themeId);
        out = { ok: true };
        break;
      case "listTables":
        out = { ok: true, tables: listTables(params.themeId) };
        break;
      case "createTable":
        out = { ok: true, table: createTable(params.themeId, params.title, params.headers) };
        break;
      case "deleteTable":
        deleteTable(params.themeId, params.tableId);
        out = { ok: true };
        break;
      case "updateCell":
        updateCell(params.themeId, params.tableId, params.rowIndex, params.colIndex, params.value);
        out = { ok: true };
        break;
      case "addRow":
        addRow(params.themeId, params.tableId);
        out = { ok: true };
        break;
      case "deleteRow":
        deleteRow(params.themeId, params.tableId, params.rowIndex);
        out = { ok: true };
        break;
      case "renameColumn":
        renameColumn(params.themeId, params.tableId, params.colIndex, params.name);
        out = { ok: true };
        break;
      case "addColumn":
        addColumn(params.themeId, params.tableId, params.name, params.afterIndex);
        out = { ok: true };
        break;
      case "deleteColumn":
        deleteColumn(params.themeId, params.tableId, params.colIndex);
        out = { ok: true };
        break;
      default:
        return json({ ok: false, error: "Acción desconocida: " + action });
    }
    return json(out);
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// =========================================================
// Propiedades
// =========================================================
function props() {
  return PropertiesService.getDocumentProperties();
}
function getProp(key, fallback) {
  var v = props().getProperty(key);
  return v ? JSON.parse(v) : fallback;
}
function setProp(key, value) {
  props().setProperty(key, JSON.stringify(value));
}
function delProp(key) {
  props().deleteProperty(key);
}

// =========================================================
// TEMAS
// =========================================================
function listThemes() {
  var all = props().getProperties();
  var themes = [];
  for (var k in all) {
    if (k.indexOf(PFX_THEME) === 0) {
      themes.push(JSON.parse(all[k]));
    }
  }
  return themes;
}

function createTheme(name, emoji) {
  name = (name || "").trim();
  if (!name) throw new Error("Nombre requerido");
  emoji = emoji || "📖";

  var id = "th_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  var theme = { id: id, name: name, emoji: emoji };

  setProp(PFX_THEME + id, theme);
  setProp(PFX_TABLES + id, []);

  // Crear la hoja visible
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safeName = sanitizeSheetName(name);
  var sheet = ss.insertSheet(safeName);
  sheet.getRange("A1").setValue(emoji + " " + name).setFontWeight("bold").setFontSize(14);
  sheet.setColumnWidth(1, 200);
  sheet.setFrozenRows(1);

  return theme;
}

function deleteTheme(themeId) {
  var theme = getProp(PFX_THEME + themeId);
  if (!theme) throw new Error("Tema no encontrado");

  delProp(PFX_THEME + themeId);
  delProp(PFX_TABLES + themeId);

  // Eliminar la hoja visible si existe
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sanitizeSheetName(theme.name));
  if (sheet) ss.deleteSheet(sheet);
}

// =========================================================
// TABLAS (por tema)
// =========================================================
function listTables(themeId) {
  return getProp(PFX_TABLES + themeId, []);
}

function findTable(themeId, tableId) {
  var tables = listTables(themeId);
  var idx = tables.findIndex(function (t) { return t.id === tableId; });
  if (idx < 0) throw new Error("Tabla no encontrada");
  return { tables: tables, idx: idx, table: tables[idx] };
}

function saveTables(themeId, tables) {
  setProp(PFX_TABLES + themeId, tables);
  redrawThemeSheet(themeId);
}

function createTable(themeId, title, headers) {
  title = (title || "").trim();
  if (!title) throw new Error("Título requerido");
  if (!headers || !headers.length) throw new Error("Headers requeridos");

  var tables = listTables(themeId);
  var table = {
    id: "tb_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    title: title,
    headers: headers.slice(),
    rows: [],
  };
  tables.push(table);
  saveTables(themeId, tables);
  return table;
}

function deleteTable(themeId, tableId) {
  var data = findTable(themeId, tableId);
  data.tables.splice(data.idx, 1);
  saveTables(themeId, data.tables);
}

function updateCell(themeId, tableId, rowIndex, colIndex, value) {
  var data = findTable(themeId, tableId);
  while (data.table.rows.length <= rowIndex) data.table.rows.push([]);
  while (data.table.rows[rowIndex].length <= colIndex) data.table.rows[rowIndex].push("");
  data.table.rows[rowIndex][colIndex] = value;
  data.tables[data.idx] = data.table;
  saveTables(themeId, data.tables);
}

function addRow(themeId, tableId) {
  var data = findTable(themeId, tableId);
  data.table.rows.push(new Array(data.table.headers.length).fill(""));
  data.tables[data.idx] = data.table;
  saveTables(themeId, data.tables);
}

function deleteRow(themeId, tableId, rowIndex) {
  var data = findTable(themeId, tableId);
  data.table.rows.splice(rowIndex, 1);
  data.tables[data.idx] = data.table;
  saveTables(themeId, data.tables);
}

function renameColumn(themeId, tableId, colIndex, name) {
  name = (name || "").trim();
  if (!name) throw new Error("Nombre vacío");
  var data = findTable(themeId, tableId);
  data.table.headers[colIndex] = name;
  data.tables[data.idx] = data.table;
  saveTables(themeId, data.tables);
}

function addColumn(themeId, tableId, name, afterIndex) {
  var data = findTable(themeId, tableId);
  name = (name || "Columna " + (data.table.headers.length + 1)).trim();
  // Si afterIndex es null/undefined -> añadir al final
  var pos = (afterIndex == null || afterIndex < 0)
    ? data.table.headers.length
    : afterIndex + 1;
  data.table.headers.splice(pos, 0, name);
  data.table.rows.forEach(function (r) {
    r.splice(pos, 0, "");
  });
  data.tables[data.idx] = data.table;
  saveTables(themeId, data.tables);
}

function deleteColumn(themeId, tableId, colIndex) {
  var data = findTable(themeId, tableId);
  if (colIndex < 0 || colIndex >= data.table.headers.length) throw new Error("Columna inválida");
  data.table.headers.splice(colIndex, 1);
  data.table.rows.forEach(function (r) {
    r.splice(colIndex, 1);
  });
  data.tables[data.idx] = data.table;
  saveTables(themeId, data.tables);
}

// =========================================================
// Dibujar la hoja visible (render del tema y sus tablas)
// =========================================================
function redrawThemeSheet(themeId) {
  var theme = getProp(PFX_THEME + themeId);
  var tables = listTables(themeId);
  if (!theme) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = sanitizeSheetName(theme.name);
  var sheet = ss.getSheetByName(sheetName);

  // Si no existe la hoja (puede pasar si el usuario la renombró), la creamos
  if (!sheet) sheet = ss.insertSheet(sheetName);

  // Limpiar
  sheet.clear();
  sheet.clearFormats();

  // Cabecera del tema
  sheet.getRange(1, 1).setValue(theme.emoji + " " + theme.name)
    .setFontWeight("bold").setFontSize(14);
  sheet.setFrozenRows(1);

  // Orden alfabético por título
  tables.sort(function (a, b) {
    return (a.title || "").localeCompare(b.title || "", "es", { sensitivity: "base" });
  });

  var row = 3;
  var maxCols = 1;

  tables.forEach(function (t) {
    // Título de la tabla
    var titleRange = sheet.getRange(row, 1);
    titleRange.setValue("### " + t.title)
      .setFontWeight("bold").setFontColor("#6b4a13")
      .setBackground("#fbf0d9");
    // extender el color de fondo a todas las columnas de headers
    if (t.headers.length > 1) {
      sheet.getRange(row, 1, 1, t.headers.length).setBackground("#fbf0d9");
    }
    row++;

    // Headers
    if (t.headers.length > 0) {
      var headerRange = sheet.getRange(row, 1, 1, t.headers.length);
      headerRange.setValues([t.headers])
        .setFontWeight("bold").setBackground("#f5f1e6");
      sheet.getRange(row, 1, 1, t.headers.length).setBorder(true, true, true, true, true, true);
    }
    row++;

    // Filas de datos
    t.rows.forEach(function (r) {
      var rowValues = t.headers.map(function (_, i) { return r[i] != null ? r[i] : ""; });
      if (rowValues.length > 0) {
        sheet.getRange(row, 1, 1, rowValues.length).setValues([rowValues]);
        sheet.getRange(row, 1, 1, rowValues.length).setBorder(true, true, true, true, true, true);
      }
      row++;
    });

    if (t.headers.length > maxCols) maxCols = t.headers.length;

    // separador
    row++;
  });

  // Anchos de columna razonables
  for (var c = 1; c <= Math.max(maxCols, 4); c++) {
    sheet.setColumnWidth(c, 200);
  }
}

// =========================================================
// Utilidades
// =========================================================
function sanitizeSheetName(name) {
  // Los nombres de hoja no pueden tener: : \ / ? * [ ]
  // y máximo 100 caracteres
  var n = (name || "Tema").replace(/[:\\/?*\[\]]/g, "_").trim();
  if (!n) n = "Tema";
  if (n.length > 100) n = n.substring(0, 100);
  return n;
}

// Polyfill para Array.prototype.findIndex (Apps Script lo soporta, por si acaso)
if (!Array.prototype.findIndex) {
  Array.prototype.findIndex = function (pred) {
    for (var i = 0; i < this.length; i++) if (pred(this[i], i)) return i;
    return -1;
  };
}
