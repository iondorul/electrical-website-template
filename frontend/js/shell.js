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

  // 5. SET USER INFO IN TOPBAR
  const userNameEl = document.getElementById("shellUserName");
  const userRoleEl = document.getElementById("shellUserRole");

  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");

  if (userNameEl) {
    userNameEl.textContent =
      savedUser.name || savedUser.email || "Valentin Ion";
  }
  if (userRoleEl) {
    userRoleEl.textContent = savedUser.role || "Administrator";
  }

  // 6. SETUP LOGOUT EVENT
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      redirectToLogin();
    });
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
