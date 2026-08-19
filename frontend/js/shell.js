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

  // 3. SET ACTIVE MENU ITEM
  const currentPage =
    window.location.pathname.split("/").pop() || "dashboard.html";
  const activeLink = document.querySelector(
    `.nav-link[data-page="${currentPage}"]`,
  );
  if (activeLink) {
    activeLink.classList.add("active");
  }

  // 4. SET DYNAMIC PAGE TITLE FROM <body data-page-title="...">
  const pageTitleEl = document.getElementById("shellPageTitle");
  if (pageTitleEl) {
    const customTitle =
      document.body.getAttribute("data-page-title") || "Overview";
    pageTitleEl.textContent = customTitle;
  }

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
// evenimentul erp:user-loaded, emis mai jos de loadCurrentUser().
document.addEventListener("erp:user-loaded", (e) => {
  const badgeEl = document.getElementById("sidebarPlanBadge");
  if (!badgeEl) return;

  const isPro = e.detail && e.detail.plan === "pro";

  badgeEl.className = `plan-badge ${isPro ? "plan-badge-pro" : "plan-badge-free"}`;
  badgeEl.innerHTML = isPro
    ? '<i class="fas fa-crown plan-badge-icon"></i><span>PRO PLAN</span>'
    : "<span>FREE PLAN</span>";
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
      userNameEl.textContent = user.full_name || user.email || "Utilizator";
    }
    if (userRoleEl) {
      userRoleEl.textContent = user.role || "Administrator";
    }
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
