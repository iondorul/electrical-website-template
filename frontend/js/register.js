document.addEventListener("DOMContentLoaded", async () => {
  // Pagină publică, fără sidebar/topbar ERP (shell.js) — switcher-ul e deja
  // în markup-ul static al paginii, deci inițializăm direct, fără să așteptăm
  // evenimentul erp:shell-ready (care nu se emite niciodată aici).
  await initLangSwitcher();

  const registerForm = document.getElementById("registerForm");
  const fullNameInput = document.getElementById("fullName");
  const companyNameInput = document.getElementById("companyName");
  const emailInput = document.getElementById("regEmail");
  const passwordInput = document.getElementById("regPassword");
  const confirmPasswordInput = document.getElementById("regConfirmPassword");
  const registerButton = document.getElementById("registerButton");
  const registerButtonText = document.getElementById("registerButtonText");
  const registerSpinner = document.getElementById("registerSpinner");
  const registerAlert = document.getElementById("registerAlert");

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Mapare cod → cheie de traducere pentru răspunsurile /auth/register
  // (backend trimite `code`, NICIODATĂ text hardcodat de afișat direct —
  // vezi authController.js/AuthCodes). Codurile de validare de mai jos ajung
  // pe ecran doar dacă validarea client-side de mai sus e ocolită (ex. apel
  // API direct) — validate din nou și pe server, din motive de siguranță.
  function mapRegisterErrorCode(code) {
    switch (code) {
      case "FULL_NAME_REQUIRED":
        return t("auth.register.fullNameRequired", "Numele complet este obligatoriu!");
      case "COMPANY_NAME_REQUIRED":
        return t("auth.register.companyNameRequired", "Numele firmei/PFA este obligatoriu!");
      case "INVALID_EMAIL":
        return t("auth.common.emailInvalid", "Introduceți o adresă de email validă!");
      case "PASSWORD_TOO_SHORT":
        return t("auth.register.passwordInvalid", "Parola trebuie să aibă cel puțin 8 caractere!");
      case "EMAIL_ALREADY_EXISTS":
        return t("auth.register.emailAlreadyExists", "Există deja un cont cu acest email.");
      case "SERVER_ERROR":
        return t("auth.common.serverError", "A apărut o eroare de server. Încearcă din nou.");
      default:
        return null;
    }
  }

  // 1. Arată / Ascunde Parola (Toggle Eye) pe ambele câmpuri de parolă
  setupPasswordToggle("toggleRegPassword", "regPassword");
  setupPasswordToggle("toggleRegConfirmPassword", "regConfirmPassword");

  // 2. Curățare erori la tastare
  [fullNameInput, companyNameInput, emailInput].forEach((input) => {
    if (input) input.addEventListener("input", () => clearInputError(input));
  });

  if (passwordInput) {
    passwordInput.addEventListener("input", () => {
      clearInputError(passwordInput);
      if (confirmPasswordInput.value) validatePasswordMatch();
    });
  }

  if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener("input", validatePasswordMatch);
  }

  // 3. Validare live: parolă nouă vs. confirmare
  function validatePasswordMatch() {
    if (!confirmPasswordInput.value) {
      clearInputError(confirmPasswordInput);
      return true;
    }

    const matches = passwordInput.value === confirmPasswordInput.value;
    if (matches) {
      clearInputError(confirmPasswordInput);
    } else {
      showInputError(confirmPasswordInput, t("auth.common.passwordMismatch", "Parolele nu coincid."));
    }
    return matches;
  }

  // 4. Form Submit cu Validări
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAlert();

      const fullName = fullNameInput.value.trim();
      const companyName = companyNameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      let isValid = true;

      if (!fullName) {
        showInputError(fullNameInput, t("auth.register.fullNameRequired", "Numele complet este obligatoriu!"));
        isValid = false;
      }

      if (!companyName) {
        showInputError(
          companyNameInput,
          t("auth.register.companyNameRequired", "Numele firmei/PFA este obligatoriu!"),
        );
        isValid = false;
      }

      if (!email || !emailRegex.test(email)) {
        showInputError(emailInput, t("auth.common.emailInvalid", "Introduceți o adresă de email validă!"));
        isValid = false;
      }

      if (!password || password.length < 8) {
        showInputError(
          passwordInput,
          t("auth.register.passwordInvalid", "Parola trebuie să aibă cel puțin 8 caractere!"),
        );
        isValid = false;
      }

      if (!validatePasswordMatch()) {
        isValid = false;
      }

      if (!isValid) return;

      setLoading(true);

      try {
        const response = await fetch("http://localhost:3000/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            full_name: fullName,
            company_name: companyName,
            email,
            password,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            mapRegisterErrorCode(data.code) ||
              t("auth.register.failureMessage", "Nu s-a putut crea contul."),
          );
        }

        showAlert(
          t(
            "auth.register.successMessage",
            "Cont creat cu succes! Redirecționare către autentificare...",
          ),
          "success",
        );

        setTimeout(() => {
          window.location.href = "login.html";
        }, 900);
      } catch (error) {
        console.error("Eroare înregistrare:", error);
        showAlert(
          error.message || t("auth.common.connectionError", "Nu s-a putut realiza conexiunea la server."),
          "danger",
        );
      } finally {
        setLoading(false);
      }
    });
  }

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
    if (!registerAlert) return;
    registerAlert.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        <i class="fas ${type === "danger" ? "fa-exclamation-circle" : "fa-check-circle"} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
  }

  function hideAlert() {
    if (registerAlert) registerAlert.innerHTML = "";
  }

  function setLoading(isLoading) {
    if (!registerButton) return;
    if (isLoading) {
      registerButton.disabled = true;
      registerButtonText.classList.add("d-none");
      registerSpinner.classList.remove("d-none");
    } else {
      registerButton.disabled = false;
      registerButtonText.classList.remove("d-none");
      registerSpinner.classList.add("d-none");
    }
  }
});
