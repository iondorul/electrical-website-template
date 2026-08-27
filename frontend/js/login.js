document.addEventListener("DOMContentLoaded", async () => {
  // Pagină publică, fără sidebar/topbar ERP (shell.js) — switcher-ul e deja
  // în markup-ul static al paginii, deci inițializăm direct, fără să așteptăm
  // evenimentul erp:shell-ready (care nu se emite niciodată aici). Așteptăm
  // finalul (traducerile încărcate + markup-ul static tradus) înainte de
  // orice t() apelat mai jos în afara markup-ului static (ex. alerta de
  // resetare reușită) — altfel ar afișa scurt fallback-ul românesc.
  await initLangSwitcher();

  const loginForm = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginButton = document.getElementById("loginButton");
  const loginButtonText = document.getElementById("loginButtonText");
  const loginSpinner = document.getElementById("loginSpinner");
  const loginAlert = document.getElementById("loginAlert");
  const togglePasswordBtn = document.getElementById("togglePassword");

  // Regex pentru validare format email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Mapare cod → cheie de traducere pentru răspunsurile /auth/login (backend
  // trimite `code`, NICIODATĂ text hardcodat de afișat direct — vezi
  // authController.js/AuthCodes). `null` pentru un cod necunoscut/lipsă,
  // caz în care apelantul cade pe fallback-ul generic auth.common.serverError.
  function mapLoginErrorCode(code) {
    switch (code) {
      case "INVALID_CREDENTIALS":
        return t("auth.login.invalidCredentials", "Email sau parolă incorectă!");
      case "SERVER_ERROR":
        return t("auth.common.serverError", "A apărut o eroare de server. Încearcă din nou.");
      default:
        return null;
    }
  }

  // 0. Mesaj de succes după resetarea parolei (redirect din reset-password.html)
  if (new URLSearchParams(window.location.search).get("resetSuccess") === "1") {
    showAlert(
      t(
        "auth.login.resetSuccessMessage",
        "Parola a fost resetată cu succes! Te poți autentifica cu noua parolă.",
      ),
      "success",
    );
  }

  // 1. Arată / Ascunde Parola (Toggle Eye)
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const isPassword = passwordInput.getAttribute("type") === "password";
      passwordInput.setAttribute("type", isPassword ? "text" : "password");

      const icon = togglePasswordBtn.querySelector("i");
      if (icon) {
        icon.classList.toggle("fa-eye", !isPassword);
        icon.classList.toggle("fa-eye-slash", isPassword);
      }
    });
  }

  // 2. Curățare erori la tastare
  if (emailInput) {
    emailInput.addEventListener("input", () => clearInputError(emailInput));
  }
  if (passwordInput) {
    passwordInput.addEventListener("input", () =>
      clearInputError(passwordInput),
    );
  }

  // 3. Form Submit cu Validări
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault(); // Previne reload-ul paginii

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      // Reset alerte anterioare
      hideAlert();

      // Validări client-side
      let isValid = true;

      if (!email || !emailRegex.test(email)) {
        showInputError(
          emailInput,
          t("auth.common.emailInvalid", "Introduceți o adresă de email validă!"),
        );
        isValid = false;
      }

      if (!password || password.length < 6) {
        showInputError(
          passwordInput,
          t(
            "auth.login.passwordInvalid",
            "Parola trebuie să aibă cel puțin 6 caractere!",
          ),
        );
        isValid = false;
      }

      // Dacă validarea locală e eșuată, oprim trimiterea cererii
      if (!isValid) return;

      // Pornim starea de Loading pe buton
      setLoading(true);

      try {
        const response = await fetch("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        // Verificăm dacă răspunsul serverului este cu succes (status HTTP 200-299)
        // — bazat pe `code`, NICIODATĂ pe `data.message` (text hardcodat server-side).
        if (!response.ok) {
          throw new Error(
            mapLoginErrorCode(data.code) ||
              t("auth.common.serverError", "A apărut o eroare de server. Încearcă din nou."),
          );
        }

        if (data.token) {
          // Salvare token și redirecționare
          localStorage.setItem("token", data.token);
          showAlert(t("auth.login.successMessage", "Autentificare reușită! Redirecționare..."), "success");

          setTimeout(() => {
            // REDIRECȚIONARE CĂTRE DASHBOARD (ERP SHELL)
            window.location.href = "dashboard.html";
          }, 600);
        } else {
          throw new Error(
            t("auth.login.missingToken", "Răspuns invalid de la server (Lipsește Token-ul)."),
          );
        }
      } catch (error) {
        console.error("Eroare autentificare:", error);
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

  function showInputError(inputElement, message) {
    if (!inputElement) return;
    inputElement.classList.add("is-invalid");
    const feedbackEl =
      inputElement.parentNode.querySelector(".invalid-feedback");
    if (feedbackEl) {
      feedbackEl.textContent = message;
    }
  }

  function clearInputError(inputElement) {
    if (!inputElement) return;
    inputElement.classList.remove("is-invalid");
  }

  function showAlert(message, type) {
    if (!loginAlert) return;
    loginAlert.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        <i class="fas ${type === "danger" ? "fa-exclamation-circle" : "fa-check-circle"} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
  }

  function hideAlert() {
    if (loginAlert) loginAlert.innerHTML = "";
  }

  function setLoading(isLoading) {
    if (!loginButton) return;
    if (isLoading) {
      loginButton.disabled = true;
      loginButtonText.classList.add("d-none");
      loginSpinner.classList.remove("d-none");
    } else {
      loginButton.disabled = false;
      loginButtonText.classList.remove("d-none");
      loginSpinner.classList.add("d-none");
    }
  }
});
