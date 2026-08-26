/**
 * Settings Tab: Cont & Securitate
 * Nume/telefon + schimbare parolă -> conectate la /api/auth/me, /api/auth/profile, /api/auth/password.
 * 2FA este doar vizual (fără logică backend încă).
 */
(function () {
  function template() {
    return `
      <h5 class="settings-section-title">${t("settings.account.title", "Cont & Securitate")}</h5>
      <p class="settings-section-desc">
        ${t("settings.account.desc", "Datele contului tău și opțiunile de securitate.")}
      </p>

      <form id="accountProfileForm">
        <div class="row g-3">
          <div class="col-12 col-md-6">
            <label for="accFullName" class="form-label fw-semibold">${t("settings.account.fullName", "Nume utilizator")}</label>
            <input type="text" class="form-control" id="accFullName" required>
          </div>
          <div class="col-12 col-md-6">
            <label for="accEmail" class="form-label fw-semibold">${t("settings.account.email", "Email")}</label>
            <input type="email" class="form-control" id="accEmail" readonly>
          </div>
          <div class="col-12 col-md-6">
            <label for="accPhone" class="form-label fw-semibold">${t("settings.account.phone", "Telefon")}</label>
            <input type="text" class="form-control" id="accPhone" placeholder="+40 7xx xxx xxx">
          </div>
        </div>
        <div class="mt-3">
          <button type="submit" class="btn btn-primary fw-semibold px-4" id="btnSaveAccountProfile">
            <i class="fas fa-floppy-disk me-2"></i> ${t("common.saveChanges", "Salvează modificările")}
          </button>
        </div>
      </form>

      <div class="settings-subblock">
        <div class="settings-subblock-title">${t("settings.account.changePassword", "Schimbă parola")}</div>
        <form id="changePasswordForm">
          <div class="row g-3">
            <div class="col-12 col-md-4">
              <label for="accCurrentPassword" class="form-label">${t("settings.account.currentPassword", "Parola curentă")}</label>
              <div class="position-relative settings-password-field">
                <input type="password" class="form-control pe-5" id="accCurrentPassword" autocomplete="current-password">
                <button type="button" class="settings-password-toggle" data-target="accCurrentPassword" tabindex="-1" aria-label="${t("settings.account.togglePassword", "Arată/ascunde parola")}">
                  <i class="fas fa-eye"></i>
                </button>
              </div>
            </div>
            <div class="col-12 col-md-4">
              <label for="accNewPassword" class="form-label">${t("settings.account.newPassword", "Parolă nouă")}</label>
              <div class="position-relative settings-password-field">
                <input type="password" class="form-control pe-5" id="accNewPassword" autocomplete="new-password">
                <button type="button" class="settings-password-toggle" data-target="accNewPassword" tabindex="-1" aria-label="${t("settings.account.togglePassword", "Arată/ascunde parola")}">
                  <i class="fas fa-eye"></i>
                </button>
              </div>
            </div>
            <div class="col-12 col-md-4">
              <label for="accConfirmPassword" class="form-label">${t("settings.account.confirmPassword", "Confirmă parola nouă")}</label>
              <div class="position-relative settings-password-field">
                <input type="password" class="form-control pe-5" id="accConfirmPassword" autocomplete="new-password">
                <button type="button" class="settings-password-toggle" data-target="accConfirmPassword" tabindex="-1" aria-label="${t("settings.account.togglePassword", "Arată/ascunde parola")}">
                  <i class="fas fa-eye"></i>
                </button>
              </div>
              <div class="settings-field-feedback" id="accConfirmPasswordFeedback">
                ${t("settings.account.passwordMismatch", "Parolele nu coincid")}
              </div>
            </div>
          </div>
          <div class="mt-3">
            <button type="submit" class="btn btn-outline-primary fw-semibold px-4" id="btnChangePassword" disabled>
              <i class="fas fa-key me-2"></i> ${t("settings.account.changePassword", "Schimbă parola")}
            </button>
          </div>
        </form>
      </div>

      <div class="settings-subblock">
        <div class="d-flex align-items-center justify-content-between">
          <div>
            <div class="settings-subblock-title mb-1">
              ${t("settings.account.twoFactor", "Autentificare în doi pași (2FA)")}
              <span class="settings-badge-soon ms-2">${t("settings.comingSoon", "ÎN CURÂND")}</span>
            </div>
            <p class="text-muted small mb-0" style="max-width: 420px;">
              ${t("settings.account.twoFactorDesc", "Adaugă un nivel suplimentar de securitate contului tău la autentificare.")}
            </p>
          </div>
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" role="switch" id="acc2faToggle">
          </div>
        </div>
      </div>
    `;
  }

  function wirePasswordToggles(container) {
    container.querySelectorAll(".settings-password-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = container.querySelector(`#${btn.dataset.target}`);
        const icon = btn.querySelector("i");
        if (!input) return;

        const isPassword = input.getAttribute("type") === "password";
        input.setAttribute("type", isPassword ? "text" : "password");

        if (icon) {
          icon.classList.toggle("fa-eye", !isPassword);
          icon.classList.toggle("fa-eye-slash", isPassword);
        }
      });
    });
  }

  function wirePasswordMatchValidation(container) {
    const currentInput = container.querySelector("#accCurrentPassword");
    const newInput = container.querySelector("#accNewPassword");
    const confirmInput = container.querySelector("#accConfirmPassword");
    const confirmFeedback = container.querySelector("#accConfirmPasswordFeedback");
    const submitBtn = container.querySelector("#btnChangePassword");

    function updateState() {
      const newVal = newInput.value;
      const confirmVal = confirmInput.value;

      let passwordsMatch = true;
      if (confirmVal) {
        passwordsMatch = newVal === confirmVal;
        confirmInput.classList.toggle("is-invalid", !passwordsMatch);
        confirmInput.classList.toggle("is-valid", passwordsMatch);
        confirmFeedback.classList.toggle("show", !passwordsMatch);
      } else {
        confirmInput.classList.remove("is-invalid", "is-valid");
        confirmFeedback.classList.remove("show");
      }

      const allFilled = Boolean(
        currentInput.value && newVal && confirmVal,
      );
      submitBtn.disabled = !allFilled || !passwordsMatch;
    }

    [currentInput, newInput, confirmInput].forEach((input) => {
      input.addEventListener("input", updateState);
    });

    updateState();
  }

  async function loadProfile(container) {
    try {
      const response = await API.get("/auth/me");
      // Răspuns invalid/gol (nu 401/403, alea sunt tratate deja în api.js)
      // -> sesiunea nu mai corespunde unui user valid, delogăm.
      if (!response || !response.success || !response.data) {
        performLogout();
        return;
      }
      const user = response.data;
      container.querySelector("#accFullName").value = user.full_name || "";
      container.querySelector("#accEmail").value = user.email || "";
      container.querySelector("#accPhone").value = user.phone || "";
    } catch (err) {
      // Eroare de rețea/timeout/5xx — sesiunea rămâne valabilă, NU delogăm.
      console.error("Eroare la încărcarea profilului:", err);
      Toast.show(t("settings.account.loadError", "Eroare de rețea la încărcarea profilului."), "danger");
    }
  }

  async function saveProfile(container, btn) {
    const fullName = container.querySelector("#accFullName").value.trim();
    const phone = container.querySelector("#accPhone").value.trim();

    if (!fullName) {
      Toast.show(t("settings.account.nameRequired", "Numele utilizatorului este obligatoriu."), "danger");
      return;
    }

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

    try {
      const response = await API.put("/auth/profile", {
        full_name: fullName,
        phone,
      });
      if (response && response.success) {
        Toast.show(t("settings.account.profileSaved", "Profilul a fost actualizat cu succes."), "success");
      } else {
        Toast.show(
          (response && response.message) || t("settings.account.profileSaveFailed", "Nu s-a putut actualiza profilul."),
          "danger",
        );
      }
    } catch (err) {
      console.error("Eroare la salvarea profilului:", err);
      Toast.show(err.message || t("common.networkError", "Eroare de rețea la salvare."), "danger");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  async function changePassword(container, btn) {
    const current = container.querySelector("#accCurrentPassword").value;
    const next = container.querySelector("#accNewPassword").value;
    const confirm = container.querySelector("#accConfirmPassword").value;

    if (!current || !next || !confirm) {
      Toast.show(t("settings.account.passwordFieldsRequired", "Completează toate câmpurile pentru schimbarea parolei."), "danger");
      return;
    }
    if (next.length < 6) {
      Toast.show(t("settings.account.passwordTooShort", "Noua parolă trebuie să aibă cel puțin 6 caractere."), "danger");
      return;
    }
    if (next !== confirm) {
      Toast.show(t("settings.account.passwordMismatchToast", "Parola nouă și confirmarea nu coincid."), "danger");
      return;
    }

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

    try {
      const response = await API.put("/auth/password", {
        current_password: current,
        new_password: next,
      });
      if (response && response.success) {
        Toast.show(t("settings.account.passwordChanged", "Parola a fost schimbată cu succes."), "success");
        container.querySelector("#changePasswordForm").reset();
        const confirmInput = container.querySelector("#accConfirmPassword");
        confirmInput.classList.remove("is-invalid", "is-valid");
        container.querySelector("#accConfirmPasswordFeedback").classList.remove("show");
        container.querySelector("#btnChangePassword").disabled = true;
      } else {
        Toast.show(
          (response && response.message) || t("settings.account.passwordChangeFailed", "Nu s-a putut schimba parola."),
          "danger",
        );
      }
    } catch (err) {
      console.error("Eroare la schimbarea parolei:", err);
      Toast.show(err.message || t("common.networkError", "Eroare de rețea la schimbarea parolei."), "danger");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  const tab = {
    id: "account",
    label: "Cont & Securitate",
    labelKey: "settings.tabs.account",
    icon: "fa-user",
    async render(container) {
      container.innerHTML = template();

      const profileForm = container.querySelector("#accountProfileForm");
      const profileBtn = container.querySelector("#btnSaveAccountProfile");
      profileForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await saveProfile(container, profileBtn);
      });

      const passwordForm = container.querySelector("#changePasswordForm");
      const passwordBtn = container.querySelector("#btnChangePassword");
      passwordForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await changePassword(container, passwordBtn);
      });

      wirePasswordToggles(container);
      wirePasswordMatchValidation(container);

      // 2FA: doar vizual, fără backend momentan.
      const toggle2fa = container.querySelector("#acc2faToggle");
      if (toggle2fa) {
        toggle2fa.addEventListener("change", () => {
          Toast.show(
            t("settings.account.twoFactorSoon", "Autentificarea în doi pași va fi disponibilă în curând."),
            "info",
          );
        });
      }

      await loadProfile(container);
    },
  };

  window.SettingsTabs = window.SettingsTabs || [];
  window.SettingsTabs.push(tab);
})();
