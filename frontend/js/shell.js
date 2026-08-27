document.addEventListener("DOMContentLoaded", async () => {
  // 1. SIMPLE AUTH GUARD
  const token = localStorage.getItem("token");
  if (!token) {
    redirectToLogin();
    return;
  }

  // 2. LOAD COMPONENTS (Sidebar & Topbar)
  await Promise.all([
    loadComponent("shellSidebar", "components/sidebar.html"),
    loadComponent("shellTopbar", "components/topbar.html"),
  ]);

  // Semnalează altor module (ex. i18n.js) că topbar-ul/sidebar-ul există acum
  // în DOM — shell.js nu știe nimic despre ce ascultă acest eveniment.
  document.dispatchEvent(new CustomEvent("erp:shell-ready"));

  // 3. SET ACTIVE MENU ITEM
  const currentPage =
    window.location.pathname.split("/").pop() || "dashboard.html";
  const activeLink = document.querySelector(
    `.nav-link[data-page="${currentPage}"]`,
  );
  if (activeLink) {
    activeLink.classList.add("active");
  }

  // 4. SET DYNAMIC PAGE TITLE FROM <body data-page-title-key="..."> (cheie de
  // traducere) cu fallback pe data-page-title="..." (text brut, dacă pagina nu
  // a primit încă o cheie i18n). Re-tradus și la schimbarea de limbă mai jos.
  renderPageTitle();

  // 5. SET USER INFO IN TOPBAR (dinamic, din userul autentificat)
  loadCurrentUser();

  // 6. SETUP LOGOUT EVENTS (sidebar + acces rapid din header)
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", performLogout);
  }

  const headerLogoutBtn = document.getElementById("headerLogoutBtn");
  if (headerLogoutBtn) {
    headerLogoutBtn.addEventListener("click", performLogout);
  }

  // 7. SETUP SIDEBAR TOGGLE & CLOSE EVENTS
  const sidebarToggle = document.getElementById("sidebarToggle");
  const closeSidebarBtn = document.getElementById("closeSidebarBtn");
  const erpWrapper = document.querySelector(".erp-wrapper");
  const erpSidebar = document.getElementById("erpSidebar");

  // A. Restabilește starea salvată la reîncărcare
  if (localStorage.getItem("sidebarCollapsed") === "true" && erpWrapper) {
    erpWrapper.classList.add("sidebar-collapsed");
  }

  // B. Funcție universală de toggle pentru sidebar
  const toggleSidebar = () => {
    if (erpSidebar) {
      erpSidebar.classList.toggle("show");
    }
    if (erpWrapper) {
      erpWrapper.classList.toggle("sidebar-collapsed");
      const isCollapsed = erpWrapper.classList.contains("sidebar-collapsed");
      localStorage.setItem("sidebarCollapsed", isCollapsed.toString());
    }
  };

  // C. Înregistrare evenimente pe butoanele disponibile
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener("click", toggleSidebar);
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", toggleSidebar);
  }
});

// Badge-ul de plan din sidebar (sub logo) — citește planul direct din
// evenimentul erp:user-loaded, emis mai jos de loadCurrentUser(). Extras
// într-o funcție numită ca să poată fi re-apelat și la erp:locale-changed
// (fără asta, badge-ul ar rămâne în limba de la ultimul erp:user-loaded).
function renderPlanBadge(plan) {
  const badgeEl = document.getElementById("sidebarPlanBadge");
  if (!badgeEl) return;

  const isPro = plan === "pro";

  badgeEl.className = `plan-badge ${isPro ? "plan-badge-pro" : "plan-badge-free"}`;
  badgeEl.innerHTML = isPro
    ? `<i class="fas fa-crown plan-badge-icon"></i><span>${t("nav.proPlan", "PRO PLAN")}</span>`
    : `<span>${t("nav.freePlan", "FREE PLAN")}</span>`;
}

document.addEventListener("erp:user-loaded", (e) => {
  renderPlanBadge(e.detail && e.detail.plan);
});

document.addEventListener("erp:locale-changed", () => {
  if (lastLoadedUser) renderPlanBadge(lastLoadedUser.plan);
  renderPageTitle();
});

function renderPageTitle() {
  const pageTitleEl = document.getElementById("shellPageTitle");
  if (!pageTitleEl) return;
  const fallbackText = document.body.getAttribute("data-page-title") || "Overview";
  const key = document.body.getAttribute("data-page-title-key");
  pageTitleEl.textContent = key ? t(key, fallbackText) : fallbackText;
}

