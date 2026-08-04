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

  // 5. SET USER INFO IN TOPBAR (Fallback temporar până la modulul de Auth)
  const userNameEl = document.getElementById("shellUserName");
  const userRoleEl = document.getElementById("shellUserRole");

  // Încercăm din localStorage sau punem fallback
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");

  if (userNameEl) {
    userNameEl.textContent =
      savedUser.name || savedUser.email || "Valentin Ion";
  }
  if (userRoleEl) {
    userRoleEl.textContent = savedUser.role || "Administrator";
  }

  // 6. SETUP LOGOUT & MOBILE TOGGLE EVENTS
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      redirectToLogin();
    });
  }

  const sidebarToggle = document.getElementById("sidebarToggle");
  const erpSidebar = document.getElementById("erpSidebar");
  if (sidebarToggle && erpSidebar) {
    sidebarToggle.addEventListener("click", () => {
      erpSidebar.classList.toggle("show");
    });
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
