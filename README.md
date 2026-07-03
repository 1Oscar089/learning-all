# 📚 Tablas de Aprendizaje

Aplicación web en **VanillaJS** (sin frameworks) para crear temas y tablas
de aprendizaje. El frontend se publica en **GitHub Pages** y el backend es
**Google Sheets** mediante **Apps Script**.

## ✨ Características

- Crear temas con emoji y nombre (se muestran en tarjetas).
- Dentro de cada tema, crear tablas indicando **título**, **número de columnas** y **encabezados**.
- Las tablas se ordenan **alfabéticamente por título**.
- Celdas, filas y columnas **editables**.
- **Borrar una columna pide confirmación** (se borra completa con todos sus datos).
- Cada tema es una **hoja (pestaña) distinta en Google Sheets**, donde las tablas se dibujan como tablas reales visibles.
- Modo demo con `localStorage` mientras configuras Apps Script.

## 📁 Estructura del proyecto (lo que subes a GitHub)

```
study-tables/
├── index.html      # estructura de la página
├── styles.css      # estilos
├── app.js          # lógica VanillaJS
├── config.js       # aquí pegas la URL de Apps Script y el token
├── Code.gs         # backend Apps Script (no se sirve, solo referencia)
└── README.md
```

> Solo necesitas publicar `index.html`, `styles.css`, `app.js` y `config.js`.
> `Code.gs` lo pegas directamente en el editor de Apps Script.

## 🚀 Publicar el frontend en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `tablas-aprendizaje`).
2. Sube los archivos `index.html`, `styles.css`, `app.js` y `config.js`
   (puedes ponerlos en la raíz o en una carpeta `docs/`).
3. En el repo: **Settings → Pages → Source: main / root** (o `/docs`).
4. En unos minutos tendrás tu web en:
   `https://<tu-usuario>.github.io/<tu-repo>/`

## 🔌 Conectar Google Sheets con Apps Script (paso a paso)

### 1) Crear el Google Sheet
1. Ve a [sheets.new](https://sheets.new) (o usa un sheet existente).
2. Ponle un nombre, por ejemplo `Tablas de Aprendizaje`.

### 2) Abrir el editor de Apps Script
1. En el menú: **Extensiones → Apps Script**.
2. Se abre el editor con un archivo `Código.gs` (o `Code.gs`).
3. **Borra todo** el contenido y **pega** el contenido de `Code.gs` de este proyecto.

### 3) Configurar el token
- En `Code.gs`, busca la línea:
  ```js
  var TOKEN = "MI_TOKEN_SECRETO_2024";
  ```
  Cámbiala por una cadena secreta larga y personal.
- En tu `config.js` (junto al HTML), pon el **mismo valor** en `CONFIG.TOKEN`.

### 4) Implementar como aplicación web
1. En el editor de Apps Script: **Implementar → Nueva implementación**.
2. Haz clic en el icono de engranaje ⚙️ → **Aplicación web**.
3. Rellena:
   - **Descripción**: `Tablas API v1`
   - **Ejecutar como**: *Tu cuenta*
   - **Quién puede acceder**: *Cualquiera*
     (es necesario para que el HTML en GitHub Pages pueda llamarlo).
4. Haz clic en **Implementar**.
5. Autoriza los permisos cuando te lo pida (acceso a Sheets).
6. **Copia la URL** que termina en `/exec`.

> Si pides acceso "Cualquiera", Google pedirá autorizar scopes la primera vez.
> Si lo dejas como "Solo yo", la web pública te pedirá login.

### 5) Conectar el frontend
1. Pega la URL `/exec` en `config.js`:
   ```js
   const CONFIG = {
     APPS_SCRIPT_URL: "https://script.google.com/macros/s/XXXX/exec",
     TOKEN: "MI_TOKEN_SECRETO_2024",
   };
   ```
2. Sube el cambio a GitHub.
3. Recarga la web y crea tu primer tema. ✅

### 6) Ver las tablas en Sheets
Cada tema crea una **hoja nueva** (pestaña) en tu spreadsheet. Dentro verás
las tablas dibujadas con su título, encabezados y filas, ordenadas
alfabéticamente.

## 🛠️ Solución de problemas

| Problema | Solución |
|---|---|
| La web dice "modo demo" | `APPS_SCRIPT_URL` está vacío en `config.js`. |
| `Token inválido` | El `TOKEN` de `Code.gs` y `config.js` no coinciden. |
| `Acceso denegado / no autorizado` | Reimplementa con "Quién puede acceder: Cualquiera". |
| No veo las hojas nuevas | Revisa que el editor de Apps Script tenga permisos de Sheets (lo pide la primera vez). |
| Cambios no se reflejan | Tras editar `Code.gs`, crea una **nueva versión** de implementación (no "editar" la actual si ya está en producción, aunque también funciona). |

## 🧱 Modelo de datos

- **Tema**: `{ id, name, emoji }` → se guarda en `DocumentProperties` y crea una hoja visible.
- **Tabla**: `{ id, title, headers: [], rows: [[]] }` → guardada como JSON en `DocumentProperties` y dibujada en su hoja.

La **fuente de verdad** son las `DocumentProperties` (JSON), y la hoja visible
es solo un "render" para que el usuario vea las tablas como tablas reales.
