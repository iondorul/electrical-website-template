document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forgotPasswordForm");
  const emailInput = document.getElementById("fpEmail");
  const fpButton = document.getElementById("fpButton");
  const fpButtonText = document.getElementById("fpButtonText");
  const fpSpinner = document.getElementById("fpSpinner");
  const fpAlert = document.getElementById("forgotPasswordAlert");

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (emailInput) {
    emailInput.addEventListener("input", () => clearInputError(emailInput));
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAlert();

      const email = emailInput.value.trim();

      if (!email || !emailRegex.test(email)) {
        showInputError(emailInput, "Introduceți o adresă de email validă!");
        return;
      }

      setLoading(true);

      try {
        const response = await fetch(
          "http://localhost:3000/api/auth/forgot-password",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          },
        );

        const data = await response.json().catch(() => ({}));

        // Mesajul generic e afișat indiferent de status, din motive de
        // securitate (nu dezvăluim dacă emailul există sau nu în sistem).
        showAlert(
          data.message ||
            "Dacă adresa există în sistem, vei primi un email cu instrucțiuni de resetare.",
          "success",
        );
        form.reset();
      } catch (error) {
        console.error("Eroare la solicitarea resetării:", error);
        showAlert(
          "Nu s-a putut realiza conexiunea la server. Încearcă din nou.",
          "danger",
        );
      } finally {
        setLoading(false);
      }
    });
  }

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
    if (!fpAlert) return;
    fpAlert.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        <i class="fas ${type === "danger" ? "fa-exclamation-circle" : "fa-check-circle"} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
  }

  function hideAlert() {
    if (fpAlert) fpAlert.innerHTML = "";
  }

  function setLoading(isLoading) {
    if (!fpButton) return;
    if (isLoading) {
      fpButton.disabled = true;
      fpButtonText.classList.add("d-none");
      fpSpinner.classList.remove("d-none");
    } else {
      fpButton.disabled = false;
      fpButtonText.classList.remove("d-none");
      fpSpinner.classList.add("d-none");
    }
  }
});
