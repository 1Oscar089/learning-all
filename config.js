/* =========================================================
   CONFIGURACIÓN
   =========================================================
   Sustituye WEB_APP_URL por la URL pública de tu Apps Script
   Web App (la que terminas en /exec). La encuentras tras hacer
   "Deploy > New deployment > Web app" en el editor de Apps Script.

   Mientras no la tengas, la app funciona en "modo demo" usando
   localStorage para que puedas probar la UI sin Sheets.
   ========================================================= */

const CONFIG = {
  // Pega aquí tu URL de Apps Script (termina en /exec)
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxu8-qma-LPukPa1JmGj9uvdzmwOviz0fnULmu6ijPHTOng06H8tiHraAjQvuBUoONB/exec",

  // Token simple para evitar que cualquiera use tu endpoint.
  // Debe coincidir con el TOKEN del Code.gs.
  TOKEN: "abababacacaca_2026",
};
