/**
 * Settings Tab: Display
 * Selector de temă vizuală (System/Light/Dark) — motorul de temă real
 * (getStoredThemePref/setTheme/resolveTheme) trăiește în frontend/js/theme.js,
 * încărcat global pe toate paginile (înaintea acestui script) — acest fișier
 * doar randează UI-ul și apelează funcțiile deja expuse global.
 *
 * "Display" rămâne netradus/împrumutat în toate cele 9 limbi (cerință
 * explicită), la fel ca alte cuvinte tehnice scurte deja folosite ca atare în
 * aplicație — de aceea NU are `labelKey`, doar `label` literal (vezi
 * settings.js: `tab.labelKey ? t(tab.labelKey, tab.label) : tab.label`).
 * Conținutul tab-ului (descriere + cele 3 opțiuni) rămâne complet tradus,
 * la fel ca restul aplicației.
 */
(function () {
  const OPTIONS = [
    {
      value: "system",
      icon: "fa-desktop",
      labelKey: "settings.display.system.label",
      labelFallback: "System",
      descKey: "settings.display.system.desc",
      descFallback: "Urmărește automat preferința sistemului de operare.",
    },
    {
      value: "light",
      icon: "fa-sun",
      labelKey: "settings.display.light.label",
      labelFallback: "Light",
      descKey: "settings.display.light.desc",
      descFallback: "Fundal deschis, mereu.",
    },
    {
      value: "dark",
      icon: "fa-moon",
      labelKey: "settings.display.dark.label",
      labelFallback: "Dark",
      descKey: "settings.display.dark.desc",
      descFallback: "Fundal întunecat, mereu.",
    },
  ];

  function optionCardHtml(option, activePref) {
    const isActive = option.value === activePref;
    return `
      <label class="theme-option-card ${isActive ? "active" : ""}" data-theme-option="${option.value}">
        <input type="radio" name="themeOption" value="${option.value}" class="visually-hidden" ${isActive ? "checked" : ""}>
        <div class="theme-option-icon"><i class="fas ${option.icon}"></i></div>
        <div class="theme-option-label">${t(option.labelKey, option.labelFallback)}</div>
        <div class="theme-option-desc">${t(option.descKey, option.descFallback)}</div>
        <i class="fas fa-circle-check theme-option-check"></i>
      </label>
    `;
  }

  function template() {
    const activePref = getStoredThemePref();
    return `
      <h5 class="settings-section-title">Display</h5>
      <p class="settings-section-desc">
        ${t("settings.display.desc", "Alege cum arată aplicația — poți urmări automat sistemul de operare sau fixa un mod anume.")}
      </p>

      <div class="theme-option-grid">
        ${OPTIONS.map((option) => optionCardHtml(option, activePref)).join("")}
      </div>
    `;
  }

  const tab = {
    id: "display",
    label: "Display",
    icon: "fa-display",
    async render(container) {
      container.innerHTML = template();

      container.querySelectorAll(".theme-option-card").forEach((card) => {
        card.addEventListener("click", () => {
          const value = card.dataset.themeOption;
          setTheme(value);

          container.querySelectorAll(".theme-option-card").forEach((c) => {
            const isActive = c === card;
            c.classList.toggle("active", isActive);
            c.querySelector("input").checked = isActive;
          });
        });
      });
    },
  };

  window.SettingsTabs = window.SettingsTabs || [];
  window.SettingsTabs.push(tab);
})();
