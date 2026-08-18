/**
 * Settings Controller
 * Randează sidebar-ul de tab-uri din window.SettingsTabs (populat de
 * fișierele din js/settings/*Tab.js) și gestionează comutarea între ele.
 * Adăugarea unui tab nou = un fișier nou + un <script> în settings.html,
 * fără a atinge acest fișier.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const navEl = document.getElementById("settingsNav");
  const contentEl = document.getElementById("settingsContent");
  const modalEl = document.getElementById("settingsModal");

  if (!navEl || !contentEl || !modalEl) return;

  const tabs = window.SettingsTabs || [];
  let activeTabId = tabs.length ? tabs[0].id : null;

  function renderNav() {
    navEl.innerHTML = tabs
      .map(
        (t) => `
          <div class="settings-nav-item ${t.id === activeTabId ? "active" : ""}" data-tab="${t.id}">
            <i class="fas ${t.icon}"></i>
            <span>${t.label}</span>
          </div>
        `,
      )
      .join("");

    navEl.querySelectorAll(".settings-nav-item").forEach((el) => {
      el.addEventListener("click", () => switchTab(el.dataset.tab));
    });
  }

  async function switchTab(tabId) {
    if (tabId === activeTabId && contentEl.dataset.loaded === tabId) return;
    activeTabId = tabId;
    renderNav();

    const tab = tabs.find((t) => t.id === tabId);
    contentEl.innerHTML = `
      <div class="text-center text-muted py-5">
        <span class="spinner-border spinner-border-sm"></span>
      </div>
    `;

    if (tab) {
      await tab.render(contentEl);
      contentEl.dataset.loaded = tabId;
    }
  }

  const requestedTab = window.location.hash.replace("#", "");
  if (requestedTab && tabs.some((t) => t.id === requestedTab)) {
    activeTabId = requestedTab;
  }

  renderNav();
  if (activeTabId) {
    await switchTab(activeTabId);
  }

  modalEl.addEventListener("hidden.bs.modal", () => {
    window.location.href = "dashboard.html";
  });

  const modalInstance = new bootstrap.Modal(modalEl);
  modalInstance.show();
});
