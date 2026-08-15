document.addEventListener("DOMContentLoaded", () => {
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

  // Fără token în URL nu are rost să arătăm formularul deloc.
  if (!token) {
    showInvalidTokenState(
      "Linkul de resetare este invalid sau incomplet. Solicită unul nou.",
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
      showInputError(confirmPasswordInput, "Parolele nu coincid.");
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
        "Parola trebuie să aibă cel puțin 8 caractere!",
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
        const message = data.message || "Nu s-a putut reseta parola.";
        if (message.toLowerCase().includes("expirat")) {
          showInvalidTokenState(message);
        } else {
          showAlert(message, "danger");
        }
        return;
      }

      showAlert(
        "Parola a fost resetată cu succes! Redirecționare către autentificare...",
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
        "Nu s-a putut realiza conexiunea la server. Încearcă din nou.",
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

  function showInvalidTokenState(message) {
    if (invalidTokenMessage && message) {
      invalidTokenMessage.textContent = message;
    }
    if (invalidTokenState) invalidTokenState.classList.remove("d-none");
    if (form) form.classList.add("d-none");
  }
});
