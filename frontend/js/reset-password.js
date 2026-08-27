document.addEventListener("DOMContentLoaded", async () => {
  // Pagină publică, fără sidebar/topbar ERP (shell.js) — switcher-ul e deja
  // în markup-ul static al paginii, deci inițializăm direct, fără să așteptăm
  // evenimentul erp:shell-ready (care nu se emite niciodată aici). Așteptat
  // înainte de orice t() de mai jos (inclusiv cazul token lipsă, câteva
  // linii mai jos) — altfel ar afișa scurt fallback-ul românesc.
  await initLangSwitcher();

  const form = document.getElementById("resetPasswordForm");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmNewPassword");
  const resetButton = document.getElementById("resetButton");
  const resetButtonText = document.getElementById("resetButtonText");
  const resetSpinner = document.getElementById("resetSpinner");
  const resetAlert = document.getElementById("resetPasswordAlert");
  const invalidTokenState = document.getElementById("invalidTokenState");
  const invalidTokenMessage = document.getElementById("invalidTokenMessage");

  const token = new URLSearchParams(window.location.search).get("token");

  // Mapare cod → cheie de traducere pentru răspunsurile /auth/reset-password
  // (backend trimite `code`, NICIODATĂ text hardcodat de afișat direct — vezi
  // authController.js/AuthCodes). RESET_TOKEN_INVALID/RESET_TOKEN_EXPIRED sunt
  // distincte (interogare în 2 pași pe backend) — înlocuiește complet vechea
  // logică de căutare a cuvântului "expirat" în textul brut al răspunsului.
  function mapResetPasswordErrorCode(code) {
    switch (code) {
      case "RESET_TOKEN_AND_PASSWORD_REQUIRED":
        return t("auth.resetPassword.tokenAndPasswordRequired", "Token-ul și noua parolă sunt obligatorii.");
      case "PASSWORD_TOO_SHORT":
        return t("auth.resetPassword.newPasswordInvalid", "Parola trebuie să aibă cel puțin 8 caractere!");
      case "RESET_TOKEN_INVALID":
        return t("auth.resetPassword.tokenInvalid", "Linkul de resetare este invalid.");
      case "RESET_TOKEN_EXPIRED":
        return t("auth.resetPassword.tokenExpired", "Linkul de resetare a expirat.");
      case "SERVER_ERROR":
        return t("auth.common.serverError", "A apărut o eroare de server. Încearcă din nou.");
      default:
        return null;
    }
  }

  // Coduri care înseamnă "tokenul nu mai e valid" — pentru acestea arătăm
  // starea dedicată #invalidTokenState (formular ascuns), nu doar o alertă
  // inline, la fel ca fluxul existent pentru "fără token în URL" de mai jos.
  const INVALID_TOKEN_CODES = ["RESET_TOKEN_INVALID", "RESET_TOKEN_EXPIRED"];

  // Fără token în URL nu are rost să arătăm formularul deloc.
  if (!token) {
    showInvalidTokenState(
      t(
        "auth.resetPassword.invalidTokenMissing",
        "Linkul de resetare este invalid sau incomplet. Solicită unul nou.",
      ),
      "MISSING",
    );
    return;
  }

  setupPasswordToggle("toggleNewPassword", "newPassword");
  setupPasswordToggle("toggleConfirmNewPassword", "confirmNewPassword");

  newPasswordInput.addEventListener("input", () => {
    clearInputError(newPasswordInput);
    updateSubmitState();
  });

  confirmPasswordInput.addEventListener("input", () => {
    validatePasswordMatch();
    updateSubmitState();
  });

  function validatePasswordMatch() {
    if (!confirmPasswordInput.value) {
      clearInputError(confirmPasswordInput);
      return null;
    }
    const matches = newPasswordInput.value === confirmPasswordInput.value;
    if (matches) {
      clearInputError(confirmPasswordInput);
    } else {
      showInputError(confirmPasswordInput, t("auth.common.passwordMismatch", "Parolele nu coincid."));
    }
    return matches;
  }

  function updateSubmitState() {
    const matches = validatePasswordMatch();
    const allFilled = Boolean(
      newPasswordInput.value && confirmPasswordInput.value,
    );
    resetButton.disabled = !allFilled || matches !== true;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();

    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    let isValid = true;

    if (!newPassword || newPassword.length < 8) {
      showInputError(
        newPasswordInput,
        t("auth.resetPassword.newPasswordInvalid", "Parola trebuie să aibă cel puțin 8 caractere!"),
      );
      isValid = false;
    }

    if (validatePasswordMatch() !== true) {
      isValid = false;
    }

    if (!isValid || newPassword !== confirmPassword) return;

    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:3000/api/auth/reset-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, new_password: newPassword }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Bazat exclusiv pe `code` — NICIODATĂ pe căutare de text în mesajul
        // brut al backend-ului (fostă verificare a cuvântului "expirat").
        const message =
          mapResetPasswordErrorCode(data.code) ||
          t("auth.resetPassword.failureMessage", "Nu s-a putut reseta parola.");
        if (INVALID_TOKEN_CODES.includes(data.code)) {
          showInvalidTokenState(message, data.code);
        } else {
          showAlert(message, "danger");
        }
        return;
      }

      showAlert(
        t(
          "auth.resetPassword.successMessage",
          "Parola a fost resetată cu succes! Redirecționare către autentificare...",
        ),
        "success",
      );
      form.reset();
      resetButton.disabled = true;

      setTimeout(() => {
        window.location.href = "login.html?resetSuccess=1";
      }, 900);
    } catch (error) {
      console.error("Eroare la resetarea parolei:", error);
      showAlert(
        t(
          "auth.common.connectionErrorRetry",
          "Nu s-a putut realiza conexiunea la server. Încearcă din nou.",
        ),
        "danger",
      );
    } finally {
      setLoading(false);
      updateSubmitState();
    }
  });

  // --- Funcții Helper ---

  function setupPasswordToggle(buttonId, inputId) {
    const btn = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const isPassword = input.getAttribute("type") === "password";
      input.setAttribute("type", isPassword ? "text" : "password");

      const icon = btn.querySelector("i");
      if (icon) {
        icon.classList.toggle("fa-eye", !isPassword);
        icon.classList.toggle("fa-eye-slash", isPassword);
      }
    });
  }

  function showInputError(inputElement, message) {
    if (!inputElement) return;
    inputElement.classList.add("is-invalid");
    const feedbackEl =
      inputElement.parentNode.querySelector(".invalid-feedback");
    if (feedbackEl && message) {
      feedbackEl.textContent = message;
    }
  }

  function clearInputError(inputElement) {
    if (!inputElement) return;
    inputElement.classList.remove("is-invalid");
  }

  function showAlert(message, type) {
    if (!resetAlert) return;
    resetAlert.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        <i class="fas ${type === "danger" ? "fa-exclamation-circle" : "fa-check-circle"} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
  }

  function hideAlert() {
    if (resetAlert) resetAlert.innerHTML = "";
  }

  function setLoading(isLoading) {
    if (!resetButton) return;
    if (isLoading) {
      resetButton.disabled = true;
      resetButtonText.classList.add("d-none");
      resetSpinner.classList.remove("d-none");
    } else {
      resetButtonText.classList.remove("d-none");
      resetSpinner.classList.add("d-none");
    }
  }

  // Reține ultimul cod afișat ca să putem re-traduce mesajul dacă userul
  // schimbă limba DUPĂ ce starea de token invalid e deja afișată — elementul
  // #invalidTokenMessage are `data-i18n` static în markup (vezi
  // reset-password.html), pe care translateStaticPage() l-ar suprascrie
  // înapoi cu fallback-ul generic la fiecare schimbare de limbă dacă am lăsa
  // atributul pe loc, ignorând complet mesajul specific (invalid/expirat/
  // lipsă) setat dinamic aici.
  let lastInvalidTokenCode = null;

  function showInvalidTokenState(message, code) {
    lastInvalidTokenCode = code || null;
    if (invalidTokenMessage && message) {
      invalidTokenMessage.removeAttribute("data-i18n");
      invalidTokenMessage.textContent = message;
    }
    if (invalidTokenState) invalidTokenState.classList.remove("d-none");
    if (form) form.classList.add("d-none");
  }

  document.addEventListener("erp:locale-changed", () => {
    if (!lastInvalidTokenCode || !invalidTokenMessage) return;
    const message =
      lastInvalidTokenCode === "MISSING"
        ? t(
            "auth.resetPassword.invalidTokenMissing",
            "Linkul de resetare este invalid sau incomplet. Solicită unul nou.",
          )
        : mapResetPasswordErrorCode(lastInvalidTokenCode) ||
          t("auth.resetPassword.failureMessage", "Nu s-a putut reseta parola.");
    invalidTokenMessage.textContent = message;
  });
});
