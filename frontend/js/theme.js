// Motor de temă (System/Light/Dark) — vezi frontend/css/dark-theme.css pentru
// stilurile efective și frontend/js/settings/displayTab.js pentru UI-ul de
// selecție din Setări > Display.
//
// IMPORTANT: acest script trebuie inclus ca PRIMUL <script> din <head>, ÎNAINTEA
// oricărui <link rel="stylesheet"> — aplică atributul de temă SINCRON, la
// parse-time (document.documentElement există deja când <head> se parsează,
// chiar înainte de <body>), ca să evite un FOUC (flash scurt de temă greșită
// înainte ca preferința reală să fie citită din localStorage).
const THEME_STORAGE_KEY = "theme";
const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

// "system" | "light" | "dark" — ce a ales userul (persistat).
function getStoredThemePref() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  } catch (err) {
    return "system";
  }
}

// "light" | "dark" — tema REALĂ de aplicat, după rezolvarea "system" prin
// preferința curentă a sistemului de operare (prefers-color-scheme).
function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia && window.matchMedia(THEME_MEDIA_QUERY).matches ? "dark" : "light";
}

// `data-theme` guvernează stilurile proprii ale aplicației (dark-theme.css,
// login.css), `data-bs-theme` declanșează dark mode-ul nativ Bootstrap 5.3+
// (carduri/tabele/modale/formulare/dropdown-uri Bootstrap standard) — setate
// împreună, pe același element, ca ambele straturi să rămână sincronizate.
function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-bs-theme", resolved);
}

// Aplicare imediată — vezi comentariul de sus (trebuie să ruleze la parse-time).
applyTheme(getStoredThemePref());

function setTheme(pref) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch (err) {
    console.error("Nu s-a putut salva preferința de temă:", err);
  }
  applyTheme(pref);
  document.dispatchEvent(
    new CustomEvent("erp:theme-changed", { detail: { pref, resolved: resolveTheme(pref) } }),
  );
}

// Urmărire live a preferinței de sistem — DOAR când userul e explicit pe
// "system" (o schimbare a temei SO nu trebuie să afecteze o alegere manuală
// Light/Dark deja făcută).
if (window.matchMedia) {
  window.matchMedia(THEME_MEDIA_QUERY).addEventListener("change", () => {
    if (getStoredThemePref() === "system") applyTheme("system");
  });
}
