/**
 * Settings Tab: Confidențialitate
 * Export date / ștergere cont sunt pregătite structural, fără acțiuni reale
 * asupra datelor deocamdată (butoanele afișează un mesaj informativ).
 */
(function () {
  // Cuvântul de confirmare urmează limba curentă — pur client-side, fără nicio
  // validare backend legată de el (butonul e doar un placeholder informativ),
  // deci traducerea lui nu atinge nicio logică reală.
  function getDeleteConfirmWord() {
    return t("settings.privacy.deleteConfirmWord", "ȘTERGE");
  }

  function template() {
    const deleteConfirmWord = getDeleteConfirmWord();
    return `
      <h5 class="settings-section-title">${t("settings.privacy.title", "Confidențialitate")}</h5>
      <p class="settings-section-desc">
        ${t("settings.privacy.desc", "Controlează datele contului tău și accesează documentele legale.")}
      </p>

      <div class="d-flex align-items-center justify-content-between border rounded-3 p-3 mb-3">
        <div>
          <div class="fw-semibold">${t("settings.privacy.exportTitle", "Exportă datele contului")}</div>
          <div class="text-muted small">${t("settings.privacy.exportDesc", "Descarcă o copie a datelor tale (clienți, proiecte, facturi).")}</div>
        </div>
        <button type="button" class="btn btn-outline-secondary fw-semibold" id="btnExportData">
          <i class="fas fa-download me-2"></i> ${t("settings.privacy.export", "Exportă")}
        </button>
      </div>

      <div class="mb-4">
        <a href="#" class="settings-link-placeholder" id="linkTerms">
          <i class="fas fa-file-lines"></i> ${t("settings.privacy.terms", "Termeni și Condiții")}
        </a>
        <br>
        <a href="#" class="settings-link-placeholder mt-2 d-inline-flex" id="linkPrivacyPolicy">
          <i class="fas fa-shield-halved"></i> ${t("settings.privacy.privacyPolicy", "Politică de Confidențialitate")}
        </a>
      </div>

      <div class="settings-subblock">
        <div class="settings-subblock-title text-danger">${t("settings.privacy.dangerZone", "Zonă periculoasă")}</div>
        <div class="settings-danger-zone">
          <div class="fw-semibold mb-1">${t("settings.privacy.deleteAccount", "Șterge contul")}</div>
          <p class="text-muted small mb-3">
            ${t("settings.privacy.deleteAccountDesc", "Această acțiune este permanentă și va șterge toate datele asociate contului tău.")}
          </p>

          <div id="deleteAccountStep1">
            <button type="button" class="btn btn-outline-danger fw-semibold" id="btnDeleteAccountStart">
              <i class="fas fa-trash-alt me-2"></i> ${t("settings.privacy.deleteAccount", "Șterge Contul")}
            </button>
          </div>

          <div id="deleteAccountStep2" class="d-none">
            <label for="deleteAccountConfirmInput" class="form-label small">
              ${t("settings.privacy.typeToConfirm", "Scrie {{word}} pentru a confirma:", { word: `<strong>${deleteConfirmWord}</strong>` })}
            </label>
            <div class="d-flex gap-2 flex-wrap">
              <input type="text" class="form-control" id="deleteAccountConfirmInput"
                style="max-width: 220px;" autocomplete="off">
              <button type="button" class="btn btn-danger fw-semibold" id="btnDeleteAccountConfirm" disabled>
                ${t("settings.privacy.confirmDelete", "Confirmă Ștergerea Definitivă")}
              </button>
              <button type="button" class="btn btn-light fw-semibold" id="btnDeleteAccountCancel">
                ${t("common.cancel", "Anulează")}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function wirePlaceholderLink(container, selector, message) {
    const link = container.querySelector(selector);
    if (!link) return;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      Toast.show(message, "info");
    });
  }

  const tab = {
    id: "privacy",
    label: "Confidențialitate",
    labelKey: "settings.tabs.privacy",
    icon: "fa-lock",
    async render(container) {
      container.innerHTML = template();

      const exportBtn = container.querySelector("#btnExportData");
      exportBtn.addEventListener("click", () => {
        Toast.show(t("settings.privacy.exportSoon", "Exportul datelor va fi disponibil în curând."), "info");
      });

      wirePlaceholderLink(
        container,
        "#linkTerms",
        t("settings.privacy.termsSoon", "Termenii și Condițiile vor fi disponibile în curând."),
      );
      wirePlaceholderLink(
        container,
        "#linkPrivacyPolicy",
        t("settings.privacy.privacyPolicySoon", "Politica de Confidențialitate va fi disponibilă în curând."),
      );

      const step1 = container.querySelector("#deleteAccountStep1");
      const step2 = container.querySelector("#deleteAccountStep2");
      const startBtn = container.querySelector("#btnDeleteAccountStart");
      const cancelBtn = container.querySelector("#btnDeleteAccountCancel");
      const confirmInput = container.querySelector("#deleteAccountConfirmInput");
      const confirmBtn = container.querySelector("#btnDeleteAccountConfirm");

      startBtn.addEventListener("click", () => {
        step1.classList.add("d-none");
        step2.classList.remove("d-none");
        confirmInput.value = "";
        confirmBtn.disabled = true;
        confirmInput.focus();
      });

      cancelBtn.addEventListener("click", () => {
        step2.classList.add("d-none");
        step1.classList.remove("d-none");
      });

      confirmInput.addEventListener("input", () => {
        confirmBtn.disabled = confirmInput.value.trim() !== getDeleteConfirmWord();
      });

      confirmBtn.addEventListener("click", () => {
        Toast.show(
          t("settings.privacy.deleteSoon", "Ștergerea contului va fi disponibilă în curând. Contactează suportul pentru asistență."),
          "info",
        );
        step2.classList.add("d-none");
        step1.classList.remove("d-none");
      });
    },
  };

  window.SettingsTabs = window.SettingsTabs || [];
  window.SettingsTabs.push(tab);
})();
