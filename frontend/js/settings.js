document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("companySettingsForm");
  const fields = {
    company_name: document.getElementById("csCompanyName"),
    vat_number: document.getElementById("csVatNumber"),
    registration_number: document.getElementById("csRegistrationNumber"),
    address: document.getElementById("csAddress"),
    city: document.getElementById("csCity"),
    country: document.getElementById("csCountry"),
    postal_code: document.getElementById("csPostalCode"),
    iban: document.getElementById("csIban"),
    bank_name: document.getElementById("csBankName"),
    phone: document.getElementById("csPhone"),
    email: document.getElementById("csEmail"),
  };

  await loadSettings();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveSettings();
  });

  async function loadSettings() {
    try {
      const response = await API.get("/company-settings");
      if (response && response.success && response.data) {
        const settings = response.data;
        Object.keys(fields).forEach((key) => {
          if (settings[key] !== undefined && settings[key] !== null) {
            fields[key].value = settings[key];
          }
        });
      }
    } catch (err) {
      console.error("Eroare la încărcarea setărilor firmei:", err);
      Toast.show("Eroare de rețea la încărcarea setărilor.", "danger");
    }
  }

  async function saveSettings() {
    const payload = {};
    Object.keys(fields).forEach((key) => {
      payload[key] = fields[key].value.trim();
    });

    try {
      const response = await API.put("/company-settings", payload);
      if (response && response.success) {
        Toast.show("Datele firmei au fost salvate cu succes.", "success");
      } else {
        Toast.show(
          (response && response.message) || "Nu s-au putut salva datele.",
          "danger",
        );
      }
    } catch (err) {
      console.error("Eroare la salvarea setărilor firmei:", err);
      Toast.show(err.message || "Eroare de rețea la salvare.", "danger");
    }
  }
});
