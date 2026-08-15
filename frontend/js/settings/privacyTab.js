/**
 * Settings Tab: Confidențialitate
 * Export date / ștergere cont sunt pregătite structural, fără acțiuni reale
 * asupra datelor deocamdată (butoanele afișează un mesaj informativ).
 */
(function () {
  const DELETE_CONFIRM_WORD = "ȘTERGE";

  function template() {
    return `
      <h5 class="settings-section-title">Confidențialitate</h5>
      <p class="settings-section-desc">
        Controlează datele contului tău și accesează documentele legale.
      </p>

      <div class="d-flex align-items-center justify-content-between border rounded-3 p-3 mb-3">
        <div>
          <div class="fw-semibold">Exportă datele contului</div>
          <div class="text-muted small">Descarcă o copie a datelor tale (clienți, proiecte, facturi).</div>
        </div>
        <button type="button" class="btn btn-outline-secondary fw-semibold" id="btnExportData">
          <i class="fas fa-download me-2"></i> Exportă
        </button>
      </div>

      <div class="mb-4">
        <a href="#" class="settings-link-placeholder" id="linkTerms">
          <i class="fas fa-file-lines"></i> Termeni și Condiții
        </a>
        <br>
        <a href="#" class="settings-link-placeholder mt-2 d-inline-flex" id="linkPrivacyPolicy">
          <i class="fas fa-shield-halved"></i> Politică de Confidențialitate
        </a>
      </div>

      <div class="settings-subblock">
        <div class="settings-subblock-title text-danger">Zonă periculoasă</div>
        <div class="settings-danger-zone">
          <div class="fw-semibold mb-1">Șterge contul</div>
          <p class="text-muted small mb-3">
            Această acțiune este permanentă și va șterge toate datele asociate contului tău.
          </p>

          <div id="deleteAccountStep1">
            <button type="button" class="btn btn-outline-danger fw-semibold" id="btnDeleteAccountStart">
              <i class="fas fa-trash-alt me-2"></i> Șterge Contul
            </button>
          </div>

          <div id="deleteAccountStep2" class="d-none">
            <label for="deleteAccountConfirmInput" class="form-label small">
              Scrie <strong>${DELETE_CONFIRM_WORD}</strong> pentru a confirma:
            </label>
            <div class="d-flex gap-2 flex-wrap">
              <input type="text" class="form-control" id="deleteAccountConfirmInput"
                style="max-width: 220px;" autocomplete="off">
              <button type="button" class="btn btn-danger fw-semibold" id="btnDeleteAccountConfirm" disabled>
                Confirmă Ștergerea Definitivă
              </button>
              <button type="button" class="btn btn-light fw-semibold" id="btnDeleteAccountCancel">
                Anulează
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
    icon: "fa-lock",
    async render(container) {
      container.innerHTML = template();

      const exportBtn = container.querySelector("#btnExportData");
      exportBtn.addEventListener("click", () => {
        Toast.show("Exportul datelor va fi disponibil în curând.", "info");
      });

      wirePlaceholderLink(
        container,
        "#linkTerms",
        "Termenii și Condițiile vor fi disponibile în curând.",
      );
      wirePlaceholderLink(
        container,
        "#linkPrivacyPolicy",
        "Politica de Confidențialitate va fi disponibilă în curând.",
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
        confirmBtn.disabled = confirmInput.value.trim() !== DELETE_CONFIRM_WORD;
      });

      confirmBtn.addEventListener("click", () => {
        Toast.show(
          "Ștergerea contului va fi disponibilă în curând. Contactează suportul pentru asistență.",
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
