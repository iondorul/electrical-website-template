/**
 * Settings Tab: Date Firmă
 * Reutilizează endpoint-ul existent /company-settings (GET/PUT).
 */
(function () {
  const FIELD_KEYS = [
    "company_name",
    "vat_number",
    "registration_number",
    "address",
    "city",
    "country",
    "postal_code",
    "iban",
    "bank_name",
    "phone",
    "email",
  ];

  function template() {
    return `
      <h5 class="settings-section-title">${t("settings.company.title", "Date Firmă")}</h5>
      <p class="settings-section-desc">
        ${t("settings.company.desc", "Aceste date apar în antetul facturilor PDF trimise clienților (nume firmă, adresă, CUI/CIF, IBAN).")}
      </p>

      <form id="companySettingsForm">
        <div class="row g-3">
          <div class="col-12 col-md-6">
            <label for="csCompanyName" class="form-label fw-semibold">${t("settings.company.companyName", "Denumire firmă *")}</label>
            <input type="text" class="form-control" id="csCompanyName" required
              placeholder="${t("settings.company.companyNamePlaceholder", "ex. S.C. ElectricalVPF S.R.L.")}">
          </div>
          <div class="col-12 col-md-3">
            <label for="csVatNumber" class="form-label fw-semibold">${t("settings.company.vatNumber", "CUI / CIF")}</label>
            <input type="text" class="form-control" id="csVatNumber" placeholder="RO12345678">
          </div>
          <div class="col-12 col-md-3">
            <label for="csRegistrationNumber" class="form-label fw-semibold">${t("settings.company.registrationNumber", "Nr. Reg. Com.")}</label>
            <input type="text" class="form-control" id="csRegistrationNumber" placeholder="J01/1234/2020">
          </div>

          <div class="col-12">
            <label for="csAddress" class="form-label fw-semibold">${t("settings.company.address", "Adresă")}</label>
            <input type="text" class="form-control" id="csAddress" placeholder="${t("settings.company.addressPlaceholder", "Str. Exemplu, nr. 1")}">
          </div>
          <div class="col-12 col-md-4">
            <label for="csCity" class="form-label fw-semibold">${t("settings.company.city", "Oraș")}</label>
            <input type="text" class="form-control" id="csCity">
          </div>
          <div class="col-12 col-md-4">
            <label for="csCountry" class="form-label fw-semibold">${t("settings.company.country", "Țară")}</label>
            <input type="text" class="form-control" id="csCountry" value="România">
          </div>
          <div class="col-12 col-md-4">
            <label for="csPostalCode" class="form-label fw-semibold">${t("settings.company.postalCode", "Cod poștal")}</label>
            <input type="text" class="form-control" id="csPostalCode">
          </div>

          <div class="col-12 col-md-6">
            <label for="csIban" class="form-label fw-semibold">${t("settings.company.iban", "IBAN")}</label>
            <input type="text" class="form-control" id="csIban" placeholder="RO00 XXXX 0000 0000 0000 0000">
          </div>
          <div class="col-12 col-md-6">
            <label for="csBankName" class="form-label fw-semibold">${t("settings.company.bankName", "Bancă")}</label>
            <input type="text" class="form-control" id="csBankName">
          </div>

          <div class="col-12 col-md-6">
            <label for="csPhone" class="form-label fw-semibold">${t("settings.company.phone", "Telefon")}</label>
            <input type="text" class="form-control" id="csPhone">
          </div>
          <div class="col-12 col-md-6">
            <label for="csEmail" class="form-label fw-semibold">${t("settings.company.email", "Email")}</label>
            <input type="email" class="form-control" id="csEmail">
          </div>
        </div>

        <div class="mt-4">
          <button type="submit" class="btn btn-primary fw-semibold px-4" id="btnSaveCompanySettings">
            <i class="fas fa-floppy-disk me-2"></i> ${t("common.save", "Salvează")}
          </button>
        </div>
      </form>
    `;
  }

  function fieldRefs(container) {
    return {
      company_name: container.querySelector("#csCompanyName"),
      vat_number: container.querySelector("#csVatNumber"),
      registration_number: container.querySelector("#csRegistrationNumber"),
      address: container.querySelector("#csAddress"),
      city: container.querySelector("#csCity"),
      country: container.querySelector("#csCountry"),
      postal_code: container.querySelector("#csPostalCode"),
      iban: container.querySelector("#csIban"),
      bank_name: container.querySelector("#csBankName"),
      phone: container.querySelector("#csPhone"),
      email: container.querySelector("#csEmail"),
    };
  }

  async function loadSettings(fields) {
    try {
      const response = await API.get("/company-settings");
      if (response && response.success && response.data) {
        const settings = response.data;
        FIELD_KEYS.forEach((key) => {
          if (settings[key] !== undefined && settings[key] !== null) {
            fields[key].value = settings[key];
          }
        });
      }
    } catch (err) {
      console.error("Eroare la încărcarea setărilor firmei:", err);
      Toast.show(t("settings.company.loadError", "Eroare de rețea la încărcarea setărilor."), "danger");
    }
  }

  async function saveSettings(fields, btn) {
    const payload = {};
    FIELD_KEYS.forEach((key) => {
      payload[key] = fields[key].value.trim();
    });

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

    try {
      const response = await API.put("/company-settings", payload);
      if (response && response.success) {
        Toast.show(t("settings.company.saved", "Datele firmei au fost salvate cu succes."), "success");
      } else {
        Toast.show(
          (response && response.message) || t("settings.company.saveFailed", "Nu s-au putut salva datele."),
          "danger",
        );
      }
    } catch (err) {
      console.error("Eroare la salvarea setărilor firmei:", err);
      Toast.show(err.message || t("common.networkError", "Eroare de rețea la salvare."), "danger");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  const tab = {
    id: "company",
    label: "Date Firmă",
    labelKey: "settings.tabs.company",
    icon: "fa-building",
    async render(container) {
      container.innerHTML = template();
      const fields = fieldRefs(container);
      const form = container.querySelector("#companySettingsForm");
      const btn = container.querySelector("#btnSaveCompanySettings");

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        await saveSettings(fields, btn);
      });

      await loadSettings(fields);
    },
  };

  window.SettingsTabs = window.SettingsTabs || [];
  window.SettingsTabs.push(tab);
})();
