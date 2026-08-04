/**
 * ElectricalVPF ERP - Global Utility Functions
 */
const Utils = {
  escapeHtml(str) {
    return (str || "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[m],
    );
  },

  formatCurrency(amount, currency = "EUR", locale = "ro-RO") {
    const numericAmount = Number(amount) || 0;
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  },

  formatDate(dateString, locale = "ro-RO") {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  },

  formatPhone(phone) {
    return phone ? phone.trim() : "-";
  },

  isEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  debounce(func, delay = 300) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  },

  capitalize(str) {
    if (!str) return "";
    return str
      .toString()
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  },

  generateId() {
    return crypto.randomUUID();
  },

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  confirm(message) {
    return window.confirm(message);
  },
};
