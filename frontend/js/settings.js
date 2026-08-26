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

  // Fiecare tab randează text tradus SINCRON, înainte de orice apel API
  // propriu (spre deosebire de dashboard.js, unde traducerea așteaptă oricum
  // un răspuns real de la backend) — fără acest await, primul randare ar
  // putea prinde dicționarele încă neîncărcate și ar afișa scurt fallback-ul
  // românesc chiar și cu limba pe English (confirmat empiric).
  if (window.i18nReady) await window.i18nReady;

  const tabs = window.SettingsTabs || [];
  let activeTabId = tabs.length ? tabs[0].id : null;

  function renderNav() {
    navEl.innerHTML = tabs
      .map(
        (tab) => `
          <div class="settings-nav-item ${tab.id === activeTabId ? "active" : ""}" data-tab="${tab.id}">
            <i class="fas ${tab.icon}"></i>
            <span>${tab.labelKey ? t(tab.labelKey, tab.label) : tab.label}</span>
          </div>
        `,
      )
      .join("");

    navEl.querySelectorAll(".settings-nav-item").forEach((el) => {
      el.addEventListener("click", () => switchTab(el.dataset.tab));
    });
  }

  // La schimbarea de limbă: retraduce etichetele din sidebar și re-randează
  // tab-ul activ (fiecare tab își reconstruiește propriul markup din
  // template(), care apelează t() — același mecanism ca la comutarea inițială
  // de tab, doar declanșat de un eveniment diferit).
  document.addEventListener("erp:locale-changed", () => {
    renderNav();
    if (activeTabId) {
      contentEl.dataset.loaded = "";
      switchTab(activeTabId);
    }
  });

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
