// Language Selector + motor de traducere. Etapa 1: Română + English complet;
// celelalte 7 limbi din LOCALES rămân în dropdown dar fără dicționar propriu
// încă — pentru ele, t() cade automat pe fallback-ul English (vezi t() mai jos).

// Steaguri emoji Unicode (🇷🇴🇬🇧...) NU se randează consistent — pe acest
// mediu de test (Chromium/Playwright pe Windows) apar ca text simplu ("RO",
// "GB"), nu ca iconițe de steag, din lipsa fonturilor de emoji-uri regionale.
// Fix: steaguri SVG inline desenate manual (aceeași abordare ca AVATAR_CATALOG
// din shell.js) — randare identică, garantată, pe orice browser/SO.
function flagSvg(paths) {
  return `<svg viewBox="0 0 20 14" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
}

// Ordine: EN mereu primul (limba de bază/source of truth a sistemului i18n —
// vezi DEFAULT_LOCALE_CODE/FALLBACK_LOCALE_CODE mai jos), apoi RO, apoi restul
// în ordine geografică (de la cea mai apropiată la cea mai depărtată de
// România) — NU ordine alfabetică.
const LOCALES = [
  {
    code: "en",
    name: "English",
    flag: flagSvg(
      '<rect width="20" height="14" fill="#00247D"/>' +
        '<path d="M0 0L20 14M20 0L0 14" stroke="#FFFFFF" stroke-width="3"/>' +
        '<path d="M0 0L20 14M20 0L0 14" stroke="#CF142B" stroke-width="1.2"/>' +
        '<path d="M10 0V14M0 7H20" stroke="#FFFFFF" stroke-width="4.5"/>' +
        '<path d="M10 0V14M0 7H20" stroke="#CF142B" stroke-width="2.5"/>',
    ),
  },
  {
    code: "ro",
    name: "Română",
    flag: flagSvg(
      '<rect width="20" height="14" fill="#CE1126"/><rect width="13.34" height="14" fill="#FCD116"/><rect width="6.67" height="14" fill="#002B7F"/>',
    ),
  },
  {
    code: "uk",
    name: "Українська",
    flag: flagSvg(
      '<rect width="20" height="14" fill="#005BBB"/><rect y="7" width="20" height="7" fill="#FFD500"/>',
    ),
  },
  {
    code: "tr",
    name: "Türkçe",
    flag: flagSvg(
      '<rect width="20" height="14" fill="#E30A17"/>' +
        '<circle cx="8" cy="7" r="3.8" fill="#FFFFFF"/><circle cx="9.2" cy="7" r="3.2" fill="#E30A17"/>' +
        '<polygon points="12.3,7 13.8,7.6 13.4,6 14.5,4.9 13,4.9 12.3,3.4 11.8,4.9 10.3,4.9 11.4,6 10.9,7.6" fill="#FFFFFF"/>',
    ),
  },
  {
    code: "pl",
    name: "Polski",
    flag: flagSvg(
      '<rect width="20" height="14" fill="#DC143C"/><rect width="20" height="7" fill="#FFFFFF"/>',
    ),
  },
  {
    code: "ru",
    name: "Русский",
    flag: flagSvg(
      '<rect width="20" height="14" fill="#FFFFFF"/><rect y="4.67" width="20" height="9.33" fill="#0039A6"/><rect y="9.34" width="20" height="4.66" fill="#D52B1E"/>',
    ),
  },
  {
    code: "it",
    name: "Italiano",
    flag: flagSvg(
      '<rect width="20" height="14" fill="#CE2B37"/><rect width="13.34" height="14" fill="#FFFFFF"/><rect width="6.67" height="14" fill="#009246"/>',
    ),
  },
  {
    code: "nl",
    name: "Nederlands",
    flag: flagSvg(
      '<rect width="20" height="14" fill="#21468B"/><rect width="20" height="9.34" fill="#FFFFFF"/><rect width="20" height="4.67" fill="#AE1C28"/>',
    ),
  },
  {
    code: "no",
    name: "Norsk",
    flag: flagSvg(
      '<rect width="20" height="14" fill="#EF2B2D"/>' +
        '<rect x="6" width="3" height="14" fill="#FFFFFF"/><rect y="5.5" width="20" height="3" fill="#FFFFFF"/>' +
        '<rect x="6.9" width="1.2" height="14" fill="#002868"/><rect y="6.4" width="20" height="1.2" fill="#002868"/>',
    ),
  },
];
// English e limba implicită/de fallback universal a întregului sistem i18n —
// cerință explicită: dacă limba selectată lipsește din LOCALES, e nesuportată,
// sau o cheie de traducere lipsește, se cade mereu pe English, NICIODATĂ pe
// Română (Româna e doar o limbă din listă, tratată identic cu celelalte).
const DEFAULT_LOCALE_CODE = "en";

function getCurrentLocaleCode() {
  const stored = localStorage.getItem("locale");
  // Validează contra catalogului LOCALES — un cod stocat invalid/nesuportat
  // (ex. corupt manual, sau o limbă scoasă ulterior din catalog) cade pe
  // DEFAULT_LOCALE_CODE (English), nu e folosit orb ca literă de fetch.
  if (stored && LOCALES.some((l) => l.code === stored)) return stored;
  return DEFAULT_LOCALE_CODE;
}

function getLocale(code) {
  return (
    LOCALES.find((l) => l.code === code) ||
    LOCALES.find((l) => l.code === DEFAULT_LOCALE_CODE) ||
    LOCALES[0]
  );
}

// --- MOTOR DE TRADUCERE ---

// Cache în memorie — se resetează la fiecare navigare de pagină (nu e un SPA),
// dar fetch-ul unui JSON local mic e practic instant, deci nu costă vizibil.
const translations = {};
const FALLBACK_LOCALE_CODE = "en";

async function loadTranslations(code) {
  if (translations[code]) return translations[code];
  try {
    const res = await fetch(`locales/${code}.json`);
    translations[code] = await res.json();
  } catch (err) {
    console.error(`Nu s-au putut încărca traducerile pentru "${code}":`, err);
    translations[code] = {};
  }
  return translations[code];
}

function getNestedValue(obj, path) {
  return path.split(".").reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

// Extrasă din t() ca să fie reutilizată și de tPlural() mai jos — simplă
// substituție {{var}} -> valoare, fără nicio logică de plural aici.
function interpolateVars(template, vars) {
  let value = template;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      value = value.replace(new RegExp(`{{${k}}}`, "g"), vars[k]);
    });
  }
  return value;
}

// Lanț de fallback: limba curentă -> English -> fallbackText (textul original,
// dat de apelant) -> cheia brută. UI-ul nu poate afișa niciodată gol/eroare
// doar pentru că o cheie lipsește dintr-un dicționar.
function t(key, fallbackText, vars) {
  const current = getCurrentLocaleCode();
  let value = getNestedValue(translations[current], key);
  if (value === undefined) value = getNestedValue(translations[FALLBACK_LOCALE_CODE], key);
  if (value === undefined) value = fallbackText !== undefined ? fallbackText : key;
  return interpolateVars(value, vars);
}

// Alege forma corectă dintr-un obiect de forme CLDR ({"one":..,"few":..,
// "many":..,"other":..}) pentru categoria cerută — cade pe "other" din
// ACELAȘI obiect dacă limba curentă pur și simplu nu are acea categorie
// (ex. engleza n-are "few"/"many" deloc, doar "one"/"other").
function pickPluralForm(forms, category) {
  if (!forms || typeof forms !== "object") return undefined;
  if (forms[category] !== undefined) return forms[category];
  return forms.other;
}

// Echivalentul t() pentru chei cu forme de plural — valoarea din JSON e un
// OBIECT de forme (categorii CLDR: one/few/many/other, eventual zero/two
// pentru alte limbi), nu un string simplu. Categoria corectă e aleasă cu
// Intl.PluralRules(locale).select(count) — API nativ, standardizat, acoperă
// corect regulile complexe RO (one/few/other)/PL/UK (one/few/many/other)/RU,
// nu doar distincția simplă singular/plural din engleză/română.
// Lanț de fallback, în ordine (simetric cu t(), extins cu dimensiunea de
// plural): categoria cerută din limba curentă -> "other" din ACELAȘI
// dicționar (limbă care n-are acea categorie) -> categoria/"other" din
// dicționarul English -> categoria/"other" din fallbackForms dat de apelant
// -> cheia brută. UI-ul nu poate afișa niciodată gol/eroare doar pentru că
// o categorie de plural lipsește dintr-un dicționar.
function tPlural(key, count, fallbackForms, vars) {
  const current = getCurrentLocaleCode();
  const category = new Intl.PluralRules(current).select(count);

  let value = pickPluralForm(getNestedValue(translations[current], key), category);

  if (value === undefined) {
    const fallbackCategory = new Intl.PluralRules(FALLBACK_LOCALE_CODE).select(count);
    value = pickPluralForm(getNestedValue(translations[FALLBACK_LOCALE_CODE], key), fallbackCategory);
  }

  if (value === undefined && fallbackForms) {
    value = pickPluralForm(fallbackForms, category);
  }

  if (value === undefined) value = key;

  return interpolateVars(value, vars);
}

// Aplică traducerile pe markup-ul static din pagina curentă — rulat la
// încărcare și la fiecare schimbare de limbă (erp:locale-changed).
function translateStaticPage() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"), el.textContent);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"), el.placeholder);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.getAttribute("data-i18n-title"), el.title);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label"), el.getAttribute("aria-label")));
  });
}

// Punct unic de conectare — încarcă dicționarele (curent + fallback English),
// sincronizează <html lang=""> și retraduce markup-ul static.
async function applyLocale(code) {
  document.documentElement.setAttribute("lang", code);
  await Promise.all([loadTranslations(FALLBACK_LOCALE_CODE), loadTranslations(code)]);
  translateStaticPage();
}

async function setLocale(code) {
  localStorage.setItem("locale", code);
  renderLangSwitcherButton(code);
  renderLangSwitcherMenu(code);
  await applyLocale(code);
  document.dispatchEvent(new CustomEvent("erp:locale-changed", { detail: { code } }));
}

function renderLangSwitcherButton(code) {
  const btn = document.getElementById("langSwitcherBtn");
  if (!btn) return;
  const locale = getLocale(code);
  btn.innerHTML = `<span class="lang-flag-icon">${locale.flag}</span><span class="lang-switcher-label">${locale.name}</span><i class="fas fa-chevron-down lang-switcher-caret"></i>`;
}

function renderLangSwitcherMenu(activeCode) {
  const menu = document.getElementById("langSwitcherMenu");
  if (!menu) return;
  menu.innerHTML = LOCALES.map(
    (locale) => `
    <li>
      <button type="button" class="dropdown-item lang-option${locale.code === activeCode ? " active" : ""}" data-lang="${locale.code}">
        <span class="lang-flag-icon">${locale.flag}</span>
        <span class="lang-option-name">${locale.name}</span>
        ${locale.code === activeCode ? '<i class="fas fa-check lang-option-check"></i>' : ""}
      </button>
    </li>
  `,
  ).join("");
}

async function initLangSwitcher() {
  const code = getCurrentLocaleCode();
  renderLangSwitcherButton(code);
  renderLangSwitcherMenu(code);
  await applyLocale(code);
}

// Pornește fetch-ul dicționarelor imediat, la încărcarea scriptului — nu
// așteaptă erp:shell-ready. E un JSON static local, mic, deci se rezolvă de
// obicei rapid, dar NU e garantat mereu înaintea primului randare sincron
// (confirmat empiric: un tab din Settings care randează text tradus înainte
// de orice apel API arăta scurt fallback-ul românesc, chiar cu limba pe
// English). window.i18nReady expune promisiunea ambelor dicționare (curent +
// fallback English) — orice modul care randează text tradus ÎNAINTE de un
// apel API propriu trebuie să facă `await window.i18nReady` primul lucru.
function ensureTranslationsLoaded() {
  const current = getCurrentLocaleCode();
  const codes = current === FALLBACK_LOCALE_CODE ? [current] : [current, FALLBACK_LOCALE_CODE];
  return Promise.all(codes.map(loadTranslations));
}
window.i18nReady = ensureTranslationsLoaded();

// Randează abia după ce topbar.html (butonul/menu-ul) e injectat în DOM —
// shell.js emite acest eveniment după ce componentele s-au încărcat.
document.addEventListener("erp:shell-ready", initLangSwitcher);

document.addEventListener("click", (e) => {
  const option = e.target.closest(".lang-option");
  if (option && option.dataset.lang) {
    setLocale(option.dataset.lang);
  }
});
