const Toast = {
  show(message, type = "success") {
    const toastEl = document.getElementById("erpToast");
    const toastMsg = document.getElementById("toastMessage");

    if (toastEl && toastMsg) {
      let icon = "";
      switch (type) {
        case "success":
          icon = '<i class="fas fa-check-circle me-2 fs-5 align-middle"></i>';
          break;
        case "danger":
          icon = '<i class="fas fa-times-circle me-2 fs-5 align-middle"></i>';
          break;
        case "warning":
        case "orange":
          icon =
            '<i class="fas fa-exclamation-triangle me-2 fs-5 align-middle"></i>';
          break;
        case "info":
          icon = '<i class="fas fa-info-circle me-2 fs-5 align-middle"></i>';
          break;
        default:
          icon = "";
      }

      toastMsg.innerHTML = `${icon} <span class="align-middle">${message}</span>`;

      // Resetăm orice stil inline anterior (cum ar fi background-ul portocaliu forțat)
      toastEl.style.removeProperty("background-color");
      toastEl.style.removeProperty("color");

      if (type === "orange") {
        toastEl.className = "toast align-items-center text-white border-0";
        toastEl.style.setProperty("background-color", "#f97316", "important");
        toastEl.style.setProperty("color", "#ffffff", "important");
      } else {
        toastEl.className = `toast align-items-center text-white bg-${type} border-0`;
      }

      // Distrugem instanța anterioară dacă există, ca să nu se suprascrie temporizatorul
      const existingToast = bootstrap.Toast.getInstance(toastEl);
      if (existingToast) {
        existingToast.dispose();
      }

      // Configurăm autohide activ și delay la 4 secunde (4000ms)
      const toast = new bootstrap.Toast(toastEl, {
        autohide: true,
        delay: 1000,
      });

      toast.show();
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  },
};