// Iconița din header (lângă nume/rol) — reflectă avatarul ales, dacă există.
// Fără avatar_id (user care nu a deschis niciodată galeria), rămâne iconița
// implicită fa-user-shield din topbar.html, neatinsă.
document.addEventListener("erp:user-loaded", (e) => {
  const avatarId = e.detail && e.detail.avatar_id;
  if (avatarId) {
    applyAvatarToHeader(avatarId);
  }
});

// --- AVATAR UTILIZATOR (galerie iconițe electrician) ---

// Galerie fixă de 10 avatare tematice, randate ca SVG inline (fără upload de
// fișiere, fără imagini/CDN nou) — id-ul persistă în users.avatar_id (vezi
// authController.js, VALID_AVATAR_IDS trebuie să rămână identică cu lista de
// id-uri de mai jos). Stil geometric/flat: cap + cască de protecție + siluetă
// păr pe variantele "feminine", paletă discretă (fundaluri pastelate).
const AVATAR_CATALOG = [
  { id: "e1", gender: "m", bg: "#e2e8f0", hat: "#f97316", skin: "#f3c9a0" },
  { id: "e2", gender: "f", bg: "#dbeafe", hat: "#facc15", skin: "#e7b58a" },
  { id: "e3", gender: "m", bg: "#fee2e2", hat: "#0ea5e9", skin: "#c98a5b" },
  { id: "e4", gender: "f", bg: "#ede9fe", hat: "#f97316", skin: "#f3c9a0" },
  { id: "e5", gender: "m", bg: "#dcfce7", hat: "#facc15", skin: "#a9673f" },
  { id: "e6", gender: "f", bg: "#fef3c7", hat: "#0ea5e9", skin: "#e7b58a" },
  { id: "e7", gender: "m", bg: "#e0f2fe", hat: "#f97316", skin: "#c98a5b" },
  { id: "e8", gender: "f", bg: "#fce7f3", hat: "#facc15", skin: "#f3c9a0" },
  { id: "e9", gender: "m", bg: "#f1f5f9", hat: "#0ea5e9", skin: "#a9673f" },
  { id: "e10", gender: "f", bg: "#ecfeff", hat: "#f97316", skin: "#e7b58a" },
];

// Ținut la nivel de modul ca să putem re-emite erp:user-loaded (cu avatar_id
// proaspăt) după o salvare reușită, fără reload și fără un al doilea eveniment.
let lastLoadedUser = null;

