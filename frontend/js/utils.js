/**
 * ElectricalVPF ERP - Global Utility Functions
 */
const Utils = {
  /**
   * Previne atacurile de tip Cross-Site Scripting (XSS)
   */
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

  /**
   * Formatează un număr în format monetar (ex: 24560 -> €24,560 sau 24.560 RON)
   */
  formatCurrency(amount, currency = "EUR", locale = "ro-RO") {
    const numericAmount = Number(amount) || 0;
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  },

  /**
   * Formatează o dată ISO sau Timestamp în format citibil (ex: 2026-08-04 -> 04.08.2026)
   */
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

  /**
   * Limitează frecvența de apelare a unei funcții (util la căutare în timp real)
   */
  debounce(func, delay = 300) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  },

  /**
   * Transformă prima literă din fiecare cuvânt în majusculă (ex: popescu ion -> Popescu Ion)
   */
  capitalize(str) {
    if (!str) return "";
    return str
      .toString()
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  },
};
