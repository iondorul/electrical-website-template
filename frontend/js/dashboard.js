document.addEventListener("DOMContentLoaded", () => {
  // 1. ROUTE GUARD - Verificare Token
  const token = localStorage.getItem("token");

  if (!token) {
    console.warn("Acces neautorizat. Se redirectioneaza la login...");
    window.location.href = "login.html";
    return;
  }

  // 2. LOGOUT FUNCTIONALITY
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      // Stergem token-ul din localStorage
      localStorage.removeItem("token");

      // Redirectionare catre login
      window.location.href = "login.html";
    });
  }

  // 3. Mobile Sidebar Toggle
  const sidebarToggle = document.getElementById("sidebarToggle");
  const erpSidebar = document.getElementById("erpSidebar");

  if (sidebarToggle && erpSidebar) {
    sidebarToggle.addEventListener("click", () => {
      erpSidebar.classList.toggle("show");
    });
  }
});