function renderAvatarSvg(avatarId) {
  const cfg = AVATAR_CATALOG.find((a) => a.id === avatarId);
  if (!cfg) return "";
  const isFemale = cfg.gender === "f";
  // Păr desenat în două straturi, ca să rămână vizibil clar la dimensiune mică:
  // șuvițe laterale (peste marginea capului) + breton peste frunte, sub cască.
  const hairSide = isFemale
    ? `<ellipse cx="19.5" cy="33" rx="3.5" ry="8" fill="#3f2a1d"/><ellipse cx="44.5" cy="33" rx="3.5" ry="8" fill="#3f2a1d"/>`
    : "";
  const hairFringe = isFemale
    ? `<path d="M22 22a10 10 0 0 1 20 0v3H22v-3z" fill="#3f2a1d"/>`
    : "";
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Avatar electrician">
    <circle cx="32" cy="32" r="32" fill="${cfg.bg}"/>
    <path d="M16 54c0-9 7-15 16-15s16 6 16 15v2H16v-2z" fill="#475569"/>
    ${hairSide}
    <circle cx="32" cy="29" r="10" fill="${cfg.skin}"/>
    ${hairFringe}
    <path d="M21 25a11 11 0 0 1 22 0v1H21v-1z" fill="${cfg.hat}"/>
    <rect x="19" y="25" width="26" height="4" rx="2" fill="${cfg.hat}"/>
  </svg>`;
}

function applyAvatarToHeader(avatarId) {
  const btn = document.getElementById("headerAvatarBtn");
  if (btn && avatarId) {
    btn.innerHTML = renderAvatarSvg(avatarId);
  }
}

function renderAvatarGallery(selectedId) {
  const grid = document.getElementById("avatarGalleryGrid");
  if (!grid) return;
  grid.innerHTML = AVATAR_CATALOG.map(
    (cfg) => `
      <label class="avatar-option">
        <input type="radio" name="avatarChoice" class="avatar-option-input" value="${cfg.id}" ${cfg.id === selectedId ? "checked" : ""}>
        <span class="avatar-option-circle">${renderAvatarSvg(cfg.id)}</span>
      </label>
    `,
  ).join("");
}

// Mapare cod → cheie de traducere pentru răspunsul /auth/avatar (backend
// trimite `error`/`code`, NICIODATĂ text hardcodat de afișat direct — vezi
// authController.js/authCodes.js).
function mapAvatarCode(code) {
  switch (code) {
    case "INVALID_AVATAR":
      return t("header.invalidAvatar", "Avatar invalid.");
    case "SERVER_ERROR":
      return t("common.serverError", "A apărut o eroare de server. Încearcă din nou.");
    default:
      return null;
  }
}

async function saveAvatarChoice(avatarId) {
  const errorEl = document.getElementById("avatarPickerError");
  if (errorEl) errorEl.classList.add("d-none");

  try {
    const response = await API.put("/auth/avatar", { avatar_id: avatarId });
    if (!response || !response.success) {
      const err = new Error(
        mapAvatarCode(response && response.code) || t("header.avatarSaveFailed", "Nu s-a putut salva avatarul."),
      );
      err.code = response && response.code;
      throw err;
    }

    applyAvatarToHeader(avatarId);

    // Re-emite erp:user-loaded cu avatar_id proaspăt, ca paginile care ascultă
    // acest eveniment (ex. dashboard.js, banner-ul "Welcome back") să se
    // sincronizeze fără reload — reutilizează evenimentul existent.
    if (lastLoadedUser) {
      lastLoadedUser = { ...lastLoadedUser, avatar_id: avatarId };
      document.dispatchEvent(new CustomEvent("erp:user-loaded", { detail: lastLoadedUser }));
    }

    const modalEl = document.getElementById("avatarPickerModal");
    const modalInstance = modalEl && bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();
  } catch (err) {
    console.error("Eroare la salvarea avatarului:", err);
    if (errorEl) {
      errorEl.textContent = mapAvatarCode(err.code) || t("common.networkError", "Eroare de rețea. Încearcă din nou.");
      errorEl.classList.remove("d-none");
    }
  }
}

document.addEventListener("show.bs.modal", (e) => {
  if (e.target && e.target.id === "avatarPickerModal") {
    renderAvatarGallery(lastLoadedUser && lastLoadedUser.avatar_id);
  }
});

document.addEventListener("change", (e) => {
  if (e.target && e.target.classList.contains("avatar-option-input")) {
    saveAvatarChoice(e.target.value);
  }
});

// --- HELPER FUNCTIONS ---

async function loadComponent(containerId, componentPath) {
  const container = document.getElementById(containerId);
  if (!container) return;
  try {
    const response = await fetch(componentPath);
    if (response.ok) {
      container.innerHTML = await response.text();
    } else {
      console.error(`Eroare la încărcarea componentei ${componentPath}`);
    }
  } catch (err) {
    console.error(
      `Eroare de rețea la încărcarea componentei ${componentPath}:`,
      err,
    );
  }
}

function redirectToLogin() {
  window.location.href = "login.html";
}

function performLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  redirectToLogin();
}

async function loadCurrentUser() {
  const userNameEl = document.getElementById("shellUserName");
  const userRoleEl = document.getElementById("shellUserRole");

  try {
    const response = await API.get("/auth/me");

    // Sesiune invalidă / date lipsă (backend a răspuns, dar fără un user
    // valid) — nu doar 401/403, care sunt deja tratate global în api.js.
    if (!response || !response.success || !response.data) {
      performLogout();
      return;
    }

    const user = response.data;
    if (userNameEl) {
      userNameEl.textContent = user.full_name || user.email || t("header.defaultUserName", "Utilizator");
    }
    if (userRoleEl) {
      userRoleEl.textContent = user.role || t("header.defaultUserRole", "Administrator");
    }
    lastLoadedUser = user;

    // Permite paginilor individuale (ex. dashboard.html) să personalizeze
    // conținut propriu pe baza userului autentificat, fără un nou apel API.
    document.dispatchEvent(new CustomEvent("erp:user-loaded", { detail: user }));
  } catch (err) {
    // Eroare de rețea/timeout/5xx (backend indisponibil temporar) — sesiunea
    // rămâne valabilă, NU delogăm. Doar 401/403 explicite duc la logout,
    // iar acelea sunt deja tratate global în api.js (nu ajung aici ca throw).
    console.error("Eroare la încărcarea utilizatorului curent:", err);
  }
}
