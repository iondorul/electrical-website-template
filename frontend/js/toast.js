const Toast = {
  show(message, type = "success") {
    const toastEl = document.getElementById("erpToast");
    const toastMsg = document.getElementById("toastMessage");

    if (toastEl && toastMsg) {
      toastMsg.textContent = message;
      toastEl.className = `toast align-items-center text-white bg-${type} border-0`;
      const toast = new bootstrap.Toast(toastEl);
      toast.show();
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  },
};
