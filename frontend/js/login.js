document.addEventListener("DOMContentLoaded", () => {
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
  emailInput.addEventListener("input", () => clearInputError(emailInput));
  passwordInput.addEventListener("input", () => clearInputError(passwordInput));

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
        showInputError(emailInput, "Introduceți o adresă de email validă!");
        isValid = false;
      }

      if (!password || password.length < 6) {
        showInputError(
          passwordInput,
          "Parola trebuie să aibă cel puțin 6 caractere!",
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
        if (!response.ok) {
          throw new Error(data.message || "Email sau parolă incorectă!");
        }

        if (data.token) {
          // Salvare token și redirecționare
          localStorage.setItem("token", data.token);
          showAlert("Autentificare reușită! Redirecționare...", "success");

          setTimeout(() => {
            window.location.href = "clients.html";
          }, 600);
        } else {
          throw new Error("Răspuns invalid de la server (Lipsește Token-ul).");
        }
      } catch (error) {
        console.error("Eroare autentificare:", error);
        showAlert(
          error.message || "Nu s-a putut realiza conexiunea la server.",
          "danger",
        );
      } finally {
        setLoading(false);
      }
    });
  }

  // --- Funcții Helper ---

  function showInputError(inputElement, message) {
    inputElement.classList.add("is-invalid");
    const feedbackEl =
      inputElement.parentNode.querySelector(".invalid-feedback");
    if (feedbackEl) {
      feedbackEl.textContent = message;
    }
  }

  function clearInputError(inputElement) {
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
